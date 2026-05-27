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
  PlayIcon,
  MapPinIcon,
  Squares2X2Icon,
  ListBulletIcon,
} from '@heroicons/react/24/outline';
import { supabase } from '../../lib/supabase';
import type { Confrontation, Court, Roster, Player, RosterSlot, MatchResult, MatchWinner } from '../../types/database';
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

function setWinner(home: number, away: number): 'home' | 'away' | null {
  if (home === away) return null;
  const hi = Math.max(home, away), lo = Math.min(home, away);
  const side = home > away ? 'home' : 'away';
  if (hi >= 6 && hi - lo >= 2) return side;
  if (hi === 7 && lo === 6) return side;
  if (hi === 7 && lo === 5) return side;
  return null;
}

function computeMatchWinner(
  s1h: number | null, s1a: number | null,
  s2h: number | null, s2a: number | null,
  s3h: number | null, s3a: number | null,
): MatchWinner | null {
  let homeWins = 0, awayWins = 0;
  const sets: Array<[number | null, number | null]> = [[s1h, s1a], [s2h, s2a], [s3h, s3a]];
  for (const [h, a] of sets) {
    if (h == null || a == null) continue;
    const w = setWinner(h, a);
    if (w === 'home') homeWins++;
    else if (w === 'away') awayWins++;
  }
  if (homeWins >= 2) return 'home';
  if (awayWins >= 2) return 'away';
  return null;
}

function isValidSet(h: number, a: number): boolean {
  if (h < 0 || a < 0) return false;
  return setWinner(h, a) !== null;
}

interface MatchVS {
  slot: RosterSlot;
  homePlayers: Player[];
  awayPlayers: Player[];
  result: MatchResult | null;
  court: string | null;
}

interface ConfrontationRow extends Confrontation {
  matches: MatchVS[];
}

interface SetForm {
  s1h: string; s1a: string;
  s2h: string; s2a: string;
  s3h: string; s3a: string;
}

interface ResultForm extends SetForm {
  wo: boolean;
  wo_winner: MatchWinner | '';
  notes: string;
}

interface EditTarget {
  confrontationId: string;
  slot: RosterSlot;
  homePlayers: Player[];
  awayPlayers: Player[];
  existing: MatchResult | null;
}

const EMPTY_FORM: ResultForm = {
  s1h: '', s1a: '', s2h: '', s2a: '', s3h: '', s3a: '',
  wo: false, wo_winner: '', notes: '',
};

function playerLabel(players: Player[]): string {
  return players.map(p => p.full_name).join(' / ') || 'Jugador';
}

