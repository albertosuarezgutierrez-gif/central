# ia.rest - Bridge Wizard v5
param(
    [Parameter(Mandatory=$true)][string]$Token,
    [string]$API = "https://www.iarest.es"
)
$ErrorActionPreference = "SilentlyContinue"

function Write-Header($msg) {
    Write-Host ""
    Write-Host "  $msg" -ForegroundColor White
    Write-Host "  --------------------------------------------------" -ForegroundColor DarkGray
}
function Write-OK($msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-ERR($msg)  { Write-Host "  [ERR] $msg" -ForegroundColor Red }
function Write-INFO($msg) { Write-Host "  $msg" -ForegroundColor Gray }
function Write-WARN($msg) { Write-Host "  [!] $msg" -ForegroundColor Yellow }

function Get-MacAddress($ip) {
    try {
        $null = Test-Connection -ComputerName $ip -Count 1 -Quiet -TimeoutSeconds 1
        $arp = arp -a $ip 2>$null
        $match = [regex]::Match($arp, '([0-9a-fA-F]{2}[:\-][0-9a-fA-F]{2}[:\-][0-9a-fA-F]{2}[:\-][0-9a-fA-F]{2}[:\-][0-9a-fA-F]{2}[:\-][0-9a-fA-F]{2})')
        if ($match.Success) { return $match.Value.Replace('-',':').ToLower() }
    } catch {}
    return $null
}

Clear-Host
Write-Host ""
Write-Host "  ia.rest - Configuracion de impresoras" -ForegroundColor White
Write-Host "  ==================================================" -ForegroundColor DarkRed
Write-Host ""

Write-Header "PASO 1 - Verificando conexion"
try {
    $resp = Invoke-RestMethod -Uri "$API/api/bridge/verify" -Method POST `
        -Body (@{token=$Token}|ConvertTo-Json) -ContentType "application/json" -TimeoutSec 15
    Write-OK "Conectado - $($resp.nombre)"
} catch {
    Write-ERR "Token invalido o sin internet."
    Read-Host "  Enter para salir"
    exit 1
}

$impresorasExistentes = 0
try {
    $ex = Invoke-RestMethod -Uri "$API/api/bridge/printers?token=$Token" -TimeoutSec 10
    $impresorasExistentes = $ex.count
} catch {}

if ($impresorasExistentes -gt 0) {
    Write-OK "$impresorasExistentes impresora(s) ya registrada(s)"
    $resp2 = Read-Host "  Buscar impresoras adicionales? (s/n)"
    if ($resp2 -ne "s" -and $resp2 -ne "S") {
        Start-Process "$API/owner?setup=1"
        Start-Sleep 2
        exit 0
    }
} else {
    Write-INFO "Sin impresoras registradas. Iniciando busqueda..."
}

Write-Header "PASO 2 - Detectando red local"
try {
    $localIP = (Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
        Select-Object -First 1).IPAddress
    if (-not $localIP) { throw "Sin IP" }
    $subnet = ($localIP.Split(".")[0..2]) -join "."
    Write-OK "Red: $subnet.0/24"
} catch {
    Write-ERR "No se pudo detectar la red."
    Read-Host "  Enter"
    exit 1
}

Write-Header "PASO 3 - Buscando impresoras (puerto 9100)"
Write-INFO "Escaneando red... (30 segundos aprox.)"
Write-Host ""

$found = [System.Collections.ArrayList]@()
$pool = [RunspaceFactory]::CreateRunspacePool(1, 50)
$pool.Open()
$jobs = @()

1..254 | ForEach-Object {
    $ip = "$subnet.$_"
    $ps = [PowerShell]::Create()
    $ps.RunspacePool = $pool
    [void]$ps.AddScript({
        param($ip)
        try {
            $tcp = New-Object System.Net.Sockets.TcpClient
            if ($tcp.BeginConnect($ip,9100,$null,$null).AsyncWaitHandle.WaitOne(400,$false) -and $tcp.Connected) {
                $tcp.Close()
                return $ip
            }
            $tcp.Close()
        } catch {}
        return $null
    }).AddArgument($ip)
    $jobs += @{ps=$ps; handle=$ps.BeginInvoke()}
}

$done = 0
foreach ($j in $jobs) {
    $r = $j.ps.EndInvoke($j.handle)
    $j.ps.Dispose()
    $done++
    Write-Progress -Activity "Escaneando..." -Status "$([int]($done/254*100))%" -PercentComplete ([int]($done/254*100))
    if ($r) {
        [void]$found.Add($r)
        Write-OK "Encontrada: $r"
    }
}
$pool.Close()
Write-Progress -Activity "Escaneando..." -Completed
Write-Host ""

if ($found.Count -eq 0) {
    Write-WARN "No se encontraron impresoras."
    $m = Read-Host "  Introducir IP manualmente? (s/n)"
    if ($m -eq "s" -or $m -eq "S") {
        $ip = Read-Host "  IP (ej: 192.168.1.100)"
        if ($ip -match "^\d+\.\d+\.\d+\.\d+$") {
            [void]$found.Add($ip)
        } else {
            Write-ERR "IP no valida."
            Read-Host "  Enter"
            exit 1
        }
    } else {
        Write-INFO "Puedes anadirlas desde /owner -> Hardware."
        Read-Host "  Enter"
        exit 0
    }
}

Write-Header "PASO 4 - Registrando impresoras"
$registradas = [System.Collections.ArrayList]@()
$n = $impresorasExistentes + 1

foreach ($ip in $found) {
    $nombre = "Impresora $n"
    Write-INFO "  $nombre ($ip) - obteniendo MAC..."
    $mac = Get-MacAddress $ip
    if ($mac) {
        Write-INFO "  MAC: $mac"
    } else {
        Write-WARN "  MAC no disponible"
    }
    try {
        $body = @{ip_address=$ip; port=9100; nombre=$nombre; connection_type="ip_local"}
        if ($mac) { $body.mac_address = $mac }
        $r = Invoke-RestMethod -Uri "$API/api/bridge/register-printer" -Method POST `
            -Headers @{"x-bridge-token"=$Token} -ContentType "application/json" `
            -Body ($body|ConvertTo-Json) -TimeoutSec 15
        Write-OK "Registrada: $nombre ($ip)"
        [void]$registradas.Add(@{id=$r.id; nombre=$nombre; ip=$ip})
        $n++
    } catch {
        Write-ERR "Error registrando $ip"
    }
}

if ($registradas.Count -gt 0) {
    Write-Header "PASO 5 - Enviando ticket de prueba"
    foreach ($imp in $registradas) {
        try {
            Invoke-RestMethod -Uri "$API/api/print" -Method POST -ContentType "application/json" `
                -Body (@{trigger="test"; impresora_id=$imp.id}|ConvertTo-Json) -TimeoutSec 10 | Out-Null
            Write-OK "Ticket enviado a $($imp.nombre)"
        } catch {
            Write-WARN "Sin respuesta de $($imp.nombre)"
        }
        Start-Sleep -Milliseconds 500
    }
}

Write-Header "Listo"
Write-OK "$($registradas.Count) impresora(s) configurada(s)"
Write-INFO "Pulsa TEST en el panel para identificar cada impresora"
Write-INFO "Luego crea los flujos de trabajo"
Write-Host ""
Start-Process "$API/owner?setup=1"
Start-Sleep -Seconds 3
