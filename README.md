# Mirror Me AI

같은 방향으로 위험 구역을 피해 AI 보스에게 거짓 확신을 심고, 예측이 잠긴 뒤 반대로 빠져 코어를 직접 베는 짧은 authored 2.5D 액션 게임입니다.

**회피 규칙:** 공격이 끝날 때 플레이어의 실제 발 위치가 주홍 위험선 밖이면 회피 성공입니다. WASD와 대시 모두 사용할 수 있으며, 대시는 무적이 아니라 빠른 이동입니다.

## 플레이

- 이동: `WASD` 또는 방향키
- 대시: `Space`, `Shift`, `X`
- 공격: `J`, `Z`, 마우스 클릭
- 재도전: 게임 오버 안내 뒤 `Enter` 또는 `Space`
- 음소거: `M` 또는 화면 버튼

배포 주소: <https://silvermaking.github.io/mirror-me-ai/>

## 로컬 실행

ES modules를 사용하므로 파일을 직접 열지 말고 저장소 루트에서 정적 서버를 실행합니다.

```bash
python3 -m http.server 4173
```

그다음 <http://localhost:4173>을 엽니다.

## 테스트

```bash
node --test tests/*.test.mjs
```

게임은 외부 런타임 라이브러리나 서버 요청 없이 정적 HTML, CSS, JavaScript로 실행됩니다.

## authored 아트 재생성

최종 런타임 아트는 저장소의 Blender 원본에서 고정 정사영 atlas로 재현할 수 있습니다.

```bash
blender --background --factory-startup --python tools/blender/build_map_challenger_art.py
```

생성된 WebP atlas와 픽셀 anchor 계약은 `assets/2d/atlases/atlas.json`에 기록됩니다.

## 기획 문서

- [게임 기획](./docs/GAME_DESIGN.md)
- [첫 30초 수직 슬라이스](./docs/VERTICAL_SLICE.md)
- [현재 2D challenger 방향](./docs/design/2D_CHALLENGER_DIRECTION.md)
- [보관된 3D 비교 기준](./docs/design/VISUAL_DIRECTION.md)
