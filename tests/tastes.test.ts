import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { EMPTY_STATE, DEFAULT_FILTERS } from '../lib/model.ts';
import type { Game, State } from '../lib/model.ts';
import {
    EMPTY_TASTES,
    buildTasteProfile,
    affinityScore,
    hoursWeight,
    tasteEvidence,
    gameAffinities,
    gameAffinitySignals,
} from '../lib/tastes.ts';
import { parseTastes, selectCandidates } from '../server/selection.ts';
import { buildPrompt } from '../server/codex.ts';
import { handle } from '../server/api.ts';
import { readState, saveState } from '../server/store.ts';

const game = (
    id: number,
    hours = 50,
    summary = 'Build a factory and automate production.',
    steamTags?: Game['steamTags'],
): Game => ({
    appId: id,
    name: 'Game ' + id,
    owned: true,
    playtimeMinutes: hours * 60,
    recentMinutes: 0,
    summary,
    ...(steamTags ? { steamTags } : {}),
});
const state = (games: Game[]): State => ({
    ...structuredClone(EMPTY_STATE),
    games,
});

void test('hours diminish, independent games reinforce affinity, editions and ignored hours do not duplicate it', () => {
    assert(
        hoursWeight(500) - hoursWeight(300) < hoursWeight(50) - hoursWeight(5),
    );
    const s = state([game(1, 500)]);
    const weight = (s: State) =>
        buildTasteProfile(s).find((a) => a.id === 'automation')!.inferred;
    assert(weight(state([game(1), game(2), game(3)])) > weight(s));
    s.games.push({ ...game(2, 500), name: 'Game 1: Complete Edition' });
    assert.equal(tasteEvidence(s).length, 1);
    s.tastes = { ...EMPTY_TASTES, ignoredHours: [1, 2] };
    assert.equal(weight(s), 0);
    s.preferences['1'] = { favorite: true, status: 'pending' };
    assert(
        weight(s) > 0,
        'explicit favorite still counts when hours are excluded',
    );
    s.preferences['1'].status = 'ignored';
    assert.equal(weight(s), 0);
    assert.equal(weight(state([game(4, 0)])), 0);
    assert.equal(weight(state([{ ...game(4), summary: undefined }])), 0);
    assert.equal(
        weight(
            state([
                game(
                    4,
                    50,
                    'A sequel to Automata, featuring automatic weapons.',
                ),
            ]),
        ),
        0,
    );
    assert(
        !gameAffinities(
            game(5, 50, 'Combat relies on resource management for ammo.'),
        ).includes('automation'),
    );
    assert(
        gameAffinities(game(6, 50, 'A multiplayer roguelike.')).includes(
            'synergies',
        ),
    );
    assert(
        gameAffinities(
            game(7, 50, 'A calm adventure.', [
                { id: 5507, name: 'Automatización', englishName: 'Automation' },
            ]),
        ).includes('automation'),
    );
});
void test('structured Steam evidence is translated, deduplicated and stronger than description-only matches', () => {
    const tagged = game(1, 50, '', [
        { id: 255534, name: 'Automatización' },
        { id: 255534, name: 'Automatización', englishName: 'Automation' },
        { id: 12472, name: 'Gestión' },
    ]);
    const signal = gameAffinitySignals(tagged).find(
        (a) => a.id === 'automation',
    )!;
    assert.equal(signal.strength, 1);
    assert.deepEqual(signal.sources, [
        'Steam: Automatización',
        'Steam: Gestión',
    ]);
    const weight = (g: Game) =>
        buildTasteProfile(state([g])).find((a) => a.id === 'automation')!
            .inferred;
    const genre = {
        ...game(2, 50, ''),
        genres: [{ id: 1, name: 'Base Building' }],
    };
    assert(weight(tagged) > weight(genre));
    assert(weight(genre) > weight(game(3)));
    assert.equal(
        weight(tagged),
        weight({ ...tagged, steamTags: tagged.steamTags!.slice(0, 1) }),
    );
    assert.deepEqual(
        gameAffinities(
            game(4, 0, '', [
                { id: 122, name: 'Rol' },
                { id: 1742, name: 'Buena trama' },
                { id: 4026, name: 'Implacables' },
            ]),
        ),
        ['progression', 'challenge', 'narrative'],
    );
    assert.deepEqual(
        gameAffinities(
            game(5, 0, '', [{ name: 'RPG' }, { name: 'Story Rich' }]),
        ),
        ['progression', 'narrative'],
    );
    assert(
        !gameAffinities(
            game(6, 0, 'Make a difficult choice about automatic weapons.'),
        ).includes('challenge'),
    );
    const s = state([tagged]);
    s.tastes = { ...EMPTY_TASTES, overrides: { automation: 'like' } };
    const profile = buildTasteProfile(s);
    assert(affinityScore(tagged, profile) > affinityScore(game(3), profile));
    assert(affinityScore(tagged, profile) <= 16);
});
void test('weights use the whole played history, respect unknown data and give short games bounded evidence', () => {
    const tagged = (id: number, hours = 50) =>
        game(id, hours, '', [{ id: 255534, name: 'Automatización' }]);
    const affinity = (s: State) =>
        buildTasteProfile(s).find((a) => a.id === 'automation')!;
    const s = state(Array.from({ length: 6 }, (_, i) => tagged(i + 1)));
    const six = affinity(s);
    assert.equal(six.evidenceCount, 6);
    assert.equal(six.evidence.length, 5);
    assert(six.inferred > affinity(state(s.games.slice(0, 5))).inferred);
    s.games.push(tagged(7, 0), { ...game(8), summary: undefined });
    assert.equal(
        affinity(s).inferred,
        six.inferred,
        'unplayed and unknown games do not dilute the profile',
    );
    s.games.push(game(9, 50, '', [{ id: 1742, name: 'Buena trama' }]));
    assert(
        affinity(s).inferred < six.inferred,
        'other played tastes contribute to the denominator',
    );
    assert(
        six.inferred <
            affinity(state(Array.from({ length: 20 }, (_, i) => tagged(i + 1))))
                .inferred,
    );
    const short = { ...tagged(20, 5), durationHours: 5 };
    const long = { ...tagged(21, 50), durationHours: 50 };
    assert.equal(
        tasteEvidence(state([short]))[0].weight,
        tasteEvidence(state([long]))[0].weight,
    );
    assert(
        tasteEvidence(state([short]))[0].weight >
            tasteEvidence(state([tagged(20, 5)]))[0].weight,
    );
    const hltb = {
        ...short,
        durationHours: 100,
        hltb: {
            id: 1,
            mainHours: 5,
            extraHours: null,
            completionHours: null,
            at: 1,
        },
    };
    assert.equal(
        tasteEvidence(state([hltb]))[0].weight,
        tasteEvidence(state([short]))[0].weight,
    );
    const ignored = state([short]);
    ignored.tastes = { ...EMPTY_TASTES, ignoredHours: [20] };
    assert.equal(affinity(ignored).inferred, 0);
    ignored.preferences['20'] = { favorite: true, status: 'pending' };
    assert.equal(tasteEvidence(ignored)[0].weight, 2);
    ignored.preferences['20'].status = 'abandoned';
    assert.equal(affinity(ignored).inferred, 0);
    assert.equal(affinity(state([{ ...short, isGame: false }])).inferred, 0);
    assert(
        buildTasteProfile(s).every((a) => a.inferred >= 0 && a.inferred <= 1),
    );
});
void test('corrections change shortlist, remain soft, and never beat favorites or hard exclusions', () => {
    const s = state(
        Array.from({ length: 42 }, (_, i) =>
            game(i + 1, 0, 'Turn-based strategy and tactical combat.'),
        ),
    );
    const factory = game(100, 0);
    s.games.push(factory);
    s.tastes = {
        ...EMPTY_TASTES,
        overrides: { automation: 'like', tactics: 'dislike' },
    };
    const candidates = selectCandidates(s, [], DEFAULT_FILTERS);
    assert.equal(candidates[0].appId, 100);
    assert(
        candidates.some((g) => g.appId === 1),
        'dislike is not exclusion',
    );
    const profile = buildTasteProfile(s);
    assert(affinityScore(factory, profile) > 0);
    s.tastes.overrides.automation = 'neutral';
    assert.equal(affinityScore(factory, buildTasteProfile(s)), 0);
    s.preferences['1'] = { favorite: true, status: 'pending' };
    assert.equal(selectCandidates(s, [], DEFAULT_FILTERS)[0].appId, 1);
    s.preferences['100'] = { favorite: true, status: 'ignored' };
    assert(
        !selectCandidates(s, [], DEFAULT_FILTERS, 'Game 100').some(
            (g) => g.appId === 100,
        ),
    );
    assert.equal(
        selectCandidates(s, [], { ...DEFAULT_FILTERS, mode: 'next', hours: 1 })
            .length,
        0,
    );
    assert.throws(() =>
        parseTastes({ ...EMPTY_TASTES, overrides: { unknown: 'like' } }, s),
    );
    assert.throws(() =>
        parseTastes({ ...EMPTY_TASTES, ignoredHours: [9999] }, s),
    );
});
void test('API corrections survive reload and new searches, reach Codex, and invalid updates preserve disk', async () => {
    const root = resolve(tmpdir());
    const dir = await mkdtemp(join(root, 'nextplay-tastes-'));
    const oldDir = process.env.NEXTPLAY_DATA_DIR,
        oldBinary = process.env.NEXTPLAY_CODEX_BIN;
    process.env.NEXTPLAY_DATA_DIR = dir;
    process.env.NEXTPLAY_CODEX_BIN = join(dir, 'missing.exe');
    try {
        await saveState(state([game(1), game(2)]));
        const call = (path: string, method: string, body: unknown) =>
            handle(
                new Request('http://localhost:3000/api/' + path, {
                    method,
                    headers: {
                        'Content-Type': 'application/json',
                        Origin: 'http://localhost:3000',
                    },
                    body: JSON.stringify(body),
                }),
            );
        const settings = {
            overrides: { automation: 'like' },
            ignoredHours: [1],
            notes: 'Jugaba con mis amigos; ahora prefiero automatizar.',
        };
        const response = await call('tastes', 'PATCH', settings);
        assert.equal(response.status, 200);
        const saved = await readState();
        assert.deepEqual(saved.tastes, settings);
        const prompt = buildPrompt(
            saved,
            saved.games,
            DEFAULT_FILTERS,
            'Una partida tranquila',
        );
        const data = JSON.parse(prompt.split('DATOS_JSON:\n')[1]);
        assert.equal(data.tasteNotes, settings.notes);
        assert.deepEqual(data.ignoredHours, [1]);
        assert.equal(
            data.tasteProfile.find((a: { id: string }) => a.id === 'automation')
                .choice,
            'like',
        );
        assert(
            !data.tasteProfile
                .flatMap((a: { evidence: { appId: number }[] }) => a.evidence)
                .some((e: { appId: number }) => e.appId === 1),
        );
        assert.equal(
            (
                await call('conversation/reset', 'POST', {
                    filters: DEFAULT_FILTERS,
                })
            ).status,
            200,
        );
        assert.deepEqual((await readState()).tastes, settings);
        const before = await readFile(join(dir, 'library.sqlite'));
        assert.equal(
            (
                await call('tastes', 'PATCH', {
                    ...settings,
                    notes: 'x'.repeat(2001),
                })
            ).status,
            400,
        );
        assert.deepEqual(await readFile(join(dir, 'library.sqlite')), before);
    } finally {
        if (oldDir === undefined) delete process.env.NEXTPLAY_DATA_DIR;
        else process.env.NEXTPLAY_DATA_DIR = oldDir;
        if (oldBinary === undefined) delete process.env.NEXTPLAY_CODEX_BIN;
        else process.env.NEXTPLAY_CODEX_BIN = oldBinary;
        if (dir.startsWith(join(root, 'nextplay-tastes-')))
            await rm(dir, { recursive: true, force: true });
    }
});
