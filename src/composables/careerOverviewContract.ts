/** Page composition only: a trial extends the overview, never replaces its default route. */
export function resolveCareerAnalysisView(mode:string,query:Record<string,unknown>):'overview'|'exploration'|'artifact'{
  if(typeof query.artifact_id==='string'&&query.artifact_id) return 'artifact'
  if(mode==='http'&&(query.view==='exploration'||typeof query.exploration_id==='string'&&!!query.exploration_id))return 'exploration'
  return 'overview'
}
export type OverviewDomain={id:string;name:string;color:string;jobs:string[]}
const colors=['#BE2A00','#8B1A00','#E87055','#C9A227','#1B4E79']
const damaged=/[\ufffd\u0080-\u009f]|æœ|å™|å­|Ã|Â/
function label(value:unknown):value is string{return typeof value==='string'&&!!value.trim()&&!damaged.test(value)}
export function careerOverviewGroups(rows:{category:string;roles:string[]}[]):OverviewDomain[]{
  return rows.flatMap((row,i)=>{
    const jobs=[...new Set((Array.isArray(row.roles)?row.roles:[]).filter(label).map(v=>v.trim()))]
    return jobs.length?[{id:'overview-'+i,name:label(row.category)?row.category:'分类待核对',color:colors[i%colors.length]!,jobs}]:[]
  })
}
export function careerOverviewSkills(value:unknown):string[]{
  if(!Array.isArray(value))return []
  return [...new Set(value.map(v=>typeof v==='string'?v:v?.name).filter(label).map(v=>v.trim()))]
}
