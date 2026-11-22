import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Image as ImageIcon,
  Mail,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type {
  AdminTitle,
  FinanceEntryType,
  PeladaFinanceEntry,
  PeladaFinanceOverviewResponse,
  PeladaParticipantPayment,
  Player,
} from '../types/futsal';
import { ImageCaptureField } from './ImageCaptureField';

interface PeladaFinanceViewProps {
  groupId: number;
  players: Player[];
  scopedPeladaId?: number | null;
  scopedPeladaTitle?: string | null;
  onGroupUpdated?: () => void;
}

const ENTRY_TYPE_LABELS: Record<FinanceEntryType, string> = {
  cash_box: 'Valor de Caixa / Aporte',
  income: 'Receita',
  expense: 'Gasto (Pago)',
  pending_debt: 'Débito Pendente',
};

const ADMIN_TITLE_LABELS: Record<AdminTitle, string> = {
  presidente: 'Presidente',
  tesoureiro: 'Tesoureiro',
  presidente_tesoureiro: 'Presidente e Tesoureiro',
  administrador: 'Administrador (sem confirmação financeira)',
};

function formatBrl(value: number | null | undefined): string {
  const num = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(num);
}

function defaultMonthLabel(): string {
  const now = new Date();
  return `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
}

export function PeladaFinanceView({
  groupId,
  players,
  scopedPeladaId = null,
  scopedPeladaTitle = null,
  onGroupUpdated,
}: PeladaFinanceViewProps) {
  const [data, setData] = useState<PeladaFinanceOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Settings form (PIX, Caixa inicial, Mensalidade, Diária)
  const [pixKeyInput, setPixKeyInput] = useState('');
  const [initialCashInput, setInitialCashInput] = useState('0');
  const [monthlyFeeInput, setMonthlyFeeInput] = useState('0');
  const [avulsoFeeInput, setAvulsoFeeInput] = useState('0');
  const [copiedPix, setCopiedPix] = useState(false);

  // New Ledger Entry form (Caixa, Receita, Gasto, Débito Pendente + imagem)
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [entryType, setEntryType] = useState<FinanceEntryType>('expense');
  const [entryTitle, setEntryTitle] = useState('');
  const [entryAmount, setEntryAmount] = useState('');
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [entryPeladaId, setEntryPeladaId] = useState<string>(
    scopedPeladaId ? String(scopedPeladaId) : ''
  );
  const [entryDescription, setEntryDescription] = useState('');
  const [entryAttachmentUrl, setEntryAttachmentUrl] = useState<string | null>(null);

  // New Participant Charge form
  const [showChargeForm, setShowChargeForm] = useState(false);
  const [chargeMode, setChargeMode] = useState<'single' | 'monthly_all' | 'pelada_present'>(
    scopedPeladaId ? 'pelada_present' : 'single'
  );
  const [chargePlayerId, setChargePlayerId] = useState<number>(0);
  const [chargePaymentType, setChargePaymentType] = useState<'mensalidade' | 'diaria'>('diaria');
  const [chargeRefLabel, setChargeRefLabel] = useState(
    scopedPeladaTitle ? scopedPeladaTitle : defaultMonthLabel()
  );
  const [chargeAmount, setChargeAmount] = useState('');
  const [chargePeladaId, setChargePeladaId] = useState<string>(
    scopedPeladaId ? String(scopedPeladaId) : ''
  );
  const [chargeNotes, setChargeNotes] = useState('');

  // Filters & Sub-tabs inside Financeiro
  const [activeSubView, setActiveSubView] = useState<
    'overview' | 'payments' | 'entries' | 'emails'
  >('overview');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'pending' | 'paid'>('all');
  const [entryFilter, setEntryFilter] = useState<'all' | FinanceEntryType>('all');
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null);
  const [copiedEmailId, setCopiedEmailId] = useState<number | null>(null);

  const loadFinance = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<PeladaFinanceOverviewResponse>(`/api/groups/${groupId}/finance`);
      setData(res);
      setPixKeyInput(res.group.pixKey ?? '');
      setInitialCashInput(String(res.group.initialCashBalance ?? 0));
      setMonthlyFeeInput(String(res.group.monthlyFee ?? 0));
      setAvulsoFeeInput(String(res.group.avulsoFee ?? 0));
      if (chargeAmount === '') {
        setChargeAmount(String(res.group.avulsoFee || res.group.monthlyFee || 0));
      }
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar controle financeiro.');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    loadFinance();
  }, [loadFinance]);

  useEffect(() => {
    if (scopedPeladaId) {
      setEntryPeladaId(String(scopedPeladaId));
      setChargePeladaId(String(scopedPeladaId));
    }
  }, [scopedPeladaId]);

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await apiFetch(`/api/groups/${groupId}/finance/settings`, {
        method: 'PUT',
        body: JSON.stringify({
          pixKey: pixKeyInput.trim() || null,
          initialCashBalance: initialCashInput,
          monthlyFee: monthlyFeeInput,
          avulsoFee: avulsoFeeInput,
        }),
      });
      setSuccess('Configurações financeiras e chave PIX atualizadas com sucesso.');
      await loadFinance();
      onGroupUpdated?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar configurações.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateEntry(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await apiFetch(`/api/groups/${groupId}/finance/entries`, {
        method: 'POST',
        body: JSON.stringify({
          entryType,
          title: entryTitle.trim(),
          amount: entryAmount,
          entryDate,
          peladaId: entryPeladaId ? Number(entryPeladaId) : null,
          description: entryDescription.trim() || null,
          attachmentUrl: entryAttachmentUrl,
        }),
      });
      setEntryTitle('');
      setEntryAmount('');
      setEntryDescription('');
      setEntryAttachmentUrl(null);
      setShowEntryForm(false);
      setSuccess('Lançamento financeiro registrado no balanço da pelada.');
      await loadFinance();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao registrar lançamento.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSettleEntry(entry: PeladaFinanceEntry) {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await apiFetch(`/api/groups/${groupId}/finance/entries/${entry.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'settled' }),
      });
      setSuccess(`"${entry.title}" marcado como quitado no caixa.`);
      await loadFinance();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao quitar débito.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteEntry(entryId: number) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/groups/${groupId}/finance/entries/${entryId}`, { method: 'DELETE' });
      await loadFinance();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao remover lançamento.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateCharge(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiFetch<{ createdCount: number }>(`/api/groups/${groupId}/finance/payments`, {
        method: 'POST',
        body: JSON.stringify({
          mode: chargeMode,
          playerId: chargeMode === 'single' ? chargePlayerId : undefined,
          paymentType: chargePaymentType,
          referenceLabel: chargeRefLabel.trim() || defaultMonthLabel(),
          amount: chargeAmount,
          peladaId: chargePeladaId ? Number(chargePeladaId) : null,
          notes: chargeNotes.trim() || null,
        }),
      });
      setShowChargeForm(false);
      setChargeNotes('');
      setSuccess(
        res.createdCount > 0
          ? `${res.createdCount} cobrança(s) gerada(s) com sucesso.`
          : 'Nenhuma nova cobrança pendente necessária para essa seleção.'
      );
      await loadFinance();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao lançar cobrança.');
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmPayment(
    payment: PeladaParticipantPayment,
    nextStatus: 'paid' | 'pending'
  ) {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await apiFetch(`/api/groups/${groupId}/finance/payments/${payment.id}/confirm`, {
        method: 'POST',
        body: JSON.stringify({ status: nextStatus }),
      });
      setSuccess(
        nextStatus === 'paid'
          ? `Recebimento confirmado para ${payment.playerNickname} (${formatBrl(payment.amount)}).`
          : `Pagamento de ${payment.playerNickname} retornado para pendente.`
      );
      await loadFinance();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar pagamento.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeletePayment(paymentId: number) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/groups/${groupId}/finance/payments/${paymentId}`, {
        method: 'DELETE',
      });
      await loadFinance();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao remover cobrança.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSendPixEmails() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiFetch<{
        emailsSent: number;
        skippedNoEmail: string[];
        chargesCreated: number;
      }>(`/api/groups/${groupId}/finance/send-pix-emails`, {
        method: 'POST',
        body: JSON.stringify({
          peladaId: scopedPeladaId || null,
          createMissingForPelada: Boolean(scopedPeladaId),
        }),
      });
      if (res.emailsSent === 0) {
        setSuccess(
          res.skippedNoEmail.length > 0
            ? `Nenhum e-mail enviado. Participantes sem e-mail cadastrado: ${res.skippedNoEmail.join(', ')}.`
            : 'Todos os participantes já estão em dia (nenhum pagamento pendente encontrado).'
        );
      } else {
        setSuccess(
          `${res.emailsSent} e-mail(s) de cobrança PIX gerado(s) com sucesso.${
            res.skippedNoEmail.length > 0
              ? ` Sem e-mail cadastrado: ${res.skippedNoEmail.join(', ')}.`
              : ''
          }`
        );
        setActiveSubView('emails');
      }
      await loadFinance();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar e-mails PIX.');
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        Carregando balanço financeiro da pelada...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        {error || 'Não foi possível carregar o controle financeiro.'}
      </div>
    );
  }

  const { group, permissions, summary, entries, payments, pixEmails, peladas, participants } = data;
  const isGroupAdmin = permissions.isGroupAdmin;
  const canConfirmPayments = permissions.canConfirmPayments;

  const filteredPayments = payments.filter((p) => {
    if (scopedPeladaId && p.peladaId !== null && p.peladaId !== scopedPeladaId) return false;
    if (paymentFilter !== 'all' && p.status !== paymentFilter) return false;
    return true;
  });

  const filteredEntries = entries.filter((e) => {
    if (scopedPeladaId && e.peladaId !== null && e.peladaId !== scopedPeladaId) return false;
    if (entryFilter !== 'all' && e.entryType !== entryFilter) return false;
    return true;
  });

  const pendingPaymentsCount = payments.filter((p) => p.status === 'pending').length;

  return (
    <div className="space-y-6">
      {/* Header & Main Actions */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="space-y-1">
          <h3 className="font-display text-3xl font-extrabold text-slate-900">
            Controle Financeiro · {scopedPeladaTitle ? scopedPeladaTitle : group.name}
          </h3>
          <p className="text-xs sm:text-sm text-slate-500">
            Transparência de caixa, receitas, gastos com comprovantes anexados, débitos pendentes e
            cobrança via PIX para todos os participantes.
          </p>
          <p className="text-xs text-slate-600">
            Chave PIX atual:{' '}
            {group.pixKey ? (
              <span className="font-mono font-semibold text-emerald-700">{group.pixKey}</span>
            ) : (
              <span className="text-amber-700 font-medium">Ainda não configurada</span>
            )}
            {group.pixKey && (
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(group.pixKey ?? '').catch(() => {});
                  setCopiedPix(true);
                  setTimeout(() => setCopiedPix(false), 2000);
                }}
                className="ml-2 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:underline cursor-pointer"
              >
                {copiedPix ? (
                  <>
                    <Check className="h-3 w-3" /> PIX copiado
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" /> Copiar PIX
                  </>
                )}
              </button>
            )}
          </p>
        </div>

        {isGroupAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setShowEntryForm((v) => !v);
                setShowChargeForm(false);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5 text-emerald-600" />
              Lançar Caixa / Gasto / Receita
            </button>
            <button
              type="button"
              onClick={() => {
                setShowChargeForm((v) => !v);
                setShowEntryForm(false);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
            >
              <Wallet className="h-3.5 w-3.5 text-emerald-600" />
              Lançar Mensalidade / Diária
            </button>
            <button
              type="button"
              disabled={busy || pendingPaymentsCount === 0}
              onClick={handleSendPixEmails}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              <Send className="h-3.5 w-3.5" />
              Enviar E-mail PIX aos Pendentes ({pendingPaymentsCount})
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}
        </div>
      )}

      {/* 4-column KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <span className="text-xs text-slate-500 block">Valor em Caixa Atual</span>
          <span
            className={`font-mono tabular-nums text-2xl font-bold ${
              summary.currentCashBalance >= 0 ? 'text-emerald-700' : 'text-red-700'
            }`}
          >
            {formatBrl(summary.currentCashBalance)}
          </span>
          <span className="text-[11px] text-slate-400 block mt-1 tabular-nums">
            Caixa base {formatBrl(summary.initialCashBalance + summary.cashBoxContributions)}
          </span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <span className="text-xs text-slate-500 block">Receita Recebida</span>
          <span className="font-mono tabular-nums text-2xl font-bold text-slate-900">
            {formatBrl(summary.totalRevenue)}
          </span>
          <span className="text-[11px] text-slate-400 block mt-1 tabular-nums">
            Mensalidades/diárias {formatBrl(summary.participantPaymentsReceived)} · Extras{' '}
            {formatBrl(summary.extraIncome)}
          </span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <span className="text-xs text-slate-500 block">Débitos Pendentes & Gastos</span>
          <span className="font-mono tabular-nums text-2xl font-bold text-amber-700">
            {formatBrl(summary.pendingDebts)}
          </span>
          <span className="text-[11px] text-slate-400 block mt-1 tabular-nums">
            Gastos já pagos: {formatBrl(summary.paidExpenses)}
          </span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <span className="text-xs text-slate-500 block">Balanço Projetado</span>
          <span
            className={`font-mono tabular-nums text-2xl font-bold ${
              summary.projectedBalance >= 0 ? 'text-slate-900' : 'text-red-700'
            }`}
          >
            {formatBrl(summary.projectedBalance)}
          </span>
          <span className="text-[11px] text-slate-400 block mt-1 tabular-nums">
            A receber de jogadores: {formatBrl(summary.pendingReceivables)}
          </span>
        </div>
      </div>

      {/* Admin Settings Bar: Chave PIX, Caixa Inicial, Mensalidade & Diária */}
      {isGroupAdmin && (
        <form
          onSubmit={handleSaveSettings}
          className="rounded-xl border border-slate-200 bg-white p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h4 className="text-sm font-bold text-slate-900">
                Configuração de PIX, Caixa Atual e Valores
              </h4>
              <p className="text-xs text-slate-500">
                Informe a chave PIX que será enviada por e-mail aos peladeiros pendentes ao final da
                pelada.
              </p>
            </div>
            <span className="text-xs font-medium text-slate-600 inline-flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              Sua função:{' '}
              <strong>
                {permissions.myAdminTitle
                  ? ADMIN_TITLE_LABELS[permissions.myAdminTitle]
                  : 'Administrador'}
              </strong>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-5">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Chave PIX da Pelada *
              </label>
              <input
                value={pixKeyInput}
                onChange={(e) => setPixKeyInput(e.target.value)}
                placeholder="CPF, CNPJ, e-mail, celular ou chave aleatória"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Caixa Inicial (R$)
              </label>
              <input
                type="number"
                step="0.01"
                value={initialCashInput}
                onChange={(e) => setInitialCashInput(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mensalidade (R$)
              </label>
              <input
                type="number"
                step="0.50"
                min={0}
                value={monthlyFeeInput}
                onChange={(e) => setMonthlyFeeInput(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Diária / Avulso (R$)
              </label>
              <input
                type="number"
                step="0.50"
                min={0}
                value={avulsoFeeInput}
                onChange={(e) => setAvulsoFeeInput(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
              />
            </div>

            <div className="sm:col-span-1">
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
              >
                Salvar
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Form: New Entry (Caixa, Receita, Gasto, Débito Pendente + Anexo de Imagem) */}
      {showEntryForm && isGroupAdmin && (
        <form
          onSubmit={handleCreateEntry}
          className="rounded-xl border border-slate-200 bg-white p-5 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h4 className="font-display text-xl font-bold text-slate-900">
              Novo Lançamento Financeiro (com anexo de imagem)
            </h4>
            <button
              type="button"
              onClick={() => setShowEntryForm(false)}
              className="text-xs text-slate-500 hover:text-slate-900 cursor-pointer"
            >
              Cancelar
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tipo de Movimentação *
              </label>
              <select
                value={entryType}
                onChange={(e) => setEntryType(e.target.value as FinanceEntryType)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                <option value="expense">Gasto (Pago)</option>
                <option value="pending_debt">Débito Pendente (A pagar)</option>
                <option value="income">Receita</option>
                <option value="cash_box">Valor de Caixa / Aporte</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Título *</label>
              <input
                required
                value={entryTitle}
                onChange={(e) => setEntryTitle(e.target.value)}
                placeholder="Ex: Aluguel da quadra, Bola nova, Água"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="sm:col-span-1">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Valor (R$) *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={entryAmount}
                onChange={(e) => setEntryAmount(e.target.value)}
                placeholder="150.00"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
              />
            </div>

            <div className="sm:col-span-1">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Data</label>
              <input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="sm:col-span-3">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Descrição detalhada (opcional)
              </label>
              <input
                value={entryDescription}
                onChange={(e) => setEntryDescription(e.target.value)}
                placeholder="Detalhes do gasto, fornecedor, vencimento ou observações..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="sm:col-span-3">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Vincular a um encontro (opcional)
              </label>
              <select
                value={entryPeladaId}
                onChange={(e) => setEntryPeladaId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                <option value="">Pelada Fixa (Geral)</option>
                {peladas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} ({p.eventDate})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 pt-4">
            <ImageCaptureField
              value={entryAttachmentUrl}
              onChange={setEntryAttachmentUrl}
              onError={setError}
              buttonLabel="Anexar imagem / comprovante (câmera ou galeria)"
            />
            {entryAttachmentUrl && (
              <div className="flex items-center gap-2">
                <img
                  src={entryAttachmentUrl}
                  alt="Prévia do comprovante"
                  className="h-14 w-14 rounded-lg object-cover border border-slate-200"
                />
                <button
                  type="button"
                  onClick={() => setEntryAttachmentUrl(null)}
                  className="text-xs text-red-600 hover:underline cursor-pointer"
                >
                  Remover anexo
                </button>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
            >
              Salvar Lançamento
            </button>
          </div>
        </form>
      )}

      {/* Form: Launch Mensalidade / Diária */}
      {showChargeForm && isGroupAdmin && (
        <form
          onSubmit={handleCreateCharge}
          className="rounded-xl border border-slate-200 bg-white p-5 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h4 className="font-display text-xl font-bold text-slate-900">
              Lançar Mensalidade ou Diária dos Participantes
            </h4>
            <button
              type="button"
              onClick={() => setShowChargeForm(false)}
              className="text-xs text-slate-500 hover:text-slate-900 cursor-pointer"
            >
              Cancelar
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Modo</label>
              <select
                value={chargeMode}
                onChange={(e) =>
                  setChargeMode(e.target.value as 'single' | 'monthly_all' | 'pelada_present')
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                <option value="single">Participante específico</option>
                <option value="monthly_all">Gerar mensalidade de todos mensalistas</option>
                <option value="pelada_present">Gerar cobrança dos presentes no encontro</option>
              </select>
            </div>

            {chargeMode === 'single' && (
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Participante *
                </label>
                <select
                  required
                  value={chargePlayerId}
                  onChange={(e) => setChargePlayerId(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  <option value={0}>Selecione...</option>
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nickname} ({p.category})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {chargeMode !== 'pelada_present' && (
              <div className="sm:col-span-1">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tipo</label>
                <select
                  value={chargePaymentType}
                  onChange={(e) => {
                    const next = e.target.value as 'mensalidade' | 'diaria';
                    setChargePaymentType(next);
                    setChargeAmount(
                      String(next === 'mensalidade' ? group.monthlyFee : group.avulsoFee)
                    );
                  }}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  <option value="diaria">Diária</option>
                  <option value="mensalidade">Mensalidade</option>
                </select>
              </div>
            )}

            {(chargeMode === 'pelada_present' || chargePaymentType === 'diaria') && (
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Encontro da Pelada
                </label>
                <select
                  required={chargeMode === 'pelada_present'}
                  value={chargePeladaId}
                  onChange={(e) => {
                    setChargePeladaId(e.target.value);
                    const found = peladas.find((p) => String(p.id) === e.target.value);
                    if (found) setChargeRefLabel(`${found.title} (${found.eventDate})`);
                  }}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  <option value="">Sem encontro específico</option>
                  {peladas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} ({p.eventDate})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Referência (mês ou encontro)
              </label>
              <input
                required
                value={chargeRefLabel}
                onChange={(e) => setChargeRefLabel(e.target.value)}
                placeholder="Ex: 11/2026 ou Jogo #05"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            {chargeMode !== 'pelada_present' && (
              <div className="sm:col-span-1">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Valor (R$) *
                </label>
                <input
                  type="number"
                  step="0.50"
                  min="0.01"
                  required
                  value={chargeAmount}
                  onChange={(e) => setChargeAmount(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
                />
              </div>
            )}

            <div className="sm:col-span-3">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Observação (opcional)
              </label>
              <input
                value={chargeNotes}
                onChange={(e) => setChargeNotes(e.target.value)}
                placeholder="Observação da cobrança"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
            >
              Gerar Cobrança(s)
            </button>
          </div>
        </form>
      )}

      {/* Sub-navigation inside Financeiro */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-slate-100 p-1 w-fit">
        <button
          type="button"
          onClick={() => setActiveSubView('overview')}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
            activeSubView === 'overview'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Balanço por Participante ({participants.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveSubView('payments')}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
            activeSubView === 'payments'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Mensalidades & Diárias ({filteredPayments.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveSubView('entries')}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
            activeSubView === 'entries'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Caixa, Receitas & Gastos ({filteredEntries.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveSubView('emails')}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
            activeSubView === 'emails'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          E-mails PIX Enviados ({pixEmails.length})
        </button>
      </div>

      {/* 1. Balanço para controle de todos os participantes */}
      {activeSubView === 'overview' && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-bold text-slate-900">
                Balanço Financeiro — Controle de Todos os Participantes
              </h4>
              <p className="text-xs text-slate-500">
                Visível para todos os membros acompanharem pagamentos recebidos e pendências da
                pelada.
              </p>
            </div>
          </div>

          {participants.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Nenhum participante vinculado ou cobrança lançada ainda.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Peladeiro</th>
                    <th className="px-4 py-3 font-semibold">Categoria</th>
                    <th className="px-4 py-3 font-semibold text-right">Total Pago</th>
                    <th className="px-4 py-3 font-semibold text-right">Saldo Pendente</th>
                    <th className="px-4 py-3 font-semibold text-right">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {participants.map((part) => (
                    <tr key={part.playerId} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <span className="font-semibold text-slate-900 block">{part.nickname}</span>
                        <span className="text-slate-500">{part.name}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 capitalize">{part.category}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-emerald-700">
                        {formatBrl(part.totalPaid)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-amber-700">
                        {formatBrl(part.totalPending)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {part.pendingCount > 0 ? (
                          <span className="font-semibold text-amber-700">
                            {part.pendingCount} pendência(s)
                          </span>
                        ) : part.paidCount > 0 ? (
                          <span className="font-semibold text-emerald-700">Em dia</span>
                        ) : (
                          <span className="text-slate-400">Sem lançamentos</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 2. Mensalidades & Diárias (Recebimento restrito a Presidente / Tesoureiro) */}
      {activeSubView === 'payments' && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-bold text-slate-900">
                Mensalidades & Diárias dos Participantes
              </h4>
              <p className="text-xs text-slate-500">
                {canConfirmPayments
                  ? 'Você tem função de Presidente/Tesoureiro e pode confirmar os recebimentos.'
                  : 'Somente administradores com função de Presidente e/ou Tesoureiro podem marcar pagamentos como recebidos.'}
              </p>
            </div>

            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
              {(['all', 'pending', 'paid'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setPaymentFilter(f)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded cursor-pointer ${
                    paymentFilter === f ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  {f === 'all' ? 'Todos' : f === 'pending' ? 'Pendentes' : 'Recebidos'}
                </button>
              ))}
            </div>
          </div>

          {filteredPayments.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Nenhuma mensalidade ou diária lançada para este filtro.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Peladeiro</th>
                    <th className="px-4 py-3 font-semibold">Tipo / Referência</th>
                    <th className="px-4 py-3 font-semibold text-right">Valor</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPayments.map((pay) => (
                    <tr key={pay.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <span className="font-semibold text-slate-900 block">
                          {pay.playerNickname}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {pay.playerCategory}
                          {pay.playerEmail ? ` · ${pay.playerEmail}` : ' · Sem e-mail'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-slate-800 block">
                          {pay.paymentType === 'mensalidade' ? 'Mensalidade' : 'Diária'} ·{' '}
                          {pay.referenceLabel}
                        </span>
                        {pay.pixEmailSentAt && (
                          <span className="text-[11px] text-slate-500">
                            PIX enviado em {new Date(pay.pixEmailSentAt).toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {formatBrl(pay.amount)}
                      </td>
                      <td className="px-4 py-3">
                        {pay.status === 'paid' ? (
                          <div className="text-emerald-700 font-semibold">
                            Recebido
                            {pay.confirmedByName && (
                              <span className="block text-[11px] font-normal text-slate-500">
                                por {pay.confirmedByName}
                                {pay.confirmedByRole
                                  ? ` (${ADMIN_TITLE_LABELS[pay.confirmedByRole as AdminTitle] ?? pay.confirmedByRole})`
                                  : ''}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="font-semibold text-amber-700">Pendente</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-2 justify-end">
                          {pay.status === 'pending' ? (
                            canConfirmPayments ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleConfirmPayment(pay, 'paid')}
                                className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 cursor-pointer"
                              >
                                <CheckCircle2 className="h-3 w-3" /> Confirmar Recebimento
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-400">
                                Somente Presidente/Tesoureiro
                              </span>
                            )
                          ) : (
                            canConfirmPayments && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleConfirmPayment(pay, 'pending')}
                                className="text-[11px] font-medium text-slate-500 hover:text-slate-800 cursor-pointer"
                              >
                                Estornar
                              </button>
                            )
                          )}
                          {isGroupAdmin && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleDeletePayment(pay.id)}
                              className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"
                              title="Excluir cobrança"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 3. Caixa, Receitas, Gastos & Débitos Pendentes (com anexos de imagem) */}
      {activeSubView === 'entries' && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <h4 className="text-sm font-bold text-slate-900">
              Caixa, Receitas, Gastos & Débitos Pendentes
            </h4>

            <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
              {(['all', 'cash_box', 'income', 'expense', 'pending_debt'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setEntryFilter(t)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded cursor-pointer ${
                    entryFilter === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  {t === 'all' ? 'Todos' : ENTRY_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {filteredEntries.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Nenhum lançamento de caixa, receita, gasto ou débito pendente registrado.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="p-4 flex flex-wrap items-start justify-between gap-4 hover:bg-slate-50/70"
                >
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    {entry.attachmentUrl ? (
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewImage({ url: entry.attachmentUrl!, title: entry.title })
                        }
                        className="shrink-0 group relative rounded-lg overflow-hidden border border-slate-200 cursor-pointer"
                        title="Ampliar comprovante anexado"
                      >
                        <img
                          src={entry.attachmentUrl}
                          alt={`Comprovante: ${entry.title}`}
                          className="h-14 w-14 object-cover group-hover:opacity-90"
                        />
                      </button>
                    ) : (
                      <div className="h-14 w-14 rounded-lg border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center shrink-0 text-slate-300">
                        <ImageIcon className="h-5 w-5" />
                      </div>
                    )}

                    <div className="min-w-0 space-y-0.5">
                      <p className="text-xs font-semibold text-slate-500">
                        {ENTRY_TYPE_LABELS[entry.entryType]} · {entry.entryDate}
                        {entry.peladaTitle ? ` · ${entry.peladaTitle}` : ''}
                      </p>
                      <h5 className="text-sm font-bold text-slate-900">{entry.title}</h5>
                      {entry.description && (
                        <p className="text-xs text-slate-600">{entry.description}</p>
                      )}
                      {entry.createdByName && (
                        <p className="text-[11px] text-slate-400">
                          Lançado por {entry.createdByName}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span
                      className={`font-mono tabular-nums text-base font-bold ${
                        entry.entryType === 'expense' || entry.entryType === 'pending_debt'
                          ? entry.status === 'pending'
                            ? 'text-amber-700'
                            : 'text-red-700'
                          : 'text-emerald-700'
                      }`}
                    >
                      {entry.entryType === 'expense' || entry.entryType === 'pending_debt'
                        ? `- ${formatBrl(entry.amount)}`
                        : `+ ${formatBrl(entry.amount)}`}
                    </span>

                    <div className="flex items-center gap-2">
                      {entry.status === 'pending' ? (
                        <>
                          <span className="text-[11px] font-semibold text-amber-700">
                            Débito Pendente
                          </span>
                          {isGroupAdmin && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleSettleEntry(entry)}
                              className="rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 cursor-pointer"
                            >
                              Marcar como Quitado
                            </button>
                          )}
                        </>
                      ) : (
                        <span className="text-[11px] font-semibold text-slate-500">Confirmado</span>
                      )}

                      {isGroupAdmin && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleDeleteEntry(entry.id)}
                          className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"
                          title="Excluir lançamento"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 4. E-mails PIX enviados aos pendentes */}
      {activeSubView === 'emails' && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200">
            <h4 className="text-sm font-bold text-slate-900">
              E-mails de Cobrança PIX Enviados ({pixEmails.length})
            </h4>
            <p className="text-xs text-slate-500">
              Enviados automaticamente ao finalizar uma pelada ou sob demanda para quem está com
              mensalidade ou diária em aberto.
            </p>
          </div>

          {pixEmails.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Nenhum e-mail de cobrança PIX foi gerado ainda.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {pixEmails.map((em) => (
                <div key={em.id} className="p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs">
                      <strong className="text-slate-900">
                        {em.playerNickname || em.toEmail} ({em.toEmail})
                      </strong>
                      <p className="text-slate-500">{em.subject}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono tabular-nums text-xs font-bold text-emerald-700">
                        {formatBrl(em.amount)}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {new Date(em.sentAt).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  </div>

                  <pre className="whitespace-pre-wrap font-sans text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-md p-3">
                    {em.bodyText}
                  </pre>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard
                          ?.writeText(`Assunto: ${em.subject}\n\n${em.bodyText}`)
                          .catch(() => {});
                        setCopiedEmailId(em.id);
                        setTimeout(() => setCopiedEmailId(null), 2000);
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      {copiedEmailId === em.id ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-600" /> Copiado
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" /> Copiar E-mail
                        </>
                      )}
                    </button>
                    <a
                      href={`mailto:${encodeURIComponent(em.toEmail)}?subject=${encodeURIComponent(em.subject)}&body=${encodeURIComponent(em.bodyText)}`}
                      className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-800"
                    >
                      <Mail className="h-3 w-3" /> Abrir no E-mail
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Lightbox for attached receipt images */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative max-w-2xl w-full bg-white rounded-xl overflow-hidden border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <span className="text-sm font-bold text-slate-900">{previewImage.title}</span>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="p-1 text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 bg-slate-100 flex items-center justify-center max-h-[75vh] overflow-auto">
              <img
                src={previewImage.url}
                alt={previewImage.title}
                className="max-w-full max-h-[68vh] object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
