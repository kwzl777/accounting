<template>
  <div class="page">
    <div class="page-header">
      <n-button text aria-label="返回" @click="goBack">←</n-button>
      <h2>毛利润{{ batch ? '：' + batch.name : '' }}</h2>
      <n-tag v-if="batch" size="small">{{ batch.status }}</n-tag>
    </div>

    <BatchTabs :batch-id="batchId" active="profit" />

    <n-alert v-if="error" type="error" :title="error" style="margin-bottom: 12px" />

    <n-card title="毛利" v-if="profitView">
      <div class="bill-row">
        <div class="bill-label">
          <span>实收总额</span>
        </div>
        <strong class="bill-amount income">+{{ money(revenue) }}</strong>
      </div>

      <div class="bill-row">
        <div class="bill-label">
          <span>拿货成本</span>
        </div>
        <strong class="bill-amount expense">-{{ money(profitView.actual_cost) }}</strong>
      </div>
      <div class="bill-row">
        <div class="bill-label">
          <span>费用</span>
        </div>
        <strong class="bill-amount expense">-{{ money(profitView.expenses) }}</strong>
      </div>

      <div class="bill-total">
        <span>毛利润</span>
        <strong
          class="bill-amount"
          :class="profitView.profit >= 0 ? 'income' : 'expense'"
        >
          {{ money(profitView.profit) }}
        </strong>
      </div>
    </n-card>

    <n-card>
      <div class="bill-row">
        <div class="bill-label">
          <span>分红金额（元）</span>
        </div>
        <input
          v-model="dividendInput"
          class="dividend-input"
          inputmode="decimal"
          placeholder="分红金额"
          :readonly="!editingDividend"
        />
      </div>
      <n-button
        v-if="!editingDividend"
        class="dividend-action"
        @click="startDividendEdit"
      >
        编辑
      </n-button>
      <n-button
        v-else
        class="dividend-action"
        type="primary"
        :loading="savingDividend"
        @click="saveManualDividend"
      >
        保存
      </n-button>
    </n-card>

    <n-card title="净利润">
      <div class="net-profit">
        <strong
          class="net-amount"
          :class="netProfit >= 0 ? 'income' : 'expense'"
        >
          {{ money(netProfit) }}
        </strong>
      </div>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { goBackOr } from '../utils/navigation';
import { NCard, NButton, NTag, NAlert } from 'naive-ui';
import { api, type Batch, type BatchProfit } from '../api/client';
import BatchTabs from '../components/BatchTabs.vue';

const route = useRoute();
const router = useRouter();
const batchId = computed(() => Number(route.params.id));
const batch = ref<Batch | null>(null);
const profitView = ref<BatchProfit | null>(null);
const dividendInput = ref('0');
const editingDividend = ref(false);
const savingDividend = ref(false);
const error = ref('');

const revenue = computed(() => {
  if (!profitView.value) return 0;
  return profitView.value.settled_amount;
});

const manualDividend = computed(() => {
  const value = Number(dividendInput.value);
  return Number.isFinite(value) && value >= 0
    ? Math.round(value * 100) / 100
    : 0;
});

const netProfit = computed(() => {
  if (!profitView.value) return 0;
  return Math.round((profitView.value.profit - manualDividend.value) * 100) / 100;
});

function money(value: number | undefined): string {
  const v = Number(value) || 0;
  return v < 0 ? '-¥' + Math.abs(v).toFixed(2) : '¥' + v.toFixed(2);
}

async function load() {
  try {
    const [detail, profit] = await Promise.all([
      api.getBatch(batchId.value),
      api.getBatchProfit(batchId.value),
    ]);
    batch.value = detail.batch;
    profitView.value = profit;
    dividendInput.value = String(profit.manual_dividend);
    editingDividend.value = false;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败';
  }
}

function startDividendEdit() {
  editingDividend.value = true;
}

async function saveManualDividend() {
  if (!profitView.value || savingDividend.value) return;
  const value = Number(dividendInput.value);
  if (!Number.isFinite(value) || value < 0) {
    error.value = '分红金额不能为负数';
    dividendInput.value = String(profitView.value.manual_dividend);
    return;
  }
  const rounded = Math.round(value * 100) / 100;
  if (rounded === profitView.value.manual_dividend) {
    dividendInput.value = String(rounded);
    editingDividend.value = false;
    return;
  }
  savingDividend.value = true;
  error.value = '';
  try {
    const res = await api.updateProfitDividend(batchId.value, rounded);
    profitView.value = {
      ...profitView.value,
      manual_dividend: res.manual_dividend,
    };
    dividendInput.value = String(res.manual_dividend);
    editingDividend.value = false;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '分红金额保存失败';
  } finally {
    savingDividend.value = false;
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
  padding-bottom: 32px;
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
.bill-section-label {
  margin-top: 12px;
  color: #8a96a3;
  font-size: 12px;
  font-weight: 600;
}
.bill-section-label:first-child {
  margin-top: 0;
}
.bill-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 13px 0;
  border-bottom: 1px dashed #e8edf2;
}
.bill-label {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.bill-label span {
  color: #1f2d3d;
  font-size: 15px;
  font-weight: 600;
}
.bill-label small {
  color: #8a96a3;
  font-size: 12px;
}
.bill-amount {
  flex: 0 0 auto;
  font-size: 17px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.income {
  color: #18a058;
}
.expense {
  color: #d03050;
}
.bill-total {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 0 8px;
  border-top: 2px solid #1f2d3d;
  margin-top: 4px;
  font-size: 17px;
  font-weight: 700;
}
.bill-total .bill-amount {
  font-size: 24px;
}
.bill-note {
  margin-top: 6px;
  color: #8a96a3;
  font-size: 12px;
  line-height: 1.5;
}
.dividend-input {
  width: 150px;
  min-height: 44px;
  padding: 0 10px;
  border: 1px solid #d9e2ec;
  border-radius: 10px;
  background: #ffffff;
  color: #d03050;
  font-size: 17px;
  font-weight: 800;
  text-align: right;
  outline: none;
  -webkit-appearance: none;
}
.dividend-input:focus {
  border-color: #2f9e7a;
  box-shadow: 0 0 0 2px rgba(47, 158, 122, 0.12);
}
.dividend-input[readonly] {
  background: #f7f9fc;
  border-color: #e8edf2;
  cursor: default;
}
.dividend-action {
  width: 100%;
  min-height: 44px;
  margin-top: 10px;
}
.net-profit {
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  gap: 16px;
}
.net-formula {
  color: #1f2d3d;
  font-size: 15px;
  font-weight: 600;
}
.net-detail {
  margin-top: 4px;
  color: #8a96a3;
  font-size: 12px;
}
.net-amount {
  flex: 0 0 auto;
  font-size: 26px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>
