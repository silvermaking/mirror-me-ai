# Mirror Me AI — 프로젝트 진행 원장

> 이 파일은 **현재 어디까지 왔고 다음 한 건이 무엇인지**의 유일한 기준이다. 영구 규칙은 `AGENTS.md`, 게임 규칙은 `docs/GAME_DESIGN.md`, 현재 아트 방향은 `docs/design/SPRITE_REBUILD_DIRECTION.md`가 우선한다. 상태가 Git과 다르면 Git을 재확인한 뒤 Session 1 역할이 이 파일을 고친다.

## 현재 스냅샷

- 갱신일: 2026-08-07
- 통합 후보 브랜치: `codex/classic-asset-challenger`
- 검증된 플레이어블 기준: `6477d91` — 이 원장과 운영 문서 커밋은 이 SHA 위에 쌓일 수 있다.
- 검증된 개발환경 기준: `c425d00`, 컨테이너 CI 게이트 `5822ea6`; GitHub Actions run `31134643219` PASS
- 공개 배포 기준: `origin/main` @ `cee7cd1` — 통합 후보의 후속 커밋은 아직 `main`에 병합·배포하지 않았다.
- 현재 단계: 최초판 게임필 위에 초기 authored PNG 캐릭터 rig, SFX, BGM, 최소 HUD와 첫 회피 가독성까지 통합된 플레이어블 기준선
- 방향 기준: `docs/design/SPRITE_REBUILD_DIRECTION.md`
- **NEXT: `ART-02A` — 전신 액션 키포즈 팩과 모션 기준 잠금**
- 공동 디렉터 결정 대기: 없음

## 지금 사실인 것

- 현재 런타임은 플레이어 `idle/contact`, 보스 `idle/좌우 LOCK/좌우 miss-open`, 분리 검과 파일드라이버 파츠를 사용한다. 이는 초기 authored rig이며 이동·대시·검격·피격·사망·보스 전 상태의 완성 애니메이션 세트는 아니다.
- `src/game-core.mjs`의 판정, 최초판의 연속 이동, 세 번의 기억, 고정 LOCK, 반대 회피, 열린 코어 직접 검격은 보존되어 있다.
- 로컬 SFX, 한 개의 BGM loop, 최소 전투 계기판, 첫 세 회피 안내, 게임 오버 재도전 표면이 들어 있다.
- 현재 후보는 GitHub Pages 공개본이 아니다. 공개본 교체는 `RELEASE-01`에서 사람 플레이 검수 뒤 수행한다.

## 활성 작업

현재 없음. 새 세션은 `ART-02A`를 맡는다.

| 역할 | 작업 ID | 브랜치·worktree | 체크포인트 | 검증 SHA |
| --- | --- | --- | --- | --- |
| — | — | — | — | — |

## 작업 큐

상태는 `READY / ACTIVE / WAITING_REVIEW / FIX_REQUIRED / PAUSED / BLOCKED / DONE / SUPERSEDED`만 사용한다. `NEXT`는 정확히 하나만 둔다.

| ID | 결과와 완료 증거 | 역할·소유 범위 | 의존성 | 상태 | 정확한 다음 행동 |
| --- | --- | --- | --- | --- | --- |
| `ART-02A` | 플레이어와 보스의 동일 정체성을 유지한 액션 키포즈 팩. `320×180`에서 검·보스·드라이버·코어가 읽히는 대표 장면, 동작별 anchor 후보와 PASS/FAIL 기록 | Session 1: `docs/`, `work/reviews/`; 디자인 subagent가 이미지 제작 | `6477d91` | **READY / NEXT** | `ART-02A: 전신 액션 키포즈와 모션 기준 잠금; 완료 조건: 대표 장면·anchor 후보·PASS/FAIL·방향 SHA` Goal을 만들고, 현재 런타임 캡처를 기준으로 플레이어 `move/dash/slash/hurt/death`, 보스 `explore/memory/LOCK/prediction/miss-open/core-hit/recover`의 큰 실루엣과 접촉 순서를 잠근다. 이 단계에서는 런타임 코드를 고치지 않는다. |
| `ART-02B` | 승인된 키포즈를 동작별 무손실 master·PNG strip·anchor manifest로 만들고 런타임에 연결. 테스트, 데스크톱·`320×180` 캡처, 무성 8초 인과 영상, 자산 예산 증거 | Session 2: `assets/2d/`, `src/render-sprite.mjs`, 관련 도구·테스트 | `ART-02A` | WAITING | `ART-02A`의 `DIRECTION LOCKED @ SHA` 뒤 별도 worktree에서 `PLAN READY`를 제출한다. |
| `AUDIO-02` | 실제 접촉 프레임과 ±33ms인 사건음, SFX보다 낮고 주요 사건에서 ducking되는 BGM의 청취·파형·테스트 증거 | Session 2: `assets/audio/`, `src/audio.mjs`, audio tests | `ART-02B` 접촉 타이밍 | WAITING | 새 모션 접촉 프레임이 잠긴 뒤 소리만 단독 Goal로 검수·수정한다. |
| `UX-02` | 웹 대시보드가 아닌 전장 가장자리 HUD, 사건성 튜토리얼, 사망 원인·다음 행동·기록이 `320×180`에서 읽히는 사람 플레이 증거 | Session 1 방향 검수; Session 2: `index.html`, `styles.css`, UI 관련 코드·테스트 | `ART-02B` 화면 점유 | WAITING | 아트 통합 뒤 기존 최소 HUD를 실제 장면과 겹침 없이 재검수한다. |
| `RELEASE-01` | 통합 후보를 `main`에 반영하고 Pages에서 세 버전 링크·입력·음향·재도전을 실제 확인한 배포 SHA | Session 1 통합·배포 | `ART-02B`, `AUDIO-02`, `UX-02` DONE | WAITING | 자동 테스트와 사람 플레이 게이트가 모두 통과한 뒤에만 실행한다. |

