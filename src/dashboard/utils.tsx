import type { Account, AccountMailboxContext, ConcreteGoPayAddBalanceMethod, DisplayLabelMap, GPTEmailAllocation, InboxResponse, Job, JobEvent, JobSnapshot, LatestOtp, Mailbox, MailboxOperation, Step, WorkflowProgress } from './types';
import { accountStatusLabels, actionLabels, emailAllocationStatusLabels, jobStatusLabels, mailboxOperationActionLabels, mailboxStatusLabels, stepLabels } from './constants';

export function isRunningSnapshot(snapshot: JobSnapshot) {
  return snapshot.job?.status === 'RUNNING';
}

export function jobSnapshotMatchesStatus(snapshot: JobSnapshot, status: string) {
  return !status || snapshot.job?.status === status;
}

export function mergeJobSnapshots(prev: JobSnapshot[], snapshot: JobSnapshot, include: boolean) {
  const jobID = snapshot.job?.job_id;
  if (!jobID) return prev;
  const index = prev.findIndex((item) => item.job?.job_id === jobID);
  if (!include) {
    return index === -1 ? prev : prev.filter((item) => item.job?.job_id !== jobID);
  }
  if (index === -1) return [snapshot, ...prev];
  const next = [...prev];
  next[index] = snapshot;
  return next;
}

export function mergeJobEvents(prev: JobEvent[], event: JobEvent, jobID: string) {
  if (!event?.event_id || event.job_id !== jobID) return prev;
  const next = prev.filter((item) => item.event_id !== event.event_id);
  return [event, ...next].sort((a, b) => b.event_id - a.event_id).slice(0, 80);
}

export function statusText(status: string) {
  return accountStatusLabels[status] || jobStatusLabels[status] || emailAllocationStatusLabels[status] || mailboxStatusLabels[status] || status || '-';
}

export function tokenText(mailbox: Mailbox) {
  if (mailbox.refresh_token && authStatus(mailbox) === 'AUTHORIZED') return 'Refresh 可用';
  if (mailbox.refresh_token) return 'Refresh 待验证';
  if (mailbox.access_token) return '仅 Access';
  return '缺 Token';
}

export function actionText(action: string) {
  return actionLabels[action] || action || '-';
}

export function mailboxOperationActionText(action: string) {
  return mailboxOperationActionLabels[action] || actionText(action);
}

export function mailboxOperationMeta(operation: MailboxOperation, showSecrets: boolean) {
  const parts: string[] = [];
  if (operation.email_address) {
    parts.push(showSecrets ? operation.email_address : maskEmail(operation.email_address));
  }
  if (operation.mailbox_count) {
    parts.push(`${operation.mailbox_count} 个邮箱`);
  }
  if (operation.fetched_count || operation.failed_count) {
    parts.push(`成功 ${operation.fetched_count} / 失败 ${operation.failed_count}`);
  }
  if (operation.message_count) {
    parts.push(`${operation.message_count} 封邮件`);
  }
  if (operation.error_message) {
    parts.push(compactCellError(operation.error_message));
  }
  return parts.join(' · ') || '-';
}

export function stepText(step: string) {
  return stepLabels[step] || step || '-';
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

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...init });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || resp.statusText);
  return data as T;
}

export function canRegister(account: Account) {
  return !isUserAlreadyExistsAccount(account) && !hasRegisteredSession(account);
}

export function canAutopay(account: Account) {
  const tier = normalizeTier(account.tier);
  return !isUserAlreadyExistsAccount(account) &&
    account.status !== 'ACTIVATED' &&
    !account.plus_active &&
    account.plus_trial_eligible !== false &&
    (tier === '' || tier === 'free') &&
    (!!account.session_token || !!account.access_token);
}

export function canGoPayPayment(account: Account) {
  return canAutopay(account);
}

