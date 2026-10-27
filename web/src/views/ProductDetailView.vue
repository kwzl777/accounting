<template>
  <div class="page">
    <div class="page-header">
      <n-button text aria-label="返回" @click="goBack">←</n-button>
      <h2>{{ product?.name || '产品详情' }}</h2>
    </div>

    <n-alert v-if="error" type="error" :title="error" style="margin-bottom: 12px" />
    <n-alert v-if="notice" type="success" :title="notice" style="margin-bottom: 12px" />

    <div class="info-card" v-if="product">
      <div class="info-row" v-if="product.remark">
        <span>备注</span><strong>{{ product.remark }}</strong>
      </div>
      <div class="info-row stats-row">
        <div class="stat">
          <span>口味数量</span><strong>{{ product.flavors.length }}</strong>
        </div>
        <div class="stat">
          <span>库存数量</span><strong>{{ product.stock }}</strong>
        </div>
      </div>
    </div>

    <div class="flavor-card" v-if="product">
      <div class="flavor-head">
        <span>口味</span>
        <span>库存</span>
        <span>操作</span>
      </div>
      <div v-for="flavor in product.flavors" :key="flavor.id" class="flavor-row">
        <span class="flavor-name">{{ flavor.flavor }}</span>
        <span class="stock">{{ flavor.stock }}</span>
        <button class="edit-btn" @click="openEdit(flavor)">编辑</button>
      </div>
      <div v-if="product.flavors.length === 0" class="empty">暂无口味</div>
    </div>

    <div class="add-flavor" v-if="product">
      <n-input v-model:value="newFlavor" placeholder="新口味" size="small" />
      <n-button size="small" :loading="saving" @click="addFlavor">添加口味</n-button>
    </div>
    <div class="flavor-tools" v-if="product">
      <button class="parse-link" @click="openParse">批量解析</button>
      <span class="tool-hint">粘贴多行口味，解析后统一保存</span>
    </div>

    <div class="hint">点「编辑」可修改口味；库存 = 入库（到货）− 出货。价格在预订时填写。</div>

    <!-- 批量解析口味 -->
    <n-modal
      v-model:show="parseVisible"
      preset="card"
      title="批量解析口味"
      :bordered="false"
      :style="{ width: '92vw', maxWidth: '520px', borderRadius: '20px' }"
    >
      <div class="parse-hint">
        每行一个口味，例如「红富士」「8424」「冰爆」。已存在的口味会自动跳过。
      </div>
      <Field label="粘贴内容">
        <n-input
          v-model:value="parseText"
          type="textarea"
          :rows="6"
          placeholder="红富士
8424
冰爆"
        />
      </Field>
      <div class="parse-actions">
        <n-button type="primary" :loading="parsing" @click="doParse">解析</n-button>
        <n-button :disabled="parsing" @click="clearParse">清空</n-button>
      </div>

      <div v-if="parsedRows.length > 0" class="parsed-list">
        <div class="parsed-head">解析结果（可修改口味）</div>
        <div class="parsed-head-row">
          <span>口味</span>
          <span></span>
        </div>
        <div v-for="(row, index) in parsedRows" :key="index" class="parsed-row">
          <n-input v-model:value="row.flavor" placeholder="口味" size="small" />
          <button class="parsed-del" @click="removeParsed(index)">×</button>
        </div>
      </div>
      <div v-if="modalError" class="modal-error">{{ modalError }}</div>
      <div class="modal-actions">
        <n-button @click="parseVisible = false">取消</n-button>
        <n-button
          type="primary"
          :loading="saving"
          :disabled="parsedRows.length === 0"
          @click="importParsed"
        >
          保存 {{ parsedRows.length }} 个口味
        </n-button>
      </div>
    </n-modal>

    <!-- 编辑口味 -->
    <n-modal
      v-model:show="editVisible"
      preset="card"
      title="编辑口味"
      :bordered="false"
      :style="{ width: '92vw', maxWidth: '420px', borderRadius: '20px' }"
    >
      <div class="form">
        <Field label="口味">
          <n-input v-model:value="editFlavor" placeholder="口味" />
        </Field>
      </div>
      <div v-if="modalError" class="modal-error">{{ modalError }}</div>
      <div class="modal-actions">
        <n-button type="error" text class="delete-flavor" :loading="saving" @click="deleteFlavor">
          删除
        </n-button>
        <n-button @click="editVisible = false">取消</n-button>
        <n-button type="primary" :loading="saving" @click="saveEdit">保存</n-button>
      </div>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { NButton, NInput, NAlert, NModal } from 'naive-ui';
