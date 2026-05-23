package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"

	"webui/server/pb"
)

type server struct {
	accountClient         pb.AccountDatabaseServiceClient
	accountWorkflowClient pb.AccountWorkflowServiceClient
	paymentWorkflowClient pb.PaymentWorkflowServiceClient
	gopayAppClient        pb.GoPayAppWorkflowServiceClient
	mailboxClient         pb.MailboxServiceClient
	smsAdminClient        pb.SmsProviderAdminServiceClient
	otpClient             pb.OTPServiceClient
	jobClient             pb.JobServiceClient
	paymentClient         pb.PaymentServiceClient
	dashboardServices     *dashboardServiceRegistry
	proxyRuntimeProxy     http.Handler
	staticDir             string
}

type createAccountRequest struct {
	Email         string `json:"email"`
	Password      string `json:"password"`
	EmailStrategy string `json:"email_strategy"`
}

type upsertMailboxRequest struct {
	MailboxID    string `json:"mailbox_id"`
	Email        string `json:"email"`
	Password     string `json:"password"`
	RefreshToken string `json:"refresh_token"`
	AccessToken  string `json:"access_token"`
	Provider     string `json:"provider"`
	Status       string `json:"status"`
	AuthStatus   string `json:"auth_status"`
	LastError    string `json:"last_error"`
}

type mailboxOAuthRequest struct {
	EmailAddress string `json:"email_address"`
	OnlyMissing  bool   `json:"only_missing"`
	Limit        int32  `json:"limit"`
}

type mailboxInboxRequest struct {
	LimitPerMailbox int32  `json:"limit_per_mailbox"`
	MaxMailboxes    int32  `json:"max_mailboxes"`
	EmailAddress    string `json:"email_address"`
	ParserProfile   string `json:"parser_profile"`
}

type accountMailboxSyncRequest struct {
	LimitPerMailbox int32 `json:"limit_per_mailbox"`
	AccountLimit    int32 `json:"account_limit"`
}

type submitJobOTPRequest struct {
	OTP string `json:"otp"`
}

type updateAccountRequest struct {
	SessionToken      string  `json:"session_token"`
	AccessToken       string  `json:"access_token"`
	ActivationChannel *string `json:"activation_channel"`
}

const (
	nextAuthSessionCookieName         = "__Secure-next-auth.session-token"
	nextAuthSessionCookieFallbackName = "next-auth.session-token"
	nextAuthSessionCookieChunkSize    = 4096 - 163
)

