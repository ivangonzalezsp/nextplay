'use client';

import { useState } from 'react';
import {
    MessageSquare,
    Sparkles,
    ArrowRight,
    RotateCcw,
    X,
    History,
    ChevronDown,
    ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type {
    Game,
    RecommendationEngine,
    CodexSettings,
    Snapshot,
} from '@/lib/model';

export function CopilotBar({
    text,
    setText,
    reference,
    setReference,
    engine,
    setEngine,
    codex,
    state,
    busy,
    canRecommend,
    onRecommend,
    onReset,
}: {
    text: string;
    setText: (text: string) => void;
    reference: Game | null;
    setReference: (game: Game | null) => void;
    engine: RecommendationEngine;
    setEngine: (engine: RecommendationEngine) => void;
    codex: CodexSettings;
    state: Snapshot | null;
    busy: string;
    canRecommend: boolean;
    onRecommend: (message?: string) => void;
    onReset: () => void;
}) {
    const [historyOpen, setHistoryOpen] = useState(false);

    const suggestedPrompts = [
        'Quiero algo más corto que lo propuesto',
        'Sin combates difíciles ni estrés, prefiero explorar',
        'Un juego para jugar con mando relajado en el sofá',
        'Tráeme algo de mi biblioteca familiar que casi nadie juegue',
        'Tráeme otras opciones completamente distintas',
    ];

    const conversationHistory = state?.conversation ?? [];

    return (
        <section className="hud-copilot-dock">
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
                            Afina tus propuestas hablándole en lenguaje natural.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {conversationHistory.length > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => setHistoryOpen(!historyOpen)}
                        >
                            <History size={13} className="mr-1" />
                            <span>{conversationHistory.length} consultas</span>
                            {historyOpen ? (
                                <ChevronUp size={12} className="ml-1" />
                            ) : (
                                <ChevronDown size={12} className="ml-1" />
                            )}
                        </Button>
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

            {/* Expandable session history */}
            {historyOpen && conversationHistory.length > 0 && (
                <div className="hud-copilot-history">
                    {conversationHistory.map((turn, index) => (
                        <div key={index} className="hud-history-turn">
                            <div className="hud-history-user">
                                <strong>Tú:</strong>{' '}
                                {turn.text || 'Búsqueda inicial'}
                            </div>
                            <div className="hud-history-ai">
                                <strong>Codex:</strong> {turn.result.message}
                            </div>
                        </div>
                    ))}
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

            {/* Quick Suggested Prompt Chips */}
            <div className="hud-quick-prompts">
                {suggestedPrompts.map((prompt) => (
                    <button
                        key={prompt}
                        type="button"
                        className="hud-prompt-chip"
                        disabled={!!busy}
                        onClick={() => {
                            if (engine !== 'codex') setEngine('codex');
                            onRecommend(prompt);
                        }}
                    >
                        {prompt}
                    </button>
                ))}
            </div>

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
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={
                        engine === 'codex'
                            ? '¿Qué cambiarías? (ej: prefiero un roguelike espacial, o algo que dure menos de 4 horas)…'
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
