import { Badge } from '@/components/ui/badge';

function statusTone(status: string) {
  const normalized = status.toUpperCase();
  if (
    normalized.includes('FAILED') ||
    normalized.includes('ERROR') ||
    normalized.includes('EXISTS') ||
    normalized === 'BLOCKED' ||
    normalized === 'NEEDS_MANUAL_VERIFICATION'
  ) return 'bad';
  if (
    normalized.includes('SUCCEEDED') ||
    normalized.includes('SUCCESS') ||
    normalized === 'ACTIVATED' ||
    normalized === 'REGISTERED' ||
    normalized === 'AUTHORIZED'
  ) return 'good';
  return 'mid';
}

export function StatusBadge({ status }: { status: string }) {
  const label = status || '-';
  const cls = statusTone(label);
  const variant = cls === 'bad' ? 'destructive' : cls === 'good' ? 'default' : 'secondary';
  return <Badge className={`badge ${cls}`} variant={variant} title={label}>{label}</Badge>;
}
