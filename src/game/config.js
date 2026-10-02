/* Burger Stack — 튜닝값 모음. 명세에 없는 수치는 여기 모아두고 완료 보고에서 "정한 값"으로 별도 보고한다.
 * v2: clipping/width 축소 폐기 → 재료 원본 크기 유지 + 중심/지지 안정성 기반 SAFE/UNSTABLE/COLLAPSE. */
'use strict';
window.BS = window.BS || {};

BS.CONFIG = {
  // "엄청 쉬운 베타" 모드(2026-10-02, beta-easy 브랜치 전용). true면 쌓인 햄버거의 동적 균형/
  // 흔들림(stack sway)을 전부 끄고 COLLAPSE 임계값도 관대하게 완화한다. V1 정식 버전으로
  // 되돌릴 때는 이 값 하나만 false로 바꾸면 된다(아래 모든 V1 원래 수치는 그대로 보존돼
  // 있고, 덮어쓰지 않았다 — 파일 맨 끝의 EASY_BETA_MODE 분기 참고).
  EASY_BETA_MODE: true,
  LOGICAL_WIDTH: 375,               // 기준 디자인 폭(logical px). 실제 화면 폭은 CSS에서 이 값으로 스케일링.
  PLAY_MARGIN: 4,                   // 재료가 왕복하는 좌우 경계 여백(게임 stage 기준 고정 — 스택 위치와 무관, §"이동 범위 실측" 참고)
  INITIAL_STACK_WIDTH_RATIO: 0.36,  // 모든 재료가 공유하는 고정 폭 = LOGICAL_WIDTH * 이 값. 이 폭은 게임 내내 변하지 않는다.
  // 0.70 → 0.56 → 0.50 → 0.42로 줄여왔는데 "좌우로 움직이는 폭이 더 넓었으면" 피드백이
  // 또 있어 0.36까지 더 줄였다(2026-10-01). margin 4 기준 travel/W ≈ 1.72로 더 늘어난다
  // (기존 1.33 대비). 정중앙 스택 기준 첫수를 극단으로 몰면 supportRatio가 더 쉽게
  // COLLAPSE_SUPPORT_RATIO 밑으로 내려가므로, 좌우 폭이 넓어진 만큼 손 떨림 하나의
  // 리스크도 함께 커진다(의도된 트레이드오프).

  BASE_SPEED: 110,                  // 1~5층 재료 이동 속도 기준값 (logical px/s)

  // 난이도 1: 층수가 오를수록 전체적으로 "훨씬" 빨라지는 상승 기준선(baseline) 위에,
  // 몇 층 단위로 빨라졌다 느려졌다를 반복하는 파동(wave)을 곱한다(2026-10-01 개정 —
  // "많이 빨라져야 한다" + "빨라졌다 느려졌다 반복" 피드백 반영). 재료가 "스폰되는
  // 순간"에만 적용되고, 그 재료가 움직이는 동안에는(낙하 전까지) 절대 바뀌지 않는다
  // (spawnNext()에서 한 번만 계산해 current.speed에 고정). SPEED_MULT_CAP이 절대 상한.
  // "맨 첫 1~3층은 정상 속도로 유지해달라"는 피드백으로(2026-10-01) 1~3층은 아래
  // 파동 계산을 아예 적용하지 않고 BASE_SPEED 그대로 둔다. 4층부터 파동이 시작된다.
  SPEED_NORMAL_LAYERS: 3,             // 이 층수까지는 무조건 SPEED_BASE_MULT(정상 속도) 고정
  SPEED_BASE_MULT: 1.00,              // 기준선 시작 배율(1~3층 고정 속도이기도 함)
  SPEED_STEP_PER_LAYER: 0.05,         // 파동 활성화 후 층마다 기준선이 이만큼씩 증가(0.026 → 0.05로 상승폭 약 2배)
  SPEED_MULT_CAP: 3.20,               // 절대 상한(1.65 → 2.40 → 2.80 → 3.20, 피크 진폭을 키운 만큼 더 일찍 안 잘리게 함께 올림)
  // 파동을 "오르막 1/4주기 → 정점 유지(HOLD) → 내리막 1/4주기 → 저점 통과 1/4주기 →
  // 복귀 1/4주기"의 5구간으로 쪼갰다(2026-10-01, 순수 사인파 폐기). "느린 건 지금
  // 단계가 좋은데 빠른 건 좀 더 오래 유지됐으면"이라는 피드백 반영 — 내리막/저점/복귀
  // 3구간(사용자가 "좋다"고 한 부분)은 기존 사인 모양 그대로 두고, 오르막 직후에만
  // HOLD 구간을 끼워 넣어 "빠른 상태"가 더 오래 지속되게 했다.
  SPEED_WAVE_QUARTER_LAYERS: 4,       // 오르막/내리막/저점통과/복귀 각 구간의 길이(층수) — 기존 반주기 8층(=4+4)과 동일 촘촘함 유지
  SPEED_WAVE_HOLD_LAYERS: 6,          // 정점 도달 직후 이만큼 더 "빠른 상태"를 유지(신설)
  // 한 사이클 총 길이 = QUARTER*4 + HOLD = 4*4+6 = 22층.
  // "느린 건 지금 속도가 좋은데 빠른 건 더 빨라도 될 것 같다"는 피드백으로 진폭을
  // 비대칭으로 바꿨다(2026-10-01) — 저점 쪽은 기존 0.50 그대로 유지(느린 느낌 보존),
  // 오르막·HOLD·내리막 전반부(정점 쪽)는 1.00으로 키웠다(baseline의 최대 2배까지).
  SPEED_WAVE_AMPLITUDE_DOWN: 0.50,   // 저점 쪽 진폭(기준선 대비, 저점=baseline×(1-0.50)=baseline×0.5) — 변경 없음
  SPEED_WAVE_AMPLITUDE_UP: 1.00,     // 정점 쪽 진폭(기준선 대비, 정점=baseline×(1+1.00)=baseline×2.0) — 0.50→1.00 확대

  // 15층부터는 재료가 스폰될 때(그 재료가 움직이기 시작하기 전에 딱 한 번) 현재 단계
  // 배율에 무작위 편차(0.9~1.1배)를 살짝 곱한다. 스폰 이후 그 재료가 다 떨어질 때까지는
  // 이 값 그대로 고정 — 움직이는 도중 가속/감속하지 않는다.
  SPEED_VARIANCE_START_LAYER: 15,
  SPEED_VARIANCE_MIN: 0.9,
  SPEED_VARIANCE_MAX: 1.1,

  // 난이도 2: 층수 구간별 PERFECT 판정 범위(logical px, 중심 x 오차). 좁아질수록 PERFECT를
  // 맞추기 어려워진다. SAFE/UNSTABLE/COLLAPSE 판정(§7 안정성 모델)에는 영향 없음 —
  // 그쪽은 층수와 무관하게 항상 동일한 기준을 쓴다(난이도 3, 누적 무게중심만으로 충분).
  PERFECT_THRESHOLD_TIERS: [
    { maxLayer: 5, threshold: 8 },
    { maxLayer: 10, threshold: 7 },
    { maxLayer: 15, threshold: 6 },
    { maxLayer: 20, threshold: 5 },
    { maxLayer: Infinity, threshold: 4 },
  ],

  // DROP 입력 → RELEASE(정지+미세 처짐) → FALL(ease-in 가속 낙하) → LAND IMPACT(압축+복귀) 3단계
  RELEASE_MS: 80,                   // 입력 즉시 좌우 이동 정지 + 아주 짧게 무게가 걸리는 구간
  RELEASE_SINK_PX: 3,               // RELEASE 동안 아래로 미세하게 처지는 양(logical px, 2~4px)
  FALL_MS: 450,                     // RELEASE 종료 후 착지 지점까지 고정 시간 낙하(거리와 무관, ease-in)
  LAND_IMPACT_MS: 130,              // 착지 순간 압축 → 복귀까지 걸리는 시간("두꺼운 책이 탁 덮이는" 임팩트)
  LANDING_SQUASH_PX: 3,             // 착지 순간 Y 압축량(logical px, "묵직한 착지" — 2~4px 권장값 채택)

  // 재료별 "눈에 보이는 접촉선". "가운데 50% 밴드"(0.25~0.75)만 스캔했을 때는 정중앙
  // 착지 기준으로는 gap이 0px였지만, 실제 플레이는 SAFE 판정 범위 안에서도 재료가 꽤
  // 옆으로 치우쳐 착지할 수 있고(§4 이동 범위), 그러면 겹치는 영역 자체가 재료 폭의
  // 가장자리 쪽으로 밀린다 — 베이컨은 그 경우 최대 21px까지 gap이 남는 것을 실측으로
  // 확인했다. 그래서 이번에는 "0.10~0.90 밴드"(17개 지점)로 넓혀 재측정했다: 실제
  // SAFE 판정으로 착지 가능한 가장 치우친 경우까지 커버하기 위함이다.
  INGREDIENT_CONTACT: {
    bottom_bun: { top: 0.114, bottom: 0.872 },
    patty:      { top: 0.164, bottom: 0.902 },
    cheese:     { top: 0.161, bottom: 0.969 },  // 2026-09-30 치즈 PNG 교체 후 재실측
    lettuce:    { top: 0.248, bottom: 0.768 },
    tomato:     { top: 0.202, bottom: 0.839 },
    onion:      { top: 0.304, bottom: 0.795 },
    egg:        { top: 0.270, bottom: 0.783 },
    bacon:      { top: 0.239, bottom: 0.751 },
    middle_bun: { top: 0.136, bottom: 0.866 },
    top_bun:    { top: 0.304, bottom: 0.983 },
  },
  CONTACT_OVERLAP_PX: 8,             // 접촉선 계산 후 추가로 파고드는 고정값(정한 값). 0px 접촉이 아니라
                                     // 실제 음식처럼 5~8px 포개져 보이는 것이 목표.

  // 스폰 라인 고정(상단) + 바닥 기준선(하단) + 스택(월드) 스크롤.
  // 스폰 라인 화면 y = PLAY_TOP_PADDING + HUD_HEIGHT + HUD_TO_GAME_GAP (HUD 바로 아래, 층수와 무관하게 고정)
  // 바닥 기준선 화면 y = 현재 viewport 높이(stageH) - PLAY_FLOOR_PADDING — "고정 px"가 아니라
  // 매 프레임 현재 stageH로 다시 계산한다. 그래야 창 크기/줌/모바일 viewport가 바뀌어도
  // bottom_bun 바닥이 항상 "지금 보이는 화면"의 하단에 붙어 있다(2026-10-01 수정 — 이전에는
  // reset() 시점의 stageH로 카메라를 한 번만 계산하고 resize 때 다시 계산하지 않아서,
  // 창 크기가 바뀌면 바닥이 화면 하단과 어긋나 공중에 뜬 것처럼 보였다).
  MIN_DROP_DISTANCE: 140,           // 스폰 라인과 스택 최상단 화면 y 사이 최소 낙하 거리. 이보다 가까워지면 스크롤.
  STACK_SCROLL_EASE: 0.12,          // 스택(월드) 이동 easing 계수(프레임당 보간 비율, 일반 성장 시)
  PLAY_FLOOR_PADDING: 16,           // 바닥 기준선과 현재 화면 하단 사이 여백(정한 값, 12~20px 권장 범위)

  // 안정성 판정 v3 — 접점 하나(바로 아래 재료)만 보지 않는다. 스택의 모든 접점(interface)마다
  // "그 위에 올라간 전체 upper stack의 무게중심(COM)"이 그 접점의 실제 지지 구간(support
  // interval) 안 어디에 있는지, 가장자리까지 남은 여유(normalizedMargin)로 판정한다.
  // 접점이 하나라도 COLLAPSE면 그 접점(가장 아래에서 처음 발견되는 곳)이 무너지는 지점이 된다.
  SAFE_SUPPORT_RATIO: 0.60,         // 접점의 supportWidth/재료폭. 이 이상이고 margin도 충분해야 SAFE
  COLLAPSE_SUPPORT_RATIO: 0.42,     // 이 미만이면 그 자체로 COLLAPSE (V1 정식값 — EASY_BETA_MODE일 땐 파일 끝의 분기에서 0.32로 덮어씀)
  SAFE_COM_MARGIN: 0.22,            // normalizedMargin(0.5=완전 중앙, 0=가장자리, 음수=지지 밖) 이 이상이면 안전
  COLLAPSE_COM_MARGIN: 0.10,        // 이 미만이면(또는 음수, 즉 지지 밖) COLLAPSE (V1 정식값 — EASY_BETA_MODE일 땐 0.08로 덮어씀)
  // 그 사이는 UNSTABLE.

  // "같은 절대 위치(가장자리)를 계속 정확히 노리는" 플레이는 매번 자기들끼리는 완벽히 정렬돼
  // interface COM 계산만으로는 위험도가 더 커지지 않고 영원히 UNSTABLE에 머무를 수 있다(실측 확인).
  // 실제 물체라면 오래 불안정한 상태로 버티는 것 자체가 결국 무너지는 원인이 되므로, 연속으로
  // UNSTABLE이 이만큼 쌓이면 "버티다 지쳐 무너지는" 것으로 처리해 강제로 COLLAPSE시킨다.
  UNSTABLE_STREAK_COLLAPSE: 5,

  // 동적 균형/흔들림(2026-10-02 신설) — "착지 후 완전 정지"를 "중심을 잡으며 서 있는 탑"으로
  // 바꾼다. 매 프레임 현재 무게중심(COM)으로부터 목표 기울기(stackTargetTilt)를 계산하고,
  // 스프링-댐퍼로 실제 기울기(stackTilt)가 그 목표를 향해 관성 있게 움직인다. 단순 랜덤 흔들림이
  // 아니라 실제 COM·지지 구간 판정에도 반영된다(play.js의 shearedStackSnapshot 참고). 이전의
  // WOBBLE_MAX_ANGLE/WOBBLE_DECAY_MS(착지 직후 짧게만 흔들리는 단순 연출)는 이 시스템으로
  // 완전히 대체해 제거했다.
  BALANCE_SENSITIVITY_BY_LAYER: [
    { maxLayer: 3, value: 0.45 },
    { maxLayer: 6, value: 0.70 },
    { maxLayer: 9, value: 1.05 },
    { maxLayer: 12, value: 1.45 },
    { maxLayer: 15, value: 1.80 },
    { maxLayer: Infinity, value: 2.10 },
  ],
  // normalizedOffset(COM이 바닥 중심에서 벗어난 비율, -1~1)이 같아도 층수가 높을수록 훨씬
  // 민감하게 기운다 — "초반엔 거의 안정, 10층부터 확실히 빡빡해짐"의 핵심 수치.
  // 2.3 → 8.0(§19 실측 후 1차 보정) → 11.0(2026-10-02, "탑이 무너지듯 옆으로 넘어가는" 느낌을
  // 더 달라는 피드백으로 2차 보정) — 평소 흔들림 자체가 "이러다 진짜 넘어가겠다" 싶을 만큼
  // 눈에 띄게 기울도록 더 키웠다.
  BALANCE_TILT_BASE_DEG: 11.0,       // normalizedOffset=1·sensitivity=1일 때의 기준 각도(목표
                                     // 기울기 공식의 단위 스케일 — §5 sensitivity 표를 §6의
                                     // 층수별 목표 tilt 범위에 맞게 변환하는 보정 상수)
  // 2026-10-02: "탑이 무너지듯이" 피드백으로 층수별 상한도 전반적으로 올렸다(기존 0.5/1.2/2.0/
  // 3.5/4.75/5.5 → 아래). 저층은 여전히 거의 안 보일 만큼 작게 유지하고, 고층일수록 "거의
  // 넘어갈 듯한" 각도까지 허용한다.
  BALANCE_MAX_TILT_BY_LAYER: [       // stackTargetTilt의 층수별 상한(도).
    { maxLayer: 3, value: 0.8 },
    { maxLayer: 6, value: 1.8 },
    { maxLayer: 9, value: 3.0 },
    { maxLayer: 12, value: 5.0 },
    { maxLayer: 15, value: 6.5 },
    { maxLayer: Infinity, value: 8.0 },
  ],
  MAX_NORMAL_TILT: 9.0,              // 모든 층수 공통 절대 상한(도) — 위 표와 별개의 최종 안전망.
                                     // COLLAPSE 연출(아래, 최대 50도급 회전)과는 전혀 다른 스케일.
  BALANCE_SPRING: 220,               // 스프링 강성(rad/s² per rad 오차) — 클수록 목표를 빠르게 쫓음
  BALANCE_DAMPING: 0.15,             // 초당 각속도 유지 비율(0~1). 매 프레임 Math.pow(DAMPING, dt)로
                                     // 적용해 프레임레이트와 무관하게 감쇠하되, 다 멈추기 전에
                                     // 다음 재료를 받는 경우가 흔하도록(§8) 너무 세게 걸지 않는다.
  LANDING_BALANCE_IMPULSE: 1.6,      // 착지 순간 normalizedLandingOffset·sensitivity에 곱해 더하는
                                     // 각속도 충격량 — 오른쪽 끝에 놓으면 즉시 오른쪽으로 휘청(§9)
  PERFECT_BALANCE_DAMPING: 0.75,     // PERFECT 착지 시 stackAngularVelocity·stackTilt에 그대로 곱해
                                     // 살짝 안정화(§10). impulse 자체는 (1-0.75)=25%만 적용해 "매우
                                     // 작게" 만든다 — 하나의 값으로 세 가지 보정을 겸한다.
  TILT_COM_FACTOR: 1.0,              // 기울기를 실제 픽셀 흔들림(및 그로 인한 유효 COM 이동)으로
                                     // 환산하는 배율. shearPx = heightAboveBase * tan(tilt) * 이 값.
                                     // 렌더링과 지지 판정이 이 값 하나를 공유해 "보이는 대로 판정"
                                     // (§12)이 항상 성립한다.
  // 2026-10-02 버그 수정: shearPx = height * tan(tilt)에서 height는 층수에 비례해 무한히
  // 커지는데 tilt는 상한이 있다 보니, 40층 이상에서는 shear가 수백 px까지 치솟아(예: 40층·
  // 6도면 약 168px, 재료 폭(135px)보다 큼) 떨어뜨린 곳과 완전히 다른 곳에 보이거나 바로 아래
  // 재료 쪽으로 쏠려 붙어 보이는 버그가 있었다. 각도가 아니라 "픽셀 흔들림 자체"에 상한을
  // 둬서 층수가 아무리 높아져도 이 값을 넘지 않게 막는다.
  MAX_SWAY_SHEAR_RATIO: 0.5,         // 재료 폭(ingredientWidth) 대비 shear 절대값 상한 비율
  COLLAPSE_GRACE_TIME: 100,          // ms. 흔들림만으로 유효 COM이 COLLAPSE 영역에 들어가도 이
                                     // 시간 이상 머물러야 실제로 무너진다(스프링 관성으로 경계를
                                     // 스치듯 지나가는 것까지 즉시 무너뜨리면 억울함, §18). 단
                                     // 극단적으로(지지 밖으로 완전히 벗어남) 위험하면 즉시 무너짐.

  // 붕괴 애니메이션 v2 — "버티다가 한쪽으로 넘어지는" 3단계. pivot(무너지는 접점의 지지 가장자리)을
  // 축으로 상단 스택 전체가 먼저 하나의 강체처럼 기울고, 임계각을 넘은 뒤에야 위층부터 순차적으로
  // 분리되어 각자 중력+관성으로 떨어진다. 전체 합이 약 1.5초(§20 타임라인).
  COLLAPSE_HOLD_MS: 100,             // LAND IMPACT 이후 추가로 "버티는" 시간(임팩트 130ms와 합쳐 약 230ms)
  COLLAPSE_BRACE_MS: 150,            // 1단계: 아주 짧게 버티는 느낌(0→BRACE_ANGLE)
  COLLAPSE_BRACE_ANGLE_DEG: 3,
  // 2026-10-02: "탑이 무너지듯이 옆으로 넘어가면 좋겠다"는 피드백으로 토플 각도를 키웠다
  // (14도 → 24도). 세로로 서는 90도와는 여전히 거리가 멀고, 분리 전 "확실히 옆으로
  // 기울어 넘어가는" 느낌이 나는 수준까지만 올렸다. 시간도 조금 늘려(300→360ms) 커진
  // 각도가 눈에 들어올 여유를 준다.
  COLLAPSE_TOPPLE_MS: 360,           // 2단계: 상단 스택 전체가 pivot 축으로 함께 기욺(BRACE_ANGLE→TOPPLE_ANGLE_CAP)
  COLLAPSE_TOPPLE_ANGLE_CAP_DEG: 24, // 강체로 붙어있는 동안의 회전각 상한(세로로 서지 않게 90도와는 충분히 거리 둠)
  COLLAPSE_DETACH_STAGGER_MS: 50,    // 3단계: 위층부터 분리되는 시간차(층당)
  COLLAPSE_DETACH_EXTRA_ANGLE_DEG: 26, // 분리된 뒤 TOPPLE_ANGLE_CAP 위에 추가로 더 돌 수 있는 한도(20→26)
  COLLAPSE_DETACH_ANGVEL: 0.7,       // 분리 후 각속도(rad/s) — 빠르게 빙글빙글 돌지 않도록 작게
  COLLAPSE_DETACH_VX_BASE: 170,      // 분리 순간 수평 속도 기준값(logical px/s), 위층일수록 배율 증가
  COLLAPSE_DETACH_VY_BASE: 30,       // 분리 순간 수직 속도 기준값(logical px/s) — 처음엔 작고 중력으로 증가
  COLLAPSE_GRAVITY: 1500,            // 분리 후 낙하 가속도 (logical px/s^2)
  COLLAPSE_DURATION_MS: 1550,        // 무너지는 연출 총 시간(§20: 0.15+0.36+분리·낙하+settling ≈ 1.5~1.6초)

  RESULT_DELAY_MS: 500,             // gameover 화면 전환 전 마지막 대기(붕괴 애니메이션 종료 후)
  PERFECT_FLASH_MS: 600,            // "PERFECT!" 노출 시간 (명세 §9 그대로: 약 0.6초)
  MAX_STREAK_SAME: 2,               // 동일 재료 최대 연속 허용 횟수(3번째부터 다른 재료 강제, 명세 §3 그대로)

  // 컴팩트 HUD — PLAY 화면에서 UI가 차지하는 세로 공간을 최소화
  PLAY_TOP_PADDING: 14,             // 화면 최상단 → HUD 텍스트까지 여백
  HUD_HEIGHT: 30,                   // HUD 한 줄이 차지하는 높이
  HUD_TO_GAME_GAP: 10,              // HUD 아래 → 실제 게임 영역(스폰 라인 등) 사이 여백

  // 계정 워터마크(2026-10-01 신설) — 메인/플레이 화면(캔버스)과 저장 이미지가 공유하는 값.
  // 메인 화면(인트로)의 DOM 워터마크는 main.css의 .watermark에 같은 값을 직접 지정한다
  // (CSS가 이 JS 상수를 읽을 수 없어서 별도 지정 — 수치만 여기와 동일하게 맞춘다).
  WATERMARK_TEXT: '@ccojik.dh',
  WATERMARK_FONT_SIZE: 11,          // 캔버스 전용 logical px(화면 폭 기준 스케일되어 DOM 12px과 비슷한 체감 크기)
  WATERMARK_OPACITY: 0.42,          // 0.35~0.55 권장 범위 중간값(너무 흐리지도 진하지도 않게)
  WATERMARK_PADDING: 16,            // 가장자리 안전 여백(logical px) — PLAY_FLOOR_PADDING과 동일한 감각
};

