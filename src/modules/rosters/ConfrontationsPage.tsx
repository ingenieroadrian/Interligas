import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  BoltIcon,
  CalendarDaysIcon,
  ClockIcon,
  CheckCircleIcon,
  ClipboardDocumentListIcon,
} from '@heroicons/react/24/outline';
import { supabase } from '../../lib/supabase';
import type { Confrontation, League, PlayerCategory, ConfrontationStatus } from '../../types/database';
import { useAuthStore } from '../../store/authStore';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import SearchInput from '../../components/SearchInput';
import Pagination from '../../components/Pagination';
import { toast } from '../../components/Toast';

const PAGE_SIZE = 10;

const CATEGORIES: PlayerCategory[] = ['12F', '12M', '14F', '14M', '16F', '16M', '18F', '18M'];

const STATUS_LABELS: Record<ConfrontationStatus, string> = {
  programada: 'Programada',
  alineacion: 'En Alineación',
  cerrada: 'Cerrada',
  en_curso: 'En Curso',
  finalizada: 'Finalizada',
};

const STATUS_COLORS: Record<ConfrontationStatus, string> = {
  programada: 'bg-slate-100 text-slate-600',
  alineacion: 'bg-blue-100 text-blue-700',
  cerrada: 'bg-amber-100 text-amber-700',
  en_curso: 'bg-green-100 text-green-700',
  finalizada: 'bg-navy-100 text-navy-700',
};

interface ConfrontationForm {
  category: PlayerCategory | '';
  home_league_id: string;
  away_league_id: string;
  match_date: string;
  match_time: string;
}

const EMPTY_FORM: ConfrontationForm = {
  category: '',
  home_league_id: '',
  away_league_id: '',
  match_date: '',
  match_time: '',
};

function computeDeadline(date: string, time: string): string | null {
  if (!date || !time) return null;
  const dt = new Date(`${date}T${time}`);
  dt.setMinutes(dt.getMinutes() - 30);
  return dt.toISOString();
}

