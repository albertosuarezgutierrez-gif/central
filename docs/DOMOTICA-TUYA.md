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

## Control de accesos NIVIAN (cerraduras/teclados)
Además del ventilador, la cuenta tiene 2 controles de acceso **NIVIAN NV-ACCESS-PIN-RFID-W**
(Wi-Fi, teclado PIN + tarjeta RFID). En `/sivra/domotica` cada uno se pinta como tarjeta 🔐 con:
- **🔍 Sonda (read-only, no abre nada):** lista los **PIN/tarjetas/accesos** ya dados de alta + la
  spec/DPs del aparato. Es la prueba de fuego de qué expone el NIVIAN por la Cloud API (y responde a
  «¿ves mis PIN?»). Cada bloque sale ✅ (con datos) o ❌ (no soportado por cloud).
- **🚪 Abrir:** pulso momentáneo al relé (se cierra sola; **nunca** modo mantener-abierta). Usa un DP
  candidato (`unlock_request`/`open_door`/…); si el aparato no lo expone, avisa (revisar la sonda).
- El **tipo** se deriva de la categoría Tuya (`lib/domotica/tipo.ts`), guardada en
  `domotica_dispositivos.categoria` al «Buscar dispositivos». Si la categoría del NIVIAN no está en la lista
  conocida (o viene vacía), la cerradura se pintaría como ventilador → hay un **selector de tipo manual** en
  cada tarjeta (🌀 Ventilador / 🔐 Cerradura / Otro) que guarda `config.tipoManual` y manda sobre la categoría
  (`tipoEfectivo`). Marca «Socorro»/«BustoTavera» como 🔐 Cerradura y aparece su tarjeta de acceso (sonda + PIN).

### Fase 2 — PIN por reserva (implementada, se valida en producción)
El **cron** `/api/sivra/domotica/acceso/programador` (`40 4,12,20 * * *`, auth `CRON_SECRET`) recorre las
reservas de Smoobu de los próximos 14 días de **cada apartamento vinculado a la cerradura** (1 cerradura ↔
N pisos: BustoTavera = Busto Reform + Luxury Busto) y **sincroniza un PIN por reserva** (idempotente por el
índice único `(dispositivo_id, reserva_ref)` de la tabla **`domotica_acceso_pin`**):
- **Ventana** = horario REAL del piso (`HORARIOS_PISO`, no lo que diga Smoobu) ± los márgenes configurados,
  en epoch DST-safe (`lib/domotica/acceso-programador.ts`, puro y testeado).
- **Creación** (`lib/domotica/acceso.ts::crearPinTemporal`): intenta contraseña **online** (elegimos el
  PIN, ticket + AES `lib/domotica/tuya-cifrado.ts`) y cae a **offline** (Tuya genera el código, sin
  conexión, endpoint **`/v1.1/`**). Cada vía con `try/catch`; si el NIVIAN no lo expone por cloud, la fila
  queda `estado='error'` y avisa por Telegram — no rompe.
  - **⚠️ Cripto online (arreglada 12/07/2026):** el `ticket_key` (hex) se descifra con **`aes-256-ecb` +
    el `access_secret` COMPLETO (32 bytes utf8) + PKCS7** → clave real de 16 bytes; con ella se cifra el PIN
    en `aes-128-ecb`+PKCS7 → hex MAYÚSCULAS. (Antes usaba `aes-128` con 16 bytes/NoPadding → `Invalid key
    length`.) El offline usaba `/v1.0/` → `Tuya 1109`.
  - **⚠️ 1 cerradura ↔ N pisos (arreglado 12/07/2026):** el programador filtra las reservas por el
    apartamento REAL de Smoobu (`b.apartment.id`) contra el `aptId` vinculado — Smoobu NO acota por
    `apartments[]`. Sin esto se creaba el PIN de un piso en la cerradura de otro. Vínculos reales:
    **Socorro**=`[352007]` (House Sevillana, online), **BustoTavera**=`[352418,352943]` (Busto Reform +
    Luxury Busto, offline), **Dúplex** sin cerradura.
- **Entrega** (`config.entrega`): `manual` (solo panel) · `aviso` (Telegram a Alberto, **DEFAULT seguro**) ·
  `huesped` (mensaje al huésped por Smoobu) · `ambos`. Nada llega al huésped hasta activarlo a mano.
- **Borrado**: al vencer, el cron borra el PIN en la cerradura y marca la fila `borrado` (si
  `autoBorrarTrasCheckout`); además de caducar solo.
- **Alertas**: cerradura offline antes de un check-in (leadtime configurable) → Telegram. (primera entrada /
  fuera de ventana / sabotaje / timbre quedan como flags, se dispararán cuando la sonda confirme esos DPs.)

**Todo editable por cerradura** en el panel (bloque ⚙️ Configuración): `autoPin`, `entrega`, `pinLongitud`,
`usarHorarioPiso`, `margenEntradaMin/SalidaMin`, `autoBorrarTrasCheckout`, `botonAbrir`, los pisos vinculados
(`smoobuApartmentIds`) y las alertas. Alta/baja **manual** de PIN desde la tarjeta. `ConfigAcceso` +
`CONFIG_ACCESO_DEFAULT` en `lib/domotica/tipo.ts`.

**Se valida en producción** (dev no alcanza la Tuya API). Si `crearPinTemporal` falla en todas las vías, la
sonda dice qué expone el NIVIAN de verdad (endpoint de temp-password, online vs offline) y se afina ahí.
**Sub-feature pendiente:** códigos permanentes de limpiadora/mantenimiento (`codigosFijos`, ya en el tipo)
— mismo mecanismo que un PIN sin caducidad; se cablea cuando la creación de PIN quede confirmada en el
aparato. Diseño completo: `docs/superpowers/specs/2026-07-07-domotica-accesos-nivian-design.md`.

## Mantenimiento
- **El trial de IoT Core caduca cada ~6 meses.** Si la API empieza a fallar con error de
  suscripción, el mensaje (UI y Telegram) lo dice: renovar en platform.tuya.com → proyecto →
  Service API → IoT Core → Extend Trial. Es gratis.
- Errores del programador → alerta Telegram (`tgAlert` crítico). Las acciones quedan en
  `domotica_log` (visible en la UI, «Últimas acciones»).
- Limitación conocida del hardware: el mando RF NO sincroniza estado con el cloud → el estado
  mostrado puede mentir; por eso el apagado de las 11:30 se manda sin mirar el estado.
