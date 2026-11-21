import { useState } from 'react';
import { CalendarDays, Clock, Minus, Plus, Send, ShieldCheck, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  type AuthUser,
  DEFAULT_GROUP_CRITERIA,
  DOMINANT_FEET,
  type DominantFoot,
  FUTSAL_POSITIONS,
  type FutsalPosition,
  PLAYER_CATEGORIES,
  type PeladaGroupSummary,
  type Player,
  type PlayerCategory,
} from '../types/futsal';
import { ImageCaptureField } from './ImageCaptureField';
import { PlayerAvatar } from './PlayerAvatar';

interface JoinPeladaRequestModalProps {
  group: PeladaGroupSummary;
  authUser: AuthUser;
  myPlayer: Player | null;
  onClose: () => void;
  onSubmitted: (updatedPlayer: Player) => void;
}

export function JoinPeladaRequestModal({
  group,
  authUser,
  myPlayer,
  onClose,
  onSubmitted,
}: JoinPeladaRequestModalProps) {
  const effectiveCriteria =
    group.criteriaConfig && group.criteriaConfig.length > 0
      ? group.criteriaConfig
      : DEFAULT_GROUP_CRITERIA;
  const activeCriteria = effectiveCriteria.filter((c) => c.enabled && c.weight > 0);
  const displayCriteria = activeCriteria.length > 0 ? activeCriteria : DEFAULT_GROUP_CRITERIA;

  const [name, setName] = useState(myPlayer?.name ?? authUser.name ?? '');
  const [nickname, setNickname] = useState(myPlayer?.nickname ?? '');
  const [age, setAge] = useState(myPlayer?.age ? String(myPlayer.age) : '');
  const [position, setPosition] = useState<FutsalPosition>(myPlayer?.position ?? 'Ala Direito');
  const [dominantFoot, setDominantFoot] = useState<DominantFoot>(
    myPlayer?.dominantFoot ?? 'Destro'
  );
  const [phone, setPhone] = useState(myPlayer?.phone ?? '');
  const [email, setEmail] = useState(myPlayer?.email ?? authUser.email ?? '');
  const [photoUrl, setPhotoUrl] = useState<string | null>(myPlayer?.photoUrl ?? null);

  const [requestedCategory, setRequestedCategory] = useState<PlayerCategory>(
    group.myJoinRequest?.requestedCategory ?? 'mensalista'
  );
  const [requestedPeladaId, setRequestedPeladaId] = useState<number>(
    group.myJoinRequest?.requestedPeladaId ?? group.upcomingPeladas?.[0]?.id ?? 0
  );
  const [message, setMessage] = useState('');

  const [scoresMap, setScoresMap] = useState<Record<string, number>>(() => {
    const base: Record<string, number> = {
      physical: myPlayer?.initPhysical ?? 7,
      dribbling: myPlayer?.initDribbling ?? 7,
      shooting: myPlayer?.initShooting ?? 7,
      defense: myPlayer?.initDefense ?? 7,
      attack: myPlayer?.initAttack ?? 7,
      passing: myPlayer?.initPassing ?? 7,
      positioning: myPlayer?.initPositioning ?? 7,
      ...(myPlayer?.initScores ?? {}),
    };
    for (const c of displayCriteria) {
      if (base[c.key] === undefined) base[c.key] = 7;
    }
    return base;
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalWeight = displayCriteria.reduce((acc, c) => acc + c.weight, 0);
  const overallPreview =
    totalWeight > 0
      ? Math.round(
          (displayCriteria.reduce((acc, c) => acc + (scoresMap[c.key] ?? 7) * c.weight, 0) /
            totalWeight) *
            100
        ) / 100
      : 7;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await apiFetch<{ player: Player }>(`/api/groups/${group.id}/join-requests`, {
        method: 'POST',
        body: JSON.stringify({
          name,
          nickname,
          age: age ? Number(age) : null,
          position,
          dominantFoot,
          phone: phone || null,
          email,
          photoUrl,
          requestedCategory,
          requestedPeladaId:
            requestedCategory === 'eventual' && requestedPeladaId ? requestedPeladaId : null,
          message: message || null,
          scores: scoresMap,
        }),
      });
      onSubmitted(res.player);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar solicitação.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-xl bg-white border border-slate-200 shadow-xl my-6">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="min-w-0">
            <h3 className="font-display text-2xl font-bold text-slate-900 truncate">
              Solicitar Entrada · {group.name}
            </h3>
            <p className="text-xs text-slate-500">
              Preencha seu cadastro completo e suas notas nos critérios para análise dos
              administradores.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
            aria-label="Fechar solicitação"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[82vh] overflow-y-auto">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}

          {group.membershipStatus === 'rejected' && group.myJoinRequest?.responseNote && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
              <strong>Última resposta da administração:</strong> {group.myJoinRequest.responseNote}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4">
            <PlayerAvatar name={name || nickname || 'Peladeiro'} photoUrl={photoUrl} size="xl" />
            <div className="space-y-1.5">
              <ImageCaptureField
                value={photoUrl}
                onChange={setPhotoUrl}
                onError={setError}
                buttonLabel="Foto de perfil"
              />
              <p className="text-xs text-slate-500">
                Tire uma foto pela câmera ou escolha da galeria para sua ficha de peladeiro.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nome completo *
              </label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Lucas Almeida"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Apelido na quadra *
              </label>
              <input
                required
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Ex: Luquinha"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Idade</label>
              <input
                type="number"
                min={12}
                max={80}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="Ex: 28"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Posição de preferência
              </label>
              <select
                value={position}
                onChange={(e) => setPosition(e.target.value as FutsalPosition)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:border-emerald-600 focus:outline-none"
              >
                {FUTSAL_POSITIONS.map((pos) => (
                  <option key={pos} value={pos}>
                    {pos}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Pé dominante
              </label>
              <select
                value={dominantFoot}
                onChange={(e) => setDominantFoot(e.target.value as DominantFoot)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:border-emerald-600 focus:outline-none"
              >
                {DOMINANT_FEET.map((foot) => (
                  <option key={foot} value={foot}>
                    {foot}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Telefone / WhatsApp
              </label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(11) 99999-9999"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                E-mail * (usado também para receber seu resumo pós-pelada)
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jogador@email.com"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 space-y-3">
            <div>
              <h4 className="text-sm font-bold text-slate-900 mb-1">
                Tipo de Participação Solicitada
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {PLAYER_CATEGORIES.map((cat) => (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => setRequestedCategory(cat.value)}
                    className={`rounded-lg border p-3 text-left transition-colors cursor-pointer ${
                      requestedCategory === cat.value
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-950'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-xs font-bold block">{cat.label}</span>
                    <span className="text-[11px] text-slate-500 leading-snug block mt-0.5">
                      {cat.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {requestedCategory === 'eventual' ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3.5 space-y-2.5 text-xs text-amber-950">
                <p className="flex items-start gap-2">
                  <Clock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    Como <strong>Peladeiro Eventual</strong>, se autorizado, você terá acesso durante o
                    evento e por até <strong>3 dias após a pelada</strong>. Depois desse período,
                    receberá um e-mail de agradecimento com o resumo das suas estatísticas do jogo.
                  </span>
                </p>

                {group.upcomingPeladas && group.upcomingPeladas.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-amber-950 mb-1">
                      <CalendarDays className="h-3.5 w-3.5 inline mr-1" />
                      Encontro que pretende participar:
                    </label>
                    <select
                      value={requestedPeladaId}
                      onChange={(e) => setRequestedPeladaId(Number(e.target.value))}
                      className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-medium text-slate-900"
                    >
                      {group.upcomingPeladas.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title} · {p.eventDate} às {p.startTime}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-950 flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  Como{' '}
                  <strong>
                    {requestedCategory === 'mensalista' ? 'Mensalista' : 'Avulso'}
                  </strong>
                  , após autorizado por qualquer administrador, você mantém acesso contínuo a esta
                  pelada.
                </span>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-slate-900">
                  Suas Notas nos Critérios da Pelada (1 a 10)
                </h4>
                <p className="text-xs text-slate-500">
                  Autoavaliação inicial nos critérios definidos pelos administradores.
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-500 block">Média</span>
                <span className="font-mono tabular-nums text-2xl font-bold text-emerald-700">
                  {overallPreview.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              {displayCriteria.map((c) => {
                const val = scoresMap[c.key] ?? 7;
                const updateScore = (next: number) => {
                  const clamped = Math.max(1, Math.min(10, Math.round(next * 2) / 2));
                  setScoresMap((prev) => ({ ...prev, [c.key]: clamped }));
                };
                return (
                  <div key={c.key}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-slate-700">{c.label}</span>
                      <span className="font-mono tabular-nums font-bold text-slate-900">
                        {val.toFixed(1)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={val <= 1}
                        onClick={() => updateScore(val - 0.5)}
                        aria-label={`Diminuir ${c.label}`}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <input
                        type="range"
                        min={1}
                        max={10}
                        step={0.5}
                        value={val}
                        onChange={(e) => updateScore(Number(e.target.value))}
                        className="w-full accent-emerald-600 cursor-pointer"
                      />
                      <button
                        type="button"
                        disabled={val >= 10}
                        onClick={() => updateScore(val + 0.5)}
                        aria-label={`Aumentar ${c.label}`}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Recado aos administradores (opcional)
            </label>
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ex: Sou amigo do João, jogo de fixo e gostaria de participar!"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
            >
              <Send className="h-4 w-4" />
              {saving ? 'Enviando solicitação...' : 'Enviar Solicitação de Entrada'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
