# AI Speaking Coach

영어로 말할 때 **문장 구조를 자동으로 정리하는 능력**을 키워주는 로컬 AI 코치 앱.

녹음하면 STT가 받아쓰고, 규칙 파서 + LLM이 발화의 구조 패턴·빈틈·점수를 분석해 즉시 피드백한다.
약점 기반 연습 문장을 반복하면서 PRE / SID / CE / CC / HO 패턴을 **무의식적으로** 쓰게 만드는 것이 목표.

> 싱글 유저 로컬 앱 — 모든 게 한 머신에서 돈다. 외부 서버·계정 없이 맥에서 완결.

---

## 핵심 패턴

| 코드 | 구조 | 설명 |
|------|------|------|
| **PRE** | Point → Reason → Example | 주장하고, 이유를 대고, 예시로 받친다 |
| **SID** | Signpost → Idea → Detail | 입장을 신호하고, 생각을 말하고, 디테일로 뒷받침 |
| **CE**  | Cause → Effect | 원인을 짚고, 결과를 보인다 |
| **CC**  | Contrast Connector | 한 관점을 말하고 연결어로 대비시킨다 |
| **HO**  | Hedging + Opinion | 완곡하게 누그러뜨린 뒤 입장을 분명히 한다 |

---

## 주요 기능

- **녹음 → 전사 → 분석 파이프라인**: 마이크 녹음(webm/opus) 또는 텍스트 입력 → STT → 구조 분석 → 피드백.
- **구조 피드백**: 감지된 패턴 배지, 0–100 명료도 점수, 빠진 요소(gap), 개선 리라이트 + 이유.
- **연습 루프**: 약점 기반 연습 문장을 제시(난이도 자동 조절 + 카운트다운 타이머). 그 문장으로 말하면 **목표 패턴 적중 여부(✓/✗)** 를 피드백에 표시.
- **진행도 / 히스토리**: 세션·발화 기록, 패턴별 평균·추세(improving/declining), 상위 약점 3개.
- **주간 리포트**: 점수 추이, 일자별 그래프, 패턴별 통계, 이번 주 집중(focus) 패턴.
- **Provider 추상화**: LLM·STT 모두 인터페이스 뒤에 숨기고 `.env.local` 한 줄로 교체. **mock 모드**로 모델 없이도 전체 UI/파이프라인 개발 가능.

---

## 아키텍처

```
[브라우저]                  Next.js API (App Router)        로컬 모델
  RecordPanel  ──녹음──▶  /api/transcribe ─▶ stt.ts ─────▶ mlx-whisper  :9797
  FeedbackPanel          /api/analyze    ─▶ 규칙파서+LLM ─▶ Gemma 등     :8001
  CoachContext           /api/sessions   ─▶ better-sqlite3 ─▶ data/speaking-coach.db
                         /api/practice·report ─▶ DB 집계 쿼리
```

- **데이터 흐름**: 녹음 → `/api/transcribe`(STT) → `/api/analyze`(규칙 파서가 패턴/갭을 먼저 추정 → LLM 프롬프트에 힌트로 주입 → LLM이 최종 JSON 반환, 파싱 실패 시 규칙 파서 결과로 fallback) → DB 저장 → 화면 표시.
- **DB**: better-sqlite3(동기 API, 단일 `.db` 파일, WAL). 테이블 2개 `sessions`(1) ─ `utterances`(N), `ON DELETE CASCADE`. 진행도/리포트는 별도 서버 없이 SQL 집계로 계산.
- **세션 의미**: "한 번의 연습 묶음 = 한 세션". sessionId는 localStorage에 영속화되며 30분 유휴 시 새 세션이 열린다.

자세한 구조·규칙은 [CLAUDE.md](./CLAUDE.md), 진행 상황·다음 작업은 [PLAN.md](./PLAN.md) 참고.

---

## 빠른 시작 (mock 모드 — 모델 없이)

```bash
npm install                  # better-sqlite3 네이티브 빌드 (Node 26 = C++20 필요)
cp .env.example .env.local   # 기본값이 mock 이라 그대로 두면 모델 없이 동작
npm run db:init              # SQLite 스키마 생성
npm run dev                  # → http://localhost:5555
```

`.env.example` 기본값(`LLM_PROVIDER=mock`, `STT_PROVIDER=mock`)이면:
- **MockLLM** — 가짜 피드백 JSON을 600ms 후 반환
- **MockSTT** — 샘플 문장을 반환

UI·레이아웃·파이프라인 점검은 모델 없이 전부 가능하다.

---

## 실모델 연결 (이 맥 셋업)

`.env.local`을 아래처럼 설정한다.

### 1) STT — mlx-whisper (Apple Silicon)

`stt-server/`의 FastAPI 서버가 mlx-whisper를 감싼다.

```bash
# 최초 1회 셋업 (venv + 의존성). ffmpeg / python@3.12 필요.
brew install ffmpeg python@3.12
cd stt-server && ./run.sh --setup
```

```env
STT_PROVIDER=local
STT_BASE_URL=http://localhost:9797   # 특이 포트 (8000 등 흔한 값 회피)
STT_MODEL=small                      # 또는 turbo / 전체 HF repo id
```

