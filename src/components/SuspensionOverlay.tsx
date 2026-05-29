import { useEffect, useState } from 'react';
import { CloudIcon, XMarkIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { supabase } from '../lib/supabase';
import { toast } from './Toast';

interface ActiveSuspension {
  id: string;
  resume_time: string; // HH:MM or HH:MM:SS from postgres
  note?: string | null;
}

interface Props {
  canClose?: boolean;
  suspension: ActiveSuspension;
  onClose: () => void;
}

function buildTarget(resumeTime: string): Date {
  const [hours, minutes] = resumeTime.split(':').map(Number);
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes, 0);
}

function calcRemaining(resumeTime: string): number {
  return Math.floor((buildTarget(resumeTime).getTime() - Date.now()) / 1000);
}

function fmtHHMM(resumeTime: string): string {
  const [h, m] = resumeTime.split(':');
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}

function fmtCountdown(secs: number): string {
  if (secs <= 0) return '00:00:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

export function SuspensionOverlay({ canClose, suspension, onClose }: Props) {
  const [remaining, setRemaining] = useState(() => calcRemaining(suspension.resume_time));
  const [closing, setClosing] = useState(false);
  const isResumeReached = remaining <= 0;

  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(calcRemaining(suspension.resume_time));
    }, 1000);
    return () => clearInterval(id);
  }, [suspension.resume_time]);

  async function handleClose() {
    setClosing(true);
    const { error } = await supabase
      .from('match_suspensions')
      .update({ cancelled_at: new Date().toISOString() })
      .eq('id', suspension.id);
    if (error) {
      toast('error', 'No se pudo levantar la suspensión. Intenta nuevamente.');
      setClosing(false);
      return;
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0F172A] text-white select-none">
      {canClose && (
        <button
          onClick={handleClose}
          disabled={closing}
          className="absolute top-5 right-5 flex items-center gap-1.5 text-slate-400 hover:text-white text-sm font-medium transition-colors disabled:opacity-50"
        >
          <XMarkIcon className="w-4 h-4" />
          {closing ? 'Levantando...' : 'Levantar suspensión'}
        </button>
      )}

      <CloudIcon className="w-24 h-24 text-blue-400 mb-6 opacity-80" />

      <p className="text-4xl sm:text-5xl font-black tracking-widest uppercase mb-1">
        PARTIDO SUSPENDIDO
      </p>
      <p className="text-slate-400 text-lg mb-2">Suspensión por lluvia</p>

      {suspension.note && (
        <p className="text-white text-base text-center max-w-md px-6 mb-10 leading-relaxed">
          "{suspension.note}"
        </p>
      )}
      {!suspension.note && <div className="mb-10" />}

      <div className="text-center mb-4">
        <p className="text-8xl sm:text-9xl font-mono font-black tracking-tight tabular-nums">
          {fmtHHMM(suspension.resume_time)}
        </p>
        <p className="text-slate-400 text-sm mt-2 uppercase tracking-widest">Hora estimada de reinicio</p>
      </div>

      <div className="text-center mt-8">
        {isResumeReached ? (
          <>
            <div className="flex items-center justify-center gap-2 text-green-400 mb-2">
              <CheckCircleIcon className="w-6 h-6" />
              <p className="text-xl font-bold uppercase tracking-widest">Hora de reinicio alcanzada</p>
            </div>
            <p className="text-slate-400 text-sm uppercase tracking-widest">En espera del reinicio oficial</p>
          </>
        ) : (
          <>
            <p className="text-3xl sm:text-4xl font-mono font-bold text-blue-300 tabular-nums">
              {fmtCountdown(remaining)}
            </p>
            <p className="text-slate-500 text-xs mt-2 uppercase tracking-widest">Tiempo restante para el reinicio</p>
          </>
        )}
      </div>
    </div>
  );
}

// Hook — returns [activeSuspension, liftFn]
// liftFn writes cancelled_at to DB and hides the overlay
export function useActiveSuspension(): [ActiveSuspension | null | undefined, () => Promise<void>] {
  const [suspension, setSuspension] = useState<ActiveSuspension | null | undefined>(undefined);

  useEffect(() => {
    async function load() {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from('match_suspensions')
        .select('id, resume_time, note')
        .gte('created_at', todayStart.toISOString())
        .is('cancelled_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setSuspension(data ? (data as ActiveSuspension) : null);
    }
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  const lift = async () => {
    const current = suspension;
    setSuspension(null);
    if (current) {
      await supabase
        .from('match_suspensions')
        .update({ cancelled_at: new Date().toISOString() })
        .eq('id', current.id);
    }
  };

  return [suspension, lift];
}
