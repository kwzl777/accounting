<template>
  <div class="page">
    <!-- 顶部导航 -->
    <div class="nav">
      <button class="nav-back" aria-label="返回" @click="goBack">←</button>
      <div class="nav-title">
        <span class="nav-name">{{ batch?.name || '批次详情' }}</span>
        <span v-if="batch" class="nav-status">{{ batch.status }}</span>
      </div>
      <button class="nav-edit" @click="goEdit">编辑</button>
    </div>

    <!-- 功能入口（固定导航，跨页面可切换） -->
    <BatchTabs :batch-id="id" />

    <!-- 批次信息：只保留预计到达日期 -->
    <div class="card" v-if="batch">
      <div class="card-title">预计到达日期</div>
      <div class="date-edit">
        <n-input v-model:value="expectedArrivalDate" placeholder="YYYY-MM-DD" size="large" />
        <n-button type="primary" size="large" :loading="savingDate" @click="saveExpectedDate">
          保存
        </n-button>
      </div>
    </div>

    <!-- 预定产品清单 -->
    <div class="card">
      <div class="card-head">
        <span class="card-title">预定产品清单</span>
        <div class="card-actions">
          <button class="link-copy" @click="copyFlavorList">复制给客户</button>
          <button class="link-copy" @click="copyPlanList">复制给供应商</button>
          <button class="link-danger" @click="deleteAllPlans">一键删除</button>
        </div>
      </div>
      <div class="plan-summary">
        总数量 {{ totalQty }} · 总金额 ¥{{ totalAmount.toFixed(2) }} · 均价 ¥{{
          avgPrice.toFixed(2)
        }}
      </div>
      <div v-if="copyHint" class="copy-hint">{{ copyHint }}</div>

      <div class="plan-form">
        <label class="field-group flavor-input">
          <span class="field-label">口味</span>
          <n-input v-model:value="flavor" placeholder="例如：百香果" size="large" />
        </label>
        <label class="field-group">
          <span class="field-label">出货价（元）</span>
          <n-input v-model:value="unitPrice" placeholder="出货价" size="large" />
        </label>
        <n-button
          v-if="!editingPlan"
          class="parse-btn"
          type="tertiary"
          size="large"
          :disabled="saving"
          @click="openParse"
        >
          解析
        </n-button>
        <n-button
          v-if="!editingPlan"
          class="add-btn"
          type="primary"
          size="large"
          :loading="saving"
          @click="addPlan"
        >
          添加
        </n-button>
        <template v-else>
          <n-button class="add-btn" type="primary" size="large" :loading="saving" @click="updatePlan">
            保存
          </n-button>
          <n-button class="cancel-btn" size="large" :disabled="saving" @click="cancelEdit">
            取消
          </n-button>
        </template>
      </div>

      <div v-if="plans.length === 0" class="empty">暂无预定口味，可直接添加或点「解析」批量粘贴</div>
      <div v-else class="plan-table">
        <div class="plan-head">
          <span>口味</span>
          <span>预订总数</span>
          <span>出货价</span>
          <span>操作</span>
        </div>
        <div v-for="p in plans" :key="p.id" class="plan-row">
          <span class="plan-flavor" @click="startEdit(p)">{{ p.flavor }}</span>
          <span class="plan-qty" @click="openBookings(p)">{{ p.quantity }}</span>
          <span class="plan-price" @click="startEdit(p)">¥{{ p.unit_price }}</span>
          <div class="plan-ops">
            <button class="booking-btn" @click="openBookings(p)">预订人</button>
            <button class="plan-del" @click="removePlan(p)">删除</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 解析弹窗 -->
    <n-modal
      v-model:show="parseVisible"
      preset="card"
      title="解析粘贴内容"
      :bordered="false"
      :style="{ width: '92vw', maxWidth: '520px', borderRadius: '20px' }"
    >
      <div class="parse-hint">
        每行一条：口味 + 数量，例如「草莓 100」。也支持「草莓100」「草莓：100个」。
      </div>
      <Field label="粘贴内容">
        <n-input
          v-model:value="parseText"
          type="textarea"
          :rows="6"
          placeholder="粘贴文字，例如：
