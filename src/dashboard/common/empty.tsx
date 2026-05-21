import { TableCell, TableRow } from '@/components/ui/table';

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
