# AI Speaking Coach — Project Plan

> **목표**: 영어로 말할 때 문장 구조를 자동으로 정리하는 능력을 키워주는 AI 코치 앱
> 
> **핵심 문제**: 글로 쓸 때는 구조를 잡을 시간이 있지만, 말할 때는 그 시간이 없다. 반복 훈련으로 구조화된 발화를 무의식적으로 할 수 있도록 만드는 것이 목표.
>
> **대상 사용자**: 단일 사용자 — Auth, 멀티 유저 분리 불필요.

---

## Phase 1 — Core Voice Pipeline
> 가장 먼저 만들 것. 이것만 되면 앱의 뼈대가 완성된다.

- 브라우저 `MediaRecorder API`로 음성 녹음
- Whisper (로컬)로 음성 → 텍스트 변환
- LLM Provider로 텍스트 분석 및 피드백 생성
- 피드백을 화면에 표시

**결과물**: 말하면 → 텍스트로 바뀌고 → 피드백이 나오는 기본 루프

---

## Phase 2 — Structure-Aware Feedback
> 이 프로젝트의 핵심. 단순 문법 교정이 아닌 문장 구조 분석.

- **Sentence parser**: 발화에서 구조 유형 감지 (주장 / 이유 / 예시 / 결론 등)
- **Gap detector**: 빠진 구성 요소 탐지 ("이유가 없다", "주어가 불분명하다" 등)
- **Rewrite engine**: 더 명확한 버전 제시 + 어떤 패턴을 써야 하는지 설명

**핵심 패턴 (훈련 목표)**:
| 패턴 | 구조 | 예시 |
|------|------|------|
| PRE | Point → Reason → Example | "I prefer mornings [point] because I focus better [reason]. For example, I finished in one hour today [example]." |
| SID | Signpost → Idea → Detail | "Actually, I think [signpost] remote work helps [idea]. People save commute time [detail]." |
| CE  | Cause → Effect | "I didn't prepare enough, so I struggled to explain clearly." |
| CC  | Contrast Connector | "I enjoy in-person meetings. However, video calls save time." |
| HO  | Hedging + Opinion | "I'd say the biggest issue is communication." |

---

## Phase 3 — Adaptive Memory
> 여기서부터 진짜 AI Agent가 된다.

- 세션마다 틀린 패턴을 DB에 저장
- 반복되는 구조적 실수 top 3 추출
- 약점에 맞는 연습 문장 자동 생성
- 과거 세션 대비 개선도 추적

**DB 구조** (SQLite 단일 파일, 싱글 유저 — user_id 없음):
```sql
CREATE TABLE sessions (
  id         INTEGER PRIMARY KEY,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE utterances (
  id                 INTEGER PRIMARY KEY,
  session_id         INTEGER REFERENCES sessions(id),
  text               TEXT,    -- 원본 발화
  structure_detected TEXT,    -- 감지된 구조 유형
  gaps_found         TEXT,    -- JSON array (빠진 요소들)
  rewrite_shown      TEXT,    -- 제시된 개선 문장
  pattern_used       TEXT,    -- PRE / SID / CE / CC / HO
  created_at         TEXT DEFAULT (datetime('now'))
);
```

---

## Phase 4 — Full Agent Loop
> 자기 발전하는 완전한 루프.

- **Session planner**: 이전 세션 데이터 기반으로 오늘 연습 주제 자동 선정
- **Difficulty adjuster**: 실수가 줄어들면 더 복잡한 주제/패턴으로 자동 상향
- **Progress reporter**: 주간 리포트 — 어떤 패턴이 늘었는지, 어떤 게 아직 약한지

---

## Tech Stack

| 역할 | 기술 |
|------|------|
| Frontend | Next.js + React |
| 음성 녹음 | Browser MediaRecorder API |
| 음성 → 텍스트 | Whisper (로컬 or API, 전환 가능) |
| AI 분석 | LLM Provider 추상화 레이어 (아래 참고) |
| DB | SQLite (로컬 파일 하나, 서버 불필요) |
| 배포 | 로컬 서버 |

