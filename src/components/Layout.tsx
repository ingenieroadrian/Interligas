import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  HomeIcon,
  TrophyIcon,
  UserGroupIcon,
  AcademicCapIcon,
  UsersIcon,
  ShieldCheckIcon,
  ArrowRightStartOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
  QrCodeIcon,
  ClipboardDocumentListIcon,
  ChartBarIcon,
  MapPinIcon,
} from '@heroicons/react/24/outline';
import { useAuthStore } from '../store/authStore';

const navItems = [
  { to: '/', icon: HomeIcon, label: 'Panel Principal', module: null },
  { to: '/ligas', icon: TrophyIcon, label: 'Ligas', module: 'leagues' },
  { to: '/jugadores', icon: UserGroupIcon, label: 'Jugadores', module: 'players' },
  { to: '/entrenadores', icon: AcademicCapIcon, label: 'Entrenadores', module: 'coaches' },
  { to: '/nominas', icon: ClipboardDocumentListIcon, label: 'Nóminas', module: 'rosters' },
  { to: '/resultados', icon: ChartBarIcon, label: 'Resultados', module: 'results' },
  { to: '/canchas', icon: MapPinIcon, label: 'Canchas', module: 'canchas', superAdminOnly: true },
  { to: '/usuarios', icon: UsersIcon, label: 'Usuarios del Sistema', module: 'users', superAdminOnly: true },
  { to: '/roles', icon: ShieldCheckIcon, label: 'Roles y Permisos', module: 'roles', superAdminOnly: true },
  { to: '/configuracion/pagos', icon: QrCodeIcon, label: 'Configuración de Pagos', module: 'pagos', superAdminOnly: true },
];

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, role, signOut, isSuperAdmin, hasPermission } = useAuthStore();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const visibleItems = navItems.filter(item => {
    if (item.superAdminOnly) return isSuperAdmin();
    if (!item.module) return true;
    return hasPermission(item.module as any, 'view');
  });

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-6 py-6 border-b border-navy-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
            <TrophyIcon className="w-5 h-5 text-navy-700" />
          </div>
          <div>
            <span className="text-white font-bold text-sm tracking-wide">INTERLIGAS</span>
            <span className="block text-navy-300 text-xs">2026</span>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {visibleItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-100 ${
                isActive
                  ? 'bg-white/10 text-white'
                  : 'text-navy-200 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <Icon className="w-5 h-5 flex-shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User footer */}
      <div className="px-4 py-4 border-t border-navy-800">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-navy-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {user?.full_name?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-white text-sm font-medium truncate">{user?.full_name}</p>
            <p className="text-navy-300 text-xs truncate">{role?.name}</p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2 w-full px-3 py-2 text-navy-200 hover:text-white hover:bg-white/5 rounded-lg text-sm font-medium transition-colors"
        >
          <ArrowRightStartOnRectangleIcon className="w-4 h-4" />
          Cerrar sesión
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-60 bg-navy-900 flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-60 bg-navy-900 flex flex-col z-50">
            <button
              onClick={() => setSidebarOpen(false)}
              className="absolute top-4 right-4 text-navy-300 hover:text-white p-1"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-navy-900 border-b border-navy-800">
          <button onClick={() => setSidebarOpen(true)} className="text-navy-200 hover:text-white">
            <Bars3Icon className="w-6 h-6" />
          </button>
          <span className="text-white font-bold text-sm">INTERLIGAS 2026</span>
          <div className="w-6" />
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
