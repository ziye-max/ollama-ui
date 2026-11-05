param([switch]$SystemToolchain)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$portableCargo = Join-Path $projectRoot '.tools\cargo'
$portableRustup = Join-Path $projectRoot '.tools\rustup'
$usePortableRust = -not $SystemToolchain -and (Test-Path -LiteralPath (Join-Path $portableCargo 'bin\cargo.exe')) -and (Test-Path -LiteralPath $portableRustup)
if ($usePortableRust) {
  $env:CARGO_HOME = $portableCargo
  $env:RUSTUP_HOME = $portableRustup
  $env:PATH = (Join-Path $portableCargo 'bin') + ';' + $env:PATH
}
$env:CARGO_TARGET_DIR = Join-Path $projectRoot 'src-tauri\target'
$env:TEMP = Join-Path $projectRoot '.cache\tmp'
$env:TMP = $env:TEMP
$env:npm_config_cache = Join-Path $projectRoot '.cache\npm'
$env:TAURI_BUNDLER_CACHE_DIR = Join-Path $projectRoot '.cache\tauri-bundler'
if (-not $env:LOCAL_OLLAMA_DATA_DIR) {
  $env:LOCAL_OLLAMA_DATA_DIR = Join-Path $projectRoot '.cache\app-data'
}
$env:RUSTFLAGS = (($env:RUSTFLAGS + ' -C target-feature=+crt-static').Trim())
if ($usePortableRust) {
  $env:LOCALAPPDATA = Join-Path $projectRoot '.cache\local-app-data'
  $env:APPDATA = Join-Path $projectRoot '.cache\roaming-app-data'
}
foreach ($directory in @($env:TEMP, $env:TAURI_BUNDLER_CACHE_DIR, $env:LOCAL_OLLAMA_DATA_DIR)) {
  New-Item -ItemType Directory -Force -Path $directory | Out-Null
}
$msvcRoot = Join-Path $projectRoot '.tools\msvc'
$sdkRoot = Join-Path $msvcRoot 'Windows Kits\10'
if (-not $SystemToolchain -and (Test-Path -LiteralPath $msvcRoot)) {
  $compiler = Get-ChildItem -LiteralPath (Join-Path $msvcRoot 'VC\Tools\MSVC') -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
  $sdk = Get-ChildItem -LiteralPath (Join-Path $sdkRoot 'Lib') -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
} else {
  $compiler = $null
  $sdk = $null
}
if ($compiler -and $sdk) {
  $compilerBin = Join-Path $compiler.FullName 'bin\Hostx64\x64'
  $sdkBin = Join-Path $sdkRoot ('bin\' + $sdk.Name + '\x64')
  $env:PATH = $compilerBin + ';' + $sdkBin + ';' + $env:PATH
  $env:VSCMD_ARG_HOST_ARCH = 'x64'
  $env:VSCMD_ARG_TGT_ARCH = 'x64'
  $env:VisualStudioVersion = '17.0'
  $env:VCToolsInstallDir = $compiler.FullName + '\'
  $env:VCToolsVersion = $compiler.Name
  $env:WindowsSdkDir = $sdkRoot + '\'
  $env:WindowsSDKVersion = $sdk.Name + '\'
  $env:WindowsSdkBinPath = (Join-Path $sdkRoot 'bin') + '\'
  $env:INCLUDE = (Join-Path $compiler.FullName 'include') + ';' + ((@('ucrt','shared','um','winrt','cppwinrt') | ForEach-Object { Join-Path $sdkRoot ('Include\' + $sdk.Name + '\' + $_) }) -join ';')
  $env:LIB = (Join-Path $compiler.FullName 'lib\x64') + ';' + (Join-Path $sdk.FullName 'ucrt\x64') + ';' + (Join-Path $sdk.FullName 'um\x64')
  $env:CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER = Join-Path $compilerBin 'link.exe'
  $env:CC_x86_64_pc_windows_msvc = Join-Path $compilerBin 'cl.exe'
  $env:AR_x86_64_pc_windows_msvc = Join-Path $compilerBin 'lib.exe'
}
