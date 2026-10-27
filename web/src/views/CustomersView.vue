<template>
  <div class="page">
    <div class="page-header">
      <h2>客户管理</h2>
    </div>

    <div class="toolbar">
      <n-input
        v-model:value="keyword"
        placeholder="搜索客户名字"
        size="large"
        clearable
      />
      <n-button type="primary" size="large" @click="showCreate = true">新增</n-button>
    </div>

    <div v-if="loading" class="empty">加载中...</div>
    <div v-else-if="filtered.length === 0" class="empty">
      {{ keyword ? '没有匹配的客户' : '还没有客户，点右上角新增' }}
    </div>

    <div v-else class="list">
      <button
        v-for="c in filtered"
        :key="c.id"
        type="button"
        class="customer-card"
        @click="goDetail(c.id)"
      >
        <div class="main">
          <div class="name">{{ c.name }}</div>
          <div v-if="c.phone" class="sub">{{ c.phone }}</div>
        </div>
        <div class="meta">
          <div v-if="c.remaining > 0" class="debt">欠款 ¥{{ money(c.remaining) }}</div>
          <div v-else class="settled">已结清</div>
          <div class="count">{{ c.order_count }} 单 · {{ c.last_order_date || '无交易' }}</div>
        </div>
      </button>
    </div>

    <n-modal v-model:show="showCreate" preset="card" title="新增客户" style="max-width: 420px">
      <div class="form">
        <Field label="客户名字">
          <n-input v-model:value="newName" placeholder="必填" size="large" />
        </Field>
        <Field label="电话">
          <n-input v-model:value="newPhone" placeholder="选填" size="large" />
        </Field>
        <Field label="备注">
          <n-input v-model:value="newRemark" type="textarea" :rows="2" placeholder="选填" />
        </Field>
      </div>
      <div class="modal-actions">
        <n-button @click="showCreate = false">取消</n-button>
        <n-button type="primary" :loading="creating" @click="createCustomer">保存</n-button>
      </div>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { NButton, NInput, NModal, useMessage } from 'naive-ui';
import { api } from '../api/client';
import Field from '../components/Field.vue';

const router = useRouter();
const message = useMessage();

const loading = ref(false);
const customers = ref<Array<{
  id: number; name: string; phone: string | null; remark: string | null;
  order_count: number; net_sales: number; remaining: number; last_order_date: string | null;
}>>([]);
const keyword = ref('');
const showCreate = ref(false);
const creating = ref(false);
const newName = ref('');
const newPhone = ref('');
const newRemark = ref('');

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  if (!kw) return customers.value;
  return customers.value.filter((c) => c.name.toLowerCase().includes(kw));
});

function money(v: number) {
  return v.toFixed(2);
}

async function load() {
  loading.value = true;
  try {
    const res = await api.getCustomers();
    customers.value = res.customers;
  } catch (e) {
    message.error(e instanceof Error ? e.message : '加载失败');
  } finally {
    loading.value = false;
  }
}

async function createCustomer() {
  const name = newName.value.trim();
  if (!name) {
    message.warning('请输入客户名字');
    return;
  }
  creating.value = true;
  try {
    await api.createCustomer({ name, phone: newPhone.value.trim(), remark: newRemark.value.trim() });
    showCreate.value = false;
    newName.value = '';
    newPhone.value = '';
    newRemark.value = '';
    await load();
  } catch (e) {
    message.error(e instanceof Error ? e.message : '创建失败');
  } finally {
    creating.value = false;
  }
}

function goDetail(id: number) {
  router.push(`/customers/${id}`);
}

onMounted(load);
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 16px;
  padding-bottom: 32px;
}
.toolbar {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
}
.toolbar .n-input {
  flex: 1;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.customer-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: #fff;
  border: 1px solid #e8edf2;
  border-radius: 14px;
  padding: 14px 16px;
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.15s ease;
}
.customer-card:active {
  transform: scale(0.98);
}
.main .name {
  font-size: 16px;
  font-weight: 700;
  color: #1f2d3d;
}
.main .sub {
  font-size: 13px;
  color: #8a96a3;
  margin-top: 3px;
}
.meta {
  text-align: right;
}
.debt {
  color: #d03050;
  font-weight: 700;
  font-size: 15px;
}
.settled {
  color: #2f9e7a;
  font-weight: 600;
  font-size: 14px;
}
.count {
  font-size: 12px;
  color: #8a96a3;
  margin-top: 3px;
}
.empty {
  text-align: center;
  color: #9aa5b1;
  padding: 40px 0;
  font-size: 14px;
}
.form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}
</style>
