import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import LoginView from '../views/Login.vue';

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean;
    public?: boolean;
  }
}

const routes = [
  { path: '/login', component: LoginView, meta: { public: true } },
  { path: '/', component: () => import('../views/Home.vue'), meta: { requiresAuth: true } },
  { path: '/batches', redirect: '/' },
  { path: '/batches/new', redirect: '/' },
  { path: '/batches/:id/edit', redirect: '/' },
  { path: '/batches/:id', redirect: '/' },
  { path: '/batches/:id/shipments', component: () => import('../views/ShipmentView.vue'), meta: { requiresAuth: true } },
  { path: '/batches/:id/expenses', component: () => import('../views/ExpensesView.vue'), meta: { requiresAuth: true } },
  { path: '/batches/:id/profit', component: () => import('../views/ProfitView.vue'), meta: { requiresAuth: true } },
  { path: '/batches/:id/dividend', component: () => import('../views/DividendView.vue'), meta: { requiresAuth: true } },
  { path: '/dividends', component: () => import('../views/DividendsView.vue'), meta: { requiresAuth: true } },
  { path: '/customers', component: () => import('../views/CustomersView.vue'), meta: { requiresAuth: true } },
  { path: '/customers/debts', component: () => import('../views/CustomerDebtsView.vue'), meta: { requiresAuth: true } },
  { path: '/customers/:id', component: () => import('../views/CustomerDetailView.vue'), meta: { requiresAuth: true } },
  { path: '/history/shipments', component: () => import('../views/ShipmentHistoryView.vue'), meta: { requiresAuth: true } },
  { path: '/history', component: () => import('../views/HistoryView.vue'), meta: { requiresAuth: true } },
  { path: '/audit', component: () => import('../views/AuditView.vue'), meta: { requiresAuth: true } },
  { path: '/data', component: () => import('../views/DataView.vue'), meta: { requiresAuth: true } },
  { path: '/products', component: () => import('../views/ProductsView.vue'), meta: { requiresAuth: true } },
  { path: '/inventory', component: () => import('../views/InventoryView.vue'), meta: { requiresAuth: true } },
  { path: '/profit-detail', component: () => import('../views/ProfitDetailView.vue'), meta: { requiresAuth: true } },
  { path: '/products/:id/preorder', component: () => import('../views/PreorderFormView.vue'), meta: { requiresAuth: true } },
  { path: '/products/:id/preorder/:preorderId', component: () => import('../views/PreorderFormView.vue'), meta: { requiresAuth: true } },
  { path: '/products/:id/booked', component: () => import('../views/BookedView.vue'), meta: { requiresAuth: true } },
  { path: '/products/:id/stock-in', component: () => import('../views/StockInView.vue'), meta: { requiresAuth: true } },
  { path: '/products/:id', component: () => import('../views/ProductDetailView.vue'), meta: { requiresAuth: true } },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.meta.requiresAuth && !auth.token) {
    return { path: '/login', query: { redirect: to.fullPath } };
  }
  if (to.meta.public && auth.token) {
    return { path: '/' };
  }
  return true;
});

export default router;
