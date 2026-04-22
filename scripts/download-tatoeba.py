"""
Tatoeba 한국어-영어 문장 쌍 다운로드 및 Supabase 삽입 스크립트

데이터 출처: Tatoeba Project (https://tatoeba.org)
라이선스: CC BY 2.0 (https://creativecommons.org/licenses/by/2.0/)

사용법:
  python scripts/download-tatoeba.py [--max N] [--min-words M] [--max-words W]

기본값: 최대 2000개, 최소 1단어, 최대 30단어
"""

import os, sys, bz2, csv, io, re, math, argparse, time
from pathlib import Path

# ─── 의존성 확인 ────────────────────────────────────────────────────
try:
    import requests
except ImportError:
    print("❌ requests 설치 필요: pip install requests")
    sys.exit(1)

try:
    from supabase import create_client
except ImportError:
    print("❌ supabase-py 설치 필요: pip install supabase")
    sys.exit(1)

# ─── 환경변수 로드 ──────────────────────────────────────────────────
def load_env():
    env_path = Path(__file__).parent.parent / ".env.local"
    if not env_path.exists():
        print("❌ .env.local 파일이 없습니다.")
        sys.exit(1)
    env = {}
    for line in env_path.read_text(encoding="utf-8").splitlines():
        m = re.match(r'^([A-Z_]+)=(.+)$', line.strip())
        if m:
            env[m.group(1)] = m.group(2).strip()
    return env

# ─── Tatoeba 파일 다운로드 ──────────────────────────────────────────
BASE_URL = "https://downloads.tatoeba.org/exports"
CACHE_DIR = Path(__file__).parent.parent / ".tatoeba_cache"

def download_and_extract(filename, desc):
    CACHE_DIR.mkdir(exist_ok=True)
    cache_file = CACHE_DIR / filename.replace(".bz2", "")
    if cache_file.exists():
        print(f"  [캐시] {desc}")
        return cache_file.read_bytes()

    url = f"{BASE_URL}/{filename}"
    print(f"  [다운로드] {desc} ...")
    r = requests.get(url, stream=True, timeout=120)
    r.raise_for_status()

    total = int(r.headers.get("content-length", 0))
    downloaded = 0
    chunks = []
    for chunk in r.iter_content(chunk_size=1024 * 256):
        chunks.append(chunk)
        downloaded += len(chunk)
        if total:
            pct = downloaded / total * 100
            print(f"\r    {pct:.1f}% ({downloaded // 1024 // 1024}MB / {total // 1024 // 1024}MB)", end="", flush=True)
    print()

    compressed = b"".join(chunks)
    data = bz2.decompress(compressed)
    cache_file.write_bytes(data)
    print(f"  ✅ 저장: {cache_file.name}")
    return data

# ─── TSV 파싱 ───────────────────────────────────────────────────────
def parse_sentences(data: bytes) -> dict:
    """id -> text 딕셔너리 반환"""
    result = {}
    for line in data.decode("utf-8").splitlines():
        parts = line.split("\t", 2)
        if len(parts) >= 3:
            sid, _lang, text = parts
            result[int(sid)] = text.strip()
    return result

def parse_links(data: bytes) -> list:
    """(sentence_id, translation_id) 쌍 리스트"""
    pairs = []
    for line in data.decode("utf-8").splitlines():
        parts = line.split("\t", 1)
        if len(parts) == 2:
            try:
                pairs.append((int(parts[0]), int(parts[1])))
            except ValueError:
                pass
    return pairs