export function accountActivationChannel(account: Account, jobs: Job[]) {
  const direct = goPayPaymentChannelLabel(paymentChannelValue(account.activation_channel || ''));
  if (direct !== '-') return direct;

  const latestPaymentJob = jobs
    .filter((job) =>
      job.account_id === account.account_id &&
      (job.action === 'GOPAY_PAYMENT' || job.action === 'ACTIVATE' || job.action === 'AUTOPAY' || job.action === 'REGISTER_AND_ACTIVATE')
    )
    .sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0))[0];
  if (!latestPaymentJob) return '-';

  const result = objectValue(latestPaymentJob.result);
  return goPayPaymentChannelLabel(paymentChannelValue(stringValue(result.otp_channel)));
}

export function paymentChannelValue(value: string): '' | 'gopay_sms' | 'gopay_wa' {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized === 'sms' || normalized === 'gopay_sms' || normalized === 'gopay-sms' || normalized.includes('gopay-sms') || normalized.includes('gopay_sms')) return 'gopay_sms';
  if (normalized === 'wa' || normalized === 'whatsapp' || normalized === 'gopay_wa' || normalized === 'gopay-wa' || normalized.includes('gopay-wa') || normalized.includes('gopay_wa') || normalized.includes('whatsapp')) return 'gopay_wa';
  if (normalized.includes('sms') && normalized.includes('gopay')) return 'gopay_sms';
  if (normalized.includes('wa') && normalized.includes('gopay')) return 'gopay_wa';
  return '';
}

export function goPayAddBalancePayload(method: ConcreteGoPayAddBalanceMethod) {
  if (method === 'rekberinaja') return { rekberinaja: {} };
  if (method === 'envelope') return { envelope: {} };
  return { manual_transfer: {} };
}

export function goPayPaymentChannelLabel(value: string) {
  const channel = paymentChannelValue(value);
  if (channel === 'gopay_sms') return 'Gopay-SMS';
  if (channel === 'gopay_wa') return 'Gopay-WA';
  return '-';
}

export function isManualTransferActivation(value: string) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'manual_transfer' || normalized === 'manual-transfer' || normalized.includes('manual_transfer') || normalized.includes('手动转账');
}

export function isRekberinajaActivation(value: string) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'rekberinaja' || normalized === 'r_platform' || normalized.includes('rekberinaja') || normalized.includes('r平台');
}

export function isEnvelopeActivation(value: string) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'envelope' || normalized === 'claim_envelope' || normalized.includes('envelope') || normalized.includes('红包');
}

export function addBalanceMethodValue(value: string) {
  if (isRekberinajaActivation(value)) return 'rekberinaja';
  if (isEnvelopeActivation(value)) return 'envelope';
  if (isManualTransferActivation(value)) return 'manual_transfer';
  return '';
}

export function addBalanceMethodLabel(value: string) {
  const method = addBalanceMethodValue(value);
  if (method === 'rekberinaja') return 'R平台';
  if (method === 'envelope') return '红包';
  if (method === 'manual_transfer') return '手动转账';
  return '';
}

export function canProbeAccount(account: Account) {
  return !isUserAlreadyExistsAccount(account) && !!account.session_token;
}

export function probeAccountHint(account: Account) {
  if (normalizeTier(account.tier) === 'plus' || account.plus_active) {
    return '已是 Plus，直接探测 Tier';
  }
  if (account.plus_trial_eligible !== undefined && account.plus_trial_eligible !== null) {
    return '资格已探测，直接探测 Tier';
  }
  return '先探测 Plus 资格，再探测 Tier';
}

export function canRefreshAccessToken(account: Account) {
  return !isUserAlreadyExistsAccount(account) && !!account.session_token && !account.access_token;
}

export function canLoginSession(account: Account) {
  return !isUserAlreadyExistsAccount(account) && !!account.email && !!account.password;
}

export function loginActionLabel(account: Account) {
  if (!account.session_token) return '登录获取 Session';
  if (!account.access_token) return '登录刷新 Access Token';
  return '登录刷新 Token';
}

export function loginActionHint(account: Account) {
  if (!account.session_token) return '通过账号密码登录并获取 Session Token';
  if (!account.access_token) return '重新登录并刷新 Access Token';
  return '重新登录并刷新 Session / Access Token';
}

