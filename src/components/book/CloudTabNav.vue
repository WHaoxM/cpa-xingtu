<!-- 组件：顶部 Tab 导航 -->
<script setup lang="ts">
defineProps<{ tabs: { key: string; label: string }[]; modelValue: string }>()

const emit = defineEmits<{ (e: 'update:modelValue', val: string): void }>()
</script>

<template>
  <nav class="cloud-nav" aria-label="功能导航">
    <template v-for="tab in tabs" :key="tab.key">
      <span v-if="tab.key.startsWith('__sep')" class="cloud-sep" aria-hidden="true" />
      <button
        v-else
        type="button"
        class="cloud-tab"
        :class="{ 'is-active': modelValue === tab.key }"
        :aria-current="modelValue === tab.key ? 'page' : undefined"
        @click="emit('update:modelValue', tab.key)"
      >
        <svg
          class="cloud-bg"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          focusable="false"
        >
          <path class="cloud-fill" d="M 0,0 L 82,0 C 110,0 66,100 94,100 L 0,100 C 28,100 -16,0 0,0 Z" />
        </svg>
        <span class="cloud-label">{{ tab.label }}</span>
      </button>
    </template>
  </nav>
</template>

<style scoped>
.cloud-nav {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 4px;
  background: color-mix(in srgb, var(--color-surface) 55%, var(--color-background) 45%);
  border: 1px solid color-mix(in srgb, var(--color-border) 78%, transparent 22%);
  border-radius: 16px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.78);
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  scroll-snap-type: x proximity;
}

.cloud-sep {
  flex: 0 0 auto;
  width: 1px;
  height: 18px;
  margin: 0 4px;
  background: color-mix(in srgb, var(--color-border) 85%, transparent 15%);
}

.cloud-nav::-webkit-scrollbar {
  display: none;
}

.cloud-tab {
  position: relative;
  flex: 0 0 auto;
  min-width: max-content;
  height: 36px;
  border: 1px solid transparent;
  background: transparent;
  margin-right: 0;
  padding: 0 16px;
  cursor: pointer;
  z-index: 1;
  overflow: hidden;
  border-radius: 12px;
  scroll-snap-align: start;
  transition:
    background-color 220ms ease,
    border-color 220ms ease,
    box-shadow 220ms ease,
    transform 220ms ease;
}

.cloud-tab:hover {
  z-index: 2;
  background: color-mix(in srgb, var(--color-text) 5%, var(--color-surface) 95%);
  border-color: color-mix(in srgb, var(--color-border) 90%, transparent 10%);
}

.cloud-tab.is-active {
  z-index: 3;
  background: linear-gradient(180deg, rgba(34, 34, 34, 0.96), rgba(17, 17, 17, 0.96));
  border-color: rgba(17, 17, 17, 0.96);
  box-shadow: 0 6px 14px rgba(17, 17, 17, 0.16);
}

.cloud-tab:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--color-text) 22%, transparent 78%);
  outline-offset: 2px;
}

.cloud-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: none;
  overflow: hidden;
}

.cloud-fill {
  fill: transparent;
  transition: fill 280ms ease;
}

.cloud-tab:hover .cloud-fill {
  fill: transparent;
}

.cloud-tab.is-active .cloud-fill {
  fill: transparent;
}

.cloud-label {
  position: relative;
  inset: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 0;
  font-size: 13px;
  font-weight: 600;
  font-family: var(--font-ui, sans-serif);
  letter-spacing: 0.01em;
  color: var(--color-text-muted);
  white-space: nowrap;
  pointer-events: none;
  transition: color 220ms ease;
  user-select: none;
}

.cloud-tab:hover .cloud-label {
  color: var(--color-text);
}

.cloud-tab.is-active .cloud-label {
  color: #ffffff;
}

@media (max-width: 1024px) {
  .cloud-tab {
    padding: 0 14px;
  }

  .cloud-label {
    font-size: 12px;
  }
}

@media (max-width: 767px) {
  .cloud-nav {
    border-radius: 14px;
  }

  .cloud-tab {
    height: 34px;
    padding: 0 13px;
    border-radius: 10px;
  }
}
</style>
