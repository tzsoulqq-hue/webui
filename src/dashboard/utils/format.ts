export function formatUnix(value: number) {
  return value ? new Date(value * 1000).toLocaleString() : '-';
}

export function formatJSON(value: unknown) {
  try {
    return typeof value === 'string' ? JSON.stringify(JSON.parse(value), null, 2) : JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? '');
  }
}
