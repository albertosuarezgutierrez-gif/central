# Diseño: emisión asistida por el robot del tarificador (10/10/2026)

> Estado (10/10/2026): **IMPLEMENTADO en código, apagado** (F0+F1 juntas para Allianz Comunidades). Falta: aplicar
> `apps/asegura/prisma/sql/2026-10-10_tarificador_emision.sql`, poner las envs y una primera prueba con Alberto delante.
> Decisiones de Alberto: sin tope diario; solo él solicita (`TARIFICADOR_EMISION_SOLICITANTE`) y autoriza
> (`TARIFICADOR_EMISION_TELEGRAM_ID` en asegura + `from.id == TELEGRAM_CHAT_ID` en plataforma + firma HMAC del cuerpo con `TARIFICADOR_EMISION_WEBHOOK_SECRET`, que el Bearer de operador solo no sustituye); solicitud 24 h, token 15 min;
> tolerancia 0 €; IPID obligatorio (`presupuesto.ipid_huella`, se copia al firmar; los aceptados antes no emiten);
> anulación de la vieja MANUAL (no se escribe `presupuesto.emitido_at`); interruptor `TARIFICADOR_EMISION_ACTIVA=1` en
> asegura Y como fly secret de la máquina. Diferencias con lo de abajo: el token NO se crea al pulsar sino al entregarlo a
> la máquina 2 (una sola entrega, `token_hash IS NULL`), y la emisión pide `trabajoOrigenId` (la tarificación cuyo riesgo
> se emite). Lo que ePAC enseña DESPUÉS del «Aceptar» de Tarificar no está grabado: sin nº de póliza inequívoco el trabajo
> queda `requiere_humano` (incierto) y se mira el portal. Código: `module-tarificacion/src/emision.ts`,
> `tarificador-rpa/src/{emision,guard}.ts`, `asegura/lib/tarificador-emision*.ts`, `plataforma/lib/tarificador-emision-asegura.ts`.
> Sin datos personales en este documento.

## 0. Principios
1. Por defecto sigue todo cerrado: sin token válido, el guard aborta como hoy (`error_definitivo`, tipo `emision`).
2. Emitir es un acto aparte, no una fase más de tarificar: trabajo con `modo = 'emision'`, no se reutiliza un trabajo de tarificación.
3. La autorización es de UN presupuesto aceptado, UNA opción, UN precio, UNA vez. Cualquier cambio invalida el token.
4. Fallar cerrado: ante duda (token, hash, flag, tope, BD ilegible) no se emite.

## 1. Precondición: aceptación del cliente (ya existe)
Flujo vivo: corredor prepara el presupuesto en `plataforma` (`/correduria`) → `apps/asegura` (`/api/operador/presupuesto`)
lo envía con enlace/código de acceso (correo o WhatsApp) → el cliente lo abre en `apps/asegura-portal`
(`/boveda/presupuesto/[id]`: `Comparativa`, `AceptarOpcion`) → firma con OTP vía `POST /api/presupuesto/firma`
(`preparar` → `codigo` → `firmar`, casilla «autorizo la emisión»). Reglas puras en
`packages/module-seguros/src/aceptacion-presupuesto.ts` (el texto firmado cita la huella IPID de la opción).

**Qué prueba la aceptación** (tabla `seguros.presupuesto`, migración `2026-09-23k`):
- `aceptado_at` + `firma_id` (→ `seguros.firma`) + `opcion_elegida_id` (→ `presupuesto_opcion`) + `documento_texto`;
  el CHECK `presupuesto_aceptado_con_firma` impide `aceptado_at` sin los tres.
- La opción elegida lleva `compania`, `producto`, `prima_eur`, `firmeza`.
- `emitido_at` / `poliza_emitida_id` ya existen: sirven de sello «ya emitido».
- Ojo: `presupuesto.via` = `codeoscopic` | `ofertas`. El robot RPA corresponde a `ofertas` (PDF de compañía): el texto firmado dice
  «autorizo al mediador a gestionar la contratación con la compañía», que es exactamente lo que cubre emitir.

**Huecos mínimos a cerrar** (no existe prueba estructurada):
- IPID: solo consta como huella dentro de `documento_texto`. Añadir `presupuesto.ipid_huella text` (copiada al firmar) y
  exigirla no nula para emitir. Si falta: no se emite y se dice «IPID no consta», no «no aplica».
