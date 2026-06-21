@echo off
chcp 65001 >nul
title ia.rest · Bridge de impresoras
color 0F

echo.
echo  ██╗ █████╗       ██████╗ ███████╗███████╗████████╗
echo  ██║██╔══██╗      ██╔══██╗██╔════╝██╔════╝╚══██╔══╝
echo  ██║███████║      ██████╔╝█████╗  ███████╗   ██║   
echo  ██║██╔══██║      ██╔══██╗██╔══╝  ╚════██║   ██║   
echo  ██║██║  ██║      ██║  ██║███████╗███████║   ██║   
echo  ╚═╝╚═╝  ╚═╝      ╚═╝  ╚═╝╚══════╝╚══════╝   ╚═╝   
echo.
echo  Bridge de impresoras - Instalador automatico
echo  ============================================
echo.

REM ── Carpeta de instalacion ──────────────────────────────
set INSTALL_DIR=%USERPROFILE%\ia-rest-bridge
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

REM ── Comprobar config guardada ────────────────────────────
set CONFIG_FILE=%INSTALL_DIR%\config.env
if exist "%CONFIG_FILE%" (
    echo  Configuracion encontrada. Cargando...
    for /f "tokens=1,2 delims==" %%a in (%CONFIG_FILE%) do (
        if "%%a"=="BRIDGE_TOKEN" set BRIDGE_TOKEN=%%b
        if "%%a"=="IAREST_API" set IAREST_API=%%b
    )
    echo  Token: %BRIDGE_TOKEN:~0,8%...
    echo  API:   %IAREST_API%
    echo.
    choice /c SI /n /m " Usar esta configuracion? [S para continuar, cierra para cambiar]: "
    goto :check_node
)

REM ── Pedir token ──────────────────────────────────────────
echo  PASO 1 - Token del bridge
echo  ─────────────────────────────────────────────────────
echo  Ve a www.iarest.es/owner → Config → Impresoras → Bridge local
echo  y copia el token que aparece.
echo.
set /p BRIDGE_TOKEN= Token: 

if "%BRIDGE_TOKEN%"=="" (
    echo  ERROR: Token requerido.
    pause
    exit /b 1
)

set IAREST_API=https://www.iarest.es

REM ── Guardar config ───────────────────────────────────────
echo BRIDGE_TOKEN=%BRIDGE_TOKEN%> "%CONFIG_FILE%"
echo IAREST_API=%IAREST_API%>> "%CONFIG_FILE%"
echo.
echo  Configuracion guardada. La proxima vez arranca automaticamente.
echo.

:check_node
REM ── Comprobar Node.js ────────────────────────────────────
echo  PASO 2 - Comprobando Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  Node.js no encontrado. Instalando automaticamente...
    echo  Esto puede tardar 1-2 minutos.
    echo.
    winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    if %errorlevel% neq 0 (
        echo.
        echo  ERROR: No se pudo instalar Node.js automaticamente.
        echo  Descargalo manualmente de: nodejs.org
        pause
        exit /b 1
    )
    REM Recargar PATH
    call refreshenv >nul 2>&1
)
for /f %%v in ('node --version') do set NODE_VER=%%v
echo  Node.js %NODE_VER% OK
echo.

REM ── Descargar bridge ─────────────────────────────────────
echo  PASO 3 - Descargando bridge...
set BRIDGE_FILE=%INSTALL_DIR%\bridge-local.js
powershell -Command "Invoke-WebRequest -Uri 'https://www.iarest.es/bridge-local.js' -OutFile '%BRIDGE_FILE%'" >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: No se pudo descargar el bridge.
    echo  Comprueba la conexion a internet.
    pause
    exit /b 1
)
echo  Bridge descargado OK
echo.


REM ── Wizard de impresoras (siempre) ──────────────────────
echo  PASO 4 - Configurando impresoras...
set WIZARD_FILE=%INSTALL_DIR%\bridge-wizard.ps1
powershell -Command "Invoke-WebRequest -Uri 'https://www.iarest.es/bridge-wizard.ps1' -OutFile '%WIZARD_FILE%'" >nul 2>&1
if exist "%WIZARD_FILE%" (
    powershell -ExecutionPolicy Bypass -File "%WIZARD_FILE%" -Token "%BRIDGE_TOKEN%" -API "%IAREST_API%"
) else (
    echo  Aviso: No se pudo descargar el wizard.
    echo  Configura impresoras desde /owner → Hardware.
    pause
)

REM ── Crear script arrancar.bat con bucle de reinicio ─────
set SCRIPT_FILE=%INSTALL_DIR%\arrancar.bat

echo @echo off                                           > "%SCRIPT_FILE%"
echo chcp 65001 ^>nul                                   >> "%SCRIPT_FILE%"
echo title ia.rest Bridge                               >> "%SCRIPT_FILE%"
echo set IAREST_API=%IAREST_API%                        >> "%SCRIPT_FILE%"
echo set BRIDGE_TOKEN=%BRIDGE_TOKEN%                    >> "%SCRIPT_FILE%"
echo :loop                                              >> "%SCRIPT_FILE%"
echo node "%BRIDGE_FILE%"                               >> "%SCRIPT_FILE%"
echo echo [ia.rest] Bridge detenido. Reiniciando en 5s. >> "%SCRIPT_FILE%"
echo timeout /t 5 /nobreak ^>nul                        >> "%SCRIPT_FILE%"
echo goto loop                                          >> "%SCRIPT_FILE%"

echo  Script de arranque creado.
echo.

REM ── Registrar tarea programada de Windows ────────────────
echo  PASO 5 - Registrando inicio automatico...
echo  (Arrancara solo cada vez que enciendas el PC)
echo.

schtasks /delete /tn "iarest-bridge" /f >nul 2>&1
schtasks /create /tn "iarest-bridge" /tr "cmd /c start \"ia.rest Bridge\" /min \"%SCRIPT_FILE%\"" /sc ONLOGON /ru "%USERNAME%" /rl HIGHEST /f >nul 2>&1

if %errorlevel% equ 0 (
    echo  Inicio automatico activado - arrancara solo al encender el PC
) else (
    echo  [!] No se pudo registrar la tarea. Ejecuta este bat como Administrador.
    echo      O usa el acceso directo del escritorio para arrancar manualmente.
)
echo.

REM ── Crear acceso directo en escritorio ───────────────────
set SHORTCUT=%USERPROFILE%\Desktop\ia.rest Bridge.lnk
powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT%'); $s.TargetPath = '%SCRIPT_FILE%'; $s.IconLocation = 'shell32.dll,13'; $s.Description = 'ia.rest Bridge de impresoras'; $s.Save()" >nul 2>&1
echo  Acceso directo creado en el Escritorio.
echo.

REM ── Abrir navegador ──────────────────────────────────────
start https://www.iarest.es/owner
echo  Panel abierto en el navegador.
echo.

REM ── Arrancar bridge ahora ────────────────────────────────
echo  ============================================
echo  Listo. Arrancando bridge...
echo.
echo  Ya esta configurado para arrancar solo al
echo  encender el PC. Puedes minimizar esta ventana.
echo  Para parar: cierra esta ventana o Ctrl+C
echo  ============================================
echo.

set IAREST_API=%IAREST_API%
set BRIDGE_TOKEN=%BRIDGE_TOKEN%

:loop
node "%BRIDGE_FILE%"
echo  [ia.rest] Bridge detenido. Reiniciando en 5s...
timeout /t 5 /nobreak >nul
goto loop
