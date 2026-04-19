'use client';

import { useEffect, useState } from 'react';
import { Plus, Edit2, RotateCcw, Power, X, Copy, Check, Eye, EyeOff, ChevronDown, ChevronUp, ChevronsUpDown, Truck } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useUser } from '@/contexts/UserContext';
import { UserProfile, UserRole, AppModule, ROLES, ALL_MODULES, ROLE_DEFAULT_MODULES } from '@/types/auth';

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || '';
}

async function apiPost(path: string, body: object) {
  const token = await getToken();
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  }).then(r => r.json());
}

async function apiPatch(path: string, body: object) {
  const token = await getToken();
  return fetch(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  }).then(r => r.json());
}

// ─── Types locaux ────────────────────────────────────────────────────────────

interface Driver {
  id: string;
  first_name: string;
  last_name: string;
}

interface UserForm {
  first_name: string;
  last_name: string;
  email: string;
  role: UserRole;
  modules: AppModule[];
  ateliers: string[];
  driver_id: string;
}

const emptyForm = (): UserForm => ({
  first_name: '',
  last_name: '',
  email: '',
  role: 'autre',
  modules: [],
  ateliers: [],
  driver_id: '',
});

// ─── Page ────────────────────────────────────────────────────────────────────

export default function UtilisateursPage() {
  const { profile: currentProfile } = useUser();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<string>('nom');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Modals
  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { loadUsers(); loadDrivers(); }, []);

  async function loadUsers() {
    const token = await getToken();
    const res = await fetch('/api/admin/users', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setUsers(await res.json());
    setLoading(false);
  }

  async function loadDrivers() {
    const { data } = await supabase
      .from('drivers')
      .select('id, first_name, last_name')
      .eq('is_active', true)
      .order('first_name');
    setDrivers((data as Driver[]) || []);
  }

  async function handleCreate(form: UserForm) {
    const res = await apiPost('/api/admin/users', form);
    if (res.error) { alert(res.error); return; }
    setTempPassword(res.tempPassword);
    setShowCreate(false);
    loadUsers();
  }

  async function handleEdit(form: Partial<UserProfile>) {
    if (!editingUser) return;
    const res = await apiPatch(`/api/admin/users/${editingUser.id}`, form);
    if (res.error) { alert(res.error); return; }
    setEditingUser(null);
    loadUsers();
  }

  async function handleToggleActive(user: UserProfile) {
    if (!confirm(`${user.is_active ? 'Désactiver' : 'Réactiver'} ${user.first_name} ${user.last_name} ?`)) return;
    const res = await apiPatch(`/api/admin/users/${user.id}`, { ...user, is_active: !user.is_active });
    if (res.error) { alert(res.error); return; }
    loadUsers();
  }

  async function handleResetPassword(user: UserProfile) {
    if (!confirm(`Réinitialiser le mot de passe de ${user.first_name} ${user.last_name} ?`)) return;
    const res = await apiPatch(`/api/admin/users/${user.id}`, { action: 'reset_password' });
    if (res.error) { alert(res.error); return; }
    setTempPassword(res.tempPassword);
  }

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function SortIcon({ col }: { col: string }) {
    if (sortKey !== col) return <ChevronsUpDown size={13} className="text-gray-300" />;
    return sortDir === 'asc'
      ? <ChevronUp size={13} className="text-blue-500" />
      : <ChevronDown size={13} className="text-blue-500" />;
  }

  const sortedUsers = [...users].sort((a, b) => {
    let valA: string | number = '';
    let valB: string | number = '';
    switch (sortKey) {
      case 'nom':    valA = `${a.first_name} ${a.last_name}`.toLowerCase(); valB = `${b.first_name} ${b.last_name}`.toLowerCase(); break;
      case 'role':   valA = a.role; valB = b.role; break;
      case 'statut': valA = a.is_active ? 0 : 1; valB = b.is_active ? 0 : 1; break;
    }
    if (valA < valB) return sortDir === 'asc' ? -1 : 1;
    if (valA > valB) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  if (currentProfile?.role !== 'admin') {
    return <div className="flex items-center justify-center h-64"><p className="text-gray-500">Accès réservé.</p></div>;
  }

  const roleLabel = (role: string) => ROLES.find(r => r.value === role)?.label || role;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Utilisateurs</h1>
          <p className="text-gray-500 mt-1">{users.filter(u => u.is_active).length} actifs sur {users.length}</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus size={20} />
          Ajouter un utilisateur
        </button>
      </div>

      {/* Tableau */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th onClick={() => handleSort('nom')} className="text-left px-6 py-4 text-sm font-medium text-gray-500 cursor-pointer select-none hover:text-gray-700">
                    <span className="flex items-center gap-1">Utilisateur <SortIcon col="nom" /></span>
                  </th>
                  <th onClick={() => handleSort('role')} className="text-left px-6 py-4 text-sm font-medium text-gray-500 cursor-pointer select-none hover:text-gray-700">
                    <span className="flex items-center gap-1">Rôle <SortIcon col="role" /></span>
                  </th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Modules</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Ateliers</th>
                  <th onClick={() => handleSort('statut')} className="text-left px-6 py-4 text-sm font-medium text-gray-500 cursor-pointer select-none hover:text-gray-700">
                    <span className="flex items-center gap-1">Statut <SortIcon col="statut" /></span>
                  </th>
                  <th className="text-right px-6 py-4 text-sm font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sortedUsers.map(user => (
                  <tr key={user.id} className={`hover:bg-gray-50 transition-colors ${!user.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
                          <span className="text-white font-bold text-sm">{user.first_name.charAt(0)}{user.last_name.charAt(0)}</span>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{user.first_name} {user.last_name}</p>
                          <p className="text-xs text-gray-500">{user.email}</p>
                        </div>
                        {user.must_change_password && (
                          <span className="text-xs px-2 py-0.5 bg-orange-50 text-orange-600 rounded-full">1ère connexion</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700">{roleLabel(user.role)}</span>
                        {user.role === 'livraison' && user.driver_id && (() => {
                          const d = drivers.find(dr => dr.id === user.driver_id);
                          return d ? (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full font-medium">
                              <Truck size={11} />
                              {d.first_name} {d.last_name}
                            </span>
                          ) : null;
                        })()}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600">{user.modules.length} module{user.modules.length > 1 ? 's' : ''}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600">
                        {user.ateliers.length === 0 ? 'Tous' : user.ateliers.join(', ')}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        user.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {user.is_active ? 'Actif' : 'Inactif'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setEditingUser(user)}
                          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Modifier"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleResetPassword(user)}
                          className="p-2 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                          title="Réinitialiser le mot de passe"
                        >
                          <RotateCcw size={16} />
                        </button>
                        {user.id !== currentProfile?.id && (
                          <button
                            onClick={() => handleToggleActive(user)}
                            className={`p-2 rounded-lg transition-colors ${
                              user.is_active
                                ? 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                                : 'text-green-600 hover:bg-green-50'
                            }`}
                            title={user.is_active ? 'Désactiver' : 'Réactiver'}
                          >
                            <Power size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal création */}
      {showCreate && (
        <UserFormModal
          title="Ajouter un utilisateur"
          initialForm={emptyForm()}
          drivers={drivers}
          onSubmit={handleCreate}
          onClose={() => setShowCreate(false)}
          submitLabel="Créer l'utilisateur"
        />
      )}

      {/* Modal édition */}
      {editingUser && (
        <UserFormModal
          title={`Modifier ${editingUser.first_name} ${editingUser.last_name}`}
          initialForm={{
            first_name: editingUser.first_name,
            last_name: editingUser.last_name,
            email: editingUser.email,
            role: editingUser.role,
            modules: editingUser.modules,
            ateliers: editingUser.ateliers,
            driver_id: editingUser.driver_id || '',
          }}
          drivers={drivers}
          onSubmit={handleEdit}
          onClose={() => setEditingUser(null)}
          submitLabel="Enregistrer"
          hideEmail
        />
      )}

      {/* Modal mot de passe provisoire */}
      {tempPassword && (
        <TempPasswordModal
          password={tempPassword}
          copied={copied}
          onCopy={() => {
            navigator.clipboard.writeText(tempPassword);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          onClose={() => setTempPassword(null)}
        />
      )}
    </div>
  );
}

// ─── Sous-composants ─────────────────────────────────────────────────────────

function UserFormModal({
  title,
  initialForm,
  drivers,
  onSubmit,
  onClose,
  submitLabel,
  hideEmail = false,
}: {
  title: string;
  initialForm: UserForm;
  drivers: Driver[];
  onSubmit: (form: UserForm) => Promise<void>;
  onClose: () => void;
  submitLabel: string;
  hideEmail?: boolean;
}) {
  const [form, setForm] = useState<UserForm>(initialForm);
  const [saving, setSaving] = useState(false);

  function handleRoleChange(role: UserRole) {
    setForm(f => ({
      ...f,
      role,
      modules: ROLE_DEFAULT_MODULES[role],
      // Effacer le livreur si on change de rôle
      driver_id: role === 'livraison' ? f.driver_id : '',
    }));
  }

  function toggleModule(mod: AppModule) {
    setForm(f => ({
      ...f,
      modules: f.modules.includes(mod)
        ? f.modules.filter(m => m !== mod)
        : [...f.modules, mod],
    }));
  }

  function toggleAtelier(value: string) {
    setForm(f => ({
      ...f,
      ateliers: f.ateliers.includes(value)
        ? f.ateliers.filter(a => a !== value)
        : [...f.ateliers, value],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await onSubmit(form);
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl my-4">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Infos personnelles */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Prénom *</label>
              <input
                type="text"
                required
                value={form.first_name}
                onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Nom *</label>
              <input
                type="text"
                required
                value={form.last_name}
                onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {!hideEmail && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email *</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="prenom.nom@bdk.com"
              />
            </div>
          )}

          {/* Rôle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Rôle / Poste *</label>
            <select
              value={form.role}
              onChange={e => handleRoleChange(e.target.value as UserRole)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {ROLES.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">Les modules sont pré-remplis selon le rôle, vous pouvez les ajuster.</p>
          </div>

          {/* Livreur associé — visible seulement si rôle = livraison */}
          {form.role === 'livraison' && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
              <label className="block text-sm font-semibold text-blue-900 mb-2 flex items-center gap-1.5">
                <Truck size={15} />
                Livreur associé
              </label>
              <select
                value={form.driver_id}
                onChange={e => setForm(f => ({ ...f, driver_id: e.target.value }))}
                className="w-full px-4 py-2.5 border border-blue-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
              >
                <option value="">— Aucun livreur associé —</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>{d.first_name} {d.last_name}</option>
                ))}
              </select>
              <p className="text-xs text-blue-600 mt-2">
                {form.driver_id
                  ? 'Ce compte sera automatiquement redirigé vers la vue tournée de ce livreur à la connexion.'
                  : 'Sans livreur associé, ce compte verra la vue livraisons standard.'}
              </p>
            </div>
          )}

          {/* Modules */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Modules visibles</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ALL_MODULES.map(mod => (
                <label key={mod.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.modules.includes(mod.value)}
                    onChange={() => toggleModule(mod.value)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">{mod.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Ateliers */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Restriction par atelier</label>
            <p className="text-xs text-gray-400 mb-3">Laisser vide = accès à tous les ateliers.</p>
            <AtelierCheckboxes selected={form.ateliers} onToggle={toggleAtelier} />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {saving ? 'Enregistrement...' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AtelierCheckboxes({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const [ateliers, setAteliers] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    supabase.from('ateliers').select('value, label').order('sort_order').then(({ data }: { data: { value: string; label: string }[] | null }) => {
      if (data) setAteliers(data);
    });
  }, []);

  return (
    <div className="flex flex-wrap gap-2">
      {ateliers.map(a => (
        <label key={a.value} className="flex items-center gap-2 cursor-pointer px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
          <input
            type="checkbox"
            checked={selected.includes(a.value)}
            onChange={() => onToggle(a.value)}
            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">{a.label}</span>
        </label>
      ))}
    </div>
  );
}

function TempPasswordModal({
  password,
  copied,
  onCopy,
  onClose,
}: {
  password: string;
  copied: boolean;
  onCopy: () => void;
  onClose: () => void;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-2">Mot de passe provisoire</h2>
        <p className="text-sm text-gray-500 mb-4">
          Transmettez ce mot de passe à l'utilisateur. Il devra le changer à sa première connexion.
        </p>

        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-center justify-between gap-3">
          <code className="font-mono text-lg font-bold text-gray-900 tracking-wider flex-1">
            {visible ? password : '••••••••••••'}
          </code>
          <div className="flex gap-2">
            <button
              onClick={() => setVisible(!visible)}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
            >
              {visible ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
            <button
              onClick={onCopy}
              className="p-2 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
            >
              {copied ? <Check size={18} className="text-green-600" /> : <Copy size={18} />}
            </button>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mt-3 text-sm text-amber-700">
          ⚠ Ce mot de passe ne sera plus affiché après fermeture de cette fenêtre.
        </div>

        <button
          onClick={onClose}
          className="w-full mt-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
        >
          J'ai noté le mot de passe
        </button>
      </div>
    </div>
  );
}
