<template>
  <div class="page">
    <div class="home-shell">
      <div class="topbar">
      <h2>经营首页</h2>
      <div class="topbar-actions">
        <n-button text @click="go('/data')">更多</n-button>
        <n-button text @click="logout">退出登录</n-button>
      </div>
    </div>

    <div class="hero">
      <div class="hero-period">{{ periodText }}</div>
      <div class="hero-value" :class="{ negative: metrics.cumulative_profit < 0 }">
        {{ money(metrics.cumulative_profit) }}
      </div>
      <div class="hero-bottom">
        <button class="hero-expense" type="button" @click="openExpense">
          支出
        </button>
        <button class="hero-detail" type="button" @click="go('/profit-detail')">
          明细 ›
        </button>
      </div>
    </div>

    <div class="grid">
      <div class="card dividend-card" @click="go('/dividends')">
        <div class="card-title">分红</div>
        <div class="dividend-row">
          <span>分红总数</span>
          <strong>{{ money(metrics.total_dividends) }}</strong>
        </div>
        <div class="dividend-row">
          <span>已分配</span>
          <strong>{{ money(metrics.allocated_dividends) }}</strong>
        </div>
        <div class="dividend-row">
          <span>未分配</span>
          <strong :class="{ warn: metrics.unallocated_dividends > 0 }">
            {{ money(metrics.unallocated_dividends) }}
          </strong>
        </div>
        <div class="progress">
          <div class="progress-inner" :style="{ width: allocatedPercent + '%' }"></div>
        </div>
        <div class="card-link">查看分红明细 ›</div>
      </div>

      <div class="card receivable-card" @click="go('/customers')">
        <div class="card-title">客户管理</div>
        <div class="receivable-value" :class="{ warn: metrics.total_receivable > 0 }">
          {{ customerCount }} 位客户
        </div>
        <div class="receivable-hint">应收余额 {{ money(metrics.total_receivable) }}</div>
        <div class="card-link">查看客户 ›</div>
      </div>

      <div class="card warehouse-card">
        <div class="warehouse-top">
          <div>
            <div class="card-title">仓库管理</div>
          </div>
          <button class="warehouse-enter" type="button" @click="go('/products')">
            进入仓库
          </button>
        </div>

        <div class="warehouse-section-title">未发货</div>
        <div v-if="unshippedProducts.length > 0" class="unshipped-list">
          <span
            v-for="product in unshippedProducts"
            :key="product.id"
            class="unshipped-chip"
          >
            <span>{{ product.name }}</span>
            <strong>{{ qtyText(product.unshipped_quantity) }}</strong>
          </span>
        </div>
        <div v-else class="unshipped-empty">暂无未发货</div>

        <button class="stock-entry" type="button" @click="go('/inventory')">
          <span class="stock-entry-text">
            <span class="stock-entry-label">库存</span>
            <span class="stock-entry-hint">查看所有产品每个口味的库存</span>
          </span>
          <span class="stock-entry-value">
            {{ qtyText(totalStock) }}
            <span class="stock-entry-arrow">›</span>
          </span>
        </button>
      </div>
    </div>

    <div class="transit-card">
      <div class="transit-head">
        <h3>在途订单管理</h3>
        <span class="transit-count">{{ transitOrders.length }} 条</span>
      </div>
      <div v-if="transitOrders.length === 0" class="transit-empty">
        暂无未完成订单
      </div>
      <button
        v-for="order in transitOrders"
        :key="order.id"
        class="transit-row"
        type="button"
        @click="goTransitOrder(order)"
      >
        <div class="transit-main">
          <div class="transit-title">
            {{ order.product_name }} · {{ order.ship_date }}
          </div>
          <div class="transit-sub">
            数量 {{ qtyText(order.total_quantity) }} · {{ transitStatus(order) }}
          </div>
        </div>
        <span class="transit-chevron">›</span>
      </button>
    </div>
    </div>

    <n-modal
      v-model:show="expenseVisible"
      preset="card"
      title="记录支出"
      :bordered="false"
      :style="{ width: '92vw', maxWidth: '420px', borderRadius: '20px' }"
    >
      <div class="expense-form">
        <label class="modal-field">
          <span>事由</span>
          <n-input v-model:value="expenseReason" placeholder="支出事由" />
        </label>
        <label class="modal-field">
          <span>支出金额（元）</span>
          <n-input
            v-model:value="expenseAmount"
            inputmode="decimal"
            placeholder="支出金额（负数冲正）"
          />
        </label>
        <div v-if="expenseError" class="modal-error">{{ expenseError }}</div>
        <div class="modal-actions">
          <n-button @click="expenseVisible = false">取消</n-button>
          <n-button type="primary" :loading="expenseSaving" @click="saveExpense">
            确认
          </n-button>
        </div>
      </div>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { NButton, NModal, NInput } from 'naive-ui';
