import { useEffect, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  DEFAULT_GROUP_CRITERIA,
  type GroupCriterion,
  type Match,
  type PeladaAttendance,
} from '../types/futsal';
import { PlayerAvatar } from './PlayerAvatar';

interface EvaluationModalProps {
  match: Match;
  attendances: PeladaAttendance[];
  currentUserId: number;
  criteriaConfig?: GroupCriterion[];
  onClose: () => void;
  onEvaluated: () => void;
}

interface ExistingEvalRow {
  id: number;
  playerId: number;
  evaluatorUserId: number;
  physical: number;
  dribbling: number;
  shooting: number;
  defense: number;
  attack: number;
  passing: number;
  positioning: number;
  scoresJson?: string | null;
  averageScore: number;
  comment: string | null;
}

function buildDefaultScores(criteria: GroupCriterion[]): Record<string, number> {
  const base: Record<string, number> = {
    physical: 7,
    dribbling: 7,
    shooting: 7,
    defense: 7,
    attack: 7,
    passing: 7,
    positioning: 7,
  };
  for (const c of criteria) {
    if (base[c.key] === undefined) base[c.key] = 7;
  }
  return base;
}

function extractEvalScores(
  ev: ExistingEvalRow,
  criteria: GroupCriterion[]
): Record<string, number> {
  let parsed: Record<string, number> = {};
  if (ev.scoresJson) {
    try {
      const obj = JSON.parse(ev.scoresJson);
      if (obj && typeof obj === 'object') {
        for (const [k, v] of Object.entries(obj)) {
          if (typeof v === 'number' && Number.isFinite(v)) parsed[k] = v;
        }
      }
    } catch {
      parsed = {};
    }
  }
  return {
    ...buildDefaultScores(criteria),
    physical: ev.physical,
    dribbling: ev.dribbling,
    shooting: ev.shooting,
    defense: ev.defense,
    attack: ev.attack,
    passing: ev.passing,
    positioning: ev.positioning,
    ...parsed,
  };
}

