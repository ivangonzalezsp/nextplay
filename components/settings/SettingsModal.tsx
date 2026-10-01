'use client';

import { translate as t, locale } from '@/lib/i18n';
import { useLanguage } from '@/components/header/LanguageSelector';

import { useState } from 'react';
import { AppSetup } from './AppSetup';
import { TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
} from '@/components/ui/select';
import {
    Users,
    RefreshCw,
    CheckCircle2,
    AlertCircle,
    ExternalLink,
    Tags,
} from 'lucide-react';
import {
    CODEX_MODELS,
    codexEffortsForModel,
    type CodexSettings,
    type RecommendationEngine,
    type Snapshot,
} from '@/lib/model';

export function SettingsModal({
    open,
    onOpenChange,
    state,
    onTagsSync,
    onRefreshHltb,
    hltbRemaining,
    onFamilySync,
    onReload,
    engine,
    setEngine,
    codex,
    setCodex,
    busy,
    onWelcome,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    state: Snapshot | null;
    onTagsSync: () => Promise<void>;
    onRefreshHltb: () => Promise<void>;
    hltbRemaining: number | null;
    onFamilySync: () => Promise<void>;
    onReload: () => Promise<void>;
    engine: RecommendationEngine;
    setEngine: (engine: RecommendationEngine) => void;
    codex: CodexSettings;
    setCodex: (settings: CodexSettings) => void;
    busy: string;
    onWelcome: (open: boolean) => void;
}) {
    useLanguage();
    const [activeTab, setActiveTab] = useState('general');
    const [draftEngine, setDraftEngine] = useState<RecommendationEngine | null>(
        null,
    );
    const [draftCodex, setDraftCodex] = useState<CodexSettings | null>(null);
    const [previousOpen, setPreviousOpen] = useState(open);
    if (previousOpen !== open) {
        setPreviousOpen(open);
        if (!open) {
            setDraftEngine(null);
            setDraftCodex(null);
        }
    }
    const selectedEngine = draftEngine ?? engine;
    const selectedCodex = draftCodex ?? codex;

    function handleOpenChange(nextOpen: boolean) {
        if (!nextOpen) {
            setDraftEngine(null);
            setDraftCodex(null);
        }
        onOpenChange(nextOpen);
    }

    const modelOptions = [
        ...CODEX_MODELS.map((model) => ({ ...model, label: t(model.label) })),
        ...(CODEX_MODELS.some((m) => m.value === selectedCodex.model)
            ? []
            : [
                  {
                      value: selectedCodex.model,
                      label: selectedCodex.model + t(' · configurado'),
                  },
              ]),
    ];

    const effortOptions = codexEffortsForModel(selectedCodex.model).map(
        (value) => ({
            value,
            label:
                value === 'low'
                    ? t('Bajo · más rápido')
                    : value === 'medium'
                      ? t('Medio · equilibrado')
                      : value === 'high'
                        ? t('Alto · más razonado')
                        : value === 'xhigh'
                          ? t('Muy alto')
                          : value === 'max'
                            ? t('Máximo')
                            : 'Ultra',
        }),
    );
    const steamGames = state?.games.filter((game) => game.appId > 0) ?? [];
    const checkedSteamGames = steamGames.filter(
        (game) => game.steamTagsCheckedAt != null,
    ).length;
    const pendingHltbCount = steamGames.filter(
        (game) => !game.hltb?.mainHours,
    ).length;

    return (
        <AppSetup
            open={open}
            onOpenChange={onOpenChange}
            state={state}
            onReload={onReload}
            activeTab={activeTab}
            onTabChange={setActiveTab}
        >
            {/* TAB 2: MOTOR & IA */}
            <TabsContent value="ai" className="hud-tab-pane space-y-4 pt-4">
                <div className="hud-card-subpanel space-y-3">
                    <div>
                        <label
                            htmlFor="settings-engine"
                            className="text-xs font-medium text-muted-foreground mb-1 block"
                        >
                            {t('Motor de Recomendación ')}
                        </label>
                        <Select
                            value={selectedEngine}
                            onValueChange={(val) =>
                                setDraftEngine(val as RecommendationEngine)
                            }
                            items={[
                                {
                                    value: 'codex',
                                    label: t(
                                        'Codex · Inteligencia Artificial (ChatGPT)',
                                    ),
                                },
                                {
                                    value: 'local',
                                    label: t(
                                        'Algoritmo Local · Sin tokens (Offline)',
                                    ),
                                },
                            ]}
                        >
                            <SelectTrigger
                                id="settings-engine"
                                className="w-full bg-black/30"
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="codex">
                                    {t(
                                        'Codex · Inteligencia Artificial (ChatGPT) ',
                                    )}
                                </SelectItem>
                                <SelectItem value="local">
                                    {t(
                                        'Algoritmo Local · Sin tokens (Offline) ',
                                    )}
                                </SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground mt-1.5">
                            {selectedEngine === 'codex'
                                ? t(
                                      'Usa tu sesión de Codex para razonamiento profundo y sugerencias en lenguaje natural.',
                                  )
                                : t(
                                      'Calcula afinidades matemáticas directamente con tu SQLite local sin llamadas a OpenAI.',
                                  )}
                        </p>
                    </div>

                    {selectedEngine === 'codex' && (
                        <>
                            <div>
                                <label
                                    htmlFor="settings-model"
                                    className="text-xs font-medium text-muted-foreground mb-1 block"
                                >
                                    {t('Modelo de Codex ')}
                                </label>
                                <Select
                                    value={selectedCodex.model}
                                    onValueChange={(model) => {
                                        if (!model) return;
                                        const efforts =
                                            codexEffortsForModel(model);
                                        setDraftCodex({
                                            model,
                                            effort: efforts.includes(
                                                selectedCodex.effort,
                                            )
                                                ? selectedCodex.effort
                                                : 'medium',
                                        });
                                    }}
                                    items={modelOptions}
                                >
                                    <SelectTrigger
                                        id="settings-model"
                                        className="w-full bg-black/30"
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {modelOptions.map((opt) => (
                                            <SelectItem
                                                key={opt.value}
                                                value={opt.value}
                                            >
                                                {t(opt.label)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <label
                                    htmlFor="settings-effort"
                                    className="text-xs font-medium text-muted-foreground mb-1 block"
                                >
                                    {t('Esfuerzo de Razonamiento ')}
                                </label>
                                <Select
                                    value={selectedCodex.effort}
                                    onValueChange={(effort) => {
                                        if (!effort) return;
                                        setDraftCodex({
                                            ...selectedCodex,
                                            effort: effort as CodexSettings['effort'],
                                        });
                                    }}
                                    items={effortOptions}
                                >
                                    <SelectTrigger
                                        id="settings-effort"
                                        className="w-full bg-black/30"
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {effortOptions.map((opt) => (
                                            <SelectItem
                                                key={opt.value}
                                                value={opt.value}
                                            >
                                                {t(opt.label)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </>
                    )}
                </div>
                <div className="flex flex-wrap justify-end gap-3">
                    <Button
                        variant="outline"
                        onClick={() => handleOpenChange(false)}
                    >
                        {t('Cancelar')}
                    </Button>
                    <Button
                        type="button"
                        onClick={() => {
                            setEngine(selectedEngine);
                            setCodex(selectedCodex);
                            handleOpenChange(false);
                        }}
                    >
                        {t('Guardar ')}
                    </Button>
                </div>
            </TabsContent>

            <TabsContent value="data" className="space-y-5 pt-5">
                {state?.setup.hltb && pendingHltbCount > 0 && (
                    <div className="hud-card-subpanel">
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                                <RefreshCw
                                    size={16}
                                    className="text-emerald-400"
                                />
                                {t('Duraciones de HowLongToBeat ')}
                            </h4>
                            <span className="text-xs text-muted-foreground">
                                {pendingHltbCount} {t('pendientes ')}
                            </span>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">
                            {t(
                                'Busca las duraciones que faltan para todos tus juegos de Steam. ',
                            )}
                        </p>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void onRefreshHltb()}
                            disabled={!!busy}
                            className="w-full"
                            title={t(
                                'Buscar en HowLongToBeat los juegos que aún no tienen duración',
                            )}
                            aria-busy={busy === 'hltb-all'}
                        >
                            <RefreshCw
                                size={13}
                                className={
                                    busy === 'hltb-all' ? 'spin mr-2' : 'mr-2'
                                }
                            />
                            {busy === 'hltb-all'
                                ? hltbRemaining === null
                                    ? t('Buscando HLTB…')
                                    : `${t('Buscando HLTB… (')}${hltbRemaining}${t(' restantes)')}`
                                : t('Buscar HLTB pendientes')}
                        </Button>
                    </div>
                )}

                <div className="hud-card-subpanel">
                    <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                            <Tags size={16} className="text-violet-400" />
                            {t('Etiquetas de Steam ')}
                        </h4>
                        {steamGames.length ? (
                            <span className="text-xs text-muted-foreground">
                                {checkedSteamGames} {t('de')}{' '}
                                {steamGames.length} {t('revisados ')}
                            </span>
                        ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">
                        {t(
                            'Carga las etiquetas públicas de Steam para mejorar los filtros y las recomendaciones. ',
                        )}
                    </p>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onTagsSync}
                        disabled={!!busy || !steamGames.length}
                        className="w-full"
                    >
                        <RefreshCw
                            size={13}
                            className={busy === 'tags' ? 'spin mr-2' : 'mr-2'}
                        />
                        {busy === 'tags'
                            ? t('Cargando etiquetas…')
                            : t('Cargar etiquetas de Steam')}
                    </Button>
                </div>

                <div className="hud-card-subpanel">
                    <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                            <Users size={16} className="text-cyan-400" />
                            {t('Steam Families (Préstamo Familiar) ')}
                        </h4>
                        {state?.family?.syncedAt && (
                            <span className="text-xs text-muted-foreground">
                                {t('Última lectura:')}{' '}
                                {new Date(
                                    state.family.syncedAt,
                                ).toLocaleDateString(locale())}
                            </span>
                        )}
                    </div>
                    {state?.family ? (
                        <div className="space-y-2">
                            <div className="hud-family-info-grid">
                                <div>
                                    <span className="text-xs text-muted-foreground">
                                        {t('Grupo: ')}
                                    </span>{' '}
                                    <strong className="text-sm text-foreground">
                                        {state.family.name}
                                    </strong>
                                </div>
                                <div>
                                    <span className="text-xs text-muted-foreground">
                                        {t('Miembros: ')}
                                    </span>{' '}
                                    <strong className="text-sm text-foreground">
                                        {state.family.members.length}
                                    </strong>
                                </div>
                                <div>
                                    <span className="text-xs text-muted-foreground">
                                        {t('Compartidos: ')}
                                    </span>{' '}
                                    <strong className="text-sm text-cyan-400">
                                        {
                                            state.games.filter((g) => g.shared)
                                                .length
                                        }{' '}
                                        {t('juegos ')}
                                    </strong>
                                </div>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={onFamilySync}
                                disabled={!!busy}
                                className="w-full mt-2"
                            >
                                <RefreshCw
                                    size={13}
                                    className={
                                        busy === 'family' ? 'spin mr-2' : 'mr-2'
                                    }
                                />
                                {busy === 'family'
                                    ? t('Actualizando familias…')
                                    : t('Actualizar Steam Families')}
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <p className="text-xs text-muted-foreground">
                                {t(
                                    'Añade las bibliotecas compartidas por tu grupo familiar de Steam, incluso con perfiles privados. ',
                                )}
                            </p>
                            {!state?.setup.family && (
                                <div className="bg-amber-950/30 border border-amber-800/40 p-2.5 rounded-lg text-xs text-amber-200/90">
                                    {t('Guarda tu token en Cuentas.')}{' '}
                                    <a
                                        href="https://store.steampowered.com/pointssummary/ajaxgetasyncconfig"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="underline text-amber-300 inline-flex items-center gap-1"
                                    >
                                        {t('Obtener token oficial')}{' '}
                                        <ExternalLink size={11} />
                                    </a>
                                </div>
                            )}
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={
                                    !!busy ||
                                    !state?.profile ||
                                    !state?.setup.family
                                }
                                onClick={onFamilySync}
                                className="w-full"
                            >
                                {t('Conectar Steam Families ')}
                            </Button>
                        </div>
                    )}
                </div>
                <details className="space-y-3">
                    <summary className="cursor-pointer font-semibold">
                        {t('Diagnóstico avanzado')}
                    </summary>
                    <div className="hud-card-subpanel space-y-3">
                        <h4 className="text-sm font-semibold text-foreground">
                            {t('Estado de las Integraciones ')}
                        </h4>

                        <div className="hud-status-checklist space-y-2">
                            <div className="flex items-center justify-between p-2 rounded-lg bg-black/20 border border-border/40">
                                <div className="flex items-center gap-2.5">
                                    {state?.setup.steam ? (
                                        <CheckCircle2
                                            size={16}
                                            className="text-emerald-400"
                                        />
                                    ) : (
                                        <AlertCircle
                                            size={16}
                                            className="text-amber-400"
                                        />
                                    )}
                                    <div>
                                        <div className="text-xs font-semibold text-foreground">
                                            Steam Web API
                                        </div>
                                        <div className="text-[11px] text-muted-foreground">
                                            {state?.setup.steam
                                                ? t(
                                                      'Clave guardada; sincroniza para comprobarla',
                                                  )
                                                : t('Añade tu clave de Steam')}
                                        </div>
                                    </div>
                                </div>
                                {!state?.setup.steam && (
                                    <a
                                        href="https://steamcommunity.com/dev/apikey"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-xs text-primary underline inline-flex items-center gap-1"
                                    >
                                        {t('Obtener ')}
                                        <ExternalLink size={10} />
                                    </a>
                                )}
                            </div>

                            <div className="flex items-center justify-between p-2 rounded-lg bg-black/20 border border-border/40">
                                <div className="flex items-center gap-2.5">
                                    {state?.setup.igdb ? (
                                        <CheckCircle2
                                            size={16}
                                            className="text-emerald-400"
                                        />
                                    ) : (
                                        <AlertCircle
                                            size={16}
                                            className="text-amber-400"
                                        />
                                    )}
                                    <div>
                                        <div className="text-xs font-semibold text-foreground">
                                            IGDB / Twitch
                                        </div>
                                        <div className="text-[11px] text-muted-foreground">
                                            {state?.setup.igdb
                                                ? t('Credenciales activas')
                                                : t(
                                                      'Añade las credenciales de IGDB',
                                                  )}
                                        </div>
                                    </div>
                                </div>
                                {!state?.setup.igdb && (
                                    <a
                                        href="https://dev.twitch.tv/console/apps"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-xs text-primary underline inline-flex items-center gap-1"
                                    >
                                        {t('Registrar ')}
                                        <ExternalLink size={10} />
                                    </a>
                                )}
                            </div>

                            <div className="flex items-center justify-between p-2 rounded-lg bg-black/20 border border-border/40">
                                <div className="flex items-center gap-2.5">
                                    {state?.setup.codex ? (
                                        <CheckCircle2
                                            size={16}
                                            className="text-emerald-400"
                                        />
                                    ) : (
                                        <AlertCircle
                                            size={16}
                                            className="text-amber-400"
                                        />
                                    )}
                                    <div>
                                        <div className="text-xs font-semibold text-foreground">
                                            Codex CLI / ChatGPT
                                        </div>
                                        <div className="text-[11px] text-muted-foreground">
                                            {state?.setup.codex
                                                ? t('Conectado con ChatGPT')
                                                : (state?.setup.codexMessage ??
                                                  t('Desconectado'))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center justify-between p-2 rounded-lg bg-black/20 border border-border/40">
                                <div className="flex items-center gap-2.5">
                                    {state?.setup.hltb ? (
                                        <CheckCircle2
                                            size={16}
                                            className="text-emerald-400"
                                        />
                                    ) : (
                                        <CheckCircle2
                                            size={16}
                                            className="text-muted-foreground"
                                        />
                                    )}
                                    <div>
                                        <div className="text-xs font-semibold text-foreground">
                                            HowLongToBeat
                                        </div>
                                        <div className="text-[11px] text-muted-foreground">
                                            {state?.setup.hltb
                                                ? t(
                                                      'Preparado para consultar duraciones',
                                                  )
                                                : t(
                                                      'No disponible en este entorno',
                                                  )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={onReload}
                            disabled={!!busy}
                            className="w-full mt-2"
                        >
                            <RefreshCw
                                size={13}
                                className={
                                    busy === 'reload' ? 'spin mr-2' : 'mr-2'
                                }
                            />
                            {busy === 'reload'
                                ? t('Comprobando…')
                                : t('Comprobar conexiones')}
                        </Button>
                    </div>
                </details>
                <Button
                    variant="ghost"
                    onClick={() => {
                        handleOpenChange(false);
                        onWelcome(true);
                    }}
                >
                    {t('Tutorial y preferencias iniciales ')}
                </Button>
            </TabsContent>
        </AppSetup>
    );
}
