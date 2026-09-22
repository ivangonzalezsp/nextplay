'use client';

import { useState } from 'react';
import { useTheme } from '@/components/header/ThemeSelector';
import { useGameVideoPreview } from '@/components/recommendations/useGameVideoPreview';
import {
    ExternalLink,
    Clock,
    ThumbsUp,
    Star,
    Bookmark,
    Sparkles,
    Gamepad2,
    AlertTriangle,
    Flame,
    Info,
    Play,
    Check,
    X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
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

export function HeroSpotlight({
    pick,
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
    const theme = useTheme();
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [failedArtwork, setFailedArtwork] = useState<number | null>(null);
    const hasArtwork =
        theme === 'cinema' && game.appId > 0 && failedArtwork !== game.appId;
    const preview = useGameVideoPreview(game.appId, hasArtwork);
    const [coverFailed, setCoverFailed] = useState(false);
    const steamUrl = steamLaunchUrl(game.appId);

    const steamReviewScore =
        game.reviews && game.reviews.total > 0
            ? Math.round((100 * game.reviews.positive) / game.reviews.total)
            : null;

    return (
        <article
            className={`hud-hero-spotlight ${hasArtwork ? 'has-artwork' : ''}`}
            onPointerEnter={preview.onPointerEnter}
            onPointerLeave={preview.onPointerLeave}
            onFocusCapture={preview.onFocusCapture}
            onBlurCapture={preview.onBlurCapture}
        >
            {hasArtwork && (
                <img
                    className="cinema-hero-artwork"
                    src={`https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${game.appId}/library_hero.jpg`}
                    alt=""
                    aria-hidden="true"
                    onError={() => setFailedArtwork(game.appId)}
                />
            )}
            {preview.videoId && preview.active && (
                <div className="cinema-hero-preview-clip" aria-hidden="true">
                    <iframe
                        className={`cinema-hero-preview cinema-preview-frame ${preview.revealed ? 'is-visible' : ''}`}
                        src={`https://www.youtube-nocookie.com/embed/${preview.videoId}?autoplay=1&mute=1&controls=0&disablekb=1&start=4&end=12&playsinline=1&rel=0`}
                        title={`Tráiler de ${game.name}`}
                        tabIndex={-1}
                        allow="autoplay; encrypted-media; picture-in-picture"
                        onLoad={preview.onFrameLoad}
                    />
                </div>
            )}
            {/* Dynamic blurred backdrop for ambient glow */}
            {game.cover && !coverFailed && (
                <div
                    className="hud-hero-backdrop"
                    style={{ backgroundImage: `url(${game.cover})` }}
                    aria-hidden="true"
                />
            )}

            <div className="hud-hero-content">
                {/* Cover Poster */}
                <div className="hud-hero-poster-container">
                    {game.cover && !coverFailed ? (
                        <img
                            src={game.cover}
                            alt={game.name}
                            className="hud-hero-poster"
                            loading="eager"
                            onError={() => setCoverFailed(true)}
                        />
                    ) : (
                        <div className="hud-hero-poster-fallback">
                            <Gamepad2 size={48} className="text-emerald-400" />
                        </div>
                    )}

                    {/* Quick overlay badges on poster */}
                    <div className="hud-poster-badge-top">
                        <span className="hud-spotlight-tag">
                            <Flame size={12} className="text-amber-400 mr-1" />
                            TOP RECOMENDACIÓN
                        </span>
                    </div>
                </div>

                {/* Info Column */}
                <div className="hud-hero-details">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="hud-meta-badge source">
                            {libraryLabel(game)}
                        </span>

                        {steamReviewScore !== null && (
                            <span
                                className={`hud-meta-badge reviews ${
                                    steamReviewScore >= 80
                                        ? 'positive'
                                        : 'mixed'
                                }`}
                                title={`${game.reviews?.positive.toLocaleString('es')} de ${game.reviews?.total.toLocaleString('es')} reseñas positivas`}
                            >
                                <ThumbsUp size={11} className="mr-1" />
                                {steamReviewScore}% Positivas
                            </span>
                        )}

                        {game.hltb?.mainHours && (
                            <span
                                className="hud-meta-badge hltb"
                                title="Tiempo de historia principal según HowLongToBeat"
                            >
                                <Clock
                                    size={11}
                                    className="mr-1 text-emerald-400"
                                />
                                {formatHours(game.hltb.mainHours)} historia
                            </span>
                        )}

                        {inLibrary(game) &&
                            game.playtimeMinutes !== null &&
                            game.playtimeMinutes > 0 && (
                                <span className="hud-meta-badge playtime">
                                    {(game.playtimeMinutes / 60).toLocaleString(
                                        'es',
                                        { maximumFractionDigits: 1 },
                                    )}
                                    h jugadas
                                </span>
                            )}
                    </div>

                    <h3 className="hud-hero-title">{game.name}</h3>

                    {/* Steam Community Tags */}
                    {game.steamTags && game.steamTags.length > 0 && (
                        <div className="hud-tags-row">
                            {game.steamTags.slice(0, 4).map((tag) => (
                                <span
                                    key={steamTagKey(tag)}
                                    className="hud-tag-pill"
                                >
                                    {tag.name}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Pitch reason */}
                    <div className="hud-hero-reason-box">
                        <p className="hud-pitch-text">{pick.reason}</p>
                        {pick.whyNow && (
                            <p className="hud-whynow-text">
                                <strong>¿Por qué ahora?</strong> {pick.whyNow}
                            </p>
                        )}
                        {pick.caveat && (
                            <div className="hud-caveat-alert">
                                <AlertTriangle
                                    size={14}
                                    className="shrink-0 text-amber-400 mt-0.5"
                                />
                                <span>
                                    <strong>A tener en cuenta:</strong>{' '}
                                    {pick.caveat}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Action Row */}
                    <div className="hud-hero-actions-row">
                        {steamUrl && (
                            <a
                                href={steamUrl}
                                className="hud-steam-launch-link"
                                aria-label="Jugar en Steam"
                                title="Jugar en Steam"
                            >
                                <Play size={14} aria-hidden="true" />
                                <span className="cinema-action-label">
                                    Jugar
                                </span>
                            </a>
                        )}
                        <a
                            href={gameUrl(game)}
                            target="_blank"
                            rel="noreferrer"
                            className="hud-card-steam-link"
                        >
                            <span>
                                {steamUrl ? 'Ver tienda' : 'Ver en IGDB'}
                            </span>
                            <ExternalLink size={15} />
                        </a>

                        {theme === 'cinema' && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setDetailsOpen(true)}
                                disabled={busy}
                            >
                                <Info size={14} className="mr-1.5" />
                                Ver detalles
                            </Button>
                        )}

                        {onSaved && (
                            <Button
                                variant={saved ? 'secondary' : 'outline'}
                                size="sm"
                                onClick={onSaved}
                                disabled={busy}
                                className={
                                    saved
                                        ? 'border-amber-400 text-amber-300'
                                        : ''
                                }
                            >
                                <Bookmark
                                    size={14}
                                    className={`mr-1.5 ${saved ? 'fill-current' : ''}`}
                                />
                                {saved ? 'En lista corta' : 'Guardar en lista'}
                            </Button>
                        )}

                        {onFavorite && inLibrary(game) && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={onFavorite}
                                disabled={busy}
                                className={
                                    favorite
                                        ? 'text-amber-400 border-amber-500/40'
                                        : ''
                                }
                                title="Marcar como favorito"
                            >
                                <Star
                                    size={14}
                                    className={`mr-1.5 ${favorite ? 'fill-current' : ''}`}
                                />
                                {favorite ? 'Favorito' : 'Marcar favorito'}
                            </Button>
                        )}

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onSimilar(game)}
                            disabled={busy}
                        >
                            <Sparkles
                                size={14}
                                className="mr-1.5 text-cyan-400"
                            />
                            Algo como este, pero…
                        </Button>
                    </div>

                    {/* Status and Opinion Controls */}
                    {onStatus && inLibrary(game) && (
                        <div className="hud-status-opinion-row">
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">
                                    Estado:
                                </span>
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
                                    <SelectTrigger className="h-8 text-xs bg-black/40 border-border/70 min-w-[150px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(STATUS_LABELS).map(
                                            ([value, label]) => (
                                                <SelectItem
                                                    key={value}
                                                    value={value}
                                                >
                                                    {label}
                                                </SelectItem>
                                            ),
                                        )}
                                    </SelectContent>
                                </Select>

                                <Button
                                    variant={
                                        status === 'completed'
                                            ? 'secondary'
                                            : 'ghost'
                                    }
                                    size="sm"
                                    className="h-8 text-xs"
                                    disabled={busy}
                                    onClick={() =>
                                        onStatus(
                                            status === 'completed'
                                                ? 'pending'
                                                : 'completed',
                                        )
                                    }
                                >
                                    <Check size={13} className="mr-1" />
                                    {status === 'completed'
                                        ? 'Completado'
                                        : 'Ya jugado'}
                                </Button>

                                <Button
                                    variant={
                                        status === 'ignored'
                                            ? 'destructive'
                                            : 'ghost'
                                    }
                                    size="sm"
                                    className="h-8 text-xs"
                                    disabled={busy}
                                    onClick={() =>
                                        onStatus(
                                            status === 'ignored'
                                                ? 'pending'
                                                : 'ignored',
                                        )
                                    }
                                >
                                    <X size={13} className="mr-1" />
                                    No me interesa
                                </Button>
                            </div>

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
                    )}
                </div>
            </div>

            {theme === 'cinema' && (
                <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
                    <DialogContent className="hud-game-detail-dialog max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>{game.name}</DialogTitle>
                            <DialogDescription>
                                El contexto completo de esta recomendación.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="hud-game-detail-layout">
                            <div className="hud-game-detail-cover-wrap">
                                {game.cover && !coverFailed ? (
                                    <img
                                        src={game.cover}
                                        alt={`Carátula de ${game.name}`}
                                        className="hud-game-detail-cover"
                                    />
                                ) : (
                                    <Gamepad2
                                        size={42}
                                        className="text-muted-foreground"
                                    />
                                )}
                            </div>
                            <div className="space-y-4">
                                {game.steamTags &&
                                    game.steamTags.length > 0 && (
                                        <div className="hud-tags-row">
                                            {game.steamTags
                                                .slice(0, 4)
                                                .map((tag) => (
                                                    <span
                                                        key={steamTagKey(tag)}
                                                        className="hud-tag-pill"
                                                    >
                                                        {tag.name}
                                                    </span>
                                                ))}
                                        </div>
                                    )}
                                <p className="hud-pitch-text">{pick.reason}</p>
                                {pick.whyNow && (
                                    <p className="hud-whynow-text">
                                        <strong>¿Por qué ahora?</strong>{' '}
                                        {pick.whyNow}
                                    </p>
                                )}
                                {pick.caveat && (
                                    <p className="hud-game-detail-caveat">
                                        {pick.caveat}
                                    </p>
                                )}
                                <div className="hud-game-detail-meta">
                                    <span>{libraryLabel(game)}</span>
                                    {game.hltb?.mainHours && (
                                        <span>
                                            {formatHours(game.hltb.mainHours)}{' '}
                                            de historia
                                        </span>
                                    )}
                                    {steamReviewScore !== null && (
                                        <span>
                                            {steamReviewScore}% de reseñas
                                            positivas
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <DialogFooter className="hud-game-detail-footer">
                            <DialogClose render={<Button variant="outline" />}>
                                Cerrar
                            </DialogClose>
                            {onSaved && (
                                <Button
                                    variant={saved ? 'secondary' : 'default'}
                                    onClick={onSaved}
                                    disabled={busy}
                                >
                                    <Bookmark size={14} className="mr-1.5" />
                                    {saved ? 'En lista corta' : 'Guardar'}
                                </Button>
                            )}
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </article>
    );
}
