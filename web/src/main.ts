import { createApp } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import App from './App.vue';
import router from './router';

const pinia = createPinia();
setActivePinia(pinia);

createApp(App).use(pinia).use(router).mount('#app');
