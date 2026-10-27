<template>
  <div class="batch-tabs">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      class="tab"
      :class="{ active: tab.key === active }"
      @click="go(tab.key)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';

const props = defineProps<{ batchId: number; active?: string }>();
const router = useRouter();

const tabs = [
  { key: 'shipments', label: '出货' },
  { key: 'expenses', label: '费用' },
  { key: 'profit', label: '利润' },
  { key: 'dividend', label: '分红' },
];

function go(key: string) {
  router.replace(`/batches/${props.batchId}/${key}`);
}
</script>

<style scoped>
.batch-tabs {
  position: sticky;
  top: 0;
  z-index: 30;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  padding: 8px 0;
  margin: 0 0 8px;
  background: linear-gradient(rgba(242, 245, 249, 0.97), rgba(242, 245, 249, 0.88));
  backdrop-filter: blur(8px);
}
.tab {
  border: 1px solid rgba(255, 255, 255, 0.85);
  padding: 11px 4px;
  border-radius: 12px;
  background: #ffffff;
  font-size: 13px;
  font-weight: 600;
  color: #3d4a59;
  cursor: pointer;
  white-space: nowrap;
  box-shadow:
    0 1px 2px rgba(15, 35, 55, 0.05),
    0 10px 18px -14px rgba(15, 35, 55, 0.35);
  transition: transform 0.16s ease, background 0.16s ease, box-shadow 0.16s ease;
}
.tab.active {
  color: #ffffff;
  background: linear-gradient(135deg, #2f9e7a, #1f6f6b);
  border-color: transparent;
  box-shadow: 0 10px 20px -12px rgba(47, 158, 122, 0.85);
}
.tab:active {
  transform: scale(0.97);
}
</style>
