import { createRouter, createWebHistory } from "vue-router";
import Home from "./pages/Home.vue";
import History from "./pages/History.vue";
import Watch from "./pages/Watch.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: Home },
    { path: "/watch/:id", component: Watch },
    { path: "/history", component: History },
  ],
});

export default router;
