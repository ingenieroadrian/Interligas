import { useEffect, useState, useCallback } from 'react';
import { PlusIcon, PencilSquareIcon, TrashIcon, AcademicCapIcon, FunnelIcon } from '@heroicons/react/24/outline';
import { supabase } from '../../lib/supabase';
import type { Coach, League } from '../../types/database';
import { useAuthStore } from '../../store/authStore';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import SearchInput from '../../components/SearchInput';
import Pagination from '../../components/Pagination';
import { toast } from '../../components/Toast';

const PAGE_SIZE = 10;

interface CoachForm {
  full_name: string;
  unique_code: string;
  phone: string;
  league_id: string;
}

const EMPTY_FORM: CoachForm = { full_name: '', unique_code: '', phone: '', league_id: '' };

export default function CoachesPage() {
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterLeague, setFilterLeague] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Coach | null>(null);
  const [editing, setEditing] = useState<Coach | null>(null);
  const [form, setForm] = useState<CoachForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<CoachForm>>({});
  const { hasPermission } = useAuthStore();

  const canCreate = hasPermission('coaches', 'create');
  const canEdit = hasPermission('coaches', 'edit');
  const canDelete = hasPermission('coaches', 'delete');

  useEffect(() => {
    supabase.from('leagues').select('id, name').order('name').then(({ data }) => {
      if (data) setLeagues(data as League[]);
    });
  }, []);

  const fetchCoaches = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('coaches')
      .select('*, league:leagues(id,name,city,representative,created_at)', { count: 'exact' });

    if (search.trim()) {
      query = query.or(`full_name.ilike.%${search}%,unique_code.ilike.%${search}%,phone.ilike.%${search}%`);
    }
    if (filterLeague) query = query.eq('league_id', filterLeague);

    query = query.order('full_name').range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    const { data, count, error } = await query;
    if (!error) {
      setCoaches((data || []) as Coach[]);
      setTotal(count || 0);
    }
    setLoading(false);
  }, [page, search, filterLeague]);

  useEffect(() => { fetchCoaches(); }, [fetchCoaches]);
  useEffect(() => { setPage(1); }, [search, filterLeague]);

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setErrors({}); setModalOpen(true); };
  const openEdit = (coach: Coach) => {
    setEditing(coach);
    setForm({ full_name: coach.full_name, unique_code: coach.unique_code, phone: coach.phone, league_id: coach.league_id || '' });
    setErrors({});
    setModalOpen(true);
  };

  const validate = () => {
    const e: Partial<CoachForm> = {};
    if (!form.full_name.trim()) e.full_name = 'El nombre completo es requerido';
    if (!form.unique_code.trim()) e.unique_code = 'El código único es requerido';
    if (!form.league_id) e.league_id = 'La liga es requerida';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    const payload = {
      full_name: form.full_name.trim(),
      unique_code: form.unique_code.trim(),
      phone: form.phone.trim(),
      league_id: form.league_id || null,
    };
    if (editing) {
      const { error } = await supabase.from('coaches').update(payload).eq('id', editing.id);
      if (error) toast('error', error.message.includes('unique') ? 'El código único ya está en uso.' : 'Error al actualizar el entrenador.');
      else { toast('success', 'Entrenador actualizado correctamente.'); setModalOpen(false); fetchCoaches(); }
    } else {
      const { error } = await supabase.from('coaches').insert(payload);
      if (error) toast('error', error.message.includes('unique') ? 'El código único ya está en uso.' : 'Error al crear el entrenador.');
      else { toast('success', 'Entrenador creado correctamente.'); setModalOpen(false); fetchCoaches(); }
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    const { error } = await supabase.from('coaches').delete().eq('id', deleteTarget.id);
    if (error) toast('error', 'Error al eliminar el entrenador.');
    else { toast('success', 'Entrenador eliminado.'); setDeleteTarget(null); fetchCoaches(); }
    setSaving(false);
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Entrenadores</h1>
          <p className="text-slate-500 text-sm mt-1">{total} entrenador{total !== 1 ? 'es' : ''} registrado{total !== 1 ? 's' : ''}</p>
        </div>
        {canCreate && (
          <button onClick={openCreate} className="btn-primary">
            <PlusIcon className="w-4 h-4" />
            Nuevo Entrenador
          </button>
        )}
      </div>

      <div className="card">
        <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre o código..." />
          <div className="flex items-center gap-2">
            <FunnelIcon className="w-4 h-4 text-slate-400" />
            <select
              value={filterLeague}
              onChange={e => setFilterLeague(e.target.value)}
              className="input-field w-44 py-1.5"
            >
              <option value="">Todas las ligas</option>
              {leagues.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="table-header">Entrenador</th>
                <th className="table-header">Código</th>
                <th className="table-header">Teléfono</th>
                <th className="table-header">Liga</th>
                <th className="table-header">Registrado</th>
                {(canEdit || canDelete) && <th className="table-header text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {[1,2,3,4,5,6].map(j => (
                      <td key={j} className="table-cell"><div className="h-4 bg-slate-100 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : coaches.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12">
                    <AcademicCapIcon className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                    <p className="text-sm text-slate-400">
                      {search || filterLeague ? 'No se encontraron resultados.' : 'No hay entrenadores registrados aún.'}
                    </p>
                  </td>
                </tr>
              ) : (
                coaches.map(coach => (
                  <tr key={coach.id} className="hover:bg-slate-50 transition-colors">
                    <td className="table-cell font-medium text-slate-900">{coach.full_name}</td>
                    <td className="table-cell"><span className="font-mono text-xs">{coach.unique_code}</span></td>
                    <td className="table-cell">{coach.phone || <span className="text-slate-300">—</span>}</td>
                    <td className="table-cell">{coach.league?.name || <span className="text-slate-300">—</span>}</td>
                    <td className="table-cell text-slate-400">{new Date(coach.created_at).toLocaleDateString('es-CO')}</td>
                    {(canEdit || canDelete) && (
                      <td className="table-cell text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canEdit && (
                            <button onClick={() => openEdit(coach)} className="p-1.5 rounded-lg text-slate-400 hover:text-navy-700 hover:bg-navy-50 transition-colors" title="Editar">
                              <PencilSquareIcon className="w-4 h-4" />
                            </button>
                          )}
                          {canDelete && (
                            <button onClick={() => setDeleteTarget(coach)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Eliminar">
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar Entrenador' : 'Nuevo Entrenador'}>
        <div className="space-y-4">
          <div>
            <label className="label">Nombre Completo</label>
            <input className={`input-field ${errors.full_name ? 'border-red-400' : ''}`} placeholder="Nombre y apellido" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
            {errors.full_name && <p className="text-xs text-red-600 mt-1">{errors.full_name}</p>}
          </div>
          <div>
            <label className="label">Código Único</label>
            <input className={`input-field font-mono ${errors.unique_code ? 'border-red-400' : ''}`} placeholder="Código externo existente" value={form.unique_code} onChange={e => setForm(f => ({ ...f, unique_code: e.target.value }))} />
            {errors.unique_code && <p className="text-xs text-red-600 mt-1">{errors.unique_code}</p>}
            <p className="text-xs text-slate-400 mt-1">Ingresa el código tal como aparece en el sistema externo.</p>
          </div>
          <div>
            <label className="label">Teléfono <span className="text-slate-400 font-normal">(opcional)</span></label>
            <input className="input-field" placeholder="+57 300 000 0000" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
          </div>
          <div>
            <label className="label">Liga</label>
            <select className={`input-field ${errors.league_id ? 'border-red-400' : ''}`} value={form.league_id} onChange={e => setForm(f => ({ ...f, league_id: e.target.value }))}>
              <option value="">Seleccionar liga...</option>
              {leagues.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            {errors.league_id && <p className="text-xs text-red-600 mt-1">{errors.league_id}</p>}
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setModalOpen(false)} className="btn-secondary" disabled={saving}>Cancelar</button>
          <button onClick={handleSave} className="btn-primary" disabled={saving}>
            {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear Entrenador'}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Eliminar Entrenador"
        message={`¿Confirmas que deseas eliminar a "${deleteTarget?.full_name}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        loading={saving}
      />
    </div>
  );
}
