# MakeHyperlink 배포 가이드

이 문서는 MakeHyperlink 확장 프로그램을 패키징하고 배포하는 절차를 설명합니다.

## 1. 배포 전 체크리스트
- [ ] `manifest.json`의 `version`이 업데이트되었는지 확인합니다.
- [ ] `icons/` 폴더에 모든 크기(16, 48, 128)의 아이콘이 포함되어 있는지 확인합니다.
- [ ] 불필요한 로그(`console.log`)가 제거되었는지 확인합니다.

## 2. 수동 패키징 방법 (ZIP 생성)
배포를 위해서는 프로젝트 폴더 내의 핵심 파일들만 압축해야 합니다.

### 포함해야 할 파일/폴더:
- `manifest.json`
- `background.js`
- `content.js`
- `style.css`
- `popup.html`, `popup.js`, `popup.css`
- `icons/` 폴더 전체

### 제외해야 할 파일 (보안 및 용량 이슈):
- `.git/` 및 `.gitignore`
- `README.md`, `LICENSE`, `DEPLOYMENT.md`
- 각종 빌드 스크립트 및 테스트 파일

## 3. GitHub Actions 자동 배포 (권장)
본 프로젝트에는 GitHub Actions가 설정되어 있습니다. 다음 명령어로 새 버전을 배포할 수 있습니다.

```bash
# 1. 태그 생성 (예: v1.1)
git tag v1.1

# 2. 태그 푸시
git push origin v1.1
```
푸시가 완료되면 GitHub 저장소의 **Releases** 탭에 자동으로 배포용 ZIP 파일이 생성됩니다.

## 4. Chrome 웹 스토어 업로드
1. [Chrome 개발자 대시보드](https://chrome.google.com/webstore/devconsole/)에 접속합니다.
2. '새 항목 추가'를 클릭합니다.
3. 생성된 `makehyperlink-vX.X.zip` 파일을 업로드합니다.
4. 설명, 스크린샷 등 스토어 정보를 입력하고 '검토를 위해 제출'을 클릭합니다.

---
© 2024 MakeHyperlink Deployment System.