草莓 100
芒果 200"
        />
      </Field>
      <div class="parse-actions">
        <n-button type="primary" :loading="parsing" @click="doParse">解析</n-button>
        <n-button :disabled="parsing" @click="clearParse">清空</n-button>
      </div>

      <div v-if="parsedRows.length > 0" class="parsed-list">
        <div class="parsed-head">解析结果（可修改数量/出货价）</div>
        <div class="parsed-head-row">
          <span>口味</span>
          <span>数量</span>
          <span>出货价</span>
          <span></span>
        </div>
        <div v-for="(row, index) in parsedRows" :key="index" class="parsed-row">
          <span class="parsed-flavor">{{ row.flavor }}</span>
          <n-input v-model:value="row.quantity" placeholder="数量" size="small" class="parsed-num" />
          <n-input v-model:value="row.unitPrice" placeholder="出货价" size="small" class="parsed-num" />
          <button class="parsed-del" @click="removeParsed(index)">×</button>
        </div>
        <div class="parse-actions">
          <n-button type="primary" :loading="saving" @click="importParsed">
            导入 {{ parsedRows.length }} 条
          </n-button>
        </div>
      </div>
    </n-modal>
    <!-- 预订人弹窗 -->
    <n-modal
      v-model:show="bookingVisible"
      preset="card"
      :title="`预订人 - ${bookingPlan?.flavor ?? ''}`"
      :bordered="false"
      :style="{ width: '92vw', maxWidth: '480px', borderRadius: '20px' }"
    >
      <div class="booking-list">
        <div v-if="currentBookings.length === 0" class="empty">暂无预订人，请在下方添加</div>
        <div v-for="b in currentBookings" :key="b.id" class="booking-row">
          <span class="booking-name">{{ b.customer_name }}</span>
          <n-input
            v-model:value="bookingDrafts[b.id]"
            size="small"
            class="booking-qty"
            placeholder="数量"
          />
          <button v-if="isBookingDirty(b)" class="save-qty" @click="saveBooking(b)">保存</button>
          <button v-else class="plan-del" @click="deleteBooking(b)">删除</button>
        </div>
      </div>
      <div class="booking-add">
        <n-input v-model:value="newBookingName" placeholder="姓名" size="small" />
        <n-input v-model:value="newBookingQty" placeholder="数量" size="small" />
        <n-button type="primary" size="small" :loading="saving" @click="addBooking">添加</n-button>
      </div>
      <div class="hint">总预订数量 = 各预订人之和：{{ bookingTotal }}</div>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { NButton, NInput, NModal } from 'naive-ui';
import { api, type Batch, type Plan, type PlanBooking } from '../api/client';
import BatchTabs from '../components/BatchTabs.vue';
import Field from '../components/Field.vue';
import { copyText } from '../utils/clipboard';

const route = useRoute();
const router = useRouter();
const id = computed(() => Number(route.params.id));
const batch = ref<Batch | null>(null);
const plans = ref<Plan[]>([]);
const loading = ref(false);

const flavor = ref('');
const unitPrice = ref('0');
const saving = ref(false);
const copyHint = ref('');

const expectedArrivalDate = ref('');
const savingDate = ref(false);

const editingPlan = ref<Plan | null>(null);

const bookingsByPlan = ref<Record<number, PlanBooking[]>>({});
const bookingVisible = ref(false);
const bookingPlan = ref<Plan | null>(null);
const newBookingName = ref('');
const newBookingQty = ref('');
const bookingDrafts = ref<Record<number, string>>({});

const currentBookings = computed(() =>
  bookingPlan.value ? bookingsByPlan.value[bookingPlan.value.id] ?? [] : []
);

const bookingTotal = computed(() =>
  currentBookings.value.reduce(
    (sum, booking) => sum + (Number(bookingDrafts.value[booking.id]) || 0),
    0
  )
);

const parseVisible = ref(false);
const parseText = ref('');
const parsing = ref(false);
const parsedRows = ref<Array<{ flavor: string; quantity: string; unitPrice: string }>>([]);

const totalQty = computed(() =>
  plans.value.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0)
);
const totalAmount = computed(() =>
  plans.value.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
);
const avgPrice = computed(() => (totalQty.value > 0 ? totalAmount.value / totalQty.value : 0));