export function buttonHint(label: string) {
  return { title: label, 'aria-label': label, 'data-tooltip': label };
}

export function hasRegisteredSession(account: Account) {
  return account.status === 'REGISTERED' || account.status === 'ACTIVATED' || !!account.session_token || !!account.access_token;
}

export function isUserAlreadyExistsAccount(account: Account) {
  return account.status === 'USER_ALREADY_EXISTS' || account.status === 'EMAIL_ALREADY_EXISTS';
}

export function canSubmitOtp(job: Job) {
  return job.status === 'RUNNING' && (job.action === 'REGISTER' || job.action === 'LOGIN_SESSION' || job.action === 'ACTIVATE' || job.action === 'AUTOPAY' || job.action === 'GOPAY_APP' || job.action === 'GOPAY_PAYMENT' || job.action === 'GOPAY_PAYMENT_REBIND' || job.action === 'REGISTER_AND_ACTIVATE');
}

export function manualAddBalanceView(job: Job) {
  const data = stepResultData(job, 'gopay_app_add_balance');
  if (!data) return null;
  const transfer = objectValue(data.manual_transfer);
  return {
    method: stringValue(data.method),
    status: stringValue(data.status),
    transfer: {
      qr_payload: stringValue(transfer.qr_payload),
      instructions: stringValue(transfer.instructions),
      amount: numberValue(transfer.amount),
      currency: stringValue(transfer.currency) || 'IDR'
    }
  };
}

export function canConfirmManualAddBalance(job: Job, progress: WorkflowProgress | null, balance: ReturnType<typeof manualAddBalanceView>) {
  return !!balance &&
    job.status === 'RUNNING' &&
    job.action === 'GOPAY_PAYMENT' &&
    balance.method === 'manual_transfer' &&
    (progress?.step_name === 'gopay_app_add_balance_confirm' || progress?.step_name === 'gopay_app_add_balance');
}

export function canSelectGoPayAddBalance(job: Job, progress: WorkflowProgress | null, balance: ReturnType<typeof manualAddBalanceView>) {
  return job.status === 'RUNNING' &&
    job.action === 'GOPAY_PAYMENT' &&
    (progress?.step_name === 'gopay_app_add_balance' || job.last_step === 'gopay_app_add_balance') &&
    (!balance?.method || balance.status === 'awaiting_selection');
}

export function canRetryGoPayPaymentRebind(job: Job) {
  const result = objectValue(job.result);
  if (job.action === 'GOPAY_PAYMENT_REBIND') {
    return job.status === 'FAILED_RETRYABLE' || job.status === 'FAILED_RECOVERABLE';
  }
  if (job.action !== 'GOPAY_PAYMENT') return false;
  const paymentCompleted = result.payment_completed === true || String(result.payment_completed || '').toLowerCase() === 'true';
  const hasPayment = !!(stringValue(result.charge_ref) || stringValue(result.snap_token));
  const changePhone = objectValue(result.change_phone);
  const changeComplete = result.change_phone_complete === true || changePhone.change_phone_complete === true;
  return paymentCompleted && hasPayment && !changeComplete && (job.status === 'SUCCEEDED' || job.status === 'FAILED_RECOVERABLE' || job.status === 'FAILED_RETRYABLE');
}

export function goPayPaymentUserId(job: Job) {
  const result = objectValue(job.result);
  return stringValue(result.user_id) || 'local';
}

export function stepResultData(job: Job, stepName: string): any | null {
  const step = (job.steps || []).find((item) => item.step_name === stepName);
  return stepDetailData(step);
}

export function otpSubmitLabel(job: Job) {
  if (job.action === 'LOGIN_SESSION') return '登录 OTP';
  if (job.action === 'GOPAY_APP' || job.action === 'GOPAY_PAYMENT' || job.action === 'GOPAY_PAYMENT_REBIND') return 'GoPay OTP';
  if (job.action === 'ACTIVATE' || job.action === 'AUTOPAY' || (job.action === 'REGISTER_AND_ACTIVATE' && (job.last_step === 'gopay_login' || job.last_step === 'gopay_payment'))) {
    return '支付 OTP';
  }
  return '注册 OTP';
}

