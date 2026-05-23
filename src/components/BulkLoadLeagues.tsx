import { useState, useCallback } from 'react';
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  ArrowUpTrayIcon,
} from '@heroicons/react/24/outline';
import { supabase } from '../lib/supabase';
import Modal from './Modal';

interface BulkLoadLeaguesProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface ParsedLine {
  index: number;
  raw: string;
  valid: boolean;
  error?: string;
  name?: string;
  city?: string;
  representative?: string;
}

type UIState = 'editing' | 'validated' | 'saving' | 'done';

export default function BulkLoadLeagues({ open, onClose, onSuccess }: BulkLoadLeaguesProps) {
  const [text, setText] = useState('');
  const [lines, setLines] = useState<ParsedLine[]>([]);
  const [uiState, setUiState] = useState<UIState>('editing');
  const [summary, setSummary] = useState({ loaded: 0, failed: 0 });

  const handleClose = () => {
    setText('');
    setLines([]);
    setUiState('editing');
    setSummary({ loaded: 0, failed: 0 });
    onClose();
  };

  const rawLines = text.split('\n').filter(l => l.trim() !== '');
  const lineCount = rawLines.length;

  const validate = useCallback(() => {
    const parsed: ParsedLine[] = rawLines.map((raw, i) => {
      const parts = raw.split(';').map(p => p.trim());
      if (parts.length !== 3) {
        return {
          index: i + 1, raw,
          valid: false,
          error: `Se esperan 3 campos, se encontraron ${parts.length}`,
        };
      }
      const [name, city, representative] = parts;
      if (!name) return { index: i + 1, raw, valid: false, error: 'El nombre de la liga no puede estar vacío' };
      if (!city) return { index: i + 1, raw, valid: false, error: 'La ciudad no puede estar vacía' };
      if (!representative) return { index: i + 1, raw, valid: false, error: 'El representante no puede estar vacío' };
      return { index: i + 1, raw, valid: true, name, city, representative };
    });
    setLines(parsed);
    setUiState('validated');
  }, [rawLines]);

  const validLines = lines.filter(l => l.valid);
  const invalidLines = lines.filter(l => !l.valid);
  const canConfirm = uiState === 'validated' && validLines.length > 0;

  const handleConfirm = async () => {
    setUiState('saving');
    const payload = validLines.map(l => ({
      name: l.name!,
      city: l.city!,
      representative: l.representative!,
    }));
    const { error } = await supabase.from('leagues').insert(payload);
    if (error) {
      setUiState('validated');
      return;
    }
    setSummary({ loaded: validLines.length, failed: invalidLines.length });
    setUiState('done');
    onSuccess();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Carga Masiva de Ligas" size="xl">
      {uiState === 'done' ? (
        <div className="flex flex-col items-center py-8 gap-4">
          <CheckCircleIcon className="w-14 h-14 text-emerald-500" />
          <p className="text-lg font-semibold text-slate-800">
            {summary.loaded} liga{summary.loaded !== 1 ? 's' : ''} cargada{summary.loaded !== 1 ? 's' : ''} correctamente
          </p>
          {summary.failed > 0 && (
            <p className="text-sm text-slate-500">
              {summary.failed} línea{summary.failed !== 1 ? 's' : ''} con error — no {summary.failed !== 1 ? 'fueron' : 'fue'} importada{summary.failed !== 1 ? 's' : ''}.
            </p>
          )}
          <button onClick={handleClose} className="btn-primary mt-2">Cerrar</button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Format hint */}
          <div className="bg-navy-50 border border-navy-100 rounded-xl px-4 py-3 text-sm text-navy-800">
            <p className="font-semibold mb-1">Formato esperado — una liga por línea:</p>
            <p className="font-mono text-navy-700">Nombre Liga; Ciudad; Representante</p>
            <p className="text-navy-600 mt-1 text-xs">Ejemplo: <span className="font-mono">Liga Bogotá Norte; Bogotá; Juan Pérez</span></p>
          </div>

          {/* Textarea */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label mb-0">Datos a cargar</label>
              {lineCount > 0 && (
                <span className="text-xs text-slate-500">
                  {lineCount} línea{lineCount !== 1 ? 's' : ''} detectada{lineCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <textarea
              className="input-field font-mono text-sm resize-none w-full"
              rows={12}
              placeholder={'Liga Bogotá Norte; Bogotá; Juan Pérez\nLiga Medellín Centro; Medellín; María Gómez\n...'}
              value={text}
              onChange={e => { setText(e.target.value); setUiState('editing'); setLines([]); }}
              disabled={uiState === 'saving'}
            />
          </div>

          {/* Validation preview */}
          {lines.length > 0 && (
            <div className="space-y-1 max-h-48 overflow-y-auto rounded-xl border border-slate-100 p-3 bg-slate-50">
              {lines.map(line => (
                <div
                  key={line.index}
                  className={`flex items-start gap-2 text-xs px-3 py-2 rounded-lg ${
                    line.valid
                      ? 'bg-emerald-50 border border-emerald-100 text-emerald-800'
                      : 'bg-red-50 border border-red-100 text-red-800'
                  }`}
                >
                  {line.valid
                    ? <CheckCircleIcon className="w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-500" />
                    : <ExclamationCircleIcon className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-500" />
                  }
                  <span>
                    <span className="font-semibold">Línea {line.index}:</span>{' '}
                    {line.valid
                      ? <span className="font-mono">{line.name} — {line.city} — {line.representative}</span>
                      : line.error
                    }
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Validation summary badge */}
          {uiState === 'validated' && lines.length > 0 && (
            <div className="flex items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 font-medium">
                <CheckCircleIcon className="w-3.5 h-3.5" />
                {validLines.length} válida{validLines.length !== 1 ? 's' : ''}
              </span>
              {invalidLines.length > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 border border-red-100 text-red-700 font-medium">
                  <ExclamationCircleIcon className="w-3.5 h-3.5" />
                  {invalidLines.length} con error
                </span>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <button onClick={handleClose} className="btn-secondary" disabled={uiState === 'saving'}>
              Cancelar
            </button>
            <div className="flex gap-3">
              <button
                onClick={validate}
                disabled={lineCount === 0 || uiState === 'saving'}
                className="btn-secondary"
              >
                Validar
              </button>
              <button
                onClick={handleConfirm}
                disabled={!canConfirm}
                className="btn-primary"
              >
                <ArrowUpTrayIcon className="w-4 h-4" />
                {uiState === 'saving' ? 'Cargando...' : 'Confirmar Carga'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
