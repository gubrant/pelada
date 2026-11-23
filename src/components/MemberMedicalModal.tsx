import React, { useEffect, useState } from 'react';
import { HeartPulse, PhoneCall, ShieldAlert, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { SKILL_CRITERIA, type MemberProfile } from '../types/pelada';

interface MemberMedicalModalProps {
  userId: number;
  memberName: string;
  onClose: () => void;
}

export const MemberMedicalModal: React.FC<MemberMedicalModalProps> = ({
  userId,
  memberName,
  onClose,
}) => {
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch<{ profile: MemberProfile }>(`/api/users/${userId}/profile`)
      .then((res) => {
        if (!cancelled) setProfile(res.profile);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Erro ao carregar ficha médica.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <HeartPulse className="h-5 w-5 text-rose-600" />
            <div>
              <h2 className="font-display text-2xl font-bold uppercase tracking-tight text-slate-900">
                Ficha de Ingresso & Saúde
              </h2>
              <p className="text-xs text-slate-500">{memberName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          {loading ? (
            <p className="py-8 text-center text-sm text-slate-500">
              Carregando ficha médica...
            </p>
          ) : error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700">
              {error}
            </div>
          ) : !profile ? (
            <p className="text-sm text-slate-500">Ficha ainda não preenchida pelo membro.</p>
          ) : (
            <div className="space-y-5">
              {!profile.profileCompleted && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-800">
                  <ShieldAlert className="h-4 w-4 shrink-0" />
                  O membro ainda não completou todos os campos obrigatórios de emergência.
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs sm:grid-cols-4">
                <div>
                  <p className="text-slate-500">Idade</p>
                  <p className="mt-0.5 font-semibold text-slate-900">
                    {profile.age ? `${profile.age} anos` : 'Não informada'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Pé Dominante</p>
                  <p className="mt-0.5 font-semibold text-slate-900">{profile.dominantFoot}</p>
                </div>
                <div>
                  <p className="text-slate-500">Posição</p>
                  <p className="mt-0.5 font-semibold text-slate-900">
                    {profile.preferredPosition}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Tipo Sanguíneo</p>
                  <p className="mt-0.5 font-mono font-bold text-rose-700">
                    {profile.bloodType || 'Não sei'}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-900">
                  <PhoneCall className="h-3.5 w-3.5" />
                  Contato de Emergência
                </div>
                <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-slate-500">Responsável</p>
                    <p className="font-semibold text-slate-900">
                      {profile.emergencyContactName || 'Não informado'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Telefone</p>
                    <p className="font-mono font-semibold text-slate-900">
                      {profile.emergencyContactPhone || 'Não informado'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 text-xs">
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="font-semibold text-slate-500">Doenças pre-existentes</p>
                  <p className="mt-1 text-slate-800">
                    {profile.preExistingConditions || 'Nenhuma informada'}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="font-semibold text-slate-500">Medicamentos de rotina</p>
                  <p className="mt-1 text-slate-800">
                    {profile.routineMedications || 'Nenhum informado'}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="font-semibold text-slate-500">Alergias</p>
                  <p className="mt-1 text-slate-800">
                    {profile.allergies || 'Nenhuma informada'}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="font-semibold text-slate-500">Outras infos médicas</p>
                  <p className="mt-1 text-slate-800">
                    {profile.medicalNotes || 'Sem observações adicionais'}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 p-4">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-bold uppercase tracking-wider text-slate-600">
                    Autoavaliação Inicial (Ficha de Ingresso)
                  </span>
                  <span className="font-mono font-bold text-slate-900">
                    Média {profile.initOverall.toFixed(1)}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {SKILL_CRITERIA.map((c) => {
                    const keyMap = {
                      dribbling: profile.initDribbling,
                      physical: profile.initPhysical,
                      passing: profile.initPassing,
                      attack: profile.initAttack,
                      defense: profile.initDefense,
                      shooting: profile.initShooting,
                    };
                    return (
                      <div
                        key={c.key}
                        className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-center"
                      >
                        <p className="text-[10px] font-semibold text-slate-500">{c.shortLabel}</p>
                        <p className="font-mono text-sm font-bold tabular-nums text-slate-900">
                          {keyMap[c.key].toFixed(1)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
