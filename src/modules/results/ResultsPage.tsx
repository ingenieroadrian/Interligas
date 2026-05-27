import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MagnifyingGlassIcon,
  CalendarDaysIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  TrophyIcon,
  PencilSquareIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { supabase } from '../../lib/supabase';
import type { Confrontation, Roster, Player, RosterSlot, MatchResult, MatchWinner } from '../../types/database';
import { useAuthStore } from '../../store/authStore';
import Modal from '../../components/Modal';
import SearchInput from '../../components/SearchInput';
import { toast } from '../../components/Toast';

const STATUS_COLORS: Record<string, string> = {
  cerrada: 'bg-amber-100 text-amber-700',
  en_curso: 'bg-green-100 text-green-700',
  finalizada: 'bg-navy-100 text-navy-600',
};
const STATUS_LABELS: Record<string, string> = {
  cerrada: 'Cerrada',
  en_curso: 'En Curso',
  finalizada: 'Finalizada',
};

const SLOT_LABELS: Record<RosterSlot, string> = {
  partido_1: 'Partido 1',
  partido_2: 'Partido 2',
  dobles: 'Dobles',
};

interface MatchVS {
  slot: RosterSlot;
  homePlayers: Player[];
  awayPlayers: Player[];
  result: MatchResult | null;
}

interface ConfrontationRow extends Confrontation {
  matches: MatchVS[];
}

interface ResultForm {
  home_score: string;
  away_score: string;
  winner: MatchWinner | '';
  notes: string;
}

interface EditTarget {
  confrontationId: string;
  slot: RosterSlot;
  homePlayers: Player[];
  awayPlayers: Player[];
  existing: MatchResult | null;
}

