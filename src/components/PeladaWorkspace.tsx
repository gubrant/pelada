import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Award,
  Check,
  CheckCircle2,
  Flame,
  Plus,
  Shield,
  Shuffle,
  Sliders,
  Star,
  Trash2,
  Trophy,
  Users,
  Vote,
  Wallet,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  DEFAULT_GROUP_CRITERIA,
  type AuthUser,
  type GroupCriterion,
  type Match,
  type PeladaAttendance,
  type PeladaStats,
  type PeladaSummary,
  type PeladaTeam,
  type Player,
  type PlayerCategory,
} from '../types/futsal';
import { CriteriaConfigModal } from './CriteriaConfigModal';
import { EncounterEvaluationModal } from './EncounterEvaluationModal';
import { EvaluationModal } from './EvaluationModal';
import { PeladaFinanceView } from './PeladaFinanceView';
import { PlayerAvatar } from './PlayerAvatar';

const CATEGORY_PRIORITY: Record<PlayerCategory, number> = {
  mensalista: 0,
  avulso: 1,
  eventual: 2,
};

const CATEGORY_LABELS: Record<PlayerCategory, string> = {
  mensalista: 'Mensalista · Prioridade',
  avulso: 'Avulso',
  eventual: 'Eventual',
};

interface PeladaDetailResponse {
  pelada: PeladaSummary;
  criteriaConfig?: GroupCriterion[];
  teams: PeladaTeam[];
  attendances: PeladaAttendance[];
  matches: Match[];
  stats: PeladaStats;
}

interface PeladaWorkspaceProps {
  peladaId: number;
  authUser: AuthUser;
  isGroupAdmin?: boolean;
  allPlayers: Player[];
  onBack: () => void;
  onRefreshPlayers: () => void;
}

