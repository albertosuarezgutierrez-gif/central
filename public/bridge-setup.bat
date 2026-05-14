@echo off
chcp 65001 >nul
title ia.rest Bridge
color 0F

echo.
echo  ia.rest - Bridge de impresoras
echo  ============================================
echo.

set INSTALL_DIR=%USERPROFILE%\ia-rest-bridge
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

set CONFIG_FILE=%INSTALL_DIR%\config.env
set WIZARD_DONE=%INSTALL_DIR%\.wizard_done

if exist "%CONFIG_FILE%" (
    echo  Configuracion encontrada. Cargando...
    for /f "tokens=1,2 delims==" %%a in (%CONFIG_FILE%) do (
        if "%%a"=="BRIDGE_TOKEN" set BRIDGE_TOKEN=%%b
        if "%%a"=="IAREST_API"   set IAREST_API=%%b
    )
    echo  Token: %BRIDGE_TOKEN:~0,8%...
    echo.
    choice /c SN /n /m "  Usar esta configuracion? [S=Si, N=Nueva]: "
    if errorlevel 2 goto :pedir_token
    goto :check_node
)

:pedir_token
echo  PASO 1 - Token del bridge
echo  Ve a www.iarest.es/owner - Config - Impresoras - Bridge local
echo.
set /p BRIDGE_TOKEN= Token: 

if "%BRIDGE_TOKEN%"=="" (
    echo  ERROR: Token requerido.
    pause
    exit /b 1
)

set IAREST_API=https://www.iarest.es

echo BRIDGE_TOKEN=%BRIDGE_TOKEN%> "%CONFIG_FILE%"
echo IAREST_API=%IAREST_API%>> "%CONFIG_FILE%"
echo.
echo  Configuracion guardada.
echo.
if exist "%WIZARD_DONE%" del "%WIZARD_DONE%"

:check_node
echo  PASO 2 - Comprobando Node.js...
node --version >nul 2>&1
if %errorlevel% equ 0 goto :node_ok

echo  Node.js no encontrado. Descargando instalador...
echo  (esto puede tardar 1-2 minutos)
echo.
set NODE_INSTALLER=%TEMP%
ode-installer.msi
powershell -Command "(New-Object Net.WebClient).DownloadFile('https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi', '%NODE_INSTALLER%')" 2>nul
if not exist "%NODE_INSTALLER%" (
    echo  ERROR: No se pudo descargar Node.js.
    echo  Descargalo manualmente de: nodejs.org
    pause
    exit /b 1
)
msiexec /i "%NODE_INSTALLER%" /quiet /norestart
del "%NODE_INSTALLER%" >nul 2>&1
set PATH=%PATH%;C:\Program Files
odejs
echo  Node.js instalado OK

:node_ok
for /f %%v in ('node --version 2^>nul') do set NODE_VER=%%v
echo  Node.js %NODE_VER% OK
echo.

echo  PASO 3 - Descargando bridge...
set BRIDGE_FILE=%INSTALL_DIR%ridge-local.js
powershell -Command "(New-Object Net.WebClient).DownloadFile('https://raw.githubusercontent.com/albertosuarezgutierrez-gif/ia.rest/main/scripts/bridge-local.js', '%BRIDGE_FILE%')"
if not exist "%BRIDGE_FILE%" (
    echo  ERROR: No se pudo descargar el bridge.
    pause
    exit /b 1
)
echo  Bridge OK
echo.

if exist "%WIZARD_DONE%" goto :skip_wizard

echo  PASO 4 - Buscar impresoras en red
echo  El wizard escaneara el puerto 9100 en tu red local
echo  y registrara las impresoras en ia.rest automaticamente.
echo.
choice /c SN /n /m "  Buscar impresoras ahora? [S=Si, N=Saltar]: "
if errorlevel 2 goto :skip_wizard

set WIZARD_FILE=%INSTALL_DIR%ridge-wizard.ps1
powershell -Command "(New-Object Net.WebClient).DownloadFile('https://raw.githubusercontent.com/albertosuarezgutierrez-gif/ia.rest/main/scripts/bridge-wizard.ps1', '%WIZARD_FILE%')"
if not exist "%WIZARD_FILE%" (
    echo  Aviso: No se pudo descargar el wizard. Configura impresoras desde /owner.
    goto :skip_wizard
)

powershell -ExecutionPolicy Bypass -File "%WIZARD_FILE%" -Token "%BRIDGE_TOKEN%" -API "%IAREST_API%"
echo done > "%WIZARD_DONE%"

echo.
echo  Para volver a ejecutar el wizard: borra %WIZARD_DONE%
echo.
pause

:skip_wizard
set SCRIPT_FILE=%INSTALL_DIR%rrancar.bat
echo @echo off > "%SCRIPT_FILE%"
echo title ia.rest Bridge >> "%SCRIPT_FILE%"
echo set IAREST_API=%IAREST_API% >> "%SCRIPT_FILE%"
echo set BRIDGE_TOKEN=%BRIDGE_TOKEN% >> "%SCRIPT_FILE%"
echo node "%BRIDGE_FILE%" >> "%SCRIPT_FILE%"

set SHORTCUT=%USERPROFILE%\Desktop\ia.rest Bridge.lnk
powershell -Command "try { \=New-Object -ComObject WScript.Shell; \=\.CreateShortcut('%SHORTCUT%'); \.TargetPath='%SCRIPT_FILE%'; \.IconLocation='shell32.dll,13'; \.Save() } catch {}" >nul 2>&1

echo  Abriendo panel en el navegador...
start https://www.iarest.es/owner

echo.
echo  ============================================
echo  Bridge listo. Arrancando...
echo  Deja esta ventana abierta mientras uses ia.rest.
echo  Ctrl+C para parar.
echo  ============================================
echo.

set IAREST_API=%IAREST_API%
set BRIDGE_TOKEN=%BRIDGE_TOKEN%
node "%BRIDGE_FILE%"

pause
