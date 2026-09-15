'use client';

import Link from 'next/link';
import { ThemeSelector } from './ThemeSelector';
import {
    Gamepad2,
    Settings,
    Users,
    Library,
    Sparkles,
    RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Snapshot, RecommendationEngine } from '@/lib/model';

export function TopBar({
    state,
    engine,
    onOpenSettings,
    onSync,
    busy,
}: {
    state: Snapshot | null;
    engine: RecommendationEngine;
    onOpenSettings: () => void;
    onSync: () => void;
    busy: string;
}) {
    const gamesCount = state?.games?.length ?? 0;
    const familyCount = state?.games?.filter((g) => g.shared)?.length ?? 0;

    return (
        <header className="hud-topbar">
            <div className="hud-brand-group">
                <Link
                    className="hud-brand"
                    href="/"
                    aria-label="Next Play, inicio"
                >
                    <div className="hud-brand-icon">
                        <Gamepad2 className="hud-controller-icon" />
                    </div>
                    <div className="hud-brand-text">
                        <span>next</span>
                        <span className="hud-brand-light">play</span>
                        <span className="hud-brand-dot">.</span>
                    </div>
                </Link>
                <span className="hud-badge-tag">HUD</span>
            </div>

            <div className="hud-status-pills">
                <div
                    className="hud-pill"
                    title={
                        state?.syncedAt
                            ? `Última sincronización: ${new Date(state.syncedAt).toLocaleString('es')}`
                            : 'Tu biblioteca'
                    }
                >
                    <span
                        className={`hud-pulse-dot ${gamesCount > 0 ? 'active' : ''}`}
                    />
                    <Library size={14} className="hud-pill-icon" />
                    <span>
                        {gamesCount > 0 ? (
                            <>
                                <strong>{gamesCount}</strong> juegos
                            </>
                        ) : (
                            'Steam sin conectar'
                        )}
                    </span>
                    {state?.profile && (
                        <button
                            type="button"
                            className="hud-pill-refresh"
                            onClick={onSync}
                            disabled={!!busy}
                            aria-label="Actualizar biblioteca"
                            title="Actualizar biblioteca"
                        >
                            <RefreshCw
                                size={11}
                                className={busy === 'sync' ? 'spin' : ''}
                            />
                        </button>
                    )}
                </div>

                {state?.family && (
                    <div
                        className="hud-pill family"
                        title={`${state.family.name} (${state.family.members.length} miembros)`}
                    >
                        <Users
                            size={14}
                            className="hud-pill-icon text-cyan-400"
                        />
                        <span>
                            <strong>{familyCount}</strong> compartidos
                        </span>
                    </div>
                )}

                <div className="hud-pill engine">
                    <Sparkles
                        size={13}
                        className="hud-pill-icon text-emerald-400"
                    />
                    <span className="hud-engine-label">
                        {engine === 'codex' ? 'Codex IA' : 'Motor local'}
                    </span>
                </div>
            </div>

            <div className="hud-actions-group">
                <ThemeSelector />
                <Button
                    variant="outline"
                    size="sm"
                    className="hud-settings-btn"
                    onClick={onOpenSettings}
                    aria-label="Abrir configuración y conexiones"
                >
                    <Settings size={15} className="hud-settings-icon" />
                    <span className="hidden sm:inline">
                        Ajustes & Conexiones
                    </span>
                </Button>

                <div className="hud-user-profile">
                    {state?.profile?.avatar ? (
                        <img
                            src={state.profile.avatar}
                            alt=""
                            className="hud-avatar"
                            loading="lazy"
                        />
                    ) : (
                        <div className="hud-avatar-fallback">
                            {state?.profile?.name?.[0]?.toUpperCase() ?? 'U'}
                        </div>
                    )}
                    <span className="hud-user-name">
                        {state?.profile?.name ?? 'fineku'}
                    </span>
                </div>
            </div>
        </header>
    );
}