이 맥에서는 STT 서버가 **launchd 서비스(`svc`)로 등록**돼 있어 부팅 시 자동 실행되고 죽으면 되살아난다.

```bash
svc list            # 상태 확인
svc restart stt     # 재시작
svc logs stt        # 로그 tail
```

수동 실행이 필요하면 `cd stt-server && ./run.sh` (포트는 `STT_PORT` 로 override).

### 2) LLM — 로컬 Gemma (OpenAI 호환 게이트웨이)

```env
LLM_PROVIDER=openai-compat
LLM_BASE_URL=http://localhost:8001
LLM_MODEL=gemma-4-26b-a4b-it-4bit
LLM_API_KEY=<게이트웨이 키>
```

### 다른 LLM provider

```env
# Ollama
LLM_PROVIDER=ollama
LLM_BASE_URL=http://localhost:11434
LLM_MODEL=llama3.2

# Claude API
LLM_PROVIDER=claude
LLM_API_KEY=sk-ant-...
LLM_MODEL=claude-3-5-haiku-20241022

# OpenAI API
LLM_PROVIDER=openai
LLM_API_KEY=sk-...
LLM_MODEL=gpt-4o-mini
```

provider 상태는 앱 실행 후 `GET /api/health` 또는 Settings 페이지에서 확인.

---

## 사용법

1. 메인 화면(`/`)에서 마이크 버튼을 눌러 말하거나, "Type instead"로 문장을 입력.
2. 분석이 끝나면 오른쪽에 **패턴 · 점수 · 빠진 요소 · 리라이트**가 뜬다.
3. 상단의 **연습 카드**(Today's prompt)에 뜬 주제로 말하면, 목표 패턴을 맞췄는지 ✓/✗ 로 보여준다. "Next topic"으로 다음 문장, "Free practice"로 자유 연습.
4. 발화는 같은 세션에 묶인다. "New session"으로 세션을 끊을 수 있다(30분 유휴 시 자동으로 새 세션).
5. **History**(`/history`)에서 누적 기록·진행도·연습 카드, **Report**(`/report`)에서 주간 리포트를 본다.

---

## 스크립트

```bash
npm run dev        # 개발 서버 (http://localhost:5555)
npm run build      # 프로덕션 빌드
npm start          # 프로덕션 서버 (빌드 후)
npm run lint       # ESLint
npm run db:init    # DB 스키마 생성
npm run db:reset   # 전체 데이터 삭제 + autoincrement 리셋
npm test           # Vitest 1회 실행 (현재 81개)
npm run test:watch # Vitest watch
```

테스트는 순수 로직(feedback 검증/coerce, 규칙 파서, 연습 생성·결과, provider 팩토리, DB 집계/추세/주간) + `/api/analyze` 라우트 통합을 커버한다.

---

## 프로젝트 구조

```
stt-server/                    ← mlx-whisper STT 서버 (FastAPI, Python)
src/
├── app/
│   ├── api/                   ← analyze · transcribe · sessions · practice · report · health
│   ├── page.tsx               ← 메인 (RecordPanel + FeedbackPanel)
│   ├── history/ · report/ · settings/
├── components/coach/          ← CoachContext · RecordPanel · FeedbackPanel
├── hooks/                     ← useRecorder · useCoachSession · usePracticePlan
├── lib/
│   ├── providers/             ← llm.ts · stt.ts (provider 추상화 + mock)
│   ├── db/index.ts            ← SQLite CRUD + 진행도/주간 집계
│   ├── parsers/               ← structure.ts(규칙 분석) · practice.ts(연습 생성)
│   ├── feedback.ts            ← LLM 출력 검증/coerce
│   └── practiceResult.ts      ← 연습 목표 적중 판정
└── types/index.ts             ← 전체 도메인 타입
```

---

## Tech Stack

- **Next.js 14**(App Router) + TypeScript + Tailwind CSS
- **better-sqlite3 12.x** — 로컬 DB, 싱글 유저 (Node 26 호환)
- **mlx-whisper** — Apple Silicon STT (`stt-server/`)
- LLM / STT **provider 추상화 레이어**
- **Vitest** — 단위/통합 테스트

---

## 배포 (이 맥 + Cloudflare)

풀스택 Next 앱이라(API 라우트 + SQLite + 로컬 모델 의존) **GitHub Pages 같은 정적 호스팅엔 올라가지 않는다.** 이 맥에서 직접 서빙한다:

1. 별도 폴더에 빌드(`next build`)하고 `next start`를 **svc 서비스로 등록**(dev 서버와 `.next` 충돌 방지 위해 작업 폴더와 분리).
2. **Cloudflare Tunnel**에 Public Hostname 추가 → `<your-host>.example.com` → `http://localhost:<포트>`.
3. **4자리 PIN 게이트**(`AUTH_CODES`)로 보호 — 미들웨어가 모든 페이지/`/api`를 쿠키 검증 뒤에 둔다. 안 그러면 누구나 이 맥의 로컬 모델(Gemma/STT)을 굴릴 수 있다. 더 강한 인증이 필요하면 Cloudflare Access를 앞단에 추가할 수 있다.

> 앱이 페이지와 `/api`를 같은 오리진에서 서빙하므로 (이전 프로젝트의) cross-origin CORS/프리플라이트 이슈는 없다.
