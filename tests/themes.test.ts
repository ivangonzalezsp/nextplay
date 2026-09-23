import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import {
    DEFAULT_THEME,
    THEMES,
    THEME_INIT_SCRIPT,
    resolveTheme,
} from '../lib/themes.ts';

void test('immersive is the fallback while saved themes, including legacy, persist', () => {
    assert.equal(THEMES[0].id, DEFAULT_THEME);
    assert.equal(
        THEMES.find((theme) => theme.id === 'default')?.label,
        'Legacy',
    );

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

    for (const saved of [null, 'removed-theme', '<script>']) {
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