# ─── 메인 ───────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--max", type=int, default=2000, help="최대 삽입 문장 수")
    parser.add_argument("--min-words", type=int, default=1)
    parser.add_argument("--max-words", type=int, default=30)
    args = parser.parse_args()

    env = load_env()
    supabase = create_client(
        env["NEXT_PUBLIC_SUPABASE_URL"],
        env["SUPABASE_SERVICE_ROLE_KEY"]
    )

    print("\n📥 Tatoeba 데이터 다운로드 중...")
    ko_data  = download_and_extract("per_language/kor/kor_sentences.tsv.bz2", "한국어 문장")
    en_data  = download_and_extract("per_language/eng/eng_sentences.tsv.bz2", "영어 문장")
    lnk_data = download_and_extract("links.csv.bz2", "번역 링크")

    print("\n🔧 데이터 파싱 중...")
    ko_sentences = parse_sentences(ko_data)
    en_sentences = parse_sentences(en_data)
    links = parse_links(lnk_data)
    print(f"  한국어 문장: {len(ko_sentences):,}개")
    print(f"  영어 문장:   {len(en_sentences):,}개")
    print(f"  링크:        {len(links):,}개")

    print("\n🔍 한국어-영어 쌍 추출 중...")
    ko_ids = set(ko_sentences.keys())
    en_ids = set(en_sentences.keys())
    pairs = []
    seen_ko = set()  # 중복 한국어 문장 방지

    for sid, tid in links:
        if sid in ko_ids and tid in en_ids:
            ko_text = ko_sentences[sid]
            en_text = en_sentences[tid]
            word_count = len(en_text.strip().split())
            if (args.min_words <= word_count <= args.max_words
                    and ko_text not in seen_ko):
                seen_ko.add(ko_text)
                pairs.append((ko_text, en_text, word_count))
        elif sid in en_ids and tid in ko_ids:
            en_text = en_sentences[sid]
            ko_text = ko_sentences[tid]
            word_count = len(en_text.strip().split())
            if (args.min_words <= word_count <= args.max_words
                    and ko_text not in seen_ko):
                seen_ko.add(ko_text)
                pairs.append((ko_text, en_text, word_count))

    # 단어 수 기준 정렬 후 샘플링 (레벨별 균등 분포)
    pairs.sort(key=lambda x: x[2])
    print(f"  총 {len(pairs):,}개 쌍 발견 (단어 수 {args.min_words}~{args.max_words})")

    # 레벨별 균등 추출
    MAX_TOTAL = args.max
    max_level = math.ceil(args.max_words / 3)
    per_level = max(1, MAX_TOTAL // max_level)

    level_buckets: dict[int, list] = {}
    for ko, en, wc in pairs:
        lvl = math.ceil(wc / 3)
        level_buckets.setdefault(lvl, []).append((ko, en, wc))

    selected = []
    for lvl in sorted(level_buckets.keys()):
        bucket = level_buckets[lvl]
        selected.extend(bucket[:per_level])
    selected = selected[:MAX_TOTAL]

    print(f"  선택된 문장: {len(selected):,}개")
    for lvl in sorted(level_buckets.keys()):
        cnt = sum(1 for _, _, wc in selected if math.ceil(wc/3) == lvl)
        print(f"    Level {lvl} ({(lvl-1)*3+1}~{lvl*3}단어): {cnt}개")

    # 이미 DB에 있는 문장 텍스트 조회 (중복 방지)
    print("\n🔎 기존 DB 문장 조회 중...")
    existing_resp = supabase.table("sentences").select("target_text").execute()
    existing_texts = {row["target_text"] for row in (existing_resp.data or [])}
    print(f"  기존 문장: {len(existing_texts):,}개")

    rows = []
    for ko, en, wc in selected:
        if en in existing_texts:
            continue
        rows.append({
            "source_language": "ko",
            "source_text": ko,
            "target_language": "en",
            "target_text": en,
            "word_count": wc,
            "difficulty_level": math.ceil(wc / 3),
            "language_pair": "ko-en",
            "source": "tatoeba",
        })
    print(f"  새로 삽입할 문장: {len(rows):,}개")

    if not rows:
        print("⚠️  삽입할 새 문장이 없습니다. (모두 이미 존재)")
        return

    # 배치 삽입
    print(f"\n📤 Supabase에 삽입 중...")
    BATCH = 100
    inserted = 0
    for i in range(0, len(rows), BATCH):
        batch = rows[i:i+BATCH]
        supabase.table("sentences").insert(batch).execute()
        inserted += len(batch)
        pct = inserted / len(rows) * 100
        print(f"\r  {pct:.0f}% ({inserted}/{len(rows)})", end="", flush=True)
        time.sleep(0.1)  # rate limit 방지
    print()

    print(f"\n✨ 완료! 총 {inserted:,}개 문장 삽입")
    print("\n레벨 분포:")
    for lvl in sorted(set(math.ceil(r["word_count"]/3) for r in rows)):
        cnt = sum(1 for r in rows if math.ceil(r["word_count"]/3) == lvl)
        wmin, wmax = (lvl-1)*3+1, lvl*3
        print(f"  Level {lvl} ({wmin}~{wmax}단어): {cnt}개")

if __name__ == "__main__":
    main()
