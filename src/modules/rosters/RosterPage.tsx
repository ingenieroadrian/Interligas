import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeftIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  UserIcon,
  LockClosedIcon,
} from '@heroicons/react/24/outline';
import { supabase } from '../../lib/supabase';
import type { Confrontation, Roster, Player } from '../../types/database';
import { useAuthStore } from '../../store/authStore';
import { toast } from '../../components/Toast';

type SlotKey = 'slot_1' | 'slot_2' | 'slot_doubles_a' | 'slot_doubles_b';

const SLOT_LABELS: Record<SlotKey, string> = {
  slot_1: 'Partido 1 — Jugador Individual',
  slot_2: 'Partido 2 — Jugador Individual',
  slot_doubles_a: 'Dobles — Jugador A',
  slot_doubles_b: 'Dobles — Jugador B',
};

const SLOT_HINTS: Record<SlotKey, string> = {
  slot_1: 'Ranking 2 o 3',
  slot_2: 'Ranking 2 o 3',
  slot_doubles_a: 'Combo válido: 1+2, 1+3 ó 2+3',
  slot_doubles_b: 'Combo válido: 1+2, 1+3 ó 2+3',
};

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

function validateSlots(slots: Record<SlotKey, string | null>, players: Player[]): string[] {
  const errors: string[] = [];
  const findPlayer = (id: string | null) => players.find(p => p.id === id) || null;

  const p1 = findPlayer(slots.slot_1);
  const p2 = findPlayer(slots.slot_2);
  const pA = findPlayer(slots.slot_doubles_a);
  const pB = findPlayer(slots.slot_doubles_b);

  if (p1 && p1.ranking !== null && ![2, 3].includes(p1.ranking))
    errors.push(`Partido 1: el jugador debe tener ranking 2 o 3 (actual: ${p1.ranking})`);
  if (p2 && p2.ranking !== null && ![2, 3].includes(p2.ranking))
    errors.push(`Partido 2: el jugador debe tener ranking 2 o 3 (actual: ${p2.ranking})`);
  if (p1 && p2 && p1.id === p2.id)
    errors.push('Partido 1 y Partido 2 no pueden tener el mismo jugador');

  if (pA && pB) {
    if (pA.id === pB.id) {
      errors.push('Los jugadores de dobles deben ser diferentes');
    } else if (pA.ranking !== null && pB.ranking !== null) {
      const ranks = [pA.ranking, pB.ranking].sort((a, b) => a - b);
      const validCombos = [[1, 2], [1, 3], [2, 3]];
      const isValid = validCombos.some(([x, y]) => ranks[0] === x && ranks[1] === y);
      if (!isValid)
        errors.push(`Dobles: combinación de rankings inválida (${ranks[0]}+${ranks[1]}). Válidos: 1+2, 1+3, 2+3`);
    }
  }

  return errors;
}

