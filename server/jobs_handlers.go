package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"google.golang.org/protobuf/types/known/structpb"

	"webui/server/pb"
)

func (s *server) handleJobs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	limit := int32(queryInt(r, "limit", 100))
	statusValue := strings.TrimSpace(r.URL.Query().Get("status"))
	actionValue := strings.TrimSpace(r.URL.Query().Get("action"))
	jobCtx, jobCancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer jobCancel()
	resp, err := s.jobClient.ListJobs(jobCtx, &pb.ListJobsRequest{
		Limit:     limit,
		Status:    statusValue,
		Action:    actionValue,
		AccountId: strings.TrimSpace(r.URL.Query().Get("account_id")),
		Before:    requestJobListCursor(r),
	})
	mailboxSnapshots := s.listMailboxJobSnapshots(r, limit, statusValue, actionValue)
	if err != nil && len(mailboxSnapshots) == 0 {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	if resp != nil && resp.GetErrorMessage() != "" && len(mailboxSnapshots) == 0 {
		writeError(w, http.StatusBadGateway, errors.New(resp.GetErrorMessage()))
		return
	}
	if requestJobPageResponse(r) {
		if len(mailboxSnapshots) > 0 {
			if resp == nil {
				resp = &pb.ListJobsResponse{}
			}
			resp.Snapshots = mergeJobSnapshotLists(resp.GetSnapshots(), mailboxSnapshots, int(limit))
		}
		writeJSON(w, http.StatusOK, resp)
		return
	}
	var snapshots []*pb.JobSnapshot
	if resp != nil {
		snapshots = resp.GetSnapshots()
	}
	if snapshots == nil {
		snapshots = []*pb.JobSnapshot{}
	}
	snapshots = mergeJobSnapshotLists(snapshots, mailboxSnapshots, int(limit))
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
	if strings.HasPrefix(jobID, "mailbox-") {
		mailboxCtx, mailboxCancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer mailboxCancel()
		resp, err := s.mailboxClient.GetMailboxOperation(mailboxCtx, &pb.GetMailboxOperationRequest{OperationId: jobID})
		if err == nil && resp.GetOperation() != nil {
			writeJSON(w, http.StatusOK, mailboxOperationJobSnapshot(resp.GetOperation()))
			return
		}
		if err == nil && resp.GetErrorMessage() != "" {
			writeError(w, http.StatusNotFound, errors.New(resp.GetErrorMessage()))
			return
		}
		if err != nil {
			writeError(w, http.StatusBadGateway, err)
			return
		}
	}
	jobCtx, jobCancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer jobCancel()
	resp, err := s.jobClient.GetJob(jobCtx, &pb.GetJobRequest{JobId: jobID})
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

func (s *server) listMailboxJobSnapshots(r *http.Request, limit int32, statusValue string, actionValue string) []*pb.JobSnapshot {
	if s.mailboxClient == nil {
		return nil
	}
	if actionValue != "" && !isMailboxJobAction(actionValue) {
		return nil
	}
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	resp, err := s.mailboxClient.ListMailboxOperations(r.Context(), &pb.ListMailboxOperationsRequest{
		Limit:  limit,
		Status: statusValue,
		Action: actionValue,
	})
	if err != nil || resp.GetErrorMessage() != "" {
		return nil
	}
	operations := resp.GetOperations()
	if len(operations) == 0 {
		return nil
	}
	snapshots := make([]*pb.JobSnapshot, 0, len(operations))
	for _, operation := range operations {
		snapshots = append(snapshots, mailboxOperationJobSnapshot(operation))
	}
	return snapshots
}

func isMailboxJobAction(action string) bool {
	switch strings.ToUpper(strings.TrimSpace(action)) {
	case "REGISTER_MAILBOX", "MAILBOX_OAUTH", "FETCH_INBOXES":
		return true
	default:
		return false
	}
}

func mergeJobSnapshotLists(primary []*pb.JobSnapshot, mailbox []*pb.JobSnapshot, limit int) []*pb.JobSnapshot {
	if len(mailbox) == 0 {
		return primary
	}
	merged := append([]*pb.JobSnapshot{}, primary...)
	merged = append(merged, mailbox...)
	sort.SliceStable(merged, func(i, j int) bool {
		return merged[i].GetJob().GetUpdatedAt() > merged[j].GetJob().GetUpdatedAt()
	})
	if limit <= 0 || limit > len(merged) {
		return merged
	}
	return merged[:limit]
}

func mailboxOperationJobSnapshot(operation *pb.MailboxOperation) *pb.JobSnapshot {
	if operation == nil {
		return &pb.JobSnapshot{}
	}
	status := strings.TrimSpace(operation.GetStatus())
	result, _ := structpb.NewStruct(map[string]any{
		"mailbox_count": operation.GetMailboxCount(),
		"fetched_count": operation.GetFetchedCount(),
		"failed_count":  operation.GetFailedCount(),
		"message_count": operation.GetMessageCount(),
		"exit_code":     operation.GetExitCode(),
	})
	job := &pb.Job{
		JobId:        operation.GetOperationId(),
		AccountId:    operation.GetEmailAddress(),
		Action:       operation.GetAction(),
		Status:       status,
		Recoverable:  status == "FAILED_RETRYABLE",
		Retryable:    status == "FAILED_RETRYABLE" || status == "RUNNING",
		LastStep:     operation.GetLastStep(),
		ErrorMessage: operation.GetErrorMessage(),
		Result:       result,
		CreatedAt:    operation.GetCreatedAt(),
		UpdatedAt:    operation.GetUpdatedAt(),
	}
	if operation.GetLastStep() != "" {
		job.Steps = mailboxOperationStepsToJobSteps(operation)
	}
	return &pb.JobSnapshot{
		Job: job,
		Progress: &pb.WorkflowProgress{
			JobId:         operation.GetOperationId(),
			Workflow:      operation.GetAction(),
			StepName:      operation.GetLastStep(),
			Status:        status,
			ErrorMessage:  operation.GetErrorMessage(),
			UpdatedAtUnix: operation.GetUpdatedAt(),
		},
	}
}

func mailboxOperationStepsToJobSteps(operation *pb.MailboxOperation) []*pb.JobStep {
	if operation == nil {
		return nil
	}
	operationSteps := operation.GetSteps()
	if len(operationSteps) == 0 {
		return []*pb.JobStep{{
			StepName:     operation.GetLastStep(),
			Status:       operation.GetStatus(),
			ErrorMessage: operation.GetErrorMessage(),
			StartedAt:    operation.GetCreatedAt(),
			CompletedAt:  operation.GetUpdatedAt(),
		}}
	}
	steps := make([]*pb.JobStep, 0, len(operationSteps))
	for _, step := range operationSteps {
		steps = append(steps, &pb.JobStep{
			StepName:     step.GetStepName(),
			Status:       step.GetStatus(),
			ErrorMessage: step.GetErrorMessage(),
			StartedAt:    step.GetStartedAt(),
			CompletedAt:  step.GetCompletedAt(),
		})
	}
	return steps
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