import { api, type DashboardBatch, type DashboardMetrics, type Product, type ProductShipment } from '../api/client';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const auth = useAuthStore();
const metrics = ref<DashboardMetrics>({
  cumulative_profit: 0,
  total_dividends: 0,
  allocated_dividends: 0,
  unallocated_dividends: 0,
  total_receivable: 0,
});
const products = ref<Product[]>([]);
const shipments = ref<ProductShipment[]>([]);
const batches = ref<DashboardBatch[]>([]);
const customerCount = ref(0);

const periodText = computed(() => {
  const dates = batches.value
    .map((batch) => batch.date)
    .filter((date): date is string => Boolean(date))
    .sort();
  if (dates.length === 0) return '暂无日期';
  const from = dates[0];
  const to = dates[dates.length - 1];
  return from === to ? from : `${from} 至 ${to}`;
});

const unshippedProducts = computed(() =>
  products.value.filter((product) => Number(product.unshipped_quantity) > 0)
);

function isShipmentComplete(shipment: ProductShipment): boolean {
  return (
    shipment.unit_price > 0 &&
    shipment.exchange_rate !== null &&
    shipment.unpaid_u <= 0.004 &&
    Number(shipment.customer_allocation_count ?? 0) > 0 &&
    Number(shipment.customer_unpaid ?? 0) <= 0.004
  );
}

const transitOrders = computed(() =>
  shipments.value.filter((shipment) => !isShipmentComplete(shipment))
);

function transitStatus(shipment: ProductShipment): string {
  if (shipment.unit_price <= 0 || shipment.exchange_rate === null) {
    return '待结算';
  }
  if (shipment.unpaid_u > 0.004) {
    return '未结算完';
  }
  if (Number(shipment.customer_allocation_count ?? 0) <= 0) {
    return '待分货';
  }
  if (Number(shipment.customer_unpaid ?? 0) > 0.004) {
    return `客户未收齐 ¥${Number(shipment.customer_unpaid).toFixed(2)}`;
  }
  return '未完成';
}

function goTransitOrder(shipment: ProductShipment) {
  if (shipment.batch_id !== null) {
    router.push(`/batches/${shipment.batch_id}/shipments`);
    return;
  }
  router.push('/products');
}

const expenseVisible = ref(false);
const expenseReason = ref('');
const expenseAmount = ref('');
const expenseSaving = ref(false);
const expenseError = ref('');

const totalStock = computed(() =>
  products.value.reduce((sum, product) => sum + Number(product.stock || 0), 0)
);

const allocatedPercent = computed(() => {
  if (metrics.value.total_dividends <= 0) return 0;
  return Math.max(
    0,
    Math.min(100, (metrics.value.allocated_dividends / metrics.value.total_dividends) * 100)
  );
});

function money(value: number | undefined): string {
  const v = Number(value) || 0;
  return v < 0 ? '-¥' + Math.abs(v).toFixed(2) : '¥' + v.toFixed(2);
}