function num(v: string): number | null {
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

interface StandingRow {
  league_id: string;
  leagueName: string;
  wins: number;
  losses: number;
}

interface ChampionRow {
  category: string;
  leagueName: string;
  year_won: number;
  logo_url: string | null;
}

const SLOT_ORDER: RosterSlot[] = ['partido_1', 'partido_2', 'dobles'];

interface CourtGridProps {
  confrontations: ConfrontationRow[];
  courts: Court[];
}

function CourtGridView({ confrontations, courts }: CourtGridProps) {
  // Build a map: courtName -> slot -> list of matches in that cell
  const grid: Record<string, Record<RosterSlot, { conf: ConfrontationRow; match: MatchVS }[]>> = {};

  for (const court of courts) {
    grid[court.name] = { partido_1: [], partido_2: [], dobles: [] };
  }

  // Also collect courts mentioned in matches but not in the active courts list
  const extraCourts = new Set<string>();
  for (const conf of confrontations) {
    for (const match of conf.matches) {
      if (match.court && !grid[match.court]) {
        extraCourts.add(match.court);
      }
    }
  }
  for (const courtName of extraCourts) {
    grid[courtName] = { partido_1: [], partido_2: [], dobles: [] };
  }

  for (const conf of confrontations) {
    for (const match of conf.matches) {
      const courtName = match.court;
      if (courtName && grid[courtName]) {
        grid[courtName][match.slot].push({ conf, match });
      }
    }
  }

  const allCourtNames = [
    ...courts.map(c => c.name),
    ...Array.from(extraCourts).sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ''), 10);
      const numB = parseInt(b.replace(/\D/g, ''), 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b);
    }),
  ];

  const matchStatusColors: Record<string, string> = {
    in_progress: 'bg-green-50 border-green-200',
    finished: 'bg-slate-50 border-slate-200',
    pending: 'bg-white border-slate-200',
  };

  const matchStatusBadge: Record<string, string> = {
    in_progress: 'bg-green-100 text-green-700',
    finished: 'bg-emerald-100 text-emerald-700',
    pending: 'bg-slate-100 text-slate-500',
  };

  const matchStatusLabel: Record<string, string> = {
    in_progress: 'En curso',
    finished: 'Finalizado',
    pending: 'Pendiente',
  };

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm min-w-[600px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-28 border-r border-slate-200">
                Partido
              </th>
              {allCourtNames.map(courtName => (
                <th key={courtName} className="text-center px-3 py-3 text-xs font-bold text-navy-700 uppercase tracking-wider border-r border-slate-200 last:border-r-0 min-w-[160px]">
                  {courtName}
                </th>
              ))}
              {allCourtNames.length === 0 && (
                <th className="text-center px-4 py-3 text-xs text-slate-400">Sin canchas configuradas</th>
              )}
            </tr>
          </thead>
          <tbody>
            {SLOT_ORDER.map((slot, idx) => (
              <tr key={slot} className={idx < SLOT_ORDER.length - 1 ? 'border-b border-slate-100' : ''}>
                <td className="px-4 py-3 font-semibold text-xs text-navy-600 uppercase tracking-wide align-top border-r border-slate-200 whitespace-nowrap">
                  {SLOT_LABELS[slot]}
                </td>
                {allCourtNames.map(courtName => {
                  const cells = grid[courtName]?.[slot] || [];
                  return (
                    <td key={courtName} className="px-2 py-2 align-top border-r border-slate-100 last:border-r-0">
                      {cells.length === 0 ? (
                        <div className="h-16 rounded-lg bg-slate-50/50 border border-dashed border-slate-200" />
                      ) : (
                        <div className="space-y-1.5">
                          {cells.map(({ conf, match }) => {
                            const status = match.result?.match_status || 'pending';
                            const homeScore = match.result?.winner === 'home' ? '✓' : '';
                            const awayScore = match.result?.winner === 'away' ? '✓' : '';
                            const sets = [
                              { h: match.result?.set1_home, a: match.result?.set1_away },
                              { h: match.result?.set2_home, a: match.result?.set2_away },
                              { h: match.result?.set3_home, a: match.result?.set3_away },
                            ].filter(s => s.h != null || s.a != null);
                            const scoreStr = sets.map(s => `${s.h ?? 0}-${s.a ?? 0}`).join('  ');

                            return (
                              <div
                                key={`${conf.id}-${match.slot}`}
                                className={`rounded-lg border p-2 text-xs ${matchStatusColors[status] || 'bg-white border-slate-200'}`}
                              >
                                <div className="flex items-center justify-between gap-1 mb-1">
                                  <span className="font-bold text-navy-700 text-[10px] uppercase tracking-wide truncate">{conf.category}</span>
                                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${matchStatusBadge[status] || 'bg-slate-100 text-slate-500'}`}>
                                    {matchStatusLabel[status] || status}
                                  </span>
                                </div>
                                <div className="space-y-0.5">
                                  <div className={`flex items-center justify-between gap-1 ${match.result?.winner === 'home' ? 'font-semibold text-navy-900' : 'text-navy-600'}`}>
                                    <span className="truncate text-[11px]">{conf.home_league?.name || 'Local'}</span>
                                    {homeScore && <span className="text-emerald-600 flex-shrink-0">{homeScore}</span>}
                                  </div>
                                  <div className={`flex items-center justify-between gap-1 ${match.result?.winner === 'away' ? 'font-semibold text-navy-900' : 'text-navy-600'}`}>
                                    <span className="truncate text-[11px]">{conf.away_league?.name || 'Visitante'}</span>
                                    {awayScore && <span className="text-emerald-600 flex-shrink-0">{awayScore}</span>}
                                  </div>
                                </div>
                                {scoreStr && (
                                  <p className="mt-1 text-[10px] font-mono text-slate-500 text-center">{scoreStr}</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {allCourtNames.length === 0 && (
        <div className="py-10 text-center text-slate-400 text-sm">
          <MapPinIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p>No hay canchas activas configuradas.</p>
          <p className="text-xs mt-1 text-slate-300">Configura las canchas desde el módulo de Administración.</p>
        </div>
      )}
    </div>
  );
}

export default function ResultsPage() {
  const [confrontations, setConfrontations] = useState<ConfrontationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [form, setForm] = useState<ResultForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const [finishing, setFinishing] = useState<string | null>(null);
  const [elapsedTimes, setElapsedTimes] = useState<Record<string, number>>({});
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [courts, setCourts] = useState<Court[]>([]);

  // Standings
  const [standingsByCategory, setStandingsByCategory] = useState<Record<string, StandingRow[]>>({});
  const [champions, setChampions] = useState<ChampionRow[]>([]);
  const [standingsTab, setStandingsTab] = useState('');

  const { isSuperAdmin, isMesaDeControl, hasPermission, user } = useAuthStore();
  const canEdit = isSuperAdmin() || isMesaDeControl() || hasPermission('results', 'edit');
  const navigate = useNavigate();

  const loadStandings = useCallback(async () => {
    const [{ data: standings }, { data: champData }] = await Promise.all([
      supabase.from('series_standings').select('category, league_id, wins, losses, leagues(name)'),
      supabase.from('champion_config').select('category, year_won, logo_url, leagues(name)'),
    ]);
    const byCategory: Record<string, StandingRow[]> = {};
    for (const s of (standings || [])) {
      const cat = s.category;
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push({
        league_id: s.league_id,
        leagueName: (s as any).leagues?.name || '—',
        wins: s.wins,
        losses: s.losses,
      });
    }
    for (const cat of Object.keys(byCategory)) {
      byCategory[cat].sort((a, b) => b.wins - a.wins);
    }
    setStandingsByCategory(byCategory);
    const champs: ChampionRow[] = (champData || []).map((c: any) => ({
      category: c.category,
      leagueName: c.leagues?.name || '—',
      year_won: c.year_won,
      logo_url: c.logo_url,
    }));
    setChampions(champs);
    const cats = Object.keys(byCategory);
    if (cats.length > 0) setStandingsTab(prev => prev && cats.includes(prev) ? prev : cats[0]);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);

    const { data: confs } = await supabase
      .from('confrontations')
      .select('*, home_league:leagues!confrontations_home_league_id_fkey(id,name,city,representative,email,created_at), away_league:leagues!confrontations_away_league_id_fkey(id,name,city,representative,email,created_at), court:courts(id,name,active,created_at)')
      .in('status', ['cerrada', 'en_curso', 'finalizada'])
      .order('match_date', { ascending: false });

    if (!confs || confs.length === 0) { setConfrontations([]); setLoading(false); return; }

    const confIds = confs.map(c => c.id);

    const [{ data: rosters }, { data: players }, { data: results }] = await Promise.all([
      supabase.from('rosters').select('*').in('confrontation_id', confIds).eq('is_submitted', true),
      supabase.from('players').select('id, full_name, ranking'),
      supabase.from('match_results').select('*').in('confrontation_id', confIds),
    ]);

    const rosterIds = (rosters || []).map((r: any) => r.id);
    const { data: assignments } = rosterIds.length
      ? await supabase.from('match_assignments').select('roster_id, slot, court').in('roster_id', rosterIds)
      : { data: [] };
    const courtMap = new Map<string, string>();
    for (const a of (assignments || [])) {
      if (a.court) courtMap.set(`${a.roster_id}-${a.slot}`, a.court);
    }

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
        const homeCourt = homeRoster ? courtMap.get(`${homeRoster.id}-${slot}`) || null : null;
        const awayCourt = awayRoster ? courtMap.get(`${awayRoster.id}-${slot}`) || null : null;
        const court = homeCourt || awayCourt || conf.court?.name || null;
        return { slot, homePlayers, awayPlayers, result, court };
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

  useEffect(() => { loadData(); loadStandings(); }, [loadData, loadStandings]);

  useEffect(() => {
    supabase.from('courts').select('*').eq('active', true).then(({ data }) => {
      const sorted = (data || []).sort((a, b) => {
        const numA = parseInt(a.name.replace(/\D/g, ''), 10);
        const numB = parseInt(b.name.replace(/\D/g, ''), 10);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.name.localeCompare(b.name);
      });
      setCourts(sorted);
    });
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const next: Record<string, number> = {};
      confrontations.forEach(conf => {
        conf.matches.forEach(m => {
          if (m.result?.match_status === 'in_progress' && m.result.started_at) {
            const key = `${conf.id}-${m.slot}`;
            next[key] = Math.floor((Date.now() - new Date(m.result.started_at).getTime()) / 1000);
          }
        });
      });
      setElapsedTimes(next);
    }, 1000);
    return () => clearInterval(interval);
  }, [confrontations]);

  function openEdit(target: EditTarget) {
    setEditTarget(target);
    const r = target.existing;
    setForm(r ? {
      s1h: r.set1_home != null ? String(r.set1_home) : '',
      s1a: r.set1_away != null ? String(r.set1_away) : '',
      s2h: r.set2_home != null ? String(r.set2_home) : '',
      s2a: r.set2_away != null ? String(r.set2_away) : '',
      s3h: r.set3_home != null ? String(r.set3_home) : '',
      s3a: r.set3_away != null ? String(r.set3_away) : '',
      wo: r.wo || false,
      wo_winner: r.wo_winner || '',
      notes: r.notes || '',
    } : EMPTY_FORM);
  }

  const formWinner: MatchWinner | null = form.wo
    ? (form.wo_winner as MatchWinner | null) || null
    : computeMatchWinner(num(form.s1h), num(form.s1a), num(form.s2h), num(form.s2a), num(form.s3h), num(form.s3a));

  const s1warn = form.s1h !== '' && form.s1a !== '' && num(form.s1h) != null && num(form.s1a) != null
    && !isValidSet(num(form.s1h)!, num(form.s1a)!);
  const s2warn = form.s2h !== '' && form.s2a !== '' && num(form.s2h) != null && num(form.s2a) != null
    && !isValidSet(num(form.s2h)!, num(form.s2a)!);
  const s3warn = form.s3h !== '' && form.s3a !== '' && num(form.s3h) != null && num(form.s3a) != null
    && !isValidSet(num(form.s3h)!, num(form.s3a)!);

  async function handleSaveResult() {
    if (!editTarget) return;
    setSaving(true);

    const { confrontationId, slot, homePlayers, awayPlayers, existing } = editTarget;
    const winner = form.wo ? (form.wo_winner as MatchWinner | null) || null : formWinner;

    const payload = {
      confrontation_id: confrontationId,
      slot,
      home_player_ids: homePlayers.map(p => p.id),
      away_player_ids: awayPlayers.map(p => p.id),
      home_score: '',
      away_score: '',
      set1_home: form.wo ? null : num(form.s1h),
      set1_away: form.wo ? null : num(form.s1a),
      set2_home: form.wo ? null : num(form.s2h),
      set2_away: form.wo ? null : num(form.s2a),
      set3_home: form.wo ? null : num(form.s3h),
      set3_away: form.wo ? null : num(form.s3a),
      wo: form.wo,
      wo_winner: form.wo ? (form.wo_winner || null) : null,
      winner,
      notes: form.notes,
      match_status: winner ? 'finished' : (existing?.match_status === 'in_progress' ? 'in_progress' : 'pending'),
      finished_at: winner ? new Date().toISOString() : (existing?.finished_at ?? null),
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
      toast('error', error.message);
    } else {
      toast('success', 'Resultado guardado.');
      setEditTarget(null);
      await loadData();
      // Auto-finalize confrontation when all 3 matches have a winner
      const { data: allResults } = await supabase
        .from('match_results')
        .select('winner, match_status')
        .eq('confrontation_id', confrontationId);
      if (allResults && allResults.length === 3 && allResults.every(r => r.winner)) {
        await supabase.from('confrontations').update({ status: 'finalizada' }).eq('id', confrontationId);
        // Ensure all match_results are marked finished
        await supabase
          .from('match_results')
          .update({ match_status: 'finished', finished_at: new Date().toISOString() })
          .eq('confrontation_id', confrontationId)
          .neq('match_status', 'finished');
        await loadData();
      }
      await updateSeriesIfComplete(confrontationId);
    }
    setSaving(false);
  }

  async function handleFinalizeConfrontation(confrontationId: string) {
    setFinishing(confrontationId);
    // Mark all finished matches and update confrontation status
    await supabase
      .from('match_results')
      .update({ match_status: 'finished', finished_at: new Date().toISOString() })
      .eq('confrontation_id', confrontationId)
      .neq('match_status', 'finished');
    await supabase.from('confrontations').update({ status: 'finalizada' }).eq('id', confrontationId);
    toast('success', 'Confrontación finalizada.');
    setFinishing(null);
    await loadData();
    await updateSeriesIfComplete(confrontationId);
  }

  async function updateSeriesIfComplete(confrontationId: string) {
    const conf = confrontations.find(c => c.id === confrontationId);
    if (!conf) return;

    // Re-fetch results to get updated state
    const { data: allResults } = await supabase
      .from('match_results')
      .select('winner, match_status')
      .eq('confrontation_id', confrontationId);

    if (!allResults || allResults.length < 3) return;
    // Allow finalizing when all have a winner even if not all match_status=finished
    if (!allResults.every(r => r.winner)) return;

    let homeWins = 0, awayWins = 0;
    for (const r of allResults) {
      if (r.winner === 'home') homeWins++;
      else if (r.winner === 'away') awayWins++;
    }

    const seriesWinner: 'home' | 'away' | null = homeWins >= 2 ? 'home' : awayWins >= 2 ? 'away' : null;
    if (!seriesWinner) return;

    const winnerLeagueId = seriesWinner === 'home' ? conf.home_league_id : conf.away_league_id;
    const loserLeagueId = seriesWinner === 'home' ? conf.away_league_id : conf.home_league_id;

    // Update series_winner on confrontation
    await supabase.from('confrontations').update({ series_winner: seriesWinner }).eq('id', confrontationId);

    // UPSERT standings for winner
    await supabase.from('series_standings').upsert(
      { category: conf.category, league_id: winnerLeagueId, wins: 1, losses: 0, updated_at: new Date().toISOString() },
      { onConflict: 'category,league_id', ignoreDuplicates: false }
    );
    // Increment: fetch current and update
    const { data: wRow } = await supabase.from('series_standings')
      .select('wins').eq('category', conf.category).eq('league_id', winnerLeagueId).maybeSingle();
    if (wRow) {
      await supabase.from('series_standings')
        .update({ wins: wRow.wins + 1, updated_at: new Date().toISOString() })
        .eq('category', conf.category).eq('league_id', winnerLeagueId);
    }

    // UPSERT standings for loser
    const { data: lRow } = await supabase.from('series_standings')
      .select('losses').eq('category', conf.category).eq('league_id', loserLeagueId).maybeSingle();
    if (lRow) {
      await supabase.from('series_standings')
        .update({ losses: lRow.losses + 1, updated_at: new Date().toISOString() })
        .eq('category', conf.category).eq('league_id', loserLeagueId);
    } else {
      await supabase.from('series_standings').insert({
        category: conf.category, league_id: loserLeagueId, wins: 0, losses: 1
      });
    }

    await loadStandings();
  }

  async function handleStartMatch(confrontationId: string, slot: RosterSlot, homePlayers: Player[], awayPlayers: Player[], existing: MatchResult | null) {
    setStarting(`${confrontationId}-${slot}`);
    const now = new Date().toISOString();
    if (existing) {
      await supabase.from('match_results').update({ match_status: 'in_progress', started_at: now }).eq('id', existing.id);
    } else {
      await supabase.from('match_results').insert({
        confrontation_id: confrontationId,
        slot,
        home_player_ids: homePlayers.map(p => p.id),
        away_player_ids: awayPlayers.map(p => p.id),
        home_score: '',
        away_score: '',
        match_status: 'in_progress',
        started_at: now,
        wo: false,
      });
    }
    await supabase.from('confrontations').update({ status: 'en_curso' }).eq('id', confrontationId).eq('status', 'cerrada');
    toast('success', 'Partido iniciado.');
    setStarting(null);
    loadData();
  }

  async function handleFinishMatch(confrontationId: string, slot: RosterSlot, existingId: string) {
    setFinishing(`${confrontationId}-${slot}`);
    await supabase.from('match_results').update({ match_status: 'finished', finished_at: new Date().toISOString() }).eq('id', existingId);

    const { data: allResults } = await supabase.from('match_results').select('match_status, winner').eq('confrontation_id', confrontationId);
    if (allResults && allResults.length === 3 && allResults.every(r => r.match_status === 'finished')) {
      await supabase.from('confrontations').update({ status: 'finalizada' }).eq('id', confrontationId);
    }

    toast('success', 'Partido finalizado.');
    setFinishing(null);
    await loadData();
    await updateSeriesIfComplete(confrontationId);
  }

  // Per-slot scoreboard display
  function MatchScoreBoard({ match, confId, homeName, awayName }: {
    match: MatchVS;
    confId: string;
    homeName: string;
    awayName: string;
  }) {
    const r = match.result;
    const startKey = `${confId}-${match.slot}`;
    const isStarting = starting === startKey;
    const isFinishingThis = finishing === startKey;
    const elapsed = elapsedTimes[startKey];

    const setResults: Array<{ homeVal: number | null; awayVal: number | null; setWin: 'home' | 'away' | null }> = [
      { homeVal: r?.set1_home ?? null, awayVal: r?.set1_away ?? null, setWin: (r?.set1_home != null && r?.set1_away != null) ? setWinner(r.set1_home!, r.set1_away!) : null },
      { homeVal: r?.set2_home ?? null, awayVal: r?.set2_away ?? null, setWin: (r?.set2_home != null && r?.set2_away != null) ? setWinner(r.set2_home!, r.set2_away!) : null },
      { homeVal: r?.set3_home ?? null, awayVal: r?.set3_away ?? null, setWin: (r?.set3_home != null && r?.set3_away != null) ? setWinner(r.set3_home!, r.set3_away!) : null },
    ];

    const hasAnyScore = r && (r.set1_home != null || r.wo);
    const isFinished = r?.match_status === 'finished' || r?.winner;
    const isInProgress = r?.match_status === 'in_progress';
    const isPending = !r || r.match_status === 'pending';

    return (
      <div className={`rounded-xl border transition-colors ${
        isFinished ? 'border-emerald-200 bg-emerald-50/20' :
        isInProgress ? 'border-green-300 bg-green-50/30' :
        'border-slate-200 bg-white'
      }`}>
        <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-semibold text-navy-600 uppercase tracking-wide flex-shrink-0">
              {SLOT_LABELS[match.slot]}
            </span>
            {match.court ? (
              <span className="flex items-center gap-1 text-xs text-navy-500 bg-slate-100 px-1.5 py-0.5 rounded-md">
                <MapPinIcon className="w-3 h-3 flex-shrink-0" />{match.court}
              </span>
            ) : (
              <span className="text-xs text-slate-300">Sin cancha</span>
            )}
            {isInProgress && (
              <span className="flex items-center gap-1.5 text-xs text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
                En curso
                {elapsed != null && <span className="font-mono">{elapsed >= 3600 ? `${Math.floor(elapsed/3600)}:${String(Math.floor((elapsed%3600)/60)).padStart(2,'0')}:${String(elapsed%60).padStart(2,'0')}` : `${String(Math.floor(elapsed/60)).padStart(2,'0')}:${String(elapsed%60).padStart(2,'0')}`}</span>}
              </span>
            )}
            {isFinished && (
              <span className="flex items-center gap-1 text-xs text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full font-medium">
                <CheckCircleIcon className="w-3 h-3" />
                Finalizado
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {canEdit && isPending && (
              <button
                onClick={() => handleStartMatch(confId, match.slot, match.homePlayers, match.awayPlayers, r)}
                disabled={!!isStarting}
                className="flex items-center gap-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-60"
              >
                <PlayIcon className="w-3 h-3" />
                {isStarting ? 'Iniciando...' : 'Iniciar'}
              </button>
            )}
            {canEdit && isInProgress && r && (
              <button
                onClick={() => handleFinishMatch(confId, match.slot, r.id)}
                disabled={!!isFinishingThis}
                className="flex items-center gap-1 text-xs font-medium text-white bg-navy-700 hover:bg-navy-800 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-60"
              >
                <CheckCircleIcon className="w-3 h-3" />
                {isFinishingThis ? '...' : 'Finalizar'}
              </button>
            )}
            {canEdit && (
              <button
                onClick={() => openEdit({ confrontationId: confId, slot: match.slot, homePlayers: match.homePlayers, awayPlayers: match.awayPlayers, existing: r })}
                className="flex items-center gap-1.5 text-xs text-navy-500 hover:text-navy-800 hover:bg-navy-50 px-2 py-1 rounded-lg transition-colors"
              >
                <PencilSquareIcon className="w-3.5 h-3.5" />
                {r ? 'Editar' : 'Ingresar resultado'}
              </button>
            )}
          </div>
        </div>

        <div className="px-4 py-3">
          {r?.wo ? (
            <div className="flex items-center gap-3">
              <div className="flex-1 space-y-1">
                <div className={`flex items-center justify-between px-3 py-1.5 rounded-lg ${r.winner === 'home' ? 'bg-[#1a2a5e] text-white' : 'bg-slate-100 text-navy-400'}`}>
                  <span className="text-sm font-semibold truncate">{playerLabel(match.homePlayers)}</span>
                  {r.winner === 'home' && <TrophyIcon className="w-4 h-4 text-amber-400 flex-shrink-0 ml-2" />}
                </div>
                <div className={`flex items-center justify-between px-3 py-1.5 rounded-lg ${r.winner === 'away' ? 'bg-[#1a2a5e] text-white' : 'bg-slate-100 text-navy-400'}`}>
                  <span className="text-sm font-semibold truncate">{playerLabel(match.awayPlayers)}</span>
                  {r.winner === 'away' && <TrophyIcon className="w-4 h-4 text-amber-400 flex-shrink-0 ml-2" />}
                </div>
              </div>
              <div className="text-center">
                <span className="text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">W.O.</span>
              </div>
            </div>
          ) : hasAnyScore ? (
            <table className="w-full">
              <tbody>
                <tr>
                  <td className={`py-1.5 pr-2 text-sm font-semibold max-w-0 truncate ${r?.winner === 'home' ? 'text-navy-900' : 'text-navy-500'}`} style={{ width: '60%' }}>
                    <div className="flex items-center gap-1.5 truncate">
                      {r?.winner === 'home' && <TrophyIcon className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
                      <span className="truncate">{playerLabel(match.homePlayers)}</span>
                    </div>
                  </td>
                  {setResults.map((s, i) => (
                    <td key={i} className="w-10 text-center">
                      <span className={`inline-block w-8 text-sm font-bold rounded text-center ${s.setWin === 'home' ? 'text-white bg-[#1a2a5e]' : 'text-navy-500'}`}>
                        {s.homeVal ?? '—'}
                      </span>
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className={`py-1.5 pr-2 text-sm font-semibold truncate ${r?.winner === 'away' ? 'text-navy-900' : 'text-navy-500'}`}>
                    <div className="flex items-center gap-1.5 truncate">
                      {r?.winner === 'away' && <TrophyIcon className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
                      <span className="truncate">{playerLabel(match.awayPlayers)}</span>
                    </div>
                  </td>
                  {setResults.map((s, i) => (
                    <td key={i} className="w-10 text-center">
                      <span className={`inline-block w-8 text-sm font-bold rounded text-center ${s.setWin === 'away' ? 'text-white bg-[#1a2a5e]' : 'text-navy-500'}`}>
                        {s.awayVal ?? '—'}
                      </span>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          ) : (
            <div className="flex items-center justify-between text-sm">
              <span className={`font-medium truncate max-w-[40%] ${r?.winner === 'home' ? 'text-navy-900 font-semibold' : 'text-navy-500'}`}>
                {playerLabel(match.homePlayers)}
              </span>
              <span className="text-navy-300 font-bold text-xs px-2">vs</span>
              <span className={`font-medium truncate max-w-[40%] text-right ${r?.winner === 'away' ? 'text-navy-900 font-semibold' : 'text-navy-500'}`}>
                {playerLabel(match.awayPlayers)}
              </span>
            </div>
          )}
          {r?.notes && (
            <p className="text-xs text-navy-400 mt-1.5">{r.notes}</p>
          )}
        </div>
      </div>
    );
  }

  const standingsCats = Object.keys(standingsByCategory).sort();
  const activeChampion = champions.find(c => c.category === standingsTab);
  const activeStandings = standingsByCategory[standingsTab] || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-navy-900">Resultados</h1>
          <p className="text-sm text-navy-500 mt-0.5">Hoja de resultados por enfrentamiento</p>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 self-start sm:self-auto">
          <button
            onClick={() => setViewMode('list')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              viewMode === 'list' ? 'bg-white text-navy-800 shadow-sm' : 'text-slate-500 hover:text-navy-700'
            }`}
          >
            <ListBulletIcon className="w-4 h-4" />
            Lista
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              viewMode === 'grid' ? 'bg-white text-navy-800 shadow-sm' : 'text-slate-500 hover:text-navy-700'
            }`}
          >
            <Squares2X2Icon className="w-4 h-4" />
            Canchas
          </button>
        </div>
      </div>

      <SearchInput value={search} onChange={v => setSearch(v)} placeholder="Buscar por liga o categoría..." />

      {/* Standings + Champion section */}
      {standingsCats.length > 0 && (
        <div className="card overflow-hidden">
          {standingsCats.length > 1 && (
            <div className="flex border-b border-slate-100 bg-slate-50 overflow-x-auto">
              {standingsCats.map(cat => (
                <button
                  key={cat}
                  onClick={() => setStandingsTab(cat)}
                  className={`px-4 py-2.5 text-xs font-semibold flex-shrink-0 transition-colors border-b-2 ${
                    standingsTab === cat
                      ? 'border-navy-700 text-navy-800 bg-white'
                      : 'border-transparent text-slate-500 hover:text-navy-700'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
            {activeChampion ? (
              <div className="flex items-center gap-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
                {activeChampion.logo_url ? (
                  <img src={activeChampion.logo_url} alt="logo" className="w-14 h-14 object-contain rounded-lg flex-shrink-0" />
                ) : (
                  <div className="w-14 h-14 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <TrophyIcon className="w-7 h-7 text-amber-600" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-0.5">Campeón Defensor</p>
                  <p className="font-bold text-navy-900 text-sm leading-tight truncate">{activeChampion.leagueName}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Campeón defensor {activeChampion.year_won}</p>
                  <span className="inline-block mt-1 text-xs font-bold px-2 py-0.5 bg-navy-100 text-navy-700 rounded-md">{activeChampion.category}</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="w-14 h-14 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <TrophyIcon className="w-7 h-7 text-slate-300" />
                </div>
                <p className="text-sm text-slate-400">Sin campeón defensor registrado para {standingsTab}</p>
              </div>
            )}

            <div>
              <p className="text-xs font-bold text-navy-700 uppercase tracking-wider mb-3">
                Carrera por el título — {standingsTab}
              </p>
              {activeStandings.length === 0 ? (
                <p className="text-xs text-slate-400">Sin datos aún.</p>
              ) : (
                <div className="space-y-2">
                  {(() => {
                    const maxWins = Math.max(...activeStandings.map(s => s.wins), 1);
                    return activeStandings.map(s => (
                      <div key={s.league_id}>
                        <div className="flex items-center justify-between text-xs mb-0.5">
                          <span className="font-medium text-navy-700 truncate max-w-[70%]">{s.leagueName}</span>
                          <span className="font-bold text-navy-900 flex-shrink-0 ml-2">{s.wins}V {s.losses}D</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-navy-700 rounded-full transition-all duration-500"
                            style={{ width: `${Math.round((s.wins / maxWins) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>
          </div>

          {activeStandings.length > 0 && (
            <div className="border-t border-slate-100">
              <div className="px-5 py-3 bg-slate-50">
                <p className="text-xs font-bold text-navy-700 uppercase tracking-wider">Tabla de Posiciones — {standingsTab}</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left px-5 py-2 text-xs font-semibold text-slate-500">Liga</th>
                    <th className="text-center px-3 py-2 text-xs font-semibold text-slate-500 w-16">G</th>
                    <th className="text-center px-3 py-2 text-xs font-semibold text-slate-500 w-16">P</th>
                  </tr>
                </thead>
                <tbody>
                  {activeStandings.map((s, i) => (
                    <tr key={s.league_id} className={`border-b border-slate-50 ${i === 0 ? 'bg-amber-50/50' : ''}`}>
                      <td className="px-5 py-2.5 font-medium text-navy-800">
                        {i === 0 && <TrophyIcon className="w-3.5 h-3.5 text-amber-500 inline mr-1.5 -mt-0.5" />}
                        {s.leagueName}
                      </td>
                      <td className="text-center px-3 py-2.5 font-bold text-navy-900">{s.wins}</td>
                      <td className="text-center px-3 py-2.5 text-slate-500">{s.losses}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

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
      ) : viewMode === 'grid' ? (
        <CourtGridView confrontations={confrontations} courts={courts} />
      ) : (
        <div className="space-y-4">
          {confrontations.map(conf => {
            const isOpen = expanded === conf.id;
            const allResultsDone = conf.matches.every(m => m.result?.winner);
            // Series score for finished confrontations
            let seriesLabel = '';
            if (conf.status === 'finalizada') {
              let hw = 0, aw = 0;
              for (const m of conf.matches) {
                if (m.result?.winner === 'home') hw++;
                else if (m.result?.winner === 'away') aw++;
              }
              if (hw > 0 || aw > 0) seriesLabel = `${conf.home_league?.name} ${hw} — ${aw} ${conf.away_league?.name}`;
            }
            return (
              <div key={conf.id} className="card overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors"
                  onClick={() => setExpanded(isOpen ? null : conf.id)}
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-navy-100 text-navy-700 text-xs font-semibold flex-shrink-0">
                        {conf.category}
                      </span>
                      <span className="font-semibold text-navy-800 text-sm truncate">
                        {conf.home_league?.name} <span className="text-navy-400 font-normal">vs</span> {conf.away_league?.name}
                      </span>
                      {allResultsDone && (
                        <span className="hidden sm:inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex-shrink-0">
                          <CheckCircleIcon className="w-3 h-3" /> Completo
                        </span>
                      )}
                    </div>
                    {seriesLabel && (
                      <p className="text-xs text-navy-500 font-medium pl-0.5">{seriesLabel}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    {conf.court && (
                      <span className="hidden sm:flex items-center gap-1 text-xs text-navy-400">
                        <MapPinIcon className="w-3 h-3" />
                        {conf.court.name}
                      </span>
                    )}
                    <div className="hidden sm:flex items-center gap-1 text-xs text-navy-400">
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
                  <div className="border-t border-slate-100 px-5 py-5 space-y-3">
                    {conf.matches.map(match => (
                      <MatchScoreBoard
                        key={match.slot}
                        match={match}
                        confId={conf.id}
                        homeName={conf.home_league?.name || 'Local'}
                        awayName={conf.away_league?.name || 'Visitante'}
                      />
                    ))}
                    {canEdit && (
                      <div className="flex items-center justify-between pt-1">
                        <button
                          onClick={() => navigate(`/nominas/${conf.id}`)}
                          className="text-xs text-navy-400 hover:text-navy-600 underline underline-offset-2 transition-colors"
                        >
                          Ver nóminas completas
                        </button>
                        {conf.status === 'en_curso' && allResultsDone && (
                          <button
                            onClick={() => handleFinalizeConfrontation(conf.id)}
                            disabled={finishing === conf.id}
                            className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-700 hover:bg-navy-800 disabled:opacity-60 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            <CheckCircleIcon className="w-3.5 h-3.5" />
                            {finishing === conf.id ? 'Finalizando...' : 'Finalizar confrontación'}
                          </button>
                        )}
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
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="Registrar Resultado" size="sm">
        {editTarget && (
          <div className="space-y-5">
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm">
              <p className="font-semibold text-navy-700 mb-1">{SLOT_LABELS[editTarget.slot]}</p>
              <div className="flex items-center justify-between text-xs text-navy-500 gap-2">
                <span className="font-medium text-navy-700 truncate">{playerLabel(editTarget.homePlayers)}</span>
                <span className="text-navy-300 font-bold px-1 flex-shrink-0">vs</span>
                <span className="font-medium text-navy-700 text-right truncate">{playerLabel(editTarget.awayPlayers)}</span>
              </div>
            </div>

            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                className="w-4 h-4 accent-navy-700 rounded"
                checked={form.wo}
                onChange={e => setForm(f => ({ ...f, wo: e.target.checked, wo_winner: '' }))}
              />
              <span className="text-sm font-medium text-navy-700">W.O. (Walkover)</span>
            </label>

            {form.wo ? (
              <div>
                <label className="label">Jugador/Pareja ganadora por W.O.</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['home', 'away'] as MatchWinner[]).map(side => (
                    <button
                      key={side}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, wo_winner: f.wo_winner === side ? '' : side }))}
                      className={`px-3 py-2.5 rounded-xl border text-sm font-medium transition-all text-left ${
                        form.wo_winner === side
                          ? 'border-navy-700 bg-navy-700 text-white'
                          : 'border-slate-200 bg-white text-navy-600 hover:border-navy-300'
                      }`}
                    >
                      <span className="block text-xs font-normal opacity-70 mb-0.5">{side === 'home' ? 'Local' : 'Visitante'}</span>
                      {playerLabel(side === 'home' ? editTarget.homePlayers : editTarget.awayPlayers)}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-xs font-semibold text-navy-500 uppercase tracking-wide">Marcador por sets</p>
                  <div className="flex-1 h-px bg-slate-100" />
                </div>
                <div className="flex gap-2 mb-1 px-1">
                  <span className="flex-1 text-xs font-medium text-navy-600 truncate">{playerLabel(editTarget.homePlayers)}</span>
                  <span className="text-xs text-navy-300 flex-shrink-0 w-14 text-center">S1</span>
                  <span className="text-xs text-navy-300 flex-shrink-0 w-14 text-center">S2</span>
                  <span className="text-xs text-navy-300 flex-shrink-0 w-14 text-center">S3</span>
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="flex-1 text-xs text-navy-500 truncate">{playerLabel(editTarget.homePlayers)}</span>
                  <input type="number" min="0" max="99" placeholder="0" className={`w-14 text-center input-field py-1.5 text-sm flex-shrink-0 ${s1warn ? 'border-red-300' : ''}`} value={form.s1h} onChange={e => setForm(f => ({ ...f, s1h: e.target.value }))} />
                  <input type="number" min="0" max="99" placeholder="0" className={`w-14 text-center input-field py-1.5 text-sm flex-shrink-0 ${s2warn ? 'border-red-300' : ''}`} value={form.s2h} onChange={e => setForm(f => ({ ...f, s2h: e.target.value }))} />
                  <input type="number" min="0" max="99" placeholder="—" className={`w-14 text-center input-field py-1.5 text-sm flex-shrink-0 ${s3warn ? 'border-red-300' : ''}`} value={form.s3h} onChange={e => setForm(f => ({ ...f, s3h: e.target.value }))} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-xs text-navy-500 truncate">{playerLabel(editTarget.awayPlayers)}</span>
                  <input type="number" min="0" max="99" placeholder="0" className={`w-14 text-center input-field py-1.5 text-sm flex-shrink-0 ${s1warn ? 'border-red-300' : ''}`} value={form.s1a} onChange={e => setForm(f => ({ ...f, s1a: e.target.value }))} />
                  <input type="number" min="0" max="99" placeholder="0" className={`w-14 text-center input-field py-1.5 text-sm flex-shrink-0 ${s2warn ? 'border-red-300' : ''}`} value={form.s2a} onChange={e => setForm(f => ({ ...f, s2a: e.target.value }))} />
                  <input type="number" min="0" max="99" placeholder="—" className={`w-14 text-center input-field py-1.5 text-sm flex-shrink-0 ${s3warn ? 'border-red-300' : ''}`} value={form.s3a} onChange={e => setForm(f => ({ ...f, s3a: e.target.value }))} />
                </div>
                {(s1warn || s2warn || s3warn) && (
                  <p className="text-xs text-red-500 mt-1.5">Marcador de set inválido según reglas de tenis.</p>
                )}
                {formWinner && (
                  <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <TrophyIcon className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <p className="text-xs font-medium text-emerald-700">
                      Ganador calculado: {formWinner === 'home' ? playerLabel(editTarget.homePlayers) : playerLabel(editTarget.awayPlayers)}
                    </p>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="label">Notas (opcional)</label>
              <textarea
                className="input-field resize-none"
                rows={2}
                placeholder="Observaciones..."
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={() => setEditTarget(null)} className="btn-secondary flex-1">Cancelar</button>
              <button
                onClick={handleSaveResult}
                disabled={saving || (form.wo && !form.wo_winner)}
                className="btn-primary flex-1"
              >
                {saving ? 'Guardando...' : 'Guardar resultado'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
