'use client';

import { languageHeaders, translate as t } from '@/lib/i18n';
import { useLanguage } from '@/components/header/LanguageSelector';

import { useEffect, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ExternalLink, LoaderCircle, CheckCircle2 } from 'lucide-react';
import type { AppStatus } from '@/lib/desktop';
import type { Snapshot } from '@/lib/model';

type Key = keyof AppStatus['connections'];
async function call(path: string, body?: unknown, method = 'POST') {
    const response = await fetch(
        '/api/' + path,
        body === undefined
            ? { headers: languageHeaders() }
            : {
                  method,
                  headers: {
                      ...languageHeaders(),
                      'Content-Type': 'application/json',
                  },
                  body: JSON.stringify(body),
              },
    );
    const result = await response.json();
    if (!response.ok)
        throw new Error(
            result.error || t('No se ha podido completar la operación.'),
        );
    return result;
}
export function AppSetup({
    open,
    onOpenChange,
    state,
    onReload,
    onWelcome,
}: {
    open: boolean;
    onOpenChange: (value: boolean) => void;
    state: Snapshot | null;
    onReload: () => Promise<void>;
    onWelcome: (open: boolean) => void;
}) {
    useLanguage();
    const [status, setStatus] = useState<AppStatus | null>(null);
    const [step, setStep] = useState(0);
    const [draft, setDraft] = useState<Partial<Record<Key, string | null>>>({});
    const [profile, setProfile] = useState('');
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [noticeDismissed, setNoticeDismissed] = useState(false);
    useEffect(() => {
        if (
            status?.installed &&
            status.onboardingComplete &&
            !open &&
            state &&
            !state.welcome?.dismissed &&
            !state.welcome?.completed
        )
            onWelcome(true);
    }, [status?.installed, status?.onboardingComplete, open, state, onWelcome]);
    useEffect(() => {
        let active = true;
        void call('app')
            .then((next: AppStatus) => {
                if (!active) return;
                setStatus(next);
                if (
                    next.installed &&
                    next.canManage &&
                    !next.onboardingComplete
                )
                    onOpenChange(true);
            })
            .catch(() => {});
        return () => {
            active = false;
        };
    }, [onOpenChange]);
    useEffect(() => {
        if (!open) return;
        let active = true;
        void call('app')
            .then((next: AppStatus) => {
                if (!active) return;
                setStatus(next);
                setProfile(state?.profile?.url ?? '');
            })
            .catch((e: Error) => {
                if (active) setError(e.message);
            });
        return () => {
            active = false;
        };
    }, [open, state?.profile?.url]);
    useEffect(() => {
        if (status?.login.state !== 'pending' && !status?.update.checking)
            return;
        let active = true;
        const timer = setInterval(() => {
            void call('app')
                .then((next: AppStatus) => {
                    if (!active) return;
                    setStatus(next);
                    if (
                        status?.login.state === 'pending' &&
                        next.login.state === 'complete'
                    )
                        void onReload();
                })
                .catch(() => {});
        }, 2000);
        return () => {
            active = false;
            clearInterval(timer);
        };
    }, [status?.login.state, status?.update.checking, onReload]);
    async function perform(label: string, action: () => Promise<void>) {
        setBusy(label);
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
            setBusy('');
        }
    }
    async function save(syncProfile = false) {
        const values = Object.fromEntries(
            Object.entries(draft).filter(
                ([, value]) => value === null || value,
            ),
        );
        if (Object.keys(values).length)
            setStatus(await call('connections', values, 'PATCH'));
        setDraft({});
        if (syncProfile && profile.trim() && profile !== state?.profile?.url)
            await call('steam/sync', { profileUrl: profile, force: true });
        await onReload();
        setMessage(t('Conexiones guardadas en este PC.'));
    }
    async function restarting(
        path: string,
        body: unknown = {},
        method = 'POST',
    ) {
        const before = await call('health');
        const result = await call(path, body, method);
        if (!result.restarting) {
            setStatus(result);
            return;
        }
        setMessage(result.message || t('Reiniciando Next Play…'));
        const deadline = Date.now() + 240_000;
        while (Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            try {
                const health = await call('health');
                if (health.instance && health.instance !== before.instance) {
                    window.location.reload();
                    return;
                }
            } catch {
                /* The server is stopped while the installer runs. */
            }
        }
        throw new Error(
            t(
                'Next Play aún no ha vuelto a abrirse. Usa el acceso directo o vuelve a ejecutar el instalador; tus datos están guardados.',
            ),
        );
    }
    function credential(key: Key, label: string, url?: string, help?: string) {
        const configured = status?.connections[key];
        return (
            <div className="space-y-2" key={key}>
                <label
                    htmlFor={'connection-' + key}
                    className="text-sm font-medium"
                >
                    {t(label)}{' '}
                    {configured && (
                        <span className="text-xs text-emerald-400">
                            {t('· guardada ')}
                        </span>
                    )}
                </label>
                <div className="flex gap-2">
                    <Input
                        id={'connection-' + key}
                        type="password"
                        autoComplete="off"
                        spellCheck={false}
                        value={draft[key] ?? ''}
                        placeholder={
                            draft[key] === null
                                ? t('Se eliminará al guardar')
                                : configured
                                  ? t('Pega una nueva clave para sustituirla')
                                  : t('Pega aquí tu clave')
                        }
                        onChange={(e) =>
                            setDraft({ ...draft, [key]: e.target.value })
                        }
                        disabled={!!busy}
                    />
                    {configured && (
                        <Button
                            variant="outline"
                            disabled={!!busy}
                            onClick={() =>
                                setDraft({
                                    ...draft,
                                    [key]:
                                        draft[key] === null ? undefined : null,
                                })
                            }
                        >
                            {draft[key] === null
                                ? t('Conservar')
                                : t('Eliminar')}
                        </Button>
                    )}
                </div>
                {help && (
                    <p className="text-xs text-muted-foreground">{help}</p>
                )}
                {url && (
                    <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary underline"
                    >
                        {t('Obtener en la página oficial ')}
                        <ExternalLink size={12} />
                    </a>
                )}
            </div>
        );
    }
    return (
        <>
            {status?.installed &&
                status.canManage &&
                status.update.version &&
                !open &&
                !noticeDismissed && (
                    <aside
                        aria-label={t('Actualización disponible')}
                        className="fixed bottom-4 right-4 z-40 max-w-sm rounded-xl border border-border bg-background p-4 shadow-xl"
                    >
                        <p className="mb-3 text-sm">
                            Next Play {status.update.version}{' '}
                            {t('está disponible. ')}
                        </p>
                        <div className="flex gap-2">
                            <Button
                                size="sm"
                                onClick={() => {
                                    setStep(2);
                                    onOpenChange(true);
                                }}
                            >
                                {t('Ver actualización ')}
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setNoticeDismissed(true)}
                            >
                                {t('Más tarde ')}
                            </Button>
                        </div>
                    </aside>
                )}
            <Dialog
                open={open}
                onOpenChange={(value) => {
                    if (busy) return;
                    if (!value) setDraft({});
                    onOpenChange(value);
                }}
            >
                <DialogContent className="hud-settings-modal max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>
                            {status?.onboardingComplete
                                ? t('Configurar Next Play')
                                : t('Bienvenido a Next Play')}
                        </DialogTitle>
                        <DialogDescription>
                            {t(
                                'Conecta tus cuentas y prepara la aplicación desde aquí. Puedes completar las conexiones opcionales más adelante. ',
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <nav
                        aria-label={t('Pasos de configuración')}
                        className="flex flex-wrap gap-2"
                    >
                        {[
                            t('Tu biblioteca'),
                            t('Más conexiones'),
                            t('Tu aplicación'),
                        ].map((title, index) => (
                            <Button
                                key={title}
                                size="sm"
                                variant={step === index ? 'default' : 'outline'}
                                onClick={() => setStep(index)}
                                disabled={!!busy}
                                aria-current={
                                    step === index ? 'step' : undefined
                                }
                            >
                                {index + 1}. {title}
                            </Button>
                        ))}
                    </nav>
                    {error && (
                        <p
                            role="alert"
                            className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
                        >
                            {error}
                        </p>
                    )}
                    {message && (
                        <output className="block rounded-lg border border-primary/30 p-3 text-sm">
                            {message}
                        </output>
                    )}
                    {!status ? (
                        <p className="text-sm text-muted-foreground">
                            {t('Cargando configuración… ')}
                        </p>
                    ) : !status.canManage ? (
                        <p className="text-sm">
                            {t(
                                'Abre Next Play en el PC donde está instalada para gestionar cuentas, conexiones y actualizaciones. ',
                            )}
                        </p>
                    ) : (
                        <>
                            {step === 0 && (
                                <div className="space-y-5">
                                    {status.installed &&
                                        !status.onboardingComplete &&
                                        !state?.games.length && (
                                            <div className="hud-card-subpanel space-y-2">
                                                <p className="text-sm">
                                                    {t(
                                                        'Si ya usabas Next Play, cierra tu copia anterior antes de importar su biblioteca, historial y conexiones. ',
                                                    )}
                                                </p>
                                                <Button
                                                    variant="outline"
                                                    disabled={!!busy}
                                                    onClick={() =>
                                                        void perform(
                                                            t('Importando…'),
                                                            async () => {
                                                                await call(
                                                                    'app/import',
                                                                    {},
                                                                );
                                                                await onReload();
                                                                setStatus(
                                                                    await call(
                                                                        'app',
                                                                    ),
                                                                );
                                                                setMessage(
                                                                    t(
                                                                        'Biblioteca importada. La copia anterior se conserva.',
                                                                    ),
                                                                );
                                                            },
                                                        )
                                                    }
                                                >
                                                    {t(
                                                        'Importar instalación anterior ',
                                                    )}
                                                </Button>
                                            </div>
                                        )}
                                    {credential(
                                        'STEAM_API_KEY',
                                        t('Clave de Steam'),
                                        'https://steamcommunity.com/dev/apikey',
                                        t(
                                            'Steam solicita un dominio al crear la clave: puedes indicar localhost.',
                                        ),
                                    )}
                                    <div className="space-y-2">
                                        <label
                                            htmlFor="setup-profile"
                                            className="text-sm font-medium"
                                        >
                                            {t('Enlace a tu perfil de Steam ')}
                                        </label>
                                        <Input
                                            id="setup-profile"
                                            value={profile}
                                            onChange={(e) =>
                                                setProfile(e.target.value)
                                            }
                                            placeholder={t(
                                                'https://steamcommunity.com/id/tu_usuario/',
                                            )}
                                            disabled={!!busy}
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            {t(
                                                'El perfil y los detalles de juegos deben ser públicos en Steam. ',
                                            )}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <Button
                                            disabled={!!busy}
                                            onClick={() =>
                                                void perform(
                                                    t('Guardando…'),
                                                    save,
                                                )
                                            }
                                        >
                                            {t('Guardar clave ')}
                                        </Button>
                                        <Button
                                            variant="outline"
                                            disabled={!!busy || !profile.trim()}
                                            onClick={() =>
                                                void perform(
                                                    t('Importando juegos…'),
                                                    async () => {
                                                        await save();
                                                        await call(
                                                            'steam/sync',
                                                            {
                                                                profileUrl:
                                                                    profile,
                                                                force: true,
                                                            },
                                                        );
                                                        await onReload();
                                                        setMessage(
                                                            t(
                                                                'Tu biblioteca está lista.',
                                                            ),
                                                        );
                                                    },
                                                )
                                            }
                                        >
                                            {t('Guardar e importar juegos ')}
                                        </Button>
                                    </div>
                                </div>
                            )}
                            {step === 1 && (
                                <div className="space-y-5">
                                    <div className="hud-card-subpanel space-y-3">
                                        <h3 className="font-semibold">
                                            {t('Recomendaciones con ChatGPT ')}
                                        </h3>
                                        <p className="text-sm text-muted-foreground">
                                            {t(
                                                'Opcional. Usa tu cuenta y su cupo de Codex. También puedes recomendar con el algoritmo local. ',
                                            )}
                                        </p>
                                        {(state?.setup.codex ||
                                            status.login.state ===
                                                'complete') && (
                                            <p className="flex items-center gap-2 text-sm text-emerald-400">
                                                <CheckCircle2 size={16} />{' '}
                                                {t('ChatGPT conectado ')}
                                            </p>
                                        )}
                                        {status.login.message && (
                                            <output className="block text-sm">
                                                {status.login.message}
                                            </output>
                                        )}
                                        <Button
                                            disabled={!!busy}
                                            variant="outline"
                                            onClick={() =>
                                                void perform(
                                                    t('Conectando…'),
                                                    async () =>
                                                        setStatus(
                                                            await call(
                                                                status.login
                                                                    .state ===
                                                                    'pending'
                                                                    ? 'app/login/cancel'
                                                                    : 'app/login',
                                                                {},
                                                            ),
                                                        ),
                                                )
                                            }
                                        >
                                            {status.login.state === 'pending'
                                                ? t('Cancelar conexión')
                                                : t('Conectar ChatGPT')}
                                        </Button>
                                    </div>
                                    {credential(
                                        'STEAM_FAMILY_TOKEN',
                                        t('Steam Families · opcional'),
                                        'https://store.steampowered.com/pointssummary/ajaxgetasyncconfig',
                                        t(
                                            'Abre la página con tu sesión de Steam y copia el valor webapi_token. Después podrás sincronizar el grupo desde Ajustes.',
                                        ),
                                    )}
                                    {credential(
                                        'TWITCH_CLIENT_ID',
                                        t('IGDB · identificador de aplicación'),
                                        'https://dev.twitch.tv/console/apps',
                                        t(
                                            'Para metadatos y juegos de otras plataformas. En Twitch registra una aplicación Confidential con redirección http://localhost.',
                                        ),
                                    )}
                                    {credential(
                                        'TWITCH_CLIENT_SECRET',
                                        t('IGDB · secreto de aplicación'),
                                    )}
                                    <Button
                                        disabled={!!busy}
                                        onClick={() =>
                                            void perform(t('Guardando…'), save)
                                        }
                                    >
                                        {t('Guardar conexiones ')}
                                    </Button>
                                    <p className="text-sm text-muted-foreground">
                                        {t('Duraciones de HowLongToBeat:')}{' '}
                                        {state?.setup.hltb
                                            ? t(
                                                  'preparadas; se consultan al recomendar.',
                                              )
                                            : t(
                                                  'no disponibles en este entorno.',
                                              )}
                                    </p>
                                </div>
                            )}
                            {step === 2 && (
                                <div className="space-y-5">
                                    {status.installed ? (
                                        <>
                                            <label className="flex items-center gap-3 text-sm">
                                                <input
                                                    type="checkbox"
                                                    checked={status.startup}
                                                    disabled={!!busy}
                                                    onChange={(e) =>
                                                        void perform(
                                                            t('Guardando…'),
                                                            async () =>
                                                                setStatus(
                                                                    await call(
                                                                        'app/settings',
                                                                        {
                                                                            startup:
                                                                                e
                                                                                    .target
                                                                                    .checked,
                                                                        },
                                                                        'PATCH',
                                                                    ),
                                                                ),
                                                        )
                                                    }
                                                />
                                                {t('Iniciar con Windows ')}
                                            </label>
                                            <label className="flex items-center gap-3 text-sm">
                                                <input
                                                    type="checkbox"
                                                    checked={status.lan}
                                                    disabled={!!busy}
                                                    onChange={(e) => {
                                                        const lan =
                                                            e.target.checked;
                                                        void perform(
                                                            t(
                                                                'Cambiando acceso…',
                                                            ),
                                                            () =>
                                                                restarting(
                                                                    'app/settings',
                                                                    { lan },
                                                                    'PATCH',
                                                                ),
                                                        );
                                                    }}
                                                />
                                                {t(
                                                    'Permitir acceso desde mi red local ',
                                                )}
                                            </label>
                                            <p className="text-xs text-muted-foreground">
                                                {t(
                                                    'Al cambiar el acceso por red, Windows solicitará permiso y Next Play se reiniciará. Utiliza una red doméstica de confianza. ',
                                                )}
                                            </p>
                                            {status.urls.map((url) => (
                                                <p
                                                    className="text-sm"
                                                    key={url}
                                                >
                                                    {t('Desde tu móvil:')}{' '}
                                                    <a
                                                        className="text-primary underline"
                                                        href={url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                    >
                                                        {url}
                                                    </a>
                                                </p>
                                            ))}
                                            <div className="hud-card-subpanel space-y-3">
                                                <h3 className="font-semibold">
                                                    {t('Versión ')}
                                                    {status.version}
                                                </h3>
                                                <p className="text-sm">
                                                    {status.update.checking
                                                        ? t(
                                                              'Buscando actualizaciones…',
                                                          )
                                                        : status.update.version
                                                          ? `${t('Disponible: ')}${status.update.version}`
                                                          : t(
                                                                'No hay una actualización disponible.',
                                                            )}
                                                </p>
                                                {status.update.error && (
                                                    <p className="text-sm text-amber-400">
                                                        {status.update.error}
                                                    </p>
                                                )}
                                                <div className="flex flex-wrap gap-2">
                                                    <Button
                                                        variant="outline"
                                                        disabled={!!busy}
                                                        onClick={() =>
                                                            void perform(
                                                                t('Buscando…'),
                                                                async () =>
                                                                    setStatus(
                                                                        await call(
                                                                            'app/updates/check',
                                                                            {},
                                                                        ),
                                                                    ),
                                                            )
                                                        }
                                                    >
                                                        {t(
                                                            'Buscar actualizaciones ',
                                                        )}
                                                    </Button>
                                                    {status.update.version && (
                                                        <Button
                                                            disabled={!!busy}
                                                            onClick={() =>
                                                                void perform(
                                                                    t(
                                                                        'Actualizando…',
                                                                    ),
                                                                    () =>
                                                                        restarting(
                                                                            'app/update',
                                                                        ),
                                                                )
                                                            }
                                                        >
                                                            {t(
                                                                'Actualizar y reiniciar ',
                                                            )}
                                                        </Button>
                                                    )}
                                                </div>
                                                {status.update.notesUrl && (
                                                    <a
                                                        href={
                                                            status.update
                                                                .notesUrl
                                                        }
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="text-xs text-primary underline"
                                                    >
                                                        {t(
                                                            'Qué cambia en esta versión ',
                                                        )}
                                                    </a>
                                                )}
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                {t(
                                                    'Al cerrar la pestaña, Next Play sigue activa. Para cerrarla por completo, utiliza Salir en el icono de la bandeja de Windows. ',
                                                )}
                                            </p>
                                        </>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">
                                            {t(
                                                'El inicio con Windows y las actualizaciones integradas están disponibles en la versión instalada. ',
                                            )}
                                        </p>
                                    )}
                                </div>
                            )}
                            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                                {busy ? (
                                    <output className="flex items-center gap-2 text-sm">
                                        <LoaderCircle
                                            size={16}
                                            className="animate-spin"
                                        />
                                        {busy}
                                    </output>
                                ) : (
                                    <span className="text-xs text-muted-foreground">
                                        {t('Paso ')}
                                        {step + 1} {t('de 3 ')}
                                    </span>
                                )}
                                <div className="flex gap-2">
                                    {step < 2 && (
                                        <Button
                                            variant="outline"
                                            disabled={!!busy}
                                            onClick={() =>
                                                void perform(
                                                    t('Guardando…'),
                                                    async () => {
                                                        await save(step === 0);
                                                        setStep(step + 1);
                                                    },
                                                )
                                            }
                                        >
                                            {t('Continuar ')}
                                        </Button>
                                    )}
                                    <Button
                                        disabled={!!busy}
                                        onClick={() =>
                                            void perform(
                                                t('Guardando…'),
                                                async () => {
                                                    await save(step === 0);
                                                    setStatus(
                                                        await call(
                                                            'app/settings',
                                                            {
                                                                onboardingComplete: true,
                                                            },
                                                            'PATCH',
                                                        ),
                                                    );
                                                    onOpenChange(false);
                                                },
                                            )
                                        }
                                    >
                                        {step === 2
                                            ? t('Empezar a usar')
                                            : t('Completar más adelante')}
                                    </Button>
                                </div>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}
