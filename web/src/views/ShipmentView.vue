<template>
  <div class="page">
    <div class="page-header">
      <n-button text aria-label="返回" @click="goBack">←</n-button>
      <h2>出货{{ batch ? '：' + batch.name : '' }}</h2>
      <n-tag v-if="batch" size="small">{{ batch.status }}</n-tag>
    </div>

    <BatchTabs :batch-id="batchId" active="shipments" />

    <n-alert v-if="error" type="error" :title="error" style="margin-bottom: 12px" />

    <div class="alloc-section">
      <div class="alloc-toolbar">
        <span class="alloc-title">分货表</span>
        <div class="alloc-actions">
          <template v-if="!allocationCollapsed">
            <button class="link-btn" @click="promptAddCustomer">+ 客户</button>
            <n-button type="primary" size="small" :loading="saving" @click="saveAllocation">
              保存分货
            </n-button>
          </template>
          <button
            class="collapse-btn"
            type="button"
            :aria-expanded="!allocationCollapsed"
            @click="toggleAllocation"
          >
            {{ allocationCollapsed ? '展开' : '折叠' }}
          </button>
        </div>
      </div>

      <template v-if="!allocationCollapsed">
        <div v-if="view.plans.length === 0" class="empty">暂无预定口味，请先在批次详情中添加</div>
        <div v-else class="table-wrap">
          <table class="alloc-matrix">
            <thead>
              <tr>
                <th colspan="2" class="matrix-product-head">{{ productName }}</th>
                <th v-for="customer in customerNames" :key="customer" :colspan="2">
                  <span class="customer-head-cell">
                    {{ customer }}
                    <button
                      v-if="canRemoveCustomer(customer)"
                      class="remove-customer"
                      type="button"
                      title="删除客户"
                      @click="removeCustomer(customer)"
                    >
                      ×
                    </button>
                  </span>
                </th>
                <th rowspan="2">余</th>
              </tr>
              <tr>
                <th>库存</th>
                <th>口味</th>
                <template v-for="customer in customerNames" :key="customer + '-sub'">
                  <th class="booked-th">预定</th>
                  <th>分货</th>
                </template>
              </tr>
            </thead>
            <tbody>
              <tr v-for="plan in view.plans" :key="plan.plan_id">
                <td class="stock-cell">{{ plan.stock }}</td>
                <td class="name-cell">{{ plan.flavor }}</td>
                <template v-for="customer in customerNames" :key="customer">
                  <td class="num-cell">{{ bookingQtyDisplay(plan, customer) }}</td>
                  <td class="input-cell">
                    <input
                      v-model="allocInputs[`${plan.plan_id}::${customer}`]"
                      inputmode="decimal"
                      placeholder="数量"
                    />
                  </td>
                </template>
                <td class="remain-cell" :class="{ over: rowRemaining(plan) < 0 }">
                  {{ rowRemaining(plan) < 0 ? '超分' : rowRemaining(plan) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="hint">
          预定不可改；分货数量可实时修改；余 = 库存 + 已分货 − 本次分货合计，超分标红。
        </div>
      </template>
      <div v-else class="alloc-collapsed">
        分货表已折叠，点「展开」可继续分货或修改数量。
      </div>
    </div>

    <n-card title="客户出货与应收" v-if="byCustomer.length > 0">
      <div
        v-if="customerCopyHint"
        class="copy-hint"
        :class="{ 'copy-hint-error': customerCopyError }"
      >
        {{ customerCopyHint }}
      </div>
      <div class="customer-list">
        <div v-for="c in byCustomer" :key="c.customer" class="customer-item">
          <div class="customer-summary">
            <div class="customer-title-row">
              <div class="customer-title" @click="toggleCustomer(c.customer)">
                <span class="customer-name">{{ c.customer }}</span>
                <n-tag size="small" type="success" :bordered="false">
                  分到货 {{ qtyText(c.quantity) }}
                </n-tag>
                <n-tag
                  v-if="customerPriceText(c.customer)"
                  size="small"
                  :bordered="false"
                >
                  价格 {{ customerPriceText(c.customer) }}
                </n-tag>
              </div>
              <div class="customer-actions">
                <button
                  class="copy-customer"
                  type="button"
                  :disabled="customerShipments(c.customer).length === 0"
                  @click="copyCustomerData(c.customer)"
                >
                  复制给客户
                </button>
                <button
                  class="expand-customer"
                  type="button"
                  :aria-label="expandedCustomers[c.customer] ? '收起明细' : '展开明细'"
                  @click="toggleCustomer(c.customer)"
                >
                  {{ expandedCustomers[c.customer] ? '▾' : '▸' }}
                </button>
              </div>
            </div>
            <div class="customer-stats" @click="toggleCustomer(c.customer)">
              <span>应收 {{ money(c.netReceivable) }}</span>
              <span>已收 {{ money(customerReceived(c)) }}</span>
              <span v-if="customerWaived(c) > 0.004">
                甩零 {{ money(customerWaived(c)) }}
              </span>
              <span v-if="customerRemaining(c) > 0.004" class="warn">
                欠款 {{ money(customerRemaining(c)) }}
              </span>
              <span v-else-if="!isSettlementDirty(c)" class="settled">已清</span>
            </div>
          </div>

          <div v-if="expandedCustomers[c.customer]" class="customer-detail">
            <div v-if="customerShipments(c.customer).length === 0" class="empty small">
              暂无出货记录
            </div>
            <div
              v-for="s in customerShipments(c.customer)"
              :key="s.id"
              class="shipment"
            >
              <div class="shipment-date">
                {{ s.date || '-' }} · {{ s.flavor || s.product_name || '-' }}
              </div>
              <div class="line">
                {{ s.quantity }} × {{ money(s.unit_price) }} = {{ money(s.sales_amount) }}
              </div>
              <div class="line">
                甩零 {{ money(s.waived_amount) }}；已收 {{ money(s.received_amount) }}；实收
                {{ money(s.received_amount + s.waived_amount) }}
              </div>
              <div class="line" :class="{ warn: s.remaining_amount > 0 }">
                剩余欠款：{{ money(s.remaining_amount) }}
              </div>
              <div class="actions">
                <n-button size="small" @click="removeShipment(s)">删除出货</n-button>
              </div>
              <div v-if="s.receipts.length > 0" class="receipts">
                <div class="receipts-title">收款记录</div>
                <div v-for="r in s.receipts" :key="r.id" class="receipt-row">
                  <span>
                    {{ r.date || '-' }} · 收款 {{ money(r.amount) }}
                    <span v-if="r.remark">（{{ r.remark }}）</span>
                  </span>
                  <n-button size="tiny" @click="removeReceipt(r)">删除</n-button>
                </div>
              </div>
            </div>

            <div class="settle-box">
              <label class="settle-field">
                <span class="settle-label">已收（元）</span>
                <input
                  v-model="receivedDrafts[c.customer]"
                  class="received-input"
                  inputmode="decimal"
                  placeholder="已收"
                />
              </label>
              <label class="settle-field">
                <span class="settle-label">甩零（元）</span>
                <input
                  v-model="waivedDrafts[c.customer]"
                  class="received-input waived-input"
                  inputmode="decimal"
                  placeholder="甩零"
                />
              </label>
              <button
                class="settle-btn"
                :disabled="saving || !isSettlementDirty(c)"
                @click="settleCustomer(c)"
              >
                确认收款
              </button>
            </div>
            <div class="settle-received">
              <span>实收金额</span>
              <strong>{{ money(customerReceived(c) + customerWaived(c)) }}</strong>
              <span class="settle-formula">已收 + 甩零</span>
            </div>
            <div class="hint">
              已收和甩零可手填，点「确认收款」后保存；欠款 = 应收 − 已收 − 甩零。
            </div>
          </div>
        </div>
      </div>
      <div class="hint">
        点客户行展开出货明细和收款记录；「复制给客户」按已保存的分货数量生成，第一行产品名+总数，后面每行口味+数量。
      </div>
    </n-card>

    <n-card title="汇总">
      <div class="summary-grid">
        <div>销售额合计：{{ money(view.summary.sales_total) }}</div>
        <div>甩零合计：{{ money(view.summary.waived_total) }}</div>
        <div>已收合计：{{ money(view.summary.received_total) }}</div>
        <div :class="{ warn: view.summary.remaining_total > 0 }">
          应收欠款：{{ money(view.summary.remaining_total) }}
        </div>
      </div>
    </n-card>

    <n-modal
      v-model:show="addCustomerVisible"
      preset="card"
      title="新增客户"
      :bordered="false"
      :style="{ width: '92vw', maxWidth: '420px', borderRadius: '20px' }"
    >
      <Field label="客户名字">
        <n-input
          v-model:value="newCustomerName"
          placeholder="请输入客户名字"
          @keyup.enter="confirmAddCustomer"
        />
      </Field>
      <div v-if="addCustomerError" class="modal-error">{{ addCustomerError }}</div>
      <div class="modal-actions">
        <n-button @click="addCustomerVisible = false">取消</n-button>
        <n-button type="primary" @click="confirmAddCustomer">确认</n-button>
      </div>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { NCard, NButton, NTag, NAlert, NModal, NInput } from 'naive-ui';
import {
  api,
  type Batch,
  type PlanStock,
  type Receipt,
  type ShipmentListView,
  type ShipmentView,
} from '../api/client';
import BatchTabs from '../components/BatchTabs.vue';
import Field from '../components/Field.vue';
import { goBackOr } from '../utils/navigation';
import { copyText } from '../utils/clipboard';

const route = useRoute();
const router = useRouter();
const batchId = computed(() => Number(route.params.id));
const batch = ref<Batch | null>(null);
const view = ref<ShipmentListView>({
  shipments: [],
  plans: [],
  summary: { sales_total: 0, waived_total: 0, received_total: 0, remaining_total: 0 },
});
const saving = ref(false);
const error = ref('');
const allocationCollapsed = ref(false);

const allocInputs = ref<Record<string, string>>({});
const extraCustomers = ref<string[]>([]);
const receivedDrafts = ref<Record<string, string>>({});
const waivedDrafts = ref<Record<string, string>>({});
const addCustomerVisible = ref(false);
const newCustomerName = ref('');
const addCustomerError = ref('');
const expandedCustomers = ref<Record<string, boolean>>({});
const customerCopyHint = ref('');
const customerCopyError = ref(false);

function money(value: number): string {
  const v = Number(value) || 0;
  return v < 0 ? '-¥' + Math.abs(v).toFixed(2) : '¥' + v.toFixed(2);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

const productName = computed(() => view.value.plans[0]?.product_name ?? '');

const allocatedMap = computed(() => {
  const map = new Map<string, number>();
  for (const shipment of view.value.shipments) {
    if (shipment.plan_id === null) continue;
    const key = `${shipment.plan_id}::${shipment.customer_name}`;
    map.set(key, round2((map.get(key) ?? 0) + Number(shipment.quantity)));
  }
  return map;
});

const customerNames = computed(() => {
  const set = new Set<string>();
  for (const plan of view.value.plans) {
    for (const booking of plan.bookings) set.add(booking.customer_name);
  }
  for (const shipment of view.value.shipments) set.add(shipment.customer_name);
  for (const customer of extraCustomers.value) set.add(customer);
  return [...set];
});

function toggleAllocation() {
  allocationCollapsed.value = !allocationCollapsed.value;
}

function promptAddCustomer() {
  newCustomerName.value = '';
  addCustomerError.value = '';
  addCustomerVisible.value = true;
}

function confirmAddCustomer() {
  const name = newCustomerName.value.trim();
  if (!name) {
    addCustomerError.value = '请输入客户名字';
    return;
  }
  if (customerNames.value.includes(name)) {
    addCustomerError.value = '该客户已经在分货表里';
    return;
  }
  addCustomer(name);
  addCustomerVisible.value = false;
}

function addCustomer(name: string) {
  if (!customerNames.value.includes(name)) {
    extraCustomers.value = [...extraCustomers.value, name];
  }
  for (const plan of view.value.plans) {
    const key = `${plan.plan_id}::${name}`;
    if (allocInputs.value[key] === undefined) {
      allocInputs.value = { ...allocInputs.value, [key]: '' };
    }
  }
}

function hasCustomerRecords(name: string): boolean {
  const hasBooking = view.value.plans.some((plan) =>
    plan.bookings.some(
      (booking) => booking.customer_name === name && Number(booking.quantity) > 0
    )
  );
  const hasShipment = view.value.shipments.some(
    (shipment) => shipment.customer_name === name
  );
  return hasBooking || hasShipment;
}

function canRemoveCustomer(name: string): boolean {
  return extraCustomers.value.includes(name) && !hasCustomerRecords(name);
}

function removeCustomer(name: string) {
  if (hasCustomerRecords(name)) {
    error.value = '该客户已有预定或分货记录，不能直接删除';
    return;
  }
  extraCustomers.value = extraCustomers.value.filter(
    (customer) => customer !== name
  );
  const next = { ...allocInputs.value };
  for (const plan of view.value.plans) {
    delete next[`${plan.plan_id}::${name}`];
  }
  allocInputs.value = next;
}

function bookingQty(plan: PlanStock, customer: string): number {
  const booking = plan.bookings.find((item) => item.customer_name === customer);
  return booking ? booking.quantity : 0;
}

function bookingQtyDisplay(plan: PlanStock, customer: string): string {
  const booking = plan.bookings.find((item) => item.customer_name === customer);
  return booking ? String(booking.quantity) : '—';
}

function rowRemaining(plan: PlanStock): number {
  let desired = 0;
  let baseline = 0;
  for (const customer of customerNames.value) {
    const key = `${plan.plan_id}::${customer}`;
    const value = Number(allocInputs.value[key] ?? 0);
    if (Number.isFinite(value)) desired = round2(desired + value);
    baseline = round2(baseline + (allocatedMap.value.get(key) ?? 0));
  }
  return round2(plan.stock + baseline - desired);
}

const byCustomer = computed(() => {
  const map = new Map<
    string,
    {
      customer: string;
      quantity: number;
      sales: number;
      waived: number;
      netReceivable: number;
      received: number;
      remaining: number;
    }
  >();
  for (const shipment of view.value.shipments) {
    const entry = map.get(shipment.customer_name) ?? {
      customer: shipment.customer_name,
      quantity: 0,
      sales: 0,
      waived: 0,
      netReceivable: 0,
      received: 0,
      remaining: 0,
    };
    entry.quantity = round2(entry.quantity + Number(shipment.quantity));
    entry.sales = round2(entry.sales + Number(shipment.sales_amount));
    entry.waived = round2(entry.waived + Number(shipment.waived_amount));
    entry.received = round2(entry.received + Number(shipment.received_amount));
    entry.remaining = round2(entry.remaining + Number(shipment.remaining_amount));
    map.set(shipment.customer_name, entry);
  }
  return [...map.values()].map((entry) => ({
    ...entry,
    netReceivable: round2(entry.sales),
  }));
});

function customerShipments(name: string): ShipmentView[] {
  return view.value.shipments.filter(
    (shipment) => shipment.customer_name === name
  );
}

function customerReceived(customer: {
  customer: string;
  received?: number;
}): number {
  const raw = receivedDrafts.value[customer.customer];
  if (raw === undefined) {
    return round2(Number(customer.received) || 0);
  }
  const input = Number(raw);
  return Number.isFinite(input) ? round2(input) : 0;
}

function customerWaived(customer: {
  customer: string;
  waived?: number;
}): number {
  const raw = waivedDrafts.value[customer.customer];
  if (raw === undefined) {
    return round2(Number(customer.waived) || 0);
  }
  const input = Number(raw);
  return Number.isFinite(input) ? round2(input) : 0;
}

function customerRemaining(customer: {
  netReceivable: number;
  customer: string;
  received?: number;
  waived?: number;
}): number {
  return Math.max(
    round2(
      customer.netReceivable - customerReceived(customer) - customerWaived(customer)
    ),
    0
  );
}

function toggleCustomer(name: string) {
  expandedCustomers.value = {
    ...expandedCustomers.value,
    [name]: !expandedCustomers.value[name],
  };
}

function qtyText(value: number): string {
  return String(round2(Number(value) || 0));
}

function priceText(value: number): string {
  const v = round2(Number(value) || 0);
  return Number.isInteger(v) ? `¥${v}` : `¥${v.toFixed(2)}`;
}

function customerPriceText(name: string): string {
  const prices = [
    ...new Set(
      customerShipments(name)
        .map((shipment) => round2(Number(shipment.unit_price) || 0))
        .filter((price) => price > 0)
    ),
  ];
  return prices.map(priceText).join(' / ');
}

async function copyCustomerData(name: string) {
  const shipments = customerShipments(name);
  if (shipments.length === 0) {
    customerCopyError.value = true;
    customerCopyHint.value = '该客户还没有已保存的分货';
    return;
  }

  const byFlavor = new Map<string, number>();
  for (const shipment of shipments) {
    const flavor = (shipment.flavor || '').trim();
    const quantity = Number(shipment.quantity) || 0;
    if (!flavor || quantity <= 0) continue;
    byFlavor.set(
      flavor,
      round2((byFlavor.get(flavor) ?? 0) + quantity)
    );
  }

  const flavorOrder = new Map<string, number>();
  view.value.plans.forEach((plan, index) => {
    flavorOrder.set(plan.flavor, index);
  });
  const flavors = [...byFlavor.keys()].sort((a, b) => {
    const ai = flavorOrder.get(a);
    const bi = flavorOrder.get(b);
    if (ai === undefined && bi === undefined) return a.localeCompare(b, 'zh-CN');
    if (ai === undefined) return 1;
    if (bi === undefined) return -1;
    return ai - bi;
  });

  const total = round2(
    shipments.reduce((sum, shipment) => sum + Number(shipment.quantity), 0)
  );
  const displayName =
    productName.value || shipments[0]?.product_name || '产品';
  const lines = [
    `${displayName} ${qtyText(total)}`,
    ...flavors.map(
      (flavor) => `${flavor} ${qtyText(byFlavor.get(flavor) ?? 0)}`
    ),
  ];

  const ok = await copyText(lines.join('\n'));
  customerCopyError.value = !ok;
  customerCopyHint.value = ok
    ? `已复制「${name}」的分货，可直接粘贴给客户`
    : '复制失败，请手动复制';
}

function initSettlementDrafts() {
  const received: Record<string, string> = {};
  const waived: Record<string, string> = {};
  for (const customer of byCustomer.value) {
    received[customer.customer] = String(customer.received);
    waived[customer.customer] = String(customer.waived);
  }
  receivedDrafts.value = received;
  waivedDrafts.value = waived;
}

function isSettlementDirty(customer: {
  customer: string;
  received: number;
  waived: number;
}): boolean {
  const receivedRaw = receivedDrafts.value[customer.customer];
  const waivedRaw = waivedDrafts.value[customer.customer];
  if (receivedRaw === undefined && waivedRaw === undefined) return false;
  const received =
    receivedRaw === undefined ? customer.received : Number(receivedRaw);
  const waived = waivedRaw === undefined ? customer.waived : Number(waivedRaw);
  if (!Number.isFinite(received) || !Number.isFinite(waived)) return true;
  return (
    round2(received) !== round2(customer.received) ||
    round2(waived) !== round2(customer.waived)
  );
}

async function settleCustomer(customer: {
  customer: string;
  received: number;
  waived: number;
  netReceivable: number;
}) {
  if (saving.value) return;
  const receivedRaw = receivedDrafts.value[customer.customer];
  const waivedRaw = waivedDrafts.value[customer.customer];
  const received = Number(receivedRaw ?? customer.received);
  const waived = Number(waivedRaw ?? customer.waived);
  if (!Number.isFinite(received) || received < 0) {
    error.value = '已收金额不能为负数';
    return;
  }
  if (!Number.isFinite(waived) || waived < 0) {
    error.value = '甩零金额不能为负数';
    return;
  }
  if (received + waived > customer.netReceivable + 0.004) {
    error.value = `已收 + 甩零不能超过应收（${money(customer.netReceivable)}）`;
    return;
  }
  saving.value = true;
  error.value = '';
  try {
    const next = await api.settleReceipts(batchId.value, {
      date: new Date().toISOString().slice(0, 10),
      items: [
        {
          customerName: customer.customer,
          received: round2(received),
          waived: round2(waived),
        },
      ],
    });
    view.value = next;
    initAllocInputs();
    initSettlementDrafts();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '收款保存失败';
  } finally {
    saving.value = false;
  }
}

function initAllocInputs() {
  const inputs: Record<string, string> = {};
  for (const plan of view.value.plans) {
    for (const customer of customerNames.value) {
      const key = `${plan.plan_id}::${customer}`;
      const allocated = allocatedMap.value.get(key) ?? 0;
      inputs[key] = allocated > 0 ? String(allocated) : '';
    }
  }
  allocInputs.value = inputs;
}

async function load() {
  try {
    const [detail, shipments] = await Promise.all([
      api.getBatch(batchId.value),
      api.getShipments(batchId.value),
    ]);
    batch.value = detail.batch;
    view.value = shipments;
    initAllocInputs();
    initSettlementDrafts();
    allocationCollapsed.value = shipments.shipments.length > 0;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败';
  }
}

async function saveAllocation() {
  if (saving.value) return;
  const over = view.value.plans.some((plan) => rowRemaining(plan) < 0);
  if (over) {
    error.value = '存在「超分」口味，请调整分货数量后再保存';
    return;
  }
  const items: Array<{ planId: number; customerName: string; quantity: number }> = [];
  for (const plan of view.value.plans) {
    for (const customer of customerNames.value) {
      const value = Number(allocInputs.value[`${plan.plan_id}::${customer}`] ?? 0);
      items.push({
        planId: plan.plan_id,
        customerName: customer,
        quantity: Number.isFinite(value) ? value : 0,
      });
    }
  }
  saving.value = true;
  error.value = '';
  try {
    const next = await api.allocateShipments(batchId.value, {
      date: new Date().toISOString().slice(0, 10),
      items,
    });
    view.value = next;
    initAllocInputs();
    initSettlementDrafts();
    allocationCollapsed.value = next.shipments.length > 0;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存分货失败';
  } finally {
    saving.value = false;
  }
}

async function removeReceipt(receipt: Receipt) {
  if (!window.confirm(`确定删除这笔收款 ${money(receipt.amount)} 吗？`)) return;
  try {
    await api.deleteReceipt(batchId.value, receipt.id);
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '删除失败';
  }
}

async function removeShipment(shipment: ShipmentView) {
  if (!window.confirm(`确定删除客户「${shipment.customer_name}」的这笔出货及全部收款吗？`)) return;
  try {
    await api.deleteShipment(batchId.value, shipment.id);
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '删除失败';
  }
}

function goBack() {
  goBackOr(router, '/products');
}

onMounted(load);
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 0 16px 32px;
  background: linear-gradient(160deg, #eef3f8 0%, #e7eef6 55%, #eef3f8 100%);
}
.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}
.page-header h2 {
  flex: 1;
  margin: 0;
  font-size: 18px;
}
.hint {
  margin-top: 8px;
  color: #8a96a3;
  font-size: 12px;
  line-height: 1.5;
}
.empty {
  color: #9aa5b1;
  padding: 10px 0;
  font-size: 13px;
}
.empty.small {
  font-size: 12px;
}

/* 分货表（按用户图示样式：简洁黑框表格） */
.alloc-section {
  margin-top: 12px;
  background: #ffffff;
  border-radius: 12px;
  padding: 14px;
  box-shadow:
    0 1px 2px rgba(15, 35, 55, 0.04),
    0 14px 28px -20px rgba(15, 35, 55, 0.25);
}
.alloc-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.alloc-title {
  font-size: 16px;
  font-weight: 700;
  color: #1f2d3d;
}
.alloc-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.link-btn {
  min-height: 44px;
  padding: 0 14px;
  border: none;
  border-radius: 10px;
  background: #eef7f2;
  color: #1f6f6b;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.link-btn:active {
  background: #d9efe4;
}
.collapse-btn {
  min-height: 44px;
  padding: 0 14px;
  border: none;
  border-radius: 10px;
  background: #f3f6f9;
  color: #4a5a6a;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.collapse-btn:active {
  background: #e7edf3;
}
.alloc-collapsed {
  padding: 12px;
  border-radius: 10px;
  background: #f7f9fc;
  color: #6b7785;
  font-size: 13px;
  line-height: 1.5;
}
.alloc-actions :deep(.n-button) {
  min-height: 44px !important;
  padding: 0 16px !important;
  font-size: 14px !important;
}
.table-wrap {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
.alloc-matrix {
  width: 100%;
  border-collapse: collapse;
  background: #ffffff;
}
.alloc-matrix th,
.alloc-matrix td {
  border: 1px solid #333333;
  padding: 8px 3px;
  text-align: center;
  font-size: 13px;
  color: #1f2d3d;
  white-space: nowrap;
}
.alloc-matrix thead th {
  background: #f2f2f2;
  font-weight: 600;
  font-size: 12px;
  padding: 7px 3px;
}
.matrix-product-head {
  padding: 10px 8px !important;
  font-size: 18px !important;
  font-weight: 800 !important;
  letter-spacing: 1px;
  color: #1f2d3d !important;
}
.stock-cell,
.arrival-cell {
  min-width: 44px;
  font-size: 12px !important;
  font-weight: 600;
}
.stock-cell {
  color: #1f6f6b !important;
  background: #f7fbf9;
}
.alloc-matrix th.booked-th {
  background: #e6f7ec;
}
.customer-head-cell {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.remove-customer {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 50%;
  background: #fdecef;
  color: #d03050;
  font-size: 22px;
  line-height: 1;
  padding: 0;
  cursor: pointer;
}
.remove-customer:active {
  background: #f9dbe2;
}
.alloc-matrix td.num-cell {
  background: #e6f7ec;
}
.name-cell {
  font-weight: 600;
  text-align: left !important;
  min-width: 54px;
  font-size: 12px !important;
}
.num-cell {
  color: #2d3748;
  min-width: 28px;
  font-size: 12px !important;
}
.input-cell {
  padding: 2px !important;
}
.input-cell input {
  width: 40px;
  border: none;
  background: transparent;
  text-align: center;
  font-size: 13px;
  padding: 6px 0;
  color: #1f2d3d;
  outline: none;
  -webkit-appearance: none;
}
.input-cell input:focus {
  background: #f0f9f4;
  border-radius: 4px;
}
.remain-cell {
  font-weight: 700;
  min-width: 34px;
  font-size: 12px !important;
}
.remain-cell.over {
  color: #d03050;
}

/* 客户出货与应收 */
.copy-hint {
  margin-bottom: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #eef7f2;
  color: #1f6f6b;
  font-size: 13px;
  line-height: 1.4;
}
.copy-hint-error {
  background: #fdecef;
  color: #c0263f;
}
.customer-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.customer-item {
  padding: 10px;
  border: 1px solid #e8edf2;
  border-radius: 12px;
  background: #ffffff;
}
.customer-summary {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.customer-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.customer-title {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1 1 auto;
  min-width: 0;
  flex-wrap: wrap;
  cursor: pointer;
}
.customer-name {
  font-weight: 700;
  font-size: 15px;
  color: #1f2d3d;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.customer-stats {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 12px;
  font-size: 12px;
  color: #6b7785;
  white-space: nowrap;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  cursor: pointer;
}
.customer-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}
.copy-customer {
  min-height: 44px;
  padding: 0 12px;
  border: none;
  border-radius: 10px;
  background: #eef7f2;
  color: #1f6f6b;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.copy-customer:active {
  background: #d9efe4;
}
.copy-customer:disabled {
  background: #f2f4f7;
  color: #9aa5b1;
  cursor: not-allowed;
}
.expand-customer {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 10px;
  background: #f3f6f9;
  color: #4a5a6a;
  font-size: 18px;
  cursor: pointer;
}
.expand-customer:active {
  background: #e7edf3;
}
.customer-detail {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px dashed #e3e9ef;
}
.settle-box {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
  font-size: 13px;
  color: #4a5a6a;
}
.settle-label {
  font-weight: 600;
}
.settle-field {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.waived-input {
  width: 96px;
}
.received-input {
  width: 112px;
  min-height: 44px;
  border: 1px solid #d9e2ec;
  border-radius: 10px;
  padding: 0 10px;
  text-align: right;
  font-size: 14px;
  background: #ffffff;
  color: #1f2d3d;
  outline: none;
  -webkit-appearance: none;
}
.received-input:focus {
  border-color: #2f9e7a;
  box-shadow: 0 0 0 2px rgba(47, 158, 122, 0.12);
}
.settle-received {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-top: 8px;
  color: #4a5a6a;
  font-size: 13px;
}
.settle-received strong {
  color: #1f6f6b;
  font-size: 17px;
}
.settle-formula {
  color: #9aa5b1;
  font-size: 11px;
}
.settle-btn {
  min-height: 44px;
  padding: 0 14px;
  border: none;
  background: #2f9e7a;
  color: #ffffff;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
.settle-btn:disabled {
  background: #e2e9f0;
  color: #9aa5b1;
  cursor: not-allowed;
}

.summary-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 16px;
  font-weight: 600;
  font-size: 14px;
}

/* 客户明细 */
.shipment {
  padding: 12px 0;
  border-bottom: 1px solid #f2f4f7;
}
.shipment-date {
  font-size: 14px;
  font-weight: 700;
  color: #1f2d3d;
}
.line {
  color: #6b7785;
  font-size: 13px;
  margin-top: 4px;
}
.actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.actions :deep(.n-button) {
  min-height: 44px !important;
  padding: 0 14px !important;
  font-size: 13px !important;
}
.receipt-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 8px;
  padding: 10px;
  background: #f7f9fc;
  border-radius: 10px;
}
.span-2 {
  grid-column: 1 / -1;
}
.receipts {
  margin-top: 8px;
}
.receipts-title {
  margin-bottom: 4px;
  font-size: 12px;
  font-weight: 600;
  color: #8a96a3;
}
.receipt-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #6b7785;
  padding: 4px 0;
}
.receipt-row :deep(.n-button) {
  min-height: 44px !important;
  padding: 0 12px !important;
  font-size: 12px !important;
}
.warn {
  color: #d03050;
  font-weight: 700;
}
.settled {
  color: #18a058;
  font-weight: 700;
}
.modal-error {
  margin-top: 10px;
  color: #d03050;
  font-size: 12px;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}
:deep(.n-card) {
  margin-top: 12px;
  border-radius: 16px;
}
</style>
