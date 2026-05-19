import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Clock, Copy, Eye, EyeOff, Inbox, KeyRound, ListChecks, Mail, Play, Plus, QrCode, RefreshCcw, Save, Search, ShieldCheck, Trash2, WalletCards, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { BanDetection, InboxResult, Job, Mailbox, MailboxDetailTab, MailboxOperation } from './types';
import { EmptyBlock, EmptyTableRow, KV, StatusBadge } from './common';
import { LinkedWorkflowButton } from './jobs';
import { actionText, aliasesForMailbox, api, authStatus, buttonHint, compactCellError, compactToast, errorText, formatEmailList, formatJobTime, formatUnix, latestOtpForEmail, mailboxOperationActionText, mailboxOperationMeta, mask, maskEmail, maskPreview, normalizeUiEmail, short, statusText, stepText, tokenText } from './utils';

export function MailboxPanel({ mailboxes, allMailboxes, selected, busy, showSecrets, oauthing, runningWorkflowByEmail, onSelect, onOpenWorkflow, onOAuth, onDelete, onDone, onError }: {
  mailboxes: Mailbox[];
  allMailboxes: Mailbox[];
  selected?: string;
  busy: boolean;
  showSecrets: boolean;
  oauthing: string;
  runningWorkflowByEmail: Map<string, Job>;
  onSelect: (mailbox: Mailbox) => void;
  onOpenWorkflow: (job: Job) => void;
  onOAuth: (emailAddress?: string) => Promise<void>;
  onDelete: (mailbox: Mailbox) => Promise<void>;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [form, setForm] = useState({ email: '', password: '', refresh_token: '', access_token: '' });
  const [batchText, setBatchText] = useState('');
  const [importMode, setImportMode] = useState<'single' | 'batch'>('single');
  const [working, setWorking] = useState(false);
  const [showImport, setShowImport] = useState(false);

  function update(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function saveMailbox() {
    setWorking(true);
    try {
      const resp = await api<Mailbox>('/api/mailboxes', { method: 'POST', body: JSON.stringify(form) });
      setForm({ email: '', password: '', refresh_token: '', access_token: '' });
      onDone(`邮箱已入池: ${resp.email_address}`);
    } catch (err) {
      onError(errorText(err));
    } finally {
      setWorking(false);
    }
  }

  async function saveBatchMailboxes() {
    const batch = parseMailboxBatch(batchText);
    if (batch.items.length === 0) {
      onError(batch.errors.length > 0 ? `批量入池失败：${batch.errors[0]}` : '没有可入池邮箱');
      return;
    }

    setWorking(true);
    let success = 0;
    const failures = [...batch.errors];
    try {
      for (const item of batch.items) {
        try {
          await api<Mailbox>('/api/mailboxes', {
            method: 'POST',
            body: JSON.stringify({
              email: item.email,
              password: item.password,
              refresh_token: '',
              access_token: ''
            })
          });
          success += 1;
        } catch (err) {
          failures.push(`${item.email}: ${errorText(err)}`);
        }
      }
      if (success > 0) {
        setBatchText('');
        const failureText = failures.length > 0 ? `，失败 ${failures.length}: ${failures.slice(0, 3).join('；')}${failures.length > 3 ? '；...' : ''}` : '';
        onDone(`批量入池成功 ${success}${failureText}`);
        return;
      }
      onError(`批量入池失败：${failures.slice(0, 3).join('；')}`);
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <MailboxStatusStrip mailboxes={allMailboxes} />
      <div className="mailboxImportHeader">
        <div>
          <strong>主邮箱列表</strong>
          <span>{mailboxes.length === allMailboxes.length ? `${allMailboxes.length} 个主邮箱` : `显示 ${mailboxes.length} / ${allMailboxes.length} 个主邮箱`}</span>
        </div>
        <Button className="secondaryButton" onClick={() => setShowImport((value) => !value)}>
          {showImport ? <X size={15} /> : <Plus size={15} />}
          {showImport ? '收起导入' : '导入邮箱'}
        </Button>
      </div>
      {showImport && (
        <div className="mailboxForm">
          <div className="mailboxImportMode">
            <Button className={`secondaryButton ${importMode === 'single' ? 'active' : ''}`} onClick={() => setImportMode('single')}>单个</Button>
            <Button className={`secondaryButton ${importMode === 'batch' ? 'active' : ''}`} onClick={() => setImportMode('batch')}>批量</Button>
          </div>
          {importMode === 'single' ? (
            <>
              <Input placeholder="邮箱" value={form.email} onChange={(e) => update('email', e.target.value)} />
              <Input placeholder="邮箱密码，可空" type="password" value={form.password} onChange={(e) => update('password', e.target.value)} />
              <Input placeholder="Refresh token，可空" type="password" value={form.refresh_token} onChange={(e) => update('refresh_token', e.target.value)} />
              <Input placeholder="Access token，可空" type="password" value={form.access_token} onChange={(e) => update('access_token', e.target.value)} />
              <Button onClick={saveMailbox} disabled={busy || working || !form.email.trim()}><Plus size={15} /> 入池</Button>
            </>
          ) : (
            <>
              <Textarea
                className="mailboxBatchInput"
                placeholder="account@example.com----password"
                value={batchText}
                onChange={(event) => setBatchText(event.target.value)}
              />
              <Button onClick={() => void saveBatchMailboxes()} disabled={busy || working || !batchText.trim()}><Plus size={15} /> 批量入池</Button>
            </>
          )}
        </div>
      )}
      <div className="tableWrap">
        <Table className="responsiveTable mailboxTable">
          <TableHeader>
            <TableRow><TableHead>主邮箱</TableHead><TableHead>最近邮件</TableHead><TableHead>认证状态</TableHead><TableHead>更新</TableHead><TableHead>错误</TableHead><TableHead>操作</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {mailboxes.length === 0 && <EmptyTableRow colSpan={6} text="暂无符合筛选条件的主邮箱。" />}
            {mailboxes.map((mailbox) => {
              const isOAuthing = oauthing === mailbox.email_address || oauthing === '*';
              const canOAuth = mailbox.is_primary && !!mailbox.password;
              const oauthLabel = authStatus(mailbox) === 'AUTHORIZED' ? '重新 OAuth' : '补 OAuth';
              const currentWorkflow = runningWorkflowByEmail.get(normalizeUiEmail(mailbox.email_address));
              const errorText = mailbox.last_error || '-';
              return (
                <TableRow key={mailbox.email_address} className={selected === mailbox.email_address ? 'selected' : ''} onClick={() => onSelect(mailbox)}>
                  <TableCell data-label="主邮箱">
                    <div className="cellStack">
                      <span>{showSecrets ? mailbox.email_address : maskEmail(mailbox.email_address)}</span>
                      <small>{mailbox.primary_email || '-'}</small>
                    </div>
                  </TableCell>
                  <TableCell data-label="最近邮件"><MailboxActivityCell mailbox={mailbox} showSecrets={showSecrets} /></TableCell>
                  <TableCell data-label="认证状态"><StatusBadge status={authStatus(mailbox)} /></TableCell>
                  <TableCell data-label="更新">{formatUnix(mailbox.updated_at)}</TableCell>
                  <TableCell data-label="错误" className="mailboxErrorCell" title={errorText}>
                    <span>{compactCellError(errorText)}</span>
                  </TableCell>
                  <TableCell data-label="操作">
                    <div className="rowActions" onClick={(event) => event.stopPropagation()}>
                      {currentWorkflow ? (
                        <LinkedWorkflowButton job={currentWorkflow} onOpen={onOpenWorkflow} />
                      ) : canOAuth ? (
                        <Button className="rowButtonText" {...buttonHint(isOAuthing ? 'OAuth 提交中' : `${oauthLabel}：${showSecrets ? mailbox.email_address : maskEmail(mailbox.email_address)}`)} disabled={busy || !!oauthing} onClick={() => onOAuth(mailbox.email_address)}>
                          <KeyRound size={14} /> {isOAuthing ? '提交中' : oauthLabel}
                        </Button>
                      ) : (
                        <span className="muted">-</span>
                      )}
                      <Button className="iconButton dangerButton" {...buttonHint('删除邮箱')} disabled={busy || !!oauthing} onClick={() => onDelete(mailbox)}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

type MailboxBatchItem = {
  email: string;
  password: string;
};

function parseMailboxBatch(value: string) {
  const items: MailboxBatchItem[] = [];
  const errors: string[] = [];
  value.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    const delimiterIndex = line.indexOf('----');
    if (delimiterIndex < 0) {
      errors.push(`第 ${index + 1} 行缺少 ----`);
      return;
    }
    const email = line.slice(0, delimiterIndex).trim();
    const password = line.slice(delimiterIndex + 4).trim();
    if (!email) {
      errors.push(`第 ${index + 1} 行缺少账号`);
      return;
    }
    items.push({ email, password });
  });
  return { items, errors };
}

export function MailboxOperationStrip({ operations, showSecrets }: {
  operations: MailboxOperation[];
  showSecrets: boolean;
}) {
  const recent = operations.slice(0, 4);
  if (recent.length === 0) return null;
  return (
    <div className="mailboxOperationStrip">
      {recent.map((operation) => (
        <div className="mailboxOperationItem" key={operation.operation_id}>
          <div>
            <strong>{mailboxOperationActionText(operation.action)}</strong>
            <span>{statusText(operation.status)} · {stepText(operation.last_step)} · {formatUnix(operation.updated_at)}</span>
          </div>
          <small title={operation.error_message || mailboxOperationMeta(operation, true)}>
            {mailboxOperationMeta(operation, showSecrets)}
          </small>
        </div>
      ))}
    </div>
  );
}

function MailboxInboxSection({ mailbox, result, bans, showSecrets, loading, onFetch }: {
  mailbox: Mailbox;
  result?: InboxResult;
  bans: BanDetection[];
  showSecrets: boolean;
  loading: boolean;
  onFetch: (emailAddress?: string) => Promise<void>;
}) {
  const messages = result?.messages || [];
  return (
    <section className="drawerInbox">
      <div className="sectionTitle">
        <h3>收件箱</h3>
        <Button disabled={loading} onClick={() => onFetch(mailbox.email_address)}>
          <Inbox size={14} /> {loading ? '拉取中' : '拉取当前邮箱'}
        </Button>
      </div>
      {result?.error_message && <div className="inboxError">{compactToast(result.error_message)}</div>}
      {!!bans.length && <BanResults bans={bans} showSecrets={showSecrets} />}
      <div className="drawerInboxList">
        {messages.map((message, index) => (
          <article className="inboxMessage" key={`${message.mailbox_email}-${message.id || index}`}>
            <div className="inboxMessageHeader">
              <strong title={message.subject}>{message.subject || '-'}</strong>
              <span>{formatUnix(message.received_at_unix)}</span>
            </div>
            <div className="inboxMessageMeta">
              <span>发件人 {showSecrets ? (message.from_address || '-') : maskEmail(message.from_address)}</span>
              {message.otp && <em>OTP {showSecrets ? message.otp : mask(message.otp)}</em>}
            </div>
            <div className="recipientLine" title={formatEmailList(message.recipients, true)}>
              收件人 {formatEmailList(message.recipients, showSecrets)}
            </div>
            <p>{showSecrets ? (message.body_preview || '-') : maskPreview(message.body_preview || '-')}</p>
          </article>
        ))}
        {!result && <div className="inboxEmpty">点击“拉取当前邮箱”后显示当前邮箱的邮件。</div>}
        {result && !result.error_message && messages.length === 0 && <div className="inboxEmpty">当前邮箱没有新邮件。</div>}
      </div>
    </section>
  );
}

function LatestOtpLine({ mailbox, showSecrets }: {
  mailbox: Mailbox;
  showSecrets: boolean;
}) {
  if (!mailbox.latest_otp) return null;
  const value = showSecrets ? mailbox.latest_otp : mask(mailbox.latest_otp);
  const title = showSecrets ? (mailbox.latest_otp_subject || 'Latest OTP') : maskPreview(mailbox.latest_otp_subject || 'Latest OTP');
  return (
    <small className="latestOtp" title={title}>
      OTP {value} · {formatUnix(mailbox.latest_otp_received_at_unix)}
    </small>
  );
}

function MailboxActivityCell({ mailbox, showSecrets }: {
  mailbox: Mailbox;
  showSecrets: boolean;
}) {
  if (!mailbox.latest_otp) return <span className="muted">-</span>;
  const subject = showSecrets ? (mailbox.latest_otp_subject || '-') : maskPreview(mailbox.latest_otp_subject || '-');
  return (
    <div className="mailActivity">
      <LatestOtpLine mailbox={mailbox} showSecrets={showSecrets} />
      <small title={subject}>{subject}</small>
    </div>
  );
}

function BanResults({ bans, showSecrets }: {
  bans: BanDetection[];
  showSecrets: boolean;
}) {
  return (
    <div className="banStrip">
      {bans.map((ban, index) => (
        <div key={`${ban.email_address}-${ban.account_id}-${index}`}>
          <strong>{showSecrets ? ban.email_address : maskEmail(ban.email_address)}</strong>
          <span>{ban.account_updated ? '已标记 DEACTIVATED' : (ban.error_message || '未更新')}</span>
        </div>
      ))}
    </div>
  );
}

export function MailboxStatusStrip({ mailboxes }: { mailboxes: Mailbox[] }) {
  const authItems = ['AUTHORIZED', 'OAUTH_PENDING', 'AUTH_FAILED', 'NEEDS_MANUAL_VERIFICATION'];
  return (
    <div className="mailboxStatusStrip" aria-label="邮箱状态汇总">
      <div className="statusStripGroup">
        <h4>OAuth 状态</h4>
        <div className="statusStripGrid">
          {authItems.map((status) => (
            <div key={status}>
              <strong>{mailboxes.filter((mailbox) => authStatus(mailbox) === status).length}</strong>
              <span>{statusText(status)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MailboxAliasesSection({ aliases, showSecrets, onDelete }: {
  aliases: Mailbox[];
  showSecrets: boolean;
  onDelete: (mailbox: Mailbox) => Promise<void>;
}) {
  return (
    <section className="aliasSection">
      <div className="sectionTitle">
        <h3>Alias</h3>
        <span className="muted">{aliases.length}</span>
      </div>
      <div className="aliasList">
        {aliases.map((alias) => (
          <div className="aliasItem" key={alias.email_address}>
            <div className="aliasIdentity">
              <strong>{showSecrets ? alias.email_address : maskEmail(alias.email_address)}</strong>
              <span><StatusBadge status={authStatus(alias)} /></span>
            </div>
            <MailboxActivityCell mailbox={alias} showSecrets={showSecrets} />
            <Button className="iconButton dangerButton" {...buttonHint('删除 Alias')} onClick={() => onDelete(alias)}>
              <Trash2 size={14} />
            </Button>
          </div>
        ))}
        {aliases.length === 0 && <div className="inboxEmpty">暂无 Alias 邮箱。</div>}
      </div>
    </section>
  );
}

export function MailboxDetails({ mailbox, showSecrets, inboxResult, bans, aliases, inboxLoading, onCopy, onFetchInbox, onDelete }: {
  mailbox: Mailbox;
  showSecrets: boolean;
  inboxResult?: InboxResult;
  bans: BanDetection[];
  aliases: Mailbox[];
  inboxLoading: boolean;
  onCopy: (label: string, value: string) => void;
  onFetchInbox: (emailAddress?: string) => Promise<void>;
  onDelete: (mailbox: Mailbox) => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<MailboxDetailTab>('overview');
  const inboxMessageCount = inboxResult?.messages?.length || 0;

  useEffect(() => {
    setActiveTab('overview');
  }, [mailbox.email_address]);

  return (
    <div className="details mailboxDetailView">
      <nav className="mailboxDetailTabs" aria-label="邮箱详情">
        <Button className={activeTab === 'overview' ? 'active' : ''} onClick={() => setActiveTab('overview')}>概览</Button>
        <Button className={activeTab === 'aliases' ? 'active' : ''} onClick={() => setActiveTab('aliases')}>Alias <span>{aliases.length}</span></Button>
        <Button className={activeTab === 'inbox' ? 'active' : ''} onClick={() => setActiveTab('inbox')}>收件箱 <span>{inboxMessageCount}</span></Button>
      </nav>

      {activeTab === 'overview' && (
        <section className="mailboxTabPanel">
          <div className="mailboxSummary">
            <div className="mailboxSummaryHead">
              <div>
                <span>{mailbox.is_primary ? '主邮箱' : 'Alias'}</span>
                <strong>{showSecrets ? mailbox.email_address : maskEmail(mailbox.email_address)}</strong>
              </div>
              <div className="summaryBadges">
                <StatusBadge status={authStatus(mailbox)} />
              </div>
            </div>
            <div className="latestOtpPanel">
              <span>最近 OTP</span>
              <strong className="mono">{showSecrets ? (mailbox.latest_otp || '-') : mask(mailbox.latest_otp)}</strong>
              <em>{formatUnix(mailbox.latest_otp_received_at_unix)}</em>
            </div>
          </div>
          <h3>邮箱</h3>
          <KV label="邮箱" value={showSecrets ? mailbox.email_address : maskEmail(mailbox.email_address)} copyValue={mailbox.email_address} copyDisabled={!mailbox.email_address} masked={!showSecrets} onCopy={onCopy} />
          <KV label="密码" value={showSecrets ? mailbox.password : mask(mailbox.password)} copyValue={mailbox.password} copyDisabled={!mailbox.password} masked={!showSecrets} mono onCopy={onCopy} />
          <KV label="OAuth" value={statusText(authStatus(mailbox))} onCopy={onCopy} />
          <KV label="Token" value={tokenText(mailbox)} onCopy={onCopy} />
          <KV label="Alias 数" value={String(aliases.length)} onCopy={onCopy} />
          <KV label="主邮箱" value={showSecrets ? (mailbox.primary_email || '-') : maskEmail(mailbox.primary_email)} copyValue={mailbox.primary_email || '-'} copyDisabled={!mailbox.primary_email} masked={!showSecrets} onCopy={onCopy} />
          <KV label="Refresh" value={showSecrets ? mailbox.refresh_token : mask(mailbox.refresh_token)} copyValue={mailbox.refresh_token} copyDisabled={!mailbox.refresh_token} masked={!showSecrets} mono onCopy={onCopy} />
          <KV label="Access" value={showSecrets ? mailbox.access_token : mask(mailbox.access_token)} copyValue={mailbox.access_token} copyDisabled={!mailbox.access_token} masked={!showSecrets} mono onCopy={onCopy} />
          <KV label="最近 OTP" value={showSecrets ? mailbox.latest_otp : mask(mailbox.latest_otp)} copyValue={mailbox.latest_otp} copyDisabled={!mailbox.latest_otp} masked={!showSecrets} mono onCopy={onCopy} />
          <KV label="OTP 时间" value={formatUnix(mailbox.latest_otp_received_at_unix)} onCopy={onCopy} />
          <KV label="创建时间" value={formatUnix(mailbox.created_at)} onCopy={onCopy} />
          <KV label="更新时间" value={formatUnix(mailbox.updated_at)} onCopy={onCopy} />
          <KV label="错误" value={mailbox.last_error || '-'} onCopy={onCopy} />
          <div className="buttonRow detailActions">
            <Button className="dangerButton" onClick={() => onDelete(mailbox)}>
              <Trash2 size={14} /> {mailbox.is_primary ? '删除主邮箱' : '删除 Alias'}
            </Button>
          </div>
        </section>
      )}

      {activeTab === 'aliases' && (
        <div className="mailboxTabPanel">
          <MailboxAliasesSection aliases={aliases} showSecrets={showSecrets} onDelete={onDelete} />
        </div>
      )}

      {activeTab === 'inbox' && (
        <div className="mailboxTabPanel">
          <MailboxInboxSection
            mailbox={mailbox}
            result={inboxResult}
            bans={bans}
            showSecrets={showSecrets}
            loading={inboxLoading}
            onFetch={onFetchInbox}
          />
        </div>
      )}
    </div>
  );
}
