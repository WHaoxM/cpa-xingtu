import type { PersonalPositioning } from '@/api/careerExploration'

/** Wall coordinates express a reading route, never rank, seniority or distance. */
export function personalClimbLayout(role:string, value:PersonalPositioning|null, references:{chain:string[]}[]=[]) {
  if(!role)return {nodes:[],ropes:[]}
  const nodes=[
    {id:'personal-start',title:'本人经历',salaryRange:'当前起点',x:125,y:560},
    {id:'personal-next',title:value?.next_action.kind==='practice'?'动手试一次':'先弄清一件事',salaryRange:'优先下一步',x:260,y:340},
    {id:'personal-target',title:role,salaryRange:'想探索的方向',x:150,y:125},
  ].map(n=>({...n,level:'evidence' as const,lineId:'backend'}))
  const labels=value?.connections.length?['经历联系','关键问题']:['本人资料','方向线索']
  const ropes=nodes.slice(0,-1).map((from,i)=>{
    const to=nodes[i+1]!
    return {type:'promote' as const,fromId:from.id,toId:to.id,
      path:`M${from.x},${from.y-28} C${from.x-85},${from.y-110} ${to.x+85},${to.y+110} ${to.x},${to.y+28}`,
      holds:[{x:(from.x+to.x)/2,y:(from.y+to.y)/2,label:labels[i]!,mastered:false,edgeType:'promote' as const}],allSkills:[labels[i]!],omittedCount:0}
  })
  const reference=[...references].sort((a,b)=>b.chain.length-a.chain.length)[0]
  if(reference){
    const names=[...new Set(reference.chain)]
    const extra=names.map((title,i)=>({id:'reference-'+i,title,salaryRange:'目录发展参考',x:315,y:500-i*(400/Math.max(1,names.length-1)),level:'evidence' as const,lineId:'data'}))
    nodes.push(...extra)
    extra.slice(0,-1).forEach((from,i)=>{const to=extra[i+1]!;ropes.push({type:'promote',fromId:from.id,toId:to.id,path:`M${from.x},${from.y-28} L${to.x},${to.y+28}`,holds:[],allSkills:[],omittedCount:0})})
  }
  return {nodes,ropes}
}
