# Spec: Agente de contabilidad conversacional

**Fecha:** 2026-07-03  
**Rama:** `claude/ai-accounting-agent-3a9o22`

## Contexto — por qué

Hoy la contabilidad de Alberto se lleva por **agentes de tandas** (batch) que corren solos:
`facturas-correo` (skill), el agente de facturas de proveedor (`lib/agente-facturas/pagos.ts`,
prefijo Telegram `pago_`), el de revisión de movimientos (`lib/agente-movimientos.ts`, `mov_`) y la
pestaña **Gastos** de `/finanzas`. Funcionan, pero Alberto **no puede hablar con ellos**: son pasadas
programadas o botones sueltos, no una conversación. Además el conocimiento de su rutina está disperso
en reglas (`banca_destino_reglas`, `gastos_reglas`) y en la cabeza de Alberto — cada agente vuelve a
empezar "en blanco".

Este cambio añade una **capa conversacional con memoria** encima de esa maquinaria: un único agente
al que Alberto **le habla** (por Telegram y por un panel en `/finanzas`), que **consulta y actúa**
sobre sus finanzas con confirmación, al que puede **subirle un ticket/factura** (foto o PDF), y que
**va aprendiendo su rutina** (reglas + hábitos + estructura) para no repetirse.

**Resultado buscado:** "hablar con mi contable" — pregúntale, mándale un ticket, confírmale una
acción, y que la próxima vez ya lo sepa.

**Principio rector:** el agente **no reescribe** la maquinaria existente de extracción/conciliación/
pago. Es **orquestador + memoria + conversación** sobre las piezas canónicas. Punto único de entrada,
no una cuarta implementación paralela.

---

## Arquitectura — un cerebro, dos bocas

```
  Telegram  ─┐                        ┌─ lib/contable/contexto.ts   (arma contexto por turno)
             ├─→  lib/contable/cerebro.ts  ─┼─ lib/contable/memoria.ts    (lee/escribe aprendizaje)
  Panel web ─┘        (aiComplete)          ├─ lib/contable/acciones.ts   (ejecuta, ya confirmado)
                                            └─ lib/contable/documentos.ts (foto/PDF → factura)
                                                        │
                        reutiliza ──────────────────────┤
                                                        ├─ ai-client.ts::aiExtractInvoice
                                                        ├─ agente-facturas/extraer.ts::extraerDesdeBuffer
                                                        ├─ agente-facturas/procesar.ts, imputar.ts, pagos.ts
                                                        ├─ factura-ocr.ts::ocrFactura/casarFactura
                                                        ├─ agente-movimientos.ts (clasif. movimientos)
                                                        └─ agente-facturas/anomalias.ts, avisos.ts
```

Todo vive en **`apps/plataforma`** (es la pasarela IA y tiene todos los datos financieros + el
webhook de Telegram). Multi-tenant: **todo scoped por `cuenta_id`** de Alberto.

---

## Componentes

### 1. Cerebro — `lib/contable/`

Fichero nuevo por responsabilidad (siguiendo el patrón `lib/sivra/agente-huesped/`):

- **`contexto.ts`** — `construirContexto(cuentaId, { canal }): Promise<ContextoContable>`. En cada
  turno arma: saldos/cuentas, últimos movimientos, bandeja "por revisar", facturas pendientes
  (`facturas_proveedor` estado ≠ pagada), foto fiscal del año (reutiliza el motor de
  `lib/fiscal-deducciones.ts` / `lib/comparativa-declaracion.ts`), **memoria aprendida** (ver §2) y
  las últimas N conversaciones de `contable_log`. Es read-only.
- **`cerebro.ts`** — `responder(cuentaId, mensajes[], { canal }): Promise<RespuestaContable>`.
  Llama a `aiComplete(mensajes, { system, model, maxTokens, timeoutMs })` (multi-turno, mismo patrón
  que `agente-huesped/decidir.ts`). El `system` incluye el contexto de §1 + la memoria. La respuesta
  del modelo puede traer **dos canales laterales** en líneas propias (patrón `GUARDAR_APRENDIZAJE:`
  del agente de precios en `app/api/agente/chat/route.ts`):
  - `ACCION: {tipo, params}` → una acción a proponer/confirmar (§4).
  - `APRENDER: {clave, insight}` → un hábito a guardar en memoria (§2).
  `RespuestaContable = { texto, acciones: AccionPropuesta[], aprendizajes: Aprendizaje[] }`.