export function EvaluationModal({
  match,
  attendances,
  currentUserId,
  criteriaConfig,
  onClose,
  onEvaluated,
}: EvaluationModalProps) {
  const effectiveCriteria =
    criteriaConfig && criteriaConfig.length > 0 ? criteriaConfig : DEFAULT_GROUP_CRITERIA;
  const activeCriteria = effectiveCriteria.filter((c) => c.enabled && c.weight > 0);
  const displayCriteria = activeCriteria.length > 0 ? activeCriteria : DEFAULT_GROUP_CRITERIA;

  const participants = attendances.filter(
    (a) =>
      a.present &&
      (a.teamId === match.teamAId || a.teamId === match.teamBId) &&
      a.playerUserId !== currentUserId
  );

  const [selectedPlayerId, setSelectedPlayerId] = useState<number>(
    participants[0]?.playerId ?? 0
  );
  const [scores, setScores] = useState<Record<string, number>>(() =>
    buildDefaultScores(displayCriteria)
  );
  const [comment, setComment] = useState('');
  const [myEvals, setMyEvals] = useState<Record<number, ExistingEvalRow>>({});
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ myEvaluations: ExistingEvalRow[] }>(`/api/matches/${match.id}/evaluations`)
      .then((res) => {
        const map: Record<number, ExistingEvalRow> = {};
        for (const ev of res.myEvaluations) {
          map[ev.playerId] = ev;
        }
        setMyEvals(map);
        if (selectedPlayerId && map[selectedPlayerId]) {
          const ex = map[selectedPlayerId];
          setScores(extractEvalScores(ex, displayCriteria));
          setComment(ex.comment ?? '');
        }
      })
      .catch(() => {});
  }, [match.id]);

  function handleSelectPlayer(pId: number) {
    setSelectedPlayerId(pId);
    setFeedback(null);
    setError(null);
    const existing = myEvals[pId];
    if (existing) {
      setScores(extractEvalScores(existing, displayCriteria));
      setComment(existing.comment ?? '');
    } else {
      setScores(buildDefaultScores(displayCriteria));
      setComment('');
    }
  }

  const totalWeight = displayCriteria.reduce((acc, c) => acc + c.weight, 0);
  const avg =
    totalWeight > 0
      ? displayCriteria.reduce((acc, c) => acc + (scores[c.key] ?? 7) * c.weight, 0) /
        totalWeight
      : 7;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPlayerId) return;
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      const res = await apiFetch<{ evaluation: ExistingEvalRow }>(
        `/api/matches/${match.id}/evaluations`,
        {
          method: 'POST',
          body: JSON.stringify({
            playerId: selectedPlayerId,
            physical: scores.physical ?? 7,
            dribbling: scores.dribbling ?? 7,
            shooting: scores.shooting ?? 7,
            defense: scores.defense ?? 7,
            attack: scores.attack ?? 7,
            passing: scores.passing ?? 7,
            positioning: scores.positioning ?? 7,
            scores,
            comment,
          }),
        }
      );
      setMyEvals((prev) => ({ ...prev, [selectedPlayerId]: res.evaluation }));
      setFeedback('Avaliação registrada! A média dos últimos 10 jogos foi atualizada.');
      onEvaluated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar avaliação.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-xl bg-white border border-slate-200 shadow-xl my-6">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h3 className="font-display text-2xl font-bold text-slate-900">
              Avaliar Desempenho — Jogo #{match.matchNumber}
            </h3>
            <p className="text-xs text-slate-500">
              Notas de 1 a 10 nos {displayCriteria.length} critérios configurados da pelada.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
            aria-label="Fechar avaliação"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {participants.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">
              Não há outros jogadores escalados nesta partida para avaliar.
            </p>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  Selecione o jogador da partida
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {participants.map((p) => {
                    const already = Boolean(myEvals[p.playerId]);
                    const active = selectedPlayerId === p.playerId;
                    return (
                      <button
                        key={p.playerId}
                        type="button"
                        onClick={() => handleSelectPlayer(p.playerId)}
                        className={`flex items-center gap-2 rounded-lg border p-2 text-left transition-colors cursor-pointer ${
                          active
                            ? 'border-emerald-600 bg-emerald-50'
                            : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <PlayerAvatar
                          name={p.playerName}
                          photoUrl={p.playerPhoto}
                          size="sm"
                        />
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-semibold text-slate-900 block truncate">
                            {p.playerNickname}
                          </span>
                          <span className="text-[11px] text-slate-500 block truncate">
                            {already ? 'Avaliado' : p.playerPosition}
                          </span>
                        </div>
                        {already && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {error}
                </div>
              )}
              {feedback && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                  {feedback}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4 pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-900">Critérios (1 a 10)</span>
                  <div className="text-right">
                    <span className="text-xs text-slate-500 mr-2">Média da partida:</span>
                    <span className="font-mono tabular-nums text-xl font-bold text-emerald-700">
                      {avg.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                  {displayCriteria.map((c) => {
                    const val = scores[c.key] ?? 7;
                    return (
                      <div key={c.key}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium text-slate-700">
                            {c.label}
                            {c.weight !== 1 && (
                              <span className="text-slate-400 ml-1">(peso {c.weight.toFixed(1)})</span>
                            )}
                          </span>
                          <span className="font-mono tabular-nums font-bold text-slate-900">
                            {val}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={1}
                          max={10}
                          step={1}
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
                    Observação da partida (opcional)
                  </label>
                  <input
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Ex: Marcou muito bem e deu boas assistências"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Fechar
                  </button>
                  <button
                    type="submit"
                    disabled={saving || !selectedPlayerId}
                    className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
                  >
                    {saving ? 'Salvando...' : 'Salvar Avaliação'}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
