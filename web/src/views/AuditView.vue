<template>
  <div class="page">
    <div class="page-header">
      <n-button text aria-label="返回" @click="goHome">←</n-button>
      <h2>修改记录</h2>
    </div>

    <n-card title="最近修改">
      <div v-if="logs.length === 0" class="empty">暂无修改记录</div>
      <div v-for="log in logs" :key="log.id" class="log">
        <div class="row">
          <span class="title">
            {{ entityLabel(log.entity) }} #{{ log.record_id ?? '-' }} · {{ actionLabel(log.action) }}
          </span>
          <span class="meta">{{ formatTime(log.created_at) }}</span>
        </div>
        <div v-if="log.before_json || log.after_json" class="details">
          <div v-if="log.before_json">
            <span class="label">修改前：</span>
            <pre>{{ pretty(log.before_json) }}</pre>
          </div>
          <div v-if="log.after_json">
            <span class="label">修改后：</span>
            <pre>{{ pretty(log.after_json) }}</pre>
          </div>
        </div>
      </div>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { NCard, NButton } from 'naive-ui';
import { api, type AuditLog } from '../api/client';

const router = useRouter();
const logs = ref<AuditLog[]>([]);

const ENTITY_LABELS: Record<string, string> = {
  batch: '批次',
  plan: '预定明细',
  arrival: '到货记录',
  shipment: '出货记录',
  receipt: '收款记录',
  expense: '费用',
  exchange: 'U币兑换',
  dividend: '分红',
  allocation: '出资记录',
  dividend_payment: '分红兑付',
};

const ACTION_LABELS: Record<string, string> = {
  create: '新增',
  update: '修改',
  delete: '删除',
  update_total: '修改分红总额',
  confirm: '确认分红',
  confirm_arrival: '确认到货',
};

function entityLabel(entity: string): string {
  return ENTITY_LABELS[entity] ?? entity;
}

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

function pretty(json: string): string {
  try {
    const parsed = JSON.parse(json);
    const text = JSON.stringify(parsed, null, 2);
    return text.length > 600 ? text.slice(0, 600) + '...' : text;
  } catch {
    return json;
  }
}

async function load() {
  try {
    const res = await api.getAuditLogs(200);
    logs.value = res.logs;
  } catch (e) {
    console.error(e);
  }
}

function goHome() {
  router.push('/');
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
.log {
  padding: 10px 0;
  border-bottom: 1px solid #f0f0f0;
}
.row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.title {
  font-weight: 600;
  font-size: 14px;
}
.meta {
  color: #888;
  font-size: 12px;
}
.details {
  margin-top: 6px;
}
.label {
  font-size: 12px;
  color: #888;
}
pre {
  background: #f7f8fa;
  padding: 8px;
  border-radius: 4px;
  font-size: 11px;
  overflow: auto;
  max-height: 180px;
  margin: 4px 0;
  white-space: pre-wrap;
  word-break: break-all;
}
.empty {
  color: #999;
  padding: 8px 0;
}
</style>
