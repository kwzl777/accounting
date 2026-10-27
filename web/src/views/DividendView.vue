<template>
  <div class="page">
    <div class="page-header">
      <n-button text aria-label="返回" @click="goBack">←</n-button>
      <h2>分红{{ batch ? '：' + batch.name : '' }}</h2>
      <n-tag
        v-if="view"
        size="small"
        :type="view.dividend.status === 'confirmed' ? 'success' : 'default'"
      >
        {{ view.dividend.status === 'confirmed' ? '已确认' : '草稿' }}
      </n-tag>
    </div>

    <BatchTabs :batch-id="batchId" active="dividend" />

    <n-alert v-if="error" type="error" :title="error" style="margin-bottom: 12px" />

    <n-card class="settings-card">
      <div class="basis-grid">
        <label class="basis-field">
          <span>数量</span>
          <n-input
            v-model:value="quantityInput"
            inputmode="decimal"
            placeholder="数量"
            :disabled="isConfirmed"
          />
        </label>
        <label class="basis-field">
          <span>利润（元）</span>
          <n-input
            v-model:value="profitInput"
            inputmode="decimal"
            placeholder="利润"
            :disabled="isConfirmed"
          />
        </label>
        <div class="basis-field total-field">
          <span>分红总额</span>
          <strong class="total-value">{{ money(dividendTotal) }}</strong>
        </div>
      </div>

      <template v-if="!isConfirmed">
        <div class="investor-toolbar">
          <n-button size="small" @click="addBlankRow">
            ＋ 添加空白框
          </n-button>
        </div>
        <div class="investor-table">
          <div class="investor-grid-head">
            <span>出资人名字</span>
            <span>出资额</span>
            <span>分红数目</span>
            <span></span>
          </div>
          <div class="public-investor-row">
            <span class="public-investor-name">公</span>
            <strong
              class="public-investor-amount"
              :class="{ negative: publicContribution < 0 }"
            >
              {{ money(publicContribution) }}
            </strong>
            <span class="share-value">{{ publicShareText() }}</span>
            <span></span>
          </div>
          <div
            v-for="(row, index) in drafts"
            :key="row.key"
            class="investor-edit-row"
          >
            <n-input
              v-model:value="row.investorName"
              placeholder="出资人名字"
            />
            <n-input
              v-model:value="row.amount"
              placeholder="出资额"
              inputmode="decimal"
            />
            <span class="share-value">{{ draftShareText(row) }}</span>
            <button
              class="remove-investor"
              type="button"
              aria-label="删除出资人"
              @click="removeDraft(index)"
            >
              ×
            </button>
          </div>
          <div v-if="drafts.length === 0" class="empty">
            暂无出资人，点「添加空白框」
          </div>
        </div>
        <n-button
          class="save-settings"
          type="primary"
          size="large"
          :loading="saving"
          @click="saveSettings"
        >
          计算
        </n-button>
      </template>

      <template v-else>
        <div v-if="view.allocations.length === 0" class="empty">暂无出资人</div>
        <div v-for="a in view.allocations" :key="a.id" class="confirmed-row">
          <div class="row-title">{{ a.investor_name }}</div>
          <div class="row-sub">
            出资 {{ money(a.contribution_amount) }} · 占比 {{ percent(a.ratio) }} · 应分
            {{ money(a.share_amount) }}
          </div>
        </div>
        <div class="hint">分红已确认，出资金额已锁定。</div>
      </template>
    </n-card>

    <n-card title="分红明细">
      <div v-if="records.length === 0" class="empty">暂无分红明细</div>
      <div v-for="record in records" :key="record.id" class="record-row">
        <div class="record-main">
          <div class="record-batch">
            {{ record.batch_code || batchCode }} · {{ record.batch_name }}
          </div>
          <div class="record-time">{{ formatDateTime(record.created_at) }}</div>
        </div>
        <strong class="record-amount">{{ money(record.amount) }}</strong>
        <button
          class="record-status"
          :class="record.status"
          type="button"
          @click="toggleRecordStatus(record)"
        >
          {{ record.status === 'paid' ? '已支付' : '未支付' }}
        </button>
        <n-button size="small" @click="removeRecord(record)">删除</n-button>
      </div>
    </n-card>

    <n-card title="兑付记录" v-if="isConfirmed && view">
      <div v-if="view.allocations.length === 0" class="empty">暂无出资人</div>
      <div v-for="a in view.allocations" :key="a.id" class="pay-block">
        <div class="row">
          <div class="row-main">
            <div class="row-title">{{ a.investor_name }}</div>
            <div class="row-sub">
              应分 {{ money(a.share_amount) }} · 已兑付 {{ money(a.paid_amount) }} · 未兑付
              {{ money(a.unpaid_amount) }}
            </div>
          </div>
          <n-button size="tiny" type="primary" @click="togglePayment(a.id)">兑付</n-button>
        </div>
        <div v-if="paymentFor === a.id" class="inline-form">
          <Field label="兑付日期" class="field">
            <n-input v-model:value="payDate" placeholder="如 2026-10-24" />
          </Field>
          <Field label="兑付金额（元）" class="field">
            <n-input v-model:value="payAmount" placeholder="兑付金额" />
          </Field>
          <Field label="备注" class="field">
            <n-input v-model:value="payRemark" placeholder="备注（可选）" />
          </Field>
          <n-button type="primary" size="small" :loading="saving" @click="addPayment(a)">
            确认兑付
          </n-button>
        </div>
        <div v-for="p in a.payments" :key="p.id" class="payment-row">
          <span>
            {{ p.date || '-' }} · {{ money(p.amount) }}
            <span v-if="p.remark">（{{ p.remark }}）</span>
          </span>
          <n-button size="tiny" @click="removePayment(p)">删除</n-button>
        </div>
      </div>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { goBackOr } from '../utils/navigation';
