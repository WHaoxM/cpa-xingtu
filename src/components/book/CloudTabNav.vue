<!-- 组件：顶部 Tab 导航 -->
<script setup lang="ts">
defineProps<{ tabs: { key: string; label: string; kind?: 'group' }[]; modelValue: string }>()

const emit = defineEmits<{ (e: 'update:modelValue', val: string): void }>()
</script>

<template>
  <nav class="cloud-nav" aria-label="功能导航">
    <template v-for="tab in tabs" :key="tab.key">
      <span v-if="tab.kind === 'group'" class="cloud-group-label">{{ tab.label }}</span>
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
  gap: 2px;
  min-height: 42px;
  padding: 3px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 24px;
  box-shadow: none;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
  scrollbar-color: rgba(156, 126, 105, .32) transparent;
  scroll-snap-type: x proximity;
}

.cloud-group-label {
  flex: 0 0 auto;
  min-height: 24px;
  display: flex;
  align-items: center;
  margin: 0 3px 0 5px;
  padding-left: 9px;
  border-left: 1px solid rgba(95, 77, 60, .16);
  color: #9e674e;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .04em;
  white-space: nowrap;
}

.cloud-nav::-webkit-scrollbar {
  height: 3px;
}

.cloud-nav::-webkit-scrollbar-thumb {
  border-radius: 9px;
  background: rgba(156, 126, 105, .32);
}

.cloud-tab {
  position: relative;
  flex: 0 0 auto;
  min-width: max-content;
  height: 38px;
  border: 1px solid transparent;
  background: transparent;
  margin-right: 0;
  padding: 0 15px;
  cursor: pointer;
  z-index: 1;
  overflow: hidden;
  border-radius: 22px;
  scroll-snap-align: start;
  transition:
    background-color 220ms ease,
    border-color 220ms ease,
    color 220ms ease;
}

.cloud-tab:hover {
  z-index: 2;
  background: rgba(189, 55, 20, .055);
  border-color: rgba(189, 55, 20, .08);
}

.cloud-tab.is-active {
  z-index: 3;
  background: #fbede7;
  border-color: rgba(189, 55, 20, .14);
  box-shadow: inset 0 -2px 0 #bd3714;
}

.cloud-tab:focus-visible {
  outline: 2px solid #bd3714;
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
  color: #6f6b66;
  white-space: nowrap;
  pointer-events: none;
  transition: color 220ms ease;
  user-select: none;
}

.cloud-tab:hover .cloud-label {
  color: #a23518;
}

.cloud-tab.is-active .cloud-label {
  color: #bd3714;
  font-weight: 700;
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
    scrollbar-width: none;
  }

  .cloud-nav::-webkit-scrollbar {
    display: none;
  }

  .cloud-tab {
    height: 34px;
    padding: 0 13px;
    border-radius: 19px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .cloud-tab,
  .cloud-fill,
  .cloud-label {
    transition: none;
  }
}
</style>
