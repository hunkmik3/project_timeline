export type Theme = 'auto' | 'light' | 'dark';

export const THEME_KEY = 'timeline:theme';

export const THEME_ORDER: Theme[] = ['auto', 'light', 'dark'];

export const THEME_LABELS: Record<Theme, string> = {
  auto: 'Auto',
  light: 'Light',
  dark: 'Dark',
};

/**
 * Inlined into <head> and executed before the first paint, so the correct
 * theme is on <html> before any pixels are drawn. Kept as a plain string
 * because it must run ahead of the React bundle.
 */
export const THEME_BOOT_SCRIPT = `
(function () {
  try {
    var saved = localStorage.getItem('${THEME_KEY}');
    var theme = saved === 'light' || saved === 'dark' ? saved
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;
  } catch (e) {
    document.documentElement.dataset.theme = 'light';
  }
})();
`.trim();

export function readStoredTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === 'light' || saved === 'dark' || saved === 'auto' ? saved : 'auto';
  } catch {
    return 'auto';
  }
}

function prefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Writes the resolved theme onto <html> and remembers the choice. */
export function applyTheme(theme: Theme): void {
  const resolved = theme === 'auto' ? (prefersDark() ? 'dark' : 'light') : theme;
  document.documentElement.dataset.theme = resolved;
  try {
    if (theme === 'auto') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Private browsing — the theme still applies for this session.
  }
}

/** On "auto", follow the OS if the user flips it while the page is open. */
export function watchSystemTheme(theme: Theme): () => void {
  if (theme !== 'auto') return () => {};
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => {
    document.documentElement.dataset.theme = mq.matches ? 'dark' : 'light';
  };
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}