import { api, type Product, type ProductFlavor } from '../api/client';
import Field from '../components/Field.vue';

const route = useRoute();
const router = useRouter();
const productId = computed(() => Number(route.params.id));
const product = ref<Product | null>(null);
const saving = ref(false);
const error = ref('');
const notice = ref('');
const newFlavor = ref('');

const parseVisible = ref(false);
const parseText = ref('');
const parsing = ref(false);
const parsedRows = ref<Array<{ flavor: string }>>([]);
const modalError = ref('');

const editVisible = ref(false);
const editTarget = ref<ProductFlavor | null>(null);
const editFlavor = ref('');

async function load() {
  try {
    const res = await api.getProduct(productId.value);
    product.value = res.product;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败';
  }
}

async function addFlavor() {
  const flavor = newFlavor.value.trim();
  if (!flavor) {
    error.value = '请输入口味';
    return;
  }
  saving.value = true;
  error.value = '';
  notice.value = '';
  try {
    await api.createProductFlavor(productId.value, {
      flavor,
    });
    newFlavor.value = '';
    await load();
    notice.value = `已添加口味「${flavor}」`;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '添加口味失败';
  } finally {
    saving.value = false;
  }
}

function openParse() {
  parseText.value = '';
  parsedRows.value = [];
  modalError.value = '';
  notice.value = '';
  parseVisible.value = true;
}

function clearParse() {
  parseText.value = '';
  parsedRows.value = [];
  modalError.value = '';
}

function doParse() {
  parsing.value = true;
  modalError.value = '';
  try {
    const rows = parseText.value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((flavor) => ({ flavor }));
    if (rows.length === 0) {
      modalError.value = '没有解析到口味';
    }
    parsedRows.value = rows;
  } finally {
    parsing.value = false;
  }
}

function removeParsed(index: number) {
  parsedRows.value.splice(index, 1);
}

async function importParsed() {
  if (!product.value) return;
  modalError.value = '';
  const existing = new Set(product.value.flavors.map((item) => item.flavor));
  const seen = new Set<string>();
  const skipped: string[] = [];
  const rows: string[] = [];

  for (const row of parsedRows.value) {
    const flavor = row.flavor.trim();
    if (!flavor) continue;
    if (existing.has(flavor) || seen.has(flavor)) {
      skipped.push(flavor);
      continue;
    }
    seen.add(flavor);
    rows.push(flavor);
  }

  if (rows.length === 0) {
    modalError.value = skipped.length
      ? `这些口味都已存在：${skipped.join('、')}`
      : '没有可保存的口味';
    return;
  }

  saving.value = true;
  let saved = 0;
  try {
    for (const flavor of rows) {
      await api.createProductFlavor(productId.value, { flavor });
      saved += 1;
    }
    await load();
    parseVisible.value = false;
    error.value = '';
    notice.value = `已保存 ${saved} 个口味${
      skipped.length ? `，跳过已存在：${skipped.join('、')}` : ''
    }`;
  } catch (e) {
    await load();
    modalError.value = `已保存 ${saved} 个，失败：${
      e instanceof Error ? e.message : '保存失败'
    }`;
  } finally {
    saving.value = false;
  }
}

function openEdit(flavor: ProductFlavor) {
  editTarget.value = flavor;
  editFlavor.value = flavor.flavor;
  modalError.value = '';
  notice.value = '';
  editVisible.value = true;
}

async function saveEdit() {
  if (!product.value || !editTarget.value || saving.value) return;
  const flavor = editFlavor.value.trim();
  if (!flavor) {
    modalError.value = '请输入口味';
    return;
  }
  saving.value = true;
  modalError.value = '';
  try {
    await api.updateProductFlavor(product.value.id, editTarget.value.id, { flavor });
    editVisible.value = false;
    await load();
    error.value = '';
    notice.value = `已保存「${flavor}」`;
  } catch (e) {
    modalError.value = e instanceof Error ? e.message : '保存失败';
  } finally {
    saving.value = false;
  }
}

