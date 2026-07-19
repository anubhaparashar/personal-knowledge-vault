export const isEditableTarget = (target) => {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false;

  return (
    target.matches(
      'input, textarea, select, [contenteditable="true"], [role="textbox"]',
    )
    || Boolean(
      target.closest(
        'input, textarea, select, [contenteditable="true"], [role="textbox"]',
      ),
    )
  );
};
