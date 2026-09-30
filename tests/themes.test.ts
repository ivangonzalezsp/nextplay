import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import {
    DEFAULT_THEME,
    THEMES,
    THEME_INIT_SCRIPT,
    resolveTheme,
} from '../lib/themes.ts';

void test('immersive palettes persist and removed themes fall back safely', () => {
    assert.equal(THEMES[0].id, DEFAULT_THEME);
    assert.ok(THEMES.every((theme) => theme.id.startsWith('cinema')));

    for (const saved of THEMES.map((theme) => theme.id)) {
        const document = { documentElement: { dataset: { theme: '' } } };
        runInNewContext(THEME_INIT_SCRIPT, {
            document,
            localStorage: { getItem: () => saved },
        });
        assert.equal(
            document.documentElement.dataset.theme,
            resolveTheme(saved),
        );
    }

    for (const saved of [
        null,
        'default',
        'steam',
        'ps5',
        'switch2',
        'removed-theme',
        '<script>',
    ]) {
        const document = { documentElement: { dataset: { theme: '' } } };
        runInNewContext(THEME_INIT_SCRIPT, {
            document,
            localStorage: { getItem: () => saved },
        });
        assert.equal(resolveTheme(saved), DEFAULT_THEME);
        assert.equal(document.documentElement.dataset.theme, DEFAULT_THEME);
    }

    const document = { documentElement: { dataset: { theme: '' } } };
    runInNewContext(THEME_INIT_SCRIPT, {
        document,
        localStorage: {
            getItem() {
                throw Error('blocked');
            },
        },
    });
    assert.equal(document.documentElement.dataset.theme, DEFAULT_THEME);
});
