import { t as translateMessage } from './i18n.ts';
import { type State } from '../lib/model.ts';
import { EMPTY_TASTES } from '../lib/tastes.ts';
import { parsePreference, parseTastes } from './selection.ts';
import { AppError } from './store.ts';

export function applyWelcome(state: State, payload: Record<string, unknown>) {
    if (
        Object.keys(payload).some(
            (key) =>
                ![
                    'appId',
                    'preference',
                    'overrides',
                    'dismissed',
                    'completed',
                ].includes(key),
        ) ||
        ['dismissed', 'completed'].some(
            (key) =>
                payload[key] !== undefined && typeof payload[key] !== 'boolean',
        )
    )
        throw new AppError(
            translateMessage('Revisa las respuestas de la bienvenida.'),
        );
    let preference;
    if (payload.appId !== undefined) {
        if (
            typeof payload.appId !== 'number' ||
            !Number.isSafeInteger(payload.appId) ||
            !state.games.some(
                (g) =>
                    g.appId === payload.appId &&
                    (g.owned || g.shared) &&
                    g.isGame !== false,
            )
        )
            throw new AppError(
                translateMessage('Ese juego no pertenece a tu biblioteca.'),
            );
        if (payload.preference !== undefined) {
            const patch = payload.preference as Record<string, unknown>;
            if (
                !patch ||
                typeof patch !== 'object' ||
                Array.isArray(patch) ||
                Object.keys(patch).some(
                    (key) =>
                        !['status', 'opinion', 'opinionReason'].includes(key),
                )
            )
                throw new AppError(
                    translateMessage(
                        'La opinión o el estado del juego no es válido.',
                    ),
                );
            preference = parsePreference({
                ...(state.preferences[String(payload.appId)] ?? {
                    favorite: false,
                    status: 'pending',
                }),
                ...patch,
                ...(patch.opinion === null
                    ? { opinion: undefined, opinionReason: undefined }
                    : {}),
                ...(patch.opinionReason === null
                    ? { opinionReason: undefined }
                    : {}),
            });
        }
    } else if (payload.preference !== undefined) {
        throw new AppError(
            translateMessage('Selecciona un juego de tu biblioteca.'),
        );
    }
    const tastes =
        payload.overrides === undefined
            ? undefined
            : parseTastes(
                  {
                      ...(state.tastes ?? EMPTY_TASTES),
                      overrides:
                          payload.overrides &&
                          typeof payload.overrides === 'object' &&
                          !Array.isArray(payload.overrides)
                              ? {
                                    ...state.tastes?.overrides,
                                    ...payload.overrides,
                                }
                              : payload.overrides,
                  },
                  state,
              );
    // These are past experiences with no known dates, so do not create playHistory events.
    if (preference) state.preferences[payload.appId as number] = preference;
    if (tastes) state.tastes = tastes;
    const previous = state.welcome ?? {
        reviewed: [],
        dismissed: false,
        completed: false,
    };
    state.welcome = {
        reviewed:
            payload.appId === undefined
                ? previous.reviewed
                : [...new Set([...previous.reviewed, payload.appId as number])],
        dismissed:
            (payload.dismissed as boolean | undefined) ?? previous.dismissed,
        completed:
            (payload.completed as boolean | undefined) ?? previous.completed,
    };
}