export function short(value: string, size = 8) {
  if (!value) return '-';
  return value.length > size ? `${value.slice(0, size)}…` : value;
}

export function mask(value: string) {
  return value ? '••••••••' : '-';
}

export function maskEmail(value: string) {
  if (!value) return '-';
  const [local, domain] = value.split('@');
  if (!local || !domain) return mask(value);
  return `${local.slice(0, 2)}***@${domain}`;
}

export function formatEmailList(values: string[] | undefined, showSecrets: boolean) {
  const list = values || [];
  if (list.length === 0) return '-';
  return list.map((value) => showSecrets ? value : maskEmail(value)).join(', ');
}

export function maskPreview(value: string) {
  return String(value || '-').replace(/\b\d{6}\b/g, '••••••');
}

export function inboxResultForMailbox(response: InboxResponse | null, email: string) {
  const target = normalizeUiEmail(email);
  if (!response || !target) return undefined;
  return (response.results || []).find((result) => {
    if (normalizeUiEmail(result.mailbox?.email_address || '') === target) return true;
    return (result.messages || []).some((message) => (
      normalizeUiEmail(message.mailbox_email) === target ||
      (message.recipients || []).some((recipient) => normalizeUiEmail(recipient) === target)
    ));
  });
}

export function latestOtpForEmail(response: InboxResponse | null, mailboxes: Mailbox[], email: string): LatestOtp | null {
  const target = normalizeUiEmail(email);
  if (!target) return null;
  const candidates: LatestOtp[] = [];
  const mailbox = mailboxes.find((item) => normalizeUiEmail(item.email_address) === target);
  if (mailbox?.latest_otp) {
    candidates.push({
      otp: mailbox.latest_otp,
      subject: mailbox.latest_otp_subject,
      received_at_unix: mailbox.latest_otp_received_at_unix
    });
  }
  const result = inboxResultForMailbox(response, email);
  for (const message of result?.messages || []) {
    const matchesTarget = normalizeUiEmail(message.mailbox_email) === target ||
      (message.recipients || []).some((recipient) => normalizeUiEmail(recipient) === target);
    if (!matchesTarget || !message.otp) continue;
    candidates.push({
      otp: message.otp,
      subject: message.subject,
      received_at_unix: message.received_at_unix
    });
  }
  if (result?.mailbox?.latest_otp && normalizeUiEmail(result.mailbox.email_address) === target) {
    candidates.push({
      otp: result.mailbox.latest_otp,
      subject: result.mailbox.latest_otp_subject,
      received_at_unix: result.mailbox.latest_otp_received_at_unix
    });
  }
  candidates.sort((a, b) => b.received_at_unix - a.received_at_unix);
  return candidates[0] || null;
}

export function mailboxContextForEmail(mailboxes: Mailbox[], allocations: GPTEmailAllocation[], email: string): AccountMailboxContext {
  const accountEmail = normalizeUiEmail(email);
  const mailbox = mailboxes.find((item) => normalizeUiEmail(item.email_address) === accountEmail);
  const allocation = allocationForEmail(allocations, accountEmail);
  const primaryEmail = normalizeUiEmail(allocation?.primary_email || mailbox?.primary_email || canonicalUiEmail(accountEmail));
  return {
    account_email: accountEmail,
    primary_email: primaryEmail,
    is_split: !!accountEmail && !!primaryEmail && accountEmail !== primaryEmail,
    known: !!mailbox || !!allocation
  };
}

export function accountInboxHint(email: string, context: AccountMailboxContext | null, showSecrets: boolean) {
  const accountEmail = showSecrets ? email : maskEmail(email);
  if (context?.is_split) {
    const primaryEmail = showSecrets ? context.primary_email : maskEmail(context.primary_email);
    return `用主邮箱 ${primaryEmail} 拉取收件箱，按分裂邮箱 ${accountEmail} 匹配 OTP`;
  }
  return `拉取当前账号邮箱 ${accountEmail} 的最新 OTP`;
}

