import { useState, useCallback } from 'react';
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  ArrowUpTrayIcon,
} from '@heroicons/react/24/outline';
import { supabase } from '../lib/supabase';
import type { League, PlayerCategory } from '../types/database';
import Modal from './Modal';

interface BulkLoadPlayersProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  leagues: League[];
}

interface ParsedLine {
  index: number;
  raw: string;
  valid: boolean;
  error?: string;
  full_name?: string;
  birth_date?: string;
  unique_code?: string;
}

type UIState = 'editing' | 'validating' | 'validated' | 'saving' | 'done';

const CATEGORIES: PlayerCategory[] = ['12F', '12M', '14F', '14M', '16F', '16M', '18F', '18M'];

function parseDDMMYYYY(val: string): string | null {
  const m = val.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const date = new Date(`${yyyy}-${mm}-${dd}T12:00:00`);
  if (isNaN(date.getTime())) return null;
  if (date.getMonth() + 1 !== Number(mm)) return null;
  return `${yyyy}-${mm}-${dd}`;
}

export default function BulkLoadPlayers({ open, onClose, onSuccess, leagues }: BulkLoadPlayersProps) {
  const [selectedLeague, setSelectedLeague] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<PlayerCategory | ''>('');
  const [text, setText] = useState('');
  const [lines, setLines] = useState<ParsedLine[]>([]);
  const [uiState, setUiState] = useState<UIState>('editing');
  const [summary, setSummary] = useState({ loaded: 0, failed: 0 });

  const handleClose = () => {
    setSelectedLeague('');
    setSelectedCategory('');
    setText('');
    setLines([]);
    setUiState('editing');
    setSummary({ loaded: 0, failed: 0 });
    onClose();
  };

  const rawLines = text.split('\n').filter(l => l.trim() !== '');
  const lineCount = rawLines.length;
  const prereqMet = !!selectedLeague && !!selectedCategory;

  const validate = useCallback(async () => {
    setUiState('validating');

    // Collect all unique codes from the textarea to check against DB
    const codesInText: string[] = rawLines.map(raw => {
      const parts = raw.split(';').map(p => p.trim());
      return parts[2] || '';
    }).filter(Boolean);

    let existingCodes: string[] = [];
    if (codesInText.length > 0) {
      const { data } = await supabase
        .from('players')
        .select('unique_code')
        .in('unique_code', codesInText);
      existingCodes = (data || []).map(r => r.unique_code);
    }

    const parsed: ParsedLine[] = rawLines.map((raw, i) => {
      const parts = raw.split(';').map(p => p.trim());
      if (parts.length !== 3) {
        return {
          index: i + 1, raw, valid: false,
          error: `Se esperan 3 campos, se encontraron ${parts.length}`,
        };
      }
      const [full_name, birth_date_raw, unique_code] = parts;
      if (!full_name) return { index: i + 1, raw, valid: false, error: 'El nombre completo no puede estar vacío' };
      if (!birth_date_raw) return { index: i + 1, raw, valid: false, error: 'La fecha de nacimiento no puede estar vacía' };
      if (!unique_code) return { index: i + 1, raw, valid: false, error: 'El código único no puede estar vacío' };

      const birth_date = parseDDMMYYYY(birth_date_raw);
      if (!birth_date) {
        return {
          index: i + 1, raw, valid: false,
          error: `Fecha inválida "${birth_date_raw}". Formato esperado: DD/MM/AAAA`,
        };
      }
      if (existingCodes.includes(unique_code)) {
        return {
          index: i + 1, raw, valid: false,
          error: `Código único ya registrado: "${unique_code}"`,
        };
      }
      return { index: i + 1, raw, valid: true, full_name, birth_date, unique_code };
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
      full_name: l.full_name!,
      birth_date: l.birth_date!,
      unique_code: l.unique_code!,
      league_id: selectedLeague,
      category: selectedCategory as PlayerCategory,
      league_active: true,
    }));
    const { error } = await supabase.from('players').insert(payload);
    if (error) {
      setUiState('validated');
      return;
    }
    setSummary({ loaded: validLines.length, failed: invalidLines.length });
    setUiState('done');
    onSuccess();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Carga Masiva de Jugadores" size="xl">
      {uiState === 'done' ? (
        <div className="flex flex-col items-center py-8 gap-4">
          <CheckCircleIcon className="w-14 h-14 text-emerald-500" />
          <p className="text-lg font-semibold text-slate-800">
            {summary.loaded} jugador{summary.loaded !== 1 ? 'es' : ''} cargado{summary.loaded !== 1 ? 's' : ''} correctamente
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
          {/* League + Category selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Liga <span className="text-red-500">*</span></label>
              <select
                className={`input-field ${!selectedLeague && uiState !== 'editing' ? 'border-red-400' : ''}`}
                value={selectedLeague}
                onChange={e => { setSelectedLeague(e.target.value); setLines([]); setUiState('editing'); }}
                disabled={uiState === 'saving'}
              >
                <option value="">Seleccionar liga...</option>
                {leagues.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Categoría <span className="text-red-500">*</span></label>
              <select
                className={`input-field ${!selectedCategory && uiState !== 'editing' ? 'border-red-400' : ''}`}
                value={selectedCategory}
                onChange={e => { setSelectedCategory(e.target.value as PlayerCategory); setLines([]); setUiState('editing'); }}
                disabled={uiState === 'saving'}
              >
                <option value="">Seleccionar categoría...</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Format hint */}
          <div className="bg-navy-50 border border-navy-100 rounded-xl px-4 py-3 text-sm text-navy-800">
            <p className="font-semibold mb-1">Formato esperado — un jugador por línea:</p>
            <p className="font-mono text-navy-700">Nombre Completo; Fecha de Nacimiento; Código Único</p>
            <p className="text-navy-600 mt-1 text-xs">
              Formato de fecha: <span className="font-semibold">DD/MM/AAAA</span> — Ejemplo:{' '}
              <span className="font-mono">Carlos Rodríguez; 15/03/2008; JUG-001</span>
            </p>
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
              className={`input-field font-mono text-sm resize-none w-full transition-opacity ${!prereqMet ? 'opacity-50 cursor-not-allowed' : ''}`}
              rows={12}
              placeholder={'Carlos Rodríguez; 15/03/2008; JUG-001\nMaría García; 22/07/2010; JUG-002\n...'}
              value={text}
              onChange={e => { setText(e.target.value); setUiState('editing'); setLines([]); }}
              disabled={!prereqMet || uiState === 'saving' || uiState === 'validating'}
            />
            {!prereqMet && (
              <p className="text-xs text-slate-400 mt-1">Selecciona una liga y categoría para habilitar la carga.</p>
            )}
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
                      ? <span className="font-mono">{line.full_name} — {line.birth_date} — {line.unique_code}</span>
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
                {validLines.length} válido{validLines.length !== 1 ? 's' : ''}
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
            <button onClick={handleClose} className="btn-secondary" disabled={uiState === 'saving' || uiState === 'validating'}>
              Cancelar
            </button>
            <div className="flex gap-3">
              <button
                onClick={validate}
                disabled={!prereqMet || lineCount === 0 || uiState === 'saving' || uiState === 'validating'}
                className="btn-secondary"
              >
                {uiState === 'validating' ? 'Validando...' : 'Validar'}
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