async function load() {
  loading.value = true;
  try {
    const detail = await api.getBatch(id.value);
    batch.value = detail.batch;
    plans.value = detail.plans;
    const grouped: Record<number, PlanBooking[]> = {};
    for (const booking of detail.bookings ?? []) {
      (grouped[booking.plan_id] ??= []).push(booking);
    }
    bookingsByPlan.value = grouped;
    expectedArrivalDate.value = detail.batch.expected_arrival_date ?? '';
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  flavor.value = '';
  unitPrice.value = '0';
}

async function addPlan() {
  if (!batch.value) return;
  saving.value = true;
  try {
    await api.createPlan(batch.value.id, {
      productName: '',
      flavor: flavor.value.trim(),
      quantity: 0,
      unitPrice: Number(unitPrice.value),
    });
    resetForm();
    await load();
  } catch (e) {
    console.error(e);
  } finally {
    saving.value = false;
  }
}

function startEdit(p: Plan) {
  editingPlan.value = p;
  flavor.value = p.flavor;
  unitPrice.value = String(p.unit_price);
}

function cancelEdit() {
  editingPlan.value = null;
  resetForm();
}

async function updatePlan() {
  if (!batch.value || !editingPlan.value) return;
  saving.value = true;
  try {
    await api.updatePlan(batch.value.id, editingPlan.value.id, {
      productName: '',
      flavor: flavor.value.trim(),
      unitPrice: Number(unitPrice.value),
    });
    editingPlan.value = null;
    resetForm();
    await load();
  } catch (e) {
    console.error(e);
  } finally {
    saving.value = false;
  }
}

async function removePlan(p: Plan) {
  if (!batch.value) return;
  if (!window.confirm(`确定删除「${p.flavor}」吗？`)) return;
  try {
    await api.deletePlan(batch.value.id, p.id);
    await load();
  } catch (e) {
    console.error(e);
  }
}

async function saveExpectedDate() {
  if (savingDate.value) return;
  savingDate.value = true;
  try {
    const updated = await api.updateBatch(id.value, {
      expectedArrivalDate: expectedArrivalDate.value.trim(),
    });
    batch.value = updated;
    expectedArrivalDate.value = updated.expected_arrival_date ?? '';
  } catch (e) {
    console.error(e);
  } finally {
    savingDate.value = false;
  }
}

function openParse() {
  parseVisible.value = true;
}

function clearParse() {
  parseText.value = '';
  parsedRows.value = [];
}

function parseTextLines(text: string): Array<{ flavor: string; quantity: number }> {
  const result: Array<{ flavor: string; quantity: number }> = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const match = line.match(
      /^(.*?)[\s:：,，、*xX×\-]*([0-9]+(?:\.[0-9]+)?)\s*(?:个|件|箱|包|份|斤|公斤|kg|KG)?$/
    );
    if (match) {
      const name = match[1].replace(/[\s:：,，、*xX×\-]+$/g, '').trim();
      const count = Number(match[2]);
      if (name && Number.isFinite(count)) {
        result.push({ flavor: name, quantity: count });
      } else if (!name && Number.isFinite(count)) {
        result.push({ flavor: line, quantity: 0 });
      }
      continue;
    }
    result.push({ flavor: line, quantity: 0 });
  }
  return result;
}

function doParse() {
  parsing.value = true;
  try {
    const rows = parseTextLines(parseText.value);
    parsedRows.value = rows.map((row) => ({
      flavor: row.flavor,
      quantity: String(row.quantity),
      unitPrice: '0',
    }));
  } finally {
    parsing.value = false;
  }
}

function removeParsed(index: number) {
  parsedRows.value.splice(index, 1);
}

async function importParsed() {
  if (!batch.value || parsedRows.value.length === 0) return;
  saving.value = true;
  try {
    for (const row of parsedRows.value) {
      if (!row.flavor.trim()) continue;
      await api.createPlan(batch.value.id, {
        productName: '',
        flavor: row.flavor.trim(),
        quantity: Number(row.quantity) || 0,
        unitPrice: Number(row.unitPrice) || 0,
      });
    }
    clearParse();
    parseVisible.value = false;
    await load();
  } catch (e) {
    console.error(e);
  } finally {
    saving.value = false;
  }
}

function openBookings(plan: Plan) {
  bookingPlan.value = plan;
  bookingVisible.value = true;
  newBookingName.value = '';
  newBookingQty.value = '';
  const drafts: Record<number, string> = {};
  for (const booking of bookingsByPlan.value[plan.id] ?? []) {
    drafts[booking.id] = String(booking.quantity);
  }
  bookingDrafts.value = drafts;
}

function isBookingDirty(booking: PlanBooking): boolean {
  const draft = bookingDrafts.value[booking.id];
  if (draft === undefined) return false;
  return Number(draft) !== Number(booking.quantity);
}

function refreshBookingPlan() {
  if (!bookingPlan.value) return;
  const current = plans.value.find((item) => item.id === bookingPlan.value?.id);
  if (current) openBookings(current);
}

