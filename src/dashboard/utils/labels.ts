import type { DisplayLabelMap } from '../types';

const statusLabels: DisplayLabelMap = {
  RUNNING: '运行中',
  SUCCEEDED: '成功',
  FAILED_RETRYABLE: '失败',
  FAILED_RECOVERABLE: '失败，需处理',
  FAILED_FINAL: '最终失败'
};

export function statusText(status: string) {
  return statusLabels[status] || status || '-';
}

export function actionText(action: string) {
  return action || '-';
}

export function stepText(step: string) {
  return step || '-';
}

export function eventText(eventType: string) {
  const labels: DisplayLabelMap = {
    job_created: '创建',
    job_updated: '更新',
    job_step_started: '步骤开始',
    job_step_progress: '步骤进度',
    job_step_completed: '步骤完成'
  };
  return labels[eventType] || eventType || '事件';
}