- **`acciones.ts`** — ejecuta acciones **ya confirmadas** (§4). Reutiliza los writers existentes; no
  duplica SQL de negocio.
- **`memoria.ts`** — lee/escribe las tablas de memoria (§2).
- **`documentos.ts`** — `procesarDocumento(cuentaId, buffer, mimeType, fileName): Promise<...>` →
  reutiliza `extraerDesdeBuffer` (PDF/imagen → factura) y propone clasificar+archivar+conciliar
  (§5). No implementa OCR nuevo.

**Modelo:** corre sobre **NVIDIA NIM (Llama)**, no Claude (Anthropic se retiró del monorepo).
Recomendado: modelo fuerte para la charla (`AGENTE_CONTABLE_MODEL || meta/llama-3.1-405b-instruct`,
como el agente de huéspedes) y el de visión para documentos (`meta/llama-3.2-90b-vision-instruct`,
el que ya usa `aiExtractInvoice`). Fallback NIM→Groq automático de `core-ai`.

---

### 2. Memoria — "aprende tu rutina"

Tres tipos de memoria; **dos ya existen, se reutilizan**:

- **Reglas de clasificación** (comercio→destino) → tabla existente **`banca_destino_reglas`**
  (writer: `agente-movimientos.ts::aprenderReglaMovimiento`). El agente aprende reglas hablando, igual
  que hoy por botones.
- **Reglas de factura** (fingerprint→categoría/propiedad) → tabla existente **`gastos_reglas`**
  (writer: `imputar.ts::reforzarRegla`).
- **Hábitos / preferencias en texto libre** → tabla NUEVA **`contable_memoria`** (calcada de
  `pricing_aprendizaje`):
  ```sql
  CREATE TABLE IF NOT EXISTS contable_memoria (
    id          BIGSERIAL PRIMARY KEY,
    cuenta_id   UUID NOT NULL,
    clave       TEXT NOT NULL,              -- ej. 'criterio_gasto', 'energia_xxi', 'estructura_pisos'
    insight     TEXT NOT NULL,              -- ej. 'Meto todo el gasto en el año, nunca amortizo de oficio'
    metricas    JSONB,                      -- opcional (contadores, fechas)
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (cuenta_id, clave)
  );
  ```
  Se lee en `construirContexto` (top ~40 por `updated_at`) y se inyecta en el `system` como "LO QUE
  SÉ DE TU RUTINA". Se escribe por el canal `APRENDER:` (upsert `ON CONFLICT (cuenta_id, clave)`).

- **Traza de conversación/acciones** → tabla NUEVA **`contable_log`** (también hace de historial en
  Telegram, donde no hay hilo externo tipo Smoobu):
  ```sql
  CREATE TABLE IF NOT EXISTS contable_log (
    id          BIGSERIAL PRIMARY KEY,
    cuenta_id   UUID NOT NULL,
    canal       TEXT NOT NULL,              -- 'telegram' | 'web'
    rol         TEXT NOT NULL,              -- 'user' | 'assistant'
    mensaje     TEXT,
    accion      JSONB,                      -- acción ejecutada, si la hubo
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX ON contable_log (cuenta_id, created_at DESC);
  ```

Ficheros de migración: `prisma/sql/2026-07-03_contable_memoria.sql`,
`prisma/sql/2026-07-03_contable_log.sql`, `prisma/sql/2026-07-03_contable_pendiente_tg.sql` (§6).

---

### 3. Boca web — panel de chat en `/finanzas`

- **`app/api/contable/chat/route.ts`** (nuevo) — `POST { mensaje, history[], adjunto? }`, auth
  `requireSession()`, scoped por `cuenta_id` de la sesión. Llama a `cerebro.responder`. Si el modelo
  propone acciones, las devuelve como `acciones[]` (no las ejecuta) para que la UI muestre un botón de
  confirmar. Si hay `adjunto` (base64), pasa por `documentos.procesarDocumento` primero. Escribe el
  turno en `contable_log`.
