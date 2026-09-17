import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { request as httpsRequest } from 'node:https';
import { join } from 'node:path';
import { extractReleaseNotes } from './release-changelog.mjs';

const repo = 'ivangonzalezsp/nextplay-releases';
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
assert.match(version, /^\d+\.\d+\.\d+$/);
const tag = 'v' + version;
if (process.env.GITHUB_REF_TYPE === 'tag')
    assert.equal(process.env.GITHUB_REF_NAME, tag);
const token = process.env.RELEASES_TOKEN;
assert.ok(
    token,
    'Create the private repository Actions secret RELEASES_TOKEN, limited to nextplay-releases (Contents: write).',
);
const names = [`NextPlay-Setup-${version}-x64.exe`, 'SHA256SUMS.txt'];
const assets = await Promise.all(
    names.map((name) => readFile(join('outputs/windows', name))),
);
const digest = createHash('sha256').update(assets[0]).digest('hex');
assert.equal(
    assets[1].toString().trim(),
    `${digest}  ${names[0]}`,
    'Installer checksum mismatch.',
);
const notes = extractReleaseNotes(
    await readFile('CHANGELOG.md', 'utf8'),
    version,
);
async function api(path, method = 'GET', body, binary = false) {
    if (binary)
        return new Promise((resolve, reject) => {
            const request = httpsRequest(
                `https://uploads.github.com/repos/${repo}${path}`,
                {
                    method,
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: 'application/vnd.github+json',
                        'X-GitHub-Api-Version': '2022-11-28',
                        'Content-Type': 'application/octet-stream',
                        'Content-Length': body.length,
                    },
                    timeout: 600_000,
                },
                (response) => {
                    const chunks = [];
                    response.on('data', (chunk) => chunks.push(chunk));
                    response.on('end', () => {
                        try {
                            const payload =
                                Buffer.concat(chunks).toString('utf8');
                            assert.ok(
                                response.statusCode >= 200 &&
                                    response.statusCode < 300,
                                `GitHub ${method} ${path}: HTTP ${response.statusCode}`,
                            );
                            resolve(
                                response.statusCode === 204
                                    ? null
                                    : JSON.parse(payload),
                            );
                        } catch (error) {
                            reject(error);
                        }
                    });
                    response.on('error', reject);
                },
            );
            request.on('timeout', () =>
                request.destroy(new Error(`GitHub upload timed out: ${path}`)),
            );
            request.on('error', reject);
            request.end(body);
        });
    const response = await fetch(
        `https://api.github.com/repos/${repo}${path}`,
        {
            method,
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                ...(body === undefined
                    ? {}
                    : {
                          'Content-Type': binary
                              ? 'application/octet-stream'
                              : 'application/json',
                      }),
            },
            ...(body === undefined
                ? {}
                : { body: binary ? body : JSON.stringify(body) }),
            redirect: 'error',
            signal: AbortSignal.timeout(binary ? 600_000 : 30_000),
        },
    );
    if (response.status === 404 && method === 'GET') return null;
    assert.ok(response.ok, `GitHub ${method} ${path}: HTTP ${response.status}`);
    return response.status === 204 ? null : response.json();
}
const destination = await api('');
assert.equal(
    destination?.private,
    false,
    'The installer repository must be public.',
);
if (!destination.default_branch)
    throw new Error('The installer repository has no default branch.');
if (!(await api(`/git/ref/tags/${tag}`))) {
    const branch = await api(
        `/git/ref/heads/${encodeURIComponent(destination.default_branch)}`,
    );
    assert.ok(
        branch?.object?.sha,
        'The installer repository branch is invalid.',
    );
    await api('/git/refs', 'POST', {
        ref: `refs/tags/${tag}`,
        sha: branch.object.sha,
    });
}
// Drafts keep incomplete uploads out of the anonymous update feed.
let release = await api(`/releases/tags/${tag}`);
if (!release) {
    const drafts = await api('/releases?per_page=100');
    release = drafts.find(
        (candidate) => candidate.draft && candidate.tag_name === tag,
    );
}
if (!release)
    release = await api('/releases', 'POST', {
        tag_name: tag,
        name: `Next Play ${version}`,
        body: notes,
        draft: true,
        prerelease: false,
    });
assert.equal(
    release.draft,
    true,
    'This version is already public. Publish a new version instead of replacing it.',
);
for (const asset of release.assets)
    if (names.includes(asset.name))
        await api(`/releases/assets/${asset.id}`, 'DELETE');
for (let i = 0; i < names.length; i++)
    await api(
        `/releases/${release.id}/assets?name=${encodeURIComponent(names[i])}`,
        'POST',
        assets[i],
        true,
    );
await api(`/releases/${release.id}`, 'PATCH', {
    body: notes,
    draft: false,
    make_latest: 'true',
});
console.log(`Published https://github.com/${repo}/releases/tag/${tag}`);
