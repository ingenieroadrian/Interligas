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
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { supabase } from '../../lib/supabase';
import type { Confrontation, Roster, Player, Coach } from '../../types/database';
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

  // slot_1 and slot_2: ranking must be 2 or 3
  if (p1 && p1.ranking !== null && ![2, 3].includes(p1.ranking))
    errors.push(`Partido 1: el jugador debe tener ranking 2 o 3 (actual: ${p1.ranking})`);
  if (p2 && p2.ranking !== null && ![2, 3].includes(p2.ranking))
    errors.push(`Partido 2: el jugador debe tener ranking 2 o 3 (actual: ${p2.ranking})`);
  if (p1 && p2 && p1.id === p2.id)
    errors.push('Partido 1 y Partido 2 no pueden tener el mismo jugador');

  // doubles: valid combos are ranks 1+2, 1+3, 2+3
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

// ─── Draggable Player Card ────────────────────────────────────────────────────
function DraggablePlayer({ player, disabled }: { player: Player; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: player.id,
    disabled,
  });

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-grab select-none transition-all ${
        isDragging
          ? 'opacity-40'
          : disabled
          ? 'bg-slate-50 border-slate-200 cursor-not-allowed'
          : 'bg-white border-navy-200 hover:border-navy-400 hover:shadow-sm active:cursor-grabbing'
      }`}
    >
      <div className="w-7 h-7 rounded-full bg-navy-100 flex items-center justify-center flex-shrink-0">
        <UserIcon className="w-3.5 h-3.5 text-navy-600" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-navy-800 truncate">{player.full_name}</p>
        {player.ranking !== null && (
          <p className="text-xs text-navy-400">Ranking #{player.ranking}</p>
        )}
      </div>
    </div>
  );
}

// ─── Roster Slot Drop Zone ────────────────────────────────────────────────────
function RosterSlot({
  slotKey,
  player,
  onRemove,
  locked,
}: {
  slotKey: SlotKey;
  player: Player | null;
  onRemove: () => void;
  locked: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: slotKey });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border-2 border-dashed p-3 transition-all min-h-[72px] ${
        isOver ? 'border-navy-400 bg-navy-50' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs font-semibold text-navy-700">{SLOT_LABELS[slotKey]}</p>
        <p className="text-xs text-navy-400">{SLOT_HINTS[slotKey]}</p>
      </div>
      {player ? (
        <div className="flex items-center gap-2 px-3 py-2 bg-navy-50 rounded-lg border border-navy-200">
          <div className="w-6 h-6 rounded-full bg-navy-200 flex items-center justify-center flex-shrink-0">
            <UserIcon className="w-3 h-3 text-navy-700" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-navy-800 truncate">{player.full_name}</p>
            {player.ranking !== null && (
              <p className="text-xs text-navy-400">Ranking #{player.ranking}</p>
            )}
          </div>
          {!locked && (
            <button onClick={onRemove} className="text-navy-400 hover:text-red-500 transition-colors ml-1 flex-shrink-0">
              <XCircleIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-center h-8">
          <p className="text-xs text-slate-400">Arrastra un jugador aquí</p>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
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
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const { remaining, expired } = useCountdown(confrontation?.deadline || null);

  const locked = roster?.is_submitted || expired || confrontation?.status === 'cerrada';

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

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

  // Live validation
  useEffect(() => {
    setValidationErrors(validateSlots(slots, players));
  }, [slots, players]);

  function handleDragStart(e: DragStartEvent) {
    setActiveId(e.active.id as string);
  }

  function handleDragEnd(e: DragEndEvent) {
    const { over, active } = e;
    setActiveId(null);
    if (!over) return;

    const targetSlot = over.id as SlotKey;
    const playerId = active.id as string;

    if (!Object.keys(slots).includes(targetSlot)) return;

    // Prevent placing the same player in multiple slots
    const occupiedByOther = (Object.keys(slots) as SlotKey[]).filter(
      k => k !== targetSlot && slots[k] === playerId
    );
    occupiedByOther.forEach(k => {
      setSlots(prev => ({ ...prev, [k]: null }));
    });

    setSlots(prev => ({ ...prev, [targetSlot]: playerId }));
  }

  function removeFromSlot(slotKey: SlotKey) {
    setSlots(prev => ({ ...prev, [slotKey]: null }));
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

  const activePlayer = activeId ? players.find(p => p.id === activeId) : null;
  const slotPlayerIds = new Set(Object.values(slots).filter(Boolean));
  const availablePlayers = players.filter(p => !slotPlayerIds.has(p.id));

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
    <div className="space-y-6">
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
          {/* Countdown */}
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

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Available players panel */}
          <div className="lg:col-span-1">
            <div className="card p-4">
              <h2 className="text-sm font-semibold text-navy-700 mb-3">
                Jugadores disponibles
                <span className="ml-2 text-xs font-normal text-navy-400">({availablePlayers.length})</span>
              </h2>
              {players.length === 0 ? (
                <p className="text-xs text-navy-400 text-center py-6">No tienes jugadores activos en tu liga.</p>
              ) : (
                <div className="space-y-2">
                  {availablePlayers.map(p => (
                    <DraggablePlayer key={p.id} player={p} disabled={!!locked} />
                  ))}
                  {availablePlayers.length === 0 && slotPlayerIds.size > 0 && (
                    <p className="text-xs text-navy-400 text-center py-4">Todos los jugadores han sido asignados.</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Slots */}
          <div className="lg:col-span-2 space-y-3">
            <h2 className="text-sm font-semibold text-navy-700">Asignación de nómina</h2>
            {(Object.keys(SLOT_LABELS) as SlotKey[]).map(slotKey => (
              <RosterSlot
                key={slotKey}
                slotKey={slotKey}
                player={players.find(p => p.id === slots[slotKey]) || null}
                onRemove={() => removeFromSlot(slotKey)}
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

        {/* Drag overlay */}
        <DragOverlay>
          {activePlayer && (
            <div className="flex items-center gap-2 px-3 py-2 bg-white border border-navy-300 rounded-lg shadow-lg opacity-95">
              <div className="w-7 h-7 rounded-full bg-navy-100 flex items-center justify-center flex-shrink-0">
                <UserIcon className="w-3.5 h-3.5 text-navy-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-navy-800">{activePlayer.full_name}</p>
                {activePlayer.ranking !== null && (
                  <p className="text-xs text-navy-400">Ranking #{activePlayer.ranking}</p>
                )}
              </div>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
