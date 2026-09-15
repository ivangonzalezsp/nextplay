export const THEMES = [
    { id: 'default', label: 'Predeterminado' },
    { id: 'steam', label: 'Steam' },
    { id: 'ps5', label: 'PS5' },
    { id: 'switch2', label: 'Switch 2' },
] as const;

export const THEME_STORAGE_KEY = 'nextplay-theme';

export function resolveTheme(value: unknown) {
    return THEMES.find((theme) => theme.id === value)?.id ?? 'default';
}

// Runs before the body is painted, using the same catalog as the selector.
export const THEME_INIT_SCRIPT = `try{document.documentElement.dataset.theme=${JSON.stringify(THEMES.map((theme) => theme.id))}.includes(localStorage.getItem('${THEME_STORAGE_KEY}'))?localStorage.getItem('${THEME_STORAGE_KEY}'):'default'}catch{document.documentElement.dataset.theme='default'}`;
