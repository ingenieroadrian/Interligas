import { useEffect, useState } from 'react';
import { CloudIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { supabase } from '../lib/supabase';

interface ActiveSuspension {
  id: string;
  resume_time: string; // HH:MM:SS from postgres TIME type
}

interface Props {
  canClose?: boolean;
  onClose?: () => void;
  suspension: ActiveSuspension;
}

function parseResumeToday(resumeTime: string): Date {
  const [h, m] = resumeTime.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function fmtHHMM(t: string): string {
  const [h, m] = t.split(':');
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}

function fmtCountdown(secs: number): string {
  if (secs <= 0) return '00:00:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

export function SuspensionOverlay({ canClose, onClose, suspension }: Props) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    function calc() {
      const target = parseResumeToday(suspension.resume_time);
      setRemaining(Math.max(0, Math.floor((target.getTime() - Date.now()) / 1000)));
    }
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [suspension.resume_time]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0F172A] text-white select-none">
      {canClose && onClose && (
        <button
          onClick={onClose}
          className="absolute top-5 right-5 flex items-center gap-1.5 text-slate-400 hover:text-white text-sm font-medium transition-colors"
        >
          <XMarkIcon className="w-4 h-4" />
          Cerrar
        </button>
      )}

      <CloudIcon className="w-24 h-24 text-blue-400 mb-6 opacity-80" />

      <p className="text-4xl sm:text-5xl font-black tracking-widest uppercase mb-1">
        PARTIDO SUSPENDIDO
      </p>
      <p className="text-slate-400 text-lg mb-12">Suspensión por lluvia</p>

      <div className="text-center mb-4">
        <p className="text-8xl sm:text-9xl font-mono font-black tracking-tight tabular-nums">
          {fmtHHMM(suspension.resume_time)}
        </p>
        <p className="text-slate-400 text-sm mt-2 uppercase tracking-widest">Hora estimada de reinicio</p>
      </div>

      <div className="text-center mt-8">
        <p className="text-3xl sm:text-4xl font-mono font-bold text-blue-300 tabular-nums">
          {fmtCountdown(remaining)}
        </p>
        <p className="text-slate-500 text-xs mt-2 uppercase tracking-widest">Tiempo restante para el reinicio</p>
      </div>
    </div>
  );
}

// Hook — returns active suspension for today or null
export function useActiveSuspension() {
  const [suspension, setSuspension] = useState<ActiveSuspension | null | undefined>(undefined);

  useEffect(() => {
    async function load() {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data } = await supabase
        .from('match_suspensions')
        .select('id, resume_time')
        .gte('created_at', todayStart.toISOString())
        .is('cancelled_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      setSuspension(data ? (data as ActiveSuspension) : null);
    }
    load();

    // Re-check every 15 seconds
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  return suspension;
}

export async function cancelSuspension(id: string) {
  await supabase
    .from('match_suspensions')
    .update({ cancelled_at: new Date().toISOString() })
    .eq('id', id);
}
