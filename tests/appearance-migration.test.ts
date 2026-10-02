import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { THEMES } from '../lib/themes.ts';

const source = await readFile('public/migrate-appearance.js', 'utf8');
function page(
    values: Record<string, string>,
    hostname = '127.0.0.1',
    fail = false,
) {
    const elements = Object.fromEntries(
        ['status', 'retry', 'alternate', 'defaults'].map((id) => [
            id,
            { hidden: true, textContent: '', href: '', addEventListener() {} },
        ]),
    );
    const sent: unknown[] = [];
    const context = {
        document: { getElementById: (id: string) => elements[id] },
        localStorage: { getItem: (key: string) => values[key] ?? null },
        location: {
            hostname,
            href: `http://${hostname}:3001/migrate-appearance.html`,
        },
        URL,
        fetch: async (_url: string, options: { body: string }) => {
            sent.push(JSON.parse(options.body));
            return {
                ok: !fail,
                status: 403,
                json: async () => ({
                    error: 'Origen de solicitud no permitido.',
                }),
            };
        },
    };
    runInNewContext(source, context);
    return { elements, sent, context };
}

void test('browser migration preserves every supported theme and normalizes obsolete preferences without changing storage', async () => {
    for (const theme of THEMES) {
        const values = {
            'nextplay-language': 'en',
            'nextplay-theme': theme.id,
        };
        const { sent, elements } = page(values);
        await new Promise<void>((done) => setImmediate(done));
        assert.deepEqual(sent, [{ language: 'en', theme: theme.id }]);
        assert.match(elements.status.textContent, /Your preferences are ready/);
        assert.deepEqual(values, {
            'nextplay-language': 'en',
            'nextplay-theme': theme.id,
        });
    }
    const values = { 'nextplay-language': 'old', 'nextplay-theme': 'legacy' };
    const { sent } = page(values);
    await new Promise<void>((done) => setImmediate(done));
    assert.deepEqual(sent, [{ language: 'es', theme: 'cinema' }]);
    assert.equal(values['nextplay-theme'], 'legacy');
});

void test('empty browser origin offers the other origin and requires explicitly continuing with defaults', async () => {
    for (const hostname of ['127.0.0.1', 'localhost']) {
        const { elements, sent, context } = page({}, hostname);
        assert.deepEqual(sent, []);
        assert.equal(elements.defaults.hidden, false);
        assert.equal(elements.alternate.hidden, false);
        assert.equal(
            new URL(elements.alternate.href).hostname,
            hostname === 'localhost' ? '127.0.0.1' : 'localhost',
        );
        await runInNewContext('migrateAppearance(true)', context);
        assert.deepEqual(sent, [{}]);
        assert.equal(elements.defaults.hidden, true);
        assert.equal(elements.alternate.hidden, true);
    }
});

void test('failed migration exposes the API error and allows retrying', async () => {
    const { elements } = page({ 'nextplay-language': 'es' }, 'localhost', true);
    await new Promise<void>((done) => setImmediate(done));
    assert.equal(elements.retry.hidden, false);
    assert.match(
        elements.status.textContent,
        /Origen de solicitud no permitido/,
    );
});
