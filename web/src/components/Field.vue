<template>
  <div class="field-wrap">
    <span class="field-label">{{ label }}</span>
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{ label: string }>();
</script>

<style scoped>
.field-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.field-label {
  font-size: 11px;
  color: #8a96a3;
  line-height: 1.2;
}
</style>
