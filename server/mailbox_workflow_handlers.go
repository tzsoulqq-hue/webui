package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"webui/server/pb"
)

const (
	defaultOutlookOAuthClientID     = "9e5f94bc-e8a4-4e73-b8be-63364c29d753"
	defaultOutlookOAuthRedirectURL  = "https://login.microsoftonline.com/common/oauth2/nativeclient"
	defaultOutlookOAuthScopes       = "offline_access https://graph.microsoft.com/Mail.Read"
	defaultOutlookOAuthAuthorizeURL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
)

func (s *server) handleMailboxRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var req mailboxRegisterRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if req.MaxCount < 0 {
		req.MaxCount = 0
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	resp, err := s.mailboxClient.RegisterMailbox(ctx, &pb.RegisterMailboxRequest{MaxCount: req.MaxCount})
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}

	writeMailboxOperationStart(w, resp)
}

func outlookLocalOAuthAuthorizeURL(email string) string {
	values := url.Values{}
	values.Set("client_id", defaultOutlookOAuthClientID)
	values.Set("response_type", "code")
	values.Set("redirect_uri", defaultOutlookOAuthRedirectURL)
	values.Set("response_mode", "query")
	values.Set("scope", defaultOutlookOAuthScopes)
	values.Set("login_hint", strings.ToLower(strings.TrimSpace(email)))
	values.Set("state", "local-"+shortHash(time.Now().String()))
	return defaultOutlookOAuthAuthorizeURL + "?" + values.Encode()
}

func shortHash(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])[:12]
}

func psQuote(value string) string {
	return strings.ReplaceAll(value, "'", "''")
}

func (s *server) handleMailboxOAuth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	var req mailboxOAuthRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if req.Limit <= 0 {
		req.Limit = 100
	}
	if strings.TrimSpace(req.EmailAddress) == "" {
		req.OnlyMissing = true
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	resp, err := s.mailboxClient.RunMailboxOAuth(ctx, &pb.StartMailboxOAuthRequest{
		EmailAddress: strings.TrimSpace(req.EmailAddress),
		OnlyMissing:  req.OnlyMissing,
		Limit:        req.Limit,
	})
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	writeMailboxOperationStart(w, resp)
}

func (s *server) handleMailboxLocalOAuth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var req mailboxLocalOAuthRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.EmailAddress))
	if email == "" {
		writeError(w, http.StatusBadRequest, errors.New("email_address is required"))
		return
	}
	authorizeURL := outlookLocalOAuthAuthorizeURL(email)
	profileName := "mailbox-recovery-" + shortHash(email)
	pythonPath := `D:\DevProjects\Gopay_plus_automatic\.venv312\Scripts\python.exe`
	scriptPath := `D:\DevProjects\mailbox\tools\local_oauth_camoufox.py`
	proxyURL := "socks5://127.0.0.1:10811"
	completeURL := "http://127.0.0.1:8080/api/mailboxes/oauth-local/complete"
	command := fmt.Sprintf("$profileDir = Join-Path $env:TEMP '%s'; Start-Process '%s' -ArgumentList @('%s', '--email', '%s', '--proxy', '%s', '--profile-dir', $profileDir, '--authorize-url', '%s', '--client-id', '%s', '--redirect-uri', '%s', '--scope', '%s', '--complete-url', '%s', '--hold-seconds', '300')",
		profileName, pythonPath, scriptPath, email, proxyURL, psQuote(authorizeURL), defaultOutlookOAuthClientID, defaultOutlookOAuthRedirectURL, defaultOutlookOAuthScopes, completeURL)
	writeJSON(w, http.StatusAccepted, map[string]any{
		"started":         true,
		"email_address":   email,
		"launch_command":  command,
		"profile_name":    profileName,
		"local_proxy_url": proxyURL,
	})
}

func (s *server) handleMailboxLocalOAuthComplete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var req mailboxLocalOAuthCompleteRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.EmailAddress))
	if email == "" || strings.TrimSpace(req.RefreshToken) == "" {
		writeError(w, http.StatusBadRequest, errors.New("email_address and refresh_token are required"))
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	list, err := s.mailboxClient.ListMailboxes(ctx, &pb.ListEmailMailboxesRequest{Provider: "outlook", Limit: 500})
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	var existing *pb.EmailMailbox
	for _, mailbox := range list.GetMailboxes() {
		if strings.EqualFold(strings.TrimSpace(mailbox.GetEmailAddress()), email) {
			existing = mailbox
			break
		}
	}
	if existing == nil {
		writeError(w, http.StatusNotFound, errors.New("mailbox not found"))
		return
	}
	resp, err := s.mailboxClient.UpsertMailbox(ctx, &pb.UpsertEmailMailboxRequest{Mailbox: &pb.EmailMailbox{
		EmailAddress:           email,
		Password:               existing.GetPassword(),
		RefreshToken:           strings.TrimSpace(req.RefreshToken),
		AccessToken:            strings.TrimSpace(req.AccessToken),
		Provider:               "outlook",
		AuthStatus:             "AUTHORIZED",
		LastError:              "",
		HomeCountry:            strings.ToUpper(strings.TrimSpace(existing.GetHomeCountry())),
		HomeIp:                 strings.TrimSpace(existing.GetHomeIp()),
		ProxyProfile:           strings.TrimSpace(existing.GetProxyProfile()),
		ManualRecoveryRequired: false,
	}})
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusOK, resp.GetMailbox())
}

