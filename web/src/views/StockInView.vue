<template>
  <div class="page">
    <div class="page-header">
      <n-button text aria-label="返回" @click="goBack">←</n-button>
      <h2>入库{{ product ? ' - ' + product.name : '' }}</h2>
    </div>

    <n-alert v-if="error" type="error" :title="error" style="margin-bottom: 12px" />

    <div v-if="loading" class="empty">加载中...</div>

    <template v-else-if="product">
      <template v-if="savedInfo">
        <div class="card success-card">
          <div class="success-title">已入库</div>
          <div class="confirm-row"><span>供应商</span><strong>{{ savedInfo.supplier_name }}</strong></div>
          <div class="confirm-row"><span>日期</span><strong>{{ savedInfo.date }}</strong></div>
          <div class="confirm-items">
            <div v-for="item in savedInfo.items" :key="item.flavor" class="confirm-item">
              <span>{{ item.flavor }}</span>
              <strong>{{ item.quantity }}</strong>
            </div>
          </div>
          <div class="confirm-total">总数量 <strong>{{ savedInfo.total_quantity }}</strong></div>
        </div>
        <div class="submit-bar">
          <n-button size="large" @click="goBack">返回仓库</n-button>
          <n-button type="primary" size="large" @click="startAgain">继续入库</n-button>
        </div>
      </template>

      <template v-else-if="step === 'entry'">
        <div class="card">
          <div class="card-title">供应商信息</div>
          <div class="form">
            <Field label="供应商名字">
              <n-input v-model:value="supplierName" placeholder="请输入供应商名字" size="large" />
            </Field>
            <Field label="日期">
              <n-input v-model:value="date" placeholder="默认今天，如 2026-10-26" size="large" />
            </Field>
          </div>
        </div>

        <div class="card">
          <div v-if="product.flavors.length === 0" class="empty">
            暂无口味，请先到产品详情添加口味
          </div>
          <template v-else>
            <button class="collapse-head" type="button" @click="flavorsOpen = !flavorsOpen">
              <span class="card-title">入库口味</span>
              <span class="collapse-meta">
                <span>已填 {{ items.length }} 个 · 总数量 {{ totalQty }}</span>
                <span class="chevron">{{ flavorsOpen ? '▾' : '▸' }}</span>
              </span>
            </button>

            <div v-show="flavorsOpen" class="flavor-body">
              <div class="flavor-list">
                <div class="flavor-head">
                  <span>仓库口味</span>
                  <span>数量</span>
                </div>
                <div v-for="flavor in product.flavors" :key="flavor.id" class="flavor-row">
                  <span class="flavor-name">{{ flavor.flavor }}</span>
                  <n-input
                    v-model:value="quantities[flavor.id]"
                    placeholder="数量"
                    class="qty-input"
                  />
                </div>
              </div>
            </div>

            <div class="parse-box">
              <Field label="批量解析（按口味名匹配）">
                <n-input
                  v-model:value="parseText"
                  type="textarea"
                  :rows="4"
                  placeholder="每行一个口味和数量，例如：&#10;青提 10&#10;茉莉绿茶 5"
                />
              </Field>
              <div class="parse-actions">
                <n-button :disabled="saving" @click="clearQuantities">清空数据</n-button>
                <n-button type="tertiary" @click="parseOrderText">解析填入</n-button>
              </div>
              <div v-if="parseHint" class="parse-success">{{ parseHint }}</div>
              <div v-if="parseError" class="modal-error">{{ parseError }}</div>
            </div>
          </template>
        </div>

        <div v-if="orderError" class="modal-error">{{ orderError }}</div>

        <div class="submit-bar">
          <div class="total-preview">
            总数量 <strong>{{ totalQty }}</strong>
          </div>
          <n-button type="primary" size="large" :disabled="saving" @click="goConfirm">
            提交
          </n-button>
        </div>
      </template>

      <template v-else>
        <div class="card confirm-card">
          <div class="card-title">确认入库</div>
          <div class="confirm-row"><span>供应商</span><strong>{{ supplierName }}</strong></div>
          <div class="confirm-row"><span>日期</span><strong>{{ date || '-' }}</strong></div>
          <div class="confirm-items">
            <div v-for="item in items" :key="item.flavor" class="confirm-item">
              <span>{{ item.flavor }}</span>
              <strong>{{ item.quantity }}</strong>
            </div>
          </div>
          <div class="confirm-total">总数量 <strong>{{ totalQty }}</strong></div>
        </div>

        <div v-if="orderError" class="modal-error">{{ orderError }}</div>

        <div class="submit-bar">
          <n-button size="large" :disabled="saving" @click="step = 'entry'">返回修改</n-button>
          <n-button type="primary" size="large" :loading="saving" @click="saveStockIn">
            确认保存
          </n-button>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { NButton, NInput, NAlert } from 'naive-ui';
