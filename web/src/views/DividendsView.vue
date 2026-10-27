<template>
  <div class="page">
    <div class="page-header">
      <n-button text aria-label="返回" @click="goHome">←</n-button>
      <h2>分红</h2>
    </div>

    <div v-if="loading" class="empty">加载中...</div>
    <n-empty v-else-if="items.length === 0" description="暂无分红记录" />
    <n-card
      v-for="d in items"
      :key="d.id"
      class="item"
      @click="goBatch(d.batch_id)"
    >
      <div class="head">
        <span class="name">{{ d.batch_name }}</span>
        <n-tag size="small" :type="d.status === 'confirmed' ? 'success' : 'default'">
          {{ d.status === 'confirmed' ? '已确认' : '草稿' }}
        </n-tag>
      </div>
      <div class="line">
        分红总额 {{ money(d.total_amount) }} · 已分配 {{ money(d.allocated_amount) }} · 未分配
        {{ money(d.unallocated_amount) }}
      </div>
      <div class="line">
        已兑付 {{ money(d.paid_amount) }} · 未兑付
        <span :class="{ warn: d.unpaid_amount > 0 }">{{ money(d.unpaid_amount) }}</span>
      </div>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { NCard, NButton, NTag, NEmpty } from 'naive-ui';
import { api, type DividendOverviewItem } from '../api/client';

const router = useRouter();
const items = ref<DividendOverviewItem[]>([]);
const loading = ref(false);

function money(value: number | undefined): string {
  const v = Number(value) || 0;
  return v < 0 ? '-¥' + Math.abs(v).toFixed(2) : '¥' + v.toFixed(2);
}

async function load() {
  loading.value = true;
  try {
    const res = await api.getDividendOverview();
    items.value = res.dividends;
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
}

function goHome() {
  router.push('/');
}

function goBatch(batchId: number) {
  router.push(`/batches/${batchId}/dividend`);
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
.item {
  margin-bottom: 12px;
  cursor: pointer;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.name {
  font-size: 16px;
  font-weight: 600;
}
.line {
  color: #555;
  font-size: 13px;
  margin-top: 6px;
}
.empty {
  color: #999;
  padding: 12px 0;
}
.warn {
  color: #d03050;
  font-weight: 600;
}
</style>
