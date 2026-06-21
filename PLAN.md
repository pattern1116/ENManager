# PLAN — AI Speaking Coach

작업 진행 상황 / 다음 할 일 / 알려진 버그를 추적하는 살아있는 문서.
안정적인 프로젝트 설명(구조·실행·아키텍처)은 [CLAUDE.md](./CLAUDE.md)에 있음.

_최종 업데이트: 2026-06-20_

---

## 진행 상황 (완료)

- **전체 파이프라인 동작**: 녹음 → 전사 → 분석 → DB 저장 → 피드백/진행도/주간 리포트.
- **STT 실모델 연결**: `stt-server/`의 mlx-whisper(Apple Silicon). `STT_PROVIDER=local`, warm 호출 ~250ms.
- **LLM 실모델 연결**: 로컬 Gemma(`gemma-4-26b-a4b-it-4bit`, OpenAI 호환 게이트웨이 `:8001`). `LLM_PROVIDER=openai-compat`. 코드펜스 없는 깔끔한 JSON, 점수 차별력 확인(강한 문장 85 / 빈약한 문장 30).
- **Phase 3 기능**: History 데이터 연결, 약점 기반 연습 문장 생성, 주간 리포트, 연습 카드/카운트다운 — 코드상 구현 완료.
- **세션 경계 수정**: "한 번의 연습 묶음 = 한 세션". `reset()`은 발화 상태만 비우고 세션 유지, sessionId localStorage 영속화(30분 유휴 → 새 세션), "New session" 컨트롤, `/api/analyze`의 스테일 sessionId FK 가드. (이전엔 발화마다 새 세션이 생기던 버그)
- **환경 정비**: `.env.example` 복원, better-sqlite3 9.6 → 12.x 업그레이드(Node 26 C++20 호환).
- **알려진 버그 6개 수정 + 테스트 도입 (2026-06-20)**: 아래 "알려진 버그" 참고. Vitest 도입(`npm test`), **63개 통과**. 커버리지: `feedback`(검증/coerce), `structure`(규칙 파서), `practice`(연습 생성), `providers`(팩토리/mock), `db`(라운드트립·집계·trend·주간). 빌드/타입체크 통과.

---

## 다음 작업 (우선순위 순)

상태: ⬜ 미구현 · 🟡 부분 구현 · ✅ 완료

1. ✅ **연습 결과 루프 연결 (2026-06-20).** 연습 카드의 `targetPattern`을 녹음/텍스트 제출 → `/api/analyze`까지 전달, 탐지 패턴과 대조해 적중 여부·코칭 메시지를 피드백에 표시.
   - 구현: `AnalyzeRequest.targetPattern` 추가 → `lib/practiceResult.ts`의 `evaluatePractice`가 `PracticeResult`(hit/message) 생성 → `AnalyzeResponse.practiceResult` → `FeedbackPanel`에 ✓/✗ 배지. `buildAnalysisPrompt`에도 목표 패턴 주입(LLM이 의도 패턴 기준으로 판정). 훅(`useCoachSession`)은 `startRecording(target)`·`submitText(text, target)`로 목표를 전달(녹음은 ref로 캡처).
   - 테스트: `tests/practiceResult.test.ts`(5), `tests/analyze.route.test.ts`(라우트 5 — 적중/빗나감/무목표/무효목표/400).
2. ✅ **LLM 분석 품질·일관성 튜닝 (2026-06-20).** `/api/analyze`가 temperature=0.2 고정 + 채점 루브릭(85-100/65-84/40-64/0-39 + "deterministic") 프롬프트에 추가. provider 인터페이스에 `CompletionOptions.temperature` 추가(claude/openai/openai-compat는 top-level, ollama는 `options` 중첩).
   - 테스트: `tests/providers.test.ts`(temperature 전달 4), `tests/structure.test.ts`(루브릭/목표 주입 3).
3. ⬜ **STT 정확도 튜닝(선택).** `STT_MODEL=small` 기본. 정확도 필요시 `turbo`(large-v3-turbo)로 교체. (미적용 — 설정 한 줄 교체 + 실모델 필요라 코드 테스트 대상 아님)

