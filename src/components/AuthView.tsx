import { useState } from 'react';
import { CalendarDays, KeyRound, LogIn, MapPin, ShieldCheck, User, UserPlus, X } from 'lucide-react';
import { apiFetch, setInMemoryAuthToken } from '../lib/api';
import { type AuthUser, type PeladaGroupSummary, type Player } from '../types/futsal';

export interface AuthSuccessPayload {
  token: string;
  user: AuthUser;
  player: Player | null;
  groupAccess?: {
    allowed: boolean;
    reason?: string;
    expiredAt?: string | null;
  } | null;
}

interface AuthModalProps {
  targetGroup?: PeladaGroupSummary | null;
  onClose: () => void;
  onAuthSuccess: (payload: AuthSuccessPayload) => void;
}

export function AuthModal({ targetGroup = null, onClose, onAuthSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');

  // Login states (aceita usuário simples ou e-mail)
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');

  // Self-registration states
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regPasswordConfirm, setRegPasswordConfirm] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmedLogin = loginId.trim().toLowerCase();
    if (!trimmedLogin || trimmedLogin.length < 3 || /\s/.test(trimmedLogin)) {
      setError('Informe um login válido (mínimo 3 caracteres, sem espaços).');
      return;
    }
    if (!password) {
      setError('Informe sua senha.');
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch<AuthSuccessPayload>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          login: trimmedLogin,
          password,
          groupId: targetGroup?.id ?? null,
        }),
      });
      setInMemoryAuthToken(res.token);
      onAuthSuccess(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login ou senha inválidos.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmedEmail = regEmail.trim().toLowerCase();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Informe um e-mail válido para criar sua conta.');
      return;
    }
    if (regPassword.length < 6) {
      setError('A senha deve ter no mínimo 6 dígitos.');
      return;
    }
    if (regPassword !== regPasswordConfirm) {
      setError('As senhas digitadas não conferem.');
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch<AuthSuccessPayload>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: regName.trim(),
          email: trimmedEmail,
          password: regPassword,
        }),
      });
      setInMemoryAuthToken(res.token);
      onAuthSuccess(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar seu login.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden my-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-slate-900 px-6 py-5 text-white flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span>{targetGroup ? 'Acesso à Pelada Fixa' : 'Acesso ao QuadraMestre'}</span>
            </div>
            <h2 className="font-display text-2xl font-bold leading-tight truncate">
              {targetGroup ? targetGroup.name : mode === 'login' ? 'Entrar na Quadra' : 'Criar Conta'}
            </h2>
            {targetGroup ? (
              <p className="text-xs text-slate-300 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="h-3 w-3 text-emerald-400" />
                  {targetGroup.weekday} · {targetGroup.startTime} às {targetGroup.endTime}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3 text-emerald-400" />
                  {targetGroup.location}
                </span>
              </p>
            ) : (
              <p className="text-xs text-slate-300">
                Use o login e senha fornecidos pelo organizador da pelada ou sua conta.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer shrink-0"
            aria-label="Fechar janela de login"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1 mb-5">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setMode('login');
              }}
              className={`rounded-md py-2 text-xs font-semibold transition-colors cursor-pointer ${
                mode === 'login'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Já tenho login
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setMode('register');
              }}
              className={`rounded-md py-2 text-xs font-semibold transition-colors cursor-pointer ${
                mode === 'register'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Criar conta agora
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}

          {mode === 'login' ? (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Login (usuário ou e-mail) *
                </label>
                <div className="relative">
                  <User className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    autoFocus
                    autoCapitalize="none"
                    autoCorrect="off"
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                    placeholder="Ex: joao.silva ou seu@email.com"
                    className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Senha *</label>
                <div className="relative">
                  <KeyRound className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors cursor-pointer"
              >
                <LogIn className="h-4 w-4" />
                {loading
                  ? 'Verificando acesso...'
                  : targetGroup
                    ? 'Entrar na Pelada'
                    : 'Entrar'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nome ou Apelido
                </label>
                <div className="relative">
                  <User className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="Ex: Lucas Pereira"
                    className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  E-mail válido (será seu login) *
                </label>
                <div className="relative">
                  <User className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Senha (mínimo 6 dígitos) *
                </label>
                <div className="relative">
                  <KeyRound className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="Mínimo 6 dígitos"
                    className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Confirmar senha *
                </label>
                <div className="relative">
                  <KeyRound className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={regPasswordConfirm}
                    onChange={(e) => setRegPasswordConfirm(e.target.value)}
                    placeholder="Repita a senha"
                    className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors cursor-pointer"
              >
                <UserPlus className="h-4 w-4" />
                {loading ? 'Criando acesso...' : 'Criar Login e Entrar'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
