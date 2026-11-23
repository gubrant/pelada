import { useEffect, useState } from 'react';
import { CheckCircle2, Minus, Plus, Vote, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  DEFAULT_GROUP_CRITERIA,
  type GroupCriterion,
  type PeladaSummary,
} from '../types/futsal';
import { PlayerAvatar } from './PlayerAvatar';

interface ParticipantInfo {
  playerId: number;
  name: string;
  nickname: string;
  position: string;
  photoUrl: string | null;
  overall: number;
}

interface EncounterEvaluationData {
  canEvaluate: boolean;
  endTimeReached: boolean;
  criteriaConfig: GroupCriterion[];
  participants: ParticipantInfo[];
  myEvaluations: Array<{
    id: number;
    playerId: number;
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
  }>;
}

interface EncounterEvaluationModalProps {
  pelada: PeladaSummary;
  onClose: () => void;
  onEvaluated: () => void;
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

export function EncounterEvaluationModal({
  pelada,
  onClose,
  onEvaluated,
}: EncounterEvaluationModalProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<EncounterEvaluationData | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<number>(0);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadEvalContext = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<EncounterEvaluationData>(
        `/api/peladas/${pelada.id}/encounter-evaluation`
      );
      setData(res);
      if (res.participants.length > 0) {
        const firstId = res.participants[0].playerId;
        setSelectedPlayerId(firstId);
        const existing = res.myEvaluations.find((e) => e.playerId === firstId);
        const criteria = res.criteriaConfig.length > 0 ? res.criteriaConfig : DEFAULT_GROUP_CRITERIA;
        if (existing) {
          let parsed: Record<string, number> = {};
          if (existing.scoresJson) {
            try {
              parsed = JSON.parse(existing.scoresJson);
            } catch {}
          }
          setScores({
            ...buildDefaultScores(criteria),
            physical: existing.physical,
            dribbling: existing.dribbling,
            shooting: existing.shooting,
            defense: existing.defense,
            attack: existing.attack,
            passing: existing.passing,
            positioning: existing.positioning,
            ...parsed,
          });
          setComment(existing.comment ?? '');
        } else {
          setScores(buildDefaultScores(criteria));
          setComment('');
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados de avaliação.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvalContext();
  }, [pelada.id]);

  function handleSelectPlayer(playerId: number) {
    setSelectedPlayerId(playerId);
    setSuccessMsg(null);
    setError(null);
    if (!data) return;
    const criteria = data.criteriaConfig.length > 0 ? data.criteriaConfig : DEFAULT_GROUP_CRITERIA;
    const existing = data.myEvaluations.find((e) => e.playerId === playerId);
    if (existing) {
      let parsed: Record<string, number> = {};
      if (existing.scoresJson) {
        try {
          parsed = JSON.parse(existing.scoresJson);
        } catch {}
      }
      setScores({
        ...buildDefaultScores(criteria),
        physical: existing.physical,
        dribbling: existing.dribbling,
        shooting: existing.shooting,
        defense: existing.defense,
        attack: existing.attack,
        passing: existing.passing,
        positioning: existing.positioning,
        ...parsed,
      });
      setComment(existing.comment ?? '');
    } else {
      setScores(buildDefaultScores(criteria));
      setComment('');
    }
  }

  function updateScore(key: string, val: number) {
    const clamped = Math.max(1, Math.min(10, Math.round(val * 2) / 2));
    setScores((prev) => ({ ...prev, [key]: clamped }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPlayerId) return;
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await apiFetch(`/api/peladas/${pelada.id}/encounter-evaluate`, {
        method: 'POST',
        body: JSON.stringify({
          playerId: selectedPlayerId,
          scores,
          comment: comment.trim() || null,
        }),
      });
      setSuccessMsg('Avaliação salva com sucesso!');
      await loadEvalContext();
      onEvaluated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar avaliação.');
    } finally {
      setSaving(false);
    }
  }

  const effectiveCriteria =
    data?.criteriaConfig && data.criteriaConfig.length > 0
      ? data.criteriaConfig
      : DEFAULT_GROUP_CRITERIA;
  const activeCriteria = effectiveCriteria.filter((c) => c.enabled && c.weight > 0);
  const displayCriteria = activeCriteria.length > 0 ? activeCriteria : DEFAULT_GROUP_CRITERIA;

  const currentSelectedParticipant = data?.participants.find(
    (p) => p.playerId === selectedPlayerId
  );
  const hasEvaluatedCurrent = Boolean(
    data?.myEvaluations.some((e) => e.playerId === selectedPlayerId)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto">
      <div className="w-full max-w-3xl rounded-xl bg-white border border-slate-200 shadow-xl my-8 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50">
          <div>
            <h3 className="font-display text-xl font-bold text-slate-900 flex items-center gap-2">
              <Vote className="h-5 w-5 text-emerald-600" />
              Avaliar Participantes · {pelada.title}
            </h3>
            <p className="text-xs text-slate-500">
              Avalie o desempenho dos demais jogadores que participaram deste encontro.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="m-6 mb-0 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {successMsg && (
          <div className="m-6 mb-0 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            {successMsg}
          </div>
        )}

