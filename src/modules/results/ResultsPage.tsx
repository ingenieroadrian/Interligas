import { useEffect, useState, useCallback } from 'react';
import {
  MagnifyingGlassIcon,
  CalendarDaysIcon,
  PencilSquareIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { supabase } from '../../lib/supabase';
import type { Confrontation, Roster, MatchAssignment, Player, RosterSlot } from '../../types/database';
import { useAuthStore } from '../../store/authStore';
import Modal from '../../components/Modal';
import SearchInput from '../../components/SearchInput';
import { toast } from '../../components/Toast';

const SLOT_LABELS: Record<RosterSlot, string> = {
  partido_1: 'Partido 1',
  partido_2: 'Partido 2',
  dobles: 'Dobles',
};

interface ConfrontationWithRosters extends Confrontation {
  rosters: (Roster & {
    coach_name?: string;
    league_name?: string;
    players: Record<RosterSlot, Player | null>;
    assignments: MatchAssignment[];
  })[];
}

interface AssignmentForm {
  court: string;
  scheduled_time: string;
}

interface EditTarget {
  rosterId: string;
  slot: RosterSlot;
  existing: MatchAssignment | null;
  playerLabel: string;
}

export default function ResultsPage() {
  const [confrontations, setConfrontations] = useState<ConfrontationWithRosters[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [form, setForm] = useState<AssignmentForm>({ court: '', scheduled_time: '' });
  const [saving, setSaving] = useState(false);

  const { isSuperAdmin, hasPermission } = useAuthStore();
  const canEdit = isSuperAdmin() || hasPermission('results', 'edit');

  const loadData = useCallback(async () => {
    setLoading(true);

    const { data: confs } = await supabase
      .from('confrontations')
      .select('*, home_league:leagues!confrontations_home_league_id_fkey(id,name,city,representative,email,created_at), away_league:leagues!confrontations_away_league_id_fkey(id,name,city,representative,email,created_at)')
      .in('status', ['cerrada', 'en_curso', 'finalizada'])
      .order('match_date', { ascending: false });

    if (!confs) { setLoading(false); return; }

    const confIds = confs.map(c => c.id);

    const [{ data: rosters }, { data: assignments }, { data: players }] = await Promise.all([
      supabase.from('rosters').select('*, coach:coaches(full_name), league:leagues(name)').in('confrontation_id', confIds),
      supabase.from('match_assignments').select('*').in('roster_id', confIds.length > 0
        ? (await supabase.from('rosters').select('id').in('confrontation_id', confIds)).data?.map(r => r.id) || []
        : []),
      supabase.from('players').select('id, full_name, ranking'),
    ]);

    const playerMap = new Map((players || []).map(p => [p.id, p as Player]));
    const assignmentsByRoster = new Map<string, MatchAssignment[]>();
    (assignments || []).forEach(a => {
      if (!assignmentsByRoster.has(a.roster_id)) assignmentsByRoster.set(a.roster_id, []);
      assignmentsByRoster.get(a.roster_id)!.push(a);
    });

    const enrichedConfs: ConfrontationWithRosters[] = confs.map(conf => {
      const confRosters = (rosters || []).filter(r => r.confrontation_id === conf.id).map(r => ({
        ...r,
        coach_name: (r.coach as any)?.full_name,
        league_name: (r.league as any)?.name,
        players: {
          partido_1: r.slot_1 ? (playerMap.get(r.slot_1) || null) : null,
          partido_2: r.slot_2 ? (playerMap.get(r.slot_2) || null) : null,
          dobles: r.slot_doubles_a ? (playerMap.get(r.slot_doubles_a) || null) : null,
        } as Record<RosterSlot, Player | null>,
        assignments: assignmentsByRoster.get(r.id) || [],
      }));

      return { ...conf, rosters: confRosters };
    });

    const filtered = search
      ? enrichedConfs.filter(c =>
          c.home_league?.name.toLowerCase().includes(search.toLowerCase()) ||
          c.away_league?.name.toLowerCase().includes(search.toLowerCase()) ||
          c.category.toLowerCase().includes(search.toLowerCase())
        )
      : enrichedConfs;

    setConfrontations(filtered);
    setLoading(false);
  }, [search]);

  useEffect(() => { loadData(); }, [loadData]);

  function openEdit(target: EditTarget) {
    setEditTarget(target);
    setForm({
      court: target.existing?.court || '',
      scheduled_time: target.existing?.scheduled_time || '',
    });
  }

  async function handleSaveAssignment() {
    if (!editTarget) return;
    setSaving(true);

    const { rosterId, slot, existing } = editTarget;

    if (existing) {
      const { error } = await supabase
        .from('match_assignments')
        .update({ court: form.court || null, scheduled_time: form.scheduled_time || null })
        .eq('id', existing.id);
      if (error) toast(error.message, 'error');
      else { toast('Asignación actualizada.', 'success'); setEditTarget(null); loadData(); }
    } else {
      const { error } = await supabase
        .from('match_assignments')
        .insert({ roster_id: rosterId, slot, court: form.court || null, scheduled_time: form.scheduled_time || null });
      if (error) toast(error.message, 'error');
      else { toast('Asignación guardada.', 'success'); setEditTarget(null); loadData(); }
    }

    setSaving(false);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-navy-900">Resultados</h1>
          <p className="text-sm text-navy-500 mt-0.5">Asignación de cancha y horario por partido</p>
        </div>
      </div>

      <SearchInput value={search} onChange={v => setSearch(v)} placeholder="Buscar por liga o categoría..." />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-navy-300 border-t-navy-700 rounded-full animate-spin" />
        </div>
      ) : confrontations.length === 0 ? (
        <div className="card p-10 text-center text-navy-400">
          <MagnifyingGlassIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p>No hay enfrentamientos cerrados o en curso.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {confrontations.map(conf => (
            <div key={conf.id} className="card overflow-hidden">
              {/* Confrontation header */}
              <button
                className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors"
                onClick={() => setExpanded(expanded === conf.id ? null : conf.id)}
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-navy-100 text-navy-700 text-xs font-semibold">
                    {conf.category}
                  </span>
                  <span className="font-semibold text-navy-800 text-sm">
                    {conf.home_league?.name} vs {conf.away_league?.name}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 text-xs text-navy-400">
                    <CalendarDaysIcon className="w-3.5 h-3.5" />
                    {new Date(`${conf.match_date}T${conf.match_time}`).toLocaleString('es-ES', {
                      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    conf.status === 'en_curso' ? 'bg-green-100 text-green-700' :
                    conf.status === 'finalizada' ? 'bg-navy-100 text-navy-600' :
                    'bg-amber-100 text-amber-700'
                  }`}>
                    {conf.status === 'cerrada' ? 'Cerrada' : conf.status === 'en_curso' ? 'En Curso' : 'Finalizada'}
                  </span>
                </div>
              </button>

              {/* Expanded rosters */}
              {expanded === conf.id && (
                <div className="border-t border-slate-100 divide-y divide-slate-50">
                  {conf.rosters.length === 0 ? (
                    <p className="text-xs text-navy-400 text-center py-6">Ningún entrenador ha enviado nómina.</p>
                  ) : conf.rosters.map(roster => (
                    <div key={roster.id} className="px-5 py-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-sm font-semibold text-navy-800">{roster.league_name}</p>
                          <p className="text-xs text-navy-400">Entrenador: {roster.coach_name}</p>
                        </div>
                        {roster.is_submitted && (
                          <span className="flex items-center gap-1 text-xs text-green-600">
                            <CheckCircleIcon className="w-3.5 h-3.5" />
                            Nómina enviada
                          </span>
                        )}
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-navy-500 border-b border-slate-100">
                              <th className="text-left pb-2 pr-4 font-medium">Partido</th>
                              <th className="text-left pb-2 pr-4 font-medium">Jugador</th>
                              <th className="text-left pb-2 pr-4 font-medium">Cancha</th>
                              <th className="text-left pb-2 pr-4 font-medium">Horario</th>
                              {canEdit && <th className="text-right pb-2 font-medium">Acción</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {(Object.keys(SLOT_LABELS) as RosterSlot[]).map(slot => {
                              const player = roster.players[slot];
                              const assignment = roster.assignments.find(a => a.slot === slot) || null;
                              return (
                                <tr key={slot} className="hover:bg-slate-50 transition-colors">
                                  <td className="py-2 pr-4 font-medium text-navy-700">{SLOT_LABELS[slot]}</td>
                                  <td className="py-2 pr-4 text-navy-600">
                                    {player ? (
                                      <span>
                                        {player.full_name}
                                        {player.ranking !== null && <span className="text-navy-400 ml-1">(#{player.ranking})</span>}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400 italic">Sin asignar</span>
                                    )}
                                  </td>
                                  <td className="py-2 pr-4 text-navy-600">
                                    {assignment?.court || <span className="text-slate-400">—</span>}
                                  </td>
                                  <td className="py-2 pr-4 text-navy-600">
                                    {assignment?.scheduled_time
                                      ? new Date(assignment.scheduled_time).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
                                      : <span className="text-slate-400">—</span>
                                    }
                                  </td>
                                  {canEdit && (
                                    <td className="py-2 text-right">
                                      <button
                                        onClick={() => openEdit({
                                          rosterId: roster.id,
                                          slot,
                                          existing: assignment,
                                          playerLabel: player?.full_name || SLOT_LABELS[slot],
                                        })}
                                        className="p-1 text-navy-400 hover:text-navy-700 hover:bg-navy-50 rounded transition-colors"
                                        title="Asignar cancha y horario"
                                      >
                                        <PencilSquareIcon className="w-3.5 h-3.5" />
                                      </button>
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Assignment Modal */}
      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="Asignar Cancha y Horario"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-navy-600">
            <span className="font-medium">{editTarget?.playerLabel}</span>
          </p>
          <div>
            <label className="label">Cancha</label>
            <input
              type="text"
              className="input-field"
              placeholder="Ej. Cancha 1, Pista Central..."
              value={form.court}
              onChange={e => setForm(f => ({ ...f, court: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Horario programado</label>
            <input
              type="datetime-local"
              className="input-field"
              value={form.scheduled_time}
              onChange={e => setForm(f => ({ ...f, scheduled_time: e.target.value }))}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setEditTarget(null)} className="btn-secondary flex-1">Cancelar</button>
            <button onClick={handleSaveAssignment} disabled={saving} className="btn-primary flex-1">
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
