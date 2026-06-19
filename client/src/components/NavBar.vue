<template>
  <header class="navbar">
    <RouterLink to="/" class="navbar-title">re-vlclone</RouterLink>
    <nav class="navbar-links">
      <RouterLink to="/history" class="nav-btn">History</RouterLink>
      <slot />
    </nav>
  </header>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";
</script>

<style scoped>
.navbar {
  padding: 20px 40px;
  background: #e50914;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.navbar-title {
  font-size: 1.8rem;
  color: white;
  font-weight: bold;
  text-decoration: none;
}
.nav-btn {
  color: white;
  text-decoration: none;
  font-size: 1rem;
  padding: 6px 14px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.2);
  transition: background 0.15s;
}
.nav-btn:hover {
  background: rgba(0, 0, 0, 0.35);
}
</style>
