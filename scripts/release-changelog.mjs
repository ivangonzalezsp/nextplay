import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function findSection(markdown, matches) {
    const lines = markdown.replace(/\r\n/g, '\n').split('\n');
    const start = lines.findIndex((line) => matches(line.trim()));
    if (start < 0)
        throw new Error(
            'No se encontró la sección solicitada en CHANGELOG.md.',
        );
    const end = lines.findIndex(
        (line, index) => index > start && line.trim().startsWith('## ['),
    );
    return { lines, start, end: end < 0 ? lines.length : end };
}

function meaningfulNotes(notes) {
    return notes
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/^###\s+(Features|Correcciones de errores)\s*$/gim, '')
        .replace(/^\s*-\s*Ningun[oa]\.\s*$/gim, '')
        .trim();
}

function assertHasNotes(notes) {
    if (!meaningfulNotes(notes))
        throw new Error(
            'CHANGELOG.md no contiene cambios nuevos en [Unreleased].',
        );
}

export function promoteUnreleased(markdown, version, date) {
    if (!/^\d+\.\d+\.\d+$/.test(version))
        throw new Error(`Versión no válida: ${version}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
        throw new Error(`Fecha no válida: ${date}`);
    const section = findSection(markdown, (line) => line === '## [Unreleased]');
    const notes = section.lines
        .slice(section.start + 1, section.end)
        .join('\n')
        .replace(/<!--[\s\S]*?-->/g, '')
        .trim();
    assertHasNotes(notes);
    const updated = [
        ...section.lines.slice(0, section.start),
        '## [Unreleased]',
        '',
        `## [${version}] - ${date}`,
        '',
        notes,
        '',
        ...section.lines.slice(section.end),
    ];
    return `${updated.join('\n').replace(/\n+$/, '')}\n`;
}

export function extractReleaseNotes(markdown, version) {
    const heading = `## [${version}]`;
    const section = findSection(
        markdown,
        (line) => line === heading || line.startsWith(`${heading} -`),
    );
    const notes = section.lines
        .slice(section.start + 1, section.end)
        .join('\n')
        .replace(/<!--[\s\S]*?-->/g, '')
        .trim();
    if (!notes)
        throw new Error(
            `La versión ${version} no tiene notas en CHANGELOG.md.`,
        );
    return notes;
}

const isMain =
    process.argv[1] &&
    pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
    const { version } = JSON.parse(await readFile('package.json', 'utf8'));
    const date =
        process.env.RELEASE_DATE ?? new Date().toISOString().slice(0, 10);
    const changelog = await readFile('CHANGELOG.md', 'utf8');
    await writeFile(
        'CHANGELOG.md',
        promoteUnreleased(changelog, version, date),
    );
    console.log(`CHANGELOG.md actualizado para ${version}.`);
}
