'use client';

import { useState, useSyncExternalStore } from 'react';
import { THEMES, THEME_STORAGE_KEY, resolveTheme } from '@/lib/themes';

function subscribe(onChange: () => void) {
    function sync(event: StorageEvent) {
        if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
        document.documentElement.dataset.theme = resolveTheme(event.newValue);
        onChange();
    }
    window.addEventListener('storage', sync);
    window.addEventListener('nextplay-theme', onChange);
    return () => {
        window.removeEventListener('storage', sync);
        window.removeEventListener('nextplay-theme', onChange);
    };
}

export function useTheme() {
    return useSyncExternalStore(
        subscribe,
        () => resolveTheme(document.documentElement.dataset.theme),
        () => 'default',
    );
}

export function ThemeSelector() {
    const theme = useTheme();
    const [storageError, setStorageError] = useState(false);

    return (
        <label className="theme-selector">
            <span>Tema</span>
            <select
                value={theme}
                onChange={(event) => {
                    const next = resolveTheme(event.target.value);
                    document.documentElement.dataset.theme = next;
                    window.dispatchEvent(new Event('nextplay-theme'));
                    try {
                        localStorage.setItem(THEME_STORAGE_KEY, next);
                        setStorageError(false);
                    } catch {
                        setStorageError(true);
                    }
                }}
            >
                {THEMES.map(({ id, label }) => (
                    <option key={id} value={id}>
                        {label}
                    </option>
                ))}
            </select>
            {storageError && <output>No se pudo guardar el tema.</output>}
        </label>
    );
}
