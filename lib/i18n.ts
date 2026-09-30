import { ENGLISH } from './translations.ts';

export type Language = 'es' | 'en';
export const LANGUAGE_STORAGE_KEY = 'nextplay-language';
export const resolveLanguage = (value: unknown): Language =>
    value === 'en' ? 'en' : 'es';
export const browserLanguage = (): Language =>
    typeof document === 'undefined'
        ? 'es'
        : resolveLanguage(document.documentElement.lang);

export function translate(
    text: string,
    language: Language = browserLanguage(),
): string {
    return language === 'en' ? (ENGLISH[text] ?? text) : text;
}

export const locale = () => (browserLanguage() === 'en' ? 'en-GB' : 'es-ES');

export function languageHeaders() {
    return { 'Accept-Language': browserLanguage() };
}

export function steamTagLabel(tag: { name: string; englishName?: string }) {
    return browserLanguage() === 'en' ? tag.englishName || tag.name : tag.name;
}
