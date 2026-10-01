import { THEMES } from './themes.ts';

export type AppStatus = {
    installed: boolean;
    desktop: boolean;
    canManage: boolean;
    version: string;
    onboardingComplete: boolean;
    lan: boolean;
    startup: boolean;
    urls: string[];
    connections: Record<
        | 'STEAM_API_KEY'
        | 'STEAM_FAMILY_TOKEN'
        | 'TWITCH_CLIENT_ID'
        | 'TWITCH_CLIENT_SECRET',
        boolean
    >;
    login: {
        state: 'idle' | 'pending' | 'complete' | 'error';
        message: string;
    };
    update: {
        checking?: boolean;
        checkedAt?: number;
        version?: string;
        notesUrl?: string;
        error?: string;
    };
};
export function desktopAppearance(value: unknown): Record<string, string> {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Invalid desktop preferences.');
    const result: Record<string, string> = {};
    for (const [key, entry] of Object.entries(value)) {
        if (key === 'language' && ['es', 'en'].includes(entry))
            result[key] = entry;
        else if (key === 'theme' && THEMES.some((theme) => theme.id === entry))
            result[key] = entry;
        else throw new Error('Invalid desktop preferences.');
    }
    return result;
}
