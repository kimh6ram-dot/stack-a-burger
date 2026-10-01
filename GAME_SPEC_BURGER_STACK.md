# GAME_SPEC_BURGER_STACK

> 게임명: 햄버거 쌓기  
> 영문명: Burger Stack  
> 네임스페이스: BS  
> 기준일: 2026-09-29 (v1) → 2026-09-29 개정 (v2)  
> 게임 유형: 타이밍 / 균형 쌓기 / 최고기록형 모바일 미니게임

---

## v2 개정 안내 (정본)

**이 문서는 v2가 정본이다.** v1은 "빗나간 부분만 잘리고 폭이 줄어드는" 고전 Stack 게임
방식이었다. v2에서는 이 방식을 **전부 폐기**했다.

핵심 변경:

```
재료는 끝까지 원본 크기(폭·높이)를 유지한다.
→ 접촉 기반으로 맞닿아 쌓인다(간격 없음).
→ 착지마다 스택 전체의 중심/지지 안정성을 계산한다.
→ SAFE(정상) / UNSTABLE(위태로움) / COLLAPSE(붕괴) 3단계로 판정한다.
→ COLLAPSE면 약 1.5초 동안 스택이 실제로 무너지는 모습을 보여준 뒤 게임을 종료한다.
```

이미지 clipping, source crop, overlapWidth만큼 width를 줄이는 로직, cut piece 생성
로직은 코드에서 전부 제거했다(§15 참고). 아래 본문은 v2 기준으로 전면 재작성했다.

---

## 1. 게임명 · 목표 · 메인 카피

### 게임명

햄버거 쌓기

### 한 줄 목표

화면 상단에서 좌우로 움직이는 햄버거 재료를 타이밍에 맞춰 떨어뜨려,
중심을 잃지 않게 최대한 높이 쌓는다.

### 핵심 규칙 (v2)

재료는 원본 크기를 잃지 않는다. 대신 착지 위치가 아래 재료·스택 전체 중심에서
얼마나 벗어났는지에 따라 **SAFE → UNSTABLE → COLLAPSE** 3단계로 갈린다.
COLLAPSE가 뜨면 스택이 실제로 무너지는 연출 후 게임 오버.

### INTRO 화면

- 작은 라벨: `햄버거 쌓기`
- 메인 제목: `안 무너지게\n쌓으세요`
- 비주얼: 완성된 햄버거 1개(bottom_bun·patty·cheese·lettuce·tomato·top_bun를 실제
  접촉 규칙 그대로 쌓은 정적 프리뷰, `src/main.js`의 `drawIntroPreview()`가 그린다)
- CTA: `시작하기`

---

## 2. 핵심 행동 · 플레이 감각

### 핵심 행동

유저가 하는 행동은 단 하나다. 화면 상단의 고정된 라인에서 좌우로 움직이는
재료를 보고 원하는 순간 입력한다.

### PC / 모바일 / 금지 조작 — §12, §13 참고

드래그, 방향키 이동, 힘 게이지, 각도 조절은 모두 금지(v1과 동일하게 유지).

### 손맛 — "잡고 있다가 놓는 느낌" (v2 신설)

입력 한 번은 아래 3단계로 이어지는 **하나의 연속된 물리 동작**이어야 한다(§9).

```
HOLD(좌우 이동) → RELEASE(정지 + 미세 처짐) → FALL(가속 낙하) → LAND IMPACT(압축→복귀)
```

- **RELEASE**: 입력 즉시 좌우 이동 정지. 약 0.06~0.10초 동안 2~4px만 아래로
  처지는 느낌(위로 튀는 모션 금지, scale 변화 없음).
- **FALL**: RELEASE 종료 위치에서 착지 지점까지 **고정 시간**(약 0.38~0.50초)
  동안 ease-in(처음 느리게, 갈수록 빠르게)으로 낙하. 거리와 무관하게 시간은 고정.
- **LAND IMPACT**: 착지 순간 Y축으로 2~4px 압축 후 0.10~0.16초 안에 복귀.
  "묵직한 책이 탁 덮이는" 느낌. 과도한 bounce·회전 없음(§8).

밧줄·손·집게 같은 별도 그래픽은 추가하지 않는다. 고정 높이 좌우 이동 + 입력 시
즉시 정지 + 짧은 release + 중력 낙하, 이 네 가지만으로 "잡고 있다가 놓았다"는
인상을 만든다.

---

## 3. 오브젝트 · 이미지 에셋

`assets/01_burger/`의 실제 PNG 10장(2172×724, 알파 채널 포함)을 그대로 사용한다.
CSS/SVG/Canvas 도형으로 새로 그리지 않는다. (v1과 동일, 변경 없음)

- 시작 재료: `bottom_bun` (게임 시작 시 고정 배치, 랜덤 등장 안 함)
- 일반 재료(랜덤, 동일 재료 3연속 금지): `patty` `cheese` `lettuce` `tomato`
  `onion` `egg` `bacon` `middle_bun`
- `top_bun`: 이번 버전에서는 **사용하지 않는다.** 일반 재료로도, 종료 연출로도
  등장하지 않는다(§10). 향후 별도 성공/특수 조건에서 쓸지는 추후 결정.

### 에셋 처리 (v2 갱신)

- 원본 PNG는 알파 bbox로 크롭 + 2배 축소 + base64로 내장한다
  (`tools/build-sprites.js` → `src/game/sprites-data.js`, file://에서도 캔버스
  오염 없이 동작). 파이프라인 자체는 v1과 동일.
- **재료는 항상 소스 이미지 전체(`sprite.bbox` 전체 영역)를 그린다.** 부분
  source crop은 어떤 상황에서도 발생하지 않는다(§8, §15).
