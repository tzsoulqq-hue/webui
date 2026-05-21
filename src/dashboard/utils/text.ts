export function buttonHint(label: string) {
  return { title: label, 'aria-label': label, 'data-tooltip': label };
}

export function short(value: string, size = 8) {
  if (!value) return '-';
  return value.length > size ? `${value.slice(0, size)}…` : value;
}

export function mask(value: string) {
  return value ? '••••••••' : '-';
}

export function maskPreview(value: string) {
  return String(value || '-').replace(/\b\d{6}\b/g, '••••••');
}

export function compactToast(value: string) {
  const text = String(value || '');
  return text.length > 150 ? `${text.slice(0, 150)}...` : text;
}

export function compactCellError(value: string) {
  const text = String(value || '-');
  return text.length > 24 ? `${text.slice(0, 24)}...` : text;
}
