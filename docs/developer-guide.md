# 개발자 가이드

[README로 돌아가기](../README.md) · [유저 가이드](user-guide.md)

현재 코드와 배포 버전 **2.1.5**를 기준으로 설명합니다.

## 개발 환경

- Chrome 114 이상: Manifest V3 및 `chrome.sidePanel` 사용
- Node.js 24: 내장 `node:test`, `assert`, `vm`으로 테스트 실행
- Git: 소스와 릴리스 태그 관리
- Windows PowerShell: 로컬 ZIP 빌드 스크립트 실행

`package.json`, 외부 npm 의존성, 번들러는 없습니다. `npm install` 없이 작업합니다.

```powershell
git clone https://github.com/destinycase/makehyperlink.git
cd makehyperlink
```

이 작업 환경의 저장소 위치는 `D:\Project\makehyperlink`입니다. Chrome 확장 프로그램 관리 화면에서 저장소의 `src` 폴더를 압축 해제된 확장 프로그램으로 로드합니다.

## 파일 구조

| 파일 | 역할 |
| --- | --- |
| `src/manifest.json` | 버전, 권한, 서비스 워커, 콘텐츠 스크립트, 사이드 패널 등록 |
| `src/background.js` | 메뉴, 배지, 히스토리 저장 큐, 동적 주입, 메시지 처리 |
| `src/content.js` | 선택 텍스트 읽기, 제목 대체, HTML·텍스트 복사, 페이지 단축키 처리 |
| `src/sidepanel.html` / `src/sidepanel.css` | 브라우저 패널 화면과 컴팩트한 목록 레이아웃 |
| `src/sidepanel.js` | 단축키 녹화·저장, 활성화 스위치, 설정 변경 반영 |
| `src/history.js` | 목록 렌더링, 링크 이동, 다시 복사, 삭제, 실시간 갱신 |
| `src/help.js` | 사용법 모달 열기·닫기와 닫힌 뒤 포커스 복원 |
| `src/settings.js` / `src/i18n.js` | 설정 모달, 영어·한국어 선택과 저장, 패널 번역 |
| `tests/regression.test.cjs` | 콘텐츠·백그라운드·설정 회귀 테스트 |
| `tests/history.test.cjs` | 히스토리 UI, 복사 형식, 목록 갱신·스크롤 테스트 |
| `build.ps1` | 배포용 ZIP 생성 |
| `release/` | 버전별 배포 ZIP 보관 |
| `.github/workflows/release.yml` | `v*` 태그 푸시 시 테스트·패키징·GitHub Release 생성 |
| `src/icons/` | 16·48·128px 아이콘 |

## 주요 동작

### 페이지에서 복사

1. `src/content.js`가 각 프레임의 캡처 단계에서 `keydown`을 감지합니다.
2. 저장된 활성화 상태, 키 코드, modifier 조합과 비교합니다. 반복 입력은 무시합니다.
3. 활성 입력창·텍스트 영역의 선택을 우선 읽고, 그 외에는 `window.getSelection()`을 사용합니다. 입력창 내부 선택이 비었다고 이전 페이지 선택을 사용하지 않습니다.
4. 텍스트가 없으면 `GET_TAB_DETAILS`로 최상위 탭 제목·주소를 조회합니다. 조회가 실패하면 문서 제목·주소로 대체하며, 제목도 없으면 URL을 링크 이름으로 사용합니다.
5. `navigator.clipboard.write()`로 `text/html`과 `text/plain`을 함께 기록합니다.
6. 실패하면 `copy` 이벤트에 두 MIME 형식을 직접 넣는 `execCommand('copy')` 경로를 시도합니다. 임시 편집 요소를 만들거나 선택 영역을 옮기지 않습니다.
7. 성공한 텍스트·URL을 `COPY_RESULT`로 보내 배지와 히스토리를 갱신합니다.

