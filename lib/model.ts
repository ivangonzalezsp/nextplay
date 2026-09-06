export type Mode = 'today' | 'next';
export type GameStatus = 'pending' | 'completed' | 'abandoned' | 'ignored';
export type Preference = { favorite: boolean; status: GameStatus };
export type TasteChoice = 'auto' | 'like' | 'neutral' | 'dislike';
export type TasteSettings = {
  overrides: Record<string, TasteChoice>;
  ignoredHours: number[];
  notes: string;
};
export type TasteAffinity = {
  id: string;
  label: string;
  inferred: number;
  choice: TasteChoice;
  evidence: { appId: number; name: string; hours: number; favorite: boolean }[];
};
export type Filters = {
  mode: Mode;
  minutes: number | null;
  hours: number | null;
  genre: string;
  gameMode: string;
  mood: string;
  replay: boolean;
};
export const DEFAULT_FILTERS: Filters = {
  mode: 'today',
  minutes: 60,
  hours: null,
  genre: '',
  gameMode: '',
  mood: '',
  replay: false,
};
export type Game = {
  appId: number;
  name: string;
  owned: boolean;
  shared?: boolean;
  ownerSteamIds?: string[];
  playtimeMinutes: number | null;
  recentMinutes: number | null;
  cover?: string;
  igdbId?: number;
  igdbUrl?: string;
  summary?: string;
  genres?: { id: number; name: string }[];
  gameModes?: number[];
  durationHours?: number | null;
  durationSamples?: number;
  similarIds?: number[];
  released?: boolean;
  isGame?: boolean;
  metadataAt?: number;
  reviews?: { positive: number; total: number; at: number };
};
export type Profile = {
  steamId: string;
  name: string;
  url: string;
  avatar?: string;
};
export type Pick = {
  appId: number;
  reason: string;
  whyNow: string;
  caveat: string;
};
export type Recommendation = {
  message: string;
  owned: (Pick & { game: Game })[];
  discoveries: (Pick & { game: Game })[];
  at: number;
  warnings: string[];
};
export type Turn = { text: string; filters: Filters; result: Recommendation };
export type State = {
  version: 1;
  profile: Profile | null;
  syncedAt: number | null;
  family?: {
    groupId: string;
    name: string;
    members: { steamId: string; name: string }[];
    syncedAt: number;
    excludedCount: number;
  } | null;
  games: Game[];
  preferences: Record<string, Preference>;
  tastes?: TasteSettings;
  conversation: Turn[];
  filters: Filters;
};
export type Setup = {
  steam: boolean;
  family: boolean;
  igdb: boolean;
  codex: boolean;
  codexMessage: string;
};
export type Snapshot = State & {
  setup: Setup;
  warnings: string[];
  tasteProfile?: TasteAffinity[];
};
export const EMPTY_STATE: State = {
  version: 1,
  profile: null,
  syncedAt: null,
  games: [],
  preferences: {},
  conversation: [],
  filters: DEFAULT_FILTERS,
};
export const STATUS_LABELS: Record<GameStatus, string> = {
  pending: 'Pendiente',
  completed: 'Terminado',
  abandoned: 'Abandonado',
  ignored: 'No me interesa',
};
export const storeUrl = (appId: number) =>
  `https://store.steampowered.com/app/${appId}/`;
export const inLibrary = (game: Game) => game.owned || game.shared === true;
export const libraryLabel = (game: Game) =>
  game.owned
    ? 'Propio'
    : game.shared
      ? 'Compartido · Steam Families'
      : 'Descubrimiento';
