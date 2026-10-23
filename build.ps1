# MakeHyperlink Local Build Script (Windows PowerShell)

$ErrorActionPreference = "Stop"
Push-Location (Join-Path $PSScriptRoot "src")

try {
    $version = (Get-Content manifest.json -Encoding UTF8 | ConvertFrom-Json).version
    $releaseDirectory = Join-Path $PSScriptRoot "release"
    New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null
    $zipName = Join-Path $releaseDirectory "makehyperlink-v$version.zip"

    Write-Host "MakeHyperlink 빌드를 시작합니다 (버전: $version)..." -ForegroundColor Cyan

    # 배포 파일 목록
    $files = @(
        "manifest.json",
        "background.js",
        "content.js",
        "sidepanel.html",
        "sidepanel.js",
        "history.js",
        "help.js",
        "settings.js",
        "i18n.js",
        "sidepanel.css",
        "icons"
    )

    # 압축 실행
    Compress-Archive -Path $files -DestinationPath $zipName -Force

    Write-Host "배포 파일이 생성되었습니다: $zipName" -ForegroundColor Green
    Write-Host "이제 이 파일을 Chrome 웹 스토어에 업로드할 수 있습니다."

} finally {
    Pop-Location
}
