<template>
  <div class="page page--immersive">
    <RoleChat />
  </div>
</template>

<script setup lang="ts">
import RoleChat from '@/components/RoleChat.vue'
</script>

<style scoped>
.page--immersive {
  height: 100vh;
  overflow: hidden;
}
</style>
