import { useEffect, useState } from 'react';
import { sendPasswordResetEmail, signInWithPopup } from 'firebase/auth';
import { ArrowLeft, CheckCircle2, KeyRound, Mail, ShieldCheck, UserPlus } from 'lucide-react';
import { auth, googleAuthProvider } from '../lib/firebase';
import { apiFetch, setInMemoryAuthToken } from '../lib/api';
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

interface AuthSuccessPayload {
  token?: string;
  user: AuthUser;
  player: Player | null;
}

interface AuthViewProps {
  inviteToken: string | null;
  resetToken: string | null;
  onClearInviteToken: () => void;
  onClearResetToken: () => void;
  onAuthSuccess: (payload: AuthSuccessPayload) => void;
}

export function AuthView({
  inviteToken,
  resetToken,
  onClearInviteToken,
  onClearResetToken,
  onAuthSuccess,
}: AuthViewProps) {
  const [mode, setMode] = useState<'login' | 'bootstrap' | 'invite' | 'forgot' | 'reset'>(
    resetToken ? 'reset' : inviteToken ? 'invite' : 'login'
  );
  const [needsAdminSetup, setNeedsAdminSetup] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [adminName, setAdminName] = useState('');

  // Password recovery & reset states
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState<string | null>(null);
  const [resetEmail, setResetEmail] = useState('');
  const [resetName, setResetName] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('');
  const [validatingReset, setValidatingReset] = useState(false);
  const [resetTokenValid, setResetTokenValid] = useState(false);

  // Invite registration states
  const [inviteEmail, setInviteEmail] = useState('');
  const [invName, setInvName] = useState('');
  const [invNickname, setInvNickname] = useState('');
  const [invAge, setInvAge] = useState('');
  const [invPosition, setInvPosition] = useState<FutsalPosition>('Ala Direito');
  const [invFoot, setInvFoot] = useState<DominantFoot>('Destro');
  const [invPhone, setInvPhone] = useState('');
  const [invPhoto, setInvPhoto] = useState<string | null>(null);
  const [invPassword, setInvPassword] = useState('');
  const [invPasswordConfirm, setInvPasswordConfirm] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ needsAdminPasswordSetup: boolean }>('/api/auth/bootstrap-status')
      .then((res) => {
        setNeedsAdminSetup(res.needsAdminPasswordSetup);
      })
      .catch(() => {
        setNeedsAdminSetup(false);
      });
  }, []);

  useEffect(() => {
    if (!inviteToken) return;
    setMode('invite');
    setError(null);
    setForgotSuccess(null);
    apiFetch<{ email: string; name: string; player: Player | null }>(
      `/api/auth/invite?token=${encodeURIComponent(inviteToken)}`
    )
      .then((res) => {
        setInviteEmail(res.email);
        setInvName(res.player?.name || res.name || '');
        setInvNickname(res.player?.nickname || '');
        setInvAge(res.player?.age ? String(res.player.age) : '');
        if (res.player?.position) setInvPosition(res.player.position);
        if (res.player?.dominantFoot) setInvFoot(res.player.dominantFoot);
        setInvPhone(res.player?.phone || '');
        setInvPhoto(res.player?.photoUrl || null);
      })
      .catch((err: Error) => {
        setError(err.message);
      });
  }, [inviteToken]);

  useEffect(() => {
    if (!resetToken) return;
    setMode('reset');
    setError(null);
    setForgotSuccess(null);
    setValidatingReset(true);
    setResetTokenValid(false);
    apiFetch<{ email: string; name: string }>(
      `/api/auth/reset-password?token=${encodeURIComponent(resetToken)}`
    )
      .then((res) => {
        setResetEmail(res.email);
        setResetName(res.name);
        setResetTokenValid(true);
      })
      .catch((err: Error) => {
        setError(err.message);
        setResetTokenValid(false);
      })
      .finally(() => {
        setValidatingReset(false);
      });
  }, [resetToken]);

  async function handleGoogleLogin() {
    setError(null);
    setLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const idToken = await cred.user.getIdToken();
      setInMemoryAuthToken(null);
      const me = await apiFetch<{ user: AuthUser; player: Player | null }>('/api/auth/me', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      onAuthSuccess({ user: me.user, player: me.player });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao autenticar com Google.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string; user: AuthUser; player: Player | null }>(
        '/api/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        }
      );
      setInMemoryAuthToken(res.token);
      onAuthSuccess(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'E-mail ou senha inválidos.');
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setForgotSuccess(null);
    const trimmedEmail = forgotEmail.trim().toLowerCase();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setError('Informe um e-mail válido.');
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch<{ ok: boolean; message: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: trimmedEmail }),
      });
      // Também dispara fluxo nativo do Firebase Auth caso a conta utilize e-mail/senha Firebase
      sendPasswordResetEmail(auth, trimmedEmail).catch(() => {});
      setForgotSuccess(res.message);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao solicitar recuperação de senha.');
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!resetToken) return;
    if (resetPassword.length < 6) {
      setError('A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (resetPassword !== resetPasswordConfirm) {
      setError('As senhas digitadas não conferem.');
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string; user: AuthUser; player: Player | null }>(
        '/api/auth/reset-password',
        {
          method: 'POST',
          body: JSON.stringify({
            token: resetToken,
            password: resetPassword,
          }),
        }
      );
      setInMemoryAuthToken(res.token);
      setResetPassword('');
      setResetPasswordConfirm('');
      onClearResetToken();
      onAuthSuccess(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível redefinir sua senha.');
    } finally {
      setLoading(false);
    }
  }

  async function handleBootstrapAdmin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string; user: AuthUser; player: Player | null }>(
        '/api/auth/bootstrap-admin',
        {
          method: 'POST',
          body: JSON.stringify({ email, name: adminName, password }),
        }
      );
      setInMemoryAuthToken(res.token);
      onAuthSuccess(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao criar administrador.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCompleteInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!inviteToken) return;
    if (invPassword.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (invPassword !== invPasswordConfirm) {
      setError('As senhas digitadas não conferem.');
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string; user: AuthUser; player: Player }>(
        '/api/auth/complete-registration',
        {
          method: 'POST',
          body: JSON.stringify({
            token: inviteToken,
            password: invPassword,
            name: invName,
            nickname: invNickname,
            age: invAge ? Number(invAge) : null,
            position: invPosition,
            dominantFoot: invFoot,
            phone: invPhone,
            photoUrl: invPhoto,
          }),
        }
      );
      setInMemoryAuthToken(res.token);
      onClearInviteToken();
      onAuthSuccess(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir seu registro.');
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
              <p className="font-semibold text-white">7 Critérios Técnicos</p>
              <p className="text-slate-300 text-xs mt-0.5">
                Média móvel das últimas 10 partidas avaliadas pelos próprios peladeiros.
              </p>
            </div>
            <div>
              <p className="font-semibold text-white">Placar e Temporadas</p>
              <p className="text-slate-300 text-xs mt-0.5">
                Artilheiro, Rei das Assistências, Melhor Defensor e Assiduidade.
              </p>
            </div>
          </div>
        </div>

        <p className="relative z-10 text-xs text-slate-400">
          Autenticação integrada com Firebase Auth e banco relacional PostgreSQL.
        </p>
      </div>

      <div className="lg:col-span-6 bg-slate-50 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="font-display text-3xl font-bold text-slate-900">
                {mode === 'invite'
                  ? 'Cadastro do Peladeiro'
                  : mode === 'reset'
                    ? 'Redefinir Senha'
                    : mode === 'forgot'
                      ? 'Recuperar Senha'
                      : mode === 'bootstrap'
                        ? 'Configurar Administrador'
                        : 'Entrar na Quadra'}
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                {mode === 'invite'
                  ? 'Defina sua senha e complete sua ficha de jogador.'
                  : mode === 'reset'
                    ? 'Escolha uma nova senha para voltar a acessar sua pelada.'
                    : mode === 'forgot'
                      ? 'Informe seu e-mail para receber o link de alteração de senha.'
                      : mode === 'bootstrap'
                        ? 'Crie o primeiro login e senha de administrador.'
                        : 'Acesse com sua conta Google ou e-mail e senha.'}
              </p>
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}

          {forgotSuccess && (
            <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800 space-y-1">
              <p className="font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />
                Solicitação enviada!
              </p>
              <p className="text-xs leading-relaxed">{forgotSuccess}</p>
              <p className="text-[11px] text-emerald-700">
                Verifique sua caixa de entrada e spam. Se você costuma entrar com Google, também pode
                clicar diretamente em &ldquo;Entrar com Google&rdquo;.
              </p>
            </div>
          )}

          {mode === 'invite' ? (
            <form onSubmit={handleCompleteInvite} className="space-y-4">
              <div className="flex items-center gap-4 pb-3 border-b border-slate-100">
                <PlayerAvatar name={invName || 'Peladeiro'} photoUrl={invPhoto} size="lg" />
                <div className="space-y-1.5">
                  <ImageCaptureField
                    value={invPhoto}
                    onChange={setInvPhoto}
                    onError={setError}
                    buttonLabel="Enviar foto de perfil"
                  />
                  <p className="text-xs text-slate-500">E-mail: {inviteEmail || 'Validando...'}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nome completo
                  </label>
                  <input
                    required
                    value={invName}
                    onChange={(e) => setInvName(e.target.value)}
                    placeholder="Ex: Lucas Pereira"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Apelido na quadra
                  </label>
                  <input
                    required
                    value={invNickname}
                    onChange={(e) => setInvNickname(e.target.value)}
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
                    value={invAge}
                    onChange={(e) => setInvAge(e.target.value)}
                    placeholder="Ex: 28"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Posição preferida
                  </label>
                  <select
                    value={invPosition}
                    onChange={(e) => setInvPosition(e.target.value as FutsalPosition)}
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
                    value={invFoot}
                    onChange={(e) => setInvFoot(e.target.value as DominantFoot)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:border-emerald-600 focus:outline-none"
                  >
                    {DOMINANT_FEET.map((foot) => (
                      <option key={foot} value={foot}>
                        {foot}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Telefone / WhatsApp
                  </label>
                  <input
                    value={invPhone}
                    onChange={(e) => setInvPhone(e.target.value)}
                    placeholder="(11) 99999-9999"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Criar senha
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={invPassword}
                    onChange={(e) => setInvPassword(e.target.value)}
                    placeholder="Mín. 6 caracteres"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Confirmar senha
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={invPasswordConfirm}
                    onChange={(e) => setInvPasswordConfirm(e.target.value)}
                    placeholder="Repita a senha"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
              >
                <CheckCircle2 className="h-4 w-4" />
                {loading ? 'Concluindo cadastro...' : 'Concluir Cadastro e Entrar'}
              </button>

              <button
                type="button"
                onClick={() => {
                  onClearInviteToken();
                  setMode('login');
                }}
                className="w-full text-center text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                Voltar para login padrão
              </button>
            </form>
          ) : mode === 'bootstrap' ? (
            <form onSubmit={handleBootstrapAdmin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nome do Administrador
                </label>
                <input
                  required
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  placeholder="Ex: Gustavo Brant"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  E-mail do Administrador
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@suapelada.com"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Definir Senha
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
              >
                <ShieldCheck className="h-4 w-4" />
                {loading ? 'Configurando...' : 'Criar Conta Administrador'}
              </button>
              <button
                type="button"
                onClick={() => setMode('login')}
                className="w-full text-center text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                Voltar para tela de login
              </button>
            </form>
          ) : mode === 'forgot' ? (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  E-mail cadastrado
                </label>
                <div className="relative">
                  <Mail className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  Enviaremos um e-mail com o link para você cadastrar uma nova senha (válido por 1
                  hora).
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
              >
                <Mail className="h-4 w-4" />
                {loading ? 'Enviando...' : 'Enviar E-mail de Recuperação'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setForgotSuccess(null);
                  setMode('login');
                }}
                className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Voltar para tela de login
              </button>
            </form>
          ) : mode === 'reset' ? (
            validatingReset ? (
              <div className="py-8 text-center text-sm text-slate-500">
                Validando link de recuperação de senha...
              </div>
            ) : !resetTokenValid ? (
              <div className="space-y-4">
                <p className="text-xs text-slate-600">
                  Você pode solicitar um novo link de alteração de senha informando seu e-mail.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onClearResetToken();
                    setError(null);
                    setForgotEmail(email);
                    setMode('forgot');
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 cursor-pointer"
                >
                  <Mail className="h-4 w-4" />
                  Solicitar novo link por e-mail
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClearResetToken();
                    setError(null);
                    setMode('login');
                  }}
                  className="w-full inline-flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Voltar para tela de login
                </button>
              </div>
            ) : (
              <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-700">
                  Redefinindo senha para <strong className="text-slate-900">{resetName}</strong> (
                  {resetEmail})
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nova senha
                  </label>
                  <div className="relative">
                    <KeyRound className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Confirmar nova senha
                  </label>
                  <div className="relative">
                    <KeyRound className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={resetPasswordConfirm}
                      onChange={(e) => setResetPasswordConfirm(e.target.value)}
                      placeholder="Repita a nova senha"
                      className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {loading ? 'Salvando nova senha...' : 'Salvar Nova Senha e Entrar'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onClearResetToken();
                    setError(null);
                    setMode('login');
                  }}
                  className="w-full inline-flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Voltar para tela de login
                </button>
              </form>
            )
          ) : (
            <div className="space-y-5">
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                  />
                </svg>
                Entrar com Google (Firebase)
              </button>

              <div className="relative flex items-center py-1">
                <div className="flex-grow border-t border-slate-200" />
                <span className="mx-3 text-xs text-slate-400">ou login e senha</span>
                <div className="flex-grow border-t border-slate-200" />
              </div>

              <form onSubmit={handlePasswordLogin} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    E-mail
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
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">
                      Senha
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setForgotSuccess(null);
                        setForgotEmail(email);
                        setMode('forgot');
                      }}
                      className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer"
                    >
                      Esqueci minha senha
                    </button>
                  </div>
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
                  className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60 transition-colors cursor-pointer"
                >
                  {loading ? 'Entrando...' : 'Entrar com E-mail e Senha'}
                </button>
              </form>

              {needsAdminSetup && (
                <div className="pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setMode('bootstrap')}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 cursor-pointer"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Primeiro acesso? Criar senha do Administrador
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
