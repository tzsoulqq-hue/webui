import React from 'react';
import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { buttonHint, copyText } from '../utils';

export type KVDescriptor = {
  id?: string;
  label: string;
  value: string;
  mono?: boolean;
  copyValue?: string;
  copyDisabled?: boolean;
  copyHint?: string;
  masked?: boolean;
  visible?: boolean;
  onCopy?: (label: string, value: string) => void;
};

export function KV({ label, value, mono, copyValue, copyDisabled, copyHint, masked, onCopy }: KVDescriptor) {
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
      <Input
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

export function KVList({ items, onCopy }: {
  items: KVDescriptor[];
  onCopy?: (label: string, value: string) => void;
}) {
  return (
    <>
      {items.filter((item) => item.visible !== false).map((item) => (
        <KV key={item.id ?? item.label} {...item} onCopy={item.onCopy ?? onCopy} />
      ))}
    </>
  );
}
