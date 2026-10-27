import { useAuthStore } from '../stores/auth';

export interface ApiError {
  error?: string;
}

export interface Batch {
  id: number;
  name: string;
  date: string | null;
  expected_arrival_date: string | null;
  remark: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Plan {
  id: number;
  batch_id: number;
  product_name: string;
  flavor: string;
  quantity: number;
  unit_price: number;
  amount: number;
  remark: string | null;
  created_at: string;
  updated_at: string;
}

export interface BatchDetail {
  batch: Batch;
  plans: Plan[];
  bookings: PlanBooking[];
}

export interface PlanBooking {
  id: number;
  plan_id: number;
  batch_id: number;
  customer_name: string;
  quantity: number;
  created_at?: string;
  updated_at?: string;
}

export interface ArrivalRecord {
  id: number;
  batch_id: number;
  plan_id: number;
  date: string | null;
  quantity: number;
  unit_price: number | null;
  amount: number;
  supplier: string | null;
  remark: string | null;
}

export interface ArrivalPlanView {
  plan_id: number;
  product_name: string;
  flavor: string;
  planned_quantity: number;
  planned_unit_price: number;
  planned_amount: number;
  actual_quantity: number;
  actual_amount: number;
  avg_unit_price: number | null;
  shortage: number;
  overage: number;
  amount_diff: number;
}

export interface ArrivalView {
  plans: ArrivalPlanView[];
  records: ArrivalRecord[];
  summary: { actual_total_amount: number };
}

export interface ArrivalInput {
  planId: number;
  date?: string;
  quantity: number;
  unitPrice?: number | null;
  remark?: string;
}

export interface Receipt {
  id: number;
  batch_id: number;
  shipment_id: number;
  date: string | null;
  amount: number;
  remark: string | null;
}

export interface Shipment {
  id: number;
  batch_id: number;
  plan_id: number | null;
  customer_name: string;
  date: string | null;
  product_name: string | null;
  flavor: string | null;
  quantity: number;
  unit_price: number;
  sales_amount: number;
  waived_amount: number;
  remark: string | null;
}

export interface PlanStock {
  plan_id: number;
  product_name: string;
  flavor: string;
  stock: number;
  planned_quantity: number;
  planned_unit_price: number;
  actual_quantity: number;
  shipped_quantity: number;
  remaining_quantity: number;
  bookings: Array<{
    booking_id: number;
    customer_name: string;
    quantity: number;
    allocated_quantity: number;
  }>;
}

export interface ShipmentView extends Shipment {
  received_amount: number;
  remaining_amount: number;
  status: string;
  receipts: Receipt[];
}

export interface ShipmentListView {
  shipments: ShipmentView[];
  plans: PlanStock[];
  summary: {
    sales_total: number;
    waived_total: number;
    received_total: number;
    remaining_total: number;
  };
}

export interface ShipmentInput {
  planId?: number | null;
  customerName: string;
  date?: string;
  productName?: string;
  flavor?: string;
  quantity: number;
  unitPrice: number;
  waivedAmount?: number;
  remark?: string;
}

export interface ReceiptInput {
  date?: string;
  amount: number;
  remark?: string;
}

export interface CustomerDebtBatchShipment {
  id: number;
  date: string | null;
  product_name: string | null;
  flavor: string | null;
  quantity: number;
  unit_price: number;
  sales_amount: number;
  waived_amount: number;
  received: number;
  remaining: number;
}

export interface CustomerDebtBatch {
  batch_id: number;
  batch_name: string;
  batch_date: string | null;
  total_quantity: number;
  sales: number;
  waived: number;
  received: number;
  remaining: number;
  shipments: CustomerDebtBatchShipment[];
}

export interface CustomerDebt {
  customer_name: string;
  first_date: string;
  total_sales: number;
  total_waived: number;
  total_received: number;
  total_remaining: number;
  batches: CustomerDebtBatch[];
}

export interface ExpenseCategory {
  id: number;
  name: string;
  is_default: number;
  created_at: string;
}

export interface Expense {
  id: number;
  batch_id: number;
  date: string | null;
  category: string;
  amount: number;
  description: string | null;
  voucher_url: string | null;
}

export interface ExpenseView {
  expenses: Expense[];
  summary: {
    total: number;
    by_category: Array<{ category: string; amount: number }>;
  };
}

export interface ExpenseInput {
  date?: string;
  category: string;
  amount: number;
  description?: string;
  voucherUrl?: string;
}

export interface CurrencyExchange {
  id: number;
  batch_id: number;
  date: string | null;
  rmb_amount: number;
  usd_amount: number;
  buy_rate: number | null;
  settle_rate: number | null;
  fee: number;
  include_fee: number;
  loss: number | null;
  remark: string | null;
}

export interface ExchangeView {
  exchanges: CurrencyExchange[];
  summary: { total_loss: number };
}

export interface ExchangeInput {
  date?: string;
  rmbAmount: number;
  usdAmount: number;
  buyRate?: number | null;
  settleRate?: number | null;
  fee?: number;
  remark?: string;
}

export type ProfitBasis = 'cash' | 'receivable';

export interface AppSettings {
  profit_basis: ProfitBasis;
}

export interface BatchProfit {
  batch_id: number;
  basis: ProfitBasis;
  sales_amount: number;
  received_amount: number;
  waived_amount: number;
  settled_amount: number;
  receivable_remaining: number;
  actual_cost: number;
  expenses: number;
  exchange_loss: number;
  manual_dividend: number;
  profit: number;
}

export interface Dividend {
  id: number;
  batch_id: number;
  quantity: number;
  profit: number;
  total_amount: number;
  status: 'draft' | 'confirmed';
  confirmed_at: string | null;
}

export interface DividendPayment {
  id: number;
  allocation_id: number;
  date: string | null;
  amount: number;
  remark: string | null;
}

export interface DividendAllocation {
  id: number;
  dividend_id: number;
  investor_name: string;
  contribution_amount: number;
  ratio: number;
  share_amount: number;
  paid_amount: number;
  unpaid_amount: number;
  payments: DividendPayment[];
}

export interface DividendView {
  dividend: Dividend;
  allocations: DividendAllocation[];
  summary: {
    total_amount: number;
    allocated_amount: number;
    unallocated_amount: number;
    paid_amount: number;
    unpaid_amount: number;
  };
}

export interface DividendRecord {
  id: number;
  batch_id: number;
  batch_name: string;
  batch_code: string;
  amount: number;
  status: 'paid' | 'unpaid';
  created_at: string;
  updated_at: string;
}

export interface DashboardMetrics {
  cumulative_profit: number;
  total_dividends: number;
  allocated_dividends: number;
  unallocated_dividends: number;
  total_receivable: number;
}

export interface DashboardBatch {
  id: number;
  name: string;
  date: string | null;
  status: string;
  planned_total: number;
  arrival_total: number;
  shipment_received: number;
  profit: number;
  receivable: number;
  pending: string[];
}

export interface Dashboard {
  basis: ProfitBasis;
  metrics: DashboardMetrics;
  batches: DashboardBatch[];
}

export interface ProfitDetailIncomeSource {
  id: number;
  batch_id: number;
  batch_name: string;
  customer_name: string;
  date: string | null;
  product_name: string | null;
  flavor: string | null;
  received: number;
  waived: number;
  amount: number;
}

export interface ProfitDetailCostSource {
  id: number;
  batch_id: number;
  batch_name: string;
  product_name: string;
  ship_date: string;
  total_quantity: number;
  unit_price: number;
  freight: number;
  exchange_loss: number | null;
  cost_amount: number;
}

export interface ProfitDetailExpenseSource {
  id: number;
  batch_id: number;
  batch_name: string;
  date: string | null;
  category: string;
  amount: number;
  description: string | null;
}

export interface ProfitDetailDividendSource {
  id: number;
  batch_id: number;
  batch_name: string;
  total_amount: number;
  confirmed_at: string | null;
}

export interface ProfitDetail {
  period: { from: string | null; to: string | null };
  totals: {
    income: number;
    cost: number;
    expenses: number;
    dividends: number;
    general_expenses: number;
    profit: number;
  };
  batches: ProfitDetailBatch[];
  generalExpenses: GeneralExpense[];
  incomeSources: ProfitDetailIncomeSource[];
  costSources: ProfitDetailCostSource[];
  expenseSources: ProfitDetailExpenseSource[];
  dividendSources: ProfitDetailDividendSource[];
}

export interface GeneralExpense {
  id: number;
  date: string | null;
  reason: string;
  amount: number;
  created_at: string;
}

export interface ProfitDetailBatch {
  id: number;
  name: string;
  date: string | null;
  product_name: string;
  ship_date: string;
  quantity: number;
  income: number;
  cost: number;
  expenses: number;
  dividends: number;
  profit: number;
}

export interface DividendOverviewItem {
  id: number;
  batch_id: number;
  batch_name: string;
  total_amount: number;
  status: string;
  confirmed_at: string | null;
  allocated_amount: number;
  paid_amount: number;
  unpaid_amount: number;
  unallocated_amount: number;
}

export interface HistoryBatch {
  id: number;
  name: string;
  date: string | null;
  status: string;
}

export interface HistoryShipment {
  id: number;
  batch_id: number;
  batch_name: string;
  customer_name: string;
  date: string | null;
  product_name: string | null;
  flavor: string | null;
  quantity: number;
  unit_price: number;
  sales_amount: number;
  waived_amount: number;
  received_amount: number;
  remaining_amount: number;
  status: string;
}

export interface HistoryResult {
  batches: HistoryBatch[];
  shipments: HistoryShipment[];
}

export interface AuditLog {
  id: number;
  entity: string;
  record_id: number | null;
  action: string;
  before_json: string | null;
  after_json: string | null;
  created_at: string;
}

export interface ProductFlavor {
  id: number;
  product_id: number;
  flavor: string;
  price: number;
  stock: number;
  active_batch_id: number | null;
}

export interface Product {
  id: number;
  name: string;
  supplier: string | null;
  base_price: number;
  remark: string | null;
  stock: number;
  preorder_count: number;
  unshipped_quantity: number;
  flavors: ProductFlavor[];
}

export interface PreorderItem {
  flavor: string;
  quantity: number;
}

export interface Preorder {
  id: number;
  customer_name: string;
  unit_price: number;
  date: string | null;
  total_quantity: number;
  items: PreorderItem[];
}

export interface PreorderFlavorTotal {
  flavor: string;
  total_quantity: number;
}

export interface ShipmentDetails {
  customers: Array<{ name: string; total: number; unit_price?: number }>;
  rows: Array<{ flavor: string; cells: number[]; total: number }>;
}

export interface ShipmentPayment {
  id: number;
  shipment_id: number;
  amount: number;
  created_at: string;
}

export interface ProductShipment {
  id: number;
  product_id: number;
  batch_id: number | null;
  product_name: string;
  ship_date: string;
  total_quantity: number;
  unit_price: number;
  rmb_amount: number;
  freight: number;
  exchange_rate: number | null;
  buy_rate: number | null;
  sell_rate: number | null;
  fee: number;
  u_amount: number;
  exchange_loss: number | null;
  u_paid: number;
  unpaid_u: number;
  cost_amount: number;
  customer_allocation_count: number;
  customer_unpaid: number;
  details: ShipmentDetails | null;
  payments: ShipmentPayment[];
  created_at: string;
  updated_at: string;
}

export interface BatchInput {
  name: string;
  date?: string;
  expectedArrivalDate?: string;
  remark?: string;
}

export interface PlanInput {
  productName: string;
  flavor: string;
  quantity: number;
  unitPrice: number;
  remark?: string;
}

export interface PlanPatchInput {
  productName?: string;
  flavor?: string;
  quantity?: number;
  unitPrice?: number;
  remark?: string;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const auth = useAuthStore();
  const headers: Record<string, string> = { ...((options.headers as Record<string, string>) ?? {}) };
  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }
  if (auth.token) {
    headers['Authorization'] = `Bearer ${auth.token}`;
  }
  const res = await fetch(`/api${path}`, { ...options, headers });
  const data = (await res.json().catch(() => ({}))) as ApiError & T;
  if (!res.ok) {
    throw new Error(data.error || `请求失败 (${res.status})`);
  }
  return data as T;
}

