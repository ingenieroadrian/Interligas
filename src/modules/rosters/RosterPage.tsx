import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeftIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  LockClosedIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
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

interface RosterSlotState {
  roster: Roster | null;
  players: Player[];
  coachId: string | null;
  leagueId: string | null;
  leagueName: string;
  slot1: string | null;
  slot2: string | null;
  doublesCombo: DoublesCombo | null;
}

interface AdminRosterEditorProps {
  state: RosterSlotState;
  confrontationId: string;
  saving: boolean;
  onSave: (side: RosterSlotState, submit: boolean) => Promise<void>;
  onChange: (patch: Partial<Pick<RosterSlotState, 'slot1' | 'slot2' | 'doublesCombo'>>) => void;
}

function AdminRosterEditor({ state, confrontationId: _cid, saving, onSave, onChange }: AdminRosterEditorProps) {
  const { players, slot1, slot2, doublesCombo, roster, leagueName } = state;

  // Admin: no ranking restrictions — all players available everywhere
  const slot1Players = players.filter(p => p.id !== slot2);
  const slot2Players = players.filter(p => p.id !== slot1);

  interface DoublesOption { key: string; label: string }
  const doublesOptions: DoublesOption[] = [];
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const pA = players[i], pB = players[j];
      doublesOptions.push({
        key: makeComboKey(pA.id, pB.id),
        label: `${pA.full_name}${pA.ranking != null ? ` (Ranking #${pA.ranking})` : ''} + ${pB.full_name}${pB.ranking != null ? ` (Ranking #${pB.ranking})` : ''}`,
      });
    }
  }

  const allFilled = !!slot1 && !!slot2 && !!doublesCombo;

  const playerLabel = (id: string | null) => {
    if (!id) return null;
    const p = players.find(pl => pl.id === id);
    if (!p) return null;
    return `${p.full_name}${p.ranking !== null ? ` — Ranking #${p.ranking}` : ''}`;
  };

  return (
    <div className="card p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-navy-700">{leagueName}</h2>
        {roster?.is_submitted && (
          <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
            <CheckCircleIcon className="w-3.5 h-3.5" />
            Enviada
          </span>
        )}
        {!roster?.is_submitted && (
          <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
            Borrador
          </span>
        )}
      </div>

      {/* Partido 1 */}
      <div>
        <label className="label">Partido 1 — Jugador Individual</label>
        <select
          className="input-field"
          value={slot1 ?? ''}
          onChange={e => onChange({ slot1: e.target.value || null })}
        >
          {!slot1 && <option value="">Seleccionar jugador...</option>}
          {slot1Players.map(p => (
            <option key={p.id} value={p.id}>
              {p.full_name}{p.ranking != null ? ` — Ranking #${p.ranking}` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Partido 2 */}
      <div>
        <label className="label">Partido 2 — Jugador Individual</label>
        <select
          className="input-field"
          value={slot2 ?? ''}
          onChange={e => onChange({ slot2: e.target.value || null })}
        >
          {!slot2 && <option value="">Seleccionar jugador...</option>}
          {slot2Players.map(p => (
            <option key={p.id} value={p.id}>
              {p.full_name}{p.ranking != null ? ` — Ranking #${p.ranking}` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Dobles */}
      <div>
        <label className="label">Dobles — Pareja</label>
        <select
          className="input-field"
          value={doublesCombo ?? ''}
          onChange={e => onChange({ doublesCombo: e.target.value || null })}
        >
          {doublesCombo && (
            <option value={doublesCombo}>
              {doublesOptions.find(o => o.key === doublesCombo)?.label ??
                (() => {
                  const [a, b] = doublesCombo.split('|');
                  const pA = players.find(p => p.id === a);
                  const pB = players.find(p => p.id === b);
                  return `${pA?.full_name ?? '—'}${pA?.ranking != null ? ` (Ranking #${pA.ranking})` : ''} + ${pB?.full_name ?? '—'}${pB?.ranking != null ? ` (Ranking #${pB.ranking})` : ''}`;
                })()}
            </option>
          )}
          {!doublesCombo && <option value="">Seleccionar pareja de dobles...</option>}
          {doublesOptions
            .filter(o => o.key !== doublesCombo)
            .map(opt => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          {doublesOptions.length === 0 && (
            <option value="" disabled>Sin combinaciones válidas disponibles</option>
          )}
        </select>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <button
          onClick={() => onSave(state, false)}
          disabled={saving}
          className="btn-secondary flex-1"
        >
          {saving ? 'Guardando...' : 'Guardar borrador'}
        </button>
        <button
          onClick={() => onSave(state, true)}
          disabled={saving}
          className="btn-primary flex-1"
        >
          {saving ? 'Enviando...' : 'Guardar y marcar enviada'}
        </button>
      </div>
    </div>
  );
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
  const { isSuperAdmin, role } = useAuthStore();

  const isAdmin = isSuperAdmin() || (role?.name !== 'Entrenador');

  const [confrontation, setConfrontation] = useState<Confrontation | null>(null);
  const [roster, setRoster] = useState<Roster | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [coachId, setCoachId] = useState<string | null>(null);
  const [coachLeagueId, setCoachLeagueId] = useState<string | null>(null);

  const [slot1, setSlot1] = useState<string | null>(null);
  const [slot2, setSlot2] = useState<string | null>(null);
  const [doublesCombo, setDoublesCombo] = useState<DoublesCombo | null>(null);

  // Admin: two roster panels (home + away)
  const [homeState, setHomeState] = useState<RosterSlotState | null>(null);
  const [awayState, setAwayState] = useState<RosterSlotState | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const { remaining, expired } = useCountdown(confrontation?.deadline ?? null);

  const locked =
    roster?.is_submitted === true ||
    confrontation?.status === 'cerrada' ||
    confrontation?.status === 'finalizada' ||
    expired;

  const loadAdminData = useCallback(async (conf: Confrontation) => {
    const category = conf.category;

    async function loadSide(leagueId: string, leagueName: string): Promise<RosterSlotState> {
      // Find active coach for league
      const { data: coach } = await supabase
        .from('coaches')
        .select('id, league_id')
        .eq('league_id', leagueId)
        .eq('active', true)
        .maybeSingle();

      let playersData: Player[] = [];
      if (coach && category) {
        const { data } = await supabase
          .from('players')
          .select('*')
          .eq('coach_id', coach.id)
          .eq('league_active', true)
          .eq('category', category)
          .order('ranking', { ascending: true, nullsFirst: false });
        playersData = data || [];
      }

      let rosterData: Roster | null = null;
      if (coach) {
        const { data } = await supabase
          .from('rosters')
          .select('*')
          .eq('confrontation_id', conf.id)
          .eq('coach_id', coach.id)
          .maybeSingle();
        rosterData = data as Roster | null;
      }

      return {
        roster: rosterData,
        players: playersData,
        coachId: coach?.id ?? null,
        leagueId,
        leagueName,
        slot1: rosterData?.slot_1 ?? null,
        slot2: rosterData?.slot_2 ?? null,
        doublesCombo:
          rosterData?.slot_doubles_a && rosterData?.slot_doubles_b
            ? makeComboKey(rosterData.slot_doubles_a, rosterData.slot_doubles_b)
            : null,
      };
    }

    const [home, away] = await Promise.all([
      loadSide(conf.home_league_id!, conf.home_league?.name ?? 'Local'),
      loadSide(conf.away_league_id!, conf.away_league?.name ?? 'Visitante'),
    ]);

    setHomeState(home);
    setAwayState(away);
  }, []);

  const loadData = useCallback(async () => {
    if (!confrontationId) return;
    setLoading(true);

    const { data: conf } = await supabase
      .from('confrontations')
      .select('*, home_league:leagues!confrontations_home_league_id_fkey(id,name,city,representative,email,created_at), away_league:leagues!confrontations_away_league_id_fkey(id,name,city,representative,email,created_at)')
      .eq('id', confrontationId)
      .maybeSingle();

    setConfrontation(conf);

    if (isAdmin) {
      if (conf) await loadAdminData(conf);
      setLoading(false);
      return;
    }

    // Coach flow
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) { setLoading(false); return; }

    const { data: sysUser } = await supabase
      .from('system_users')
      .select('id')
      .eq('auth_id', authUser.id)
      .maybeSingle();

    if (!sysUser) { setLoading(false); return; }

    const { data: coach } = await supabase
      .from('coaches')
      .select('id, league_id')
      .eq('user_id', sysUser.id)
      .maybeSingle();

    if (!coach) { setLoading(false); return; }
    setCoachId(coach.id);
    setCoachLeagueId(coach.league_id);

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
  }, [confrontationId, isAdmin, loadAdminData]);

  useEffect(() => { loadData(); }, [loadData]);

  // Validate slots (coach view only)
  useEffect(() => {
    if (isAdmin) return;
    const errors: string[] = [];
    const find = (id: string | null) => players.find(p => p.id === id) ?? null;
    const p1 = find(slot1);
    const p2 = find(slot2);

    if (p1 && p1.ranking !== null && ![2, 3].includes(p1.ranking))
      errors.push(`Partido 1: el jugador debe tener ranking 2 o 3 (actual: ${p1.ranking})`);

    if (p1 && p2 && p1.id === p2.id)
      errors.push('Partido 1 y Partido 2 no pueden ser el mismo jugador');

    setValidationErrors(errors);
  }, [slot1, slot2, doublesCombo, players, isAdmin]);

  // Slot 1: ranking 2 or 3 only
  const slot1Players = players.filter(p => p.ranking === 2 || p.ranking === 3);
  const slot2Players = players.filter(p => p.id !== slot1);

  const validRankCombos = [[1, 2], [1, 3], [2, 3]];
  interface DoublesOption { key: string; label: string }
  const doublesOptions: DoublesOption[] = [];
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const pA = players[i], pB = players[j];
      if (pA.ranking === null || pB.ranking === null) continue;
      const ranks = [pA.ranking, pB.ranking].sort((a, b) => a - b);
      if (!validRankCombos.some(([x, y]) => ranks[0] === x && ranks[1] === y)) continue;
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

  async function handleAdminSave(side: RosterSlotState, submit: boolean) {
    if (!confrontationId || !side.coachId || !side.leagueId) {
      toast('No hay entrenador activo para esta liga.', 'error');
      return;
    }

    let doublesA: string | null = null;
    let doublesB: string | null = null;
    if (side.doublesCombo) {
      const [a, b] = side.doublesCombo.split('|');
      doublesA = a;
      doublesB = b;
    }

    setSaving(true);

    const payload = {
      confrontation_id: confrontationId,
      coach_id: side.coachId,
      league_id: side.leagueId,
      slot_1: side.slot1,
      slot_2: side.slot2,
      slot_doubles_a: doublesA,
      slot_doubles_b: doublesB,
      is_submitted: submit,
      submitted_at: submit ? new Date().toISOString() : null,
    };

    let error;
    if (side.roster) {
      ({ error } = await supabase.from('rosters').update(payload).eq('id', side.roster.id));
    } else {
      ({ error } = await supabase.from('rosters').insert(payload));
    }

    if (error) {
      toast(`Error al guardar: ${error.message}`, 'error');
    } else {
      toast(submit ? 'Nómina guardada y marcada como enviada.' : 'Borrador guardado.', 'success');
      if (confrontation) await loadAdminData(confrontation);
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

      {/* Admin mode banner */}
      {isAdmin && (
        <div className="flex items-center gap-3 px-4 py-3 bg-sky-50 border border-sky-200 rounded-xl">
          <ShieldCheckIcon className="w-5 h-5 text-sky-600 flex-shrink-0" />
          <p className="text-sm font-medium text-sky-800">Modo administrador — edición sin restricciones habilitada</p>
        </div>
      )}

      {/* Coach: submitted banner */}
      {!isAdmin && roster?.is_submitted && (
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

      {/* Coach: locked banner */}
      {!isAdmin && !roster?.is_submitted && locked && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
          <LockClosedIcon className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <p className="text-sm font-medium text-amber-800">Este enfrentamiento está cerrado. No se pueden realizar cambios.</p>
        </div>
      )}

      {/* Admin view: two panels side by side (stacked on mobile) */}
      {isAdmin && (
        <div className="space-y-6">
          {homeState && (
            <AdminRosterEditor
              state={homeState}
              confrontationId={confrontationId!}
              saving={saving}
              onSave={handleAdminSave}
              onChange={patch => setHomeState(prev => prev ? { ...prev, ...patch } : prev)}
            />
          )}
          {awayState && (
            <AdminRosterEditor
              state={awayState}
              confrontationId={confrontationId!}
              saving={saving}
              onSave={handleAdminSave}
              onChange={patch => setAwayState(prev => prev ? { ...prev, ...patch } : prev)}
            />
          )}
        </div>
      )}

      {/* Coach view */}
      {!isAdmin && (
        <>
          {!locked && players.length === 0 && (
            <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-sm text-amber-800">
                No tienes jugadores asignados en esta categoría. Contacta al administrador.
              </p>
            </div>
          )}

          <div className="card p-5 space-y-5">
            <h2 className="text-sm font-semibold text-navy-700">Asignación de jugadores</h2>

            {/* Partido 1 */}
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

            {/* Partido 2 */}
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

            {/* Dobles */}
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
        </>
      )}
    </div>
  );
}
