export const DEFAULT_THEME = 'cinema' as const;

export const THEMES = [
    { id: 'cinema', label: 'Menta' },
    { id: 'cinema-ocean', label: 'Océano' },
    { id: 'cinema-violet', label: 'Violeta' },
    { id: 'cinema-amber', label: 'Ámbar' },
    { id: 'cinema-rose', label: 'Rosa' },
] as const;

export const THEME_STORAGE_KEY = 'nextplay-theme';

export function resolveTheme(value: unknown) {
    return THEMES.find((theme) => theme.id === value)?.id ?? DEFAULT_THEME;
}

// Runs before the body is painted, using the same catalog as the selector.
export const THEME_INIT_SCRIPT = `try{document.documentElement.dataset.theme=${JSON.stringify(THEMES.map((theme) => theme.id))}.includes(localStorage.getItem('${THEME_STORAGE_KEY}'))?localStorage.getItem('${THEME_STORAGE_KEY}'):${JSON.stringify(DEFAULT_THEME)}}catch{document.documentElement.dataset.theme=${JSON.stringify(DEFAULT_THEME)}}`;
