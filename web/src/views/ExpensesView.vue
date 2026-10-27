<template>
  <div class="page">
    <div class="page-header">
      <n-button text aria-label="返回" @click="goBack">←</n-button>
      <h2>费用{{ batch ? '：' + batch.name : '' }}</h2>
      <n-tag v-if="batch" size="small">{{ batch.status }}</n-tag>
    </div>

    <BatchTabs :batch-id="batchId" active="expenses" />

    <n-alert v-if="error" type="error" :title="error" style="margin-bottom: 12px" />

    <n-card title="经营费用">
      <div class="expense-sheet">
        <div class="expense-item code-item">
          <div class="code-body">
            <div class="item-label">编号</div>
            <div class="item-code">{{ expenseCode }}</div>
          </div>
        </div>

        <div
          v-for="item in fixedItems"
          :key="item.key"
          class="expense-item"
        >
          <span class="item-label">{{ item.label }}</span>
          <label class="item-amount">
            <span>¥</span>
            <input
              v-model="amounts[item.key]"
              inputmode="decimal"
              placeholder="金额"
              :readonly="!editing"
            />
          </label>
        </div>

        <div class="expense-item custom-item">
          <input
            v-model="customCategory"
            class="custom-name"
            placeholder="备选（手动输入）"
            :readonly="!editing"
          />
          <label class="item-amount custom-amount">
            <span>¥</span>
            <input
              v-model="customAmount"
              inputmode="decimal"
              placeholder="金额"
              :readonly="!editing"
            />
          </label>
        </div>
      </div>

      <div class="sheet-total">
        <span>本次费用合计</span>
        <strong>{{ money(formTotal) }}</strong>
      </div>
      <n-button
        v-if="!editing"
        class="save-btn"
        size="large"
        @click="startEdit"
      >
        编辑
      </n-button>
      <n-button
        v-else
        class="save-btn"
        type="primary"
        size="large"
        :loading="saving"
        @click="saveExpenses"
      >
        保存费用
      </n-button>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { NCard, NButton, NTag, NAlert } from 'naive-ui';
import {
  api,
  type Batch,
  type Expense,
  type ExpenseView,
  type Plan,
  type ProductShipment,
} from '../api/client';
import BatchTabs from '../components/BatchTabs.vue';
import { goBackOr } from '../utils/navigation';
import { buildBatchCode } from '../utils/batchCode';

const route = useRoute();
const router = useRouter();
const batchId = computed(() => Number(route.params.id));
const batch = ref<Batch | null>(null);
const plans = ref<Plan[]>([]);
const shipment = ref<ProductShipment | null>(null);
const expenseView = ref<ExpenseView>({
  expenses: [],
  summary: { total: 0, by_category: [] },
});
const saving = ref(false);
const error = ref('');
const editing = ref(true);
const originalCustomCategory = ref('');

const fixedItems = [
  { key: 'freight', label: '运费' },
  { key: 'fuel', label: '油费' },
  { key: 'toll', label: '高速费' },
  { key: 'meal', label: '餐饮' },
  { key: 'lodging', label: '住宿' },
  { key: 'gift', label: '礼品' },
] as const;

const amounts = ref<Record<string, string>>({
  freight: '',
  fuel: '',
  toll: '',
  meal: '',
  lodging: '',
  gift: '',
});
const customCategory = ref('');
const customAmount = ref('');

