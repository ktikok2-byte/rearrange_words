/**
 * Tatoeba 캐시 → src/data/sentences-pool.json 생성
 *
 * Vercel API route에서 문장 자동 추가 시 사용하는 예비 문장 풀.
 * DB에 없는 문장들만 추출해서 저장합니다.
 *
 * 사용법:
 *   node scripts/build-pool.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const CACHE_DIR = resolve(ROOT, '.tatoeba_cache')
const OUT_FILE = resolve(ROOT, 'src/data/sentences-pool.json')

function loadEnv() {
  const envPath = resolve(ROOT, '.env.local')
  if (!existsSync(envPath)) { console.error('❌ .env.local 없음'); process.exit(1) }
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.+)$/)
    if (m) process.env[m[1]] = m[2].trim()
  }
}

function parseSentences(buf) {
  const map = new Map()
  for (const line of buf.toString('utf-8').split('\n')) {
    const t1 = line.indexOf('\t'), t2 = line.indexOf('\t', t1 + 1)
    if (t1 < 0 || t2 < 0) continue
    const id = parseInt(line.slice(0, t1))
    const text = line.slice(t2 + 1).trim()
    if (id && text) map.set(id, text)
  }
  return map
}

function parseLinks(buf) {
  const pairs = []
  for (const line of buf.toString('utf-8').split('\n')) {
    const t = line.indexOf('\t')
    if (t < 0) continue
    const a = parseInt(line.slice(0, t)), b = parseInt(line.slice(t + 1))
    if (a && b) pairs.push([a, b])
  }
  return pairs
}

loadEnv()

const required = ['kor_sentences.tsv', 'eng_sentences.tsv', 'kor-eng_links.tsv']
for (const f of required) {
  if (!existsSync(`${CACHE_DIR}/${f}`)) {
    console.error(`❌ 캐시 파일 없음: ${f}`)
    console.error('먼저 node scripts/download-tatoeba.mjs 를 실행하세요.')
    process.exit(1)
  }
}

console.log('📖 캐시 파일 읽는 중...')
const koMap = parseSentences(readFileSync(`${CACHE_DIR}/kor_sentences.tsv`))
const enMap = parseSentences(readFileSync(`${CACHE_DIR}/eng_sentences.tsv`))
const links = parseLinks(readFileSync(`${CACHE_DIR}/kor-eng_links.tsv`))
console.log(`  한국어: ${koMap.size.toLocaleString()}개  영어: ${enMap.size.toLocaleString()}개  링크: ${links.length.toLocaleString()}개`)

// 기존 DB 문장 조회
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
console.log('\n🔎 기존 DB 문장 조회 중...')
const { data: existing } = await supabase.from('sentences').select('target_text')
const existingSet = new Set((existing || []).map(r => r.target_text))
console.log(`  기존 DB: ${existingSet.size.toLocaleString()}개`)

// 전체 한영 쌍 추출 (DB에 없는 것만)
console.log('\n🔍 새 문장 추출 중...')
const seenEn = new Set([...existingSet])
const seenKo = new Set()
const pool = []

for (const [a, b] of links) {
  let ko, en
  if (koMap.has(a) && enMap.has(b)) { ko = koMap.get(a); en = enMap.get(b) }
  else if (enMap.has(a) && koMap.has(b)) { en = enMap.get(a); ko = koMap.get(b) }
  else continue

  if (seenEn.has(en) || seenKo.has(ko)) continue
  const wc = en.trim().split(/\s+/).length
  if (wc < 1 || wc > 50) continue

  seenEn.add(en)
  seenKo.add(ko)
  pool.push({ ko, en, word_count: wc, difficulty_level: Math.ceil(wc / 3) })
}

pool.sort((a, b) => a.word_count - b.word_count)
console.log(`  추출된 새 문장: ${pool.length.toLocaleString()}개`)

// 저장
mkdirSync(resolve(ROOT, 'src/data'), { recursive: true })
writeFileSync(OUT_FILE, JSON.stringify(pool, null, 0), 'utf-8')
const sizeKB = (readFileSync(OUT_FILE).length / 1024).toFixed(0)
console.log(`\n✅ 저장 완료: src/data/sentences-pool.json (${sizeKB}KB, ${pool.length.toLocaleString()}개)`)

console.log('\n레벨별 분포:')
const lvlMap = {}
for (const p of pool) lvlMap[p.difficulty_level] = (lvlMap[p.difficulty_level] || 0) + 1
for (const lvl of Object.keys(lvlMap).sort((a, b) => a - b).slice(0, 10)) {
  console.log(`  Level ${lvl}: ${lvlMap[lvl]}개`)
}
