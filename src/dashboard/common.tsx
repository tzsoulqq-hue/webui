import type React from 'react';
import { Activity, AlertTriangle, CheckCircle2, Clock, Copy, Eye, EyeOff, Inbox, KeyRound, ListChecks, Mail, Play, Plus, QrCode, RefreshCcw, Save, Search, ShieldCheck, Trash2, WalletCards, X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { TableCell, TableRow } from '@/components/ui/table';
import type { Account, Mailbox } from './types';
import { accountIsActivated, authStatus, buttonHint, copyText, statusText, tierEligibilityText, tokenText } from './utils';

export function NavItem({ active, icon, label, count, countLabel, onClick }: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  count: number;
  countLabel: string;
  onClick: () => void;
}) {
  return (
    <Button className={`navItem ${active ? 'active' : ''}`} title={`${label}：${countLabel} ${count}`} onClick={onClick}>
      <span>{icon}</span>
      <strong>{label}</strong>
      <em aria-label={`${countLabel}: ${count}`}>{count}</em>
    </Button>
  );
}

export function OpenAIIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3.5a4.2 4.2 0 0 1 3.73 2.28l.43.82.92.08a4.2 4.2 0 0 1 2.09 7.73l-.78.49.04.92a4.2 4.2 0 0 1-5.86 4.03L12 19.5l-.57.35a4.2 4.2 0 0 1-5.86-4.03l.04-.92-.78-.49a4.2 4.2 0 0 1 2.09-7.73l.92-.08.43-.82A4.2 4.2 0 0 1 12 3.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M8.15 8.55 12 10.78l3.85-2.23M8.15 15.45 12 13.22l3.85 2.23M8.15 8.55v6.9M15.85 8.55v6.9M12 10.78v4.44"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PanelHeader({ title, icon, children }: { title: string; icon: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="panelHeader">
      <div><span>{icon}</span>{title}</div>
      {children}
    </div>
  );
}

export function PanelNotice({ kind, title, text }: { kind: 'info' | 'error'; title: string; text: string }) {
  return (
    <div className={`panelNotice ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {kind === 'error' ? <AlertTriangle size={16} /> : <Clock size={16} />}
      <div>
        <strong>{title}</strong>
        <span>{text}</span>
      </div>
    </div>
  );
}

export function EmptyTableRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <TableRow className="emptyTableRow">
      <TableCell colSpan={colSpan}>
        <EmptyBlock text={text} />
      </TableCell>
    </TableRow>
  );
}

export function EmptyBlock({ text }: { text: string }) {
  return <div className="emptyBlock">{text}</div>;
}

export function DetailDrawer({ open, title, onClose, children }: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen) onClose();
    }}>
      <SheetContent className="detailDrawer" side="right" showCloseButton>
        <SheetHeader className="drawerHeader">
          <SheetTitle className="drawerTitle"><Activity size={16} />{title}</SheetTitle>
          <SheetDescription className="sr-only">{title}明细面板</SheetDescription>
        </SheetHeader>
        <div className="drawerBody">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function WorkflowDialog({ open, onClose, children }: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen) onClose();
    }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="workflowDialogOverlay" />
        <DialogPrimitive.Content className="workflowDialogContent">
          <div className="workflowDialogHeader">
            <DialogPrimitive.Title className="drawerTitle"><Activity size={16} />工作流详情</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">工作流详情弹窗</DialogPrimitive.Description>
            <DialogPrimitive.Close asChild>
              <Button className="iconButton" {...buttonHint('关闭工作流详情')}>
                <X size={16} />
              </Button>
            </DialogPrimitive.Close>
          </div>
          <div className="workflowDialogBody">
            {children}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function KV({ label, value, mono, copyValue, copyDisabled, copyHint, masked, onCopy }: {
  label: string;
  value: string;
  mono?: boolean;
  copyValue?: string;
  copyDisabled?: boolean;
  copyHint?: string;
  masked?: boolean;
  onCopy?: (label: string, value: string) => void;
}) {
  const actualValue = copyValue ?? value;
  const inputValue = masked ? actualValue : value;
  const disabled = copyDisabled || !actualValue || actualValue === '-';
  const hint = disabled && copyHint ? copyHint : `复制 ${label}`;
  const copy = () => {
    if (onCopy) {
      onCopy(label, actualValue);
      return;
    }
    void copyText(actualValue);
  };
  const copyFromInput = (event: React.ClipboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    event.preventDefault();
    event.clipboardData.setData('text/plain', actualValue);
  };
  return (
    <div className="kv">
      <span>{label}</span>
      <input
        className={[mono ? 'mono valueButton' : 'valueButton', masked ? 'maskedValue' : ''].filter(Boolean).join(' ')}
        readOnly
        aria-label={`${label}值`}
        title={value || '-'}
        value={inputValue || '-'}
        onFocus={(event) => event.currentTarget.select()}
        onCopy={copyFromInput}
      />
      <Button className="copyButton" {...buttonHint(hint)} disabled={disabled} onClick={copy}>
        <Copy size={14} />
      </Button>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const cls = status.includes('FAILED') || status.includes('EXISTS') || status === 'BLOCKED' || status === 'NEEDS_MANUAL_VERIFICATION' ? 'bad' : status === 'SUCCEEDED' || status === 'ACTIVATED' || status === 'REGISTERED' || status === 'AUTHORIZED' ? 'good' : 'mid';
  const label = statusText(status);
  const variant = cls === 'bad' ? 'destructive' : cls === 'good' ? 'default' : 'secondary';
  return <Badge className={`badge ${cls}`} variant={variant} title={status || '-'}>{label}</Badge>;
}

export function TierEligibilityBadges({ account }: { account: Account }) {
  const activated = accountIsActivated(account);
  const tier = String(account.tier || '').trim().toLowerCase();
  const cls = !activated && account.plus_trial_eligible === false
    ? 'bad'
    : activated || (!!tier && tier !== 'free') || account.plus_trial_eligible === true
      ? 'good'
      : 'mid';
  const variant = cls === 'bad' ? 'destructive' : cls === 'good' ? 'default' : 'secondary';
  return <Badge className={`badge ${cls}`} variant={variant}>{tierEligibilityText(account)}</Badge>;
}

export function TokenBadge({ mailbox }: { mailbox: Mailbox }) {
  const value = tokenText(mailbox);
  if (mailbox.refresh_token && authStatus(mailbox) === 'AUTHORIZED') return <Badge className="badge good">{value}</Badge>;
  if (mailbox.refresh_token || mailbox.access_token) return <Badge className="badge mid" variant="secondary">{value}</Badge>;
  return <Badge className="badge bad" variant="destructive">{value}</Badge>;
}
