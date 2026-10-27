<template>
  <div class="page">
    <div class="page-header">
      <n-button text aria-label="返回" @click="goBack">←</n-button>
      <h2>利润明细</h2>
    </div>

    <n-alert v-if="error" type="error" :title="error" style="margin-bottom: 12px" />

    <div class="summary-card" v-if="detail">
      <div class="period">{{ periodText }}</div>
      <div class="profit-value" :class="detail.totals.profit >= 0 ? 'income' : 'expense'">
        {{ money(detail.totals.profit) }}
      </div>
    </div>

    <div v-if="detail" class="batch-list">
      <div v-if="entries.length === 0" class="empty">暂无收支明细</div>
      <button
        v-for="entry in entries"
        :key="entry.key"
        class="batch-row"
        :class="{ 'expense-entry': entry.type === 'expense' }"
        type="button"
        @click="handleEntry(entry)"
      >
        <div class="entry-date">{{ entry.date || '-' }}</div>
        <div class="batch-main">
          <div class="batch-code">{{ entry.type === 'income' ? entry.code : entry.reason }}</div>
        </div>
        <div class="batch-income">
          <small>
            {{
              entry.type === 'income'
                ? '收入'
                : (entry.amount ?? 0) < 0
                  ? '冲正'
                  : '支出'
            }}
          </small>
          <strong :class="entryAmountClass(entry)">
            {{ entryAmountText(entry) }}
          </strong>
        </div>
        <span v-if="entry.type === 'income'" class="chevron">›</span>
        <span v-else class="chevron-placeholder"></span>
      </button>
    </div>

    <div v-if="loading" class="empty-card">加载中...</div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { NAlert, NButton } from 'naive-ui';
import { api, type ProfitDetail, type ProfitDetailBatch } from '../api/client';
import { goBackOr } from '../utils/navigation';
import { buildBatchCode } from '../utils/batchCode';

const router = useRouter();
const detail = ref<ProfitDetail | null>(null);
const loading = ref(false);
const error = ref('');

interface DetailEntry {
  key: string;
  date: string | null;
  type: 'income' | 'expense';
  code?: string;
  reason?: string;
  amount: number;
  batchId?: number;
}

const entries = computed<DetailEntry[]>(() => {
  if (!detail.value) return [];
  const incomeEntries: DetailEntry[] = detail.value.batches.map((row) => ({
    key: `income-${row.id}`,
    date: row.date || row.ship_date || null,
    type: 'income',
    code: batchCode(row),
    amount: row.income,
    batchId: row.id,
  }));
  const expenseEntries: DetailEntry[] = detail.value.generalExpenses.map((row) => ({
    key: `expense-${row.id}`,
    date: row.date,
    type: 'expense',
    reason: row.reason,
    amount: row.amount,
  }));
  return [...incomeEntries, ...expenseEntries].sort((a, b) => {
    const dateA = a.date || '';
    const dateB = b.date || '';
    if (dateA !== dateB) return dateA < dateB ? 1 : -1;
    if (a.type !== b.type) return a.type === 'income' ? -1 : 1;
    return a.key.localeCompare(b.key);
  });
});

const periodText = computed(() => {
  const period = detail.value?.period;
  if (!period?.from && !period?.to) return '全部时间';
  if (period?.from && period?.to && period.from !== period.to) {
    return `${period.from} 至 ${period.to}`;
  }
  return period?.from || period?.to || '全部时间';
});

function money(value: number | null | undefined): string {
  const amount = Number(value) || 0;
  return amount < 0 ? '-¥' + Math.abs(amount).toFixed(2) : '¥' + amount.toFixed(2);
}

function batchCode(row: ProfitDetailBatch): string {
  return buildBatchCode(row.product_name, row.ship_date, row.quantity);
}

function goBatch(id: number) {
  router.push(`/batches/${id}/profit`);
}

function handleEntry(entry: DetailEntry) {
  if (entry.type === 'income' && entry.batchId) {
    goBatch(entry.batchId);
  }
}

function entryAmountClass(entry: DetailEntry): string {
  if (entry.type === 'income' || entry.amount < 0) return 'income';
  return 'expense';
}

function entryAmountText(entry: DetailEntry): string {
  if (entry.type === 'income') return `+${money(entry.amount)}`;
  if (entry.amount < 0) return `+${money(Math.abs(entry.amount))}`;
  return `-${money(entry.amount)}`;
}

function goBack() {
  goBackOr(router, '/');
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    detail.value = await api.getProfitDetail();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 16px;
  padding-bottom: 32px;
  background: linear-gradient(160deg, #eef3f8 0%, #e7eef6 55%, #eef3f8 100%);
}
.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.page-header h2 {
  flex: 1;
  margin: 0;
  font-size: 19px;
}
.summary-card {
  padding: 16px;
  border-radius: 14px;
  background: linear-gradient(135deg, #163a4a 0%, #1f6f6b 55%, #2f9e7a 100%);
  color: #ffffff;
  box-shadow: 0 14px 28px -18px rgba(16, 58, 74, 0.7);
}
.period {
  color: rgba(255, 255, 255, 0.82);
  font-size: 12px;
}
.profit-value {
  margin-top: 8px;
  font-size: 30px;
  font-weight: 800;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.profit-value.income {
  color: #a8f0c6;
}
.profit-value.expense {
  color: #ffd6d6;
}
.batch-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}
.batch-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 56px;
  padding: 10px 14px;
  border: none;
  border-radius: 14px;
  background: #ffffff;
  text-align: left;
  font-family: inherit;
  cursor: pointer;
  box-shadow:
    0 1px 2px rgba(15, 35, 55, 0.04),
    0 14px 28px -22px rgba(15, 35, 55, 0.3);
}
.batch-row:active {
  background: #f7fbf9;
}
.expense-entry {
  cursor: default;
}
.expense-entry:active {
  background: #ffffff;
}
.entry-date {
  flex: 0 0 74px;
  color: #8a96a3;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.batch-main {
  flex: 1;
  min-width: 0;
}
.batch-code {
  color: #1f6f6b;
  font-size: 14px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.batch-income {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  flex: 0 0 auto;
}
.batch-income small {
  color: #8a96a3;
  font-size: 10px;
}
.income {
  color: #18a058;
}
.expense {
  color: #d03050;
}
.batch-income .income,
.batch-income .expense {
  font-size: 16px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.chevron {
  color: #8a96a3;
  font-size: 20px;
  line-height: 1;
}
.chevron-placeholder {
  width: 10px;
  flex: 0 0 10px;
}
.empty {
  padding: 16px;
  border-radius: 14px;
  background: #ffffff;
  color: #9aa5b1;
  font-size: 13px;
  text-align: center;
}
.empty-card {
  margin-top: 12px;
  padding: 18px;
  border-radius: 14px;
  background: #ffffff;
  color: #9aa5b1;
  font-size: 13px;
  text-align: center;
}
</style>
