import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'Dashboard',
    component: () => import('../views/Dashboard.vue')
  },
  {
    path: '/manual',
    name: 'Manual',
    component: () => import('../views/ManualPicker.vue')
  },
  {
    path: '/records',
    name: 'Records',
    component: () => import('../views/Records.vue')
  },
  {
    path: '/community',
    name: 'Community',
    component: () => import('../views/Community.vue')
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
