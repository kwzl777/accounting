<template>
  <div class="page">
    <div class="page-header">
      <n-button text aria-label="返回" @click="goBack">←</n-button>
      <h2>{{ isEdit ? '编辑批次' : '新建批次' }}</h2>
    </div>
    <n-card>
      <n-form size="large">
        <n-form-item label="批次名称">
          <n-input v-model:value="name" placeholder="请输入批次名称" />
        </n-form-item>
        <n-form-item label="日期">
          <n-input v-model:value="date" placeholder="如 2026-10-20" />
        </n-form-item>
        <n-form-item label="预计到达日期">
          <n-input v-model:value="expectedArrivalDate" placeholder="如 2026-10-28" />
        </n-form-item>
        <n-form-item label="备注">
          <n-input v-model:value="remark" type="textarea" placeholder="备注（可选）" />
        </n-form-item>
        <n-form-item>
          <n-button type="primary" :loading="saving" @click="onSave">保存</n-button>
          <n-button :disabled="saving" @click="goBack">取消</n-button>
        </n-form-item>
      </n-form>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { NCard, NForm, NFormItem, NInput, NButton } from 'naive-ui';
import { api } from '../api/client';
import type { Batch } from '../api/client';

const route = useRoute();
const router = useRouter();
const isEdit = computed(() => !!route.params.id);
const id = computed(() => Number(route.params.id));
const name = ref('');
const date = ref('');
const expectedArrivalDate = ref('');
const remark = ref('');
const saving = ref(false);

onMounted(async () => {
  if (route.params.id) {
    const detail = await api.getBatch(id.value);
    name.value = detail.batch.name;
    date.value = detail.batch.date ?? '';
    expectedArrivalDate.value = detail.batch.expected_arrival_date ?? '';
    remark.value = detail.batch.remark ?? '';
  }
});

async function onSave() {
  if (saving.value) return;
  saving.value = true;
  try {
    if (route.params.id) {
      const input: { name: string; date?: string; expectedArrivalDate?: string; remark?: string } = {
        name: name.value.trim(),
      };
      if (date.value) input.date = date.value;
      if (expectedArrivalDate.value) input.expectedArrivalDate = expectedArrivalDate.value;
      if (remark.value) input.remark = remark.value;
      await api.updateBatch(id.value, input);
      router.push(`/batches/${id.value}`);
    } else {
      const created = await api.createBatch({
        name: name.value.trim(),
        date: date.value || undefined,
        expectedArrivalDate: expectedArrivalDate.value || undefined,
        remark: remark.value || undefined,
      });
      router.push(`/batches/${created.id}`);
    }
  } catch (e) {
    console.error(e);
  } finally {
    saving.value = false;
  }
}

function goBack() {
  if (route.params.id) {
    router.push(`/batches/${id.value}`);
  } else {
    router.push('/batches');
  }
}
</script>

<style scoped>
.page {
  padding: 16px;
}
</style>
