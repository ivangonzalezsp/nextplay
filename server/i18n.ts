import { AsyncLocalStorage } from 'node:async_hooks';
import { translate, type Language } from '../lib/i18n.ts';

const languageContext = new AsyncLocalStorage<Language>();
export const requestLanguage = () => languageContext.getStore() ?? 'es';
export const t = (text: string) => translate(text, requestLanguage());
export const serverLocale = () =>
    requestLanguage() === 'en' ? 'en-GB' : 'es-ES';
export function withRequestLanguage<T>(request: Request, action: () => T): T {
    const first = request.headers.get('Accept-Language')?.split(',')[0]?.trim();
    return languageContext.run(
        /^en(?:-|;|$)/i.test(first ?? '') ? 'en' : 'es',
        action,
    );
}