- **`app/api/contable/accion/route.ts`** (nuevo) — `POST { accionId | accion }` → ejecuta la acción
  confirmada vía `acciones.ts`. Devuelve el resultado para refrescar la UI.
- **Componente de chat** en `/finanzas` (nueva pestaña `?tab=contable` o panel lateral), modelado
  sobre el chat del agente de precios (`app/api/agente/chat` + su UI). Incluye `<input type="file">`
  para subir ticket/PDF (patrón de `sivra/expenses/page.tsx`). Responsive obligatorio (regla global):
  usable ≥320px, modal/panel al 95vw en móvil.

---

### 4. Acciones con confirmación

El agente **lee libre, escribe confirmado**. Cada `ACCION:` del modelo se muestra como propuesta
(botón en Telegram / tarjeta en web) y solo se ejecuta con OK explícito. Catálogo v1 (todas
reutilizan writers existentes):

| `tipo` | Qué hace | Reutiliza |
|---|---|---|
| `clasificar_cargo` | Fija `destino` (+`propiedad_id`) de un movimiento y aprende regla | `agente-movimientos.ts` + `banca_destino_reglas` |
| `marcar_deducible` / `amortizable` | Toggle en `movimientos_bancarios` | UPDATE existente de `/finanzas` |
| `conciliar_factura` | Casa factura↔movimiento, marca `conciliado`+`factura_ref` | `factura-ocr.ts::casarFactura` / `pagos.ts::conciliarConBanco` |
| `dar_alta_gasto` | Alta de factura extraída como `gastos` (dedupe+regla) | `procesar.ts::procesarFactura` |
| `gestionar_pago` | Aprobar/aplazar/rechazar factura de proveedor | `pagos.ts` (`aprobarPago`…) |
| `lanzar_pasada_facturas` | Dispara escaneo de correo/proveedores | `pagos.ts::escanearNuevasFacturas` |
| `guardar_habito` | Upsert en `contable_memoria` | `memoria.ts` |

⚠️ **Regla fiscal dura:** `amortizable` **nunca** de oficio — solo si Alberto lo pide expresamente
(canónico en skill `perfil-fiscal`). El agente por defecto propone gasto corriente 100% del año.

---

### 5. Documentos — foto de ticket / PDF de factura

**La maquinaria ya existe** (ver inventario en el análisis): el agente solo la orquesta.

- **Web:** `<input type="file">` → base64 → `/api/contable/chat` con `adjunto` →
  `documentos.procesarDocumento`.
- **Telegram:** el webhook capta `message.photo` (mayor resolución) o `message.document` (PDF) →
  descarga por la File API de Telegram (`getFile` → download) → buffer → `documentos.procesarDocumento`.
- **Flujo interno:** `extraerDesdeBuffer(buffer, mimeType, fileName)` → factura estructurada →
  el cerebro propone: **clasificar + archivar en Drive (`agente-facturas/drive.ts::subir`) + conciliar
  con el banco** → Alberto confirma → `acciones.ts` ejecuta (`procesarFactura` / `casarFactura`).
- **NO crear un extractor nuevo.** Punto de entrada canónico = `extraerDesdeBuffer` (que ya envuelve
  `aiExtractInvoice`). De paso, `sivra/expenses/parse-invoice/route.ts` (que reimplementa la llamada
  NIM inline) debería migrarse a `aiExtractInvoice` para eliminar la deriva — anotado como limpieza
  oportunista, no bloqueante.

---

### 6. Boca Telegram — texto libre + `cont_` + documentos

Extensión de `app/api/sivra/mensajes/telegram-webhook/route.ts` (webhook único del bot):

