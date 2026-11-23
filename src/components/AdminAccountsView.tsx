import React, { useEffect, useState } from 'react';
import { Shield, UserPlus } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { UserRole } from '../types/pelada';

interface AdminUserItem {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  nickname: string | null;
  preferredPosition: string | null;
  profileCompleted: boolean | null;
  initOverall: number | null;
}

const PRIMARY_ADMIN_EMAIL = 'gubrant@gmail.com';

export const AdminAccountsView: React.FC<{
  currentUserId: number;
  currentUserEmail: string;
}> = ({ currentUserId, currentUserEmail }) => {
  const [usersList, setUsersList] = useState<AdminUserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPrimaryAdmin = currentUserEmail.toLowerCase() === PRIMARY_ADMIN_EMAIL;

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ users: AdminUserItem[] }>('/api/admin/users');
      setUsersList(res.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao listar contas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
        }),
      });
      setName('');
      setEmail('');
      setPassword('');
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar conta.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleRole = async (user: AdminUserItem) => {
    const nextRole: UserRole = user.role === 'admin' ? 'member' : 'admin';
    try {
      await apiFetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: nextRole }),
      });
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao alterar perfil.');
    }
  };

  const handleToggleActive = async (user: AdminUserItem) => {
    try {
      await apiFetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !user.active }),
      });
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao alterar status.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-2 flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-emerald-700" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
            Cadastrar Novo Peladeiro
          </h2>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          Nenhuma conta pode ser criada diretamente como administradora. Novas contas entram como{' '}
          <strong>Peladeiro</strong> e somente <strong>{PRIMARY_ADMIN_EMAIL}</strong> pode alternar
          contas cadastradas entre Peladeiro e Administrador.
        </p>

        <form onSubmit={handleCreateUser} className="grid gap-3 sm:grid-cols-4">
          <input
            type="text"
            required
            placeholder="Nome completo"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600"
          />
          <input
            type="email"
            required
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Senha (mín. 6)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600"
          />
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {submitting ? 'Criando...' : 'Cadastrar Peladeiro'}
          </button>
        </form>

        {error && (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
            {error}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-slate-600" />
            <h3 className="text-sm font-bold text-slate-900">
              Contas Cadastradas ({usersList.length})
            </h3>
          </div>
        </div>

        {loading ? (
          <p className="p-8 text-center text-sm text-slate-500">Carregando contas...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">E-mail</th>
                  <th className="px-4 py-3">Perfil</th>
                  <th className="px-4 py-3">Ficha Médica</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {usersList.map((u) => {
                  const isSelf = u.id === currentUserId;
                  const targetIsPrimary = u.email.toLowerCase() === PRIMARY_ADMIN_EMAIL;
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {u.name}
                        {u.nickname ? (
                          <span className="ml-1.5 text-xs text-slate-500">({u.nickname})</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">{u.email}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ${
                            u.role === 'admin'
                              ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border border-slate-200 bg-slate-100 text-slate-700'
                          }`}
                        >
                          {targetIsPrimary
                            ? 'Administrador Principal'
                            : u.role === 'admin'
                              ? 'Administrador'
                              : 'Peladeiro'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {u.profileCompleted ? 'Completa' : 'Pendente'}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {u.active ? (
                          <span className="font-semibold text-emerald-700">Ativo</span>
                        ) : (
                          <span className="font-semibold text-rose-600">Desativado</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        {!isSelf && !targetIsPrimary && (
                          <>
                            {isPrimaryAdmin && (
                              <button
                                type="button"
                                onClick={() => handleToggleRole(u)}
                                className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                              >
                                {u.role === 'admin' ? 'Tornar Peladeiro' : 'Tornar Admin'}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleToggleActive(u)}
                              className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                            >
                              {u.active ? 'Desativar' : 'Reativar'}
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
