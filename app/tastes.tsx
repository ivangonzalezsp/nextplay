'use client';
import { useMemo, useState } from 'react';
import type { Snapshot, TasteChoice, TasteSettings } from '../lib/model';
import { buildTasteProfile, EMPTY_TASTES } from '../lib/tastes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export default function Tastes({
  state,
  busy,
  onSave,
}: {
  state: Snapshot;
  busy: boolean;
  onSave: (settings: TasteSettings) => Promise<void>;
}) {
  const [draft, setDraft] = useState<TasteSettings>(() =>
    structuredClone(state.tastes ?? EMPTY_TASTES),
  );
  const [search, setSearch] = useState('');
  const profile = useMemo(
    () => buildTasteProfile({ ...state, tastes: draft }),
    [state, draft],
  );
  const changed =
    JSON.stringify(draft) !== JSON.stringify(state.tastes ?? EMPTY_TASTES);
  const games = state.games
    .filter((g) => g.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (b.playtimeMinutes ?? 0) - (a.playtimeMinutes ?? 0))
    .slice(0, search ? 12 : 6);
  const toggle = (id: number) =>
    setDraft({
      ...draft,
      ignoredHours: draft.ignoredHours.includes(id)
        ? draft.ignoredHours.filter((x) => x !== id)
        : [...draft.ignoredHours, id],
    });
  return (
    <form
      className="tastes-panel"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave(draft);
      }}
    >
      <h2>Tus gustos</h2>
      <p>
        Hipótesis basadas en tus horas y favoritos. Las afinidades se reconocen
        en géneros y descripciones de IGDB; pueden ser incompletas o
        equivocadas.
      </p>
      <p className="small-note">
        Varias experiencias pesan más que un único juego. El peso por hora
        disminuye y las ediciones reconocibles cuentan una vez. El peso
        histórico no es una probabilidad de que te guste algo.
      </p>
      <fieldset disabled={busy}>
        <legend className="sr-only">Corregir tus afinidades</legend>
        <div className="taste-grid">
          {profile.map((a) => (
            <section className="taste-card" key={a.id}>
              <h3>{a.label}</h3>
              <p className="small-note">
                Peso histórico: {Math.round(a.inferred * 100)}/100 ·{' '}
                {a.evidence.length} referencias
              </p>
              <label htmlFor={'taste-' + a.id}>Tu preferencia: {a.label}</label>
              <select
                id={'taste-' + a.id}
                className="choice"
                value={a.choice}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    overrides: {
                      ...draft.overrides,
                      [a.id]: e.target.value as TasteChoice,
                    },
                  })
                }
              >
                <option value="auto">Usar la hipótesis del historial</option>
                <option value="like">Me gusta · priorizar</option>
                <option value="neutral">Neutral · no usar esta afinidad</option>
                <option value="dislike">
                  Me atrae poco · reducir prioridad
                </option>
              </select>
              {a.evidence.length ? (
                <ul>
                  {a.evidence.map((e) => (
                    <li key={e.appId}>
                      {e.name} · {e.hours.toLocaleString('es')} h
                      {e.favorite ? ' · favorito explícito' : ''}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="small-note">
                  Sin evidencia suficiente. Puedes indicar tu preferencia
                  igualmente.
                </p>
              )}
            </section>
          ))}
        </div>
        <section className="taste-card">
          <h3>Horas que no representan tus gustos</h3>
          <p>
            Por ejemplo, un juego al que entrabas por tus amigos. Excluir sus
            horas no lo elimina de las recomendaciones. Si lo marcas como
            favorito, esa preferencia sigue contando.
          </p>
          <label htmlFor="taste-search">
            Buscar un juego para excluir sus horas
          </label>
          <Input
            id="taste-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ejemplo: Rust"
          />
          <div className="taste-hours">
            {games.map((g) => (
              <label key={g.appId}>
                <input
                  type="checkbox"
                  checked={draft.ignoredHours.includes(g.appId)}
                  onChange={() => toggle(g.appId)}
                />
                Excluir horas de {g.name} ·{' '}
                {Math.round((g.playtimeMinutes ?? 0) / 60)} h
              </label>
            ))}
          </div>
          {!games.length && <p>Sin coincidencias.</p>}
          {!!draft.ignoredHours.length && (
            <div>
              <h4>Horas excluidas</h4>
              {draft.ignoredHours.map((id) => (
                <Button
                  type="button"
                  variant="ghost"
                  key={id}
                  onClick={() => toggle(id)}
                >
                  Volver a usar:{' '}
                  {state.games.find((g) => g.appId === id)?.name ??
                    `Steam ${id}`}
                </Button>
              ))}
            </div>
          )}
        </section>
        <section className="taste-card">
          <label htmlFor="taste-notes">
            Lo que quieres que Codex recuerde de tus gustos
          </label>
          <Textarea
            id="taste-notes"
            value={draft.notes}
            maxLength={2000}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            placeholder="Rust lo jugaba por mis amigos. Me gusta explorar, pero prefiero evitar repetir combates."
          />
          <p className="small-note">
            Estas notas llegan a Codex en cada búsqueda. Para cambiar los pesos
            de la preselección, usa las afinidades y la exclusión de horas de
            arriba. Tus filtros y la petición actual tienen prioridad.
          </p>
        </section>
        <Button type="submit" disabled={busy || !changed}>
          Guardar mis gustos
        </Button>
        <output className="small-note">
          {changed
            ? 'Cambios sin guardar. Al guardar se reinician las propuestas anteriores.'
            : 'Perfil al día. Tus correcciones guardadas se conservan entre búsquedas y reinicios.'}
        </output>
      </fieldset>
    </form>
  );
}