- **접촉 기준점(contactTop/contactBottom)** — v1에는 없던 개념. **1차 실측(가로
  전체 폭 기준 row-width 프로파일)은 틀렸다.** 베이컨의 굴곡·양상추 끝단처럼
  좌우로 삐져나온 실루엣 때문에 재료별 top/bottom이 왜곡되어, 오히려 실제보다
  더 벌어져 보이는 결과가 나왔다(2026-09-29 재수정 전 상태).
  **재수정**: alpha 임계값을 24부터 230까지 올려가며 "가로 중앙 55%" 열만
  조사했더니, 모든 재료가 그 중앙 열에서는 bbox 최상단부터 최하단까지 거의
  완전히 불투명했다(투명/반투명 여백이 사실상 없음). 즉 재료별로 다른 trim이
  필요한 게 아니라, **전 재료 공통 `{top:0, bottom:1}`** 이 올바른 값이었다.
  `config.js`의 `BS.CONFIG.INGREDIENT_CONTACT`에 그대로 반영했다.

  쌓을 때는 아래 재료의 `topY + visualHeight*contactTop`("이 재료의 진짜 윗면",
  현재는 top=0이므로 사실상 `topY` 그대로)과 새 재료의
  `visualHeight*contactBottom`을 맞붙이고, 거기서 `CONTACT_OVERLAP_PX`(정한
  값, 8px — 베이컨·양파는 `INGREDIENT_EXTRA_OVERLAP`로 추가 보정)만큼 더
  파고들게 한다. **부호 주의**: overlap은 새 재료를 접촉선보다 "더 아래로"
  밀어야 실제로 겹친다 — 최초 구현은 반대 부호(`-overlap`)로 계산해
  overlap 값을 올릴수록 오히려 간격이 벌어지는 버그가 있었다(2026-09-29
  브라우저 alpha 채널 실측으로 발견·수정, `BS.landingTopY` 참고). 헤드리스로
  캔버스 픽셀을 직접 읽어(`ctx.getImageData`의 **alpha 채널**로 배경 판정 —
  RGB가 흰색인지를 볼 게 아니라, 캔버스의 빈 영역은 원래 완전 투명
  `rgba(0,0,0,0)`이지 흰색이 아니다) bottom_bun+bacon, bacon+onion,
  onion+patty, patty+tomato, tomato+cheese, cheese+lettuce, lettuce+egg,
  egg+middle_bun, middle_bun+patty 9개 조합 전부 실측 gap **0px**를
  확인했다(`tools/measure-contact-gaps.js`, §19).

---

## 4. 플레이 공간 · 시작 위치 · 좌우 이동 범위

모바일 세로 화면 기준, 게임 콘텐츠 최대 폭 약 430px. (v1과 동일)

**재료 폭은 모든 재료·모든 상황에서 고정이다.**

```
W = LOGICAL_WIDTH(375) * INITIAL_STACK_WIDTH_RATIO(0.56) ≈ 210px
```

v1에는 있던 "초기 폭의 65~75% 범위 안에서 튜닝"이라는 표현은 유지하되, 이제는
**게임 시작부터 끝까지 이 폭 그대로**다. overlap 결과에 따라 줄어드는 일은
없다(§7, §15).

### 좌우 이동 범위 (2026-09-29 재수정 — §7의 안정성 판정이 실제로 의미가 있으려면 필수)

처음 폭 비율을 0.70으로 뒀을 때는 재료가 stage 폭의 70%를 차지해 좌우로
움직일 수 있는 여유(travel)가 재료 폭의 30%뿐이었다. 그 결과 **아무리
가장자리로 몰아 쌓아도 supportRatio가 0.69 밑으로 내려가지 않아 물리적으로
COLLAPSE에 도달할 수 없었다** — 게임이 안 무너지던 정확한 원인이다.

```js
GAME_LEFT = 0,  GAME_RIGHT = LOGICAL_WIDTH(375)   // stage 기준, 스택 위치와 무관하게 고정
SPAWN_MIN_X = PLAY_MARGIN(6)
SPAWN_MAX_X = LOGICAL_WIDTH - PLAY_MARGIN - W
travel = SPAWN_MAX_X - SPAWN_MIN_X ≈ 153px       // ≈ W의 73%
```

`MOVE_MIN_X`/`MOVE_MAX_X`는 **stage 좌표계에 고정**하고, 현재 스택의 위치나
폭으로 좁히지 않는다(§4 요청 그대로 — 스택이 어디에 있든 반대쪽/바깥쪽에
놓을 수 있어야 한다). 이 travel/W 비율(0.56 + margin 6)로:

- 이미 한쪽으로 치우친 스택 기준 반대 극단으로 놓으면 supportRatio가 약
  0.27까지 내려가 `COLLAPSE_SUPPORT_RATIO`(0.42)를 실제로 넘는다.
- 정중앙 스택 기준 첫 이동만으로는 약 0.64로 여전히 안전권이다(의도적 —
  첫수부터 바로 위험해지진 않는다).

---

## 5. 조작

### 입력 — PC(Space) 추가 (v2)

```
모바일: pointerdown(터치) 1회 → drop
PC    : 마우스 클릭 1회 → drop
PC    : Space bar 1회 → drop   ← v2 신설
```

셋 다 **같은 함수 하나**(`BS.play.drop()`)를 호출한다. 입력 종류별로 게임
로직을 따로 만들지 않는다.

```js
pointerdown → BS.play.drop()
Space keydown → BS.play.drop()
```

### Space 처리 조건 (v2)

- `PLAYING` 상태에서만 실질적으로 동작(그 외 상태에서는 `drop()` 내부 가드가
  무시한다 — 입력 레이어에서 상태를 이중으로 검사하지 않는다).
- `event.repeat === true`(키를 계속 누르고 있는 자동 반복)는 무시.
- `code === 'Space'`만 반응.
- `preventDefault()`로 페이지 스크롤 방지.
- `document.activeElement`가 INPUT/TEXTAREA/BUTTON/SELECT면 무시(이 페이지엔
  텍스트 입력이 없지만 안전장치로 유지).

### 모바일 — 변경 없음

`touch-action: none`은 게임 캔버스에만 적용. 더블탭 확대 등 브라우저 기본
동작이 게임을 방해하지 않게 한다.

---

## 6. 모델 · 상태값 · 스폰 라인 · 스택 스크롤

### Stack layer (v2 — width는 항상 고정값 W, source crop 필드 없음)

```js
{
  ingredient,
  x, topY,              // 월드 좌표
  width,                 // 항상 W(고정), 착지 결과로 변하지 않는다
  visualHeight,           // 재료별 고정(아래 식)
  tier,                   // 'safe' | 'unstable' | 'collapse' | null(바닥)
  perfect,
  // 붕괴 애니메이션 전용(평소에는 0/false, §9)
  collX, collY, collAngle, collVX, collVY, collAngVel,
  collActive, collDetached, collDetachAt, collHeightFactor
}
```