async function addBooking() {
  if (!batch.value || !bookingPlan.value) return;
  const name = newBookingName.value.trim();
  if (!name) return;
  saving.value = true;
  try {
    await api.addPlanBooking(batch.value.id, bookingPlan.value.id, {
      customerName: name,
      quantity: Number(newBookingQty.value) || 0,
    });
    newBookingName.value = '';
    newBookingQty.value = '';
    await load();
    refreshBookingPlan();
  } catch (e) {
    console.error(e);
  } finally {
    saving.value = false;
  }
}

async function saveBooking(booking: PlanBooking) {
  if (!batch.value || !bookingPlan.value) return;
  saving.value = true;
  try {
    await api.updatePlanBooking(batch.value.id, bookingPlan.value.id, booking.id, {
      quantity: Number(bookingDrafts.value[booking.id]) || 0,
    });
    await load();
    refreshBookingPlan();
  } catch (e) {
    console.error(e);
  } finally {
    saving.value = false;
  }
}

async function deleteBooking(booking: PlanBooking) {
  if (!batch.value || !bookingPlan.value) return;
  if (!window.confirm(`确定删除「${booking.customer_name}」的预订吗？`)) return;
  try {
    await api.deletePlanBooking(batch.value.id, bookingPlan.value.id, booking.id);
    await load();
    refreshBookingPlan();
  } catch (e) {
    console.error(e);
  }
}

async function copyFlavorList() {
  if (plans.value.length === 0) {
    copyHint.value = '暂无口味可复制';
    return;
  }
  const lines = plans.value.map((plan) =>
    Number(plan.unit_price) > 0
      ? `${plan.flavor} ${String(Number(plan.unit_price))}元`
      : plan.flavor
  );
  const ok = await copyText(lines.join('\n'));
  copyHint.value = ok
    ? `已复制 ${lines.length} 个口味，可粘贴给客户`
    : '复制失败，请手动选择复制';
}

async function copyPlanList() {
  const ordered = plans.value.filter((plan) => Number(plan.quantity) > 0);
  if (ordered.length === 0) {
    copyHint.value = '暂无预订数量，请先登记预订人';
    return;
  }
  const lines = ordered.map((plan) => `${plan.flavor} ${plan.quantity}`);
  const ok = await copyText(lines.join('\n'));
  copyHint.value = ok
    ? `已复制 ${ordered.length} 个口味，可粘贴给供应商`
    : '复制失败，请手动选择复制';
}

async function deleteAllPlans() {
  if (!batch.value || plans.value.length === 0) return;
  if (!window.confirm(`确定删除全部 ${plans.value.length} 条预定口味吗？`)) return;
  saving.value = true;
  try {
    for (const plan of plans.value) {
      await api.deletePlan(batch.value.id, plan.id);
    }
    await load();
  } catch (e) {
    console.error(e);
  } finally {
    saving.value = false;
  }
}

function goBack() {
  router.push('/batches');
}

function goEdit() {
  router.push(`/batches/${id.value}/edit`);
}

function goShipments() {
  router.push(`/batches/${id.value}/shipments`);
}

function goExpenses() {
  router.push(`/batches/${id.value}/expenses`);
}

function goProfit() {
  router.push(`/batches/${id.value}/profit`);
}

function goDividend() {
  router.push(`/batches/${id.value}/dividend`);
}

onMounted(load);
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 0 16px 32px;
  background: linear-gradient(160deg, #eef3f8 0%, #e7eef6 55%, #eef3f8 100%);
}