import { NCard, NButton, NInput, NTag, NAlert } from 'naive-ui';
import {
  api,
  type Batch,
  type DividendAllocation,
  type DividendPayment,
  type DividendRecord,
  type DividendView,
  type Plan,
  type ProductShipment,
} from '../api/client';
import BatchTabs from '../components/BatchTabs.vue';
import Field from '../components/Field.vue';
import { buildBatchCode } from '../utils/batchCode';

const route = useRoute();
const router = useRouter();
const batchId = computed(() => Number(route.params.id));
const batch = ref<Batch | null>(null);
const plans = ref<Plan[]>([]);
const shipment = ref<ProductShipment | null>(null);
const view = ref<DividendView>({
  dividend: {
    id: 0,
    batch_id: 0,
    quantity: 0,
    profit: 0,
    total_amount: 0,
    status: 'draft',
    confirmed_at: null,
  },
  allocations: [],
  summary: {
    total_amount: 0,
    allocated_amount: 0,
    unallocated_amount: 0,
    paid_amount: 0,
    unpaid_amount: 0,
  },
});
const saving = ref(false);
const error = ref('');

interface InvestorDraft {
  key: number;
  id: number | null;
  investorName: string;
  amount: string;
}

let draftKey = 0;
const drafts = ref<InvestorDraft[]>([]);
const quantityInput = ref('0');
const profitInput = ref('0');
const costBase = ref(0);
const publicAllocationId = ref<number | null>(null);
const records = ref<DividendRecord[]>([]);

const paymentFor = ref<number | null>(null);
const payDate = ref('');
const payAmount = ref('');
const payRemark = ref('');

const isConfirmed = computed(() => view.value.dividend.status === 'confirmed');

const dividendTotal = computed(() => {
  const quantity = Number(quantityInput.value);
  const profit = Number(profitInput.value);
  return Number.isFinite(quantity) && Number.isFinite(profit)
    ? round2(Math.max(quantity * profit * 0.3, 0))
    : 0;
});

function localDateString(): string {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

const batchCode = computed(() => {
  const productName =
    shipment.value?.product_name ||
    plans.value[0]?.product_name ||
    batch.value?.name.replace(/\s*\d{4}-\d{2}-\d{2}.*$/, '') ||
    '';
  const date = shipment.value?.ship_date || batch.value?.date || localDateString();
  const quantity =
    shipment.value?.total_quantity ??
    plans.value.reduce((sum, plan) => sum + Number(plan.quantity || 0), 0);
  return buildBatchCode(productName, date, quantity);
});

const otherContributionTotal = computed(() =>
  round2(
    drafts.value.reduce((sum, row) => {
      const amount = Number(row.amount);
      return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0);
    }, 0)
  )
);

