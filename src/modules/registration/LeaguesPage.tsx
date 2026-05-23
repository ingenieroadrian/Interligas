import { useEffect, useState, useCallback } from 'react';
import {
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  TrophyIcon,
} from '@heroicons/react/24/outline';
import { supabase } from '../../lib/supabase';
import type { League } from '../../types/database';
import { useAuthStore } from '../../store/authStore';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import SearchInput from '../../components/SearchInput';
import Pagination from '../../components/Pagination';
import { toast } from '../../components/Toast';

const PAGE_SIZE = 10;

interface LeagueForm {
  name: string;
  city: string;
  representative: string;
}

const EMPTY_FORM: LeagueForm = { name: '', city: '', representative: '' };

export default function LeaguesPage() {
  const [leagues, setLeagues] = useState<League[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<League | null>(null);
  const [editing, setEditing] = useState<League | null>(null);
  const [form, setForm] = useState<LeagueForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<LeagueForm>>({});
  const { hasPermission } = useAuthStore();

  const canCreate = hasPermission('leagues', 'create');
  const canEdit = hasPermission('leagues', 'edit');
  const canDelete = hasPermission('leagues', 'delete');

  const fetchLeagues = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('leagues').select('*', { count: 'exact' });
    if (search.trim()) {
      query = query.or(`name.ilike.%${search}%,city.ilike.%${search}%,representative.ilike.%${search}%`);
    }
    query = query.order('created_at', { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

    const { data, count, error } = await query;
    if (!error) {
      setLeagues(data || []);
      setTotal(count || 0);
    }
    setLoading(false);
  }, [page, search]);

  useEffect(() => { fetchLeagues(); }, [fetchLeagues]);

  useEffect(() => { setPage(1); }, [search]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setModalOpen(true);
  };

  const openEdit = (league: League) => {
    setEditing(league);
    setForm({ name: league.name, city: league.city, representative: league.representative });
    setErrors({});
    setModalOpen(true);
  };

  const validate = () => {
    const e: Partial<LeagueForm> = {};
    if (!form.name.trim()) e.name = 'El nombre es requerido';
    if (!form.city.trim()) e.city = 'La ciudad es requerida';
    if (!form.representative.trim()) e.representative = 'El representante es requerido';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    if (editing) {
      const { error } = await supabase.from('leagues').update({
        name: form.name.trim(),
        city: form.city.trim(),
        representative: form.representative.trim(),
      }).eq('id', editing.id);
      if (error) { toast('error', 'Error al actualizar la liga.'); }
      else { toast('success', 'Liga actualizada correctamente.'); setModalOpen(false); fetchLeagues(); }
    } else {
      const { error } = await supabase.from('leagues').insert({
        name: form.name.trim(),
        city: form.city.trim(),
        representative: form.representative.trim(),
      });
      if (error) { toast('error', 'Error al crear la liga.'); }
      else { toast('success', 'Liga creada correctamente.'); setModalOpen(false); fetchLeagues(); }
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    const { error } = await supabase.from('leagues').delete().eq('id', deleteTarget.id);
    if (error) { toast('error', 'Error al eliminar la liga.'); }
    else { toast('success', 'Liga eliminada.'); setDeleteTarget(null); fetchLeagues(); }
    setSaving(false);
  };

  const field = (key: keyof LeagueForm, label: string, placeholder: string) => (
    <div>
      <label className="label">{label}</label>
      <input
        className={`input-field ${errors[key] ? 'border-red-400 focus:ring-red-400' : ''}`}
        placeholder={placeholder}
        value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
      />
      {errors[key] && <p className="text-xs text-red-600 mt-1">{errors[key]}</p>}
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Ligas</h1>
          <p className="text-slate-500 text-sm mt-1">{total} liga{total !== 1 ? 's' : ''} registrada{total !== 1 ? 's' : ''}</p>
        </div>
        {canCreate && (
          <button onClick={openCreate} className="btn-primary">
            <PlusIcon className="w-4 h-4" />
            Nueva Liga
          </button>
        )}
      </div>

      <div className="card">
        {/* Toolbar */}
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Buscar liga, ciudad..." />
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="table-header">Liga</th>
                <th className="table-header">Ciudad</th>
                <th className="table-header">Representante</th>
                <th className="table-header">Registrada</th>
                {(canEdit || canDelete) && <th className="table-header text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {[1, 2, 3, 4, 5].map(j => (
                      <td key={j} className="table-cell">
                        <div className="h-4 bg-slate-100 rounded animate-pulse w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : leagues.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12">
                    <TrophyIcon className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                    <p className="text-sm text-slate-400">
                      {search ? 'No se encontraron resultados.' : 'No hay ligas registradas aún.'}
                    </p>
                  </td>
                </tr>
              ) : (
                leagues.map(league => (
                  <tr key={league.id} className="hover:bg-slate-50 transition-colors">
                    <td className="table-cell font-medium text-slate-900">{league.name}</td>
                    <td className="table-cell">{league.city}</td>
                    <td className="table-cell">{league.representative}</td>
                    <td className="table-cell text-slate-400">
                      {new Date(league.created_at).toLocaleDateString('es-CO')}
                    </td>
                    {(canEdit || canDelete) && (
                      <td className="table-cell text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canEdit && (
                            <button
                              onClick={() => openEdit(league)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-navy-700 hover:bg-navy-50 transition-colors"
                              title="Editar"
                            >
                              <PencilSquareIcon className="w-4 h-4" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => setDeleteTarget(league)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              title="Eliminar"
                            >
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

      {/* Create/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar Liga' : 'Nueva Liga'}
      >
        <div className="space-y-4">
          {field('name', 'Nombre de la Liga', 'Ej. Liga Bogotá Norte')}
          {field('city', 'Ciudad', 'Ej. Bogotá')}
          {field('representative', 'Representante', 'Nombre del representante')}
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setModalOpen(false)} className="btn-secondary" disabled={saving}>Cancelar</button>
          <button onClick={handleSave} className="btn-primary" disabled={saving}>
            {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear Liga'}
          </button>
        </div>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Eliminar Liga"
        message={`¿Confirmas que deseas eliminar la liga "${deleteTarget?.name}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        loading={saving}
      />
    </div>
  );
}
