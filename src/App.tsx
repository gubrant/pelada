import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  Edit3,
  KeyRound,
  LogIn,
  LogOut,
  Mail,
  MapPin,
  Plus,
  Search,
  Sliders,
  Trophy,
  UserCheck,
  UserPlus,
  Users,
  Vote,
  Wallet,
} from 'lucide-react';
import { AdminAccessView } from './components/AdminAccessView';
import { AuthModal, type AuthSuccessPayload } from './components/AuthView';
import { CriteriaConfigModal } from './components/CriteriaConfigModal';
import { ImageCaptureField } from './components/ImageCaptureField';
import { InitialRatingVoteModal } from './components/InitialRatingVoteModal';
import { JoinPeladaRequestModal } from './components/JoinPeladaRequestModal';
import { JoinRequestsModal } from './components/JoinRequestsModal';
import { MyProfileModal } from './components/MyProfileModal';
import { PeladaFinanceView } from './components/PeladaFinanceView';
import { PeladaWorkspace } from './components/PeladaWorkspace';
import { PlayerAvatar } from './components/PlayerAvatar';
import { PlayerDetailModal } from './components/PlayerDetailModal';
import { PlayerFormModal } from './components/PlayerFormModal';
import { SeasonsAndStatsView } from './components/SeasonsAndStatsView';
import { SummaryEmailsModal } from './components/SummaryEmailsModal';
import { apiFetch, setInMemoryAuthToken } from './lib/api';
import {
  type AdminNotification,
  type AuthUser,
  DEFAULT_GROUP_CRITERIA,
  FUTSAL_POSITIONS,
  PLAYER_CATEGORIES,
  type PeladaGroupSummary,
  type PeladaSummary,
  type Player,
  type PlayerCategory,
  type PlayerSummaryEmailRecord,
  type Season,
} from './types/futsal';

type NavSection = 'peladas' | 'players' | 'seasons' | 'finance' | 'access';

const WEEKDAYS = [
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
  'Domingo',
];

function formatCurrencyBrl(value?: number | null): string {
  const num = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(num);
}

