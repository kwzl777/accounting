<template>
  <div class="page">
    <div class="page-header">
      <n-button text aria-label="返回" @click="goBack">←</n-button>
      <h2>{{ product ? product.name : '已定' }}</h2>
    </div>

    <n-alert v-if="saved" type="success" :title="savedMessage" style="margin-bottom: 12px" />
    <n-alert v-if="error" type="error" :title="error" style="margin-bottom: 12px" />

    <div v-if="loading" class="empty">加载中...</div>

    <template v-else-if="product">
      <div class="booked-banner">
        <strong
          :class="{ 'booked-shipped': orders.length === 0 && shipment && !shipmentSettled(shipment) }"
        >
          {{
            orders.length > 0
              ? '已定'
              : shipment
                ? shipmentSettled(shipment)
                  ? '已结清'
                  : '已发'
                : '已定'
          }}
        </strong>
        <span v-if="orders.length > 0">总计{{ totalQty }}</span>
      </div>
      <div v-if="shipment && orders.length === 0" class="shipped-date">
        发货日期：{{ shipment.ship_date }}
      </div>

      <template v-if="orders.length > 0">
        <div class="table-wrap">
          <table class="booked-table">
            <thead>
              <tr>
                <th>库存数量</th>
                <th>口味</th>
                <th v-for="customer in customers" :key="customer.name">
                  {{ customer.name }}-{{ customer.total }}
                </th>
                <th>总数</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.flavor">
                <td class="stock-cell">{{ row.stock }}</td>
                <td class="flavor-cell">{{ row.flavor }}</td>
                <td v-for="(cell, index) in row.cells" :key="index">{{ cell }}</td>
                <td class="total-cell">{{ row.total }}</td>
              </tr>
              <tr v-if="rows.length === 0">
                <td :colspan="customers.length + 3" class="empty-cell">暂无预定</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="table-note">总数 = 各客户预定合计 − 库存数量（库存足够时为 0）</div>

        <div class="edit-section">
          <div class="edit-title">修改某个人的预定</div>
          <div v-for="order in orders" :key="'edit-' + order.id" class="edit-row">
            <span class="edit-info">
              {{ order.customer_name }} · {{ order.date || '-' }} ·
              {{ priceText(order.unit_price) }} 元 · 共 {{ order.total_quantity }}
            </span>
            <n-button size="small" @click="editOrder(order)">修改</n-button>
          </div>
        </div>
      </template>

      <div v-else class="stock-card">
        <div class="stock-title">剩余库存</div>
        <div class="stock-head"><span>口味</span><span>库存数量</span></div>
        <div v-for="flavor in product.flavors" :key="flavor.id" class="stock-row">
          <span>{{ flavor.flavor }}</span>
          <strong>{{ flavor.stock }}</strong>
        </div>
      </div>

      <div v-if="copyHint" class="copy-hint">{{ copyHint }}</div>
      <div class="actions">
        <n-button :disabled="rows.length === 0" @click="copySupplierList">
          复制给供应商
        </n-button>
        <n-button @click="goNewOrder">新增预定</n-button>
        <n-button
          v-if="orders.length > 0"
          type="primary"
          :loading="shipping"
          :disabled="totalQty <= 0"
          @click="shipOrder"
        >
          发货
        </n-button>
        <n-button v-else-if="shipment" disabled>已发 {{ shipment.ship_date }}</n-button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { NButton, NAlert } from 'naive-ui';
import { api, type Product, type Preorder, type ProductShipment } from '../api/client';
import { copyText } from '../utils/clipboard';

const route = useRoute();
const router = useRouter();
const productId = computed(() => Number(route.params.id));
const saved = computed(() => route.query.saved === '1' || route.query.updated === '1');
const savedMessage = computed(() =>
  route.query.updated === '1' ? '预定已修改' : '预定已保存'
);

const product = ref<Product | null>(null);
const orders = ref<Preorder[]>([]);
const shipment = ref<ProductShipment | null>(null);
const loading = ref(false);
const shipping = ref(false);
const error = ref('');
const copyHint = ref('');

const customers = computed(() => {
  const totals = new Map<string, number>();
  const ordered = [...orders.value].sort((a, b) => a.id - b.id);
  for (const order of ordered) {
    const name = order.customer_name;
    const total = (totals.get(name) ?? 0) + Number(order.total_quantity);
    totals.set(name, Math.round(total * 100) / 100);
  }
  return [...totals.entries()].map(([name, total]) => ({ name, total }));
});

const rows = computed(() => {
  const byFlavor = new Map<string, Map<string, number>>();
  for (const order of orders.value) {
    for (const item of order.items) {
      const cells = byFlavor.get(item.flavor) ?? new Map<string, number>();
      cells.set(order.customer_name, (cells.get(order.customer_name) ?? 0) + item.quantity);
      byFlavor.set(item.flavor, cells);
    }
  }
  const flavorOrder = product.value?.flavors.map((item) => item.flavor) ?? [];
  const stockByFlavor = new Map(
    product.value?.flavors.map((item) => [item.flavor, Number(item.stock) || 0]) ?? []
  );
  const flavors = [...byFlavor.keys()].sort((a, b) => {
    const indexA = flavorOrder.indexOf(a);
    const indexB = flavorOrder.indexOf(b);
    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;
    return a.localeCompare(b);
  });
  return flavors.map((flavor) => {
    const cells = customers.value.map(
      (customer) =>
        Math.round((byFlavor.get(flavor)?.get(customer.name) ?? 0) * 100) / 100
    );
    const orderedTotal =
      Math.round(cells.reduce((sum, value) => sum + value, 0) * 100) / 100;
    const stock = Math.round((stockByFlavor.get(flavor) ?? 0) * 100) / 100;
    const total = Math.max(Math.round((orderedTotal - stock) * 100) / 100, 0);
    return { flavor, stock, cells, total };
  });
});