// EASY_BETA_MODE 전용 덮어쓰기(beta-easy 브랜치, 2026-10-02) — 위 BS.CONFIG 안의 값은
// 전부 V1 정식 수치 그대로 남겨두고, 여기서 "값만" 베타용으로 완화한다. 코드/수식은
// 하나도 바꾸지 않는다(SAFE/COLLAPSE 판정 로직은 physics.js 그대로) — EASY_BETA_MODE를
// false로 되돌리기만 하면 이 블록 전체가 그냥 실행되지 않아 V1 수치로 완전히 복원된다.
if (BS.CONFIG.EASY_BETA_MODE) {
  // COLLAPSE_SUPPORT_RATIO 0.42 → 0.32(약 24% 완화), COLLAPSE_COM_MARGIN 0.10 → 0.08
  // (약 20% 완화) — §9 "현재보다 15~25% 더 낮게 / COM margin도 20% 정도 관대하게" 그대로.
  // SAFE_SUPPORT_RATIO/SAFE_COM_MARGIN(=UNSTABLE 경계)은 요청에 없어 건드리지 않았다.
  BS.CONFIG.COLLAPSE_SUPPORT_RATIO = 0.32;
  BS.CONFIG.COLLAPSE_COM_MARGIN = 0.08;
}

function tierLookup(tiers, layerIndex, key) {
  for (var i = 0; i < tiers.length; i++) {
    if (layerIndex <= tiers[i].maxLayer) return tiers[i][key];
  }
  return tiers[tiers.length - 1][key];
}