- Vínculo trabajo↔presupuesto: `tarificacion_trabajos` solo tiene `oportunidad_id`/`cliente_id`. Añadir `presupuesto_id` + `opcion_id`.
- Presupuesto no caducado (`vence_el`), no retirado (`retirado_at` nulo), `emitido_at` nulo.

## 2. Flujo
```
presupuesto aceptado ─► corredor/Alberto pide «Emitir» (encola trabajo modo=emision, presupuesto_id, opcion_id)
  ─► worker: login → rellena hasta la pantalla PREVIA a emitir → NO pulsa → captura + lee prima y datos de pantalla
  ─► estado `pendiente_autorizacion_emision` (libera la máquina; lease no vivo)
  ─► orquestador: calcula hash_datos, compara prima de pantalla con prima_eur de la opción aceptada
        (si difiere más de 0,00 € → `requiere_humano`, NO se pide autorización)
  ─► Telegram (tgSendPhoto + botones): cliente (iniciales), compañía, ramo, prima, nº de trabajo, captura
        [✅ Emitir]  [❌ Cancelar]      callback_data: `emi_ok:<trabajo_id>` / `emi_no:<trabajo_id>`
  ─► Alberto pulsa ─► webhook (plataforma): verifica secreto + `cb.from.id == TELEGRAM_CHAT_ID`
        ─► servidor emite token de un solo uso {trabajo_id, hash_datos, expira = +15 min}; guarda SOLO su hash
        ─► trabajo → `autorizado_emision`; se re-encola la reanudación
  ─► worker reanuda: relogin, vuelve a la pantalla previa, relee prima+datos, recalcula hash
        ─► si hash ≠ token.hash_datos → aborta `requiere_humano` (token se consume igualmente)
        ─► canjea el token (UPDATE atómico `consumido_at IS NULL AND expira > now()`); si 0 filas → no emite
        ─► guard-emision con permiso `emitirUnaVez` para ESE selector (botón final) y nada más
        ─► captura nº de póliza + PDF/captura → `ok_emitido`; registra `emitido_at`/`poliza_emitida_id`
        ─► Telegram: «Emitida póliza <nº>» + captura
```
Prefijo `emi`: `parseCallback` de `@central/core-telegram` separa `emi` / acción / args. Hay que cablear el prefijo en
`apps/plataforma/app/api/sivra/mensajes/telegram-webhook/route.ts` (patrón de `ptr`, `pago`, `subr`; la comprobación de
usuario ya existe en ellos con `String(cb.from?.id) !== TELEGRAM_CHAT_ID`). Responder al callback YA y trabajar en `after()`.

**Estados nuevos** (en `estados.ts`, con transiciones y test): `pendiente_autorizacion_emision` (no terminal; caduca a
`cancelado` a las 24 h sin pulsar), `autorizado_emision`, `emitido` (terminal OK). Transiciones:
`en_curso → pendiente_autorizacion_emision → autorizado_emision → en_curso → emitido`; cualquiera → `cancelado`.
La reanudación NO cuenta como reintento de infra; un fallo DESPUÉS de pulsar «emitir» en el portal va a `requiere_humano`
(nunca se reintenta solo: el estado real en la compañía es incierto).

## 3. Controles
| Control | Diseño |
|---|---|
| Por defecto cerrado | `guard-emision.ts` no cambia el comportamiento sin permiso explícito; el permiso es un objeto opaco de un solo uso creado por el runner tras canjear el token, no un booleano global |
| Interruptor general | env `TARIFICADOR_EMISION_ACTIVA=1` en servidor Y en la máquina; ausente/otro valor = nunca. Se lee en cada petición (apagar sin desplegar) |
| Lista blanca | solo (compañía, ramo) con adaptador marcado `emision: true` (fase 1: Allianz Comunidades) |
| Tope diario | `TARIFICADOR_EMISION_TOPE_DIARIO` (por defecto 3); cuenta autorizaciones canjeadas del día; tope alcanzado = no se pide autorización |
| Solo Alberto | secreto del webhook + `from.id == TELEGRAM_CHAT_ID` (no basta `emisorAutorizado` por chat: en grupo cualquiera pulsa) ; y el token no sale del servidor |
| Token | 32 bytes aleatorios; en BD solo SHA-256; atado a `trabajo_id + hash_datos`; 15 min; un uso; viaja por la API interna al worker, nunca por logs ni Telegram |
| Hash de datos | SHA-256 canónico de {compañía, ramo, `presupuesto_id`, `opcion_id`, prima en céntimos, tomador (NIF), riesgo normalizado}. Nunca PII en claro en el log |
| Auditoría | tabla `tarificacion_emision_auditoria` (sección 5), append-only: quién (user id Telegram), cuándo, hash del token, captura previa y posterior, nº de póliza, resultado |
| Credenciales | ya hay `variablesProhibidas`/redacción; añadir test: ni token ni credenciales en `error`, trazas, mensajes de Telegram |
| Idempotencia | índice único parcial: un trabajo `emision` vivo por `presupuesto_id`; `presupuesto.emitido_at` no nulo = 409 duplicado |