- **(a) Rama de botones `prefix === 'cont'`** (sección A del webhook): `cont_ok:<accId>` /
  `cont_no:<accId>` para confirmar/descartar una acción propuesta. El detalle de la acción se guarda
  en tabla NUEVA **`contable_pendiente_tg`** (calcada de `mensajes_pendientes_tg`):
  ```sql
  CREATE TABLE IF NOT EXISTS contable_pendiente_tg (
    id            BIGSERIAL PRIMARY KEY,
    cuenta_id     UUID NOT NULL,
    accion        JSONB NOT NULL,          -- {tipo, params}
    tg_message_id BIGINT,
    estado        TEXT NOT NULL DEFAULT 'pendiente',  -- pendiente|confirmada|descartada
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  ```
- **(b) Manejador de TEXTO LIBRE genérico** (el hueco que hoy no existe): un mensaje que no es
  callback ni `reply_to_message` de un `force_reply` cae hoy en el `return {ok:true}` final y se
  ignora. Se añade **al final**, como catch-all: si el `chat_id` es el de Alberto (`TELEGRAM_CHAT_ID`)
  y el texto no lo consumió ningún flujo previo → `cerebro.responder(cuentaId, [...historial,
  {role:'user', content: texto}], { canal:'telegram' })`. Historial = últimos turnos de `contable_log`.
  Respuesta por `tgSend`; si trae acción, `tgSendButtons` con `cont_ok`/`cont_no`.
  ⚠️ **Cuidado de orden:** el catch-all va **después** de todas las ramas existentes (`pago_`,
  `deduccion_`, `mov_`, `hsp_`, y el reply de `force_reply`) para no secuestrar sus flujos.
- **(c) Foto/documento** (`message.photo` / `message.document`) → §5.
- **Resolución de `cuenta_id`:** Alberto es único operador → `cuenta_id` fijo por env/config
  (mismo que ya usan `pago_`/`mov_`). No hay multiusuario en Telegram v1.

---

### 7. Proactividad — que te hable él primero

Reutiliza crons + avisos existentes; el agente añade el toque conversacional/memoria:

- **Resumen periódico** (diario/semanal) a Telegram: reutiliza `pagos.ts::resumenSemanal` y
  `resumen-mensual.ts`, enriquecido con "te faltan N por conciliar / la luz de X no ha entrado".
- **Cadencias que aprende y recuerda:** EMASESA bimestral (meses impares), SIQUE fin de mes, luz por
  CUPS → reutiliza `anomalias.ts::recurrentesQueFaltan` / `luzPorPisoQueFalta` +
  `avisos.ts::avisaRecurrentesQueFaltan`. Los patrones aprendidos viven en `contable_memoria`.
- **Huérfanos y anomalías:** cargos sin factura (❗), facturas sin cargo, duplicados, "3× lo normal
  de ese comercio" → `anomalias.ts` + avisos, con pregunta conversacional.
- **Avisos fiscales con oportunidad:** atado a `perfil-fiscal` / `fiscal-novedades` /
  `lib/fiscal-deducciones.ts` — modelo 130 trimestral de Pilar, límite €500/persona seguro salud,
  720 si IBKR > 50k, "si metes esta factura este año bajas cuota".

Disparo: los triggers/crons ya existentes de plataforma llaman a una función `resumenProactivo(cuentaId)`
en `lib/contable/proactivo.ts`. Sin cron nuevo obligatorio en v1 (se engancha a los que hay).

---

### 8. Onboarding de contexto (una vez)

Un flujo inicial (por chat) donde Alberto le cuenta su estructura (pisos, quién tributa qué, cuentas,
criterios) y el agente lo guarda en `contable_memoria` con claves estables (`estructura_pisos`,
`criterio_gasto`, `cuentas`, `tributacion`). A partir de ahí arranca "sabiendo". Semilla inicial
opcional desde las skills `perfil-fiscal` / `facturas-correo` (mapa piso→tributación ya documentado).

---

## Ficheros afectados

| Fichero | Cambio |
|---|---|
| `prisma/sql/2026-07-03_contable_memoria.sql` | Migración — memoria de hábitos |
| `prisma/sql/2026-07-03_contable_log.sql` | Migración — traza/historial |
| `prisma/sql/2026-07-03_contable_pendiente_tg.sql` | Migración — estado de confirmación Telegram |
| `apps/plataforma/lib/contable/contexto.ts` | Nuevo — contexto por turno |
| `apps/plataforma/lib/contable/cerebro.ts` | Nuevo — llamada IA multi-turno + canales laterales |
| `apps/plataforma/lib/contable/acciones.ts` | Nuevo — ejecutores (reutilizan writers existentes) |
| `apps/plataforma/lib/contable/memoria.ts` | Nuevo — lee/escribe memoria |
| `apps/plataforma/lib/contable/documentos.ts` | Nuevo — orquesta extracción (reutiliza) |
| `apps/plataforma/lib/contable/proactivo.ts` | Nuevo — resúmenes/avisos (reutiliza crons) |
| `apps/plataforma/app/api/contable/chat/route.ts` | Nuevo — boca web |
| `apps/plataforma/app/api/contable/accion/route.ts` | Nuevo — ejecutar acción confirmada |
| `apps/plataforma/app/(usuario)/finanzas/*` | Panel/pestaña de chat + input de subida |
| `apps/plataforma/app/api/sivra/mensajes/telegram-webhook/route.ts` | Rama `cont_`, catch-all texto libre, foto/documento |
| `apps/plataforma/lib/ai-client.ts` | (Opcional/limpieza) que `parse-invoice` use `aiExtractInvoice` |