async function deleteFlavor() {
  if (!product.value || !editTarget.value || saving.value) return;
  const target = editTarget.value;
  if (!window.confirm(`确定删除口味「${target.flavor}」吗？`)) return;
  saving.value = true;
  modalError.value = '';
  try {
    await api.deleteProductFlavor(product.value.id, target.id);
    editVisible.value = false;
    await load();
    error.value = '';
    notice.value = `已删除口味「${target.flavor}」`;
  } catch (e) {
    modalError.value = e instanceof Error ? e.message : '删除失败';
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
.info-card {
  background: #ffffff;
  border-radius: 14px;
  padding: 10px 14px;
  box-shadow: 0 14px 28px -20px rgba(15, 35, 55, 0.3);
}
.info-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid #f2f4f7;
  font-size: 14px;
}
.info-row:last-child {
  border-bottom: none;
}
.info-row span {
  color: #8a96a3;
}
.info-row strong {
  color: #1f2d3d;
  text-align: right;
}
.stats-row {
  align-items: center;
  justify-content: center;
  gap: 56px;
}
.stat {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 6px;
  min-width: 0;
}
.stat strong {
  text-align: left;
}
.flavor-card {
  background: #ffffff;
  border-radius: 14px;
  padding: 4px 12px;
  margin-top: 12px;
  box-shadow: 0 14px 28px -20px rgba(15, 35, 55, 0.3);
}
.flavor-head,
.flavor-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr);
  gap: 6px;
  align-items: center;
}
.flavor-head {
  font-size: 11px;
  color: #9aa5b1;
  padding: 10px 0 8px;
  border-bottom: 1px solid #eef2f6;
}
.flavor-head span:nth-child(2),
.flavor-head span:nth-child(3),
.flavor-row .stock {
  text-align: center;
}
.flavor-row {
  padding: 10px 0;
  border-bottom: 1px solid #f2f4f7;
  font-size: 14px;
}
.flavor-name {
  font-weight: 600;
  color: #1f2d3d;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.stock {
  color: #6b7785;
  text-align: center;
}
.edit-btn {
  border: none;
  background: transparent;
  color: #1f6f6b;
  font-size: 12px;
  padding: 0;
  justify-self: center;
  cursor: pointer;
}
.add-flavor {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  margin-top: 12px;
}
.flavor-tools {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}
.parse-link {
  border: none;
  background: transparent;
  color: #1f6f6b;
  font-size: 13px;
  font-weight: 600;
  padding: 0;
  cursor: pointer;
}
.tool-hint {
  color: #9aa5b1;
  font-size: 11px;
}
.empty {
  color: #9aa5b1;
  font-size: 13px;
  padding: 10px 0;
}
.hint {
  margin-top: 12px;
  color: #8a96a3;
  font-size: 12px;
  line-height: 1.5;
}
.form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.parse-hint {
  color: #7b8794;
  font-size: 13px;
  margin-bottom: 10px;
  line-height: 1.5;
}
.parse-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}
.parsed-list {
  margin-top: 14px;
  border-top: 1px solid #f0f3f7;
  padding-top: 10px;
}
.parsed-head {
  font-size: 12px;
  color: #8a96a3;
  margin-bottom: 6px;
}
.parsed-head-row,
.parsed-row {
  display: grid;
  grid-template-columns: 1fr 26px;
  gap: 6px;
  align-items: center;
}
.parsed-head-row {
  font-size: 11px;
  color: #9aa5b1;
  margin-bottom: 6px;
}
.parsed-row {
  margin-bottom: 6px;
}
.parsed-num {
  min-width: 0;
}
.parsed-del {
  border: none;
  background: transparent;
  color: #9aa5b1;
  font-size: 18px;
  cursor: pointer;
}
.modal-error {
  margin-top: 10px;
  color: #d03050;
  font-size: 12px;
  line-height: 1.5;
}
.stock-target {
  font-size: 13px;
  color: #1f6f6b;
  background: #eef7f2;
  border-radius: 8px;
  padding: 8px 10px;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}
.delete-flavor {
  margin-right: auto;
}
</style>