import { api, type Product } from '../api/client';
import Field from '../components/Field.vue';
import { parseFlavorQuantities } from '../utils/flavorParse';

interface SavedStockIn {
  supplier_name: string;
  date: string;
  total_quantity: number;
  items: Array<{ flavor: string; quantity: number }>;
}

const route = useRoute();
const router = useRouter();
const productId = computed(() => Number(route.params.id));

const product = ref<Product | null>(null);
const loading = ref(false);
const saving = ref(false);
const error = ref('');

const step = ref<'entry' | 'confirm'>('entry');
const flavorsOpen = ref(false);
const supplierName = ref('');
const date = ref('');
const quantities = ref<Record<number, string>>({});
const parseText = ref('');
const parseError = ref('');
const parseHint = ref('');
const orderError = ref('');
const savedInfo = ref<SavedStockIn | null>(null);

const items = computed(() => {
  const current = product.value;
  if (!current) return [];
  return current.flavors
    .map((flavor) => ({
      flavor: flavor.flavor,
      quantity: Number(quantities.value[flavor.id] ?? 0),
    }))
    .filter((item) => Number.isFinite(item.quantity) && item.quantity > 0);
});

const totalQty = computed(() =>
  Math.round(items.value.reduce((sum, item) => sum + item.quantity, 0) * 100) / 100
);

function todayText() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.getProduct(productId.value);
    product.value = res.product;
    resetForm();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  step.value = 'entry';
  flavorsOpen.value = false;
  supplierName.value = '';
  date.value = todayText();
  const next: Record<number, string> = {};
  for (const flavor of product.value?.flavors ?? []) {
    next[flavor.id] = '';
  }
  quantities.value = next;
  parseText.value = '';
  parseError.value = '';
  parseHint.value = '';
  orderError.value = '';
  savedInfo.value = null;
}

function startAgain() {
  resetForm();
}

function clearQuantities() {
  const next: Record<number, string> = {};
  for (const flavor of product.value?.flavors ?? []) {
    next[flavor.id] = '';
  }
  quantities.value = next;
  parseError.value = '';
  parseHint.value = '';
  orderError.value = '';
}

function parseOrderText() {
  const current = product.value;
  if (!current) return;
  parseError.value = '';
  parseHint.value = '';
  const result = parseFlavorQuantities(parseText.value, current.flavors);
  quantities.value = { ...quantities.value, ...result.quantities };
  if (result.matched > 0) {
    parseHint.value = `已填入 ${result.matched} 个口味`;
  }
  if (result.unmatched.length > 0) {
    parseError.value = `未匹配：${result.unmatched.join('、')}（格式：口味 数量，如 青提 10）`;
  } else if (result.matched === 0) {
    parseError.value = '没有匹配到口味，请检查口味名称和数量';
  }
}

