import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeftIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  LockClosedIcon,
} from '@heroicons/react/24/outline';
import { supabase } from '../../lib/supabase';
import type { Confrontation, Roster, Player } from '../../types/database';
import { toast } from '../../components/Toast';

type DoublesCombo = string; // "idA|idB" sorted

function useCountdown(deadline: string | null) {
  const [remaining, setRemaining] = useState('');
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!deadline) return;
    const tick = () => {
      const diff = new Date(deadline).getTime() - Date.now();
      if (diff <= 0) { setExpired(true); setRemaining('Plazo vencido'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${h}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadline]);

  return { remaining, expired };
}

function makeComboKey(idA: string, idB: string): string {
  return [idA, idB].sort().join('|');
}

function isInDoubles(playerId: string, combo: DoublesCombo | null): boolean {
  if (!combo) return false;
  return combo.split('|').includes(playerId);
}

function ReadonlySlot({ player }: { player: Player | null }) {
  return (
    <div className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-navy-700">
      {player
        ? `${player.full_name}${player.ranking !== null ? ` — Ranking #${player.ranking}` : ''}`
        : <span className="text-slate-400">Sin asignar</span>}
    </div>
  );
}

function ReadonlyDoubles({ playerA, playerB }: { playerA: Player | null; playerB: Player | null }) {
  if (!playerA && !playerB) {
    return (
      <div className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-400">
        Sin asignar
      </div>
    );
  }
  return (
    <div className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-navy-700">
      {playerA ? `${playerA.full_name} (Ranking #${playerA.ranking})` : '—'}
      {' + '}
      {playerB ? `${playerB.full_name} (Ranking #${playerB.ranking})` : '—'}
    </div>
  );
}

