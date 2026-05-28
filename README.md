# AI Speaking Coach

영어 발화 구조를 실시간으로 분석하고 피드백하는 AI 코치.

## 빠른 시작

```bash
# 1. 의존성 설치
npm install

# 2. 환경 설정
cp .env.example .env.local
# .env.local 편집 (모델 없이 바로 쓰려면 기본값 그대로 — mock 모드로 실행됨)

# 3. DB 초기화
npm run db:init

# 4. 개발 서버 시작
npm run dev
```

브라우저에서 http://localhost:3000

---

## Mock 모드 (모델 없이 개발)

`.env.local`에서:
```
LLM_PROVIDER=mock
STT_PROVIDER=mock
```

- `MockLLMProvider`: 가짜 피드백 JSON을 600ms 딜레이 후 반환
- `MockSTTProvider`: 샘플 문장 6개 중 랜덤으로 반환 (800ms 딜레이)

UI 개발, 레이아웃 확인, 파이프라인 테스트 모두 모델 없이 가능.

---

## 모델 연결 (나중에)

### Ollama
```bash
# Ollama 설치 후
ollama pull llama3.2

# .env.local
LLM_PROVIDER=ollama
LLM_BASE_URL=http://localhost:11434
LLM_MODEL=llama3.2
```

### faster-whisper (STT)
```bash
pip install faster-whisper
# 서버 실행 (별도 레포 or scripts/whisper-server.py 예정)

# .env.local
STT_PROVIDER=local
STT_BASE_URL=http://localhost:8000
STT_MODEL=small
```

### Claude API
```bash
# .env.local
LLM_PROVIDER=claude
LLM_API_KEY=sk-ant-...
LLM_MODEL=claude-3-5-haiku-20241022
```

---

## 프로젝트 구조

```
src/
├── app/
│   ├── api/
│   │   ├── analyze/route.ts     ← POST /api/analyze
│   │   ├── transcribe/route.ts  ← POST /api/transcribe
│   │   ├── sessions/route.ts    ← GET/POST /api/sessions
│   │   └── health/route.ts      ← GET /api/health
│   ├── history/page.tsx
│   ├── settings/page.tsx
│   └── page.tsx                 ← 메인 화면
├── components/
│   ├── coach/
│   │   ├── RecordPanel.tsx      ← 마이크 버튼 + 녹음 UI
│   │   └── FeedbackPanel.tsx    ← 패턴/점수/갭/리라이트 표시
│   └── layout/
│       └── Sidebar.tsx
├── hooks/
│   ├── useRecorder.ts           ← MediaRecorder API 추상화
│   └── useCoachSession.ts       ← 전체 파이프라인 훅
├── lib/
│   ├── providers/
│   │   ├── llm.ts               ← LLM provider 추상화
│   │   └── stt.ts               ← STT provider 추상화
│   ├── db/
│   │   └── index.ts             ← SQLite CRUD
│   └── parsers/
│       └── structure.ts         ← 규칙 기반 구조 분석
└── types/
    └── index.ts                 ← 전체 타입 정의
```

---

## Phase 현황

| Phase | 상태 | 내용 |
|-------|------|------|
| Phase 1 | 🔧 뼈대 완성 | Voice pipeline — 모델 연결 시 바로 동작 |
| Phase 2 | 🔧 뼈대 완성 | Structure parser (규칙 기반 완성, LLM 연결 대기) |
| Phase 3 | 📋 설계됨   | Adaptive memory — DB 스키마 완성 |
| Phase 4 | 📋 설계됨   | Full agent loop |
