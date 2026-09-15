'use client';
import { useId, useState } from 'react';
import { OPINION_LABELS } from '../lib/model';
import type { Game, Opinion, Preference } from '../lib/model';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export default function GameOpinion({
    game,
    preference,
    busy,
    onSave,
}: {
    game: Game;
    preference?: Preference;
    busy?: boolean;
    onSave: (change: Partial<Preference>) => void;
}) {
    const reasonId = useId();
    const [opinion, setOpinion] = useState<Opinion | ''>(
        preference?.opinion ?? '',
    );
    const [reason, setReason] = useState(preference?.opinionReason ?? '');
    if (
        !preference?.opinion &&
        !['completed', 'abandoned'].includes(preference?.status ?? '')
    )
        return null;
    const changed =
        opinion !== (preference?.opinion ?? '') ||
        reason.trim() !== (preference?.opinionReason ?? '');
    return (
        <details className="mt-3 rounded-md border p-3">
            <summary className="cursor-pointer">
                {preference?.opinion
                    ? `Tu opinión: ${OPINION_LABELS[preference.opinion]}`
                    : '¿Qué te pareció?'}
            </summary>
            <fieldset className="mt-3 grid gap-3" disabled={busy}>
                <legend className="sr-only">Opinión sobre {game.name}</legend>
                <label className="grid gap-1">
                    Tu opinión
                    <select
                        className="choice"
                        value={opinion}
                        onChange={(e) => {
                            setOpinion(e.target.value as Opinion | '');
                            if (!e.target.value) setReason('');
                        }}
                    >
                        <option value="">Sin opinión</option>
                        {Object.entries(OPINION_LABELS).map(
                            ([value, label]) => (
                                <option key={value} value={value}>
                                    {label}
                                </option>
                            ),
                        )}
                    </select>
                </label>
                <label className="grid gap-1" htmlFor={reasonId}>
                    Motivo opcional
                    <Textarea
                        id={reasonId}
                        value={reason}
                        maxLength={500}
                        disabled={!opinion || busy}
                        onChange={(e) => setReason(e.target.value)}
                    />
                </label>
                <p className="small-note">
                    Terminar o abandonar no indica si te gustó. Tu opinión
                    ajusta tus afinidades; Codex también recibe el motivo.
                </p>
                <Button
                    type="button"
                    disabled={busy || !changed}
                    onClick={() =>
                        onSave({
                            opinion: opinion || undefined,
                            opinionReason: opinion ? reason.trim() : undefined,
                        })
                    }
                >
                    Guardar opinión
                </Button>
                <output className="small-note">
                    {changed
                        ? 'Cambios sin guardar'
                        : preference?.opinion
                          ? 'Opinión guardada'
                          : 'Sin opinión guardada'}
                </output>
            </fieldset>
        </details>
    );
}