export default function ResultsPage() {
  const [confrontations, setConfrontations] = useState<ConfrontationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [form, setForm] = useState<ResultForm>({ home_score: '', away_score: '', winner: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const { isSuperAdmin, hasPermission, user } = useAuthStore();
  const canEdit = isSuperAdmin() || hasPermission('results', 'edit');
  const navigate = useNavigate();

  const loadData = useCallback(async () => {
    setLoading(true);

    const { data: confs } = await supabase
      .from('confrontations')
      .select('*, home_league:leagues!confrontations_home_league_id_fkey(id,name,city,representative,email,created_at), away_league:leagues!confrontations_away_league_id_fkey(id,name,city,representative,email,created_at)')
      .in('status', ['cerrada', 'en_curso', 'finalizada'])
      .order('match_date', { ascending: false });

    if (!confs || confs.length === 0) { setConfrontations([]); setLoading(false); return; }

    const confIds = confs.map(c => c.id);

    const [{ data: rosters }, { data: players }, { data: results }] = await Promise.all([
      supabase.from('rosters').select('*').in('confrontation_id', confIds).eq('is_submitted', true),
      supabase.from('players').select('id, full_name, ranking'),
      supabase.from('match_results').select('*').in('confrontation_id', confIds),
    ]);

    const playerMap = new Map((players || []).map(p => [p.id, p as Player]));

    const enriched: ConfrontationRow[] = confs.map(conf => {
      const confRosters = (rosters || []).filter(r => r.confrontation_id === conf.id) as Roster[];
      const homeRoster = confRosters.find(r => r.league_id === conf.home_league_id) || null;
      const awayRoster = confRosters.find(r => r.league_id === conf.away_league_id) || null;
      const confResults = (results || []).filter(r => r.confrontation_id === conf.id) as MatchResult[];

      const matches: MatchVS[] = (['partido_1', 'partido_2', 'dobles'] as RosterSlot[]).map(slot => {
        let homePlayers: Player[] = [];
        let awayPlayers: Player[] = [];

        if (homeRoster) {
          if (slot === 'partido_1' && homeRoster.slot_1) homePlayers = [playerMap.get(homeRoster.slot_1)].filter(Boolean) as Player[];
          if (slot === 'partido_2' && homeRoster.slot_2) homePlayers = [playerMap.get(homeRoster.slot_2)].filter(Boolean) as Player[];
          if (slot === 'dobles') {
            const a = homeRoster.slot_doubles_a ? playerMap.get(homeRoster.slot_doubles_a) : null;
            const b = homeRoster.slot_doubles_b ? playerMap.get(homeRoster.slot_doubles_b) : null;
            homePlayers = [a, b].filter(Boolean) as Player[];
          }
        }
        if (awayRoster) {
          if (slot === 'partido_1' && awayRoster.slot_1) awayPlayers = [playerMap.get(awayRoster.slot_1)].filter(Boolean) as Player[];
          if (slot === 'partido_2' && awayRoster.slot_2) awayPlayers = [playerMap.get(awayRoster.slot_2)].filter(Boolean) as Player[];
          if (slot === 'dobles') {
            const a = awayRoster.slot_doubles_a ? playerMap.get(awayRoster.slot_doubles_a) : null;
            const b = awayRoster.slot_doubles_b ? playerMap.get(awayRoster.slot_doubles_b) : null;
            awayPlayers = [a, b].filter(Boolean) as Player[];
          }
        }

        const result = confResults.find(r => r.slot === slot) || null;
        return { slot, homePlayers, awayPlayers, result };
      });

      return { ...conf, matches };
    });

    const filtered = search
      ? enriched.filter(c =>
          c.home_league?.name.toLowerCase().includes(search.toLowerCase()) ||
          c.away_league?.name.toLowerCase().includes(search.toLowerCase()) ||
          c.category.toLowerCase().includes(search.toLowerCase())
        )
      : enriched;

    setConfrontations(filtered);
    setLoading(false);
  }, [search]);

  useEffect(() => { loadData(); }, [loadData]);

  function openEdit(target: EditTarget) {
    setEditTarget(target);
    const r = target.existing;
    setForm({
      home_score: r?.home_score || '',
      away_score: r?.away_score || '',
      winner: r?.winner || '',
      notes: r?.notes || '',
    });
  }

  async function handleSaveResult() {
    if (!editTarget) return;
    setSaving(true);

    const { confrontationId, slot, homePlayers, awayPlayers, existing } = editTarget;

    const payload = {
      confrontation_id: confrontationId,
      slot,
      home_player_ids: homePlayers.map(p => p.id),
      away_player_ids: awayPlayers.map(p => p.id),
      home_score: form.home_score,
      away_score: form.away_score,
      winner: form.winner || null,
      notes: form.notes,
      recorded_by: user?.id || null,
      recorded_at: new Date().toISOString(),
    };

    let error;
    if (existing) {
      ({ error } = await supabase.from('match_results').update(payload).eq('id', existing.id));
    } else {
      ({ error } = await supabase.from('match_results').insert(payload));
    }

    if (error) {
      toast(error.message, 'error');
    } else {
      toast('Resultado guardado.', 'success');
      setEditTarget(null);
      loadData();
    }
    setSaving(false);
  }

  function playerLabel(players: Player[]): string {
    return players.map(p => `${p.full_name}${p.ranking != null ? ` #${p.ranking}` : ''}`).join(' / ') || 'Sin asignar';
  }

  function winnerBadge(result: MatchResult | null, side: 'home' | 'away') {
    if (!result?.winner) return null;
    if (result.winner !== side) return null;
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-medium">
        <TrophyIcon className="w-3.5 h-3.5" /> Ganador
      </span>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-navy-900">Resultados</h1>
          <p className="text-sm text-navy-500 mt-0.5">Hoja de resultados por enfrentamiento</p>
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
          <p>No hay enfrentamientos listos para resultados.</p>
          <p className="text-xs mt-1 text-navy-300">Los enfrentamientos aparecen aquí cuando ambas nóminas han sido enviadas.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {confrontations.map(conf => {
            const isOpen = expanded === conf.id;
            const allResultsDone = conf.matches.every(m => m.result?.winner);
            return (
              <div key={conf.id} className="card overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors"
                  onClick={() => setExpanded(isOpen ? null : conf.id)}
                >
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-navy-100 text-navy-700 text-xs font-semibold">
                      {conf.category}
                    </span>
                    <span className="font-semibold text-navy-800 text-sm">
                      {conf.home_league?.name} <span className="text-navy-400 font-normal">vs</span> {conf.away_league?.name}
                    </span>
                    {allResultsDone && (
                      <span className="hidden sm:inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                        <CheckCircleIcon className="w-3 h-3" /> Completo
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="hidden sm:flex items-center gap-1.5 text-xs text-navy-400">
                      <CalendarDaysIcon className="w-3.5 h-3.5" />
                      {new Date(`${conf.match_date}T${conf.match_time}`).toLocaleString('es-ES', {
                        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[conf.status] || 'bg-slate-100 text-slate-600'}`}>
                      {STATUS_LABELS[conf.status] || conf.status}
                    </span>
                    {isOpen ? <ChevronUpIcon className="w-4 h-4 text-navy-400" /> : <ChevronDownIcon className="w-4 h-4 text-navy-400" />}
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-slate-100 px-5 py-5 space-y-4">
                    {/* VS header */}
                    <div className="grid grid-cols-3 text-center text-xs font-semibold text-navy-500 uppercase tracking-wide mb-1">
                      <span className="text-left">{conf.home_league?.name}</span>
                      <span></span>
                      <span className="text-right">{conf.away_league?.name}</span>
                    </div>

                    {conf.matches.map(match => {
                      const hasResult = !!match.result?.winner;
                      return (
                        <div
                          key={match.slot}
                          className={`rounded-xl border transition-colors ${hasResult ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200 bg-white'}`}
                        >
                          {/* Slot label */}
                          <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-slate-100">
                            <span className="text-xs font-semibold text-navy-600 uppercase tracking-wide">
                              {SLOT_LABELS[match.slot]}
                            </span>
                            {canEdit && (
                              <button
                                onClick={() => openEdit({
                                  confrontationId: conf.id,
                                  slot: match.slot,
                                  homePlayers: match.homePlayers,
                                  awayPlayers: match.awayPlayers,
                                  existing: match.result,
                                })}
                                className="flex items-center gap-1.5 text-xs text-navy-500 hover:text-navy-800 hover:bg-navy-50 px-2 py-1 rounded-lg transition-colors"
                              >
                                <PencilSquareIcon className="w-3.5 h-3.5" />
                                {match.result ? 'Editar resultado' : 'Ingresar resultado'}
                              </button>
                            )}
                          </div>

                          {/* VS layout */}
                          <div className="grid grid-cols-3 items-center gap-2 px-4 py-3">
                            {/* Home */}
                            <div className={`space-y-0.5 ${match.result?.winner === 'home' ? 'opacity-100' : match.result?.winner === 'away' ? 'opacity-50' : ''}`}>
                              {match.homePlayers.length > 0 ? match.homePlayers.map(p => (
                                <p key={p.id} className="text-sm font-medium text-navy-800">
                                  {p.full_name}
                                  {p.ranking != null && <span className="text-xs text-navy-400 ml-1">#{p.ranking}</span>}
                                </p>
                              )) : (
                                <p className="text-sm text-slate-400 italic">Sin asignar</p>
                              )}
                              {winnerBadge(match.result, 'home')}
                            </div>

                            {/* Score / VS */}
                            <div className="text-center">
                              {match.result && (match.result.home_score || match.result.away_score) ? (
                                <div className="space-y-0.5">
                                  <div className="flex items-center justify-center gap-2">
                                    <span className={`text-lg font-bold ${match.result.winner === 'home' ? 'text-emerald-600' : 'text-navy-400'}`}>
                                      {match.result.home_score || '—'}
                                    </span>
                                    <span className="text-navy-300 text-sm font-medium">vs</span>
                                    <span className={`text-lg font-bold ${match.result.winner === 'away' ? 'text-emerald-600' : 'text-navy-400'}`}>
                                      {match.result.away_score || '—'}
                                    </span>
                                  </div>
                                  {match.result.notes && (
                                    <p className="text-xs text-navy-400">{match.result.notes}</p>
                                  )}
                                </div>
                              ) : (
                                <span className="text-sm font-bold text-navy-300">VS</span>
                              )}
                            </div>

                            {/* Away */}
                            <div className={`space-y-0.5 text-right ${match.result?.winner === 'away' ? 'opacity-100' : match.result?.winner === 'home' ? 'opacity-50' : ''}`}>
                              {match.awayPlayers.length > 0 ? match.awayPlayers.map(p => (
                                <p key={p.id} className="text-sm font-medium text-navy-800">
                                  {p.full_name}
                                  {p.ranking != null && <span className="text-xs text-navy-400 ml-1">#{p.ranking}</span>}
                                </p>
                              )) : (
                                <p className="text-sm text-slate-400 italic">Sin asignar</p>
                              )}
                              <div className="flex justify-end">
                                {winnerBadge(match.result, 'away')}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Navigate to rosters */}
                    {canEdit && (
                      <div className="flex justify-end pt-1">
                        <button
                          onClick={() => navigate(`/nominas/${conf.id}`)}
                          className="text-xs text-navy-400 hover:text-navy-600 underline underline-offset-2 transition-colors"
                        >
                          Ver nóminas completas
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Result Modal */}
      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="Registrar Resultado"
        size="sm"
      >
        {editTarget && (
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm">
              <p className="font-medium text-navy-700 mb-1">{SLOT_LABELS[editTarget.slot]}</p>
              <div className="flex items-center justify-between text-xs text-navy-500">
                <span className="font-medium text-navy-700">{playerLabel(editTarget.homePlayers)}</span>
                <span className="text-navy-300 font-bold px-2">vs</span>
                <span className="font-medium text-navy-700 text-right">{playerLabel(editTarget.awayPlayers)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Marcador Local</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Ej: 6-3 6-4"
                  value={form.home_score}
                  onChange={e => setForm(f => ({ ...f, home_score: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Marcador Visitante</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Ej: 3-6 2-6"
                  value={form.away_score}
                  onChange={e => setForm(f => ({ ...f, away_score: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <label className="label">Ganador</label>
              <div className="grid grid-cols-2 gap-2">
                {(['home', 'away'] as MatchWinner[]).map(side => (
                  <button
                    key={side}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, winner: f.winner === side ? '' : side }))}
                    className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                      form.winner === side
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 bg-white text-navy-600 hover:border-navy-300'
                    }`}
                  >
                    {side === 'home' ? editTarget.homePlayers[0]?.full_name?.split(' ')[0] || 'Local' : editTarget.awayPlayers[0]?.full_name?.split(' ')[0] || 'Visitante'}
                    <span className="block text-xs font-normal opacity-70">{side === 'home' ? 'Local' : 'Visitante'}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label">Notas (opcional)</label>
              <textarea
                className="input-field resize-none"
                rows={2}
                placeholder="Retiro, W.O., observaciones..."
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={() => setEditTarget(null)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={handleSaveResult} disabled={saving} className="btn-primary flex-1">
                {saving ? 'Guardando...' : 'Guardar resultado'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