function go(path: string) {
  router.push(path);
}

function qtyText(value: number | undefined): string {
  return String(Math.round((Number(value) || 0) * 100) / 100);
}

function openExpense() {
  expenseReason.value = '';
  expenseAmount.value = '';
  expenseError.value = '';
  expenseVisible.value = true;
}

async function saveExpense() {
  if (expenseSaving.value) return;
  const reason = expenseReason.value.trim();
  const amount = Number(expenseAmount.value);
  if (!reason) {
    expenseError.value = '请填写支出事由';
    return;
  }
  if (!Number.isFinite(amount) || amount === 0) {
    expenseError.value = '支出金额不能为 0';
    return;
  }
  expenseSaving.value = true;
  expenseError.value = '';
  try {
    await api.createGeneralExpense({ reason, amount });
    expenseVisible.value = false;
    await load();
  } catch (e) {
    expenseError.value = e instanceof Error ? e.message : '保存失败';
  } finally {
    expenseSaving.value = false;
  }
}

async function load() {
  try {
    const [dashboard, productRes, shipRes, customerRes] = await Promise.all([
      api.getDashboard(),
      api.getProducts(),
      api.getProductShipments(),
      api.getCustomers(),
    ]);
    metrics.value = dashboard.metrics;
    batches.value = dashboard.batches;
    products.value = productRes.products;
    shipments.value = shipRes.shipments;
    customerCount.value = customerRes.customers.length;
  } catch (e) {
    console.error(e);
  }
}

async function logout() {
  await auth.logout();
  router.push('/login');
}

onMounted(load);
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 16px;
  background:
    radial-gradient(1200px 600px at 8% -10%, rgba(56, 161, 105, 0.16), transparent 60%),
    radial-gradient(900px 520px at 110% 8%, rgba(44, 122, 123, 0.18), transparent 55%),
    linear-gradient(160deg, #eef3f8 0%, #e2eaf3 45%, #eef3f8 100%);
}
.home-shell {
  width: 100%;
  max-width: 700px;
  margin: 0 auto;
}
.topbar {
  position: relative;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  min-height: 52px;
  margin-bottom: 10px;
}
.topbar h2 {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  margin: 0;
  font-size: 20px;
  letter-spacing: 0.5px;
  white-space: nowrap;
}
.topbar-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-left: auto;
}
.topbar-actions :deep(.n-button) {
  min-height: 44px;
  padding: 0 8px;
}

/* 主指标：立体渐变卡 */
.hero {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px 12px;
  border-radius: 22px;
  padding: 22px;
  color: #ffffff;
  background: linear-gradient(135deg, #163a4a 0%, #1f6f6b 55%, #2f9e7a 100%);
  box-shadow:
    0 24px 48px -20px rgba(16, 58, 74, 0.75),
    0 8px 18px -12px rgba(0, 0, 0, 0.45),
    inset 0 1px 0 rgba(255, 255, 255, 0.28);
  transform: perspective(900px) rotateX(0.6deg);
}
.hero::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(320px 150px at 85% 12%, rgba(255, 255, 255, 0.3), transparent 70%),
    radial-gradient(220px 120px at 10% 110%, rgba(0, 0, 0, 0.18), transparent 70%);
  pointer-events: none;
}
.hero-period {
  position: relative;
  z-index: 1;
  padding-top: 5px;
  opacity: 0.88;
  font-size: 13px;
  line-height: 1.5;
  letter-spacing: 0.2px;
}
.hero-value {
  position: relative;
  z-index: 1;
  margin-left: auto;
  font-size: 34px;
  font-weight: 800;
  line-height: 1.2;
  text-align: right;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.28);
}
.hero-value.negative {
  color: #ffd6d6;
}
.hero-bottom {
  position: relative;
  z-index: 1;
  flex: 0 0 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 2px;
}
.hero-detail,
.hero-expense {
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid rgba(255, 255, 255, 0.38);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
}
.hero-detail:active,
.hero-expense:active {
  background: rgba(255, 255, 255, 0.2);
}
.hero-expense {
  border-color: rgba(255, 214, 214, 0.55);
}

