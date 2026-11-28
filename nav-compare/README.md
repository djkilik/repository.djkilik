# 🚗 네비 3사 경로 비교 (TMAP · 네이버 · 카카오)

도착지를 검색하면 **TMAP, 네이버 지도, 카카오** 세 곳의 자동차 최적 경로를
한 번에 불러와 **예상 시간 · 거리 · 통행료 · 도착 시각**을 나란히 비교합니다.

- 지도 위에 세 경로를 색깔별로 겹쳐서 표시 (TMAP 빨강 / 네이버 초록 / 카카오 노랑)
- 가장 빠른 경로, 가장 짧은 경로, 통행료가 가장 싼 경로에 배지 표시
- 각 카드의 버튼으로 해당 앱을 바로 열어 안내 시작 (휴대폰에 앱 설치 필요)
- 출발지를 비워두면 현재 위치(GPS)에서 출발

## 실행 방법

필요한 것: Node.js 18 이상 (추가 설치 패키지 없음)

```bash
cd nav-compare
cp .env.example .env     # 키 입력 (아래 참고)
node server.js           # → http://localhost:3000
```

- 키가 **하나도 없으면**: 데모 모드(가상 경로, 점선)로 화면만 미리 볼 수 있습니다.
- 키가 **일부만 있으면**: 키 없는 회사는 비교에서 빠집니다. (가짜 데이터를 섞지 않음)
- 실제로 비교하려면 키가 **2곳 이상** 필요합니다.
- `.env` 파일은 git에 올라가지 않게 막아 두었습니다. 키는 다른 사람에게 보여주지 마세요.

> 휴대폰에서 현재 위치를 쓰려면 브라우저 정책상 **HTTPS** 주소가 필요합니다.
> 집 PC에서 돌린다면 Cloudflare Tunnel·ngrok 같은 도구로 HTTPS 주소를 만들거나,
> Render·Railway·Fly.io 같은 곳에 배포하세요.

## API 키 발급 방법

키는 회사마다 **본인 계정으로 직접** 받아야 합니다.
(약관 동의, 결제수단 등록, 과금 책임이 모두 계정 주인에게 있습니다.)
아래 조건은 2026년 11월에 확인한 내용이며, 바뀔 수 있습니다.

| 서비스 | 받을 값 | 비용 |
|---|---|---|
| TMAP | 앱 키 1개 | 무료 (경로 하루 1,000건) |
| 카카오 | REST API 키 1개 | 비상업 개인용은 무료 쿼터 안에서 사용 |
| 네이버 | Client ID + Client Secret | 무료 (경로 월 60,000건), 넘으면 건당 5원 |

### 1) TMAP → `TMAP_APP_KEY`

