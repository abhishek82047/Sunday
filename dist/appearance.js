/* Apply the saved appearance before the first paint on every page. */
(() => {
  const colors = { dark: '#06070a', light: '#edf2f7', blue: '#0c2445', pista: '#e3edd8', plum: '#261a32' };
  const key = 'monday_theme';
  function apply(value) {
    const theme = Object.hasOwn(colors, value) ? value : 'dark';
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colors[theme]);
    const picker = document.getElementById('appearance_theme');
    const choice = picker?.querySelector('input[value="' + theme + '"]');
    if (choice) choice.checked = true;
    document.dispatchEvent(new CustomEvent('sunday:appearance', { detail: theme }));
  }
  let saved;
  try { saved = localStorage.getItem(key); } catch {}
  apply(saved);
  document.addEventListener('DOMContentLoaded', () => {
    const picker = document.getElementById('appearance_theme');
    if (!picker) return;
    apply(document.documentElement.dataset.theme);
    picker.addEventListener('change', event => {
      const theme = event.target.value;
      apply(theme);
      try { localStorage.setItem(key, theme); } catch {}
    });
  });
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) apply(event.newValue);
  });
})();
