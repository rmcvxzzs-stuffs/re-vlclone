<template>
  <div id="app">
    <NavBar />
    <RouterView />
  </div>
</template>

<script setup lang="ts">
import NavBar from "./components/NavBar.vue";
import { RouterView } from "vue-router";
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
body {
  background: #141414;
  color: white;
  font-family: sans-serif;
}
</style>
