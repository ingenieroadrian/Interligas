import { useEffect, useState, useCallback } from 'react';
import {
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  UserGroupIcon,
  FunnelIcon,
  ArrowUpTrayIcon,
} from '@heroicons/react/24/outline';
import { supabase } from '../../lib/supabase';
import type { Player, League, PlayerCategory } from '../../types/database';
import { useAuthStore } from '../../store/authStore';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import SearchInput from '../../components/SearchInput';
import Pagination from '../../components/Pagination';
import { toast } from '../../components/Toast';
import BulkLoadPlayers from '../../components/BulkLoadPlayers';

const PAGE_SIZE = 10;
const CATEGORIES: PlayerCategory[] = ['12F', '12M', '14F', '14M', '16F', '16M', '18F', '18M'];

interface PlayerForm {
  full_name: string;
  birth_date: string;
  unique_code: string;
  league_id: string;
  category: PlayerCategory | '';
  league_active: boolean;
}

const EMPTY_FORM: PlayerForm = {
  full_name: '', birth_date: '', unique_code: '',
  league_id: '', category: '', league_active: true,
};

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterLeague, setFilterLeague] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Player | null>(null);
  const [statusTarget, setStatusTarget] = useState<Player | null>(null);
  const [editing, setEditing] = useState<Player | null>(null);
  const [form, setForm] = useState<PlayerForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof PlayerForm, string>>>({});
  const [bulkOpen, setBulkOpen] = useState(false);
  const { hasPermission } = useAuthStore();

  const canCreate = hasPermission('players', 'create');
  const canEdit = hasPermission('players', 'edit');
  const canDelete = hasPermission('players', 'delete');

  useEffect(() => {
    supabase.from('leagues').select('id, name').order('name').then(({ data }) => {
      if (data) setLeagues(data as League[]);
    });
  }, []);

  const fetchPlayers = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('players')
      .select('*, league:leagues(id,name,city,representative,created_at)', { count: 'exact' });

    if (search.trim()) {
      query = query.or(`full_name.ilike.%${search}%,unique_code.ilike.%${search}%`);
    }
    if (filterLeague) query = query.eq('league_id', filterLeague);
    if (filterCategory) query = query.eq('category', filterCategory);

    query = query.order('full_name').range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

    const { data, count, error } = await query;
    if (!error) {
      setPlayers((data || []) as Player[]);
      setTotal(count || 0);
    }
    setLoading(false);
  }, [page, search, filterLeague, filterCategory]);

  useEffect(() => { fetchPlayers(); }, [fetchPlayers]);
  useEffect(() => { setPage(1); }, [search, filterLeague, filterCategory]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setModalOpen(true);
  };

  const openEdit = (player: Player) => {
    setEditing(player);
    setForm({
      full_name: player.full_name,
      birth_date: player.birth_date,
      unique_code: player.unique_code,
      league_id: player.league_id || '',
      category: player.category,
      league_active: player.league_active,
    });
    setErrors({});
    setModalOpen(true);
  };

  const validate = () => {
    const e: Partial<Record<keyof PlayerForm, string>> = {};
    if (!form.full_name.trim()) e.full_name = 'El nombre completo es requerido';
    if (!form.birth_date) e.birth_date = 'La fecha de nacimiento es requerida';
    if (!form.unique_code.trim()) e.unique_code = 'El código único es requerido';
    if (!form.category) e.category = 'La categoría es requerida';
    if (!form.league_id) e.league_id = 'La liga es requerida';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    const payload = {
      full_name: form.full_name.trim(),
      birth_date: form.birth_date,
      unique_code: form.unique_code.trim(),
      league_id: form.league_id || null,
      category: form.category as PlayerCategory,
      league_active: form.league_active,
    };
    if (editing) {
      const { error } = await supabase.from('players').update(payload).eq('id', editing.id);
      if (error) toast('error', error.message.includes('unique') ? 'El código único ya está en uso.' : 'Error al actualizar el jugador.');
      else { toast('success', 'Jugador actualizado correctamente.'); setModalOpen(false); fetchPlayers(); }
    } else {
      const { error } = await supabase.from('players').insert(payload);
      if (error) toast('error', error.message.includes('unique') ? 'El código único ya está en uso.' : 'Error al crear el jugador.');
      else { toast('success', 'Jugador creado correctamente.'); setModalOpen(false); fetchPlayers(); }
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    const { error } = await supabase.from('players').delete().eq('id', deleteTarget.id);
    if (error) toast('error', 'Error al eliminar el jugador.');
    else { toast('success', 'Jugador eliminado.'); setDeleteTarget(null); fetchPlayers(); }
    setSaving(false);
  };

  const handleToggleStatus = async () => {
    if (!statusTarget) return;
    setSaving(true);
    const { error } = await supabase.from('players')
      .update({ league_active: !statusTarget.league_active })
      .eq('id', statusTarget.id);
    if (error) toast('error', 'Error al cambiar el estado.');
    else {
      toast('success', `Jugador ${!statusTarget.league_active ? 'activado' : 'desactivado'} en la liga.`);
      setStatusTarget(null);
      fetchPlayers();
    }
    setSaving(false);
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Jugadores</h1>
          <p className="text-slate-500 text-sm mt-1">{total} jugador{total !== 1 ? 'es' : ''} registrado{total !== 1 ? 's' : ''}</p>
        </div>
        {canCreate && (
          <div className="flex items-center gap-2">
            <button onClick={() => setBulkOpen(true)} className="btn-secondary">
              <ArrowUpTrayIcon className="w-4 h-4" />
              Carga Masiva
            </button>
            <button onClick={openCreate} className="btn-primary">
              <PlusIcon className="w-4 h-4" />
              Nuevo Jugador
            </button>
          </div>
        )}
      </div>

      <div className="card">
        {/* Toolbar */}
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
            <select
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
              className="input-field w-36 py-1.5"
            >
              <option value="">Todas las categorías</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="table-header">Jugador</th>
                <th className="table-header">Código</th>
                <th className="table-header">Fecha Nac.</th>
                <th className="table-header">Liga</th>
                <th className="table-header">Categoría</th>
                <th className="table-header">Estado</th>
                {(canEdit || canDelete) && <th className="table-header text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {[1, 2, 3, 4, 5, 6, 7].map(j => (
                      <td key={j} className="table-cell">
                        <div className="h-4 bg-slate-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : players.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12">
                    <UserGroupIcon className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                    <p className="text-sm text-slate-400">
                      {search || filterLeague || filterCategory ? 'No se encontraron resultados.' : 'No hay jugadores registrados aún.'}
                    </p>
                  </td>
                </tr>
              ) : (
                players.map(player => (
                  <tr key={player.id} className="hover:bg-slate-50 transition-colors">
                    <td className="table-cell font-medium text-slate-900">{player.full_name}</td>
                    <td className="table-cell font-mono text-xs bg-slate-50 rounded">{player.unique_code}</td>
                    <td className="table-cell">{new Date(player.birth_date + 'T12:00:00').toLocaleDateString('es-CO')}</td>
                    <td className="table-cell">{player.league?.name || <span className="text-slate-300">—</span>}</td>
                    <td className="table-cell">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-navy-50 text-navy-700 border border-navy-100">
                        {player.category}
                      </span>
                    </td>
                    <td className="table-cell">
                      {canEdit ? (
                        <button
                          onClick={() => setStatusTarget(player)}
                          className={`text-xs font-medium px-2.5 py-0.5 rounded-full border transition-colors ${
                            player.league_active
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                          }`}
                        >
                          {player.league_active ? 'Activo' : 'Inactivo'}
                        </button>
                      ) : (
                        <span className={player.league_active ? 'badge-active' : 'badge-inactive'}>
                          {player.league_active ? 'Activo' : 'Inactivo'}
                        </span>
                      )}
                    </td>
                    {(canEdit || canDelete) && (
                      <td className="table-cell text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canEdit && (
                            <button onClick={() => openEdit(player)} className="p-1.5 rounded-lg text-slate-400 hover:text-navy-700 hover:bg-navy-50 transition-colors" title="Editar">
                              <PencilSquareIcon className="w-4 h-4" />
                            </button>
                          )}
                          {canDelete && (
                            <button onClick={() => setDeleteTarget(player)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Eliminar">
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
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar Jugador' : 'Nuevo Jugador'} size="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="label">Nombre Completo</label>
            <input
              className={`input-field ${errors.full_name ? 'border-red-400' : ''}`}
              placeholder="Nombre y apellido del jugador"
              value={form.full_name}
              onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
            />
            {errors.full_name && <p className="text-xs text-red-600 mt-1">{errors.full_name}</p>}
          </div>

          <div>
            <label className="label">Código Único</label>
            <input
              className={`input-field font-mono ${errors.unique_code ? 'border-red-400' : ''}`}
              placeholder="Código externo existente"
              value={form.unique_code}
              onChange={e => setForm(f => ({ ...f, unique_code: e.target.value }))}
            />
            {errors.unique_code && <p className="text-xs text-red-600 mt-1">{errors.unique_code}</p>}
            <p className="text-xs text-slate-400 mt-1">Ingresa el código tal como aparece en el sistema externo.</p>
          </div>

          <div>
            <label className="label">Fecha de Nacimiento</label>
            <input
              type="date"
              className={`input-field ${errors.birth_date ? 'border-red-400' : ''}`}
              value={form.birth_date}
              onChange={e => setForm(f => ({ ...f, birth_date: e.target.value }))}
            />
            {errors.birth_date && <p className="text-xs text-red-600 mt-1">{errors.birth_date}</p>}
          </div>

          <div>
            <label className="label">Liga</label>
            <select
              className={`input-field ${errors.league_id ? 'border-red-400' : ''}`}
              value={form.league_id}
              onChange={e => setForm(f => ({ ...f, league_id: e.target.value }))}
            >
              <option value="">Seleccionar liga...</option>
              {leagues.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            {errors.league_id && <p className="text-xs text-red-600 mt-1">{errors.league_id}</p>}
          </div>

          <div>
            <label className="label">Categoría</label>
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

          <div className="sm:col-span-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <div className="relative">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={form.league_active}
                  onChange={e => setForm(f => ({ ...f, league_active: e.target.checked }))}
                />
                <div className={`w-10 h-6 rounded-full transition-colors ${form.league_active ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.league_active ? 'translate-x-4' : ''}`} />
              </div>
              <span className="text-sm font-medium text-slate-700">
                {form.league_active ? 'Activo en la liga' : 'Inactivo en la liga'}
              </span>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setModalOpen(false)} className="btn-secondary" disabled={saving}>Cancelar</button>
          <button onClick={handleSave} className="btn-primary" disabled={saving}>
            {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear Jugador'}
          </button>
        </div>
      </Modal>

      {/* Bulk Load */}
      <BulkLoadPlayers
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onSuccess={() => { fetchPlayers(); toast('success', 'Jugadores cargados correctamente.'); }}
        leagues={leagues}
      />

      {/* Status toggle confirm */}
      <ConfirmDialog
        open={!!statusTarget}
        onClose={() => setStatusTarget(null)}
        onConfirm={handleToggleStatus}
        title="Cambiar Estado de Membresía"
        message={`¿Confirmas que deseas ${statusTarget?.league_active ? 'desactivar' : 'activar'} a "${statusTarget?.full_name}" en la liga?`}
        confirmLabel={statusTarget?.league_active ? 'Desactivar' : 'Activar'}
        loading={saving}
      />

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Eliminar Jugador"
        message={`¿Confirmas que deseas eliminar a "${deleteTarget?.full_name}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        loading={saving}
      />
    </div>
  );
}
