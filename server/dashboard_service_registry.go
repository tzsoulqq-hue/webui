package main

import (
	"context"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"google.golang.org/protobuf/encoding/prototext"

	"webui/server/pb"
)

type dashboardServiceRegistry struct {
	probes []*pb.DashboardServiceProbe
}

func newDashboardServiceRegistry(cfg *pb.DashboardServiceStatusConfig) *dashboardServiceRegistry {
	if cfg == nil {
		return &dashboardServiceRegistry{}
	}
	return &dashboardServiceRegistry{probes: cfg.GetServices()}
}

func loadDashboardServiceStatusConfig() *pb.DashboardServiceStatusConfig {
	cfg := &pb.DashboardServiceStatusConfig{}
	path := strings.TrimSpace(os.Getenv("DASHBOARD_SERVICE_STATUS_CONFIG_FILE"))
	if path == "" {
		return cfg
	}
	data, err := os.ReadFile(path)
	if err != nil {
		log.Printf("read dashboard service status config: %v", err)
		return cfg
	}
	raw := strings.TrimSpace(string(data))
	if raw == "" {
		return cfg
	}
	if err := parseDashboardServiceStatusConfig(raw, cfg); err != nil {
		log.Printf("parse dashboard service status config: %v", err)
		return &pb.DashboardServiceStatusConfig{}
	}
	return cfg
}

func parseDashboardServiceStatusConfig(raw string, cfg *pb.DashboardServiceStatusConfig) error {
	return (prototext.UnmarshalOptions{DiscardUnknown: true}).Unmarshal([]byte(strings.TrimSpace(raw)), cfg)
}

func (s *server) handleServiceStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	writeProtoJSON(w, http.StatusOK, s.dashboardServices.snapshot(r.Context()))
}

func (r *dashboardServiceRegistry) snapshot(ctx context.Context) *pb.DashboardServiceStatusResponse {
	if r == nil || len(r.probes) == 0 {
		return &pb.DashboardServiceStatusResponse{}
	}
	checkedAt := time.Now().Unix()
	services := make([]*pb.DashboardServiceStatus, len(r.probes))
	var wg sync.WaitGroup
	for index, probe := range r.probes {
		index := index
		probe := probe
		wg.Add(1)
		go func() {
			defer wg.Done()
			services[index] = checkDashboardService(ctx, probe, checkedAt)
		}()
	}
	wg.Wait()
	return &pb.DashboardServiceStatusResponse{Services: services}
}

func checkDashboardService(ctx context.Context, probe *pb.DashboardServiceProbe, checkedAt int64) *pb.DashboardServiceStatus {
	status := &pb.DashboardServiceStatus{
		Name:          strings.TrimSpace(probe.GetName()),
		Status:        pb.DashboardServiceStatusState_DASHBOARD_SERVICE_UNKNOWN,
		CheckedAtUnix: checkedAt,
	}
	target := strings.TrimSpace(probe.GetTarget())
	if status.Name == "" || target == "" {
		status.Status = pb.DashboardServiceStatusState_DASHBOARD_SERVICE_UNAVAILABLE
		status.Message = "missing service name or target"
		return status
	}
	timeout := dashboardProbeTimeout(probe.GetTimeoutMs())
	probeCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	switch dashboardProbeKind(probe) {
	case pb.DashboardServiceProbeKind_DASHBOARD_SERVICE_PROBE_HTTP:
		status.Status, status.Message = checkDashboardHTTP(probeCtx, probe, target)
	default:
		status.Status, status.Message = checkDashboardTCP(probeCtx, target)
	}
	return status
}

func dashboardProbeKind(probe *pb.DashboardServiceProbe) pb.DashboardServiceProbeKind {
	if probe.GetKind() != pb.DashboardServiceProbeKind_DASHBOARD_SERVICE_PROBE_KIND_UNSPECIFIED {
		return probe.GetKind()
	}
	target := strings.TrimSpace(probe.GetTarget())
	if strings.HasPrefix(target, "http://") || strings.HasPrefix(target, "https://") {
		return pb.DashboardServiceProbeKind_DASHBOARD_SERVICE_PROBE_HTTP
	}
	return pb.DashboardServiceProbeKind_DASHBOARD_SERVICE_PROBE_TCP
}

func dashboardProbeTimeout(timeoutMs int32) time.Duration {
	if timeoutMs <= 0 {
		return 1500 * time.Millisecond
	}
	return time.Duration(timeoutMs) * time.Millisecond
}

func checkDashboardHTTP(ctx context.Context, probe *pb.DashboardServiceProbe, target string) (pb.DashboardServiceStatusState, string) {
	method := strings.TrimSpace(probe.GetMethod())
	if method == "" {
		method = http.MethodGet
	}
	req, err := http.NewRequestWithContext(ctx, method, target, nil)
	if err != nil {
		return pb.DashboardServiceStatusState_DASHBOARD_SERVICE_UNAVAILABLE, err.Error()
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return pb.DashboardServiceStatusState_DASHBOARD_SERVICE_UNAVAILABLE, err.Error()
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 200 && resp.StatusCode < 400 {
		return pb.DashboardServiceStatusState_DASHBOARD_SERVICE_AVAILABLE, ""
	}
	return pb.DashboardServiceStatusState_DASHBOARD_SERVICE_UNAVAILABLE, resp.Status
}

func checkDashboardTCP(ctx context.Context, target string) (pb.DashboardServiceStatusState, string) {
	conn, err := (&net.Dialer{}).DialContext(ctx, "tcp", target)
	if err != nil {
		return pb.DashboardServiceStatusState_DASHBOARD_SERVICE_UNAVAILABLE, err.Error()
	}
	_ = conn.Close()
	return pb.DashboardServiceStatusState_DASHBOARD_SERVICE_AVAILABLE, ""
}