/* 1~SPEED_NORMAL_LAYERS층까지는 무조건 정상 속도(1.00배) 고정. 그 다음부터
 * "오르막(가속) → 정점 HOLD(빠른 상태 유지) → 내리막 → 저점 통과 → 복귀"
 * 5구간을 돌며, 구간이 끝날 때마다 다음 구간으로 넘어가는 비(非)사인 파동에
 * 층마다 오르는 기준선(baseline)을 곱한다(난이도 1, 2026-10-01 개정).
 * 기준선 자체가 계속 오르므로 파동의 저점·고점도 함께 높아진다 — "완급은
 * 반복되지만 전체적으로는 점점 빨라짐". 오르막·HOLD·내리막 전반부(정점 쪽)는
 * AMPLITUDE_UP, 내리막 후반부·저점·복귀(저점 쪽)는 AMPLITUDE_DOWN을 써서
 * "느린 느낌은 유지하되 빠른 쪽만 더 오래/더 빠르게" 비대칭으로 만든다. */
function speedWaveAt(e) {
  var C = BS.CONFIG;
  var Q = C.SPEED_WAVE_QUARTER_LAYERS, H = C.SPEED_WAVE_HOLD_LAYERS;
  var cycleLen = 4 * Q + H;
  var pos = (e - 1) % cycleLen; // 0 = 주기 시작(=중립, wave 1.0)
  var angleDeg, amplitude;
  if (pos < Q) { // 오르막: 0deg(중립) → 90deg(정점)
    angleDeg = (pos / Q) * 90;
    amplitude = C.SPEED_WAVE_AMPLITUDE_UP;
  } else if (pos < Q + H) { // 정점 HOLD: 90deg 고정
    angleDeg = 90;
    amplitude = C.SPEED_WAVE_AMPLITUDE_UP;
  } else if (pos < 2 * Q + H) { // 내리막 전반부: 90deg → 180deg(중립)
    angleDeg = 90 + ((pos - Q - H) / Q) * 90;
    amplitude = C.SPEED_WAVE_AMPLITUDE_UP;
  } else if (pos < 3 * Q + H) { // 내리막 후반부: 180deg(중립) → 270deg(저점)
    angleDeg = 180 + ((pos - 2 * Q - H) / Q) * 90;
    amplitude = C.SPEED_WAVE_AMPLITUDE_DOWN;
  } else { // 복귀: 270deg(저점) → 360deg(중립, 다음 주기 시작)
    angleDeg = 270 + ((pos - 3 * Q - H) / Q) * 90;
    amplitude = C.SPEED_WAVE_AMPLITUDE_DOWN;
  }
  return 1 + amplitude * Math.sin(angleDeg * Math.PI / 180);
}

