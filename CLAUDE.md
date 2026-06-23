# AI Speaking Coach — Project Context

## 목표
영어로 말할 때 문장 구조를 자동으로 정리하는 능력을 키워주는 AI 코치 앱.
반복 훈련으로 PRE / SID / CE / CC / HO 패턴을 무의식적으로 쓸 수 있도록 만드는 것이 핵심.

> **진행 상황 · 다음 작업 · 알려진 버그는 [PLAN.md](./PLAN.md) 참고.**
> 이 문서(CLAUDE.md)는 잘 안 바뀌는 프로젝트 컨텍스트(구조·실행·규칙)만 담는다.

## 아키텍처 개요
싱글 유저 로컬 앱. 모든 게 한 머신에서 돈다.

```
[브라우저] ──녹음(webm/opus)──▶ Next.js API ──▶ provider 추상화 ──▶ 로컬 모델
  RecordPanel                /api/transcribe ─▶ STT(stt.ts) ─────▶ mlx-whisper :9797
  FeedbackPanel              /api/analyze    ─▶ 규칙파서 + LLM ──▶ Gemma :8001 (OpenAI 호환)
  CoachContext               /api/sessions   ─▶ DB(better-sqlite3) ─▶ data/speaking-coach.db
                             /api/practice·report ─▶ DB 집계 쿼리
```

- **데이터 흐름**: 녹음 → `/api/transcribe`(STT) → `/api/analyze`(규칙 파서가 패턴/갭을 먼저 추정 → LLM 프롬프트에 힌트로 주입 → LLM이 최종 JSON 반환, 파싱 실패 시 규칙파서 결과로 fallback) → DB 저장 → FeedbackPanel 표시.
- **DB**: **better-sqlite3 12.x** (동기 API, 단일 `.db` 파일, WAL 모드). `user_id` 없음 — 싱글 유저. 테이블 2개: `sessions`(1) ─ `utterances`(N), `ON DELETE CASCADE`. 진행도/주간 리포트는 별도 서버 없이 `lib/db/index.ts`의 SQL 집계로 계산. 스키마는 `lib/db/index.ts`의 `SCHEMA`와 `scripts/init-db.js` 두 곳에 정의(둘이 동일해야 함).
- **provider 추상화**: LLM/STT 모두 인터페이스(`LLMProvider`/`STTProvider`) 뒤에 구현을 숨기고 `.env.local` 한 줄로 교체. mock 구현이 있어 모델 없이도 전체 UI 개발 가능.
- **상태 공유**: `CoachProvider`(React Context)가 `useCoachSession` 하나를 RecordPanel/FeedbackPanel에 공유. sessionId는 localStorage에 영속화(마지막 발화 기준 2시간 유휴 시 새 세션 — 타이머는 분석 시점에만 갱신, 페이지 로드로는 갱신 안 됨).

## 실행 방법
```bash
npm install                  # better-sqlite3는 네이티브 빌드 (Node 26 = C++20 필요)
cp .env.example .env.local   # 그다음 STT_PROVIDER=local 로 변경
npm run db:init
npm run dev                  # → http://localhost:5555

# STT 실모델(mlx-whisper)은 launchd 서비스로 등록됨 — 부팅 시 자동 실행 + KeepAlive.
#   svc list / svc restart stt / svc logs stt   (레지스트리: ~/services/services.json, 포트 9797)
#   첫 setup만 수동: cd stt-server && ./run.sh --setup   (venv + 의존성)
#   수동 실행이 필요하면: cd stt-server && ./run.sh  (STT_PORT 로 포트 override)
#   사전조건: brew install ffmpeg / python@3.12, Apple Silicon
```