async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const auth = useAuthStore();
  const headers: Record<string, string> = {};
  if (auth.token) {
    headers['Authorization'] = `Bearer ${auth.token}`;
  }
  const res = await fetch(`/api${path}`, { headers });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as ApiError;
    throw new Error(data.error || '下载失败');
  }
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^";]+)"?/);
  const filename = match ? match[1] : fallbackName;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  login: (username: string, password: string) =>
    request<{ token: string; user: { id: number; username: string } }>(
      '/auth/login',
      { method: 'POST', body: JSON.stringify({ username, password }) }
    ),
  logout: () => request<unknown>('/auth/logout', { method: 'POST' }),
  me: () => request<{ user: { id: number; username: string } }>('/auth/me'),
  getBatches: () => request<Batch[]>('/batches'),
  getBatch: (id: number) => request<BatchDetail>(`/batches/${id}`),
  getArrivals: (batchId: number) => request<ArrivalView>(`/batches/${batchId}/arrivals`),
  createArrival: (batchId: number, data: ArrivalInput) =>
    request<ArrivalRecord>(`/batches/${batchId}/arrivals`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateArrival: (batchId: number, arrivalId: number, data: Partial<ArrivalInput>) =>
    request<ArrivalRecord>(`/batches/${batchId}/arrivals/${arrivalId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deleteArrival: (batchId: number, arrivalId: number) =>
    request<unknown>(`/batches/${batchId}/arrivals/${arrivalId}`, { method: 'DELETE' }),
  confirmArrival: (batchId: number) =>
    request<Batch>(`/batches/${batchId}/arrivals/confirm`, { method: 'POST' }),
  getShipments: (batchId: number) => request<ShipmentListView>(`/batches/${batchId}/shipments`),
  createShipment: (batchId: number, data: ShipmentInput) =>
    request<Shipment>(`/batches/${batchId}/shipments`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  allocateShipments: (
    batchId: number,
    data: { date?: string; items: Array<{ planId: number; customerName: string; quantity: number }> }
  ) =>
    request<ShipmentListView>(`/batches/${batchId}/allocate`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  settleReceipts: (
    batchId: number,
    data: {
      date?: string;
      items: Array<{ customerName: string; received: number; waived?: number }>;
    }
  ) =>
    request<ShipmentListView>(`/batches/${batchId}/settle`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateShipment: (batchId: number, shipmentId: number, data: Partial<ShipmentInput>) =>
    request<Shipment>(`/batches/${batchId}/shipments/${shipmentId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deleteShipment: (batchId: number, shipmentId: number) =>
    request<unknown>(`/batches/${batchId}/shipments/${shipmentId}`, { method: 'DELETE' }),
  createReceipt: (batchId: number, shipmentId: number, data: ReceiptInput) =>
    request<Receipt>(`/batches/${batchId}/shipments/${shipmentId}/receipts`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteReceipt: (batchId: number, receiptId: number) =>
    request<unknown>(`/batches/${batchId}/receipts/${receiptId}`, { method: 'DELETE' }),
  getCustomerDebts: () => request<{ customers: CustomerDebt[] }>('/customers/debts'),
  getCustomerList: () => request<{ customers: string[] }>('/customers/list'),
  getCustomers: () => request<{ customers: Array<{
    id: number; name: string; phone: string | null; remark: string | null;
    order_count: number; net_sales: number; remaining: number; last_order_date: string | null;
  }> }>('/customers'),
  getCustomer: (id: number) => request<{
    customer: { id: number; name: string; phone: string | null; remark: string | null };
    orders: Array<{
      id: number; date: string | null; product_name: string | null; flavor: string | null;
      quantity: number; unit_price: number; sales_amount: number; waived_amount: number;
      remark: string | null; batch_name: string | null;
    }>;
  }>(`/customers/${id}`),
  createCustomer: (data: { name: string; phone?: string; remark?: string }) =>
    request<{ id: number; name: string }>('/customers', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateCustomer: (id: number, data: { name?: string; phone?: string; remark?: string }) =>
    request<{ ok: boolean }>(`/customers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteCustomer: (id: number) =>
    request<{ ok: boolean }>(`/customers/${id}`, { method: 'DELETE' }),
  repayCustomer: (data: { batchId: number; customerName: string; amount: number }) =>
    request<{ ok: boolean }>('/customers/repay', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getExpenseCategories: () => request<ExpenseCategory[]>('/expense-categories'),
  createExpenseCategory: (name: string) =>
    request<ExpenseCategory>('/expense-categories', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  getExpenses: (batchId: number) => request<ExpenseView>(`/batches/${batchId}/expenses`),
  createExpense: (batchId: number, data: ExpenseInput) =>
    request<Expense>(`/batches/${batchId}/expenses`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateExpense: (batchId: number, expenseId: number, data: Partial<ExpenseInput>) =>
    request<Expense>(`/batches/${batchId}/expenses/${expenseId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deleteExpense: (batchId: number, expenseId: number) =>
    request<unknown>(`/batches/${batchId}/expenses/${expenseId}`, { method: 'DELETE' }),
  getExchanges: (batchId: number) => request<ExchangeView>(`/batches/${batchId}/exchanges`),
  createExchange: (batchId: number, data: ExchangeInput) =>
    request<CurrencyExchange>(`/batches/${batchId}/exchanges`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteExchange: (batchId: number, exchangeId: number) =>
    request<unknown>(`/batches/${batchId}/exchanges/${exchangeId}`, { method: 'DELETE' }),
  getSettings: () => request<{ settings: AppSettings }>('/settings'),
  updateSettings: (data: Partial<AppSettings>) =>
    request<{ settings: AppSettings }>('/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  getBatchProfit: (batchId: number) => request<BatchProfit>(`/batches/${batchId}/profit`),
  updateProfitDividend: (batchId: number, amount: number) =>
    request<{ manual_dividend: number }>(`/batches/${batchId}/profit-dividend`, {
      method: 'PUT',
      body: JSON.stringify({ amount }),
    }),
  getDividend: (batchId: number) => request<DividendView>(`/batches/${batchId}/dividend`),
  getDividendRecords: (batchId: number) =>
    request<{ records: DividendRecord[] }>(`/batches/${batchId}/dividend/records`),
  createDividendRecord: (batchId: number, batchCode: string) =>
    request<{ record: DividendRecord }>(`/batches/${batchId}/dividend/records`, {
      method: 'POST',
      body: JSON.stringify({ batchCode }),
    }),
  updateDividendRecord: (batchId: number, recordId: number, status: 'paid' | 'unpaid') =>
    request<{ record: DividendRecord }>(
      `/batches/${batchId}/dividend/records/${recordId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }
    ),
  deleteDividendRecord: (batchId: number, recordId: number) =>
    request<unknown>(`/batches/${batchId}/dividend/records/${recordId}`, {
      method: 'DELETE',
    }),
  setDividendSettings: (
    batchId: number,
    data: { quantity: number; profit: number }
  ) =>
    request<DividendView>(`/batches/${batchId}/dividend`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  addDividendAllocation: (batchId: number, data: { investorName: string; amount: number }) =>
    request<DividendView>(`/batches/${batchId}/dividend/allocations`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateDividendAllocation: (
    batchId: number,
    allocationId: number,
    data: { investorName?: string; amount?: number }
  ) =>
    request<DividendView>(`/batches/${batchId}/dividend/allocations/${allocationId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deleteDividendAllocation: (batchId: number, allocationId: number) =>
    request<unknown>(`/batches/${batchId}/dividend/allocations/${allocationId}`, {
      method: 'DELETE',
    }),
  confirmDividend: (batchId: number) =>
    request<DividendView>(`/batches/${batchId}/dividend/confirm`, { method: 'POST' }),
  addDividendPayment: (
    batchId: number,
    allocationId: number,
    data: { date?: string; amount: number; remark?: string }
  ) =>
    request<DividendView>(`/batches/${batchId}/dividend/allocations/${allocationId}/payments`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteDividendPayment: (batchId: number, paymentId: number) =>
    request<unknown>(`/batches/${batchId}/dividend/payments/${paymentId}`, { method: 'DELETE' }),
  getDashboard: () => request<Dashboard>('/dashboard'),
  getProfitDetail: () => request<ProfitDetail>('/dashboard/profit-detail'),
  createGeneralExpense: (data: { reason: string; amount: number; date?: string }) =>
    request<{ expense: GeneralExpense }>('/dashboard/expenses', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getDividendOverview: () => request<{ dividends: DividendOverviewItem[] }>('/dividends'),
  getHistory: (query: string) => request<HistoryResult>(`/history?${query}`),
  getAuditLogs: (limit = 100) => request<{ logs: AuditLog[] }>(`/audit?limit=${limit}`),
  getProducts: () => request<{ products: Product[] }>('/products'),
  getProduct: (id: number) => request<{ product: Product }>(`/products/${id}`),
  createProduct: (data: { name: string; supplier?: string; price?: number; remark?: string }) =>
    request<{ product: Product }>('/products', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  createProductFlavor: (productId: number, data: { flavor: string; price?: number }) =>
    request<{ flavor: ProductFlavor }>(`/products/${productId}/flavors`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateProductFlavor: (
    productId: number,
    flavorId: number,
    data: { flavor?: string; price?: number }
  ) =>
    request<{ flavor: ProductFlavor }>(`/products/${productId}/flavors/${flavorId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deleteProductFlavor: (productId: number, flavorId: number) =>
    request<void>(`/products/${productId}/flavors/${flavorId}`, { method: 'DELETE' }),
  createPreorder: (
    productId: number,
    data: {
      customerName: string;
      unitPrice: number;
      date?: string;
      items: Array<{ flavor: string; quantity: number }>;
    }
  ) =>
    request<{ preorder: Preorder }>(`/products/${productId}/preorders`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updatePreorder: (
    productId: number,
    preorderId: number,
    data: {
      customerName: string;
      unitPrice: number;
      items: Array<{ flavor: string; quantity: number }>;
    }
  ) =>
    request<{ preorder: Preorder }>(`/products/${productId}/preorders/${preorderId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  getPreorders: (productId: number) =>
    request<{ flavors: PreorderFlavorTotal[]; orders: Preorder[] }>(
      `/products/${productId}/preorders`
    ),
  getProductShipment: (productId: number) =>
    request<{ shipment: ProductShipment | null }>(`/products/${productId}/shipment`),
  getProductShipments: () =>
    request<{ shipments: ProductShipment[] }>('/products/shipments'),
  createProductShipment: (productId: number) =>
    request<{ shipment: ProductShipment }>(`/products/${productId}/shipment`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  updateProductShipment: (
    productId: number,
    shipmentId: number,
    data: {
      unitPrice?: number;
      freight?: number;
      exchangeRate?: number | null;
      exchangeLoss?: number;
      buyRate?: number | null;
      sellRate?: number | null;
      fee?: number;
      uPaid?: number;
    }
  ) =>
    request<{ shipment: ProductShipment }>(
      `/products/${productId}/shipments/${shipmentId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      }
    ),
  calcProductShipment: (
    productId: number,
    shipmentId: number,
    data: {
      unitPrice?: number;
      freight?: number;
      exchangeRate?: number | null;
      exchangeLoss?: number;
      buyRate?: number | null;
      sellRate?: number | null;
      fee?: number;
      uPaid?: number;
    }
  ) =>
    request<{
      result: {
        unit_price: number;
        freight: number;
        exchange_rate: number | null;
        buy_rate: number | null;
        sell_rate: number | null;
        fee: number;
        rmb_amount: number;
        u_amount: number;
        exchange_loss: number | null;
        u_paid: number;
        unpaid_u: number;
        cost_amount: number;
      };
    }>(`/products/${productId}/shipments/${shipmentId}/calc`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  calcExchangeLoss: (data: { rmbAmount: number; buyRate: number; sellRate: number }) =>
    request<{ loss: number | null }>('/products/exchange-loss', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  addShipmentPayment: (productId: number, shipmentId: number, amount: number) =>
    request<{ shipment: ProductShipment }>(
      `/products/${productId}/shipments/${shipmentId}/payments`,
      {
        method: 'POST',
        body: JSON.stringify({ amount }),
      }
    ),
  orderProduct: (
    productId: number,
    data: { date?: string; batchName?: string; prices?: Record<string, number> } = {}
  ) =>
    request<{ batch_id: number; batch_name: string; plan_count: number }>(
      `/products/${productId}/order`,
      { method: 'POST', body: JSON.stringify(data) }
    ),
  orderProductFlavor: (productId: number, flavorId: number) =>
    request<{ batch_id: number; plan_id: number; batch_name: string }>(
      `/products/${productId}/flavors/${flavorId}/order`,
      { method: 'POST', body: JSON.stringify({}) }
    ),
  stockInProduct: (
    productId: number,
    data: {
      supplierName: string;
      unitPrice?: number;
      date?: string;
      items: Array<{ flavor: string; quantity: number }>;
    }
  ) =>
    request<{
      supplier_name: string;
      unit_price: number;
      date: string;
      total_quantity: number;
      items: Array<{ flavor: string; quantity: number }>;
    }>(`/products/${productId}/stock-in`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  stockInProductFlavor: (
    productId: number,
    flavorId: number,
    data: { quantity: number; unitPrice: number; date?: string }
  ) =>
    request<{ stock: number }>(`/products/${productId}/flavors/${flavorId}/stock-in`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  downloadExcel: () => downloadFile('/export/excel', 'ledger.xlsx'),
  downloadBackup: () => downloadFile('/backup', 'backup.json'),
  restoreBackup: (payload: unknown) =>
    request<{ ok: boolean }>('/backup/restore', {
      method: 'POST',
      body: JSON.stringify({ ...(payload as Record<string, unknown>), confirm: true }),
    }),
  createBatch: (data: BatchInput) =>
    request<Batch>('/batches', { method: 'POST', body: JSON.stringify(data) }),
  updateBatch: (id: number, data: Partial<BatchInput>) =>
    request<Batch>(`/batches/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  createPlan: (batchId: number, data: PlanInput) =>
    request<Plan>(`/batches/${batchId}/plans`, { method: 'POST', body: JSON.stringify(data) }),
  addPlanBooking: (batchId: number, planId: number, data: { customerName: string; quantity: number }) =>
    request<{ booking: PlanBooking; bookings: PlanBooking[] }>(
      `/batches/${batchId}/plans/${planId}/bookings`,
      { method: 'POST', body: JSON.stringify(data) }
    ),
  updatePlanBooking: (
    batchId: number,
    planId: number,
    bookingId: number,
    data: { customerName?: string; quantity?: number }
  ) =>
    request<{ booking: PlanBooking; bookings: PlanBooking[] }>(
      `/batches/${batchId}/plans/${planId}/bookings/${bookingId}`,
      { method: 'PATCH', body: JSON.stringify(data) }
    ),
  deletePlanBooking: (batchId: number, planId: number, bookingId: number) =>
    request<unknown>(`/batches/${batchId}/plans/${planId}/bookings/${bookingId}`, {
      method: 'DELETE',
    }),
  updatePlan: (batchId: number, planId: number, data: PlanPatchInput) =>
    request<Plan>(`/batches/${batchId}/plans/${planId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deletePlan: (batchId: number, planId: number) =>
    request<unknown>(`/batches/${batchId}/plans/${planId}`, { method: 'DELETE' }),
};