export default function RosterPage() {
  const { id: confrontationId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [confrontation, setConfrontation] = useState<Confrontation | null>(null);
  const [roster, setRoster] = useState<Roster | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [coachId, setCoachId] = useState<string | null>(null);
  const [coachLeagueId, setCoachLeagueId] = useState<string | null>(null);

  const [slot1, setSlot1] = useState<string | null>(null);
  const [slot2, setSlot2] = useState<string | null>(null);
  const [doublesCombo, setDoublesCombo] = useState<DoublesCombo | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const { remaining, expired } = useCountdown(confrontation?.deadline ?? null);

  const locked =
    roster?.is_submitted === true ||
    confrontation?.status === 'cerrada' ||
    confrontation?.status === 'finalizada';

  const loadData = useCallback(async () => {
    if (!confrontationId) return;
    setLoading(true);

    // 1. Get confrontation
    const { data: conf } = await supabase
      .from('confrontations')
      .select('*, home_league:leagues!confrontations_home_league_id_fkey(id,name,city,representative,email,created_at), away_league:leagues!confrontations_away_league_id_fkey(id,name,city,representative,email,created_at)')
      .eq('id', confrontationId)
      .maybeSingle();

    setConfrontation(conf);

    // 2. Get coach record by auth.uid()
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) { setLoading(false); return; }

    const { data: coach } = await supabase
      .from('coaches')
      .select('id, league_id')
      .eq('user_id', authUser.id)
      .maybeSingle();

    if (!coach) { setLoading(false); return; }
    setCoachId(coach.id);
    setCoachLeagueId(coach.league_id);

    // 3. Get players: coach_id + league_active + category matches confrontation
    const category = conf?.category;
    let playersData: Player[] = [];
    if (category) {
      const { data } = await supabase
        .from('players')
        .select('*')
        .eq('coach_id', coach.id)
        .eq('league_active', true)
        .eq('category', category)
        .order('ranking', { ascending: true, nullsFirst: false });
      playersData = data || [];
    }
    setPlayers(playersData);

    // 4. Get existing roster
    const { data: rosterData } = await supabase
      .from('rosters')
      .select('*')
      .eq('confrontation_id', confrontationId)
      .eq('coach_id', coach.id)
      .maybeSingle();

    if (rosterData) {
      setRoster(rosterData);
      setSlot1(rosterData.slot_1);
      setSlot2(rosterData.slot_2);
      if (rosterData.slot_doubles_a && rosterData.slot_doubles_b) {
        setDoublesCombo(makeComboKey(rosterData.slot_doubles_a, rosterData.slot_doubles_b));
      }
    }

    setLoading(false);
  }, [confrontationId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Validate slots whenever they change
  useEffect(() => {
    const errors: string[] = [];
    const find = (id: string | null) => players.find(p => p.id === id) ?? null;
    const p1 = find(slot1);
    const p2 = find(slot2);

    if (p1 && p1.ranking !== null && ![2, 3].includes(p1.ranking))
      errors.push(`Partido 1: el jugador debe tener ranking 2 o 3 (actual: ${p1.ranking})`);

    if (p1 && p2 && p1.id === p2.id)
      errors.push('Partido 1 y Partido 2 no pueden ser el mismo jugador');

    setValidationErrors(errors);
  }, [slot1, slot2, doublesCombo, players]);

  // Slot 1: ranking 2 or 3 only
  const slot1Players = players.filter(p => p.ranking === 2 || p.ranking === 3);

  // Slot 2: all players except slot1 selection and those in doubles
  const slot2Players = players.filter(p => p.id !== slot1 && !isInDoubles(p.id, doublesCombo));

  // Doubles: valid rank combos 1+2, 1+3, 2+3, excluding players used in singles
  const usedInSingles = new Set([slot1, slot2].filter(Boolean) as string[]);
  const validRankCombos = [[1,2],[1,3],[2,3]];

  interface DoublesOption { key: string; label: string }
  const doublesOptions: DoublesOption[] = [];

  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const pA = players[i];
      const pB = players[j];
      if (pA.ranking === null || pB.ranking === null) continue;
      const ranks = [pA.ranking, pB.ranking].sort((a, b) => a - b);
      if (!validRankCombos.some(([x, y]) => ranks[0] === x && ranks[1] === y)) continue;
      if (usedInSingles.has(pA.id) || usedInSingles.has(pB.id)) continue;
      doublesOptions.push({
        key: makeComboKey(pA.id, pB.id),
        label: `${pA.full_name} (Ranking #${pA.ranking}) + ${pB.full_name} (Ranking #${pB.ranking})`,
      });
    }
  }

  const allFilled = !!slot1 && !!slot2 && !!doublesCombo;

  async function handleSave(submit: boolean) {
    if (!confrontationId || !coachId) return;
    if (submit && !allFilled) {
      toast('Completa los 4 slots antes de enviar la nómina.', 'error');
      return;
    }
    if (submit && validationErrors.length > 0) {
      toast('Corrige los errores antes de enviar la nómina.', 'error');
      return;
    }

    let doublesA: string | null = null;
    let doublesB: string | null = null;
    if (doublesCombo) {
      const [a, b] = doublesCombo.split('|');
      doublesA = a;
      doublesB = b;
    }

    setSaving(true);

    const payload = {
      confrontation_id: confrontationId,
      coach_id: coachId,
      league_id: coachLeagueId!,
      slot_1: slot1,
      slot_2: slot2,
      slot_doubles_a: doublesA,
      slot_doubles_b: doublesB,
      is_submitted: submit,
      submitted_at: submit ? new Date().toISOString() : null,
    };

    let error;
    if (roster) {
      ({ error } = await supabase.from('rosters').update(payload).eq('id', roster.id));
    } else {
      const { data, error: insertErr } = await supabase
        .from('rosters')
        .insert(payload)
        .select()
        .maybeSingle();
      error = insertErr;
      if (data) setRoster(data as Roster);
    }

    if (error) {
      toast(`Error al guardar: ${error.message}`, 'error');
    } else {
      toast(submit ? 'Nómina enviada exitosamente.' : 'Borrador guardado.', 'success');
      if (submit) loadData();
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-navy-300 border-t-navy-700 rounded-full animate-spin" />
      </div>
    );
  }

  if (!confrontation) {
    return (
      <div className="text-center py-20 text-navy-500">
        <p>Enfrentamiento no encontrado.</p>
        <button onClick={() => navigate(-1)} className="btn-secondary mt-4">Volver</button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div>
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-navy-500 hover:text-navy-700 mb-3 transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Volver
        </button>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-navy-900">Nómina</h1>
            <p className="text-navy-600 text-sm mt-0.5">
              {confrontation.home_league?.name} vs {confrontation.away_league?.name} — {confrontation.category}
            </p>
          </div>
          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border flex-shrink-0 ${expired ? 'bg-red-50 border-red-200' : 'bg-navy-50 border-navy-200'}`}>
            <ClockIcon className={`w-4 h-4 flex-shrink-0 ${expired ? 'text-red-500' : 'text-navy-500'}`} />
            <div>
              <p className="text-xs text-navy-500">Plazo de alineación</p>
              <p className={`text-sm font-semibold tabular-nums ${expired ? 'text-red-600' : 'text-navy-800'}`}>{remaining}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Submitted banner */}
      {roster?.is_submitted && (
        <div className="flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-xl">
          <CheckCircleIcon className="w-5 h-5 text-green-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-green-800">Nómina enviada</p>
            <p className="text-xs text-green-600">
              Enviada el {roster.submitted_at ? new Date(roster.submitted_at).toLocaleString('es-ES') : '—'}
            </p>
          </div>
        </div>
      )}

      {/* Locked banner (closed/finished, not submitted) */}
      {!roster?.is_submitted && locked && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
          <LockClosedIcon className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <p className="text-sm font-medium text-amber-800">Este enfrentamiento está cerrado. No se pueden realizar cambios.</p>
        </div>
      )}

      {/* No players warning */}
      {!locked && players.length === 0 && (
        <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-sm text-amber-800">
            No tienes jugadores asignados en esta categoría. Contacta al administrador.
          </p>
        </div>
      )}

      {/* Slots */}
      <div className="card p-5 space-y-5">
        <h2 className="text-sm font-semibold text-navy-700">Asignación de jugadores</h2>

        {/* Partido 1 — ranking 2 o 3 */}
        <div>
          <label className="label">
            Partido 1 — Jugador Individual
            <span className="ml-1.5 text-xs font-normal text-navy-400">(Ranking 2 o 3)</span>
          </label>
          {locked ? (
            <ReadonlySlot player={players.find(p => p.id === slot1) ?? null} />
          ) : (
            <select
              className="input-field"
              value={slot1 ?? ''}
              onChange={e => setSlot1(e.target.value || null)}
            >
              <option value="">Seleccionar jugador...</option>
              {slot1Players
                .filter(p => p.id !== slot2 && !isInDoubles(p.id, doublesCombo))
                .map(p => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} — Ranking #{p.ranking}
                  </option>
                ))}
            </select>
          )}
        </div>

        {/* Partido 2 — sin restricción */}
        <div>
          <label className="label">
            Partido 2 — Jugador Individual
            <span className="ml-1.5 text-xs font-normal text-navy-400">(Cualquier ranking)</span>
          </label>
          {locked ? (
            <ReadonlySlot player={players.find(p => p.id === slot2) ?? null} />
          ) : (
            <select
              className="input-field"
              value={slot2 ?? ''}
              onChange={e => setSlot2(e.target.value || null)}
            >
              <option value="">Seleccionar jugador...</option>
              {slot2Players.map(p => (
                <option key={p.id} value={p.id}>
                  {p.full_name}{p.ranking !== null ? ` — Ranking #${p.ranking}` : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Dobles — combo select */}
        <div>
          <label className="label">
            Dobles — Pareja
            <span className="ml-1.5 text-xs font-normal text-navy-400">(Combo: 1+2, 1+3 ó 2+3)</span>
          </label>
          {locked ? (
            <ReadonlyDoubles
              playerA={doublesCombo ? (players.find(p => p.id === doublesCombo.split('|')[0]) ?? null) : null}
              playerB={doublesCombo ? (players.find(p => p.id === doublesCombo.split('|')[1]) ?? null) : null}
            />
          ) : (
            <select
              className="input-field"
              value={doublesCombo ?? ''}
              onChange={e => setDoublesCombo(e.target.value || null)}
            >
              <option value="">Seleccionar pareja de dobles...</option>
              {doublesOptions.map(opt => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
              {doublesOptions.length === 0 && (
                <option value="" disabled>Sin combinaciones válidas disponibles</option>
              )}
            </select>
          )}
        </div>

        {/* Validation errors */}
        {validationErrors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-1">
            {validationErrors.map((err, i) => (
              <p key={i} className="text-xs text-red-700 flex items-start gap-1.5">
                <XCircleIcon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                {err}
              </p>
            ))}
          </div>
        )}

        {/* Actions */}
        {!locked && (
          <div className="flex gap-3 pt-1">
            <button
              onClick={() => handleSave(false)}
              disabled={saving}
              className="btn-secondary flex-1"
            >
              {saving ? 'Guardando...' : 'Guardar borrador'}
            </button>
            <button
              onClick={() => handleSave(true)}
              disabled={saving || !allFilled || validationErrors.length > 0}
              className="btn-primary flex-1"
            >
              {saving ? 'Enviando...' : 'Enviar nómina'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
