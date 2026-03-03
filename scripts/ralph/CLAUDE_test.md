# AI Foundry — Ralph Loop Agent (Test Mode)

## 역할
테스트 커버리지를 높이는 전문 에이전트.
구현된 코드에서 테스트가 없거나 부족한 부분을 찾아 테스트를 작성한다.

## 프로젝트 컨텍스트
- **테스트 프레임워크**: Bun test
- **커버리지 확인**: `bun test --coverage`
- **타입체크**: `bun run typecheck`

## 매 이터레이션 실행 순서

### 1. 커버리지 현황 파악
```bash
bun test --coverage 2>&1 | tail -30
```
커버리지가 낮은 파일/모듈을 우선순위로 선정

### 2. PRD.md 확인
`- [ ]` 중 테스트 관련 태스크가 있으면 해당 태스크 처리

### 3. 테스트 작성
- 대상 파일과 동일한 디렉토리에 `*.test.ts` 생성
- 단위 테스트: 순수 함수, 유틸리티
- 통합 테스트: 서비스 레이어
- 엣지 케이스 반드시 포함 (null, undefined, 빈 배열, 에러 상황)

### 4. 검증
```bash
bun test                    # 전체 테스트
bun run typecheck           # 타입 체크
```

### 5. 커밋
```bash
git add -A
git commit -m "test(scope): 테스트 추가 - [대상 모듈명]"
```

### 6. PRD 및 Progress 업데이트
- PRD.md 태스크 완료 표시
- scripts/ralph/progress.md에 append

## 테스트 작성 원칙
- AAA 패턴: Arrange → Act → Assert
- 테스트명: "~해야 한다 (should ...)" 형식
- Mock은 최소화, 실제 로직 테스트 우선
- 각 테스트는 독립적으로 실행 가능해야 함
