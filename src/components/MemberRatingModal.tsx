import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  SKILL_CRITERIA,
  type MemberCategory,
  type PeladaMembership,
} from '../types/pelada';

interface MemberRatingModalProps {
  peladaId: number;
  peladaName: string;
  member: PeladaMembership;
  onClose: () => void;
  onUpdated: () => void;
}

export const MemberRatingModal: React.FC<MemberRatingModalProps> = ({
  peladaId,
  peladaName,
  member,
  onClose,
  onUpdated,
}) => {
  const [category, setCategory] = useState<MemberCategory>(member.category);
  const [active, setActive] = useState<boolean>(member.active);
  const [scores, setScores] = useState({
    dribbling: member.dribbling,
    physical: member.physical,
    passing: member.passing,
    attack: member.attack,
    defense: member.defense,
    shooting: member.shooting,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const overallPreview = useMemo(() => {
    const sum =
      scores.dribbling +
      scores.physical +
      scores.passing +
      scores.attack +
      scores.defense +
      scores.shooting;
    return (sum / 6).toFixed(1);
  }, [scores]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await apiFetch(`/api/peladas/${peladaId}/members/${member.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          category,
          active,
          ...scores,
        }),
      });
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar notas.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="font-display text-2xl font-bold uppercase tracking-tight text-slate-900">
              Avaliar Membro na Pelada
            </h2>
            <p className="text-xs text-slate-500">
              {member.userName}
              {member.nickname ? ` (${member.nickname})` : ''} · {peladaName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            Estas notas valem <strong>exclusivamente para "{peladaName}"</strong>. Se este
            jogador participar de outras peladas da semana, as notas dele lá permanecem
            independentes.
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Categoria do membro
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as MemberCategory)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600"
              >
                <option value="mensalista">Mensalista (Prioridade)</option>
                <option value="avulso">Avulso</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Status na pelada
              </label>
              <select
                value={active ? 'active' : 'inactive'}
                onChange={(e) => setActive(e.target.value === 'active')}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600"
              >
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
              </select>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-4 space-y-3.5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Notas nos 6 Critérios
              </span>
              <span className="font-mono text-lg font-bold tabular-nums text-emerald-700">
                Média: {overallPreview}
              </span>
            </div>

            {SKILL_CRITERIA.map((criterion) => (
              <div key={criterion.key} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700">{criterion.label}</span>
                  <span className="font-mono font-bold tabular-nums text-slate-900">
                    {scores[criterion.key].toFixed(1)}
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={0.5}
                  value={scores[criterion.key]}
                  onChange={(e) =>
                    setScores((prev) => ({
                      ...prev,
                      [criterion.key]: Number(e.target.value),
                    }))
                  }
                  className="w-full accent-emerald-600 cursor-pointer"
                />
              </div>
            ))}
          </div>

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving ? 'Salvando...' : 'Salvar Notas desta Pelada'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
