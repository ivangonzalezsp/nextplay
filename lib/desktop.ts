export type AppStatus = {
    installed: boolean;
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