### 추가 발견 (코드 리뷰 2026-06-20)

4. ✅ **`listSessions` 정렬 tie-break (2026-06-20).** `ORDER BY created_at DESC, id DESC`로 1초 내 동시 생성 세션 순서 결정화. 테스트: `tests/db.test.ts`(동일 timestamp tie-break).
5. ⬜ **스키마 3중 정의 통합.** 스키마가 `lib/db/index.ts`(`SCHEMA`)·`scripts/init-db.js`·`scripts/reset-db.js` **세 곳**에 중복 → 드리프트 위험. 한 군데(예: `lib/db`의 `SCHEMA`)로 모으고 스크립트에서 재사용. (기술 부채)
6. 🟡 **API 라우트 / React 컴포넌트 테스트.** 라우트 테스트 일부 도입(`/api/analyze`). 나머지 라우트 + 컴포넌트(jsdom) 테스트는 미도입.

---

## 알려진 버그 (2026-06-20 코드 리뷰)

**전부 수정 완료 (2026-06-20).** 테스트 우선(test-first)으로 처리 — `npm test`(Vitest, 현재 총 63개). 빌드/타입체크 통과.

1. ✅ **[크래시] 잘못된 패턴 문자열이 FeedbackPanel을 죽임.**
   LLM enum 드리프트(예: `"PRE|SID"`) → `PATTERN_META[pattern]` undefined → `meta.color` 크래시.
   - 수정: `src/lib/feedback.ts` 신설 — `buildFeedback`이 LLM JSON을 검증/coerce(`patternDetected`→유효 `PatternType` 아니면 `UNKNOWN`, `score` 0~100 클램프, `patternConfidence` coerce, `gapsFound` 배열 보장, 파싱 실패 시 규칙파서 fallback). `analyze/route.ts`가 이를 사용. `FeedbackPanel.tsx`의 `PatternBadge`도 `PATTERN_META[pattern] ?? UNKNOWN` 방어.
   - 테스트: `tests/feedback.test.ts` (13개).

2. ✅ **[분석 오류] 진행도 trend 쿼리 결함.**
   `getProgressReport`의 "recent 5" 집계가 서브쿼리 없이 collapse → 전체 평균 계산.
   - 수정: `src/lib/db/index.ts`의 recent 쿼리를 `AVG(score) FROM (SELECT score ... ORDER BY created_at DESC LIMIT 5)` 서브쿼리로 감쌈.
   - 테스트: `tests/db.test.ts` (improving/declining 판정).

3. ✅ **[깨진 스크립트] `npm run db:reset` 실행 불가.**
   - 수정: `scripts/reset-db.js` 생성(전체 DELETE + autoincrement 리셋). 더불어 init/reset 스크립트의 `.env.local` 로더가 실제 환경변수를 덮어쓰지 않도록 수정(테스트 가능 + 올바른 우선순위).

4. ✅ **[데드코드] transcribe 라우트의 무효 config.**
   - 수정: `transcribe/route.ts`에서 Pages Router용 `export const config` 제거.

5. ✅ **[엣지] 0점을 "데이터 없음"으로 오인.**
   - 수정: `getWeeklyReport`의 `scoreDelta`가 `avgScore` truthiness 대신 `utteranceCount > 0`로 데이터 유무 판정. (`recentImprovement`는 이미 `!= null` 가드로 정상이었음 — 추가 수정 불필요.)
   - 테스트: `tests/db.test.ts` (실제 0점 주간 delta).

6. ✅ **[개발 한정] DB 커넥션 누수 가능성.**
   - 수정: `lib/db/index.ts`의 커넥션 싱글톤을 `globalThis._scDb`에 캐싱 → Next dev 핫리로드 시 재사용.

---

## 메모

- 스키마가 `lib/db/index.ts`(`SCHEMA`)·`scripts/init-db.js`·`scripts/reset-db.js` **세 곳**에 정의됨 — 변경 시 모두 동기화 필요(드리프트 위험). → 다음 작업 5번에서 통합 제안.
- `.env.local`은 gitignore됨(키 안전). `.env.example`이 템플릿.
