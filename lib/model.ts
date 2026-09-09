export type Mode = 'today' | 'next';
export type RecommendationEngine = 'codex' | 'local';
export type GameStatus = 'pending' | 'completed' | 'abandoned' | 'ignored';
export const OPINION_LABELS = {
  loved: 'Me encantó',
  liked: 'Me gustó',
  disliked: 'No me gustó',
};
export type Opinion = keyof typeof OPINION_LABELS;
export type Preference = {
  favorite: boolean;
  status: GameStatus;
  opinion?: Opinion;
  opinionReason?: string;
};
export const CODEX_EFFORTS = [
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
  'ultra',
] as const;
export type CodexEffort = (typeof CODEX_EFFORTS)[number];
export const CODEX_MODELS = [
  { value: 'gpt-5.6-luna', label: 'GPT-5.6 Luna · rápido' },
  { value: 'gpt-5.6-terra', label: 'GPT-5.6 Terra · equilibrado' },
  { value: 'gpt-5.6-sol', label: 'GPT-5.6 Sol · profesional' },
  { value: 'gpt-6-astra', label: 'GPT-6 Astra · máxima capacidad' },
  { value: 'gpt-5.5', label: 'GPT-5.5' },
  { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini · ligero' },
] as const;
const CODEX_MODEL_EFFORTS: Record<string, readonly CodexEffort[]> = {
  'gpt-6-astra': ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
  'gpt-5.6-sol': ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
  'gpt-5.6-terra': ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
  'gpt-5.6-luna': ['low', 'medium', 'high', 'xhigh', 'max'],
  'gpt-5.5': ['low', 'medium', 'high', 'xhigh'],
  'gpt-5.4-mini': ['low', 'medium', 'high', 'xhigh'],
};
export const codexEffortsForModel = (model: string) =>
  CODEX_MODEL_EFFORTS[model] ?? CODEX_EFFORTS;
export type CodexSettings = { model: string; effort: CodexEffort };
export const DEFAULT_CODEX_SETTINGS: CodexSettings = {
  model: 'gpt-5.6-luna',
  effort: 'medium',
};
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
  evidenceCount: number;
  evidence: {
    appId: number;
    name: string;
    hours: number;
    favorite: boolean;
    opinion?: Opinion;
    opinionReason?: string;
    sources: string[];
  }[];
};
export type Filters = {
  mode: Mode;
  minutes: number | null;
  hours: number | null;
  minReleaseDate: string | null;
  tags: string[];
  genre: string;
  gameMode: string;
  mood: string;
  replay: boolean;
};
export const DEFAULT_FILTERS: Filters = {
  mode: 'today',
  minutes: 60,
  hours: null,
  minReleaseDate: null,
  tags: [],
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
  steamTags?: { id?: number; name: string; englishName?: string }[];
  steamTagsCheckedAt?: number;
  gameModes?: number[];
  durationHours?: number | null;
  durationSamples?: number;
  hltb?: {
    id: number;
    mainHours: number | null;
    extraHours: number | null;
    completionHours: number | null;
    at: number;
  };
  similarIds?: number[];
  releasedAt?: number;
  released?: boolean;
  isGame?: boolean;
  metadataAt?: number;
  reviews?: { positive: number; total: number; at: number };
};
export const steamTagKey = (tag: NonNullable<Game['steamTags']>[number]) =>
  tag.id ? `id:${tag.id}` : `name:${tag.name}`;
export type LibraryOrderBy =
  | 'original'
  | 'name'
  | 'release-newest'
  | 'release-oldest'
  | 'playtime-most'
  | 'playtime-least'
  | 'recent-most'
  | 'duration-shortest'
  | 'duration-longest'
  | 'favorite';
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
  engine?: RecommendationEngine;
  message: string;
  owned: (Pick & { game: Game })[];
  discoveries: (Pick & { game: Game })[];
  at: number;
  warnings: string[];
};
export type Turn = { text: string; filters: Filters; result: Recommendation };
export type HistoryEntry = Turn & { id: string };
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
  codex?: CodexSettings;
  engine?: RecommendationEngine;
  history?: HistoryEntry[];
  conversation: Turn[];
  filters: Filters;
};
export type Setup = {
  steam: boolean;
  family: boolean;
  igdb: boolean;
  hltb?: boolean;
  codex: boolean;
  codexMessage: string;
  codexModel: string;
  codexEffort: CodexEffort;
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
  codex: DEFAULT_CODEX_SETTINGS,
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
export const storyHours = (game: Game) =>
  game.hltb?.mainHours ?? game.durationHours;
export const releaseDateAt = (date: string) => {
  const time = Date.parse(`${date}T00:00:00.000Z`);
  return Number.isFinite(time) &&
    new Date(time).toISOString().slice(0, 10) === date
    ? time
    : null;
};
export const inLibrary = (game: Game) => game.owned || game.shared === true;
export const libraryLabel = (game: Game) =>
  game.owned
    ? 'Propio'
    : game.shared
      ? 'Compartido · Steam Families'
      : 'Descubrimiento';
export function sortLibraryGames(
  games: Game[],
  orderBy: LibraryOrderBy,
  preferences: Record<string, Preference> = {},
) {
  if (orderBy === 'original') return [...games];
  const collator = new Intl.Collator('es', { sensitivity: 'base' });
  const compareKnown = (
    a: number | null | undefined,
    b: number | null | undefined,
    direction: 1 | -1,
  ) =>
    a == null || b == null
      ? a == null
        ? b == null
          ? 0
          : 1
        : -1
      : (a - b) * direction;
  return [...games].sort((a, b) => {
    let result = 0;
    switch (orderBy) {
      case 'name':
        result = collator.compare(a.name, b.name);
        break;
      case 'release-newest':
        result = compareKnown(a.releasedAt, b.releasedAt, -1);
        break;
      case 'release-oldest':
        result = compareKnown(a.releasedAt, b.releasedAt, 1);
        break;
      case 'playtime-most':
        result = compareKnown(a.playtimeMinutes, b.playtimeMinutes, -1);
        break;
      case 'playtime-least':
        result = compareKnown(a.playtimeMinutes, b.playtimeMinutes, 1);
        break;
      case 'recent-most':
        result = compareKnown(a.recentMinutes, b.recentMinutes, -1);
        break;
      case 'duration-shortest':
        result = compareKnown(storyHours(a), storyHours(b), 1);
        break;
      case 'duration-longest':
        result = compareKnown(storyHours(a), storyHours(b), -1);
        break;
      case 'favorite':
        result =
          Number(preferences[String(b.appId)]?.favorite) -
          Number(preferences[String(a.appId)]?.favorite);
        break;
    }
    return result || collator.compare(a.name, b.name) || a.appId - b.appId;
  });
}