`sourceLeft`/`sourceWidth`(v1의 클리핑 크롭 필드)는 완전히 삭제했다(§15).

### visualHeight

```js
visualHeight(id) = W / (sprite.bbox.w / sprite.bbox.h)
```

재료별로 다르며(치즈·베이컨·미들번이 얇고, 패티·번 종류가 두꺼움), **착지
결과와 무관하게 항상 이 값 그대로**다. width가 줄지 않으므로 세로로
찌그러뜨릴 필요도 없다(v1 §16, §7 "재료별 시각 높이" 원칙 유지).

### 접촉 기반 착지 위치 (v2 핵심 — §3의 접촉 기준점 사용)

```js
contactLineWorldY = 아래재료.topY + 아래재료.visualHeight * 아래재료.contactTop  // 현재 contactTop=0
새재료.topY = contactLineWorldY - 새재료.visualHeight * 새재료.contactBottom - CONTACT_OVERLAP_PX  // contactBottom=1
```

맨 아래 `bottom_bun`만 예외로, 월드 바닥선(`y = 0`)에 밑면이 닿도록
`topY = -visualHeight`로 둔다(그 아래는 "재료"가 아니라 바닥이므로 접촉 보정을
적용하지 않는다).

### 스폰 라인 고정 + 스택(월드) 스크롤 (v2 신설)

v1에는 "카메라가 스택 top을 따라간다"는 개념이 있었지만, 실제로는 현재
재료의 화면 위치도 함께 흔들려 보이는 문제가 있었다. v2는 이를 완전히
분리한다.

```
현재 움직이는 재료 화면 y = PLAY_TOP_PADDING + HUD_HEIGHT + HUD_TO_GAME_GAP
                          (HUD 바로 아래, 층수와 무관하게 항상 고정)

스택(월드) = 최상단 레이어가 "스폰 라인 + 최소 낙하거리"보다 위로 올라오면
             월드 전체를 아래로 부드럽게(easing) 스크롤한다.
```

- `PLAYING`/`RELEASE` 상태의 현재 재료는 **화면 좌표(screen space)** 로 직접
  움직인다(카메라와 무관, 절대 흔들리지 않음).
- `drop()`이 호출되는 순간 그 화면 좌표를 월드 좌표로 환산해 "놓는다"
  (`worldY = screenY + cameraY`). 이후 `FALL`/`LAND IMPACT`/착지 후에는
  월드 좌표로 존재하며 카메라 변환을 거쳐 그려진다.
- 새 재료는 스폰 시점에 **이미 스폰 라인 위**에 나타난다. 화면 밖에서
  내려오는 추가 낙하 연출은 넣지 않는다(§9 "스폰 애니메이션 없음").

### 바닥 기준선 동적 재계산 — 뷰포트 리사이즈/줌 대응 (2026-10-01 신설)

**이전 버그**: `updateStageSize(w, h)`가 `stageW`/`stageH`만 갱신하고
`cameraY`를 다시 계산하지 않았다. `reset()` 시점에 한 번 계산된 카메라
값이 그대로 고정돼, 이후 창 높이를 줄이거나 브라우저 줌을 바꿔 뷰포트가
변해도 바닥 기준선은 "그때 그 자리"에 머물렀다 — 그 결과 `bottom_bun`이
실제 화면 하단과 분리되어 허공에 뜬 것처럼 보였다.

**수정**: 카메라 목표치를 매번 같은 함수로 계산해 재사용한다.

```js
function computeCameraTarget() {
  var floorAnchor = C.PLAY_FLOOR_PADDING - stageH; // "지금 이 순간의" stageH 기준
  var top = topLayer();
  if (!top) return floorAnchor;
  var neededMin = BS.spawnScreenY() + C.MIN_DROP_DISTANCE;
  var corridorAnchor = top.topY - neededMin;
  return Math.min(floorAnchor, corridorAnchor); // 더 제약이 센(더 아래로 미는) 쪽
}
```

- `floorAnchor`는 고정 px 값이 아니라 **매 호출 시점의 `stageH`로 다시
  계산**된다 — 이것이 "고정 floorY 금지" 요구사항의 구현이다.
- `updateStageSize(w, h)`는 리사이즈 즉시 `cameraY = cameraTargetY =
  computeCameraTarget()`로 **스냅**한다(천천히 따라가면 그 사이 "떠 보이는"
  구간이 생기므로 easing 없이 즉시 반영).
- `update()`의 매 프레임 로직도 기존의 `Math.min(cameraTargetY, candidate)`
  래칫(단조 감소 강제)을 제거하고 `cameraTargetY = computeCameraTarget()`를
  그대로 쓴다 — 창이 다시 커져 바닥 기준선이 덜 제약적으로 바뀌는 경우에도
  카메라가 그쪽으로 되돌아올 수 있어야 하기 때문이다(스택 자체가 줄어드는
  일은 없으므로 일반 플레이 중 단조성은 자연히 유지된다).
- `window.resize` / `window.orientationchange` / `window.visualViewport`의
  `resize` 이벤트를 모두 동일한 `handleResize()`로 연결해 모바일 주소창
  변화·화면 회전·브라우저 줌까지 같은 경로로 처리한다(`src/main.js`).
- 리사이즈는 **스택 전체를 가리키는 `cameraY` 하나만** 재계산한다 — 레이어
  개별 `topY`/간격(overlap)은 전혀 건드리지 않으므로 스택 모양은 리사이즈
  전후로 완전히 동일하다.
- `.app { height: 100dvh (100vh 폴백); overflow: hidden }`이 이미 적용돼
  있어 PLAY 화면이 스크롤 가능한 페이지로 바뀌지 않는다(`src/styles/main.css`).
