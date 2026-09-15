import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { THEMES, THEME_INIT_SCRIPT, resolveTheme } from '../lib/themes.ts';

void test('theme restoration validates saved values and tolerates blocked storage', () => {
    for (const saved of [
        ...THEMES.map((theme) => theme.id),
        null,
        'removed-theme',
        '<script>',
    ]) {
        const document = { documentElement: { dataset: { theme: '' } } };
        runInNewContext(THEME_INIT_SCRIPT, {
            document,
            localStorage: { getItem: () => saved },
        });
        assert.equal(
            document.documentElement.dataset.theme,
            resolveTheme(saved),
        );
        if (!THEMES.some((theme) => theme.id === saved))
            assert.equal(resolveTheme(saved), 'default');
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
    assert.equal(document.documentElement.dataset.theme, 'default');
});
