import test from 'node:test';
import assert from 'node:assert/strict';
import {
    extractReleaseNotes,
    promoteUnreleased,
} from '../scripts/release-changelog.mjs';

const changelog = `# Changelog

## [Unreleased]

<!-- instrucciones -->
### Features

- Nueva actividad.

### Correcciones de errores

- Ninguno.

## [0.4.0] - 2026-09-17

### Features

- Versión anterior.
`;

void test('promotes unreleased entries and extracts the release section', () => {
    const promoted = promoteUnreleased(changelog, '0.5.0', '2026-09-18');
    assert.match(promoted, /## \[Unreleased\]\n\n## \[0\.5\.0\] - 2026-09-18/);
    assert.equal(
        extractReleaseNotes(promoted, '0.5.0'),
        '### Features\n\n- Nueva actividad.\n\n### Correcciones de errores\n\n- Ninguno.',
    );
});

void test('rejects a release with only placeholders', () => {
    assert.throws(
        () =>
            promoteUnreleased(
                '## [Unreleased]\n\n### Features\n\n- Ninguno.\n\n### Correcciones de errores\n\n- Ninguna.\n',
                '0.5.0',
                '2026-09-18',
            ),
        /no contiene cambios nuevos/,
    );
});