- 검증: `tools/qa-floor-resize.js` — 390×844/650/568, PC 창 높이
  900→700→550, 줌 100/125/150% 상당 뷰포트 축소, 플레이 도중 리사이즈
  전부에서 바닥과 화면 하단 사이 거리가 논리 px 기준 정확히
  `PLAY_FLOOR_PADDING`(16px)으로 유지됨을 확인(2026-10-01, 전체 통과).
  CSS px로 보면 뷰포트 폭에 비례해 거리가 커지는데(예: 폭 430에서는
  18.35px), 이는 `scale = cssW/LOGICAL_WIDTH`로 다른 모든 요소(여백,
  재료 폭 등)와 동일하게 비례 스케일되기 때문이며 버그가 아니다.

---

## 7. 안정성 판정 v3 (정본 — "바로 아래 재료와 겹치면 성공"이 아니다)

### v3 개정 배경

v2(2026-09-29 오전)는 "새 재료 대비 로컬 오프셋" + "스택 전체 평균 중심 대비
바닥 오프셋" 두 값만 봤다. 실측 결과 이 방식은 **재료끼리 서로 60~70%씩
겹쳐 있어도 상단 전체 무게가 한쪽으로 크게 쏠린 경우를 못 잡았다** — 각
인접 쌍은 "적당히 겹쳐 보이지만" 그 위에 층층이 올라간 재료들의 무게중심이
결국 지지 범위를 벗어나는 상황을 로컬/전역 평균 하나로는 구분할 수 없었기
때문이다. v3는 **스택의 모든 접점(interface)마다 개별 검사**한다.

### 접점(interface)별 판정

레이어가 `N`개면 접점은 `N-1`개(`layer[i]`와 `layer[i+1]` 사이, `i=0..N-2`).
각 접점마다:

```js
supportLeft   = max(layer[i].left, layer[i+1].left)
supportRight  = min(layer[i].right, layer[i+1].right)
supportWidth  = supportRight - supportLeft
supportRatio  = max(0, supportWidth) / layer[i+1].width

upperCOM = average(centerX of layer[i+1 .. top])   // 동일 가중치(모든 재료 weight=1)
supportCenter    = (supportLeft + supportRight) / 2
normalizedMargin = min(upperCOM-supportLeft, supportRight-upperCOM) / supportWidth
                   // 0.5=완전 중앙, 0=가장자리, 음수=지지 구간 밖(공중에 떠 있음)
```

`upperCOM`은 "이 접점 위에 올라간 모든 재료"의 평균이므로, 층이 늘어날수록
그 위에 새로 쌓이는 재료가 이 평균을 계속 갱신한다 — 한 층씩은 겹침이
충분해도(supportRatio 자체는 높아도), 위에 쌓인 덩어리 전체의 무게중심이
서서히 한쪽으로 밀리면 `normalizedMargin`이 줄어들며 위험 신호를 준다.

```js
supportRatio < COLLAPSE_SUPPORT_RATIO(0.42)   또는
normalizedMargin < COLLAPSE_COM_MARGIN(0.10)  → 그 접점은 COLLAPSE

supportRatio >= SAFE_SUPPORT_RATIO(0.60)  그리고
normalizedMargin >= SAFE_COM_MARGIN(0.22) → 그 접점은 SAFE

그 사이                                    → UNSTABLE
```

### 전체 판정 = 가장 먼저(가장 아래에서) 발견되는 COLLAPSE 접점

접점을 `i=0`(바닥에 가장 가까움)부터 위로 스캔한다. **COLLAPSE인 접점을
처음 만나는 순간 그 접점이 실제 붕괴 지점(`collapsePivotIndex`)이다** —
그보다 위의 접점 상태는 더 볼 필요가 없다(그 위는 전부 함께 넘어가므로).
COLLAPSE가 하나도 없으면, UNSTABLE 중 severity(위험도)가 가장 큰 접점을
대표로 삼는다(흔들림 연출·방향 결정용). 전부 SAFE면 SAFE.

`direction`(무너지는/기울어지는 방향)은 그 접점의
`sign(upperCOM - supportCenter)`로 정한다 — 무게중심이 오른쪽으로 밀렸으면
오른쪽, 왼쪽이면 왼쪽(무작위 아님, §14 요청 그대로).

### 연속 UNSTABLE 누적(버티다 지쳐 무너짐)

"같은 절대 위치(가장자리)를 정확히 계속 노리는" 플레이는 재료끼리 서로는
완벽히 정렬되어(자기들끼리 겹침 100%) 각 접점의 `upperCOM`이 더 이상
악화되지 않는 경우가 있다 — 이 경우 이론적으로는 특정 접점 하나가 영원히
UNSTABLE에 머무를 뿐 COLLAPSE로 악화되지 않는다(헤드리스 실측으로 확인).
실제 물체라면 오래 불안정한 채로 버티는 것 자체가 무너지는 원인이 되므로,
**연속으로 UNSTABLE이 `UNSTABLE_STREAK_COLLAPSE`(5)번 쌓이면** "버티다
지쳐 무너지는" 것으로 처리해 그 접점을 강제로 COLLAPSE시킨다. SAFE가
나오면 스트릭을 1만 회복시킨다(완전히 0으로 리셋하지 않음 — 가끔 살짝
안전권에 들어와도 그동안 쌓인 위험이 한 번에 사라지지 않게).

### 세 단계의 결과

| 단계 | 폭 변화 | 스택 반응 | 게임 진행 |
|---|---|---|---|
| SAFE | 없음 | 없음(정상 착지) | 계속 |
| UNSTABLE | 없음 | 스택 전체가 약하게 기울었다 버팀(§8 흔들림) | 계속 |
| COLLAPSE | 없음 | §9의 붕괴 연출(약 1.5초) 후 게임 오버 | 종료 |

COLLAPSE로 떨어진 재료도 **일단 착지는 한다**(스택에 추가되고 층수·점수에
반영된 뒤, 붕괴 연출로 넘어간다). "충돌 시 튕겨나가 사라짐" 같은 처리는
하지 않는다.

---

## 8. 착지 임팩트 · 흔들림(UNSTABLE)

### 착지 임팩트 — 모든 정상 착지 공통(§2의 LAND IMPACT)

- Y축 2~4px 압축 → 0.10~0.16초 안에 복귀. 오버슈트(더 튀어오름) 없음.
- 정상 착지에서는 회전을 거의 주지 않는다.
- **PERFECT**(중심 오차가 층수별 임계값 이하 — §11)일수록 더 단단하고 안정적으로
  착지하는 인상을 준다(효과는 §11에서 재정의).

