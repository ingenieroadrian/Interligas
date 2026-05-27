import { useEffect, useState, useCallback } from 'react';
import { PlusIcon, PencilSquareIcon, TrashIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { supabase } from '../../lib/supabase';
import type { Court } from '../../types/database';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import { toast } from '../../components/Toast';

interface CourtForm {
  name: string;
}

const EMPTY_FORM: CourtForm = { name: '' };

export default function CanchasPage() {
  const [courts, setCourts] = useState<Court[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Court | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Court | null>(null);
  const [form, setForm] = useState<CourtForm>(EMPTY_FORM);
  const [nameError, setNameError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadCourts = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('courts').select('*').order('name');
    setCourts(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadCourts(); }, [loadCourts]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setNameError('');
    setModalOpen(true);
  }

  function openEdit(c: Court) {
    setEditing(c);
    setForm({ name: c.name });
    setNameError('');
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { setNameError('El nombre es obligatorio'); return; }
    setNameError('');
    setSaving(true);

    if (editing) {
      const { error } = await supabase.from('courts').update({ name: form.name.trim() }).eq('id', editing.id);
      if (error) toast('error', 'Error al actualizar la cancha.');
      else { toast('success', 'Cancha actualizada.'); setModalOpen(false); loadCourts(); }
    } else {
      const { error } = await supabase.from('courts').insert({ name: form.name.trim() });
      if (error) toast('error', 'Error al crear la cancha.');
      else { toast('success', 'Cancha creada.'); setModalOpen(false); loadCourts(); }
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const { error } = await supabase.from('courts').delete().eq('id', deleteTarget.id);
    if (error) toast('error', 'No se puede eliminar: la cancha tiene enfrentamientos asignados.');
    else { toast('success', 'Cancha eliminada.'); loadCourts(); }
    setDeleteTarget(null);
  }

  async function handleToggleActive(c: Court) {
    const { error } = await supabase.from('courts').update({ active: !c.active }).eq('id', c.id);
    if (error) toast('error', 'Error al cambiar el estado.');
    else { toast('success', `Cancha ${c.active ? 'desactivada' : 'activada'}.`); loadCourts(); }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-navy-900">Canchas</h1>
          <p className="text-sm text-navy-500 mt-0.5">Gestión de canchas para enfrentamientos</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2 self-start sm:self-auto">
          <PlusIcon className="w-4 h-4" />
          Nueva Cancha
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="table-header">Nombre</th>
                <th className="table-header">Estado</th>
                <th className="table-header text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan={3} className="table-cell text-center text-navy-400 py-10">Cargando...</td></tr>
              ) : courts.length === 0 ? (
                <tr><td colSpan={3} className="table-cell text-center text-navy-400 py-10">Sin canchas registradas</td></tr>
              ) : courts.map(c => (
                <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                  <td className="table-cell font-medium text-navy-800">{c.name}</td>
                  <td className="table-cell">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                      c.active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {c.active
                        ? <><CheckCircleIcon className="w-3 h-3" /> Activa</>
                        : <><XCircleIcon className="w-3 h-3" /> Inactiva</>
                      }
                    </span>
                  </td>
                  <td className="table-cell text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleToggleActive(c)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                          c.active
                            ? 'text-slate-600 bg-slate-100 hover:bg-slate-200'
                            : 'text-green-700 bg-green-50 hover:bg-green-100'
                        }`}
                      >
                        {c.active ? 'Desactivar' : 'Activar'}
                      </button>
                      <button
                        onClick={() => openEdit(c)}
                        className="p-1.5 text-navy-400 hover:bg-navy-50 hover:text-navy-700 rounded-lg transition-colors"
                      >
                        <PencilSquareIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(c)}
                        className="p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar Cancha' : 'Nueva Cancha'}
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="label">Nombre de la cancha *</label>
            <input
              type="text"
              className={`input-field ${nameError ? 'border-red-400' : ''}`}
              placeholder="Ej: Cancha Central, Cancha 1..."
              value={form.name}
              onChange={e => setForm({ name: e.target.value })}
            />
            {nameError && <p className="text-xs text-red-600 mt-1">{nameError}</p>}
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={() => setModalOpen(false)} className="btn-secondary flex-1">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
              {saving ? 'Guardando...' : editing ? 'Guardar Cambios' : 'Crear Cancha'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Eliminar Cancha"
        message={`¿Eliminar la cancha "${deleteTarget?.name}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
