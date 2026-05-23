import { useEffect, useState, useCallback } from 'react';
import {
  PlusIcon, PencilSquareIcon, TrashIcon, AcademicCapIcon, FunnelIcon, UserGroupIcon,
  ClipboardDocumentIcon, EyeIcon, EyeSlashIcon, KeyIcon, CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { supabase } from '../../lib/supabase';
import type { Coach, League, Player, PlayerCategory } from '../../types/database';
import { useAuthStore } from '../../store/authStore';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import SearchInput from '../../components/SearchInput';
import Pagination from '../../components/Pagination';
import { toast } from '../../components/Toast';
import { generateCoachEmail, resolveUniqueEmail } from '../../utils/stringHelpers';

const PAGE_SIZE = 10;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

async function callCoachManager(body: object) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || SUPABASE_ANON_KEY;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/coach-user-manager`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

const CATEGORIES: PlayerCategory[] = ['12F', '12M', '14F', '14M', '16F', '16M', '18F', '18M'];

interface CoachForm {
  full_name: string;
  unique_code: string;
  phone: string;
  league_id: string;
  category: PlayerCategory | '';
}

interface CredentialsResult {
  email: string;
  password: string;
}

const EMPTY_FORM: CoachForm = { full_name: '', unique_code: '', phone: '', league_id: '', category: '' };

export default function CoachesPage() {
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterLeague, setFilterLeague] = useState('');
  const [loading, setLoading] = useState(true);

  // Create/Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Coach | null>(null);
  const [form, setForm] = useState<CoachForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<CoachForm>>({});
  const [generatedEmail, setGeneratedEmail] = useState('');
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [credentialsResult, setCredentialsResult] = useState<CredentialsResult | null>(null);

  // Players in edit modal
  const [coachPlayers, setCoachPlayers] = useState<Player[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);

  // Status toggle
  const [statusTarget, setStatusTarget] = useState<Coach | null>(null);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<Coach | null>(null);

  // Change password modal
  const [pwdCoach, setPwdCoach] = useState<Coach | null>(null);
  const [pwdForm, setPwdForm] = useState({ newPwd: '', confirmPwd: '' });
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdError, setPwdError] = useState('');

  const { hasPermission, isSuperAdmin, role, user } = useAuthStore();

  const canCreate = hasPermission('coaches', 'create');
  const canEdit = hasPermission('coaches', 'edit');
  const canDelete = hasPermission('coaches', 'delete');
  const canToggleStatus = isSuperAdmin() || role?.name === 'Administrador de Liga';
  const canChangePassword = isSuperAdmin() || role?.name === 'Administrador de Liga';

  useEffect(() => {
    supabase.from('leagues').select('id, name').order('name').then(({ data }) => {
      if (data) setLeagues(data as League[]);
    });
  }, []);

  const fetchCoaches = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('coaches')
      .select('*, league:leagues(id,name,city,representative,created_at,email)', { count: 'exact' });

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

  // Auto-generate credentials as user types name / selects league
  useEffect(() => {
    if (editing || !form.full_name || !form.league_id) {
      setGeneratedEmail('');
      setGeneratedPassword('');
      return;
    }
    const league = leagues.find(l => l.id === form.league_id);
    if (!league) return;
    const email = generateCoachEmail(form.full_name, league.name);
    setGeneratedEmail(email);
    setGeneratedPassword(form.full_name);
  }, [form.full_name, form.league_id, leagues, editing]);

  const loadCoachPlayers = async (coachId: string) => {
    setLoadingPlayers(true);
    const { data } = await supabase
      .from('players')
      .select('id, full_name, category, league_active, league_id, birth_date, unique_code, coach_id, created_at, league:leagues(id,name,city,representative,created_at,email)')
      .eq('coach_id', coachId)
      .order('full_name');
    setCoachPlayers((data || []) as Player[]);
    setLoadingPlayers(false);
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setGeneratedEmail('');
    setGeneratedPassword('');
    setCredentialsResult(null);
    setCoachPlayers([]);
    setModalOpen(true);
  };

  const openEdit = (coach: Coach) => {
    setEditing(coach);
    setForm({ full_name: coach.full_name, unique_code: coach.unique_code, phone: coach.phone, league_id: coach.league_id || '', category: (coach.category as PlayerCategory) || '' });
    setErrors({});
    setGeneratedEmail('');
    setGeneratedPassword('');
    setCredentialsResult(null);
    setCoachPlayers([]);
    setModalOpen(true);
    loadCoachPlayers(coach.id);
  };

  const validate = () => {
    const e: Partial<CoachForm> = {};
    if (!form.full_name.trim()) e.full_name = 'El nombre completo es requerido';
    if (!form.unique_code.trim()) e.unique_code = 'El código único es requerido';
    if (!form.league_id) e.league_id = 'La liga es requerida';
    if (!editing && !generatedEmail) e.league_id = e.league_id || 'Selecciona una liga para generar el correo';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);

    if (editing) {
      // Edit: update coaches record only
      const payload = {
        full_name: form.full_name.trim(),
        unique_code: form.unique_code.trim(),
        phone: form.phone.trim(),
        league_id: form.league_id || null,
        category: form.category || null,
      };
      const { error } = await supabase.from('coaches').update(payload).eq('id', editing.id);
      if (error) toast('error', error.message.includes('unique') ? 'El código único ya está en uso.' : 'Error al actualizar el entrenador.');
      else { toast('success', 'Entrenador actualizado correctamente.'); setModalOpen(false); fetchCoaches(); }
      setSaving(false);
      return;
    }

    // Create: resolve unique email, then call edge function
    const league = leagues.find(l => l.id === form.league_id)!;
    const baseEmail = generateCoachEmail(form.full_name, league.name);
    const uniqueEmail = await resolveUniqueEmail(baseEmail);
    const password = form.full_name.trim();

    // Get Entrenador role id
    const { data: roleData } = await supabase
      .from('roles')
      .select('id')
      .eq('name', 'Entrenador')
      .maybeSingle();

    if (!roleData?.id) {
      toast('error', 'No se encontró el rol "Entrenador". Verifique la configuración de roles.');
      setSaving(false);
      return;
    }

    const result = await callCoachManager({
      action: 'create',
      full_name: form.full_name.trim(),
      unique_code: form.unique_code.trim(),
      phone: form.phone.trim(),
      league_id: form.league_id,
      email: uniqueEmail,
      password,
      coach_email: uniqueEmail,
      role_id: roleData.id,
    });

    if (result.error) {
      toast('error', result.error.includes('unique') ? 'El código único ya está en uso.' : `Error: ${result.error}`);
      setSaving(false);
      return;
    }

    setCredentialsResult({ email: uniqueEmail, password });
    fetchCoaches();
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

  const handleToggleStatus = async () => {
    if (!statusTarget) return;
    setSaving(true);
    const { error } = await supabase.from('coaches')
      .update({ active: !statusTarget.active })
      .eq('id', statusTarget.id);
    if (error) toast('error', 'Error al cambiar el estado.');
    else {
      // Also sync system_users active state
      if (statusTarget.user_id) {
        await supabase.from('system_users')
          .update({ active: !statusTarget.active })
          .eq('id', statusTarget.user_id);
      }
      toast('success', `Entrenador ${!statusTarget.active ? 'activado' : 'desactivado'}.`);
      setStatusTarget(null);
      fetchCoaches();
    }
    setSaving(false);
  };

  // Change password handlers
  const openPasswordModal = (coach: Coach) => {
    setPwdCoach(coach);
    setPwdForm({ newPwd: '', confirmPwd: '' });
    setPwdError('');
    setShowPwd(false);
    setShowConfirmPwd(false);
  };

  const handleResetToDefault = () => {
    if (!pwdCoach) return;
    setPwdForm({ newPwd: pwdCoach.full_name, confirmPwd: pwdCoach.full_name });
    setPwdError('');
  };

  const handleChangePassword = async () => {
    if (!pwdCoach) return;
    if (!pwdForm.newPwd) { setPwdError('La nueva contraseña es requerida.'); return; }
    if (pwdForm.newPwd !== pwdForm.confirmPwd) { setPwdError('Las contraseñas no coinciden.'); return; }
    if (pwdForm.newPwd.length < 6) { setPwdError('La contraseña debe tener al menos 6 caracteres.'); return; }

    // Get auth_id from system_users
    if (!pwdCoach.user_id) { toast('error', 'Este entrenador no tiene usuario del sistema asociado.'); return; }
    const { data: sysUser } = await supabase
      .from('system_users')
      .select('auth_id')
      .eq('id', pwdCoach.user_id)
      .maybeSingle();

    if (!sysUser?.auth_id) { toast('error', 'No se encontró la cuenta de acceso del entrenador.'); return; }

    setPwdSaving(true);
    const result = await callCoachManager({
      action: 'update_password',
      auth_id: sysUser.auth_id,
      new_password: pwdForm.newPwd,
    });
    setPwdSaving(false);

    if (result.error) {
      setPwdError('No se pudo actualizar la contraseña. Intenta nuevamente.');
    } else {
      toast('success', 'Contraseña actualizada correctamente.');
      setPwdCoach(null);
    }
  };

  const copyToClipboard = (text: string, label = 'Copiado al portapapeles.') => {
    navigator.clipboard.writeText(text);
    toast('success', label);
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
                <th className="table-header">Correo</th>
                <th className="table-header">Liga</th>
                <th className="table-header">Estado</th>
                <th className="table-header">Registrado</th>
                {(canEdit || canDelete || canChangePassword) && <th className="table-header text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {[1,2,3,4,5,6,7].map(j => (
                      <td key={j} className="table-cell"><div className="h-4 bg-slate-100 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : coaches.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12">
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
                    <td className="table-cell">
                      {coach.email
                        ? <span className="font-mono text-xs text-slate-500">{coach.email}</span>
                        : <span className="text-slate-300">—</span>
                      }
                    </td>
                    <td className="table-cell">{coach.league?.name || <span className="text-slate-300">—</span>}</td>
                    <td className="table-cell">
                      {canToggleStatus ? (
                        <button
                          onClick={() => setStatusTarget(coach)}
                          className={`text-xs font-medium px-2.5 py-0.5 rounded-full border transition-colors ${
                            coach.active
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                          }`}
                        >
                          {coach.active ? 'Activo' : 'Inactivo'}
                        </button>
                      ) : (
                        <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${
                          coach.active
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-slate-100 text-slate-500 border-slate-200'
                        }`}>
                          {coach.active ? 'Activo' : 'Inactivo'}
                        </span>
                      )}
                    </td>
                    <td className="table-cell text-slate-400">{new Date(coach.created_at).toLocaleDateString('es-CO')}</td>
                    {(canEdit || canDelete || canChangePassword) && (
                      <td className="table-cell text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canChangePassword && (
                            <button onClick={() => openPasswordModal(coach)} className="p-1.5 rounded-lg text-slate-400 hover:text-navy-700 hover:bg-navy-50 transition-colors" title="Cambiar contraseña">
                              <KeyIcon className="w-4 h-4" />
                            </button>
                          )}
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

      {/* Create / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setCredentialsResult(null); }}
        title={editing ? 'Editar Entrenador' : 'Nuevo Entrenador'}
        size="lg"
      >
        {credentialsResult ? (
          /* Credentials revealed after creation */
          <div className="flex flex-col items-center gap-5 py-2">
            <div className="w-14 h-14 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-center">
              <CheckCircleIcon className="w-7 h-7 text-emerald-500" />
            </div>
            <div className="text-center">
              <h3 className="text-slate-900 font-semibold text-base">Entrenador registrado correctamente</h3>
              <p className="text-slate-500 text-sm mt-1">Guarda estas credenciales — no se volverán a mostrar.</p>
            </div>
            <div className="w-full space-y-3">
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                <p className="text-xs text-slate-400 mb-1">Correo de acceso</p>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm text-slate-800">{credentialsResult.email}</span>
                  <button
                    onClick={() => copyToClipboard(credentialsResult.email, 'Correo copiado.')}
                    className="text-slate-400 hover:text-navy-700 transition-colors flex-shrink-0"
                  >
                    <ClipboardDocumentIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                <p className="text-xs text-slate-400 mb-1">Contraseña por defecto</p>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm text-slate-800">{credentialsResult.password}</span>
                  <button
                    onClick={() => copyToClipboard(credentialsResult.password, 'Contraseña copiada.')}
                    className="text-slate-400 hover:text-navy-700 transition-colors flex-shrink-0"
                  >
                    <ClipboardDocumentIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
            <button
              onClick={() => { setModalOpen(false); setCredentialsResult(null); }}
              className="btn-primary w-full"
            >
              Entendido
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="label">Nombre Completo</label>
              <input
                className={`input-field ${errors.full_name ? 'border-red-400' : ''}`}
                placeholder="Nombre y apellido"
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
              <label className="label">Teléfono <span className="text-slate-400 font-normal">(opcional)</span></label>
              <input className="input-field" placeholder="+57 300 000 0000" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
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
              <label className="label">Categoría que maneja</label>
              <select
                className="input-field"
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value as PlayerCategory }))}
              >
                <option value="">Sin categoría asignada</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Auto-generated credentials preview (only for new coaches) */}
            {!editing && (generatedEmail || generatedPassword) && (
              <div className="bg-navy-50 border border-navy-100 rounded-xl px-4 py-3 space-y-2">
                <p className="text-xs font-semibold text-navy-700 mb-1">Credenciales que se generarán automáticamente</p>
                {generatedEmail && (
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-navy-500">Correo</p>
                      <p className="font-mono text-xs text-navy-800 truncate">{generatedEmail}</p>
                    </div>
                    <button
                      onClick={() => copyToClipboard(generatedEmail, 'Correo copiado.')}
                      className="text-navy-400 hover:text-navy-700 transition-colors flex-shrink-0"
                    >
                      <ClipboardDocumentIcon className="w-4 h-4" />
                    </button>
                  </div>
                )}
                {generatedPassword && (
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-navy-500">Contraseña por defecto</p>
                      <p className="font-mono text-xs text-navy-800 truncate">{generatedPassword}</p>
                    </div>
                    <button
                      onClick={() => copyToClipboard(generatedPassword, 'Contraseña copiada.')}
                      className="text-navy-400 hover:text-navy-700 transition-colors flex-shrink-0"
                    >
                      <ClipboardDocumentIcon className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Players under this coach (edit mode) */}
            {editing && (
              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center gap-2 mb-3">
                  <UserGroupIcon className="w-4 h-4 text-slate-400" />
                  <h3 className="text-sm font-semibold text-slate-700">Jugadores a cargo</h3>
                </div>
                {loadingPlayers ? (
                  <div className="space-y-2">
                    {[1,2,3].map(i => <div key={i} className="h-8 bg-slate-100 rounded animate-pulse" />)}
                  </div>
                ) : coachPlayers.length === 0 ? (
                  <p className="text-xs text-slate-400 py-2">Este entrenador no tiene jugadores asignados.</p>
                ) : (
                  <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                    {coachPlayers.map(p => (
                      <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 border border-slate-100">
                        <span className="text-sm text-slate-800 font-medium">{p.full_name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs px-1.5 py-0.5 rounded bg-navy-50 text-navy-700 border border-navy-100 font-semibold">{p.category}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                            p.league_active
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-100 text-slate-500 border-slate-200'
                          }`}>
                            {p.league_active ? 'Activo' : 'Inactivo'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setModalOpen(false)} className="btn-secondary" disabled={saving}>Cancelar</button>
              <button onClick={handleSave} className="btn-primary" disabled={saving}>
                {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear Entrenador'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Change Password Modal */}
      <Modal
        open={!!pwdCoach}
        onClose={() => setPwdCoach(null)}
        title={`Cambiar contraseña — ${pwdCoach?.full_name || ''}`}
      >
        <div className="space-y-4">
          <div>
            <label className="label">Nueva contraseña</label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                className="input-field pr-10"
                placeholder="Nueva contraseña"
                value={pwdForm.newPwd}
                onChange={e => { setPwdForm(f => ({ ...f, newPwd: e.target.value })); setPwdError(''); }}
              />
              <button
                type="button"
                onClick={() => setShowPwd(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPwd ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="label">Confirmar nueva contraseña</label>
            <div className="relative">
              <input
                type={showConfirmPwd ? 'text' : 'password'}
                className="input-field pr-10"
                placeholder="Repite la contraseña"
                value={pwdForm.confirmPwd}
                onChange={e => { setPwdForm(f => ({ ...f, confirmPwd: e.target.value })); setPwdError(''); }}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPwd(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showConfirmPwd ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {pwdError && (
            <p className="text-xs text-red-600">{pwdError}</p>
          )}

          <button
            type="button"
            onClick={handleResetToDefault}
            className="text-xs text-navy-600 hover:text-navy-800 font-medium underline underline-offset-2 transition-colors"
          >
            Restablecer a contraseña por defecto ({pwdCoach?.full_name})
          </button>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setPwdCoach(null)} className="btn-secondary" disabled={pwdSaving}>Cancelar</button>
          <button
            onClick={handleChangePassword}
            className="btn-primary"
            disabled={pwdSaving || !pwdForm.newPwd || pwdForm.newPwd !== pwdForm.confirmPwd}
          >
            {pwdSaving ? 'Actualizando...' : 'Confirmar cambio'}
          </button>
        </div>
      </Modal>

      {/* Status toggle confirm */}
      <ConfirmDialog
        open={!!statusTarget}
        onClose={() => setStatusTarget(null)}
        onConfirm={handleToggleStatus}
        title="Cambiar Estado del Entrenador"
        message={`¿Confirmas que deseas ${statusTarget?.active ? 'desactivar' : 'activar'} a "${statusTarget?.full_name}"?`}
        confirmLabel={statusTarget?.active ? 'Desactivar' : 'Activar'}
        loading={saving}
      />

      {/* Delete confirm */}
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