HTML 텍스트와 URL 속성은 이스케이프합니다. 일반 텍스트 형식은 `[텍스트](URL)`입니다. 편집기에 따라 일반 텍스트를 우선 사용하므로 Markdown 문자열이 붙는 것 자체는 실패가 아닙니다.

### 우클릭에서 복사

서비스 워커는 메뉴 이벤트가 발생한 프레임에 `PING`을 보냅니다. 응답이 없으면 그 프레임에만 `src/content.js`를 주입하고 `COPY_LINK`를 전달합니다. 메뉴 이벤트의 선택 텍스트와 페이지 주소를 전달해, 다른 프레임의 오래된 선택 영역을 사용하지 않도록 합니다.

탭 주소가 누락되면 `info.pageUrl`로 제한 여부를 판정합니다. 주소를 알 수 없는 경우와 브라우저 제한 페이지는 다른 오류로 처리합니다. 설치·업데이트 시에도 접근 가능한 기존 탭에 스크립트를 주입합니다.

### 사이드 패널

`side_panel.default_path`와 `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`를 사용합니다. `action.default_popup`은 등록하지 않습니다. 페이지 DOM에 패널을 삽입하지 않으며, 좌우 위치는 브라우저 설정을 따릅니다.

패널의 복사 버튼은 패널 문서의 클립보드 API를 사용합니다. 이후 패널이 속한 `windowId`를 함께 보내 해당 창의 활성 탭에 배지를 표시합니다. `chrome.storage.onChanged`로 여러 탭·패널의 기록과 설정 변경을 반영합니다.

사용법은 `sidepanel.html`의 네이티브 `<dialog>`와 `help.js`로 구성합니다. `showModal()`을 사용해 배경 상호작용과 포커스를 제한하고 브라우저의 Esc 닫기를 지원합니다. 닫힌 뒤 도움말 버튼에 포커스를 복원합니다. 팝업 콘텐츠는 복사 하기·목록 관리·단축키 설정·동작 확인으로 구분하며 웹페이지 DOM에 접근하지 않습니다. 로컬 빌드와 Actions ZIP 모두 `help.js`를 포함합니다.

목록 갱신 시 `scrollTop`을 복원하고, 제목·URL·시간을 줄여 표시합니다. 전체 문자열은 `title` 속성으로 제공합니다. 외부 입력은 `textContent`로 렌더링하며, 주소 링크에는 `noopener noreferrer`를 설정합니다.

타일 표시 이름은 `UPDATE_HISTORY_TEXT`로 저장합니다. 패널 전용 요청이며 빈 문자열과 삭제된 ID를 거부합니다. 저장 큐에서 해당 ID의 `text`만 바꾸므로 `id`·`url`·`copiedAt`·배열 위치는 유지합니다. `history.js`의 ID별 편집 상태 Map으로 목록 갱신 중 초안을 보존합니다. 확인/Enter로 저장하고 취소/Esc로 편집을 종료하며 IME 조합 중 Enter는 저장하지 않습니다.

패널에서 보낸 `COPY_RESULT`는 배지만 갱신하고 기록을 새로 저장하지 않습니다. 따라서 이름 수정 후 재복사해도 시간·순서가 바뀌지 않으며, 복사 도중 삭제된 항목이 되살아나지 않습니다. 페이지에서 새로 복사한 항목의 저장·중복 갱신 동작은 유지합니다. 타일은 20px 액션 버튼을 포함한 첫 줄과 주소·시간을 포함한 둘째 줄의 높이를 맞춥니다.

## 메시지