export function bansForMailbox(response: InboxResponse | null, email: string) {
  const target = normalizeUiEmail(email);
  if (!response || !target) return [];
  return (response.bans || []).filter((ban) => (
    normalizeUiEmail(ban.mailbox_email) === target ||
    normalizeUiEmail(ban.email_address) === target
  ));
}

export function aliasesForMailbox(mailboxes: Mailbox[], mailbox: Mailbox) {
  const primary = normalizeUiEmail(mailbox.is_primary ? mailbox.email_address : mailbox.primary_email);
  if (!primary) return [];
  return mailboxes
    .filter((item) => !item.is_primary && normalizeUiEmail(item.primary_email) === primary)
    .sort((a, b) => b.updated_at - a.updated_at);
}

export function countAllocatableEmailAllocations(allocations: GPTEmailAllocation[]) {
  return allocations.filter((allocation) => (
    allocation.status === 'AVAILABLE' ||
    (allocation.is_primary && allocation.status === 'REGISTERED' && allocation.splittable)
  )).length;
}

export function mailboxMatchesFilter(mailbox: Mailbox, allMailboxes: Mailbox[], filter: string) {
  if (!filter) return true;
  const aliases = aliasesForMailbox(allMailboxes, mailbox);
  return authStatus(mailbox) === filter || aliases.some((alias) => authStatus(alias) === filter);
}

export function allocationForEmail(allocations: GPTEmailAllocation[], email: string) {
  const target = normalizeUiEmail(email);
  if (!target) return undefined;
  return allocations.find((allocation) => normalizeUiEmail(allocation.email) === target);
}

export function authStatus(mailbox: Mailbox) {
  const value = String(mailbox.auth_status || '').trim();
  if (value) return value;
  if (mailbox.refresh_token) return 'AUTHORIZED';
  return 'OAUTH_PENDING';
}

export function normalizeUiEmail(value: string) {
  return String(value || '').trim().toLowerCase();
}

export function canonicalUiEmail(value: string) {
  const normalized = normalizeUiEmail(value);
  const [local, domain] = normalized.split('@');
  if (!local || !domain) return normalized;
  return `${local.split('+')[0]}@${domain}`;
}

export function formatUnix(value: number) {
  return value ? new Date(value * 1000).toLocaleString() : '-';
}