### UNSTABLE 흔들림 (v2 신설)

착지 직후 스택 전체(바닥 `bottom_bun` 중심을 피벗으로)에 짧은 감쇠 흔들림을
준다.

```js
angle(t) = amplitude * (1 - t) * sin(t * PI) * direction   // t = 경과/WOBBLE_DECAY_MS, 0..1
amplitude = WOBBLE_MAX_ANGLE(약 2.6도) * severity           // severity: 임계값에 얼마나 가까운지(0~1)
```

한 번 기울었다 바로 원위치로 돌아오는 단일 펄스다(왕복 진동 아님). 약
0.55초 후 완전히 사라진다. 이 흔들림이 있는 동안에도 다음 재료 플레이는
바로 이어진다(입력을 막지 않는다).

---

## 9. COLLAPSE — 무너지는 연출 v2 (정본, "폭발하듯 흩어짐" → "버티다 한쪽으로 넘어짐")

즉시 GAME OVER로 넘어가지 않는다. 상태를 별도로 둔다.

```
PLAYING → RELEASE → FALL → SETTLING(착지 임팩트) → COLLAPSING(약 1.5~1.6초) → GAMEOVER
```

### v1 붕괴 방식의 문제(재수정 배경)

최초 구현은 `collapsePivotIndex` 없이 **바닥(`bottom_bun`)을 제외한 모든
레이어**를 동시에 무너뜨리고, 레이어마다 처음부터 **자기 중심**을 기준으로
큰 각속도로 회전시켰다. 그 결과 실제 플레이 영상에서 재료가 거의 세로로
서고(70~90도), 여러 층이 동시에 부채꼴로 펼쳐지는 부자연스러운 모습이
나왔다. v2는 아래 3단계로 재설계했다 — **핵심은 "상단 스택 전체가 먼저
하나의 강체처럼 지지 가장자리를 축으로 기울고, 그 다음에야 위층부터
순차적으로 분리"되는 것이다.**

### 붕괴 지점(`collapsePivotIndex`)과 붕괴 대상

§7에서 찾은 COLLAPSE 접점의 인덱스가 그대로 `collapsePivotIndex`가 된다.
`layer[0..collapsePivotIndex]`는 처음부터 끝까지 **전혀 움직이지 않는다**
(맨 아래 `bottom_bun`뿐 아니라, 그 붕괴 지점까지는 안정적이었던 층 전부가
그 자리에 남는다 — §18 요청 그대로). `layer[collapsePivotIndex+1 .. top]`
만 "상단 스택"으로서 함께 무너진다.

### 피벗(pivot) 좌표

```js
supportLeft/Right = overlap(layer[pivotIndex], layer[pivotIndex+1])  // §7과 동일 계산
pivotX = collapseDirection > 0 ? supportRight : supportLeft   // 무너지는 쪽 지지 가장자리
pivotY = layer[pivotIndex].topY                                // 그 접점의 높이
```

### 3단계 타임라인 (총 `COLLAPSE_DURATION_MS` ≈ 1.55초)

| 구간 | 길이 | 내용 |
|---|---|---|
| 1. BRACE(버팀) | `COLLAPSE_BRACE_MS`(150ms) | 상단 스택 전체가 pivot 축으로 0°→`COLLAPSE_BRACE_ANGLE_DEG`(2°)까지만 살짝 기움. 입력 잠금, 새 재료 생성 금지 |
| 2. TOPPLE(함께 기울기) | `COLLAPSE_TOPPLE_MS`(300ms) | 같은 pivot 축으로 2°→`COLLAPSE_TOPPLE_ANGLE_CAP_DEG`(14°)까지 **상단 스택 전체가 하나의 강체처럼** 계속 회전. 이 구간까지는 레이어가 분리되지 않는다 |
| 3. DETACH+FALL(분리·낙하) | 나머지(약 1.1초) | 위층부터 `COLLAPSE_DETACH_STAGGER_MS`(50ms)씩 시간차를 두고 레이어가 하나씩 분리된다. 분리되는 순간의 pivot 회전각을 그대로 이어받아 독립적인 중력+속도 낙하로 전환 |

### 강체 회전(1·2단계) 수식

아직 분리되지 않은 레이어는 매 프레임 pivot을 기준으로 실시간 회전한다.

```js
angle(t) = (t 구간에 따라 0→2°→14°로 보간) * collapseDirection
layer.center' = rotate(layer.center, pivot, angle(t))   // 중심 이동
layer.collAngle = angle(t)                                // 스프라이트 자체도 같은 각도로 회전
```

14°가 상한이다(12~18도 권장 범위, §14 "세로로 서지 않게"). 렌더러는
캔버스에서 `translate(pivot) → rotate → translate(-pivot)`이 아니라, 매
프레임 새 중심 오프셋(`collX`/`collY`)과 자체 회전(`collAngle`)을 따로
계산해 적용한다(§6 레이어 필드).

### 분리(3단계)

레이어가 자기 차례(`collDetachAt`)가 되면, 그 순간의 강체 회전 결과를
`collX`/`collY`/`collAngle`로 "고정"한 뒤 독립 물리로 전환한다.

```js
vx0 = collapseDirection * COLLAPSE_DETACH_VX_BASE * heightFactor  // 위층일수록 heightFactor↑(0.5~1.0)
vy0 = COLLAPSE_DETACH_VY_BASE * heightFactor                       // 처음엔 작음, 중력으로 증가
angVel = collapseDirection * COLLAPSE_DETACH_ANGVEL * (개체별 랜덤 0.8~1.2배)

매 프레임:
vy += COLLAPSE_GRAVITY * dt
x += vx * dt;  y += vy * dt
angle += angVel * dt, 단 |angle| 상한 = TOPPLE_ANGLE_CAP + COLLAPSE_DETACH_EXTRA_ANGLE_DEG(20°)
```

넘어지던 방향의 수평 속도를 그대로 이어받으므로 "제자리에서 회전하며
수직 추락"하지 않고 "옆으로 넘어지며 떨어진다"(§16, §17 요청 그대로).
회전각은 분리 후에도 최대 약 34°(14°+20°)로 제한되어 재료가 세로로
서는 일이 없다(§14, §28 금지 목록).

