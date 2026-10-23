<template>
  <div class="agent-ambient-flow" aria-hidden="true">
    <div class="agent-ambient-flow__glow agent-ambient-flow__glow--upper" />
    <div class="agent-ambient-flow__glow agent-ambient-flow__glow--lower" />

    <svg
      class="agent-ambient-flow__art"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      focusable="false"
    >
      <defs>
        <linearGradient id="agent-flow-upper" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#fff1e9" stop-opacity="0.18" />
          <stop offset="0.58" stop-color="#ffcdbb" stop-opacity="0.3" />
          <stop offset="1" stop-color="#fff0e9" stop-opacity="0.08" />
        </linearGradient>
        <linearGradient id="agent-flow-lower" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#ffddcf" stop-opacity="0.32" />
          <stop offset="0.6" stop-color="#ffc6b0" stop-opacity="0.22" />
          <stop offset="1" stop-color="#fff0e9" stop-opacity="0.06" />
        </linearGradient>
        <linearGradient id="agent-flow-sheen" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#fff" stop-opacity="0" />
          <stop offset="0.48" stop-color="#fff" stop-opacity="0.42" />
          <stop offset="0.54" stop-color="#fff8f2" stop-opacity="0.58" />
          <stop offset="1" stop-color="#fff" stop-opacity="0" />
        </linearGradient>
        <clipPath id="agent-flow-upper-clip">
          <path d="M 49 -18 C 53 2 60 15 72 23 C 84 31 95 32 108 40 L 108 55 C 95 47 86 44 74 38 C 59 30 52 16 49 -18 Z" />
        </clipPath>
        <clipPath id="agent-flow-lower-clip">
          <path d="M -10 65 C 10 68 21 76 32 84 C 42 91 49 99 59 108 L 41 108 C 32 98 25 92 17 86 C 7 79 0 75 -10 73 Z" />
        </clipPath>
      </defs>

      <g class="agent-ambient-flow__ribbon agent-ambient-flow__ribbon--upper">
        <path d="M 49 -18 C 53 2 60 15 72 23 C 84 31 95 32 108 40 L 108 55 C 95 47 86 44 74 38 C 59 30 52 16 49 -18 Z" fill="url(#agent-flow-upper)" />
        <path d="M 51 -12 C 56 8 64 18 76 25 C 87 31 96 34 106 41" fill="none" stroke="#fff8f3" stroke-opacity="0.44" stroke-width="0.22" />
        <g class="agent-ambient-flow__sweep agent-ambient-flow__sweep--upper" clip-path="url(#agent-flow-upper-clip)">
          <rect x="-45" y="-20" width="26" height="145" fill="url(#agent-flow-sheen)" />
        </g>
      </g>

      <g class="agent-ambient-flow__ribbon agent-ambient-flow__ribbon--lower">
        <path d="M -10 65 C 10 68 21 76 32 84 C 42 91 49 99 59 108 L 41 108 C 32 98 25 92 17 86 C 7 79 0 75 -10 73 Z" fill="url(#agent-flow-lower)" />
        <path d="M -8 68 C 11 71 22 79 34 88 C 42 95 47 101 54 106" fill="none" stroke="#fff8f3" stroke-opacity="0.45" stroke-width="0.22" />
        <g class="agent-ambient-flow__sweep agent-ambient-flow__sweep--lower" clip-path="url(#agent-flow-lower-clip)">
          <rect x="-45" y="-20" width="26" height="145" fill="url(#agent-flow-sheen)" />
        </g>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.agent-ambient-flow {
  position: absolute;
  z-index: -1;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  background:
    radial-gradient(ellipse 58% 43% at 100% 0%, rgba(255, 188, 166, 0.18), transparent 72%),
    radial-gradient(ellipse 54% 42% at 0% 100%, rgba(255, 190, 164, 0.18), transparent 72%),
    linear-gradient(180deg, #fff 0%, color-mix(in srgb, var(--color-background) 76%, #fff 24%) 100%);
}

.agent-ambient-flow__glow {
  position: absolute;
  width: 56%;
  height: 48%;
  border-radius: 50%;
  opacity: 0.7;
  will-change: transform, opacity;
}

.agent-ambient-flow__glow--upper {
  top: -21%;
  right: -18%;
  background: radial-gradient(ellipse, rgba(255, 208, 191, 0.26), rgba(255, 226, 215, 0.08) 50%, transparent 74%);
  animation: ambient-glow-upper 24s ease-in-out infinite alternate;
}

.agent-ambient-flow__glow--lower {
  bottom: -28%;
  left: -21%;
  background: radial-gradient(ellipse, rgba(255, 202, 181, 0.24), rgba(255, 226, 213, 0.08) 53%, transparent 75%);
  animation: ambient-glow-lower 29s ease-in-out infinite alternate;
}

.agent-ambient-flow__art {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.agent-ambient-flow__ribbon {
  transform-box: fill-box;
  transform-origin: center;
  will-change: transform;
}

.agent-ambient-flow__ribbon--upper {
  animation: ambient-ribbon-upper 26s ease-in-out infinite alternate;
}

.agent-ambient-flow__ribbon--lower {
  animation: ambient-ribbon-lower 31s ease-in-out infinite alternate;
}

.agent-ambient-flow__sweep {
  opacity: 0;
  will-change: transform, opacity;
}

.agent-ambient-flow__sweep--upper {
  animation: ambient-sweep 13s ease-in-out 1.5s infinite;
}

.agent-ambient-flow__sweep--lower {
  animation: ambient-sweep 16s ease-in-out 6s infinite;
}

@keyframes ambient-glow-upper {
  from { transform: translate3d(0, 0, 0) scale(1); opacity: 0.52; }
  to { transform: translate3d(-14px, 12px, 0) scale(1.06); opacity: 0.82; }
}

@keyframes ambient-glow-lower {
  from { transform: translate3d(0, 0, 0) scale(1); opacity: 0.54; }
  to { transform: translate3d(16px, -10px, 0) scale(1.05); opacity: 0.78; }
}

@keyframes ambient-ribbon-upper {
  from { transform: translate3d(0, 0, 0); }
  to { transform: translate3d(-8px, 6px, 0); }
}

@keyframes ambient-ribbon-lower {
  from { transform: translate3d(0, 0, 0); }
  to { transform: translate3d(7px, -5px, 0); }
}

@keyframes ambient-sweep {
  0% { transform: translateX(-30px); opacity: 0; }
  14% { opacity: 0.55; }
  62% { opacity: 0.24; }
  100% { transform: translateX(150vw); opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .agent-ambient-flow__glow,
  .agent-ambient-flow__ribbon,
  .agent-ambient-flow__sweep {
    animation: none !important;
    will-change: auto;
  }
}
</style>
