import { useState } from 'react';
import { Bell, Mail, Minus, Plus, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  DEFAULT_GROUP_CRITERIA,
  DOMINANT_FEET,
  type DominantFoot,
  FUTSAL_POSITIONS,
  type FutsalPosition,
  type GroupCriterion,
  type InviteEmailRecord,
  PLAYER_CATEGORIES,
  type PeladaSummary,
  type Player,
  type PlayerCategory,
} from '../types/futsal';
import { ImageCaptureField } from './ImageCaptureField';
import { PlayerAvatar } from './PlayerAvatar';

interface PlayerFormModalProps {
  player: Player | null;
  isAdmin: boolean;
  groupId?: number | null;
  groupName?: string;
  groupPeladas?: PeladaSummary[];
  criteriaConfig?: GroupCriterion[];
  onClose: () => void;
  onSaved: (player: Player, invite?: InviteEmailRecord | null) => void;
}

export function PlayerFormModal({
  player,
  isAdmin,
  groupId,
  groupName,
  groupPeladas = [],
  criteriaConfig,
  onClose,
  onSaved,
}: PlayerFormModalProps) {
  const isEditing = Boolean(player);

  const effectiveCriteria =
    criteriaConfig && criteriaConfig.length > 0 ? criteriaConfig : DEFAULT_GROUP_CRITERIA;
  const activeCriteria = effectiveCriteria.filter((c) => c.enabled && c.weight > 0);
  const displayCriteria = activeCriteria.length > 0 ? activeCriteria : DEFAULT_GROUP_CRITERIA;

  const [name, setName] = useState(player?.name ?? '');
  const [nickname, setNickname] = useState(player?.nickname ?? '');
  const [age, setAge] = useState(player?.age ? String(player.age) : '');
  const [position, setPosition] = useState<FutsalPosition>(player?.position ?? 'Ala Direito');
  const [dominantFoot, setDominantFoot] = useState<DominantFoot>(player?.dominantFoot ?? 'Destro');
  const [phone, setPhone] = useState(player?.phone ?? '');
  const [email, setEmail] = useState(player?.email ?? '');
  const [photoUrl, setPhotoUrl] = useState<string | null>(player?.photoUrl ?? null);

  const [category, setCategory] = useState<PlayerCategory>(
    isAdmin ? (player?.category ?? 'mensalista') : 'eventual'
  );
  const [exclusivity, setExclusivity] = useState<'none' | 'group' | 'encounter'>(() => {
    if (!isAdmin) return 'group';
    if (player?.exclusivePeladaId) return 'encounter';
    if (player?.exclusiveGroupId) return 'group';
    return 'none';
  });
  const [exclusivePeladaId, setExclusivePeladaId] = useState<number>(
    player?.exclusivePeladaId ?? groupPeladas[0]?.id ?? 0
  );

  const [scoresMap, setScoresMap] = useState<Record<string, number>>(() => {
    const base: Record<string, number> = {
      physical: player?.initPhysical ?? 7,
      dribbling: player?.initDribbling ?? 7,
      shooting: player?.initShooting ?? 7,
      defense: player?.initDefense ?? 7,
      attack: player?.initAttack ?? 7,
      passing: player?.initPassing ?? 7,
      positioning: player?.initPositioning ?? 7,
      ...(player?.initScores ?? {}),
    };
    for (const c of displayCriteria) {
      if (base[c.key] === undefined) base[c.key] = 7;
    }
    return base;
  });

  const [castInitialVote, setCastInitialVote] = useState(false);

  const [accessMode, setAccessMode] = useState<'none' | 'invite' | 'password'>(
    isAdmin ? 'invite' : 'none'
  );
  const [initialPassword, setInitialPassword] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalWeight = displayCriteria.reduce((acc, c) => acc + c.weight, 0);
  const initOverall =
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
      if (isEditing && player) {
        const payload: Record<string, unknown> = {
          name,
          nickname,
          age: age ? Number(age) : null,
          position,
          dominantFoot,
          phone: phone || null,
          email: email || null,
          photoUrl,
        };
        if (isAdmin) {
          payload.initPhysical = scoresMap.physical ?? 7;
          payload.initDribbling = scoresMap.dribbling ?? 7;
          payload.initShooting = scoresMap.shooting ?? 7;
          payload.initDefense = scoresMap.defense ?? 7;
          payload.initAttack = scoresMap.attack ?? 7;
          payload.initPassing = scoresMap.passing ?? 7;
          payload.initPositioning = scoresMap.positioning ?? 7;
          payload.scores = scoresMap;
          payload.category = category;
          payload.groupId = groupId ?? null;
          payload.exclusivity = exclusivity;
          payload.exclusivePeladaId = exclusivity === 'encounter' ? exclusivePeladaId || null : null;
        }
        const res = await apiFetch<{ player: Player }>(`/api/players/${player.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        onSaved(res.player, null);
      } else {
        const effectiveCategory: PlayerCategory = isAdmin ? category : 'eventual';
        const effectiveExclusivity = isAdmin
          ? exclusivity
          : exclusivity === 'encounter'
            ? 'encounter'
            : 'group';
        const res = await apiFetch<{ player: Player; invite: InviteEmailRecord | null }>(
          '/api/players',
          {
            method: 'POST',
            body: JSON.stringify({
              name,
              nickname,
              age: age ? Number(age) : null,
              position,
              dominantFoot,
              phone: phone || null,
              email: email || null,
              photoUrl,
              category: effectiveCategory,
              exclusivity: effectiveExclusivity,
              exclusivePeladaId:
                effectiveExclusivity === 'encounter' ? exclusivePeladaId || null : null,
              initPhysical: scoresMap.physical ?? 7,
              initDribbling: scoresMap.dribbling ?? 7,
              initShooting: scoresMap.shooting ?? 7,
              initDefense: scoresMap.defense ?? 7,
              initAttack: scoresMap.attack ?? 7,
              initPassing: scoresMap.passing ?? 7,
              initPositioning: scoresMap.positioning ?? 7,
              scores: scoresMap,
              castInitialVote: isAdmin ? castInitialVote : false,
              accessMode: isAdmin && email ? accessMode : 'none',
              initialPassword,
              groupId: groupId ?? null,
            }),
          }
        );
        onSaved(res.player, res.invite);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar jogador.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-xl bg-white border border-slate-200 shadow-xl my-8">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h3 className="font-display text-2xl font-bold text-slate-900">
              {isEditing
                ? 'Editar Ficha do Peladeiro'
                : isAdmin
                  ? 'Cadastrar Novo Peladeiro'
                  : 'Cadastrar Peladeiro Eventual (Convidado)'}
            </h3>
            <p className="text-xs text-slate-500">
              {isAdmin
                ? 'Dados completos do atleta, categoria na pelada, nota inicial e envio de acesso.'
                : `Cadastro exclusivo para ${groupName || 'esta pelada'}. Este convidado não participará de outras peladas.`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
            aria-label="Fechar modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4">
            <PlayerAvatar name={name || nickname || 'Jogador'} photoUrl={photoUrl} size="xl" />
            <div className="space-y-1.5">
              <ImageCaptureField
                value={photoUrl}
                onChange={setPhotoUrl}
                onError={setError}
                buttonLabel="Selecionar foto de perfil"
              />
              <p className="text-xs text-slate-500">
                Tire uma foto pela câmera ou escolha da galeria para o card do atleta.
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
                placeholder="Ex: Rodrigo Teixeira"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Apelido *
              </label>
              <input
                required
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Ex: Digão"
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
                placeholder="Ex: 29"
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">Telefone</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(11) 99999-9999"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                E-mail do peladeiro
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jogador@email.com"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
              />
            </div>
          </div>

          {/* Categoria e Exclusividade na Pelada */}
          <div className="pt-4 border-t border-slate-200 space-y-4">
            <div>
              <h4 className="text-sm font-bold text-slate-900 mb-1">
                Categoria do Peladeiro
              </h4>
              {isAdmin ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {PLAYER_CATEGORIES.map((cat) => (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => {
                        setCategory(cat.value);
                        if (cat.value === 'eventual' && groupId && exclusivity === 'none') {
                          setExclusivity('group');
                        }
                      }}
                      className={`rounded-lg border p-3 text-left transition-colors cursor-pointer ${
                        category === cat.value
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
              ) : (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-950">
                  <strong>Peladeiro Eventual (Convidado)</strong> — Qualquer peladeiro inscrito pode
                  cadastrar um convidado eventual, com participação restrita apenas a esta pelada.
                </div>
              )}
            </div>

            {groupId && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-2.5">
                <span className="block text-xs font-semibold text-slate-800">
                  Alcance da participação
                </span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setExclusivity('group')}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                      exclusivity === 'group'
                        ? 'border-emerald-600 bg-white text-emerald-800 shadow-xs'
                        : 'border-slate-200 bg-white/60 text-slate-600'
                    }`}
                  >
                    Somente nesta pelada ({groupName || 'atual'})
                  </button>

                  {groupPeladas.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setExclusivity('encounter');
                        if (!exclusivePeladaId && groupPeladas[0]) {
                          setExclusivePeladaId(groupPeladas[0].id);
                        }
                      }}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                        exclusivity === 'encounter'
                          ? 'border-emerald-600 bg-white text-emerald-800 shadow-xs'
                          : 'border-slate-200 bg-white/60 text-slate-600'
                      }`}
                    >
                      Somente em um encontro específico
                    </button>
                  )}

                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => setExclusivity('none')}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                        exclusivity === 'none'
                          ? 'border-emerald-600 bg-white text-emerald-800 shadow-xs'
                          : 'border-slate-200 bg-white/60 text-slate-600'
                      }`}
                    >
                      Pode participar de outras peladas
                    </button>
                  )}
                </div>

                {exclusivity === 'encounter' && groupPeladas.length > 0 && (
                  <select
                    value={exclusivePeladaId}
                    onChange={(e) => setExclusivePeladaId(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800"
                  >
                    {groupPeladas.map((gp) => (
                      <option key={gp.id} value={gp.id}>
                        {gp.title} ({gp.eventDate} · {gp.startTime})
                      </option>
                    ))}
                  </select>
                )}

                <p className="text-[11px] text-slate-500">
                  {exclusivity === 'none'
                    ? 'Este jogador ficará disponível para ser adicionado em outras peladas do aplicativo.'
                    : 'Este cadastro ficará restrito somente a esta pelada e não aparecerá em outras.'}
                </p>
              </div>
            )}
          </div>

          {(isAdmin || !isEditing) && (
            <div className="pt-4 border-t border-slate-200 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    Nota Inicial por Critério (1 a 10)
                  </h4>
                  <p className="text-xs text-slate-500">
                    {!isEditing
                      ? 'Ao cadastrar, os administradores da pelada serão notificados para votar nos critérios; a média será a nota inicial.'
                      : 'Após as partidas, prevalece a média dos últimos 10 jogos.'}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-500 block">Média Inicial</span>
                  <span className="font-mono tabular-nums text-2xl font-bold text-emerald-700">
                    {initOverall.toFixed(2)}
                  </span>
                </div>
              </div>

              {!isEditing && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-xs text-amber-950 space-y-2">
                  <div className="flex items-start gap-2">
                    <Bell className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      {isAdmin
                        ? 'Todos os administradores desta pelada receberão uma notificação para avaliar os critérios deste novo cadastro.'
                        : 'Os administradores desta pelada serão notificados para votar nos critérios e definir a nota inicial oficial deste convidado.'}
                    </span>
                  </div>
                  {isAdmin && (
                    <label className="inline-flex items-center gap-2 font-semibold text-amber-950 cursor-pointer pt-0.5">
                      <input
                        type="checkbox"
                        checked={castInitialVote}
                        onChange={(e) => setCastInitialVote(e.target.checked)}
                        className="accent-emerald-600 cursor-pointer"
                      />
                      Já registrar meu voto inicial com estas notas agora
                    </label>
                  )}
                </div>
              )}

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
                        <span className="font-medium text-slate-700">
                          {c.label}
                          {c.weight !== 1 && (
                            <span className="text-slate-400 ml-1">(peso {c.weight.toFixed(1)})</span>
                          )}
                        </span>
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
          )}

          {!isEditing && isAdmin && (
            <div className="pt-4 border-t border-slate-200 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Mail className="h-4 w-4 text-emerald-600" />
                Acesso do Jogador ao Aplicativo
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setAccessMode('invite')}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold text-left cursor-pointer ${
                    accessMode === 'invite'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Enviar convite por e-mail
                </button>
                <button
                  type="button"
                  onClick={() => setAccessMode('password')}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold text-left cursor-pointer ${
                    accessMode === 'password'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Definir senha agora
                </button>
                <button
                  type="button"
                  onClick={() => setAccessMode('none')}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold text-left cursor-pointer ${
                    accessMode === 'none'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Sem acesso por enquanto
                </button>
              </div>

              {accessMode === 'password' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Senha inicial do jogador (mín. 6 caracteres)
                  </label>
                  <input
                    type="password"
                    minLength={6}
                    value={initialPassword}
                    onChange={(e) => setInitialPassword(e.target.value)}
                    placeholder="Defina a senha de acesso"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              )}

              {accessMode === 'invite' && (
                <p className="text-xs text-slate-500">
                  Ao salvar com um e-mail válido, o sistema gera o e-mail de convite com link único
                  para o peladeiro criar login, senha e atualizar seu cadastro.
                </p>
              )}
            </div>
          )}

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
              className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
            >
              {saving ? 'Salvando...' : isEditing ? 'Salvar Alterações' : 'Cadastrar Peladeiro'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
