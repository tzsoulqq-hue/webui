import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Clock, Copy, Eye, EyeOff, Inbox, KeyRound, ListChecks, Mail, Play, Plus, QrCode, RefreshCcw, Save, Search, ShieldCheck, Trash2, WalletCards, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Account, ConcreteGoPayAddBalanceMethod, ConcreteGoPayPaymentChannel, GPTEmailAllocation, GoPayDashboardStateResponse, InboxResponse, Job, JobEvent, JobSnapshot, Mailbox, MailboxOAuthResponse, MailboxOperation, ManualAddBalanceConfirmResponse, PanelState, Toast, ViewKey, WorkflowTab } from './types';
import { gopayWorkflowActions, gptWorkflowActions, jobStatusOptions, mailboxStatusOptions, mailboxWorkflowActions, runningJobsPollMs, statusOptions } from './constants';
import { CreateAccountForm, AccountDetails, AccountTable } from './accounts';
import { DetailDrawer, NavItem, OpenAIIcon, PanelHeader, PanelNotice, WorkflowDialog } from './common';
import { GoPayStateStatusPanel } from './gopay';
import { JobDetails, JobTable, WorkflowSummary } from './jobs';
import { MailboxDetails, MailboxOperationStrip, MailboxPanel, MailboxStatusStrip } from './mailboxes';
import { accountActivationChannel, actionText, addBalanceMethodLabel, addBalanceMethodValue, aliasesForMailbox, api, authStatus, bansForMailbox, canonicalUiEmail, compactToast, copyText, errorText, formatUnix, goPayAddBalancePayload, goPayPaymentChannelLabel, goPayPaymentUserId, inboxResultForMailbox, isEnvelopeActivation, isManualTransferActivation, isRekberinajaActivation, isRunningSnapshot, jobSnapshotMatchesStatus, latestJobMap, latestOtpForEmail, mailboxContextForEmail, mailboxMatchesFilter, mailboxWorkflowEmail, mask, maskEmail, mergeJobEvents, mergeJobSnapshots, normalizeUiEmail, objectValue, paymentChannelValue, short, statusText, stringValue, loginActionLabel } from './utils';

