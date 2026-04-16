# WordOrder - 단어 순서 맞추기 언어 학습 게임

스마트폰과 컴퓨터 어디서든 온라인으로 접속해서 단어 순서를 맞추며 외국어를 공부하는 웹앱입니다.

## 주요 기능

- **단어 배열 게임** : 뒤섞인 단어를 올바른 순서로 클릭해 문장을 완성
- **타이머** : 단어 개수만큼 초가 주어짐 (3단어 = 3초)
- **레벨 시스템** : 2연속 정답 → 레벨 업, 2연속 오답 → 레벨 다운
- **4가지 풀기 모드** : 새 문제 / 틀린 문제 / 맞은 문제 / 전체
- **상세 통계** : 일별·주별·10주·연도별 정답률 그래프
- **회원 관리** : 이메일 로그인, 모국어·학습 언어 선택
- **광고 배너 공간** : 향후 모바일 앱 출시를 위한 상단 배너 레이아웃

## 기술 스택

| 역할 | 기술 |
|------|------|
| 프론트엔드 | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| 백엔드 | Next.js API Routes |
| 데이터베이스 + 인증 | Supabase (PostgreSQL, Auth) |
| 호스팅 | Vercel (무료 티어) |
| 차트 | Recharts |
| 데이터 | Tatoeba 한영 문장 쌍 |

## 빠른 시작

### 1. 저장소 클론

```bash
git clone https://github.com/ktikok2-byte/rearrange_words.git
cd rearrange_words
npm install
```

### 2. Supabase 설정

1. [supabase.com](https://supabase.com) 에서 무료 프로젝트 생성
2. **SQL Editor**에서 `supabase/schema.sql` 전체 내용 실행
3. 프로젝트 Settings → API 에서 키 복사

### 3. 환경 변수 설정

```bash
cp .env.local.example .env.local
```

`.env.local` 파일을 열어 Supabase 값을 입력:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
```

### 4. 샘플 데이터 삽입

```bash
node scripts/seed-data.mjs
```

약 80개의 한영 문장이 삽입됩니다 (레벨 1~5 커버).

### 5. 개발 서버 실행

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) 에서 확인

## Vercel 배포

1. [vercel.com](https://vercel.com) 에서 이 GitHub 저장소 import
2. Environment Variables 탭에서 `.env.local` 값 3개 입력
3. 자동 배포 완료

## 레벨 시스템

| 레벨 | 단어 수 |
|------|---------|
| 1 | 1~3 |
| 2 | 4~6 |
| 3 | 7~9 |
| N | (N-1)×3+1 ~ N×3 |

- 2연속 정답 → 레벨 업 (연속 카운트 초기화)
- 2연속 오답 → 레벨 다운 (최저 1)
- 레벨 시스템은 **새 문제 풀기** 모드에서만 적용

## 통계 기준

- 통계와 레벨은 **새 문제 풀기** 모드의 데이터만 반영
- **틀린 문제 풀기**에서 맞춰도 통계에 반영되지 않음
- **틀린 문제 풀기**에서 맞추면 → 맞은 문제 목록으로 이동

## 데이터 출처

- [Tatoeba Project](https://tatoeba.org) - CC BY 2.0
- 한국어-영어 문장 쌍 사용

## 프로젝트 구조

```
├── src/
│   ├── app/
│   │   ├── (app)/           # 로그인 후 레이아웃
│   │   │   ├── dashboard/   # 내 현황
│   │   │   ├── play/        # 게임
│   │   │   └── stats/       # 통계
│   │   ├── login/
│   │   ├── register/
│   │   └── api/auth/
│   ├── components/          # 공통 컴포넌트
│   ├── lib/
│   │   ├── supabase/        # Supabase 클라이언트
│   │   └── game.ts          # 게임 로직
│   └── types/               # TypeScript 타입
├── supabase/
│   └── schema.sql           # DB 스키마
└── scripts/
    └── seed-data.mjs        # 데이터 삽입 스크립트
```