        {loading ? (
          <div className="p-12 text-center text-sm text-slate-500">Carregando participantes...</div>
        ) : !data?.canEvaluate ? (
          <div className="p-8 text-center space-y-3">
            <p className="text-sm font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-4">
              {data && !data.endTimeReached
                ? `As avaliações para este encontro estarão disponíveis após o horário de término (${pelada.endTime}) em ${pelada.eventDate}, ou após o administrador encerrar a pelada.`
                : 'Você precisa ter comparecido a este encontro para poder avaliar os demais participantes.'}
            </p>
          </div>
        ) : data.participants.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            Não há outros participantes presentes neste encontro para avaliar.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-slate-200">
            {/* Participants list */}
            <div className="md:col-span-5 p-4 max-h-[480px] overflow-y-auto space-y-1.5">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider px-2 block mb-2">
                Participantes Presentes ({data.participants.length})
              </span>
              {data.participants.map((p) => {
                const isSelected = p.playerId === selectedPlayerId;
                const isDone = data.myEvaluations.some((e) => e.playerId === p.playerId);
                return (
                  <button
                    key={p.playerId}
                    type="button"
                    onClick={() => handleSelectPlayer(p.playerId)}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-600 text-white'
                        : 'hover:bg-slate-100 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <PlayerAvatar
                        name={p.name}
                        photoUrl={p.photoUrl}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <p className={`text-xs font-bold truncate ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                          {p.nickname}
                        </p>
                        <p className={`text-[11px] truncate ${isSelected ? 'text-emerald-100' : 'text-slate-500'}`}>
                          {p.position} · Geral {p.overall.toFixed(1)}
                        </p>
                      </div>
                    </div>
                    {isDone && (
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                          isSelected
                            ? 'bg-emerald-700 text-emerald-100'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        Avaliado
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Evaluation form */}
            <div className="md:col-span-7 p-6 space-y-5 max-h-[480px] overflow-y-auto">
              {currentSelectedParticipant ? (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        Avaliando: {currentSelectedParticipant.nickname}
                      </h4>
                      <p className="text-xs text-slate-500">
                        {currentSelectedParticipant.name} · {currentSelectedParticipant.position}
                      </p>
                    </div>
                    {hasEvaluatedCurrent && (
                      <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md">
                        Editando avaliação
                      </span>
                    )}
                  </div>

                  <div className="space-y-3">
                    {displayCriteria.map((crit) => {
                      const val = scores[crit.key] ?? 7;
                      return (
                        <div key={crit.key} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-slate-700">{crit.label}</span>
                            <span className="font-mono tabular-nums font-bold text-emerald-700">
                              {val.toFixed(1)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => updateScore(crit.key, val - 0.5)}
                              className="rounded border border-slate-300 bg-slate-50 p-1 text-slate-600 hover:bg-slate-100 cursor-pointer"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <input
                              type="range"
                              min="1"
                              max="10"
                              step="0.5"
                              value={val}
                              onChange={(e) => updateScore(crit.key, Number(e.target.value))}
                              className="flex-1 accent-emerald-600 cursor-pointer"
                            />
                            <button
                              type="button"
                              onClick={() => updateScore(crit.key, val + 0.5)}
                              className="rounded border border-slate-300 bg-slate-50 p-1 text-slate-600 hover:bg-slate-100 cursor-pointer"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Comentário ou destaque (opcional)
                    </label>
                    <textarea
                      rows={2}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Ex: Jogou muito bem na zaga, excelente cobertura..."
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full rounded-lg bg-emerald-600 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
                  >
                    {saving ? 'Salvando...' : 'Salvar Avaliação do Jogador'}
                  </button>
                </form>
              ) : (
                <div className="py-12 text-center text-xs text-slate-400">
                  Selecione um participante ao lado para avaliar.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
