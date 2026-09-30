'use client';

import type { ReactNode } from 'react';
import {
    MessageSquare,
    Sparkles,
    ArrowRight,
    RotateCcw,
    X,
    LoaderCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type {
    Game,
    ConversationMode,
    Recommendation,
    RecommendationEngine,
    CodexSettings,
    RecommendationProgress,
    Snapshot,
} from '@/lib/model';

function activityLabel(progress: RecommendationProgress) {
    const details = progress.details ?? {};
    const number = (key: string) =>
        typeof details[key] === 'number' ? details[key] : undefined;
    switch (progress.event) {
        case 'recommendations:start':
            return 'Preparando tu consulta…';
        case 'recommendations:library-refresh:start':
            return 'Actualizando tu biblioteca…';
        case 'recommendations:enrich:start':
            return 'Completando los datos de tus juegos…';
        case 'recommendations:discover:start':
            return 'Buscando descubrimientos…';
        case 'recommendations:candidates':
            return `${number('total') ?? 'Varios'} candidatos cumplen tus filtros.`;
        case 'recommendations:reviews:batch:start':
            return 'Consultando valoraciones…';
        case 'recommendations:database:ready':
            return 'Catálogo listo para la IA.';
        case 'recommendations:codex:start':
            return 'La IA está analizando qué encaja contigo…';
        case 'recommendations:codex:thinking':
            return 'La IA está pensando la recomendación…';
        case 'recommendations:codex:catalog-query':
            return 'La IA está consultando tu biblioteca…';
        case 'recommendations:codex:reasoning':
            return 'La IA está afinando la comparación…';
        case 'recommendations:codex:response':
            return 'Respuesta recibida; comprobando los juegos…';
        case 'recommendations:codex:validated':
            return 'Respuesta validada.';
        case 'recommendations:complete':
            return 'Consulta completada.';
        default:
            return 'Preparando la recomendación…';
    }
}

function activityDetail(progress: RecommendationProgress) {
    const summary = progress.details?.summary;
    if (progress.event === 'recommendations:codex:reasoning')
        return typeof summary === 'string' && summary.trim()
            ? summary.trim()
            : 'Codex ha preparado un resumen de su criterio para esta recomendación.';
    if (progress.event === 'recommendations:codex:catalog-query')
        return 'Está buscando y filtrando candidatos en el catálogo local mediante una consulta de solo lectura. Los prompts y argumentos internos no se muestran.';
    if (progress.event === 'recommendations:codex:thinking')
        return 'Está comparando tus preferencias, el contexto de la conversación y los candidatos disponibles.';
    return null;
}

export function CopilotBar({
    text,
    setText,
    reference,
    setReference,
    engine,
    setEngine,
    conversationMode,
    setConversationMode,
    codex,
    state,
    busy,
    activity,
    canRecommend,
    onRecommend,
    onReset,
    renderResult,
}: {
    text: string;
    setText: (text: string) => void;
    reference: Game | null;
    setReference: (game: Game | null) => void;
    engine: RecommendationEngine;
    setEngine: (engine: RecommendationEngine) => void;
    conversationMode: ConversationMode;
    setConversationMode: (mode: ConversationMode) => void;
    codex: CodexSettings;
    state: Snapshot | null;
    busy: string;
    activity: RecommendationProgress[];
    canRecommend: boolean;
    onRecommend: (message?: string, mode?: ConversationMode) => void;
    onReset: () => void;
    renderResult: (result: Recommendation) => ReactNode;
}) {
    const suggestedPrompts = [
        'Quiero algo más corto que lo propuesto',
        'Sin combates difíciles ni estrés, prefiero explorar',
        'Un juego para jugar con mando relajado en el sofá',
        'Tráeme algo de mi biblioteca familiar que casi nadie juegue',
        'Tráeme otras opciones completamente distintas',
    ];

    const conversationHistory = state?.conversation ?? [];
    const latest = conversationHistory.at(-1)?.result;
    const clarification =
        engine === 'codex' && latest?.needsClarification ? latest : null;

    return (
        <section id="copilot-chat" className="hud-copilot-dock">
            <div className="hud-copilot-header">
                <div className="flex items-center gap-2">
                    <div className="hud-copilot-icon">
                        <MessageSquare size={16} />
                    </div>
                    <div>
                        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                            <span>Copiloto de Selección</span>
                            <span className="hud-copilot-pill">
                                {engine === 'codex'
                                    ? `${codex.model} · ${codex.effort}`
                                    : 'Motor local'}
                            </span>
                        </h4>
                        <p className="text-xs text-muted-foreground">
                            {engine === 'codex' && conversationMode === 'guided'
                                ? 'La IA te hará preguntas hasta que pulses «Recomiéndame ya».'
                                : 'Cuéntame qué te apetece y afinamos tu próximo juego.'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {engine === 'codex' && (
                        <fieldset
                            className="flex gap-1"
                            aria-label="Modo de conversación"
                        >
                            {(['direct', 'guided'] as const).map((mode) => (
                                <Button
                                    key={mode}
                                    type="button"
                                    variant={
                                        conversationMode === mode
                                            ? 'secondary'
                                            : 'ghost'
                                    }
                                    size="sm"
                                    aria-pressed={conversationMode === mode}
                                    disabled={!!busy}
                                    onClick={() => setConversationMode(mode)}
                                >
                                    {mode === 'guided'
                                        ? 'Modo guiado'
                                        : 'Directo'}
                                </Button>
                            ))}
                        </fieldset>
                    )}

                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-muted-foreground hover:text-foreground"
                        onClick={onReset}
                        disabled={!!busy}
                        title="Reiniciar conversación y filtros"
                    >
                        <RotateCcw size={12} className="mr-1" />
                        Reiniciar
                    </Button>
                </div>
            </div>

            {activity.length > 0 && (
                <div className="hud-ai-activity">
                    <div className="hud-ai-activity-header">
                        <span>
                            {engine === 'codex'
                                ? 'Actividad de la IA'
                                : 'Actividad de la recomendación'}
                        </span>
                        {busy === 'recommend' && (
                            <LoaderCircle className="spin" size={13} />
                        )}
                    </div>
                    <ol
                        className="hud-ai-activity-list"
                        aria-live="polite"
                        aria-busy={busy === 'recommend'}
                    >
                        {activity.slice(-6).map((progress, index, visible) => (
                            <li
                                key={`${progress.event}-${index}`}
                                className={`${index === visible.length - 1 ? 'is-current' : ''}${activityDetail(progress) ? ' has-detail' : ''}`}
                            >
                                {activityDetail(progress) ? (
                                    <details className="hud-ai-activity-disclosure">
                                        <summary>
                                            <span className="hud-ai-activity-summary">
                                                <span className="hud-ai-activity-dot" />
                                                <span>
                                                    {activityLabel(progress)}
                                                </span>
                                            </span>
                                            <span className="hud-ai-activity-hint">
                                                Ver detalle
                                            </span>
                                        </summary>
                                        <p className="hud-ai-activity-detail">
                                            {activityDetail(progress)}
                                        </p>
                                    </details>
                                ) : (
                                    <>
                                        <span className="hud-ai-activity-dot" />
                                        <span>{activityLabel(progress)}</span>
                                    </>
                                )}
                            </li>
                        ))}
                    </ol>
                </div>
            )}

            {conversationHistory.length > 0 && (
                <div
                    className="hud-copilot-history"
                    role="log"
                    aria-label="Conversación"
                >
                    {conversationHistory.map((turn, index) => {
                        const isLatest =
                            index === conversationHistory.length - 1;
                        return (
                            <div
                                key={index}
                                id={isLatest ? 'copilot-latest' : undefined}
                                className="hud-history-turn"
                            >
                                <div className="hud-history-user">
                                    <strong>Tú</strong>
                                    <p className="whitespace-pre-wrap">
                                        {turn.text ||
                                            'Ayúdame a elegir mi próximo juego.'}
                                    </p>
                                </div>
                                <div className="hud-history-ai">
                                    <strong>
                                        {turn.result.engine === 'local'
                                            ? 'Motor local'
                                            : 'Copiloto'}
                                    </strong>
                                    <p
                                        id={
                                            isLatest && clarification
                                                ? 'copilot-question'
                                                : undefined
                                        }
                                        className="whitespace-pre-wrap"
                                    >
                                        {turn.result.message}
                                    </p>
                                    {!turn.result.needsClarification &&
                                        renderResult(turn.result)}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Reference Game Pill */}
            {reference && (
                <div className="hud-copilot-reference-chip">
                    <Sparkles size={13} className="text-cyan-400" />
                    <span>
                        Buscando algo similar a:{' '}
                        <strong>{reference.name}</strong>
                    </span>
                    <button
                        type="button"
                        className="ml-auto text-muted-foreground hover:text-foreground"
                        onClick={() => {
                            setReference(null);
                            setText('');
                        }}
                        title="Quitar referencia"
                    >
                        <X size={13} />
                    </button>
                </div>
            )}

            {engine === 'codex' && conversationMode === 'guided' && (
                <div className="flex flex-wrap gap-2 mb-3">
                    {(!latest || !clarification) && (
                        <Button
                            variant="secondary"
                            size="sm"
                            disabled={!canRecommend || !!busy}
                            onClick={() =>
                                onRecommend(
                                    text.trim() ||
                                        'Hazme preguntas para encontrar mi juego ideal.',
                                )
                            }
                        >
                            Empezar preguntas
                        </Button>
                    )}
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={!canRecommend || !!busy}
                        onClick={() =>
                            onRecommend(
                                text.trim() ||
                                    'Recomiéndame ya con lo que sabes de mí, sin más preguntas.',
                                'direct',
                            )
                        }
                    >
                        Recomiéndame ya
                    </Button>
                </div>
            )}

            {/* Quick Suggested Prompt Chips */}
            {engine === 'codex' && conversationMode === 'direct' && (
                <div className="hud-quick-prompts">
                    {suggestedPrompts.map((prompt) => (
                        <button
                            key={prompt}
                            type="button"
                            className="hud-prompt-chip"
                            disabled={!!busy}
                            onClick={() => onRecommend(prompt)}
                        >
                            {prompt}
                        </button>
                    ))}
                </div>
            )}

            {/* Form Input */}
            <form
                className="hud-copilot-form"
                onSubmit={(e) => {
                    e.preventDefault();
                    if (text.trim()) onRecommend();
                }}
            >
                <Textarea
                    id="copilot-input"
                    aria-label={
                        clarification
                            ? 'Tu respuesta'
                            : 'Mensaje para el copiloto'
                    }
                    aria-describedby={
                        clarification ? 'copilot-question' : undefined
                    }
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={
                        engine === 'codex'
                            ? clarification || conversationMode === 'guided'
                                ? 'Cuéntame qué prefieres…'
                                : '¿Qué cambiarías? (ej: prefiero un roguelike espacial, o algo que dure menos de 4 horas)…'
                            : 'El motor local usa los filtros fijos. Cambia a Codex para conversar en lenguaje natural.'
                    }
                    maxLength={2000}
                    disabled={engine !== 'codex' || !canRecommend || !!busy}
                    rows={2}
                    className="hud-copilot-textarea"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            if (text.trim()) onRecommend();
                        }
                    }}
                />

                <Button
                    type="submit"
                    size="sm"
                    disabled={
                        !text.trim() ||
                        engine !== 'codex' ||
                        !canRecommend ||
                        !!busy
                    }
                    className="hud-copilot-send-btn"
                    aria-label="Enviar mensaje"
                >
                    <ArrowRight size={16} />
                </Button>
            </form>

            {engine !== 'codex' && (
                <div className="hud-engine-warning-banner">
                    <span>
                        Estás en modo motor local (offline). Para afinar con IA,
                        cambia a Codex:
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-xs ml-2"
                        onClick={() => setEngine('codex')}
                    >
                        Activar Codex
                    </Button>
                </div>
            )}
        </section>
    );
}
