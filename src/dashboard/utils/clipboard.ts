export async function copyText(value: string): Promise<boolean> {
  if (!value) return false;
  if (!window.isSecureContext || !navigator.clipboard?.writeText) return copyTextFallback(value);
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
    if (document.execCommand('copy') && handledCopyEvent) return true;
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
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    if (textarea?.parentNode) textarea.parentNode.removeChild(textarea);
    try {
      activeElement?.focus({ preventScroll: true });
    } catch {
      activeElement?.focus();
    }
  }
}
