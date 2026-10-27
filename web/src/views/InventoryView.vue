<template>
  <div class="page">
    <div class="page-header">
      <n-button text aria-label="返回" @click="goBack">←</n-button>
      <h2>库存</h2>
    </div>

    <n-alert v-if="error" type="error" :title="error" style="margin-bottom: 12px" />

    <div class="summary-card">
      <div class="stat">
        <span>口味数量</span>
        <strong>{{ totalFlavors }}</strong>
      </div>
      <div class="stat">
        <span>库存数量</span>
        <strong>{{ totalStock }}</strong>
      </div>
    </div>

    <div v-if="loading" class="empty-card">加载中...</div>
    <div v-else-if="products.length === 0" class="empty-card">暂无产品</div>
    <div v-else class="product-list">
      <div v-for="product in products" :key="product.id" class="product-card">
        <div class="product-head">
          <span class="product-name">{{ product.name }}</span>
          <span class="product-stock">库存 {{ product.stock }}</span>
        </div>

        <div v-if="product.flavors.length > 0" class="flavor-table">
          <div class="flavor-head">
            <span>口味</span>
            <span>库存</span>
          </div>
          <div v-for="flavor in product.flavors" :key="flavor.id" class="flavor-row">
            <span class="flavor-name">{{ flavor.flavor }}</span>
            <span class="stock" :class="{ zero: flavor.stock <= 0 }">{{ flavor.stock }}</span>
          </div>
        </div>
        <div v-else class="empty">暂无口味</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { NAlert, NButton } from 'naive-ui';
import { api, type Product } from '../api/client';
import { goBackOr } from '../utils/navigation';

const router = useRouter();
const products = ref<Product[]>([]);
const loading = ref(false);
const error = ref('');

const totalFlavors = computed(() =>
  products.value.reduce((sum, product) => sum + product.flavors.length, 0)
);

const totalStock = computed(() =>
  products.value.reduce((sum, product) => sum + Number(product.stock || 0), 0)
);

function goBack() {
  goBackOr(router, '/');
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.getProducts();
    products.value = res.products;
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
.summary-card {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  padding: 12px;
  border-radius: 14px;
  background: #ffffff;
  box-shadow:
    0 1px 2px rgba(15, 35, 55, 0.04),
    0 14px 28px -22px rgba(15, 35, 55, 0.3);
}
.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.stat span {
  color: #8a96a3;
  font-size: 12px;
}
.stat strong {
  color: #1f2d3d;
  font-size: 22px;
}
.product-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 12px;
}
.product-card {
  padding: 4px 12px 8px;
  border-radius: 14px;
  background: #ffffff;
  box-shadow:
    0 1px 2px rgba(15, 35, 55, 0.04),
    0 14px 28px -22px rgba(15, 35, 55, 0.3);
}
.product-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 0 8px;
  border-bottom: 1px solid #eef2f6;
}
.product-name {
  color: #1f2d3d;
  font-size: 16px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.product-stock {
  color: #1f6f6b;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}
.flavor-head,
.flavor-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 6px;
  align-items: center;
}
.flavor-head {
  padding: 9px 0 7px;
  border-bottom: 1px solid #eef2f6;
  color: #9aa5b1;
  font-size: 11px;
}
.flavor-head span:last-child,
.stock {
  text-align: center;
}
.flavor-row {
  min-height: 40px;
  border-bottom: 1px solid #f2f4f7;
  font-size: 14px;
}
.flavor-row:last-child {
  border-bottom: none;
}
.flavor-name {
  color: #1f2d3d;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.stock {
  color: #6b7785;
}
.stock.zero {
  color: #b8c2cc;
}
.empty-card {
  margin-top: 12px;
  padding: 24px;
  border-radius: 14px;
  background: #ffffff;
  color: #9aa5b1;
  font-size: 13px;
  text-align: center;
}
.empty {
  padding: 12px 0;
  color: #9aa5b1;
  font-size: 13px;
}
</style>