export default function App() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [myPlayer, setMyPlayer] = useState<Player | null>(null);

  // Top-level fixed peladas (groups) vs selected group & screen inside it
  const [groups, setGroups] = useState<PeladaGroupSummary[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<number | null>(null);
  const [section, setSection] = useState<NavSection>('peladas');

  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const [peladas, setPeladas] = useState<PeladaSummary[]>([]);
  const [activePeladaId, setActivePeladaId] = useState<number | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [allSystemPlayers, setAllSystemPlayers] = useState<Player[]>([]);

  const [loginModalState, setLoginModalState] = useState<{
    targetGroup: PeladaGroupSummary | null;
  } | null>(null);

  // New Fixed Pelada (Group) form
  const [showNewGroupForm, setShowNewGroupForm] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupLocation, setGroupLocation] = useState('Quadra Central');
  const [groupFullAddress, setGroupFullAddress] = useState('');
  const [groupAvulsoFee, setGroupAvulsoFee] = useState('0');
  const [groupWeekday, setGroupWeekday] = useState('Quarta-feira');
  const [groupStartTime, setGroupStartTime] = useState('20:00');
  const [groupEndTime, setGroupEndTime] = useState('22:00');
  const [groupPerTeam, setGroupPerTeam] = useState(5);
  const [groupTeamsCount, setGroupTeamsCount] = useState('2');
  const [groupDescription, setGroupDescription] = useState('');
  const [groupPhotoUrl, setGroupPhotoUrl] = useState<string | null>(null);
  const [groupCreateSeason, setGroupCreateSeason] = useState(true);
  const [groupInitialSeasonName, setGroupInitialSeasonName] = useState(
    `Temporada ${new Date().getFullYear()}`
  );
  const [groupSelectedPlayerIds, setGroupSelectedPlayerIds] = useState<number[]>([]);

  // Inline edit of Fixed Pelada info (Level 2 header)
  const [editingGroupInfo, setEditingGroupInfo] = useState(false);
  const [editGroupLocation, setEditGroupLocation] = useState('');
  const [editGroupFullAddress, setEditGroupFullAddress] = useState('');
  const [editGroupAvulsoFee, setEditGroupAvulsoFee] = useState('0');
  const [editGroupStartTime, setEditGroupStartTime] = useState('20:00');
  const [editGroupEndTime, setEditGroupEndTime] = useState('22:00');
  const [savingGroupInfo, setSavingGroupInfo] = useState(false);

  // New Encontro (Pelada session) form inside a Fixed Pelada
  const [showNewPeladaForm, setShowNewPeladaForm] = useState(false);
  const [peladaTitle, setPeladaTitle] = useState('');
  const [peladaLocation, setPeladaLocation] = useState('Quadra Central');
  const [peladaDate, setPeladaDate] = useState(new Date().toISOString().slice(0, 10));
  const [peladaTime, setPeladaTime] = useState('20:00');
  const [peladaEndTime, setPeladaEndTime] = useState('22:00');
  const [peladaPerTeam, setPeladaPerTeam] = useState(5);
  const [peladaTeamsCount, setPeladaTeamsCount] = useState('2');

  const [showNewSeasonInline, setShowNewSeasonInline] = useState(false);
  const [inlineSeasonName, setInlineSeasonName] = useState('');

  // Add existing player into current group
  const [addExistingPlayerId, setAddExistingPlayerId] = useState<number>(0);

  const [editingPlayer, setEditingPlayer] = useState<Player | null | 'new'>(null);
  const [detailPlayerId, setDetailPlayerId] = useState<number | null>(null);
  const [showMyProfile, setShowMyProfile] = useState(false);

  // Criteria configuration, admin notifications & initial rating voting
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [showNotificationsPanel, setShowNotificationsPanel] = useState(false);
  const [showCriteriaModal, setShowCriteriaModal] = useState(false);
  const [votingTarget, setVotingTarget] = useState<{
    playerId: number;
    groupId?: number | null;
  } | null>(null);

  // Join requests & eventual post-pelada summary emails
  const [joinRequestTarget, setJoinRequestTarget] = useState<PeladaGroupSummary | null>(null);
  const [joinRequestsModalTarget, setJoinRequestsModalTarget] = useState<{
    groupId: number;
    groupName: string;
  } | null>(null);
  const [summaryEmails, setSummaryEmails] = useState<PlayerSummaryEmailRecord[]>([]);
  const [showSummaryEmailsModal, setShowSummaryEmailsModal] = useState(false);

  // Filters
  const [playerSearch, setPlayerSearch] = useState('');
  const [positionFilter, setPositionFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | PlayerCategory>('all');

  const [loadingGroups, setLoadingGroups] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [appError, setAppError] = useState<string | null>(null);



  const loadPublicGroups = useCallback(async () => {
    const list = await apiFetch<PeladaGroupSummary[]>('/api/public/groups');
    setGroups(list);
    return list;
  }, []);

  const loadGroups = useCallback(async () => {
    const list = await apiFetch<PeladaGroupSummary[]>('/api/groups');
    setGroups(list);
    return list;
  }, []);

  const loadAllSystemPlayers = useCallback(async () => {
    const list = await apiFetch<Player[]>('/api/players');
    setAllSystemPlayers(list);
    return list;
  }, []);

  const loadGroupSeasons = useCallback(async (groupId: number) => {
    const list = await apiFetch<Season[]>(`/api/seasons?groupId=${groupId}`);
    setSeasons(list);
    setSelectedSeasonId((prev) => {
      if (prev && list.some((s) => s.id === prev)) return prev;
      const open = list.find((s) => s.status === 'open');
      return open?.id ?? list[0]?.id ?? null;
    });
    return list;
  }, []);

  const loadGroupPlayers = useCallback(async (groupId: number) => {
    const list = await apiFetch<Player[]>(`/api/players?groupId=${groupId}`);
    setPlayers(list);
    return list;
  }, []);

  const loadPeladas = useCallback(async (groupId: number, seasonId: number | null) => {
    const params = new URLSearchParams();
    params.set('groupId', String(groupId));
    if (seasonId) params.set('seasonId', String(seasonId));
    const list = await apiFetch<PeladaSummary[]>(`/api/peladas?${params.toString()}`);
    setPeladas(list);
    return list;
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      const list = await apiFetch<AdminNotification[]>('/api/notifications');
      setNotifications(list);
      return list;
    } catch {
      return [];
    }
  }, []);

  const loadSummaryEmails = useCallback(async () => {
    try {
      const list = await apiFetch<PlayerSummaryEmailRecord[]>('/api/my-summary-emails');
      setSummaryEmails(list);
      return list;
    } catch {
      return [];
    }
  }, []);

  // Load public fixed peladas on initial screen or user's authorized peladas after login
  useEffect(() => {
    setLoadingGroups(true);
    setAppError(null);
    if (!authUser) {
      loadPublicGroups()
        .catch((err: unknown) => {
          setAppError(
            err instanceof Error ? err.message : 'Erro ao carregar peladas fixas cadastradas.'
          );
        })
        .finally(() => setLoadingGroups(false));
      return;
    }

    Promise.all([loadGroups(), loadAllSystemPlayers(), loadNotifications(), loadSummaryEmails()])
      .catch((err: unknown) => {
        setAppError(err instanceof Error ? err.message : 'Erro ao carregar peladas fixas.');
      })
      .finally(() => setLoadingGroups(false));
  }, [
    authUser,
    loadPublicGroups,
    loadGroups,
    loadAllSystemPlayers,
    loadNotifications,
    loadSummaryEmails,
  ]);

  // Load scoped data whenever user enters a fixed pelada
  useEffect(() => {
    if (!authUser || activeGroupId === null) {
      setSeasons([]);
      setSelectedSeasonId(null);
      setPeladas([]);
      setPlayers([]);
      setActivePeladaId(null);
      return;
    }

    const g = groups.find((item) => item.id === activeGroupId);
    if (g) {
      setPeladaLocation(g.location);
      setPeladaTime(g.startTime);
      setPeladaEndTime(g.endTime || '22:00');
      setPeladaPerTeam(g.playersPerTeam);
      setPeladaTeamsCount(String(g.defaultTeamsCount));
      setEditGroupLocation(g.location);
      setEditGroupFullAddress(g.fullAddress ?? '');
      setEditGroupAvulsoFee(String(g.avulsoFee ?? 0));
      setEditGroupStartTime(g.startTime || '20:00');
      setEditGroupEndTime(g.endTime || '22:00');
    }

    setLoadingData(true);
    setAppError(null);
    Promise.all([loadGroupSeasons(activeGroupId), loadGroupPlayers(activeGroupId)])
      .then(async ([sList]) => {
        const open = sList.find((s) => s.status === 'open');
        const targetId = open?.id ?? sList[0]?.id ?? null;
        await loadPeladas(activeGroupId, targetId);
      })
      .catch((err: unknown) => {
        setAppError(err instanceof Error ? err.message : 'Erro ao carregar dados da pelada.');
      })
      .finally(() => setLoadingData(false));
  }, [authUser, activeGroupId, loadGroupSeasons, loadGroupPlayers, loadPeladas]);

  useEffect(() => {
    if (authUser && activeGroupId !== null && selectedSeasonId !== null) {
      loadPeladas(activeGroupId, selectedSeasonId).catch(() => {});
    }
  }, [authUser, activeGroupId, selectedSeasonId, loadPeladas]);

  function openFixedPelada(groupId: number, targetSection: NavSection = 'peladas') {
    setActiveGroupId(groupId);
    setSection(targetSection);
    setActivePeladaId(null);
    setShowNewPeladaForm(false);
    setShowNewSeasonInline(false);
    setEditingGroupInfo(false);
    setAppError(null);
  }

  function backToFixedPeladasList() {
    setActiveGroupId(null);
    setActivePeladaId(null);
    setShowNewPeladaForm(false);
    setShowNewSeasonInline(false);
    setEditingGroupInfo(false);
    setAppError(null);
    if (authUser) {
      loadGroups().catch(() => {});
    } else {
      loadPublicGroups().catch(() => {});
    }
  }

  function handleAuthSuccess(payload: AuthSuccessPayload) {
    const targetGroup = loginModalState?.targetGroup ?? null;
    setInMemoryAuthToken(payload.token);
    setAuthUser(payload.user);
    setMyPlayer(payload.player);
    setLoginModalState(null);
    setAppError(null);

    if (targetGroup) {
      if (payload.groupAccess && !payload.groupAccess.allowed) {
        setAppError(
          payload.groupAccess.reason ||
            `Seu login não possui acesso ativo para "${targetGroup.name}".`
        );
      } else {
        openFixedPelada(targetGroup.id, 'peladas');
      }
    }
  }

  function handleLogout() {
    setInMemoryAuthToken(null);
    setAuthUser(null);
    setMyPlayer(null);
    setNotifications([]);
    setSummaryEmails([]);
    setShowNotificationsPanel(false);
    setShowCriteriaModal(false);
    setVotingTarget(null);
    setJoinRequestTarget(null);
    setJoinRequestsModalTarget(null);
    setShowSummaryEmailsModal(false);
    setActiveGroupId(null);
    setActivePeladaId(null);
    setEditingGroupInfo(false);
    setAppError(null);
  }

  async function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault();
    const parsedTeams = Number(groupTeamsCount);
    if (!Number.isInteger(parsedTeams) || parsedTeams < 2 || parsedTeams > 12) {
      setAppError('Informe uma quantidade padrão válida de times (entre 2 e 12).');
      return;
    }
    const parsedFee = Number(groupAvulsoFee.replace(',', '.'));
    if (groupAvulsoFee.trim() !== '' && (!Number.isFinite(parsedFee) || parsedFee < 0)) {
      setAppError('Informe um valor de avulso válido (maior ou igual a R$ 0,00).');
      return;
    }
    setAppError(null);
    try {
      const res = await apiFetch<{ group: PeladaGroupSummary }>('/api/groups', {
        method: 'POST',
        body: JSON.stringify({
          name: groupName,
          location: groupLocation,
          fullAddress: groupFullAddress.trim() || null,
          avulsoFee: Number.isFinite(parsedFee) && parsedFee >= 0 ? parsedFee : 0,
          weekday: groupWeekday,
          startTime: groupStartTime,
          endTime: groupEndTime,
          playersPerTeam: groupPerTeam,
          defaultTeamsCount: parsedTeams,
          description: groupDescription || null,
          photoUrl: groupPhotoUrl,
          createInitialSeason: groupCreateSeason,
          initialSeasonName: groupInitialSeasonName,
          memberPlayerIds: groupSelectedPlayerIds,
        }),
      });
      setGroupName('');
      setGroupFullAddress('');
      setGroupAvulsoFee('0');
      setGroupDescription('');
      setGroupPhotoUrl(null);
      setGroupSelectedPlayerIds([]);
      setShowNewGroupForm(false);
      await loadGroups();
      openFixedPelada(res.group.id, 'peladas');
    } catch (err: unknown) {
      setAppError(err instanceof Error ? err.message : 'Erro ao criar pelada fixa.');
    }
  }

  async function handleSaveGroupInfo(e: React.FormEvent) {
    e.preventDefault();
    if (activeGroupId === null) return;
    const parsedFee = Number(editGroupAvulsoFee.replace(',', '.'));
    if (editGroupAvulsoFee.trim() !== '' && (!Number.isFinite(parsedFee) || parsedFee < 0)) {
      setAppError('Informe um valor de avulso válido (maior ou igual a R$ 0,00).');
      return;
    }
    setSavingGroupInfo(true);
    setAppError(null);
    try {
      await apiFetch(`/api/groups/${activeGroupId}`, {
        method: 'PUT',
        body: JSON.stringify({
          location: editGroupLocation.trim() || 'Quadra Principal',
          fullAddress: editGroupFullAddress.trim() || null,
          avulsoFee: Number.isFinite(parsedFee) && parsedFee >= 0 ? parsedFee : 0,
          startTime: editGroupStartTime,
          endTime: editGroupEndTime,
        }),
      });
      setEditingGroupInfo(false);
      await loadGroups();
    } catch (err: unknown) {
      setAppError(err instanceof Error ? err.message : 'Erro ao atualizar informações da pelada.');
    } finally {
      setSavingGroupInfo(false);
    }
  }

  async function handleCreateQuickSeason(e: React.FormEvent) {
    e.preventDefault();
    if (!inlineSeasonName.trim() || activeGroupId === null) return;
    setAppError(null);
    try {
      const created = await apiFetch<Season>('/api/seasons', {
        method: 'POST',
        body: JSON.stringify({
          groupId: activeGroupId,
          name: inlineSeasonName.trim(),
          startDate: new Date().toISOString().slice(0, 10),
        }),
      });
      setInlineSeasonName('');
      setShowNewSeasonInline(false);
      await loadGroupSeasons(activeGroupId);
      setSelectedSeasonId(created.id);
      await loadGroups();
    } catch (err: unknown) {
      setAppError(err instanceof Error ? err.message : 'Erro ao abrir temporada.');
    }
  }

  async function handleCreatePelada(e: React.FormEvent) {
    e.preventDefault();
    if (activeGroupId === null) return;
    if (!selectedSeasonId) {
      setAppError('Abra uma temporada antes de cadastrar um encontro da pelada.');
      return;
    }
    const parsedTeamsCount = Number(peladaTeamsCount);
    if (!Number.isInteger(parsedTeamsCount) || parsedTeamsCount < 2 || parsedTeamsCount > 12) {
      setAppError('Informe uma quantidade válida de times (entre 2 e 12).');
      return;
    }
    setAppError(null);
    try {
      const res = await apiFetch<{ pelada: PeladaSummary }>('/api/peladas', {
        method: 'POST',
        body: JSON.stringify({
          groupId: activeGroupId,
          seasonId: selectedSeasonId,
          title: peladaTitle,
          location: peladaLocation,
          eventDate: peladaDate,
          startTime: peladaTime,
          endTime: peladaEndTime,
          playersPerTeam: peladaPerTeam,
          teamCount: parsedTeamsCount,
        }),
      });
      setPeladaTitle('');
      setShowNewPeladaForm(false);
      await Promise.all([loadPeladas(activeGroupId, selectedSeasonId), loadGroups()]);
      setActivePeladaId(res.pelada.id);
    } catch (err: unknown) {
      setAppError(err instanceof Error ? err.message : 'Erro ao cadastrar encontro.');
    }
  }

  async function handleAddExistingPlayerToGroup(e: React.FormEvent) {
    e.preventDefault();
    if (activeGroupId === null || !addExistingPlayerId) return;
    setAppError(null);
    try {
      await apiFetch(`/api/groups/${activeGroupId}/members`, {
        method: 'POST',
        body: JSON.stringify({ playerId: addExistingPlayerId }),
      });
      setAddExistingPlayerId(0);
      await Promise.all([loadGroupPlayers(activeGroupId), loadGroups()]);
    } catch (err: unknown) {
      setAppError(err instanceof Error ? err.message : 'Erro ao vincular jogador à pelada.');
    }
  }

  const isAdmin = authUser?.role === 'admin';
  const activeGroup = authUser ? (groups.find((g) => g.id === activeGroupId) ?? null) : null;
  const isPeladaAdmin = Boolean(authUser && (isAdmin || activeGroup?.isGroupAdmin === true));
  const hasAnyAdminGroup = Boolean(authUser && (isAdmin || groups.some((g) => g.isGroupAdmin)));
  const pendingNotifications = notifications.filter((n) => !n.voted);
  const activeGroupCriteria = (
    activeGroup?.criteriaConfig && activeGroup.criteriaConfig.length > 0
      ? activeGroup.criteriaConfig
      : DEFAULT_GROUP_CRITERIA
  ).filter((c) => c.enabled && c.weight > 0);
  const previewCriteria = (
    activeGroupCriteria.length > 0 ? activeGroupCriteria : DEFAULT_GROUP_CRITERIA
  ).slice(0, 4);
  const pendingRosterPlayers = players.filter((p) => p.initRatingStatus === 'pending_votes');
  const activeSeason = seasons.find((s) => s.id === selectedSeasonId) ?? null;

  const filteredPlayers = players.filter((p) => {
    const q = playerSearch.trim().toLowerCase();
    const matchesSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.nickname.toLowerCase().includes(q) ||
      p.position.toLowerCase().includes(q);
    const matchesPos = positionFilter === 'all' || p.position === positionFilter;
    const matchesCat = categoryFilter === 'all' || p.category === categoryFilter;
    return matchesSearch && matchesPos && matchesCat;
  });

  const availableExistingPlayers = allSystemPlayers.filter(
    (sysP) => !players.some((gp) => gp.id === sysP.id)
  );

  const sectionLabel: Record<NavSection, string> = {
    peladas: activePeladaId ? 'Controle da Quadra' : 'Jogos & Encontros',
    players: 'Elenco & Avaliações',
    seasons: 'Temporadas & Estatísticas',
    finance: 'Controle Financeiro',
    access: 'Membros & Acessos',
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-slate-900 text-slate-200 border-r border-slate-800">
        <div className="flex items-center gap-3 px-5 h-16 border-b border-slate-800">
          <img
            src="/src/assets/images/futsal_ball_emblem_1795299371507.jpg"
            alt="QuadraMestre"
            referrerPolicy="no-referrer"
            className="h-8 w-8 rounded-md object-cover border border-white/15"
          />
          <span className="font-display text-2xl font-bold tracking-wide text-white whitespace-nowrap">
            QuadraMestre
          </span>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
          {activeGroup === null ? (
            <>
              <SidebarButton
                active
                icon={<CalendarDays className="h-4 w-4" />}
                label={authUser ? 'Minhas Peladas Fixas' : 'Peladas Fixas'}
                onClick={() => setActiveGroupId(null)}
              />

              {authUser && groups.some((g) => (g.membershipStatus ?? 'member') === 'member') && (
                <div className="pt-4 mt-4 border-t border-slate-800 space-y-1">
                  <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Acesso Rápido
                  </p>
                  {groups
                    .filter((g) => (g.membershipStatus ?? 'member') === 'member')
                    .map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => openFixedPelada(g.id, 'peladas')}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer text-left"
                      >
                        <span className="truncate">{g.name}</span>
                        <ChevronRight className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                      </button>
                    ))}
                </div>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={backToFixedPeladasList}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer mb-2"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Todas as Peladas Fixas
              </button>

              <div className="px-3 py-2.5 mb-3 rounded-lg bg-slate-800/70 border border-slate-700/70">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                  Pelada Selecionada
                </p>
                <p className="text-sm font-bold text-white truncate">{activeGroup.name}</p>
                <p className="text-[11px] text-slate-400 truncate">
                  {activeGroup.weekday} · {activeGroup.startTime} às {activeGroup.endTime}
                </p>
              </div>

              <SidebarButton
                active={section === 'peladas'}
                icon={<CalendarDays className="h-4 w-4" />}
                label="Jogos & Encontros"
                onClick={() => {
                  setSection('peladas');
                  setActivePeladaId(null);
                }}
              />
              <SidebarButton
                active={section === 'players'}
                icon={<Users className="h-4 w-4" />}
                label="Elenco & Notas"
                onClick={() => {
                  setSection('players');
                  setActivePeladaId(null);
                }}
              />
              <SidebarButton
                active={section === 'seasons'}
                icon={<Trophy className="h-4 w-4" />}
                label="Temporadas & Ranking"
                onClick={() => {
                  setSection('seasons');
                  setActivePeladaId(null);
                }}
              />
              <SidebarButton
                active={section === 'finance'}
                icon={<Wallet className="h-4 w-4" />}
                label="Financeiro & PIX"
                onClick={() => {
                  setSection('finance');
                  setActivePeladaId(null);
                }}
              />
              {isPeladaAdmin && (
                <SidebarButton
                  active={section === 'access'}
                  icon={<KeyRound className="h-4 w-4" />}
                  label="Membros & Acessos"
                  onClick={() => {
                    setSection('access');
                    setActivePeladaId(null);
                  }}
                />
              )}
            </>
          )}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-3">
          {authUser ? (
            <>
              <button
                type="button"
                onClick={() => setShowMyProfile(true)}
                className="w-full flex items-center gap-2.5 rounded-lg p-2 hover:bg-slate-800 text-left transition-colors cursor-pointer"
              >
                <PlayerAvatar
                  name={myPlayer?.name ?? authUser.name}
                  photoUrl={myPlayer?.photoUrl}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-white truncate">
                    {myPlayer?.nickname ?? authUser.name}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">
                    {isAdmin ? 'Administrador' : 'Peladeiro'} · Editar ficha
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={handleLogout}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sair da conta
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setLoginModalState({ targetGroup: null })}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500 cursor-pointer"
            >
              <LogIn className="h-4 w-4" />
              Entrar com Login
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0 pb-20 lg:pb-8">
        {/* Top Bar Contract: 3 zones */}
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm min-w-0">
            <span className="font-display text-lg font-bold text-slate-900 lg:hidden whitespace-nowrap shrink-0">
              QuadraMestre
            </span>
            <button
              type="button"
              onClick={backToFixedPeladasList}
              className="text-slate-400 hover:text-slate-800 hidden lg:inline cursor-pointer whitespace-nowrap"
            >
              {authUser ? 'Minhas Peladas Fixas' : 'Peladas Fixas'}
            </button>
            {activeGroup ? (
              <>
                <span className="text-slate-300 hidden lg:inline">/</span>
                <span className="font-semibold text-emerald-700 truncate max-w-[160px] sm:max-w-[220px]">
                  {activeGroup.name}
                </span>
                <span className="text-slate-300">/</span>
                <span className="font-semibold text-slate-900 truncate">
                  {sectionLabel[section]}
                </span>
              </>
            ) : (
              <>
                <span className="text-slate-300 hidden lg:inline">/</span>
                <span className="font-semibold text-slate-900 truncate lg:hidden">
                  {authUser ? 'Minhas Peladas Fixas' : 'Peladas Fixas'}
                </span>
              </>
            )}
          </div>

          <div className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-600">
            {activeGroup && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setSection('peladas');
                    setActivePeladaId(null);
                  }}
                  className={`hover:text-slate-900 whitespace-nowrap shrink-0 cursor-pointer ${
                    section === 'peladas' ? 'text-emerald-700 underline underline-offset-4' : ''
                  }`}
                >
                  Jogos
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSection('players');
                    setActivePeladaId(null);
                  }}
                  className={`hover:text-slate-900 whitespace-nowrap shrink-0 cursor-pointer ${
                    section === 'players' ? 'text-emerald-700 underline underline-offset-4' : ''
                  }`}
                >
                  Elenco
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSection('seasons');
                    setActivePeladaId(null);
                  }}
                  className={`hover:text-slate-900 whitespace-nowrap shrink-0 cursor-pointer ${
                    section === 'seasons' ? 'text-emerald-700 underline underline-offset-4' : ''
                  }`}
                >
                  Ranking
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSection('finance');
                    setActivePeladaId(null);
                  }}
                  className={`hover:text-slate-900 whitespace-nowrap shrink-0 cursor-pointer ${
                    section === 'finance' ? 'text-emerald-700 underline underline-offset-4' : ''
                  }`}
                >
                  Financeiro
                </button>
                {isPeladaAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setSection('access');
                      setActivePeladaId(null);
                    }}
                    className={`hover:text-slate-900 whitespace-nowrap shrink-0 cursor-pointer ${
                      section === 'access' ? 'text-emerald-700 underline underline-offset-4' : ''
                    }`}
                  >
                    Membros
                  </button>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0 relative">
            {hasAnyAdminGroup && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setShowNotificationsPanel((v) => !v);
                    loadNotifications();
                  }}
                  className="relative inline-flex items-center justify-center h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
                  aria-label="Notificações para votar em novos jogadores"
                  title="Notificações de novos cadastros para avaliação"
                >
                  <Bell className="h-4 w-4" />
                  {pendingNotifications.length > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-slate-950 font-mono text-[10px] font-bold flex items-center justify-center">
                      {pendingNotifications.length}
                    </span>
                  )}
                </button>

                {showNotificationsPanel && (
                  <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-slate-200 bg-white shadow-xl z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                      <div>
                        <p className="text-xs font-bold text-slate-900">
                          Notificações da Pelada
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {pendingNotifications.length > 0
                            ? `${pendingNotifications.length} pendência(s) aguardando sua ação`
                            : 'Todas as solicitações e votações estão em dia'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowNotificationsPanel(false)}
                        className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                      >
                        Fechar
                      </button>
                    </div>

                    <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                      {notifications.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-500">
                          Nenhuma notificação pendente ainda.
                        </div>
                      ) : (
                        notifications.map((n) => {
                          const isJoinReq = n.type === 'join_request';
                          return (
                            <div key={n.id} className="p-3.5 space-y-2 hover:bg-slate-50">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <PlayerAvatar
                                    name={n.playerName}
                                    photoUrl={n.playerPhotoUrl}
                                    size="sm"
                                  />
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold text-slate-900 truncate">
                                      {n.playerNickname} · {n.playerPosition}
                                    </p>
                                    <p className="text-[11px] text-slate-500 truncate">
                                      {n.groupName || 'Elenco geral'}
                                      {!isJoinReq &&
                                        ` · ${n.playerInitVotesCount}/${n.totalAdmins} votos`}
                                    </p>
                                  </div>
                                </div>
                                <span
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded border shrink-0 ${
                                    n.voted
                                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                      : 'border-amber-200 bg-amber-50 text-amber-800'
                                  }`}
                                >
                                  {isJoinReq
                                    ? n.voted
                                      ? 'Respondida'
                                      : 'Solicitação'
                                    : n.voted
                                      ? 'Votado'
                                      : 'Votar'}
                                </span>
                              </div>

                              <p className="text-[11px] text-slate-600 leading-snug">{n.message}</p>

                              <div className="flex items-center justify-between pt-1">
                                <span className="font-mono text-[11px] text-slate-500">
                                  {isJoinReq ? (
                                    <>
                                      Autoavaliação: <strong>{n.playerInitOverall.toFixed(2)}</strong>
                                    </>
                                  ) : (
                                    <>
                                      Média atual: <strong>{n.playerInitOverall.toFixed(2)}</strong>
                                    </>
                                  )}
                                </span>
                                {isJoinReq ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setShowNotificationsPanel(false);
                                      apiFetch(`/api/notifications/${n.id}/read`, {
                                        method: 'POST',
                                      }).catch(() => {});
                                      if (n.groupId) {
                                        setJoinRequestsModalTarget({
                                          groupId: n.groupId,
                                          groupName: n.groupName || 'Pelada Fixa',
                                        });
                                      }
                                    }}
                                    className="inline-flex items-center gap-1 rounded-md bg-amber-500 px-2.5 py-1 text-[11px] font-semibold text-slate-950 hover:bg-amber-400 cursor-pointer"
                                  >
                                    <UserCheck className="h-3 w-3" />
                                    Analisar Solicitação
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setShowNotificationsPanel(false);
                                      apiFetch(`/api/notifications/${n.id}/read`, {
                                        method: 'POST',
                                      }).catch(() => {});
                                      setVotingTarget({ playerId: n.playerId, groupId: n.groupId });
                                    }}
                                    className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 cursor-pointer"
                                  >
                                    <Vote className="h-3 w-3" />
                                    {n.voted ? 'Editar Voto' : 'Votar Critérios'}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {!authUser ? (
              <button
                type="button"
                onClick={() => setLoginModalState({ targetGroup: null })}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogIn className="h-4 w-4" />
                Entrar / Login
              </button>
            ) : activeGroup === null ? (
              isAdmin ? (
                <button
                  type="button"
                  onClick={() => setShowNewGroupForm((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  Nova Pelada Fixa
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowMyProfile(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <UserCheck className="h-4 w-4" />
                  Minha Ficha
                </button>
              )
            ) : isPeladaAdmin ? (
              <button
                type="button"
                onClick={() => {
                  if (section === 'players') {
                    setEditingPlayer('new');
                  } else {
                    setSection('peladas');
                    setActivePeladaId(null);
                    setShowNewPeladaForm(true);
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                {section === 'players' ? 'Novo Jogador' : 'Novo Encontro'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowMyProfile(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <UserCheck className="h-4 w-4" />
                Minha Ficha
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 space-y-6">
          {authUser && !myPlayer?.profileCompleted && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs sm:text-sm text-amber-900">
                Complete sua ficha de peladeiro com apelido, foto de perfil, idade, posição e pé
                dominante para entrar nos sorteios.
              </p>
              <button
                type="button"
                onClick={() => setShowMyProfile(true)}
                className="rounded-lg bg-amber-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 whitespace-nowrap cursor-pointer"
              >
                Completar Cadastro
              </button>
            </div>
          )}

          {appError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {appError}
            </div>
          )}

          {/* LEVEL 1: ENTRY SCREEN — FIXED PELADAS */}
          {activeGroup === null ? (
            <div className="space-y-6">
              {/* Hero Header for Fixed Peladas */}
              <div className="relative rounded-xl overflow-hidden bg-slate-900 text-white border border-slate-800">
                <img
                  src="/src/assets/images/futsal_court_hero_1795299371438.jpg"
                  alt="Quadra de futsal"
                  referrerPolicy="no-referrer"
                  className="absolute inset-0 h-full w-full object-cover opacity-45"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/75 to-slate-950/40" />

                <div className="relative z-10 p-6 sm:p-8 flex flex-wrap items-end justify-between gap-6">
                  <div className="max-w-xl space-y-2">
                    <p className="text-xs font-semibold text-emerald-400">
                      {authUser
                        ? `Olá, ${myPlayer?.nickname ?? authUser.name} · ${
                            groups.filter((g) => (g.membershipStatus ?? 'member') === 'member')
                              .length
                          } pelada(s) ativa(s) · ${groups.length} no total`
                        : `${groups.length} pelada(s) fixa(s) cadastrada(s) · Escolha a sua para entrar`}
                    </p>
                    <h1 className="font-display text-4xl sm:text-5xl font-extrabold leading-none text-balance">
                      {authUser ? 'Minhas Peladas Fixas' : 'Peladas Fixas Cadastradas'}
                    </h1>
                    <p className="text-sm text-slate-300">
                      {authUser
                        ? 'Entre nas suas peladas autorizadas ou solicite autorização aos administradores para participar como mensalista, avulso ou peladeiro eventual.'
                        : 'Clique na pelada fixa desejada e entre com o login e senha cadastrados pelo criador ou administrador.'}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    {!authUser && (
                      <button
                        type="button"
                        onClick={() => setLoginModalState({ targetGroup: null })}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500 cursor-pointer"
                      >
                        <LogIn className="h-4 w-4" />
                        Entrar com Login
                      </button>
                    )}

                    {authUser && summaryEmails.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowSummaryEmailsModal(true)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-4 py-2.5 text-xs font-semibold text-white hover:bg-white/20 cursor-pointer"
                      >
                        <Mail className="h-4 w-4 text-emerald-300" />
                        E-mails Pós-Pelada ({summaryEmails.length})
                      </button>
                    )}

                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => setShowNewGroupForm((v) => !v)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500 cursor-pointer"
                      >
                        <Plus className="h-4 w-4" />
                        {showNewGroupForm ? 'Fechar Formulário' : 'Cadastrar Pelada Fixa'}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {showNewGroupForm && isAdmin && (
                <form
                  onSubmit={handleCreateGroup}
                  className="rounded-xl border border-slate-200 bg-white p-6 space-y-5"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="font-display text-2xl font-bold text-slate-900">
                        Cadastrar Nova Pelada Fixa
                      </h3>
                      <p className="text-xs text-slate-500">
                        Defina a pelada semanal/recorrente com dia, horário, quadra e participantes.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowNewGroupForm(false)}
                      className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    <img
                      src={
                        groupPhotoUrl ||
                        '/src/assets/images/futsal_ball_emblem_1795299371507.jpg'
                      }
                      alt="Escudo da pelada"
                      className="h-16 w-16 rounded-xl object-cover border border-slate-200"
                    />
                    <div className="space-y-1">
                      <ImageCaptureField
                        value={groupPhotoUrl}
                        onChange={setGroupPhotoUrl}
                        onError={setAppError}
                        buttonLabel="Foto ou escudo da pelada"
                      />
                      <p className="text-xs text-slate-500">
                        Opcional: tire uma foto da quadra/escudo pela câmera ou escolha da galeria.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
                    <div className="sm:col-span-3">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Nome da Pelada Fixa *
                      </label>
                      <input
                        required
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                        placeholder="Ex: Pelada de Quarta — Quadra Central"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Quadra / Local *
                      </label>
                      <input
                        required
                        value={groupLocation}
                        onChange={(e) => setGroupLocation(e.target.value)}
                        placeholder="Ex: Arena Paulista"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>

                    <div className="sm:col-span-4">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Endereço completo *
                      </label>
                      <input
                        required
                        value={groupFullAddress}
                        onChange={(e) => setGroupFullAddress(e.target.value)}
                        placeholder="Ex: Rua das Quadras, 250 - Bela Vista, São Paulo - SP"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Valor do avulso (R$)
                      </label>
                      <input
                        type="number"
                        step="0.50"
                        min={0}
                        value={groupAvulsoFee}
                        onChange={(e) => setGroupAvulsoFee(e.target.value)}
                        placeholder="25.00"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Dia fixo
                      </label>
                      <select
                        value={groupWeekday}
                        onChange={(e) => setGroupWeekday(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                      >
                        {WEEKDAYS.map((day) => (
                          <option key={day} value={day}>
                            {day}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-1">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Início
                      </label>
                      <input
                        type="time"
                        value={groupStartTime}
                        onChange={(e) => setGroupStartTime(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>

                    <div className="sm:col-span-1">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Término
                      </label>
                      <input
                        type="time"
                        value={groupEndTime}
                        onChange={(e) => setGroupEndTime(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>

                    <div className="sm:col-span-1">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Por time
                      </label>
                      <input
                        type="number"
                        min={3}
                        max={7}
                        value={groupPerTeam}
                        onChange={(e) => setGroupPerTeam(Number(e.target.value))}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>

                    <div className="sm:col-span-1">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Times
                      </label>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={2}
                        max={12}
                        required
                        value={groupTeamsCount}
                        onChange={(e) => setGroupTeamsCount(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white tabular-nums"
                      />
                    </div>

                    <div className="sm:col-span-6">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Descrição / Regras (opcional)
                      </label>
                      <input
                        value={groupDescription}
                        onChange={(e) => setGroupDescription(e.target.value)}
                        placeholder="Ex: Jogos de 10 minutos, 2 gols ou 2 times na espera."
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={groupCreateSeason}
                        onChange={(e) => setGroupCreateSeason(e.target.checked)}
                        className="accent-emerald-600"
                      />
                      Já abrir a 1ª temporada para esta pelada fixa
                    </label>
                    {groupCreateSeason && (
                      <input
                        required
                        value={groupInitialSeasonName}
                        onChange={(e) => setGroupInitialSeasonName(e.target.value)}
                        placeholder="Nome da temporada inicial"
                        className="w-full sm:max-w-sm rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm block"
                      />
                    )}
                  </div>

                  {allSystemPlayers.length > 0 && (
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-slate-700">
                        Vincular peladeiros já cadastrados (opcional)
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {allSystemPlayers.map((sp) => {
                          const selected = groupSelectedPlayerIds.includes(sp.id);
                          return (
                            <button
                              key={sp.id}
                              type="button"
                              onClick={() =>
                                setGroupSelectedPlayerIds((prev) =>
                                  selected ? prev.filter((id) => id !== sp.id) : [...prev, sp.id]
                                )
                              }
                              className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium cursor-pointer transition-colors ${
                                selected
                                  ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-semibold'
                                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              {sp.nickname} ({sp.position})
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 cursor-pointer"
                    >
                      Criar Pelada Fixa e Acessar
                    </button>
                  </div>
                </form>
              )}

              {loadingGroups ? (
                <div className="py-12 text-center text-sm text-slate-500">
                  Carregando peladas fixas...
                </div>
              ) : groups.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center space-y-3">
                  <CalendarDays className="h-9 w-9 text-slate-400 mx-auto" />
                  <h3 className="text-base font-bold text-slate-900">
                    {authUser
                      ? 'Nenhuma pelada fixa vinculada ao seu usuário'
                      : 'Nenhuma pelada fixa cadastrada ainda'}
                  </h3>
                  <p className="text-sm text-slate-500 max-w-md mx-auto">
                    {!authUser
                      ? 'Entre com uma conta de administrador para cadastrar a primeira pelada fixa e liberar o acesso dos jogadores.'
                      : isAdmin
                        ? 'Cadastre sua primeira pelada fixa (ex: Pelada de Quarta, Futsal de Sábado) para organizar elenco, encontros e temporadas.'
                        : 'Peça ao administrador da sua pelada para adicionar seu usuário ou ficha de peladeiro ao grupo.'}
                  </p>
                  {!authUser && (
                    <button
                      type="button"
                      onClick={() => setLoginModalState({ targetGroup: null })}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 cursor-pointer"
                    >
                      <LogIn className="h-4 w-4" /> Entrar com Login
                    </button>
                  )}
                  {isAdmin && !showNewGroupForm && (
                    <button
                      type="button"
                      onClick={() => setShowNewGroupForm(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 cursor-pointer"
                    >
                      <Plus className="h-4 w-4" /> Criar 1ª Pelada Fixa
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {groups.map((g) => {
                    const status = authUser ? (g.membershipStatus ?? 'member') : 'public';
                    const isMember = authUser != null && status === 'member';
                    const pendingReqs = g.pendingJoinRequestsCount ?? 0;
                    const groupSummaryEmail = summaryEmails.find((se) => se.groupId === g.id);

                    return (
                      <div
                        key={g.id}
                        onClick={() => {
                          if (!authUser) {
                            setLoginModalState({ targetGroup: g });
                          } else if (isMember) {
                            openFixedPelada(g.id, 'peladas');
                          } else {
                            setJoinRequestTarget(g);
                          }
                        }}
                        className={`rounded-xl border bg-white p-5 transition-colors cursor-pointer flex flex-col justify-between gap-4 shadow-xs ${
                          !authUser || isMember
                            ? 'border-slate-200 hover:border-emerald-400'
                            : status === 'pending'
                              ? 'border-amber-200 hover:border-amber-400'
                              : 'border-slate-200 hover:border-slate-400'
                        }`}
                      >
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <img
                                src={
                                  g.photoUrl ||
                                  '/src/assets/images/futsal_ball_emblem_1795299371507.jpg'
                                }
                                alt={g.name}
                                referrerPolicy="no-referrer"
                                className="h-12 w-12 rounded-lg object-cover border border-slate-200 shrink-0"
                              />
                              <div className="min-w-0">
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                                  <Clock className="h-3 w-3" />
                                  {g.weekday} · {g.startTime} às {g.endTime}
                                </span>
                                <h3 className="font-display text-2xl font-bold text-slate-900 truncate">
                                  {g.name}
                                </h3>
                              </div>
                            </div>

                            {!authUser ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-800 shrink-0">
                                Login
                              </span>
                            ) : isMember ? (
                              <span className="text-[11px] font-semibold text-slate-500 shrink-0">
                                {g.isGroupAdmin
                                  ? 'Organizador'
                                  : g.myMemberCategory === 'eventual'
                                    ? 'Eventual'
                                    : g.myMemberCategory === 'avulso'
                                      ? 'Avulso'
                                      : 'Mensalista'}
                              </span>
                            ) : (
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded border shrink-0 ${
                                  status === 'pending'
                                    ? 'border-amber-200 bg-amber-50 text-amber-800'
                                    : status === 'rejected'
                                      ? 'border-red-200 bg-red-50 text-red-700'
                                      : status === 'expired'
                                        ? 'border-slate-300 bg-slate-100 text-slate-700'
                                        : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                }`}
                              >
                                {status === 'pending'
                                  ? 'Pendente'
                                  : status === 'rejected'
                                    ? 'Recusada'
                                    : status === 'expired'
                                      ? 'Prazo encerrado'
                                      : 'Aberta'}
                              </span>
                            )}
                          </div>

                          <div className="space-y-1 text-xs text-slate-600">
                            <p className="inline-flex items-center gap-1.5">
                              <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                              <span>
                                {g.location} · Formato {g.playersPerTeam}×{g.playersPerTeam}
                                {(g.avulsoFee ?? 0) > 0 ? ` · Avulso ${formatCurrencyBrl(g.avulsoFee)}` : ''}
                              </span>
                            </p>
                            {g.fullAddress && (
                              <p className="text-[11px] text-slate-500 pl-5 line-clamp-1">
                                {g.fullAddress}
                              </p>
                            )}
                            {g.description && (
                              <p className="text-slate-500 line-clamp-2">{g.description}</p>
                            )}
                            {isMember && !g.isGroupAdmin && g.accessExpiresAt && (
                              <p className="text-[11px] font-medium text-amber-700 pt-0.5">
                                Acesso válido até{' '}
                                {new Date(g.accessExpiresAt).toLocaleDateString('pt-BR')}.
                              </p>
                            )}
                            {!isMember && status === 'pending' && (
                              <p className="text-[11px] text-amber-800 pt-0.5">
                                Solicitação enviada como{' '}
                                <strong>
                                  {g.myJoinRequest?.requestedCategory === 'mensalista'
                                    ? 'Mensalista'
                                    : g.myJoinRequest?.requestedCategory === 'avulso'
                                      ? 'Avulso'
                                      : 'Eventual'}
                                </strong>
                                . Aguardando aprovação dos administradores.
                              </p>
                            )}
                            {!isMember && status === 'rejected' && (
                              <p className="text-[11px] text-red-700 pt-0.5">
                                {g.myJoinRequest?.responseNote
                                  ? `Motivo: ${g.myJoinRequest.responseNote}`
                                  : 'Sua última solicitação não foi autorizada.'}
                              </p>
                            )}
                            {!isMember && status === 'expired' && (
                              <p className="text-[11px] text-slate-600 pt-0.5">
                                Seu prazo de acesso a esta pelada encerrou. Peça ao administrador para renovar.
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="space-y-2.5 pt-3 border-t border-slate-100">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-600 font-mono tabular-nums">
                              {g.membersCount} participantes · {g.peladasCount} encontros
                            </span>
                            <span className="text-[11px] font-semibold text-amber-700 truncate max-w-[140px]">
                              {g.openSeasonName ?? 'Sem temporada aberta'}
                            </span>
                          </div>

                          {!authUser ? (
                            <div className="flex items-center justify-between gap-2 pt-1">
                              <span className="text-[11px] text-slate-400">
                                Acesso por login e senha
                              </span>
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                                Acessar Pelada <ChevronRight className="h-3.5 w-3.5" />
                              </span>
                            </div>
                          ) : isMember ? (
                            <div className="flex items-center justify-between gap-2 pt-1">
                              <div
                                className="flex items-center gap-2 text-[11px] font-semibold text-slate-500"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={() => openFixedPelada(g.id, 'players')}
                                  className="hover:text-emerald-700 cursor-pointer"
                                >
                                  Elenco
                                </button>
                                <span>·</span>
                                <button
                                  type="button"
                                  onClick={() => openFixedPelada(g.id, 'seasons')}
                                  className="hover:text-emerald-700 cursor-pointer"
                                >
                                  Ranking
                                </button>
                                <span>·</span>
                                <button
                                  type="button"
                                  onClick={() => openFixedPelada(g.id, 'finance')}
                                  className="hover:text-emerald-700 cursor-pointer"
                                >
                                  Financeiro
                                </button>
                                {g.isGroupAdmin && pendingReqs > 0 && (
                                  <>
                                    <span>·</span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setJoinRequestsModalTarget({
                                          groupId: g.id,
                                          groupName: g.name,
                                        })
                                      }
                                      className="font-bold text-amber-700 hover:text-amber-800 cursor-pointer"
                                    >
                                      {pendingReqs} solicitação(ões)
                                    </button>
                                  </>
                                )}
                              </div>

                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                                Entrar na Pelada <ChevronRight className="h-3.5 w-3.5" />
                              </span>
                            </div>
                          ) : (
                            <div
                              className="flex flex-wrap items-center justify-between gap-2 pt-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {groupSummaryEmail ? (
                                <button
                                  type="button"
                                  onClick={() => setShowSummaryEmailsModal(true)}
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-emerald-700 cursor-pointer"
                                >
                                  <Mail className="h-3.5 w-3.5" /> Ver Resumo
                                </button>
                              ) : (
                                <span className="text-[11px] text-slate-400">
                                  Requer aprovação do admin
                                </span>
                              )}

                              <button
                                type="button"
                                onClick={() => setJoinRequestTarget(g)}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 cursor-pointer"
                              >
                                <UserPlus className="h-3.5 w-3.5" />
                                {status === 'pending'
                                  ? 'Editar Solicitação'
                                  : status === 'rejected' || status === 'expired'
                                    ? 'Solicitar Novamente'
                                    : 'Solicitar Entrada'}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* LEVEL 2: INSIDE THE SELECTED FIXED PELADA — SHOW SELECTED SCREEN */
            <div className="space-y-6">
              {/* Pelada Header & Screen Selector inside <main> */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    <img
                      src={
                        activeGroup.photoUrl ||
                        '/src/assets/images/futsal_ball_emblem_1795299371507.jpg'
                      }
                      alt={activeGroup.name}
                      referrerPolicy="no-referrer"
                      className="h-12 w-12 rounded-lg object-cover border border-slate-200 shrink-0 mt-1"
                    />
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={backToFixedPeladasList}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-emerald-700 cursor-pointer mb-0.5"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" /> Voltar para minhas peladas fixas
                      </button>
                      <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900 truncate">
                        {activeGroup.name}
                      </h2>
                      <p className="text-xs text-slate-600">
                        {activeGroup.weekday} · {activeGroup.startTime} às {activeGroup.endTime} ·{' '}
                        {activeGroup.location} · Formato {activeGroup.playersPerTeam}×
                        {activeGroup.playersPerTeam} · Avulso:{' '}
                        <strong className="text-emerald-700">
                          {(activeGroup.avulsoFee ?? 0) > 0
                            ? formatCurrencyBrl(activeGroup.avulsoFee)
                            : 'Gratuito (R$ 0,00)'}
                        </strong>
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <strong className="font-semibold text-slate-700">Endereço completo:</strong>{' '}
                          {activeGroup.fullAddress?.trim() || 'Não informado'}
                        </span>
                        {isPeladaAdmin && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditGroupLocation(activeGroup.location);
                              setEditGroupFullAddress(activeGroup.fullAddress ?? '');
                              setEditGroupAvulsoFee(String(activeGroup.avulsoFee ?? 0));
                              setEditGroupStartTime(activeGroup.startTime || '20:00');
                              setEditGroupEndTime(activeGroup.endTime || '22:00');
                              setEditingGroupInfo((v) => !v);
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer"
                          >
                            <Edit3 className="h-3 w-3" />
                            {editingGroupInfo ? 'Fechar edição' : 'Editar informações'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {groups.length > 1 && (
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-semibold text-slate-500 hidden sm:inline">
                        Trocar pelada:
                      </label>
                      <select
                        value={activeGroup.id}
                        onChange={(e) => openFixedPelada(Number(e.target.value), section)}
                        className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800"
                      >
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {editingGroupInfo && isPeladaAdmin && (
                  <form
                    onSubmit={handleSaveGroupInfo}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 grid grid-cols-1 sm:grid-cols-8 gap-3 items-end"
                  >
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Quadra / Local
                      </label>
                      <input
                        required
                        value={editGroupLocation}
                        onChange={(e) => setEditGroupLocation(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Endereço completo
                      </label>
                      <input
                        value={editGroupFullAddress}
                        onChange={(e) => setEditGroupFullAddress(e.target.value)}
                        placeholder="Rua, número, bairro, cidade"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
                      />
                    </div>
                    <div className="sm:col-span-1">
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Início
                      </label>
                      <input
                        type="time"
                        value={editGroupStartTime}
                        onChange={(e) => setEditGroupStartTime(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                      />
                    </div>
                    <div className="sm:col-span-1">
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Término
                      </label>
                      <input
                        type="time"
                        value={editGroupEndTime}
                        onChange={(e) => setEditGroupEndTime(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                      />
                    </div>
                    <div className="sm:col-span-1">
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Avulso (R$)
                      </label>
                      <input
                        type="number"
                        step="0.50"
                        min={0}
                        value={editGroupAvulsoFee}
                        onChange={(e) => setEditGroupAvulsoFee(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs tabular-nums"
                      />
                    </div>
                    <div className="sm:col-span-1 flex justify-end">
                      <button
                        type="submit"
                        disabled={savingGroupInfo}
                        className="w-full rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
                      >
                        {savingGroupInfo ? 'Salvando...' : 'Salvar'}
                      </button>
                    </div>
                  </form>
                )}



                {/* Screen selector inside the Pelada */}
                <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSection('peladas');
                      setActivePeladaId(null);
                    }}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      section === 'peladas'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <CalendarDays className="h-3.5 w-3.5" />
                    Jogos & Encontros
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSection('players');
                      setActivePeladaId(null);
                    }}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      section === 'players'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Users className="h-3.5 w-3.5" />
                    Elenco & Notas ({players.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSection('seasons');
                      setActivePeladaId(null);
                    }}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      section === 'seasons'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Trophy className="h-3.5 w-3.5" />
                    Temporadas & Ranking
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSection('finance');
                      setActivePeladaId(null);
                    }}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      section === 'finance'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Wallet className="h-3.5 w-3.5 text-emerald-700" />
                    Financeiro
                  </button>
                  {isPeladaAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setSection('access');
                        setActivePeladaId(null);
                      }}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                        section === 'access'
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      Membros & Acessos
                    </button>
                  )}
                </div>
              </div>

              {/* SELECTED SCREEN INSIDE THE PELADA */}
              {section === 'peladas' && activePeladaId !== null && authUser ? (
                <PeladaWorkspace
                  peladaId={activePeladaId}
                  authUser={authUser}
                  isGroupAdmin={activeGroup.isGroupAdmin}
                  allPlayers={players}
                  onBack={() => {
                    setActivePeladaId(null);
                    loadPeladas(activeGroup.id, selectedSeasonId);
                    loadGroups();
                  }}
                  onRefreshPlayers={() => loadGroupPlayers(activeGroup.id)}
                />
              ) : section === 'peladas' ? (
                <div className="space-y-6">
                  {/* Group Season / Encounter Control Banner */}
                  <div className="relative rounded-xl overflow-hidden bg-slate-900 text-white border border-slate-800">
                    <img
                      src="/src/assets/images/futsal_court_hero_1795299371438.jpg"
                      alt="Quadra de futsal"
                      referrerPolicy="no-referrer"
                      className="absolute inset-0 h-full w-full object-cover opacity-35"
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/75 to-slate-950/40" />

                    <div className="relative z-10 p-6 flex flex-wrap items-end justify-between gap-6">
                      <div className="max-w-xl space-y-1.5">
                        <p className="text-xs font-semibold text-emerald-400">
                          {activeSeason
                            ? `${activeSeason.name} · ${activeSeason.status === 'open' ? 'Temporada Aberta' : 'Temporada Encerrada'}`
                            : 'Nenhuma temporada ativa nesta pelada'}
                        </p>
                        <h3 className="font-display text-3xl sm:text-4xl font-extrabold leading-none">
                          Encontros & Controle da Quadra
                        </h3>
                        <p className="text-xs sm:text-sm text-slate-300">
                          Crie o encontro do dia, confirme quem vai jogar, separe os times por nota
                          e acompanhe o placar ao vivo.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        {seasons.length > 0 && (
                          <select
                            value={selectedSeasonId ?? ''}
                            onChange={(e) => setSelectedSeasonId(Number(e.target.value))}
                            className="rounded-lg border border-white/20 bg-slate-900/90 px-3 py-2 text-xs font-semibold text-white"
                          >
                            {seasons.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        )}

                        {isPeladaAdmin && seasons.length === 0 && (
                          <button
                            type="button"
                            onClick={() => setShowNewSeasonInline(true)}
                            className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 cursor-pointer"
                          >
                            Abrir 1ª Temporada
                          </button>
                        )}

                        {isPeladaAdmin && activeSeason?.status === 'open' && (
                          <button
                            type="button"
                            onClick={() => setShowNewPeladaForm((v) => !v)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 cursor-pointer"
                          >
                            <Plus className="h-4 w-4" /> Cadastrar Encontro
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Quick KPI Strip */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <span className="text-xs text-slate-500 block">Elenco da Pelada</span>
                      <span className="font-mono tabular-nums text-2xl font-bold text-slate-900">
                        {players.length}
                      </span>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <span className="text-xs text-slate-500 block">Encontros na Temporada</span>
                      <span className="font-mono tabular-nums text-2xl font-bold text-slate-900">
                        {peladas.length}
                      </span>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <span className="text-xs text-slate-500 block">Temporadas</span>
                      <span className="font-mono tabular-nums text-2xl font-bold text-slate-900">
                        {seasons.length}
                      </span>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <span className="text-xs text-slate-500 block">Média Geral do Grupo</span>
                      <span className="font-mono tabular-nums text-2xl font-bold text-emerald-700">
                        {players.length > 0
                          ? (
                              players.reduce((s, p) => s + p.curOverall, 0) / players.length
                            ).toFixed(2)
                          : '—'}
                      </span>
                    </div>
                  </div>

                  {showNewSeasonInline && isPeladaAdmin && (
                    <form
                      onSubmit={handleCreateQuickSeason}
                      className="rounded-xl border border-amber-200 bg-amber-50 p-5 flex flex-wrap items-end gap-3"
                    >
                      <div className="flex-1 min-w-[220px]">
                        <label className="block text-xs font-semibold text-amber-950 mb-1">
                          Nome da Temporada
                        </label>
                        <input
                          required
                          value={inlineSeasonName}
                          onChange={(e) => setInlineSeasonName(e.target.value)}
                          placeholder="Ex: Temporada 2026"
                          className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm"
                        />
                      </div>
                      <button
                        type="submit"
                        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 cursor-pointer"
                      >
                        Abrir Temporada
                      </button>
                    </form>
                  )}

                  {showNewPeladaForm && isPeladaAdmin && (
                    <form
                      onSubmit={handleCreatePelada}
                      className="rounded-xl border border-slate-200 bg-white p-6 space-y-4"
                    >
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <h3 className="font-display text-2xl font-bold text-slate-900">
                          Cadastrar Novo Encontro — {activeGroup.name}
                        </h3>
                        <button
                          type="button"
                          onClick={() => setShowNewPeladaForm(false)}
                          className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                        >
                          Cancelar
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
                        <div className="sm:col-span-3">
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Título do Encontro *
                          </label>
                          <input
                            required
                            value={peladaTitle}
                            onChange={(e) => setPeladaTitle(e.target.value)}
                            placeholder={`Ex: ${activeGroup.name} #01`}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                          />
                        </div>
                        <div className="sm:col-span-3">
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Quadra / Local
                          </label>
                          <input
                            required
                            value={peladaLocation}
                            onChange={(e) => setPeladaLocation(e.target.value)}
                            placeholder="Ginásio Municipal"
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Data
                          </label>
                          <input
                            type="date"
                            value={peladaDate}
                            onChange={(e) => setPeladaDate(e.target.value)}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                          />
                        </div>
                        <div className="sm:col-span-1">
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Início
                          </label>
                          <input
                            type="time"
                            value={peladaTime}
                            onChange={(e) => setPeladaTime(e.target.value)}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                          />
                        </div>
                        <div className="sm:col-span-1">
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Término
                          </label>
                          <input
                            type="time"
                            value={peladaEndTime}
                            onChange={(e) => setPeladaEndTime(e.target.value)}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                          />
                        </div>
                        <div className="sm:col-span-1">
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Por time
                          </label>
                          <input
                            type="number"
                            min={3}
                            max={7}
                            value={peladaPerTeam}
                            onChange={(e) => setPeladaPerTeam(Number(e.target.value))}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                          />
                        </div>
                        <div className="sm:col-span-1">
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Times
                          </label>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={2}
                            max={12}
                            required
                            value={peladaTeamsCount}
                            onChange={(e) => setPeladaTeamsCount(e.target.value)}
                            placeholder="Ex: 3"
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white tabular-nums"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <button
                          type="submit"
                          className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 cursor-pointer"
                        >
                          Criar Encontro e Ir para Quadra
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Encounters List inside this Fixed Pelada */}
                  {loadingData && peladas.length === 0 ? (
                    <div className="py-12 text-center text-sm text-slate-500">
                      Carregando encontros da pelada...
                    </div>
                  ) : peladas.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center space-y-3">
                      <CalendarDays className="h-8 w-8 text-slate-400 mx-auto" />
                      <h3 className="text-base font-bold text-slate-900">
                        Nenhum encontro cadastrado nesta temporada
                      </h3>
                      <p className="text-sm text-slate-500 max-w-md mx-auto">
                        {!activeSeason
                          ? 'Primeiro abra uma temporada para organizar os encontros desta pelada.'
                          : isPeladaAdmin
                            ? 'Cadastre o primeiro encontro (dia de jogo) para confirmar presenças, separar times e registrar gols.'
                            : 'O administrador ainda não cadastrou o próximo encontro.'}
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {peladas.map((p) => (
                        <div
                          key={p.id}
                          onClick={() => setActivePeladaId(p.id)}
                          className="rounded-xl border border-slate-200 bg-white p-5 hover:border-emerald-400 transition-colors cursor-pointer flex flex-col justify-between gap-4"
                        >
                          <div>
                            <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                              <span className="font-mono tabular-nums">
                                {p.eventDate} · {p.startTime} às {p.endTime}
                              </span>
                              <span
                                className={
                                  p.status === 'finished'
                                    ? 'text-slate-500 font-semibold'
                                    : 'text-emerald-700 font-semibold'
                                }
                              >
                                {p.status === 'finished' ? 'Finalizada' : 'Em andamento'}
                              </span>
                            </div>
                            <h3 className="font-display text-2xl font-bold text-slate-900">
                              {p.title}
                            </h3>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {p.location} · Formato {p.playersPerTeam}×{p.playersPerTeam}
                            </p>
                          </div>

                          <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
                            <span className="text-slate-600 font-mono tabular-nums">
                              {p.presentCount} presentes · {p.matchesCount} jogos
                            </span>
                            <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                              Abrir quadra <ChevronRight className="h-3.5 w-3.5" />
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : section === 'players' ? (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
                    <div>
                      <h2 className="font-display text-3xl font-extrabold text-slate-900">
                        Elenco & Notas · {activeGroup.name}
                      </h2>
                      <p className="text-sm text-slate-500">
                        Média nos {activeGroupCriteria.length || 7} critérios configurados da pelada
                        considerando os últimos 10 jogos avaliados.
                      </p>
                      {isPeladaAdmin && pendingRosterPlayers.length > 0 && (
                        <p className="text-xs font-semibold text-amber-800 mt-1 flex items-center gap-1.5">
                          <Bell className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                          {pendingRosterPlayers.length} jogador(es) aguardando votação inicial dos
                          administradores.
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {isPeladaAdmin && (activeGroup.pendingJoinRequestsCount ?? 0) > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setJoinRequestsModalTarget({
                              groupId: activeGroup.id,
                              groupName: activeGroup.name,
                            })
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 cursor-pointer"
                        >
                          <UserCheck className="h-4 w-4" />
                          Solicitações ({activeGroup.pendingJoinRequestsCount})
                        </button>
                      )}

                      {isPeladaAdmin && (
                        <button
                          type="button"
                          onClick={() => setShowCriteriaModal(true)}
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer"
                        >
                          <Sliders className="h-4 w-4 text-emerald-700" />
                          Critérios da Nota
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setEditingPlayer('new')}
                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 cursor-pointer"
                      >
                        <Plus className="h-4 w-4" />
                        {isPeladaAdmin ? 'Cadastrar Peladeiro' : 'Cadastrar Peladeiro Eventual'}
                      </button>
                    </div>
                  </div>

                  {isPeladaAdmin && availableExistingPlayers.length > 0 && (
                    <form
                      onSubmit={handleAddExistingPlayerToGroup}
                      className="rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap items-end gap-3"
                    >
                      <div className="flex-1 min-w-[240px]">
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Adicionar jogador já cadastrado no app a esta pelada fixa
                        </label>
                        <select
                          value={addExistingPlayerId}
                          onChange={(e) => setAddExistingPlayerId(Number(e.target.value))}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                        >
                          <option value={0}>Selecione um peladeiro...</option>
                          {availableExistingPlayers.map((ap) => (
                            <option key={ap.id} value={ap.id}>
                              {ap.nickname} ({ap.name}) · {ap.position}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        type="submit"
                        disabled={!addExistingPlayerId}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        Adicionar à Pelada
                      </button>
                    </form>
                  )}

                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="relative flex-1 min-w-[220px] max-w-sm">
                        <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
                        <input
                          value={playerSearch}
                          onChange={(e) => setPlayerSearch(e.target.value)}
                          placeholder="Buscar por nome, apelido ou posição..."
                          className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-lg">
                        <button
                          type="button"
                          onClick={() => setCategoryFilter('all')}
                          className={`px-2.5 py-1 text-xs font-semibold rounded-md cursor-pointer ${
                            categoryFilter === 'all'
                              ? 'bg-white text-slate-900 shadow-sm'
                              : 'text-slate-600'
                          }`}
                        >
                          Todas categorias
                        </button>
                        {PLAYER_CATEGORIES.map((cat) => (
                          <button
                            key={cat.value}
                            type="button"
                            onClick={() => setCategoryFilter(cat.value)}
                            className={`px-2.5 py-1 text-xs font-semibold rounded-md whitespace-nowrap cursor-pointer ${
                              categoryFilter === cat.value
                                ? 'bg-white text-slate-900 shadow-sm'
                                : 'text-slate-600'
                            }`}
                          >
                            {cat.value === 'eventual' ? 'Eventual' : cat.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-lg w-fit">
                      <button
                        type="button"
                        onClick={() => setPositionFilter('all')}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-md cursor-pointer ${
                          positionFilter === 'all'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600'
                        }`}
                      >
                        Todas posições
                      </button>
                      {FUTSAL_POSITIONS.map((pos) => (
                        <button
                          key={pos}
                          type="button"
                          onClick={() => setPositionFilter(pos)}
                          className={`px-2.5 py-1 text-xs font-semibold rounded-md whitespace-nowrap cursor-pointer ${
                            positionFilter === pos
                              ? 'bg-white text-slate-900 shadow-sm'
                              : 'text-slate-600'
                          }`}
                        >
                          {pos}
                        </button>
                      ))}
                    </div>
                  </div>

                  {filteredPlayers.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center space-y-2">
                      <Users className="h-8 w-8 text-slate-400 mx-auto" />
                      <p className="text-base font-semibold text-slate-900">
                        Nenhum peladeiro encontrado nesta pelada fixa
                      </p>
                      <p className="text-sm text-slate-500">
                        Cadastre novos jogadores (mensalistas, avulsos ou eventuais) para organizar
                        os times.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {filteredPlayers.map((p) => {
                        const canEdit =
                          isPeladaAdmin ||
                          (authUser != null && p.userId != null && p.userId === authUser.id) ||
                          (authUser != null &&
                            p.category === 'eventual' &&
                            p.invitedByUserId === authUser.id);
                        const catBadgeStyle =
                          p.category === 'mensalista'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : p.category === 'avulso'
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-slate-100 text-slate-700 border-slate-200';
                        const catBadgeLabel =
                          p.category === 'mensalista'
                            ? 'Mensalista · Prioridade'
                            : p.category === 'avulso'
                              ? 'Avulso'
                              : 'Eventual';
                        const isExclusive = p.exclusiveGroupId != null || p.exclusivePeladaId != null;
                        const votesCount = p.initVotesCount ?? 0;
                        const isPendingVote = p.initRatingStatus === 'pending_votes';
                        return (
                          <div
                            key={p.id}
                            className="rounded-xl border border-slate-200 bg-white p-5 flex flex-col justify-between gap-4 hover:border-slate-300 transition-colors"
                          >
                            <div className="space-y-2.5">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                  <PlayerAvatar name={p.name} photoUrl={p.photoUrl} size="lg" />
                                  <div className="min-w-0">
                                    <h3 className="font-bold text-base text-slate-900 truncate">
                                      {p.nickname}
                                    </h3>
                                    <p className="text-xs text-slate-500 truncate">{p.name}</p>
                                    <p className="text-xs text-slate-600 mt-0.5">
                                      {p.position} · Pé {p.dominantFoot}
                                      {p.age ? ` · ${p.age} anos` : ''}
                                    </p>
                                  </div>
                                </div>

                                <div className="text-right shrink-0">
                                  <span className="text-[11px] text-slate-400 block">Nota</span>
                                  <span className="font-display text-3xl font-extrabold text-emerald-700 tabular-nums">
                                    {p.curOverall.toFixed(2)}
                                  </span>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                                <span
                                  className={`rounded-md border px-2 py-0.5 font-semibold ${catBadgeStyle}`}
                                >
                                  {catBadgeLabel}
                                </span>
                                {isPendingVote ? (
                                  <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 font-semibold text-amber-800">
                                    {votesCount > 0
                                      ? `Votação (${votesCount} voto${votesCount > 1 ? 's' : ''})`
                                      : 'Aguardando votos'}
                                  </span>
                                ) : votesCount > 0 ? (
                                  <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                                    <CheckCircle2 className="h-3 w-3" />
                                    Média de {votesCount} voto{votesCount > 1 ? 's' : ''}
                                  </span>
                                ) : null}
                                {isExclusive && (
                                  <span className="text-slate-500 font-medium">
                                    {p.exclusivePeladaId
                                      ? 'Exclusivo de 1 encontro'
                                      : 'Exclusivo desta pelada'}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="grid grid-cols-4 gap-2 text-center border-y border-slate-100 py-2.5 text-[11px]">
                              {previewCriteria.map((c) => {
                                const scoreVal =
                                  p.curScores?.[c.key] ??
                                  (c.key === 'attack'
                                    ? p.curAttack
                                    : c.key === 'defense'
                                      ? p.curDefense
                                      : c.key === 'passing'
                                        ? p.curPassing
                                        : c.key === 'shooting'
                                          ? p.curShooting
                                          : c.key === 'physical'
                                            ? p.curPhysical
                                            : c.key === 'dribbling'
                                              ? p.curDribbling
                                              : c.key === 'positioning'
                                                ? p.curPositioning
                                                : 7);
                                return (
                                  <div key={c.key} className="min-w-0">
                                    <span className="text-slate-400 block truncate">{c.short}</span>
                                    <span className="font-mono tabular-nums font-bold text-slate-800">
                                      {scoreVal.toFixed(1)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                              <button
                                type="button"
                                onClick={() => setDetailPlayerId(p.id)}
                                className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer"
                              >
                                <BarChart3 className="h-3.5 w-3.5" />
                                Histórico & Evolução
                              </button>

                              <div className="flex items-center gap-2.5">
                                {isPeladaAdmin && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setVotingTarget({ playerId: p.id, groupId: activeGroup.id })
                                    }
                                    className={`inline-flex items-center gap-1 font-semibold cursor-pointer ${
                                      isPendingVote
                                        ? 'text-amber-700 hover:text-amber-800'
                                        : 'text-slate-600 hover:text-emerald-700'
                                    }`}
                                    title="Votar nos critérios da nota inicial"
                                  >
                                    <Vote className="h-3.5 w-3.5" />
                                    Votar
                                  </button>
                                )}

                                {canEdit && (
                                  <button
                                    type="button"
                                    onClick={() => setEditingPlayer(p)}
                                    className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 cursor-pointer"
                                  >
                                    <Edit3 className="h-3.5 w-3.5" /> Editar
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : section === 'seasons' ? (
                <SeasonsAndStatsView
                  seasons={seasons}
                  selectedSeasonId={selectedSeasonId}
                  isAdmin={isPeladaAdmin}
                  groupId={activeGroup.id}
                  groupName={activeGroup.name}
                  onSelectSeason={(id) => setSelectedSeasonId(id)}
                  onRefreshSeasons={async () => {
                    await Promise.all([loadGroupSeasons(activeGroup.id), loadGroups()]);
                  }}
                  onOpenPlayerDetail={(pId) => setDetailPlayerId(pId)}
                />
              ) : section === 'finance' ? (
                <PeladaFinanceView
                  groupId={activeGroup.id}
                  players={players}
                  onGroupUpdated={() => loadGroups()}
                />
              ) : section === 'access' && isPeladaAdmin ? (
                <AdminAccessView
                  groupId={activeGroup.id}
                  groupName={activeGroup.name}
                  isGlobalAdmin={isAdmin}
                  players={players}
                  allPlayers={allSystemPlayers}
                  pendingJoinRequestsCount={activeGroup.pendingJoinRequestsCount ?? 0}
                  onOpenJoinRequests={() =>
                    setJoinRequestsModalTarget({
                      groupId: activeGroup.id,
                      groupName: activeGroup.name,
                    })
                  }
                  onMembersChanged={() => {
                    loadGroupPlayers(activeGroup.id);
                    loadGroups();
                  }}
                />
              ) : null}
            </div>
          )}
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 flex items-center justify-around h-14 px-2">
        {!authUser ? (
          <>
            <button
              type="button"
              onClick={() => setActiveGroupId(null)}
              className="flex flex-col items-center text-[11px] font-semibold text-emerald-700"
            >
              <CalendarDays className="h-4 w-4 mb-0.5" /> Peladas Fixas
            </button>
            <button
              type="button"
              onClick={() => setLoginModalState({ targetGroup: null })}
              className="flex flex-col items-center text-[11px] font-semibold text-slate-700"
            >
              <LogIn className="h-4 w-4 mb-0.5 text-emerald-700" /> Entrar com Login
            </button>
          </>
        ) : activeGroup === null ? (
          <>
            <button
              type="button"
              onClick={() => setActiveGroupId(null)}
              className="flex flex-col items-center text-[11px] font-semibold text-emerald-700"
            >
              <CalendarDays className="h-4 w-4 mb-0.5" /> Peladas Fixas
            </button>
            <button
              type="button"
              onClick={() => setShowMyProfile(true)}
              className="flex flex-col items-center text-[11px] font-semibold text-slate-500"
            >
              <UserCheck className="h-4 w-4 mb-0.5" /> Minha Ficha
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={backToFixedPeladasList}
              className="flex flex-col items-center text-[11px] font-semibold text-slate-500"
            >
              <ArrowLeft className="h-4 w-4 mb-0.5" /> Fixas
            </button>
            <button
              type="button"
              onClick={() => {
                setSection('peladas');
                setActivePeladaId(null);
              }}
              className={`flex flex-col items-center text-[11px] font-semibold ${
                section === 'peladas' ? 'text-emerald-700' : 'text-slate-500'
              }`}
            >
              <CalendarDays className="h-4 w-4 mb-0.5" /> Jogos
            </button>
            <button
              type="button"
              onClick={() => {
                setSection('players');
                setActivePeladaId(null);
              }}
              className={`flex flex-col items-center text-[11px] font-semibold ${
                section === 'players' ? 'text-emerald-700' : 'text-slate-500'
              }`}
            >
              <Users className="h-4 w-4 mb-0.5" /> Elenco
            </button>
            <button
              type="button"
              onClick={() => {
                setSection('seasons');
                setActivePeladaId(null);
              }}
              className={`flex flex-col items-center text-[11px] font-semibold ${
                section === 'seasons' ? 'text-emerald-700' : 'text-slate-500'
              }`}
            >
              <Trophy className="h-4 w-4 mb-0.5" /> Ranking
            </button>
            <button
              type="button"
              onClick={() => {
                setSection('finance');
                setActivePeladaId(null);
              }}
              className={`flex flex-col items-center text-[11px] font-semibold ${
                section === 'finance' ? 'text-emerald-700' : 'text-slate-500'
              }`}
            >
              <Wallet className="h-4 w-4 mb-0.5" /> Caixa
            </button>
            {isPeladaAdmin && (
              <button
                type="button"
                onClick={() => {
                  setSection('access');
                  setActivePeladaId(null);
                }}
                className={`flex flex-col items-center text-[11px] font-semibold ${
                  section === 'access' ? 'text-emerald-700' : 'text-slate-500'
                }`}
              >
                <KeyRound className="h-4 w-4 mb-0.5" /> Membros
              </button>
            )}
          </>
        )}
      </nav>

      {editingPlayer !== null && (
        <PlayerFormModal
          player={editingPlayer === 'new' ? null : editingPlayer}
          isAdmin={isPeladaAdmin}
          groupId={activeGroupId}
          groupName={activeGroup?.name}
          groupPeladas={peladas}
          criteriaConfig={activeGroup?.criteriaConfig}
          onClose={() => setEditingPlayer(null)}
          onSaved={(savedPlayer) => {
            setEditingPlayer(null);
            loadAllSystemPlayers();
            loadNotifications();
            if (activeGroupId !== null) {
              loadGroupPlayers(activeGroupId);
              loadPeladas(activeGroupId, selectedSeasonId);
              loadGroups();
            }
            if (myPlayer && savedPlayer.id === myPlayer.id) {
              setMyPlayer(savedPlayer);
            }
          }}
        />
      )}

      {showCriteriaModal && activeGroup && (
        <CriteriaConfigModal
          groupId={activeGroup.id}
          groupName={activeGroup.name}
          initialCriteria={activeGroup.criteriaConfig ?? DEFAULT_GROUP_CRITERIA}
          onClose={() => setShowCriteriaModal(false)}
          onSaved={async () => {
            setShowCriteriaModal(false);
            await Promise.all([
              loadGroups(),
              loadGroupPlayers(activeGroup.id),
              loadNotifications(),
            ]);
          }}
        />
      )}

      {votingTarget && (
        <InitialRatingVoteModal
          playerId={votingTarget.playerId}
          groupId={votingTarget.groupId ?? activeGroupId}
          onClose={() => setVotingTarget(null)}
          onVoted={async () => {
            setVotingTarget(null);
            await Promise.all([
              loadNotifications(),
              loadAllSystemPlayers(),
              loadGroups(),
              ...(activeGroupId !== null ? [loadGroupPlayers(activeGroupId)] : []),
            ]);
          }}
        />
      )}

      {detailPlayerId !== null && (
        <PlayerDetailModal
          playerId={detailPlayerId}
          groupId={activeGroupId}
          onClose={() => setDetailPlayerId(null)}
        />
      )}

      {showMyProfile && authUser && (
        <MyProfileModal
          authUser={authUser}
          player={myPlayer}
          onClose={() => setShowMyProfile(false)}
          onSaved={(saved) => {
            setMyPlayer(saved);
            setAuthUser((prev) => (prev ? { ...prev, playerId: saved.id, name: saved.name } : prev));
            setShowMyProfile(false);
            loadAllSystemPlayers();
            loadGroups();
            if (activeGroupId !== null) {
              loadGroupPlayers(activeGroupId);
            }
          }}
        />
      )}

      {joinRequestTarget && authUser && (
        <JoinPeladaRequestModal
          group={joinRequestTarget}
          authUser={authUser}
          myPlayer={myPlayer}
          onClose={() => setJoinRequestTarget(null)}
          onSubmitted={async (savedPlayer) => {
            setMyPlayer(savedPlayer);
            setAuthUser((prev) =>
              prev ? { ...prev, playerId: savedPlayer.id, name: savedPlayer.name } : prev
            );
            setJoinRequestTarget(null);
            await Promise.all([loadGroups(), loadNotifications(), loadAllSystemPlayers()]);
          }}
        />
      )}

      {joinRequestsModalTarget && (
        <JoinRequestsModal
          groupId={joinRequestsModalTarget.groupId}
          groupName={joinRequestsModalTarget.groupName}
          onClose={() => setJoinRequestsModalTarget(null)}
          onResponded={async () => {
            await Promise.all([
              loadGroups(),
              loadNotifications(),
              loadAllSystemPlayers(),
              ...(activeGroupId !== null ? [loadGroupPlayers(activeGroupId)] : []),
            ]);
          }}
        />
      )}

      {showSummaryEmailsModal && (
        <SummaryEmailsModal
          emails={summaryEmails}
          onClose={() => setShowSummaryEmailsModal(false)}
        />
      )}

      {loginModalState !== null && (
        <AuthModal
          targetGroup={loginModalState.targetGroup}
          onClose={() => setLoginModalState(null)}
          onAuthSuccess={handleAuthSuccess}
        />
      )}
    </div>
  );
}

function SidebarButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
        active
          ? 'bg-emerald-600 text-white'
          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
      }`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}
