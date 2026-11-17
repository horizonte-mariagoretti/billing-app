// Props that make a whole table row activatable by keyboard as well as by click.
// Keys only count when the row itself has focus, so inner buttons/inputs keep their own behaviour.
export const clickableRow = (onActivate) => ({
  onClick: onActivate,
  tabIndex: 0,
  onKeyDown: (e) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onActivate(e);
    }
  },
});
