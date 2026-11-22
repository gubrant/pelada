import { useState } from 'react';
import { KeyRound, LogIn, Mail, User, UserPlus } from 'lucide-react';
import { apiFetch, setInMemoryAuthToken } from '../lib/api';
import { type AuthUser, type Player } from '../types/futsal';

interface AuthSuccessPayload {
  token: string;
  user: AuthUser;
  player: Player | null;
}

interface AuthViewProps {
  onAuthSuccess: (payload: AuthSuccessPayload) => void;
}

export function AuthView({ onAuthSuccess }: AuthViewProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');

  // Login states
  const [email, setEmail] = useState('');
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
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Informe um e-mail válido.');
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
        body: JSON.stringify({ email: trimmedEmail, password }),
      });
      setInMemoryAuthToken(res.token);
      onAuthSuccess(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'E-mail ou senha inválidos.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmedEmail = regEmail.trim().toLowerCase();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Informe um e-mail válido para o login.');
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
    <div className="min-h-screen bg-slate-950 text-slate-900 grid lg:grid-cols-12">
      <div className="relative hidden lg:flex lg:col-span-6 flex-col justify-between overflow-hidden bg-slate-900 p-10 text-white">
        <img
          src="/src/assets/images/futsal_court_hero_1795299371438.jpg"
          alt="Quadra de futsal iluminada"
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/55 to-slate-950/35" />

        <div className="relative z-10 flex items-center gap-3">
          <img
            src="/src/assets/images/futsal_ball_emblem_1795299371507.jpg"
            alt="Emblema QuadraMestre"
            referrerPolicy="no-referrer"
            className="h-10 w-10 rounded-lg object-cover border border-white/20"
          />
          <span className="font-display text-2xl font-bold tracking-wide text-white">
            QuadraMestre
          </span>
        </div>

        <div className="relative z-10 max-w-lg space-y-6">
          <h1 className="font-display text-5xl font-extrabold leading-[1.02] tracking-tight text-balance">
            O controle completo da sua pelada de futsal.
          </h1>
          <p className="text-base text-slate-200 leading-relaxed">
            Separe times equilibrados por nota e posição, registre gols e assistências em tempo
            real, controle temporadas e acompanhe a evolução de cada jogador nos últimos 10 jogos.
          </p>

          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/15 text-sm text-slate-200">
            <div>
              <p className="font-semibold text-white">Critérios Técnicos</p>
              <p className="text-slate-300 text-xs mt-0.5">
                Média móvel das últimas 10 partidas avaliadas pelos próprios peladeiros.
              </p>
            </div>
            <div>
              <p className="font-semibold text-white">Placar, Caixa e Ranking</p>
              <p className="text-slate-300 text-xs mt-0.5">
                Artilheiro, Rei das Assistências, Melhor Defensor, Assiduidade e Financeiro.
              </p>
            </div>
          </div>
        </div>

        <p className="relative z-10 text-xs text-slate-400">
          Acesso direto com login e senha · Banco relacional PostgreSQL.
        </p>
      </div>

      <div className="lg:col-span-6 bg-slate-50 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
          <div className="mb-6">
            <h2 className="font-display text-3xl font-bold text-slate-900">
              {mode === 'login' ? 'Entrar na Quadra' : 'Criar Login e Senha'}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {mode === 'login'
                ? 'Informe seu e-mail e senha para acessar suas peladas.'
                : 'Crie seu acesso na hora com um e-mail válido e senha de no mínimo 6 dígitos.'}
            </p>
          </div>

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
                  E-mail (Login)
                </label>
                <div className="relative">
                  <Mail className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Senha</label>
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
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60 transition-colors cursor-pointer"
              >
                <LogIn className="h-4 w-4" />
                {loading ? 'Entrando...' : 'Entrar'}
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
                  <Mail className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
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
