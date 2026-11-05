param(
  [ValidateSet('dev','build','check','test','fmt','fmt-check')][string]$Mode = 'dev',
  [switch]$SystemToolchain
)
. (Join-Path $PSScriptRoot 'env.ps1') -SystemToolchain:$SystemToolchain
Set-Location -LiteralPath $projectRoot
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) { throw 'Rust was not found. Install Rust stable (MSVC) from https://rustup.rs and reopen the terminal.' }
switch ($Mode) {
  'dev' { & npm.cmd exec -- tauri dev }
  'build' { & npm.cmd exec -- tauri build }
  'check' { & cargo check --manifest-path src-tauri/Cargo.toml --locked }
  'test' { & cargo test --manifest-path src-tauri/Cargo.toml --locked }
  'fmt' { & cargo fmt --manifest-path src-tauri/Cargo.toml }
  'fmt-check' { & cargo fmt --manifest-path src-tauri/Cargo.toml -- --check }
}
exit $LASTEXITCODE
