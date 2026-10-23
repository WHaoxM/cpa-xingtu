<script setup lang="ts">
import { useId } from 'vue'

// Static textures extracted from CareerNavigation before 7addc00.
// Its star-map circle ripples are NOT the requested point-matrix wave:
// do not transplant them here or claim motion fidelity without a live baseline.
// No roles, scores, task progress or user records are manufactured here.
const id = useId().replace(/:/g, '')
</script>

<template>
  <svg class="career-nav-backdrop" viewBox="0 0 520 520" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <defs>
      <pattern :id="`${id}-grid`" width="26" height="26" patternUnits="userSpaceOnUse">
        <circle cx="13" cy="13" r="0.7" fill="rgba(0,0,0,0.07)" />
      </pattern>
      <filter :id="`${id}-grain`" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="3" stitchTiles="stitch" result="n" />
        <feColorMatrix type="saturate" values="0" in="n" result="g" />
        <feComponentTransfer in="g"><feFuncA type="linear" slope="0.025" /></feComponentTransfer>
      </filter>
    </defs>
    <rect width="520" height="520" :fill="`url(#${id}-grid)`" opacity="0.85" />
    <rect width="520" height="520" :filter="`url(#${id}-grain)`" />
  </svg>
</template>

<style scoped>
.career-nav-backdrop { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 0; overflow: hidden; }
</style>
