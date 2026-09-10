param(
    [string]$DatabaseUrl = $env:SUPABASE_DB_URL,
    [string]$OutputDir = ".\backups"
)

if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
    Write-Error "SUPABASE_DB_URL manquant. Exemple: `$env:SUPABASE_DB_URL='postgresql://...'"
    exit 1
}

$pgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
if (-not $pgDump) {
    Write-Error "pg_dump introuvable. Installe PostgreSQL tools ou lance ce script depuis un environnement qui contient pg_dump."
    exit 1
}

$resolvedOutput = Resolve-Path -Path $OutputDir -ErrorAction SilentlyContinue
if (-not $resolvedOutput) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
    $resolvedOutput = Resolve-Path -Path $OutputDir
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$dumpFile = Join-Path $resolvedOutput "titan-supabase-$stamp.dump"
$schemaFile = Join-Path $resolvedOutput "titan-supabase-schema-$stamp.sql"

Write-Host "Backup complet vers $dumpFile"
& $pgDump.Source --format=custom --no-owner --no-privileges --file=$dumpFile $DatabaseUrl
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Backup schema vers $schemaFile"
& $pgDump.Source --schema-only --no-owner --no-privileges --file=$schemaFile $DatabaseUrl
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "OK backup cree:"
Write-Host $dumpFile
Write-Host $schemaFile
