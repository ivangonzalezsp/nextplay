export const MAX_BACKUP_BYTES = 256 * 1024 * 1024;
export const MAX_BACKUP_ZIP_BYTES = MAX_BACKUP_BYTES + 1024 * 1024;
export type BackupPreview = {
    token: string;
    createdAt: string;
    games: number;
    preferences: number;
    recommendations: number;
    playEvents: number;
};
