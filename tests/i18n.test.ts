import test from 'node:test';
import assert from 'node:assert/strict';
import { translate, resolveLanguage } from '../lib/i18n.ts';
import { withRequestLanguage, requestLanguage, t } from '../server/i18n.ts';
import { handle } from '../server/api.ts';
import { buildPrompt } from '../server/codex.ts';
import { recommendLocally } from '../server/selection.ts';
import { DEFAULT_FILTERS, EMPTY_STATE } from '../lib/model.ts';
import { libraryStats } from '../lib/stats.ts';
import { gameAffinitySignals } from '../lib/tastes.ts';

void test('language fallback, translated labels, and personal text', () => {
    assert.equal(resolveLanguage('en'), 'en');
    for (const value of ['es', 'fr', null, '<script>'])
        assert.equal(resolveLanguage(value), 'es');
    assert.equal(translate('Estoy jugando', 'en'), 'Playing');
    assert.equal(translate('Estoy jugando', 'es'), 'Estoy jugando');
    assert.equal(
        translate('My own note: Baldur’s Gate 3', 'en'),
        'My own note: Baldur’s Gate 3',
    );
});

void test('translated Steam evidence and statistics preserve identities, counts, and source data', () => {
    const game = {
        appId: 1,
        name: 'Test',
        owned: true,
        playtimeMinutes: 60,
        recentMinutes: 0,
        steamTags: [
            { id: 1695, name: 'Mundo abierto', englishName: 'Open World' },
        ],
    };
    const state = { games: [game], preferences: {} };
    assert.equal(libraryStats(state, 'en').topTags[0].name, 'Open World');
    assert.equal(libraryStats(state, 'es').topTags[0].name, 'Mundo abierto');
    assert.equal(libraryStats(state, 'en').topTags[0].minutes, 60);
    assert.deepEqual(
        gameAffinitySignals(game, 'en').find(
            (signal) => signal.id === 'exploration',
        )?.sources,
        ['Steam: Open World'],
    );
    assert.equal(game.steamTags[0].name, 'Mundo abierto');
    assert.equal(game.steamTags[0].id, 1695);
});

void test('concurrent requests keep their language, including local and AI recommendations', async () => {
    await Promise.all(
        (['en', 'es'] as const).map((language) =>
            withRequestLanguage(
                new Request('http://localhost/api/recommendations', {
                    headers: { 'Accept-Language': language },
                }),
                async () => {
                    await new Promise((resolve) =>
                        setTimeout(resolve, language === 'en' ? 15 : 5),
                    );
                    assert.equal(requestLanguage(), language);
                    assert.equal(
                        t('Guardar'),
                        language === 'en' ? 'Save' : 'Guardar',
                    );
                    const prompt = buildPrompt(
                        EMPTY_STATE,
                        [],
                        DEFAULT_FILTERS,
                        '',
                        undefined,
                        'direct',
                    );
                    assert.ok(
                        prompt.includes(
                            `Responde en ${language === 'en' ? 'inglés' : 'español'}`,
                        ),
                    );
                    assert.equal(
                        recommendLocally(EMPTY_STATE, DEFAULT_FILTERS).message,
                        translate(
                            'No hay juegos con datos suficientes que cumplan estos filtros. Prueba otro género, quita el límite de duración o incluye juegos terminados.',
                            language,
                        ),
                    );
                },
            ),
        ),
    );
    assert.equal(requestLanguage(), 'es');
});

void test('API and streaming validation errors use the requested language', async () => {
    for (const language of ['en-GB,en;q=0.9', 'es-ES,es;q=0.9']) {
        for (const path of ['recommendations', 'recommendations/stream']) {
            const response = await handle(
                new Request(`http://localhost/api/${path}`, {
                    method: 'POST',
                    headers: {
                        'Accept-Language': language,
                        'Content-Type': 'text/plain',
                        Origin: 'http://localhost',
                    },
                    body: '{}',
                }),
            );
            const content = await response.text();
            assert.ok(
                content.includes(
                    language.startsWith('en')
                        ? 'A JSON request is required.'
                        : 'Se requiere una solicitud JSON.',
                ),
            );
        }
    }
});
