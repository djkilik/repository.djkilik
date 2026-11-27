# 사진 발자국

사진 파일에 들어 있는 **촬영 위치(GPS)** 와 **촬영 날짜**를 읽어서,
**언제 어디에 다녀왔는지** 날짜별로 정리하고 지도에 보여주는 웹앱입니다.

- 지도: **카카오맵(다음 지도)**, **네이버 지도**, **구글 지도** 중에서 고를 수 있어요.
  키가 없을 때는 OpenStreetMap 기본 지도로 바로 써 볼 수 있어요.
- 사진은 **내 기기 안에서만** 읽어요. 사진 파일을 서버로 올리지 않아요.
- 설치 없이 브라우저(PC·휴대폰)에서 열면 돼요.

---

## 무엇을 보여주나요

| 화면 | 내용 |
|---|---|
| 날짜별 | 날짜마다 들른 장소를 시간 순서로 보여줘요. 예) `5월 3일 (토)` → 1 경복궁 10:12–10:31 → 2 광화문 11:20 … |
| 지도 | 고른 날짜의 장소에 번호 핀을 찍고, 이동한 순서대로 선을 그어요. 전체 보기에서는 모든 장소를 점으로 보여줘요. |
| 장소 자세히 | 날짜·시각, 주소, 좌표, 그곳에서 찍은 사진, **카카오맵·네이버지도·구글지도 앱으로 열기** 버튼 |
| 지역별 | `서울특별시 종로구 · 2일` 처럼 지역마다 다녀온 날짜를 모아 보여줘요. |
| 위치 없는 사진 | 위치 정보가 없는 사진도 날짜·시각은 보여줘요. |

그 밖의 기능

- 300m 안에서 2시간 안에 찍은 사진은 한 장소로 묶어요. (설정에서 100m · 300m · 1km로 바꿀 수 있어요)
- 기록은 이 브라우저에 저장돼요. 다음에 열어도 그대로 있어요.
- 같은 사진을 다시 불러오면 건너뛰어요. 새 사진만 기존 기록에 더해요.
- **표(CSV)로 내보내기** — 엑셀에서 열 수 있어요.
- **백업 파일 저장 / 불러오기** — 다른 기기나 브라우저로 기록을 옮길 수 있어요.
- iPhone의 HEIC 사진도 위치와 날짜를 읽어요.
  (HEIC 미리보기 그림은 사파리에서만 보여요)
- 촬영 날짜가 없는 사진은 파일 이름(예: `20250601_140000.jpg`)이나 파일 수정일로 날짜를 추정하고, 추정했다고 표시해요.

---

## 1. 웹에 올리기 (GitHub Pages, 무료)

카카오·네이버 지도는 **등록한 웹 주소에서만** 동작해요.
그래서 `index.html` 파일을 더블클릭해서 열면(`file://`) 지도가 제대로 나오지 않아요.
GitHub Pages로 올리면 고정된 주소가 생겨요.

1. GitHub에서 `djkilik/repository.djkilik` 저장소 → **Settings** → **Pages** 로 가요.
2. **Source** 에서 **Deploy from a branch** 를 골라요.
3. **Branch** 에서 이 앱이 들어 있는 브랜치를 고르고, 폴더는 **/ (root)** 로 두고 **Save** 를 눌러요.
   - 지금 앱은 `claude/inspiring-thompson-z6cj76` 브랜치에 있어요.
   - `main` 에 합친(merge) 뒤 `main` 을 골라도 돼요.
4. 1~2분 뒤 아래 주소로 열어요.

```
https://djkilik.github.io/repository.djkilik/photo-map/
```

> 지도 서비스에 등록할 **사이트 주소(도메인)** 는 `https://djkilik.github.io` 예요.
> 앱의 설정 화면에도 "이 사이트 주소"로 표시돼요.