BS.speedMultiplierForLayer = function (layerIndex) {
  var C = BS.CONFIG;
  if (layerIndex <= C.SPEED_NORMAL_LAYERS) return C.SPEED_BASE_MULT;
  var e = layerIndex - C.SPEED_NORMAL_LAYERS; // 파동 활성화 후 경과 층수(1부터 시작)
  var baseline = C.SPEED_BASE_MULT + (e - 1) * C.SPEED_STEP_PER_LAYER;
  var mult = baseline * speedWaveAt(e);
  return Math.min(mult, C.SPEED_MULT_CAP);
};

/* 층수 구간별 PERFECT 판정 범위(logical px) (난이도 2, CONFIG.PERFECT_THRESHOLD_TIERS 표 그대로) */
BS.perfectThresholdForLayer = function (layerIndex) {
  return tierLookup(BS.CONFIG.PERFECT_THRESHOLD_TIERS, layerIndex, 'threshold');
};

/* 동적 균형/흔들림 — 층수 구간별 민감도·목표 기울기 상한(play.js가 매 프레임 사용) */
BS.balanceSensitivityForLayer = function (layerCount) {
  return tierLookup(BS.CONFIG.BALANCE_SENSITIVITY_BY_LAYER, layerCount, 'value');
};
BS.balanceMaxTiltDegForLayer = function (layerCount) {
  return tierLookup(BS.CONFIG.BALANCE_MAX_TILT_BY_LAYER, layerCount, 'value');
};

