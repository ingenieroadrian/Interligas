import { useEffect, useState, useCallback } from 'react';
import { TrophyIcon, CalendarDaysIcon, MapPinIcon, CheckCircleIcon, ClockIcon } from '@heroicons/react/24/outline';
import { supabase } from '../../lib/supabase';
import type { PlayerCategory, RosterSlot } from '../../types/database';
import { SuspensionOverlay, useActiveSuspension } from '../../components/SuspensionOverlay';

const CATEGORIES: PlayerCategory[] = ['12F', '12M', '14F', '14M', '16F', '16M', '18F', '18M'];

const SLOT_LABELS: Record<RosterSlot, string> = {
  partido_1: 'Partido 1',
  partido_2: 'Partido 2',
  dobles: 'Dobles',
};

function setWinner(home: number, away: number): 'home' | 'away' | null {
  if (home === away) return null;
  const hi = Math.max(home, away), lo = Math.min(home, away);
  const side: 'home' | 'away' = home > away ? 'home' : 'away';
  if (hi >= 6 && hi - lo >= 2) return side;
  if (hi === 7 && lo === 6) return side;
  if (hi === 7 && lo === 5) return side;
  return null;
}

function fmtHHMM(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

interface MatchRow {
  slot: RosterSlot;
  homePlayerIds: string[];
  awayPlayerIds: string[];
  set1_home: number | null;
  set1_away: number | null;
  set2_home: number | null;
  set2_away: number | null;
  set3_home: number | null;
  set3_away: number | null;
  wo: boolean;
  winner: 'home' | 'away' | null;
  match_status: string;
  started_at: string | null;
  finished_at: string | null;
}

interface ConfRow {
  id: string;
  category: string;
  match_date: string;
  match_time: string;
  status: string;
  homeName: string;
  awayName: string;
  homeLeagueId: string;
  awayLeagueId: string;
  court: string | null;
  series_winner: string | null;
  matches: MatchRow[];
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

export default function PublicResultsPage() {
  const [confrontations, setConfrontations] = useState<ConfRow[]>([]);
  const [playerMap, setPlayerMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [elapsedTimes, setElapsedTimes] = useState<Record<string, number>>({});
  const [activeSuspension, dismissSuspension] = useActiveSuspension();

  // Standings state
  const [standingsByCategory, setStandingsByCategory] = useState<Record<string, StandingRow[]>>({});
  const [champions, setChampions] = useState<ChampionRow[]>([]);
  const [standingsTab, setStandingsTab] = useState('');

  const loadStandingsAndChampions = useCallback(async () => {
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
    // Sort each category by wins desc
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

    // Default tab
    const cats = Object.keys(byCategory);
    if (cats.length > 0) setStandingsTab(prev => prev && cats.includes(prev) ? prev : cats[0]);
  }, []);

  const loadData = useCallback(async () => {
    const { data: confs } = await supabase
      .from('confrontations')
      .select('id, category, match_date, match_time, status, series_winner, home_league_id, away_league_id, home_league:leagues!confrontations_home_league_id_fkey(name), away_league:leagues!confrontations_away_league_id_fkey(name), court:courts(name)')
      .in('status', ['cerrada', 'en_curso', 'finalizada'])
      .order('match_date', { ascending: false });

    if (!confs || confs.length === 0) { setConfrontations([]); setLoading(false); return; }

    const confIds = confs.map((c: any) => c.id);

    const [{ data: rosters }, { data: results }] = await Promise.all([
      supabase.from('rosters').select('confrontation_id, league_id, slot_1, slot_2, slot_doubles_a, slot_doubles_b').in('confrontation_id', confIds).eq('is_submitted', true),
      supabase.from('match_results').select('confrontation_id, slot, home_player_ids, away_player_ids, set1_home, set1_away, set2_home, set2_away, set3_home, set3_away, wo, winner, match_status, started_at, finished_at').in('confrontation_id', confIds),
    ]);

    // Collect all player IDs and fetch names in one query
    const allPlayerIds = new Set<string>();
    for (const r of (rosters || [])) {
      if (r.slot_1) allPlayerIds.add(r.slot_1);
      if (r.slot_2) allPlayerIds.add(r.slot_2);
      if (r.slot_doubles_a) allPlayerIds.add(r.slot_doubles_a);
      if (r.slot_doubles_b) allPlayerIds.add(r.slot_doubles_b);
    }
    for (const r of (results || [])) {
      for (const id of (r.home_player_ids || [])) allPlayerIds.add(id);
      for (const id of (r.away_player_ids || [])) allPlayerIds.add(id);
    }

    const pMap = new Map<string, string>();
    if (allPlayerIds.size > 0) {
      const { data: players } = await supabase
        .from('players')
        .select('id, full_name')
        .in('id', Array.from(allPlayerIds));
      for (const p of (players || [])) pMap.set(p.id, p.full_name);
    }
    setPlayerMap(pMap);

    const rows: ConfRow[] = confs.map((conf: any) => {
      const confRosters = (rosters || []).filter((r: any) => r.confrontation_id === conf.id);
      const homeRoster = confRosters.find((r: any) => r.league_id === conf.home_league_id) || null;
      const awayRoster = confRosters.find((r: any) => r.league_id === conf.away_league_id) || null;
      const confResults = (results || []).filter((r: any) => r.confrontation_id === conf.id);

      const matches: MatchRow[] = (['partido_1', 'partido_2', 'dobles'] as RosterSlot[]).map(slot => {
        let homePlayerIds: string[] = [];
        let awayPlayerIds: string[] = [];
        if (homeRoster) {
          if (slot === 'partido_1' && homeRoster.slot_1) homePlayerIds = [homeRoster.slot_1];
          if (slot === 'partido_2' && homeRoster.slot_2) homePlayerIds = [homeRoster.slot_2];
          if (slot === 'dobles') homePlayerIds = [homeRoster.slot_doubles_a, homeRoster.slot_doubles_b].filter(Boolean);
        }
        if (awayRoster) {
          if (slot === 'partido_1' && awayRoster.slot_1) awayPlayerIds = [awayRoster.slot_1];
          if (slot === 'partido_2' && awayRoster.slot_2) awayPlayerIds = [awayRoster.slot_2];
          if (slot === 'dobles') awayPlayerIds = [awayRoster.slot_doubles_a, awayRoster.slot_doubles_b].filter(Boolean);
        }
        const r = confResults.find((x: any) => x.slot === slot);
        return {
          slot,
          homePlayerIds: r?.home_player_ids?.length ? r.home_player_ids : homePlayerIds,
          awayPlayerIds: r?.away_player_ids?.length ? r.away_player_ids : awayPlayerIds,
          set1_home: r?.set1_home ?? null,
          set1_away: r?.set1_away ?? null,
          set2_home: r?.set2_home ?? null,
          set2_away: r?.set2_away ?? null,
          set3_home: r?.set3_home ?? null,
          set3_away: r?.set3_away ?? null,
          wo: r?.wo || false,
          winner: r?.winner || null,
          match_status: r?.match_status || 'pending',
          started_at: r?.started_at || null,
          finished_at: r?.finished_at || null,
        };
      });

      return {
        id: conf.id,
        category: conf.category,
        match_date: conf.match_date,
        match_time: conf.match_time,
        status: conf.status,
        homeLeagueId: conf.home_league_id,
        awayLeagueId: conf.away_league_id,
        homeName: (conf.home_league as any)?.name || '—',
        awayName: (conf.away_league as any)?.name || '—',
        court: (conf.court as any)?.name || null,
        series_winner: conf.series_winner || null,
        matches,
      };
    });

    const visible = rows.filter(c =>
      c.matches.some(m => m.match_status === 'in_progress' || m.match_status === 'finished')
    );

    setConfrontations(visible);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); loadStandingsAndChampions(); }, [loadData, loadStandingsAndChampions]);

  useEffect(() => {
    const id = setInterval(() => { loadData(); loadStandingsAndChampions(); }, 30000);
    return () => clearInterval(id);
  }, [loadData, loadStandingsAndChampions]);

  useEffect(() => {
    function compute() {
      const next: Record<string, number> = {};
      confrontations.forEach(conf => {
        conf.matches.forEach(m => {
          if (m.started_at) {
            if (m.match_status === 'in_progress') {
              next[`${conf.id}-${m.slot}`] = Math.floor((Date.now() - new Date(m.started_at).getTime()) / 1000);
            } else if (m.match_status === 'finished' && m.finished_at) {
              next[`${conf.id}-${m.slot}`] = Math.floor((new Date(m.finished_at).getTime() - new Date(m.started_at).getTime()) / 1000);
            }
          }
        });
      });
      setElapsedTimes(next);
    }
    compute();
    const interval = setInterval(compute, 1000);
    return () => clearInterval(interval);
  }, [confrontations]);

  function pName(ids: string[]): string {
    return ids.map(id => playerMap.get(id) || '').filter(Boolean).join(' / ') || 'Jugador';
  }

  // Series winner label for a finished confrontation
  function seriesScore(conf: ConfRow): string | null {
    if (conf.status !== 'finalizada') return null;
    let homeWins = 0, awayWins = 0;
    for (const m of conf.matches) {
      if (m.winner === 'home') homeWins++;
      else if (m.winner === 'away') awayWins++;
    }
    if (homeWins === 0 && awayWins === 0) return null;
    return `${conf.homeName} ${homeWins} — ${awayWins} ${conf.awayName}`;
  }

  const filtered = confrontations.filter(c => {
    if (categoryFilter && c.category !== categoryFilter) return false;
    if (dateFilter && c.match_date !== dateFilter) return false;
    return true;
  });

  const dates = Array.from(new Set(confrontations.map(c => c.match_date))).sort().reverse();
  const standingsCats = Object.keys(standingsByCategory).sort();
  const activeChampion = champions.find(c => c.category === standingsTab);
  const activeStandings = standingsByCategory[standingsTab] || [];

  return (
    <div className="min-h-screen bg-slate-50">
      {activeSuspension && (
        <SuspensionOverlay suspension={activeSuspension} canClose={false} onClose={() => { dismissSuspension(); }} />
      )}

      <header className="bg-navy-900 px-6 py-5">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center flex-shrink-0">
            <TrophyIcon className="w-5 h-5 text-navy-700" />
          </div>
          <div>
            <span className="text-white font-bold text-lg tracking-wide">INTERLIGAS</span>
            <span className="text-navy-300 text-sm ml-2">2026 · Resultados en vivo</span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {/* Standings + Champion section */}
        {standingsCats.length > 0 && (
          <div className="card overflow-hidden">
            {/* Category tabs */}
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
              {/* Defending champion */}
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

              {/* Race to the title */}
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

            {/* Standings table */}
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

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <select className="input-field w-auto text-sm" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
            <option value="">Todas las categorías</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="input-field w-auto text-sm" value={dateFilter} onChange={e => setDateFilter(e.target.value)}>
            <option value="">Todas las fechas</option>
            {dates.map(d => (
              <option key={d} value={d}>
                {new Date(`${d}T12:00:00`).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-navy-300 border-t-navy-700 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="card p-12 text-center">
            <ClockIcon className="w-10 h-10 mx-auto text-navy-200 mb-3" />
            <p className="text-navy-600 font-medium">No hay partidos en curso en este momento.</p>
            <p className="text-navy-400 text-sm mt-1">Esta página se actualiza automáticamente cada 30 segundos.</p>
          </div>
        ) : filtered.map(conf => {
          const isLive = conf.status === 'en_curso';
          const isFinished = conf.status === 'finalizada';
          const score = seriesScore(conf);
          return (
            <div key={conf.id} className={`card overflow-hidden ${isLive ? 'ring-1 ring-green-300' : ''}`}>
              <div className={`px-5 py-3 flex items-center justify-between gap-3 border-b ${isLive ? 'bg-green-50 border-green-100' : 'bg-slate-50 border-slate-100'}`}>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-bold px-2 py-0.5 bg-navy-100 text-navy-700 rounded-md flex-shrink-0">{conf.category}</span>
                    <span className="font-semibold text-navy-800 text-sm truncate">
                      {conf.homeName} <span className="text-navy-400 font-normal">vs</span> {conf.awayName}
                    </span>
                  </div>
                  {score && isFinished && (
                    <p className="text-xs text-navy-500 font-medium pl-0.5">{score}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 text-xs text-navy-500">
                  {conf.court && (
                    <span className="hidden sm:flex items-center gap-1"><MapPinIcon className="w-3 h-3" /> {conf.court}</span>
                  )}
                  <span className="hidden sm:flex items-center gap-1">
                    <CalendarDaysIcon className="w-3 h-3" />
                    {new Date(`${conf.match_date}T${conf.match_time}`).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {isLive ? (
                    <span className="flex items-center gap-1 text-green-700 bg-green-100 px-2 py-0.5 rounded-full font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
                      En curso
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">
                      <CheckCircleIcon className="w-3 h-3" /> Finalizado
                    </span>
                  )}
                </div>
              </div>

              <div className="divide-y divide-slate-50">
                {conf.matches.filter(m => m.match_status === 'in_progress' || m.match_status === 'finished').map(m => {
                  const key = `${conf.id}-${m.slot}`;
                  const elapsed = elapsedTimes[key];
                  const mInProgress = m.match_status === 'in_progress';
                  const mFinished = m.match_status === 'finished';

                  const durationSecs = (mFinished && m.started_at && m.finished_at)
                    ? Math.floor((new Date(m.finished_at).getTime() - new Date(m.started_at).getTime()) / 1000)
                    : null;

                  const sets = [
                    { h: m.set1_home, a: m.set1_away },
                    { h: m.set2_home, a: m.set2_away },
                    { h: m.set3_home, a: m.set3_away },
                  ].filter(s => s.h != null || s.a != null);

                  return (
                    <div key={m.slot} className="px-5 py-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-navy-500 uppercase tracking-wide">{SLOT_LABELS[m.slot]}</span>
                          {conf.court && (
                            <span className="flex items-center gap-1 text-xs text-navy-400 bg-slate-100 px-1.5 py-0.5 rounded-md">
                              <MapPinIcon className="w-3 h-3" />{conf.court}
                            </span>
                          )}
                          {!conf.court && (
                            <span className="text-xs text-slate-300">Sin cancha</span>
                          )}
                        </div>
                        {mInProgress && (
                          <span className="flex items-center gap-1.5 text-xs text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
                            {elapsed != null ? <span className="font-mono">{fmtHHMM(elapsed)}</span> : 'En curso'}
                          </span>
                        )}
                        {mFinished && (
                          <span className="flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full font-medium">
                            <CheckCircleIcon className="w-3 h-3" />
                            {durationSecs != null ? <span className="font-mono">{fmtHHMM(durationSecs)}</span> : 'Finalizado'}
                          </span>
                        )}
                      </div>

                      {m.wo ? (
                        <div className="space-y-1">
                          {(['home', 'away'] as const).map(side => (
                            <div key={side} className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-sm font-semibold ${m.winner === side ? 'bg-navy-700 text-white' : 'bg-slate-100 text-navy-400'}`}>
                              <span className="truncate">{pName(side === 'home' ? m.homePlayerIds : m.awayPlayerIds)}</span>
                              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                {m.winner === side && <TrophyIcon className="w-4 h-4 text-amber-400" />}
                                <span className="text-xs opacity-70">W.O.</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <table className="w-full text-sm">
                          <tbody>
                            {(['home', 'away'] as const).map(side => (
                              <tr key={side}>
                                <td className={`py-1 pr-2 font-medium truncate max-w-0 ${m.winner === side ? 'text-navy-900' : 'text-navy-500'}`} style={{ width: '55%' }}>
                                  <div className="flex items-center gap-1.5 truncate">
                                    {m.winner === side && <TrophyIcon className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
                                    <span className="truncate">{pName(side === 'home' ? m.homePlayerIds : m.awayPlayerIds)}</span>
                                  </div>
                                </td>
                                {sets.map((s, i) => {
                                  const myVal = side === 'home' ? s.h : s.a;
                                  const oppVal = side === 'home' ? s.a : s.h;
                                  const won = myVal != null && oppVal != null && setWinner(myVal, oppVal) === side;
                                  return (
                                    <td key={i} className="w-10 text-center py-1">
                                      <span className={`inline-block w-8 font-bold rounded text-center ${won ? 'text-white bg-navy-700' : 'text-navy-500'}`}>
                                        {myVal ?? '—'}
                                      </span>
                                    </td>
                                  );
                                })}
                                {sets.length === 0 && <td className="text-xs text-navy-300 pl-2">Sin marcador</td>}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        <p className="text-center text-xs text-navy-300 pb-4">Actualización automática cada 30 segundos</p>
      </main>
    </div>
  );
}
