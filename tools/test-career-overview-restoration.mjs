import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {transform} from 'esbuild'

test('HTTP default retains the original overview instead of substituting the trial workspace',()=>{
  const page=readFileSync(new URL('../src/views/student/CareerAnalysis.vue',import.meta.url),'utf8')
  assert.match(page,/<CareerExplorationWorkspace v-if="showExploration"/)
  assert.doesNotMatch(page,/<CareerExplorationWorkspace v-if="getApiMode\(\) === 'http' && !artifactId"/)
})

test('only an explicit trial entry or saved exploration opens the trial; artifact keeps priority',async()=>{
  const raw=readFileSync(new URL('../src/composables/careerOverviewContract.ts',import.meta.url),'utf8')
  const code=(await transform(raw,{loader:'ts',format:'esm'})).code
  const m=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))
  assert.equal(m.resolveCareerAnalysisView('http',{}),'overview')
  assert.equal(m.resolveCareerAnalysisView('http',{role:'前端开发'}),'overview')
  assert.equal(m.resolveCareerAnalysisView('http',{view:'exploration'}),'exploration')
  assert.equal(m.resolveCareerAnalysisView('http',{exploration_id:'exp_saved'}),'exploration')
  assert.equal(m.resolveCareerAnalysisView('http',{artifact_id:'art_saved',exploration_id:'exp_saved'}),'artifact')
  assert.equal(m.resolveCareerAnalysisView('mock',{view:'exploration'}),'overview')
  const groups=m.careerOverviewGroups([{category:'数据',roles:['数据分析','æœºå™¨å­¦ä¹ ','数据分析']},{category:'安全',roles:['安全工程师']}])
  assert.deepEqual(groups.map(g=>g.jobs),[['数据分析'],['安全工程师']])
  assert.deepEqual(m.careerOverviewGroups([]),[])
  assert.deepEqual(m.careerOverviewSkills(['SQL',{name:'Python'},'æœ']),['SQL','Python'])
})
