import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { IncomingMessage } from 'node:http';
import { attestLocalPeer } from '../server/local-access.ts';
import { manageDrive } from '../server/google-drive.ts';
import { validateBackup } from '../server/library-backup.ts';
import {
    atomicJson,
    exclusive,
    readState,
    saveState,
} from '../server/store.ts';
import { openDatabase, storeState } from '../server/database.ts';
import { EMPTY_STATE } from '../lib/model.ts';
import type { DriveBackup, DriveStatus } from '../lib/google-drive.ts';

function request(path: string, method = 'POST', local = true) {
    const incoming = {
        headers: {},
        socket: { remoteAddress: local ? '127.0.0.1' : '192.168.1.2' },
    } as unknown as IncomingMessage;
    attestLocalPeer(incoming);
    return new Request('http://127.0.0.1:3010/api/drive/' + path, {
        method,
        headers: incoming.headers as HeadersInit,
    });
}

void test('Drive authorization, export and restore preserve data and reject unsafe imports', async (t) => {
    const base = resolve('work/drive-tests');
    await mkdir(base, { recursive: true });
    const folder = await mkdtemp(join(base, 'profile-'));
    const previousEnv = { ...process.env };
    const realFetch = globalThis.fetch;
    process.env.NEXTPLAY_DATA_DIR = join(folder, 'data');
    process.env.NEXTPLAY_USER_DIR = folder;
    t.after(async () => {
        await manageDrive(request('cancel'), {});
        process.env = previousEnv;
        globalThis.fetch = realFetch;
        await rm(folder, { recursive: true, force: true });
    });
    const call = <T = DriveStatus>(
        path: string,
        payload = {},
        method = 'POST',
    ) => manageDrive(request(path, method), payload) as Promise<T>;
    await atomicJson(join(folder, 'settings.json'), {
        connections: { STEAM_API_KEY: 'personal-secret' },
    });
    await saveState({
        ...structuredClone(EMPTY_STATE),
        games: [
            {
                appId: -42,
                name: 'Manual game',
                owned: true,
                playtimeMinutes: null,
                recentMinutes: null,
            },
        ],
        preferences: { '-42': { status: 'completed', favorite: true } },
        playHistory: [
            { appId: -42, name: 'Manual game', kind: 'completed', at: 2 },
        ],
        history: [
            {
                id: 'saved',
                text: 'Recommendation',
                filters: structuredClone(EMPTY_STATE.filters),
                result: {
                    at: 1,
                    message: 'Saved',
                    owned: [],
                    discoveries: [],
                    warnings: [],
                },
            },
        ],
    });
    await assert.rejects(manageDrive(request('export', 'POST', false), {}), {
        status: 403,
    });
    assert.deepEqual(await manageDrive(request('status', 'GET', false), {}), {
        canManage: false,
        configured: false,
        connected: false,
        pending: false,
    });
    await assert.rejects(
        call('configure', {
            installed: {
                client_id: 'https://evil.invalid',
                client_secret: 'x',
            },
        }),
    );
    await call('configure', {
        installed: {
            client_id: 'test.apps.googleusercontent.com',
            client_secret: 'test-secret',
        },
    });
    const auth = new URL((await call<{ url: string }>('connect')).url);
    assert.equal(auth.origin, 'https://accounts.google.com');
    assert.equal(
        auth.searchParams.get('scope'),
        'https://www.googleapis.com/auth/drive.file',
    );
    assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');
    const redirect = new URL(auth.searchParams.get('redirect_uri')!);
    assert.equal(redirect.hostname, '127.0.0.1');
    const invalid = new URL(redirect);
    invalid.searchParams.set('state', 'forged');
    invalid.searchParams.set('code', 'fake');
    assert.equal((await realFetch(invalid)).status, 400);
    let exported: Uint8Array | undefined;
    let download: Uint8Array | undefined;
    let foreign = false;
    let pages = 0;
    globalThis.fetch = async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input);
        if (url.hostname === 'oauth2.googleapis.com') {
            const params = init!.body as URLSearchParams;
            if (params.get('grant_type') === 'authorization_code') {
                assert.equal(params.get('code'), 'valid-code');
                const { createHash } = await import('node:crypto');
                assert.equal(
                    createHash('sha256')
                        .update(params.get('code_verifier')!)
                        .digest('base64url'),
                    auth.searchParams.get('code_challenge'),
                );
                return Response.json({
                    access_token: 'access-secret',
                    refresh_token: 'refresh-secret',
                    scope: auth.searchParams.get('scope'),
                });
            }
            assert.equal(params.get('refresh_token'), 'refresh-secret');
            return Response.json({ access_token: 'access-secret' });
        }
        assert.equal(
            new Headers(init!.headers).get('Authorization'),
            'Bearer access-secret',
        );
        if (url.pathname.startsWith('/upload/')) {
            if (init?.method === 'POST') {
                assert.deepEqual(
                    JSON.parse(init.body as string).appProperties,
                    {
                        nextplayBackup: '1',
                    },
                );
                return new Response(null, {
                    headers: {
                        location: 'https://www.googleapis.com/upload/session',
                    },
                });
            }
            exported = init!.body as Uint8Array;
            return Response.json({ id: 'backup-1' });
        }
        if (url.pathname.endsWith('/backup-1')) {
            if (url.searchParams.get('alt') === 'media')
                return new Response(
                    download ? new Uint8Array(download) : undefined,
                );
            return Response.json({
                appProperties: { nextplayBackup: foreign ? 'other' : '1' },
                size: String(download?.length),
            });
        }
        pages++;
        return Response.json({
            files: [{ id: 'backup-' + pages, name: 'copy.sqlite' }],
            ...(url.searchParams.has('pageToken')
                ? {}
                : { nextPageToken: 'next' }),
        });
    };
    const callback = new URL(redirect);
    callback.searchParams.set('state', auth.searchParams.get('state')!);
    callback.searchParams.set('code', 'valid-code');
    assert.equal((await realFetch(callback)).status, 200);
    assert.equal((await call('status', {}, 'GET')).connected, true);
    assert.equal(
        JSON.stringify(await call('status', {}, 'GET')).includes('secret'),
        false,
    );
    const before = await readState();
    await call('export');
    assert.ok(exported);
    assert.equal(
        Buffer.from(exported).subarray(0, 16).toString(),
        'SQLite format 3\0',
    );
    assert.equal(
        Buffer.from(exported).includes(Buffer.from('personal-secret')),
        false,
    );
    assert.equal(
        (await call<{ files: DriveBackup[] }>('backups', {}, 'GET')).files
            .length,
        2,
    );
    assert.equal(pages, 2);
    await saveState({
        ...before,
        filters: { ...before.filters, replay: true },
    });
    download = exported;
    foreign = true;
    await assert.rejects(
        call('restore', { id: 'backup-1' }),
        /Selecciona una copia/,
    );
    foreign = false;
    await assert.rejects(call('restore', { id: '../bad' }));
    await assert.rejects(
        exclusive(() => call('restore', { id: 'backup-1' })),
        { status: 409 },
    );
    download = new Uint8Array([1, 2, 3]);
    await assert.rejects(call('restore', { id: 'backup-1' }));
    assert.equal((await readState()).filters.replay, true);
    download = exported;
    await call('restore', { id: 'backup-1' });
    assert.deepEqual(await readState(), before);
    const backups = await readdir(join(folder, 'data/backups'));
    assert.equal(backups.length, 1);
    const recovery = openDatabase(
        join(folder, 'data/backups', backups[0]),
        true,
    );
    try {
        assert.equal(
            Object.values(recovery.prepare('PRAGMA integrity_check').get()!)[0],
            'ok',
        );
        assert.equal(
            JSON.parse(
                String(
                    recovery.prepare('SELECT data FROM app_state').get()!.data,
                ),
            ).filters.replay,
            true,
        );
    } finally {
        recovery.close();
    }
    assert.match(
        await readFile(join(folder, 'settings.json'), 'utf8'),
        /personal-secret/,
    );
    const malicious = join(folder, 'malicious.sqlite');
    const db = openDatabase(malicious);
    storeState(db, structuredClone(EMPTY_STATE));
    db.exec(
        'CREATE TRIGGER malicious AFTER INSERT ON games BEGIN DELETE FROM app_state; END',
    );
    db.close();
    assert.throws(
        () => validateBackup(malicious, join(folder, 'expected.sqlite')),
        /dañada o no es compatible/,
    );
    await call('disconnect');
    assert.equal((await call('status', {}, 'GET')).connected, false);
    assert.doesNotMatch(
        await readFile(join(folder, 'google-drive.json'), 'utf8'),
        /refresh-secret/,
    );
    await assert.rejects(call('export'), /Conecta primero/);
    const cancelled = new URL((await call<{ url: string }>('connect')).url);
    const cancelledCallback = new URL(
        cancelled.searchParams.get('redirect_uri')!,
    );
    cancelledCallback.searchParams.set(
        'state',
        cancelled.searchParams.get('state')!,
    );
    cancelledCallback.searchParams.set('error', 'access_denied');
    assert.equal((await realFetch(cancelledCallback)).status, 400);
    assert.equal((await call('status', {}, 'GET')).connected, false);
    assert.equal((await call('status', {}, 'GET')).pending, false);
    assert.ok((await call('status', {}, 'GET')).error);
    await call('connect');
    await call('cancel');
    assert.equal((await call('status', {}, 'GET')).pending, false);
});
