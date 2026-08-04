# Mirror Me AI — 두 세션 운영

## 한 줄 원칙

**Session 1이 방향을 잠그고 결과를 판정하며, Session 2가 별도 worktree에서 구현한다.** 두 세션은 체크포인트마다 서로의 작업을 읽고 메시지를 주고받는다.

| 세션 | 브랜치 | 소유 파일 | 현재 할 일 |
| --- | --- | --- | --- |
| 1. 총괄 디렉팅 | 로컬 `main` | `docs/`, 방향 잠금, 구현 리뷰, 최종 병합 | 구현 작업 관찰, 장면 PASS/FAIL |
| 2. 플레이어블 구현 | Codex worktree 구현 브랜치 | `src/`, `tests/`, `index.html`, `styles.css`, 자산·배포 구성 | Three.js 3D 렌더러 전환 |

각 세션은 하위 에이전트를 최대 2명만 동시에 쓴다. Session 1은 `미술 제안 + 전투 가독성 검증`, Session 2는 `구현 + 판정 테스트`로 역할을 고정하며 같은 질문을 두 에이전트에게 반복시키지 않는다.

## 모델 배정

- Session 1: `gpt-5.6-sol`, `ultra` — 방향 결정, 모호한 문제 해결, 최종 품질 판정
- Session 2: `gpt-5.6-terra`, `high` — 구현, 테스트, 반복 수정
- 단순 파일 탐색이나 로그 정리는 Session 2가 Terra 하위 에이전트에 위임할 수 있다.
- Session 2가 같은 기술 문제에 두 번 막힐 때만 Session 1이 Sol로 원인을 검토한다.

## 티키타카 체크포인트

```text
Session 1 → DIRECTION LOCKED @ SHA
Session 2 → PLAN READY
Session 1 → GO 또는 변경점 한 가지
Session 2 → FIRST PLAYABLE
Session 1 → PASS 또는 지배적인 결함 한 가지
Session 2 → REVIEW READY @ SHA
Session 1 → MERGE 또는 FIX
```

Session 1은 앱의 작업 읽기·대기·메시지 기능으로 Session 2를 직접 관찰하고 조율한다. 공동 디렉터가 두 작업 사이에서 보고를 복사하지 않는다.

## 운영 게이트

1. Session 1이 선택 방향·금지 요소·3D 기준 이미지·모션 타이밍·판정 보존 계약을 커밋한다.
2. 공동 디렉터 승인 뒤 `DIRECTION LOCKED @ <commit SHA>`를 Session 2에 직접 보낸다.
3. Session 2가 그 SHA를 기준으로 생성된 worktree에서 구현을 시작한다.
4. Session 1은 구현 파일을 고치지 않고 장면 단위 PASS/FAIL만 반환한다.
5. 병합 순서는 `디자인 결정 → 구현 → 교차 검증`이며 최종 병합은 한 세션만 담당한다.

## 충돌 방지

- Session 1은 `main`에서 게임 구현 파일을 직접 수정하지 않는다. 방향 문서와 검증된 구현의 최종 병합만 담당한다.
- 같은 파일을 양쪽 세션에서 동시에 수정하지 않는다.
- 공용 파일은 소유 세션에 변경을 요청한다.
- 커밋은 `design:`, `render:`, `gameplay:`, `test:` 단위로 분리한다.
- 방향이 바뀌면 Session 1이 새 SHA를 발행하고, Session 2는 확인 전 관련 구현을 멈춘다.

## 디렉터 확인 형식

```text
[결정 필요] 장면 — 권고안
이유: 플레이에서 달라지는 것 한 문장
답변: A / B (답변 전 중단: 대상 파일)
```

대표안은 한 문장과 이미지 한 장만 보여 준다. 긴 비교표·프롬프트·교차 검토 로그는 `work/`의 에이전트 부록에 둔다.
