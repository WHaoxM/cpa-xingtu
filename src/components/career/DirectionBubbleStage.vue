<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import * as d3 from 'd3'
import type { DirectionCandidate } from '@/api/careerExploration'
const props = defineProps<{candidates:DirectionCandidate[];selected:string;compared:string[]}>()
const emit = defineEmits<{select:[candidate:DirectionCandidate]}>()
const svg = ref<SVGSVGElement|null>(null)
const colors = ['#C85A3A','#3A6EAE','#C4961E','#4A9058','#977A8D']
let observer:ResizeObserver|undefined
let simulation:d3.Simulation<any,undefined>|undefined
const reduced = matchMedia('(prefers-reduced-motion: reduce)')
function draw() {
  if(!svg.value) return
  simulation?.stop()
  const width = Math.max(svg.value.clientWidth,320), height = Math.max(svg.value.clientHeight,400)
  const root = d3.select(svg.value); root.selectAll('*').remove(); root.attr('viewBox',`0 0 ${width} ${height}`)
  if(!props.candidates.length) return
  const groups = Array.from(d3.group(props.candidates,c=>c.category))
  const cluster = d3.pack<any>().size([width-28,height-30]).padding(16)(
    d3.hierarchy<any>({children:groups.map(([category,items])=>({category,children:items.map(c=>({candidate:c,value:1}))}))}).sum(d=>d.value||0))
  const group = root.selectAll('g.cluster').data(cluster.children||[]).join('g').attr('class','cluster')
  group.append('circle').attr('class','domain-bg').attr('cx',d=>d.x+14).attr('cy',d=>d.y+15).attr('r',d=>d.r)
    .attr('fill',(_d,i)=>colors[i%colors.length]+'15').attr('stroke',(_d,i)=>colors[i%colors.length]+'70')
  group.append('text').attr('x',d=>d.x+14).attr('y',d=>d.y-d.r+27).attr('text-anchor','middle')
    .attr('fill',(_d,i)=>colors[i%colors.length]!).attr('font-size',11).text(d=>d.data.category)
  const nodes:any[] = cluster.leaves().map((n:any)=>({...n,x:n.x+14,y:n.y+15,homeX:n.x+14,homeY:n.y+15}))
  const defs=root.append('defs')
  nodes.forEach((node,i)=>{
    const gradient=defs.append('radialGradient').attr('id',`trial-ink-${i}`)
    const categoryIndex=groups.findIndex(([c])=>c===node.data.candidate.category)
    const color=colors[categoryIndex%colors.length]!
    gradient.append('stop').attr('offset','0%').attr('stop-color',color).attr('stop-opacity',.95)
    gradient.append('stop').attr('offset','70%').attr('stop-color',color).attr('stop-opacity',.75)
    gradient.append('stop').attr('offset','100%').attr('stop-color',color).attr('stop-opacity',.08)
  })
  const jobs=root.selectAll('g.direction').data(nodes).join('g').attr('class','direction')
    .attr('role','button').attr('tabindex',0).attr('aria-label',d=>d.data.candidate.role_name)
    .attr('aria-pressed',d=>String(d.data.candidate.role_name===props.selected))
    .attr('data-direction',d=>d.data.candidate.role_name)
    .on('click',(_event,d)=>emit('select',d.data.candidate))
    .on('keydown',(event,d)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();emit('select',d.data.candidate)}})
  jobs.append('title').text(d=>`${d.data.candidate.role_name} · ${d.data.candidate.category} · 目录技能线索`)
  jobs.append('circle').attr('r',d=>Math.max(17,Math.min(d.r,49))).attr('fill',(_d,i)=>`url(#trial-ink-${i})`)
    .attr('stroke',d=>props.compared.includes(d.data.candidate.role_name)?'#8B2500':'transparent').attr('stroke-width',2)
  jobs.append('text').attr('text-anchor','middle').attr('fill','#fff').attr('font-size',12).each(function(d){
    const name=d.data.candidate.role_name as string, lines=name.match(/.{1,5}/gu)||[name]
    d3.select(this).selectAll('tspan').data(lines).join('tspan').attr('x',0).attr('dy',(_v,i)=>i?15:-(lines.length-1)*7).text(v=>v)
  })
  const tick=()=>jobs.attr('transform',d=>`translate(${d.x},${d.y})`)
  tick()
  if(!reduced.matches&&!document.hidden){
    simulation=d3.forceSimulation(nodes).force('x',d3.forceX<any>(d=>d.homeX).strength(.08))
      .force('y',d3.forceY<any>(d=>d.homeY).strength(.08)).force('collide',d3.forceCollide<any>(d=>Math.min(d.r,49)+5)).on('tick',tick)
  }
}
function visibility(){if(document.hidden) simulation?.stop(); else draw()}
onMounted(()=>{observer=new ResizeObserver(draw); if(svg.value)observer.observe(svg.value);reduced.addEventListener('change',draw);document.addEventListener('visibilitychange',visibility);draw()})
watch(()=>[props.candidates,props.selected,props.compared],draw,{deep:true})
onBeforeUnmount(()=>{simulation?.stop();observer?.disconnect();reduced.removeEventListener('change',draw);document.removeEventListener('visibilitychange',visibility)})
</script>
<template><svg ref="svg" class="da-bubble-svg" aria-label="选择想了解的职业方向" /><p v-if="!candidates.length" class="bubble-empty">当前没有可用的方向资料。可以稍后重试，不会用演示方向补齐。</p></template>
<style scoped>
.da-bubble-svg{width:100%;height:100%;position:relative;z-index:1;min-height:380px}
:deep(.direction){cursor:pointer;outline:none} :deep(.direction:focus circle){stroke:#111;stroke-width:3}
:deep(.direction[aria-pressed=true] circle){filter:drop-shadow(0 3px 5px #8b250055)}
.bubble-empty{position:absolute;inset:35% 10% auto;text-align:center;line-height:1.8;color:var(--text-200)}
</style>
