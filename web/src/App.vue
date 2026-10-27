<template>
  <n-config-provider :theme-overrides="themeOverrides">
    <n-message-provider>
      <n-dialog-provider>
        <div class="app-shell" :class="{ 'has-tabbar': showTabBar }">
          <router-view v-slot="{ Component }">
            <transition name="page" mode="out-in">
              <component :is="Component" />
            </transition>
          </router-view>
          <TabBar v-if="showTabBar" />
        </div>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { NConfigProvider, NMessageProvider, NDialogProvider, type GlobalThemeOverrides } from 'naive-ui';
import TabBar from './components/TabBar.vue';

const route = useRoute();
const TAB_PATHS = ['/', '/products', '/customers', '/data'];
const showTabBar = computed(() => TAB_PATHS.some((p) => (p === '/' ? route.path === '/' : route.path === p || route.path.startsWith(p + '/'))));

const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#2f9e7a',
    primaryColorHover: '#38b385',
    primaryColorPressed: '#1f6f6b',
    primaryColorSuppl: '#2f9e7a',
    borderRadius: '12px',
    fontFamily:
      '"PingFang SC", "HarmonyOS Sans SC", "Hiragino Sans GB", "Microsoft YaHei", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: '16px',
  },
  Button: {
    borderRadiusTiny: '10px',
    borderRadiusSmall: '12px',
    borderRadiusMedium: '13px',
    borderRadiusLarge: '14px',
    heightTiny: '38px',
    heightSmall: '44px',
    heightMedium: '48px',
    heightLarge: '52px',
    fontWeight: '600',
  },
  Card: {
    borderRadius: '16px',
  },
  Input: {
    borderRadius: '12px',
    heightMedium: '48px',
    heightLarge: '52px',
  },
  Select: {
    peers: {
      InternalSelection: {
        borderRadius: '12px',
        heightMedium: '48px',
        heightLarge: '52px',
      },
    },
  },
};
</script>

