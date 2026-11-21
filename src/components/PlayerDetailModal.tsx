import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  DEFAULT_GROUP_CRITERIA,
  type GroupCriterion,
  type PlayerHistoryResponse,
} from '../types/futsal';
import { RatingEvolutionChart, SevenCriteriaRadarChart } from './Charts';
import { PlayerAvatar } from './PlayerAvatar';

interface PlayerDetailModalProps {
  playerId: number;
  groupId?: number | null;
  onClose: () => void;
}

export function PlayerDetailModal({ playerId, groupId, onClose }: PlayerDetailModalProps) {
  const [data, setData] = useState<PlayerHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const qs = groupId ? `?groupId=${groupId}` : '';
    apiFetch<PlayerHistoryResponse>(`/api/players/${playerId}/history${qs}`)
      .then((res) => setData(res))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [playerId, groupId]);

  const effectiveCriteria: GroupCriterion[] =
    data?.criteriaConfig && data.criteriaConfig.length > 0
      ? data.criteriaConfig
      : DEFAULT_GROUP_CRITERIA;
  const activeCriteria = effectiveCriteria.filter((c) => c.enabled && c.weight > 0);
  const displayCriteria = activeCriteria.length > 0 ? activeCriteria : DEFAULT_GROUP_CRITERIA;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 overflow-y-auto">
      <div className="w-full max-w-4xl rounded-xl bg-white border border-slate-200 shadow-xl my-6 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-900 text-white">
          <div className="flex items-center gap-3">
            {data && (
              <PlayerAvatar
                name={data.player.name}
                photoUrl={data.player.photoUrl}
                size="lg"
              />
            )}
            <div>
              <h3 className="font-display text-2xl font-bold tracking-wide">
                {data ? `${data.player.nickname} · ${data.player.name}` : 'Ficha do Peladeiro'}
              </h3>
              {data && (
                <p className="text-xs text-slate-300">
                  {data.player.position} · Pé {data.player.dominantFoot}
                  {data.player.age ? ` · ${data.player.age} anos` : ''}
                  {data.player.email ? ` · ${data.player.email}` : ''}
                  {data.player.phone ? ` · ${data.player.phone}` : ''}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            {data && (
              <div className="text-right">
                <span className="text-[11px] text-slate-300 block">Nota Atual (10 jogos)</span>
                <span className="font-display text-3xl font-extrabold text-emerald-400 tabular-nums">
                  {data.player.curOverall.toFixed(2)}
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-300 hover:bg-white/10 hover:text-white cursor-pointer"
              aria-label="Fechar ficha"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="p-6 max-h-[82vh] overflow-y-auto space-y-8">
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-500">
              Carregando histórico e gráficos de evolução...
            </div>
          ) : error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          ) : data ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-4 border-b border-slate-200 pb-6">
                <div>
                  <span className="text-xs text-slate-500 block">Nota Inicial</span>
                  <span className="font-mono tabular-nums text-xl font-bold text-slate-800">
                    {data.player.initOverall.toFixed(2)}
                  </span>
                  <span className="text-[11px] text-slate-500 block">
                    {(data.player.initVotesCount ?? 0) > 0
                      ? `Média de ${data.player.initVotesCount} voto(s)`
                      : 'Aguardando votos dos admins'}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Presenças</span>
                  <span className="font-mono tabular-nums text-xl font-bold text-slate-900">
                    {data.summary.peladasAttended}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Jogos (V-E-D)</span>
                  <span className="font-mono tabular-nums text-xl font-bold text-slate-900">
                    {data.summary.matchesPlayed}{' '}
                    <span className="text-xs font-normal text-slate-500">
                      ({data.summary.wins}-{data.summary.draws}-{data.summary.losses})
                    </span>
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Gols</span>
                  <span className="font-mono tabular-nums text-xl font-bold text-emerald-700">
                    {data.summary.goals}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Assistências</span>
                  <span className="font-mono tabular-nums text-xl font-bold text-slate-900">
                    {data.summary.assists}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Ações Defensivas</span>
                  <span className="font-mono tabular-nums text-xl font-bold text-slate-900">
                    {data.summary.defenses}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                <div className="lg:col-span-5 border border-slate-200 rounded-xl p-5 bg-slate-50/60">
                  <h4 className="text-sm font-bold text-slate-900 mb-3">
                    Perfil Técnico ({displayCriteria.length} Critérios)
                  </h4>
                  <SevenCriteriaRadarChart
                    criteriaConfig={displayCriteria}
                    current={{
                      physical: data.player.curPhysical,
                      dribbling: data.player.curDribbling,
                      shooting: data.player.curShooting,
                      defense: data.player.curDefense,
                      attack: data.player.curAttack,
                      passing: data.player.curPassing,
                      positioning: data.player.curPositioning,
                    }}
                    initial={{
                      physical: data.player.initPhysical,
                      dribbling: data.player.initDribbling,
                      shooting: data.player.initShooting,
                      defense: data.player.initDefense,
                      attack: data.player.initAttack,
                      passing: data.player.initPassing,
                      positioning: data.player.initPositioning,
                    }}
                    currentScores={data.player.curScores}
                    initialScores={data.player.initScores}
                  />

                  <div className="mt-4 divide-y divide-slate-200 text-xs">
                    {displayCriteria.map((c) => {
                      const mapCur: Record<string, number> = {
                        physical: data.player.curPhysical,
                        dribbling: data.player.curDribbling,
                        shooting: data.player.curShooting,
                        defense: data.player.curDefense,
                        attack: data.player.curAttack,
                        passing: data.player.curPassing,
                        positioning: data.player.curPositioning,
                        ...(data.player.curScores ?? {}),
                      };
                      const mapInit: Record<string, number> = {
                        physical: data.player.initPhysical,
                        dribbling: data.player.initDribbling,
                        shooting: data.player.initShooting,
                        defense: data.player.initDefense,
                        attack: data.player.initAttack,
                        passing: data.player.initPassing,
                        positioning: data.player.initPositioning,
                        ...(data.player.initScores ?? {}),
                      };
                      const curVal = mapCur[c.key] ?? 7;
                      const initVal = mapInit[c.key] ?? 7;
                      const diff = curVal - initVal;
                      return (
                        <div key={c.key} className="flex items-center justify-between py-1.5">
                          <span className="text-slate-700 font-medium">
                            {c.label}
                            {c.weight !== 1 && (
                              <span className="text-slate-400 ml-1">(peso {c.weight.toFixed(1)})</span>
                            )}
                          </span>
                          <span className="font-mono tabular-nums">
                            <strong className="text-slate-900">{curVal.toFixed(1)}</strong>{' '}
                            <span className="text-slate-400">
                              (ini {initVal.toFixed(1)}
                              {diff !== 0 ? `, ${diff > 0 ? '+' : ''}${diff.toFixed(1)}` : ''})
                            </span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="lg:col-span-7 border border-slate-200 rounded-xl p-5">
                  <div className="mb-3">
                    <h4 className="text-sm font-bold text-slate-900">
                      Evolução da Nota (Média Móvel de 10 Jogos)
                    </h4>
                    <p className="text-xs text-slate-500">
                      Considera a média simples das avaliações recebidas nos últimos 10 jogos
                      avaliados ({data.summary.evaluatedMatchesCount} partidas avaliadas).
                    </p>
                  </div>
                  <RatingEvolutionChart data={data.evolutionSeries} />
                </div>
              </div>

              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-3">
                  Histórico Detalhado de Partidas
                </h4>
                {data.history.length === 0 ? (
                  <p className="text-sm text-slate-500 border border-dashed border-slate-200 rounded-lg p-6 text-center">
                    Este jogador ainda não participou de partidas registradas.
                  </p>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                        <tr>
                          <th className="px-3.5 py-2.5 font-semibold">Data / Pelada</th>
                          <th className="px-3.5 py-2.5 font-semibold">Confronto</th>
                          <th className="px-3.5 py-2.5 font-semibold text-center">Placar</th>
                          <th className="px-3.5 py-2.5 font-semibold text-right">G</th>
                          <th className="px-3.5 py-2.5 font-semibold text-right">A</th>
                          <th className="px-3.5 py-2.5 font-semibold text-right">Def</th>
                          <th className="px-3.5 py-2.5 font-semibold text-right">Nota</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.history.map((h) => (
                          <tr key={h.matchId} className="hover:bg-slate-50">
                            <td className="px-3.5 py-2.5">
                              <span className="font-medium text-slate-900 block">
                                {h.peladaTitle} · Jogo #{h.matchNumber}
                              </span>
                              <span className="text-slate-500 font-mono tabular-nums">
                                {h.eventDate}
                              </span>
                            </td>
                            <td className="px-3.5 py-2.5 text-slate-700">
                              {h.myTeamName} vs {h.opponentTeamName}
                            </td>
                            <td className="px-3.5 py-2.5 text-center font-mono tabular-nums">
                              <span className="font-bold text-slate-900">
                                {h.myScore} × {h.oppScore}
                              </span>{' '}
                              <span
                                className={
                                  h.result === 'V'
                                    ? 'text-emerald-700 font-semibold'
                                    : h.result === 'D'
                                      ? 'text-red-600 font-semibold'
                                      : 'text-slate-500'
                                }
                              >
                                ({h.result})
                              </span>
                            </td>
                            <td className="px-3.5 py-2.5 text-right font-mono tabular-nums font-semibold text-slate-900">
                              {h.goals}
                            </td>
                            <td className="px-3.5 py-2.5 text-right font-mono tabular-nums text-slate-700">
                              {h.assists}
                            </td>
                            <td className="px-3.5 py-2.5 text-right font-mono tabular-nums text-slate-700">
                              {h.defenses}
                            </td>
                            <td className="px-3.5 py-2.5 text-right font-mono tabular-nums">
                              {h.matchRating !== null ? (
                                <span className="font-bold text-emerald-700">
                                  {h.matchRating.toFixed(2)}
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
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
      </div>
    </div>
  );
}
