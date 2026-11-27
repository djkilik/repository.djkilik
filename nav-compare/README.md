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

키를 하나도 안 넣어도 **데모 모드**(가상 경로, 점선 표시)로 화면을 미리 볼 수 있습니다.

> 휴대폰에서 현재 위치를 쓰려면 브라우저 정책상 **HTTPS** 주소가 필요합니다.
> 집 PC에서 돌린다면 Cloudflare Tunnel·ngrok 같은 도구로 HTTPS 주소를 만들거나,
> Render·Railway·Fly.io 같은 곳에 배포하세요.

## API 키 발급 (모두 무료 쿼터 있음)

| 서비스 | 발급처 | `.env` 항목 | 사용하는 API |
|---|---|---|---|
| TMAP | [SK open API](https://openapi.sk.com) | `TMAP_APP_KEY` | 자동차 경로안내 `POST /tmap/routes?version=1`, POI 검색 |
| 네이버 | [네이버 클라우드 플랫폼 Maps](https://www.ncloud.com/product/applicationService/maps) | `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` | [Directions 5](https://api.ncloud-docs.com/docs/application-maps-directions5) `GET /driving` |
| 카카오 | [Kakao Developers](https://developers.kakao.com) | `KAKAO_REST_API_KEY` | [카카오모빌리티 길찾기](https://developers.kakaomobility.com) `GET /v1/directions`, [로컬 키워드 검색](https://developers.kakao.com/docs/latest/ko/local/dev-guide) |

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
