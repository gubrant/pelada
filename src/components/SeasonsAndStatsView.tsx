import { useEffect, useState } from 'react';
import { Award, Calendar, Flame, Lock, LockOpen, Plus, Shield, Trophy, Users } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { Season, SeasonStats } from '../types/futsal';
import { PlayerAvatar } from './PlayerAvatar';

interface SeasonsAndStatsViewProps {
  seasons: Season[];
  selectedSeasonId: number | null;
  isAdmin: boolean;
  groupId?: number | null;
  groupName?: string;
  onSelectSeason: (id: number) => void;
  onRefreshSeasons: () => Promise<void>;
  onOpenPlayerDetail: (playerId: number) => void;
}

export function SeasonsAndStatsView({
  seasons,
  selectedSeasonId,
  isAdmin,
  groupId,
  groupName,
  onSelectSeason,
  onRefreshSeasons,
  onOpenPlayerDetail,
}: SeasonsAndStatsViewProps) {
  const [stats, setStats] = useState<SeasonStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [showNewSeason, setShowNewSeason] = useState(false);
  const [seasonName, setSeasonName] = useState('');
  const [seasonDesc, setSeasonDesc] = useState('');
  const [seasonStart, setSeasonStart] = useState(new Date().toISOString().slice(0, 10));
  const [sortBy, setSortBy] = useState<'mvp' | 'goals' | 'assists' | 'attendance' | 'defense'>('mvp');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedSeasonId) {
      setStats(null);
      return;
    }
    setLoading(true);
    setError(null);
    apiFetch<SeasonStats>(`/api/seasons/${selectedSeasonId}/stats`)
      .then((res) => setStats(res))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [selectedSeasonId]);

  async function handleCreateSeason(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await apiFetch<Season>('/api/seasons', {
        method: 'POST',
        body: JSON.stringify({
          groupId: groupId ?? null,
          name: seasonName,
          description: seasonDesc,
          startDate: seasonStart,
        }),
      });
      setSeasonName('');
      setSeasonDesc('');
      setShowNewSeason(false);
      await onRefreshSeasons();
      onSelectSeason(created.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao abrir temporada.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCloseOrReopen(season: Season) {
    setBusy(true);
    setError(null);
    try {
      const endpoint =
        season.status === 'open'
          ? `/api/seasons/${season.id}/close`
          : `/api/seasons/${season.id}/reopen`;
      await apiFetch(endpoint, { method: 'POST' });
      await onRefreshSeasons();
      const updatedStats = await apiFetch<SeasonStats>(`/api/seasons/${season.id}/stats`);
      setStats(updatedStats);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar temporada.');
    } finally {
      setBusy(false);
    }
  }

  const activeSeason = seasons.find((s) => s.id === selectedSeasonId) ?? null;

  const sortedRows = (() => {
    if (!stats) return [];
    const base = stats.playersStats.slice();
    if (sortBy === 'goals') return base.sort((a, b) => b.goals - a.goals || b.assists - a.assists);
    if (sortBy === 'assists') return base.sort((a, b) => b.assists - a.assists || b.goals - a.goals);
    if (sortBy === 'attendance')
      return base.sort((a, b) => b.peladasCount - a.peladasCount || b.matchesPlayed - a.matchesPlayed);
    if (sortBy === 'defense')
      return base.sort((a, b) => b.defenderScore - a.defenderScore || b.curDefense - a.curDefense);
    return base.sort((a, b) => b.mvpScore - a.mvpScore);
  })();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h2 className="font-display text-3xl font-extrabold text-slate-900">
            Temporadas & Estatísticas{groupName ? ` · ${groupName}` : ' da Pelada'}
          </h2>
          <p className="text-sm text-slate-500">
            Abertura e fechamento de temporada, líderes em artilharia, assistências, defesa e
            assiduidade.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {seasons.length > 0 && (
            <select
              value={selectedSeasonId ?? ''}
              onChange={(e) => onSelectSeason(Number(e.target.value))}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800"
            >
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.status === 'open' ? 'Aberta' : 'Encerrada'})
                </option>
              ))}
            </select>
          )}

          {isAdmin && activeSeason && (
            <button
              type="button"
              disabled={busy}
              onClick={() => handleCloseOrReopen(activeSeason)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold border cursor-pointer ${
                activeSeason.status === 'open'
                  ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {activeSeason.status === 'open' ? (
                <>
                  <Lock className="h-3.5 w-3.5" /> Fechar Temporada
                </>
              ) : (
                <>
                  <LockOpen className="h-3.5 w-3.5" /> Reabrir Temporada
                </>
              )}
            </button>
          )}

          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowNewSeason((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 cursor-pointer"
            >
              <Plus className="h-4 w-4" /> Abrir Nova Temporada
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {showNewSeason && isAdmin && (
        <form
          onSubmit={handleCreateSeason}
          className="rounded-xl border border-slate-200 bg-white p-5 grid grid-cols-1 sm:grid-cols-12 gap-4 items-end"
        >
          <div className="sm:col-span-4">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nome da Temporada *
            </label>
            <input
              required
              value={seasonName}
              onChange={(e) => setSeasonName(e.target.value)}
              placeholder="Ex: Temporada 2026 - 2º Semestre"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-4">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Descrição / Premiação
            </label>
            <input
              value={seasonDesc}
              onChange={(e) => setSeasonDesc(e.target.value)}
              placeholder="Ex: Churrasco dos campeões em dezembro"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Início</label>
            <input
              type="date"
              value={seasonStart}
              onChange={(e) => setSeasonStart(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 cursor-pointer"
            >
              Abrir
            </button>
          </div>
        </form>
      )}

      {!activeSeason ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center space-y-2">
          <Calendar className="h-8 w-8 text-slate-400 mx-auto" />
          <p className="text-base font-semibold text-slate-900">Nenhuma temporada aberta</p>
          <p className="text-sm text-slate-500">
            {isAdmin
              ? 'Clique em "Abrir Nova Temporada" para iniciar o controle de peladas e estatísticas.'
              : 'Aguarde o administrador abrir a temporada atual.'}
          </p>
        </div>
      ) : loading ? (
        <div className="py-12 text-center text-sm text-slate-500">
          Calculando estatísticas da temporada...
        </div>
      ) : stats ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 bg-white border border-slate-200 rounded-xl px-5 py-3">
            <div>
              <strong className="text-slate-900">{activeSeason.name}</strong> · Início{' '}
              <span className="font-mono tabular-nums">{activeSeason.startDate}</span>
              {activeSeason.endDate ? ` · Encerrada em ${activeSeason.endDate}` : ' · Em curso'}
            </div>
            <div className="font-mono tabular-nums">
              {stats.totals.peladasCount} peladas · {stats.totals.matchesCount} partidas ·{' '}
              {stats.totals.goalsCount} gols · {stats.totals.assistsCount} assistências
            </div>
          </div>

          {/* Season Awards / Leaders */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <AwardLeaderCard
              title="Artilheiro da Temporada"
              icon={<Flame className="h-4 w-4 text-emerald-600" />}
              leader={stats.topScorers[0]}
              metricLabel={stats.topScorers[0] ? `${stats.topScorers[0].goals} gols` : '0 gols'}
              subLabel={
                stats.topScorers[0]
                  ? `${stats.topScorers[0].matchesPlayed} jogos · ${stats.topScorers[0].assists} assist.`
                  : 'Sem registros'
              }
              onClick={onOpenPlayerDetail}
            />
            <AwardLeaderCard
              title="Rei das Assistências"
              icon={<Award className="h-4 w-4 text-amber-600" />}
              leader={stats.topAssists[0]}
              metricLabel={
                stats.topAssists[0] ? `${stats.topAssists[0].assists} assist.` : '0 assist.'
              }
              subLabel={
                stats.topAssists[0]
                  ? `${stats.topAssists[0].goalContributions} participações em gols`
                  : 'Sem registros'
              }
              onClick={onOpenPlayerDetail}
            />
            <AwardLeaderCard
              title="Melhor Defensor"
              icon={<Shield className="h-4 w-4 text-slate-800" />}
              leader={stats.bestDefenders[0]}
              metricLabel={
                stats.bestDefenders[0]
                  ? `Nota Def ${stats.bestDefenders[0].curDefense.toFixed(1)}`
                  : '—'
              }
              subLabel={
                stats.bestDefenders[0]
                  ? `${stats.bestDefenders[0].defensiveActions} desarmes · ${stats.bestDefenders[0].goalsConcededAvg.toFixed(1)} GC/jogo`
                  : 'Sem registros'
              }
              onClick={onOpenPlayerDetail}
            />
            <AwardLeaderCard
              title="Mais Assíduo (Presenças)"
              icon={<Users className="h-4 w-4 text-emerald-700" />}
              leader={stats.attendanceRanking[0]}
              metricLabel={
                stats.attendanceRanking[0]
                  ? `${stats.attendanceRanking[0].peladasCount} peladas`
                  : '0 peladas'
              }
              subLabel={
                stats.attendanceRanking[0]
                  ? `${stats.attendanceRanking[0].matchesPlayed} partidas disputadas`
                  : 'Sem registros'
              }
              onClick={onOpenPlayerDetail}
            />
            <AwardLeaderCard
              title="Craque da Temporada (MVP)"
              icon={<Trophy className="h-4 w-4 text-amber-600" />}
              leader={stats.mvpRanking[0]}
              metricLabel={
                stats.mvpRanking[0] ? `Nota ${stats.mvpRanking[0].curOverall.toFixed(2)}` : '—'
              }
              subLabel={
                stats.mvpRanking[0]
                  ? `${stats.mvpRanking[0].winRate.toFixed(0)}% aproveitamento · ${stats.mvpRanking[0].goals}G ${stats.mvpRanking[0].assists}A`
                  : 'Sem registros'
              }
              onClick={onOpenPlayerDetail}
            />
            <AwardLeaderCard
              title="Goleiro Destaque"
              icon={<Shield className="h-4 w-4 text-emerald-600" />}
              leader={stats.bestGoalkeepers[0]}
              metricLabel={
                stats.bestGoalkeepers[0]
                  ? `${stats.bestGoalkeepers[0].goalsConcededAvg.toFixed(2)} GC/jogo`
                  : '—'
              }
              subLabel={
                stats.bestGoalkeepers[0]
                  ? `${stats.bestGoalkeepers[0].defensiveActions} defesas · ${stats.bestGoalkeepers[0].wins} vitórias`
                  : 'Nenhum goleiro em campo'
              }
              onClick={onOpenPlayerDetail}
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-slate-900">
                Ranking Geral da Temporada
              </h3>

              <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-lg">
                {(
                  [
                    ['mvp', 'MVP / Geral'],
                    ['goals', 'Artilharia'],
                    ['assists', 'Assistências'],
                    ['defense', 'Defesa'],
                    ['attendance', 'Assiduidade'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSortBy(key)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      sortBy === key
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {sortedRows.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                Ainda não há partidas registradas nesta temporada.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">#</th>
                      <th className="px-4 py-2.5 font-semibold">Peladeiro</th>
                      <th className="px-4 py-2.5 font-semibold text-right">Peladas</th>
                      <th className="px-4 py-2.5 font-semibold text-right">Jogos</th>
                      <th className="px-4 py-2.5 font-semibold text-right">V-E-D</th>
                      <th className="px-4 py-2.5 font-semibold text-right">% Vit</th>
                      <th className="px-4 py-2.5 font-semibold text-right">Gols</th>
                      <th className="px-4 py-2.5 font-semibold text-right">Assist.</th>
                      <th className="px-4 py-2.5 font-semibold text-right">G+A</th>
                      <th className="px-4 py-2.5 font-semibold text-right">Def</th>
                      <th className="px-4 py-2.5 font-semibold text-right">Nota</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sortedRows.map((row, idx) => (
                      <tr
                        key={row.playerId}
                        onClick={() => onOpenPlayerDetail(row.playerId)}
                        className="hover:bg-slate-50 cursor-pointer"
                      >
                        <td className="px-4 py-2.5 font-mono tabular-nums text-slate-500">
                          {idx + 1}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <PlayerAvatar
                              name={row.name}
                              photoUrl={row.photoUrl}
                              size="sm"
                            />
                            <div>
                              <span className="font-semibold text-slate-900 block">
                                {row.nickname}
                              </span>
                              <span className="text-[11px] text-slate-500">{row.position}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                          {row.peladasCount}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                          {row.matchesPlayed}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                          {row.wins}-{row.draws}-{row.losses}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                          {row.winRate.toFixed(0)}%
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums font-bold text-emerald-700">
                          {row.goals}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold">
                          {row.assists}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                          {row.goalContributions}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                          {row.defensiveActions}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums font-bold text-slate-900">
                          {row.curOverall.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

function AwardLeaderCard({
  title,
  icon,
  leader,
  metricLabel,
  subLabel,
  onClick,
}: {
  title: string;
  icon: React.ReactNode;
  leader?: SeasonStats['topScorers'][number];
  metricLabel: string;
  subLabel: string;
  onClick: (playerId: number) => void;
}) {
  return (
    <div
      onClick={() => leader && onClick(leader.playerId)}
      className={`rounded-xl border border-slate-200 bg-white p-4 ${
        leader ? 'hover:border-emerald-300 cursor-pointer transition-colors' : ''
      }`}
    >
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 mb-3">
        {icon}
        {title}
      </div>
      {leader ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <PlayerAvatar name={leader.name} photoUrl={leader.photoUrl} size="md" />
            <div className="min-w-0">
              <p className="font-bold text-sm text-slate-900 truncate">{leader.nickname}</p>
              <p className="text-[11px] text-slate-500 truncate">{subLabel}</p>
            </div>
          </div>
          <span className="font-mono tabular-nums text-sm font-bold text-emerald-700 whitespace-nowrap">
            {metricLabel}
          </span>
        </div>
      ) : (
        <p className="text-xs text-slate-400">Sem dados nesta temporada</p>
      )}
    </div>
  );
}
