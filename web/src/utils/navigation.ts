import type { Router } from 'vue-router';

/** 返回上一页；没有站内历史时回到指定兜底页面 */
export function goBackOr(router: Router, fallback: string) {
  if (window.history.state && window.history.state.back) {
    router.back();
    return;
  }
  router.push(fallback);
}
