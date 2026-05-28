package main

import (
	"errors"
	"net/http"
	"net/url"
	"strings"

	"webui/server/pb"
)

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
			HomeCountry:  strings.ToUpper(strings.TrimSpace(req.HomeCountry)),
			HomeIp:       strings.TrimSpace(req.HomeIP),
			ProxyProfile: strings.TrimSpace(req.ProxyProfile),
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
