# MakeHyperlink Local Build Script (Windows PowerShell)

$version = (Get-Content manifest.json | ConvertFrom-Json).version
$zipName = "makehyperlink-v$version.zip"

Write-Host "MakeHyperlink 빌드를 시작합니다 (버전: $version)..." -ForegroundColor Cyan

# 기존 압축 파일 제거
if (Test-Path $zipName) { Remove-Item $zipName }

# 배포 파일 목록
$files = @(
    "manifest.json",
    "background.js",
    "content.js",
    "style.css",
    "popup.html",
    "popup.js",
    "popup.css",
    "icons"
)

# 압축 실행
Compress-Archive -Path $files -DestinationPath $zipName -Force

Write-Host "배포 파일이 생성되었습니다: $zipName" -ForegroundColor Green
Write-Host "이제 이 파일을 Chrome 웹 스토어에 업로드할 수 있습니다."
