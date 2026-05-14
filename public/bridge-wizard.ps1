# ============================================================
# ia.rest · Bridge Wizard de impresoras v3
# Auto-detecta y registra impresoras sin preguntar nada
# ============================================================
param(
    [Parameter(Mandatory=$true)]
    [string]$Token,
    [string]$API = "https://www.iarest.es"
)

$ErrorActionPreference = "Stop"

function Write-Header($msg) {
    Write-Host ""
    Write-Host "  $msg" -ForegroundColor White
    Write-Host "  $("-" * 50)" -ForegroundColor DarkGray
}
function Write-OK($msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-ERR($msg)  { Write-Host "  [ERR] $msg" -ForegroundColor Red }
function Write-INFO($msg) { Write-Host "  $msg" -ForegroundColor Gray }
function Write-WARN($msg) { Write-Host "  [!] $msg" -ForegroundColor Yellow }

Clear-Host
Write-Host ""
Write-Host "  ia.rest · Configuracion de impresoras" -ForegroundColor White
Write-Host "  $("=" * 50)" -ForegroundColor DarkRed
Write-Host ""

# ── PASO 1: Verificar token ───────────────────────────────────
Write-Header "PASO 1 · Verificando conexion con ia.rest"

try {
    $body = @{ token = $Token } | ConvertTo-Json
    $resp = Invoke-RestMethod -Uri "$API/api/bridge/verify" `
        -Method POST -Body $body -ContentType "application/json" -TimeoutSec 15
    Write-OK "Conectado · Restaurante: $($resp.nombre)"
} catch {
    Write-ERR "Token invalido o sin conexion a internet."
    Read-Host "  Pulsa Enter para salir"
    exit 1
}

# ── PASO 2: Detectar subnet ───────────────────────────────────
Write-Header "PASO 2 · Detectando red local"

try {
    $localIP = (Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
        Select-Object -First 1).IPAddress
    if (-not $localIP) { throw "No se encontro IP local" }
    $parts  = $localIP.Split(".")
    $subnet = "$($parts[0]).$($parts[1]).$($parts[2])"
    Write-OK "Red detectada: $subnet.0/24"
} catch {
    Write-ERR "No se pudo detectar la red: $_"
    Read-Host "  Pulsa Enter para salir"
    exit 1
}

# ── PASO 3: Escanear puerto 9100 ──────────────────────────────
Write-Header "PASO 3 · Buscando impresoras (puerto 9100)"
Write-INFO "Escaneando red... (30 segundos aprox.)"
Write-Host ""

$found    = [System.Collections.ArrayList]@()
$total    = 254
$completed = 0

$pool = [RunspaceFactory]::CreateRunspacePool(1, 50)
$pool.Open()
$jobs = @()

1..254 | ForEach-Object {
    $ip = "$subnet.$_"
    $ps = [PowerShell]::Create()
    $ps.RunspacePool = $pool
    [void]$ps.AddScript({
        param($ip, $port)
        try {
            $tcp  = New-Object System.Net.Sockets.TcpClient
            $conn = $tcp.BeginConnect($ip, $port, $null, $null)
            $wait = $conn.AsyncWaitHandle.WaitOne(400, $false)
            if ($wait -and $tcp.Connected) { $tcp.Close(); return $ip }
            $tcp.Close()
        } catch { }
        return $null
    }).AddArgument($ip).AddArgument(9100)
    $jobs += @{ ps = $ps; handle = $ps.BeginInvoke() }
}

foreach ($job in $jobs) {
    $result = $job.ps.EndInvoke($job.handle)
    $job.ps.Dispose()
    $completed++
    $pct = [int](($completed / $total) * 100)
    Write-Progress -Activity "Escaneando red..." -Status "$pct% completado" -PercentComplete $pct
    if ($result) {
        [void]$found.Add($result)
        Write-OK "Impresora encontrada: $result"
    }
}
$pool.Close()
Write-Progress -Activity "Escaneando red..." -Completed
Write-Host ""

if ($found.Count -eq 0) {
    Write-WARN "No se encontraron impresoras en la red."
    Write-INFO "Posibles causas:"
    Write-INFO "  · Impresora apagada o en otra red WiFi"
    Write-INFO "  · Puerto diferente al 9100"
    Write-Host ""
    $manual = Read-Host "  Introducir IP manualmente? (s/n)"
    if ($manual -eq "s" -or $manual -eq "S") {
        $ipManual = Read-Host "  IP de la impresora (ej: 192.168.1.100)"
        if ($ipManual -match "^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$") {
            [void]$found.Add($ipManual)
        } else {
            Write-ERR "IP no valida."
            Read-Host "  Pulsa Enter para salir"; exit 1
        }
    } else {
        Write-INFO "Puedes añadir impresoras manualmente desde /owner -> Hardware."
        Read-Host "  Pulsa Enter para salir"; exit 0
    }
}

# ── PASO 4: Registrar automaticamente ────────────────────────
Write-Header "PASO 4 · Registrando impresoras"
Write-INFO "$($found.Count) impresora(s) encontrada(s) — registrando automaticamente..."
Write-Host ""

$registradas  = [System.Collections.ArrayList]@()
$contador     = 1

foreach ($ip in $found) {
    $nombre = "Impresora $contador"
    Write-INFO "  Registrando $nombre ($ip)..."

    try {
        $regBody = @{
            ip_address      = $ip
            port            = 9100
            nombre          = $nombre
            connection_type = "ip_local"
        } | ConvertTo-Json

        $regResp = Invoke-RestMethod `
            -Uri "$API/api/bridge/register-printer" `
            -Method POST `
            -Headers @{ "x-bridge-token" = $Token } `
            -Body $regBody `
            -ContentType "application/json" `
            -TimeoutSec 15

        Write-OK "$nombre registrada (ID: $($regResp.id.Substring(0,8))...)"
        [void]$registradas.Add(@{ id = $regResp.id; nombre = $nombre; ip = $ip })
        $contador++
    } catch {
        Write-ERR "Error registrando $ip`: $($_.Exception.Message)"
    }
}

# ── PASO 5: Test print en cada una ───────────────────────────
if ($registradas.Count -gt 0) {
    Write-Header "PASO 5 · Enviando ticket de prueba"
    foreach ($imp in $registradas) {
        Write-INFO "  Test a $($imp.nombre) ($($imp.ip))..."
        try {
            Invoke-RestMethod `
                -Uri "$API/api/print" `
                -Method POST `
                -Body (@{ trigger = "test"; impresora_id = $imp.id } | ConvertTo-Json) `
                -ContentType "application/json" `
                -TimeoutSec 10 | Out-Null
            Write-OK "Ticket enviado a $($imp.nombre)"
        } catch {
            Write-WARN "Sin respuesta de $($imp.nombre) — comprueba que esta encendida"
        }
        Start-Sleep -Milliseconds 500
    }
}

# ── Abrir panel de configuracion ─────────────────────────────
Write-Header "Configuracion completada"
Write-OK "$($registradas.Count) impresora(s) registrada(s) como Impresora 1, 2, 3..."
Write-Host ""
Write-INFO "Abriendo panel de ia.rest..."
Write-INFO "Ahi podras:"
Write-INFO "  · Pulsar TEST para saber cual es cual"
Write-INFO "  · Cambiar el nombre si quieres"
Write-INFO "  · Crear los flujos de trabajo"
Write-Host ""

Start-Process "$API/owner?setup=1"

Write-Host "  Esta ventana se cerrara en 5 segundos." -ForegroundColor DarkGray
Start-Sleep -Seconds 5
