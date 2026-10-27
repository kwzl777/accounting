<template>
  <div class="page">
    <div class="page-header">
      <n-button text aria-label="返回" @click="goHome">←</n-button>
      <h2>客户欠款</h2>
    </div>

    <n-alert v-if="error" type="error" :title="error" style="margin-bottom: 12px" />
    <div v-if="loading" class="empty">加载中...</div>
    <n-empty v-else-if="customers.length === 0" description="暂无客户欠款" />
    <n-card v-for="c in customers" :key="c.customer_name" class="customer-card">
      <div class="customer-name">{{ c.customer_name }}</div>
      <div class="line">
        销售额：{{ money(c.total_sales) }}；免收：{{ money(c.total_waived) }}；已收：{{
          money(c.total_received)
        }}
      </div>
      <div class="line" :class="{ warn: c.total_remaining > 0 }">
        未收余额：{{ money(c.total_remaining) }}
      </div>

      <div class="batch-list">
        <div v-for="b in c.batches" :key="b.batch_id" class="batch-row">
          <div class="batch-main">
            <button class="batch-name" @click="openDetail(c, b)">
              {{ b.batch_name }} · 总数量 {{ b.total_quantity }}
            </button>
            <div class="batch-sub">
              <span class="batch-date">{{ b.batch_date || '-' }}</span>
              <button class="batch-debt" @click="openRepay(c, b)">
                欠款 {{ money(b.remaining) }}
              </button>
            </div>
          </div>
          <button class="detail-btn" @click="openDetail(c, b)">详情</button>
        </div>
      </div>
    </n-card>

    <div class="hint">已结清的客户不显示。按时间顺序排列；点「欠款金额」可还款，点「详情」查看分货清单。</div>

    <!-- 分货详情 -->
    <n-modal
      v-model:show="detailVisible"
      preset="card"
      :title="detailTitle"
      :bordered="false"
      :style="{ width: '94vw', maxWidth: '560px', borderRadius: '20px' }"
    >
      <div class="detail-table">
        <div class="detail-head">
          <span>日期</span>
          <span>口味</span>
          <span>数量</span>
          <span>单价</span>
          <span>总价</span>
        </div>
        <div v-for="s in detailShipments" :key="s.id" class="detail-row">
          <span>{{ s.date || '-' }}</span>
          <span class="detail-flavor">
            {{ s.product_name ? s.product_name + ' / ' + (s.flavor || '') : s.flavor || '-' }}
          </span>
          <span>{{ s.quantity }}</span>
          <span>{{ money(s.unit_price) }}</span>
          <span>{{ money(s.sales_amount) }}</span>
        </div>
        <div v-if="detailShipments.length === 0" class="settled">暂无分货记录</div>
      </div>
      <div class="detail-total">合计：{{ money(detailTotal) }}</div>
    </n-modal>

    <n-modal
      v-model:show="repayVisible"
      preset="card"
      title="还款"
      :bordered="false"
      :style="{ width: '92vw', maxWidth: '420px', borderRadius: '20px' }"
    >
      <div class="repay-info">
        <div>客户：{{ repayTarget?.customerName }}</div>
        <div>批次：{{ repayTarget?.batchName }}</div>
        <div>当前欠款：{{ money(repayTarget?.remaining ?? 0) }}</div>
      </div>
      <Field label="还款金额（元）">
        <n-input v-model:value="repayAmount" placeholder="请输入还款金额" />
      </Field>
      <div class="modal-actions">
        <n-button @click="repayVisible = false">取消</n-button>
        <n-button type="primary" :loading="saving" @click="saveRepay">确认还款</n-button>
      </div>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { NCard, NButton, NEmpty, NAlert, NModal, NInput } from 'naive-ui';
import { api, type CustomerDebt, type CustomerDebtBatch, type CustomerDebtBatchShipment } from '../api/client';
import Field from '../components/Field.vue';

const router = useRouter();
const customers = ref<CustomerDebt[]>([]);
const loading = ref(false);
const error = ref('');

const repayVisible = ref(false);
const repayTarget = ref<{
  batchId: number;
  customerName: string;
  batchName: string;
  remaining: number;
} | null>(null);
const repayAmount = ref('');
const saving = ref(false);