func main() {
	accountConn, err := newGRPCClient(envDefault("GPT_ACCOUNT_ADDR", "gpt-service:50052"))
	if err != nil {
		log.Fatalf("connect gpt account API: %v", err)
	}
	defer accountConn.Close()

	workflowConn, err := newGRPCClient(envDefault("GPT_WORKFLOW_ADDR", "gpt-service:50051"))
	if err != nil {
		log.Fatalf("connect gpt workflow API: %v", err)
	}
	defer workflowConn.Close()

	paymentConn, err := newGRPCClient(envDefault("GPT_PAYMENT_ADDR", "gpt-service:50054"))
	if err != nil {
		log.Fatalf("connect gpt payment API: %v", err)
	}
	defer paymentConn.Close()

	mailboxConn, err := newGRPCClient(envDefault("MAILBOX_ADDR", "mailbox:50051"))
	if err != nil {
		log.Fatalf("connect mailbox: %v", err)
	}
	defer mailboxConn.Close()

	smsConn, err := newGRPCClient(envDefault("SMS_ADDR", "sms-service:50051"))
	if err != nil {
		log.Fatalf("connect sms: %v", err)
	}
	defer smsConn.Close()

	s := &server{
		accountClient:         pb.NewAccountDatabaseServiceClient(accountConn),
		accountWorkflowClient: pb.NewAccountWorkflowServiceClient(workflowConn),
		paymentWorkflowClient: pb.NewPaymentWorkflowServiceClient(workflowConn),
		gopayAppClient:        pb.NewGoPayAppWorkflowServiceClient(workflowConn),
		mailboxClient:         pb.NewMailboxServiceClient(mailboxConn),
		smsAdminClient:        pb.NewSmsProviderAdminServiceClient(smsConn),
		otpClient:             pb.NewOTPServiceClient(workflowConn),
		jobClient:             pb.NewJobServiceClient(workflowConn),
		paymentClient:         pb.NewPaymentServiceClient(paymentConn),
		dashboardServices:     newDashboardServiceRegistry(loadDashboardServiceStatusConfig()),
		proxyRuntimeProxy:     newHTTPReverseProxy(envDefault("PROXY_RUNTIME_HTTP_ADDR", "http://proxy-runtime:8080")),
		staticDir:             envDefault("STATIC_DIR", "web/dist"),
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/health", s.handleHealth)
	mux.HandleFunc("/api/service-status", s.handleServiceStatus)
	mux.HandleFunc("/api/accounts/events", s.streamAccountEvents)
	mux.HandleFunc("/api/accounts/mailbox/sync", s.handleAccountMailboxSync)
	mux.HandleFunc("/api/accounts", s.handleAccounts)
	mux.HandleFunc("/api/accounts/", s.handleAccount)
	mux.HandleFunc("/api/mailboxes/register", s.handleMailboxRegister)
	mux.HandleFunc("/api/mailboxes/oauth", s.handleMailboxOAuth)
	mux.HandleFunc("/api/mailboxes/inbox", s.handleMailboxInbox)
	mux.HandleFunc("/api/mailboxes/events", s.streamMailboxEvents)
	mux.HandleFunc("/api/mailbox-domains", s.handleMailboxDomains)
	mux.HandleFunc("/api/mailbox-provider-capabilities", s.handleMailboxProviderCapabilities)
	mux.HandleFunc("/api/mailbox-operations/", s.handleMailboxOperation)
	mux.HandleFunc("/api/mailbox-operations", s.handleMailboxOperations)
	mux.HandleFunc("/api/mailboxes/", s.handleMailbox)
	mux.HandleFunc("/api/mailboxes", s.handleMailboxes)
	mux.HandleFunc("/api/sms/provider-configs/", s.handleSMSProviderConfig)
	mux.HandleFunc("/api/sms/provider-configs", s.handleSMSProviderConfigs)
	mux.HandleFunc("/api/sms/route-options", s.handleSMSRouteOptions)
	mux.HandleFunc("/api/sms/route-profiles/", s.handleSMSRouteProfile)
	mux.HandleFunc("/api/sms/route-profiles", s.handleSMSRouteProfiles)
	mux.HandleFunc("/api/sms/activations/", s.handleSMSActivation)
	mux.HandleFunc("/api/sms/activations", s.handleSMSActivations)
	mux.HandleFunc("/api/gpt-email-allocations", s.handleGPTEmailAllocations)
	mux.HandleFunc("/api/jobs", s.handleJobs)
	mux.HandleFunc("/api/jobs/events", s.streamJobsEvents)
	mux.HandleFunc("/api/jobs/", s.handleJob)
	mux.HandleFunc("/api/proxy-runtime/", s.handleProxyRuntime)
	mux.HandleFunc("/api/gopay/state", s.handleGoPayState)
	mux.HandleFunc("/api/gopay/profile", s.handleGoPayProfile)
	mux.HandleFunc("/api/gopay/user/", s.handleGoPayUserAction)
	mux.HandleFunc("/api/workflows/register", s.handleRegister)
	mux.HandleFunc("/api/workflows/activate", s.handleActivate)
	mux.HandleFunc("/api/workflows/autopay", s.handleAutopay)
	mux.HandleFunc("/api/workflows/login", s.handleLogin)
	mux.HandleFunc("/api/workflows/probe", s.handleProbeAccount)
	mux.HandleFunc("/api/workflows/gopay-app", s.handleGoPayApp)
	mux.HandleFunc("/api/workflows/gopay-qris-payment-activate", s.handleGoPayQRISPaymentActivate)
	mux.HandleFunc("/api/workflows/gopay-wa-payment", s.handleGoPayWAPayment)
	mux.HandleFunc("/api/workflows/gopay-payment/rebind", s.handleGoPayPaymentRebind)
	mux.HandleFunc("/api/workflows/gopay-payment", s.handleGoPayPayment)
	mux.HandleFunc("/api/workflows/register-and-activate", s.handleRegisterAndActivate)
	mux.HandleFunc("/", s.handleStatic)

	addr := envDefault("LISTEN_ADDR", ":8080")
	log.Printf("dashboard listening on %s", addr)
	if err := http.ListenAndServe(addr, withCORS(mux)); err != nil {
		log.Fatal(err)
	}
}

func (s *server) handleMailboxDomains(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		resp, err := s.mailboxClient.ListMailboxDomains(r.Context(), &pb.ListMailboxDomainsRequest{})
		if err != nil {
			writeError(w, http.StatusBadGateway, err)
			return
		}
		if resp.GetErrorMessage() != "" {
			writeError(w, http.StatusBadGateway, errors.New(resp.GetErrorMessage()))
			return
		}
		writeJSON(w, http.StatusOK, resp.GetDomains())
	case http.MethodPost:
		var req pb.SyncMailboxDomainsRequest
		if err := readProtoJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		resp, err := s.mailboxClient.SyncMailboxDomains(r.Context(), &req)
		if err != nil {
			writeError(w, http.StatusBadGateway, err)
			return
		}
		if resp.GetErrorMessage() != "" {
			writeError(w, http.StatusBadGateway, errors.New(resp.GetErrorMessage()))
			return
		}
		writeProtoJSON(w, http.StatusOK, resp)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (s *server) handleMailboxProviderCapabilities(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	resp, err := s.mailboxClient.ListMailboxProviderCapabilities(r.Context(), &pb.ListMailboxProviderCapabilitiesRequest{})
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	if resp.GetErrorMessage() != "" {
		writeError(w, http.StatusBadGateway, errors.New(resp.GetErrorMessage()))
		return
	}
	writeJSON(w, http.StatusOK, resp.GetProviders())
}

func (s *server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *server) handleProxyRuntime(w http.ResponseWriter, r *http.Request) {
	s.proxyRuntimeProxy.ServeHTTP(w, r)
}

func newHTTPReverseProxy(target string) http.Handler {
	parsed, err := url.Parse(target)
	if err != nil {
		log.Fatalf("parse reverse proxy target %q: %v", target, err)
	}
	proxy := httputil.NewSingleHostReverseProxy(parsed)
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		writeError(w, http.StatusBadGateway, err)
	}
	return proxy
}

func (s *server) handleAccounts(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		limit := int32(queryInt(r, "limit", 100))
		resp, err := s.accountClient.ListAccounts(r.Context(), &pb.ListAccountsRequest{
			Status: r.URL.Query().Get("status"),
			Limit:  limit,
		})
		if err != nil {
			writeError(w, http.StatusBadGateway, err)
			return
		}
		accounts := resp.GetAccounts()
		if accounts == nil {
			accounts = []*pb.Account{}
		}
		writeJSON(w, http.StatusOK, accounts)
	case http.MethodPost:
		var req createAccountRequest
		if err := readJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		email := strings.TrimSpace(req.Email)
		emailStrategy, err := accountEmailStrategy(req.EmailStrategy, email)
		if err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		accountID := randomID()
		resp, err := s.accountWorkflowClient.CreateGPTAccount(r.Context(), &pb.CreateGPTAccountRequest{
			AccountId:     accountID,
			Email:         email,
			Password:      req.Password,
			EmailStrategy: emailStrategy,
		})
		if err != nil {
			writeError(w, http.StatusBadGateway, err)
			return
		}
		if resp.GetErrorMessage() != "" {
			writeError(w, http.StatusBadGateway, errors.New(resp.GetErrorMessage()))
			return
		}
		writeJSON(w, http.StatusCreated, resp.GetAccount())
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (s *server) streamAccountEvents(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	sse, err := newSSEWriter(w)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	sse.Start()

	after := requestLastEventID(r)
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		latest, err := s.emitAccountEvents(r.Context(), sse, after)
		if err != nil {
			if errors.Is(r.Context().Err(), context.Canceled) || status.Code(err) == codes.Canceled {
				return
			}
			sse.Error(err)
			return
		}
		if latest > after {
			after = latest
		}
		sse.Comment("keepalive")
		select {
		case <-r.Context().Done():
			return
		case <-ticker.C:
		}
	}
}

func (s *server) emitAccountEvents(ctx context.Context, sse *sseWriter, after int64) (int64, error) {
	resp, err := s.accountClient.ListAccounts(ctx, &pb.ListAccountsRequest{Limit: 500})
	if err != nil {
		return after, err
	}
	latest := after
	for _, account := range resp.GetAccounts() {
		if account.GetUpdatedAt() <= after {
			continue
		}
		if account.GetUpdatedAt() > latest {
			latest = account.GetUpdatedAt()
		}
		sse.Event(account.GetUpdatedAt(), "account", account)
	}
	return latest, nil
}

func accountEmailStrategy(value string, email string) (pb.AccountEmailStrategy, error) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "cloudflare", "manual":
		if strings.TrimSpace(email) == "" {
			return pb.AccountEmailStrategy_ACCOUNT_EMAIL_STRATEGY_UNSPECIFIED, fmt.Errorf("%s strategy requires email", value)
		}
		return pb.AccountEmailStrategy_ACCOUNT_EMAIL_STRATEGY_EXPLICIT, nil
	case "outlook_primary":
		return pb.AccountEmailStrategy_ACCOUNT_EMAIL_STRATEGY_OUTLOOK_PRIMARY, nil
	case "outlook_alias":
		return pb.AccountEmailStrategy_ACCOUNT_EMAIL_STRATEGY_OUTLOOK_ALIAS, nil
	case "":
		if strings.TrimSpace(email) != "" {
			return pb.AccountEmailStrategy_ACCOUNT_EMAIL_STRATEGY_EXPLICIT, nil
		}
		return pb.AccountEmailStrategy_ACCOUNT_EMAIL_STRATEGY_OUTLOOK_ALIAS, nil
	default:
		return pb.AccountEmailStrategy_ACCOUNT_EMAIL_STRATEGY_UNSPECIFIED, fmt.Errorf("unsupported email strategy: %s", value)
	}
}

