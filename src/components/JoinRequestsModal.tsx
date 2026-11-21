import { useCallback, useEffect, useState } from 'react';
import { Check, Clock, Mail, Phone, ShieldCheck, X, XCircle } from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  DEFAULT_GROUP_CRITERIA,
  type GroupCriterion,
  PLAYER_CATEGORIES,
  type PeladaJoinRequest,
  type PlayerCategory,
} from '../types/futsal';
import { PlayerAvatar } from './PlayerAvatar';

interface JoinRequestsModalProps {
  groupId: number;
  groupName: string;
  onClose: () => void;
  onResponded: () => void;
}

interface JoinRequestsApiResponse {
  criteriaConfig: GroupCriterion[];
  upcomingPeladas: Array<{
    id: number;
    title: string;
    eventDate: string;
    startTime: string;
    status: string;
  }>;
  requests: PeladaJoinRequest[];
}

export function JoinRequestsModal({
  groupId,
  groupName,
  onClose,
  onResponded,
}: JoinRequestsModalProps) {
  const [data, setData] = useState<JoinRequestsApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [selectedCategoryById, setSelectedCategoryById] = useState<Record<number, PlayerCategory>>({});
  const [selectedPeladaById, setSelectedPeladaById] = useState<Record<number, number>>({});
  const [notesById, setNotesById] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<JoinRequestsApiResponse>(`/api/groups/${groupId}/join-requests`);
      setData(res);
      const cats: Record<number, PlayerCategory> = {};
      const pels: Record<number, number> = {};
      for (const r of res.requests) {
        cats[r.id] = r.requestedCategory;
        pels[r.id] = r.requestedPeladaId ?? res.upcomingPeladas[0]?.id ?? 0;
      }
      setSelectedCategoryById(cats);
      setSelectedPeladaById(pels);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar solicitações.');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  async function handleRespond(reqItem: PeladaJoinRequest, decision: 'approve' | 'reject') {
    setProcessingId(reqItem.id);
    setError(null);
    try {
      const cat = selectedCategoryById[reqItem.id] ?? reqItem.requestedCategory;
      const pelId = selectedPeladaById[reqItem.id] ?? reqItem.requestedPeladaId ?? null;
      await apiFetch(`/api/join-requests/${reqItem.id}/respond`, {
        method: 'POST',
        body: JSON.stringify({
          decision,
          category: cat,
          peladaId: cat === 'eventual' && pelId ? pelId : null,
          responseNote: notesById[reqItem.id] ?? '',
        }),
      });
      await loadRequests();
      onResponded();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao responder solicitação.');
    } finally {
      setProcessingId(null);
    }
  }

  const criteriaList = (
    data?.criteriaConfig && data.criteriaConfig.length > 0
      ? data.criteriaConfig
      : DEFAULT_GROUP_CRITERIA
  ).filter((c) => c.enabled && c.weight > 0);

  const pendingRequests = data?.requests.filter((r) => r.status === 'pending') ?? [];
  const resolvedRequests = data?.requests.filter((r) => r.status !== 'pending') ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 overflow-y-auto">
      <div className="w-full max-w-3xl rounded-xl bg-white border border-slate-200 shadow-xl my-6">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="min-w-0">
            <h3 className="font-display text-2xl font-bold text-slate-900 truncate">
              Solicitações de Entrada · {groupName}
            </h3>
            <p className="text-xs text-slate-500">
              Qualquer administrador desta pelada pode autorizar ou recusar o acesso do peladeiro.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
            aria-label="Fechar solicitações"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 max-h-[82vh] overflow-y-auto space-y-6">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-10 text-center text-sm text-slate-500">
              Carregando solicitações de entrada...
            </div>
          ) : data && data.requests.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              Nenhuma solicitação de entrada recebida nesta pelada ainda.
            </div>
          ) : (
            <>
              {pendingRequests.length > 0 && (
                <div className="space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-800">
                    Aguardando Autorização ({pendingRequests.length})
                  </h4>
                  {pendingRequests.map((r) => {
                    const chosenCat = selectedCategoryById[r.id] ?? r.requestedCategory;
                    const chosenPelId = selectedPeladaById[r.id] ?? r.requestedPeladaId ?? 0;
                    return (
                      <div
                        key={r.id}
                        className="rounded-xl border border-amber-200 bg-amber-50/40 p-5 space-y-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="flex items-center gap-3.5 min-w-0">
                            <PlayerAvatar
                              name={r.player.name}
                              photoUrl={r.player.photoUrl}
                              size="lg"
                            />
                            <div className="min-w-0">
                              <h5 className="text-base font-bold text-slate-900 truncate">
                                {r.player.nickname}{' '}
                                <span className="text-sm font-normal text-slate-500">
                                  ({r.player.name})
                                </span>
                              </h5>
                              <p className="text-xs text-slate-600">
                                {r.player.position} · Pé {r.player.dominantFoot}
                                {r.player.age ? ` · ${r.player.age} anos` : ''}
                              </p>
                              <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 mt-1">
                                {r.player.email && (
                                  <span className="inline-flex items-center gap-1">
                                    <Mail className="h-3 w-3" /> {r.player.email}
                                  </span>
                                )}
                                {r.player.phone && (
                                  <span className="inline-flex items-center gap-1">
                                    <Phone className="h-3 w-3" /> {r.player.phone}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="text-[11px] text-slate-500 block">Autoavaliação</span>
                            <span className="font-display text-2xl font-extrabold text-emerald-700 tabular-nums">
                              {r.player.initOverall.toFixed(2)}
                            </span>
                          </div>
                        </div>

                        {r.message && (
                          <div className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-700">
                            <strong>Recado:</strong> “{r.message}”
                          </div>
                        )}

                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2 rounded-lg border border-slate-200 bg-white p-3 text-center">
                          {criteriaList.map((c) => (
                            <div key={c.key}>
                              <span className="text-[10px] text-slate-400 block truncate">
                                {c.short}
                              </span>
                              <span className="font-mono tabular-nums text-xs font-bold text-slate-900">
                                {(r.scores?.[c.key] ?? 7).toFixed(1)}
                              </span>
                            </div>
                          ))}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Categoria ao autorizar
                            </label>
                            <select
                              value={chosenCat}
                              onChange={(e) =>
                                setSelectedCategoryById((prev) => ({
                                  ...prev,
                                  [r.id]: e.target.value as PlayerCategory,
                                }))
                              }
                              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900"
                            >
                              {PLAYER_CATEGORIES.map((cat) => (
                                <option key={cat.value} value={cat.value}>
                                  {cat.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          {chosenCat === 'eventual' &&
                          data?.upcomingPeladas &&
                          data.upcomingPeladas.length > 0 ? (
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                Encontro (acesso até 3 dias após)
                              </label>
                              <select
                                value={chosenPelId}
                                onChange={(e) =>
                                  setSelectedPeladaById((prev) => ({
                                    ...prev,
                                    [r.id]: Number(e.target.value),
                                  }))
                                }
                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900"
                              >
                                {data.upcomingPeladas.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.title} ({p.eventDate})
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <div className="flex items-end">
                              <p className="text-[11px] text-slate-600 flex items-center gap-1.5 pb-2">
                                {chosenCat === 'eventual' ? (
                                  <>
                                    <Clock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                                    Acesso temporário até 3 dias após a pelada + e-mail de resumo.
                                  </>
                                ) : (
                                  <>
                                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                    Acesso contínuo mantido na pelada.
                                  </>
                                )}
                              </p>
                            </div>
                          )}
                        </div>

                        <div>
                          <input
                            value={notesById[r.id] ?? ''}
                            onChange={(e) =>
                              setNotesById((prev) => ({ ...prev, [r.id]: e.target.value }))
                            }
                            placeholder="Observação opcional da resposta (ex: Bem-vindo à pelada!)"
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs focus:border-emerald-600 focus:outline-none"
                          />
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
                          <button
                            type="button"
                            disabled={processingId === r.id}
                            onClick={() => handleRespond(r, 'reject')}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 cursor-pointer"
                          >
                            <XCircle className="h-4 w-4" />
                            Recusar Solicitação
                          </button>
                          <button
                            type="button"
                            disabled={processingId === r.id}
                            onClick={() => handleRespond(r, 'approve')}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                          >
                            <Check className="h-4 w-4" />
                            {processingId === r.id ? 'Processando...' : 'Autorizar Acesso'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {resolvedRequests.length > 0 && (
                <div className="space-y-3 pt-2 border-t border-slate-200">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Histórico de Respostas ({resolvedRequests.length})
                  </h4>
                  <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {resolvedRequests.map((r) => (
                      <div
                        key={r.id}
                        className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <PlayerAvatar
                            name={r.player.name}
                            photoUrl={r.player.photoUrl}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 truncate">
                              {r.player.nickname} ({r.player.name})
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {r.requestedCategory === 'mensalista'
                                ? 'Mensalista'
                                : r.requestedCategory === 'avulso'
                                  ? 'Avulso'
                                  : 'Eventual'}
                              {r.respondedByName ? ` · Respondido por ${r.respondedByName}` : ''}
                            </p>
                          </div>
                        </div>

                        <span
                          className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                            r.status === 'approved'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                              : 'border-red-200 bg-red-50 text-red-700'
                          }`}
                        >
                          {r.status === 'approved' ? 'Autorizado' : 'Recusado'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
