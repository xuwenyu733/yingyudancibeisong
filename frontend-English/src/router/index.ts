import { createRouter, createWebHistory } from 'vue-router'
import ChildView from '../views/ChildView.vue'
import HomeView from '../views/HomeView.vue'
import LibraryView from '../views/LibraryView.vue'
import LoginView from '../views/LoginView.vue'
import MemberView from '../views/MemberView.vue'
import ParentView from '../views/ParentView.vue'
import PartnerView from '../views/PartnerView.vue'
import ReportView from '../views/ReportView.vue'
import ResultView from '../views/ResultView.vue'
import StudyView from '../views/StudyView.vue'
import WrongView from '../views/WrongView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: LoginView, meta: { public: true, bare: true } },
    { path: '/', redirect: '/home' },
    { path: '/home', component: HomeView },
    { path: '/library', component: LibraryView },
    { path: '/wrong', component: WrongView },
    { path: '/partner', component: PartnerView },
    { path: '/parent', component: ParentView },
    { path: '/child', component: ChildView },
    { path: '/study', component: StudyView, meta: { bare: true } },
    { path: '/result', component: ResultView, meta: { bare: true } },
    { path: '/member', component: MemberView },
    { path: '/report', component: ReportView },
  ],
})

router.beforeEach((to) => {
  const token = localStorage.getItem('wq_token')
  if (!to.meta.public && !token) return '/login'
  if (to.path === '/login' && token) return '/home'
  return true
})

export default router