<style>
* {
  box-sizing: border-box;
}
:root {
  --brand: #2f9e7a;
  --brand-hover: #38b385;
  --brand-dark: #1f6f6b;
  --brand-deep: #163a4a;
  --ink: #1f2d3d;
  --muted: #8a96a3;
  --line: #e8edf2;
  --surface: #ffffff;
  --radius: 16px;
  --shadow-card:
    0 1px 2px rgba(15, 35, 55, 0.04),
    0 16px 30px -22px rgba(15, 35, 55, 0.32);
  --app-bg:
    radial-gradient(1200px 600px at 8% -10%, rgba(56, 161, 105, 0.16), transparent 60%),
    radial-gradient(900px 520px at 110% 8%, rgba(44, 122, 123, 0.18), transparent 55%),
    linear-gradient(160deg, #eef3f8 0%, #e2eaf3 45%, #eef3f8 100%);
}
html,
body {
  margin: 0;
  padding: 0;
  min-height: 100%;
  background: #e7edf5;
  color: var(--ink);
  -webkit-text-size-adjust: 100%;
}
body {
  font-family:
    'PingFang SC', 'HarmonyOS Sans SC', 'Hiragino Sans GB', 'Microsoft YaHei',
    -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 16px;
  line-height: 1.55;
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
  overflow-x: hidden;
  padding-bottom: env(safe-area-inset-bottom);
}
/* 数字与金额用等宽数字，对齐不抖动 */
.money, .hero-value, .n-num, strong {
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum';
}
h1,
h2,
h3,
h4 {
  color: var(--ink);
  letter-spacing: 0;
}
button,
input,
textarea,
select {
  font-family: inherit;
  touch-action: manipulation;
}
button {
  -webkit-tap-highlight-color: transparent;
}
input::placeholder,
textarea::placeholder,
.n-input__placeholder {
  color: #9aa5b1 !important;
  opacity: 1 !important;
}
::selection {
  background: rgba(47, 158, 122, 0.22);
}
/* 手机 App 式容器：桌面端居中显示，移动端全宽 */
.app-shell {
  max-width: 720px;
  margin: 0 auto;
  min-height: 100vh;
  background: var(--app-bg);
  box-shadow: 0 0 60px rgba(15, 35, 55, 0.12);
}
.page,
.login-page {
  background: transparent !important;
}
.page {
  min-height: 100vh;
}
/* 统一手机端页面头部：标题居中，返回键 44px 触控区 */
.page-header {
  position: relative !important;
  display: flex !important;
  align-items: center !important;
  justify-content: flex-start !important;
  gap: 8px !important;
  min-height: 52px !important;
  margin-bottom: 12px !important;
}
.page-header > h2 {
  position: absolute !important;
  left: 50% !important;
  top: 50% !important;
  transform: translate(-50%, -50%) !important;
  margin: 0 !important;
  max-width: calc(100% - 170px) !important;
  color: var(--ink) !important;
  font-size: 19px !important;
  font-weight: 700 !important;
  line-height: 1.3 !important;
  text-align: center !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}
.page-header > .n-button:first-child {
  position: absolute !important;
  left: 0 !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
  width: 44px !important;
  min-width: 44px !important;
  height: 44px !important;
  min-height: 44px !important;
  padding: 0 !important;
  border: 1px solid rgba(255, 255, 255, 0.8) !important;
  border-radius: 13px !important;
  background: rgba(255, 255, 255, 0.8) !important;
  box-shadow: 0 4px 12px -8px rgba(15, 35, 55, 0.45) !important;
  backdrop-filter: blur(8px);
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  font-size: 30px !important;
  line-height: 1 !important;
}
.page-header > .n-button:first-child .n-button__content {
  font-size: 30px !important;
  line-height: 1 !important;
}
.page-header .n-button {
  min-height: 40px !important;
}
.page-header > :last-child:not(h2) {
  margin-left: auto !important;
}
/* 统一卡片、按钮与表单质感 */
.n-card {
  border-radius: var(--radius) !important;
  border: 1px solid rgba(255, 255, 255, 0.85) !important;
  background: rgba(255, 255, 255, 0.96) !important;
  box-shadow: var(--shadow-card) !important;
}
.page > .n-card + .n-card {
  margin-top: 12px !important;
}
.n-card-header__main {
  color: var(--ink) !important;
  font-size: 16px !important;
  font-weight: 700 !important;
}
.n-button {
  border-radius: 12px !important;
  font-weight: 600 !important;
  transition:
    transform 0.16s ease,
    background-color 0.16s ease,
    box-shadow 0.16s ease !important;
}
.n-button:not(.n-button--text-type):not(.n-button--disabled):active {
  transform: scale(0.98);
}
.n-input:not(.n-input--textarea) {
  border-radius: 10px;
}
.n-input .n-input__input-el,
.n-input .n-input__textarea-el {
  font-size: 15px;
}
.n-base-selection {
  border-radius: 10px !important;
}
.n-tag {
  border-radius: 999px !important;
  font-weight: 600;
}
.n-alert {
  border-radius: 12px !important;
}
@media (max-width: 480px) {
  .page,
  .login-page {
    padding-left: 16px !important;
    padding-right: 16px !important;
  }
  .n-card {
    border-radius: 14px !important;
  }
  .page-header > h2 {
    font-size: 18px !important;
  }
}
/* 有底部 TabBar 时给内容留位，避免最后一块被挡住 */
.app-shell.has-tabbar {
  padding-bottom: calc(64px + env(safe-area-inset-bottom));
}
/* 输入框字号 >=16px，防止 iOS 聚焦自动放大 */
.n-input .n-input__input-el,
.n-input .n-input__textarea-el {
  font-size: 16px;
}
/* 页面切换转场：手机 App 式淡入 */
.page-enter-active,
.page-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.page-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.page-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
/* 吸底主操作栏：表单页底部固定按钮 */
.bottom-bar {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: 0;
  width: 100%;
  max-width: 720px;
  padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-top: 1px solid var(--line);
  display: flex;
  gap: 10px;
  z-index: 900;
}
.bottom-bar .n-button {
  flex: 1;
  margin: 0;
}
</style>