const detailVisible = ref(false);
const detailTitle = ref('');
const detailShipments = ref<CustomerDebtBatchShipment[]>([]);
const detailTotal = computed(() =>
  detailShipments.value.reduce((sum, item) => sum + Number(item.sales_amount), 0)
);

function money(value: number): string {
  const v = Number(value) || 0;
  return v < 0 ? '-¥' + Math.abs(v).toFixed(2) : '¥' + v.toFixed(2);
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.getCustomerDebts();
    customers.value = res.customers;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

function goHome() {
  router.push('/');
}

function openRepay(customer: CustomerDebt, batch: CustomerDebtBatch) {
  repayTarget.value = {
    batchId: batch.batch_id,
    customerName: customer.customer_name,
    batchName: batch.batch_name,
    remaining: batch.remaining,
  };
  repayAmount.value = '';
  repayVisible.value = true;
}

function openDetail(customer: CustomerDebt, batch: CustomerDebtBatch) {
  detailTitle.value = `${customer.customer_name} · ${batch.batch_name}`;
  detailShipments.value = batch.shipments.map((item) => ({
    ...item,
    date: item.date ?? batch.batch_date,
  }));
  detailVisible.value = true;
}

async function saveRepay() {
  if (!repayTarget.value) return;
  const amount = Number(repayAmount.value);
  if (!Number.isFinite(amount) || amount <= 0) {
    error.value = '还款金额必须大于 0';
    return;
  }
  if (amount > repayTarget.value.remaining) {
    error.value = `还款金额不能超过欠款（${repayTarget.value.remaining}）`;
    return;
  }
  saving.value = true;
  error.value = '';
  try {
    await api.repayCustomer({
      batchId: repayTarget.value.batchId,
      customerName: repayTarget.value.customerName,
      amount,
    });
    repayVisible.value = false;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '还款失败';
  } finally {
    saving.value = false;
  }
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
  margin: 0;
  font-size: 18px;
}
.customer-card {
  margin-bottom: 12px;
}
.customer-name {
  font-size: 16px;
  font-weight: 600;
}
.line {
  color: #555;
  font-size: 14px;
  margin-top: 4px;
}
.warn {
  color: #d03050;
  font-weight: 600;
}
.batch-list {
  margin-top: 10px;
  border-top: 1px dashed #e6edf5;
  padding-top: 8px;
}
.batch-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px dashed #f2f4f7;
}
.batch-row:last-child {
  border-bottom: none;
}
.batch-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}
.batch-name {
  border: none;
  background: transparent;
  padding: 0;
  font-size: 14px;
  font-weight: 600;
  color: #1f2d3d;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.batch-sub {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: #8a96a3;
}
.batch-debt {
  border: none;
  background: transparent;
  padding: 0;
  font-size: 13px;
  color: #d03050;
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
  white-space: nowrap;
}
.detail-btn {
  border: none;
  background: #eef7f2;
  color: #1f6f6b;
  border-radius: 8px;
  font-size: 12px;
  padding: 7px 10px;
  cursor: pointer;
  white-space: nowrap;
}
.settled {
  margin-top: 8px;
  font-size: 12px;
  color: #7b8794;
}
.detail-table {
  margin-top: -4px;
}
.detail-head,
.detail-row {
  display: grid;
  grid-template-columns: 72px 1fr 42px 56px 64px;
  gap: 6px;
  align-items: center;
}
.detail-head {
  font-size: 11px;
  color: #9aa5b1;
  padding: 6px 0;
  border-bottom: 1px solid #eef2f6;
}
.detail-row {
  font-size: 12px;
  padding: 8px 0;
  border-bottom: 1px solid #f2f4f7;
}
.detail-head span:not(:first-child):not(:nth-child(2)),
.detail-row span:not(:first-child):not(:nth-child(2)) {
  text-align: right;
}
.detail-flavor {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.detail-total {
  margin-top: 10px;
  text-align: right;
  font-weight: 700;
  color: #1f2d3d;
}
.hint {
  margin-top: 12px;
  color: #8a96a3;
  font-size: 12px;
  text-align: center;
}
.repay-info {
  background: #f7f9fc;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 13px;
  color: #3d4a59;
  line-height: 1.8;
  margin-bottom: 12px;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}
.empty {
  color: #999;
  padding: 12px 0;
}
</style>
