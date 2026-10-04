'use client';

import { translate as t } from '@/lib/i18n';
import { useLanguage } from '@/components/header/LanguageSelector';

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
import { CodexControls } from './CodexControls';
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
            return t('Preparando tu consulta…');
        case 'recommendations:library-refresh:start':
            return t('Actualizando tu biblioteca…');
        case 'recommendations:enrich:start':
            return t('Completando los datos de tus juegos…');
        case 'recommendations:discover:start':
            return t('Buscando descubrimientos…');
        case 'recommendations:candidates':
            return `${number('total') ?? t('Varios')}${t(' candidatos cumplen tus filtros.')}`;
        case 'recommendations:reviews:batch:start':
            return t('Consultando valoraciones…');
        case 'recommendations:database:ready':
            return t('Catálogo listo para la IA.');
        case 'recommendations:codex:start':
            return t('La IA está analizando qué encaja contigo…');
        case 'recommendations:codex:thinking':
            return t('La IA está pensando la recomendación…');
        case 'recommendations:codex:catalog-query':
            return t('La IA está consultando tu biblioteca…');
        case 'recommendations:codex:reasoning':
            return t('La IA está afinando la comparación…');
        case 'recommendations:codex:response':
            return t('Respuesta recibida; comprobando los juegos…');
        case 'recommendations:codex:validated':
            return t('Respuesta validada.');
        case 'recommendations:complete':
            return t('Consulta completada.');
        default:
            return t('Preparando la recomendación…');
    }
}

function activityDetail(progress: RecommendationProgress) {
    const summary = progress.details?.summary;
    if (progress.event === 'recommendations:codex:reasoning')
        return typeof summary === 'string' && summary.trim()
            ? summary.trim()
            : t(
                  'Codex ha preparado un resumen de su criterio para esta recomendación.',
              );
    if (progress.event === 'recommendations:codex:catalog-query')
        return t(
            'Está buscando y filtrando candidatos en el catálogo local mediante una consulta de solo lectura. Los prompts y argumentos internos no se muestran.',
        );
    if (progress.event === 'recommendations:codex:thinking')
        return t(
            'Está comparando tus preferencias, el contexto de la conversación y los candidatos disponibles.',
        );
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
    onCodexChange,
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
    onCodexChange: (settings: CodexSettings) => void;
    state: Snapshot | null;
    busy: string;
    activity: RecommendationProgress[];
    canRecommend: boolean;
    onRecommend: (message?: string, mode?: ConversationMode) => void;
    onReset: () => void;
    renderResult: (result: Recommendation) => ReactNode;
}) {
    useLanguage();
    const suggestedPrompts = [
        t('Quiero algo más corto que lo propuesto'),
        t('Sin combates difíciles ni estrés, prefiero explorar'),
        t('Un juego para jugar con mando relajado en el sofá'),
        t('Tráeme algo de mi biblioteca familiar que casi nadie juegue'),
        t('Tráeme otras opciones completamente distintas'),
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
                            <span>{t('Copiloto de Selección')}</span>
                            <span className="hud-copilot-pill">
                                {engine === 'codex'
                                    ? `${codex.model} · ${codex.effort}`
                                    : t('Motor local')}
                            </span>
                        </h4>
                        <p className="text-xs text-muted-foreground">
                            {engine === 'codex' && conversationMode === 'guided'
                                ? t(
                                      'La IA te hará preguntas hasta que pulses «Recomiéndame ya».',
                                  )
                                : t(
                                      'Cuéntame qué te apetece y afinamos tu próximo juego.',
                                  )}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {engine === 'codex' && (
                        <fieldset
                            className="flex gap-1"
                            aria-label={t('Modo de conversación')}
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
                                        ? t('Modo guiado')
                                        : t('Directo')}
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
                        title={t('Reiniciar conversación y filtros')}
                    >
                        <RotateCcw size={12} className="mr-1" />
                        {t('Reiniciar ')}
                    </Button>
                </div>
            </div>

            {activity.length > 0 && (
                <div className="hud-ai-activity">
                    <div className="hud-ai-activity-header">
                        <span>
                            {engine === 'codex'
                                ? t('Actividad de la IA')
                                : t('Actividad de la recomendación')}
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
                                                {t('Ver detalle ')}
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
                    aria-label={t('Conversación')}
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
                                    <strong>{t('Tú')}</strong>
                                    <p className="whitespace-pre-wrap">
                                        {turn.text ||
                                            t(
                                                'Ayúdame a elegir mi próximo juego.',
                                            )}
                                    </p>
                                </div>
                                <div className="hud-history-ai">
                                    <strong>
                                        {turn.result.engine === 'local'
                                            ? t('Motor local')
                                            : t('Copiloto')}
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
                        {t('Buscando algo similar a:')}{' '}
                        <strong>{reference.name}</strong>
                    </span>
                    <button
                        type="button"
                        className="ml-auto text-muted-foreground hover:text-foreground"
                        onClick={() => {
                            setReference(null);
                            setText('');
                        }}
                        title={t('Quitar referencia')}
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
                                        t(
                                            'Hazme preguntas para encontrar mi juego ideal.',
                                        ),
                                )
                            }
                        >
                            {t('Empezar preguntas ')}
                        </Button>
                    )}
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={!canRecommend || !!busy}
                        onClick={() =>
                            onRecommend(
                                text.trim() ||
                                    t(
                                        'Recomiéndame ya con lo que sabes de mí, sin más preguntas.',
                                    ),
                                'direct',
                            )
                        }
                    >
                        {t('Recomiéndame ya ')}
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

            {engine === 'codex' && (
                <div className="mb-3 space-y-1.5">
                    <CodexControls
                        idPrefix="chat"
                        value={codex}
                        catalog={state?.setup.codexModels}
                        onChange={onCodexChange}
                        disabled={!!busy}
                    />
                    <p className="text-xs text-muted-foreground">
                        {t(
                            'Se guarda al cambiar y se aplica a tu próximo mensaje.',
                        )}
                    </p>
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
                            ? t('Tu respuesta')
                            : t('Mensaje para el copiloto')
                    }
                    aria-describedby={
                        clarification ? 'copilot-question' : undefined
                    }
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={
                        engine === 'codex'
                            ? clarification || conversationMode === 'guided'
                                ? t('Cuéntame qué prefieres…')
                                : t(
                                      '¿Qué cambiarías? (ej: prefiero un roguelike espacial, o algo que dure menos de 4 horas)…',
                                  )
                            : t(
                                  'El motor local usa los filtros fijos. Cambia a Codex para conversar en lenguaje natural.',
                              )
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
                    aria-label={t('Enviar mensaje')}
                >
                    <ArrowRight size={16} />
                </Button>
            </form>

            {engine !== 'codex' && (
                <div className="hud-engine-warning-banner">
                    <span>
                        {t(
                            'Estás en modo motor local (offline). Para afinar con IA, cambia a Codex: ',
                        )}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-xs ml-2"
                        onClick={() => setEngine('codex')}
                    >
                        {t('Activar Codex ')}
                    </Button>
                </div>
            )}
        </section>
    );
}
