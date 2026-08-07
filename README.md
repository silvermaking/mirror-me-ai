# Mirror Me AI

같은 방향으로 위험 구역을 피해 AI 보스에게 거짓 확신을 심고, 예측이 잠긴 뒤 반대로 빠져 코어를 직접 베는 짧은 authored 2D 액션 게임입니다.

**회피 규칙:** 공격이 끝날 때 플레이어의 실제 발 위치가 주홍 위험선 밖이면 회피 성공입니다. WASD와 대시 모두 사용할 수 있으며, 대시는 무적이 아니라 빠른 이동입니다.

## 세 가지 버전 플레이

각 링크는 당시의 플레이 감각과 비주얼을 고정 커밋에서 그대로 실행합니다.

| 버전 | 특징 | 실행 |
| --- | --- | --- |
| 현재 아트 challenger | 최초판의 연속 움직임 + 피벗 기반 authored SVG 파츠 | [플레이](https://silvermaking.github.io/mirror-me-ai/) |
| 최초 완성판 | 비교 기준인 순수 Canvas 전투 · `e63f7a0` | [플레이](https://silvermaking.github.io/mirror-me-ai/versions/first-playable/) |
| 보관 3D판 | Three.js와 Blender GLB를 사용한 Kiln Reliquary · `630e0da` | [플레이](https://silvermaking.github.io/mirror-me-ai/versions/3d-runtime/) |

## 조작

- 이동: `WASD` 또는 방향키
- 대시: `Space`, `Shift`, `X`
- 공격: `J`, `Z`, 마우스 클릭
- 재도전: 게임 오버 안내 뒤 `Enter` 또는 `Space`
- 음소거: `M` 또는 화면 버튼

## 로컬 실행

### Docker 또는 Dev Container — 권장

Windows, macOS, Linux에서 Docker를 사용할 수 있다면 호스트의 Node·Python 설치와 무관하게 같은 환경을 사용합니다.

```bash
git clone https://github.com/silvermaking/mirror-me-ai.git
cd mirror-me-ai
docker compose up --build
```

<http://localhost:4173>에서 실행됩니다. VS Code나 호환 IDE에서는 저장소를 연 뒤 **Reopen in Container**를 선택하고 `pnpm dev`를 실행합니다.

전체 검증은 같은 컨테이너에서 실행합니다.

```bash
docker compose run --rm dev pnpm verify
```

### 네이티브 환경

`.nvmrc`의 Node 24.14.0과 `.python-version`의 Python 3.11을 사용합니다. Python은 아트·음향 자산을 다시 만들 때만 필요합니다. pnpm 버전은 `package.json`에 고정되어 있습니다.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm verify
pnpm dev
```

Corepack이 없는 Node 배포판은 `npm install --global pnpm@11.16.0`을 한 번 실행합니다.

## 테스트

```bash
pnpm test
```

세 버전의 Pages 산출물을 로컬에서 확인하려면 다음을 실행합니다.

```bash
pnpm pages:build
```

생성 결과는 Git에서 제외되는 `.pages-dist/`에 저장됩니다.

게임은 외부 런타임 라이브러리나 서버 요청 없이 정적 HTML, CSS, JavaScript로 실행됩니다.

## 현재 authored 아트

현재 challenger는 Blender나 생성 이미지에 의존하지 않습니다. 편집 가능한 SVG 파츠 네 장을 최초판 Canvas 관절과 피벗에 결합하며, 로딩 실패 시에도 최초판 절차 렌더링으로 즉시 플레이됩니다. 자산 좌표와 피벗 계약은 `src/classic-art-contract.mjs`에 있습니다.

## 기획 문서

- [게임 기획](./docs/GAME_DESIGN.md)
- [첫 30초 수직 슬라이스](./docs/VERTICAL_SLICE.md)
- [현재 classic asset challenger 방향](./docs/design/CLASSIC_ASSET_CHALLENGER.md)
- [보관된 지도 2D 방향](./docs/design/2D_CHALLENGER_DIRECTION.md)
- [보관된 3D 비교 기준](./docs/design/VISUAL_DIRECTION.md)