## 검증 기준선

- 자동 테스트: fresh clone `fb87924`에서 153/153 PASS
- 게임 코어: 최종 HUD 커밋에서 `src/game-core.mjs`와 기존 core tests 변경 없음
- 정적 Pages 산출물: 현재 후보·`e63f7a0` 최초판·`630e0da` 3D 보관판 세 경로 빌드 PASS
- fresh clone 환경: 빈 `node_modules`·격리 pnpm store에서 `three@0.180.0` 설치, 153 tests, 세 Pages 변형, 정적 서버 HTTP 200 PASS
- 브라우저 콘솔·정적 자산 경로: 오류 없음, 런타임 외부 CDN 요청 없음
- `320×180` 자동·에이전트 장면 검수: 현재 기준선 PASS
- 남은 사람 검수: 5명 중 4명 가독성 기준, 무성 8초 인과, 화면 없는 사건음, 모바일 실제 손 입력은 아직 완료 증거가 없다.

자동 테스트는 필요조건일 뿐 아트·재미·직관성 PASS를 대신하지 않는다.

## 완료 체크포인트

| ID | 채택 SHA | 확인된 결과 |
| --- | --- | --- |
| `BASE-01` | `5f184ee` | 최초판 좌표·연속 움직임 위 classic challenger 가독성 기준선 |
| `ART-01` | `cf53823` | 초기 authored PNG 캐릭터 rig와 결정적 strip build 통합 |
| `SFX-01` | `680a210` | 로컬 authored 사건음과 oscillator fallback |
| `BGM-01` | `0a0bb4e` | 정적 한-loop BGM, 사건 ducking과 결정적 build |
| `UX-01` | `6477d91` | 최소 HUD, 첫 회피 인과, 터치·재도전 가독성; 153 tests PASS |
| `DEVENV-01` | `c425d00`, `5822ea6` | Node 24.14·Python 3.11·pnpm 11.16, Docker Compose·Dev Container, 교차 플랫폼 서버·검증 명령과 CI 컨테이너 빌드; fresh clone와 Actions run `31134643219` PASS |

## 진행 원장 갱신 규칙

1. 새 작업을 시작할 때 `ACTIVE`에 작업 ID, 역할, 브랜치, 현재 체크포인트를 기록한다.
2. 작업자는 테스트·캡처·커밋·푸시 뒤 `REVIEW READY @ <SHA>`를 보고한다.
3. Session 1은 실제 결과를 검증한 뒤에만 `DONE`으로 바꾼다. 실패하면 `FIX_REQUIRED`와 가장 큰 결함 하나만 남긴다.
4. 통과한 뒤 의존성이 해소된 항목 하나만 새 `NEXT/READY`로 승격한다.
5. 멈출 때는 안전한 체크포인트 SHA와 **다음 한 행동**을 `PAUSED`에 남긴다. Goal·채팅이 없어져도 이 파일만으로 재개할 수 있어야 한다.
6. `DONE`에는 테스트, 시각·청각 증거, 채택 SHA가 모두 필요하다. 의도·계획·코드 컴파일만으로 완료 처리하지 않는다.
