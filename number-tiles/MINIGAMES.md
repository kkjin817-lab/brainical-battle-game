# 새 베팅 미니게임 추가하기

본게임은 미니게임 종류를 직접 분기하지 않습니다. 등록한 플러그인이 기회 생성·판정·전용 UI를 제공하고 공통 호스트가 베팅과 점수를 처리합니다.

## 추가 순서

1. 새 게임의 순수 판정 함수와 전용 UI 파일을 만듭니다.
2. 아래 계약을 지키는 플러그인을 `minigames/catalog.js`에서 등록합니다. 별도 등록 파일을 사용해도 됩니다.
3. UI 스크립트를 `index.html`에 로드하고 `preview.cjs`의 허용 목록에 추가합니다. 호스트보다 먼저 로드합니다.
4. 경계값·중단·저장 실패·통합 테스트를 추가합니다. `integration.test.cjs`의 두 번째 가상 플러그인이 공통 점수 연결 예시입니다.

## 모듈 계약

```js
MiniGames.registry.register({
  type: 'unique_game_type', // 저장 식별자: 이후 이름 변경 금지
  title: '게임 이름',
  weight: 1, // 0이면 신규 추첨 제외, 기존 기회 복원은 가능
  create() {
    return {
      rulesVersion: 'my-game-v1',
      config: { betStep: 100 /* 기회에 고정할 규칙 */ },
      payload: { /* 목표/추첨 결과 등 직렬화 가능한 값 */ }
    };
  },
  judge(opportunity, input) {
    // 순수 함수. 현재 시각/RNG/DOM/저장소를 읽지 않습니다.
    // interrupted는 multiplier: 0으로 처리합니다.
    return { multiplier: 0, endReason: input.reason /* 측정값 등 */ };
  },
  offer(opportunity) {
    return { target: '목표', instruction: '설명', rewards: ['배당 설명'] };
  },
  result(opportunity) {
    return { title: '결과', record: '측정 기록', detail: '설명' };
  },
  mount(context) {
    return MyGameView.mount(context);
  }
});
```

`offer/result` 표시 문자열은 신뢰하는 로컬 데이터만 사용합니다. 외부 문자열을 넣는다면 HTML 이스케이프가 필요합니다.

## UI context

- `container`: 전용 UI를 넣는 DOM 노드.
- `opportunity`: 시작 시 기회 스냅샷, 저장된 config/payload 사용.
- `getBalance()`: 공유 누적 점수 십진 문자열.
- `actionTop`, `actionContainer`: 이전 시작 버튼의 상대 위치. 전용 정지 버튼이 같은 높이에 오도록 배치할 때 사용합니다.
- `command('running')`: COUNTDOWN→RUNNING을 저장하는 Promise.
- `settle(input)`: 첫 입력에서 고정한 측정 결과 전달. 공통 호스트가 동일 eventId로 저장 재시도.
- 반환값 `{ update(opportunity), dispose() }`: 상태 변경 반영, RAF/타이머/문서 이벤트 해제.

## 상태와 점수

`OFFERED → COUNTDOWN → RUNNING → SETTLED`, 또는 `OFFERED → SKIPPED`입니다. 게임별 UI가 준비를 마치면 running 명령을 보내고 저장된 RUNNING 상태에서만 입력을 받습니다. 각 게임의 준비 시간은 전용 UI가 결정합니다.

UI는 점수·베팅 금액을 직접 변경하거나 자체 지급하지 않습니다. judge는 원금을 포함한 총지급 배율을 반환합니다. 공통 Game.mini()가 stake × multiplier를 BigInt로 계산하고 한 번만 지급합니다. 현재 배율 계약은 0 이상의 안전한 정수입니다. 소수 배율 게임은 공통 계약과 테스트를 먼저 확장해야 합니다.

dispose()는 모든 RAF, 타이머, 키보드 리스너를 해제해야 합니다. 정지 기록은 첫 유효 입력에서 고정하고 추가 입력을 무시합니다. 앱 중단 시 호스트는 `{reason:'interrupted', elapsedMs:null}`로 정산합니다.

## 추첨과 복원

가중치 1인 게임 2개는 각각 50%, 가중치 1과 3은 각각 25%와 75%입니다. 현재 타이머 하나의 weight가 1이라 항상 나옵니다. 종류와 게임별 목표는 수식 클리어 시 한 번만 추첨하고 같은 트랜잭션에 저장합니다. 결과 화면 이동과 새로고침에서는 다시 추첨하지 않습니다.

기존 type을 삭제하거나 이름을 바꾸면 저장된 기회를 열 수 없습니다. 신규 출현만 중지하려면 weight를 0으로 하고 구현은 유지합니다. 규칙 변경은 새 기회부터 적용하며 진행 중 기회는 저장된 규칙으로 판정합니다.

## 테스트 체크

- 저장 실패, 동시 시작, 중복 이벤트, 정산 재시도.
- 준비/진행 중 중단, 결과 복원, 잔액 부족, 매우 큰 점수.
- 완료/건너뛰기 후 다음 단계, 특히 20단계 뒤 전체 종료.
- 두 번째 게임을 등록해도 수식 보상과 다음 목표가 유지됨.
- 360px 화면에서 버튼과 긴 숫자가 겹치지 않음.