const rawPublicContribution = computed(() =>
  round2(costBase.value - otherContributionTotal.value)
);

const publicContribution = computed(() => rawPublicContribution.value);

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function money(value: number | undefined): string {
  const v = Number(value) || 0;
  return v < 0 ? '-¥' + Math.abs(v).toFixed(2) : '¥' + v.toFixed(2);
}

function percent(ratio: number): string {
  return ((Number(ratio) || 0) * 100).toFixed(2) + '%';
}

function formatDateTime(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

function apply(next: DividendView) {
  view.value = next;
  const total = Number(next.dividend.total_amount) || 0;
  const storedProfit = Number(next.dividend.profit) || 0;
  const derivedProfit =
    storedProfit !== 0 || total <= 0 ? storedProfit : round2(total / 0.3);
  quantityInput.value = String(next.dividend.quantity ?? 0);
  profitInput.value = String(derivedProfit);
  syncDrafts();
}

function syncDrafts() {
  drafts.value = view.value.allocations
    .filter((allocation) => allocation.investor_name !== '公')
    .map((allocation) => ({
      key: ++draftKey,
      id: allocation.id,
      investorName: allocation.investor_name,
      amount: String(allocation.contribution_amount),
    }));
  const publicAllocation = view.value.allocations.find(
    (allocation) => allocation.investor_name === '公'
  );
  publicAllocationId.value = publicAllocation?.id ?? null;
}

function draftShare(row: InvestorDraft): number | null {
  if (row.id === null) return null;
  const allocation = view.value.allocations.find((item) => item.id === row.id);
  if (!allocation) return null;
  if (
    allocation.investor_name !== row.investorName.trim() ||
    round2(allocation.contribution_amount) !== round2(Number(row.amount) || 0)
  ) {
    return null;
  }
  return allocation.share_amount;
}

function publicShare(): number | null {
  const allocation = view.value.allocations.find(
    (item) => item.investor_name === '公'
  );
  if (!allocation) return null;
  if (round2(allocation.contribution_amount) !== round2(publicContribution.value)) {
    return null;
  }
  return allocation.share_amount;
}

function draftShareText(row: InvestorDraft): string {
  const value = draftShare(row);
  return value === null ? '—' : money(value);
}

function publicShareText(): string {
  const value = publicShare();
  return value === null ? '—' : money(value);
}

function addBlankRow() {
  drafts.value.push({
    key: ++draftKey,
    id: null,
    investorName: '',
    amount: '',
  });
}

function removeDraft(index: number) {
  drafts.value.splice(index, 1);
}

async function load() {
  try {
    const [detail, dividend, profit, recordRes, ships] = await Promise.all([
      api.getBatch(batchId.value),
      api.getDividend(batchId.value),
      api.getBatchProfit(batchId.value),
      api.getDividendRecords(batchId.value),
      api.getProductShipments(),
    ]);
    batch.value = detail.batch;
    plans.value = detail.plans;
    shipment.value =
      ships.shipments.find((item) => item.batch_id === batchId.value) ?? null;
    costBase.value = round2(profit.actual_cost + profit.expenses);
    records.value = recordRes.records;
    apply(dividend);
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败';
  }
}

async function saveSettings() {
  if (saving.value || isConfirmed.value) return;

  const quantity = Number(quantityInput.value);
  if (!Number.isFinite(quantity) || quantity < 0) {
    error.value = '数量不能为负数';
    return;
  }
  const profit = Number(profitInput.value);
  if (!Number.isFinite(profit)) {
    error.value = '请输入正确的利润';
    return;
  }

  const rows: Array<{ id: number | null; investorName: string; amount: number }> = [];
  for (const draft of drafts.value) {
    const name = draft.investorName.trim();
    const rawAmount = draft.amount.trim();
    if (!name && !rawAmount) continue;
    const amount = rawAmount === '' ? 0 : Number(rawAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      error.value = '出资金额不能为负数';
      return;
    }
    if (amount <= 0) continue;
    if (!name) {
      error.value = '请填写出资人姓名';
      return;
    }
    if (name === '公') {
      error.value = '「公」是固定出资人，不需要手动添加';
      return;
    }
    rows.push({ id: draft.id, investorName: name, amount: round2(amount) });
  }

  const otherTotal = round2(
    rows.reduce((sum, row) => sum + row.amount, 0)
  );
  const publicAmount = round2(costBase.value - otherTotal);
  rows.push({
    id: publicAllocationId.value,
    investorName: '公',
    amount: Math.max(publicAmount, 0),
  });

  const existingById = new Map(
    view.value.allocations.map((allocation) => [allocation.id, allocation])
  );
  const keptIds = new Set(
    rows
      .filter((row) => row.id !== null)
      .map((row) => row.id as number)
  );
  const deleted = view.value.allocations.filter(
    (allocation) => !keptIds.has(allocation.id)
  );
  const changed = rows.filter((row) => {
    if (row.id === null) return false;
    const existing = existingById.get(row.id);
    return (
      existing !== undefined &&
      (existing.investor_name !== row.investorName ||
        round2(existing.contribution_amount) !== row.amount)
    );
  });
  const added = rows.filter((row) => row.id === null);

  saving.value = true;
  error.value = '';
  try {
    await api.setDividendSettings(batchId.value, {
      quantity: round2(quantity),
      profit: round2(profit),
    });
    for (const allocation of deleted) {
      await api.deleteDividendAllocation(batchId.value, allocation.id);
    }
    for (const row of changed) {
      await api.updateDividendAllocation(batchId.value, row.id as number, {
        investorName: row.investorName,
        amount: row.amount,
      });
    }
    for (const row of added) {
      await api.addDividendAllocation(batchId.value, {
        investorName: row.investorName,
        amount: row.amount,
      });
    }
    apply(await api.getDividend(batchId.value));
    const recordRes = await api.createDividendRecord(
      batchId.value,
      batchCode.value
    );
    records.value = [recordRes.record, ...records.value];
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败';
    try {
      apply(await api.getDividend(batchId.value));
    } catch {
      // 保留原始错误
    }
  } finally {
    saving.value = false;
  }
}

async function onConfirm() {
  if (!window.confirm('确认分红后出资与应分金额将锁定，是否继续？')) return;
  saving.value = true;
  error.value = '';
  try {
    apply(await api.confirmDividend(batchId.value));
  } catch (e) {
    error.value = e instanceof Error ? e.message : '确认失败';
  } finally {
    saving.value = false;
  }
}

function togglePayment(allocationId: number) {
  if (paymentFor.value === allocationId) {
    paymentFor.value = null;
    return;
  }
  paymentFor.value = allocationId;
  payDate.value = '';
  payAmount.value = '';
  payRemark.value = '';
}

async function addPayment(allocation: DividendAllocation) {
  if (saving.value) return;
  saving.value = true;
  error.value = '';
  try {
    apply(
      await api.addDividendPayment(batchId.value, allocation.id, {
        date: payDate.value || undefined,
        amount: Number(payAmount.value),
        remark: payRemark.value || undefined,
      })
    );
    paymentFor.value = null;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '兑付失败';
  } finally {
    saving.value = false;
  }
}

async function removePayment(payment: DividendPayment) {
  if (!window.confirm(`确定删除这笔兑付 ${money(payment.amount)} 吗？`)) return;
  try {
    await api.deleteDividendPayment(batchId.value, payment.id);
    apply(await api.getDividend(batchId.value));
  } catch (e) {
    error.value = e instanceof Error ? e.message : '删除失败';
  }
}

async function toggleRecordStatus(record: DividendRecord) {
  try {
    const nextStatus = record.status === 'paid' ? 'unpaid' : 'paid';
    const res = await api.updateDividendRecord(batchId.value, record.id, nextStatus);
    records.value = records.value.map((item) =>
      item.id === record.id ? res.record : item
    );
  } catch (e) {
    error.value = e instanceof Error ? e.message : '状态更新失败';
  }
}

async function removeRecord(record: DividendRecord) {
  if (!window.confirm(`确定删除这条分红明细 ${money(record.amount)} 吗？`)) return;
  try {
    await api.deleteDividendRecord(batchId.value, record.id);
    records.value = records.value.filter((item) => item.id !== record.id);
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
  padding: 16px;
}
.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.page-header h2 {
  flex: 1;
  margin: 0;
  font-size: 18px;
}
.settings-card :deep(.n-input) {
  min-height: 44px;
}
.settings-card :deep(.n-button) {
  min-height: 44px;
}
.basis-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.basis-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  color: #1f2d3d;
  font-size: 14px;
  font-weight: 600;
}
.total-value {
  display: flex;
  align-items: center;
  min-height: 44px;
  padding: 0 9px;
  overflow: hidden;
  border-radius: 10px;
  background: #f7f9fc;
  color: #18a058;
  font-size: 16px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.investor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 16px;
}
.investor-title {
  color: #1f2d3d;
  font-size: 14px;
  font-weight: 600;
}
.investor-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
.investor-table {
  margin-top: 8px;
  border: 1px solid #e8edf2;
  border-radius: 12px;
  overflow: hidden;
  background: #ffffff;
}
.investor-grid-head {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1fr) 44px;
  gap: 8px;
  align-items: center;
  padding: 10px 12px;
  background: #f7f9fc;
  border-bottom: 1px solid #eef2f6;
  color: #8a96a3;
  font-size: 11px;
}
.investor-grid-head span:nth-child(2),
.investor-grid-head span:nth-child(3) {
  text-align: right;
}
.public-investor-row {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1fr) 44px;
  gap: 8px;
  align-items: center;
  min-height: 48px;
  padding: 8px 12px;
  background: #eef7f2;
}
.public-investor-name {
  color: #1f6f6b;
  font-size: 15px;
  font-weight: 700;
}
.public-investor-amount {
  color: #1f2d3d;
  font-size: 15px;
  font-weight: 700;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.public-investor-amount.negative {
  color: #d03050;
}
.share-value {
  color: #1f6f6b;
  font-size: 13px;
  font-weight: 600;
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-variant-numeric: tabular-nums;
}
.investor-edit-row {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1fr) 44px;
  gap: 8px;
  align-items: center;
  padding: 8px 12px;
  border-top: 1px solid #f2f4f7;
}
.investor-edit-row .n-input:nth-child(2) :deep(input) {
  text-align: right;
}
.investor-table .empty {
  padding: 12px;
}
.remove-investor {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 10px;
  background: #fdecef;
  color: #d03050;
  font-size: 22px;
  line-height: 1;
  padding: 0;
  cursor: pointer;
}
.remove-investor:active {
  background: #f9dbe2;
}
.save-settings {
  width: 100%;
  min-height: 48px;
  margin-top: 12px;
}
.confirmed-row {
  padding: 10px 0;
  border-bottom: 1px solid #f0f0f0;
}
.confirmed-row:last-of-type {
  border-bottom: none;
}
.record-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px 0;
  border-bottom: 1px solid #f2f4f7;
}
.record-row:last-child {
  border-bottom: none;
}
.record-main {
  flex: 1 1 190px;
  min-width: 0;
}
.record-batch {
  color: #1f2d3d;
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.record-time {
  margin-top: 2px;
  color: #8a96a3;
  font-size: 11px;
}
.record-amount {
  color: #1f2d3d;
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
}
.record-status {
  min-height: 44px;
  padding: 0 12px;
  border: none;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
}
.record-status.paid {
  color: #18a058;
  background: #e8f8ef;
}
.record-status.unpaid {
  color: #d03050;
  background: #fdecef;
}
.record-row :deep(.n-button) {
  min-height: 44px !important;
  padding: 0 12px !important;
  font-size: 12px !important;
}
.form {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.field {
  min-width: 140px;
  flex: 1 1 140px;
}
.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 10px 0;
  border-bottom: 1px solid #f0f0f0;
}
.row-main {
  flex: 1;
}
.row-title {
  font-weight: 600;
}
.row-sub {
  color: #666;
  font-size: 13px;
  margin-top: 4px;
}
.row-actions {
  display: flex;
  gap: 8px;
}
.grouped {
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px dashed #ddd;
}
.group-title {
  font-weight: 600;
  margin-bottom: 6px;
}
.group-row {
  font-size: 13px;
  color: #555;
  padding: 3px 0;
}
.summary-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  font-weight: 600;
}
.actions {
  margin-top: 12px;
}
.hint {
  margin-top: 8px;
  color: #888;
  font-size: 13px;
}
.empty {
  color: #999;
  padding: 8px 0;
}
.inline-form {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
  padding: 8px;
  background: #f7f8fa;
  border-radius: 6px;
}
.payment-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #666;
  padding: 4px 0;
}
.pay-block {
  padding-bottom: 6px;
}
.warn {
  color: #d03050;
  font-weight: 600;
}
</style>
