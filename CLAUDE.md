# AI Speaking Coach — Project Context

## 목표
영어로 말할 때 문장 구조를 자동으로 정리하는 능력을 키워주는 AI 코치 앱.
반복 훈련으로 PRE / SID / CE / CC / HO 패턴을 무의식적으로 쓸 수 있도록 만드는 것이 핵심.

## 현재 상태 (Phase 1~2 뼈대 완성)
모델 없이 mock 모드로 전체 파이프라인이 돌아가는 상태.
LLM / STT 모두 `.env.local`의 `LLM_PROVIDER` / `STT_PROVIDER` 한 줄로 전환 가능.

## 실행 방법
```bash
npm install
cp .env.example .env.local   # 기본값 = mock 모드
npm run db:init
npm run dev                  # → http://localhost:5555
```

## 프로젝트 구조
```
src/
├── app/
│   ├── api/
│   │   ├── analyze/route.ts     ← POST /api/analyze (규칙 파서 + LLM)
│   │   ├── transcribe/route.ts  ← POST /api/transcribe (STT)
│   │   ├── sessions/route.ts    ← GET/POST /api/sessions
│   │   └── health/route.ts      ← GET /api/health (provider 상태 확인)
│   ├── history/page.tsx         ← 세션 목록 + 진행도 (Phase 3에서 채울 것)
│   ├── settings/page.tsx        ← provider 설정 표시
│   └── page.tsx                 ← 메인 화면 (RecordPanel + FeedbackPanel)
├── components/
│   ├── coach/
│   │   ├── RecordPanel.tsx      ← 마이크 버튼, 타이머, 텍스트 입력 fallback
│   │   └── FeedbackPanel.tsx    ← 패턴 배지, 점수 바, 갭, 리라이트 표시
│   └── layout/Sidebar.tsx
├── hooks/
│   ├── useRecorder.ts           ← MediaRecorder API 추상화
│   └── useCoachSession.ts       ← 녹음→전사→분석 전체 파이프라인 훅
├── lib/
│   ├── providers/
│   │   ├── llm.ts               ← Claude / OpenAI / Ollama / LMStudio / Mock
│   │   └── stt.ts               ← Whisper 로컬 / OpenAI API / Mock
│   ├── db/index.ts              ← SQLite CRUD + 진행도 분석 쿼리
│   └── parsers/structure.ts     ← 규칙 기반 구조 감지 + LLM 프롬프트 빌더
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
- better-sqlite3 (로컬 DB, 싱글 유저)
- LLM / STT 추상화 레이어 (provider 인터페이스 기반)

## 다음 작업 (Phase 3)
- `useCoachSession`에서 `sessionId`를 제대로 관리하고 FeedbackPanel에 연결
- History 페이지에 실제 데이터 연결 (`GET /api/sessions`)
- 반복 실수 top 3 추출 + 약점 기반 연습 문장 자동 생성

## Provider 전환 (.env.local)
```env
# 모델 없이 개발
LLM_PROVIDER=mock
STT_PROVIDER=mock

# Ollama 연결 시
LLM_PROVIDER=ollama
LLM_BASE_URL=http://localhost:11434
LLM_MODEL=llama3.2

# faster-whisper 연결 시
STT_PROVIDER=local
STT_BASE_URL=http://localhost:8000
```