function goConfirm() {
  orderError.value = '';
  if (!supplierName.value.trim()) {
    orderError.value = '请输入供应商名字';
    return;
  }
  for (const flavor of product.value?.flavors ?? []) {
    const raw = quantities.value[flavor.id];
    if (raw === undefined || raw === '') continue;
    const quantity = Number(raw);
    if (!Number.isFinite(quantity) || quantity < 0) {
      orderError.value = `「${flavor.flavor}」数量不正确`;
      return;
    }
  }
  if (items.value.length === 0) {
    orderError.value = '请至少填写一个口味的数量';
    flavorsOpen.value = true;
    return;
  }
  step.value = 'confirm';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function saveStockIn() {
  const current = product.value;
  if (!current || saving.value) return;
  saving.value = true;
  orderError.value = '';
  try {
    const res = await api.stockInProduct(current.id, {
      supplierName: supplierName.value.trim(),
      date: date.value.trim() || undefined,
      items: items.value,
    });
    savedInfo.value = res;
    error.value = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) {
    orderError.value = e instanceof Error ? e.message : '入库失败';
  } finally {
    saving.value = false;
  }
}

function goBack() {
  router.push('/products');
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
  margin: 0;
  font-size: 19px;
}
.card {
  background: #ffffff;
  border-radius: 14px;
  padding: 14px;
  margin-bottom: 12px;
  box-shadow: 0 14px 28px -20px rgba(15, 35, 55, 0.3);
}
.card-title {
  font-size: 15px;
  font-weight: 700;
  color: #1f2d3d;
  margin-bottom: 12px;
}
.collapse-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}
.collapse-head .card-title {
  margin-bottom: 0;
}
.collapse-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #8a96a3;
  font-size: 12px;
  white-space: nowrap;
}
.chevron {
  color: #1f6f6b;
  font-size: 15px;
}
.flavor-body {
  margin-top: 12px;
}
.form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.flavor-head,
.flavor-row {
  display: grid;
  grid-template-columns: 1fr 120px;
  gap: 10px;
  align-items: center;
}
.flavor-head {
  font-size: 11px;
  color: #9aa5b1;
  padding-bottom: 6px;
  border-bottom: 1px solid #eef2f6;
}
.flavor-head span:last-child {
  text-align: right;
}
.flavor-row {
  padding: 8px 0;
  border-bottom: 1px solid #f2f4f7;
}
.flavor-row:last-child {
  border-bottom: none;
}
.flavor-name {
  font-size: 14px;
  font-weight: 600;
  color: #1f2d3d;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.qty-input {
  width: 120px;
  justify-self: end;
}
.parse-box {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed #e6edf5;
}
.parse-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
.parse-success {
  margin-top: 8px;
  color: #2f9e7a;
  font-size: 12px;
}
.modal-error {
  margin-top: 10px;
  color: #d03050;
  font-size: 12px;
  line-height: 1.5;
}
.success-title {
  font-size: 18px;
  font-weight: 700;
  color: #1f6f6b;
  text-align: center;
  margin-bottom: 14px;
}
.submit-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: #ffffff;
  border-radius: 14px;
  padding: 12px 14px;
  box-shadow: 0 14px 28px -20px rgba(15, 35, 55, 0.3);
}
.total-preview {
  font-size: 14px;
  color: #5b6773;
}
.total-preview strong {
  font-size: 20px;
  color: #1f6f6b;
  margin-left: 4px;
}
.confirm-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 0;
  font-size: 14px;
  color: #1f2d3d;
}
.confirm-row span {
  color: #8a96a3;
}
.confirm-items {
  margin-top: 8px;
  border-top: 1px dashed #e6edf5;
  padding-top: 8px;
}
.confirm-item {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  font-size: 14px;
}
.confirm-total {
  display: flex;
  justify-content: space-between;
  border-top: 1px solid #e6edf5;
  margin-top: 10px;
  padding-top: 12px;
  font-size: 15px;
  font-weight: 700;
}
.confirm-total strong {
  color: #1f6f6b;
  font-size: 20px;
}
.empty {
  color: #9aa5b1;
  font-size: 13px;
  padding: 16px 0;
  text-align: center;
}
</style>
