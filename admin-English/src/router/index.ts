import { createRouter, createWebHistory } from 'vue-router'
import { useSessionStore } from '../stores/session'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      component: () => import('../layouts/AdminLayout.vue'),
      children: [
        { path: '', redirect: '/dashboard' },
        {
          path: 'dashboard',
          name: 'dashboard',
          component: () => import('../views/DashboardView.vue'),
        },
        {
          path: 'catalog',
          name: 'catalog',
          component: () => import('../views/CatalogView.vue'),
        },
        {
          path: 'users',
          name: 'users',
          component: () => import('../views/UsersView.vue'),
        },
        {
          path: 'orders',
          name: 'orders',
          component: () => import('../views/OrdersView.vue'),
        },
        {
          path: 'tasks',
          name: 'tasks',
          component: () => import('../views/TasksView.vue'),
        },
        {
          path: 'shop',
          name: 'shop',
          component: () => import('../views/ShopView.vue'),
        },
        {
          path: 'plans',
          name: 'plans',
          component: () => import('../views/PlansView.vue'),
        },
        {
          path: 'admins',
          name: 'admins',
          component: () => import('../views/AdminsView.vue'),
          meta: { superOnly: true },
        },
        {
          path: 'audits',
          name: 'audits',
          component: () => import('../views/AuditsView.vue'),
          meta: { superOnly: true },
        },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
  ],
})

router.beforeEach((to) => {
  const session = useSessionStore()
  if (to.meta.public) {
    if (session.isLoggedIn && to.path === '/login') return '/dashboard'
    return true
  }
  if (!session.isLoggedIn) return '/login'
  if (to.meta.superOnly && !session.isSuper) {
    session.flash('当前账号无权限访问该页面')
    return '/dashboard'
  }
  return true
})

export default router
