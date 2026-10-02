import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { updateDocker } from '../scripts/update-docker.mjs';

void test('Docker update builds latest main before stopping and aborts on build or backup failure', () => {
    const directory = mkdtempSync(join(tmpdir(), 'nextplay-update-'));
    try {
        const calls: string[][] = [];
        updateDocker(directory, (_command, args) => {
            calls.push(args);
            return { status: 0 };
        });
        assert.deepEqual(
            calls.map((args) => args.slice(0, 2)),
            [
                ['compose', 'config'],
                ['build', '--pull'],
                ['compose', 'stop'],
                ['compose', 'cp'],
                ['compose', 'up'],
                ['compose', 'logs'],
            ],
        );
        assert.equal(
            calls[1].at(-1),
            'https://github.com/ivangonzalezsp/nextplay.git#main',
        );
        const failedCalls: string[][] = [];
        assert.throws(
            () =>
                updateDocker(directory, (_command, args) => {
                    failedCalls.push(args);
                    return { status: args[1] === 'cp' ? 1 : 0 };
                }),
            /failed/,
        );
        assert.equal(failedCalls.length, 4);
        assert.equal(
            failedCalls.some((args) => args[1] === 'up'),
            false,
        );
        const buildCalls: string[][] = [];
        assert.throws(
            () =>
                updateDocker(directory, (_command, args) => {
                    buildCalls.push(args);
                    return { status: args[0] === 'build' ? 1 : 0 };
                }),
            /failed/,
        );
        assert.equal(buildCalls.length, 2);
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});