---

## Fases de entrega

El destino es "lo más completo"; esto es solo el orden para no hacer un big-bang:

1. **Cerebro + memoria + panel web, solo responder** (Q&A sobre finanzas, aprende hábitos).
2. **Acciones con confirmación** (clasificar, deducible, conciliar, pagos) — web.
3. **Documentos** (foto/PDF → extraer → archivar → conciliar) — reutiliza maquinaria.
4. **Telegram** (texto libre + confirmaciones + documentos) + proactividad + onboarding.
5. **(Backlog) Voz** — notas de voz por Telegram con transcripción.

---

## Lo que NO incluye esta versión

- **Voz / transcripción** (fase posterior; depende de si NIM/Groq da STT razonable).
- **Multiusuario en Telegram** (Alberto es único operador; `cuenta_id` fijo).
- **Unificar las dos vías de factura** (`gastos` contabilidad vs `facturas_proveedor` pagos) — se
  respetan ambas; el agente elige la correcta por intención, no se fusionan las tablas.
- **Cron nuevo dedicado** para proactividad (se engancha a los triggers existentes; un cron propio
  puede añadirse después).
- **Migrar `facturas_drive` a multi-tenant** (fuera de alcance; se anota como deuda conocida).

---

## Verificación (end-to-end)

- **Web Q&A:** en `/finanzas` preguntar "¿cuánto llevo en luz este mes por piso?" → respuesta
  coherente con `movimientos_bancarios` (contrastar con SQL directo). Preguntar "¿qué facturas me
  faltan por conciliar?" → cuadra con la bandeja.
- **Aprendizaje:** decirle "de ahora en adelante NETFLIX es de los pisos" → verificar fila en
  `banca_destino_reglas`; decirle un hábito ("nunca amortices de oficio") → fila en `contable_memoria`;
  en un turno posterior comprobar que lo respeta (aparece en el contexto).
- **Acción con confirmación:** pedir "clasifica ese cargo de Endesa como dúplex" → propone acción →
  confirmar → `UPDATE` real en `movimientos_bancarios` + regla; sin confirmar → nada escrito.
- **Documento:** subir una foto de ticket y un PDF de factura → `extraerDesdeBuffer` devuelve
  proveedor/fecha/importe → propone conciliar → confirmar → `conciliado=true`. Probar un PDF ilegible
  → degrada a "no he podido leerlo", no inventa importe.
- **Telegram:** escribir texto libre al bot → responde por el cerebro; verificar que NO secuestra un
  flujo `mov_`/`pago_`/`hsp_` en curso (orden del catch-all). Enviar foto → mismo flujo de documento.
- **Responsive:** panel de chat usable en móvil ≥320px (regla global).

---

## Tests mínimos

- `cerebro.responder`: parsea correctamente `ACCION:`/`APRENDER:` del texto del modelo y separa el
  texto visible de los canales laterales (incluye caso sin canales, caso con ambos, caso malformado).
- `memoria`: upsert `contable_memoria` respeta `UNIQUE (cuenta_id, clave)` (actualiza, no duplica).
- `documentos.procesarDocumento`: PDF legible → factura estructurada; imagen → vía visión; ilegible →
  `null`/mensaje, nunca importe inventado.
- Telegram catch-all: un mensaje que casa una rama existente (`mov_`/reply `force_reply`) NO llega al
  cerebro; texto libre suelto SÍ.
- `acciones`: cada `tipo` escribe donde debe y es idempotente/segura sin confirmación previa (no
  ejecuta si `contable_pendiente_tg.estado != 'confirmada'`).
