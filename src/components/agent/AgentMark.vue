<script setup lang="ts">
withDefaults(defineProps<{
  size?: number
  label?: string
}>(), {
  size: 32,
  label: '星图 Agent',
})
</script>

<template>
  <!-- Branching star-map path: one question becomes two actionable directions. -->
  <svg
    class="agent-mark"
    :width="size"
    :height="size"
    viewBox="0 0 48 48"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    :aria-label="label"
  >
    <rect x="1" y="1" width="46" height="46" rx="13" class="agent-mark__tile" />
    <path
      d="M11.5 31.5c5.7 0 8.7-3.4 12.5-7.5 3.8-4.1 6.8-7.5 12.5-7.5M24 24c3.8 4.1 6.8 7.5 12.5 7.5"
      class="agent-mark__path"
    />
    <path d="m24 19.5 1.5 3 3 1.5-3 1.5-1.5 3-1.5-3-3-1.5 3-1.5z" class="agent-mark__hub" />
    <circle cx="11.5" cy="31.5" r="3.1" class="agent-mark__origin" />
    <circle cx="36.5" cy="16.5" r="3.1" class="agent-mark__destination" />
    <circle cx="36.5" cy="31.5" r="3.1" class="agent-mark__destination agent-mark__destination--secondary" />
  </svg>
</template>

<style scoped>
.agent-mark {
  display: block;
  flex: none;
  overflow: visible;
}

.agent-mark__tile { fill: var(--agent-mark-bg, var(--color-text, #1a1a1a)); }
.agent-mark__path {
  fill: none;
  stroke: var(--agent-mark-line, #fff);
  stroke-width: 2.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.agent-mark__hub { fill: var(--agent-mark-hub, #fff); }
.agent-mark__origin { fill: var(--agent-mark-origin, var(--gold-300, #e8c96a)); }
.agent-mark__destination { fill: var(--agent-mark-destination, #fff); }
.agent-mark__destination--secondary { fill: var(--agent-mark-accent, var(--vermilion-300, #e87055)); }
</style>
