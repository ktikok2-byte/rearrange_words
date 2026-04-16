/**
 * Tatoeba 한국어-영어 문장 쌍 다운로드 및 Supabase 삽입
 *
 * 데이터 출처: Tatoeba Project (https://tatoeba.org)
 * 라이선스: CC BY 2.0
 *
 * 사용법:
 *   node scripts/download-tatoeba.mjs [--max 2000] [--min-words 1] [--max-words 30]
 */

import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'
import https from 'https'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const CACHE_DIR = resolve(ROOT, '.tatoeba_cache')

// ─── CLI 인수 파싱 ──────────────────────────────────────────────────
const args = process.argv.slice(2)
const getArg = (flag, def) => {
  const i = args.indexOf(flag)
  return i !== -1 ? parseInt(args[i + 1]) : def
}
const MAX_TOTAL = getArg('--max', 2000)
const MIN_WORDS = getArg('--min-words', 1)
const MAX_WORDS = getArg('--max-words', 30)

// ─── 환경변수 로드 ──────────────────────────────────────────────────
function loadEnv() {
  const envPath = resolve(ROOT, '.env.local')
  if (!existsSync(envPath)) {
    console.error('❌ .env.local 파일이 없습니다.')
    process.exit(1)
  }
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.+)$/)
    if (m) process.env[m[1]] = m[2].trim()
  }
}

