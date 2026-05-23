import { useEffect, useState, useCallback } from 'react';
import { PlusIcon, PencilSquareIcon, TrashIcon, UsersIcon } from '@heroicons/react/24/outline';
import { supabase } from '../../lib/supabase';
import type { SystemUser, Role } from '../../types/database';
import { useAuthStore } from '../../store/authStore';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import SearchInput from '../../components/SearchInput';
import Pagination from '../../components/Pagination';
import { toast } from '../../components/Toast';

const PAGE_SIZE = 10;

interface UserForm {
  full_name: string;
  unique_code: string;
  email: string;
  role_id: string;
  password: string;
  active: boolean;
}

const EMPTY_FORM: UserForm = {
  full_name: '', unique_code: '', email: '', role_id: '', password: '', active: true,
};

export default function UsersPage() {
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SystemUser | null>(null);
  const [statusTarget, setStatusTarget] = useState<SystemUser | null>(null);
  const [editing, setEditing] = useState<SystemUser | null>(null);
  const [form, setForm] = useState<UserForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof UserForm, string>>>({});
  const { user: currentUser } = useAuthStore();

  useEffect(() => {
    supabase.from('roles').select('*').order('name').then(({ data }) => {
      if (data) setRoles(data as Role[]);
    });
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('system_users')
      .select('*, role:roles(*)', { count: 'exact' });

    if (search.trim()) {
      query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,unique_code.ilike.%${search}%`);
    }

    query = query.order('created_at', { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    const { data, count, error } = await query;
    if (!error) {
      setUsers((data || []) as SystemUser[]);
      setTotal(count || 0);
    }
    setLoading(false);
  }, [page, search]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useEffect(() => { setPage(1); }, [search]);

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setErrors({}); setModalOpen(true); };
  const openEdit = (u: SystemUser) => {
    setEditing(u);
    setForm({ full_name: u.full_name, unique_code: u.unique_code, email: u.email, role_id: u.role_id || '', password: '', active: u.active });
    setErrors({});
    setModalOpen(true);
  };

  const validate = () => {
    const e: Partial<Record<keyof UserForm, string>> = {};
    if (!form.full_name.trim()) e.full_name = 'El nombre completo es requerido';
    if (!form.unique_code.trim()) e.unique_code = 'El código único es requerido';
    if (!form.email.trim()) e.email = 'El correo electrónico es requerido';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Correo inválido';
    if (!form.role_id) e.role_id = 'El rol es requerido';
    if (!editing && !form.password) e.password = 'La contraseña es requerida';
    if (!editing && form.password && form.password.length < 8) e.password = 'La contraseña debe tener al menos 8 caracteres';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);

    if (editing) {
      const payload: Partial<SystemUser> = {
        full_name: form.full_name.trim(),
        unique_code: form.unique_code.trim(),
        email: form.email.trim(),
        role_id: form.role_id || null,
        active: form.active,
      };
      const { error } = await supabase.from('system_users').update(payload).eq('id', editing.id);
      if (error) toast('error', error.message.includes('unique') ? 'El código o correo ya están en uso.' : 'Error al actualizar el usuario.');
      else { toast('success', 'Usuario actualizado correctamente.'); setModalOpen(false); fetchUsers(); }
    } else {
      // Create auth user first
      const { data: authData, error: authError } = await supabase.auth.admin
        ? { data: null, error: { message: 'use service role' } }
        : { data: null, error: { message: 'use service role' } };

      // Fallback: create via signUp then insert system_users record
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: { emailRedirectTo: undefined },
      });

      if (signUpError) {
        toast('error', signUpError.message.includes('already') ? 'El correo ya está registrado.' : 'Error al crear el usuario.');
        setSaving(false);
        return;
      }

      const authId = signUpData.user?.id || null;
      const { error: insertError } = await supabase.from('system_users').insert({
        full_name: form.full_name.trim(),
        unique_code: form.unique_code.trim(),
        email: form.email.trim(),
        role_id: form.role_id || null,
        active: form.active,
        auth_id: authId,
      });

      if (insertError) toast('error', insertError.message.includes('unique') ? 'El código o correo ya están en uso.' : 'Error al registrar el usuario.');
      else { toast('success', 'Usuario creado. Verificará su correo para confirmar la cuenta.'); setModalOpen(false); fetchUsers(); }
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    const { error } = await supabase.from('system_users').delete().eq('id', deleteTarget.id);
    if (error) toast('error', 'Error al eliminar el usuario.');
    else { toast('success', 'Usuario eliminado.'); setDeleteTarget(null); fetchUsers(); }
    setSaving(false);
  };

  const handleToggleStatus = async () => {
    if (!statusTarget) return;
    setSaving(true);
    const { error } = await supabase.from('system_users')
      .update({ active: !statusTarget.active })
      .eq('id', statusTarget.id);
    if (error) toast('error', 'Error al cambiar el estado.');
    else {
      toast('success', `Usuario ${!statusTarget.active ? 'activado' : 'desactivado'}.`);
      setStatusTarget(null);
      fetchUsers();
    }
    setSaving(false);
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Usuarios del Sistema</h1>
          <p className="text-slate-500 text-sm mt-1">{total} usuario{total !== 1 ? 's' : ''} registrado{total !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <PlusIcon className="w-4 h-4" />
          Nuevo Usuario
        </button>
      </div>

      <div className="card">
        <div className="px-4 py-3 border-b border-slate-100">
          <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre, correo o código..." />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="table-header">Usuario</th>
                <th className="table-header">Código</th>
                <th className="table-header">Correo</th>
                <th className="table-header">Rol</th>
                <th className="table-header">Estado</th>
                <th className="table-header text-right">Acciones</th>
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
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12">
                    <UsersIcon className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                    <p className="text-sm text-slate-400">
                      {search ? 'No se encontraron resultados.' : 'No hay usuarios registrados.'}
                    </p>
                  </td>
                </tr>
              ) : (
                users.map(u => (
                  <tr key={u.id} className={`hover:bg-slate-50 transition-colors ${u.id === currentUser?.id ? 'bg-blue-50/30' : ''}`}>
                    <td className="table-cell">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-navy-100 flex items-center justify-center text-navy-700 text-xs font-bold flex-shrink-0">
                          {u.full_name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-slate-900">{u.full_name}</span>
                      </div>
                    </td>
                    <td className="table-cell"><span className="font-mono text-xs">{u.unique_code}</span></td>
                    <td className="table-cell text-slate-500">{u.email}</td>
                    <td className="table-cell">
                      {u.role ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-navy-50 text-navy-700 border border-navy-100">
                          {u.role.name}
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="table-cell">
                      {u.id !== currentUser?.id ? (
                        <button
                          onClick={() => setStatusTarget(u)}
                          className={`text-xs font-medium px-2.5 py-0.5 rounded-full border transition-colors ${
                            u.active
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                          }`}
                        >
                          {u.active ? 'Activo' : 'Inactivo'}
                        </button>
                      ) : (
                        <span className="badge-active">Activo</span>
                      )}
                    </td>
                    <td className="table-cell text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(u)} className="p-1.5 rounded-lg text-slate-400 hover:text-navy-700 hover:bg-navy-50 transition-colors" title="Editar">
                          <PencilSquareIcon className="w-4 h-4" />
                        </button>
                        {u.id !== currentUser?.id && (
                          <button onClick={() => setDeleteTarget(u)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Eliminar">
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar Usuario' : 'Nuevo Usuario'} size="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="label">Nombre Completo</label>
            <input className={`input-field ${errors.full_name ? 'border-red-400' : ''}`} placeholder="Nombre y apellido" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
            {errors.full_name && <p className="text-xs text-red-600 mt-1">{errors.full_name}</p>}
          </div>

          <div>
            <label className="label">Código Único</label>
            <input className={`input-field font-mono ${errors.unique_code ? 'border-red-400' : ''}`} placeholder="Código externo" value={form.unique_code} onChange={e => setForm(f => ({ ...f, unique_code: e.target.value }))} />
            {errors.unique_code && <p className="text-xs text-red-600 mt-1">{errors.unique_code}</p>}
          </div>

          <div>
            <label className="label">Correo Electrónico</label>
            <input type="email" className={`input-field ${errors.email ? 'border-red-400' : ''}`} placeholder="usuario@interligas.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} readOnly={!!editing} />
            {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email}</p>}
            {editing && <p className="text-xs text-slate-400 mt-1">El correo no puede modificarse.</p>}
          </div>

          {!editing && (
            <div className="sm:col-span-2">
              <label className="label">Contraseña</label>
              <input type="password" className={`input-field ${errors.password ? 'border-red-400' : ''}`} placeholder="Mínimo 8 caracteres" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
              {errors.password && <p className="text-xs text-red-600 mt-1">{errors.password}</p>}
            </div>
          )}

          <div>
            <label className="label">Rol</label>
            <select className={`input-field ${errors.role_id ? 'border-red-400' : ''}`} value={form.role_id} onChange={e => setForm(f => ({ ...f, role_id: e.target.value }))}>
              <option value="">Seleccionar rol...</option>
              {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            {errors.role_id && <p className="text-xs text-red-600 mt-1">{errors.role_id}</p>}
          </div>

          <div className="flex items-center">
            <label className="flex items-center gap-3 cursor-pointer mt-4">
              <div className="relative">
                <input type="checkbox" className="sr-only" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
                <div className={`w-10 h-6 rounded-full transition-colors ${form.active ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.active ? 'translate-x-4' : ''}`} />
              </div>
              <span className="text-sm font-medium text-slate-700">{form.active ? 'Usuario activo' : 'Usuario inactivo'}</span>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setModalOpen(false)} className="btn-secondary" disabled={saving}>Cancelar</button>
          <button onClick={handleSave} className="btn-primary" disabled={saving}>
            {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear Usuario'}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!statusTarget}
        onClose={() => setStatusTarget(null)}
        onConfirm={handleToggleStatus}
        title="Cambiar Estado del Usuario"
        message={`¿Confirmas que deseas ${statusTarget?.active ? 'desactivar' : 'activar'} a "${statusTarget?.full_name}"?`}
        confirmLabel={statusTarget?.active ? 'Desactivar' : 'Activar'}
        loading={saving}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Eliminar Usuario"
        message={`¿Confirmas que deseas eliminar a "${deleteTarget?.full_name}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        loading={saving}
      />
    </div>
  );
}