## 4. Reutilizar
- **Libro de emisión Codeoscopic** (`apps/asegura/lib/codeoscopic/libro-emision.ts`, `gasto-emision.ts`, `consumo.ts`): su
  ORDEN (libro → tope → reserva escrita ANTES → un intento → cierre con evidencia; «sin desenlace cuenta como gastado») es
  el modelo para el tope diario y para el estado incierto. No sirve tal cual: contabiliza llamadas a Codeoscopic con coste en céntimos.
  Se hace una tabla hermana, no se mezcla. (No he verificado que ese fichero devuelva el 409 de duplicado; la API operador sí usa 409 para `no_enviable`/`ocupado`.)
- **Tabla de trabajos** `seguros.tarificacion_trabajos` (lease, intentos, evidencia, `error`) y la API del orquestador (`api.ts`).
- **Bandeja** (`bandeja.ts`, `ESTADOS_BANDEJA`): `requiere_humano` por emisión incierta aparece ahí; acciones nuevas solo `cancelar`
  (reintentar emisión NO existe: se encola un trabajo nuevo y vuelve a pedir autorización).
- **Telegram** `tgSendPhoto` (captura por bytes), `tgSendButtons`, `tgAnswerCallback`, `tgEditMessage` (quitar botones al pulsar).
- **Evidencia** `evidencia.ts` / `documentos` para capturas y PDF de la póliza.

## 5. SQL (migración aditiva `apps/asegura/prisma/sql/2026-10-XX_tarificador_emision.sql`)
```sql
ALTER TABLE seguros.tarificacion_trabajos
  ADD COLUMN IF NOT EXISTS modo text NOT NULL DEFAULT 'tarificar' CHECK (modo IN ('tarificar','emision')),
  ADD COLUMN IF NOT EXISTS presupuesto_id uuid REFERENCES seguros.presupuesto(id),
  ADD COLUMN IF NOT EXISTS opcion_id uuid REFERENCES seguros.presupuesto_opcion(id),
  ADD CONSTRAINT trabajo_emision_con_presupuesto CHECK (modo <> 'emision' OR (presupuesto_id IS NOT NULL AND opcion_id IS NOT NULL));
-- ampliar el CHECK de estado con: pendiente_autorizacion_emision, autorizado_emision, emitido
CREATE UNIQUE INDEX IF NOT EXISTS idx_trabajo_emision_vivo ON seguros.tarificacion_trabajos (presupuesto_id)
  WHERE modo = 'emision' AND estado NOT IN ('cancelado','error_definitivo');
ALTER TABLE seguros.presupuesto ADD COLUMN IF NOT EXISTS ipid_huella text;

CREATE TABLE IF NOT EXISTS seguros.tarificacion_emision_autorizacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trabajo_id uuid NOT NULL REFERENCES seguros.tarificacion_trabajos(id),
  token_hash text NOT NULL UNIQUE,           -- SHA-256; el token en claro no se guarda
  hash_datos text NOT NULL,
  prima_cents integer NOT NULL CHECK (prima_cents > 0),
  autorizado_por text NOT NULL,              -- user id de Telegram
  autorizado_at timestamptz NOT NULL DEFAULT now(),
  expira_at timestamptz NOT NULL,
  consumido_at timestamptz,
  evidencia_previa_id uuid REFERENCES seguros.documentos(id),
  evidencia_posterior_id uuid REFERENCES seguros.documentos(id),
  numero_poliza text,
  resultado text CHECK (resultado IN ('emitida','hash_distinto','caducada','fallo','incierto')),
  CHECK (expira_at <= autorizado_at + interval '15 minutes')
);
-- RLS activada; el worker NO tiene acceso directo: solo por la API del orquestador. Sin UPDATE/DELETE de auditoría para el rol de app salvo consumir.
```
Canje atómico: `UPDATE ... SET consumido_at = now() WHERE token_hash = $1 AND consumido_at IS NULL AND expira_at > now() AND hash_datos = $2 RETURNING id`.