| action | 요청 방향 | 처리 |
| --- | --- | --- |
| `PING` | 백그라운드 → 콘텐츠 | 스크립트 생존 확인, `ALIVE` 응답 |
| `COPY_LINK` | 백그라운드 → 콘텐츠 | 선택 스냅샷 또는 제목으로 복사, `SUCCESS`와 `item` 또는 `ERROR` 응답 |
| `COPY_EXISTING_LINK` | 백그라운드 → 콘텐츠 | 우클릭한 링크의 표시 텍스트와 목적 주소 복사 |
| `GET_TAB_DETAILS` | 콘텐츠 → 백그라운드 | `sender.tab`의 제목·URL 반환 |
| `COPY_RESULT` | 콘텐츠·패널 → 백그라운드 | 성공 시 히스토리 저장, 성공·실패 배지 표시 |
| `DELETE_HISTORY` | 패널 → 백그라운드 | ID가 있으면 개별 삭제, 없으면 전체 삭제 |
| `UPDATE_HISTORY_TEXT` | 패널 → 백그라운드 | ID에 해당하는 표시 텍스트만 수정, 시간·순서 유지 |

패널 전용 작업은 `sender.url`이 `chrome.runtime.getURL('sidepanel.html')`과 같은지 확인합니다. 콘텐츠 결과의 탭은 요청 본문의 임의 ID 대신 `sender.tab`을 사용합니다.

## 로컬 저장 데이터

`chrome.storage.local`을 사용하며, 서버나 `storage.sync`로 히스토리를 보내지 않습니다.

| 키 | 구조·기본값 |
| --- | --- |
| `enabled` | boolean, 미설정 시 `true` |
| `language` | `en` 또는 `ko`, 미설정·지원하지 않는 값은 `en` |
| `shortcut` | `code`, `display`, `ctrlKey`, `altKey`, `shiftKey`, `metaKey`; 기본 `Ctrl + Alt + C` |
| `history` | 최신순 항목 배열, 미설정 시 빈 배열 |

```json
{
  "id": "UUID",
  "text": "프로젝트 문서",
  "url": "https://example.com/docs",
  "copiedAt": 1792710000000
}
```

히스토리는 성공한 복사만 저장하며 `http:`, `https:`, `file:`, `ftp:` 주소를 허용합니다. 같은 `text`·`url` 조합은 새 항목으로 갱신해 맨 위에 배치하고 최근 100개만 유지합니다. 저장·삭제는 서비스 워커의 Promise 큐로 직렬화해 동시 요청으로 기록이 덮어써지는 것을 줄입니다.

클립보드 쓰기와 저장 성공은 별개입니다. 저장 실패가 복사 성공을 실패로 바꾸지는 않으며 배지 툴팁에 저장 실패 설명을 전달합니다.

## 권한과 제한

| 권한 | 사용 목적 |
| --- | --- |
| `clipboardWrite` | HTML·일반 텍스트 클립보드 기록 |
| `contextMenus` | 우클릭 메뉴 생성 |
| `storage` | 설정·히스토리 로컬 저장 |
| `sidePanel` | 브라우저 사이드 패널 |
| `scripting` | 기존 탭·대상 프레임에 콘텐츠 스크립트 복구 |
| `<all_urls>` 호스트 권한 | 접근 가능한 웹페이지에 콘텐츠 스크립트 실행 |

`activeTab`은 요청하지 않습니다. 현재 구현은 `<all_urls>` 호스트 권한으로 허용된 페이지의 탭 제목·주소를 읽고, `scripting`과 호스트 권한으로 콘텐츠 스크립트를 주입합니다. `tabs.query()`로 탭 ID를 조회하거나 `tabs.sendMessage()`로 통신하는 데 별도의 `activeTab` 권한은 필요하지 않습니다. 사용자가 사이트 접근 권한을 제한한 경우에는 허용 범위 안에서만 동작합니다.

