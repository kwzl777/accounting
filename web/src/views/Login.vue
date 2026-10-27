<template>
  <div class="login-page">
    <n-card class="login-card" title="个人经营账本">
      <n-form size="large">
        <n-form-item label="密码">
          <n-input
            v-model:value="password"
            type="password"
            placeholder="请输入密码"
            @keyup.enter="onSubmit"
          />
        </n-form-item>
        <div style="text-align: center; margin-top: 8px">
          <n-button type="primary" size="large" :loading="loading" @click="onSubmit">
            登 录
          </n-button>
        </div>
      </n-form>
      <n-alert v-if="error" type="error" :show-icon="true" :title="error" style="margin-top: 16px" />
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { NCard, NForm, NFormItem, NInput, NButton, NAlert } from 'naive-ui';
import { useAuthStore } from '../stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const password = ref('');
const loading = ref(false);
const error = ref('');

async function onSubmit() {
  if (loading.value) return;
  if (!password.value) {
    error.value = '请输入密码';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    await auth.login('admin', password.value);
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/';
    router.push(redirect);
  } catch (e) {
    error.value = e instanceof Error ? e.message : '登录失败，请稍后重试';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f7fa;
}
.login-card {
  width: 100%;
  max-width: 360px;
}
.login-card :deep(.n-card-header) {
  justify-content: center;
}
</style>
