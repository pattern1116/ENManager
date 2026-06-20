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

---

## 다음 작업 (우선순위 순)

1. **연습 결과 루프 연결.** 연습 문장으로 말한 결과가 `targetPattern` 대비 어땠는지 피드백/진행도에 반영.
2. **LLM 분석 품질·일관성 튜닝.** 점수/패턴 판정이 호출마다 흔들리지 않는지(같은 문장 반복 평가) 확인. `/api/analyze`는 temperature를 안 보내 게이트웨이 기본값으로 도는 중 — 채점 루브릭 추가 + temperature 고정 고려. (참고: temperature=0이면 같은 문장 점수가 오히려 더 낮고 들쭉날쭉한 경향 관찰됨.)
3. **STT 정확도 튜닝(선택).** `STT_MODEL=small` 기본. 정확도 필요시 `turbo`(large-v3-turbo)로 교체.

---

## 알려진 버그 (2026-06-20 코드 리뷰)

심각도 순. 미수정 상태.

1. **[크래시] 잘못된 패턴 문자열이 FeedbackPanel을 죽임.**
   LLM이 enum에 없는 값(예: `"PRE|SID"`)을 `patternDetected`로 반환하면 `PATTERN_META[pattern]`이 `undefined`가 되고, `PatternBadge`에서 `meta.color` 접근 시 런타임 크래시.
   - 위치: `src/app/api/analyze/route.ts`(검증 없음), `src/components/coach/FeedbackPanel.tsx`(PatternBadge 방어 없음).
   - 처방: analyze 라우트에서 LLM JSON 검증 — `patternDetected`를 유효 `PatternType`으로 coerce(아니면 `UNKNOWN`), `score` 0~100 클램프, `gapsFound` 배열 보장. FeedbackPanel도 `PATTERN_META[pattern] ?? UNKNOWN` 방어.

2. **[분석 오류] 진행도 trend 쿼리 결함.**
   `getProgressReport`의 "recent 5" 쿼리가 서브쿼리 없이 `SELECT AVG(score) ... ORDER BY ... LIMIT 5` → 집계가 단일 행으로 접혀서 `ORDER BY`/`LIMIT`이 무효, **전체 평균**을 계산함. "older 5"는 서브쿼리로 올바르게 처리됨. 결과적으로 improving/declining 판정이 틀림.
   - 위치: `src/lib/db/index.ts:188`.
   - 처방: recent도 older처럼 `AVG(score) FROM (SELECT score ... ORDER BY created_at DESC LIMIT 5)` 서브쿼리로 감싸기.

3. **[깨진 스크립트] `npm run db:reset` 실행 불가.**
   `package.json`은 `node scripts/reset-db.js`를 부르는데 파일이 없음.
   - 처방: `scripts/reset-db.js` 생성(`lib/db`의 `resetDB` 또는 DELETE 실행) 또는 스크립트 제거.

4. **[데드코드] transcribe 라우트의 무효 config.**
   `src/app/api/transcribe/route.ts`의 `export const config = { api: { bodyParser: false } }`는 Pages Router 문법이라 App Router에선 무시됨. 오해 소지 있어 제거 권장.

5. **[엣지] 0점을 "데이터 없음"으로 오인.**
   `scoreDelta`/`recentImprovement`가 실제 avg `0`을 falsy로 취급해 "변화 없음" 처리. 모든 발화가 0점인 극단 케이스에서만 발생. 사소.

6. **[개발 한정] DB 커넥션 누수 가능성.**
   `lib/db/index.ts`의 `_db` 모듈 싱글톤이 Next dev 핫리로드 때 재생성되며 커넥션이 누수될 수 있음. `globalThis`에 캐싱하면 해결. 프로덕션 영향 없음.

---

## 메모

- 스키마가 `lib/db/index.ts`(`SCHEMA`)와 `scripts/init-db.js` **두 곳**에 정의됨 — 변경 시 둘 다 동기화 필요(드리프트 위험).
- `.env.local`은 gitignore됨(키 안전). `.env.example`이 템플릿.
