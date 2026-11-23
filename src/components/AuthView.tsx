import React, { useState } from 'react';
import { ShieldCheck, UserPlus, LogIn, Trophy } from 'lucide-react';
import { apiFetch, setAuthToken } from '../lib/api';
import type { AuthUser } from '../types/pelada';

interface AuthViewProps {
  needsAdminSetup: boolean;
  onAuthenticated: (user: AuthUser) => void;
}

export const AuthView: React.FC<AuthViewProps> = ({
  needsAdminSetup,
  onAuthenticated,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState(needsAdminSetup ? 'gubrant@gmail.com' : '');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const endpoint = needsAdminSetup
        ? '/api/auth/bootstrap-admin'
        : mode === 'register'
          ? '/api/auth/register'
          : '/api/auth/login';

      const body =
        needsAdminSetup || mode === 'register'
          ? { name: name.trim(), email: email.trim(), password }
          : { email: email.trim(), password };

      const res = await apiFetch<{ token: string; user: AuthUser }>(endpoint, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      setAuthToken(res.token);
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na autenticação.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-900 grid lg:grid-cols-12">
      {/* Coluna visual esquerda */}
      <div className="relative hidden lg:flex lg:col-span-7 flex-col justify-between overflow-hidden bg-slate-900 p-10 text-white">
        <img
          src="/src/assets/images/futsal_court_hero_1795299371438.jpg"
          alt="Quadra de futsal iluminada"
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover opacity-35"
        />
        <div className="absolute inset-0 bg-gradient-to-tr from-slate-950 via-slate-950/80 to-emerald-950/40" />

        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600 text-white">
            <Trophy className="h-5 w-5" />
          </div>
          <div>
            <p className="font-display text-2xl font-bold tracking-tight uppercase">
              QuadraMestre
            </p>
            <p className="text-xs text-slate-300">Gestão de Peladas Fixas da Semana</p>
          </div>
        </div>

        <div className="relative z-10 max-w-xl space-y-6">
          <h1 className="font-display text-5xl font-bold uppercase leading-[0.95] tracking-tight">
            Organize sua semana na quadra com precisão.
          </h1>
          <p className="text-sm leading-relaxed text-slate-300">
            Controle completo de mensalistas e avulsos, notas individuais por pelada nos 6
            critérios técnicos, ficha médica de ingresso, fluxo financeiro com comprovantes em
            imagem e sorteio equilibrado de times.
          </p>

          <div className="grid grid-cols-3 gap-4 border-t border-white/15 pt-5 text-xs">
            <div>
              <p className="font-semibold text-emerald-400">6 Critérios</p>
              <p className="mt-0.5 text-slate-300">
                Drible, Preparo, Passe, Ataque, Defesa e Chute
              </p>
            </div>
            <div>
              <p className="font-semibold text-emerald-400">Prioridade Real</p>
              <p className="mt-0.5 text-slate-300">
                Mensalistas garantidos antes dos avulsos nos jogos
              </p>
            </div>
            <div>
              <p className="font-semibold text-emerald-400">Caixa Transparente</p>
              <p className="mt-0.5 text-slate-300">
                Entradas e saídas com foto do recibo ou nota fiscal
              </p>
            </div>
          </div>
        </div>

        <p className="relative z-10 text-xs text-slate-400">
          Sistema multi-peladas · Notas independentes por grupo semanal
        </p>
      </div>

      {/* Coluna de formulário direita */}
      <div className="lg:col-span-5 flex items-center justify-center bg-slate-50 px-6 py-12">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white">
              <Trophy className="h-5 w-5" />
            </div>
            <div>
              <p className="font-display text-xl font-bold uppercase tracking-tight text-slate-900">
                QuadraMestre
              </p>
              <p className="text-xs text-slate-500">Peladas Fixas da Semana</p>
            </div>
          </div>

          {needsAdminSetup ? (
            <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                <div>
                  <h2 className="text-sm font-bold text-emerald-950">
                    Configuração Inicial do Administrador
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-emerald-800">
                    O banco está limpo. Crie a primeira conta de{' '}
                    <strong>Administrador</strong> para cadastrar as peladas fixas da semana,
                    definir o PIX e gerenciar os membros.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="mb-6">
              <div className="grid grid-cols-2 rounded-lg border border-slate-200 bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError(null);
                  }}
                  className={`flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-semibold transition-colors ${
                    mode === 'login'
                      ? 'bg-white text-slate-900 border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <LogIn className="h-3.5 w-3.5" />
                  Entrar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setError(null);
                  }}
                  className={`flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-semibold transition-colors ${
                    mode === 'register'
                      ? 'bg-white text-slate-900 border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Sou Peladeiro
                </button>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                {mode === 'login'
                  ? 'Acesse com seu e-mail e senha para confirmar presença e acompanhar sua pelada.'
                  : 'Crie seu acesso de peladeiro para preencher sua ficha de ingresso e marcar presença.'}
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {(needsAdminSetup || mode === 'register') && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Nome completo
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Gabriel Braga"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
                />
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">
                E-mail de acesso
              </label>
              <input
                type="email"
                required
                readOnly={needsAdminSetup}
                value={needsAdminSetup ? 'gubrant@gmail.com' : email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@exemplo.com"
                className={`w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 ${
                  needsAdminSetup ? 'bg-slate-100 text-slate-600 cursor-not-allowed' : 'bg-white'
                }`}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">
                Senha (mínimo 6 caracteres)
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
            >
              {submitting
                ? 'Processando...'
                : needsAdminSetup
                  ? 'Criar Administrador e Entrar'
                  : mode === 'register'
                    ? 'Criar Conta de Peladeiro'
                    : 'Entrar no Sistema'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
