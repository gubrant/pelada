import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CalendarPlus,
  CheckCircle2,
  Crown,
  Edit3,
  HeartPulse,
  Plus,
  Receipt,
  Shuffle,
  Sliders,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  SKILL_CRITERIA,
  type AuthUser,
  type EncounterAttendanceItem,
  type EncounterTeamDraw,
  type MemberCategory,
  type PeladaEncounter,
  type PeladaMembership,
  type WeeklyPelada,
} from '../types/pelada';
import { MemberMedicalModal } from './MemberMedicalModal';
import { MemberRatingModal } from './MemberRatingModal';
import { PeladaFinanceTab } from './PeladaFinanceTab';

interface PeladaWorkspaceProps {
  pelada: WeeklyPelada;
  currentUser: AuthUser;
  onBack: () => void;
  onEditPelada: (pelada: WeeklyPelada) => void;
  onRefreshPeladas: () => void;
}

type WorkspaceTab = 'encounters' | 'members' | 'finance';

interface EncounterDetailResponse {
  encounter: PeladaEncounter;
  pelada: WeeklyPelada;
  attendances: EncounterAttendanceItem[];
  latestDraw: EncounterTeamDraw | null;
}

interface AdminUserOption {
  id: number;
  name: string;
  email: string;
}

function formatMoney(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export const PeladaWorkspace: React.FC<PeladaWorkspaceProps> = ({
  pelada,
  currentUser,
  onBack,
  onEditPelada,
  onRefreshPeladas,
}) => {
  const isAdmin = currentUser.role === 'admin';
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('encounters');

  // Membros desta pelada
  const [members, setMembers] = useState<PeladaMembership[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [ratingTarget, setRatingTarget] = useState<PeladaMembership | null>(null);
  const [medicalTarget, setMedicalTarget] = useState<{
    userId: number;
    name: string;
  } | null>(null);

  // Adicionar membro existente (Admin)
  const [allUsers, setAllUsers] = useState<AdminUserOption[]>([]);
  const [addUserId, setAddUserId] = useState('');
  const [addCategory, setAddCategory] = useState<MemberCategory>('mensalista');
  const [addingMember, setAddingMember] = useState(false);

  // Encontros
  const [encounters, setEncounters] = useState<PeladaEncounter[]>([]);
  const [selectedEncounterId, setSelectedEncounterId] = useState<number | null>(null);
  const [encounterDetail, setEncounterDetail] = useState<EncounterDetailResponse | null>(null);
  const [loadingEncounters, setLoadingEncounters] = useState(true);
  const [showNewEncounterForm, setShowNewEncounterForm] = useState(false);
  const [newEncDate, setNewEncDate] = useState(new Date().toISOString().slice(0, 10));
  const [newEncTitle, setNewEncTitle] = useState('');
  const [newEncMaxPlayers, setNewEncMaxPlayers] = useState(
    pelada.maxPlayers ? String(pelada.maxPlayers) : ''
  );
  const [creatingEncounter, setCreatingEncounter] = useState(false);

  // Sorteio
  const [drawTeamsCount, setDrawTeamsCount] = useState(pelada.defaultTeamsCount || 2);
  const [drawingTeams, setDrawingTeams] = useState(false);
  const [markingAttendance, setMarkingAttendance] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const myMembership = members.find((m) => m.userId === currentUser.id) || null;

  const loadMembers = async () => {
    setLoadingMembers(true);
    try {
      const res = await apiFetch<{ members: PeladaMembership[] }>(
        `/api/peladas/${pelada.id}/members`
      );
      setMembers(res.members);
      if (isAdmin) {
        const usersRes = await apiFetch<{ users: AdminUserOption[] }>('/api/admin/users');
        setAllUsers(usersRes.users);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar membros.');
    } finally {
      setLoadingMembers(false);
    }
  };

  const loadEncounters = async (preferId?: number | null) => {
    setLoadingEncounters(true);
    try {
      const res = await apiFetch<{ encounters: PeladaEncounter[] }>(
        `/api/peladas/${pelada.id}/encounters`
      );
      setEncounters(res.encounters);
      const nextId =
        preferId && res.encounters.some((e) => e.id === preferId)
          ? preferId
          : selectedEncounterId && res.encounters.some((e) => e.id === selectedEncounterId)
            ? selectedEncounterId
            : res.encounters[0]?.id || null;
      setSelectedEncounterId(nextId);
      if (nextId) {
        await loadEncounterDetail(nextId);
      } else {
        setEncounterDetail(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar encontros.');
    } finally {
      setLoadingEncounters(false);
    }
  };

  const loadEncounterDetail = async (encounterId: number) => {
    try {
      const detail = await apiFetch<EncounterDetailResponse>(
        `/api/encounters/${encounterId}`
      );
      setEncounterDetail(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar detalhes do encontro.');
    }
  };

  useEffect(() => {
    setError(null);
    loadMembers();
    loadEncounters();
  }, [pelada.id]);

  const handleJoinPelada = async () => {
    setError(null);
    try {
      await apiFetch(`/api/peladas/${pelada.id}/join`, { method: 'POST' });
      await loadMembers();
      onRefreshPeladas();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao ingressar na pelada.');
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addUserId) return;
    setError(null);
    setAddingMember(true);
    try {
      await apiFetch(`/api/peladas/${pelada.id}/members`, {
        method: 'POST',
        body: JSON.stringify({
          userId: Number(addUserId),
          category: addCategory,
        }),
      });
      setAddUserId('');
      await loadMembers();
      onRefreshPeladas();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao adicionar membro.');
    } finally {
      setAddingMember(false);
    }
  };

  const handleRemoveMember = async (membershipId: number) => {
    setError(null);
    try {
      await apiFetch(`/api/peladas/${pelada.id}/members/${membershipId}`, {
        method: 'DELETE',
      });
      await loadMembers();
      onRefreshPeladas();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover membro.');
    }
  };

  const handleCreateEncounter = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCreatingEncounter(true);
    try {
      const res = await apiFetch<{ encounter: PeladaEncounter }>(
        `/api/peladas/${pelada.id}/encounters`,
        {
          method: 'POST',
          body: JSON.stringify({
            eventDate: newEncDate,
            title: newEncTitle.trim() || `${pelada.name} — ${newEncDate}`,
            startTime: pelada.startTime,
            endTime: pelada.endTime,
            maxPlayers: newEncMaxPlayers.trim() ? Number(newEncMaxPlayers) : null,
          }),
        }
      );
      setNewEncTitle('');
      setShowNewEncounterForm(false);
      await loadEncounters(res.encounter.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar encontro.');
    } finally {
      setCreatingEncounter(false);
    }
  };

  const handleMarkAttendance = async (
    status: 'confirmed' | 'absent',
    targetUserId?: number
  ) => {
    if (!selectedEncounterId) return;
    setError(null);
    setMarkingAttendance(true);
    try {
      const detail = await apiFetch<EncounterDetailResponse>(
        `/api/encounters/${selectedEncounterId}/attendance`,
        {
          method: 'POST',
          body: JSON.stringify({
            status,
            ...(targetUserId ? { userId: targetUserId } : {}),
          }),
        }
      );
      setEncounterDetail(detail);
      await loadMembers();
      await loadEncounters(selectedEncounterId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao registrar presença.');
    } finally {
      setMarkingAttendance(false);
    }
  };

  const handleDrawTeams = async () => {
    if (!selectedEncounterId) return;
    setError(null);
    setDrawingTeams(true);
    try {
      const detail = await apiFetch<EncounterDetailResponse>(
        `/api/encounters/${selectedEncounterId}/draw`,
        {
          method: 'POST',
          body: JSON.stringify({ teamsCount: drawTeamsCount }),
        }
      );
      setEncounterDetail(detail);
      await loadEncounters(selectedEncounterId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao sortear times.');
    } finally {
      setDrawingTeams(false);
    }
  };

  const availableUsersToAdd = allUsers.filter(
    (u) => !members.some((m) => m.userId === u.id)
  );

  const confirmedAttendances =
    encounterDetail?.attendances.filter((a) => a.status === 'confirmed') || [];
  const absentAttendances =
    encounterDetail?.attendances.filter((a) => a.status === 'absent') || [];
  const myCurrentAttendance = encounterDetail?.attendances.find(
    (a) => a.userId === currentUser.id
  );

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Pelada Fixa */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Voltar às Peladas da Semana
            </button>
            <h1 className="font-display text-3xl font-bold uppercase tracking-tight text-slate-900">
              {pelada.name}
            </h1>
            <p className="text-xs font-medium text-slate-500">
              {pelada.weekday} · <span className="font-mono">{pelada.startTime}–{pelada.endTime}</span> · {pelada.location}
              {pelada.maxPlayers ? ` · Limite ${pelada.maxPlayers} vagas` : ''}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs">
              <span className="text-slate-500">Mensalista: </span>
              <span className="font-mono font-bold tabular-nums text-slate-900">
                {formatMoney(pelada.mensalistaFee)}
              </span>
              <span className="mx-2 text-slate-300">|</span>
              <span className="text-slate-500">Avulso: </span>
              <span className="font-mono font-bold tabular-nums text-slate-900">
                {formatMoney(pelada.avulsoFee)}
              </span>
            </div>

            {!myMembership && (
              <button
                type="button"
                onClick={handleJoinPelada}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                <UserPlus className="h-4 w-4" />
                Participar desta Pelada
              </button>
            )}

            {isAdmin && (
              <button
                type="button"
                onClick={() => onEditPelada(pelada)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Edit3 className="h-3.5 w-3.5" />
                Configurar Pelada & PIX
              </button>
            )}
          </div>
        </div>

        {/* Navegação por Abas */}
        <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={() => setActiveTab('encounters')}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
              activeTab === 'encounters'
                ? 'bg-slate-900 text-white'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Shuffle className="h-3.5 w-3.5" />
            Encontros, Presença & Sorteio
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('members')}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
              activeTab === 'members'
                ? 'bg-slate-900 text-white'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            Membros & Notas ({members.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('finance')}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
              activeTab === 'finance'
                ? 'bg-slate-900 text-white'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Receipt className="h-3.5 w-3.5" />
            Fluxo Financeiro & Comprovantes
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">
          {error}
        </div>
      )}

      {/* ===================================================================== */}
      {/* ABA 1: ENCONTROS, PRESENÇA (MENSALISTA PRIORIDADE) & SORTEIO 6 CRITÉRIOS */}
      {/* ===================================================================== */}
      {activeTab === 'encounters' && (
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Coluna Esquerda: Lista de Encontros */}
          <div className="lg:col-span-4 space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Agenda de Encontros
                </h2>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setShowNewEncounterForm((v) => !v)}
                    className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    <CalendarPlus className="h-3.5 w-3.5" />
                    Novo Jogo
                  </button>
                )}
              </div>

              {showNewEncounterForm && isAdmin && (
                <form
                  onSubmit={handleCreateEncounter}
                  className="mt-4 space-y-3 border-t border-slate-200 pt-3"
                >
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">
                      Data do encontro *
                    </label>
                    <input
                      type="date"
                      required
                      value={newEncDate}
                      onChange={(e) => setNewEncDate(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm tabular-nums outline-none focus:border-emerald-600"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">
                      Título (opcional)
                    </label>
                    <input
                      type="text"
                      value={newEncTitle}
                      onChange={(e) => setNewEncTitle(e.target.value)}
                      placeholder={`${pelada.name} — Rodada`}
                      className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-emerald-600"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">
                      Limite de vagas (opcional)
                    </label>
                    <input
                      type="number"
                      min={4}
                      max={100}
                      value={newEncMaxPlayers}
                      onChange={(e) => setNewEncMaxPlayers(e.target.value)}
                      placeholder="Sem limite"
                      className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm tabular-nums outline-none focus:border-emerald-600"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowNewEncounterForm(false)}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={creatingEncounter}
                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      {creatingEncounter ? 'Criando...' : 'Criar Encontro'}
                    </button>
                  </div>
                </form>
              )}

              <div className="mt-4 space-y-2">
                {loadingEncounters ? (
                  <p className="py-6 text-center text-xs text-slate-500">Carregando...</p>
                ) : encounters.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-500">
                    Nenhum encontro agendado ainda.{' '}
                    {isAdmin ? 'Clique em "Novo Jogo" acima.' : 'Aguarde o administrador abrir a lista.'}
                  </p>
                ) : (
                  encounters.map((enc) => {
                    const selected = enc.id === selectedEncounterId;
                    return (
                      <button
                        key={enc.id}
                        type="button"
                        onClick={() => {
                          setSelectedEncounterId(enc.id);
                          loadEncounterDetail(enc.id);
                        }}
                        className={`w-full rounded-lg border p-3 text-left transition-colors ${
                          selected
                            ? 'border-emerald-600 bg-emerald-50/70'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-bold tabular-nums text-slate-900">
                            {enc.eventDate}
                          </span>
                          <span className="text-[11px] font-semibold text-slate-500">
                            {enc.confirmedCount || 0} confirmados
                          </span>
                        </div>
                        <p className="mt-1 truncate text-xs font-semibold text-slate-800">
                          {enc.title}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          {enc.startTime}–{enc.endTime} ·{' '}
                          {enc.hasTeamDraw ? 'Times sorteados' : 'Presença aberta'}
                        </p>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Coluna Direita: Lista de Presença & Sorteio do Encontro Selecionado */}
          <div className="lg:col-span-8 space-y-6">
            {!encounterDetail ? (
              <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
                Selecione ou crie um encontro para gerenciar presenças e sortear os times.
              </div>
            ) : (
              <>
                {/* Cartão de Marcação do Próprio Peladeiro */}
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h3 className="font-display text-2xl font-bold uppercase tracking-tight text-slate-900">
                        {encounterDetail.encounter.title}
                      </h3>
                      <p className="text-xs text-slate-500">
                        Data: <span className="font-mono">{encounterDetail.encounter.eventDate}</span> ·{' '}
                        Horário: <span className="font-mono">{encounterDetail.encounter.startTime}–{encounterDetail.encounter.endTime}</span>
                        {encounterDetail.encounter.maxPlayers
                          ? ` · Limite: ${encounterDetail.encounter.maxPlayers} jogadores`
                          : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={markingAttendance}
                        onClick={() => handleMarkAttendance('confirmed')}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
                          myCurrentAttendance?.status === 'confirmed'
                            ? 'bg-emerald-600 text-white'
                            : 'border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                        }`}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Vou Jogar (Presente)
                      </button>

                      <button
                        type="button"
                        disabled={markingAttendance}
                        onClick={() => handleMarkAttendance('absent')}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
                          myCurrentAttendance?.status === 'absent'
                            ? 'bg-rose-600 text-white'
                            : 'border border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100'
                        }`}
                      >
                        <XCircle className="h-4 w-4" />
                        Ausente
                      </button>
                    </div>
                  </div>

                  {/* Controle Rápido do Admin para confirmar/ausentar qualquer membro */}
                  {isAdmin && members.length > 0 && (
                    <div className="mt-4 border-t border-slate-100 pt-3">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        Marcação rápida pelo Administrador:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {members.map((m) => {
                          const att = encounterDetail.attendances.find(
                            (a) => a.userId === m.userId
                          );
                          const isConfirmed = att?.status === 'confirmed';
                          return (
                            <button
                              key={m.userId}
                              type="button"
                              onClick={() =>
                                handleMarkAttendance(isConfirmed ? 'absent' : 'confirmed', m.userId)
                              }
                              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                                isConfirmed
                                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                                  : att?.status === 'absent'
                                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              {m.category === 'mensalista' && (
                                <Crown className="h-3 w-3 text-amber-600" />
                              )}
                              <span>{m.nickname || m.userName.split(' ')[0]}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Lista de Confirmados Ordenada com Prioridade de Mensalista */}
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3.5">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        Confirmados ({confirmedAttendances.length})
                      </h4>
                      <p className="text-xs text-slate-500">
                        Mensalistas possuem prioridade automática no topo da lista.
                      </p>
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-medium text-slate-600">Times:</label>
                        <select
                          value={drawTeamsCount}
                          onChange={(e) => setDrawTeamsCount(Number(e.target.value))}
                          className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold tabular-nums"
                        >
                          {[2, 3, 4, 5, 6].map((n) => (
                            <option key={n} value={n}>
                              {n} times
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={drawingTeams || confirmedAttendances.length < 2}
                          onClick={handleDrawTeams}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <Shuffle className="h-3.5 w-3.5" />
                          {drawingTeams ? 'Sorteando...' : 'Sortear Times (6 Critérios)'}
                        </button>
                      </div>
                    )}
                  </div>

                  {confirmedAttendances.length === 0 ? (
                    <p className="p-6 text-center text-xs text-slate-500">
                      Nenhum jogador confirmou presença ainda.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {confirmedAttendances.map((item) => (
                        <div
                          key={item.id}
                          className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                        >
                          <div className="flex items-center gap-3">
                            <span className="w-7 font-mono text-xs font-bold tabular-nums text-slate-400">
                              #{item.priorityRank}
                            </span>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-slate-900">
                                  {item.userName}
                                  {item.nickname ? ` (${item.nickname})` : ''}
                                </span>
                                <span
                                  className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                                    item.category === 'mensalista'
                                      ? 'border border-amber-200 bg-amber-50 text-amber-800'
                                      : 'border border-slate-200 bg-slate-100 text-slate-700'
                                  }`}
                                >
                                  {item.category === 'mensalista' ? (
                                    <>
                                      <Crown className="h-3 w-3" />
                                      Mensalista · Prioridade
                                    </>
                                  ) : (
                                    'Avulso'
                                  )}
                                </span>
                                {!item.inMainSquad && (
                                  <span className="rounded-md border border-slate-300 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                    Lista de Espera
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-500">
                                {item.preferredPosition} · Pé {item.dominantFoot}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-4">
                            <div className="hidden sm:flex items-center gap-2 text-[11px] font-mono tabular-nums text-slate-500">
                              <span>DRI {item.dribbling.toFixed(1)}</span>
                              <span>PRE {item.physical.toFixed(1)}</span>
                              <span>PAS {item.passing.toFixed(1)}</span>
                              <span>ATA {item.attack.toFixed(1)}</span>
                              <span>DEF {item.defense.toFixed(1)}</span>
                              <span>CHU {item.shooting.toFixed(1)}</span>
                            </div>
                            <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-mono text-xs font-bold tabular-nums text-emerald-800">
                              {item.overall.toFixed(1)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {absentAttendances.length > 0 && (
                    <div className="border-t border-slate-200 bg-slate-50 px-5 py-3">
                      <p className="text-xs font-semibold text-slate-600">
                        Ausentes ({absentAttendances.length}):{' '}
                        <span className="font-normal text-slate-500">
                          {absentAttendances.map((a) => a.nickname || a.userName).join(', ')}
                        </span>
                      </p>
                    </div>
                  )}
                </div>

                {/* Resultado do Sorteio de Times Equilibrados */}
                {encounterDetail.latestDraw && (
                  <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                      <div>
                        <h4 className="font-display text-xl font-bold uppercase tracking-tight text-slate-900">
                          Times Sorteados — Equilíbrio nos 6 Critérios
                        </h4>
                        <p className="text-xs text-slate-500">
                          Sorteio baseado em Drible, Preparo físico, Passe, Ataque, Defesa e Chute
                          com as notas desta pelada.
                        </p>
                      </div>
                      <span className="font-mono text-xs text-slate-500">
                        {encounterDetail.latestDraw.teams.length} times formados
                      </span>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      {encounterDetail.latestDraw.teams.map((team) => (
                        <div
                          key={team.teamIndex}
                          className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/40"
                        >
                          <div
                            className="flex items-center justify-between px-4 py-2.5 text-white"
                            style={{ backgroundColor: team.colorHex }}
                          >
                            <span className="font-display text-lg font-bold uppercase tracking-wide">
                              {team.name}
                            </span>
                            <span className="font-mono text-sm font-bold tabular-nums">
                              Média {team.avgOverall.toFixed(1)}
                            </span>
                          </div>

                          <div className="divide-y divide-slate-200 bg-white">
                            {team.players.map((p) => (
                              <div
                                key={p.userId}
                                className="flex items-center justify-between px-4 py-2 text-xs"
                              >
                                <div>
                                  <p className="font-semibold text-slate-900">
                                    {p.name}
                                    {p.nickname ? ` (${p.nickname})` : ''}
                                  </p>
                                  <p className="text-[11px] text-slate-500">
                                    {p.position} ·{' '}
                                    {p.category === 'mensalista' ? 'Mensalista' : 'Avulso'}
                                  </p>
                                </div>
                                <span className="font-mono font-bold tabular-nums text-slate-800">
                                  {p.overall.toFixed(1)}
                                </span>
                              </div>
                            ))}
                          </div>

                          <div className="grid grid-cols-6 gap-1 border-t border-slate-200 bg-slate-50 px-3 py-2 text-center">
                            {SKILL_CRITERIA.map((c) => (
                              <div key={c.key}>
                                <p className="text-[10px] font-semibold text-slate-500">
                                  {c.shortLabel}
                                </p>
                                <p className="font-mono text-xs font-bold tabular-nums text-slate-800">
                                  {team.avgScores[c.key].toFixed(1)}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* ABA 2: MEMBROS & NOTAS DISTINTAS DESTA PELADA                         */}
      {/* ===================================================================== */}
      {activeTab === 'members' && (
        <div className="space-y-6">
          {isAdmin && (
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="text-sm font-bold text-slate-900">
                Adicionar Membro Cadastrado a "{pelada.name}"
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                As notas iniciais são importadas da autoavaliação na ficha de ingresso e depois
                podem ser personalizadas apenas para esta pelada.
              </p>

              <form onSubmit={handleAddMember} className="mt-4 flex flex-wrap gap-3">
                <select
                  value={addUserId}
                  onChange={(e) => setAddUserId(e.target.value)}
                  className="min-w-[240px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600"
                >
                  <option value="">
                    {availableUsersToAdd.length === 0
                      ? 'Todos os usuários cadastrados já participam desta pelada'
                      : 'Selecione um peladeiro cadastrado...'}
                  </option>
                  {availableUsersToAdd.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </select>

                <select
                  value={addCategory}
                  onChange={(e) => setAddCategory(e.target.value as MemberCategory)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600"
                >
                  <option value="mensalista">Mensalista (Prioridade)</option>
                  <option value="avulso">Avulso</option>
                </select>

                <button
                  type="submit"
                  disabled={!addUserId || addingMember}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  {addingMember ? 'Adicionando...' : 'Vincular à Pelada'}
                </button>
              </form>
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-3.5">
              <h3 className="text-sm font-bold text-slate-900">
                Elenco & Notas Específicas desta Pelada
              </h3>
            </div>

            {loadingMembers ? (
              <p className="p-8 text-center text-sm text-slate-500">Carregando membros...</p>
            ) : members.length === 0 ? (
              <p className="p-8 text-center text-sm text-slate-500">
                Nenhum membro vinculado a esta pelada ainda.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Jogador</th>
                      <th className="px-4 py-3">Categoria</th>
                      <th className="px-3 py-3 text-center">DRI</th>
                      <th className="px-3 py-3 text-center">PRE</th>
                      <th className="px-3 py-3 text-center">PAS</th>
                      <th className="px-3 py-3 text-center">ATA</th>
                      <th className="px-3 py-3 text-center">DEF</th>
                      <th className="px-3 py-3 text-center">CHU</th>
                      <th className="px-3 py-3 text-center">Geral</th>
                      {isAdmin && <th className="px-4 py-3 text-right">Ações</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {members.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {m.photoUrl ? (
                              <img
                                src={m.photoUrl}
                                alt={m.userName}
                                className="h-9 w-9 rounded-full border border-slate-200 object-cover"
                              />
                            ) : (
                              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-xs font-bold text-slate-600">
                                {m.userName.slice(0, 2).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <p className="font-semibold text-slate-900">
                                {m.userName}
                                {m.nickname ? ` (${m.nickname})` : ''}
                              </p>
                              <p className="text-xs text-slate-500">
                                {m.preferredPosition} · Pé {m.dominantFoot}
                                {m.otherPeladasCount && m.otherPeladasCount > 0
                                  ? ` · +${m.otherPeladasCount} outra(s) pelada(s)`
                                  : ''}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${
                              m.category === 'mensalista'
                                ? 'border border-amber-200 bg-amber-50 text-amber-800'
                                : 'border border-slate-200 bg-slate-100 text-slate-700'
                            }`}
                          >
                            {m.category === 'mensalista' ? (
                              <>
                                <UserCheck className="h-3 w-3" />
                                Mensalista
                              </>
                            ) : (
                              'Avulso'
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center font-mono text-xs tabular-nums">
                          {m.dribbling.toFixed(1)}
                        </td>
                        <td className="px-3 py-3 text-center font-mono text-xs tabular-nums">
                          {m.physical.toFixed(1)}
                        </td>
                        <td className="px-3 py-3 text-center font-mono text-xs tabular-nums">
                          {m.passing.toFixed(1)}
                        </td>
                        <td className="px-3 py-3 text-center font-mono text-xs tabular-nums">
                          {m.attack.toFixed(1)}
                        </td>
                        <td className="px-3 py-3 text-center font-mono text-xs tabular-nums">
                          {m.defense.toFixed(1)}
                        </td>
                        <td className="px-3 py-3 text-center font-mono text-xs tabular-nums">
                          {m.shooting.toFixed(1)}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-xs font-bold tabular-nums text-emerald-800">
                            {m.overall.toFixed(1)}
                          </span>
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setRatingTarget(m)}
                                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                                title="Editar notas desta pelada e categoria"
                              >
                                <Sliders className="h-3.5 w-3.5 text-emerald-700" />
                                Notas
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setMedicalTarget({ userId: m.userId, name: m.userName })
                                }
                                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-rose-50 hover:text-rose-700"
                                title="Ver ficha médica e contato de emergência"
                              >
                                <HeartPulse className="h-3.5 w-3.5 text-rose-600" />
                                Saúde
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveMember(m.id)}
                                className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-700"
                                title="Remover membro da pelada"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* ABA 3: FLUXO FINANCEIRO & COMPROVANTES                                */}
      {/* ===================================================================== */}
      {activeTab === 'finance' && (
        <PeladaFinanceTab
          pelada={pelada}
          members={members}
          isAdmin={isAdmin}
          onRefreshPelada={onRefreshPeladas}
        />
      )}

      {ratingTarget && (
        <MemberRatingModal
          peladaId={pelada.id}
          peladaName={pelada.name}
          member={ratingTarget}
          onClose={() => setRatingTarget(null)}
          onUpdated={async () => {
            setRatingTarget(null);
            await loadMembers();
            if (selectedEncounterId) await loadEncounterDetail(selectedEncounterId);
            onRefreshPeladas();
          }}
        />
      )}

      {medicalTarget && (
        <MemberMedicalModal
          userId={medicalTarget.userId}
          memberName={medicalTarget.name}
          onClose={() => setMedicalTarget(null)}
        />
      )}
    </div>
  );
};
