import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, HeartPulse, Save, ShieldAlert, User } from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  BLOOD_TYPES,
  DOMINANT_FEET,
  PLAYER_POSITIONS,
  SKILL_CRITERIA,
  type BloodType,
  type DominantFoot,
  type MemberProfile,
  type PlayerPosition,
} from '../types/pelada';
import { ImageUploadField } from './ImageUploadField';

interface IntakeFormViewProps {
  profile: MemberProfile | null;
  userName: string;
  onSaved: (profile: MemberProfile) => void;
}

export const IntakeFormView: React.FC<IntakeFormViewProps> = ({
  profile,
  userName,
  onSaved,
}) => {
  const [fullName, setFullName] = useState(profile?.fullName || userName);
  const [nickname, setNickname] = useState(profile?.nickname || '');
  const [age, setAge] = useState(profile?.age ? String(profile.age) : '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [dominantFoot, setDominantFoot] = useState<DominantFoot>(
    profile?.dominantFoot || 'Destro'
  );
  const [preferredPosition, setPreferredPosition] = useState<PlayerPosition>(
    profile?.preferredPosition || 'Coringa'
  );
  const [photoUrl, setPhotoUrl] = useState<string | null>(profile?.photoUrl || null);

  // Informações médicas & contato de emergência
  const [emergencyContactName, setEmergencyContactName] = useState(
    profile?.emergencyContactName || ''
  );
  const [emergencyContactPhone, setEmergencyContactPhone] = useState(
    profile?.emergencyContactPhone || ''
  );
  const [bloodType, setBloodType] = useState<BloodType>(profile?.bloodType || 'Não sei');
  const [preExistingConditions, setPreExistingConditions] = useState(
    profile?.preExistingConditions || ''
  );
  const [routineMedications, setRoutineMedications] = useState(
    profile?.routineMedications || ''
  );
  const [allergies, setAllergies] = useState(profile?.allergies || '');
  const [medicalNotes, setMedicalNotes] = useState(profile?.medicalNotes || '');

  // Autoavaliação inicial nos 6 critérios
  const [initScores, setInitScores] = useState({
    dribbling: profile?.initDribbling ?? 6,
    physical: profile?.initPhysical ?? 6,
    passing: profile?.initPassing ?? 6,
    attack: profile?.initAttack ?? 6,
    defense: profile?.initDefense ?? 6,
    shooting: profile?.initShooting ?? 6,
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFeedback, setSavedFeedback] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.fullName || userName);
    setNickname(profile.nickname || '');
    setAge(profile.age ? String(profile.age) : '');
    setPhone(profile.phone || '');
    setDominantFoot(profile.dominantFoot);
    setPreferredPosition(profile.preferredPosition);
    setPhotoUrl(profile.photoUrl);
    setEmergencyContactName(profile.emergencyContactName || '');
    setEmergencyContactPhone(profile.emergencyContactPhone || '');
    setBloodType(profile.bloodType || 'Não sei');
    setPreExistingConditions(profile.preExistingConditions || '');
    setRoutineMedications(profile.routineMedications || '');
    setAllergies(profile.allergies || '');
    setMedicalNotes(profile.medicalNotes || '');
    setInitScores({
      dribbling: profile.initDribbling,
      physical: profile.initPhysical,
      passing: profile.initPassing,
      attack: profile.initAttack,
      defense: profile.initDefense,
      shooting: profile.initShooting,
    });
  }, [profile, userName]);

  const overallPreview = useMemo(() => {
    const sum =
      initScores.dribbling +
      initScores.physical +
      initScores.passing +
      initScores.attack +
      initScores.defense +
      initScores.shooting;
    return (sum / 6).toFixed(1);
  }, [initScores]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSavedFeedback(false);
    setSaving(true);
    try {
      const res = await apiFetch<{ profile: MemberProfile }>('/api/profile/me', {
        method: 'PUT',
        body: JSON.stringify({
          fullName,
          nickname,
          age: age ? Number(age) : null,
          phone,
          dominantFoot,
          preferredPosition,
          photoUrl,
          emergencyContactName,
          emergencyContactPhone,
          bloodType,
          preExistingConditions,
          routineMedications,
          allergies,
          medicalNotes,
          initDribbling: initScores.dribbling,
          initPhysical: initScores.physical,
          initPassing: initScores.passing,
          initAttack: initScores.attack,
          initDefense: initScores.defense,
          initShooting: initScores.shooting,
        }),
      });
      onSaved(res.profile);
      setSavedFeedback(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar ficha de ingresso.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5">
        <div>
          <h2 className="font-display text-2xl font-bold uppercase tracking-tight text-slate-900">
            Ficha de Ingresso do Peladeiro
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Seus dados médicos e de emergência ficam protegidos e visíveis apenas para você e para
            os administradores das peladas.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {profile?.profileCompleted ? (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Ficha Completa
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">
              <ShieldAlert className="h-3.5 w-3.5" />
              Complete seu contato de emergência
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Bloco 1: Dados Pessoais & Esportivos */}
        <div className="lg:col-span-7 space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <User className="h-4 w-4 text-emerald-700" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                1. Identificação & Perfil em Quadra
              </h3>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Nome completo *
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Apelido na quadra
                </label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="Ex.: Biel, Canhotinha"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Idade
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={99}
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    placeholder="Ex.: 29"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums outline-none focus:border-emerald-600"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Telefone / WhatsApp
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(11) 99999-9999"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Pé / Lado dominante
                </label>
                <select
                  value={dominantFoot}
                  onChange={(e) => setDominantFoot(e.target.value as DominantFoot)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600"
                >
                  {DOMINANT_FEET.map((foot) => (
                    <option key={foot} value={foot}>
                      {foot}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Posição preferida
                </label>
                <select
                  value={preferredPosition}
                  onChange={(e) => setPreferredPosition(e.target.value as PlayerPosition)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600"
                >
                  {PLAYER_POSITIONS.map((pos) => (
                    <option key={pos} value={pos}>
                      {pos}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <ImageUploadField
                  label="Foto do atleta (opcional)"
                  value={photoUrl}
                  onChange={setPhotoUrl}
                  helperText="Usada para identificar você na lista de presença e nos times."
                />
              </div>
            </div>
          </div>

          {/* Bloco 2: Ficha Médica & Emergência */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <HeartPulse className="h-4 w-4 text-rose-600" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                2. Emergência & Informações Médicas
              </h3>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Contato de emergência *
                </label>
                <input
                  type="text"
                  required
                  value={emergencyContactName}
                  onChange={(e) => setEmergencyContactName(e.target.value)}
                  placeholder="Nome do familiar/contato"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Telefone de emergência *
                </label>
                <input
                  type="text"
                  required
                  value={emergencyContactPhone}
                  onChange={(e) => setEmergencyContactPhone(e.target.value)}
                  placeholder="(11) 98888-8888"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Tipo sanguíneo *
                </label>
                <select
                  value={bloodType}
                  onChange={(e) => setBloodType(e.target.value as BloodType)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600"
                >
                  {BLOOD_TYPES.map((bt) => (
                    <option key={bt} value={bt}>
                      {bt}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Doenças pre-existentes
                </label>
                <textarea
                  rows={2}
                  value={preExistingConditions}
                  onChange={(e) => setPreExistingConditions(e.target.value)}
                  placeholder="Ex.: Asma, hipertensão, lesão no joelho... ou Nenhuma"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Medicamentos que consome rotineiramente
                </label>
                <textarea
                  rows={2}
                  value={routineMedications}
                  onChange={(e) => setRoutineMedications(e.target.value)}
                  placeholder="Informe medicamentos de uso contínuo ou Nenhum"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Alergias
                </label>
                <textarea
                  rows={2}
                  value={allergies}
                  onChange={(e) => setAllergies(e.target.value)}
                  placeholder="Ex.: Dipirona, picada de inseto... ou Nenhuma"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Informações médicas relevantes
                </label>
                <textarea
                  rows={2}
                  value={medicalNotes}
                  onChange={(e) => setMedicalNotes(e.target.value)}
                  placeholder="Plano de saúde, restrições físicas, observações gerais"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Bloco 3: Autoavaliação Inicial nos 6 Critérios */}
        <div className="lg:col-span-5">
          <div className="sticky top-6 rounded-xl border border-slate-200 bg-white p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                  3. Autoavaliação Inicial
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Base inicial ao ingressar em uma nova pelada
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-right">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Média Geral
                </p>
                <p className="font-mono text-xl font-bold tabular-nums text-emerald-700">
                  {overallPreview}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {SKILL_CRITERIA.map((criterion) => {
                const value = initScores[criterion.key];
                return (
                  <div key={criterion.key} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700">{criterion.label}</span>
                      <span className="font-mono font-bold tabular-nums text-slate-900">
                        {value.toFixed(1)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      step={0.5}
                      value={value}
                      onChange={(e) =>
                        setInitScores((prev) => ({
                          ...prev,
                          [criterion.key]: Number(e.target.value),
                        }))
                      }
                      className="w-full accent-emerald-600 cursor-pointer"
                    />
                  </div>
                );
              })}
            </div>

            <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
              Depois que você entrar em uma pelada fixa, o administrador pode ajustar suas notas
              especificamente para aquela pelada sem alterar sua nota nas outras peladas da semana.
            </p>

            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-700">
                {error}
              </div>
            )}

            {savedFeedback && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-800">
                Ficha de ingresso salva com sucesso!
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Salvando Ficha...' : 'Salvar Ficha de Ingresso'}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
};
