import './editableRow.css';

// Controls inside a row that keep their own click and must not also open the editor.
const INTERACTIVE = 'button, input, select, textarea, label, a, [role="checkbox"]';

/**
 * Props for a table row that opens its edit view on click or Enter, in addition to the row's edit button.
 * onOpen(rowElement) is called with the <tr>, so a popup can return focus to it. Clicks on an interactive
 * child (button, input, check mark…) and keys pressed inside such a child are ignored.
 */
export const editableRowProps = (onOpen, label, className) => ({
  className: className ? `row-editable ${className}` : 'row-editable',
  tabIndex: 0,
  title: label,
  onClick: (e) => {
    if (e.target.closest(INTERACTIVE)) return;
    onOpen(e.currentTarget);
  },
  onKeyDown: (e) => {
    if (e.target !== e.currentTarget || e.key !== 'Enter') return;
    e.preventDefault();
    onOpen(e.currentTarget);
  },
});
