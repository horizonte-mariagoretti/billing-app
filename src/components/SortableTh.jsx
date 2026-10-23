import { ArrowUp, ArrowDown } from 'lucide-react';
import './DataTable.css';

/**
 * Sortable table header cell (styles in DataTable.css).
 *
 * column: sort key of this column · label · align: 'left' | 'right'
 * sort: { key, dir } from useTableSort · onSort(column)
 *
 * Left-aligned: arrow after the label. Right-aligned: arrow before the label (mirrored), so the
 * label ends at the column edge like the numbers below it. Unsorted columns keep the arrow's
 * space but hide it, so labels never shift when the sort changes.
 */
const SortableTh = ({ column, label, align = 'left', sort, onSort, className = '', title }) => {
  const active = sort?.key === column && !!sort?.dir;
  const Icon = active && sort.dir === 'desc' ? ArrowDown : ArrowUp;
  const icon = <Icon size={13} aria-hidden="true" className={active ? '' : 'dt-sort-hidden'} />;
  const right = align === 'right';
  return (
    <th
      className={`${right ? 'num ' : ''}${className}`.trim() || undefined}
      title={title}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button type="button" className={`dt-sort-btn${active ? ' active' : ''}`} onClick={() => onSort(column)}>
        {right && icon}
        <span>{label}</span>
        {!right && icon}
      </button>
    </th>
  );
};

export default SortableTh;
