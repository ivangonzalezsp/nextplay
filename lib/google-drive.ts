export type DriveStatus = {
    canManage: boolean;
    configured: boolean;
    connected: boolean;
    pending: boolean;
    error?: string;
};

export type DriveBackup = {
    id: string;
    name: string;
    createdTime: string;
    size: string;
};
