import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Clock,
  Copy,
  ExternalLink,
  Mail,
  Send,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type {
  AdminUserAccount,
  InviteEmailRecord,
  PeladaGroupMember,
  Player,
  PlayerSummaryEmailRecord,
} from '../types/futsal';

interface AdminAccessViewProps {
  groupId?: number | null;
  groupName?: string;
  players: Player[];
  allPlayers?: Player[];
  pendingJoinRequestsCount?: number;
  onOpenJoinRequests?: () => void;
  onMembersChanged?: () => void;
  onTestInviteLink: (token: string) => void;
}

export function AdminAccessView({
  groupId,
  groupName,
  players,
  allPlayers = [],
  pendingJoinRequestsCount = 0,
  onOpenJoinRequests,
  onMembersChanged,
  onTestInviteLink,
}: AdminAccessViewProps) {
  const [users, setUsers] = useState<AdminUserAccount[]>([]);
  const [invites, setInvites] = useState<InviteEmailRecord[]>([]);
  const [members, setMembers] = useState<PeladaGroupMember[]>([]);
  const [summaryEmails, setSummaryEmails] = useState<PlayerSummaryEmailRecord[]>([]);
  const [selectedAddPlayerId, setSelectedAddPlayerId] = useState<number>(0);
  const [selectedAddUserId, setSelectedAddUserId] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'player' | 'admin'>('player');
  const [playerId, setPlayerId] = useState<number>(0);
  const [mode, setMode] = useState<'invite' | 'password'>('invite');
  const [password, setPassword] = useState('');

  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, iRes, mRes, sRes] = await Promise.all([
        apiFetch<AdminUserAccount[]>('/api/admin/users'),
        apiFetch<InviteEmailRecord[]>('/api/admin/invites'),
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
      setInvites(iRes);
      setMembers(mRes);
      setSummaryEmails(sRes);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar acessos.');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

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
        body: JSON.stringify({ memberRole: nextRole }),
      });
      setSuccess(
        nextRole === 'admin'
          ? `${m.playerNickname || m.userName || 'Participante'} agora é Administrador desta pelada (receberá notificações e poderá votar).`
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

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiFetch<{ invite: InviteEmailRecord | null }>('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          name,
          email,
          role,
          playerId: playerId || null,
          groupId: groupId ?? null,
          sendInvite: mode === 'invite',
          password: mode === 'password' ? password : '',
        }),
      });
      setName('');
      setEmail('');
      setPassword('');
      setPlayerId(0);
      setSuccess(
        res.invite
          ? `Convite gerado para ${res.invite.toEmail}. Copie o link ou envie pelo seu cliente de e-mail abaixo.`
          : 'Login e senha criados com sucesso!'
      );
      await loadData();
      onMembersChanged?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao criar usuário.');
    } finally {
      setSaving(false);
    }
  }

  async function handleResendForPlayer(p: Player) {
    if (!p.email) {
      setError(`O jogador ${p.nickname} não possui e-mail cadastrado na ficha.`);
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiFetch<{ invite: InviteEmailRecord }>(`/api/admin/players/${p.id}/invite`, {
        method: 'POST',
        body: JSON.stringify({ email: p.email }),
      });
      setSuccess(`Novo e-mail de registro gerado para ${res.invite.toEmail}.`);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar convite.');
    } finally {
      setSaving(false);
    }
  }

  function extractToken(link: string): string | null {
    try {
      const url = new URL(link);
      return url.searchParams.get('convite');
    } catch {
      return null;
    }
  }

  async function copyLink(inv: InviteEmailRecord) {
    try {
      await navigator.clipboard.writeText(inv.inviteLink);
      setCopiedId(inv.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setError('Não foi possível copiar automaticamente. Selecione o link manualmente.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-5">
        <h2 className="font-display text-3xl font-extrabold text-slate-900">
          {groupName ? `Membros & Acessos · ${groupName}` : 'Acessos, Senhas & Convites por E-mail'}
        </h2>
        <p className="text-sm text-slate-500">
          Gerencie quem participa desta pelada fixa, crie logins para jogadores e envie links de
          convite por e-mail.
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

          <form onSubmit={handleAddMember} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-5">
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
                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 truncate">
                        {m.playerNickname || m.userName || 'Participante'}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {m.memberRole === 'admin'
                          ? 'Admin da Pelada'
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
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleCreateAccount}
          className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 space-y-4"
        >
          <div className="flex items-center gap-2 text-base font-bold text-slate-900">
            <UserPlus className="h-4 w-4 text-emerald-600" />
            Criar Login / Enviar Convite
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
              Método de Ativação
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode('invite')}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold cursor-pointer ${
                  mode === 'invite'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                    : 'border-slate-200 text-slate-600'
                }`}
              >
                Enviar E-mail de Convite
              </button>
              <button
                type="button"
                onClick={() => setMode('password')}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold cursor-pointer ${
                  mode === 'password'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                    : 'border-slate-200 text-slate-600'
                }`}
              >
                Definir Senha Direta
              </button>
            </div>
          </div>

          {mode === 'password' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Senha (mín. 6 caracteres) *
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
          >
            <Send className="h-4 w-4" />
            {saving
              ? 'Processando...'
              : mode === 'invite'
                ? 'Gerar E-mail de Registro'
                : 'Criar Login e Senha'}
          </button>
        </form>

        <div className="lg:col-span-7 space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Mail className="h-4 w-4 text-emerald-600" />
                E-mails de Convite Enviados ({invites.length})
              </h3>
            </div>
            {loading ? (
              <div className="p-6 text-center text-xs text-slate-500">Carregando convites...</div>
            ) : invites.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                Nenhum e-mail de convite gerado ainda.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[340px] overflow-y-auto">
                {invites.map((inv) => {
                  const token = extractToken(inv.inviteLink);
                  const mailtoHref = `mailto:${encodeURIComponent(inv.toEmail)}?subject=${encodeURIComponent(inv.subject)}&body=${encodeURIComponent(inv.bodyText)}`;
                  return (
                    <div key={inv.id} className="p-4 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-bold text-slate-900">{inv.toEmail}</p>
                          <p className="text-[11px] text-slate-500">{inv.subject}</p>
                        </div>
                        <span className="text-[11px] font-mono tabular-nums text-slate-400">
                          {new Date(inv.createdAt).toLocaleDateString('pt-BR')}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => copyLink(inv)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                        >
                          {copiedId === inv.id ? (
                            <>
                              <Check className="h-3.5 w-3.5 text-emerald-600" /> Copiado
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" /> Copiar Link
                            </>
                          )}
                        </button>
                        <a
                          href={mailtoHref}
                          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <ExternalLink className="h-3.5 w-3.5" /> Abrir no E-mail
                        </a>
                        {token && (
                          <button
                            type="button"
                            onClick={() => onTestInviteLink(token)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 cursor-pointer"
                          >
                            Testar Tela de Registro
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-slate-700" />
                Contas Cadastradas ({users.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Usuário</th>
                    <th className="px-4 py-2.5 font-semibold">Perfil</th>
                    <th className="px-4 py-2.5 font-semibold">Senha / Convite</th>
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
                          {u.role === 'admin' ? 'Administrador' : 'Jogador'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {u.hasPassword ? 'Senha definida' : 'Google / Sem senha'}
                        {u.hasPendingInvite ? ' · Convite pendente' : ''}
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-700">
                        {u.player ? u.player.nickname : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {players.some((p) => !p.userId && p.email) && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h4 className="text-xs font-bold text-slate-900 mb-2">
                Jogadores com e-mail sem convite enviado
              </h4>
              <div className="flex flex-wrap gap-2">
                {players
                  .filter((p) => !p.userId && p.email)
                  .map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      disabled={saving}
                      onClick={() => handleResendForPlayer(p)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 cursor-pointer"
                    >
                      <Mail className="h-3.5 w-3.5 text-emerald-600" />
                      Convidar {p.nickname}
                    </button>
                  ))}
              </div>
            </div>
          )}

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
      </div>
    </div>
  );
}
