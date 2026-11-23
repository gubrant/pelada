import React, { useEffect, useState } from 'react';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Check,
  Copy,
  Eye,
  Plus,
  QrCode,
  Receipt,
  Trash2,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type {
  FinanceTransaction,
  FinanceType,
  PeladaFinanceSummary,
  PeladaMembership,
  WeeklyPelada,
} from '../types/pelada';
import { ImageUploadField } from './ImageUploadField';

interface PeladaFinanceTabProps {
  pelada: WeeklyPelada;
  members: PeladaMembership[];
  isAdmin: boolean;
  onRefreshPelada: () => void;
}

const INCOME_CATEGORIES = ['Mensalidade', 'Avulso', 'Patrocínio', 'Outros'];
const EXPENSE_CATEGORIES = [
  'Aluguel de Quadra',
  'Material Esportivo',
  'Arbitragem',
  'Confraternização',
  'Manutenção',
  'Outros',
];

function formatMoney(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export const PeladaFinanceTab: React.FC<PeladaFinanceTabProps> = ({
  pelada,
  members,
  isAdmin,
  onRefreshPelada,
}) => {
  const [summary, setSummary] = useState<PeladaFinanceSummary>({
    totalIncome: 0,
    totalExpense: 0,
    balance: 0,
    transactionsCount: 0,
    receiptsCount: 0,
  });
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedPix, setCopiedPix] = useState(false);

  // Novo lançamento
  const [showForm, setShowForm] = useState(false);
  const [txType, setTxType] = useState<FinanceType>('income');
  const [category, setCategory] = useState('Mensalidade');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [transactionDate, setTransactionDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [relatedUserId, setRelatedUserId] = useState('');
  const [receiptImageUrl, setReceiptImageUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal de comprovante ampliado
  const [previewTx, setPreviewTx] = useState<FinanceTransaction | null>(null);

  const loadFinance = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{
        summary: PeladaFinanceSummary;
        transactions: FinanceTransaction[];
      }>(`/api/peladas/${pelada.id}/finance`);
      setSummary(res.summary);
      setTransactions(res.transactions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar financeiro.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFinance();
  }, [pelada.id]);

  const handleCopyPix = async () => {
    if (!pelada.pixKey) return;
    try {
      await navigator.clipboard.writeText(pelada.pixKey);
      setCopiedPix(true);
      setTimeout(() => setCopiedPix(false), 2000);
    } catch {
      // ignore clipboard error
    }
  };

  const handleCreateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch(`/api/peladas/${pelada.id}/finance`, {
        method: 'POST',
        body: JSON.stringify({
          type: txType,
          category,
          description: description.trim(),
          amount: Number(amount),
          transactionDate,
          relatedUserId: relatedUserId ? Number(relatedUserId) : null,
          receiptImageUrl,
        }),
      });
      setDescription('');
      setAmount('');
      setRelatedUserId('');
      setReceiptImageUrl(null);
      setShowForm(false);
      await loadFinance();
      onRefreshPelada();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao registrar lançamento.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTx = async (txId: number) => {
    try {
      await apiFetch(`/api/finance/${txId}`, { method: 'DELETE' });
      await loadFinance();
      onRefreshPelada();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir lançamento.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Faixa de PIX e Valores Configurados */}
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-5 rounded-xl border border-emerald-200 bg-emerald-50/60 p-5">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-900">
              <QrCode className="h-4 w-4 text-emerald-700" />
              Chave PIX da Pelada
            </span>
            {pelada.pixKey && (
              <button
                type="button"
                onClick={handleCopyPix}
                className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-50"
              >
                {copiedPix ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedPix ? 'Copiado' : 'Copiar PIX'}
              </button>
            )}
          </div>
          <p className="mt-2 font-mono text-sm font-bold text-slate-900 break-all">
            {pelada.pixKey || 'Nenhuma chave PIX informada pelo administrador'}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-emerald-200/80 pt-3 text-xs">
            <div>
              <p className="text-emerald-800">Valor Mensalista</p>
              <p className="font-mono text-base font-bold tabular-nums text-slate-900">
                {formatMoney(pelada.mensalistaFee)}
              </p>
            </div>
            <div>
              <p className="text-emerald-800">Valor Avulso</p>
              <p className="font-mono text-base font-bold tabular-nums text-slate-900">
                {formatMoney(pelada.avulsoFee)}
              </p>
            </div>
          </div>
        </div>

        {/* KPIs Financeiros */}
        <div className="lg:col-span-7 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>Entradas</span>
              <ArrowUpCircle className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-emerald-700">
              {formatMoney(summary.totalIncome)}
            </p>
            <p className="mt-1 text-xs text-slate-500">Mensalidades e avulsos</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>Saídas</span>
              <ArrowDownCircle className="h-4 w-4 text-rose-600" />
            </div>
            <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-rose-700">
              {formatMoney(summary.totalExpense)}
            </p>
            <p className="mt-1 text-xs text-slate-500">Quadra, bolas e despesas</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>Saldo em Caixa</span>
              <Receipt className="h-4 w-4 text-slate-500" />
            </div>
            <p
              className={`mt-2 font-mono text-2xl font-bold tabular-nums ${
                summary.balance >= 0 ? 'text-slate-900' : 'text-rose-700'
              }`}
            >
              {formatMoney(summary.balance)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {summary.receiptsCount} comprovante(s) anexado(s)
            </p>
          </div>
        </div>
      </div>

      {/* Ação de Novo Lançamento (Apenas Admin) */}
      {isAdmin && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Movimentação Financeira & Comprovação por Recibo
              </h3>
              <p className="text-xs text-slate-500">
                Registre pagamentos recebidos ou despesas da quadra anexando a foto da nota ou
                recibo.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowForm((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              <Plus className="h-4 w-4" />
              {showForm ? 'Fechar Formulário' : 'Novo Lançamento'}
            </button>
          </div>

          {showForm && (
            <form
              onSubmit={handleCreateTransaction}
              className="mt-5 grid gap-4 border-t border-slate-200 pt-5 sm:grid-cols-2"
            >
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Tipo de movimentação
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTxType('income');
                      setCategory('Mensalidade');
                    }}
                    className={`rounded-lg border py-2 text-xs font-semibold ${
                      txType === 'income'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    Entrada (+)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTxType('expense');
                      setCategory('Aluguel de Quadra');
                    }}
                    className={`rounded-lg border py-2 text-xs font-semibold ${
                      txType === 'expense'
                        ? 'border-rose-600 bg-rose-50 text-rose-800'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    Saída (-)
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Categoria
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600"
                >
                  {(txType === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Descrição *
                </label>
                <input
                  type="text"
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={
                    txType === 'income'
                      ? 'Ex.: Pagamento mensalidade mês atual'
                      : 'Ex.: Pagamento locação Arena Sul'
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Valor (R$) *
                  </label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0,00"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums outline-none focus:border-emerald-600"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Data *
                  </label>
                  <input
                    type="date"
                    required
                    value={transactionDate}
                    onChange={(e) => setTransactionDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums outline-none focus:border-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Vincular a um membro (opcional)
                </label>
                <select
                  value={relatedUserId}
                  onChange={(e) => setRelatedUserId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600"
                >
                  <option value="">Sem vínculo específico</option>
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.userName} ({m.category === 'mensalista' ? 'Mensalista' : 'Avulso'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <ImageUploadField
                  label="Imagem do recibo ou nota (comprovação)"
                  value={receiptImageUrl}
                  onChange={setReceiptImageUrl}
                  acceptCamera
                  helperText="Anexe foto do comprovante PIX, recibo ou nota fiscal."
                />
              </div>

              {error && (
                <div className="sm:col-span-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-700">
                  {error}
                </div>
              )}

              <div className="sm:col-span-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {submitting ? 'Registrando...' : 'Salvar Lançamento'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Extrato Financeiro */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-3.5">
          <h3 className="text-sm font-bold text-slate-900">Extrato de Entradas e Saídas</h3>
        </div>

        {loading ? (
          <p className="p-8 text-center text-sm text-slate-500">Carregando movimentações...</p>
        ) : transactions.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">
            Nenhum lançamento financeiro registrado nesta pelada ainda.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Descrição / Categoria</th>
                  <th className="px-4 py-3">Comprovante</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                  {isAdmin && <th className="px-4 py-3 text-right">Ações</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-600">
                      {tx.transactionDate}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${
                          tx.type === 'income'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {tx.type === 'income' ? 'Entrada' : 'Saída'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{tx.description}</p>
                      <p className="text-xs text-slate-500">
                        {tx.category}
                        {tx.relatedUserName ? ` · Membro: ${tx.relatedUserName}` : ''}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {tx.receiptImageUrl ? (
                        <button
                          type="button"
                          onClick={() => setPreviewTx(tx)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          <Eye className="h-3.5 w-3.5 text-emerald-700" />
                          Ver Recibo
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">Sem anexo</span>
                      )}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-mono font-bold tabular-nums ${
                        tx.type === 'income' ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {tx.type === 'income' ? '+' : '-'} {formatMoney(tx.amount)}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteTx(tx.id)}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-700"
                          title="Excluir lançamento"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Visualização do Recibo/Nota */}
      {previewTx && previewTx.receiptImageUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Comprovante — {previewTx.description}
                </h3>
                <p className="text-xs text-slate-500">
                  {previewTx.transactionDate} · {formatMoney(previewTx.amount)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewTx(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[75vh] overflow-auto bg-slate-900 p-4 flex items-center justify-center">
              <img
                src={previewTx.receiptImageUrl}
                alt={`Comprovante de ${previewTx.description}`}
                className="max-h-[68vh] w-auto rounded-lg object-contain bg-white"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
