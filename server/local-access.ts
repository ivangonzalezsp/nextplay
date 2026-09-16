import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

const header = 'x-nextplay-local-peer';
function secret() {
    return (process.env.NEXTPLAY_LOCAL_SECRET ??=
        randomBytes(32).toString('hex'));
}
export function isLoopback(address?: string) {
    return (
        address === '127.0.0.1' ||
        address === '::1' ||
        address === '::ffff:127.0.0.1'
    );
}
// Only the HTTP listener can attest the peer. Never trust a forwarded address or Host.
export function attestLocalPeer(request: IncomingMessage) {
    delete request.headers[header];
    if (isLoopback(request.socket.remoteAddress))
        request.headers[header] = secret();
}
export function canManage(request: Request) {
    const actual = Buffer.from(request.headers.get(header) ?? '');
    const expected = Buffer.from(secret());
    return (
        actual.length === expected.length && timingSafeEqual(actual, expected)
    );
}