/* 顶部导航（App 风格） */
.nav {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60px;
  gap: 10px;
  padding: 8px 0;
  background: linear-gradient(#eef3f8 72%, rgba(238, 243, 248, 0));
}
.nav-back {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 44px;
  height: 44px;
  border-radius: 12px;
  border: none;
  background: #ffffff;
  font-size: 30px;
  line-height: 1;
  color: #1f2d3d;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow:
    0 1px 2px rgba(15, 35, 55, 0.08),
    0 8px 16px -10px rgba(15, 35, 55, 0.35);
}
.nav-title {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  max-width: calc(100% - 150px);
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 2px;
  text-align: center;
}
.nav-name {
  font-size: 17px;
  font-weight: 700;
  color: #1f2d3d;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.nav-status {
  font-size: 11px;
  color: #1f6f6b;
  background: linear-gradient(145deg, #e6f6ef, #d2efe2);
  padding: 2px 8px;
  border-radius: 999px;
  white-space: nowrap;
}
.nav-edit {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  border: none;
  background: transparent;
  color: #2f9e7a;
  font-size: 15px;
  font-weight: 600;
  min-height: 44px;
  padding: 0 8px;
}

/* 卡片 */
.card {
  background: #ffffff;
  border-radius: 18px;
  padding: 14px;
  margin-top: 12px;
  border: 1px solid rgba(255, 255, 255, 0.75);
  box-shadow:
    0 1px 2px rgba(15, 35, 55, 0.04),
    0 14px 28px -20px rgba(15, 35, 55, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
}
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}
.card-title {
  font-size: 15px;
  font-weight: 700;
  color: #1f2d3d;
}
.card-sub {
  font-size: 11px;
  color: #9aa5b1;
}
.date-edit {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  align-items: center;
}
.date-edit :deep(.n-input) {
  flex: 1;
}

/* 预定清单 */
.plan-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 8px;
  margin-top: 12px;
  align-items: end;
}
.field-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.field-label {
  font-size: 11px;
  color: #8a96a3;
}
.flavor-input {
  grid-column: 1 / -1;
}
.parse-btn,
.add-btn,
.cancel-btn {
  min-width: 0;
}
.plan-summary {
  margin-top: 6px;
  font-size: 12px;
  color: #7b8794;
}
.plan-table {
  margin-top: 10px;
}
.plan-head {
  display: grid;
  grid-template-columns: 1fr 64px 64px 104px;
  gap: 8px;
  align-items: center;
  font-size: 11px;
  color: #9aa5b1;
  padding: 6px 0;
  border-bottom: 1px solid #eef2f6;
}
.plan-row {
  display: grid;
  grid-template-columns: 1fr 64px 64px 104px;
  gap: 8px;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid #f2f4f7;
}
.plan-head span:nth-child(2),
.plan-head span:nth-child(3),
.plan-row .plan-qty,
.plan-row .plan-price {
  text-align: right;
}
.plan-qty {
  color: #1f2d3d;
  font-weight: 600;
  cursor: pointer;
}
.plan-flavor {
  min-width: 0;
  font-weight: 600;
  color: #1f2d3d;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}
.qty-input {
  width: 100%;
}
.plan-price {
  color: #6b7785;
  font-size: 14px;
  white-space: nowrap;
  cursor: pointer;
}
.plan-ops {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}
.booking-btn {
  border: none;
  background: #eef7f2;
  color: #1f6f6b;
  border-radius: 9px;
  font-size: 12px;
  padding: 6px 8px;
  cursor: pointer;
  white-space: nowrap;
}
.plan-del {
  border: none;
  background: #fdecef;
  color: #d03050;
  border-radius: 9px;
  font-size: 12px;
  padding: 6px 8px;
  cursor: pointer;
  white-space: nowrap;
}
.save-qty {
  border: none;
  background: #e6f6ef;
  color: #1f6f6b;
  border-radius: 9px;
  font-size: 12px;
  padding: 6px 8px;
  cursor: pointer;
  font-weight: 600;
  white-space: nowrap;
}
.card-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.link-copy {
  border: none;
  background: transparent;
  color: #1f6f6b;
  font-size: 12px;
  cursor: pointer;
  padding: 4px 0;
  font-weight: 600;
}
.copy-hint {
  margin-top: 6px;
  color: #2f9e7a;
  font-size: 12px;
}
.link-danger {
  border: none;
  background: transparent;
  color: #d03050;
  font-size: 12px;
  cursor: pointer;
  padding: 4px 0;
}
.empty {
  color: #9aa5b1;
  padding: 12px 0;
  font-size: 13px;
}

/* 解析弹窗 */
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
.parsed-head-row {
  display: grid;
  grid-template-columns: 1fr 64px 64px 26px;
  gap: 6px;
  font-size: 11px;
  color: #9aa5b1;
  margin-bottom: 6px;
}
.parsed-row {
  display: grid;
  grid-template-columns: 1fr 64px 64px 26px;
  gap: 6px;
  align-items: center;
  margin-bottom: 6px;
}
.parsed-flavor {
  font-size: 14px;
  font-weight: 600;
  color: #1f2d3d;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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

/* 预订人弹窗 */
.booking-list {
  margin-bottom: 10px;
}
.booking-row {
  display: grid;
  grid-template-columns: 1fr 82px 56px;
  gap: 8px;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px solid #f2f4f7;
}
.booking-name {
  font-weight: 600;
  color: #1f2d3d;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.booking-qty {
  min-width: 0;
}
.booking-add {
  display: grid;
  grid-template-columns: 1fr 82px auto;
  gap: 8px;
  align-items: center;
  padding-top: 4px;
}

@media (min-width: 640px) {
  .plan-form {
    grid-template-columns: 2fr 1fr 1fr auto auto;
  }
  .flavor-input {
    grid-column: auto;
  }
}
</style>
