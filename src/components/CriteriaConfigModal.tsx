import { useState } from 'react';
import { Minus, Plus, RotateCcw, Sliders, Trash2, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { DEFAULT_GROUP_CRITERIA, type GroupCriterion } from '../types/futsal';

interface CriteriaConfigModalProps {
  groupId: number;
  groupName: string;
  peladaId?: number;
  peladaTitle?: string;
  initialCriteria: GroupCriterion[];
  onClose: () => void;
  onSaved: (criteriaConfig: GroupCriterion[]) => void;
}

const BASE_KEYS = new Set(DEFAULT_GROUP_CRITERIA.map((c) => c.key));

export function CriteriaConfigModal({
  groupId,
  groupName,
  peladaId,
  peladaTitle,
  initialCriteria,
  onClose,
  onSaved,
}: CriteriaConfigModalProps) {
  const [items, setItems] = useState<GroupCriterion[]>(() =>
    initialCriteria.length > 0
      ? initialCriteria.map((c) => ({ ...c }))
      : DEFAULT_GROUP_CRITERIA.map((c) => ({ ...c }))
  );
  const [newLabel, setNewLabel] = useState('');
  const [newShort, setNewShort] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeCount = items.filter((c) => c.enabled).length;

  function updateItem(idx: number, patch: Partial<GroupCriterion>) {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        return { ...item, ...patch };
      })
    );
  }

  function stepWeight(idx: number, delta: number) {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const next = Math.max(0.5, Math.min(5, Math.round((item.weight + delta) * 2) / 2));
        return { ...item, weight: next };
      })
    );
  }

  function handleAddCustom() {
    const label = newLabel.trim();
    if (!label) return;
    const short = newShort.trim() || label.slice(0, 10);
    const key = `custom_${label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .slice(0, 20)}_${Date.now().toString(36)}`;
    setItems((prev) => [
      ...prev,
      {
        key,
        label,
        short,
        weight: 1,
        enabled: true,
      },
    ]);
    setNewLabel('');
    setNewShort('');
  }

  function handleRestoreDefaults() {
    setItems(DEFAULT_GROUP_CRITERIA.map((c) => ({ ...c })));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!items.some((c) => c.enabled)) {
      setError('Mantenha pelo menos 1 critério ativo para compor a nota.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const endpoint = peladaId
        ? `/api/peladas/${peladaId}/criteria`
        : `/api/groups/${groupId}/criteria`;
      const res = await apiFetch<{ criteriaConfig: GroupCriterion[] }>(endpoint, {
        method: 'PUT',
        body: JSON.stringify({ criteria: items }),
      });
      onSaved(res.criteriaConfig);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar critérios.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-xl bg-white border border-slate-200 shadow-xl my-6">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <Sliders className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-display text-2xl font-bold text-slate-900">
                {peladaId
                  ? `Critérios do Encontro · ${peladaTitle || groupName}`
                  : `Critérios da Nota · ${groupName}`}
              </h3>
              <p className="text-xs text-slate-500">
                Ative, renomeie, adicione critérios ou ajuste o peso de cada atributo ({activeCount}{' '}
                ativos).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
            aria-label="Fechar configuração"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-2.5">
            {items.map((item, idx) => {
              const isCustom = !BASE_KEYS.has(item.key);
              return (
                <div
                  key={item.key}
                  className={`rounded-lg border p-3 transition-colors ${
                    item.enabled
                      ? 'border-slate-200 bg-white'
                      : 'border-slate-200 bg-slate-50 opacity-70'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={item.enabled}
                        onChange={(e) => updateItem(idx, { enabled: e.target.checked })}
                        className="h-4 w-4 accent-emerald-600 cursor-pointer"
                      />
                      <span className="sr-only">Ativar {item.label}</span>
                    </label>

                    <div className="flex-1 min-w-[160px]">
                      <input
                        value={item.label}
                        onChange={(e) => updateItem(idx, { label: e.target.value })}
                        placeholder="Nome do critério"
                        required
                        className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none"
                      />
                    </div>

                    <div className="w-24">
                      <input
                        value={item.short}
                        onChange={(e) => updateItem(idx, { short: e.target.value })}
                        placeholder="Sigla"
                        maxLength={14}
                        required
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-700 focus:border-emerald-600 focus:outline-none"
                      />
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-500">Peso</span>
                      <button
                        type="button"
                        onClick={() => stepWeight(idx, -0.5)}
                        disabled={item.weight <= 0.5}
                        className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                        aria-label={`Diminuir peso de ${item.label}`}
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="font-mono tabular-nums text-xs font-bold text-slate-900 w-8 text-center">
                        {item.weight.toFixed(1)}
                      </span>
                      <button
                        type="button"
                        onClick={() => stepWeight(idx, 0.5)}
                        disabled={item.weight >= 5}
                        className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                        aria-label={`Aumentar peso de ${item.label}`}
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>

                    {isCustom && (
                      <button
                        type="button"
                        onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                        className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                        title="Remover critério personalizado"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3.5 space-y-2.5">
            <span className="block text-xs font-semibold text-slate-700">
              Adicionar novo critério personalizado
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Ex: Raça / Marcação, Visão de jogo..."
                className="flex-1 min-w-[180px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
              />
              <input
                value={newShort}
                onChange={(e) => setNewShort(e.target.value)}
                placeholder="Sigla (ex: Raça)"
                maxLength={14}
                className="w-28 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
              />
              <button
                type="button"
                onClick={handleAddCustom}
                disabled={!newLabel.trim()}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" /> Adicionar
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={handleRestoreDefaults}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Restaurar 7 critérios padrão
            </button>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
              >
                {saving ? 'Recalculando...' : 'Salvar Critérios e Recalcular'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
