import { useState } from 'react';
import { TrophyIcon, CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';

export default function SetupPage() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleSetup = async () => {
    setStatus('loading');
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const res = await fetch(`${supabaseUrl}/functions/v1/create-admin-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
        },
      });
      const data = await res.json();
      if (data.success) {
        setStatus('success');
        setMessage('Usuario Super Admin creado correctamente.');
      } else {
        setStatus('error');
        setMessage(data.error || 'Error desconocido.');
      }
    } catch (e) {
      setStatus('error');
      setMessage('No se pudo conectar con el servidor.');
    }
  };

  return (
    <div className="min-h-screen bg-navy-900 flex items-center justify-center p-4">
      <div className="relative w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="bg-navy-900 px-8 py-8 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-white/10 rounded-2xl mb-4">
              <TrophyIcon className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-white text-2xl font-bold tracking-tight">INTERLIGAS</h1>
            <p className="text-navy-300 text-sm mt-1">Configuración Inicial</p>
          </div>

          <div className="px-8 py-8">
            <h2 className="text-slate-900 text-lg font-semibold mb-2">Crear Super Admin</h2>
            <p className="text-slate-500 text-sm mb-6">
              Esto creará el usuario administrador inicial del sistema.
            </p>

            <div className="bg-slate-50 rounded-xl p-4 mb-6 space-y-1 text-sm">
              <p><span className="text-slate-500">Correo:</span> <span className="font-semibold text-slate-800">admin@interligas.com</span></p>
              <p><span className="text-slate-500">Contraseña:</span> <span className="font-semibold text-slate-800">Interligas2026!</span></p>
              <p><span className="text-slate-500">Rol:</span> <span className="font-semibold text-slate-800">Super Admin</span></p>
            </div>

            {status === 'success' && (
              <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm mb-4">
                <CheckCircleIcon className="w-5 h-5 flex-shrink-0" />
                {message}
              </div>
            )}
            {status === 'error' && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">
                <ExclamationCircleIcon className="w-5 h-5 flex-shrink-0" />
                {message}
              </div>
            )}

            {status === 'success' ? (
              <a
                href="/login"
                className="w-full block text-center py-2.5 bg-navy-700 text-white text-sm font-semibold rounded-lg hover:bg-navy-800 transition-colors"
              >
                Ir al Login
              </a>
            ) : (
              <button
                onClick={handleSetup}
                disabled={status === 'loading'}
                className="w-full py-2.5 bg-navy-700 text-white text-sm font-semibold rounded-lg hover:bg-navy-800 transition-colors disabled:opacity-50"
              >
                {status === 'loading' ? 'Creando usuario...' : 'Crear usuario administrador'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
