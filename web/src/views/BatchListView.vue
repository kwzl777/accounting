<template>
  <div class="page">
    <div class="page-header">
      <h2>批次管理</h2>
      <div class="header-actions">
        <n-button text @click="goHome">首页</n-button>
        <n-button type="primary" @click="goCreate">新建批次</n-button>
      </div>
    </div>
    <div v-if="loading" class="loading">加载中...</div>
    <n-empty v-else-if="batches.length === 0" description="暂无批次，点击右上角新建批次" />
    <n-card
      v-for="b in batches"
      :key="b.id"
      class="batch-card"
      @click="goDetail(b.id)"
    >
      <div class="batch-name">{{ b.name }}</div>
      <div class="batch-meta">状态：{{ b.status }} · 日期：{{ b.date || '-' }}</div>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { NCard, NEmpty, NButton } from 'naive-ui';
import { api, type Batch } from '../api/client';

const router = useRouter();
const batches = ref<Batch[]>([]);
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    batches.value = await api.getBatches();
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
}

function goCreate() {
  router.push('/batches/new');
}

function goHome() {
  router.push('/');
}

function goDetail(id: number) {
  router.push(`/batches/${id}`);
}

onMounted(load);
</script>

<style scoped>
.page {
  padding: 16px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.batch-card {
  margin-bottom: 12px;
  cursor: pointer;
}
.batch-name {
  font-size: 18px;
  font-weight: 600;
}
.batch-meta {
  margin-top: 8px;
  color: #888;
}
</style>