export default function App() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [jobSnapshots, setJobSnapshots] = useState<JobSnapshot[]>([]);
  const [runningJobSnapshots, setRunningJobSnapshots] = useState<JobSnapshot[]>([]);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [mailboxOperations, setMailboxOperations] = useState<MailboxOperation[]>([]);
  const [gptEmailAllocations, setGptEmailAllocations] = useState<GPTEmailAllocation[]>([]);
  const [activeView, setActiveView] = useState<ViewKey>('accounts');
  const [workflowTab, setWorkflowTab] = useState<WorkflowTab>('all');
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [selectedJobSnapshot, setSelectedJobSnapshot] = useState<JobSnapshot | null>(null);
  const [selectedJobEvents, setSelectedJobEvents] = useState<JobEvent[]>([]);
  const [selectedMailbox, setSelectedMailbox] = useState<Mailbox | null>(null);
  const [accountStatus, setAccountStatus] = useState('');
  const [jobStatus, setJobStatus] = useState('');
  const [mailboxStatus, setMailboxStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [showSecrets, setShowSecrets] = useState(false);
  const [mailboxRegistering, setMailboxRegistering] = useState(false);
  const [mailboxOAuthing, setMailboxOAuthing] = useState('');
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxResponse, setInboxResponse] = useState<InboxResponse | null>(null);
  const [goPayStateStatus, setGoPayStateStatus] = useState<GoPayDashboardStateResponse | null>(null);
  const [goPayStateLoading, setGoPayStateLoading] = useState(false);
  const [refreshingAccessTokenIds, setRefreshingAccessTokenIds] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState('');
  const [nowUnix, setNowUnix] = useState(() => Math.floor(Date.now() / 1000));
  const jobs = jobSnapshots.map((snapshot) => snapshot.job).filter((job): job is Job => !!job);
  const runningJobs = runningJobSnapshots.map((snapshot) => snapshot.job).filter((job): job is Job => !!job);
  const runningJobCount = runningJobs.length;
  const runningAccountIds = new Set(runningJobs.filter((job) => job.account_id).map((job) => job.account_id));
  const runningJobByAccountID = latestJobMap(runningJobs.filter((job) => job.account_id), (job) => job.account_id);
  const runningMailboxJobByEmail = latestJobMap(
    runningJobs.filter((job) => mailboxWorkflowEmail(job)),
    (job) => mailboxWorkflowEmail(job)
  );
  const selectedJob = selectedJobSnapshot?.job || null;
  const selectedJobProgress = selectedJobSnapshot?.progress || null;
  const selectedJobID = selectedJob?.job_id || '';
  const runningJobIDsKey = runningJobs.map((job) => job.job_id).sort().join('|');

  const applyJobSnapshot = useCallback((snapshot: JobSnapshot) => {
    if (!snapshot?.job?.job_id) return;
    setJobSnapshots((prev) => mergeJobSnapshots(prev, snapshot, jobSnapshotMatchesStatus(snapshot, jobStatus)));
    setRunningJobSnapshots((prev) => mergeJobSnapshots(prev, snapshot, isRunningSnapshot(snapshot)));
    setSelectedJobSnapshot((prev) => prev?.job?.job_id === snapshot.job?.job_id ? snapshot : prev);
  }, [jobStatus]);

  const applyJobEvent = useCallback((jobEvent: JobEvent) => {
    if (!jobEvent?.job_id) return;
    if (jobEvent.snapshot) {
      applyJobSnapshot(jobEvent.snapshot);
    }
    if (selectedJobID && jobEvent.job_id === selectedJobID) {
      setSelectedJobEvents((prev) => mergeJobEvents(prev, jobEvent, selectedJobID));
    }
  }, [applyJobSnapshot, selectedJobID]);

  async function refresh() {
    setBusy(true);
    try {
      const [accountsData, jobsData, mailboxesData, allocationsData, runningJobsData, mailboxOperationsData] = await Promise.all([
        api<Account[]>(`/api/accounts?limit=200${accountStatus ? `&status=${accountStatus}` : ''}`),
        api<JobSnapshot[]>(`/api/jobs?limit=200${jobStatus ? `&status=${jobStatus}` : ''}`),
        api<Mailbox[]>('/api/mailboxes?limit=500'),
        api<GPTEmailAllocation[]>('/api/gpt-email-allocations?limit=500'),
        api<JobSnapshot[]>('/api/jobs?limit=200&status=RUNNING'),
        api<MailboxOperation[]>('/api/mailbox-operations?limit=20')
      ]);
      setAccounts(Array.isArray(accountsData) ? accountsData : []);
      setJobSnapshots(Array.isArray(jobsData) ? jobsData : []);
      setRunningJobSnapshots(Array.isArray(runningJobsData) ? runningJobsData : []);
      const nextMailboxes = Array.isArray(mailboxesData) ? mailboxesData : [];
      setMailboxes(nextMailboxes);
      setGptEmailAllocations(Array.isArray(allocationsData) ? allocationsData : []);
      setMailboxOperations(Array.isArray(mailboxOperationsData) ? mailboxOperationsData : []);
      if (selectedJob) {
        await refreshSelectedJob(selectedJob.job_id);
      }
      if (selectedMailbox) {
        const freshMailbox = nextMailboxes.find((mailbox) => mailbox.email_address === selectedMailbox.email_address);
        if (freshMailbox) setSelectedMailbox(freshMailbox);
      }
      if (activeView === 'gopay') {
        await loadGoPayStateStatus(false);
      }
      setLoadError('');
    } catch (err) {
      const message = errorText(err);
      setLoadError(message);
      setToast({ kind: 'error', text: message });
    } finally {
      setBusy(false);
    }
  }

  async function refreshSelectedJob(jobID: string) {
    const snapshot = await api<JobSnapshot>(`/api/jobs/${jobID}`);
    applyJobSnapshot(snapshot);
    setSelectedJobSnapshot(snapshot && snapshot.job ? snapshot : null);
  }

  async function refreshRunningJobs() {
    try {
      const runningJobsData = await api<JobSnapshot[]>('/api/jobs?limit=200&status=RUNNING');
      setRunningJobSnapshots(Array.isArray(runningJobsData) ? runningJobsData : []);
      if (selectedJobID) {
        await refreshSelectedJob(selectedJobID);
      }
    } catch (err) {
      setLoadError(errorText(err));
    }
  }

  async function runAccountWorkflow(label: string, path: string, account: Account) {
    setBusy(true);
    try {
      const resp = await api<any>(path, { method: 'POST', body: JSON.stringify({ account_id: account.account_id }) });
      if (resp.error_message) {
        setToast({ kind: 'error', text: resp.error_message });
      } else {
        setToast({ kind: 'ok', text: `${label} 已提交: ${resp.job_id || 'ok'}` });
        await refresh();
      }
    } catch (err) {
      setToast({ kind: 'error', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  async function copyField(label: string, value: string) {
    const copied = await copyText(value);
    setToast({
      kind: copied ? 'ok' : 'error',
      text: copied ? `${label}已复制` : `${label}复制失败，浏览器拒绝访问剪贴板`
    });
  }

  async function loadGoPayStateStatus(showToast = false) {
    setGoPayStateLoading(true);
    try {
      const resp = await api<GoPayDashboardStateResponse>('/api/gopay/state?user_id=local');
      setGoPayStateStatus(resp);
      if (showToast) {
        setToast(resp.error_message
          ? { kind: 'error', text: resp.error_message }
          : { kind: 'ok', text: 'GoPay state 已刷新' });
      }
    } catch (err) {
      setToast({ kind: 'error', text: errorText(err) });
    } finally {
      setGoPayStateLoading(false);
    }
  }

  async function runGoPayPayment(account: Account, otpChannel: ConcreteGoPayPaymentChannel) {
    setBusy(true);
    try {
      const payload: Record<string, any> = {
        account_id: account.account_id,
        user_id: 'local',
        otp_channel: otpChannel
      };
      const resp = await api<any>('/api/workflows/gopay-payment', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (resp.error_message) {
        setToast({ kind: 'error', text: resp.error_message });
      } else {
        setToast({ kind: 'ok', text: `${goPayPaymentChannelLabel(otpChannel)} 支付已提交: ${resp.job_id || 'ok'}` });
        await refresh();
      }
    } catch (err) {
      setToast({ kind: 'error', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount(account: Account) {
    if (!window.confirm(`删除账号 ${account.email || account.account_id}？`)) return;
    setBusy(true);
    try {
      await api<any>(`/api/accounts/${account.account_id}`, { method: 'DELETE' });
      if (selectedAccount?.account_id === account.account_id) setSelectedAccount(null);
      setToast({ kind: 'ok', text: '账号已删除' });
      await refresh();
    } catch (err) {
      setToast({ kind: 'error', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  async function submitJobOtp(job: Job, otp: string) {
    try {
      const resp = await api<{ success: boolean; job_id: string; error_message?: string }>(`/api/jobs/${job.job_id}/otp`, {
        method: 'POST',
        body: JSON.stringify({ otp })
      });
      if (resp.error_message || !resp.success) {
        setToast({ kind: 'error', text: resp.error_message || 'OTP 提交失败' });
        return;
      }
      setToast({ kind: 'ok', text: `OTP 已提交: ${short(resp.job_id || job.job_id)}` });
      await refresh();
    } catch (err) {
      setToast({ kind: 'error', text: errorText(err) });
      throw err;
    }
  }

  async function confirmManualAddBalance(job: Job) {
    try {
      const resp = await api<ManualAddBalanceConfirmResponse>(`/api/jobs/${job.job_id}/add-balance/confirm`, {
        method: 'POST',
        body: '{}'
      });
      if (resp.error_message || !resp.success) {
        setToast({ kind: 'error', text: resp.error_message || '转账确认失败' });
        return;
      }
      setToast({ kind: 'ok', text: `转账已确认: ${short(resp.job_id || job.job_id)}` });
      await refreshSelectedJob(job.job_id);
    } catch (err) {
      setToast({ kind: 'error', text: errorText(err) });
      throw err;
    }
  }

  async function selectGoPayAddBalance(job: Job, method: ConcreteGoPayAddBalanceMethod) {
    try {
      const resp = await api<ManualAddBalanceConfirmResponse>(`/api/jobs/${job.job_id}/add-balance/select`, {
        method: 'POST',
        body: JSON.stringify({ add_balance: goPayAddBalancePayload(method) })
      });
      if (resp.error_message || !resp.success) {
        setToast({ kind: 'error', text: resp.error_message || '加余额方式选择失败' });
        return;
      }
      setToast({ kind: 'ok', text: `已选择${addBalanceMethodLabel(method)}: ${short(resp.job_id || job.job_id)}` });
      await refreshSelectedJob(job.job_id);
    } catch (err) {
      setToast({ kind: 'error', text: errorText(err) });
      throw err;
    }
  }

  async function retryGoPayPaymentRebind(job: Job) {
    try {
      const result = objectValue(job.result);
      const sourceJobId = job.action === 'GOPAY_PAYMENT_REBIND' ? stringValue(result.source_job_id) : job.job_id;
      const resp = await api<any>('/api/workflows/gopay-payment/rebind', {
        method: 'POST',
        body: JSON.stringify({
          source_job_id: sourceJobId,
          account_id: job.account_id || '',
          user_id: goPayPaymentUserId(job)
        })
      });
      if (resp.error_message) {
        setToast({ kind: 'error', text: resp.error_message });
        return;
      }
      setToast({ kind: 'ok', text: `换绑重试已提交: ${resp.job_id || 'ok'}` });
      await refresh();
    } catch (err) {
      setToast({ kind: 'error', text: errorText(err) });
      throw err;
    }
  }

  async function startMailboxRegistration() {
    setMailboxRegistering(true);
    try {
      const resp = await api<{ started: boolean }>('/api/mailboxes/register', { method: 'POST', body: '{}' });
      setToast({ kind: resp.started ? 'ok' : 'error', text: resp.started ? '手动注册邮箱已启动' : '手动注册邮箱未启动' });
      if (resp.started) await refresh();
    } catch (err) {
      setToast({ kind: 'error', text: errorText(err) });
    } finally {
      setMailboxRegistering(false);
    }
  }

  async function runMailboxOAuth(emailAddress = '') {
    setMailboxOAuthing(emailAddress || '*');
    try {
      const resp = await api<MailboxOAuthResponse>('/api/mailboxes/oauth', {
        method: 'POST',
        body: JSON.stringify({
          email_address: emailAddress,
          only_missing: !emailAddress,
          limit: 100
        })
      });
      if (!resp.started || resp.error_message) {
        setToast({ kind: 'error', text: resp.error_message || 'OAuth 流程启动失败' });
      } else {
        setToast({ kind: 'ok', text: `OAuth 流程已提交: ${short(resp.job_id)}` });
      }
      await refresh();
    } catch (err) {
      setToast({ kind: 'error', text: errorText(err) });
    } finally {
      setMailboxOAuthing('');
    }
  }

  async function fetchMailboxInbox(emailAddress = '') {
    const targetEmail = emailAddress.trim();
    setInboxLoading(true);
    try {
      const resp = await api<InboxResponse>('/api/mailboxes/inbox', {
        method: 'POST',
        body: JSON.stringify({
          limit_per_mailbox: 10,
          max_mailboxes: targetEmail ? 1 : 200,
          email_address: targetEmail
        })
      });
      setInboxResponse(resp);
      const kind = resp.failed_count > 0 ? 'error' : 'ok';
      const banText = resp.ban_count > 0 ? `，封禁 ${resp.ban_count}` : '';
      const scope = targetEmail ? `${showSecrets ? targetEmail : maskEmail(targetEmail)} ` : '';
      const latestOtp = targetEmail ? latestOtpForEmail(resp, mailboxes, targetEmail) : null;
      const otpText = latestOtp
        ? `，OTP ${showSecrets ? latestOtp.otp : mask(latestOtp.otp)}，${formatUnix(latestOtp.received_at_unix)}`
        : '';
      setToast({ kind, text: `${scope}收信完成：${resp.fetched_count}/${resp.mailbox_count} 个邮箱，${resp.message_count} 封邮件${otpText}${banText}` });
      await refresh();
    } catch (err) {
      setToast({ kind: 'error', text: errorText(err) });
    } finally {
      setInboxLoading(false);
    }
  }

  async function deleteMailbox(mailbox: Mailbox) {
    const email = mailbox.email_address;
    if (!email) return;
    const label = showSecrets ? email : maskEmail(email);
    const message = mailbox.is_primary ? `删除主邮箱 ${label} 及其 Alias？` : `删除 Alias ${label}？`;
    if (!window.confirm(message)) return;
    setBusy(true);
    try {
      await api<{ deleted: boolean }>(`/api/mailboxes/${encodeURIComponent(email)}`, { method: 'DELETE' });
      setToast({ kind: 'ok', text: `邮箱已删除: ${label}` });
      if (selectedMailbox?.email_address === email || (mailbox.is_primary && selectedMailbox?.primary_email === email)) {
        closeDetails();
      }
      await refresh();
    } catch (err) {
      setToast({ kind: 'error', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  async function updateAccount(account: Account, payload: { session_token?: string; access_token?: string; activation_channel?: string }, successText: string) {
    setBusy(true);
    try {
      const updated = await api<Account>(`/api/accounts/${account.account_id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      setAccounts((prev) => prev.map((item) => item.account_id === updated.account_id ? updated : item));
      setSelectedAccount(updated);
      setToast({ kind: 'ok', text: successText });
    } catch (err) {
      setToast({ kind: 'error', text: errorText(err) });
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function refreshAccountAccessToken(account: Account) {
    setRefreshingAccessTokenIds((prev) => new Set(prev).add(account.account_id));
    try {
      const updated = await api<Account>(`/api/accounts/${account.account_id}/access-token`, {
        method: 'POST',
        body: '{}'
      });
      setAccounts((prev) => prev.map((item) => item.account_id === updated.account_id ? updated : item));
      if (selectedAccount?.account_id === updated.account_id) setSelectedAccount(updated);
      setToast({ kind: 'ok', text: 'Access Token 已自动获取' });
    } catch (err) {
      setToast({ kind: 'error', text: errorText(err) });
      throw err;
    } finally {
      setRefreshingAccessTokenIds((prev) => {
        const next = new Set(prev);
        next.delete(account.account_id);
        return next;
      });
    }
  }

  useEffect(() => {
    refresh();
  }, [accountStatus, jobStatus]);

  useEffect(() => {
    if (!runningJobIDsKey) {
      return;
    }
    const params = new URLSearchParams();
    runningJobIDsKey.split('|').forEach((jobID) => params.append('job_id', jobID));
    const source = new EventSource(`/api/jobs/events?${params.toString()}`);
    source.addEventListener('job', (event) => {
      const jobEvent = JSON.parse((event as MessageEvent).data) as JobEvent;
      applyJobEvent(jobEvent);
    });
    source.addEventListener('error', (event) => {
      const data = (event as MessageEvent).data;
      if (!data) return;
      try {
        const payload = JSON.parse(data) as { error?: string };
        if (payload.error) setToast({ kind: 'error', text: payload.error });
      } catch {
        setToast({ kind: 'error', text: '工作流事件流解析失败' });
      }
      source.close();
    });
    return () => {
      source.close();
    };
  }, [runningJobIDsKey, applyJobEvent]);

  useEffect(() => {
    if (!runningJobIDsKey) return;
    const id = window.setInterval(() => {
      void refreshRunningJobs();
    }, runningJobsPollMs);
    return () => window.clearInterval(id);
  }, [runningJobIDsKey, selectedJobID]);

  useEffect(() => {
    if (!selectedJobID) {
      setSelectedJobEvents([]);
      return;
    }
    setSelectedJobEvents([]);
    const params = new URLSearchParams();
    params.append('job_id', selectedJobID);
    const source = new EventSource(`/api/jobs/events?${params.toString()}`);
    source.addEventListener('job', (event) => {
      const jobEvent = JSON.parse((event as MessageEvent).data) as JobEvent;
      applyJobEvent(jobEvent);
    });
    source.addEventListener('error', (event) => {
      const data = (event as MessageEvent).data;
      if (!data) return;
      try {
        const payload = JSON.parse(data) as { error?: string };
        if (payload.error) setToast({ kind: 'error', text: payload.error });
      } catch {
        setToast({ kind: 'error', text: '工作流事件流解析失败' });
      }
      source.close();
    });
    return () => {
      source.close();
    };
  }, [selectedJobID, applyJobEvent]);

  useEffect(() => {
    if (!selectedJob || selectedJob.status !== 'RUNNING') return;
    const id = window.setInterval(() => setNowUnix(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [selectedJob?.job_id, selectedJob?.status]);

  useEffect(() => {
    if (activeView !== 'gopay') return;
    void loadGoPayStateStatus(false);
  }, [activeView]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), toast.kind === 'error' ? 6000 : 3500);
    return () => window.clearTimeout(id);
  }, [toast]);

  function selectAccount(account: Account) {
    setSelectedAccount(account);
    setSelectedJobSnapshot(null);
    setSelectedMailbox(null);
  }

  async function selectJob(job: Job) {
    try {
      setSelectedAccount(null);
      setSelectedMailbox(null);
      await refreshSelectedJob(job.job_id);
    } catch (err) {
      setToast({ kind: 'error', text: errorText(err) });
    }
  }

  function selectMailbox(mailbox: Mailbox) {
    setSelectedAccount(null);
    setSelectedJobSnapshot(null);
    setSelectedMailbox(mailbox);
  }

  function closeDetails() {
    setSelectedAccount(null);
    setSelectedJobSnapshot(null);
    setSelectedJobEvents([]);
    setSelectedMailbox(null);
  }

  function openView(view: ViewKey) {
    setActiveView(view);
    closeDetails();
  }

  const primaryMailboxes = mailboxes.filter((mailbox) => mailbox.is_primary);
  const visiblePrimaryMailboxes = primaryMailboxes.filter((mailbox) => mailboxMatchesFilter(mailbox, mailboxes, mailboxStatus));
  const missingOAuthCount = primaryMailboxes.filter((mailbox) => (
    mailbox.password && authStatus(mailbox) !== 'AUTHORIZED' && authStatus(mailbox) !== 'NEEDS_MANUAL_VERIFICATION'
  )).length;
  const oauthMailboxCount = primaryMailboxes.filter((mailbox) => authStatus(mailbox) === 'AUTHORIZED').length;
  const selectedMailboxInbox = selectedMailbox ? inboxResultForMailbox(inboxResponse, selectedMailbox.email_address) : undefined;
  const selectedMailboxBans = selectedMailbox ? bansForMailbox(inboxResponse, selectedMailbox.email_address) : [];
  const selectedMailboxAliases = selectedMailbox ? aliasesForMailbox(mailboxes, selectedMailbox) : [];
  const selectedAccountMailboxContext = selectedAccount ? mailboxContextForEmail(mailboxes, gptEmailAllocations, selectedAccount.email) : null;
  const selectedAccountLatestOtp = selectedAccount ? latestOtpForEmail(inboxResponse, mailboxes, selectedAccount.email) : null;
  const gptWorkflowJobs = jobs.filter((job) => gptWorkflowActions.has(job.action));
  const gopayWorkflowJobs = jobs.filter((job) => gopayWorkflowActions.has(job.action));
  const goPayRebindJobs = gopayWorkflowJobs.filter((job) => job.action === 'GOPAY_PAYMENT_REBIND');
  const mailboxWorkflowJobs = jobs.filter((job) => mailboxWorkflowActions.has(job.action));
  const mailboxRegisterJobs = mailboxWorkflowJobs.filter((job) => job.action === 'REGISTER_MAILBOX');
  const runningMailboxRegisterCount = runningJobs.filter((job) => job.action === 'REGISTER_MAILBOX').length;
  const runningGoPayRebindCount = runningJobs.filter((job) => job.action === 'GOPAY_PAYMENT_REBIND').length;
  const jobsForWorkflowTab = workflowTab === 'gpt'
    ? gptWorkflowJobs
    : workflowTab === 'gopay'
      ? gopayWorkflowJobs
      : workflowTab === 'mailbox'
        ? mailboxWorkflowJobs
        : jobs;
  const latestMailboxRegisterJob = mailboxRegisterJobs[0];
  const latestGoPayRebindJob = goPayRebindJobs[0];
  const panelState: PanelState = {
    loading: busy && accounts.length === 0 && jobs.length === 0 && mailboxes.length === 0,
    error: loadError
  };

  return (
    <main className="shell">
      {toast && <div className={`toast ${toast.kind}`} title={toast.text}>{compactToast(toast.text)}</div>}

      <section className="appFrame">
        <nav className="navRail" aria-label="主导航">
          <NavItem active={activeView === 'accounts'} icon={<OpenAIIcon size={17} />} label="GPT账号" count={accounts.length} countLabel="全部 GPT 账号数" onClick={() => openView('accounts')} />
          <NavItem active={activeView === 'gopay'} icon={<RefreshCcw size={17} />} label="GoPay" count={runningGoPayRebindCount} countLabel="运行中的 GoPay 换绑任务" onClick={() => openView('gopay')} />
          <NavItem active={activeView === 'mailboxes'} icon={<Inbox size={17} />} label="邮箱管理" count={primaryMailboxes.length} countLabel="主邮箱数" onClick={() => openView('mailboxes')} />
          <NavItem active={activeView === 'jobs'} icon={<ListChecks size={17} />} label="工作流" count={runningJobCount} countLabel="运行中的工作流任务" onClick={() => openView('jobs')} />
          <div className="navRailFooter">
            <Button className="secondaryButton navRefresh" onClick={refresh} disabled={busy}>
              <RefreshCcw size={16} /> 刷新
            </Button>
          </div>
        </nav>

        <div className="contentPane">
          <div className="contentStatus">
            {panelState.error && <PanelNotice kind="error" title="数据刷新失败" text={panelState.error} />}
            {panelState.loading && <PanelNotice kind="info" title="正在加载" text="正在刷新账号、邮箱和工作流数据。" />}
          </div>

          {activeView === 'accounts' && (
            <section className="workspace accountsWorkspace">
              <div className="panel accountsPanel">
                <div className="panelToolbar">
                  <div className="headerControls">
                    <Button className="secondaryButton" onClick={() => setShowSecrets((v) => !v)}>
                      {showSecrets ? <EyeOff size={16} /> : <Eye size={16} />}
                      {showSecrets ? '隐藏' : '显示'}
                    </Button>
                    <NativeSelect value={accountStatus} onChange={(e) => setAccountStatus(e.target.value)}>
                      {statusOptions.map((s) => <NativeSelectOption key={s} value={s}>{s ? statusText(s) : '全部状态'}</NativeSelectOption>)}
                    </NativeSelect>
                  </div>
                </div>
                <CreateAccountForm
                  onDone={async (message) => {
                    setToast({ kind: 'ok', text: message });
                    await refresh();
                  }}
                  onError={(message) => setToast({ kind: 'error', text: message })}
                />
                <AccountTable
                  accounts={accounts}
                  jobs={jobs}
                  selected={selectedAccount?.account_id}
                  showSecrets={showSecrets}
                  runningAccountIds={runningAccountIds}
                  runningWorkflowByAccountID={runningJobByAccountID}
                  refreshingAccessTokenIds={refreshingAccessTokenIds}
                  busy={busy}
                  onSelect={selectAccount}
                  onOpenWorkflow={selectJob}
                  onRegister={(account) => runAccountWorkflow('注册账号', '/api/workflows/register', account)}
                  onLogin={(account) => runAccountWorkflow(loginActionLabel(account), '/api/workflows/login', account)}
                  onGoPayPayment={(account, channel) => void runGoPayPayment(account, channel)}
                  onProbeAccount={(account) => runAccountWorkflow('探测账号', '/api/workflows/probe', account)}
                  onRegisterActivate={(account) => runAccountWorkflow('注册并激活', '/api/workflows/register-and-activate', account)}
                  onRefreshAccessToken={refreshAccountAccessToken}
                  onDelete={deleteAccount}
                />
              </div>
            </section>
          )}

          {activeView === 'gopay' && (
            <section className="workspace jobsWorkspace">
              <div className="panel jobsPanel">
                <PanelHeader title="GoPay 换绑" icon={<RefreshCcw size={16} />}>
                  <Button className="secondaryButton" onClick={() => void loadGoPayStateStatus(true)} disabled={goPayStateLoading}>
                    <RefreshCcw size={16} /> {goPayStateLoading ? '刷新中' : '刷新 state'}
                  </Button>
                </PanelHeader>
                <GoPayStateStatusPanel state={goPayStateStatus} loading={goPayStateLoading} />
                <div className="workflowTabToolbar goPayRebindToolbar">
                  <WorkflowSummary
                    job={latestGoPayRebindJob}
                    runningCount={runningGoPayRebindCount}
                    runningTitle={(count) => `${count} 个换绑任务运行中`}
                    runningText="GoPay WA 支付完成后会自动创建换绑任务。"
                    idleTitle="暂无换绑任务"
                    idleText="支付任务不在 GoPay 页展示。"
                  />
                </div>
                <JobTable jobs={goPayRebindJobs} selected={selectedJob?.job_id} emptyText="暂无 GoPay 换绑任务" onSelect={selectJob} onGoPayRebindRetry={retryGoPayPaymentRebind} />
              </div>
            </section>
          )}

          {activeView === 'mailboxes' && (
            <section className="workspace mailboxWorkspace">
              <div className="panel mailboxesPanel">
                <PanelHeader title="邮箱管理" icon={<Mail size={16} />}>
                  <div className="headerControls">
                    <Button className="secondaryButton" onClick={() => runMailboxOAuth()} disabled={busy || !!mailboxOAuthing || missingOAuthCount === 0}>
                      <KeyRound size={16} /> 补 OAuth {missingOAuthCount > 0 ? `(${missingOAuthCount})` : ''}
                    </Button>
                    <Button className="secondaryButton" onClick={() => fetchMailboxInbox()} disabled={busy || inboxLoading || oauthMailboxCount === 0}>
                      <Inbox size={16} /> {inboxLoading ? '拉取中' : `批量收信${oauthMailboxCount > 0 ? ` (${oauthMailboxCount})` : ''}`}
                    </Button>
                    <Button className="secondaryButton" onClick={() => setShowSecrets((v) => !v)}>
                      {showSecrets ? <EyeOff size={16} /> : <Eye size={16} />}
                      {showSecrets ? '隐藏' : '显示'}
                    </Button>
                    <NativeSelect value={mailboxStatus} onChange={(e) => setMailboxStatus(e.target.value)}>
                      {mailboxStatusOptions.map((s) => <NativeSelectOption key={s} value={s}>{s ? statusText(s) : '全部状态'}</NativeSelectOption>)}
                    </NativeSelect>
                  </div>
                </PanelHeader>
                <MailboxOperationStrip operations={mailboxOperations} showSecrets={showSecrets} />
                <MailboxPanel
                  mailboxes={visiblePrimaryMailboxes}
                  allMailboxes={primaryMailboxes}
                  selected={selectedMailbox?.email_address}
                  busy={busy}
                  showSecrets={showSecrets}
                  oauthing={mailboxOAuthing}
                  runningWorkflowByEmail={runningMailboxJobByEmail}
                  onSelect={selectMailbox}
                  onOpenWorkflow={selectJob}
                  onOAuth={runMailboxOAuth}
                  onDelete={deleteMailbox}
                  onDone={async (message) => {
                    setToast({ kind: 'ok', text: message });
                    await refresh();
                  }}
                  onError={(message) => setToast({ kind: 'error', text: message })}
                />
	              </div>
	            </section>
	          )}

	          {activeView === 'jobs' && (
            <section className="workspace jobsWorkspace">
              <div className="panel jobsPanel">
                <PanelHeader title="工作流" icon={<Activity size={16} />}>
                  <NativeSelect value={jobStatus} onChange={(e) => setJobStatus(e.target.value)}>
                    {jobStatusOptions.map((s) => <NativeSelectOption key={s} value={s}>{s ? statusText(s) : '全部状态'}</NativeSelectOption>)}
                  </NativeSelect>
                </PanelHeader>
                <Tabs value={workflowTab} onValueChange={(value) => setWorkflowTab(value as WorkflowTab)} className="workflowTabs">
                  <TabsList className="workflowTabList">
                    <TabsTrigger value="all">全部 {jobs.length}</TabsTrigger>
                    <TabsTrigger value="gpt">GPT账号 {gptWorkflowJobs.length}</TabsTrigger>
                    <TabsTrigger value="gopay">GoPay {gopayWorkflowJobs.length}</TabsTrigger>
                    <TabsTrigger value="mailbox">邮箱 {mailboxWorkflowJobs.length}</TabsTrigger>
                  </TabsList>

                  <TabsContent value="all" className="workflowTabContent">
                    <JobTable jobs={jobsForWorkflowTab} selected={selectedJob?.job_id} emptyText="暂无工作流任务" onSelect={selectJob} onGoPayRebindRetry={retryGoPayPaymentRebind} />
                  </TabsContent>

                  <TabsContent value="gpt" className="workflowTabContent">
                    <JobTable jobs={jobsForWorkflowTab} selected={selectedJob?.job_id} emptyText="暂无 GPT 账号工作流" onSelect={selectJob} onGoPayRebindRetry={retryGoPayPaymentRebind} />
                  </TabsContent>

                  <TabsContent value="gopay" className="workflowTabContent">
                    <JobTable jobs={jobsForWorkflowTab} selected={selectedJob?.job_id} emptyText="暂无 GoPay 工作流" onSelect={selectJob} onGoPayRebindRetry={retryGoPayPaymentRebind} />
                  </TabsContent>

                  <TabsContent value="mailbox" className="workflowTabContent mailboxWorkflowTab">
                    <div className="workflowTabToolbar">
                      <WorkflowSummary
                        job={latestMailboxRegisterJob}
                        runningCount={runningMailboxRegisterCount}
                        runningTitle={(count) => `${count} 个邮箱注册任务运行中`}
                        runningText="邮箱注册器同一时间只跑一个进程。"
                        idleTitle="暂无邮箱注册任务"
                        idleText="还没有启动过邮箱注册。"
                      />
                      <Button className="primaryButton" onClick={startMailboxRegistration} disabled={busy || mailboxRegistering}>
                        <Play size={16} /> {mailboxRegistering ? '启动中' : '启动注册'}
                      </Button>
                    </div>
                    <MailboxStatusStrip mailboxes={primaryMailboxes} />
                    <JobTable jobs={jobsForWorkflowTab} selected={selectedJob?.job_id} emptyText="暂无邮箱工作流" onSelect={selectJob} onGoPayRebindRetry={retryGoPayPaymentRebind} />
                  </TabsContent>
                </Tabs>
              </div>
            </section>
          )}
        </div>
      </section>

      <DetailDrawer open={!!selectedAccount} title="GPT账号详情" onClose={closeDetails}>
        {selectedAccount && (
          <AccountDetails
            account={selectedAccount}
            showSecrets={showSecrets}
            busy={busy}
            inboxLoading={inboxLoading}
            mailboxContext={selectedAccountMailboxContext}
            latestOtp={selectedAccountLatestOtp}
            activationChannel={accountActivationChannel(selectedAccount, jobs)}
            onCopy={copyField}
            onFetchInbox={fetchMailboxInbox}
            onSessionSave={(account, sessionToken) => updateAccount(account, { session_token: sessionToken }, '认证信息已更新')}
            onAccessSave={(account, accessToken) => updateAccount(account, { access_token: accessToken }, '认证信息已更新')}
            onActivationChannelSave={(account, activationChannel) => updateAccount(account, { activation_channel: activationChannel }, '渠道已更新')}
	            onProbeAccount={(account) => runAccountWorkflow('探测账号', '/api/workflows/probe', account)}
	            onLogin={(account) => runAccountWorkflow(loginActionLabel(account), '/api/workflows/login', account)}
            onRefreshAccessToken={refreshAccountAccessToken}
            refreshingAccessToken={refreshingAccessTokenIds.has(selectedAccount.account_id)}
          />
        )}
      </DetailDrawer>

      <WorkflowDialog open={!!selectedJob} onClose={closeDetails}>
        {selectedJob && (
          <JobDetails
            job={selectedJob}
            progress={selectedJobProgress}
            events={selectedJobEvents}
	            nowUnix={nowUnix}
	            onCopy={copyField}
	            onOtpSubmit={submitJobOtp}
	            onManualAddBalanceConfirm={confirmManualAddBalance}
	            onGoPayAddBalanceSelect={selectGoPayAddBalance}
	            onGoPayRebindRetry={retryGoPayPaymentRebind}
	          />
        )}
      </WorkflowDialog>

      <DetailDrawer open={!!selectedMailbox} title="邮箱详情" onClose={closeDetails}>
        {selectedMailbox && (
          <MailboxDetails
            mailbox={selectedMailbox}
            showSecrets={showSecrets}
            inboxResult={selectedMailboxInbox}
            bans={selectedMailboxBans}
            aliases={selectedMailboxAliases}
            inboxLoading={inboxLoading}
            onCopy={copyField}
            onFetchInbox={fetchMailboxInbox}
            onDelete={deleteMailbox}
          />
        )}
      </DetailDrawer>
    </main>
  );
}