## 프로젝트 구조
```
stt-server/                      ← mlx-whisper STT 서버 (FastAPI, Python) ★ STT 실모델
│   ├── server.py                ← POST /transcribe, GET /health
│   ├── run.sh                   ← venv 셋업 + 실행
│   └── requirements.txt
src/
├── app/
│   ├── api/
│   │   ├── analyze/route.ts     ← POST /api/analyze (규칙 파서 + LLM)
│   │   ├── transcribe/route.ts  ← POST /api/transcribe (STT)
│   │   ├── sessions/route.ts    ← GET/POST /api/sessions
│   │   ├── sessions/[id]/route.ts ← GET 세션 상세 + utterances
│   │   ├── practice/route.ts    ← GET /api/practice (5패턴 골고루 연습 덱)
│   │   ├── practice/next/route.ts ← POST /api/practice/next (직전 답변 기반 LLM 꼬리주제, 실패 시 시드 fallback)
│   │   ├── report/route.ts      ← GET /api/report (주간 리포트)
│   │   └── health/route.ts      ← GET /api/health (provider 상태 확인)
│   ├── history/page.tsx         ← 세션 목록 + 진행도 + 연습 카드 (구현 완료)
│   ├── report/page.tsx          ← 주간 리포트 (점수 추이, 패턴별, focus)
│   ├── settings/page.tsx        ← provider 설정 표시
│   └── page.tsx                 ← 메인 화면 (RecordPanel + FeedbackPanel)
├── components/
│   ├── coach/
│   │   ├── CoachContext.tsx     ← useCoachSession을 컨텍스트로 공유 (CoachProvider)
│   │   ├── CoachLayout.tsx      ← RecordPanel + FeedbackPanel 레이아웃
│   │   ├── RecordPanel.tsx      ← 마이크/타이머/카운트다운/연습카드/텍스트 fallback
│   │   └── FeedbackPanel.tsx    ← 패턴 배지, 점수 바, 갭, 리라이트 표시
│   └── layout/Sidebar.tsx
├── hooks/
│   ├── useRecorder.ts           ← MediaRecorder API 추상화
│   ├── useCoachSession.ts       ← 녹음→전사→분석 전체 파이프라인 훅
│   └── usePracticePlan.ts       ← /api/practice 연습 문장 로테이션
├── lib/
│   ├── providers/
│   │   ├── llm.ts               ← Claude / OpenAI / Ollama / LMStudio / Mock
│   │   └── stt.ts               ← local(mlx-whisper) / openai-api / Mock
│   ├── db/index.ts              ← SQLite CRUD + 진행도/주간 리포트 쿼리
│   └── parsers/
│       ├── structure.ts         ← 규칙 기반 구조 감지 + LLM 프롬프트 빌더
│       └── practice.ts          ← 약점 → 연습 문장 생성 (패턴×난이도 토픽뱅크)
└── types/index.ts               ← 전체 도메인 타입
```

## 핵심 패턴
| 코드 | 구조 |
|------|------|
| PRE | Point → Reason → Example |
| SID | Signpost → Idea → Detail |
| CE  | Cause → Effect |
| CC  | Contrast Connector |
| HO  | Hedging + Opinion |

## Tech Stack
- Next.js 14 (App Router) + TypeScript + Tailwind CSS
- better-sqlite3 12.x (로컬 DB, 싱글 유저) — Node 26 호환 위해 9.x에서 업그레이드됨
- LLM / STT 추상화 레이어 (provider 인터페이스 기반)
- STT: mlx-whisper (Apple Silicon) — `stt-server/` Python 서버

## Provider 전환 (.env.local)
```env
# 모델 없이 개발
LLM_PROVIDER=mock
STT_PROVIDER=mock

# Ollama 연결 시
LLM_PROVIDER=ollama
LLM_BASE_URL=http://localhost:11434
LLM_MODEL=llama3.2

# OpenAI 호환 게이트웨이(로컬 Gemma 등) 연결 시 — 현재 .env.local 설정
LLM_PROVIDER=openai-compat
LLM_BASE_URL=http://localhost:8001
LLM_MODEL=gemma-4-26b-a4b-it-4bit
LLM_API_KEY=<게이트웨이 키>

# mlx-whisper 로컬 STT 연결 시 (svc 관리, 포트 9797)
STT_PROVIDER=local
STT_BASE_URL=http://localhost:9797
STT_MODEL=small            # 또는 turbo / 전체 HF repo id
```
