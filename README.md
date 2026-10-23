# MakeHyperlink

선택한 텍스트 또는 탭 제목을 현재 페이지 주소와 연결된 하이퍼링크로 복사하는 브라우저 확장 프로그램입니다. 사이드 패널에서 복사한 링크를 다시 사용하고 관리할 수 있습니다.

현재 버전은 **2.1.3**이며, Chrome 114 이상의 Manifest V3·Side Panel API를 사용합니다. 다른 Chromium 계열 브라우저는 해당 API 지원 여부를 확인해야 합니다.

## 주요 기능

- **빠른 복사**: 기본 단축키 `Ctrl + Alt + C` 또는 우클릭의 **하이퍼링크 만들기**로 실행합니다.
- **탭 제목으로 복사**: 선택한 텍스트가 없으면 탭 제목을, 제목도 없으면 주소를 링크 이름으로 사용합니다.
- **기존 링크 복사**: 링크 우클릭의 **이 링크를 하이퍼링크로 복사**로 표시 텍스트와 실제 연결 주소를 복사합니다.
- **사용법 팝업**: 상단 `?` 버튼에서 복사 하기·목록 관리·단축키 설정·동작 확인을 확인합니다. 닫기 버튼이나 `Esc`로 닫습니다.
- **두 가지 클립보드 형식**: HTML 하이퍼링크와 Markdown 일반 텍스트를 함께 기록합니다. 붙여넣는 앱이 지원하는 형식을 사용합니다.
- **사이드 패널 히스토리**: 최근 100개를 로컬에 저장하며, 다시 복사·주소로 이동·개별 삭제·전체 삭제를 지원합니다. 같은 텍스트와 주소는 맨 위로 갱신됩니다.
- **간단한 결과 표시**: 초록색 `OK` 또는 빨간색 `ERR` 배지를 1초간 표시합니다.
- **컴팩트한 목록**: 제목과 주소를 두 줄로 표시하고, 목록만 스크롤합니다. 긴 내용은 마우스를 올려 확인할 수 있습니다.
- **하단 설정**: `목록 0 / 100`과 전체 삭제 버튼, 단축키 사용 스위치와 변경 아이콘을 제공합니다. 단축키 Off 시 실행과 변경을 차단합니다.

알림을 위해 웹페이지에 토스트나 스타일을 삽입하지 않으며, 복사 과정에서 입력창 값과 선택 영역을 옮기지 않습니다.

## 설치와 시작

[Chrome 웹 스토어에서 MakeHyperlink 설치하기](https://chromewebstore.google.com/detail/ehocahnpgninljhgpapiibodllnhchme?utm_source=item-share-cb)

설치 후 확장 아이콘을 누르면 사이드 패널이 열립니다. 일반 웹페이지에서 `Ctrl + Alt + C`로 링크를 복사하고 원하는 앱에 `Ctrl + V`로 붙여넣으세요. 자세한 사용법은 [유저 가이드](docs/user-guide.md)를 참고하세요.

## 지원 범위

`chrome://`, `whale://`, `chrome-extension://`, `whale-extension://` 등 브라우저 내부 화면·다른 확장 프로그램 화면 및 Chrome 웹 스토어에서는 페이지 단축키와 우클릭 복사를 사용할 수 없습니다. 예를 들어 `whale-extension://…/index.html`은 일반 웹사이트가 아닙니다.

단축키는 웹페이지에 포커스가 있을 때 동작합니다. 사이드 패널에서는 각 히스토리 항목의 **복사** 버튼을 사용하세요. 오류가 발생하면 [유저 가이드의 문제 해결](docs/user-guide.md#문제-해결)을 확인하세요.

## 문서

| 문서 | 내용 |
| --- | --- |
| [유저 가이드](docs/user-guide.md) | 설치, 복사, 단축키 설정, 히스토리 관리, 문제 해결 |
| [개발자 가이드](docs/developer-guide.md) | 개발 환경, 구조, 메시지, 저장 데이터, 테스트, 빌드와 배포 |

## 개발 시작

별도 패키지 설치나 번들링 없이 `src` 폴더를 확장 프로그램으로 로드합니다. 테스트에는 Node.js 24를 사용합니다.

```powershell
git clone https://github.com/destinycase/makehyperlink.git
cd makehyperlink
node --test tests/regression.test.cjs tests/history.test.cjs
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\build.ps1
```

빌드 결과는 `src/manifest.json` 버전을 기준으로 `release/makehyperlink-v<버전>.zip`에 생성됩니다. 배포 ZIP은 버전별로 `release/` 폴더에서 관리합니다. 자세한 구조와 배포 절차는 [개발자 가이드](docs/developer-guide.md)를 참고하세요.

## 라이선스

[MIT License](LICENSE)

```text
src/       # Extension source, manifest and icons
tests/     # Regression tests
docs/      # User and developer guides
release/   # Versioned distribution ZIPs
```
