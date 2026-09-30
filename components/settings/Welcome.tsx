'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Compass, Heart, Library, Gamepad2 } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
    OPINION_LABELS,
    STATUS_LABELS,
    type GameStatus,
    type Opinion,
    type Snapshot,
    type TasteChoice,
} from '@/lib/model';
import { AFFINITIES } from '@/lib/tastes';
import { selectWelcomeGames } from '@/lib/welcome';

const statuses: GameStatus[] = ['completed', 'playing', 'paused', 'abandoned'];
const affinities = ['narrative', 'exploration', 'challenge', 'tactics'];
const choices: [TasteChoice, string][] = [
    ['like', 'Me gusta'],
    ['neutral', 'Me da igual'],
    ['dislike', 'No me gusta'],
];

export function Welcome({
    state,
    onSave,
    onClose,
    onFinish,
}: {
    state: Snapshot;
    onSave: (payload: Record<string, unknown>) => Promise<void>;
    onClose: () => void;
    onFinish: () => void;
}) {
    const [games] = useState(() => selectWelcomeGames(state));
    const [step, setStep] = useState(0);
    const [drafts, setDrafts] = useState(() =>
        Object.fromEntries(
            games.map((game) => [
                game.appId,
                {
                    status: state.preferences[game.appId]?.status ?? 'pending',
                    opinion: state.preferences[game.appId]?.opinion,
                    opinionReason:
                        state.preferences[game.appId]?.opinionReason ?? '',
                },
            ]),
        ),
    );
    const [overrides, setOverrides] = useState(() => ({
        ...state.tastes?.overrides,
    }));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const game = games[step - 1];
    const draft = game ? drafts[game.appId] : undefined;
    const tasteStep = games.length + 1;
    const summaryStep = tasteStep + 1;
    const summary = step === summaryStep;

    async function perform(action: () => Promise<void>) {
        setBusy(true);
        setError('');
        try {
            await action();
        } catch (e) {
            setError(
                e instanceof Error
                    ? e.message
                    : 'No se han podido guardar las respuestas.',
            );
        } finally {
            setBusy(false);
        }
    }
    function change(patch: Partial<NonNullable<typeof draft>>) {
        if (game && draft)
            setDrafts({ ...drafts, [game.appId]: { ...draft, ...patch } });
    }
    function close() {
        if (!busy)
            void perform(async () => {
                await onSave({ dismissed: true });
                onClose();
            });
    }
    async function next() {
        if (game && draft)
            await onSave({
                appId: game.appId,
                preference: {
                    status: draft.status,
                    opinion: draft.opinion ?? null,
                    opinionReason: draft.opinion ? draft.opinionReason : null,
                },
            });
        if (step === tasteStep) {
            const selected = Object.fromEntries(
                affinities
                    .filter((id) => overrides[id] !== undefined)
                    .map((id) => [id, overrides[id]]),
            );
            await onSave({ overrides: selected });
        }
        if (summary) {
            await onSave({ completed: true, dismissed: false });
            onFinish();
        } else setStep(step + 1);
    }

    return (
        <Dialog
            open
            onOpenChange={(open) => {
                if (!open) close();
            }}
        >
            <DialogContent
                className="hud-settings-modal max-h-[90dvh] overflow-y-auto sm:max-w-2xl"
                showCloseButton={false}
            >
                <DialogHeader>
                    <p className="text-xs text-muted-foreground">
                        Next Play ·{' '}
                        {summary
                            ? 'Resumen'
                            : `Paso ${step + 1} de ${summaryStep + 1}`}
                    </p>
                    <DialogTitle className="text-2xl">
                        {step === 0
                            ? 'Configura tus preferencias'
                            : game
                              ? '¿Cómo fue tu experiencia?'
                              : summary
                                ? 'Resumen de tus respuestas'
                                : '¿Qué te atrae de un juego?'}
                    </DialogTitle>
                    <DialogDescription>
                        {step === 0
                            ? 'Revisa el estado de algunos juegos y añade tus opiniones para ajustar las recomendaciones. Puedes saltar cualquier pregunta.'
                            : game
                              ? `Tu biblioteca · Juego ${step} de ${games.length}. Las horas no confirman que lo terminaste ni que te gustó.`
                              : summary
                                ? 'Las respuestas confirmadas ya están guardadas. Puedes editarlas en la biblioteca y en Tus gustos.'
                                : 'Elige solo lo que tengas claro. Las preferencias sin seleccionar se calcularán a partir de tus juegos y opiniones.'}
                    </DialogDescription>
                </DialogHeader>
                <progress
                    className="h-1 w-full accent-[var(--theme-accent)]"
                    aria-label="Progreso de la bienvenida"
                    value={step}
                    max={summaryStep}
                />
                {error && (
                    <p role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                )}
                <fieldset disabled={busy} className="min-w-0 space-y-5">
                    <legend className="sr-only">
                        Tutorial y preferencias iniciales
                    </legend>
                    {step === 0 && (
                        <div className="space-y-6 py-3">
                            {[
                                {
                                    icon: Library,
                                    title: 'Biblioteca',
                                    text: 'Consulta tus juegos, marca su estado y guarda tus favoritos.',
                                },
                                {
                                    icon: Compass,
                                    title: 'Recomendaciones',
                                    text: 'Elige el tiempo que tienes y lo que te apetece. Después, pide una recomendación.',
                                },
                                {
                                    icon: Heart,
                                    title: 'Gustos y opiniones',
                                    text: `Revisaremos ${games.length ? `${games.length} juegos y unas pocas preferencias` : 'unas pocas preferencias'}. Puedes saltar cualquier pregunta.`,
                                },
                            ].map(({ icon: Icon, title, text }) => (
                                <div className="flex gap-4" key={title}>
                                    <Icon
                                        className="mt-1 shrink-0 text-primary"
                                        size={22}
                                        aria-hidden="true"
                                    />
                                    <div>
                                        <h3 className="font-semibold">
                                            {title}
                                        </h3>
                                        <p className="text-sm text-muted-foreground">
                                            {text}
                                        </p>
                                    </div>
                                </div>
                            ))}
                            {!games.length && (
                                <p className="text-sm text-muted-foreground">
                                    No hay juegos para revisar en este paso.
                                    Puedes configurar tus gustos y retomar el
                                    recorrido desde Ajustes.
                                </p>
                            )}
                        </div>
                    )}
                    {game && draft && (
                        <>
                            <div className="flex items-center gap-5">
                                {game.cover ? (
                                    <Image
                                        src={game.cover}
                                        width={96}
                                        height={128}
                                        unoptimized
                                        alt={`Portada de ${game.name}`}
                                        className="h-32 w-24 rounded-lg object-cover"
                                    />
                                ) : (
                                    <div className="flex h-32 w-24 shrink-0 items-center justify-center rounded-lg bg-muted">
                                        <Gamepad2 aria-hidden="true" />
                                    </div>
                                )}
                                <div className="min-w-0">
                                    <h3 className="text-lg font-semibold">
                                        {game.name}
                                    </h3>
                                    <p className="text-sm text-muted-foreground">
                                        {(
                                            (game.playtimeMinutes ?? 0) / 60
                                        ).toLocaleString('es', {
                                            maximumFractionDigits: 1,
                                        })}{' '}
                                        horas jugadas
                                    </p>
                                </div>
                            </div>
                            <fieldset>
                                <legend className="mb-2 font-semibold">
                                    ¿En qué estado lo dejaste?
                                </legend>
                                <div className="flex flex-wrap gap-2">
                                    {statuses.map((status) => (
                                        <Button
                                            key={status}
                                            variant={
                                                draft.status === status
                                                    ? 'default'
                                                    : 'outline'
                                            }
                                            aria-pressed={
                                                draft.status === status
                                            }
                                            onClick={() => change({ status })}
                                        >
                                            {STATUS_LABELS[status]}
                                        </Button>
                                    ))}
                                </div>
                            </fieldset>
                            <fieldset>
                                <legend className="mb-2 font-semibold">
                                    ¿Qué te pareció?
                                </legend>
                                <div className="flex flex-wrap gap-2">
                                    {(
                                        Object.entries(OPINION_LABELS) as [
                                            Opinion,
                                            string,
                                        ][]
                                    ).map(([opinion, label]) => (
                                        <Button
                                            key={opinion}
                                            variant={
                                                draft.opinion === opinion
                                                    ? 'default'
                                                    : 'outline'
                                            }
                                            aria-pressed={
                                                draft.opinion === opinion
                                            }
                                            onClick={() =>
                                                change({
                                                    opinion:
                                                        draft.opinion ===
                                                        opinion
                                                            ? undefined
                                                            : opinion,
                                                    opinionReason:
                                                        draft.opinion ===
                                                        opinion
                                                            ? ''
                                                            : draft.opinionReason,
                                                })
                                            }
                                        >
                                            {label}
                                        </Button>
                                    ))}
                                </div>
                            </fieldset>
                            <div>
                                <label
                                    htmlFor="welcome-reason"
                                    className="font-semibold"
                                >
                                    ¿Por qué?{' '}
                                    <span className="font-normal text-muted-foreground">
                                        Opcional
                                    </span>
                                </label>
                                <Textarea
                                    id="welcome-reason"
                                    className="mt-2"
                                    rows={2}
                                    maxLength={500}
                                    disabled={!draft.opinion}
                                    value={draft.opinionReason}
                                    onChange={(e) =>
                                        change({
                                            opinionReason: e.target.value,
                                        })
                                    }
                                    placeholder="Qué te gustó o qué no te gustó"
                                />
                            </div>
                        </>
                    )}
                    {step === tasteStep && (
                        <div>
                            {affinities.map((id) => {
                                const affinity = AFFINITIES.find(
                                    (a) => a.id === id,
                                )!;
                                return (
                                    <fieldset
                                        className="space-y-2 border-b border-border py-4 last:border-0"
                                        key={id}
                                    >
                                        <legend className="sr-only">
                                            {affinity.label}
                                        </legend>
                                        <h3 className="font-semibold">
                                            {affinity.label}
                                        </h3>
                                        <p className="text-sm text-muted-foreground">
                                            {affinity.description}
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {choices.map(([choice, label]) => (
                                                <Button
                                                    key={choice}
                                                    variant={
                                                        overrides[id] === choice
                                                            ? 'default'
                                                            : 'outline'
                                                    }
                                                    aria-pressed={
                                                        overrides[id] === choice
                                                    }
                                                    onClick={() =>
                                                        setOverrides({
                                                            ...overrides,
                                                            [id]:
                                                                overrides[
                                                                    id
                                                                ] === choice
                                                                    ? 'auto'
                                                                    : choice,
                                                        })
                                                    }
                                                >
                                                    {label}
                                                </Button>
                                            ))}
                                        </div>
                                    </fieldset>
                                );
                            })}
                        </div>
                    )}
                    {summary && (
                        <div className="space-y-4">
                            {state.games
                                .filter((g) =>
                                    state.welcome?.reviewed.includes(g.appId),
                                )
                                .map((g) => {
                                    const pref = state.preferences[g.appId];
                                    return pref &&
                                        (pref.status !== 'pending' ||
                                            pref.opinion) ? (
                                        <div
                                            key={g.appId}
                                            className="border-b border-border pb-3"
                                        >
                                            <h3 className="font-semibold">
                                                {g.name}
                                            </h3>
                                            <p className="text-sm text-muted-foreground">
                                                {[
                                                    pref.status !== 'pending'
                                                        ? STATUS_LABELS[
                                                              pref.status
                                                          ]
                                                        : '',
                                                    pref.opinion
                                                        ? OPINION_LABELS[
                                                              pref.opinion
                                                          ]
                                                        : '',
                                                ]
                                                    .filter(Boolean)
                                                    .join(' · ')}
                                            </p>
                                            {pref.opinionReason && (
                                                <p className="mt-1 text-sm">
                                                    {pref.opinionReason}
                                                </p>
                                            )}
                                        </div>
                                    ) : null;
                                })}
                            {affinities
                                .filter(
                                    (id) =>
                                        overrides[id] &&
                                        overrides[id] !== 'auto',
                                )
                                .map((id) => (
                                    <p key={id} className="text-sm">
                                        {
                                            AFFINITIES.find((a) => a.id === id)!
                                                .label
                                        }{' '}
                                        ·{' '}
                                        {
                                            choices.find(
                                                ([choice]) =>
                                                    choice === overrides[id],
                                            )?.[1]
                                        }
                                    </p>
                                ))}
                            <p className="text-sm text-muted-foreground">
                                Tus opiniones ayudan a ajustar las
                                recomendaciones. Los juegos terminados quedan
                                fuera salvo que permitas rejugar. No se han
                                añadido fechas al historial de juego.
                            </p>
                        </div>
                    )}
                </fieldset>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                    <Button variant="ghost" disabled={busy} onClick={close}>
                        Completar más adelante
                    </Button>
                    <div className="flex flex-wrap gap-2">
                        {step > 0 && (
                            <Button
                                variant="outline"
                                disabled={busy}
                                onClick={() => setStep(step - 1)}
                            >
                                Atrás
                            </Button>
                        )}
                        <Button
                            disabled={busy}
                            onClick={() => void perform(next)}
                        >
                            {busy
                                ? 'Guardando…'
                                : summary
                                  ? 'Ir a Recomendaciones'
                                  : step === 0
                                    ? games.length
                                        ? 'Conocer mi biblioteca'
                                        : 'Configurar gustos'
                                    : step === tasteStep
                                      ? 'Ver mi resumen'
                                      : draft?.status === 'pending' &&
                                          !draft.opinion
                                        ? 'Saltar este juego'
                                        : 'Continuar'}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
