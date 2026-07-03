# Domótica Tuya — ventilador de techo de Socorro (House Sevillana)

**Fecha:** 2026-07-03 · **Vertical:** plataforma (sección sivra) · **Estado:** diseño aprobado por Alberto

## Contexto y objetivo

En el piso de C/ Socorro 24 (House Sevillana) hay un ventilador de techo **CREATE** con WiFi,
ya emparejado en la app **CREATE Home** (rebranding de Tuya). Objetivo: que plataforma pueda
controlarlo por la **Tuya Cloud OpenAPI** para (a) control manual desde una página de plataforma
y (b) una automatización ligada a las reservas de Smoobu.

Decisiones de Alberto (03/07/2026):
- Opción elegida: **Tuya Cloud API desde plataforma** (sin hardware en el piso, sin Home Assistant).
- Automatización exacta:
  - **Día de llegada del huésped, 15:00 hora Madrid** (la hora de check-in de House Sevillana según
    `lib/sivra/agente-huesped/horarios.ts`): encender **solo el ventilador, NO la luz**, únicamente
    si en Sevilla hace **más de 30 °C** en ese momento.
  - **Día de check-out, 11:30 hora Madrid**: **confirmar que está apagado** — se manda `off`
    incondicionalmente por si el huésped lo dejó encendido.
- No es paquete compartido (`@central/core-domotica` sería prematuro — YAGNI): vive como lib
  dentro de plataforma. Si algún día hay más dispositivos/pisos, se extrae.

## Credenciales e infra (parte manual de Alberto, una vez)

1. Cuenta gratuita en **iot.tuya.com** → Cloud Project (data center **Central Europe**),
   suscripción trial de **IoT Core** (gratis; caduca cada 6 meses y se renueva con 2 clics —
   el health-check avisará cuando la API devuelva error de suscripción).
2. Vincular la cuenta de la app escaneando el QR desde la app. **Caveat CREATE Home:** si la app
   no trae escáner de QR, re-emparejar el ventilador con **Smart Life** (misma base Tuya) y
   vincular esa cuenta.
3. Envs en el proyecto Vercel de plataforma (valores NUNCA en el repo):
   - `TUYA_CLIENT_ID` — Access ID del cloud project.
   - `TUYA_CLIENT_SECRET` — Access Secret. Es API key de servicio externo → puede caer a `|| ''`
     (regla de `test/regression-secrets.test.ts`: solo los secretos de auth propios prohíben fallback).
   - `TUYA_ENDPOINT` — opcional, default `https://openapi.tuyaeu.com` (EU).
4. El **device id** del ventilador NO va en env: se descubre desde la UI (botón «Buscar
   dispositivos») y se guarda en BD.

La guía paso a paso con capturas de pantalla mentales va en `docs/DOMOTICA-TUYA.md`
(se escribe en la implementación).

## Componentes

### 1. Lib cliente — `apps/plataforma/lib/domotica/tuya.ts`

Cliente puro de la Tuya OpenAPI v2 (sin SDK npm; la firma es sencilla y así no metemos dependencia):
- **Firma HMAC-SHA256** del esquema v2 de Tuya (`client_id + access_token + t + nonce + stringToSign`),
  con `crypto` de Node.
- **Token de acceso** (`GET /v1.0/token?grant_type=1`) con cache en memoria de módulo y margen de
  renovación (los tokens duran 2 h; en serverless la cache vive lo que la lambda — aceptable,
  pedir token es 1 llamada).
- Funciones exportadas:
  - `tuyaListDevices()` — dispositivos vinculados a la cuenta (para el descubrimiento inicial).
  - `tuyaGetStatus(deviceId)` — estado actual (lista de DP `{code, value}`).
  - `tuyaGetSpec(deviceId)` — especificación de funciones del dispositivo (qué DP existen).
  - `tuyaSendCommands(deviceId, commands)` — `POST /v1.0/devices/{id}/commands`.
- **Mapeo de DP sin hardcodear:** helpers que buscan el code correcto en la spec del dispositivo
  (`switch`/`switch_fan` para el ventilador, `fan_speed`/`fan_speed_percent` para velocidad,
  `switch_led`/`light` para la luz). Así sirve para cualquier cacharro Tuya futuro.
  La automatización solo usa el switch del ventilador; **nunca toca el DP de la luz**.

### 2. Meteo — `apps/plataforma/lib/domotica/meteo.ts`

`temperaturaSevilla()` → temperatura actual en Sevilla vía **Open-Meteo**
(`api.open-meteo.com/v1/forecast?latitude=37.39&longitude=-5.99&current=temperature_2m`),
gratuita y sin API key. Si Open-Meteo falla, la automatización de encendido **no actúa**
(fail-safe: mejor no encender que encender sin criterio) y lo anota en el log.

### 3. BD — dos tablas nuevas (schema `public`, SQL crudo como el resto de sivra)

