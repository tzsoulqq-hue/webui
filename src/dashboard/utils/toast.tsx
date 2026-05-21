import { useCallback, useEffect, useState } from 'react';
import type { Toast } from '../types';
import { errorText } from '../http';
import { copyText } from './clipboard';
import { compactToast } from './text';

export function ToastMessage({ toast }: { toast: Toast }) {
  if (!toast) return null;
  return <div className={`toast ${toast.kind}`} title={toast.text}>{compactToast(toast.text)}</div>;
}

export function useToastMessage() {
  const [toast, setToast] = useState<Toast>(null);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), toast.kind === 'error' ? 6000 : 3500);
    return () => window.clearTimeout(id);
  }, [toast]);

  const showToast = useCallback((kind: 'ok' | 'error', text: string) => {
    setToast({ kind, text });
  }, []);
  const showOK = useCallback((text: string) => showToast('ok', text), [showToast]);
  const showError = useCallback((err: unknown) => showToast('error', errorText(err)), [showToast]);
  const copyValue = useCallback(async (label: string, value: string) => {
    const copied = await copyText(value);
    showToast(copied ? 'ok' : 'error', `${label}${copied ? '已复制' : '复制失败'}`);
  }, [showToast]);

  return { toast, showToast, showOK, showError, copyValue };
}