export function PeladaWorkspace({
  peladaId,
  authUser,
  isGroupAdmin = false,
  allPlayers,
  onBack,
  onRefreshPlayers,
}: PeladaWorkspaceProps) {
  const isAdmin = authUser.role === 'admin' || isGroupAdmin;

  const [detail, setDetail] = useState<PeladaDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [financeBanner, setFinanceBanner] = useState<string | null>(null);
  const [tab, setTab] = useState<'matches' | 'teams' | 'stats' | 'finance'>('matches');

  // New match form
  const [teamAId, setTeamAId] = useState<number>(0);
  const [teamBId, setTeamBId] = useState<number>(0);

  // Event logger state
  const [goalTeamId, setGoalTeamId] = useState<number>(0);
  const [scorerId, setScorerId] = useState<number>(0);
  const [assistId, setAssistId] = useState<number>(0);
  const [defenseTeamId, setDefenseTeamId] = useState<number>(0);
  const [defenderId, setDefenderId] = useState<number>(0);
  const [eventMinute, setEventMinute] = useState<number>(1);
  const [busy, setBusy] = useState(false);

  // New team form
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamColor, setNewTeamColor] = useState('#2563EB');

  // Evaluation & per-encounter criteria modals
  const [evaluatingMatch, setEvaluatingMatch] = useState<Match | null>(null);
  const [showEncounterEval, setShowEncounterEval] = useState(false);
  const [showPeladaCriteriaModal, setShowPeladaCriteriaModal] = useState(false);

  async function loadDetail() {
    try {
      const res = await apiFetch<PeladaDetailResponse>(`/api/peladas/${peladaId}`);
      setDetail(res);
      if (res.teams.length >= 2) {
        setTeamAId((prev) => (prev && res.teams.some((t) => t.id === prev) ? prev : res.teams[0].id));
        setTeamBId((prev) => (prev && res.teams.some((t) => t.id === prev) ? prev : res.teams[1].id));
      }
      const live = res.matches.find((m) => m.status === 'live');
      if (live) {
        setGoalTeamId((prev) => (prev === live.teamAId || prev === live.teamBId ? prev : live.teamAId));
        setDefenseTeamId((prev) =>
          prev === live.teamAId || prev === live.teamBId ? prev : live.teamAId
        );
      }
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar pelada.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    loadDetail();
  }, [peladaId]);

  if (loading && !detail) {
    return (
      <div className="p-8 text-center text-sm text-slate-500">
        Carregando dados da pelada...
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="p-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900 mb-4 cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar para Peladas
        </button>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error || 'Pelada não encontrada.'}
        </div>
      </div>
    );
  }

  const { pelada, teams, attendances, matches, stats } = detail;
  const eligiblePlayers = allPlayers
    .filter((p) => p.exclusivePeladaId == null || p.exclusivePeladaId === peladaId)
    .sort((a, b) => {
      const catDiff =
        (CATEGORY_PRIORITY[a.category ?? 'mensalista'] ?? 9) -
        (CATEGORY_PRIORITY[b.category ?? 'mensalista'] ?? 9);
      if (catDiff !== 0) return catDiff;
      if (b.curOverall !== a.curOverall) return b.curOverall - a.curOverall;
      return a.nickname.localeCompare(b.nickname, 'pt-BR');
    });
  const presentAttendances = attendances.filter((a) => a.present);
  const attendanceMap = new Map(attendances.map((a) => [a.playerId, a]));
  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const playerMap = new Map(allPlayers.map((p) => [p.id, p]));
  const liveMatch = matches.find((m) => m.status === 'live') ?? null;

  const myAttendance = authUser.playerId ? attendanceMap.get(authUser.playerId) : undefined;

  async function handleToggleRsvp(present: boolean) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/peladas/${peladaId}/rsvp`, {
        method: 'POST',
        body: JSON.stringify({ present }),
      });
      await loadDetail();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao confirmar presença.');
    } finally {
      setBusy(false);
    }
  }

  async function handleAdminAttendance(playerId: number, present: boolean, teamId?: number | null) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/peladas/${peladaId}/attendance`, {
        method: 'POST',
        body: JSON.stringify({ playerId, present, teamId }),
      });
      await loadDetail();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar presença.');
    } finally {
      setBusy(false);
    }
  }

  async function handleAutoBalance() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/peladas/${peladaId}/teams/auto-balance`, { method: 'POST' });
      await loadDetail();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao separar times.');
    } finally {
      setBusy(false);
    }
  }

  async function handleAddTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/peladas/${peladaId}/teams`, {
        method: 'POST',
        body: JSON.stringify({ name: newTeamName.trim(), colorHex: newTeamColor }),
      });
      setNewTeamName('');
      await loadDetail();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao criar time.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteTeam(tId: number) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/peladas/${peladaId}/teams/${tId}`, { method: 'DELETE' });
      await loadDetail();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao remover time.');
    } finally {
      setBusy(false);
    }
  }

  async function handleStartMatch(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/peladas/${peladaId}/matches`, {
        method: 'POST',
        body: JSON.stringify({ teamAId, teamBId, durationMinutes: 10 }),
      });
      await loadDetail();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao iniciar partida.');
    } finally {
      setBusy(false);
    }
  }

  async function handleLogGoal(e: React.FormEvent) {
    e.preventDefault();
    if (!liveMatch || !scorerId || !goalTeamId) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/matches/${liveMatch.id}/events`, {
        method: 'POST',
        body: JSON.stringify({
          eventType: 'goal',
          teamId: goalTeamId,
          playerId: scorerId,
          assistPlayerId: assistId || null,
          minute: eventMinute,
        }),
      });
      setScorerId(0);
      setAssistId(0);
      await loadDetail();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao registrar gol.');
    } finally {
      setBusy(false);
    }
  }

  async function handleLogDefense(e: React.FormEvent) {
    e.preventDefault();
    if (!liveMatch || !defenderId || !defenseTeamId) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/matches/${liveMatch.id}/events`, {
        method: 'POST',
        body: JSON.stringify({
          eventType: 'defense',
          teamId: defenseTeamId,
          playerId: defenderId,
          minute: eventMinute,
        }),
      });
      setDefenderId(0);
      await loadDetail();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao registrar ação defensiva.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteEvent(eventId: number) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/match-events/${eventId}`, { method: 'DELETE' });
      await loadDetail();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao desfazer lance.');
    } finally {
      setBusy(false);
    }
  }

  async function handleFinishMatch(matchId: number) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/matches/${matchId}/finish`, { method: 'POST' });
      await loadDetail();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao encerrar partida.');
    } finally {
      setBusy(false);
    }
  }

  async function handleTogglePeladaStatus() {
    setBusy(true);
    setError(null);
    setFinanceBanner(null);
    try {
      const nextStatus = pelada.status === 'finished' ? 'in_progress' : 'finished';
      const res = await apiFetch<{
        financeSummary?: {
          chargesCreated?: number;
        } | null;
      }>(`/api/peladas/${peladaId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      if (nextStatus === 'finished' && res.financeSummary) {
        const created = res.financeSummary.chargesCreated ?? 0;
        setFinanceBanner(
          created > 0
            ? `Pelada encerrada! ${created} cobrança(s) de diária/mensalidade lançada(s) na aba Financeiro.`
            : 'Pelada encerrada! Confira o balanço e os pagamentos na aba Financeiro.'
        );
      }
      await loadDetail();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao alterar status da pelada.');
    } finally {
      setBusy(false);
    }
  }

  const getTeamPlayers = (tId: number) =>
    presentAttendances.filter((a) => a.teamId === tId);

  const liveGoalRoster = liveMatch ? getTeamPlayers(goalTeamId) : [];
  const liveDefenseRoster = liveMatch ? getTeamPlayers(defenseTeamId) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="space-y-1">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar para lista de peladas
          </button>
          <h2 className="font-display text-3xl font-extrabold text-slate-900">{pelada.title}</h2>
          <p className="text-xs text-slate-500">
            {pelada.location} · {pelada.eventDate} · {pelada.startTime} às {pelada.endTime} ·
            Formato {pelada.playersPerTeam}×{pelada.playersPerTeam} · {presentAttendances.length}{' '}
            confirmados ·{' '}
            <span className="font-semibold text-emerald-700">
              {pelada.status === 'finished' ? 'Finalizada' : 'Em andamento'}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {authUser.playerId != null && (
            <button
              type="button"
              onClick={() => setShowEncounterEval(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 cursor-pointer"
            >
              <Vote className="h-3.5 w-3.5" />
              Avaliar Jogadores do Encontro
            </button>
          )}
          {isAdmin && pelada.groupId != null && (
            <button
              type="button"
              onClick={() => setShowPeladaCriteriaModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <Sliders className="h-3.5 w-3.5 text-emerald-700" />
              Critérios deste Encontro
            </button>
          )}
          {authUser.playerId && (
            <button
              type="button"
              disabled={busy}
              onClick={() => handleToggleRsvp(!myAttendance?.present)}
              className={`rounded-lg px-3.5 py-2 text-xs font-semibold border transition-colors cursor-pointer ${
                myAttendance?.present
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {myAttendance?.present ? 'Presença Confirmada' : 'Confirmar Minha Presença'}
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              disabled={busy}
              onClick={handleTogglePeladaStatus}
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              {pelada.status === 'finished' ? 'Reabrir Pelada' : 'Encerrar Pelada'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {financeBanner && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-sm text-emerald-900">
          <span>{financeBanner}</span>
          {pelada.groupId != null && (
            <button
              type="button"
              onClick={() => setTab('finance')}
              className="rounded-md bg-emerald-700 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-800 cursor-pointer"
            >
              Abrir Financeiro
            </button>
          )}
        </div>
      )}

      <div className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => setTab('matches')}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            tab === 'matches'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Placar & Partidas
        </button>
        <button
          type="button"
          onClick={() => setTab('teams')}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            tab === 'teams'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Presenças & Times ({presentAttendances.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('stats')}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            tab === 'stats'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Estatísticas da Pelada
        </button>
        {pelada.groupId != null && (
          <button
            type="button"
            onClick={() => setTab('finance')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              tab === 'finance'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Wallet className="h-3.5 w-3.5 text-emerald-700" />
            Financeiro
          </button>
        )}
      </div>

      {tab === 'matches' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left 8 cols: Live Scoreboard & Match History */}
          <div className="lg:col-span-8 space-y-6">
            {liveMatch ? (
              <div className="rounded-xl bg-slate-900 text-white border border-slate-800 overflow-hidden">
                <div className="flex items-center justify-between px-6 py-3 bg-slate-950/60 border-b border-slate-800 text-xs">
                  <span className="font-semibold text-emerald-400">
                    Jogo #{liveMatch.matchNumber} · Em quadra
                  </span>
                  {isAdmin && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleFinishMatch(liveMatch.id)}
                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 cursor-pointer"
                    >
                      Finalizar Partida
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-3 items-center gap-4 px-6 py-8 text-center">
                  <div>
                    <span
                      className="inline-block h-2.5 w-10 rounded-full mb-2"
                      style={{ backgroundColor: teamMap.get(liveMatch.teamAId)?.colorHex ?? '#059669' }}
                    />
                    <h3 className="font-display text-2xl sm:text-3xl font-bold truncate">
                      {teamMap.get(liveMatch.teamAId)?.name ?? 'Time A'}
                    </h3>
                  </div>

                  <div className="font-display text-6xl sm:text-7xl font-extrabold tracking-tight tabular-nums">
                    {liveMatch.scoreA} <span className="text-slate-500 text-4xl">×</span>{' '}
                    {liveMatch.scoreB}
                  </div>

                  <div>
                    <span
                      className="inline-block h-2.5 w-10 rounded-full mb-2"
                      style={{ backgroundColor: teamMap.get(liveMatch.teamBId)?.colorHex ?? '#475569' }}
                    />
                    <h3 className="font-display text-2xl sm:text-3xl font-bold truncate">
                      {teamMap.get(liveMatch.teamBId)?.name ?? 'Time B'}
                    </h3>
                  </div>
                </div>

                {isAdmin && (
                  <div className="bg-white text-slate-900 p-5 border-t border-slate-800 space-y-4">
                    <form
                      onSubmit={handleLogGoal}
                      className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end"
                    >
                      <div className="sm:col-span-3">
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Gol para
                        </label>
                        <select
                          value={goalTeamId}
                          onChange={(e) => {
                            setGoalTeamId(Number(e.target.value));
                            setScorerId(0);
                            setAssistId(0);
                          }}
                          className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs bg-white"
                        >
                          <option value={liveMatch.teamAId}>
                            {teamMap.get(liveMatch.teamAId)?.name}
                          </option>
                          <option value={liveMatch.teamBId}>
                            {teamMap.get(liveMatch.teamBId)?.name}
                          </option>
                        </select>
                      </div>

                      <div className="sm:col-span-3">
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Autor do Gol *
                        </label>
                        <select
                          required
                          value={scorerId}
                          onChange={(e) => setScorerId(Number(e.target.value))}
                          className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs bg-white"
                        >
                          <option value={0}>Selecione...</option>
                          {liveGoalRoster.map((p) => (
                            <option key={p.playerId} value={p.playerId}>
                              {p.playerNickname}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="sm:col-span-3">
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Assistência (opcional)
                        </label>
                        <select
                          value={assistId}
                          onChange={(e) => setAssistId(Number(e.target.value))}
                          className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs bg-white"
                        >
                          <option value={0}>Sem assistência</option>
                          {liveGoalRoster
                            .filter((p) => p.playerId !== scorerId)
                            .map((p) => (
                              <option key={p.playerId} value={p.playerId}>
                                {p.playerNickname}
                              </option>
                            ))}
                        </select>
                      </div>

                      <div className="sm:col-span-1">
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Min
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={60}
                          value={eventMinute}
                          onChange={(e) => setEventMinute(Number(e.target.value))}
                          className="w-full rounded-lg border border-slate-300 px-2 py-2 text-xs font-mono tabular-nums"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <button
                          type="submit"
                          disabled={busy || !scorerId}
                          className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                        >
                          + Gol
                        </button>
                      </div>
                    </form>

                    <form
                      onSubmit={handleLogDefense}
                      className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end pt-3 border-t border-slate-100"
                    >
                      <div className="sm:col-span-4">
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Time (Ação Defensiva / Defesaça)
                        </label>
                        <select
                          value={defenseTeamId}
                          onChange={(e) => {
                            setDefenseTeamId(Number(e.target.value));
                            setDefenderId(0);
                          }}
                          className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs bg-white"
                        >
                          <option value={liveMatch.teamAId}>
                            {teamMap.get(liveMatch.teamAId)?.name}
                          </option>
                          <option value={liveMatch.teamBId}>
                            {teamMap.get(liveMatch.teamBId)?.name}
                          </option>
                        </select>
                      </div>
                      <div className="sm:col-span-5">
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Jogador (Desarme / Defesa Difícil)
                        </label>
                        <select
                          value={defenderId}
                          onChange={(e) => setDefenderId(Number(e.target.value))}
                          className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs bg-white"
                        >
                          <option value={0}>Selecione o defensor/goleiro...</option>
                          {liveDefenseRoster.map((p) => (
                            <option key={p.playerId} value={p.playerId}>
                              {p.playerNickname} ({p.playerPosition})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="sm:col-span-3">
                        <button
                          type="submit"
                          disabled={busy || !defenderId}
                          className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
                        >
                          + Ação Defensiva
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {liveMatch.events.length > 0 && (
                  <div className="bg-slate-50 text-slate-800 px-5 py-3 border-t border-slate-200 space-y-1.5">
                    <p className="text-[11px] font-semibold text-slate-500">Súmula da Partida</p>
                    {liveMatch.events.map((ev) => {
                      const scorer = playerMap.get(ev.playerId);
                      const assister = ev.assistPlayerId ? playerMap.get(ev.assistPlayerId) : null;
                      const team = teamMap.get(ev.teamId);
                      return (
                        <div
                          key={ev.id}
                          className="flex items-center justify-between text-xs py-1 border-b border-slate-200/70 last:border-0"
                        >
                          <span>
                            <span className="font-mono tabular-nums text-slate-500 mr-2">
                              {ev.minute}&apos;
                            </span>
                            {ev.eventType === 'goal' ? (
                              <>
                                <strong className="text-emerald-700">GOL</strong> ·{' '}
                                <strong>{scorer?.nickname ?? 'Jogador'}</strong> ({team?.name})
                                {assister ? ` · Assist. ${assister.nickname}` : ''}
                              </>
                            ) : (
                              <>
                                <strong className="text-slate-700">DEFESA</strong> ·{' '}
                                <strong>{scorer?.nickname ?? 'Jogador'}</strong> ({team?.name})
                              </>
                            )}
                          </span>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => handleDeleteEvent(ev.id)}
                              className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"
                              title="Desfazer lance"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white p-6">
                <h3 className="font-display text-2xl font-bold text-slate-900 mb-1">
                  Iniciar Nova Partida na Pelada
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  Escolha os dois times que entram em quadra para registrar gols, assistências e
                  vitórias.
                </p>

                {isAdmin ? (
                  teams.length >= 2 ? (
                    <form
                      onSubmit={handleStartMatch}
                      className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
                    >
                      <div className="sm:col-span-4">
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Time A
                        </label>
                        <select
                          value={teamAId}
                          onChange={(e) => setTeamAId(Number(e.target.value))}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                        >
                          {teams.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name} ({getTeamPlayers(t.id).length} jog.)
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="sm:col-span-4">
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Time B
                        </label>
                        <select
                          value={teamBId}
                          onChange={(e) => setTeamBId(Number(e.target.value))}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                        >
                          {teams.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name} ({getTeamPlayers(t.id).length} jog.)
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="sm:col-span-4">
                        <button
                          type="submit"
                          disabled={busy || teamAId === teamBId}
                          className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                        >
                          Apitar Início da Partida
                        </button>
                      </div>
                    </form>
                  ) : (
                    <p className="text-sm text-amber-700">
                      Crie pelo menos 2 times na aba Presenças & Times.
                    </p>
                  )
                ) : (
                  <p className="text-sm text-slate-500">
                    Aguardando o administrador iniciar a próxima partida.
                  </p>
                )}
              </div>
            )}

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-slate-900">
                  Histórico de Partidas do Evento ({matches.length})
                </h3>
              </div>

              {matches.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center border border-dashed border-slate-200 rounded-lg">
                  Nenhuma partida iniciada nesta pelada ainda.
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {matches.map((m) => {
                    const tA = teamMap.get(m.teamAId);
                    const tB = teamMap.get(m.teamBId);
                    return (
                      <div
                        key={m.id}
                        className="py-3.5 flex flex-wrap items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono tabular-nums text-xs text-slate-500 w-14">
                            Jogo #{m.matchNumber}
                          </span>
                          <div className="text-sm font-semibold text-slate-900">
                            {tA?.name ?? 'Time A'}{' '}
                            <span className="font-mono tabular-nums mx-2 text-base font-bold">
                              {m.scoreA} × {m.scoreB}
                            </span>{' '}
                            {tB?.name ?? 'Time B'}
                          </div>
                          <span className="text-xs text-slate-500">
                            · {m.status === 'finished' ? 'Finalizado' : 'Ao vivo'}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setEvaluatingMatch(m)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 cursor-pointer"
                          >
                            <Star className="h-3.5 w-3.5" />
                            Avaliar Jogadores
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right 4 cols: Live Team Wins Standings */}
          <div className="lg:col-span-4 space-y-6">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2 mb-3">
                <Trophy className="h-4 w-4 text-amber-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Placar de Vitórias por Time
                </h3>
              </div>
              <p className="text-xs text-slate-500 mb-4">
                Atualizado automaticamente a cada partida finalizada na pelada.
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="py-2 text-left font-semibold">Time</th>
                      <th className="py-2 text-right font-semibold">V</th>
                      <th className="py-2 text-right font-semibold">E</th>
                      <th className="py-2 text-right font-semibold">D</th>
                      <th className="py-2 text-right font-semibold">SG</th>
                      <th className="py-2 text-right font-semibold">Pts</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stats.teamStandings.map((t) => {
                      const pts = t.wins * 3 + t.draws;
                      const sg = t.goalsFor - t.goalsAgainst;
                      return (
                        <tr key={t.id}>
                          <td className="py-2.5 font-semibold text-slate-900 flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-sm shrink-0"
                              style={{ backgroundColor: t.colorHex }}
                            />
                            <span className="truncate max-w-[110px]">{t.name}</span>
                          </td>
                          <td className="py-2.5 text-right font-mono tabular-nums font-bold text-emerald-700">
                            {t.wins}
                          </td>
                          <td className="py-2.5 text-right font-mono tabular-nums text-slate-600">
                            {t.draws}
                          </td>
                          <td className="py-2.5 text-right font-mono tabular-nums text-slate-600">
                            {t.losses}
                          </td>
                          <td className="py-2.5 text-right font-mono tabular-nums text-slate-600">
                            {sg > 0 ? `+${sg}` : sg}
                          </td>
                          <td className="py-2.5 text-right font-mono tabular-nums font-bold text-slate-900">
                            {pts}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'teams' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Lista de Presença</h3>
                <p className="text-xs text-slate-500">
                  Marque quem compareceu para separar os times.
                </p>
              </div>
              <span className="font-mono tabular-nums text-sm font-bold text-emerald-700">
                {presentAttendances.length}/{eligiblePlayers.length}
              </span>
            </div>

            <div className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto">
              {eligiblePlayers.map((p) => {
                const att = attendanceMap.get(p.id);
                const isPresent = Boolean(att?.present);
                const cat = p.category ?? 'mensalista';
                return (
                  <div key={p.id} className="py-2.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <PlayerAvatar name={p.name} photoUrl={p.photoUrl} size="sm" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="text-xs font-semibold text-slate-900 truncate">
                            {p.nickname}
                          </p>
                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                              cat === 'mensalista'
                                ? 'bg-emerald-50 text-emerald-800'
                                : cat === 'avulso'
                                  ? 'bg-amber-50 text-amber-800'
                                  : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {CATEGORY_LABELS[cat]}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          {p.position} · Nota{' '}
                          <span className="font-mono tabular-nums font-semibold">
                            {p.curOverall.toFixed(1)}
                          </span>
                        </p>
                      </div>
                    </div>

                    {isAdmin ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleAdminAttendance(p.id, !isPresent)}
                        className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold border cursor-pointer ${
                          isPresent
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {isPresent && <Check className="h-3.5 w-3.5" />}
                        {isPresent ? 'Presente' : 'Confirmar'}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-500">
                        {isPresent ? 'Presente' : 'Ausente'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-7 space-y-5">
            {isAdmin && (
              <div className="rounded-xl border border-slate-200 bg-white p-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Separação dos Times</h3>
                  <p className="text-xs text-slate-500">
                    Distribui goleiros primeiro e equilibra os times pela nota atual dos jogadores.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={busy || presentAttendances.length < 2}
                  onClick={handleAutoBalance}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                >
                  <Shuffle className="h-4 w-4" />
                  Equilibrar Times Automaticamente
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {teams.map((t) => {
                const roster = getTeamPlayers(t.id);
                const avg =
                  roster.length > 0
                    ? roster.reduce((s, r) => s + r.playerOverall, 0) / roster.length
                    : 0;
                return (
                  <div key={t.id} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-sm"
                          style={{ backgroundColor: t.colorHex }}
                        />
                        <h4 className="font-bold text-sm text-slate-900">{t.name}</h4>
                        <span className="text-xs text-slate-500">({roster.length})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono tabular-nums font-semibold text-emerald-700">
                          Média {avg.toFixed(2)}
                        </span>
                        {isAdmin && teams.length > 2 && (
                          <button
                            type="button"
                            onClick={() => handleDeleteTeam(t.id)}
                            className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"
                            title="Excluir time"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {roster.length === 0 ? (
                      <p className="text-xs text-slate-400 py-4 text-center">
                        Nenhum jogador alocado neste time.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {roster.map((r) => (
                          <div
                            key={r.playerId}
                            className="flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="min-w-0">
                              <span className="font-semibold text-slate-900">
                                {r.playerNickname}
                              </span>{' '}
                              <span className="text-slate-500">
                                · {r.playerPosition} ·{' '}
                                <span className="font-mono tabular-nums">
                                  {r.playerOverall.toFixed(1)}
                                </span>
                              </span>
                            </div>
                            {isAdmin && (
                              <select
                                value={r.teamId ?? ''}
                                onChange={(e) =>
                                  handleAdminAttendance(
                                    r.playerId,
                                    true,
                                    e.target.value ? Number(e.target.value) : null
                                  )
                                }
                                className="rounded border border-slate-200 px-1.5 py-1 text-[11px] bg-slate-50"
                              >
                                <option value="">Sem time</option>
                                {teams.map((opt) => (
                                  <option key={opt.id} value={opt.id}>
                                    {opt.name}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Unassigned present players */}
            {presentAttendances.some((a) => !a.teamId) && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                <h4 className="text-xs font-bold text-amber-900 mb-2">
                  Confirmados sem time definido
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {presentAttendances
                    .filter((a) => !a.teamId)
                    .map((a) => (
                      <div
                        key={a.playerId}
                        className="flex items-center justify-between bg-white rounded-lg border border-amber-200 px-3 py-2 text-xs"
                      >
                        <span className="font-semibold text-slate-900">
                          {a.playerNickname} ({a.playerPosition})
                        </span>
                        {isAdmin && (
                          <select
                            value=""
                            onChange={(e) =>
                              handleAdminAttendance(
                                a.playerId,
                                true,
                                e.target.value ? Number(e.target.value) : null
                              )
                            }
                            className="rounded border border-slate-300 px-2 py-1 text-[11px]"
                          >
                            <option value="">Alocar em...</option>
                            {teams.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}

            {isAdmin && (
              <form
                onSubmit={handleAddTeam}
                className="rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap items-end gap-3"
              >
                <div className="flex-1 min-w-[160px]">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Adicionar novo time na pelada
                  </label>
                  <input
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    placeholder="Ex: Time Laranja"
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Cor</label>
                  <input
                    type="color"
                    value={newTeamColor}
                    onChange={(e) => setNewTeamColor(e.target.value)}
                    className="h-9 w-14 rounded border border-slate-300 cursor-pointer"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy || !newTeamName.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" /> Criar Time
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {tab === 'stats' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                <Flame className="h-3.5 w-3.5 text-emerald-600" />
                Artilheiro da Pelada
              </div>
              <p className="font-bold text-slate-900 text-base truncate">
                {stats.topScorers[0] && stats.topScorers[0].goals > 0
                  ? `${stats.topScorers[0].nickname} (${stats.topScorers[0].goals} gols)`
                  : 'Sem gols ainda'}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                <Award className="h-3.5 w-3.5 text-amber-600" />
                Mais Assistências
              </div>
              <p className="font-bold text-slate-900 text-base truncate">
                {stats.topAssists[0] && stats.topAssists[0].assists > 0
                  ? `${stats.topAssists[0].nickname} (${stats.topAssists[0].assists} ass.)`
                  : 'Sem assistências'}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                <Shield className="h-3.5 w-3.5 text-slate-700" />
                Melhor Defensor
              </div>
              <p className="font-bold text-slate-900 text-base truncate">
                {stats.bestDefenders[0]
                  ? `${stats.bestDefenders[0].nickname} (${stats.bestDefenders[0].defenderScore.toFixed(1)})`
                  : '—'}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                <Users className="h-3.5 w-3.5 text-emerald-600" />
                Resumo do Evento
              </div>
              <p className="font-mono tabular-nums font-bold text-slate-900 text-base">
                {stats.totals.matchesCount} jogos · {stats.totals.goalsCount} gols
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900">
                Desempenho Individual na Pelada
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Jogador</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Jogos</th>
                    <th className="px-4 py-2.5 font-semibold text-right">V-E-D</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Gols</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Assist.</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Defesas</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Nota</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stats.playersStats.map((st) => (
                    <tr key={st.playerId} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-semibold text-slate-900">
                        {st.nickname}{' '}
                        <span className="font-normal text-slate-500">· {st.position}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                        {st.matchesPlayed}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                        {st.wins}-{st.draws}-{st.losses}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums font-bold text-emerald-700">
                        {st.goals}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                        {st.assists}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                        {st.defensiveActions}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums font-bold">
                        {st.curOverall.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'finance' && pelada.groupId != null && (
        <PeladaFinanceView
          groupId={pelada.groupId}
          players={allPlayers}
          scopedPeladaId={pelada.id}
          scopedPeladaTitle={pelada.title}
        />
      )}

      {evaluatingMatch && (
        <EvaluationModal
          match={evaluatingMatch}
          attendances={attendances}
          currentUserId={authUser.id}
          criteriaConfig={detail.criteriaConfig}
          onClose={() => setEvaluatingMatch(null)}
          onEvaluated={() => {
            loadDetail();
            onRefreshPlayers();
          }}
        />
      )}

      {showEncounterEval && (
        <EncounterEvaluationModal
          pelada={pelada}
          onClose={() => setShowEncounterEval(false)}
          onEvaluated={() => {
            loadDetail();
            onRefreshPlayers();
          }}
        />
      )}

      {showPeladaCriteriaModal && pelada.groupId != null && (
        <CriteriaConfigModal
          groupId={pelada.groupId}
          groupName={pelada.title}
          peladaId={pelada.id}
          peladaTitle={pelada.title}
          initialCriteria={detail.criteriaConfig ?? DEFAULT_GROUP_CRITERIA}
          onClose={() => setShowPeladaCriteriaModal(false)}
          onSaved={() => {
            setShowPeladaCriteriaModal(false);
            loadDetail();
            onRefreshPlayers();
          }}
        />
      )}
    </div>
  );
}