export function formatJobTime(value: string | number) {
  if (!value) return '-';
  if (typeof value === 'number') return formatUnix(value);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function stepDuration(step: Step, nowUnix?: number) {
  if (!step.started_at) return null;
  const end = step.completed_at || nowUnix || Math.floor(Date.now() / 1000);
  const seconds = Math.max(0, end - step.started_at);
  if (seconds < 1) return <small className="stepTime">刚刚</small>;
  if (seconds < 60) return <small className="stepTime">{seconds}s</small>;
  return <small className="stepTime">{Math.floor(seconds / 60)}m {seconds % 60}s</small>;
}

export function eventTime(event: JobEvent) {
  const snapshot = event.snapshot;
  const updated = snapshot?.progress?.updated_at_unix || snapshot?.job?.updated_at || 0;
  return formatUnix(updated);
}

export function stepProgressText(step: Step, workflowProgress?: WorkflowProgress | null) {
  const data = stepDetailData(step);
  if (data && typeof data === 'object') {
    const record = data as Record<string, any>;
    const progress = record.progress && typeof record.progress === 'object' ? record.progress as Record<string, any> : {};
    const message = stringValue(record.progress_message) || stringValue(progress.message);
    if (message) {
      const atUnix = numberValue(record.progress_at_unix) || numberValue(progress.at_unix);
      return atUnix ? `${message} · ${formatUnix(atUnix)}` : message;
    }
  }
  if (!workflowProgress || workflowProgress.step_name !== step.step_name) return '';
  const message = workflowProgress.error_message || statusText(workflowProgress.status.toUpperCase());
  if (!message) return '';
  return workflowProgress.updated_at_unix ? `${message} · ${formatUnix(workflowProgress.updated_at_unix)}` : message;
}

export function trialText(value?: boolean) {
  if (value === true) return '0元试用';
  if (value === false) return '非0元';
  return '未知';
}

export function plusText(account: Account) {
  return trialText(account.plus_trial_eligible);
}

export function tierEligibilityText(account: Account) {
  const tier = tierText(account.tier);
  if (accountIsActivated(account)) return tier;
  return `${tier} / ${plusText(account)}`;
}

export function tierText(tier: string) {
  return normalizeTier(tier) || '未知';
}

export function accountIsActivated(account: Account) {
  return account.status === 'ACTIVATED' || account.plus_active === true;
}

export function normalizeTier(tier: string) {
  return String(tier || '').trim().toLowerCase();
}

export function errorText(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

export function compactToast(value: string) {
  const text = String(value || '');
  return text.length > 150 ? `${text.slice(0, 150)}...` : text;
}

export function compactCellError(value: string) {
  const text = String(value || '-');
  return text.length > 24 ? `${text.slice(0, 24)}...` : text;
}

export function formatJSON(value: unknown) {
	try {
		return typeof value === 'string' ? JSON.stringify(JSON.parse(value), null, 2) : JSON.stringify(value, null, 2);
	} catch {
		return String(value ?? '');
	}
}

export function stepDetailData(step?: Step): Record<string, any> | null {
  if (!step?.detail || typeof step.detail !== 'object') return null;
  return step.detail as Record<string, any>;
}

export function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

export function objectValue(value: unknown): Record<string, any> {
  return value && typeof value === 'object' ? value as Record<string, any> : {};
}

export function numberValue(value: unknown) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function latestJobMap(jobs: Job[], keyOf: (job: Job) => string) {
  const map = new Map<string, Job>();
  for (const job of jobs) {
    const key = keyOf(job);
    if (!key) continue;
    const previous = map.get(key);
    if (!previous || (job.updated_at || 0) > (previous.updated_at || 0)) {
      map.set(key, job);
    }
  }
  return map;
}

export function mailboxWorkflowEmail(job: Job) {
  if (job.action !== 'MAILBOX_OAUTH') return '';
  const candidates = [objectValue(job.result)];
  for (const step of job.steps || []) {
    const detail = stepDetailData(step);
    if (detail) candidates.push(detail);
  }
  for (const data of candidates) {
    const email = normalizeUiEmail(stringValue(data.email_address));
    if (email) return email;
  }
  return '';
}

export async function copyText(value: string): Promise<boolean> {
  if (!value) return false;
  if (!window.isSecureContext || !navigator.clipboard?.writeText) {
    return copyTextFallback(value);
  }
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return copyTextFallback(value);
  }
}

export function copyTextFallback(value: string): boolean {
  const text = String(value || '');
  if (!text) return false;

  let handledCopyEvent = false;
  const copyHandler = (event: ClipboardEvent) => {
    if (!event.clipboardData) return;
    event.clipboardData.setData('text/plain', text);
    event.preventDefault();
    handledCopyEvent = true;
  };
  try {
    document.addEventListener('copy', copyHandler);
    if (document.execCommand('copy') && handledCopyEvent) {
      return true;
    }
  } catch {
    // Fall through to textarea-based copy for older browsers.
  } finally {
    document.removeEventListener('copy', copyHandler);
  }

  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const container = activeElement?.closest<HTMLElement>('[data-slot="sheet-content"], [role="dialog"]') || document.body;
  let textarea: HTMLTextAreaElement | null = null;
  try {
    textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.left = '0';
    textarea.style.width = '1px';
    textarea.style.height = '1px';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    textarea.style.fontSize = '16px';
    container.appendChild(textarea);
    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const copied = document.execCommand('copy');
    return copied;
  } catch {
    return false;
  } finally {
    if (textarea?.parentNode) {
      textarea.parentNode.removeChild(textarea);
    }
    try {
      activeElement?.focus({ preventScroll: true });
    } catch {
      activeElement?.focus();
    }
  }
}
