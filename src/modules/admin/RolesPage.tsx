import { useEffect, useState, useCallback } from 'react';
import { PlusIcon, PencilSquareIcon, TrashIcon, ShieldCheckIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { supabase } from '../../lib/supabase';
import type { Role, Permission, PermissionModule, PermissionAction } from '../../types/database';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import SearchInput from '../../components/SearchInput';
import { toast } from '../../components/Toast';

const MODULES: { key: PermissionModule; label: string }[] = [
  { key: 'leagues', label: 'Ligas' },
  { key: 'players', label: 'Jugadores' },
  { key: 'coaches', label: 'Entrenadores' },
  { key: 'users', label: 'Usuarios del Sistema' },
  { key: 'roles', label: 'Roles y Permisos' },
  { key: 'results', label: 'Resultados' },
  { key: 'rosters', label: 'Nóminas' },
];

const ACTIONS: { key: PermissionAction; label: string }[] = [
  { key: 'view', label: 'Ver' },
  { key: 'create', label: 'Crear' },
  { key: 'edit', label: 'Editar' },
  { key: 'delete', label: 'Eliminar' },
];

interface RoleWithPermissions extends Role {
  permissions: string[]; // permission ids
}

export default function RolesPage() {
  const [roles, setRoles] = useState<RoleWithPermissions[]>([]);
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);
  const [editing, setEditing] = useState<RoleWithPermissions | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPermissions, setFormPermissions] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [rolesRes, permRes, rpRes] = await Promise.all([
      supabase.from('roles').select('*').order('name'),
      supabase.from('permissions').select('*'),
      supabase.from('roles_permissions').select('*'),
    ]);

    if (!rolesRes.error && !permRes.error && !rpRes.error) {
      const perms = permRes.data as Permission[];
      const rp = rpRes.data as { role_id: string; permission_id: string }[];
      const enriched = (rolesRes.data as Role[]).map(role => ({
        ...role,
        permissions: rp.filter(r => r.role_id === role.id).map(r => r.permission_id),
      }));
      setRoles(enriched);
      setAllPermissions(perms);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getPermId = (module: PermissionModule, action: PermissionAction) =>
    allPermissions.find(p => p.module === module && p.action === action)?.id;

  const openCreate = () => {
    setEditing(null);
    setFormName('');
    setFormDescription('');
    setFormPermissions(new Set());
    setNameError('');
    setModalOpen(true);
  };

  const openEdit = (role: RoleWithPermissions) => {
    setEditing(role);
    setFormName(role.name);
    setFormDescription(role.description);
    setFormPermissions(new Set(role.permissions));
    setNameError('');
    setModalOpen(true);
  };

  const togglePerm = (module: PermissionModule, action: PermissionAction) => {
    const id = getPermId(module, action);
    if (!id) return;
    setFormPermissions(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleModule = (module: PermissionModule) => {
    const modulePerms = ACTIONS.map(a => getPermId(module, a.key)).filter(Boolean) as string[];
    const allSelected = modulePerms.every(id => formPermissions.has(id));
    setFormPermissions(prev => {
      const next = new Set(prev);
      if (allSelected) modulePerms.forEach(id => next.delete(id));
      else modulePerms.forEach(id => next.add(id));
      return next;
    });
  };

  const handleSave = async () => {
    if (!formName.trim()) { setNameError('El nombre del rol es requerido'); return; }
    setSaving(true);

    if (editing) {
      const { error } = await supabase.from('roles').update({
        name: formName.trim(),
        description: formDescription.trim(),
      }).eq('id', editing.id);

      if (error) { toast('error', 'Error al actualizar el rol.'); setSaving(false); return; }

      // Sync permissions
      await supabase.from('roles_permissions').delete().eq('role_id', editing.id);
      if (formPermissions.size > 0) {
        await supabase.from('roles_permissions').insert(
          Array.from(formPermissions).map(pid => ({ role_id: editing.id, permission_id: pid }))
        );
      }
      toast('success', 'Rol actualizado correctamente.');
    } else {
      const { data, error } = await supabase.from('roles').insert({
        name: formName.trim(),
        description: formDescription.trim(),
        is_system: false,
      }).select().maybeSingle();

      if (error || !data) { toast('error', error?.message.includes('unique') ? 'Ya existe un rol con ese nombre.' : 'Error al crear el rol.'); setSaving(false); return; }

      if (formPermissions.size > 0) {
        await supabase.from('roles_permissions').insert(
          Array.from(formPermissions).map(pid => ({ role_id: (data as Role).id, permission_id: pid }))
        );
      }
      toast('success', 'Rol creado correctamente.');
    }

    setModalOpen(false);
    fetchData();
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    const { error } = await supabase.from('roles').delete().eq('id', deleteTarget.id);
    if (error) toast('error', 'Error al eliminar el rol.');
    else { toast('success', 'Rol eliminado.'); setDeleteTarget(null); fetchData(); }
    setSaving(false);
  };

  const filtered = roles.filter(r =>
    !search.trim() || r.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Roles y Permisos</h1>
          <p className="text-slate-500 text-sm mt-1">{roles.length} rol{roles.length !== 1 ? 'es' : ''} configurado{roles.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <PlusIcon className="w-4 h-4" />
          Nuevo Rol
        </button>
      </div>

      <div className="mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar rol..." />
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="card p-5 animate-pulse">
              <div className="h-5 bg-slate-100 rounded w-40 mb-2" />
              <div className="h-4 bg-slate-100 rounded w-64" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card py-12 text-center">
          <ShieldCheckIcon className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-sm text-slate-400">{search ? 'No se encontraron resultados.' : 'No hay roles configurados.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(role => {
            const isExpanded = expanded === role.id;
            const permCount = role.permissions.length;

            return (
              <div key={role.id} className="card overflow-hidden">
                <div className="px-5 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <div className="w-9 h-9 rounded-lg bg-navy-50 border border-navy-100 flex items-center justify-center flex-shrink-0">
                      <ShieldCheckIcon className="w-5 h-5 text-navy-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-slate-900 text-sm">{role.name}</h3>
                        {role.is_system && (
                          <span className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded font-medium">Sistema</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 truncate">{role.description || 'Sin descripción'}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                    <span className="text-xs text-slate-400 mr-2">{permCount} permiso{permCount !== 1 ? 's' : ''}</span>
                    <button onClick={() => openEdit(role)} className="p-1.5 rounded-lg text-slate-400 hover:text-navy-700 hover:bg-navy-50 transition-colors" title="Editar">
                      <PencilSquareIcon className="w-4 h-4" />
                    </button>
                    {!role.is_system && (
                      <button onClick={() => setDeleteTarget(role)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Eliminar">
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => setExpanded(isExpanded ? null : role.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                      {isExpanded ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-100 px-5 py-4">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr>
                            <th className="text-left text-slate-500 font-semibold pb-2 pr-4">Módulo</th>
                            {ACTIONS.map(a => (
                              <th key={a.key} className="text-center text-slate-500 font-semibold pb-2 px-3">{a.label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {MODULES.map(m => (
                            <tr key={m.key} className="border-t border-slate-50">
                              <td className="py-2 pr-4 text-slate-700 font-medium">{m.label}</td>
                              {ACTIONS.map(a => {
                                const id = getPermId(m.key, a.key);
                                const has = id ? role.permissions.includes(id) : false;
                                return (
                                  <td key={a.key} className="py-2 px-3 text-center">
                                    {has ? (
                                      <span className="inline-block w-4 h-4 bg-emerald-100 rounded-full border border-emerald-300" title="Permitido" />
                                    ) : (
                                      <span className="inline-block w-4 h-4 bg-slate-100 rounded-full border border-slate-200" title="No permitido" />
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar Rol' : 'Nuevo Rol'} size="lg">
        <div className="space-y-4 mb-5">
          <div>
            <label className="label">Nombre del Rol</label>
            <input
              className={`input-field ${nameError ? 'border-red-400' : ''}`}
              placeholder="Ej. Coordinador Regional"
              value={formName}
              onChange={e => { setFormName(e.target.value); setNameError(''); }}
              readOnly={editing?.is_system}
            />
            {nameError && <p className="text-xs text-red-600 mt-1">{nameError}</p>}
            {editing?.is_system && <p className="text-xs text-slate-400 mt-1">Los roles del sistema no pueden renombrarse.</p>}
          </div>
          <div>
            <label className="label">Descripción <span className="text-slate-400 font-normal">(opcional)</span></label>
            <input className="input-field" placeholder="Breve descripción del rol" value={formDescription} onChange={e => setFormDescription(e.target.value)} />
          </div>
        </div>

        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
            <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Permisos por Módulo</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left text-xs text-slate-500 font-semibold px-4 py-3">Módulo</th>
                  {ACTIONS.map(a => (
                    <th key={a.key} className="text-center text-xs text-slate-500 font-semibold px-3 py-3">{a.label}</th>
                  ))}
                  <th className="text-center text-xs text-slate-500 font-semibold px-3 py-3">Todo</th>
                </tr>
              </thead>
              <tbody>
                {MODULES.map(m => {
                  const modulePerms = ACTIONS.map(a => getPermId(m.key, a.key)).filter(Boolean) as string[];
                  const allSelected = modulePerms.every(id => formPermissions.has(id));
                  return (
                    <tr key={m.key} className="border-t border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-slate-700 font-medium text-sm">{m.label}</td>
                      {ACTIONS.map(a => {
                        const id = getPermId(m.key, a.key);
                        const has = id ? formPermissions.has(id) : false;
                        return (
                          <td key={a.key} className="px-3 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={has}
                              onChange={() => togglePerm(m.key, a.key)}
                              className="w-4 h-4 rounded border-slate-300 text-navy-600 focus:ring-navy-500 cursor-pointer"
                            />
                          </td>
                        );
                      })}
                      <td className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={() => toggleModule(m.key)}
                          className="w-4 h-4 rounded border-slate-300 text-navy-600 focus:ring-navy-500 cursor-pointer"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setModalOpen(false)} className="btn-secondary" disabled={saving}>Cancelar</button>
          <button onClick={handleSave} className="btn-primary" disabled={saving}>
            {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear Rol'}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Eliminar Rol"
        message={`¿Confirmas que deseas eliminar el rol "${deleteTarget?.name}"? Los usuarios con este rol quedarán sin rol asignado.`}
        confirmLabel="Eliminar"
        loading={saving}
      />
    </div>
  );
}
