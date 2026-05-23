import { useState, useEffect } from 'react';
import { TrophyIcon, QrCodeIcon, UserGroupIcon, ArrowRightOnRectangleIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import type { Player, PaymentConfig } from '../../types/database';

export default function InactiveLandingPage() {
  const { signOut, coachProfile } = useAuthStore();
  const [qrUrl, setQrUrl] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [qrModalPlayer, setQrModalPlayer] = useState<Player | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    supabase.from('payment_config').select('qr_image_url').maybeSingle().then(({ data }) => {
      if (data) setQrUrl((data as PaymentConfig).qr_image_url);
    });
  }, []);

  useEffect(() => {
    if (!coachProfile?.id) return;
    supabase
      .from('players')
      .select('id, full_name, category, league_active, league_id, birth_date, unique_code, coach_id, created_at, league:leagues(id,name,city,representative,created_at)')
      .eq('coach_id', coachProfile.id)
      .eq('league_active', false)
      .order('full_name')
      .then(({ data }) => { if (data) setPlayers(data as Player[]); });
  }, [coachProfile?.id]);

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
  };

  return (
    <div className="min-h-screen bg-navy-950 flex flex-col">
      {/* Top bar */}
      <header className="bg-navy-900 border-b border-navy-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center">
            <TrophyIcon className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="text-white font-bold text-sm tracking-wide">INTERLIGAS</span>
            <span className="text-navy-400 text-xs ml-2">2026</span>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="flex items-center gap-2 text-navy-300 hover:text-white text-sm transition-colors disabled:opacity-50"
        >
          <ArrowRightOnRectangleIcon className="w-4 h-4" />
          Cerrar sesión
        </button>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-start px-4 py-12 max-w-2xl mx-auto w-full">

        {/* Status notice */}
        <div className="w-full bg-navy-900 border border-navy-700 rounded-2xl p-8 text-center mb-8">
          <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <TrophyIcon className="w-8 h-8 text-amber-400" />
          </div>
          <h1 className="text-white text-2xl font-bold mb-2">Tu perfil aún no está activo</h1>
          <p className="text-navy-300 text-sm leading-relaxed">
            Para activar tu cuenta realiza el pago correspondiente y luego dirígete a la oficina del árbitro para completar el proceso.
          </p>
        </div>

        {/* QR Payment section */}
        <div className="w-full bg-navy-900 border border-navy-700 rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <QrCodeIcon className="w-5 h-5 text-navy-300" />
            <h2 className="text-white font-semibold">Pago por consignación</h2>
          </div>
          <div className="flex flex-col items-center gap-4">
            {qrUrl ? (
              <div className="bg-white p-3 rounded-xl shadow-lg">
                <img src={qrUrl} alt="Código QR de consignación" className="w-48 h-48 object-contain" />
              </div>
            ) : (
              <div className="w-48 h-48 bg-navy-800 border border-navy-700 rounded-xl flex items-center justify-center">
                <QrCodeIcon className="w-16 h-16 text-navy-600" />
              </div>
            )}
            <div className="text-center">
              <p className="text-white text-sm font-medium">Escanea este código para realizar tu consignación</p>
              <p className="text-navy-400 text-xs mt-2 leading-relaxed">
                Una vez realizado el pago, dirígete a la oficina del árbitro para que activen tu perfil.
              </p>
            </div>
          </div>
        </div>

        {/* Inactive players section */}
        {players.length > 0 && (
          <div className="w-full bg-navy-900 border border-navy-700 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-1">
              <UserGroupIcon className="w-5 h-5 text-navy-300" />
              <h2 className="text-white font-semibold">Jugadores a tu cargo con membresía inactiva</h2>
            </div>
            <p className="text-navy-400 text-xs mb-4 leading-relaxed">
              El estado de tus jugadores será actualizado por la oficina del árbitro una vez confirmado el pago.
            </p>
            <div className="space-y-3">
              {players.map(player => (
                <div key={player.id} className="flex items-center justify-between bg-navy-800 border border-navy-700 rounded-xl px-4 py-3">
                  <div>
                    <p className="text-white text-sm font-medium">{player.full_name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs px-1.5 py-0.5 rounded bg-navy-700 text-navy-300 border border-navy-600 font-semibold">{player.category}</span>
                      {player.league && <span className="text-xs text-navy-400">{player.league.name}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => setQrModalPlayer(player)}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-navy-700 text-white border border-navy-600 hover:bg-navy-600 transition-colors"
                  >
                    <QrCodeIcon className="w-3.5 h-3.5" />
                    Pagar membresía
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* QR Modal for individual player */}
      {qrModalPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-navy-950/80 backdrop-blur-sm" onClick={() => setQrModalPlayer(null)} />
          <div className="relative w-full max-w-sm bg-navy-900 border border-navy-700 rounded-2xl shadow-2xl p-6 flex flex-col items-center gap-5">
            <button
              onClick={() => setQrModalPlayer(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-navy-400 hover:text-white hover:bg-navy-800 transition-colors"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
            <div>
              <h3 className="text-white font-bold text-center">Pagar membresía</h3>
              <p className="text-navy-300 text-sm text-center mt-1">{qrModalPlayer.full_name}</p>
            </div>
            {qrUrl ? (
              <div className="bg-white p-3 rounded-xl shadow-lg">
                <img src={qrUrl} alt="Código QR" className="w-44 h-44 object-contain" />
              </div>
            ) : (
              <div className="w-44 h-44 bg-navy-800 border border-navy-700 rounded-xl flex items-center justify-center">
                <QrCodeIcon className="w-14 h-14 text-navy-600" />
              </div>
            )}
            <p className="text-navy-300 text-xs text-center leading-relaxed">
              Presenta este QR en la oficina del árbitro indicando el nombre del jugador{' '}
              <span className="text-white font-semibold">{qrModalPlayer.full_name}</span>{' '}
              para activar su membresía.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
