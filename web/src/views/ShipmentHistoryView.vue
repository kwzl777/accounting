<template>
  <div class="page">
    <div class="page-header">
      <n-button text aria-label="返回" @click="goBack">←</n-button>
      <h2>历史出货</h2>
      <span v-if="!loading" class="count">共 {{ settledShipments.length }} 条</span>
    </div>

    <n-alert v-if="error" type="error" :title="error" style="margin-bottom: 12px" />

    <div v-if="loading" class="empty">加载中...</div>
    <div v-else-if="settledShipments.length === 0" class="empty-card">
      暂无已完成出货记录
    </div>
    <div v-else class="history-list">
      <div v-for="s in settledShipments" :key="s.id" class="history-card">
        <div class="history-top">
          <div>
            <div class="product-name">{{ s.product_name }}</div>
            <div class="ship-date">{{ s.ship_date }}</div>
          </div>
          <n-tag size="small" type="success">已结清</n-tag>
        </div>

        <div class="metrics">
          <div>
            <span>数量</span>
            <strong>{{ s.total_quantity }}</strong>
          </div>
          <div>
            <span>进货价</span>
            <strong>{{ money(s.unit_price) }}</strong>
          </div>
          <div>
            <span>进货成本</span>
            <strong>{{ money(s.cost_amount) }}</strong>
          </div>
        </div>

        <div class="meta">
          货款 {{ money(s.rmb_amount) }} · 运费 {{ money(s.freight) }} · 汇率损耗
          {{ s.exchange_loss === null ? '-' : money(s.exchange_loss) }}
        </div>
        <div class="meta">
          已付 {{ uText(s.u_paid) }} U
          <span v-if="s.unpaid_u < -0.004"> · 多付 {{ uText(Math.abs(s.unpaid_u)) }} U</span>
        </div>

        <div class="actions">
          <n-button
            v-if="s.batch_id !== null"
            size="small"
            @click="goBatch(s)"
          >
            查看批次出货
          </n-button>
          <n-button v-if="s.details" size="small" @click="toggleDetails(s.id)">
            {{ expandedDetails[s.id] ? '收起客户明细' : '客户明细' }}
          </n-button>
        </div>

        <div v-if="s.details && expandedDetails[s.id]" class="details">
          <div
            v-if="s.details.customers.some((customer) => customer.unit_price)"
            class="prices"
          >
            <span v-for="customer in s.details.customers" :key="customer.name">
              {{ customer.name }}
              <template v-if="customer.unit_price">
                · 出货价 {{ money(customer.unit_price) }}/件
              </template>
            </span>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>口味</th>
                  <th
                    v-for="customer in s.details.customers"
                    :key="customer.name"
                  >
                    {{ customer.name }}-{{ customer.total }}
                  </th>
                  <th>总数</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in s.details.rows" :key="row.flavor">
                  <td>{{ row.flavor }}</td>
                  <td v-for="(cell, index) in row.cells" :key="index">{{ cell }}</td>
                  <td>{{ row.total }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { NAlert, NButton, NTag } from 'naive-ui';
import { api, type ProductShipment } from '../api/client';
import { goBackOr } from '../utils/navigation';

const router = useRouter();
const shipments = ref<ProductShipment[]>([]);
const loading = ref(false);
const error = ref('');
const expandedDetails = ref<Record<number, boolean>>({});

function isComplete(shipment: ProductShipment): boolean {
  return (
    shipment.unit_price > 0 &&
    shipment.exchange_rate !== null &&
    shipment.unpaid_u <= 0.004 &&
    Number(shipment.customer_allocation_count ?? 0) > 0 &&
    Number(shipment.customer_unpaid ?? 0) <= 0.004
  );
}

const settledShipments = computed(() =>
  shipments.value.filter((shipment) => isComplete(shipment))
);

function money(value: number | null | undefined): string {
  const amount = Number(value) || 0;
  return '¥' + amount.toFixed(2);
}

function uText(value: number | null | undefined): string {
  return (Number(value) || 0).toFixed(2);
}

function goBack() {
  goBackOr(router, '/products');
}

function goBatch(shipment: ProductShipment) {
  if (shipment.batch_id !== null) {
    router.push(`/batches/${shipment.batch_id}/shipments`);
  }
}

function toggleDetails(id: number) {
  expandedDetails.value = {
    ...expandedDetails.value,
    [id]: !expandedDetails.value[id],
  };
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.getProductShipments();
    shipments.value = res.shipments;
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
  gap: 10px;
  margin-bottom: 12px;
}
.page-header h2 {
  flex: 1;
  margin: 0;
  font-size: 19px;
}
.count {
  color: #8a96a3;
  font-size: 12px;
}
.empty,
.empty-card {
  padding: 18px 14px;
  border-radius: 14px;
  background: #ffffff;
  color: #8a96a3;
  font-size: 13px;
  text-align: center;
}
.empty {
  padding: 12px;
  text-align: left;
}
.history-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.history-card {
  padding: 14px;
  border-radius: 14px;
  background: #ffffff;
  box-shadow:
    0 1px 2px rgba(15, 35, 55, 0.04),
    0 14px 28px -22px rgba(15, 35, 55, 0.3);
}
.history-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.product-name {
  font-size: 17px;
  font-weight: 700;
  color: #1f2d3d;
}
.ship-date {
  margin-top: 4px;
  color: #8a96a3;
  font-size: 12px;
}
.metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
}
.metrics div {
  min-width: 0;
  padding: 8px 10px;
  border-radius: 10px;
  background: #f7f9fc;
}
.metrics span {
  display: block;
  color: #8a96a3;
  font-size: 11px;
}
.metrics strong {
  display: block;
  margin-top: 3px;
  color: #1f2d3d;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.meta {
  margin-top: 8px;
  color: #6b7785;
  font-size: 12px;
  line-height: 1.5;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.actions :deep(.n-button) {
  min-height: 44px !important;
  padding: 0 14px !important;
  font-size: 13px !important;
}
.details {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed #e3e9ef;
}
.prices {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  color: #6b7785;
  font-size: 12px;
}
.table-wrap {
  margin-top: 8px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
table {
  width: 100%;
  border-collapse: collapse;
  background: #ffffff;
}
th,
td {
  padding: 7px 6px;
  border: 1px solid #333333;
  color: #1f2d3d;
  font-size: 12px;
  text-align: center;
  white-space: nowrap;
}
th {
  background: #f2f2f2;
  font-weight: 600;
}
</style>
