import { useEffect, useState } from 'react';
import { TrophyIcon, UserGroupIcon, AcademicCapIcon, UsersIcon } from '@heroicons/react/24/outline';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';

interface Stats {
  leagues: number;
  players: number;
  coaches: number;
  users: number;
}

const CATEGORIES = ['12F', '12M', '14F', '14M', '16F', '16M', '18F', '18M'];

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({ leagues: 0, players: 0, coaches: 0, users: 0 });
  const [categoryBreakdown, setCategoryBreakdown] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
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
    </div>
  );
}
