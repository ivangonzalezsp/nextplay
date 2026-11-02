'use client';

import { useEffect, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { languageHeaders, locale, translate as t } from '@/lib/i18n';
import { MAX_BACKUP_ZIP_BYTES, type BackupPreview } from '@/lib/backups';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogCancel,
    AlertDialogAction,
} from '@/components/ui/alert-dialog';

async function call(path: string, body: File | Record<string, unknown>) {
    const file = body instanceof File;
    const response = await fetch('/api/backups/' + path, {
        method: 'POST',
        headers: {
            ...languageHeaders(),
            'Content-Type': file ? 'application/zip' : 'application/json',
        },
        body: file ? body : JSON.stringify(body),
    });
    if (!response.ok) {
        const result = await response.json();
        throw new Error(
            result.error || t('No se ha podido completar la operación.'),
        );
    }
    return response;
}

export function LocalBackup({ disabled }: { disabled: boolean }) {
    const [canManage, setCanManage] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [preview, setPreview] = useState<BackupPreview | null>(null);
    const [name, setName] = useState('');
    useEffect(() => {
        let active = true;
        void fetch('/api/app', { headers: languageHeaders() })
            .then(async (response) => {
                if (!response.ok)
                    throw new Error(
                        t('No se ha podido completar la operación.'),
                    );
                const status = await response.json();
                if (active) setCanManage(status.canManage);
            })
            .catch((e: Error) => {
                if (active) setError(e.message);
            });
        return () => {
            active = false;
        };
    }, []);
    async function perform(action: () => Promise<void>) {
        setBusy(true);
        setError('');
        try {
            await action();
        } catch (e) {
            setError(
                e instanceof Error
                    ? e.message
                    : t('No se ha podido completar la operación.'),
            );
        } finally {
            setBusy(false);
        }
    }
    const blocked = disabled || busy || !canManage;
    return (
        <section className="hud-card-subpanel space-y-3" aria-busy={busy}>
            <h4 className="text-sm font-semibold">
                {t('Copias locales (ZIP)')}
            </h4>
            <p className="text-xs text-muted-foreground">
                {t(
                    'Guarda un ZIP en tu equipo o importa una copia de Next Play. Incluye biblioteca, preferencias e historiales; no incluye credenciales ni la sesión de Codex.',
                )}
            </p>
            <div className="flex flex-wrap gap-2">
                <Button
                    size="sm"
                    variant="outline"
                    disabled={blocked || !!preview}
                    onClick={() =>
                        void perform(async () => {
                            const response = await call('export', {});
                            const blob = await response.blob();
                            const url = URL.createObjectURL(blob);
                            const link = document.createElement('a');
                            link.href = url;
                            link.download =
                                response.headers
                                    .get('Content-Disposition')
                                    ?.match(/filename="([^"]+)"/)?.[1] ??
                                'NextPlay-backup.zip';
                            document.body.appendChild(link);
                            link.click();
                            link.remove();
                            setTimeout(() => URL.revokeObjectURL(url), 60_000);
                        })
                    }
                >
                    <Download size={14} />
                    {t('Exportar ZIP')}
                </Button>
            </div>
            <label
                htmlFor="local-backup-zip"
                className="text-xs font-medium flex items-center gap-2"
            >
                <Upload size={14} />
                {t('Importar ZIP')}
            </label>
            <Input
                id="local-backup-zip"
                type="file"
                accept=".zip,application/zip"
                disabled={blocked || !!preview}
                onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (!file) return;
                    void perform(async () => {
                        if (file.size > MAX_BACKUP_ZIP_BYTES)
                            throw new Error(
                                t('La copia supera el límite de 256 MB.'),
                            );
                        const result: BackupPreview = await (
                            await call('validate', file)
                        ).json();
                        setName(file.name);
                        setPreview(result);
                    });
                }}
            />
            <p className="text-xs text-muted-foreground">
                {t(
                    'Primero se valida el archivo. Nada se reemplaza hasta confirmar; antes de restaurar se guarda una copia local de recuperación.',
                )}
            </p>
            {busy && (
                <output className="block text-xs">
                    {t('Procesando copia local…')}
                </output>
            )}
            {error && (
                <p role="alert" className="text-xs text-destructive">
                    {error}
                </p>
            )}
            <AlertDialog
                open={!!preview}
                onOpenChange={(open) => {
                    if (!open && preview) {
                        const token = preview.token;
                        setPreview(null);
                        void perform(async () => {
                            await call('cancel', { token });
                        });
                    }
                }}
            >
                <AlertDialogContent>
                    <AlertDialogTitle>
                        {t('Copia ZIP validada')}
                    </AlertDialogTitle>
                    <AlertDialogDescription className="break-words">
                        {name}
                        <br />
                        {preview && (
                            <>
                                {new Date(preview.createdAt).toLocaleString(
                                    locale(),
                                )}
                                <br />
                                {t('Juegos:')} {preview.games} ·{' '}
                                {t('Preferencias:')} {preview.preferences}
                                <br />
                                {t('Recomendaciones:')}{' '}
                                {preview.recommendations} ·{' '}
                                {t('Eventos de juego:')} {preview.playEvents}
                                <br />
                            </>
                        )}
                        {t(
                            'Se reemplazará la biblioteca actual, incluidas preferencias e historiales. Antes se conservará una copia local en data/backups. Las conexiones no cambian.',
                        )}
                    </AlertDialogDescription>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={busy}>
                            {t('Cancelar')}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            disabled={blocked}
                            onClick={() => {
                                const candidate = preview;
                                setPreview(null);
                                if (candidate)
                                    void perform(async () => {
                                        await call('restore', {
                                            token: candidate.token,
                                        });
                                        window.location.reload();
                                    });
                            }}
                        >
                            {t('Restaurar copia')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </section>
    );
}