```sql
domotica_dispositivos (
  id uuid pk default gen_random_uuid(),
  nombre text,                    -- «Ventilador techo salón»
  tuya_device_id text unique,
  piso text,                      -- clave de zona/piso, alineada con horarios.ts (p.ej. smoobu propertyId)
  config jsonb default '{}',      -- { autoOn: true, umbralC: 30, horaOn: "15:00", horaOffCheck: "11:30", meses: [5..9]? }
  activo boolean default true,
  created_at timestamptz default now()
)

domotica_log (
  id bigserial pk,
  dispositivo_id uuid references domotica_dispositivos,
  accion text,                    -- 'on' | 'off' | 'skip_temp' | 'skip_meteo_error' | 'error' | 'manual_on' | ...
  detalle jsonb,                  -- temperatura, reserva, estado previo, error…
  reserva_ref text,               -- id de reserva Smoobu (clave de idempotencia junto a accion)
  created_at timestamptz default now()
)
```

Idempotencia del programador: `UNIQUE (dispositivo_id, accion, reserva_ref)` parcial (solo para
acciones automáticas) — si ya hay fila, no se re-manda el comando para esa reserva.

Como toda la BD es compartida y multi-tenant (frontera sivra/ialimp), las tablas son nuevas y
no tocan RLS ni GRANTs existentes.

### 4. API — rutas en plataforma

- `GET /api/sivra/domotica/dispositivos` — lista dispositivos BD + estado en vivo de Tuya.
- `POST /api/sivra/domotica/descubrir` — llama `tuyaListDevices()` y da de alta los que falten.
- `POST /api/sivra/domotica/comando` — `{dispositivoId, accion: 'on'|'off'|'velocidad'|'luz', valor?}`,
  registra en `domotica_log` con acción `manual_*`.
- `PATCH /api/sivra/domotica/dispositivos/[id]` — editar config de automatización.
- Auth: sesión NextAuth de plataforma, igual que el resto de `/api/sivra/*` de usuario.
- `GET /api/sivra/domotica/programador` — el cron (Bearer `CRON_SECRET`, patrón existente).

### 5. UI — página `/sivra/domotica` en plataforma

Card por dispositivo (mobile-first, botones ≥44 px):
- Estado actual (encendido/apagado, velocidad, luz) con botón refrescar.
- Controles: encender/apagar ventilador, velocidad, luz on/off.
- **Aviso visible del gotcha RF:** si alguien usa el mando físico, el estado que reporta Tuya
  puede quedar desactualizado (limitación del hardware CREATE, no nuestra).
- Formulario de automatización: activa sí/no, umbral °C (default 30), y texto explicando la regla
  (llegada 15:00 / verificación salida 11:30).
- Últimas ~20 filas de `domotica_log` (desplegable cerrado por defecto, regla de rendimiento UI).
- Entrada en el menú/sidebar de la sección sivra.

### 6. Programador — cron `/api/sivra/domotica/programador`

- **Schedule Vercel (UTC):** `25,55 8-15 * * *` — cada 30 min en la franja que cubre 11:30 y
  15:00 de Madrid tanto en CEST como en CET. El código decide con `Europe/Madrid` si toca actuar;
  correr de más es inocuo por la idempotencia.
- En cada pasada, para cada dispositivo `activo` con `autoOn`:
  1. Reservas de Smoobu del piso (mismo cliente `lib/smoobu` que usa el resto de plataforma).
  2. **Ventana de encendido:** hoy es día de check-in de una reserva y hora Madrid ∈ [15:00, 15:30)
     → si no hay log previo para esa reserva: `temperaturaSevilla()`; **> umbral (30 °C)** → comando
     `on` (solo switch ventilador) y log `on`; ≤ umbral → log `skip_temp` (también idempotente, para
     no re-consultar la meteo cada pasada). Meteo caída → log `skip_meteo_error` y Telegram aviso.
  3. **Ventana de apagado:** hoy es día de check-out y hora Madrid ∈ [11:30, 12:00) → si no hay log
     previo: leer estado (solo para el log), mandar `off` **siempre** (apagar algo apagado es inocuo
     y cubre el desfase de estado por el mando RF), log `off` con el estado previo en `detalle`.
- Errores de la API Tuya en el programador → `tgAlert(..., 'critico')` (patrón existente de plataforma).
- Caso borde cubierto por tests: salida y entrada el mismo día (se apaga a las 11:30 y se
  re-enciende a las 15:00 si hace calor — dos reservas distintas, dos claves de idempotencia).

## Errores y observabilidad

- Todo comando (manual o automático) deja fila en `domotica_log`.
- Fallo Tuya en cron → Telegram crítico. Fallo Tuya en UI → error visible en la card.
- Si la API devuelve el error de suscripción caducada del trial de IoT Core, el mensaje de
  Telegram lo dice explícitamente («renueva el trial en iot.tuya.com»).

## Testing

- Unit: firma HMAC v2 contra un vector conocido; mapeo de DP sobre specs de ejemplo; lógica de
  ventanas del programador (timezone Madrid, DST, salida+entrada mismo día, idempotencia).
- `pnpm test:guardia` sigue verde (ningún secreto de auth nuevo con fallback).
- Prueba real end-to-end (encender/apagar de verdad) con Alberto cuando estén las envs — no
  automatizable desde CI.

## Fuera de alcance (por ahora)

- Más dispositivos/pisos (el modelo de datos ya lo permite, la UI lista N cards).
- Control de la luz en automatizaciones (solo manual desde la UI).
- Paquete compartido `@central/core-domotica`.
- Estado en tiempo real por Pulsar/webhooks de Tuya (se consulta bajo demanda).