1. [SK open API](https://openapi.sk.com) 회원가입 · 로그인
2. PRODUCTS → TMAP → 요금제에서 **Free(무료체험)** 선택
3. 앱을 만들면 나오는 **앱 키(appKey)** 를 `.env`에 입력

- 자동차 경로안내 무료 한도: 하루 1,000건
  ([요금표](https://openapi.sk.com/products/calc?svcSeq=4&menuSeq=5))
- 받은 데이터를 24시간 넘게 저장하면 안 됩니다. 이 앱은 저장하지 않습니다.
  ([약관](https://tmapapi.tmapmobility.com/terms.html))
- 화면 메뉴 이름은 바뀔 수 있습니다.

### 2) 카카오 → `KAKAO_REST_API_KEY`

1. [Kakao Developers](https://developers.kakao.com)에 카카오 계정으로 로그인
2. 내 애플리케이션 → 애플리케이션 추가 (이름은 아무거나)
3. 앱 키 메뉴의 **REST API 키**를 `.env`에 입력
4. 제품 설정 → **카카오맵** → 사용 설정 **ON** (장소 검색에 필요)
   ([공지](https://devtalk.kakao.com/t/api/140875))

- 자동차 길찾기는 공식 문서상 "제휴 파트너용"입니다.
  다만 카카오모빌리티 담당자가 데브톡에서 "비상업적 이용은 무료 쿼터 안에서
  별도 제휴 없이 바로 사용 가능"이라고 답했습니다.
  ([답변 1](https://devtalk.kakao.com/t/directions-api/150862),
  [답변 2](https://devtalk.kakao.com/t/directions-api/151177))
- 상업적으로 쓰면 쿼터 안이라도 제휴 계약이 필요합니다.
- 403 오류가 나면: 카카오맵 사용 설정 확인 →
  그래도 안 되면 데브톡 카카오내비 게시판에 앱 ID와 사용 목적을 적어 요청하세요.

### 3) 네이버 → `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`

1. [네이버 클라우드 플랫폼](https://www.ncloud.com) 회원가입 + 결제수단 등록
2. 콘솔 → Services → Application Services → **Maps** → 이용 신청
3. Application 등록 → API 목록에서 **Directions 5 체크**
   (체크 안 하면 429 오류)
4. 인증 정보의 **Client ID / Client Secret**을 `.env`에 입력

- 요금: Directions 5는 **월 60,000건까지 무료**, 넘으면 건당 5원 (VAT 별도).
  무료 이용량은 대표 계정 1개(Maps를 처음 쓴 계정)에만 적용됩니다.
  ([요금표](https://www.ncloud.com/charge/region/jp),
  [Maps 요금 탭](https://www.ncloud.com/product/applicationService/maps#pricing))
- 하루 2,000번 넘게 비교하지 않으면 개인용으로는 사실상 무료입니다.
- 반드시 **새 Maps 상품**에서 키를 받으세요.
  옛 "AI NAVER API" 지도 API는 2026-11-24 18시에 종료됐습니다.
  ([종료 공지](https://www.ncloud.com/support/notice/all/2200))
  "2025-07-01부터 무료 이용량 종료" 공지도 이 옛 상품 이야기입니다.
  ([공지](https://www.gov-ncloud.com/support/notice/all/528))
- 무료 한도를 넘으면 청구되므로 콘솔에서 **이용 한도 설정**을 켜 두세요.
  ([가이드](https://guide.ncloud-docs.com/docs/maps-procedure))

장소 검색은 카카오 키가 있으면 카카오 로컬 API, 없으면 TMAP POI 검색을 씁니다.

## 알아둘 점

- **공개 API ≠ 실제 앱.** 세 회사 모두 개발자용 API를 제공하지만, 휴대폰 앱이 쓰는
  엔진·옵션·실시간 교통 반영 방식과 완전히 같다는 보장은 없습니다. 비교 결과는
  "참고용"으로 보세요.
- 비교 기준 옵션: TMAP `searchOption=0`(추천), 네이버 `traoptimal`(실시간 최적),
  카카오 `priority=RECOMMEND`(추천).
- 네이버는 응답 시간이 **밀리초** 단위라 서버에서 초로 바꿔 비교합니다.
- API 키는 서버(`server.js`)에서만 쓰고 브라우저로 보내지 않습니다.
  각 사 API는 브라우저 직접 호출(CORS)을 막는 경우가 있어 서버를 거치는 구조입니다.
- 카카오 로컬 API 약관상 검색 결과를 저장(캐싱)하지 않고 실시간 호출만 합니다.
- 데모 화면: `screenshot-demo.png`
- 지도 그리기: [Leaflet 1.9.4](https://leafletjs.com) (BSD-2, `public/vendor/leaflet`) + OpenStreetMap 타일

## 파일 구조

```
nav-compare/
├── server.js          # API 프록시 + 3사 응답을 같은 형식으로 정리 + 데모 모드
├── public/index.html  # 화면 (검색, 지도, 비교 카드)
├── public/vendor/     # Leaflet
└── .env.example       # API 키 템플릿
```
