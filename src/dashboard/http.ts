export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...init });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(errorMessage(data) || resp.statusText);
  return data as T;
}

export function errorText(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

function errorMessage(data: unknown) {
  if (!data || typeof data !== 'object') return '';
  const record = data as Record<string, unknown>;
  return typeof record.error === 'string' ? record.error : '';
}