const totalQty = computed(() =>
  Math.round(rows.value.reduce((sum, row) => sum + row.total, 0) * 100) / 100
);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [productRes, preorderRes, shipmentRes] = await Promise.all([
      api.getProduct(productId.value),
      api.getPreorders(productId.value),
      api.getProductShipment(productId.value),
    ]);
    product.value = productRes.product;
    orders.value = preorderRes.orders;
    shipment.value = shipmentRes.shipment;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

async function shipOrder() {
  if (shipping.value) return;
  if (!window.confirm('确认整批发货？发货日期为今天。')) return;
  shipping.value = true;
  error.value = '';
  try {
    const res = await api.createProductShipment(productId.value);
    shipment.value = res.shipment;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '发货失败';
  } finally {
    shipping.value = false;
  }
}

async function copySupplierList() {
  const flavorLines = rows.value
    .filter((row) => row.total > 0)
    .map((row) => `${row.flavor} ${row.total}`);
  if (flavorLines.length === 0) {
    copyHint.value = '暂无预定数量';
    return;
  }
  const lines = product.value
    ? [`${product.value.name} ${totalQty.value}`, ...flavorLines]
    : flavorLines;
  const ok = await copyText(lines.join('\n'));
  copyHint.value = ok ? '已复制，可粘贴给供应商' : '复制失败，请手动选择复制';
}

function priceText(value: number) {
  return String(Number(value) || 0);
}

function shipmentSettled(value: ProductShipment): boolean {
  return (
    value.unit_price > 0 &&
    value.exchange_rate !== null &&
    value.unpaid_u <= 0.004
  );
}

function editOrder(order: Preorder) {
  router.push(`/products/${productId.value}/preorder/${order.id}`);
}

function goNewOrder() {
  router.push(`/products/${productId.value}/preorder`);
}

function goBack() {
  router.push('/products');
}

watch(productId, () => {
  copyHint.value = '';
  load();
});

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
  margin: 0;
  font-size: 19px;
}
.booked-banner {
  display: flex;
  justify-content: center;
  align-items: baseline;
  gap: 28px;
  background: #fdf1c9;
  border: 1.5px solid #222222;
  border-bottom: none;
  padding: 11px 12px;
  font-size: 22px;
  color: #111111;
  letter-spacing: 1px;
}
.booked-banner strong {
  font-size: 22px;
}
.booked-shipped {
  color: #d03050;
}
.booked-banner span {
  font-size: 21px;
  font-weight: 700;
}
.shipped-date {
  margin-top: 6px;
  color: #8a96a3;
  font-size: 12px;
  text-align: right;
}
.table-wrap {
  overflow-x: auto;
  background: #ffffff;
  border: 1.5px solid #222222;
  -webkit-overflow-scrolling: touch;
}
.booked-table {
  width: 100%;
  min-width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
.booked-table th,
.booked-table td {
  border: 1px solid #222222;
  padding: 9px 10px;
  text-align: center;
  white-space: nowrap;
  color: #1f2d3d;
}
.booked-table th {
  background: #fdf1c9;
  font-weight: 700;
}
.booked-table td {
  background: #ffffff;
}
.flavor-cell {
  font-weight: 600;
}
.stock-cell {
  color: #1f6f6b;
  font-weight: 600;
  background: #f7fbf9;
}
.total-cell {
  font-weight: 700;
}
.table-note {
  margin-top: 6px;
  color: #9aa5b1;
  font-size: 11px;
  text-align: right;
}
.empty-cell {
  color: #9aa5b1;
  font-weight: 400;
  padding: 20px 12px;
}
.edit-section {
  margin-top: 14px;
  background: #ffffff;
  border-radius: 12px;
  padding: 12px 14px;
  box-shadow: 0 14px 28px -22px rgba(15, 35, 55, 0.3);
}
.edit-title {
  font-size: 12px;
  color: #8a96a3;
  margin-bottom: 6px;
}
.edit-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid #f2f4f7;
}
.edit-row:last-child {
  border-bottom: none;
}
.edit-info {
  font-size: 13px;
  color: #3d4a59;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.edit-row :deep(.n-button) {
  min-height: 40px;
  padding: 0 14px;
}
.copy-hint {
  margin-top: 10px;
  color: #2f9e7a;
  font-size: 12px;
  text-align: right;
}
.stock-card {
  margin-top: 12px;
  background: #ffffff;
  border-radius: 12px;
  padding: 12px 14px;
  box-shadow: 0 14px 28px -22px rgba(15, 35, 55, 0.3);
}
.stock-title {
  font-size: 15px;
  font-weight: 700;
  color: #1f2d3d;
  margin-bottom: 8px;
}
.stock-head,
.stock-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid #f2f4f7;
  font-size: 13px;
}
.stock-head {
  color: #9aa5b1;
  font-size: 11px;
  border-bottom-color: #eef2f6;
}
.stock-row:last-child {
  border-bottom: none;
}
.stock-row strong {
  color: #1f6f6b;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 14px;
}
.empty {
  color: #9aa5b1;
  font-size: 13px;
  padding: 16px 0;
  text-align: center;
}
</style>
