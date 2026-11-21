import { ExternalLink, Mail, Trophy, X } from 'lucide-react';
import type { PlayerSummaryEmailRecord } from '../types/futsal';

interface SummaryEmailsModalProps {
  emails: PlayerSummaryEmailRecord[];
  onClose: () => void;
}

export function SummaryEmailsModal({ emails, onClose }: SummaryEmailsModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-xl bg-white border border-slate-200 shadow-xl my-6">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <Mail className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-display text-2xl font-bold text-slate-900 truncate">
                E-mails Pós-Pelada & Estatísticas
              </h3>
              <p className="text-xs text-slate-500">
                Agradecimento pela participação eventual com o resumo dos seus números no jogo.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
            aria-label="Fechar e-mails"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 max-h-[80vh] overflow-y-auto space-y-5">
          {emails.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              Nenhum e-mail de resumo pós-pelada recebido ainda.
            </div>
          ) : (
            emails.map((em) => {
              const mailtoHref = `mailto:${encodeURIComponent(em.toEmail)}?subject=${encodeURIComponent(
                em.subject
              )}&body=${encodeURIComponent(em.bodyText)}`;
              return (
                <div
                  key={em.id}
                  className="rounded-xl border border-slate-200 bg-slate-50/70 p-5 space-y-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <span className="text-[11px] font-semibold text-emerald-700 block">
                        {em.groupName || 'Pelada Fixa'}
                        {em.peladaTitle ? ` · ${em.peladaTitle}` : ''}
                        {em.peladaDate ? ` (${em.peladaDate})` : ''}
                      </span>
                      <h4 className="text-sm font-bold text-slate-900 mt-0.5">{em.subject}</h4>
                      <p className="text-[11px] text-slate-500">Para: {em.toEmail}</p>
                    </div>
                    <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                      {new Date(em.sentAt).toLocaleDateString('pt-BR')}
                    </span>
                  </div>

                  {em.stats && (
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center rounded-lg border border-slate-200 bg-white p-3">
                      <div>
                        <span className="text-[10px] text-slate-400 block">Jogos</span>
                        <span className="font-mono font-bold text-sm text-slate-900 tabular-nums">
                          {em.stats.matchesPlayed}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Vitórias</span>
                        <span className="font-mono font-bold text-sm text-emerald-700 tabular-nums">
                          {em.stats.wins}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Gols</span>
                        <span className="font-mono font-bold text-sm text-slate-900 tabular-nums">
                          {em.stats.goals}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Assist.</span>
                        <span className="font-mono font-bold text-sm text-slate-900 tabular-nums">
                          {em.stats.assists}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Defesas</span>
                        <span className="font-mono font-bold text-sm text-slate-900 tabular-nums">
                          {em.stats.defenses}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Nota</span>
                        <span className="font-mono font-bold text-sm text-emerald-700 tabular-nums">
                          {em.stats.rating.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}

                  <pre className="whitespace-pre-wrap font-sans text-xs text-slate-700 bg-white rounded-lg border border-slate-200 p-4 leading-relaxed">
                    {em.bodyText}
                  </pre>

                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
                      <Trophy className="h-3.5 w-3.5" />
                      Resumo enviado após o período de 3 dias da pelada
                    </span>
                    <a
                      href={mailtoHref}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Abrir no Cliente de E-mail
                    </a>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
