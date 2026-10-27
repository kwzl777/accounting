<template>
  <div class="page">
    <div class="page-header">
      <n-button text aria-label="返回" @click="goBack">←</n-button>
      <h2>{{ customer?.name || '客户详情' }}</h2>
    </div>

    <div v-if="loading" class="empty">加载中...</div>

    <template v-else-if="customer">
      <div class="card">
        <div class="card-title">基本信息</div>
        <div class="form">
          <Field label="客户名字">
            <n-input v-model:value="editName" size="large" />
          </Field>
          <Field label="电话">
            <n-input v-model:value="editPhone" size="large" placeholder="选填" />
          </Field>
          <Field label="备注">
            <n-input v-model:value="editRemark" type="textarea" :rows="2" placeholder="选填" />
          </Field>
        </div>
        <div class="actions">
          <n-button type="primary" :loading="saving" @click="save">保存修改</n-button>
          <n-button type="error" :disabled="saving" @click="confirmDelete">删除客户</n-button>
        </div>
      </div>

      <div class="card">
        <div class="card-title">历史订单（{{ orders.length }}）</div>
        <div v-if="orders.length === 0" class="empty">该客户还没有出货记录</div>
        <div v-else class="orders">
          <div v-for="o in orders" :key="o.id" class="order-row">
            <div class="order-main">
              <div class="order-title">
                {{ o.product_name || '未知产品' }}<span v-if="o.flavor"> · {{ o.flavor }}</span>
              </div>
              <div class="order-sub">{{ o.date || '-' }} · {{ o.quantity }} 件 × ¥{{ o.unit_price }}</div>
            </div>
            <div class="order-amount">¥{{ money(o.sales_amount - o.waived_amount) }}</div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { NButton, NInput, useMessage, useDialog } from 'naive-ui';
import { api } from '../api/client';
import Field from '../components/Field.vue';

const route = useRoute();
const router = useRouter();
const message = useMessage();
const dialog = useDialog();

const loading = ref(false);
const saving = ref(false);
const customer = ref<{ id: number; name: string; phone: string | null; remark: string | null } | null>(null);
const orders = ref<Array<{
  id: number; date: string | null; product_name: string | null; flavor: string | null;
  quantity: number; unit_price: number; sales_amount: number; waived_amount: number;
  remark: string | null; batch_name: string | null;
}>>([]);
const editName = ref('');
const editPhone = ref('');
const editRemark = ref('');

function money(v: number) {
  return v.toFixed(2);
}

async function load() {
  const id = Number(route.params.id);
  loading.value = true;
  try {
    const res = await api.getCustomer(id);
    customer.value = res.customer;
    orders.value = res.orders;
    editName.value = res.customer.name;
    editPhone.value = res.customer.phone || '';
    editRemark.value = res.customer.remark || '';
  } catch (e) {
    message.error(e instanceof Error ? e.message : '加载失败');
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!customer.value) return;
  const name = editName.value.trim();
  if (!name) {
    message.warning('客户名字不能为空');
    return;
  }
  saving.value = true;
  try {
    await api.updateCustomer(customer.value.id, {
      name,
      phone: editPhone.value.trim(),
      remark: editRemark.value.trim(),
    });
    message.success('已保存');
    await load();
  } catch (e) {
    message.error(e instanceof Error ? e.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

function confirmDelete() {
  if (!customer.value) return;
  dialog.warning({
    title: '删除客户',
    content: `将删除客户「${customer.value.name}」的档案，历史订单记录会保留。确认删除？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await api.deleteCustomer(customer.value!.id);
        message.success('已删除');
        router.push('/customers');
      } catch (e) {
        message.error(e instanceof Error ? e.message : '删除失败');
      }
    },
  });
}

function goBack() {
  router.push('/customers');
}

onMounted(load);
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 16px;
  padding-bottom: 32px;
}
.card {
  background: #fff;
  border-radius: 14px;
  padding: 14px;
  margin-bottom: 12px;
  border: 1px solid #e8edf2;
}
.card-title {
  font-size: 15px;
  font-weight: 700;
  color: #1f2d3d;
  margin-bottom: 12px;
}
.form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.actions {
  display: flex;
  gap: 10px;
  margin-top: 14px;
}
.orders {
  display: flex;
  flex-direction: column;
}
.order-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 11px 0;
  border-bottom: 1px solid #f2f4f7;
}
.order-row:last-child {
  border-bottom: none;
}
.order-title {
  font-size: 14px;
  font-weight: 600;
  color: #1f2d3d;
}
.order-sub {
  font-size: 12px;
  color: #8a96a3;
  margin-top: 3px;
}
.order-amount {
  font-size: 15px;
  font-weight: 700;
  color: #1f6f6b;
}
.empty {
  text-align: center;
  color: #9aa5b1;
  padding: 20px 0;
  font-size: 13px;
}
</style>
