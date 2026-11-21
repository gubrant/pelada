import { useEffect, useState } from 'react';
import { CheckCircle2, Minus, Plus, Vote, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type {
  GroupCriterion,
  Player,
  PlayerInitialVotesResponse,
} from '../types/futsal';
import { PlayerAvatar } from './PlayerAvatar';

interface InitialRatingVoteModalProps {
  playerId: number;
  groupId?: number | null;
  onClose: () => void;
  onVoted: (updatedPlayer: Player) => void;
}

export function InitialRatingVoteModal({
  playerId,
  groupId,
  onClose,
  onVoted,
}: InitialRatingVoteModalProps) {
  const [data, setData] = useState<PlayerInitialVotesResponse | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const qs = groupId ? `?groupId=${groupId}` : '';
    apiFetch<PlayerInitialVotesResponse>(`/api/players/${playerId}/initial-votes${qs}`)
      .then((res) => {
        setData(res);
        const base: Record<string, number> = {};
        for (const c of res.criteriaConfig) {
          base[c.key] =
            res.myVote?.scores?.[c.key] ??
            res.player.initScores?.[c.key] ??
            7;
        }
        setScores(base);
        setComment(res.myVote?.comment ?? '');
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Erro ao carregar votação.');
      })
      .finally(() => setLoading(false));
  }, [playerId, groupId]);

  const activeCriteria: GroupCriterion[] =
    data?.criteriaConfig.filter((c) => c.enabled && c.weight > 0) ?? [];

  const totalWeight = activeCriteria.reduce((s, c) => s + c.weight, 0);
  const myAverage =
    totalWeight > 0
      ? Math.round(
          (activeCriteria.reduce((s, c) => s + (scores[c.key] ?? 7) * c.weight, 0) /
            totalWeight) *
            100
        ) / 100
      : 7;

  function stepScore(key: string, delta: number) {
    setScores((prev) => {
      const current = prev[key] ?? 7;
      const next = Math.max(1, Math.min(10, Math.round((current + delta) * 2) / 2));
      return { ...prev, [key]: next };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch<{ player: Player }>(
        `/api/players/${playerId}/initial-votes`,
        {
          method: 'POST',
          body: JSON.stringify({
            groupId: data?.groupId ?? groupId ?? null,
            scores,
            comment,
          }),
        }
      );
      onVoted(res.player);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar voto inicial.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-xl bg-white border border-slate-200 shadow-xl my-6">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3 min-w-0">
            {data && (
              <PlayerAvatar
                name={data.player.name}
                photoUrl={data.player.photoUrl}
                size="md"
              />
            )}
            <div className="min-w-0">
              <h3 className="font-display text-2xl font-bold text-slate-900 truncate">
                Votar Nota Inicial {data ? `· ${data.player.nickname}` : ''}
              </h3>
              <p className="text-xs text-slate-500">
                A média das avaliações dos administradores define a nota inicial do peladeiro.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
            aria-label="Fechar votação"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 max-h-[82vh] overflow-y-auto space-y-5">
          {loading ? (
            <div className="py-10 text-center text-sm text-slate-500">
              Carregando critérios da pelada e votos dos administradores...
            </div>
          ) : error && !data ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          ) : data ? (
            <>
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div>
                  <span className="text-[11px] text-slate-500 block">Média Inicial Atual</span>
                  <span className="font-display text-3xl font-extrabold text-emerald-700 tabular-nums">
                    {data.player.initOverall.toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">Votos Registrados</span>
                  <span className="font-mono tabular-nums text-xl font-bold text-slate-900">
                    {data.votesCount}/{data.totalAdmins}{' '}
                    <span className="text-xs font-normal text-slate-500">admins</span>
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">Média do Seu Voto</span>
                  <span className="font-mono tabular-nums text-xl font-bold text-slate-900">
                    {myAverage.toFixed(2)}
                  </span>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    <Vote className="h-4 w-4 text-emerald-600" />
                    Critérios da Pelada (1 a 10, passo 0,5)
                  </h4>
                  <span className="text-xs text-slate-500">
                    {data.myVote ? 'Você já votou — pode atualizar' : 'Seu voto ainda não enviado'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {activeCriteria.map((c) => {
                    const val = scores[c.key] ?? 7;
                    return (
                      <div key={c.key} className="rounded-lg border border-slate-200 p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-slate-800 truncate">
                            {c.label}
                            {c.weight !== 1 && (
                              <span className="text-slate-400 font-normal ml-1">
                                (peso {c.weight.toFixed(1)})
                              </span>
                            )}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => stepScore(c.key, -0.5)}
                              disabled={val <= 1}
                              className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                              aria-label={`Diminuir ${c.label} em 0,5`}
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="font-mono tabular-nums font-bold text-slate-900 w-9 text-center">
                              {val.toFixed(1)}
                            </span>
                            <button
                              type="button"
                              onClick={() => stepScore(c.key, 0.5)}
                              disabled={val >= 10}
                              className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                              aria-label={`Aumentar ${c.label} em 0,5`}
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                        <input
                          type="range"
                          min={1}
                          max={10}
                          step={0.5}
                          value={val}
                          onChange={(e) =>
                            setScores((prev) => ({
                              ...prev,
                              [c.key]: Number(e.target.value),
                            }))
                          }
                          className="w-full accent-emerald-600 cursor-pointer"
                        />
                      </div>
                    );
                  })}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Observação da avaliação inicial (opcional)
                  </label>
                  <input
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Ex: Bom passe curto, precisa ganhar ritmo..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-emerald-600 focus:outline-none"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Fechar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                  >
                    {saving
                      ? 'Salvando voto...'
                      : data.myVote
                        ? 'Atualizar Meu Voto'
                        : 'Confirmar Voto nos Critérios'}
                  </button>
                </div>
              </form>

              {data.votes.length > 0 && (
                <div className="pt-4 border-t border-slate-200 space-y-2">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Votos dos Administradores ({data.votes.length})
                  </h4>
                  <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {data.votes.map((v) => (
                      <div
                        key={v.id}
                        className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0">
                          <span className="font-semibold text-slate-900 inline-flex items-center gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                            {v.adminName}
                          </span>
                          {v.comment && (
                            <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                              “{v.comment}”
                            </p>
                          )}
                        </div>
                        <span className="font-mono tabular-nums font-bold text-emerald-700 shrink-0">
                          {v.averageScore.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