/* 次级指标卡 */
.grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  margin-top: 14px;
}
.card {
  position: relative;
  background: #ffffff;
  border-radius: 18px;
  padding: 16px;
  border: 1px solid rgba(255, 255, 255, 0.75);
  box-shadow:
    0 1px 2px rgba(15, 35, 55, 0.05),
    0 16px 30px -18px rgba(15, 35, 55, 0.35),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
  transition: transform 0.18s ease, box-shadow 0.18s ease;
  cursor: pointer;
}
.card:hover {
  transform: translateY(-4px) scale(1.01);
  box-shadow:
    0 2px 4px rgba(15, 35, 55, 0.06),
    0 26px 44px -20px rgba(15, 35, 55, 0.45),
    inset 0 1px 0 rgba(255, 255, 255, 0.95);
}
.card:active {
  transform: translateY(-1px) scale(0.995);
}
.card-title {
  font-size: 13px;
  color: #7b8794;
  letter-spacing: 0.5px;
}
.dividend-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-top: 8px;
  font-size: 14px;
  color: #4a5568;
}
.dividend-row strong {
  font-size: 16px;
  color: #1f2d3d;
}
.progress {
  height: 6px;
  border-radius: 999px;
  background: #e6eef5;
  margin-top: 12px;
  overflow: hidden;
  box-shadow: inset 0 1px 2px rgba(15, 35, 55, 0.08);
}
.progress-inner {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #2f9e7a, #1f6f6b);
  transition: width 0.4s ease;
}
.card-link {
  margin-top: 10px;
  font-size: 12px;
  color: #2f9e7a;
  font-weight: 600;
}
.receivable-value {
  font-size: 28px;
  font-weight: 800;
  color: #1f2d3d;
  margin-top: 10px;
}
.receivable-hint {
  color: #9aa5b1;
  font-size: 12px;
  margin-top: 2px;
}
.warehouse-card {
  grid-column: 1 / -1;
  cursor: default;
  background: linear-gradient(135deg, #ffffff 0%, #f1fbf6 100%);
  border: 1px solid rgba(47, 158, 122, 0.25);
}
.warehouse-card:hover {
  transform: none;
}
.warehouse-card:active {
  transform: none;
}
.warehouse-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.warehouse-sub {
  margin-top: 3px;
  color: #8a96a3;
  font-size: 12px;
}
.warehouse-enter {
  min-height: 44px;
  padding: 0 12px;
  border: none;
  border-radius: 11px;
  background: #eef7f2;
  color: #1f6f6b;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
}
.warehouse-enter:active {
  background: #d9efe4;
}
.warehouse-section-title {
  margin-top: 14px;
  color: #7b8794;
  font-size: 12px;
  font-weight: 600;
}
.unshipped-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}
.unshipped-chip {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 0 12px;
  border-radius: 11px;
  background: #eef7f2;
  color: #1f6f6b;
  font-size: 13px;
  font-weight: 600;
}
.unshipped-chip strong {
  font-size: 15px;
  color: #1f2d3d;
}
.unshipped-empty {
  margin-top: 8px;
  color: #9aa5b1;
  font-size: 12px;
}
.stock-entry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-height: 64px;
  margin-top: 12px;
  padding: 10px 14px;
  border: none;
  border-radius: 12px;
  background: #f7f9fc;
  text-align: left;
  font-family: inherit;
  cursor: pointer;
}
.stock-entry:active {
  background: #eef7f2;
}
.stock-entry-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.stock-entry-label {
  color: #1f2d3d;
  font-size: 15px;
  font-weight: 700;
}
.stock-entry-hint {
  color: #8a96a3;
  font-size: 12px;
}
.stock-entry-value {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #1f6f6b;
  font-size: 22px;
  font-weight: 800;
  white-space: nowrap;
}
.stock-entry-arrow {
  color: #8a96a3;
  font-size: 22px;
  font-weight: 400;
}
.transit-card {
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: 14px;
  background: #ffffff;
  box-shadow:
    0 1px 2px rgba(15, 35, 55, 0.04),
    0 14px 28px -22px rgba(15, 35, 55, 0.3);
}
.transit-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 6px;
}
.transit-head h3 {
  margin: 0;
  color: #1f2d3d;
  font-size: 15px;
}
.transit-count {
  color: #8a96a3;
  font-size: 12px;
}
.transit-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 58px;
  padding: 8px 0;
  border: none;
  border-top: 1px solid #f2f4f7;
  background: transparent;
  text-align: left;
  font-family: inherit;
  cursor: pointer;
}
.transit-row:active {
  background: #f7fbf9;
}
.transit-main {
  flex: 1;
  min-width: 0;
}
.transit-title {
  color: #1f2d3d;
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.transit-sub {
  margin-top: 3px;
  color: #8a96a3;
  font-size: 12px;
}
.transit-chevron {
  color: #8a96a3;
  font-size: 20px;
  line-height: 1;
}
.transit-empty {
  padding: 12px 0;
  color: #9aa5b1;
  font-size: 13px;
}

/* 最近批次 */
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 20px 0 10px;
}
.section-header h3 {
  margin: 0;
  font-size: 16px;
}
.batch-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}
.batch-card {
  background: #ffffff;
  border-radius: 18px;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.75);
  box-shadow:
    0 1px 2px rgba(15, 35, 55, 0.05),
    0 16px 30px -18px rgba(15, 35, 55, 0.32),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
  transition: transform 0.18s ease, box-shadow 0.18s ease;
  cursor: pointer;
}
.batch-card:hover {
  transform: translateY(-3px);
  box-shadow:
    0 2px 4px rgba(15, 35, 55, 0.06),
    0 24px 42px -20px rgba(15, 35, 55, 0.42);
}
.batch-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.batch-name {
  font-size: 16px;
  font-weight: 700;
  color: #1f2d3d;
}
.status-pill {
  font-size: 11px;
  padding: 3px 9px;
  border-radius: 999px;
  color: #1f6f6b;
  background: linear-gradient(145deg, #e6f6ef, #d2efe2);
  box-shadow: inset 0 1px 0 #ffffff;
  white-space: nowrap;
}
.batch-date {
  color: #9aa5b1;
  font-size: 12px;
  margin-top: 4px;
}
.batch-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 10px;
  margin-top: 10px;
  font-size: 12px;
  color: #7b8794;
}
.batch-stats strong {
  display: block;
  color: #2d3748;
  font-size: 13px;
  margin-top: 2px;
}
.pending {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.pending-tag {
  font-size: 11px;
  color: #8a5a00;
  background: linear-gradient(145deg, #fff7e0, #ffedbf);
  border-radius: 999px;
  padding: 3px 8px;
  box-shadow: inset 0 1px 0 #ffffff;
}
.empty {
  color: #9aa5b1;
  padding: 12px 0;
}
.empty-card {
  background: #ffffff;
  border-radius: 18px;
  padding: 24px;
  text-align: center;
  box-shadow: 0 16px 30px -18px rgba(15, 35, 55, 0.3);
}
.empty-text {
  color: #9aa5b1;
  margin-bottom: 10px;
}
.warn {
  color: #d03050;
}
.expense-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.modal-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #1f2d3d;
  font-size: 13px;
  font-weight: 600;
}
.modal-error {
  color: #d03050;
  font-size: 12px;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 4px;
}

@media (min-width: 560px) {
  .grid {
    grid-template-columns: 1fr 1fr;
  }
}
@media (min-width: 760px) {
  .batch-grid {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
