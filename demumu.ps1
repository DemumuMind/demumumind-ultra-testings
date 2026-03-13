$ErrorActionPreference = "Stop"

$ScriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$CliEntry = Join-Path $ScriptDirectory "apps\cli\dist\index.js"

node $CliEntry @args
