<template>
  <div class="page">
    <div class="page-header">
      <n-button text aria-label="返回" @click="goHome">←</n-button>
      <h2>更多 / 数据</h2>
    </div>

    <n-alert v-if="error" type="error" :title="error" style="margin-bottom: 12px" />
    <n-alert v-if="message" type="success" :title="message" style="margin-bottom: 12px" />

    <n-card title="导出">
      <div class="actions">
        <n-button type="primary" :loading="busy" @click="exportExcel">导出 Excel</n-button>
        <n-button :loading="busy" @click="downloadBackup">下载备份（JSON）</n-button>
      </div>
      <div class="hint">
        Excel 包含批次汇总、预定/到货、出货收款、费用、U 币兑换、分红明细。备份文件不包含密码或认证信息。
      </div>
    </n-card>

    <n-card title="恢复备份">
      <input
        ref="fileInput"
        type="file"
        accept=".json,application/json"
        style="display: none"
        @change="onFileChange"
      />
      <div class="actions">
        <n-button type="warning" :loading="busy" @click="pickFile">选择备份文件并恢复</n-button>
      </div>
      <div class="hint">
        恢复会覆盖当前全部账本数据（不会修改登录密码），操作前请先下载当前备份。
      </div>
    </n-card>

    <n-card title="查询与记录">
      <div class="actions">
        <n-button @click="go('/history')">历史查询</n-button>
        <n-button @click="go('/audit')">修改记录</n-button>
      </div>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { NCard, NButton, NAlert } from 'naive-ui';
import { api } from '../api/client';

const router = useRouter();
const fileInput = ref<HTMLInputElement | null>(null);
const busy = ref(false);
const error = ref('');
const message = ref('');

function goHome() {
  router.push('/');
}

function go(path: string) {
  router.push(path);
}

async function exportExcel() {
  busy.value = true;
  error.value = '';
  message.value = '';
  try {
    await api.downloadExcel();
    message.value = 'Excel 已开始下载';
  } catch (e) {
    error.value = e instanceof Error ? e.message : '导出失败';
  } finally {
    busy.value = false;
  }
}

async function downloadBackup() {
  busy.value = true;
  error.value = '';
  message.value = '';
  try {
    await api.downloadBackup();
    message.value = '备份已开始下载';
  } catch (e) {
    error.value = e instanceof Error ? e.message : '下载失败';
  } finally {
    busy.value = false;
  }
}

function pickFile() {
  fileInput.value?.click();
}

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  busy.value = true;
  error.value = '';
  message.value = '';
  try {
    const text = await file.text();
    const payload = JSON.parse(text) as { data?: unknown };
    if (!payload.data) {
      throw new Error('备份文件格式不正确');
    }
    if (!window.confirm('恢复备份将覆盖当前全部账本数据（不会修改登录密码），确定继续吗？')) {
      return;
    }
    await api.restoreBackup(payload);
    message.value = '恢复完成，建议刷新页面查看最新数据';
  } catch (e) {
    error.value = e instanceof Error ? e.message : '恢复失败';
  } finally {
    busy.value = false;
    input.value = '';
  }
}
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
.actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.hint {
  margin-top: 10px;
  color: #888;
  font-size: 13px;
}
</style>
