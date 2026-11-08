# MakeHyperlink Local Build Script (Windows PowerShell)

$ErrorActionPreference = "Stop"
Push-Location (Join-Path $PSScriptRoot "src")

try {
    $version = (Get-Content manifest.json -Encoding UTF8 | ConvertFrom-Json).version
    $releaseDirectory = Join-Path $PSScriptRoot "release"
    New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null
    $zipName = Join-Path $releaseDirectory "makehyperlink-v$version.zip"

    Write-Host "MakeHyperlink 빌드를 시작합니다 (버전: $version)..." -ForegroundColor Cyan

    # 기존 압축 파일이 있다면 삭제
    if (Test-Path $zipName) {
        Remove-Item $zipName -Force
    }

    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem

    # 배포 대상 파일 및 폴더 목록
    $targets = @(
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

    $zip = [System.IO.Compression.ZipFile]::Open($zipName, [System.IO.Compression.ZipArchiveMode]::Create)

    try {
        foreach ($target in $targets) {
            if (Test-Path -Path $target -PathType Container) {
                # 디렉터리 내부 파일들을 표준 슬래시(/) 경로로 추가 (웨일 스토어 호환성)
                Get-ChildItem -Path $target -Recurse -File | ForEach-Object {
                    $relativePath = (Resolve-Path -Path $_.FullName -Relative) -replace '^\.\\', '' -replace '\\', '/'
                    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $relativePath, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
                }
            } else {
                # 일반 파일 추가
                [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Resolve-Path $target), $target, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
            }
        }
    } finally {
        $zip.Dispose()
    }

    Write-Host "배포 파일이 생성되었습니다: $zipName" -ForegroundColor Green
    Write-Host "이제 이 파일을 Chrome 웹 스토어 및 웨일 스토어에 업로드할 수 있습니다."

} finally {
    Pop-Location
}
