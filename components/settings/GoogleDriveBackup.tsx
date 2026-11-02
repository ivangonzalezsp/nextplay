'use client';

import { useEffect, useState } from 'react';
import { languageHeaders, locale, translate as t } from '@/lib/i18n';
import type { DriveBackup, DriveStatus } from '@/lib/google-drive';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CloudUpload } from 'lucide-react';
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogCancel,
    AlertDialogAction,
} from '@/components/ui/alert-dialog';

async function call(path: string, body?: unknown) {
    const response = await fetch('/api/drive/' + path, {
        headers: {
            ...languageHeaders(),
            ...(body === undefined
                ? {}
                : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined
            ? {}
            : { method: 'POST', body: JSON.stringify(body) }),
    });
    const result = await response.json();
    if (!response.ok)
        throw new Error(
            result.error || t('No se ha podido completar la operación.'),
        );
    return result;
}

export function GoogleDriveBackup({ disabled }: { disabled: boolean }) {
    const [status, setStatus] = useState<DriveStatus | null>(null);
    const [files, setFiles] = useState<DriveBackup[] | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [authUrl, setAuthUrl] = useState('');
    const [selected, setSelected] = useState<DriveBackup | null>(null);
    useEffect(() => {
        let active = true;
        void call('status')
            .then((next: DriveStatus) => {
                if (active) setStatus(next);
            })
            .catch((e: Error) => {
                if (active) setError(e.message);
            });
        return () => {
            active = false;
        };
    }, []);
    useEffect(() => {
        if (!status?.pending) return;
        let active = true;
        const timer = setInterval(() => {
            void call('status')
                .then((next: DriveStatus) => {
                    if (!active) return;
                    setStatus(next);
                    if (!next.pending) {
                        setAuthUrl('');
                        if (next.error) setError(next.error);
                    }
                })
                .catch((e: Error) => {
                    if (active) setError(e.message);
                });
        }, 2000);
        return () => {
            active = false;
            clearInterval(timer);
        };
    }, [status?.pending]);
    async function perform(action: () => Promise<void>) {
        setBusy(true);
        setError('');
        setMessage('');
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
    const blocked = disabled || busy || !status?.canManage;
    return (
        <section className="hud-card-subpanel space-y-3" aria-busy={busy}>
            <h4 className="text-sm font-semibold flex items-center gap-2">
                <CloudUpload size={16} />
                Google Drive
            </h4>
            <p className="text-xs text-muted-foreground">
                {t(
                    'Guarda y restaura tu biblioteca, preferencias e historiales. No incluye credenciales ni la sesión de Codex. Cada exportación crea una copia nueva.',
                )}
            </p>
            {status && !status.canManage && (
                <p className="text-xs">
                    {t(
                        'Gestiona Google Drive desde el PC donde se ejecuta Next Play.',
                    )}
                </p>
            )}
            {status?.canManage && (
                <>
                    <p className="text-xs">
                        {status.connected
                            ? t('Google Drive conectado')
                            : t('Google Drive sin conectar')}
                    </p>
                    <details className="text-xs" open={!status.configured}>
                        <summary className="cursor-pointer">
                            {t('Configurar cliente OAuth de Google')}
                        </summary>
                        <div className="space-y-2 mt-2">
                            <p className="text-muted-foreground">
                                {t(
                                    'Activa Google Drive API en Google Cloud y crea un cliente OAuth de tipo Aplicación de escritorio. Selecciona su JSON descargado. Usa el mismo cliente en tus otros equipos para acceder a las copias.',
                                )}
                            </p>
                            <a
                                href="https://developers.google.com/identity/protocols/oauth2/native-app"
                                target="_blank"
                                rel="noreferrer"
                                className="underline"
                            >
                                {t('Guía de configuración de Google')}
                            </a>
                            <label htmlFor="drive-oauth-json" className="block">
                                {t(
                                    'JSON del cliente OAuth (se guarda solo en este PC)',
                                )}
                            </label>
                            <Input
                                id="drive-oauth-json"
                                type="file"
                                accept=".json,application/json"
                                disabled={blocked || status.pending}
                                onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    event.target.value = '';
                                    if (!file) return;
                                    void perform(async () => {
                                        if (file.size > 16_000)
                                            throw new Error(
                                                t(
                                                    'Selecciona el JSON OAuth de una aplicación de escritorio de Google.',
                                                ),
                                            );
                                        let json;
                                        try {
                                            json = JSON.parse(
                                                await file.text(),
                                            );
                                        } catch {
                                            throw new Error(
                                                t(
                                                    'Selecciona el JSON OAuth de una aplicación de escritorio de Google.',
                                                ),
                                            );
                                        }
                                        setStatus(
                                            await call('configure', {
                                                installed: json.installed,
                                            }),
                                        );
                                        setFiles(null);
                                        setAuthUrl('');
                                        setMessage(
                                            t(
                                                'Cliente OAuth guardado. Conecta tu cuenta de Google.',
                                            ),
                                        );
                                    });
                                }}
                            />
                        </div>
                    </details>
                    <div className="flex flex-wrap gap-2">
                        {!status.connected && !status.pending && (
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={blocked || !status.configured}
                                onClick={() =>
                                    void perform(async () => {
                                        const result = await call(
                                            'connect',
                                            {},
                                        );
                                        setAuthUrl(result.url);
                                        setStatus(await call('status'));
                                    })
                                }
                            >
                                {t('Conectar Google Drive')}
                            </Button>
                        )}
                        {status.pending && (
                            <>
                                {authUrl && (
                                    <a
                                        href={authUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-sm underline py-2"
                                    >
                                        {t(
                                            'Continuar en Google (navegador externo)',
                                        )}
                                    </a>
                                )}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={blocked}
                                    onClick={() =>
                                        void perform(async () => {
                                            setStatus(await call('cancel', {}));
                                            setAuthUrl('');
                                        })
                                    }
                                >
                                    {t('Cancelar conexión')}
                                </Button>
                            </>
                        )}
                        {status.connected && (
                            <>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={blocked || status.pending}
                                    onClick={() =>
                                        void perform(async () => {
                                            const result = await call(
                                                'export',
                                                {},
                                            );
                                            setMessage(
                                                `${t('Copia guardada en Google Drive:')} ${result.name}`,
                                            );
                                            if (files !== null)
                                                setFiles(
                                                    (await call('backups'))
                                                        .files,
                                                );
                                        })
                                    }
                                >
                                    {t('Exportar a Google Drive')}
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={blocked || status.pending}
                                    onClick={() =>
                                        void perform(async () => {
                                            setFiles(
                                                (await call('backups')).files,
                                            );
                                        })
                                    }
                                >
                                    {t('Buscar copias para importar')}
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={blocked}
                                    onClick={() =>
                                        void perform(async () => {
                                            setStatus(
                                                await call('disconnect', {}),
                                            );
                                            setFiles(null);
                                            setAuthUrl('');
                                        })
                                    }
                                >
                                    {t('Desconectar Google Drive')}
                                </Button>
                            </>
                        )}
                    </div>
                    {files !== null && (
                        <div className="space-y-2">
                            {files.length === 0 && (
                                <p className="text-xs">
                                    {t(
                                        'No hay copias de Next Play en esta cuenta para este cliente OAuth.',
                                    )}
                                </p>
                            )}
                            {files.map((file) => (
                                <div
                                    key={file.id}
                                    className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2"
                                >
                                    <div className="min-w-0 text-xs">
                                        <p className="break-all">{file.name}</p>
                                        <p className="text-muted-foreground">
                                            {new Date(
                                                file.createdTime,
                                            ).toLocaleString(locale())}{' '}
                                            ·{' '}
                                            {(
                                                Number(file.size) /
                                                1024 /
                                                1024
                                            ).toFixed(1)}{' '}
                                            MB
                                        </p>
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={blocked}
                                        aria-label={`${t('Importar copia')}: ${file.name}`}
                                        onClick={() => setSelected(file)}
                                    >
                                        {t('Importar copia')}
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
            {busy && (
                <output className="block text-xs">
                    {t('Procesando copia de Google Drive…')}
                </output>
            )}
            {message && (
                <output className="block text-xs text-emerald-400 break-words">
                    {message}
                </output>
            )}
            {error && (
                <p role="alert" className="text-xs text-destructive">
                    {error}
                </p>
            )}
            <AlertDialog
                open={!!selected}
                onOpenChange={(open) => {
                    if (!open) setSelected(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogTitle>
                        {t('¿Restaurar esta copia?')}
                    </AlertDialogTitle>
                    <AlertDialogDescription className="break-words">
                        {selected?.name}
                        <br />
                        {t(
                            'Se reemplazará la biblioteca actual, incluidas preferencias e historiales. Antes se conservará una copia local en data/backups. Las conexiones no cambian.',
                        )}
                    </AlertDialogDescription>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t('Cancelar')}</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={blocked}
                            onClick={() => {
                                const file = selected;
                                setSelected(null);
                                if (file)
                                    void perform(async () => {
                                        await call('restore', { id: file.id });
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