// ─── bz2 파일 다운로드 + 압축 해제 ─────────────────────────────────
function downloadAndDecompress(url, cacheFile) {
  if (existsSync(cacheFile)) {
    console.log(`  [캐시] ${cacheFile.split(/[\\/]/).pop()}`)
    return Promise.resolve(readFileSync(cacheFile))
  }

  return new Promise((resolve, reject) => {
    const filename = url.split('/').pop()
    console.log(`  [다운로드] ${filename}`)

    const parts = []
    let downloaded = 0

    const doGet = (targetUrl) => {
      https.get(targetUrl, res => {
        if (res.statusCode >= 300 && res.statusCode < 400) {
          return doGet(res.headers.location)
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`))
          return
        }
        const total = parseInt(res.headers['content-length'] || '0')
        res.on('data', chunk => {
          parts.push(chunk)
          downloaded += chunk.length
          if (total) {
            const pct = (downloaded / total * 100).toFixed(0)
            process.stdout.write(`\r    ${pct}% (${(downloaded/1024/1024).toFixed(1)}MB / ${(total/1024/1024).toFixed(1)}MB)   `)
          }
        })
        res.on('end', () => {
          process.stdout.write('\n')
          const compressed = Buffer.concat(parts)
          console.log(`    압축 해제 중...`)

          // Try bzip2
          let result = spawnSync('bzip2', ['-d'], {
            input: compressed,
            maxBuffer: 512 * 1024 * 1024,
          })

          if (result.error || result.status !== 0) {
            // bzip2 not found, try 7z
            result = spawnSync('7z', ['e', '-tbzip2', '-si', '-so'], {
              input: compressed,
              maxBuffer: 512 * 1024 * 1024,
            })
          }

          if (result.error || result.status !== 0 || !result.stdout?.length) {
            reject(new Error(
              '압축 해제 실패. bzip2 또는 7-Zip이 필요합니다.\n' +
              '설치: https://www.7-zip.org/ 또는 Git Bash 포함 bzip2'
            ))
            return
          }

          writeFileSync(cacheFile, result.stdout)
          console.log(`    저장 완료: ${(result.stdout.length/1024/1024).toFixed(1)}MB`)
          resolve(result.stdout)
        })
        res.on('error', reject)
      }).on('error', reject)
    }

    doGet(url)
  })
}

// ─── 파싱 ───────────────────────────────────────────────────────────
function parseSentences(buf) {
  const map = new Map()
  for (const line of buf.toString('utf-8').split('\n')) {
    const t1 = line.indexOf('\t')
    const t2 = line.indexOf('\t', t1 + 1)
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
    const a = parseInt(line.slice(0, t))
    const b = parseInt(line.slice(t + 1))
    if (a && b) pairs.push([a, b])
  }
  return pairs
}

// ─── 메인 ───────────────────────────────────────────────────────────
loadEnv()

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true })

const BASE = 'https://downloads.tatoeba.org/exports'

console.log(`\n📥 Tatoeba 데이터 다운로드 (최대 ${MAX_TOTAL}개, ${MIN_WORDS}~${MAX_WORDS}단어)\n`)

const [koBuf, enBuf, lnkBuf] = await Promise.all([
  downloadAndDecompress(
    `${BASE}/per_language/kor/kor_sentences.tsv.bz2`,
    `${CACHE_DIR}/kor_sentences.tsv`
  ),
  downloadAndDecompress(
    `${BASE}/per_language/eng/eng_sentences.tsv.bz2`,
    `${CACHE_DIR}/eng_sentences.tsv`
  ),
  downloadAndDecompress(
    `${BASE}/per_language/kor/kor-eng_links.tsv.bz2`,
    `${CACHE_DIR}/kor-eng_links.tsv`
  ),
])

console.log('\n🔧 파싱 중...')
const koMap = parseSentences(koBuf)
const enMap = parseSentences(enBuf)
const links = parseLinks(lnkBuf)
console.log(`  한국어: ${koMap.size.toLocaleString()}개  영어: ${enMap.size.toLocaleString()}개  링크: ${links.length.toLocaleString()}개`)

console.log('\n🔍 한국어-영어 쌍 추출 중...')
const seenKo = new Set()
const seenEn = new Set()
const allPairs = []

for (const [a, b] of links) {
  let ko, en
  if (koMap.has(a) && enMap.has(b)) {
    ko = koMap.get(a); en = enMap.get(b)
  } else if (enMap.has(a) && koMap.has(b)) {
    en = enMap.get(a); ko = koMap.get(b)
  } else continue

  const wc = en.trim().split(/\s+/).length
  if (wc < MIN_WORDS || wc > MAX_WORDS) continue
  if (seenKo.has(ko) || seenEn.has(en)) continue
  seenKo.add(ko)
  seenEn.add(en)
  allPairs.push({ ko, en, wc })
}

console.log(`  총 ${allPairs.length.toLocaleString()}개 쌍 발견`)

// 레벨별 균등 분포 샘플링
allPairs.sort((a, b) => a.wc - b.wc)
const maxLevel = Math.ceil(MAX_WORDS / 3)
const perLevel = Math.max(5, Math.ceil(MAX_TOTAL / maxLevel))

const buckets = {}
for (const p of allPairs) {
  const lvl = Math.ceil(p.wc / 3)
  if (!buckets[lvl]) buckets[lvl] = []
  buckets[lvl].push(p)
}

const selected = []
for (const lvl of Object.keys(buckets).sort((a, b) => a - b)) {
  selected.push(...buckets[lvl].slice(0, perLevel))
}
const finalPairs = selected.slice(0, MAX_TOTAL)

console.log(`  선택된 문장: ${finalPairs.length.toLocaleString()}개`)
for (const lvl of Object.keys(buckets).sort((a, b) => a - b)) {
  const cnt = finalPairs.filter(p => Math.ceil(p.wc / 3) === parseInt(lvl)).length
  if (cnt > 0) console.log(`    Level ${lvl} (${(lvl-1)*3+1}~${lvl*3}단어): ${cnt}개`)
}

// 기존 DB 문장 조회 (중복 방지)
console.log('\n🔎 기존 DB 문장 조회 중...')
const { data: existing } = await supabase.from('sentences').select('target_text')
const existingSet = new Set((existing || []).map(r => r.target_text))
console.log(`  기존: ${existingSet.size.toLocaleString()}개`)

const newRows = finalPairs
  .filter(p => !existingSet.has(p.en))
  .map(({ ko, en, wc }) => ({
    source_language: 'ko',
    source_text: ko,
    target_language: 'en',
    target_text: en,
    word_count: wc,
    difficulty_level: Math.ceil(wc / 3),
    language_pair: 'ko-en',
    source: 'tatoeba',
  }))

console.log(`  새로 삽입할 문장: ${newRows.length.toLocaleString()}개`)

if (newRows.length === 0) {
  console.log('⚠️  삽입할 새 문장이 없습니다. (모두 이미 존재)')
  process.exit(0)
}

// 배치 삽입
console.log('\n📤 Supabase에 삽입 중...')
const BATCH = 100
let inserted = 0
let errors = 0
for (let i = 0; i < newRows.length; i += BATCH) {
  const batch = newRows.slice(i, i + BATCH)
  const { error } = await supabase.from('sentences').insert(batch)
  if (error) {
    errors++
    console.error(`\n  ❌ 오류 (배치 ${Math.floor(i/BATCH)+1}):`, error.message)
  } else {
    inserted += batch.length
  }
  process.stdout.write(`\r  ${inserted}/${newRows.length} (${(inserted/newRows.length*100).toFixed(0)}%)`)
  await new Promise(r => setTimeout(r, 80))
}
process.stdout.write('\n')

console.log(`\n✨ 완료!`)
console.log(`   삽입: ${inserted.toLocaleString()}개 / 오류: ${errors}개`)

console.log('\n레벨 분포 (새로 삽입된 문장):')
const lvlCount = {}
for (const r of newRows.slice(0, inserted)) {
  lvlCount[r.difficulty_level] = (lvlCount[r.difficulty_level] || 0) + 1
}
for (const lvl of Object.keys(lvlCount).sort((a, b) => a - b)) {
  const min = (lvl - 1) * 3 + 1
  const max = lvl * 3
  console.log(`  Level ${lvl} (${min}~${max}단어): ${lvlCount[lvl]}개`)
}
