export type Mode = 'today' | 'next';
export type GameStatus = 'pending' | 'completed' | 'abandoned' | 'ignored';
export type Preference = { favorite: boolean; status: GameStatus };
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
  games: Game[];
  preferences: Record<string, Preference>;
  conversation: Turn[];
  filters: Filters;
};
export type Setup = {
  steam: boolean;
  igdb: boolean;
  codex: boolean;
  codexMessage: string;
};
export type Snapshot = State & { setup: Setup; warnings: string[] };
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
