# Domótica Tuya — setup y operación

Ventilador CREATE (Tuya) de House Sevillana (C/ Socorro 24), controlado desde plataforma.
Spec: `docs/superpowers/specs/2026-07-03-domotica-tuya-ventilador-design.md`.

## Estado del emparejamiento
- 03/07/2026: el ventilador se re-emparejó de CREATE Home a **Smart Life** (cuenta de Alberto).
  Smart Life es la app que hay que usar para el QR de vinculación.
- Modo emparejamiento del Wind Calm (por si hay que re-emparejar): mando a distancia,
  mantener **1H + 4H** pulsados ~5 s hasta el pitido; móvil en la WiFi 2,4 GHz del piso.

## Setup una vez (Alberto, ~10 min, desde ORDENADOR)
1. **platform.tuya.com** → Sign Up (email + código de verificación; NO usar login de Google).
2. Cloud → Development → **Create Cloud Project** → industria "Smart Home",
   **Data Center: Central Europe**. Acepta el trial de **IoT Core**.
3. Dentro del proyecto: **Devices → Link Tuya App Account → Add App Account** → sale un QR →
   en el móvil: Smart Life → «Yo» → icono escáner (arriba dcha.) → escanear.
   El ventilador aparece en la lista de dispositivos del proyecto.
4. Pestaña **Overview** → copia **Access ID** y **Access Secret** → Vercel → proyecto
   **plataforma** → Settings → Environment Variables (Production):
   - `TUYA_CLIENT_ID` = Access ID
   - `TUYA_CLIENT_SECRET` = Access Secret
   - (`TUYA_ENDPOINT` solo si el data center NO es Central Europe; default `https://openapi.tuyaeu.com`)
   Redeploy de plataforma para que las envs entren.
5. En plataforma → **/sivra/domotica** → «Buscar dispositivos» → aparece el ventilador →
   vincúlalo al apartamento de Smoobu (selector «Piso») para que corra la automatización.

## La automatización (regla acordada el 03/07/2026)
- **Día de llegada, 15:00 (Madrid):** si en Sevilla hace **>30 °C** (Open-Meteo, temperatura en el
  momento) → enciende **solo el ventilador** (la luz nunca se toca). Si no, lo anota y no hace nada.
- **Día de check-out, 11:30:** manda **apagar siempre** (apagar algo apagado es inocuo; cubre
  también el desfase de estado cuando el huésped usó el mando físico RF).
- Idempotente por reserva (`domotica_log`, índice único `domotica_log_idem`) — el cron corre cada
  30 min en franja (`25,55 8-15 * * *` UTC) y decide con hora Europe/Madrid (DST-safe).
- Config editable en la UI: activar/desactivar auto, umbral °C, piso vinculado.

## Piezas (código)
- `apps/plataforma/lib/domotica/tuya.ts` — cliente OpenAPI (firma HMAC v2, token, mapeo DP dinámico).
  El listado (`tuyaListDevices`) consulta **`/v1.0/iot-01/associated-users/devices`** (los dispositivos
  de la cuenta Smart Life vinculada por QR salen por ahí, NO por `/v2.0/cloud/thing/device`) y **fusiona**
  con `/v2.0/cloud/thing/device` por si algún cacharro se importó directo al proyecto.
- `apps/plataforma/lib/domotica/meteo.ts` — Open-Meteo (fail-safe: sin meteo NO se enciende).
- `apps/plataforma/lib/domotica/programador.ts` — lógica pura de ventanas (tests `node --test`).
- `apps/plataforma/app/api/sivra/domotica/*` — dispositivos / descubrir / comando / programador (cron).
- `apps/plataforma/app/(usuario)/sivra/domotica/` — UI (sidebar «🌀 Domótica»).
- Tablas: `domotica_dispositivos`, `domotica_log` (BD compartida; REVOKE a anon/authenticated).

## Si «Buscar dispositivos» no encuentra nada
1. **Envs puestas y redeploy hecho.** Sin `TUYA_CLIENT_ID/TUYA_CLIENT_SECRET` la UI muestra un error
   explícito («…no configuradas»), no la lista vacía. Redeploy de plataforma tras ponerlas.
2. **Cuenta Smart Life vinculada al proyecto por QR** (paso 3 del setup). Sin la vinculación el
   ventilador NO es visible para la Cloud API aunque esté en tu móvil.
3. **La cuenta del QR es la propietaria (Home Owner)** del dispositivo en Smart Life, no una invitada.
4. **Data center correcto** (Central Europe → `TUYA_ENDPOINT` por defecto). Si creaste el proyecto en
   otro DC, pon `TUYA_ENDPOINT` al endpoint de ese DC.
5. Trial de IoT Core vigente (ver abajo).

## Mantenimiento
- **El trial de IoT Core caduca cada ~6 meses.** Si la API empieza a fallar con error de
  suscripción, el mensaje (UI y Telegram) lo dice: renovar en platform.tuya.com → proyecto →
  Service API → IoT Core → Extend Trial. Es gratis.
- Errores del programador → alerta Telegram (`tgAlert` crítico). Las acciones quedan en
  `domotica_log` (visible en la UI, «Últimas acciones»).
- Limitación conocida del hardware: el mando RF NO sincroniza estado con el cloud → el estado
  mostrado puede mentir; por eso el apagado de las 11:30 se manda sin mirar el estado.
