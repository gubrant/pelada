import { useState } from 'react';
import { X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  type AuthUser,
  DOMINANT_FEET,
  type DominantFoot,
  FUTSAL_POSITIONS,
  type FutsalPosition,
  type Player,
} from '../types/futsal';
import { ImageCaptureField } from './ImageCaptureField';
import { PlayerAvatar } from './PlayerAvatar';

interface MyProfileModalProps {
  authUser: AuthUser;
  player: Player | null;
  onClose: () => void;
  onSaved: (player: Player) => void;
}

export function MyProfileModal({ authUser, player, onClose, onSaved }: MyProfileModalProps) {
  const [name, setName] = useState(player?.name ?? authUser.name);
  const [nickname, setNickname] = useState(player?.nickname ?? authUser.name.split(' ')[0]);
  const [age, setAge] = useState(player?.age ? String(player.age) : '');
  const [position, setPosition] = useState<FutsalPosition>(player?.position ?? 'Ala Direito');
  const [dominantFoot, setDominantFoot] = useState<DominantFoot>(player?.dominantFoot ?? 'Destro');
  const [phone, setPhone] = useState(player?.phone ?? '');
  const [email, setEmail] = useState(player?.email ?? authUser.email);
  const [photoUrl, setPhotoUrl] = useState<string | null>(player?.photoUrl ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch<{ player: Player }>('/api/auth/register-profile', {
        method: 'POST',
        body: JSON.stringify({
          name,
          nickname,
          age: age ? Number(age) : null,
          position,
          dominantFoot,
          phone,
          email,
          photoUrl,
        }),
      });
      onSaved(res.player);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar perfil.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-xl bg-white border border-slate-200 shadow-xl my-8">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h3 className="font-display text-2xl font-bold text-slate-900">
              Minha Ficha de Peladeiro
            </h3>
            <p className="text-xs text-slate-500">
              Complete ou atualize seus dados pessoais e preferências na quadra.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="flex items-center gap-4">
            <PlayerAvatar name={name || 'Jogador'} photoUrl={photoUrl} size="xl" />
            <div>
              <ImageCaptureField
                value={photoUrl}
                onChange={setPhotoUrl}
                onError={setError}
                buttonLabel="Trocar foto de perfil"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nome completo</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Apelido</label>
              <input
                required
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
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
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Posição</label>
              <select
                value={position}
                onChange={(e) => setPosition(e.target.value as FutsalPosition)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                {FUTSAL_POSITIONS.map((pos) => (
                  <option key={pos} value={pos}>
                    {pos}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Pé dominante</label>
              <select
                value={dominantFoot}
                onChange={(e) => setDominantFoot(e.target.value as DominantFoot)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                {DOMINANT_FEET.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Telefone</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
            >
              {saving ? 'Salvando...' : 'Salvar Minha Ficha'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
