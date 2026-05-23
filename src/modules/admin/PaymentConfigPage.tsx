import { useEffect, useRef, useState } from 'react';
import { ArrowUpTrayIcon, QrCodeIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { toast } from '../../components/Toast';
import type { PaymentConfig } from '../../types/database';

export default function PaymentConfigPage() {
  const { user } = useAuthStore();
  const [config, setConfig] = useState<PaymentConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.from('payment_config').select('*').maybeSingle().then(({ data }) => {
      if (data) {
        setConfig(data as PaymentConfig);
        setPreviewUrl((data as PaymentConfig).qr_image_url);
      }
      setLoading(false);
    });
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      toast('error', 'Solo se aceptan archivos PNG o JPG.');
      return;
    }

    setUploading(true);

    const fileName = `qr-${Date.now()}.${file.type === 'image/png' ? 'png' : 'jpg'}`;

    const { error: uploadError } = await supabase.storage
      .from('payment-qr')
      .upload(fileName, file, { upsert: true });

    if (uploadError) {
      toast('error', 'Error al subir la imagen.');
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from('payment-qr').getPublicUrl(fileName);
    const publicUrl = urlData.publicUrl;

    if (config) {
      const { error } = await supabase.from('payment_config')
        .update({ qr_image_url: publicUrl, updated_at: new Date().toISOString(), updated_by: user?.id || null })
        .eq('id', config.id);
      if (error) { toast('error', 'Error al guardar la configuración.'); setUploading(false); return; }
    } else {
      const { error } = await supabase.from('payment_config')
        .insert({ qr_image_url: publicUrl, updated_at: new Date().toISOString(), updated_by: user?.id || null });
      if (error) { toast('error', 'Error al guardar la configuración.'); setUploading(false); return; }
    }

    setPreviewUrl(publicUrl);
    toast('success', 'Código QR actualizado correctamente.');
    setUploading(false);

    // Reload config
    supabase.from('payment_config').select('*').maybeSingle().then(({ data }) => {
      if (data) setConfig(data as PaymentConfig);
    });
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Configuración de Pagos</h1>
        <p className="text-slate-500 text-sm mt-1">Gestiona el código QR de consignación que verán los entrenadores inactivos.</p>
      </div>

      <div className="card">
        <div className="px-6 py-5 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">Código QR de consignación</h2>
          <p className="text-xs text-slate-400 mt-1">Este QR se muestra en la pantalla de pre-landing para entrenadores con cuenta inactiva.</p>
        </div>

        <div className="px-6 py-6 flex flex-col sm:flex-row items-center gap-8">
          {/* QR Preview */}
          <div className="flex-shrink-0">
            {loading ? (
              <div className="w-48 h-48 bg-slate-100 rounded-2xl animate-pulse" />
            ) : previewUrl ? (
              <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
                <img src={previewUrl} alt="QR actual" className="w-44 h-44 object-contain rounded-lg" />
              </div>
            ) : (
              <div className="w-48 h-48 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-2">
                <QrCodeIcon className="w-12 h-12 text-slate-300" />
                <p className="text-xs text-slate-400">Sin QR configurado</p>
              </div>
            )}
          </div>

          {/* Upload section */}
          <div className="flex flex-col gap-4 flex-1 w-full">
            {previewUrl && (
              <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                <CheckCircleIcon className="w-4 h-4 flex-shrink-0" />
                QR configurado correctamente
              </div>
            )}

            <div>
              <p className="text-sm text-slate-600 mb-3">
                Sube una nueva imagen para reemplazar el QR actual. Formatos aceptados: <span className="font-medium">PNG, JPG</span>.
              </p>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={handleFileChange}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="btn-primary"
              >
                <ArrowUpTrayIcon className="w-4 h-4" />
                {uploading ? 'Subiendo imagen...' : previewUrl ? 'Reemplazar QR' : 'Subir QR'}
              </button>
            </div>

            {config?.updated_at && (
              <p className="text-xs text-slate-400">
                Última actualización:{' '}
                {new Date(config.updated_at).toLocaleDateString('es-CO', {
                  year: 'numeric', month: 'long', day: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