function formatDeadline(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ConfrontationsPage() {
  const [confrontations, setConfrontations] = useState<Confrontation[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Confrontation | null>(null);
  const [editing, setEditing] = useState<Confrontation | null>(null);
  const [form, setForm] = useState<ConfrontationForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<ConfrontationForm>>({});
  const [saving, setSaving] = useState(false);

  const navigate = useNavigate();
  const { user, role, isSuperAdmin, hasPermission } = useAuthStore();
  const isCoach = role?.name === 'Entrenador';
  const canCreate = isSuperAdmin() || hasPermission('rosters', 'create');
  const canEdit = isSuperAdmin() || hasPermission('rosters', 'edit');
  const canDelete = isSuperAdmin() || hasPermission('rosters', 'delete');

  const loadLeagues = useCallback(async () => {
    const { data } = await supabase.from('leagues').select('id, name').order('name');
    setLeagues(data || []);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('confrontations')
      .select('*, home_league:leagues!confrontations_home_league_id_fkey(id,name,city,representative,email,created_at), away_league:leagues!confrontations_away_league_id_fkey(id,name,city,representative,email,created_at)', { count: 'exact' })
      .order('match_date', { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

    if (search) {
      query = query.ilike('category', `%${search}%`);
    }

    const { data, count, error } = await query;
    if (!error) {
      setConfrontations(data || []);
      setTotal(count || 0);
    }
    setLoading(false);
  }, [page, search]);

  useEffect(() => { loadLeagues(); }, [loadLeagues]);
  useEffect(() => { loadData(); }, [loadData]);

  function validate(): boolean {
    const e: Partial<ConfrontationForm> = {};
    if (!form.category) e.category = 'Selecciona una categoría';
    if (!form.home_league_id) e.home_league_id = 'Selecciona la liga local';
    if (!form.away_league_id) e.away_league_id = 'Selecciona la liga visitante';
    if (form.home_league_id && form.away_league_id && form.home_league_id === form.away_league_id)
      e.away_league_id = 'La liga visitante debe ser diferente a la local';
    if (!form.match_date) e.match_date = 'Ingresa la fecha del partido';
    if (!form.match_time) e.match_time = 'Ingresa la hora del partido';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setModalOpen(true);
  }

  function openEdit(c: Confrontation) {
    setEditing(c);
    setForm({
      category: c.category,
      home_league_id: c.home_league_id,
      away_league_id: c.away_league_id,
      match_date: c.match_date,
      match_time: c.match_time,
    });
    setErrors({});
    setModalOpen(true);
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    const deadline = computeDeadline(form.match_date, form.match_time)!;

    if (editing) {
      const { error } = await supabase
        .from('confrontations')
        .update({
          category: form.category as PlayerCategory,
          home_league_id: form.home_league_id,
          away_league_id: form.away_league_id,
          match_date: form.match_date,
          match_time: form.match_time,
          deadline,
        })
        .eq('id', editing.id);

      if (error) { toast(error.message, 'error'); }
      else { toast('Enfrentamiento actualizado.', 'success'); setModalOpen(false); loadData(); }
    } else {
      const { error } = await supabase
        .from('confrontations')
        .insert({
          category: form.category as PlayerCategory,
          home_league_id: form.home_league_id,
          away_league_id: form.away_league_id,
          match_date: form.match_date,
          match_time: form.match_time,
          deadline,
          status: 'programada' as ConfrontationStatus,
          created_by: user?.id || null,
        });

      if (error) { toast(error.message, 'error'); }
      else { toast('Enfrentamiento creado.', 'success'); setModalOpen(false); loadData(); }
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const { error } = await supabase.from('confrontations').delete().eq('id', deleteTarget.id);
    if (error) toast(error.message, 'error');
    else { toast('Enfrentamiento eliminado.', 'success'); loadData(); }
    setDeleteTarget(null);
  }

  async function handleActivate(c: Confrontation) {
    if (c.status !== 'programada') return;
    const { error } = await supabase
      .from('confrontations')
      .update({ status: 'alineacion' })
      .eq('id', c.id);
    if (error) toast(error.message, 'error');
    else { toast('Enfrentamiento activado para alineación.', 'success'); loadData(); }
  }

  const deadline = computeDeadline(form.match_date, form.match_time);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-navy-900">Enfrentamientos</h1>
          <p className="text-sm text-navy-500 mt-0.5">Gestión de enfrentamientos por categoría</p>
        </div>
        {canCreate && (
          <button onClick={openCreate} className="btn-primary flex items-center gap-2 self-start sm:self-auto">
            <PlusIcon className="w-4 h-4" />
            Nuevo Enfrentamiento
          </button>
        )}
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <SearchInput value={search} onChange={v => { setSearch(v); setPage(1); }} placeholder="Buscar por categoría..." />
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="table-header">Categoría</th>
                <th className="table-header">Liga Local</th>
                <th className="table-header">Liga Visitante</th>
                <th className="table-header">Fecha</th>
                <th className="table-header">Plazo</th>
                <th className="table-header">Estado</th>
                <th className="table-header text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan={7} className="table-cell text-center text-navy-400 py-10">Cargando...</td></tr>
              ) : confrontations.length === 0 ? (
                <tr><td colSpan={7} className="table-cell text-center text-navy-400 py-10">Sin enfrentamientos registrados</td></tr>
              ) : confrontations.map(c => (
                <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                  <td className="table-cell">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-navy-100 text-navy-700 text-xs font-semibold">
                      {c.category}
                    </span>
                  </td>
                  <td className="table-cell font-medium text-navy-800">{c.home_league?.name}</td>
                  <td className="table-cell text-navy-600">{c.away_league?.name}</td>
                  <td className="table-cell text-navy-600">
                    <div className="flex items-center gap-1.5">
                      <CalendarDaysIcon className="w-3.5 h-3.5 text-navy-400" />
                      {new Date(`${c.match_date}T${c.match_time}`).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </td>
                  <td className="table-cell text-navy-500 text-xs">
                    <div className="flex items-center gap-1.5">
                      <ClockIcon className="w-3.5 h-3.5 text-navy-400" />
                      {formatDeadline(c.deadline)}
                    </div>
                  </td>
                  <td className="table-cell">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[c.status]}`}>
                      {STATUS_LABELS[c.status]}
                    </span>
                  </td>
                  <td className="table-cell text-right">
                    <div className="flex items-center justify-end gap-1">
                      {/* Coach: open alignment view when alineacion */}
                      {isCoach && c.status === 'alineacion' && (
                        <button
                          onClick={() => navigate(`/nominas/${c.id}`)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                          title="Alinear nómina"
                        >
                          <ClipboardDocumentListIcon className="w-3.5 h-3.5" />
                          Alinear
                        </button>
                      )}
                      {/* Admin: activate button */}
                      {!isCoach && c.status === 'programada' && canEdit && (
                        <button
                          onClick={() => handleActivate(c)}
                          className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          title="Activar para alineación"
                        >
                          <BoltIcon className="w-4 h-4" />
                        </button>
                      )}
                      {!isCoach && canEdit && c.status === 'programada' && (
                        <button
                          onClick={() => openEdit(c)}
                          className="p-1.5 text-navy-400 hover:bg-navy-50 hover:text-navy-700 rounded-lg transition-colors"
                        >
                          <PencilSquareIcon className="w-4 h-4" />
                        </button>
                      )}
                      {!isCoach && canDelete && c.status === 'programada' && (
                        <button
                          onClick={() => setDeleteTarget(c)}
                          className="p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      )}
                      {!isCoach && c.status !== 'programada' && (
                        <button
                          onClick={() => navigate(`/nominas/${c.id}`)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-navy-700 bg-navy-50 hover:bg-navy-100 rounded-lg transition-colors"
                          title="Ver / editar nóminas"
                        >
                          <ClipboardDocumentListIcon className="w-3.5 h-3.5" />
                          Nóminas
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {total > PAGE_SIZE && (
          <div className="px-6 py-4 border-t border-slate-100">
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar Enfrentamiento' : 'Nuevo Enfrentamiento'}
        size="lg"
      >
        <div className="space-y-4">
          {/* Category */}
          <div>
            <label className="label">Categoría *</label>
            <select
              className={`input-field ${errors.category ? 'border-red-400' : ''}`}
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value as PlayerCategory }))}
            >
              <option value="">Seleccionar categoría...</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {errors.category && <p className="text-xs text-red-600 mt-1">{errors.category}</p>}
          </div>

          {/* Home league */}
          <div>
            <label className="label">Liga Local *</label>
            <select
              className={`input-field ${errors.home_league_id ? 'border-red-400' : ''}`}
              value={form.home_league_id}
              onChange={e => setForm(f => ({ ...f, home_league_id: e.target.value }))}
            >
              <option value="">Seleccionar liga local...</option>
              {leagues.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            {errors.home_league_id && <p className="text-xs text-red-600 mt-1">{errors.home_league_id}</p>}
          </div>

          {/* Away league */}
          <div>
            <label className="label">Liga Visitante *</label>
            <select
              className={`input-field ${errors.away_league_id ? 'border-red-400' : ''}`}
              value={form.away_league_id}
              onChange={e => setForm(f => ({ ...f, away_league_id: e.target.value }))}
            >
              <option value="">Seleccionar liga visitante...</option>
              {leagues.filter(l => l.id !== form.home_league_id).map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            {errors.away_league_id && <p className="text-xs text-red-600 mt-1">{errors.away_league_id}</p>}
          </div>

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Fecha del partido *</label>
              <input
                type="date"
                className={`input-field ${errors.match_date ? 'border-red-400' : ''}`}
                value={form.match_date}
                onChange={e => setForm(f => ({ ...f, match_date: e.target.value }))}
              />
              {errors.match_date && <p className="text-xs text-red-600 mt-1">{errors.match_date}</p>}
            </div>
            <div>
              <label className="label">Hora del partido *</label>
              <input
                type="time"
                className={`input-field ${errors.match_time ? 'border-red-400' : ''}`}
                value={form.match_time}
                onChange={e => setForm(f => ({ ...f, match_time: e.target.value }))}
              />
              {errors.match_time && <p className="text-xs text-red-600 mt-1">{errors.match_time}</p>}
            </div>
          </div>

          {/* Deadline preview */}
          {deadline && (
            <div className="bg-navy-50 border border-navy-100 rounded-xl px-4 py-3 flex items-center gap-2">
              <ClockIcon className="w-4 h-4 text-navy-500 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-navy-600">Plazo de alineación</p>
                <p className="text-sm text-navy-800 font-semibold">{formatDeadline(deadline)}</p>
                <p className="text-xs text-navy-400">30 minutos antes del partido</p>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button onClick={() => setModalOpen(false)} className="btn-secondary flex-1">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
              {saving ? 'Guardando...' : editing ? 'Guardar Cambios' : 'Crear Enfrentamiento'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Eliminar Enfrentamiento"
        message={`¿Eliminar el enfrentamiento ${deleteTarget?.home_league?.name} vs ${deleteTarget?.away_league?.name} (${deleteTarget?.category})?`}
        confirmLabel="Eliminar"
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