화면 밖으로 완전히 사라지지 않도록 바닥(화면 하단 근처)과 좌우 화면
경계 근처에서 속도를 죽이고 멈춘다 — 무너진 최종 모습이 결과 화면의
배경으로 계속 보여야 하기 때문이다(§10).

약 1.5~1.6초(`COLLAPSE_DURATION_MS`) 후 각 레이어의 최종 위치를 그대로
고정하고 `GAMEOVER` 상태로 전환한다. 헤드리스 프레임 캡처(0/150/300/
500/750/1000/1250/1500ms)로 각도가 0°→2°→10°→16~18°(분리 시작, 레이어별
갈라지기 시작)→27~30°→34°(상한 도달 후 고정)로 자연스럽게 증가하는 것을
확인했다(§19).

---

## 10. RESULT / GAME OVER (v2 — "예쁘게 완성된 햄버거로 자동 보정" 금지)

v1 계획에 있던 "실패 후 top_bun을 자동으로 떨어뜨려 완성된 햄버거를 만드는"
연출은 **넣지 않는다.** 실패했으면 무너진 모습 그대로 보여준다.

- `GAMEOVER` 화면은 전체를 흰 배경으로 덮지 않는다. **뷰포트 정중앙(가로+세로,
  `left:50%; top:50%; transform:translate(-50%,-50%)`)** 에 반투명 패널
  (`SCORE`·`PERFECT`·`BEST`·`다시 쌓기` 버튼)을 띄우고, 그 뒤로는 §9에서
  멈춘 붕괴된 스택이 계속 보인다. 하단 고정이 아니다(2026-09-29 재수정 —
  처음엔 화면 하단에 붙여 두었는데, 햄버거 스택 바로 아래처럼 보여 시선이
  분산된다는 피드백으로 정중앙으로 옮겼다). 320×568에서도 잘리지 않도록
  패널에 `max-height`와 `overflow-y:auto`를 둔다.
- `top_bun`은 이번 버전에서 종료 연출에도, 일반 재료로도 쓰지 않는다(§3).
  향후 별도 성공 조건에서 쓸지는 추후 결정.
- 결과 문구: `N층` · `SCORE n` · `PERFECT k` · `BEST b`.

---

## 11. PERFECT (판정 기준은 층수별로 점점 좁아짐, 효과는 유지)

PERFECT 판정: 새 재료 중심과 바로 아래 재료 중심의 차이가 `PERFECT_THRESHOLD_TIERS`
(층수 구간별) 이하면 PERFECT — **난이도 2(2026-09-29 추가)**. 층이 올라갈수록
더 정확히 맞춰야 PERFECT가 나온다. SAFE/UNSTABLE/COLLAPSE 판정(§7)에는
전혀 영향을 주지 않는다 — 그쪽은 층수와 무관하게 항상 같은 기준이다.

```text
1~5층      ±8px
6~10층     ±7px
11~15층    ±6px
16~20층    ±5px
21층 이상  ±4px
```

**v2에서 달라진 것**: 모든 재료가 어차피 원본 폭을 유지하므로, "PERFECT면
폭이 유지된다"는 v1의 효과는 의미가 없어졌다. PERFECT 효과를 아래로
재정의한다.

- 점수 +1 보너스(§12 기본 +1과 합쳐 총 +2)
- `perfectCount` +1
- 반드시 SAFE 등급으로 처리(흔들림 없음, 착지 임팩트가 가장 단단하게)
- 화면에 `PERFECT!` 약 0.6초 노출(과한 particle/glow/confetti 금지, v1과 동일)

---

## 12. 층수 · 점수 · 최고 기록 (거의 유지)

- 일반 재료가 (SAFE든 UNSTABLE든 COLLAPSE든) 일단 착지하면 층수 +1, 점수 +1.
  **COLLAPSE를 유발한 마지막 재료도 착지했으므로 층수·점수에 포함한다**
  (v1처럼 "완전 실패 = 스택에 추가 안 함"이 아니다 — v2는 클리핑처럼 "거부"하는
  개념 자체가 없고, 착지 후 안정성만 다르게 판정한다).
- PERFECT면 추가 +1(§11).
- `bottom_bun`/`top_bun`은 층수·점수에서 제외(v1과 동일, `top_bun`은 이번
  버전에 등장하지 않으므로 사실상 무관).
- 점수 계산에 `Math.random()`을 쓰지 않는다(v1과 동일 원칙 유지, 재료 종류
  뽑기에만 사용).
- 저장: `localStorage`의 `bs_best_score`(v1 계획의 `bestScore`를 그대로
  구현). `bestLayers` 별도 저장은 이번 버전에서 하지 않음(스코프 방어, §22).

---

## 13. 속도 · 카메라 (난이도 1 — 2026-09-29 개정)

층수 구간별 speed multiplier 표(`CONFIG.SPEED_TIERS`). 1.65배가 절대 상한
(`SPEED_MULT_CAP`)이며 그 이상 빨라지지 않는다.

```text
1~5층      speed × 1.00
6~10층     speed × 1.12
11~15층    speed × 1.25
16~20층    speed × 1.40
21~25층    speed × 1.55
26층 이상  speed × 1.65 (상한, 고정)
```

배율은 **재료가 스폰되는 순간에만** 계산해 `current.speed`에 고정한다 —
한 재료가 움직이는 도중에는 절대 바뀌지 않는다(헤드리스로 0.6초간 다중
샘플링해 값이 하나로 고정됨을 확인, §19).

**15층부터**: 재료가 스폰될 때 위 배율에 `SPEED_VARIANCE_MIN~MAX`(0.9~1.1배)
무작위 편차를 한 번 더 곱한다(그 뒤 `SPEED_MULT_CAP`으로 다시 clamp). 이
편차도 스폰 시점에 한 번만 정해지고 그 재료가 떨어질 때까지 고정이다 —
"예측 불가능한 갑작스러운 가속/감속"이 아니라 "이번 재료는 평소보다 살짝
빠르거나 느리다" 정도의 작은 변주다.

"카메라가 현재 재료를 따라간다"는 v1 표현은 삭제한다. v2는 반대로 **현재
재료가 고정**이고 **스택(월드)이 스크롤**된다(§6).

### 난이도 3 — 누적 무게중심이 실제 난이도

