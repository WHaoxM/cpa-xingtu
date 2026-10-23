import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import {computed,ref} from 'vue'

function projection(profile){
 const page=readFileSync(new URL('../src/views/student/CareerNavigation.vue',import.meta.url),'utf8')
 const source=page.slice(page.indexOf('const CANDIDATE_LABELS'),page.indexOf('const candidateSkills'))
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
 return new Function('computed','resumeCandidate',js+';return {candidateFields,candidateSemanticFacts}')(computed,ref({candidate_profile:profile}))
}
test('only deliberately student-facing candidate fields are rendered, including future metadata',()=>{
 const ui=projection({name:'林知夏',degree:null,skills:['SQL'],semantic_fact_issues:[{field:'school_tier'}],
  semantic_fact_next_action:'review_unmapped_scoring_category',future_internal_trace:'private',source_sha256:'hash'})
 assert.deepEqual(ui.candidateFields.value.map(([key])=>key),['name','skills'])
})
test('unknown semantic fact keys and their internal payload are never raw-label fallbacks',()=>{
 const ui=projection({semantic_facts:{team_project:{value:true,evidence:'参与小组查询练习'},internal_origin:{value:'id',evidence:'trace'}}})
 assert.deepEqual(ui.candidateSemanticFacts.value.map(f=>f.key),['team_project'])
})
test('an all-internal fact object cannot fall through to the generic object formatter',()=>{
 const ui=projection({name:'林知夏',semantic_facts:{internal_origin:{value:'id',evidence:'trace'}}})
 assert.deepEqual(ui.candidateFields.value.map(([key])=>key),['name'])
})
test('facts the server already marked invalid are not presented as valid student evidence',()=>{
 const ui=projection({semantic_facts:{school_tier:{value:'其他理工',evidence:'计算机课程'}},
  semantic_fact_issues:[{field:'school_tier',reason:'value_not_in_scoring_category'}]})
 assert.deepEqual(ui.candidateSemanticFacts.value,[])
 assert.deepEqual(ui.candidateFields.value,[])
})

test('missing evidence labels stay friendly and deduplicate unknown future fields',()=>{
 const page=readFileSync(new URL('../src/views/student/CareerNavigation.vue',import.meta.url),'utf8')
 const source=page.slice(page.indexOf('const missingFactLabels'),page.indexOf('const missingFactKeys'))
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
 const labels=fields=>new Function('computed','partialPortrait','FACT_LABELS',js+';return missingFactLabels.value')(
  computed,ref({missing_fields:fields}),{school_tier:'学校背景依据',skills:'技能原文'})
 assert.deepEqual(labels(['school_tier','future_private_code','another_private_field','school_tier']),['学校背景依据','其他资料尚待核对'])
 assert.deepEqual(labels([]),[])
 assert.doesNotMatch(JSON.stringify(labels(['private_hash'])),/private_hash/)
})