권한을 변경할 때는 [Chrome Tabs API의 권한 설명](https://developer.chrome.com/docs/extensions/reference/api/tabs#permissions)과 [Scripting API의 권한 설명](https://developer.chrome.com/docs/extensions/reference/api/scripting#manifest)을 기준으로 실제 API 사용을 확인합니다.

`<all_urls>`는 브라우저 내부 화면이나 다른 확장 프로그램 화면의 보호를 해제하지 않습니다. `whale-extension://…`에서도 스크립트를 실행할 수 없습니다. 해당 제한을 제거하는 보안 설정 변경을 해결책으로 사용하지 않습니다.

기본 단축키는 `chrome.commands`가 아닌 페이지 `keydown`으로 처리합니다. 따라서 페이지가 포커스를 가져야 하고 브라우저·운영체제가 선점한 키 입력은 받을 수 없습니다.

## 테스트 및 수동 검증

저장소 루트에서 실행합니다.

```powershell
node --test tests/*.test.cjs
node --check src/background.js
node --check src/content.js
node --check src/sidepanel.js
node --check src/history.js
```

현재 회귀 테스트는 44개입니다. 테스트는 Chrome API·문서·클립보드를 모의한 단위·흐름 검증이며 실제 브라우저에서의 모든 포커스·권한·편집기 동작을 보장하지 않습니다.

변경한 확장 프로그램을 새로고침하고 다음 항목을 실제 브라우저에서 확인합니다.

- 일반 페이지, 입력창, iframe의 선택 텍스트 복사 및 선택 없는 제목 복사
- HTML 서식과 일반 텍스트 붙여넣기
- `OK`·`ERR` 배지와 마지막 결과로부터 1초 뒤 초기화
- 패널의 실시간 기록 갱신, 링크 이동, 다시 복사, 개별·전체 삭제
- 긴 텍스트, 좁은 패널, 스크롤 중 기록 갱신
- 기존 탭에서 확장 프로그램을 새로고침한 후 복사
- 브라우저 내부·다른 확장 프로그램 페이지에서 제한 안내
- 편집 영역에 알림 문자열이 들어가지 않고 입력값·선택 영역이 유지되는지 확인

## 빌드와 배포

### 로컬 ZIP

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\build.ps1
```

`src/manifest.json`의 버전으로 `release/makehyperlink-v<버전>.zip`을 생성합니다. `release/` 폴더가 없으면 자동으로 생성하고, 같은 이름의 ZIP이 있으면 교체합니다. 이전 버전의 ZIP은 그대로 보관합니다. ZIP 루트에는 manifest·background·content·sidepanel·history·help 파일과 `icons/`만 포함하며, 문서·테스트·Git 데이터는 포함하지 않습니다. GitHub Actions도 `release/`에 ZIP을 생성해 Release에 첨부합니다.

### GitHub Release

1. `src/manifest.json` 버전을 올리고 필요한 README·가이드·릴리스 설명을 수정합니다.
2. 테스트와 수동 확인을 수행하고 ZIP을 빌드·점검합니다.
3. 변경을 커밋해 `main`에 푸시합니다. 커밋 작성자와 GitHub 인증이 설정돼 있어야 합니다.
4. manifest 버전과 같은 `v<버전>` 태그를 만들어 푸시합니다.
5. GitHub Actions의 **Release MakeHyperlink** 성공과 Release의 ZIP 첨부를 확인합니다.

```powershell
$releaseVersion = (Get-Content src/manifest.json -Raw -Encoding UTF8 | ConvertFrom-Json).version
git push origin main
git tag -a "v$releaseVersion" -m "Release v$releaseVersion"
git push origin "v$releaseVersion"
```

이미 공개한 버전 태그를 새 커밋으로 옮기지 말고 다음 버전을 사용합니다. 기본 자동 배포는 `v*` 태그 푸시에 반응하며, `main` 푸시만으로 릴리스를 만들지 않습니다. 로컬 Git 인증 대신 GitHub 앱으로 배포하는 경우에는 해당 버전 전용 `release/v<버전>` 브랜치의 일회성 작업으로 검증된 커밋의 태그·Release를 생성합니다. 이 작업은 `main`의 배포 트리거를 변경하지 않습니다.

GitHub Release와 Chrome·Whale 웹 스토어 게시는 별개입니다. 스토어는 해당 개발자 대시보드에서 ZIP과 등록 정보를 제출하고 검토 결과를 확인해야 합니다. 이 저장소의 Actions는 스토어 제출까지 수행하지 않습니다.