## 6. Plan por fases
- **F0 (sin emitir)**: SQL + estados + parada en la pantalla previa + aviso Telegram con captura, botón «Emitir» sin efecto (solo registra). Verifica captura, prima leída y hash en un presupuesto real. Guard intacto.
- **F1 (Allianz Comunidades, entorno controlado)**: token + canje + permiso de un uso en guard; flag en ON solo durante la prueba; tope 1/día; Alberto presente.
- **F2**: nº de póliza capturado y volcado a `polizas` (`poliza_emitida_id`, `emitido_at`), confirmación Telegram, anulación de la póliza vieja (carta ya firmada) liberada SOLO tras emitido.
- **F3**: otras compañías/ramos (Allianz RC Pyme, Negocio; Occident), cada una con `emision: true` propio y su pantalla previa grabada.

## 7. Archivos a tocar
`packages/module-tarificacion/src/{estados,guard-emision,bandeja,tipos}.ts` (+ tests) · `services/tarificador-rpa/src/{runner,guard,api,adapters/allianz/*}.ts` ·
`apps/asegura/lib/**` (orquestador: token, canje, tope, auditoría; `presupuesto` al firmar guarda `ipid_huella`) ·
`apps/asegura/app/api/operador/tarificador/*` (encolar emisión, autorizar, canjear) ·
`apps/plataforma/app/api/sivra/mensajes/telegram-webhook/route.ts` (prefijo `emi`) · pantalla de trabajo en `/correduria` (estado y botón «Pedir emisión») · SQL arriba · `docs/CONTEXTO-SESIONES.md`.

## 8. Cepos (verlos fallar antes de darlos por buenos)
1. Sin token / token ajeno / caducado / ya consumido: el guard sigue lanzando `EmisionBloqueadaError`.
2. Flag apagado con token válido: no emite.
3. Hash distinto (prima +0,01 €, otro NIF, otra opción): aborta y consume el token.
4. El permiso solo abre el selector del botón final; cualquier otro `emit|contrat|anul|baja|menu3-5|btnAccept` sigue bloqueado.
5. Callback de otro `from.id` o sin secreto: ignorado, sin token.
6. Doble pulsación / reenvío de webhook: un solo token; segundo canje = 0 filas.
7. Presupuesto sin `aceptado_at`, sin `ipid_huella`, caducado o ya emitido: no se encola ni se pide autorización.
8. Tope diario superado: no se envía el botón.
9. Ni token ni credenciales aparecen en `error`, trazas, logs ni textos de Telegram (test de redacción).
10. Regresión `guardianes.test.ts`: con `modo='tarificar'` el guard es idéntico al actual.

## 9. Riesgos abiertos
- Emisión a medias: el click se da y la compañía no responde → estado incierto. Regla: `requiere_humano` + aviso, nunca reintento automático ni nuevo token sin mirar el portal.
- Pantalla previa distinta del precio aceptado (la compañía reconfirma): la política es parar, no emitir con otra prima.
- Pagos/domiciliación en la compañía: el flujo de cuenta (IBAN firmado en el portal) puede no casar con lo que pide el portal Allianz; por validar en F0.
- Mandato y responsabilidad: confirmar que el texto firmado cubre «emitir en la compañía» también para `via='codeoscopic'` (aquí solo se usa `ofertas`).
- Sesión/CAPTCHA entre la parada y la reanudación (hasta 15 min): la reanudación hace relogin; si hay CAPTCHA, `requiere_humano` y el token caduca.
- Seguridad del chat: si el bot se usa en un grupo, `from.id` es obligatorio; token de bot filtrado = riesgo (mitigado: el botón solo emite si el hash coincide y hay token servidor, pero el atacante con el bot podría pulsar sin ser Alberto solo si suplanta su id, que Telegram no permite).
- Concurrencia con otros agentes editando `guard-emision.ts`: coordinar antes de F1.

## 10. Decisiones abiertas para Alberto
1. ¿Tope diario inicial (propuesta 3) y por compañía o global?
2. ¿Quién pide la emisión: solo tú, o también el corredor desde `/correduria` (tú sigues autorizando por Telegram)?
3. ¿Caducidad del token: 15 min es lo pedido; ¿y 24 h para que la solicitud espere tu botón?
4. ¿Tolerancia de precio: 0,00 € (propuesta) o redondeo de céntimos?
5. ¿Anulación de la póliza vieja: automática tras emitido o manual?
6. ¿Exigir IPID registrado (`ipid_huella`) también para presupuestos ya aceptados anteriores al cambio? (propuesta: sí, se rechazan)
