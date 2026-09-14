'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import { cn } from '@/lib/utils';
import {
  STATUS_LABELS,
  type GameStatus,
  type IgdbSearchResult,
} from '@/lib/model';

export type AddGameInput = {
  igdbId: number;
  platform: string;
  status: GameStatus;
};
const platforms = [
  'Battle.net',
  'PlayStation',
  'PlayStation 5',
  'PlayStation 4',
  'Nintendo Switch',
  'Nintendo Switch 2',
  'Xbox',
  'Xbox Series X|S',
  'GOG',
  'Epic Games',
  'EA app',
  'Ubisoft Connect',
  'PC',
];

export function AddGameDialog({
  igdbReady,
  busy,
  onAdd,
  className,
  trigger,
}: {
  igdbReady: boolean;
  busy: boolean;
  onAdd: (input: AddGameInput) => Promise<void>;
  className?: string;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [results, setResults] = useState<IgdbSearchResult[]>([]);
  const [selected, setSelected] = useState<IgdbSearchResult | null>(null);
  const [platform, setPlatform] = useState('Battle.net');
  const [status, setStatus] = useState<GameStatus>('pending');
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !igdbReady || selected || query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(
          `/api/igdb/search?q=${encodeURIComponent(query.trim())}`,
          { signal: controller.signal },
        );
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || 'No se ha podido buscar en IGDB.');
        if (!controller.signal.aborted) setResults(data.games);
      } catch (e) {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : 'No se ha podido buscar en IGDB.',
          );
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, selected, open, igdbReady]);

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (saving) return;
        setOpen(value);
        if (value) {
          setQuery('');
          setResults([]);
          setSelected(null);
          setError('');
          setSearching(false);
          setStatus('pending');
          setSuggestionsOpen(false);
        }
      }}
    >
      {trigger ? (
        <DialogTrigger render={trigger as React.ReactElement} />
      ) : (
        <DialogTrigger
          render={
            <Button
              disabled={busy}
              className={cn('hud-add-game-btn', className)}
            />
          }
        >
          <Plus size={15} /> Añadir juego
        </DialogTrigger>
      )}
      <DialogContent
        className="sm:max-w-lg max-h-[90dvh] overflow-y-auto"
        showCloseButton={!saving}
      >
        <DialogTitle>Añadir un juego</DialogTitle>
        <DialogDescription>
          Busca en IGDB y elige dónde lo tienes y su estado actual.
        </DialogDescription>
        {!igdbReady ? (
          <output>
            Configura Twitch / IGDB en Ajustes y Conexiones para buscar juegos.
          </output>
        ) : (
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!selected || !platform.trim() || saving || busy) return;
              setSaving(true);
              setError('');
              try {
                await onAdd({
                  igdbId: selected.id,
                  platform: platform.trim(),
                  status,
                });
                setOpen(false);
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : 'No se ha podido añadir el juego.',
                );
              } finally {
                setSaving(false);
              }
            }}
          >
            <div className="space-y-2">
              <label htmlFor="add-game-search" className="font-medium">
                Juego
              </label>
              <Combobox
                items={results}
                value={selected}
                inputValue={query}
                filter={null}
                open={suggestionsOpen}
                onOpenChange={setSuggestionsOpen}
                itemToStringLabel={(game: IgdbSearchResult) => game.name}
                isItemEqualToValue={(a, b) => a.id === b.id}
                onValueChange={(game) => {
                  setSelected(game);
                  setSearching(false);
                  setSuggestionsOpen(false);
                }}
                onInputValueChange={(value, details) => {
                  setQuery(value);
                  if (
                    details.reason === 'input-change' ||
                    details.reason === 'input-clear' ||
                    details.reason === 'clear-press'
                  ) {
                    setSelected(null);
                    setResults([]);
                    setError('');
                    setSearching(value.trim().length >= 2);
                    setSuggestionsOpen(value.trim().length >= 2);
                  }
                }}
              >
                <ComboboxInput
                  id="add-game-search"
                  placeholder="Ej. Warcraft"
                  maxLength={100}
                  disabled={saving}
                  showTrigger={false}
                  autoComplete="off"
                />
                <ComboboxContent>
                  <ComboboxEmpty>
                    {searching
                      ? 'Buscando en IGDB…'
                      : query.trim().length < 2
                        ? 'Escribe al menos 2 caracteres.'
                        : error || 'No se encontraron juegos.'}
                  </ComboboxEmpty>
                  <ComboboxList>
                    {(game: IgdbSearchResult) => (
                      <ComboboxItem key={game.id} value={game}>
                        {game.cover && (
                          <Image
                            src={game.cover}
                            alt=""
                            width={40}
                            height={56}
                            unoptimized
                            className="h-14 w-10 shrink-0 rounded object-cover"
                          />
                        )}
                        <span className="min-w-0">
                          <span className="block font-medium">{game.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {[
                              game.releasedAt
                                ? new Date(game.releasedAt).getFullYear()
                                : null,
                              game.platforms.join(', '),
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </span>
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
              {selected && (
                <p className="text-sm text-muted-foreground">
                  Seleccionado: {selected.name}
                  {selected.releasedAt
                    ? ` (${new Date(selected.releasedAt).getFullYear()})`
                    : ''}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label htmlFor="add-game-platform" className="font-medium">
                Plataforma o tienda
              </label>
              <Input
                id="add-game-platform"
                list="game-platforms"
                value={platform}
                onChange={(event) => setPlatform(event.target.value)}
                placeholder="Elige o escribe una plataforma"
                maxLength={80}
                required
                disabled={saving}
              />
              <datalist id="game-platforms">
                {platforms.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </datalist>
            </div>
            <div className="space-y-2">
              <label htmlFor="add-game-status" className="font-medium">
                Estado
              </label>
              <select
                id="add-game-status"
                className="block w-full rounded-md border border-input bg-background px-3 py-2"
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as GameStatus)
                }
                disabled={saving}
              >
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            {error && (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => setOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={!selected || !platform.trim() || saving || busy}
              >
                {saving ? 'Añadiendo…' : 'Añadir a mi biblioteca'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