func (s *server) handleMailboxManualRecovery(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	var req mailboxManualRecoveryRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	email := strings.TrimSpace(req.EmailAddress)
	if email == "" {
		writeError(w, http.StatusBadRequest, errors.New("email_address is required"))
		return
	}

	timeout := envInt("MAILBOX_MANUAL_RECOVERY_TIMEOUT_SECONDS", 180)
	if timeout < 30 {
		timeout = 30
	}
	ctx, cancel := context.WithTimeout(r.Context(), time.Duration(timeout)*time.Second)
	defer cancel()
	resp, err := s.mailboxClient.StartMailboxManualRecovery(ctx, &pb.StartMailboxManualRecoveryRequest{EmailAddress: email})
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	statusCode := http.StatusAccepted
	if !resp.GetStarted() || resp.GetErrorMessage() != "" {
		statusCode = http.StatusBadGateway
	}
	writeJSON(w, statusCode, map[string]any{
		"started":         resp.GetStarted(),
		"email_address":   resp.GetEmailAddress(),
		"session_id":      resp.GetSessionId(),
		"proxy_country":   resp.GetProxyCountry(),
		"proxy_session":   resp.GetProxySession(),
		"local_proxy_url": resp.GetLocalProxyUrl(),
		"recovery_url":    resp.GetRecoveryUrl(),
		"launch_command":  resp.GetLaunchCommand(),
		"instruction":     resp.GetInstruction(),
		"error_message":   resp.GetErrorMessage(),
		"backend":         "mailbox",
	})
}

func (s *server) handleMailboxInbox(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	var req mailboxInboxRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if req.LimitPerMailbox <= 0 {
		req.LimitPerMailbox = 10
	}
	if req.LimitPerMailbox > 100 {
		req.LimitPerMailbox = 100
	}
	if req.MaxMailboxes <= 0 {
		req.MaxMailboxes = 100
	}
	if req.MaxMailboxes > 500 {
		req.MaxMailboxes = 500
	}

	timeout := envInt("MAILBOX_INBOX_TIMEOUT_SECONDS", 180)
	if timeout < 30 {
		timeout = 30
	}
	ctx, cancel := context.WithTimeout(r.Context(), time.Duration(timeout)*time.Second)
	defer cancel()

	resp, err := s.mailboxClient.FetchMailboxInboxes(ctx, &pb.FetchMailboxInboxesRequest{
		LimitPerMailbox: req.LimitPerMailbox,
		MaxMailboxes:    req.MaxMailboxes,
		EmailAddress:    strings.TrimSpace(req.EmailAddress),
		ParserProfile:   strings.TrimSpace(req.ParserProfile),
	})
	if err != nil {
		if status.Code(err) == codes.DeadlineExceeded {
			writeError(w, http.StatusGatewayTimeout, err)
			return
		}
		writeError(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *server) streamMailboxEvents(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	email := strings.TrimSpace(r.URL.Query().Get("email_address"))
	if email == "" {
		email = strings.TrimSpace(r.URL.Query().Get("email"))
	}
	if email == "" {
		writeError(w, http.StatusBadRequest, errors.New("email_address is required"))
		return
	}

	stream, err := s.mailboxClient.StreamMailboxEmailEvents(r.Context(), &pb.StreamMailboxEmailEventsRequest{
		EmailAddress:   email,
		SubjectKeyword: strings.TrimSpace(r.URL.Query().Get("subject_keyword")),
		ParserProfile:  strings.TrimSpace(r.URL.Query().Get("parser_profile")),
		SignalKind:     requestEmailSignalKind(r),
	})
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}

	sse, err := newSSEWriter(w)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	sse.Start()

	for {
		resp, err := stream.Recv()
		if err != nil {
			if errors.Is(r.Context().Err(), context.Canceled) || status.Code(err) == codes.Canceled {
				return
			}
			sse.Error(err)
			return
		}
		message := resp.GetMessage()
		if message != nil {
			eventID := message.GetReceivedAtUnix()
			if eventID <= 0 {
				eventID = time.Now().Unix()
			}
			eventEmail := strings.TrimSpace(resp.GetEmailAddress())
			if eventEmail == "" {
				eventEmail = email
			}
			sse.Event(eventID, "email", map[string]any{
				"email_address": eventEmail,
				"message":       message,
			})
		}
	}
}

type mailboxOperationStartResponse interface {
	GetStarted() bool
	GetOperationId() string
	GetErrorMessage() string
}

func writeMailboxOperationStart(w http.ResponseWriter, resp mailboxOperationStartResponse) {
	statusCode := http.StatusAccepted
	if !resp.GetStarted() || resp.GetErrorMessage() != "" {
		statusCode = http.StatusBadGateway
	}
	writeJSON(w, statusCode, map[string]any{
		"started":       resp.GetStarted(),
		"operation_id":  resp.GetOperationId(),
		"error_message": resp.GetErrorMessage(),
		"backend":       "mailbox",
	})
}
