'use client';

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
            ? undefined
            : {
                  method,
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(body),
              },
    );
    const result = await response.json();
    if (!response.ok)
        throw new Error(
            result.error || 'No se ha podido completar la operación.',
        );
    return result;
}
export function AppSetup({
    open,
    onOpenChange,
    state,
    onReload,
}: {
    open: boolean;
    onOpenChange: (value: boolean) => void;
    state: Snapshot | null;
    onReload: () => Promise<void>;
}) {
    const [status, setStatus] = useState<AppStatus | null>(null);
    const [step, setStep] = useState(0);
    const [draft, setDraft] = useState<Partial<Record<Key, string | null>>>({});
    const [profile, setProfile] = useState('');
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [noticeDismissed, setNoticeDismissed] = useState(false);
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
                    : 'No se ha podido completar la operación.',
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
        setMessage('Conexiones guardadas en este PC.');
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
        setMessage(result.message || 'Reiniciando Next Play…');
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
            'Next Play aún no ha vuelto a abrirse. Usa el acceso directo o vuelve a ejecutar el instalador; tus datos están guardados.',
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
                    {label}{' '}
                    {configured && (
                        <span className="text-xs text-emerald-400">
                            · guardada
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
                                ? 'Se eliminará al guardar'
                                : configured
                                  ? 'Pega una nueva clave para sustituirla'
                                  : 'Pega aquí tu clave'
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
                            {draft[key] === null ? 'Conservar' : 'Eliminar'}
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
                        Obtener en la página oficial <ExternalLink size={12} />
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
                        aria-label="Actualización disponible"
                        className="fixed bottom-4 right-4 z-40 max-w-sm rounded-xl border border-border bg-background p-4 shadow-xl"
                    >
                        <p className="mb-3 text-sm">
                            Next Play {status.update.version} está disponible.
                        </p>
                        <div className="flex gap-2">
                            <Button
                                size="sm"
                                onClick={() => {
                                    setStep(2);
                                    onOpenChange(true);
                                }}
                            >
                                Ver actualización
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setNoticeDismissed(true)}
                            >
                                Más tarde
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
                                ? 'Configurar Next Play'
                                : 'Bienvenido a Next Play'}
                        </DialogTitle>
                        <DialogDescription>
                            Conecta tus cuentas y prepara la aplicación desde
                            aquí. Puedes completar las conexiones opcionales más
                            adelante.
                        </DialogDescription>
                    </DialogHeader>
                    <nav
                        aria-label="Pasos de configuración"
                        className="flex flex-wrap gap-2"
                    >
                        {[
                            'Tu biblioteca',
                            'Más conexiones',
                            'Tu aplicación',
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
                            Cargando configuración…
                        </p>
                    ) : !status.canManage ? (
                        <p className="text-sm">
                            Abre Next Play en el PC donde está instalada para
                            gestionar cuentas, conexiones y actualizaciones.
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
                                                    Si ya usabas Next Play,
                                                    cierra tu copia anterior
                                                    antes de importar su
                                                    biblioteca, historial y
                                                    conexiones.
                                                </p>
                                                <Button
                                                    variant="outline"
                                                    disabled={!!busy}
                                                    onClick={() =>
                                                        void perform(
                                                            'Importando…',
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
                                                                    'Biblioteca importada. La copia anterior se conserva.',
                                                                );
                                                            },
                                                        )
                                                    }
                                                >
                                                    Importar instalación
                                                    anterior
                                                </Button>
                                            </div>
                                        )}
                                    {credential(
                                        'STEAM_API_KEY',
                                        'Clave de Steam',
                                        'https://steamcommunity.com/dev/apikey',
                                        'Steam solicita un dominio al crear la clave: puedes indicar localhost.',
                                    )}
                                    <div className="space-y-2">
                                        <label
                                            htmlFor="setup-profile"
                                            className="text-sm font-medium"
                                        >
                                            Enlace a tu perfil de Steam
                                        </label>
                                        <Input
                                            id="setup-profile"
                                            value={profile}
                                            onChange={(e) =>
                                                setProfile(e.target.value)
                                            }
                                            placeholder="https://steamcommunity.com/id/tu_usuario/"
                                            disabled={!!busy}
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            El perfil y los detalles de juegos
                                            deben ser públicos en Steam.
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <Button
                                            disabled={!!busy}
                                            onClick={() =>
                                                void perform('Guardando…', save)
                                            }
                                        >
                                            Guardar clave
                                        </Button>
                                        <Button
                                            variant="outline"
                                            disabled={!!busy || !profile.trim()}
                                            onClick={() =>
                                                void perform(
                                                    'Importando juegos…',
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
                                                            'Tu biblioteca está lista.',
                                                        );
                                                    },
                                                )
                                            }
                                        >
                                            Guardar e importar juegos
                                        </Button>
                                    </div>
                                </div>
                            )}
                            {step === 1 && (
                                <div className="space-y-5">
                                    <div className="hud-card-subpanel space-y-3">
                                        <h3 className="font-semibold">
                                            Recomendaciones con ChatGPT
                                        </h3>
                                        <p className="text-sm text-muted-foreground">
                                            Opcional. Usa tu cuenta y su cupo de
                                            Codex. También puedes recomendar con
                                            el algoritmo local.
                                        </p>
                                        {(state?.setup.codex ||
                                            status.login.state ===
                                                'complete') && (
                                            <p className="flex items-center gap-2 text-sm text-emerald-400">
                                                <CheckCircle2 size={16} />{' '}
                                                ChatGPT conectado
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
                                                    'Conectando…',
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
                                                ? 'Cancelar conexión'
                                                : 'Conectar ChatGPT'}
                                        </Button>
                                    </div>
                                    {credential(
                                        'STEAM_FAMILY_TOKEN',
                                        'Steam Families · opcional',
                                        'https://store.steampowered.com/pointssummary/ajaxgetasyncconfig',
                                        'Abre la página con tu sesión de Steam y copia el valor webapi_token. Después podrás sincronizar el grupo desde Ajustes.',
                                    )}
                                    {credential(
                                        'TWITCH_CLIENT_ID',
                                        'IGDB · identificador de aplicación',
                                        'https://dev.twitch.tv/console/apps',
                                        'Para metadatos y juegos de otras plataformas. En Twitch registra una aplicación Confidential con redirección http://localhost.',
                                    )}
                                    {credential(
                                        'TWITCH_CLIENT_SECRET',
                                        'IGDB · secreto de aplicación',
                                    )}
                                    <Button
                                        disabled={!!busy}
                                        onClick={() =>
                                            void perform('Guardando…', save)
                                        }
                                    >
                                        Guardar conexiones
                                    </Button>
                                    <p className="text-sm text-muted-foreground">
                                        Duraciones de HowLongToBeat:{' '}
                                        {state?.setup.hltb
                                            ? 'preparadas; se consultan al recomendar.'
                                            : 'no disponibles en este entorno.'}
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
                                                            'Guardando…',
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
                                                Iniciar con Windows
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
                                                            'Cambiando acceso…',
                                                            () =>
                                                                restarting(
                                                                    'app/settings',
                                                                    { lan },
                                                                    'PATCH',
                                                                ),
                                                        );
                                                    }}
                                                />
                                                Permitir acceso desde mi red
                                                local
                                            </label>
                                            <p className="text-xs text-muted-foreground">
                                                Al cambiar el acceso por red,
                                                Windows solicitará permiso y
                                                Next Play se reiniciará. Utiliza
                                                una red doméstica de confianza.
                                            </p>
                                            {status.urls.map((url) => (
                                                <p
                                                    className="text-sm"
                                                    key={url}
                                                >
                                                    Desde tu móvil:{' '}
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
                                                    Versión {status.version}
                                                </h3>
                                                <p className="text-sm">
                                                    {status.update.checking
                                                        ? 'Buscando actualizaciones…'
                                                        : status.update.version
                                                          ? `Disponible: ${status.update.version}`
                                                          : 'No hay una actualización disponible.'}
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
                                                                'Buscando…',
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
                                                        Buscar actualizaciones
                                                    </Button>
                                                    {status.update.version && (
                                                        <Button
                                                            disabled={!!busy}
                                                            onClick={() =>
                                                                void perform(
                                                                    'Actualizando…',
                                                                    () =>
                                                                        restarting(
                                                                            'app/update',
                                                                        ),
                                                                )
                                                            }
                                                        >
                                                            Actualizar y
                                                            reiniciar
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
                                                        Qué cambia en esta
                                                        versión
                                                    </a>
                                                )}
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                Al cerrar la pestaña, Next Play
                                                sigue activa. Para cerrarla por
                                                completo, utiliza Salir en el
                                                icono de la bandeja de Windows.
                                            </p>
                                        </>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">
                                            El inicio con Windows y las
                                            actualizaciones integradas están
                                            disponibles en la versión instalada.
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
                                        Paso {step + 1} de 3
                                    </span>
                                )}
                                <div className="flex gap-2">
                                    {step < 2 && (
                                        <Button
                                            variant="outline"
                                            disabled={!!busy}
                                            onClick={() =>
                                                void perform(
                                                    'Guardando…',
                                                    async () => {
                                                        await save(step === 0);
                                                        setStep(step + 1);
                                                    },
                                                )
                                            }
                                        >
                                            Continuar
                                        </Button>
                                    )}
                                    <Button
                                        disabled={!!busy}
                                        onClick={() =>
                                            void perform(
                                                'Guardando…',
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
                                            ? 'Empezar a usar'
                                            : 'Completar más adelante'}
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
