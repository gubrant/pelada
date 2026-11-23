import { useCallback, useEffect, useState } from 'react';
import {
  Calendar,
  Clock,
  Edit3,
  Infinity as InfinityIcon,
  KeyRound,
  Mail,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  type AdminTitle,
  type AdminUserAccount,
  FUTSAL_POSITIONS,
  PLAYER_CATEGORIES,
  type PeladaGroupMember,
  type Player,
  type PlayerCategory,
  type PlayerSummaryEmailRecord,
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

function toDateInputValue(isoOrDate?: string | null): string {
  if (!isoOrDate) return '';
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export function AdminAccessView({
  groupId,
  groupName,
  isGlobalAdmin = false,
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

  // Pelada-scoped player access creation form (available to group creator & group admins)
  const [createMode, setCreateMode] = useState<'new' | 'existing'>('new');
  const [createPlayerId, setCreatePlayerId] = useState<number>(0);
  const [createName, setCreateName] = useState('');
  const [createNickname, setCreateNickname] = useState('');
  const [createPosition, setCreatePosition] = useState<string>('Ala Direito');
  const [createLogin, setCreateLogin] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createCategory, setCreateCategory] = useState<PlayerCategory>('mensalista');
  const [createRole, setCreateRole] = useState<'member' | 'admin'>('member');
  const [createHasExpiry, setCreateHasExpiry] = useState(false);
  const [createExpiresDate, setCreateExpiresDate] = useState(() => {
    const dt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    return dt.toISOString().slice(0, 10);
  });

  // Edit existing member access/validity modal
  const [editingMember, setEditingMember] = useState<PeladaGroupMember | null>(null);
  const [editName, setEditName] = useState('');
  const [editNickname, setEditNickname] = useState('');
  const [editLogin, setEditLogin] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editCategory, setEditCategory] = useState<PlayerCategory>('mensalista');
  const [editRole, setEditRole] = useState<'member' | 'admin'>('member');
  const [editHasExpiry, setEditHasExpiry] = useState(false);
  const [editExpiresDate, setEditExpiresDate] = useState('');

  // Global admin account form
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

  // Combined pool of linkable players for this pelada
  const linkablePlayers = Array.from(
    new Map<number, Player>([...players, ...allPlayers].map((p) => [p.id, p])).values()
  ).sort((a, b) => a.nickname.localeCompare(b.nickname, 'pt-BR'));

  async function handleCreateMemberAccess(e: React.FormEvent) {
    e.preventDefault();
    if (!groupId) return;
    setError(null);
    setSuccess(null);

    const normalizedLogin = createLogin.trim().toLowerCase();
    if (!normalizedLogin || normalizedLogin.length < 3 || /\s/.test(normalizedLogin)) {
      setError('Informe um login válido (mínimo 3 caracteres, sem espaços).');
      return;
    }
    if (createPassword.length < 6) {
      setError('A senha deve ter no mínimo 6 dígitos.');
      return;
    }
    if (createMode === 'existing' && !createPlayerId) {
      setError('Selecione um jogador já cadastrado ou altere para "Novo jogador".');
      return;
    }
    if (createMode === 'new' && !createName.trim()) {
      setError('Informe o nome do jogador.');
      return;
    }
    if (createHasExpiry && !createExpiresDate) {
      setError('Selecione a data de encerramento do acesso.');
      return;
    }

    setSaving(true);
    try {
      await apiFetch(`/api/groups/${groupId}/members/create-access`, {
        method: 'POST',
        body: JSON.stringify({
          playerId: createMode === 'existing' ? createPlayerId : null,
          name: createName.trim(),
          nickname: createNickname.trim() || undefined,
          position: createPosition,
          login: normalizedLogin,
          password: createPassword,
          playerCategory: createCategory,
          memberRole: createRole,
          accessExpiresAt: createHasExpiry ? createExpiresDate : null,
        }),
      });
      setCreatePlayerId(0);
      setCreateName('');
      setCreateNickname('');
      setCreateLogin('');
      setCreatePassword('');
      setCreateHasExpiry(false);
      setSuccess(
        `Acesso criado com sucesso! Login "${normalizedLogin}" liberado para ${
          createHasExpiry ? `até ${new Date(`${createExpiresDate}T12:00:00`).toLocaleDateString('pt-BR')}` : 'acesso sem validade'
        }.`
      );
      await loadData();
      onMembersChanged?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao criar acesso do jogador.');
    } finally {
      setSaving(false);
    }
  }

  function openEditAccessModal(m: PeladaGroupMember) {
    setError(null);
    setSuccess(null);
    setEditingMember(m);
    setEditName(m.playerName || m.userName || '');
    setEditNickname(m.playerNickname || '');
    setEditLogin(m.userEmail ?? '');
    setEditPassword('');
    setEditCategory(m.playerCategory ?? 'mensalista');
    setEditRole(m.memberRole ?? 'member');
    const expStr = toDateInputValue(m.accessExpiresAt);
    setEditHasExpiry(Boolean(expStr));
    setEditExpiresDate(
      expStr || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    );
  }

  async function handleSaveEditAccess(e: React.FormEvent) {
    e.preventDefault();
    if (!groupId || !editingMember) return;
    setError(null);
    setSuccess(null);

    const trimmedLogin = editLogin.trim().toLowerCase();
    if (trimmedLogin && (trimmedLogin.length < 3 || /\s/.test(trimmedLogin))) {
      setError('O login deve ter no mínimo 3 caracteres sem espaços.');
      return;
    }
    if (!editingMember.userId && !trimmedLogin) {
      setError('Informe um login para cadastrar o acesso deste participante.');
      return;
    }
    if (!editingMember.userHasPassword && editPassword.length < 6) {
      setError('Informe uma senha com no mínimo 6 dígitos para ativar este login.');
      return;
    }
    if (editPassword && editPassword.length < 6) {
      setError('A nova senha deve ter no mínimo 6 dígitos.');
      return;
    }
    if (editHasExpiry && !editExpiresDate) {
      setError('Informe a data limite de acesso ou selecione "Sem validade".');
      return;
    }

    setSaving(true);
    try {
      await apiFetch(`/api/groups/${groupId}/members/${editingMember.id}/access`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editName.trim() || undefined,
          nickname: editNickname.trim() || undefined,
          login: trimmedLogin || undefined,
          password: editPassword || undefined,
          playerCategory: editCategory,
          memberRole: editRole,
          accessExpiresAt: editHasExpiry ? editExpiresDate : null,
        }),
      });
      setSuccess(
        `Acesso de ${editNickname.trim() || editName.trim() || 'participante'} atualizado com sucesso!`
      );
      setEditingMember(null);
      await loadData();
      onMembersChanged?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar acesso.');
    } finally {
      setSaving(false);
    }
  }

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
          Cadastre logins simples e senhas para cada jogador acessar esta pelada fixa e defina se o
          acesso tem data para terminar ou é permanente.
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
        <form
          onSubmit={handleCreateMemberAccess}
          className="rounded-xl border border-slate-200 bg-white p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-base font-bold text-slate-900">
                <KeyRound className="h-4 w-4 text-emerald-600" />
                Cadastrar Login e Senha para Jogador nesta Pelada
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Cadastro simples de acesso exclusivo para esta pelada fixa, com opção de prazo de
                encerramento ou acesso sem validade.
              </p>
            </div>

            <div className="inline-flex rounded-lg bg-slate-100 p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setCreateMode('new');
                  setCreatePlayerId(0);
                }}
                className={`px-3 py-1.5 rounded-md cursor-pointer ${
                  createMode === 'new' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Novo Jogador
              </button>
              <button
                type="button"
                onClick={() => setCreateMode('existing')}
                className={`px-3 py-1.5 rounded-md cursor-pointer ${
                  createMode === 'existing' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Jogador já cadastrado
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-6 gap-3.5">
            {createMode === 'existing' ? (
              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Selecionar Jogador *
                </label>
                <select
                  value={createPlayerId}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    setCreatePlayerId(id);
                    const found = linkablePlayers.find((p) => p.id === id);
                    if (found) {
                      setCreateName(found.name);
                      setCreateNickname(found.nickname);
                      if (found.email) setCreateLogin(found.email);
                    }
                  }}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  <option value={0}>Escolha um jogador...</option>
                  {linkablePlayers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nickname} ({p.name})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nome do Jogador *
                  </label>
                  <input
                    required
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder="Ex: João Silva"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Apelido na Quadra
                  </label>
                  <input
                    value={createNickname}
                    onChange={(e) => setCreateNickname(e.target.value)}
                    placeholder="Ex: Joãozinho"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Posição Principal
                  </label>
                  <select
                    value={createPosition}
                    onChange={(e) => setCreatePosition(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                  >
                    {FUTSAL_POSITIONS.map((pos) => (
                      <option key={pos} value={pos}>
                        {pos}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <div className={createMode === 'existing' ? 'sm:col-span-3' : 'sm:col-span-2'}>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Login de Acesso (usuário ou e-mail) *
              </label>
              <input
                type="text"
                required
                autoCapitalize="none"
                autoCorrect="off"
                value={createLogin}
                onChange={(e) => setCreateLogin(e.target.value)}
                placeholder="Ex: joao.quarta ou joao@email.com"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Senha (mín. 6 dígitos) *
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
                placeholder="Mínimo 6 dígitos"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="sm:col-span-1">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Categoria</label>
              <select
                value={createCategory}
                onChange={(e) => setCreateCategory(e.target.value as PlayerCategory)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                {PLAYER_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.value === 'eventual' ? 'Eventual' : c.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-1">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Perfil</label>
              <select
                value={createRole}
                onChange={(e) => setCreateRole(e.target.value as 'member' | 'admin')}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                <option value="member">Peladeiro</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <span className="font-semibold text-slate-700">Validade do Acesso:</span>
              <label className="inline-flex items-center gap-1.5 cursor-pointer font-medium text-slate-800">
                <input
                  type="radio"
                  name="createAccessValidity"
                  checked={!createHasExpiry}
                  onChange={() => setCreateHasExpiry(false)}
                  className="accent-emerald-600"
                />
                Sem validade (permanente)
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer font-medium text-slate-800">
                <input
                  type="radio"
                  name="createAccessValidity"
                  checked={createHasExpiry}
                  onChange={() => setCreateHasExpiry(true)}
                  className="accent-emerald-600"
                />
                Definir data limite
              </label>
              {createHasExpiry && (
                <input
                  type="date"
                  required
                  value={createExpiresDate}
                  onChange={(e) => setCreateExpiresDate(e.target.value)}
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs"
                />
              )}
            </div>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
            >
              <UserPlus className="h-4 w-4" />
              {saving ? 'Salvando...' : 'Criar Acesso na Pelada'}
            </button>
          </div>
        </form>
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
                Vincular Peladeiro Existente (sem criar nova senha)
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
                className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
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
                const isExpired = expDate != null && new Date() > expDate;
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
                          {m.userEmail ? ` · Login: ${m.userEmail}` : ' · Sem login'}
                        </p>
                        {expDate ? (
                          <p
                            className={`text-[10px] font-medium flex items-center gap-1 mt-0.5 ${
                              isExpired ? 'text-red-600' : 'text-amber-700'
                            }`}
                          >
                            <Clock className="h-3 w-3 shrink-0" />
                            {isExpired
                              ? `Expirado em ${expDate.toLocaleDateString('pt-BR')}`
                              : `Acesso até ${expDate.toLocaleDateString('pt-BR')}`}
                            {m.summaryEmailSentAt ? ' · Resumo enviado' : ''}
                          </p>
                        ) : (
                          <p className="text-[10px] font-medium text-emerald-700 flex items-center gap-1 mt-0.5">
                            <InfinityIcon className="h-3 w-3 shrink-0" />
                            Sem validade (permanente)
                            {m.userHasPassword ? ' · Senha ativa' : ''}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {m.canEditCredentials !== false && (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => openEditAccessModal(m)}
                            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                            title="Alterar login, senha ou prazo de validade"
                          >
                            <Edit3 className="h-3 w-3" />
                            Acesso
                          </button>
                        )}
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
                            Resumo
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

      {isGlobalAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={handleCreateAccount}
            className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 space-y-4"
          >
            <div className="flex items-center gap-2 text-base font-bold text-slate-900">
              <UserPlus className="h-4 w-4 text-emerald-600" />
              Criar Conta Global (Sistema)
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
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
            >
              <KeyRound className="h-4 w-4" />
              {saving ? 'Processando...' : 'Criar Conta Global'}
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
        </div>
      )}

      {editingMember && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 overflow-y-auto"
          onClick={() => setEditingMember(null)}
        >
          <div
            className="w-full max-w-lg rounded-xl bg-white border border-slate-200 shadow-xl my-6 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50">
              <div>
                <h3 className="font-display text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-emerald-600" />
                  Editar Acesso · {editingMember.playerNickname || editingMember.userName}
                </h3>
                <p className="text-xs text-slate-500">
                  Altere login, senha, categoria ou defina o prazo de encerramento do acesso.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingMember(null)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditAccess} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nome</label>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Apelido</label>
                  <input
                    value={editNickname}
                    onChange={(e) => setEditNickname(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Login (usuário ou e-mail) *
                  </label>
                  <input
                    type="text"
                    required
                    autoCapitalize="none"
                    autoCorrect="off"
                    value={editLogin}
                    onChange={(e) => setEditLogin(e.target.value)}
                    placeholder="Ex: joao.quarta"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {editingMember.userHasPassword
                      ? 'Nova senha (deixe em branco p/ manter)'
                      : 'Senha (mín. 6 dígitos) *'}
                  </label>
                  <input
                    type="password"
                    minLength={editPassword ? 6 : undefined}
                    required={!editingMember.userHasPassword}
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder={
                      editingMember.userHasPassword ? 'Manter senha atual' : 'Mínimo 6 dígitos'
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Categoria
                  </label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value as PlayerCategory)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                  >
                    {PLAYER_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.value === 'eventual' ? 'Eventual' : c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Perfil na Pelada
                  </label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as 'member' | 'admin')}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                  >
                    <option value="member">Peladeiro</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
                <span className="block text-xs font-semibold text-slate-700">
                  Prazo de Validade do Acesso
                </span>
                <div className="flex flex-wrap items-center gap-4 text-xs">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer font-medium text-slate-800">
                    <input
                      type="radio"
                      name="editAccessValidity"
                      checked={!editHasExpiry}
                      onChange={() => setEditHasExpiry(false)}
                      className="accent-emerald-600"
                    />
                    Sem validade (acesso permanente)
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer font-medium text-slate-800">
                    <input
                      type="radio"
                      name="editAccessValidity"
                      checked={editHasExpiry}
                      onChange={() => setEditHasExpiry(true)}
                      className="accent-emerald-600"
                    />
                    Definir data de término
                  </label>
                </div>

                {editHasExpiry && (
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      O acesso encerrará ao final do dia:
                    </label>
                    <input
                      type="date"
                      required
                      value={editExpiresDate}
                      onChange={(e) => setEditExpiresDate(e.target.value)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingMember(null)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                >
                  {saving ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