BS.spawnScreenY = function () {
  var C = BS.CONFIG;
  return C.PLAY_TOP_PADDING + C.HUD_HEIGHT + C.HUD_TO_GAME_GAP;
};

/* 접촉 기반 쌓기 계산(게임 루프·인트로 프리뷰가 공유) */
BS.ingredientWidth = function () {
  return BS.CONFIG.LOGICAL_WIDTH * BS.CONFIG.INITIAL_STACK_WIDTH_RATIO;
};
BS.visualHeightOf = function (id) {
  var s = BS.sprites.get(id);
  return BS.ingredientWidth() / (s.bbox.w / s.bbox.h);
};
BS.contactFrac = function (id) {
  return BS.CONFIG.INGREDIENT_CONTACT[id] || { top: 0, bottom: 1 };
};
/* prevLayer: {ingredient, topY, visualHeight}, overlapPx 생략 시 CONFIG.CONTACT_OVERLAP_PX 사용(스케일 조정용으로 노출)
 * 부호 주의(2026-09-29 수정): overlap은 새 재료를 contactLine보다 "더 아래로" 밀어넣어야
 * 실제로 겹친다. 이전에는 -overlap으로 빼고 있어서 오히려 overlap을 키울수록 간격이
 * 더 벌어지는 반대 방향 버그가 있었다(브라우저 alpha 채널 실측으로 확인). */
BS.landingTopY = function (prevLayer, newIngredient, newVisualHeight, overlapPx) {
  var topC = BS.contactFrac(prevLayer.ingredient);
  var newC = BS.contactFrac(newIngredient);
  var contactLineWorldY = prevLayer.topY + prevLayer.visualHeight * topC.top;
  var overlap = overlapPx;
  if (overlap === undefined) {
    var extra = BS.CONFIG.INGREDIENT_EXTRA_OVERLAP || {};
    var extraAmt = Math.max(extra[prevLayer.ingredient] || 0, extra[newIngredient] || 0);
    overlap = BS.CONFIG.CONTACT_OVERLAP_PX + extraAmt;
  }
  return contactLineWorldY + overlap - newVisualHeight * newC.bottom;
};

BS.START_INGREDIENT = 'bottom_bun';
BS.END_INGREDIENT = 'top_bun'; // 이번 버전에서는 일반 재료로도, 종료 연출로도 사용하지 않는다(추후 결정).
BS.REGULAR_INGREDIENTS = ['patty', 'cheese', 'lettuce', 'tomato', 'onion', 'egg', 'bacon', 'middle_bun'];
