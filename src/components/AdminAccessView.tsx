import { useCallback, useEffect, useState } from 'react';
import {
  Clock,
  KeyRound,
  Mail,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type {
  AdminTitle,
  AdminUserAccount,
  PeladaGroupMember,
  Player,
  PlayerSummaryEmailRecord,
} from '../types/futsal';

const ADMIN_TITLE_OPTIONS: Array<{ value: AdminTitle; label: string }> = [
  { value: 'presidente_tesoureiro', label: 'Presidente e Tesoureiro' },
  { value: 'presidente', label: 'Presidente' },
  { value: 'tesoureiro', label: 'Tesoureiro' },
  { value: 'administrador', label: 'Admin comum (sem baixa financeira)' },
];

interface AdminAccessViewProps {
  groupId?: number | null;
  groupName?: string;
  isGlobalAdmin?: boolean;
  players: Player[];
  allPlayers?: Player[];
  pendingJoinRequestsCount?: number;
  onOpenJoinRequests?: () => void;
  onMembersChanged?: () => void;
}

export function AdminAccessView({
  groupId,
  groupName,
  isGlobalAdmin = true,
  players,
  allPlayers = [],
  pendingJoinRequestsCount = 0,
  onOpenJoinRequests,
  onMembersChanged,
}: AdminAccessViewProps) {
  const [users, setUsers] = useState<AdminUserAccount[]>([]);
  const [members, setMembers] = useState<PeladaGroupMember[]>([]);
  const [summaryEmails, setSummaryEmails] = useState<PlayerSummaryEmailRecord[]>([]);
  const [selectedAddPlayerId, setSelectedAddPlayerId] = useState<number>(0);
  const [selectedAddUserId, setSelectedAddUserId] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'player' | 'admin'>('player');
  const [playerId, setPlayerId] = useState<number>(0);
  const [password, setPassword] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, mRes, sRes] = await Promise.all([
        isGlobalAdmin
          ? apiFetch<AdminUserAccount[]>('/api/admin/users').catch(() => [] as AdminUserAccount[])
          : Promise.resolve([] as AdminUserAccount[]),
        groupId
          ? apiFetch<PeladaGroupMember[]>(`/api/groups/${groupId}/members`)
          : Promise.resolve([] as PeladaGroupMember[]),
        groupId
          ? apiFetch<PlayerSummaryEmailRecord[]>(`/api/groups/${groupId}/summary-emails`).catch(
              () => [] as PlayerSummaryEmailRecord[]
            )
          : Promise.resolve([] as PlayerSummaryEmailRecord[]),
      ]);
      setUsers(uRes);
      setMembers(mRes);
      setSummaryEmails(sRes);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar acessos.');
    } finally {
      setLoading(false);
    }
  }, [groupId, isGlobalAdmin]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    if (!groupId || (!selectedAddPlayerId && !selectedAddUserId)) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await apiFetch(`/api/groups/${groupId}/members`, {
        method: 'POST',
        body: JSON.stringify({
          playerId: selectedAddPlayerId || null,
          userId: selectedAddUserId || null,
        }),
      });
      setSelectedAddPlayerId(0);
      setSelectedAddUserId(0);
      setSuccess('Participante vinculado a esta pelada fixa.');
      await loadData();
      onMembersChanged?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao adicionar participante.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveMember(memberId: number) {
    if (!groupId) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/groups/${groupId}/members/${memberId}`, { method: 'DELETE' });
      await loadData();
      onMembersChanged?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao remover participante.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleMemberRole(m: PeladaGroupMember) {
    if (!groupId) return;
    const nextRole = m.memberRole === 'admin' ? 'member' : 'admin';
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await apiFetch(`/api/groups/${groupId}/members/${m.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          memberRole: nextRole,
          ...(nextRole === 'admin' ? { adminTitle: m.adminTitle ?? 'administrador' } : {}),
        }),
      });
      setSuccess(
        nextRole === 'admin'
          ? `${m.playerNickname || m.userName || 'Participante'} agora é Administrador desta pelada (defina ao lado se atua como Presidente ou Tesoureiro).`
          : `${m.playerNickname || m.userName || 'Participante'} alterado para Peladeiro.`
      );
      await loadData();
      onMembersChanged?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao alterar função do participante.');
    } finally {
      setSaving(false);
    }
  }

  async function handleChangeAdminTitle(m: PeladaGroupMember, adminTitle: AdminTitle) {
    if (!groupId) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await apiFetch(`/api/groups/${groupId}/members/${m.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ memberRole: 'admin', adminTitle }),
      });
      const label = ADMIN_TITLE_OPTIONS.find((opt) => opt.value === adminTitle)?.label ?? adminTitle;
      setSuccess(
        `Função administrativa de ${m.playerNickname || m.userName || 'Admin'} atualizada para ${label}.`
      );
      await loadData();
      onMembersChanged?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar função administrativa.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await apiFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          name,
          email,
          role,
          playerId: playerId || null,
          groupId: groupId ?? null,
          password,
        }),
      });
      setName('');
      setEmail('');
      setPassword('');
      setPlayerId(0);
      setSuccess('Login e senha criados com sucesso!');
      await loadData();
      onMembersChanged?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao criar usuário.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-5">
        <h2 className="font-display text-3xl font-extrabold text-slate-900">
          {groupName ? `Membros & Acessos · ${groupName}` : 'Membros, Acessos & Senhas'}
        </h2>
        <p className="text-sm text-slate-500">
          Gerencie quem participa desta pelada fixa e crie logins com senha para usuários ou administradores.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}
        </div>
      )}

      {groupId && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-base font-bold text-slate-900">
              <Users className="h-4 w-4 text-emerald-600" />
              Participantes com Acesso a esta Pelada Fixa ({members.length})
            </div>
            {onOpenJoinRequests && (
              <button
                type="button"
                onClick={onOpenJoinRequests}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                  pendingJoinRequestsCount > 0
                    ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                    : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <UserCheck className="h-3.5 w-3.5" />
                {pendingJoinRequestsCount > 0
                  ? `${pendingJoinRequestsCount} Solicitação(ões) Pendente(s)`
                  : 'Ver Solicitações de Entrada'}
              </button>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">
            <strong className="text-slate-800">Regra financeira:</strong> somente administradores
            com função de <strong>Presidente</strong> e/ou <strong>Tesoureiro</strong> podem
            confirmar recebimento de mensalidades e diárias no Controle Financeiro.
          </div>

          <form onSubmit={handleAddMember} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className={isGlobalAdmin ? 'sm:col-span-5' : 'sm:col-span-9'}>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Adicionar Peladeiro Cadastrado
              </label>
              <select
                value={selectedAddPlayerId}
                onChange={(e) => {
                  setSelectedAddPlayerId(Number(e.target.value));
                  setSelectedAddUserId(0);
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                <option value={0}>Selecione um jogador...</option>
                {allPlayers
                  .filter((p) => !members.some((m) => m.playerId === p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nickname} ({p.name})
                    </option>
                  ))}
              </select>
            </div>

            {isGlobalAdmin && (
              <div className="sm:col-span-4">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ou adicionar Conta de Usuário
                </label>
                <select
                  value={selectedAddUserId}
                  onChange={(e) => {
                    setSelectedAddUserId(Number(e.target.value));
                    setSelectedAddPlayerId(0);
                  }}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  <option value={0}>Selecione um usuário...</option>
                  {users
                    .filter((u) => !members.some((m) => m.userId === u.id))
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.email})
                      </option>
                    ))}
                </select>
              </div>
            )}

            <div className="sm:col-span-3">
              <button
                type="submit"
                disabled={saving || (!selectedAddPlayerId && !selectedAddUserId)}
                className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
              >
                Vincular à Pelada
              </button>
            </div>
          </form>

          {members.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-2">
              {members.map((m) => {
                const isEventual = m.playerCategory === 'eventual';
                const expDate = m.accessExpiresAt ? new Date(m.accessExpiresAt) : null;
                const isExpired = isEventual && expDate != null && new Date() > expDate;
                const currentTitle: AdminTitle = m.adminTitle ?? 'administrador';
                const titleBadge =
                  currentTitle === 'presidente_tesoureiro'
                    ? 'Presidente e Tesoureiro'
                    : currentTitle === 'presidente'
                      ? 'Presidente'
                      : currentTitle === 'tesoureiro'
                        ? 'Tesoureiro'
                        : 'Admin comum';
                return (
                  <div
                    key={m.id}
                    className="flex flex-col justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">
                          {m.playerNickname || m.userName || 'Participante'}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate">
                          {m.memberRole === 'admin'
                            ? titleBadge
                            : m.playerCategory === 'avulso'
                              ? 'Avulso'
                              : m.playerCategory === 'eventual'
                                ? 'Eventual'
                                : 'Mensalista'}
                          {m.userEmail ? ` · ${m.userEmail}` : ''}
                        </p>
                        {isEventual && expDate && (
                          <p
                            className={`text-[10px] font-medium flex items-center gap-1 mt-0.5 ${
                              isExpired ? 'text-red-600' : 'text-amber-700'
                            }`}
                          >
                            <Clock className="h-3 w-3 shrink-0" />
                            {isExpired
                              ? `Encerrado em ${expDate.toLocaleDateString('pt-BR')}`
                              : `Acesso até ${expDate.toLocaleDateString('pt-BR')}`}
                            {m.summaryEmailSentAt ? ' · Resumo enviado' : ''}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {isEventual && !m.summaryEmailSentAt && groupId && (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={async () => {
                              setSaving(true);
                              setError(null);
                              try {
                                await apiFetch(`/api/groups/${groupId}/process-eventual-emails`, {
                                  method: 'POST',
                                  body: JSON.stringify({ memberId: m.id }),
                                });
                                setSuccess(
                                  `E-mail de agradecimento e estatísticas enviado para ${
                                    m.playerNickname || m.userName || 'eventual'
                                  }.`
                                );
                                await loadData();
                                onMembersChanged?.();
                              } catch (err: unknown) {
                                setError(
                                  err instanceof Error ? err.message : 'Erro ao enviar resumo.'
                                );
                              } finally {
                                setSaving(false);
                              }
                            }}
                            className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 hover:bg-amber-100 cursor-pointer"
                            title="Encerrar período eventual e enviar e-mail com resumo de estatísticas"
                          >
                            Enviar Resumo
                          </button>
                        )}
                        {m.userId != null && (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => handleToggleMemberRole(m)}
                            className={`rounded border px-2 py-0.5 text-[11px] font-semibold cursor-pointer ${
                              m.memberRole === 'admin'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                            }`}
                            title={
                              m.memberRole === 'admin'
                                ? 'Remover privilégio de admin da pelada'
                                : 'Tornar administrador desta pelada para votar e configurar critérios'
                            }
                          >
                            {m.memberRole === 'admin' ? 'Admin' : '+ Admin'}
                          </button>
                        )}
                        {m.memberRole !== 'admin' && (
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(m.id)}
                            className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"
                            title="Remover da pelada fixa"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {m.memberRole === 'admin' && (
                      <div className="pt-1.5 border-t border-slate-200/70">
                        <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                          Função na Diretoria / Financeiro
                        </label>
                        <select
                          value={currentTitle}
                          disabled={saving}
                          onChange={(e) =>
                            handleChangeAdminTitle(m, e.target.value as AdminTitle)
                          }
                          className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-800"
                        >
                          {ADMIN_TITLE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {isGlobalAdmin && <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleCreateAccount}
          className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 space-y-4"
        >
          <div className="flex items-center gap-2 text-base font-bold text-slate-900">
            <UserPlus className="h-4 w-4 text-emerald-600" />
            Criar Login e Senha
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Perfil de Acesso
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRole('player')}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold cursor-pointer ${
                  role === 'player'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                    : 'border-slate-200 text-slate-600'
                }`}
              >
                Jogador (Peladeiro)
              </button>
              <button
                type="button"
                onClick={() => setRole('admin')}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold cursor-pointer ${
                  role === 'admin'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                    : 'border-slate-200 text-slate-600'
                }`}
              >
                Administrador
              </button>
            </div>
          </div>

          {role === 'player' && players.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Vincular a jogador já cadastrado (opcional)
              </label>
              <select
                value={playerId}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  setPlayerId(id);
                  const found = players.find((p) => p.id === id);
                  if (found) {
                    setName(found.name);
                    if (found.email) setEmail(found.email);
                  }
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                <option value={0}>Novo vínculo ou sem vínculo</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nickname} ({p.name})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Nome *</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome completo"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">E-mail *</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@exemplo.com"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Senha (mín. 6 dígitos) *
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 dígitos"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
          >
            <KeyRound className="h-4 w-4" />
            {saving ? 'Processando...' : 'Criar Login e Senha'}
          </button>
        </form>

        <div className="lg:col-span-7 space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-slate-700" />
                Contas Cadastradas ({users.length})
              </h3>
            </div>
            {loading ? (
              <div className="p-6 text-center text-xs text-slate-500">Carregando contas...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Usuário</th>
                      <th className="px-4 py-2.5 font-semibold">Perfil</th>
                      <th className="px-4 py-2.5 font-semibold">Senha</th>
                      <th className="px-4 py-2.5 font-semibold text-right">Jogador</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td className="px-4 py-2.5">
                          <span className="font-semibold text-slate-900 block">{u.name}</span>
                          <span className="text-slate-500">{u.email}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={
                              u.role === 'admin'
                                ? 'font-semibold text-emerald-700'
                                : 'text-slate-700'
                            }
                          >
                            {u.role === 'admin' ? 'Administrador' : 'Usuário'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">
                          {u.hasPassword ? 'Senha definida' : 'Sem senha'}
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-700">
                          {u.player ? u.player.nickname : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {groupId && summaryEmails.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Mail className="h-4 w-4 text-amber-600" />
                  E-mails de Resumo Pós-Pelada (Eventuais) ({summaryEmails.length})
                </h3>
              </div>
              <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
                {summaryEmails.map((em) => (
                  <div key={em.id} className="p-4 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-900">
                        {em.playerNickname || em.toEmail} ({em.toEmail})
                      </span>
                      <span className="font-mono text-[11px] text-slate-400">
                        {new Date(em.sentAt).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                    <p className="text-slate-600">{em.subject}</p>
                    {em.stats && (
                      <p className="text-[11px] text-slate-500 font-mono">
                        {em.stats.matchesPlayed} jogos · {em.stats.goals} gols · {em.stats.assists}{' '}
                        assist. · {em.stats.defenses} defesas · Nota {em.stats.rating.toFixed(2)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>}
    </div>
  );
}