function SlotSelect({
  slotKey,
  value,
  players,
  usedIds,
  onChange,
  locked,
}: {
  slotKey: SlotKey;
  value: string | null;
  players: Player[];
  usedIds: Set<string>;
  onChange: (id: string | null) => void;
  locked: boolean;
}) {
  const available = players.filter(p => p.id === value || !usedIds.has(p.id));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 transition-all">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-navy-700">{SLOT_LABELS[slotKey]}</p>
        <p className="text-xs text-navy-400">{SLOT_HINTS[slotKey]}</p>
      </div>
      {locked ? (
        <div className="flex items-center gap-2 px-3 py-2 bg-navy-50 rounded-lg border border-navy-200">
          <UserIcon className="w-4 h-4 text-navy-600 flex-shrink-0" />
          <span className="text-sm text-navy-800">
            {value ? players.find(p => p.id === value)?.full_name || '—' : '—'}
          </span>
        </div>
      ) : (
        <select
          className="input-field w-full"
          value={value || ''}
          onChange={e => onChange(e.target.value || null)}
        >
          <option value="">Seleccionar jugador...</option>
          {available.map(p => (
            <option key={p.id} value={p.id}>
              {p.full_name}{p.ranking !== null ? ` — Ranking #${p.ranking}` : ''}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

export default function RosterPage() {
  const { id: confrontationId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { coachProfile } = useAuthStore();

  const [confrontation, setConfrontation] = useState<Confrontation | null>(null);
  const [roster, setRoster] = useState<Roster | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [slots, setSlots] = useState<Record<SlotKey, string | null>>({
    slot_1: null,
    slot_2: null,
    slot_doubles_a: null,
    slot_doubles_b: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const { remaining, expired } = useCountdown(confrontation?.deadline || null);

  const locked = roster?.is_submitted || expired || confrontation?.status === 'cerrada';

  const loadData = useCallback(async () => {
    if (!confrontationId || !coachProfile) return;
    setLoading(true);

    const [{ data: conf }, { data: playersData }, { data: rosterData }] = await Promise.all([
      supabase
        .from('confrontations')
        .select('*, home_league:leagues!confrontations_home_league_id_fkey(id,name,city,representative,email,created_at), away_league:leagues!confrontations_away_league_id_fkey(id,name,city,representative,email,created_at)')
        .eq('id', confrontationId)
        .maybeSingle(),
      supabase
        .from('players')
        .select('*')
        .eq('coach_id', coachProfile.id)
        .eq('league_active', true),
      supabase
        .from('rosters')
        .select('*')
        .eq('confrontation_id', confrontationId)
        .eq('coach_id', coachProfile.id)
        .maybeSingle(),
    ]);

    setConfrontation(conf);
    setPlayers(playersData || []);

    if (rosterData) {
      setRoster(rosterData);
      setSlots({
        slot_1: rosterData.slot_1,
        slot_2: rosterData.slot_2,
        slot_doubles_a: rosterData.slot_doubles_a,
        slot_doubles_b: rosterData.slot_doubles_b,
      });
    }

    setLoading(false);
  }, [confrontationId, coachProfile]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    setValidationErrors(validateSlots(slots, players));
  }, [slots, players]);

  function handleSlotChange(slotKey: SlotKey, playerId: string | null) {
    setSlots(prev => ({ ...prev, [slotKey]: playerId }));
  }

  async function handleSave(submit = false) {
    if (!confrontationId || !coachProfile) return;
    if (submit && validationErrors.length > 0) {
      toast('Corrige los errores antes de enviar la nómina.', 'error');
      return;
    }

    setSaving(true);

    const payload = {
      confrontation_id: confrontationId,
      coach_id: coachProfile.id,
      league_id: coachProfile.league_id!,
      slot_1: slots.slot_1,
      slot_2: slots.slot_2,
      slot_doubles_a: slots.slot_doubles_a,
      slot_doubles_b: slots.slot_doubles_b,
      is_submitted: submit,
      submitted_at: submit ? new Date().toISOString() : null,
    };

    let error;
    if (roster) {
      ({ error } = await supabase.from('rosters').update(payload).eq('id', roster.id));
    } else {
      const { data, error: insertErr } = await supabase.from('rosters').insert(payload).select().maybeSingle();
      error = insertErr;
      if (data) setRoster(data);
    }

    if (error) toast(error.message, 'error');
    else {
      toast(submit ? 'Nómina enviada exitosamente.' : 'Borrador guardado.', 'success');
      if (submit) loadData();
    }
    setSaving(false);
  }

  const usedIds = new Set(Object.values(slots).filter(Boolean) as string[]);

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
    <div className="space-y-6 max-w-3xl mx-auto">
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
          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border ${expired ? 'bg-red-50 border-red-200' : 'bg-navy-50 border-navy-200'}`}>
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

      {/* Locked banner */}
      {!roster?.is_submitted && locked && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
          <LockClosedIcon className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <p className="text-sm font-medium text-amber-800">El plazo de alineación ha vencido. No se pueden realizar cambios.</p>
        </div>
      )}

      {/* Slot selectors */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-navy-700">Asignación de nómina</h2>
        {(Object.keys(SLOT_LABELS) as SlotKey[]).map(slotKey => (
          <SlotSelect
            key={slotKey}
            slotKey={slotKey}
            value={slots[slotKey]}
            players={players}
            usedIds={usedIds}
            onChange={(id) => handleSlotChange(slotKey, id)}
            locked={!!locked}
          />
        ))}

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
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => handleSave(false)}
              disabled={saving}
              className="btn-secondary flex-1"
            >
              Guardar borrador
            </button>
            <button
              onClick={() => handleSave(true)}
              disabled={saving || validationErrors.length > 0}
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