PC에서 시험만 해 보려면, 이 폴더에서 `python -m http.server 8000` 을 실행하고
`http://localhost:8000` 으로 열어도 돼요. 이때는 `http://localhost:8000` 도 지도 서비스에 등록해야 해요.

---

## 2. 지도 키 받기

키가 없어도 기본 지도(OpenStreetMap)로 바로 쓸 수 있어요.
카카오·네이버·구글 지도를 쓰려면 아래 중 하나의 키를 받아서 앱의 **설정** 에 넣어요.

### 카카오맵 (다음 지도) — 국내 지도, 가장 쉬워요

1. [카카오 디벨로퍼스](https://developers.kakao.com/console/app)에 로그인하고 애플리케이션을 만들어요.
2. 앱 키 중 **JavaScript 키** 를 복사해요. (REST API 키가 아니에요)
3. JavaScript 키의 **JavaScript SDK 도메인** 에 `https://djkilik.github.io` 를 등록해요.
   (예전 화면에서는 플랫폼 → Web → 사이트 도메인)
4. **카카오맵** 메뉴의 **사용 설정** 에서 상태를 **ON** 으로 바꿔요.
5. 앱 설정 화면에서 "카카오맵"을 고르고 JavaScript 키를 붙여 넣어요.

참고: 2026년 7월 21일부터 무료 사용량은 개발자 계정에서 **처음으로 카카오맵 API를 켠 앱** 에만 주어져요.
두 번째 앱부터는 비즈월렛 연결과 유료 설정이 필요해요.

### 네이버 지도

1. [네이버 클라우드 플랫폼 콘솔](https://console.ncloud.com)에서 **Maps** 의 Application을 등록해요.
2. API는 **Dynamic Map** 을 고르고, 주소 찾기를 쓰려면 **Reverse Geocoding** 도 골라요.
3. **Web 서비스 URL** 에 `https://djkilik.github.io` 를 등록해요.
4. 인증 정보의 **Client ID** 를 앱 설정에 붙여 넣어요.
   (지도 스크립트 주소의 이름은 예전 `ncpClientId` 에서 `ncpKeyId` 로 바뀌었어요. 앱은 새 이름을 써요)

요금과 무료 사용량은 네이버 클라우드 플랫폼 안내에서 확인해 주세요.

### 구글 지도 — 해외 여행 사진에 좋아요

1. [Google Cloud 콘솔](https://console.cloud.google.com/google/maps-apis)에서 **Maps JavaScript API** 를 사용 설정해요.
   주소 찾기를 쓰려면 **Geocoding API** 도 켜요.
2. API 키를 만들고, 웹사이트 제한에 `https://djkilik.github.io/*` 를 넣어요.
3. 보통 결제 계정 연결이 필요해요.
   2025년 3월부터는 기능(SKU)마다 매달 무료 사용량이 있어요. (예: Geocoding 등 Essentials 등급은 월 1만 건)
4. 신용카드 없이 시험해 보려면 **Maps Demo Key** 도 있어요.
   단, 하루 사용량 제한이 있고 시험·프로토타입 용도예요.

### 키를 넣었는데 지도가 안 나오면

- 앱이 자동으로 기본 지도로 바꿔 보여주고, 무엇을 확인할지 알려줘요.
- 가장 흔한 원인: 사이트 주소(도메인) 미등록, 키 종류 잘못 넣음, 카카오맵 사용 설정 OFF.
- 이미 불러온 지도의 키를 바꾸면 앱이 페이지를 한 번 새로 열어요.

---

## 3. 휴대폰 사진에 위치가 안 나올 때

휴대폰 브라우저에서 사진을 고를 때, 운영체제가 **사진의 위치 정보를 빼고** 넘겨주는 경우가 있어요.
앱의 **사진 추가 → 휴대폰 사진에 위치가 안 나올 때** 에도 같은 안내가 있어요.

**먼저 확인**

- 카메라 앱 설정에서 **위치 태그(위치 저장)** 가 켜져 있어야 사진에 위치가 기록돼요.
- 메신저·SNS로 받은 사진은 위치 정보가 지워져 있을 수 있어요. 원본을 쓰세요.

**아이폰**

- 사진을 한꺼번에 많이 고르면, 아이폰이 사진을 준비하는 데 1분 넘게 걸리거나 메모리가 부족해 페이지가 새로 열릴 수 있어요.
  **30~50장씩** 나눠서 고르세요. 처음에는 10장 정도로 시험해 보세요.
  - 앱은 사진을 기다리는 동안 안내를 띄우고, 아이폰에서는 한 장씩 읽으며 20장마다 저장해요.
  - 도중에 페이지가 새로 열리면 다시 열었을 때 알려줘요. 같은 사진을 다시 고르면 남은 사진만 더해요.
- 사진을 고르는 화면에 **옵션** 버튼이 보이면 눌러서 **위치** 를 켜고 고르세요.
- 그래도 빠지면 사진 앱에서 공유 → **옵션** 에서 **위치** 를 켜고 **파일에 저장** 한 뒤,
  앱에서 **파일 앱에서 고르기** 로 불러오세요.

**갤럭시 등 안드로이드**

- 안드로이드 사진 선택 화면(Photo Picker)은 기본적으로 위치 정보를 빼요.
- 2026년 8월 Google Play 시스템 업데이트부터는 사진 선택 화면 오른쪽 아래의 **위치 정보 버튼** 으로 위치를 함께 넘길 수 있어요.
- **파일 앱에서 고르기** 로 내 파일 → DCIM → Camera 폴더의 사진을 고르면 위치가 남는 경우가 있어요.
  (기기·버전마다 달라요)

**가장 확실한 방법**

- 사진을 PC로 옮긴 뒤, PC 브라우저에서 **폴더 통째로** 불러오세요.
  사진이나 폴더를 창에 끌어다 놓아도 돼요.

---

## 4. 개인정보와 보안

- 사진 파일은 브라우저 안에서만 읽어요. 어디에도 올리지 않아요.
- 브라우저에는 날짜·좌표·작은 미리보기(약 200px)만 저장해요. 사진 원본은 저장하지 않아요.
- 주소를 찾을 때는 **장소의 좌표만** 지도 서비스로 보내요. 설정에서 "주소 자동 찾기"를 끄면 보내지 않아요.
- 지도 키는 이 브라우저의 저장소(localStorage)에만 저장돼요.
  지도용 키는 웹페이지에 드러나는 키라서, 꼭 **사이트 주소 제한** 을 걸어 두세요.

**백업 파일과 악성 코드 막기**

- 백업 파일의 기록은 정해진 모양일 때만 받아요.
  - 기록 번호(id): 영문·숫자·`_`·`-` 만
  - 날짜: `YYYY-MM-DD HH:MM:SS` 형식만
  - 좌표: 숫자 범위 안만
  - 미리보기: 문자열 **전체**가 base64 그림 주소일 때만
- 모양이 이상한 기록은 불러오지 않고, 몇 개를 건너뛰었는지 알려줘요.
- 화면에 넣는 모든 값은 HTML로 해석되지 않게 바꿔서(이스케이프) 넣어요.
- 앱을 열 때 저장된 기록도 같은 검사를 다시 해요.
  이상한 기록은 화면에 보여주지 않지만 **지우지는 않아요.** (설정 → 모든 기록 지우기로만 지워져요)
- 페이지에 보안 정책(CSP)을 넣어서, 누가 끼워 넣은 인라인 스크립트(`onerror=` 같은 코드)는 실행되지 않아요.
  지도 SDK가 다른 https 주소(예: 카카오의 `kakaocdn.net`)에서 스크립트를 더 불러오므로 https 스크립트는 허용했어요.
- 그래도 **모르는 사람이 보낸 백업 파일은 불러오지 마세요.**

---

## 5. 기본 지도와 주소 찾기 (OpenStreetMap) 이용 규칙

키 없이 쓰는 기본 지도와 주소 찾기는 OpenStreetMap 재단이 자원봉사로 운영하는 공용 서버를 써요.
그래서 이용 규칙을 지켜야 해요.

**지도 그림(타일)** — [타일 이용 정책](https://operations.osmfoundation.org/policies/tiles/)

- 요청에 사이트 주소(Referer)가 있어야 해요. 그래서 `file://` 로 열면 지도 그림이 막혀요.
- 지도 오른쪽 아래의 "© OpenStreetMap 기여자" 표시는 지우면 안 돼요.

**주소 찾기(Nominatim)** — [Nominatim 이용 정책](https://operations.osmfoundation.org/policies/nominatim/)

- 앱 **전체** 요청을 합쳐 **1초에 1번 이하** 여야 해요.
- 앱을 알아볼 수 있게 사이트 주소(Referer)가 함께 가야 해요. (브라우저가 자동으로 보내요)
- 찾은 결과에 "© OpenStreetMap 기여자" 출처를 표시해야 해요.
- 같은 좌표를 반복해서 묻지 않도록 결과를 저장해야 해요.
- 많은 양을 한꺼번에 조회하는 용도로 쓰면 안 돼요.

이 앱이 규칙을 지키는 방법

- 주소는 **1.1초에 한 곳씩**, 한 줄로만 요청해요.
- 찾은 주소는 저장해 두고 다시 묻지 않아요. 40m 안의 장소는 같은 주소를 같이 써요.
- 자동으로는 **최근 장소 30곳까지만** 찾아요. 나머지는 날짜를 누르거나 "남은 주소 모두 찾기"를 눌렀을 때만 찾아요.
- 목록과 장소 화면에 "주소 정보 © OpenStreetMap 기여자"를 표시해요.
- 오류가 이어지거나 서버가 거절하면 멈춰요.

> ⚠️ 이 설정은 **혼자 쓰는 개인용** 기준이에요.
> 여러 사람이 함께 쓰도록 공개하면 사람들의 요청이 합쳐져 "앱 전체 초당 1번" 규칙을 넘을 수 있어요.
> 그럴 때는 카카오·네이버·구글 키로 주소를 찾거나, 설정에서 "주소 자동 찾기"를 꺼 주세요.

---

## 6. 파일 구성

```
photo-map/
├─ index.html              화면 구조
├─ css/app.css             디자인
├─ js/
│  ├─ util.js              날짜·거리 계산 등 도우미
│  ├─ exif.js              사진에서 날짜·위치·미리보기 읽기
│  ├─ store.js             브라우저 저장(IndexedDB, 설정)
│  ├─ maps.js              카카오·네이버·구글·기본 지도 연결, 지도 앱 링크
│  ├─ geocode.js           좌표 → 주소 찾기 (저장·속도 제한 포함)
│  └─ app.js               화면 동작 (불러오기, 날짜별 정리, 장소 묶기, 내보내기)
├─ vendor/
│  ├─ exifreader/          ExifReader 4.54.0 (MPL-2.0)
│  └─ leaflet/             Leaflet 1.9.4 (BSD-2-Clause)
├─ icons/                  앱 아이콘
└─ manifest.webmanifest    휴대폰 홈 화면에 추가할 때 쓰는 정보
```

빌드 과정은 없어요. 파일을 그대로 올리면 돼요.

### 사진 정보 읽기

- EXIF 해석은 [ExifReader](https://github.com/mattiasw/ExifReader)를 써요.
  JPEG은 앞부분 256KB만 먼저 읽고, 필요할 때만 파일 전체를 읽어요.
- iPhone 17 등 새 HEIC 파일에서 `exifr` 라이브러리가 위치를 못 읽는 사례가 보고되어 ExifReader를 골랐어요.
  실제로 이 앱 테스트에서도 exifr는 HEIC 테스트 사진의 위치를 읽지 못했고, ExifReader는 읽었어요.

### 지도 앱으로 열기 링크

| 지도 | 링크 형식 | 근거 |
|---|---|---|
| 카카오맵 | `https://map.kakao.com/link/map/이름,위도,경도` | 카카오 지도 API 공식 가이드 |
| 구글지도 | `https://www.google.com/maps/search/?api=1&query=위도,경도` | Google Maps URLs 공식 문서 |
| 네이버지도 (휴대폰) | `nmap://place?lat=…&lng=…&name=…&appname=…` (안드로이드는 intent 주소) | 네이버 지도 URL Scheme 공식 문서 |
| 네이버지도 (PC) | `https://map.naver.com/?lng=…&lat=…&title=…` | 공식 문서는 없고 네이버 클라우드 포럼 답변의 형식이에요. 동작이 바뀔 수 있어요. |

---

## 7. 확인한 것과 아직 확인하지 못한 것

자동 브라우저 테스트(Chromium)로 확인한 것 (34개 항목, 3번 반복 모두 통과)

- GPS·촬영일이 든 JPEG·HEIC·PNG 테스트 사진 14장 불러오기, 장소 묶기(10곳), 위치 없는 사진 처리
- 회전된 사진(EXIF 회전값 6) 미리보기 방향, 남반구·서경 좌표
- 날짜별·지역별 목록, 지도 핀·이동 경로, 장소 자세히, 사진 크게 보기
- 주소 찾기 요청 간격 1초 이상, 자동 조회 30곳 제한
- 새로고침 뒤 기록 유지, 중복 사진 건너뛰기, CSV·백업 저장, 백업으로 복원, 모두 지우기
- 카카오·구글 키가 잘못됐을 때 기본 지도로 바꿔 보여주고 안내하기
- 휴대폰(390px)·아주 좁은 화면(320px)에서 가로로 넘치거나 잘리는 글자 없음, 어두운 화면 모드

보안 테스트로 확인한 것 (12개 항목 모두 통과)

- 공격용 백업 파일(이상한 id, 미리보기 주소에 끼운 코드, 주소 이름에 넣은 HTML)을 불러와도 스크립트가 실행되지 않아요.
  같은 파일을 고치기 전 버전에 넣으면 실행됐어요. 테스트가 실제 공격을 잡는다는 뜻이에요.
- 저장소에 이미 들어간 공격 기록도 실행되지 않고, 지워지지도 않아요.
- 정상 기록은 그대로 불러와요.
- CSP가 인라인 이벤트 코드를 막고, 구글 지도 SDK는 CSP 아래에서도 막히지 않고 불러와져요.

아직 확인하지 못한 것 (테스트 환경에서 지도 서버 접속이 막혀 있었어요)

- **실제 키로 카카오맵·네이버 지도·구글 지도를 띄우는 것** — 공식 사용법대로 만들었지만, GitHub Pages에 올린 뒤 처음 한 번 직접 확인해 주세요.
- 실제 OpenStreetMap 지도 그림과 실제 Nominatim 주소 응답 (테스트에서는 가짜 응답으로 동작만 확인했어요)
- 실제 아이폰·갤럭시에서 사진을 고를 때 위치가 남는지

---

## 8. 출처

지도 API
- 카카오 지도 Web API 가이드 (스크립트 불러오기, 지도 바로가기 URL): https://apis.map.kakao.com/web/guide/
- 카카오맵 시작하기 (JavaScript 키, 도메인 등록, 사용 설정): https://developers.kakao.com/docs/latest/ko/kakaomap/common
- 카카오맵 API 무료 쿼터 정책 변경 공지: https://devtalk.kakao.com/t/api-notice-on-new-kakao-map-api-features-and-free-quota-policy/150222
- 카카오 좌표→주소 응답 항목 (road_address, address): https://developers.kakao.com/docs/latest/ko/local/dev-guide
- 네이버 지도 API v3 Client ID 발급 (`ncpKeyId`): https://navermaps.github.io/maps.js.en/docs/tutorial-1-Getting-Client-ID.html
- 네이버 지도 Geocoder 사용법: https://navermaps.github.io/maps.js.en/docs/tutorial-Geocoder-Geocoding.html
- 네이버 클라우드 Maps Application 등록: https://guide.ncloud-docs.com/docs/application-maps-app-vpc
- 네이버 지도 URL Scheme: https://guide.ncloud-docs.com/docs/maps-url-scheme
- 네이버 지도 웹 좌표 주소 (포럼 답변): https://www.ncloud-forums.com/topic/242/
- Google Maps JavaScript API 불러오기: https://developers.google.com/maps/documentation/javascript/load-maps-js-api
- Google Maps URLs: https://developers.google.com/maps/documentation/urls/get-started
- Google Maps 2025년 3월 요금 변경: https://developers.google.com/maps/billing-and-pricing/march-2025
- Google Maps Demo Key: https://developers.google.com/maps/demo-key
- google.maps.Marker 지원 중단 예고 (이 앱은 대신 OverlayView 사용): https://developers.google.com/maps/deprecations

OpenStreetMap
- 타일 이용 정책: https://operations.osmfoundation.org/policies/tiles/
- 차단된 타일 (Referer 없을 때, file://): https://wiki.openstreetmap.org/wiki/Blocked_tiles
- Nominatim 이용 정책: https://operations.osmfoundation.org/policies/nominatim/

휴대폰 위치 정보와 사진 고르기
- WebKit 버그 254616 (iOS에서 사진을 많이 고르면 준비가 매우 느려짐): https://bugs.webkit.org/show_bug.cgi?id=254616
- WebKit 버그 172533 (사진을 많이 다루면 메모리 부족으로 페이지가 새로 열림): https://bugs.webkit.org/show_bug.cgi?id=172533
- WebKit 버그 303803 (accept에 HEIC가 있으면 다른 사진도 HEIC로 바꾸는 문제): https://bugs.webkit.org/show_bug.cgi?id=303803
- WebKit 버그 207088 (iOS 사진 업로드 시 EXIF 제거): https://bugs.webkit.org/show_bug.cgi?id=207088
- Apple 개발자 포럼 (사진 선택 화면의 옵션·위치): https://developer.apple.com/forums/thread/733292
- Apple 개발자 포럼 (iPadOS 17.4.1 이후 위치 유지 보고): https://developer.apple.com/forums/thread/773990
- Apple 지원 — iPhone에서 사진 공유 (옵션 → 위치): https://support.apple.com/en-om/guide/iphone/iphf28f17237/ios
- Android Authority — Photo Picker 위치 정보: https://www.androidauthority.com/android-photo-picker-location-3683074/
- HelenTech — Photo Picker 위치 설정 (2026년 8월 업데이트): https://helentech.jp/news-android-photo-picker-location-metadata-90295/

사진 정보 읽기
- ExifReader: https://github.com/mattiasw/ExifReader
- iPhone 17 HEIC에서 exifr가 GPS를 못 읽는 사례: https://dev.to/notoriouslab/rescuing-exif-gps-from-iphone-17-heic-in-a-browser-only-app-36lj

GitHub Pages
- 게시 소스 설정: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

보안
- OWASP XSS 방지 치트시트: https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html
- Google Maps JavaScript API CSP 가이드 (`https:`, `'unsafe-eval'`, `blob:` 예시): https://developers.google.com/maps/documentation/javascript/content-security-policy
- 카카오맵 리소스 도메인 추가(kakaocdn.net)와 CSP 안내: https://devtalk.kakao.com/t/csp/150541

## 라이선스

- ExifReader — Mozilla Public License 2.0 (`vendor/exifreader/LICENSE`)
- Leaflet — BSD 2-Clause (`vendor/leaflet/LICENSE`)
- 글꼴: Pretendard, Hahmlet — SIL Open Font License (CDN에서 불러와요. 못 불러오면 기기 글꼴을 써요)