층수가 높다는 이유만으로 SAFE/UNSTABLE/COLLAPSE 임계값을 조이지 않는다
(§7 그대로 유지). 대신 §7의 `upperCOM` 계산 자체가 "그 접점 위에 올라간
모든 재료의 평균"이므로, 층이 많아질수록 같은 방향의 작은 편차가 누적되어
자연히 위험해진다 — 이것이 유일한 "층수 때문에 어려워지는" 메커니즘이다.
실측: 같은 방향으로 폭의 18%씩 계속 어긋나게 쌓으면 4층에서 COLLAPSE,
좌우를 번갈아(±15%) 쌓으면 15층까지 버틴다(§19).

---

## 14. 화면 흐름

```
INTRO → PLAYING → (RELEASE → FALL → SETTLING → [COLLAPSING(§9, 3단계)]) → GAMEOVER
```

`TUTORIAL`은 별도 화면으로 두지 않았다(INTRO의 안내 문구 한 줄로 대체,
§9-old 참고). 도전장(`CHALLENGE`/`BATTLE_RESULT`)은 이번 버전에서 구현하지
않는다(§22).

### 안내 문구 (v2)

```
PC     : SPACE 또는 클릭해서 쌓기
모바일 : 화면을 눌러 쌓기  (pointer:coarse 미디어쿼리로 판별)
```

플레이 캔버스 위에 작은 한 줄로만 표시하고, 현재 움직이는 재료와 겹치지
않도록 그 아래에 둔다. 첫 입력 이후에는 완전히 사라지며, 재시작해도 다시
뜨지 않는다(세션당 1회).

---

## 15. 제거된 것 (v1 → v2)

아래는 v2에서 코드·설계 모두에서 제거했다.

- 이미지 clipping / source crop
- `sourceLeft`/`sourceWidth` 기반 레이어 필드
- cut piece(잘린 조각) 생성·낙하·회전 로직
- overlap 결과로 레이어/재료 `width`를 변경하는 모든 코드
- "완전 실패 시 스택에 추가하지 않음" 개념(이제는 착지 자체는 항상 하고,
  안정성만 다르게 판정 — §7, §12)
- 실패 후 `top_bun` 자동 낙하로 "완성된 햄버거"를 만드는 게임오버 연출

안정성 판정에 필요한 `computeOverlap`(겹침 폭 계산)과 `isPerfect`는 계속
재사용한다 — "시각적으로 자르는 기능"만 없앴을 뿐, 겹침 폭 자체는 안정성
계산의 입력값으로 그대로 쓰인다(§7).

---

## 16. UI 디자인 (컴팩트 HUD 반영)

MINIGAME_SYSTEM.md §37을 정본으로 유지하되, PLAY 화면의 HUD는 아래처럼
컴팩트하게 압축한다(INTRO/RESULT는 §37 리듬 그대로 유지, 과도하게 줄이지
않음).

```
PLAY_TOP_PADDING = 14px
HUD_HEIGHT       = 30px    (한 줄: "N층 · SCORE n"  ⟷  "BEST b")
HUD_TO_GAME_GAP  = 10px
```

버튼(INTRO `시작하기`, RESULT `다시 쌓기`) 크기는 MINIGAME_SYSTEM 공통
`--button-height`(48px) 기준을 유지한다 — 줄이는 대상은 여백/패딩이지 터치
영역이 아니다.

---

## 17. 이번 버전에서 하지 않는 것 (v1과 동일하게 유지)

제한시간, 목숨 시스템, 아이템, 폭탄 재료, 콤보 multiplier, 재료 선택,
캐릭터, 상점, 광고, 랭킹 서버, 계정 로그인, 실제 rigid body 물리, 3D 물리,
재료 회전 조작, 도전장(공유 링크로 상대와 겨루기)은 넣지 않는다.

---

## 18. config.js 튜닝 위치

모든 수치는 `src/game/config.js`의 `BS.CONFIG`에 모여 있다. 주요 그룹:

```text
크기/폭       LOGICAL_WIDTH, PLAY_MARGIN(6), INITIAL_STACK_WIDTH_RATIO(0.56)
속도/난이도   BASE_SPEED, SPEED_TIERS, SPEED_MULT_CAP,
              SPEED_VARIANCE_START_LAYER/MIN/MAX, PERFECT_THRESHOLD_TIERS
낙하 3단계    RELEASE_MS, RELEASE_SINK_PX, FALL_MS, LAND_IMPACT_MS, LANDING_SQUASH_PX
접촉 배치     INGREDIENT_CONTACT{top,bottom}, CONTACT_OVERLAP_PX, INGREDIENT_EXTRA_OVERLAP
스폰/스크롤   MIN_DROP_DISTANCE, STACK_SCROLL_EASE, PLAY_FLOOR_PADDING(16)
안정성(v3)    SAFE_SUPPORT_RATIO(0.60), COLLAPSE_SUPPORT_RATIO(0.42),
              SAFE_COM_MARGIN(0.22), COLLAPSE_COM_MARGIN(0.10),
              UNSTABLE_STREAK_COLLAPSE(5)
흔들림        WOBBLE_MAX_ANGLE, WOBBLE_DECAY_MS
붕괴(v2)      COLLAPSE_HOLD_MS, COLLAPSE_BRACE_MS, COLLAPSE_BRACE_ANGLE_DEG,
              COLLAPSE_TOPPLE_MS, COLLAPSE_TOPPLE_ANGLE_CAP_DEG,
              COLLAPSE_DETACH_STAGGER_MS, COLLAPSE_DETACH_EXTRA_ANGLE_DEG,
              COLLAPSE_DETACH_ANGVEL, COLLAPSE_DETACH_VX_BASE,
              COLLAPSE_DETACH_VY_BASE, COLLAPSE_GRAVITY, COLLAPSE_DURATION_MS
기타          RESULT_DELAY_MS, PERFECT_FLASH_MS, MAX_STREAK_SAME
HUD           PLAY_TOP_PADDING, HUD_HEIGHT, HUD_TO_GAME_GAP
```

---

## 19. QA — 반드시 확인할 것 (v3)

### 0. 좌우 이동 범위 실측

