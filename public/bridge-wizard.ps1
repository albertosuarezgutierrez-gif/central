# ============================================================
# ia.rest · Bridge Wizard de impresoras
# ============================================================
# Escanea la red local en busca de impresoras ESC/POS (puerto 9100)
# y las registra automaticamente en ia.rest.
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File bridge-wizard.ps1 `
#     -Token "tu_token" -API "https://www.iarest.es"
# ============================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$Token,

    [string]$API = "https://www.iarest.es"
)

$ErrorActionPreference = "Stop"

# ── Colores ──────────────────────────────────────────────────
function Write-Header($msg) {
    Write-Host ""
    Write-Host "  $msg" -ForegroundColor White
    Write-Host "  $("-" * 50)" -ForegroundColor DarkGray
}

function Write-OK($msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-ERR($msg)  { Write-Host "  [ERR] $msg" -ForegroundColor Red }
function Write-INFO($msg) { Write-Host "  $msg" -ForegroundColor Gray }
function Write-WARN($msg) { Write-Host "  [!] $msg" -ForegroundColor Yellow }

# ── Banner ───────────────────────────────────────────────────
Clear-Host
Write-Host ""
Write-Host "  ██╗ █████╗       ██████╗ ███████╗███████╗████████╗" -ForegroundColor DarkRed
Write-Host "  ██║██╔══██╗      ██╔══██╗██╔════╝██╔════╝╚══██╔══╝" -ForegroundColor DarkRed
Write-Host "  ██║███████║      ██████╔╝█████╗  ███████╗   ██║   " -ForegroundColor Red
Write-Host "  ██║██╔══██║      ██╔══██╗██╔══╝  ╚════██║   ██║   " -ForegroundColor DarkRed
Write-Host "  ██║██║  ██║      ██║  ██║███████╗███████║   ██║   " -ForegroundColor DarkRed
Write-Host "  ╚═╝╚═╝  ╚═╝      ╚═╝  ╚═╝╚══════╝╚══════╝   ╚═╝   " -ForegroundColor DarkRed
Write-Host ""
Write-Host "  Wizard de configuracion de impresoras" -ForegroundColor White
Write-Host ""

# ── PASO 1: Verificar token ───────────────────────────────────
Write-Header "PASO 1 · Verificando conexion con ia.rest"

try {
    $body = @{ token = $Token } | ConvertTo-Json
    $resp = Invoke-RestMethod -Uri "$API/api/bridge/verify" `
        -Method POST `
        -Body $body `
        -ContentType "application/json" `
        -TimeoutSec 15
    Write-OK "Conectado · Restaurante: $($resp.nombre)"
    $restauranteNombre = $resp.nombre
} catch {
    Write-ERR "Token invalido o sin conexion a internet."
    Write-INFO "Comprueba el token en /owner → Config → Impresoras."
    Write-Host ""
    Read-Host "  Pulsa Enter para salir"
    exit 1
}

# ── PASO 2: Detectar subnet local ────────────────────────────
Write-Header "PASO 2 · Detectando red local"

try {
    $localIP = (Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
        Select-Object -First 1).IPAddress

    if (-not $localIP) {
        throw "No se encontro IP local"
    }

    $parts = $localIP.Split(".")
    $subnet = "$($parts[0]).$($parts[1]).$($parts[2])"

    Write-OK "IP de este ordenador: $localIP"
    Write-INFO "Escaneando subnet: $subnet.1 - $subnet.254"
} catch {
    Write-ERR "No se pudo detectar la red: $_"
    Read-Host "  Pulsa Enter para salir"
    exit 1
}

# ── PASO 3: Escanear puerto 9100 ──────────────────────────────
Write-Header "PASO 3 · Buscando impresoras en la red (puerto 9100)"
Write-INFO "Esto puede tardar hasta 30 segundos..."
Write-Host ""

$found = [System.Collections.ArrayList]@()
$total = 254
$completed = 0

# Escaneo paralelo con runspaces para mayor velocidad
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
            $tcp = New-Object System.Net.Sockets.TcpClient
            $conn = $tcp.BeginConnect($ip, $port, $null, $null)
            $wait = $conn.AsyncWaitHandle.WaitOne(400, $false)
            if ($wait -and $tcp.Connected) {
                $tcp.Close()
                return $ip
            }
            $tcp.Close()
        } catch { }
        return $null
    }).AddArgument($ip).AddArgument(9100)
    
    $jobs += @{
        ps     = $ps
        handle = $ps.BeginInvoke()
        ip     = $ip
    }
}

# Barra de progreso
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
    Write-Host ""
    Write-INFO "Posibles causas:"
    Write-INFO "  · La impresora esta apagada o no conectada al WiFi"
    Write-INFO "  · La impresora usa un puerto diferente al 9100"
    Write-INFO "  · La impresora esta en otra red"
    Write-Host ""
    
    $manual = Read-Host "  Introducir IP manualmente? (s/n)"
    if ($manual -eq "s" -or $manual -eq "S") {
        $ipManual = Read-Host "  IP de la impresora (ej: 192.168.1.100)"
        if ($ipManual -match "^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$") {
            [void]$found.Add($ipManual)
        } else {
            Write-ERR "IP no valida."
            Read-Host "  Pulsa Enter para salir"
            exit 1
        }
    } else {
        Write-INFO "Puedes anadir impresoras manualmente desde /owner → Hardware."
        Read-Host "  Pulsa Enter para salir"
        exit 0
    }
}

# ── PASO 4: Registrar impresoras ──────────────────────────────
Write-Header "PASO 4 · Configurar impresoras encontradas"
Write-INFO "Se encontraron $($found.Count) impresora(s)."
Write-Host ""

$registradas = 0
$saltadas    = 0

foreach ($ip in $found) {
    Write-Host "  ┌─ Impresora en $ip" -ForegroundColor Cyan
    Write-Host "  │" -ForegroundColor DarkGray

    $nombre = Read-Host "  │  Nombre (ej: Barra, Cocina caliente) · Enter para omitir"
    
    if ([string]::IsNullOrWhiteSpace($nombre)) {
        Write-Host "  └─ Omitida." -ForegroundColor DarkGray
        $saltadas++
        Write-Host ""
        continue
    }

    # Llamar a la API para registrar
    try {
        $regBody = @{
            ip_address      = $ip
            port            = 9100
            nombre          = $nombre.Trim()
            connection_type = "ip_local"
        } | ConvertTo-Json

        $regResp = Invoke-RestMethod `
            -Uri "$API/api/bridge/register-printer" `
            -Method POST `
            -Headers @{ "x-bridge-token" = $Token } `
            -Body $regBody `
            -ContentType "application/json" `
            -TimeoutSec 15

        Write-Host "  └─ " -NoNewline -ForegroundColor DarkGray
        Write-Host "Registrada OK: $nombre ($ip)" -ForegroundColor Green
        $registradas++
    } catch {
        $errMsg = $_.Exception.Message
        Write-Host "  └─ " -NoNewline -ForegroundColor DarkGray
        Write-Host "Error al registrar: $errMsg" -ForegroundColor Red
    }

    Write-Host ""
}

# ── Resumen ───────────────────────────────────────────────────
Write-Header "Configuracion completada"

if ($registradas -gt 0) {
    Write-OK "$registradas impresora(s) registrada(s) en ia.rest"
    Write-Host ""
    Write-INFO "Siguiente paso:"
    Write-INFO "  Ve a www.iarest.es/owner → Flujos de trabajo"
    Write-INFO "  y crea las reglas: SI seccion → ENTONCES impresora"
} else {
    Write-WARN "No se registro ninguna impresora."
    Write-INFO "Puedes anadirlas manualmente desde /owner → Hardware."
}

Write-Host ""
Write-Host "  Cerrando wizard..." -ForegroundColor DarkGray
Start-Sleep -Seconds 2
