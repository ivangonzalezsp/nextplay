'use client';

import { useRef, useState, type FocusEvent } from 'react';

export function useGameVideoPreview(appId: number, enabled: boolean) {
    const [active, setActive] = useState(false);
    const [result, setResult] = useState<{
        appId: number;
        videoId: string | null;
        loading: boolean;
    } | null>(null);
    const [revealedAppId, setRevealedAppId] = useState<number | null>(null);
    const cache = useRef(new Map<number, string | null>());
    const requests = useRef(new Map<number, Promise<string | null>>());
    const videoId = result?.appId === appId ? result.videoId : null;
    const loading = result?.appId === appId && result.loading;
    const stop = () => {
        setActive(false);
        setRevealedAppId(null);
    };
    const revealOnLoad = () => {
        setRevealedAppId(appId);
    };

    const start = () => {
        if (!enabled) return;
        setActive(true);
        if (cache.current.has(appId)) {
            setResult({
                appId,
                videoId: cache.current.get(appId) ?? null,
                loading: false,
            });
            return;
        }
        let request = requests.current.get(appId);
        if (!request) {
            request = fetch(`/api/igdb/video?appId=${appId}`)
                .then(async (response) => {
                    if (!response.ok) throw new Error();
                    const data = await response.json();
                    return typeof data.videoId === 'string' &&
                        /^[A-Za-z0-9_-]{11}$/.test(data.videoId)
                        ? data.videoId
                        : null;
                })
                .finally(() => requests.current.delete(appId));
            requests.current.set(appId, request);
        }
        setResult({ appId, videoId: null, loading: true });
        void request
            .then((videoId) => {
                cache.current.set(appId, videoId);
                setResult((current) =>
                    current?.appId === appId
                        ? { appId, videoId, loading: false }
                        : current,
                );
            })
            .catch(() =>
                setResult((current) =>
                    current?.appId === appId
                        ? { appId, videoId: null, loading: false }
                        : current,
                ),
            );
    };

    return {
        active,
        videoId,
        loading,
        revealed: revealedAppId === appId,
        onPointerEnter: start,
        onPointerLeave: stop,
        onFocusCapture: start,
        onFrameLoad: revealOnLoad,
        onBlurCapture: (event: FocusEvent<HTMLElement>) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node))
                stop();
        },
    };
}
