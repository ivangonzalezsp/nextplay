'use client';

import { useState } from 'react';
import {
    ExternalLink,
    Clock,
    ThumbsUp,
    Star,
    Bookmark,
    Sparkles,
    Gamepad2,
    Play,
    Check,
    X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
} from '@/components/ui/select';
import GameOpinion from '@/app/opinion';
import {
    STATUS_LABELS,
    gameUrl,
    inLibrary,
    libraryLabel,
    steamLaunchUrl,
    steamTagKey,
    type Game,
    type GameStatus,
    type Pick,
    type Preference,
} from '@/lib/model';

function formatHours(value: number | null | undefined) {
    return value == null
        ? 'sin datos'
        : value.toLocaleString('es', { maximumFractionDigits: 1 }) + ' h';
}

export function GameCard({
    pick,
    isDiscovery = false,
    status,
    onStatus,
    opinionPreference,
    onOpinion,
    onSimilar,
    busy,
    saved,
    onSaved,
    favorite,
    onFavorite,
}: {
    pick: Pick & { game: Game };
    isDiscovery?: boolean;
    status?: GameStatus;
    onStatus?: (status: GameStatus) => void;
    opinionPreference?: Preference;
    onOpinion?: (change: Partial<Preference>) => void;
    onSimilar: (game: Game) => void;
    busy?: boolean;
    saved?: boolean;
    onSaved?: () => void;
    favorite?: boolean;
    onFavorite?: () => void;
}) {
    const { game } = pick;
    const [coverFailed, setCoverFailed] = useState(false);
    const steamUrl = steamLaunchUrl(game.appId);

    const steamReviewScore =
        game.reviews && game.reviews.total > 0
            ? Math.round((100 * game.reviews.positive) / game.reviews.total)
            : null;

    return (
        <article className={`hud-game-card ${isDiscovery ? 'discovery' : ''}`}>
            {/* Cover with overlay badges */}
            <div className="hud-card-cover-wrapper">
                {game.cover && !coverFailed ? (
                    <img
                        src={game.cover}
                        alt={game.name}
                        className="hud-card-cover"
                        loading="lazy"
                        onError={() => setCoverFailed(true)}
                    />
                ) : (
                    <div className="hud-card-cover-fallback">
                        <Gamepad2 size={32} className="text-muted-foreground" />
                    </div>
                )}

                <div className="hud-card-overlay-badges">
                    <span className="hud-meta-badge source">
                        {isDiscovery ? 'Descubrimiento' : libraryLabel(game)}
                    </span>

                    {steamReviewScore !== null && (
                        <span
                            className={`hud-meta-badge reviews ${
                                steamReviewScore >= 80 ? 'positive' : 'mixed'
                            }`}
                        >
                            <ThumbsUp size={10} className="mr-0.5" />
                            {steamReviewScore}%
                        </span>
                    )}
                </div>

                {game.hltb?.mainHours && (
                    <div className="hud-card-bottom-badge">
                        <Clock size={11} className="mr-1 text-emerald-400" />
                        <span>{formatHours(game.hltb.mainHours)} historia</span>
                    </div>
                )}
            </div>

            {/* Body Content */}
            <div className="hud-card-body">
                <h4 className="hud-card-title" title={game.name}>
                    {game.name}
                </h4>

                {/* Tags */}
                {game.steamTags && game.steamTags.length > 0 && (
                    <div className="hud-tags-row compact">
                        {game.steamTags.slice(0, 3).map((tag) => (
                            <span
                                key={steamTagKey(tag)}
                                className="hud-tag-pill small"
                            >
                                {tag.name}
                            </span>
                        ))}
                    </div>
                )}

                {/* Reason */}
                <p className="hud-card-reason">{pick.reason}</p>

                {pick.caveat && (
                    <p className="hud-card-caveat">
                        <strong>Ojo:</strong> {pick.caveat}
                    </p>
                )}

                {/* Action Toolbar */}
                <div className="hud-card-actions">
                    {steamUrl && (
                        <a
                            href={steamUrl}
                            className="hud-steam-launch-link"
                            aria-label="Jugar en Steam"
                            title="Jugar en Steam"
                        >
                            <Play size={13} aria-hidden="true" />
                        </a>
                    )}
                    <a
                        href={gameUrl(game)}
                        target="_blank"
                        rel="noreferrer"
                        className="hud-card-steam-link"
                    >
                        <span>{steamUrl ? 'Ver tienda' : 'Ver en IGDB'}</span>
                        <ExternalLink size={12} />
                    </a>

                    {onSaved && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className={`h-7 w-7 ${saved ? 'text-amber-400' : 'text-muted-foreground'}`}
                            onClick={onSaved}
                            disabled={busy}
                            title={
                                saved
                                    ? 'Quitar de lista corta'
                                    : 'Guardar en lista corta'
                            }
                        >
                            <Bookmark
                                size={14}
                                className={saved ? 'fill-current' : ''}
                            />
                        </Button>
                    )}

                    {onFavorite && inLibrary(game) && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className={`h-7 w-7 ${favorite ? 'text-amber-400' : 'text-muted-foreground'}`}
                            onClick={onFavorite}
                            disabled={busy}
                            title={
                                favorite
                                    ? 'Quitar de favoritos'
                                    : 'Marcar favorito'
                            }
                        >
                            <Star
                                size={14}
                                className={favorite ? 'fill-current' : ''}
                            />
                        </Button>
                    )}

                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-muted-foreground hover:text-foreground ml-auto"
                        onClick={() => onSimilar(game)}
                        disabled={busy}
                        title="Buscar algo similar a este título"
                    >
                        <Sparkles size={12} className="mr-1 text-cyan-400" />
                        Similar
                    </Button>
                </div>

                {/* Status Dropdown if in library */}
                {onStatus && inLibrary(game) && (
                    <div className="mt-2 pt-2 border-t border-border/40 flex items-center justify-between gap-1">
                        <Select
                            value={status ?? 'pending'}
                            onValueChange={(val) =>
                                val && onStatus(val as GameStatus)
                            }
                            disabled={busy}
                            items={Object.entries(STATUS_LABELS).map(
                                ([v, l]) => ({ value: v, label: l }),
                            )}
                        >
                            <SelectTrigger className="h-7 text-[11px] bg-black/40 border-border/60">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.entries(STATUS_LABELS).map(
                                    ([value, label]) => (
                                        <SelectItem
                                            key={value}
                                            value={value}
                                            className="text-xs"
                                        >
                                            {label}
                                        </SelectItem>
                                    ),
                                )}
                            </SelectContent>
                        </Select>

                        <Button
                            variant={
                                status === 'completed' ? 'secondary' : 'ghost'
                            }
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            disabled={busy}
                            onClick={() =>
                                onStatus(
                                    status === 'completed'
                                        ? 'pending'
                                        : 'completed',
                                )
                            }
                        >
                            <Check size={11} className="mr-0.5" />
                            Jugado
                        </Button>
                    </div>
                )}

                {onOpinion && (
                    <GameOpinion
                        key={JSON.stringify(opinionPreference)}
                        game={game}
                        preference={opinionPreference}
                        busy={busy}
                        onSave={onOpinion}
                    />
                )}
            </div>
        </article>
    );
}
