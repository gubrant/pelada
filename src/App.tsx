import React, { useEffect, useState } from 'react';
import {
  CalendarDays,
  ClipboardList,
  LogOut,
  Plus,
  QrCode,
  Shield,
  Trophy,
  Users,
  Wallet,
} from 'lucide-react';
import { apiFetch, getAuthToken, setAuthToken } from './lib/api';
import type { AuthUser, MemberProfile, WeeklyPelada } from './types/pelada';
import { AdminAccountsView } from './components/AdminAccountsView';
import { AuthView } from './components/AuthView';
import { IntakeFormView } from './components/IntakeFormView';
import { PeladaFormModal } from './components/PeladaFormModal';
import { PeladaWorkspace } from './components/PeladaWorkspace';

type AppPage = 'peladas' | 'intake' | 'accounts';

function formatMoney(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function App() {
  const [booting, setBooting] = useState(true);
  const [needsAdminSetup, setNeedsAdminSetup] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [myProfile, setMyProfile] = useState<MemberProfile | null>(null);

  const [activePage, setActivePage] = useState<AppPage>('peladas');
  const [peladas, setPeladas] = useState<WeeklyPelada[]>([]);
  const [selectedPeladaId, setSelectedPeladaId] = useState<number | null>(null);
  const [loadingPeladas, setLoadingPeladas] = useState(false);

  const [peladaModalOpen, setPeladaModalOpen] = useState(false);
  const [editingPelada, setEditingPelada] = useState<WeeklyPelada | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const initSession = async () => {
    setBooting(true);
    try {
      const boot = await apiFetch<{ needsAdminSetup: boolean }>('/api/auth/bootstrap-status');
      setNeedsAdminSetup(boot.needsAdminSetup);

      if (getAuthToken()) {
        try {
          const me = await apiFetch<{ user: AuthUser; profile: MemberProfile | null }>(
            '/api/auth/me'
          );
          setCurrentUser(me.user);
          setMyProfile(me.profile);
        } catch {
          setAuthToken(null);
          setCurrentUser(null);
          setMyProfile(null);
        }
      }
    } catch {
      // keep clean fallback
    } finally {
      setBooting(false);
    }
  };

  const loadPeladas = async () => {
    setLoadingPeladas(true);
    try {
      const res = await apiFetch<{ peladas: WeeklyPelada[] }>('/api/peladas');
      setPeladas(res.peladas);
    } catch {
      // handled gracefully
    } finally {
      setLoadingPeladas(false);
    }
  };

  const loadMyProfile = async () => {
    try {
      const res = await apiFetch<{ profile: MemberProfile | null }>('/api/profile/me');
      setMyProfile(res.profile);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    initSession();
  }, []);

  useEffect(() => {
    if (currentUser) {
      loadPeladas();
      loadMyProfile();
    }
  }, [currentUser?.id]);

  const handleAuthenticated = async (user: AuthUser) => {
    setNeedsAdminSetup(false);
    setCurrentUser(user);
    setActivePage('peladas');
    await loadMyProfile();
    await loadPeladas();
  };

  const handleLogout = () => {
    setAuthToken(null);
    setCurrentUser(null);
    setMyProfile(null);
    setSelectedPeladaId(null);
    setPeladas([]);
    initSession();
  };

  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm font-medium text-slate-500">
        Inicializando QuadraMestre...
      </div>
    );
  }

  if (!currentUser) {
    return (
      <AuthView
        needsAdminSetup={needsAdminSetup}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  const isAdmin = currentUser.role === 'admin';
  const selectedPelada = peladas.find((p) => p.id === selectedPeladaId) || null;
  const filteredPeladas = peladas.filter((p) => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.weekday.toLowerCase().includes(q) ||
      p.location.toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Sidebar fixa (260px) */}
      <aside className="hidden md:flex md:w-[260px] md:shrink-0 md:flex-col justify-between bg-slate-900 text-slate-100 border-r border-slate-800">
        <div>
          <div className="flex items-center gap-3 border-b border-slate-800 px-5 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white">
              <Trophy className="h-5 w-5" />
            </div>
            <div>
              <p className="font-display text-xl font-bold uppercase tracking-tight text-white">
                QuadraMestre
              </p>
              <p className="text-[11px] text-slate-400">Peladas Fixas Semanais</p>
            </div>
          </div>

          <nav className="space-y-1 p-3">
            <button
              type="button"
              onClick={() => {
                setActivePage('peladas');
                setSelectedPeladaId(null);
              }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-semibold transition-colors ${
                activePage === 'peladas' && !selectedPelada
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <CalendarDays className="h-4 w-4" />
              Peladas da Semana
            </button>

            <button
              type="button"
              onClick={() => {
                setActivePage('intake');
                setSelectedPeladaId(null);
              }}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-xs font-semibold transition-colors ${
                activePage === 'intake'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <ClipboardList className="h-4 w-4" />
                Minha Ficha de Ingresso
              </span>
              {!myProfile?.profileCompleted && (
                <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                  Pend.
                </span>
              )}
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  setActivePage('accounts');
                  setSelectedPeladaId(null);
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-semibold transition-colors ${
                  activePage === 'accounts'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Shield className="h-4 w-4" />
                Contas & Perfis
              </button>
            )}
          </nav>

          {peladas.length > 0 && (
            <div className="mt-2 border-t border-slate-800 px-3 pt-4">
              <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Acesso Rápido
              </p>
              <div className="space-y-1">
                {peladas.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setActivePage('peladas');
                      setSelectedPeladaId(p.id);
                    }}
                    className={`w-full rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                      selectedPeladaId === p.id
                        ? 'bg-slate-800 font-semibold text-emerald-400'
                        : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                    }`}
                  >
                    <p className="truncate">{p.name}</p>
                    <p className="text-[10px] text-slate-500">
                      {p.weekday} · {p.startTime}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-slate-800 p-4">
          <div className="mb-3">
            <p className="truncate text-xs font-semibold text-white">{currentUser.name}</p>
            <p className="truncate text-[11px] text-slate-400">
              {isAdmin ? 'Administrador' : 'Peladeiro'} · {currentUser.email}
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sair
          </button>
        </div>
      </aside>

      {/* Conteúdo Principal */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar em 3 zonas */}
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white px-6 py-3.5">
          <div className="flex flex-wrap items-center justify-between gap-4 md:gap-8">
            <div className="flex items-center gap-3">
              <span className="font-display text-lg font-bold uppercase tracking-tight text-slate-900 md:hidden">
                QuadraMestre
              </span>
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {activePage === 'intake'
                  ? 'Ficha de Ingresso & Saúde'
                  : activePage === 'accounts'
                    ? 'Administração de Contas'
                    : selectedPelada
                      ? `Peladas Fixas / ${selectedPelada.name}`
                      : 'Peladas Fixas da Semana'}
              </span>
            </div>

            {activePage === 'peladas' && !selectedPelada && (
              <div className="w-full sm:w-72">
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Filtrar por nome, dia ou quadra..."
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs outline-none focus:border-emerald-600 focus:bg-white"
                />
              </div>
            )}

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 md:hidden">
                <button
                  type="button"
                  onClick={() => {
                    setActivePage('peladas');
                    setSelectedPeladaId(null);
                  }}
                  className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700"
                >
                  Peladas
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActivePage('intake');
                    setSelectedPeladaId(null);
                  }}
                  className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700"
                >
                  Ficha
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setActivePage('accounts');
                      setSelectedPeladaId(null);
                    }}
                    className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700"
                  >
                    Contas
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700"
                >
                  Sair
                </button>
              </div>

              {isAdmin && activePage === 'peladas' && !selectedPelada && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingPelada(null);
                    setPeladaModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  <Plus className="h-4 w-4" />
                  Nova Pelada Fixa
                </button>
              )}
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 p-6">
          {!myProfile?.profileCompleted && activePage === 'peladas' && (
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3.5">
              <div className="text-xs text-amber-900">
                <strong>Complete sua Ficha de Ingresso:</strong> informe contato de emergência,
                tipo sanguíneo e sua autoavaliação inicial nos 6 critérios.
              </div>
              <button
                type="button"
                onClick={() => {
                  setActivePage('intake');
                  setSelectedPeladaId(null);
                }}
                className="rounded-lg bg-amber-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
              >
                Preencher Ficha Agora
              </button>
            </div>
          )}

          {activePage === 'intake' ? (
            <IntakeFormView
              profile={myProfile}
              userName={currentUser.name}
              onSaved={(updated) => {
                setMyProfile(updated);
                setCurrentUser((prev) =>
                  prev ? { ...prev, name: updated.fullName } : prev
                );
              }}
            />
          ) : activePage === 'accounts' && isAdmin ? (
            <AdminAccountsView
              currentUserId={currentUser.id}
              currentUserEmail={currentUser.email}
            />
          ) : selectedPelada ? (
            <PeladaWorkspace
              pelada={selectedPelada}
              currentUser={currentUser}
              onBack={() => setSelectedPeladaId(null)}
              onEditPelada={(p) => {
                setEditingPelada(p);
                setPeladaModalOpen(true);
              }}
              onRefreshPeladas={loadPeladas}
            />
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h1 className="font-display text-3xl font-bold uppercase tracking-tight text-slate-900">
                    Peladas Fixas da Semana
                  </h1>
                  <p className="mt-1 text-xs text-slate-500">
                    Cada grupo semanal mantém suas próprias notas em 6 critérios, lista de
                    mensalistas com prioridade, PIX, valores e caixa com comprovantes.
                  </p>
                </div>
              </div>

              {loadingPeladas ? (
                <p className="py-12 text-center text-sm text-slate-500">
                  Carregando peladas semanais...
                </p>
              ) : filteredPeladas.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
                  <Trophy className="mx-auto h-8 w-8 text-slate-400" />
                  <h2 className="mt-3 text-base font-bold text-slate-900">
                    Nenhuma pelada fixa cadastrada ainda
                  </h2>
                  <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
                    {isAdmin
                      ? 'Cadastre a primeira pelada semanal informando dia, horário, quadra, chave PIX e valores de mensalista e avulso.'
                      : 'Aguarde o administrador cadastrar as peladas fixas da semana.'}
                  </p>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingPelada(null);
                        setPeladaModalOpen(true);
                      }}
                      className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      <Plus className="h-4 w-4" />
                      Cadastrar Primeira Pelada
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid gap-5 md:grid-cols-2">
                  {filteredPeladas.map((p) => (
                    <div
                      key={p.id}
                      className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-emerald-400"
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold text-emerald-700">
                              {p.weekday} · <span className="font-mono">{p.startTime}–{p.endTime}</span>
                            </p>
                            <h2 className="mt-0.5 font-display text-2xl font-bold uppercase tracking-tight text-slate-900">
                              {p.name}
                            </h2>
                            <p className="text-xs text-slate-500">{p.location}</p>
                          </div>

                          {p.myMembership && (
                            <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-mono text-xs font-bold tabular-nums text-emerald-800">
                              Sua Nota: {p.myMembership.overall.toFixed(1)}
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
                          <div>
                            <p className="flex items-center gap-1 text-slate-500">
                              <Users className="h-3 w-3" /> Membros
                            </p>
                            <p className="mt-0.5 font-mono font-bold tabular-nums text-slate-900">
                              {p.memberCount || 0} ({p.mensalistaCount || 0} mens.)
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500">Mensalista / Avulso</p>
                            <p className="mt-0.5 font-mono font-bold tabular-nums text-slate-900">
                              {formatMoney(p.mensalistaFee)} / {formatMoney(p.avulsoFee)}
                            </p>
                          </div>
                          <div>
                            <p className="flex items-center gap-1 text-slate-500">
                              <Wallet className="h-3 w-3" /> Caixa
                            </p>
                            <p className="mt-0.5 font-mono font-bold tabular-nums text-slate-900">
                              {formatMoney(p.balance || 0)}
                            </p>
                          </div>
                        </div>

                        {p.pixKey && (
                          <p className="flex items-center gap-1.5 truncate text-xs text-slate-600">
                            <QrCode className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
                            <span>PIX: </span>
                            <span className="font-mono font-semibold text-slate-800">
                              {p.pixKey}
                            </span>
                          </p>
                        )}
                      </div>

                      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                        <span className="text-xs text-slate-500">
                          {p.defaultTeamsCount} times · {p.playersPerTeam} por equipe
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedPeladaId(p.id)}
                          className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                        >
                          Abrir Pelada
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {peladaModalOpen && (
        <PeladaFormModal
          pelada={editingPelada}
          onClose={() => {
            setPeladaModalOpen(false);
            setEditingPelada(null);
          }}
          onSaved={async (saved) => {
            setPeladaModalOpen(false);
            setEditingPelada(null);
            await loadPeladas();
            setSelectedPeladaId(saved.id);
          }}
        />
      )}
    </div>
  );
}

export default App;
