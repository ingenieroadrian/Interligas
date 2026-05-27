import { useEffect, useState } from 'react';
import { TrophyIcon, UserGroupIcon, AcademicCapIcon, UsersIcon, CloudIcon, XMarkIcon, PhotoIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { toast } from '../../components/Toast';
import { SuspensionOverlay, useActiveSuspension } from '../../components/SuspensionOverlay';
import type { League, PlayerCategory } from '../../types/database';

interface Stats {
  leagues: number;
  players: number;
  coaches: number;
  users: number;
}

const CATEGORIES: PlayerCategory[] = ['12F', '12M', '14F', '14M', '16F', '16M', '18F', '18M'];

interface ChampionForm {
  league_id: string;
  category: string;
  year_won: string;
  logo_file: File | null;
  logo_preview: string | null;
  saving: boolean;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({ leagues: 0, players: 0, coaches: 0, users: 0 });
  const [categoryBreakdown, setCategoryBreakdown] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [suspendModal, setSuspendModal] = useState(false);
  const [resumeTime, setResumeTime] = useState('');
  const [suspendNote, setSuspendNote] = useState('');
  const [suspending, setSuspending] = useState(false);
  const [activeSuspension, dismissSuspension] = useActiveSuspension();

  // Champion config
  const [leagues, setLeagues] = useState<League[]>([]);
  const [championForm, setChampionForm] = useState<ChampionForm>({
    league_id: '', category: '', year_won: '', logo_file: null, logo_preview: null, saving: false,
  });

  const { user, isSuperAdmin } = useAuthStore();

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      const [leaguesRes, playersRes, coachesRes, usersRes] = await Promise.all([
        supabase.from('leagues').select('id', { count: 'exact', head: true }),
        supabase.from('players').select('id, category'),
        supabase.from('coaches').select('id', { count: 'exact', head: true }),
        supabase.from('system_users').select('id', { count: 'exact', head: true }),
      ]);

      const breakdown: Record<string, number> = {};
      if (playersRes.data) {
        for (const cat of CATEGORIES) {
          breakdown[cat] = playersRes.data.filter(p => p.category === cat).length;
        }
      }

      setStats({
        leagues: leaguesRes.count || 0,
        players: playersRes.data?.length || 0,
        coaches: coachesRes.count || 0,
        users: usersRes.count || 0,
      });
      setCategoryBreakdown(breakdown);
      setLoading(false);
    };
    fetchStats();
  }, []);

  useEffect(() => {
    if (!isSuperAdmin()) return;
    supabase.from('leagues').select('id, name').order('name').then(({ data }) => {
      setLeagues(data || []);
    });
  }, [isSuperAdmin]);

  async function handleSuspend() {
    if (!resumeTime) return;
    setSuspending(true);
    const { error } = await supabase.from('match_suspensions').insert({
      reason: 'Lluvia',
      resume_time: resumeTime,
      note: suspendNote.trim() || null,
      created_by: user?.id || null,
    });
    if (error) {
      toast('error', 'Error al registrar la suspensión.');
    } else {
      toast('success', `Partido suspendido. Reinicio programado a las ${resumeTime}`);
      setSuspendModal(false);
      setResumeTime('');
      setSuspendNote('');
    }
    setSuspending(false);
  }

  async function handleSaveChampion() {
    const { league_id, category, year_won, logo_file } = championForm;
    if (!league_id || !category || !year_won) {
      toast('error', 'Completa liga, categoría y año.');
      return;
    }
    setChampionForm(f => ({ ...f, saving: true }));

    let logo_url: string | null = null;
    if (logo_file) {
      const ext = logo_file.name.split('.').pop();
      const path = `${category}-${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from('champion-logos').upload(path, logo_file, { upsert: true });
      if (uploadErr) {
        toast('error', 'Error al subir el logo.');
        setChampionForm(f => ({ ...f, saving: false }));
        return;
      }
      const { data: urlData } = supabase.storage.from('champion-logos').getPublicUrl(path);
      logo_url = urlData.publicUrl;
    }

    const payload: Record<string, unknown> = {
      league_id,
      category,
      year_won: parseInt(year_won, 10),
      updated_at: new Date().toISOString(),
    };
    if (logo_url) payload.logo_url = logo_url;

    const { error } = await supabase.from('champion_config').upsert(payload, { onConflict: 'category' });
    if (error) {
      toast('error', 'Error al guardar campeón.');
    } else {
      toast('success', `Campeón defensor guardado para categoría ${category}.`);
      setChampionForm({ league_id: '', category: '', year_won: '', logo_file: null, logo_preview: null, saving: false });
    }
    setChampionForm(f => ({ ...f, saving: false }));
  }

  const statCards = [
    { label: 'Ligas Registradas', value: stats.leagues, icon: TrophyIcon, color: 'bg-blue-50 text-blue-600 border-blue-100' },
    { label: 'Jugadores Activos', value: stats.players, icon: UserGroupIcon, color: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
    { label: 'Entrenadores', value: stats.coaches, icon: AcademicCapIcon, color: 'bg-amber-50 text-amber-600 border-amber-100' },
    ...(isSuperAdmin() ? [{ label: 'Usuarios del Sistema', value: stats.users, icon: UsersIcon, color: 'bg-slate-50 text-slate-600 border-slate-200' }] : []),
  ];

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Panel Principal</h1>
        <p className="text-slate-500 text-sm mt-1">
          Bienvenido, <span className="font-medium text-slate-700">{user?.full_name}</span>. Aquí tienes el resumen del sistema.
        </p>
      </div>

      {/* Stats */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[1, 2, 3].map(i => (
            <div key={i} className="card p-6 animate-pulse">
              <div className="w-10 h-10 bg-slate-100 rounded-lg mb-4" />
              <div className="h-8 bg-slate-100 rounded w-16 mb-2" />
              <div className="h-4 bg-slate-100 rounded w-32" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {statCards.map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="card p-6 hover:shadow-md transition-shadow duration-200">
              <div className={`inline-flex p-2.5 rounded-xl border mb-4 ${color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <p className="text-3xl font-bold text-slate-900">{value}</p>
              <p className="text-sm text-slate-500 mt-1">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Super admin controls */}
      {isSuperAdmin() && (
        <div className="space-y-4 mb-6">
          {/* Rain suspension */}
          <div className="card p-5 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Control de Partido</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {activeSuspension
                  ? 'Suspensión activa — puedes levantarla cuando los partidos se reanuden'
                  : 'Registrar suspensión por condiciones climáticas'}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {activeSuspension && (
                <button
                  onClick={() => dismissSuspension()}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-xl transition-colors"
                >
                  <CheckCircleIcon className="w-4 h-4" />
                  Levantar suspensión
                </button>
              )}
              <button
                onClick={() => setSuspendModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-xl transition-colors"
              >
                <CloudIcon className="w-4 h-4" />
                Suspender por lluvia
              </button>
            </div>
          </div>

          {/* Champion config */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-4">Campeón Defensor</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-navy-600 mb-1.5">Liga campeona</label>
                <select
                  className="input-field w-full text-sm"
                  value={championForm.league_id}
                  onChange={e => setChampionForm(f => ({ ...f, league_id: e.target.value }))}
                >
                  <option value="">Seleccionar liga</option>
                  {leagues.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-navy-600 mb-1.5">Categoría</label>
                <select
                  className="input-field w-full text-sm"
                  value={championForm.category}
                  onChange={e => setChampionForm(f => ({ ...f, category: e.target.value }))}
                >
                  <option value="">Seleccionar</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-navy-600 mb-1.5">Año del título</label>
                <input
                  type="number"
                  min="2000"
                  max="2100"
                  placeholder="2025"
                  className="input-field w-full text-sm"
                  value={championForm.year_won}
                  onChange={e => setChampionForm(f => ({ ...f, year_won: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-navy-600 mb-1.5">Logo (PNG/JPG)</label>
                <label className="flex items-center gap-2 cursor-pointer w-full px-3 py-2 border border-slate-200 rounded-xl bg-white hover:border-navy-300 transition-colors text-sm text-slate-500">
                  {championForm.logo_preview ? (
                    <img src={championForm.logo_preview} className="w-6 h-6 object-contain rounded" alt="" />
                  ) : (
                    <PhotoIcon className="w-4 h-4 flex-shrink-0" />
                  )}
                  <span className="truncate text-xs">{championForm.logo_file?.name || 'Subir logo...'}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0] || null;
                      if (file) {
                        const preview = URL.createObjectURL(file);
                        setChampionForm(f => ({ ...f, logo_file: file, logo_preview: preview }));
                      }
                    }}
                  />
                </label>
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <button
                onClick={handleSaveChampion}
                disabled={championForm.saving}
                className="flex items-center gap-2 px-4 py-2 bg-navy-700 hover:bg-navy-800 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
              >
                <TrophyIcon className="w-4 h-4" />
                {championForm.saving ? 'Guardando...' : 'Guardar campeón'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category breakdown */}
      <div className="card">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">Jugadores por Categoría</h2>
        </div>
        <div className="p-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
          {CATEGORIES.map(cat => {
            const count = categoryBreakdown[cat] || 0;
            const max = Math.max(...Object.values(categoryBreakdown), 1);
            const pct = Math.round((count / max) * 100);
            return (
              <div key={cat} className="text-center">
                <div className="text-xs font-semibold text-slate-500 mb-2">{cat}</div>
                <div className="relative h-24 bg-slate-100 rounded-lg overflow-hidden flex items-end">
                  <div
                    className="w-full bg-navy-700 rounded-b-lg transition-all duration-700"
                    style={{ height: loading ? '0%' : `${pct}%` }}
                  />
                </div>
                <p className="text-lg font-bold text-slate-900 mt-2">{count}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Suspension full-screen overlay */}
      {activeSuspension && (
        <SuspensionOverlay
          suspension={activeSuspension}
          canClose={isSuperAdmin()}
          onClose={() => {dismissSuspension}
        />
      )}

      {/* Suspend modal */}
      {suspendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-navy-900">Suspender partido por lluvia</h3>
              <button onClick={() => setSuspendModal(false)} className="text-slate-400 hover:text-slate-600">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-semibold text-navy-600 mb-1.5">Hora de reinicio estimada</label>
              <input
                type="time"
                className="input-field w-full"
                value={resumeTime}
                onChange={e => setResumeTime(e.target.value)}
              />
            </div>
            <div className="mb-5">
              <label className="block text-xs font-semibold text-navy-600 mb-1.5">Nota para los jugadores <span className="font-normal text-slate-400">(opcional)</span></label>
              <textarea
                className="input-field w-full resize-none"
                rows={3}
                placeholder="Ej: Esperamos que escampe. Por favor permanezcan en la zona de descanso."
                value={suspendNote}
                onChange={e => setSuspendNote(e.target.value)}
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setSuspendModal(false)} className="btn-secondary flex-1">Cancelar</button>
              <button
                onClick={handleSuspend}
                disabled={!resumeTime || suspending}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
              >
                {suspending ? 'Registrando...' : 'Confirmar suspensión'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
