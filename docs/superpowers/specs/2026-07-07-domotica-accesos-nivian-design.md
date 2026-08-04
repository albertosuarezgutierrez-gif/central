# Domótica — Control de accesos NIVIAN (cerraduras) + PIN por reserva: Design

**Fecha:** 2026-07-07
**Vertical:** `apps/plataforma` (sección `/sivra/domotica`, sobre la BD compartida `wswbehlcuxqxyinousql`).
**Depende de:** la domótica Tuya ya existente (`lib/domotica/tuya.ts`, tablas `domotica_dispositivos`/`domotica_log`, PR #714 + #780).

## Objetivo

Controlar y automatizar los **controles de acceso NIVIAN NV-ACCESS-PIN-RFID-W** (Wi-Fi, teclado PIN +
tarjeta RFID) de los pisos turísticos, además del ventilador ya soportado. El norte es el **check-in
autónomo**: un PIN temporal por reserva de Smoobu que el huésped usa para entrar y **caduca solo**, sin
entrega de llaves. **Principio rector: todo es editable y configurable por cerradura** — ningún
comportamiento va hardcodeado; cada uno es un ajuste con valor por defecto, cambiable desde el panel.

## Aparatos reales (descubiertos el 07/07/2026)

| Dispositivo | `tuya_device_id` | Tipo | Propiedad(es) Smoobu | Online |
|---|---|---|---|---|
| Socorro salon | `bfbeb0d65373a1fce208ns` | Ventilador+luz (ceiling fan/Light v2) | House Sevillana (Socorro) | 🔴 |
| Socorro | `bf0ca56d1aa4a86a1dzbnq` | Cerradura NIVIAN (acceso) | House Sevillana (Socorro) | 🟢 |
| BustoTavera | `bf4a360e8e53a1dde4bbfi` | Cerradura NIVIAN (acceso) | **Busto Reform + Luxury Busto** (2 pisos) | 🔴 |

Notas de mapeo (fuente: Alberto + `lib/sivra/constantes.ts` / `agente-huesped/horarios.ts`):
- **Socorro = House Sevillana** (turístico, NO es la vivienda de Alberto). Cerradura + ventilador del salón.
- **BustoTavera = portal del edificio** con **dos** turísticos → **1 cerradura ↔ N pisos** (varios PIN
  activos a la vez, uno por reserva de cada piso). El diseño DEBE soportar esta cardinalidad.
- **Duplex Center** no tiene aparato Tuya → fuera de alcance.

## Restricciones y la gran incógnita

- **El entorno de desarrollo NO alcanza la Tuya Cloud API** (`openapi.tuyaeu.com` bloqueado por la política
  de red). Se implementa a ciegas y se verifica **desplegando** en Vercel (patrón del PR #780). Solo lo puro
  se testea en local (`node --test`).
- **Online vs offline password (incógnita que decide la Fase 2):** si el NIVIAN solo hace "online password",
  el PIN necesita que la cerradura esté **online** al crearlo (riesgo con BustoTavera, ahora offline). Si hace
  "offline password" (código calculado por tiempo, sin tocar la cerradura), es más robusto. **La sonda
  (Fase 0) lo determina.** Todo el diseño de entrega/robustez de la Fase 2 cuelga de este dato.

## Fases (orden de construcción)

- **Fase 0 — Sonda (read-only, no abre nada):** leer del aparato online (Socorro) categoría/DPs + **listar
  los PIN/tarjetas/usuarios ya dados de alta + el registro de accesos**. Responde a "¿ves mis PIN?" y
  **confirma qué expone el NIVIAN por cloud** (gate de la Fase 2).
- **Fase 1 — Panel de accesos:** tarjeta por cerradura con estado online + batería/señal, PIN/tarjetas
  actuales, últimos accesos, y botón **«Abrir» momentáneo** (pulso corto, se cierra sola siempre).
- **Fase 2 — Automatización + extras:** PIN por reserva, entrega, alertas, códigos de limpiadora, etc. (ver
  «Catálogo de features»). Se diseña aquí completo; se implementa tras validar la sonda.

**Este spec cubre las tres fases de diseño.** El primer plan de implementación abarca **Fase 0 + Fase 1**;
la Fase 2 tendrá su propio plan una vez la sonda confirme el modelo de contraseñas.

## Principio: todo editable y configurable (por cerradura)

Cada dispositivo tiene un `config` (jsonb en `domotica_dispositivos`, ya existe, se edita por el PATCH
existente `dispositivos/[id]` que fusiona jsonb). Para cerraduras, el `ConfigAcceso` (todos con default,
todos editables en el panel):

```ts
type ConfigAcceso = {
  // Vínculo con reservas (1 cerradura ↔ N pisos)
  smoobuApartmentIds: number[]      // apartamentos que cuelgan de esta puerta
  // PIN automático por reserva
  autoPin: boolean                  // default true — generar PIN por reserva (on/off)
  entrega: 'huesped' | 'aviso' | 'ambos' | 'manual'  // canal (default 'ambos')
  pinLongitud: number               // default 6
  usarHorarioPiso: boolean          // default true — ventana desde HORARIOS_PISO, no Smoobu
  margenEntradaMin: number          // default 0 — minutos antes del check-in que ya vale
  margenSalidaMin: number           // default 0 — minutos tras el check-out que sigue valiendo
  autoBorrarTrasCheckout: boolean   // default true — además de caducar, borrarlo activamente
  // Apertura remota
  botonAbrir: boolean               // default true — mostrar el botón «Abrir» momentáneo
  // Códigos permanentes (limpiadora / mantenimiento / maestro / emergencia)
  codigosFijos: Array<{ etiqueta: string; tipo: 'pin' | 'tarjeta'; horario?: string; activo: boolean }>
  // Alertas (cada una on/off; leadtime configurable donde aplique)
  alertas: {
    primeraEntrada: boolean         // avisar cuando el huésped entra por 1ª vez (confirma llegada)
    fueraDeVentana: boolean         // entrada sin reserva activa → sospechoso
    sabotaje: boolean               // tamper / puerta forzada
    timbre: boolean                 // pulsación del timbre integrado
    offlineAntesCheckin: boolean    // cerradura caída con check-in próximo
    offlineLeadHoras: number        // default 12 — antelación del aviso offline
  }
}
```

Valores por defecto en un `CONFIG_ACCESO_DEFAULT` (módulo puro, testeable). El ventilador mantiene su
`ConfigAuto` actual sin cambios.

## Componentes

### Datos
- **Ahora (Fase 0/1):** añadir columna **`categoria text`** a `domotica_dispositivos` (la devuelve
  `tuyaListDevices`; hoy se descarta). Backfill al pulsar «Buscar dispositivos». Deriva el **tipo**.
- **Fase 2:** tabla **`domotica_acceso_pin`** (`dispositivo_id`, `smoobu_apartment_id`, `reserva_ref`,
  `pin` o su referencia en Tuya `tuya_password_id`, `valido_desde`, `valido_hasta`, `estado`
  `activo|caducado|borrado|error`, `created_at`) con **índice único** `(dispositivo_id, reserva_ref)` para
  idempotencia (un PIN por reserva y puerta), mismo patrón que `domotica_log`.

### Lib (`apps/plataforma/lib/domotica/`)
- **`tipo.ts` (puro, testeable):** `tipoDispositivo(categoria) → 'ventilador' | 'acceso' | 'otro'` +
  `CONFIG_ACCESO_DEFAULT`. Mapea las categorías Tuya conocidas (fan vs access-control/`mk`), default `'otro'`.
- **`acceso.ts`:** cliente de la Tuya Cloud API para control de acceso (sobre el `request`/firma de
  `tuya.ts`): `listarPins`, `listarTarjetas`, `listarAccesos(records)`, `abrirMomentaneo`, y para Fase 2
  `crearPinTemporal`/`borrarPin` (con el flujo ticket+AES si el aparato lo exige). Cada función aislada y
  con `try/catch` propio: si el NIVIAN no expone algo por cloud, devuelve «no soportado», no rompe.
- **`programador-acceso.ts` (Fase 2, puro):** decide, dado un set de reservas + config + PINs ya hechos, qué
  PIN crear/borrar por reserva (idempotente por `reserva_ref`), reutilizando `HORARIOS_PISO` para la ventana.

### API (`app/api/sivra/domotica/acceso/`)
- `GET /acceso/[id]` — **sonda**: spec/DPs + PINs + tarjetas + accesos + batería/señal (cada bloque con su
  estado ok/no-soportado). Sesión de usuario.
- `POST /acceso/[id]/abrir` — apertura momentánea (pulso). Sesión de usuario. Registra en `domotica_log`.
- **Fase 2:** `POST /acceso/[id]/pin` (crear/manual), `DELETE /acceso/[id]/pin/[ref]`, y cron
  `GET /acceso/programador` (auth `CRON_SECRET`) que recorre reservas de Smoobu y sincroniza PINs.

### UI (`app/(usuario)/sivra/domotica/`)
- La tarjeta se pinta según `tipoDispositivo`: **ventilador** = controles actuales; **acceso** = estado
  online + batería/señal, lista de PIN/tarjetas, últimos accesos, botón «Abrir» (si `config.botonAbrir`), y
  un bloque de **configuración editable** (todos los campos de `ConfigAcceso`). Responsive (cards apiladas,
  botones ≥44 px) y listas largas plegadas con montaje perezoso (reglas globales del repo).

## Catálogo de features (todas incluidas, con su fase y su config)

| Feature | Fase | Ajuste editable |
|---|---|---|
| Distinguir tipo de aparato (ventilador/acceso) | 0/1 | — (automático por categoría) |
| Sonda: listar PIN/tarjetas/usuarios + accesos | 0 | — (read-only) |
| Batería + calidad de señal en panel | 1 | — (se muestra si el DP existe) |
| Botón «Abrir» momentáneo | 1 | `botonAbrir` |
| PIN automático por reserva (check-in→check-out) | 2 | `autoPin`, `pinLongitud`, `usarHorarioPiso`, `margen*Min` |
| Entrega del PIN (huésped / aviso a ti / ambos / manual) | 2 | `entrega` |
| Ventana horaria real del piso (`HORARIOS_PISO`) | 2 | `usarHorarioPiso` |
| 1 cerradura ↔ N pisos (BustoTavera) | 2 | `smoobuApartmentIds[]` |
| Auto-borrado del PIN tras check-out | 2 | `autoBorrarTrasCheckout` |
| PIN dentro del mensaje de bienvenida del agente de huéspedes | 2 | `entrega='huesped'` (reusa `procesarMensajeHuesped`) |
| Códigos/tarjetas fijos para limpiadoras/mantenimiento/maestro | 2 | `codigosFijos[]` |
| Aviso de cerradura offline antes de un check-in | 2 | `alertas.offlineAntesCheckin`, `offlineLeadHoras` |
| Alertas: primera entrada / fuera de ventana / sabotaje / timbre | 2 | `alertas.*` |

## Manejo de errores
- **Aparato offline** (BustoTavera): panel lo marca offline; lo que exige estar online (abrir, y según la
  sonda, crear PIN online) se deshabilita con motivo. La lista de PINs/accesos puede seguir leyéndose del
  cloud si Tuya los cachea.
- **API no soportada por el aparato:** cada bloque de la sonda reporta «no soportado» sin 500.
- **Fase 2 idempotencia:** `domotica_acceso_pin` con índice único `(dispositivo_id, reserva_ref)` +
  `ON CONFLICT DO NOTHING`; el cron nunca duplica PIN aunque coincidan dos pasadas.
- Errores del cron/programador → `tgAlert` (patrón existente) + fila en `domotica_log`.

## Testing
- Puro con `node --test`: `tipoDispositivo`, `CONFIG_ACCESO_DEFAULT`, y (Fase 2) `programador-acceso`
  (ventanas + idempotencia por reserva, reusando `HORARIOS_PISO`).
- Llamadas a Tuya: no se testean en local (red bloqueada); se validan desplegando y con la sonda.

## Seguridad
- Todas las rutas con `getSession()`. El cron con `CRON_SECRET`.
- «Abrir» = pulso momentáneo, la puerta se cierra sola; **nunca** modo mantener-abierta.
- Los PIN se tratan como credenciales: no loguear el valor en claro donde no haga falta; en `domotica_log`
  guardar referencia/rango de validez, no el PIN en texto si se puede evitar.
- Envs Tuya ya existentes (`TUYA_CLIENT_ID/SECRET`), sin secretos nuevos.

## Preguntas que resuelve la sonda (antes de implementar Fase 2)
1. ¿El NIVIAN expone gestión de PIN por Cloud API (crear/listar/borrar)? → si no, la Fase 2 cambia de
   enfoque o se descarta.
2. ¿Online password o offline password? → decide robustez y la relevancia del aviso offline.
3. ¿Expone registro de accesos, batería, tamper, timbre? → confirma qué alertas son reales.
4. ¿Categoría Tuya exacta (`mk`/otra)? → afina `tipoDispositivo`.
