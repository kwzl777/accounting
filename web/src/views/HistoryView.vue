<template>
  <div class="page">
    <div class="page-header">
      <n-button text aria-label="返回" @click="goHome">←</n-button>
      <h2>历史查询</h2>
    </div>

    <n-card title="筛选">
      <div class="form">
        <Field label="批次名称" class="field">
          <n-input v-model:value="name" placeholder="批次名称关键词" />
        </Field>
        <Field label="批次状态" class="field">
          <n-select v-model:value="status" :options="statusOptions" clearable placeholder="全部" />
        </Field>
        <Field label="开始日期" class="field">
          <n-input v-model:value="dateFrom" placeholder="YYYY-MM-DD" />
        </Field>
        <Field label="结束日期" class="field">
          <n-input v-model:value="dateTo" placeholder="YYYY-MM-DD" />
        </Field>
        <Field label="客户" class="field">
          <n-input v-model:value="customer" placeholder="客户名字关键词" />
        </Field>
        <Field label="产品" class="field">
          <n-input v-model:value="product" placeholder="产品名关键词" />
        </Field>
        <Field label="口味" class="field">
          <n-input v-model:value="flavor" placeholder="口味关键词" />
        </Field>
        <Field label="欠款状态" class="field">
          <n-select v-model:value="debtStatus" :options="debtOptions" clearable placeholder="全部" />
        </Field>
        <n-button type="primary" :loading="loading" @click="search">查询</n-button>
        <n-button :disabled="loading" @click="reset">重置</n-button>
      </div>
    </n-card>

    <n-card :title="`批次（${result.batches.length}）`">
      <div v-if="result.batches.length === 0" class="empty">无匹配批次</div>
      <div
        v-for="b in result.batches"
        :key="b.id"
        class="row clickable"
        @click="goBatch(b.id)"
      >
        <span>{{ b.name }}</span>
        <span class="meta">{{ b.date || '-' }} · {{ b.status }}</span>
      </div>
    </n-card>

    <n-card :title="`出货（${result.shipments.length}）`">
      <div v-if="result.shipments.length === 0" class="empty">无匹配出货记录</div>
      <div v-for="s in result.shipments" :key="s.id" class="shipment">
        <div class="row">
          <span>{{ s.batch_name }} · {{ s.customer_name }}</span>
          <n-tag size="small">{{ s.status }}</n-tag>
        </div>
        <div class="meta">
          {{ s.date || '-' }}
          <span v-if="s.product_name">
            · {{ s.product_name }}<span v-if="s.flavor"> / {{ s.flavor }}</span>
          </span>
        </div>
        <div class="meta">
          销售 {{ money(s.sales_amount) }} · 已收 {{ money(s.received_amount) }} · 欠款
          <span :class="{ warn: s.remaining_amount > 0 }">{{ money(s.remaining_amount) }}</span>
        </div>
      </div>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { NCard, NButton, NInput, NSelect, NTag } from 'naive-ui';
import { api, type HistoryResult } from '../api/client';
import Field from '../components/Field.vue';

const router = useRouter();
const name = ref('');
const status = ref<string | null>(null);
const dateFrom = ref('');
const dateTo = ref('');
const customer = ref('');
const product = ref('');
const flavor = ref('');
const debtStatus = ref<string | null>(null);
const loading = ref(false);
const result = ref<HistoryResult>({ batches: [], shipments: [] });

const statusOptions = [
  '预定中',
  '待到货',
  '部分到货',
  '到货完成',
  '经营中',
  '已结算',
  '已归档',
].map((value) => ({ label: value, value }));

const debtOptions = ['未收款', '部分收款', '已结清'].map((value) => ({ label: value, value }));

function money(value: number | undefined): string {
  const v = Number(value) || 0;
  return v < 0 ? '-¥' + Math.abs(v).toFixed(2) : '¥' + v.toFixed(2);
}

function buildQuery(): string {
  const params = new URLSearchParams();
  if (name.value) params.set('name', name.value.trim());
  if (status.value) params.set('status', status.value);
  if (dateFrom.value) params.set('dateFrom', dateFrom.value.trim());
  if (dateTo.value) params.set('dateTo', dateTo.value.trim());
  if (customer.value) params.set('customer', customer.value.trim());
  if (product.value) params.set('product', product.value.trim());
  if (flavor.value) params.set('flavor', flavor.value.trim());
  if (debtStatus.value) params.set('debtStatus', debtStatus.value);
  return params.toString();
}

async function search() {
  loading.value = true;
  try {
    result.value = await api.getHistory(buildQuery());
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
}

function reset() {
  name.value = '';
  status.value = null;
  dateFrom.value = '';
  dateTo.value = '';
  customer.value = '';
  product.value = '';
  flavor.value = '';
  debtStatus.value = null;
  search();
}

function goHome() {
  router.push('/');
}

function goBatch(id: number) {
  router.push(`/batches/${id}/shipments`);
}

onMounted(search);
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
  margin: 0;
  font-size: 18px;
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
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
}
.clickable {
  cursor: pointer;
}
.shipment {
  padding: 6px 0;
  border-bottom: 1px solid #f5f5f5;
}
.meta {
  color: #666;
  font-size: 13px;
  margin-top: 4px;
}
.warn {
  color: #d03050;
  font-weight: 600;
}
.empty {
  color: #999;
  padding: 8px 0;
}
</style>