---

## LLM Provider 추상화

`.env` 한 줄만 바꿔서 Claude / OpenAI / 로컬 LLM을 전환할 수 있는 구조.

```typescript
// 모든 LLM provider가 구현해야 하는 인터페이스
interface LLMProvider {
  complete(messages: Message[], system: string): Promise<string>
}

// 구현체
class ClaudeProvider implements LLMProvider { ... }        // Anthropic API
class OpenAIProvider implements LLMProvider { ... }        // OpenAI API
class OllamaProvider implements LLMProvider { ... }        // 로컬 (Ollama)
class LMStudioProvider implements LLMProvider { ... }      // 로컬 (LM Studio)
class OpenAICompatProvider implements LLMProvider { ... }  // OpenAI 호환 (vLLM 등)
```

**설정** (`.env`):
```env
LLM_PROVIDER=ollama                   # claude | openai | ollama | lmstudio | openai-compat
LLM_BASE_URL=http://localhost:11434   # 로컬일 경우
LLM_MODEL=llama3.2
LLM_API_KEY=                          # 로컬이면 비워도 됨
```

**권장 로컬 LLM 옵션**:
| 도구 | 특징 | 추천 모델 |
|------|------|-----------|
| [Ollama](https://ollama.com) | 설치 쉬움, CLI | llama3.2, gemma3, mistral |
| [LM Studio](https://lmstudio.ai) | GUI, 초보자 친화적 | 동일 |
| vLLM | 고성능, GPU 서버용 | 대형 모델 |

---

## Whisper 로컬 실행

추가 비용 없이 음성 인식을 로컬에서 돌리는 방법.

```typescript
interface STTProvider {
  transcribe(audioBlob: Blob): Promise<string>
}

class WhisperLocalProvider implements STTProvider { ... }  // faster-whisper (Python 서버)
class WhisperAPIProvider implements STTProvider { ... }    // OpenAI Whisper API
```

**실행 옵션**:

옵션 A — `faster-whisper` (Python, CPU/GPU 모두 가능):
```bash
pip install faster-whisper
# 첫 실행 시 모델 자동 다운로드
```

옵션 B — `whisper.cpp` (C++, M1/M2 Mac에 최적, 매우 가벼움):
```bash
git clone https://github.com/ggerganov/whisper.cpp
```

**모델 선택**:
| 모델 | 크기 | 속도 | 영어 정확도 |
|------|------|------|-------------|
| tiny | 75MB | 매우 빠름 | 보통 |
| base | 150MB | 빠름 | 좋음 |
| small | 460MB | 보통 | 매우 좋음 ✅ 추천 |
| medium | 1.5GB | 느림 | 거의 완벽 |

**설정** (`.env`):
```env
STT_PROVIDER=local                    # local | openai-api
STT_BASE_URL=http://localhost:8000    # faster-whisper 서버 URL
STT_MODEL=small
```

---

## Build Order

```
Phase 1 (주말)  →  Phase 2 (1~2주)  →  Phase 3 (2~3주)  →  Phase 4 (1달+)
```

각 Phase는 독립적으로 배포 가능. Phase 1만 완성해도 바로 쓸 수 있다.

---

## Key Design Principles

1. **실시간 구조 피드백** — 말한 직후 바로 "어디서 구조가 무너졌는지" 보여줘야 함
2. **패턴 내면화** — 교정을 보여주는 게 아니라, 반복으로 자동화되도록 설계
3. **말하기 압박 시뮬레이션** — 타이머 기반 즉흥 발화 훈련 포함 (30초 스피치 등)
4. **학습 데이터 누적** — 앱이 나를 알아갈수록 더 정확한 훈련을 제공
5. **완전 로컬 가능** — LLM + Whisper 모두 로컬로 돌릴 수 있어 추가 비용 없음

---

*Last updated: 2026-05-28*