`GAME_LEFT/RIGHT`, `SPAWN_MIN/MAX_X`, 재료 폭, travel/W 비율을 로그로
남기고, 정중앙 기준·치우친 기준 각각의 최소 supportRatio를 계산해 실제로
`COLLAPSE_SUPPORT_RATIO`를 넘어설 수 있는지 확인한다(§4).

### A. 정중앙 연속 착지(10회 이상)

- 재료 사이 불필요한 흰 공간 없음 — **캔버스 픽셀을 alpha 채널로 직접
  읽어(`getImageData`) 검증**한다(RGB 흰색이 아니라 투명 여부로 배경 판정).
  bottom_bun+bacon / bacon+onion / onion+patty / patty+tomato /
  tomato+cheese / cheese+lettuce / lettuce+egg / egg+middle_bun /
  middle_bun+patty 9개 조합 모두 실측 **0px**(`tools/measure-contact-gaps.js`).
- `BS.landingTopY` 공식으로 역산한 기대 위치와 실제 배치가 일치
- 폭이 한 번도 줄지 않음, 전부 SAFE

### 고의 실패 테스트 (CASE A~D)

- **CASE A**: supportRatio ≈ 0.20으로 강제 착지 → 즉시 COLLAPSE.
- **CASE B**: 매번 이전 재료보다 폭의 15~20%씩 같은 방향으로 착지(반복) →
  초반 SAFE/UNSTABLE을 거쳐 10회 이내 COLLAPSE(실측: 4층에서 무너짐).
- **CASE C**: 오른쪽/왼쪽을 번갈아(±15%) 착지 → 10층까지 안정적으로 버팀
  (편향 플레이보다 확실히 오래 버텨야 함).
- **CASE D**: 실제 이동 범위의 가장 오른쪽 끝에 반복 착지(영상 재현) →
  §7의 "연속 UNSTABLE 누적" 규칙으로 5층에서 무너짐 확인. 매번 완전히
  동일한 좌표(지터 없음)로 재현해야 결정적으로 검증된다 — 무작위 지터를
  주면 SAFE/UNSTABLE 경계에 걸려 결과가 들쭉날쭉해진다(§7 참고).

### D2. 붕괴 연출

- 폭 축소·clipping 전혀 없음
- 즉시 RESULT로 넘어가지 않음(`collapsing` 상태 확인, 0.3초 시점에도 진행 중)
- 약 1.5초 이상 붕괴 연출 후 게임오버
- **프레임 캡처(0/150/300/500/750/1000/1250/1500ms)**: 각도가 0°→2°→10°
  →16~18°(분리 시작)→27~30°→34°(상한)로 자연스럽게 증가, 90도로 서는
  프레임 없음, 레이어마다 분리 시점 이후 각도가 서로 달라짐(동일 각도로
  뭉쳐 움직이지 않음)을 확인.

### E. PC Space

- 한 키 입력당 하나만 drop
- `repeat:true`(길게 누름)는 무시
- 연타해도 1개만 drop

### F. 모바일 터치

- 한 번 터치 = 한 번 drop, 연타해도 1개만 drop

### 스폰 라인

- 층수가 늘어도(0층, 10층 등) 현재 재료의 화면 y가 항상 동일(오차 1px 이내)
- 스택이 일정 높이 이상이면 카메라(월드 스크롤)가 실제로 움직임

### 레이아웃

- 320×568 등 모바일 폭에서 가로 스크롤 없음
- RESULT 팝업이 뷰포트 정중앙에 뜨고 320×568에서도 잘리지 않음

### 바닥 기준선 리사이즈/줌 대응 (2026-10-01)

- 390×844 / 390×650 / 390×568, PC 창 높이 900→700→550, 줌 100/125/150%
  상당 뷰포트 축소, 플레이 도중 리사이즈 — 전부 바닥-화면하단 거리가
  논리 px 기준 `PLAY_FLOOR_PADDING`과 일치
- 리사이즈 전후 레이어 간 상대 간격(스택 모양) 완전히 동일 — `cameraY`만
  재계산되고 개별 레이어 좌표는 불변
- 리사이즈 후에도 스폰 라인은 그대로 상단 고정
- 가로/세로 오버플로 없음(스크롤 페이지로 바뀌지 않음)

**실행 방법**: `node tools/qa.js`(안정성·입력·회귀), `node
tools/measure-contact-gaps.js`(접촉 gap 실측), `node
tools/qa-floor-resize.js`(바닥 기준선 리사이즈/줌 대응, 2026-10-01 신설)
— 모두 playwright-core + 로컬 Chrome 헤드리스. 2026-10-01 기준 위 항목
전부 통과 확인(§6 "바닥 기준선 동적 재계산" 참고).

---

## 20. 완료 기준 (v2)

- [x] 사용자 PNG 10종 실제 연결(9종 사용, `top_bun` 보류)
- [x] `bottom_bun` 시작 배치
- [x] 일반 재료 랜덤 등장(3연속 금지)
- [x] 좌우 왕복
- [x] 터치/클릭/Space drop
- [x] 안정성 v3 판정(접점별 supportRatio + upperCOM 여유 + 연속 UNSTABLE 누적)
- [x] 좌우 이동 범위가 실제로 COLLAPSE에 도달 가능(§4)
- [x] 재료 크기 항상 유지(클리핑 완전 제거)
- [x] 접촉 기반 배치(간격 없음, alpha 채널 실측으로 0px 확인)
- [x] RELEASE → FALL → LAND IMPACT 낙하 모션
- [x] 착지 사운드(Web Audio 합성 thump)
- [x] UNSTABLE 흔들림
- [x] COLLAPSE 붕괴 연출 v2(pivot 강체 회전 → 순차 분리 → 개별 낙하, 약 1.5초,
      최대 회전각 34도로 제한, 세로로 서는 프레임 없음)
- [x] PERFECT(보너스 점수 + 단단한 착지)
- [x] 층수 · 점수 · BEST(localStorage)
- [x] speed 상승
- [x] 스폰 라인 고정 + 스택 스크롤
- [x] INTRO(실제 에셋 프리뷰) / RESULT(뷰포트 정중앙, 붕괴 배경 유지) UI
- [x] 컴팩트 HUD
- [x] 320×568 포함 모바일 QA
- [x] 기존 다른 프로젝트 변경 없음
