'use client';

import { useState, useSyncExternalStore } from 'react';
import {
    browserLanguage,
    LANGUAGE_STORAGE_KEY,
    resolveLanguage,
    translate as t,
    type Language,
} from '@/lib/i18n';

function applyLanguage(language: Language) {
    document.documentElement.lang = language;
    document.title =
        language === 'en'
            ? 'Next Play · Your next game'
            : 'Next Play · Tu próximo juego';
    window.dispatchEvent(new Event('nextplay-language'));
}

function subscribe(onChange: () => void) {
    const sync = (event: StorageEvent) => {
        if (event.key === LANGUAGE_STORAGE_KEY || event.key === null)
            applyLanguage(resolveLanguage(event.newValue));
    };
    window.addEventListener('storage', sync);
    window.addEventListener('nextplay-language', onChange);
    return () => {
        window.removeEventListener('storage', sync);
        window.removeEventListener('nextplay-language', onChange);
    };
}

export function useLanguage() {
    return useSyncExternalStore(
        subscribe,
        browserLanguage,
        () => 'es' as const,
    );
}

export function restoreLanguage() {
    try {
        applyLanguage(
            resolveLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY)),
        );
    } catch {
        applyLanguage('es');
    }
}

export function LanguageSelector() {
    const language = useLanguage();
    const [storageError, setStorageError] = useState(false);

    return (
        <fieldset className="language-selector" aria-label={t('Idioma')}>
            {(['en', 'es'] as const).map((value) => (
                <button
                    key={value}
                    type="button"
                    lang={value}
                    aria-label={value === 'en' ? 'English' : 'Español'}
                    title={value === 'en' ? 'English' : 'Español'}
                    aria-pressed={language === value}
                    onClick={() => {
                        applyLanguage(value);
                        try {
                            localStorage.setItem(LANGUAGE_STORAGE_KEY, value);
                            setStorageError(false);
                        } catch {
                            setStorageError(true);
                        }
                    }}
                >
                    <svg
                        aria-hidden="true"
                        width="24"
                        height="16"
                        viewBox="0 0 60 40"
                    >
                        {value === 'en' ? (
                            <>
                                <path fill="#012169" d="M0 0h60v40H0z" />
                                <path
                                    stroke="#fff"
                                    strokeWidth="8"
                                    d="m0 0 60 40m0-40L0 40"
                                />
                                <path
                                    stroke="#c8102e"
                                    strokeWidth="3"
                                    d="m0 0 60 40m0-40L0 40"
                                />
                                <path
                                    stroke="#fff"
                                    strokeWidth="12"
                                    d="M30 0v40M0 20h60"
                                />
                                <path
                                    stroke="#c8102e"
                                    strokeWidth="7"
                                    d="M30 0v40M0 20h60"
                                />
                            </>
                        ) : (
                            <>
                                <path fill="#aa151b" d="M0 0h60v40H0z" />
                                <path fill="#f1bf00" d="M0 10h60v20H0z" />
                            </>
                        )}
                    </svg>
                    <span>{value.toUpperCase()}</span>
                </button>
            ))}
            {storageError && (
                <output>{t('No se pudo guardar el idioma.')}</output>
            )}
        </fieldset>
    );
}
