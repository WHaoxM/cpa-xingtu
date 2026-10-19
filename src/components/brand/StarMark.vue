<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 30 })
</script>

<template>
  <svg
    class="star-mark"
    :width="size"
    :height="size"
    viewBox="0 0 40 40"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    focusable="false"
  >
    <text x="1" y="31" class="star-mark__glyph">星</text>
    <path class="star-mark__point" d="m32 2 1.65 4.35L38 8l-4.35 1.65L32 14l-1.65-4.35L26 8l4.35-1.65L32 2Z" />
  </svg>
</template>

<style scoped>
.star-mark {
  display: block;
  flex: none;
  overflow: visible;
  color: var(--color-primary, #be2a00);
}
.star-mark__glyph {
  fill: currentColor;
  font-family: STSong, 'Songti SC', SimSun, 'Noto Serif SC', serif;
  font-size: 30px;
  font-weight: 700;
}
.star-mark__point { fill: var(--gold-300, #c9a227); }
</style>
