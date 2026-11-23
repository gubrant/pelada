import React, { useState } from 'react';
import { X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { WEEKDAYS, type WeeklyPelada } from '../types/pelada';

interface PeladaFormModalProps {
  pelada?: WeeklyPelada | null;
  onClose: () => void;
  onSaved: (pelada: WeeklyPelada) => void;
}

export const PeladaFormModal: React.FC<PeladaFormModalProps> = ({
  pelada,
  onClose,
  onSaved,
}) => {
  const [name, setName] = useState(pelada?.name || '');
  const [weekday, setWeekday] = useState(pelada?.weekday || 'Quarta-feira');
  const [startTime, setStartTime] = useState(pelada?.startTime || '20:00');
  const [endTime, setEndTime] = useState(pelada?.endTime || '22:00');
  const [location, setLocation] = useState(pelada?.location || '');
  const [address, setAddress] = useState(pelada?.address || '');
  const [playersPerTeam, setPlayersPerTeam] = useState(String(pelada?.playersPerTeam ?? 5));
  const [defaultTeamsCount, setDefaultTeamsCount] = useState(
    String(pelada?.defaultTeamsCount ?? 2)
  );
  const [maxPlayers, setMaxPlayers] = useState(
    pelada?.maxPlayers ? String(pelada.maxPlayers) : ''
  );
  const [pixKey, setPixKey] = useState(pelada?.pixKey || '');
  const [mensalistaFee, setMensalistaFee] = useState(
    String(pelada?.mensalistaFee ?? 0)
  );
  const [avulsoFee, setAvulsoFee] = useState(String(pelada?.avulsoFee ?? 0));
  const [notes, setNotes] = useState(pelada?.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        weekday,
        startTime,
        endTime,
        location: location.trim(),
        address: address.trim() || null,
        playersPerTeam: Number(playersPerTeam) || 5,
        defaultTeamsCount: Number(defaultTeamsCount) || 2,
        maxPlayers: maxPlayers.trim() ? Number(maxPlayers) : null,
        pixKey: pixKey.trim(),
        mensalistaFee: Number(mensalistaFee) || 0,
        avulsoFee: Number(avulsoFee) || 0,
        notes: notes.trim() || null,
      };

      const res = pelada
        ? await apiFetch<{ pelada: WeeklyPelada }>(`/api/peladas/${pelada.id}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          })
        : await apiFetch<{ pelada: WeeklyPelada }>('/api/peladas', {
            method: 'POST',
            body: JSON.stringify(payload),
          });

      onSaved(res.pelada);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar pelada fixa.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="font-display text-2xl font-bold uppercase tracking-tight text-slate-900">
              {pelada ? 'Editar Pelada Fixa' : 'Nova Pelada Fixa da Semana'}
            </h2>
            <p className="text-xs text-slate-500">
              Defina dia, horários, vagas, chave PIX e valores de mensalista e avulso.
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
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Nome da pelada *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Pelada de Quarta — Arena Sul"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Dia fixo na semana *
              </label>
              <select
                value={weekday}
                onChange={(e) => setWeekday(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600"
              >
                {WEEKDAYS.map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Início *
                </label>
                <input
                  type="time"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums outline-none focus:border-emerald-600"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Término *
                </label>
                <input
                  type="time"
                  required
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums outline-none focus:border-emerald-600"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Local / Quadra *
              </label>
              <input
                type="text"
                required
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Ex.: Arena Boa Vista - Quadra 2"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Endereço (opcional)
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Rua, número e bairro"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600"
              />
            </div>
          </div>

          {/* Configuração Financeira e PIX */}
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-900">
              PIX e Valores da Pelada
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Chave PIX da pelada
                </label>
                <input
                  type="text"
                  value={pixKey}
                  onChange={(e) => setPixKey(e.target.value)}
                  placeholder="CPF, CNPJ, e-mail ou aleatória"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Valor Mensalista (R$)
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={mensalistaFee}
                  onChange={(e) => setMensalistaFee(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono tabular-nums outline-none focus:border-emerald-600"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Valor Avulso (R$)
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={avulsoFee}
                  onChange={(e) => setAvulsoFee(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono tabular-nums outline-none focus:border-emerald-600"
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Jogadores por time
              </label>
              <input
                type="number"
                min={3}
                max={11}
                value={playersPerTeam}
                onChange={(e) => setPlayersPerTeam(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums outline-none focus:border-emerald-600"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Qtd. de times padrão
              </label>
              <input
                type="number"
                min={2}
                max={6}
                value={defaultTeamsCount}
                onChange={(e) => setDefaultTeamsCount(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums outline-none focus:border-emerald-600"
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
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(e.target.value)}
                placeholder="Sem limite"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums outline-none focus:border-emerald-600"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Mensalistas têm prioridade automática dentro do limite.
              </p>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Observações / Regras da quadra
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex.: Chegar 15 min antes; usar tênis de solado liso."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600"
            />
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
              {saving ? 'Salvando...' : pelada ? 'Salvar Alterações' : 'Cadastrar Pelada'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
