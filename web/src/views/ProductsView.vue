<template>
  <div class="page">
    <div class="page-header">
      <n-button text aria-label="返回" @click="goHome">←</n-button>
      <h2>仓库管理</h2>
      <n-button type="primary" size="small" @click="openAdd">添加产品</n-button>
    </div>

    <n-alert v-if="error" type="error" :title="error" style="margin-bottom: 12px" />

    <div v-if="products.length === 0" class="empty-card">暂无产品，点右上角「添加产品」</div>

    <div v-else class="warehouse-table">
      <div class="warehouse-head">
        <span>产品</span>
        <span>库存数量</span>
        <span>操作</span>
      </div>
      <template v-for="product in products" :key="product.id">
        <div class="warehouse-row">
          <span class="product-name-wrap">
            <span class="product-name" @click="goDetail(product.id)">{{ product.name }}</span>
            <button
              v-if="transitOrderCount(product.id) > 0"
              class="transit-link"
              type="button"
              @click="toggleShipmentList(product.id)"
            >
              在途订单 {{ transitOrderCount(product.id) }}
              <span class="transit-chevron">
                {{ shipmentsOpen[product.id] ? '▾' : '▸' }}
              </span>
            </button>
          </span>
          <button
            class="product-stock"
            :class="{ zero: product.stock <= 0 }"
            :disabled="product.stock <= 0"
            @click="goDetail(product.id)"
          >
            {{ product.stock }}
          </button>
          <span class="product-ops">
            <button
              class="op-btn"
              :class="{ 'op-shipped': bookedLabel(product) === '已发' }"
              @click="goBooked(product.id)"
            >
              {{ bookedLabel(product) }}
            </button>
            <button class="op-btn" @click="goPreorder(product.id)">预定</button>
          </span>
        </div>
        <div v-if="shipmentsOpen[product.id]" class="shipment-list">
          <div
            v-for="shipment in visibleShipments(product.id)"
            :id="'shipment-' + shipment.id"
            :key="shipment.id"
            class="shipment-block"
          >
          <div class="shipment-head">
            <button class="shipment-toggle" type="button" @click="toggleShipment(shipment)">
              <span>发货结算 · {{ shipment.ship_date }}</span>
              <span class="shipment-summary" :class="{ 'status-danger': isUnsettled(shipment) }">
                {{ settlementStatus(shipment) }}-<span class="status-shipped">已发</span>
              </span>
            </button>
            <div class="shipment-head-actions">
              <button class="head-btn" type="button" @click="goStockIn(shipment.product_id)">
                入库
              </button>
              <button
                class="head-btn"
                type="button"
                :disabled="shipment.batch_id === null"
                @click="goShipmentOutbound(shipment)"
              >
                出货
              </button>
            </div>
            <button
              class="shipment-chevron-btn"
              type="button"
              @click="toggleShipment(shipment)"
            >
              {{ expandedShipmentId === shipment.id ? "▾" : "▸" }}
            </button>
          </div>
          <div v-if="completionHint(shipment)" class="shipment-debt">
            {{ completionHint(shipment) }}
          </div>
          <div
            v-if="expandedShipmentId === shipment.id && shipmentForms[shipment.id]"
            class="shipment-body"
          >
            <div class="shipment-section">
              <div class="section-head">
                <div class="shipment-section-title">货款</div>
              </div>
              <div class="shipment-meta">
                <div><span>日期</span><strong>{{ shipment.ship_date }}</strong></div>
                <div><span>总数量</span><strong>{{ shipment.total_quantity }}</strong></div>
              </div>
              <div class="shipment-grid">
                <Field label="进货价（元）">
                  <n-input v-model:value="shipmentForms[shipment.id].unitPrice" placeholder="进货价" />
                </Field>
                <div class="field-with-action">
                  <Field label="运费（元）">
                    <n-input v-model:value="shipmentForms[shipment.id].freight" placeholder="运费" />
                  </Field>
                  <n-button
                    size="small"
                    :loading="calculatingShipment === shipment.id"
                    @click="calcShipment(shipment)"
                  >
                    计算
                  </n-button>
                </div>
              </div>
              <div class="shipment-results">
                <div class="result-row formula-row">
                  <span>应付人民币</span>
                  <div class="formula-amount">
                    <span class="formula-line">
                      {{ shipment.total_quantity }} × {{ shipmentForms[shipment.id].unitPrice || 0 }} + 运费 {{ shipmentForms[shipment.id].freight || 0 }} =
                    </span>
                    <strong>{{ money(resultOf(shipment).rmb_amount) }}</strong>
                  </div>
                </div>
                <div class="rate-row">
                  <div class="field-with-action">
                    <Field label="汇率（人民币兑美金）">
                      <n-input
                        v-model:value="shipmentForms[shipment.id].exchangeRate"
                        placeholder="如 7.10"
                      />
                    </Field>
                    <n-button
                      size="small"
                      :loading="calculatingShipment === shipment.id"
                      @click="calcShipment(shipment)"
                    >
                      计算
                    </n-button>
                  </div>
                  <div class="usd-result">
                    <span>转换成美金</span>
                    <strong>{{ uText(resultOf(shipment).u_amount) }}</strong>
                  </div>
                </div>
              </div>
            </div>

            <div class="shipment-section">
              <div class="section-head">
                <div class="shipment-section-title">汇率损耗</div>
                <n-button size="small" @click="openLoss(shipment)">兑换</n-button>
              </div>
              <div class="result-row">
                <span>汇率损耗（人民币）</span>
                <strong :class="{ warn: (resultOf(shipment).exchange_loss ?? 0) > 0 }">
                  {{
                    resultOf(shipment).exchange_loss === null
                      ? "-"
                      : money(resultOf(shipment).exchange_loss)
                  }}
                </strong>
              </div>
            </div>

            <div class="shipment-section">
              <div class="shipment-section-title">付款</div>
              <div class="shipment-grid">
                <div class="field-with-action">
                  <Field label="已付 U">
                    <n-input v-model:value="shipmentForms[shipment.id].uPaid" placeholder="已付 U" />
                  </Field>
                  <n-button
                    size="small"
                    :loading="calculatingShipment === shipment.id"
                    @click="calcShipment(shipment)"
                  >
                    计算
                  </n-button>
                </div>
              </div>
              <div class="shipment-results">
                <div class="result-row">
                  <span>未付 / 多付</span>
                  <strong :class="{ 'status-danger': resultOf(shipment).unpaid_u > 0.004 }">
                    {{ paymentStatus(shipment) }}
                  </strong>
                </div>
                <div class="result-row total cost-row">
                  <span>进货成本</span>
                  <div class="formula-amount">
                    <span class="formula-line">
                      {{ shipment.total_quantity }} × {{ shipmentForms[shipment.id].unitPrice || 0 }} + 运费 {{ shipmentForms[shipment.id].freight || 0 }} + 损耗 {{ resultOf(shipment).exchange_loss ?? 0 }} =
                    </span>
                    <strong>{{ money(resultOf(shipment).cost_amount) }}</strong>
                  </div>
                </div>
              </div>
              <div v-if="shipment.payments.length > 0" class="payment-history">
                <div class="payment-history-title">结款记录</div>
                <div v-for="payment in shipment.payments" :key="payment.id" class="payment-row">
                  <span>{{ paymentTime(payment.created_at) }}</span>
                  <strong>{{ uText(payment.amount) }} U</strong>
                </div>
              </div>
              <div v-if="shipment.unpaid_u > 0.004" class="payment-actions">
                <n-button size="small" type="primary" ghost @click="openPayment(shipment)">
                  继续结款（未付 {{ uText(shipment.unpaid_u) }} U）
                </n-button>
              </div>
              <div class="shipment-note">进货成本 = 货款 + 运费 + 汇率损耗</div>
            </div>

            <div v-if="shipment.details" class="shipment-section">
              <button class="details-toggle" type="button" @click="toggleDetails(shipment.id)">
                <span class="shipment-section-title">客户明细</span>
                <span class="shipment-chevron">
                  {{ expandedDetails[shipment.id] ? "▾" : "▸" }}
                </span>
              </button>
              <div v-if="expandedDetails[shipment.id]" class="shipment-table-wrap">
                <div
                  v-if="shipment.details.customers.some((customer) => customer.unit_price)"
                  class="agent-prices"
                >
                  <span
                    v-for="customer in shipment.details.customers"
                    :key="customer.name"
                  >
                    {{ customer.name }}
                    <template v-if="customer.unit_price">· 出货价 {{ uText(customer.unit_price) }} 元</template>
                  </span>
                </div>
                <table class="shipment-table">
                  <thead>
                    <tr>
                      <th>口味</th>
                      <th v-for="customer in shipment.details.customers" :key="customer.name">
                        {{ customer.name }}-{{ customer.total }}
                      </th>
                      <th>总数</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in shipment.details.rows" :key="row.flavor">
                      <td>{{ row.flavor }}</td>
                      <td v-for="(cell, index) in row.cells" :key="index">{{ cell }}</td>
                      <td>{{ row.total }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div class="shipment-actions">
              <n-button
                type="primary"
                :loading="savingShipment === shipment.id"
                @click="saveShipment(shipment)"
              >
                保存结算
              </n-button>
            </div>
          </div>
        </div>
        </div>
      </template>
    </div>

    <div class="hint">库存 = 入库 − 出货；点库存数量或产品名称查看口味明细，库存为 0 时不可点。</div>

    <button class="history-entry" type="button" @click="goShipmentHistory">
      <span class="history-entry-text">
        <span class="history-entry-title">历史出货</span>
        <span class="history-entry-sub">查看已完成出货记录</span>
      </span>
      <span class="history-entry-arrow">›</span>
    </button>

    <!-- 添加产品 -->
    <n-modal
      v-model:show="addVisible"
      preset="card"
      title="添加产品"
      :bordered="false"
      :style="modalStyle"
    >
      <div class="form">
        <Field label="产品名">
          <n-input v-model:value="form.name" placeholder="如：西瓜" />
        </Field>
        <Field label="备注">
          <n-input v-model:value="form.remark" placeholder="备注（可选）" />
        </Field>
      </div>
      <div class="modal-actions">
        <n-button @click="addVisible = false">取消</n-button>
        <n-button type="primary" :loading="saving" @click="saveProduct">保存</n-button>
      </div>
    </n-modal>

    <!-- 汇率损耗计算 -->
    <n-modal
      v-model:show="lossVisible"
      preset="card"
      title="汇率损耗"
      :bordered="false"
      :style="{ width: '92vw', maxWidth: '460px', borderRadius: '20px' }"
    >
      <div class="form">
        <Field label="人民币金额">
          <n-input v-model:value="lossRmb" placeholder="填入人民币金额" />
        </Field>
        <Field label="买进汇率">
          <n-input v-model:value="lossBuyRate" placeholder="如 7.20" />
        </Field>
        <Field label="卖出汇率">
          <n-input v-model:value="lossSellRate" placeholder="如 7.10" />
        </Field>
      </div>
      <div class="loss-formula">
        亏损 = 人民币金额 ×（买进汇率 − 卖出汇率）÷ 买进汇率
      </div>
      <div class="loss-result-line">
        <span>亏损人民币</span>
        <strong :class="{ warn: (lossResult ?? 0) > 0 }">
          {{ lossResult === null ? '-' : money(lossResult) }}
        </strong>
      </div>
      <div v-if="lossError" class="modal-error">{{ lossError }}</div>
      <div class="modal-actions">
        <n-button @click="lossVisible = false">取消</n-button>
        <n-button :loading="lossCalculating" @click="calcLoss">计算</n-button>
        <n-button type="primary" :disabled="lossResult === null" @click="confirmLoss">
          确认
        </n-button>
      </div>
    </n-modal>

    <!-- 继续结款 -->
    <n-modal
      v-model:show="paymentVisible"
      preset="card"
      title="继续结款"
      :bordered="false"
      :style="{ width: '92vw', maxWidth: '420px', borderRadius: '20px' }"
    >
      <div class="loss-formula">
        当前未付：{{ uText(paymentTarget?.unpaid_u ?? 0) }} U
      </div>
      <Field label="本次结款（U）">
        <n-input v-model:value="paymentAmount" placeholder="填写本次结款 U" />
      </Field>
      <div v-if="paymentError" class="modal-error">{{ paymentError }}</div>
      <div class="modal-actions">
        <n-button @click="paymentVisible = false">取消</n-button>
        <n-button type="primary" :loading="paymentSaving" @click="savePayment">
          确认结款
        </n-button>
      </div>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { NButton, NInput, NModal, NAlert } from 'naive-ui';
import { api, type Product, type ProductShipment } from '../api/client';
import Field from '../components/Field.vue';

interface SettlementDraft {
  unitPrice: string;
  freight: string;
  exchangeRate: string;
  exchangeLoss: string;
  buyRate: string;
  sellRate: string;
  uPaid: string;
}

const router = useRouter();
const products = ref<Product[]>([]);
const saving = ref(false);
const error = ref('');
const shipments = ref<Record<number, ProductShipment[]>>({});
const shipmentForms = ref<Record<number, SettlementDraft>>({});
const shipmentPreviews = ref<Record<number, SettlementResult>>({});
const expandedShipmentId = ref<number | null>(null);
const expandedDetails = ref<Record<number, boolean>>({});
const shipmentsOpen = ref<Record<number, boolean>>({});
const savingShipment = ref<number | null>(null);
const calculatingShipment = ref<number | null>(null);

interface SettlementResult {
  rmb_amount: number;
  u_amount: number;
  exchange_loss: number | null;
  unpaid_u: number;
  cost_amount: number;
}

const lossVisible = ref(false);
const lossShipmentId = ref<number | null>(null);
const lossRmb = ref('');
const lossBuyRate = ref('');
const lossSellRate = ref('');
const lossResult = ref<number | null>(null);
const lossError = ref('');
const lossCalculating = ref(false);

const paymentVisible = ref(false);
const paymentShipmentId = ref<number | null>(null);
const paymentAmount = ref('');
const paymentSaving = ref(false);
const paymentError = ref('');

const paymentTarget = computed(() =>
  paymentShipmentId.value ? getShipmentById(paymentShipmentId.value) : undefined
);

const modalStyle = { width: '92vw', maxWidth: '460px', borderRadius: '20px' };

const addVisible = ref(false);
const form = ref({ name: '', remark: '' });

function goHome() {
  router.push('/');
}

function goDetail(id: number) {
  router.push(`/products/${id}`);
}

function openAdd() {
  form.value = { name: '', remark: '' };
  addVisible.value = true;
}

function draftFromShipment(shipment: ProductShipment): SettlementDraft {
  return {
    unitPrice: String(shipment.unit_price),
    freight: String(shipment.freight),
    exchangeRate: shipment.exchange_rate === null ? '' : String(shipment.exchange_rate),
    exchangeLoss: String(shipment.exchange_loss ?? 0),
    buyRate: shipment.buy_rate === null ? '' : String(shipment.buy_rate),
    sellRate: shipment.sell_rate === null ? '' : String(shipment.sell_rate),
    uPaid: String(shipment.u_paid),
  };
}

async function load() {
  try {
    const [res, shipRes] = await Promise.all([
      api.getProducts(),
      api.getProductShipments(),
    ]);
    products.value = res.products;
    const map: Record<number, ProductShipment[]> = {};
    const forms: Record<number, SettlementDraft> = {};
    for (const shipment of shipRes.shipments) {
      (map[shipment.product_id] ??= []).push(shipment);
      forms[shipment.id] = draftFromShipment(shipment);
    }
    shipments.value = map;
    shipmentForms.value = forms;
    shipmentPreviews.value = {};
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败';
  }
}

async function saveProduct() {
  const name = form.value.name.trim();
  if (!name) {
    error.value = '请输入产品名';
    return;
  }
  saving.value = true;
  error.value = '';
  try {
    await api.createProduct({
      name,
      remark: form.value.remark.trim() || undefined,
    });
    addVisible.value = false;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败';
  } finally {
    saving.value = false;
  }
}

function goPreorder(id: number) {
  router.push(`/products/${id}/preorder`);
}

function goBooked(id: number) {
  router.push(`/products/${id}/booked`);
}

function goStockIn(id: number) {
  router.push(`/products/${id}/stock-in`);
}

function goShipmentOutbound(shipment: ProductShipment) {
  if (shipment.batch_id !== null) {
    router.push(`/batches/${shipment.batch_id}/shipments`);
  }
}

function toggleShipment(shipment: ProductShipment) {
  expandedShipmentId.value =
    expandedShipmentId.value === shipment.id ? null : shipment.id;
  if (!shipmentForms.value[shipment.id]) {
    shipmentForms.value[shipment.id] = draftFromShipment(shipment);
  }
}

function transitOrderCount(productId: number): number {
  return visibleShipments(productId).length;
}

function visibleShipments(productId: number): ProductShipment[] {
  return (shipments.value[productId] ?? []).filter(
    (shipment) => !isShipmentComplete(shipment)
  );
}

function goShipmentHistory() {
  router.push('/history/shipments');
}

function toggleShipmentList(productId: number) {
  shipmentsOpen.value = {
    ...shipmentsOpen.value,
    [productId]: !shipmentsOpen.value[productId],
  };
}

function toggleDetails(shipmentId: number) {
  expandedDetails.value = {
    ...expandedDetails.value,
    [shipmentId]: !expandedDetails.value[shipmentId],
  };
}

function openLoss(shipment: ProductShipment) {
  const form = shipmentForms.value[shipment.id] ?? draftFromShipment(shipment);
  shipmentForms.value = { ...shipmentForms.value, [shipment.id]: form };
  lossShipmentId.value = shipment.id;
  const currentResult = resultOf(shipment);
  lossRmb.value =
    currentResult.rmb_amount > 0 ? String(currentResult.rmb_amount) : '';
  lossBuyRate.value = form.buyRate;
  lossSellRate.value = form.sellRate;
  lossResult.value =
    form.exchangeLoss !== '' && Number.isFinite(Number(form.exchangeLoss))
      ? Number(form.exchangeLoss)
      : null;
  lossError.value = '';
  lossVisible.value = true;
}

async function calcLoss() {
  lossError.value = '';
  const rmbAmount = Number(lossRmb.value);
  const buyRate = Number(lossBuyRate.value);
  const sellRate = Number(lossSellRate.value);
  if (!Number.isFinite(rmbAmount) || rmbAmount < 0) {
    lossError.value = '请输入人民币金额';
    return;
  }
  if (!Number.isFinite(buyRate) || buyRate <= 0) {
    lossError.value = '请输入买进汇率';
    return;
  }
  if (!Number.isFinite(sellRate) || sellRate <= 0) {
    lossError.value = '请输入卖出汇率';
    return;
  }
  lossCalculating.value = true;
  try {
    const res = await api.calcExchangeLoss({ rmbAmount, buyRate, sellRate });
    lossResult.value = res.loss;
    if (res.loss === null) lossError.value = '无法计算，请检查汇率';
  } catch (e) {
    lossError.value = e instanceof Error ? e.message : '计算失败';
  } finally {
    lossCalculating.value = false;
  }
}

async function confirmLoss() {
  if (lossShipmentId.value === null || lossResult.value === null) {
    lossError.value = '请先计算亏损金额';
    return;
  }
  const shipmentId = lossShipmentId.value;
  const form = shipmentForms.value[shipmentId];
  if (!form) return;
  const nextForm = {
    ...form,
    exchangeLoss: String(lossResult.value),
    buyRate: lossBuyRate.value.trim(),
    sellRate: lossSellRate.value.trim(),
  };
  shipmentForms.value = { ...shipmentForms.value, [shipmentId]: nextForm };
  lossVisible.value = false;
  const shipment = getShipmentById(shipmentId);
  if (shipment) await calcShipment(shipment);
}

function getShipmentById(shipmentId: number): ProductShipment | undefined {
  for (const list of Object.values(shipments.value)) {
    const found = list.find((item) => item.id === shipmentId);
    if (found) return found;
  }
  return undefined;
}

function numberOrZero(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rateOrNull(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function settlementPayload(form: SettlementDraft) {
  return {
    unitPrice: numberOrZero(form.unitPrice),
    freight: numberOrZero(form.freight),
    exchangeRate: rateOrNull(form.exchangeRate),
    exchangeLoss: numberOrZero(form.exchangeLoss),
    buyRate: rateOrNull(form.buyRate),
    sellRate: rateOrNull(form.sellRate),
    fee: 0,
    uPaid: numberOrZero(form.uPaid),
  };
}

function applyShipmentUpdate(shipment: ProductShipment) {
  const list = (shipments.value[shipment.product_id] ?? []).map((item) =>
    item.id === shipment.id ? shipment : item
  );
  shipments.value = { ...shipments.value, [shipment.product_id]: list };
  shipmentForms.value = {
    ...shipmentForms.value,
    [shipment.id]: draftFromShipment(shipment),
  };
  const previews = { ...shipmentPreviews.value };
  delete previews[shipment.id];
  shipmentPreviews.value = previews;
}

async function calcShipment(shipment: ProductShipment) {
  const form = shipmentForms.value[shipment.id];
  if (!form) return;
  calculatingShipment.value = shipment.id;
  error.value = '';
  try {
    const res = await api.calcProductShipment(
      shipment.product_id,
      shipment.id,
      settlementPayload(form)
    );
    shipmentPreviews.value = {
      ...shipmentPreviews.value,
      [shipment.id]: res.result,
    };
  } catch (e) {
    error.value = e instanceof Error ? e.message : '计算失败';
  } finally {
    calculatingShipment.value = null;
  }
}

async function saveShipment(shipment: ProductShipment) {
  const form = shipmentForms.value[shipment.id];
  if (!form) return;
  savingShipment.value = shipment.id;
  error.value = '';
  try {
    const res = await api.updateProductShipment(
      shipment.product_id,
      shipment.id,
      settlementPayload(form)
    );
    applyShipmentUpdate(res.shipment);
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败';
  } finally {
    savingShipment.value = null;
  }
}

function money(value: number | null | undefined): string {
  const amount = Number(value) || 0;
  return '¥' + amount.toFixed(2);
}

function uText(value: number | null | undefined): string {
  return (Number(value) || 0).toFixed(2);
}

function resultOf(shipment: ProductShipment): SettlementResult {
  return (
    shipmentPreviews.value[shipment.id] ?? {
      rmb_amount: shipment.rmb_amount,
      u_amount: shipment.u_amount,
      exchange_loss: shipment.exchange_loss,
      unpaid_u: shipment.unpaid_u,
      cost_amount: shipment.cost_amount,
    }
  );
}

function settlementStatus(shipment: ProductShipment): string {
  if (shipment.unit_price <= 0 || shipment.exchange_rate === null) {
    return '待结算';
  }
  if (shipment.unpaid_u > 0.004) return '未结算完';
  if (shipment.unpaid_u < -0.004) return `多付 ${uText(Math.abs(shipment.unpaid_u))} U`;
  return '已结清';
}

function isUnsettled(shipment: ProductShipment): boolean {
  return (
    shipment.unit_price > 0 &&
    shipment.exchange_rate !== null &&
    shipment.unpaid_u > 0.004
  );
}

function paymentStatus(shipment: ProductShipment): string {
  const result = resultOf(shipment);
  if (result.unpaid_u > 0.004) return `未结算完（未付 ${uText(result.unpaid_u)} U）`;
  if (result.unpaid_u < -0.004) return `多付 ${uText(Math.abs(result.unpaid_u))} U`;
  return '已结清';
}

function paymentTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${month}-${day} ${hour}:${minute}`;
}

function openPayment(shipment: ProductShipment) {
  paymentShipmentId.value = shipment.id;
  paymentAmount.value = String(roundQty(shipment.unpaid_u));
  paymentError.value = '';
  paymentVisible.value = true;
}

async function savePayment() {
  if (paymentShipmentId.value === null || paymentSaving.value) return;
  const amount = Number(paymentAmount.value);
  if (!Number.isFinite(amount) || amount <= 0) {
    paymentError.value = '请输入结款金额';
    return;
  }
  const shipment = getShipmentById(paymentShipmentId.value);
  if (!shipment) return;
  paymentSaving.value = true;
  paymentError.value = '';
  try {
    const res = await api.addShipmentPayment(
      shipment.product_id,
      shipment.id,
      amount
    );
    applyShipmentUpdate(res.shipment);
    paymentVisible.value = false;
  } catch (e) {
    paymentError.value = e instanceof Error ? e.message : '结款失败';
  } finally {
    paymentSaving.value = false;
  }
}

function roundQty(value: number): number {
  return Math.round(value * 100) / 100;
}

function isShipmentSettled(shipment: ProductShipment): boolean {
  return (
    shipment.unit_price > 0 &&
    shipment.exchange_rate !== null &&
    shipment.unpaid_u <= 0.004
  );
}

function isShipmentComplete(shipment: ProductShipment): boolean {
  return (
    isShipmentSettled(shipment) &&
    Number(shipment.customer_allocation_count ?? 0) > 0 &&
    Number(shipment.customer_unpaid ?? 0) <= 0.004
  );
}

function completionHint(shipment: ProductShipment): string {
  if (!isShipmentSettled(shipment)) return '';
  if (Number(shipment.customer_allocation_count ?? 0) <= 0) {
    return '尚未分货，暂不算完成出货';
  }
  const unpaid = Number(shipment.customer_unpaid ?? 0);
  if (unpaid > 0.004) {
    return `客户未收齐 ${money(unpaid)}，暂不算完成出货`;
  }
  return '';
}

function bookedLabel(product: Product): string {
  if (product.preorder_count > 0) return '已定';
  const list = shipments.value[product.id] ?? [];
  if (list.length === 0) return '已定';
  return list.some((shipment) => !isShipmentSettled(shipment)) ? '已发' : '已结清';
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
.warehouse-table {
  background: #ffffff;
  border-radius: 14px;
  padding: 4px 12px;
  box-shadow: 0 14px 28px -20px rgba(15, 35, 55, 0.3);
}
.warehouse-head,
.warehouse-row {
  display: grid;
  grid-template-columns: 1fr 60px 120px;
  gap: 6px;
  align-items: center;
}
.warehouse-head {
  font-size: 11px;
  color: #9aa5b1;
  padding: 10px 0 8px;
  border-bottom: 1px solid #eef2f6;
}
.warehouse-head span:nth-child(2) {
  text-align: center;
}
.warehouse-row {
  padding: 12px 0;
  border-bottom: 1px solid #f2f4f7;
}
.warehouse-row:last-child {
  border-bottom: none;
}
.product-name {
  font-weight: 600;
  color: #1f2d3d;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.product-name-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.product-name-wrap .product-name {
  min-width: 0;
}
.transit-link {
  border: none;
  border-radius: 999px;
  background: #eef7f2;
  color: #1f6f6b;
  padding: 2px 6px;
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
  cursor: pointer;
}
.transit-link:active {
  background: #d9efe4;
}
.transit-chevron {
  margin-left: 2px;
  font-size: 10px;
}
.shipment-list {
  padding-top: 4px;
}
.product-stock {
  text-align: center;
  font-weight: 700;
  color: #1f6f6b;
  border: none;
  background: transparent;
  padding: 0;
  font-family: inherit;
  font-size: inherit;
  cursor: pointer;
}
.product-stock.zero {
  color: #b0b8c1;
  font-weight: 500;
  cursor: default;
}
.product-stock:not(.zero) {
  text-decoration: underline;
  text-underline-offset: 2px;
}
.product-stock:disabled {
  cursor: default;
}
.product-ops {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}
.op-btn {
  border: none;
  background: #eef7f2;
  color: #1f6f6b;
  border-radius: 8px;
  font-size: 12px;
  padding: 7px 9px;
  cursor: pointer;
  white-space: nowrap;
}
.op-btn:active {
  background: #d9efe4;
}
.op-shipped {
  color: #d03050;
  background: #fdecef;
}
.shipment-block {
  border-bottom: 1px solid #f2f4f7;
  padding: 0 0 10px;
}
.shipment-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  background: #f7fbf9;
}
.shipment-debt {
  margin: 6px 10px 0;
  color: #d03050;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
}
.shipment-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex: 1;
  min-width: 0;
  padding: 2px 0;
  border: none;
  background: transparent;
  color: #1f6f6b;
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}
.shipment-head-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
.head-btn {
  border: none;
  border-radius: 8px;
  background: #eef7f2;
  color: #1f6f6b;
  font-size: 12px;
  padding: 6px 8px;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
}
.head-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.shipment-chevron-btn {
  border: none;
  background: transparent;
  color: #1f6f6b;
  font-size: 14px;
  width: 26px;
  height: 32px;
  padding: 0;
  cursor: pointer;
}
.shipment-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
.shipment-chevron {
  font-size: 13px;
}
.shipment-body {
  margin-top: 10px;
  padding: 12px;
  border-radius: 12px;
  background: #f9fbfc;
}
.shipment-section {
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px solid #eef2f6;
  border-radius: 10px;
  background: #ffffff;
}
.shipment-section:first-child {
  margin-top: 0;
}
.shipment-section-title {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 700;
  color: #1f2d3d;
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.section-head .shipment-section-title {
  margin-bottom: 0;
}
.formula-row {
  align-items: center;
}
.formula-amount {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex: 1;
  min-width: 0;
}
.formula-line {
  margin: 0;
  color: #b06a3b;
  font-size: 12px;
  white-space: nowrap;
}
.formula-amount strong {
  white-space: nowrap;
}
.field-with-action {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  min-width: 0;
}
.field-with-action :deep(.field-wrap) {
  flex: 1;
  min-width: 0;
}
.field-with-action :deep(.n-button) {
  min-height: 34px;
}
.status-danger {
  color: #d03050 !important;
  font-weight: 700;
}
.status-shipped {
  color: #d03050;
  font-weight: 700;
}
.payment-history {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px dashed #e6edf5;
}
.payment-history-title {
  margin-bottom: 4px;
  color: #8a96a3;
  font-size: 11px;
}
.payment-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 4px 0;
  color: #3d4a59;
  font-size: 12px;
}
.payment-row strong {
  color: #1f6f6b;
}
.payment-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}
.cost-row {
  align-items: center;
}
.rate-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: end;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed #e6edf5;
}
.usd-result {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  padding-bottom: 4px;
}
.usd-result span {
  color: #8a96a3;
  font-size: 11px;
}
.usd-result strong {
  color: #1f6f6b;
  font-size: 16px;
}
.details-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}
.details-toggle .shipment-section-title {
  margin-bottom: 0;
}
.loss-formula {
  margin-top: 10px;
  color: #8a96a3;
  font-size: 11px;
  line-height: 1.5;
}
.loss-result-line {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed #e6edf5;
  font-size: 14px;
}
.loss-result-line span {
  color: #8a96a3;
}
.loss-result-line strong {
  color: #1f2d3d;
}
.modal-error {
  margin-top: 10px;
  color: #d03050;
  font-size: 12px;
  line-height: 1.5;
}
.shipment-table-wrap {
  margin-top: 4px;
  overflow-x: auto;
}
.agent-prices {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-bottom: 6px;
  padding: 6px 8px;
  border-radius: 8px;
  background: #f8fafc;
  color: #8a96a3;
  font-size: 11px;
}
.shipment-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.shipment-table th,
.shipment-table td {
  padding: 6px 8px;
  border: 1px solid #e6edf5;
  text-align: center;
  white-space: nowrap;
  color: #1f2d3d;
}
.shipment-table th {
  background: #f6f9fc;
  font-weight: 600;
}
.shipment-meta {
  display: flex;
  gap: 18px;
  margin-bottom: 10px;
  font-size: 12px;
  color: #8a96a3;
}
.shipment-meta strong {
  margin-left: 4px;
  color: #1f2d3d;
}
.shipment-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.shipment-results {
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px dashed #e6edf5;
}
.result-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 5px 0;
  font-size: 13px;
}
.result-row span {
  color: #8a96a3;
}
.result-row strong {
  color: #1f2d3d;
}
.result-row.total {
  margin-top: 4px;
  padding-top: 8px;
  border-top: 1px solid #e6edf5;
  font-weight: 700;
}
.warn {
  color: #d03050 !important;
}
.shipment-note {
  margin-top: 8px;
  font-size: 11px;
  line-height: 1.5;
  color: #9aa5b1;
}
.shipment-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}
.shipment-actions :deep(.n-button) {
  min-height: 40px;
}
.empty-card {
  margin-top: 12px;
  background: #ffffff;
  border-radius: 14px;
  padding: 24px;
  text-align: center;
  color: #9aa5b1;
  box-shadow: 0 14px 28px -20px rgba(15, 35, 55, 0.3);
}
.hint {
  margin-top: 12px;
  color: #8a96a3;
  font-size: 12px;
  line-height: 1.5;
}
.history-entry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-height: 64px;
  margin-top: 12px;
  padding: 10px 16px;
  border: 1px solid #e8edf2;
  border-radius: 14px;
  background: #ffffff;
  text-align: left;
  cursor: pointer;
  box-shadow:
    0 1px 2px rgba(15, 35, 55, 0.04),
    0 14px 28px -22px rgba(15, 35, 55, 0.3);
}
.history-entry:active {
  background: #f7fbf9;
}
.history-entry-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.history-entry-title {
  color: #1f2d3d;
  font-size: 15px;
  font-weight: 700;
}
.history-entry-sub {
  color: #8a96a3;
  font-size: 12px;
}
.history-entry-arrow {
  color: #8a96a3;
  font-size: 22px;
  line-height: 1;
}
.form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}
.pick-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pick-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border: 1px solid #e6edf5;
  background: #ffffff;
  border-radius: 10px;
  padding: 12px 14px;
  font-size: 14px;
  cursor: pointer;
}
.pick-item:active {
  background: #eef7f2;
}
.pick-name {
  font-weight: 600;
  color: #1f2d3d;
}
.pick-stock {
  color: #7b8794;
  font-size: 12px;
}
.pick-empty {
  color: #9aa5b1;
  font-size: 13px;
  text-align: center;
  padding: 16px 0;
}
</style>
