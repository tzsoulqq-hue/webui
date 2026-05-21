package main

import (
	"errors"
	"net/http"
	"net/url"
	"strings"

	"webui/server/pb"
)

func (s *server) handleSMSProviderConfigs(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		resp, err := s.smsAdminClient.ListProviderConfigs(r.Context(), &pb.ListProviderConfigsRequest{
			IncludeDisabled: queryBool(r, "include_disabled", true),
			ProviderKey:     strings.TrimSpace(r.URL.Query().Get("provider_key")),
		})
		if err != nil {
			writeError(w, http.StatusBadGateway, err)
			return
		}
		if writeProviderError(w, resp.GetError()) {
			return
		}
		writeProtoJSON(w, http.StatusOK, resp)
	case http.MethodPost:
		var req pb.UpsertProviderConfigRequest
		if err := readProtoJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		resp, err := s.smsAdminClient.UpsertProviderConfig(r.Context(), &req)
		if err != nil {
			writeError(w, http.StatusBadGateway, err)
			return
		}
		if writeProviderError(w, resp.GetError()) {
			return
		}
		writeProtoJSON(w, http.StatusOK, resp)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (s *server) handleSMSProviderConfig(w http.ResponseWriter, r *http.Request) {
	id, action, ok := splitSMSPath(r.URL.Path, "/api/sms/provider-configs/")
	if !ok {
		writeError(w, http.StatusBadRequest, errors.New("provider_config_id is required"))
		return
	}
	switch {
	case r.Method == http.MethodGet && action == "":
		resp, err := s.smsAdminClient.GetProviderConfig(r.Context(), &pb.GetProviderConfigRequest{ProviderConfigId: id})
		if err != nil {
			writeError(w, http.StatusBadGateway, err)
			return
		}
		if writeProviderError(w, resp.GetError()) {
			return
		}
		writeProtoJSON(w, http.StatusOK, resp)
	case r.Method == http.MethodDelete && action == "":
		resp, err := s.smsAdminClient.DeleteProviderConfig(r.Context(), &pb.DeleteProviderConfigRequest{ProviderConfigId: id})
		if err != nil {
			writeError(w, http.StatusBadGateway, err)
			return
		}
		if writeProviderError(w, resp.GetError()) {
			return
		}
		writeProtoJSON(w, http.StatusOK, resp)
	case r.Method == http.MethodGet && action == "balance":
		resp, err := s.smsAdminClient.GetProviderBalance(r.Context(), &pb.GetProviderBalanceRequest{ProviderConfigId: id})
		if err != nil {
			writeError(w, http.StatusBadGateway, err)
			return
		}
		if writeProviderError(w, resp.GetError()) {
			return
		}
		writeProtoJSON(w, http.StatusOK, resp)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (s *server) handleSMSActivations(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	resp, err := s.smsAdminClient.ListActivations(r.Context(), &pb.ListActivationsRequest{
		IncludeFinal: queryBool(r, "include_final", false),
		Limit:        int32(queryInt(r, "limit", 100)),
	})
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	if writeProviderError(w, resp.GetError()) {
		return
	}
	writeProtoJSON(w, http.StatusOK, resp)
}

func (s *server) handleSMSActivation(w http.ResponseWriter, r *http.Request) {
	id, action, ok := splitSMSPath(r.URL.Path, "/api/sms/activations/")
	if !ok || action != "cancel" {
		writeError(w, http.StatusNotFound, errors.New("sms activation action not found"))
		return
	}
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var req pb.CancelProviderActivationRequest
	if err := readProtoJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	req.ActivationId = id
	resp, err := s.smsAdminClient.CancelActivation(r.Context(), &req)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	if writeProviderError(w, resp.GetError()) {
		return
	}
	writeProtoJSON(w, http.StatusOK, resp)
}

func splitSMSPath(path, prefix string) (string, string, bool) {
	tail := strings.Trim(strings.TrimPrefix(path, prefix), "/")
	parts := strings.Split(tail, "/")
	if len(parts) == 0 || strings.TrimSpace(parts[0]) == "" {
		return "", "", false
	}
	id, err := url.PathUnescape(parts[0])
	if err != nil || strings.TrimSpace(id) == "" {
		return "", "", false
	}
	action := ""
	if len(parts) > 1 {
		action = strings.TrimSpace(parts[1])
	}
	return strings.TrimSpace(id), action, true
}

func queryBool(r *http.Request, key string, fallback bool) bool {
	value := strings.ToLower(strings.TrimSpace(r.URL.Query().Get(key)))
	if value == "" {
		return fallback
	}
	return value == "true" || value == "1" || value == "yes"
}

func writeProviderError(w http.ResponseWriter, err *pb.ProviderError) bool {
	if err == nil || err.GetPublicError() == nil {
		return false
	}
	message := strings.TrimSpace(err.GetPublicError().GetMessage())
	if message == "" {
		message = err.GetPublicError().GetCode().String()
	}
	writeError(w, http.StatusBadGateway, errors.New(message))
	return true
}