function localDateString(): string {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

const expenseCode = computed(() => {
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

const expenseDate = computed(
  () => shipment.value?.ship_date || batch.value?.date || localDateString()
);

function amountOf(value: string): number {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? round2(amount) : 0;
}

const formTotal = computed(() => {
  let total = amountOf(customAmount.value);
  for (const item of fixedItems) {
    total += amountOf(amounts.value[item.key] ?? '');
  }
  return round2(total);
});

function money(value: number): string {
  const v = Number(value) || 0;
  return v < 0 ? '-¥' + Math.abs(v).toFixed(2) : '¥' + v.toFixed(2);
}

function applyExpenseRows(rows: Expense[]) {
  const next: Record<string, string> = {
    freight: '',
    fuel: '',
    toll: '',
    meal: '',
    lodging: '',
    gift: '',
  };
  const fixedByLabel = new Map<string, string>(
    fixedItems.map((item) => [item.label, item.key])
  );
  const customRows: Expense[] = [];

  for (const row of rows) {
    const key = fixedByLabel.get(row.category);
    if (key) {
      next[key] = String(
        round2(Number(next[key] || 0) + Number(row.amount || 0))
      );
    } else {
      customRows.push(row);
    }
  }

  amounts.value = next;

  if (customRows.length > 0) {
    const category = customRows[customRows.length - 1].category;
    const total = customRows
      .filter((row) => row.category === category)
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);
    customCategory.value = category === '备选' ? '' : category;
    customAmount.value = String(round2(total));
    originalCustomCategory.value = category;
  } else {
    customCategory.value = '';
    customAmount.value = '';
    originalCustomCategory.value = '';
  }

  editing.value = rows.length === 0;
}

async function load() {
  try {
    const [detail, expenses, ships] = await Promise.all([
      api.getBatch(batchId.value),
      api.getExpenses(batchId.value),
      api.getProductShipments(),
    ]);
    batch.value = detail.batch;
    plans.value = detail.plans;
    shipment.value =
      ships.shipments.find((item) => item.batch_id === batchId.value) ?? null;
    expenseView.value = expenses;
    applyExpenseRows(expenses.expenses);
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败';
  }
}

function startEdit() {
  editing.value = true;
}

async function saveExpenses() {
  if (saving.value) return;

  const desired = new Map<string, number>();
  for (const item of fixedItems) {
    const raw = Number(amounts.value[item.key] ?? 0);
    if (!Number.isFinite(raw) || raw < 0) {
      error.value = '费用金额不能为负数';
      return;
    }
    desired.set(item.label, round2(raw));
  }

  const customRaw = Number(customAmount.value || 0);
  if (!Number.isFinite(customRaw) || customRaw < 0) {
    error.value = '费用金额不能为负数';
    return;
  }
  const customNameInput = customCategory.value.trim();
  if (
    customNameInput &&
    fixedItems.some((item) => item.label === customNameInput)
  ) {
    error.value = '备选名称不能和固定费用项目重复';
    return;
  }
  const customName = customNameInput || '备选';
  desired.set(customName, round2(customRaw));
  if (
    originalCustomCategory.value &&
    originalCustomCategory.value !== customName
  ) {
    desired.set(originalCustomCategory.value, 0);
  }

  const hasAmount = [...desired.values()].some((amount) => amount > 0);
  if (!hasAmount && expenseView.value.expenses.length === 0) {
    error.value = '请至少填写一项费用金额';
    return;
  }

  const existing = new Map<string, Expense[]>();
  for (const row of expenseView.value.expenses) {
    const list = existing.get(row.category) ?? [];
    list.push(row);
    existing.set(row.category, list);
  }

  saving.value = true;
  error.value = '';
  const description = `编号 ${expenseCode.value}`;
  try {
    for (const [category, amount] of desired) {
      const rows = existing.get(category) ?? [];
      if (amount > 0) {
        if (rows.length > 0) {
          await api.updateExpense(batchId.value, rows[0].id, {
            date: expenseDate.value,
            category,
            amount,
            description,
          });
          for (const extra of rows.slice(1)) {
            await api.deleteExpense(batchId.value, extra.id);
          }
        } else {
          await api.createExpense(batchId.value, {
            date: expenseDate.value,
            category,
            amount,
            description,
          });
        }
      } else {
        for (const row of rows) {
          await api.deleteExpense(batchId.value, row.id);
        }
      }
    }

    expenseView.value = await api.getExpenses(batchId.value);
    applyExpenseRows(expenseView.value.expenses);
    error.value = '';
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败';
  } finally {
    saving.value = false;
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
.expense-sheet {
  border-radius: 12px;
  background: #ffffff;
}
.expense-item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 58px;
  padding: 8px 0;
  border-bottom: 1px solid #f2f4f7;
}
.expense-item:last-child {
  border-bottom: none;
}
.item-label {
  flex: 1;
  min-width: 0;
  color: #1f2d3d;
  font-size: 15px;
  font-weight: 600;
}
.code-item {
  align-items: flex-start;
  padding-top: 10px;
  padding-bottom: 12px;
}
.code-body {
  flex: 1;
  min-width: 0;
}
.item-code {
  margin-top: 5px;
  color: #1f6f6b;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.3px;
  word-break: break-all;
}
.item-amount {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 2px;
  color: #6b7785;
  font-size: 14px;
}
.item-amount input {
  width: 112px;
  min-height: 44px;
  padding: 0 10px;
  border: 1px solid #d9e2ec;
  border-radius: 10px;
  background: #ffffff;
  color: #1f2d3d;
  font-size: 15px;
  text-align: right;
  outline: none;
  -webkit-appearance: none;
}
.item-amount input:focus {
  border-color: #2f9e7a;
  box-shadow: 0 0 0 2px rgba(47, 158, 122, 0.12);
}
.item-amount input[readonly],
.custom-name[readonly] {
  background: #f7f9fc;
  border-color: #e8edf2;
  cursor: default;
}
.custom-item {
  align-items: center;
}
.custom-name {
  flex: 1;
  min-width: 0;
  min-height: 44px;
  padding: 0 10px;
  border: 1px solid #d9e2ec;
  border-radius: 10px;
  background: #ffffff;
  color: #1f2d3d;
  font-size: 14px;
  outline: none;
  -webkit-appearance: none;
}
.custom-name:focus {
  border-color: #2f9e7a;
  box-shadow: 0 0 0 2px rgba(47, 158, 122, 0.12);
}
.custom-amount input {
  width: 104px;
}
.sheet-total {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-top: 14px;
  color: #6b7785;
  font-size: 14px;
}
.sheet-total strong {
  color: #1f6f6b;
  font-size: 21px;
  font-weight: 800;
}
.save-btn {
  width: 100%;
  min-height: 48px;
  margin-top: 12px;
}
</style>