func (s *server) handleMailboxes(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		limit := int32(queryInt(r, "limit", 100))
		authStatus := strings.TrimSpace(r.URL.Query().Get("auth_status"))
		if authStatus == "" {
			authStatus = strings.TrimSpace(r.URL.Query().Get("status"))
		}
		resp, err := s.mailboxClient.ListMailboxes(r.Context(), &pb.ListEmailMailboxesRequest{
			AuthStatus: authStatus,
			Provider:   strings.TrimSpace(r.URL.Query().Get("provider")),
			Limit:      limit,
		})
		if err != nil {
			writeError(w, http.StatusBadGateway, err)
			return
		}
		mailboxes := resp.GetMailboxes()
		if mailboxes == nil {
			mailboxes = []*pb.EmailMailbox{}
		}
		writeJSON(w, http.StatusOK, mailboxes)
	case http.MethodPost:
		var req upsertMailboxRequest
		if err := readJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		resp, err := s.mailboxClient.UpsertMailbox(r.Context(), &pb.UpsertEmailMailboxRequest{Mailbox: &pb.EmailMailbox{
			EmailAddress: req.Email,
			Password:     req.Password,
			RefreshToken: req.RefreshToken,
			AccessToken:  req.AccessToken,
			Provider:     strings.TrimSpace(req.Provider),
			AuthStatus:   req.AuthStatus,
			LastError:    req.LastError,
		}})
		if err != nil {
			writeError(w, http.StatusBadGateway, err)
			return
		}
		email := strings.ToLower(strings.TrimSpace(resp.GetMailbox().GetEmailAddress()))
		if email == "" {
			writeError(w, http.StatusBadGateway, errors.New("mailbox returned empty mailbox"))
			return
		}
		if _, err := s.accountClient.UpsertGPTEmailAllocation(r.Context(), &pb.UpsertGPTEmailAllocationRequest{
			Allocation: &pb.GPTEmailAllocation{
				Email:        email,
				PrimaryEmail: email,
				IsPrimary:    true,
				Status:       gptAllocationStatusFromMailboxInput(req.Status, req.AuthStatus, req.RefreshToken),
				Splittable:   strings.TrimSpace(req.Status) == "REGISTERED",
				LastError:    req.LastError,
			},
		}); err != nil {
			writeError(w, http.StatusBadGateway, err)
			return
		}
		writeJSON(w, http.StatusCreated, resp.GetMailbox())
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (s *server) handleGPTEmailAllocations(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	resp, err := s.accountClient.ListGPTEmailAllocations(r.Context(), &pb.ListGPTEmailAllocationsRequest{
		Status:       strings.TrimSpace(r.URL.Query().Get("status")),
		Limit:        int32(queryInt(r, "limit", 500)),
		PrimaryEmail: strings.TrimSpace(r.URL.Query().Get("primary_email")),
	})
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	allocations := resp.GetAllocations()
	if allocations == nil {
		allocations = []*pb.GPTEmailAllocation{}
	}
	writeJSON(w, http.StatusOK, allocations)
}

func (s *server) handleMailbox(w http.ResponseWriter, r *http.Request) {
	emailPath := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/mailboxes/"), "/")
	parts := strings.Split(emailPath, "/")
	emailPath = parts[0]
	email, err := url.PathUnescape(emailPath)
	if err != nil || strings.TrimSpace(email) == "" {
		writeError(w, http.StatusBadRequest, errors.New("email_address is required"))
		return
	}
	if len(parts) == 2 && parts[1] == "inbox" {
		s.handleMailboxStoredInbox(w, r, email)
		return
	}
	if len(parts) > 1 {
		writeError(w, http.StatusNotFound, errors.New("mailbox endpoint not found"))
		return
	}
	switch r.Method {
	case http.MethodDelete:
		resp, err := s.mailboxClient.DeleteMailbox(r.Context(), &pb.DeleteMailboxRequest{EmailAddress: strings.TrimSpace(email)})
		if err != nil {
			writeError(w, http.StatusBadGateway, err)
			return
		}
		writeJSON(w, http.StatusOK, resp)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (s *server) handleMailboxStoredInbox(w http.ResponseWriter, r *http.Request, email string) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	resp, err := s.mailboxClient.ListMailboxInbox(r.Context(), &pb.ListMailboxInboxRequest{
		EmailAddress:  strings.TrimSpace(email),
		Limit:         int32(queryInt(r, "limit", 20)),
		ParserProfile: strings.TrimSpace(r.URL.Query().Get("parser_profile")),
	})
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	if resp.GetErrorMessage() != "" {
		writeError(w, http.StatusBadGateway, errors.New(resp.GetErrorMessage()))
		return
	}
	writeJSON(w, http.StatusOK, resp.GetResult())
}

func (s *server) handleMailboxRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	resp, err := s.mailboxClient.RegisterMailbox(ctx, &pb.RegisterMailboxRequest{})
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}

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

func (s *server) handleMailboxOperations(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	resp, err := s.mailboxClient.ListMailboxOperations(r.Context(), &pb.ListMailboxOperationsRequest{
		Limit:        int32(queryInt(r, "limit", 50)),
		Status:       strings.TrimSpace(r.URL.Query().Get("status")),
		Action:       strings.TrimSpace(r.URL.Query().Get("action")),
		EmailAddress: strings.TrimSpace(r.URL.Query().Get("email_address")),
	})
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	if resp.GetErrorMessage() != "" {
		writeError(w, http.StatusBadGateway, errors.New(resp.GetErrorMessage()))
		return
	}
	operations := resp.GetOperations()
	if operations == nil {
		operations = []*pb.MailboxOperation{}
	}
	writeJSON(w, http.StatusOK, operations)
}

func (s *server) handleMailboxOperation(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	operationID := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/mailbox-operations/"), "/")
	if operationID == "" {
		writeError(w, http.StatusBadRequest, errors.New("operation_id is required"))
		return
	}
	resp, err := s.mailboxClient.GetMailboxOperation(r.Context(), &pb.GetMailboxOperationRequest{OperationId: operationID})
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	if resp.GetErrorMessage() != "" {
		writeError(w, http.StatusNotFound, errors.New(resp.GetErrorMessage()))
		return
	}
	writeJSON(w, http.StatusOK, resp.GetOperation())
}

func (s *server) handleAccount(w http.ResponseWriter, r *http.Request) {
	accountPath := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/accounts/"), "/")
	parts := strings.Split(accountPath, "/")
	accountID := parts[0]
	if accountID == "" {
		writeError(w, http.StatusBadRequest, errors.New("account_id is required"))
		return
	}
	if len(parts) > 1 {
		if len(parts) == 2 && parts[1] == "access-token" {
			s.handleAccountAccessToken(w, r, accountID)
			return
		}
		if len(parts) == 2 && parts[1] == "checkout-link" {
			s.handleAccountCheckoutLink(w, r, accountID)
			return
		}
		if len(parts) == 3 && parts[1] == "mailbox" && parts[2] == "inbox" {
			s.handleAccountMailboxInbox(w, r, accountID)
			return
		}
		writeError(w, http.StatusNotFound, errors.New("account endpoint not found"))
		return
	}

	switch r.Method {
	case http.MethodGet:
		resp, err := s.accountClient.GetAccount(r.Context(), &pb.GetAccountRequest{AccountId: accountID})
		if err != nil {
			writeError(w, http.StatusBadGateway, err)
			return
		}
		writeJSON(w, http.StatusOK, resp.GetAccount())
	case http.MethodPatch, http.MethodPut:
		var req updateAccountRequest
		if err := readJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		sessionToken, accessToken := normalizeAccountAuthInput(req.SessionToken, req.AccessToken)
		if sessionToken == "" && accessToken == "" && req.ActivationChannel == nil {
			writeError(w, http.StatusBadRequest, errors.New("session_token, access_token, or activation_channel is required"))
			return
		}
		account := &pb.Account{
			AccountId:    accountID,
			SessionToken: sessionToken,
			AccessToken:  accessToken,
		}
		if req.ActivationChannel != nil {
			activationChannel := strings.TrimSpace(*req.ActivationChannel)
			account.ActivationChannel = &activationChannel
		}
		resp, err := s.accountClient.UpdateAccount(r.Context(), &pb.UpdateAccountRequest{Account: account})
		if err != nil {
			writeError(w, http.StatusBadGateway, err)
			return
		}
		writeJSON(w, http.StatusOK, resp.GetAccount())
	case http.MethodDelete:
		resp, err := s.accountClient.DeleteAccount(r.Context(), &pb.DeleteAccountRequest{AccountId: accountID})
		if err != nil {
			writeError(w, http.StatusBadGateway, err)
			return
		}
		writeJSON(w, http.StatusOK, resp)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (s *server) handleAccountMailboxInbox(w http.ResponseWriter, r *http.Request, accountID string) {
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

	timeout := envInt("ACCOUNT_MAILBOX_INBOX_TIMEOUT_SECONDS", envInt("MAILBOX_INBOX_TIMEOUT_SECONDS", 180))
	if timeout < 30 {
		timeout = 30
	}
	ctx, cancel := context.WithTimeout(r.Context(), time.Duration(timeout)*time.Second)
	defer cancel()

	resp, err := s.accountWorkflowClient.FetchAccountMailbox(ctx, &pb.FetchAccountMailboxRequest{
		AccountId:       accountID,
		LimitPerMailbox: req.LimitPerMailbox,
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

func (s *server) handleAccountMailboxSync(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var req accountMailboxSyncRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if req.LimitPerMailbox <= 0 {
		req.LimitPerMailbox = 25
	}
	if req.LimitPerMailbox > 100 {
		req.LimitPerMailbox = 100
	}
	if req.AccountLimit <= 0 {
		req.AccountLimit = 500
	}
	if req.AccountLimit > 500 {
		req.AccountLimit = 500
	}
	timeout := envInt("ACCOUNT_MAILBOX_SYNC_TIMEOUT_SECONDS", 300)
	if timeout < 30 {
		timeout = 30
	}
	ctx, cancel := context.WithTimeout(r.Context(), time.Duration(timeout)*time.Second)
	defer cancel()
	resp, err := s.accountWorkflowClient.SyncAccountMailboxes(ctx, &pb.SyncAccountMailboxesRequest{
		LimitPerMailbox: req.LimitPerMailbox,
		AccountLimit:    req.AccountLimit,
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

func (s *server) handleAccountAccessToken(w http.ResponseWriter, r *http.Request, accountID string) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	accountResp, err := s.accountClient.GetAccount(ctx, &pb.GetAccountRequest{AccountId: accountID})
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	account := accountResp.GetAccount()
	if account == nil {
		writeError(w, http.StatusNotFound, errors.New("account not found"))
		return
	}
	sessionToken := strings.TrimSpace(account.GetSessionToken())
	if sessionToken == "" {
		writeError(w, http.StatusBadRequest, errors.New("session_token is required"))
		return
	}

	accessToken, err := fetchChatGPTAccessToken(ctx, sessionToken)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	updated, err := s.accountClient.UpdateAccount(ctx, &pb.UpdateAccountRequest{Account: &pb.Account{
		AccountId:   accountID,
		AccessToken: accessToken,
	}})
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusOK, updated.GetAccount())
}

func (s *server) handleAccountCheckoutLink(w http.ResponseWriter, r *http.Request, accountID string) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()

	accountResp, err := s.accountClient.GetAccount(ctx, &pb.GetAccountRequest{AccountId: accountID})
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	account := accountResp.GetAccount()
	if account == nil {
		writeError(w, http.StatusNotFound, errors.New("account not found"))
		return
	}

	sessionToken := strings.TrimSpace(account.GetSessionToken())
	accessToken := strings.TrimSpace(account.GetAccessToken())
	if sessionToken == "" && accessToken == "" {
		writeError(w, http.StatusBadRequest, errors.New("session_token or access_token is required"))
		return
	}

	resp, err := s.paymentClient.CreateCheckoutLink(ctx, &pb.CreateCheckoutLinkRequest{
		Credential: paymentCredential(sessionToken, accessToken),
	})
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	if !resp.GetSuccess() || resp.GetErrorMessage() != "" {
		msg := strings.TrimSpace(resp.GetErrorMessage())
		if msg == "" {
			msg = "checkout link creation failed"
		}
		writeError(w, http.StatusBadGateway, errors.New(msg))
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func fetchChatGPTAccessToken(ctx context.Context, sessionToken string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://chatgpt.com/api/auth/session", nil)
	if err != nil {
		return "", err
	}
	cookieHeader := chatGPTSessionCookieHeader(sessionToken)
	if cookieHeader == "" {
		return "", errors.New("session_token is required")
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
	req.Header.Set("Referer", "https://chatgpt.com/")
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36")
	req.Header.Set("Cookie", cookieHeader)

	resp, err := (&http.Client{Timeout: 25 * time.Second}).Do(req)
	if err != nil {
		return "", fmt.Errorf("fetch auth session: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("auth session returned status %d", resp.StatusCode)
	}

	var payload struct {
		AccessToken string `json:"accessToken"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return "", fmt.Errorf("decode auth session: %w", err)
	}
	accessToken := strings.TrimSpace(payload.AccessToken)
	if accessToken == "" {
		return "", errors.New("auth session did not return access token")
	}
	return accessToken, nil
}

func normalizeAccountAuthInput(sessionInput, accessInput string) (string, string) {
	sessionToken := strings.TrimSpace(sessionInput)
	accessToken := extractAccessToken(accessInput)
	if payloadSession, payloadAccess := authSessionJSONTokens(sessionToken); payloadSession != "" || payloadAccess != "" {
		if payloadSession != "" {
			sessionToken = payloadSession
		}
		if accessToken == "" {
			accessToken = payloadAccess
		}
	}
	if payloadSession, payloadAccess := authSessionJSONTokens(accessInput); payloadSession != "" || payloadAccess != "" {
		if sessionToken == "" {
			sessionToken = payloadSession
		}
		if payloadAccess != "" {
			accessToken = payloadAccess
		}
	}
	if parsedSession := extractSessionToken(sessionToken); parsedSession != "" {
		sessionToken = parsedSession
	}
	return strings.TrimSpace(sessionToken), strings.TrimSpace(accessToken)
}

func authSessionJSONTokens(raw string) (string, string) {
	text := strings.TrimSpace(raw)
	if !strings.HasPrefix(text, "{") {
		return "", ""
	}
	var payload struct {
		SessionToken string `json:"sessionToken"`
		AccessToken  string `json:"accessToken"`
	}
	if err := json.Unmarshal([]byte(text), &payload); err != nil {
		return "", ""
	}
	return strings.TrimSpace(payload.SessionToken), strings.TrimSpace(payload.AccessToken)
}

func extractAccessToken(raw string) string {
	text := strings.TrimSpace(raw)
	if _, accessToken := authSessionJSONTokens(text); accessToken != "" {
		return accessToken
	}
	return text
}

func extractSessionToken(raw string) string {
	text := strings.TrimSpace(raw)
	if text == "" {
		return ""
	}
	if sessionToken, _ := authSessionJSONTokens(text); sessionToken != "" {
		return sessionToken
	}
	exact := ""
	chunks := map[int]string{}
	for _, part := range strings.Split(text, ";") {
		name, value, ok := parseSessionCookiePart(part)
		if !ok {
			continue
		}
		if name == nextAuthSessionCookieName || name == nextAuthSessionCookieFallbackName {
			exact = value
			continue
		}
		if index, ok := sessionCookieChunkIndex(name); ok {
			chunks[index] = value
		}
	}
	if exact != "" {
		return exact
	}
	if len(chunks) == 0 {
		return ""
	}
	indexes := make([]int, 0, len(chunks))
	for index := range chunks {
		indexes = append(indexes, index)
	}
	sort.Ints(indexes)
	var b strings.Builder
	for _, index := range indexes {
		b.WriteString(chunks[index])
	}
	return b.String()
}

func chatGPTSessionCookieHeader(sessionToken string) string {
	token := extractSessionToken(sessionToken)
	if token == "" {
		token = strings.TrimSpace(sessionToken)
	}
	if token == "" {
		return ""
	}
	if strings.Contains(token, "=") {
		parts := make([]string, 0, 2)
		for _, part := range strings.Split(token, ";") {
			name, value, ok := parseSessionCookiePart(part)
			if ok {
				parts = append(parts, name+"="+value)
			}
		}
		if len(parts) > 0 {
			sort.SliceStable(parts, func(i, j int) bool {
				return sessionCookieSortKey(parts[i]) < sessionCookieSortKey(parts[j])
			})
			return strings.Join(parts, "; ")
		}
	}
	if len(token) <= nextAuthSessionCookieChunkSize {
		return nextAuthSessionCookieName + "=" + token
	}
	parts := make([]string, 0, (len(token)+nextAuthSessionCookieChunkSize-1)/nextAuthSessionCookieChunkSize)
	for index, offset := 0, 0; offset < len(token); index, offset = index+1, offset+nextAuthSessionCookieChunkSize {
		end := offset + nextAuthSessionCookieChunkSize
		if end > len(token) {
			end = len(token)
		}
		parts = append(parts, fmt.Sprintf("%s.%d=%s", nextAuthSessionCookieName, index, token[offset:end]))
	}
	return strings.Join(parts, "; ")
}

func parseSessionCookiePart(raw string) (string, string, bool) {
	part := strings.Trim(raw, " \t\r\n'\"\\")
	for _, base := range []string{nextAuthSessionCookieName, nextAuthSessionCookieFallbackName} {
		if idx := strings.Index(part, base); idx >= 0 {
			part = part[idx:]
			break
		}
	}
	if !strings.Contains(part, "=") {
		return "", "", false
	}
	name, value, _ := strings.Cut(part, "=")
	name = strings.TrimSpace(name)
	value = strings.Trim(value, " \t\r\n'\"\\")
	for i, r := range value {
		if r == '\'' || r == '"' || r == '\\' || r == ' ' || r == '\t' || r == '\r' || r == '\n' {
			value = value[:i]
			break
		}
	}
	if !isSessionCookieName(name) || value == "" {
		return "", "", false
	}
	return name, value, true
}

func isSessionCookieName(name string) bool {
	if name == nextAuthSessionCookieName || name == nextAuthSessionCookieFallbackName {
		return true
	}
	_, ok := sessionCookieChunkIndex(name)
	return ok
}

func sessionCookieChunkIndex(name string) (int, bool) {
	for _, base := range []string{nextAuthSessionCookieName, nextAuthSessionCookieFallbackName} {
		prefix := base + "."
		if strings.HasPrefix(name, prefix) {
			index, err := strconv.Atoi(strings.TrimPrefix(name, prefix))
			return index, err == nil
		}
	}
	return 0, false
}

func sessionCookieSortKey(part string) int {
	name, _, _ := strings.Cut(part, "=")
	if index, ok := sessionCookieChunkIndex(name); ok {
		return index
	}
	return -1
}

func (s *server) handleJobs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	resp, err := s.jobClient.ListJobs(r.Context(), &pb.ListJobsRequest{
		Limit:     int32(queryInt(r, "limit", 100)),
		Status:    strings.TrimSpace(r.URL.Query().Get("status")),
		Action:    strings.TrimSpace(r.URL.Query().Get("action")),
		AccountId: strings.TrimSpace(r.URL.Query().Get("account_id")),
		Before:    requestJobListCursor(r),
	})
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	if resp.GetErrorMessage() != "" {
		writeError(w, http.StatusBadGateway, errors.New(resp.GetErrorMessage()))
		return
	}
	if requestJobPageResponse(r) {
		writeJSON(w, http.StatusOK, resp)
		return
	}
	snapshots := resp.GetSnapshots()
	if snapshots == nil {
		snapshots = []*pb.JobSnapshot{}
	}
	writeJSON(w, http.StatusOK, snapshots)
}

func (s *server) handleJob(w http.ResponseWriter, r *http.Request) {
	rest := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/jobs/"), "/")
	parts := strings.Split(rest, "/")
	if len(parts) == 0 || strings.TrimSpace(parts[0]) == "" {
		writeError(w, http.StatusBadRequest, errors.New("job_id is required"))
		return
	}
	jobID := strings.TrimSpace(parts[0])

	if len(parts) > 1 {
		switch parts[1] {
		case "otp":
			if len(parts) == 2 {
				if r.Method != http.MethodPost {
					w.WriteHeader(http.StatusMethodNotAllowed)
					return
				}
				s.submitJobOTP(w, r, jobID)
				return
			}
			if len(parts) == 3 && parts[2] == "resend" {
				if r.Method != http.MethodPost {
					w.WriteHeader(http.StatusMethodNotAllowed)
					return
				}
				s.resendJobOTP(w, r, jobID)
				return
			}
			writeError(w, http.StatusNotFound, fmt.Errorf("unsupported job otp action: %s", strings.Join(parts[1:], "/")))
			return
		case "gopay-payment":
			if len(parts) != 3 || parts[2] != "confirm" {
				writeError(w, http.StatusNotFound, fmt.Errorf("unsupported job gopay-payment action: %s", strings.Join(parts[1:], "/")))
				return
			}
			if r.Method != http.MethodPost {
				w.WriteHeader(http.StatusMethodNotAllowed)
				return
			}
			s.confirmManualGoPayPayment(w, r, jobID)
			return
		case "add-balance":
			if len(parts) != 3 {
				writeError(w, http.StatusNotFound, fmt.Errorf("unsupported job add-balance action: %s", strings.Join(parts[1:], "/")))
				return
			}
			if r.Method != http.MethodPost {
				w.WriteHeader(http.StatusMethodNotAllowed)
				return
			}
			switch parts[2] {
			case "confirm":
				s.confirmManualAddBalance(w, r, jobID)
			case "select":
				s.selectGoPayAddBalance(w, r, jobID)
			default:
				writeError(w, http.StatusNotFound, fmt.Errorf("unsupported job add-balance action: %s", strings.Join(parts[1:], "/")))
			}
			return
		case "cancel":
			if len(parts) != 2 {
				writeError(w, http.StatusNotFound, fmt.Errorf("unsupported job cancel action: %s", strings.Join(parts[1:], "/")))
				return
			}
			if r.Method != http.MethodPost {
				w.WriteHeader(http.StatusMethodNotAllowed)
				return
			}
			s.cancelJob(w, r, jobID)
			return
		default:
			writeError(w, http.StatusNotFound, fmt.Errorf("unsupported job action: %s", parts[1]))
			return
		}
	}

	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	resp, err := s.jobClient.GetJob(r.Context(), &pb.GetJobRequest{JobId: jobID})
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	if resp.GetErrorMessage() != "" {
		writeError(w, http.StatusBadGateway, errors.New(resp.GetErrorMessage()))
		return
	}
	writeJSON(w, http.StatusOK, resp.GetSnapshot())
}

func (s *server) streamJobsEvents(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	stream, err := s.jobClient.WatchJobs(r.Context(), &pb.WatchJobsRequest{
		JobIds: requestJobIDs(r),
		Status: strings.TrimSpace(r.URL.Query().Get("status")),
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
		event, err := stream.Recv()
		if err != nil {
			if !errors.Is(err, io.EOF) && status.Code(err) != codes.Canceled {
				sse.Error(err)
			}
			return
		}
		if event.GetErrorMessage() != "" {
			sse.Error(errors.New(event.GetErrorMessage()))
			return
		}
		jobEvent := event.GetEvent()
		if jobEvent == nil {
			continue
		}
		sse.Event(jobEvent.GetEventId(), "job", jobEvent)
	}
}

func sseJSON(value any) string {
	b, err := json.Marshal(value)
	if err != nil {
		b, _ = json.Marshal(map[string]string{"error": err.Error()})
	}
	return string(b)
}

func requestJobIDs(r *http.Request) []string {
	query := r.URL.Query()
	values := append([]string{}, query["job_id"]...)
	values = append(values, query["job_ids"]...)
	out := []string{}
	seen := map[string]struct{}{}
	for _, value := range values {
		for _, part := range strings.Split(value, ",") {
			part = strings.TrimSpace(part)
			if part == "" {
				continue
			}
			if _, ok := seen[part]; ok {
				continue
			}
			seen[part] = struct{}{}
			out = append(out, part)
		}
	}
	return out
}

func requestJobPageResponse(r *http.Request) bool {
	value := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("page")))
	return value == "true" || value == "1"
}

func requestJobListCursor(r *http.Request) *pb.JobListCursor {
	updatedAt := int64(queryInt(r, "before_updated_at", 0))
	jobID := strings.TrimSpace(r.URL.Query().Get("before_job_id"))
	if updatedAt <= 0 && jobID == "" {
		return nil
	}
	return &pb.JobListCursor{UpdatedAt: updatedAt, JobId: jobID}
}

func requestLastEventID(r *http.Request) int64 {
	value := strings.TrimSpace(r.Header.Get("Last-Event-ID"))
	if value == "" {
		value = strings.TrimSpace(r.URL.Query().Get("after_event_id"))
	}
	if value == "" {
		return 0
	}
	id, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		return 0
	}
	return id
}

func requestEmailSignalKind(r *http.Request) pb.EmailSignalKind {
	value := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("signal_kind")))
	if value == "" {
		value = strings.ToLower(strings.TrimSpace(r.URL.Query().Get("signal")))
	}
	switch value {
	case "", "otp", "code", "verification_code", "email_signal_kind_otp":
		return pb.EmailSignalKind_EMAIL_SIGNAL_KIND_OTP
	case "any", "all", "unspecified":
		return pb.EmailSignalKind_EMAIL_SIGNAL_KIND_UNSPECIFIED
	default:
		return pb.EmailSignalKind_EMAIL_SIGNAL_KIND_OTP
	}
}

func (s *server) submitJobOTP(w http.ResponseWriter, r *http.Request, jobID string) {
	var req submitJobOTPRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	resp, err := s.otpClient.SubmitOTP(r.Context(), &pb.SubmitOTPRequest{
		JobId: jobID,
		Otp:   req.OTP,
	})
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	if resp.GetErrorMessage() != "" {
		writeError(w, http.StatusBadRequest, errors.New(resp.GetErrorMessage()))
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *server) resendJobOTP(w http.ResponseWriter, r *http.Request, jobID string) {
	resp, err := s.otpClient.ResendOTP(r.Context(), &pb.ResendOTPRequest{
		JobId: jobID,
	})
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	if resp.GetErrorMessage() != "" {
		writeError(w, http.StatusBadRequest, errors.New(resp.GetErrorMessage()))
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *server) cancelJob(w http.ResponseWriter, r *http.Request, jobID string) {
	var req pb.CancelJobRequest
	if err := readProtoJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	req.JobId = jobID
	resp, err := s.jobClient.CancelJob(r.Context(), &req)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	if resp.GetErrorMessage() != "" {
		writeError(w, http.StatusBadRequest, errors.New(resp.GetErrorMessage()))
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *server) confirmManualGoPayPayment(w http.ResponseWriter, r *http.Request, jobID string) {
	resp, err := s.gopayAppClient.ConfirmManualGoPayPayment(r.Context(), &pb.ConfirmManualGoPayPaymentRequest{
		JobId: jobID,
	})
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	if resp.GetErrorMessage() != "" {
		writeError(w, http.StatusBadRequest, errors.New(resp.GetErrorMessage()))
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *server) confirmManualAddBalance(w http.ResponseWriter, r *http.Request, jobID string) {
	resp, err := s.gopayAppClient.ConfirmManualAddBalance(r.Context(), &pb.ConfirmManualAddBalanceRequest{
		JobId: jobID,
	})
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	if resp.GetErrorMessage() != "" {
		writeError(w, http.StatusBadRequest, errors.New(resp.GetErrorMessage()))
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *server) selectGoPayAddBalance(w http.ResponseWriter, r *http.Request, jobID string) {
	var req pb.ConfirmManualAddBalanceRequest
	if err := readProtoJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	req.JobId = jobID
	resp, err := s.gopayAppClient.ConfirmManualAddBalance(r.Context(), &req)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	if resp.GetErrorMessage() != "" {
		writeError(w, http.StatusBadRequest, errors.New(resp.GetErrorMessage()))
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *server) handleRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var req pb.RegisterAccountRequest
	if err := readProtoJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	resp, err := s.accountWorkflowClient.RegisterAccount(r.Context(), &req)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *server) handleActivate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var req pb.ActivateAccountRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	resp, err := s.paymentWorkflowClient.ActivateAccount(r.Context(), &req)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *server) handleAutopay(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var req pb.ActivateAccountRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	resp, err := s.paymentWorkflowClient.AutopayAccount(r.Context(), &req)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *server) handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var req pb.LoginAccountRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	resp, err := s.accountWorkflowClient.LoginAccount(r.Context(), &req)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	statusCode := http.StatusAccepted
	if !resp.GetStarted() || resp.GetErrorMessage() != "" {
		statusCode = http.StatusBadGateway
	}
	writeJSON(w, statusCode, resp)
}

func (s *server) handleProbeAccount(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var req pb.ProbeAccountRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	resp, err := s.paymentWorkflowClient.ProbeAccount(r.Context(), &req)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	statusCode := http.StatusAccepted
	if !resp.GetStarted() || resp.GetErrorMessage() != "" {
		statusCode = http.StatusBadGateway
	}
	writeJSON(w, statusCode, resp)
}

func (s *server) handleGoPayApp(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var req pb.GoPayAppRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	resp, err := s.gopayAppClient.RunGoPayApp(r.Context(), &req)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	statusCode := http.StatusAccepted
	if !resp.GetStarted() || resp.GetErrorMessage() != "" {
		statusCode = http.StatusBadGateway
	}
	writeJSON(w, statusCode, resp)
}

func (s *server) handleGoPayState(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	userID := strings.TrimSpace(r.URL.Query().Get("user_id"))
	if userID == "" {
		userID = "local"
	}
	resp, err := s.gopayAppClient.GoPayUserStatus(r.Context(), &pb.GoPayUserStatusRequest{UserId: userID})
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	waPhone, err := s.gopayAppClient.GoPayUserGetWAPhone(r.Context(), &pb.GoPayUserGetWAPhoneRequest{UserId: userID})
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"success":                resp.GetSuccess(),
		"error_message":          resp.GetErrorMessage(),
		"user_id":                userID,
		"wa_phone":               waPhone.GetWaPhone(),
		"wa_phone_error_message": waPhone.GetErrorMessage(),
		"status":                 resp.GetStatus(),
	})
}

func (s *server) handleGoPayProfile(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		userID := strings.TrimSpace(r.URL.Query().Get("user_id"))
		if userID == "" {
			userID = "local"
		}
		resp, err := s.gopayAppClient.GoPayUserGetWAPhone(r.Context(), &pb.GoPayUserGetWAPhoneRequest{UserId: userID})
		if err != nil {
			writeError(w, http.StatusBadGateway, err)
			return
		}
		writeProtoJSON(w, http.StatusOK, resp)
	case http.MethodPost:
		var req pb.GoPayUserSetWAPhoneRequest
		if err := readProtoJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		resp, err := s.gopayAppClient.GoPayUserSetWAPhone(r.Context(), &req)
		if err != nil {
			writeError(w, http.StatusBadGateway, err)
			return
		}
		writeProtoJSON(w, http.StatusOK, resp)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (s *server) handleGoPayUserAction(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	action := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/gopay/user/"), "/")
	switch action {
	case "check-phone":
		var req pb.GoPayUserCheckPhoneRequest
		if handleProtoAction(w, r, &req, func() (proto.Message, error) { return s.gopayAppClient.GoPayUserCheckPhone(r.Context(), &req) }) {
			return
		}
	case "check-balance":
		var req pb.GoPayUserCheckBalanceRequest
		if handleProtoAction(w, r, &req, func() (proto.Message, error) { return s.gopayAppClient.GoPayUserCheckBalance(r.Context(), &req) }) {
			return
		}
	case "auth-start":
		var req pb.GoPayUserAuthStartRequest
		if handleProtoAction(w, r, &req, func() (proto.Message, error) { return s.gopayAppClient.GoPayUserAuthStart(r.Context(), &req) }) {
			return
		}
	case "auth-complete":
		var req pb.GoPayUserAuthCompleteRequest
		if handleProtoAction(w, r, &req, func() (proto.Message, error) { return s.gopayAppClient.GoPayUserAuthComplete(r.Context(), &req) }) {
			return
		}
	case "signup-start":
		var req pb.GoPayUserSignupStartRequest
		if handleProtoAction(w, r, &req, func() (proto.Message, error) { return s.gopayAppClient.GoPayUserSignupStart(r.Context(), &req) }) {
			return
		}
	case "signup-complete":
		var req pb.GoPayUserSignupCompleteRequest
		if handleProtoAction(w, r, &req, func() (proto.Message, error) { return s.gopayAppClient.GoPayUserSignupComplete(r.Context(), &req) }) {
			return
		}
	case "change-phone-start":
		var req pb.GoPayUserChangePhoneStartRequest
		if handleProtoAction(w, r, &req, func() (proto.Message, error) { return s.gopayAppClient.GoPayUserChangePhoneStart(r.Context(), &req) }) {
			return
		}
	case "change-phone-complete":
		var req pb.GoPayUserChangePhoneCompleteRequest
		if handleProtoAction(w, r, &req, func() (proto.Message, error) { return s.gopayAppClient.GoPayUserChangePhoneComplete(r.Context(), &req) }) {
			return
		}
	case "change-phone-retry":
		var req pb.GoPayUserChangePhoneRetryRequest
		if handleProtoAction(w, r, &req, func() (proto.Message, error) { return s.gopayAppClient.GoPayUserChangePhoneRetry(r.Context(), &req) }) {
			return
		}
	case "create-pin-start":
		var req pb.GoPayUserCreatePinStartRequest
		if handleProtoAction(w, r, &req, func() (proto.Message, error) { return s.gopayAppClient.GoPayUserCreatePinStart(r.Context(), &req) }) {
			return
		}
	case "create-pin-complete":
		var req pb.GoPayUserCreatePinCompleteRequest
		if handleProtoAction(w, r, &req, func() (proto.Message, error) { return s.gopayAppClient.GoPayUserCreatePinComplete(r.Context(), &req) }) {
			return
		}
	case "clear-state":
		var req pb.GoPayUserClearStateRequest
		if handleProtoAction(w, r, &req, func() (proto.Message, error) { return s.gopayAppClient.GoPayUserClearState(r.Context(), &req) }) {
			return
		}
	default:
		writeError(w, http.StatusNotFound, fmt.Errorf("unknown gopay action: %s", action))
	}
}

func (s *server) handleGoPayPayment(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var req pb.GoPayPaymentRequest
	if err := readProtoJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	resp, err := s.gopayAppClient.RunGoPayPayment(r.Context(), &req)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	statusCode := http.StatusAccepted
	if !resp.GetStarted() || resp.GetErrorMessage() != "" {
		statusCode = http.StatusBadGateway
	}
	writeJSON(w, statusCode, resp)
}

func (s *server) handleGoPayQRISPaymentActivate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var req pb.GoPayQRISPaymentActivateRequest
	if err := readProtoJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	resp, err := s.gopayAppClient.RunGoPayQRISPaymentActivate(r.Context(), &req)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	statusCode := http.StatusAccepted
	if !resp.GetStarted() || resp.GetErrorMessage() != "" {
		statusCode = http.StatusBadGateway
	}
	writeJSON(w, statusCode, resp)
}

func (s *server) handleGoPayWAPayment(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var req pb.GoPayWAPaymentRequest
	if err := readProtoJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	resp, err := s.gopayAppClient.RunGoPayWAPayment(r.Context(), &req)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	statusCode := http.StatusAccepted
	if !resp.GetStarted() || resp.GetErrorMessage() != "" {
		statusCode = http.StatusBadGateway
	}
	writeJSON(w, statusCode, resp)
}

func (s *server) handleGoPayPaymentRebind(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var req pb.GoPayPaymentRebindRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	resp, err := s.gopayAppClient.RetryGoPayPaymentRebind(r.Context(), &req)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	statusCode := http.StatusAccepted
	if !resp.GetStarted() || resp.GetErrorMessage() != "" {
		statusCode = http.StatusBadGateway
	}
	writeJSON(w, statusCode, resp)
}

func (s *server) handleRegisterAndActivate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var req pb.RegisterAndActivateAccountRequest
	if err := readProtoJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	resp, err := s.accountWorkflowClient.RegisterAndActivateAccount(r.Context(), &req)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *server) handleStatic(w http.ResponseWriter, r *http.Request) {
	path := filepath.Join(s.staticDir, filepath.Clean(r.URL.Path))
	if info, err := os.Stat(path); err == nil && !info.IsDir() {
		http.ServeFile(w, r, path)
		return
	}
	http.ServeFile(w, r, filepath.Join(s.staticDir, "index.html"))
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func readJSON(r *http.Request, dst any) error {
	defer r.Body.Close()
	return json.NewDecoder(r.Body).Decode(dst)
}

func readProtoJSON(r *http.Request, dst protojsonUnmarshaler) error {
	defer r.Body.Close()
	raw, err := io.ReadAll(r.Body)
	if err != nil {
		return err
	}
	if len(strings.TrimSpace(string(raw))) == 0 {
		raw = []byte("{}")
	}
	return (protojson.UnmarshalOptions{DiscardUnknown: true}).Unmarshal(raw, dst)
}

type protojsonUnmarshaler interface {
	ProtoReflect() protoreflect.Message
}

func handleProtoAction(w http.ResponseWriter, r *http.Request, req protojsonUnmarshaler, call func() (proto.Message, error)) bool {
	if err := readProtoJSON(r, req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return true
	}
	resp, err := call()
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return true
	}
	writeProtoJSON(w, http.StatusOK, resp)
	return true
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeProtoJSON(w http.ResponseWriter, status int, value proto.Message) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	data, err := (protojson.MarshalOptions{UseProtoNames: true}).Marshal(value)
	if err != nil {
		_, _ = w.Write([]byte("{}"))
		return
	}
	_, _ = w.Write(data)
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]string{"error": err.Error()})
}

func queryInt(r *http.Request, key string, fallback int) int {
	value := strings.TrimSpace(r.URL.Query().Get(key))
	if value == "" {
		return fallback
	}
	n, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return n
}

func newGRPCClient(addr string) (*grpc.ClientConn, error) {
	return grpc.NewClient(grpcDialTarget(addr), grpc.WithTransportCredentials(insecure.NewCredentials()))
}

func grpcDialTarget(addr string) string {
	addr = strings.TrimSpace(addr)
	if addr == "" || strings.Contains(addr, "://") || strings.HasPrefix(addr, "passthrough:") {
		return addr
	}
	// Let Docker DNS resolve the service name on each TCP reconnect instead of
	// caching a container IP inside gRPC's DNS resolver.
	return "passthrough:///" + addr
}

func envDefault(key string, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func envInt(key string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	n, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return n
}

func gptAllocationStatusFromMailboxInput(statusValue string, authStatusValue string, refreshToken string) string {
	statusValue = strings.TrimSpace(statusValue)
	switch statusValue {
	case "ASSIGNED", "REGISTERED", "USER_ALREADY_EXISTS", "REGISTRATION_FAILED", "BLOCKED":
		return statusValue
	}
	authStatusValue = strings.TrimSpace(authStatusValue)
	switch authStatusValue {
	case "AUTH_FAILED", "NEEDS_MANUAL_VERIFICATION":
		return authStatusValue
	case "AUTHORIZED":
		return "AVAILABLE"
	}
	if strings.TrimSpace(refreshToken) != "" {
		return "AVAILABLE"
	}
	return "OAUTH_PENDING"
}

func paymentCredential(sessionToken, accessToken string) *pb.ChatGPTCredential {
	accessToken = strings.TrimSpace(accessToken)
	if accessToken != "" {
		return &pb.ChatGPTCredential{
			AccessToken: accessToken,
		}
	}
	sessionToken = strings.TrimSpace(sessionToken)
	if sessionToken != "" {
		return &pb.ChatGPTCredential{
			SessionToken: sessionToken,
		}
	}
	return nil
}

func tailString(value string, limit int) string {
	if limit <= 0 || len(value) <= limit {
		return value
	}
	return value[len(value)-limit:]
}

func randomID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(b[:])
}
