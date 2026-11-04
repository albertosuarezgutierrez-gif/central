# WhatsApp de Grupo ASegura: respuestas del cliente → CRM (spec, 04/11/2026)

> Decidido por Alberto (sustituye al «modo sombra» de borradores). Base: `apps/asegura/docs/WHATSAPP.md`. Sin código todavía.

## 1. Alcance
- **El sistema NUNCA redacta respuestas libres ni envía nada por WhatsApp.** Alberto escribe desde su móvil con los botones
  `wa.me` que ya existen (coste Meta 0). Cuando el CLIENTE contesta, el agente interpreta la respuesta en el contexto de lo que
  Alberto le mandó (llega como `smb_message_echoes`, Coexistence) y **actúa en el CRM**. Siempre aviso a Alberto por Telegram.
- Cierre del ciclo: el aviso trae un **botón `wa.me` ya escrito** (enlace al presupuesto o enlace `/datos` con lo que falta) que
  pulsa Alberto. Es el mismo patrón que hoy (texto de plantilla de `module-seguros`, no redacción de la IA).
- **Cepos de no-envío se mantienen:** `graph.test.ts:97-102` (sin `/messages` ni `/register`). Nuevo: ningún fichero de
  `lib/whatsapp/` (salvo la descarga de media, §6) contiene `graph.facebook.com`; ninguno llama a `/messages`.
- **No:** responder a teléfonos sin ficha única, pisos/huéspedes (Smoobu), Codeoscopic (de pago: nunca desde aquí).

## 2. Qué existe hoy (gap analysis)
| Pieza | Estado |
|---|---|
| Echoes | `payload.ts:122-128` guarda `smb_message_echoes` como `saliente`; la transcripción los ve como «Corredor» (`analisis.ts:119`). |
| Vínculo echo ↔ recibo/oportunidad | **No existe.** El analizador ve el texto, no sabe de qué recibo/oportunidad era. Sin columna en `2026-10-05b`. |
| Rastro del `wa.me` | Desigual: lead → `registrarWhatsapp(oportunidadId)` (`oportunidad-seguimiento.ts:692`, estructurado); recaptación → `recaptacion_envios` con `mensaje` (`cartera-recaptacion.ts:441`); recibo devuelto → solo NOTA de texto libre sin `recibo_id` (`WhatsappReciboDevuelto.tsx:46`); `/datos` → `registrarDatosPedidosWhatsapp` (`solicitud-datos.ts:335`); `BotonWhatsapp` genérico de ficha/buscador → nada. Todo registra «se ABRIÓ», no «se envió». |
| Acciones (`analisis.ts:26`) | `updateLead`, `createOpportunity`, `updateOpportunity` (fecha solo si vacía, `ejecutor.ts:153`), `createTask`, `updateContact`, `addConversationNote`. **Faltan b) y c).** |
| Contexto de la IA | Ficha, ramos en vigor, oportunidades abiertas (`analizar.ts:155-178`). **Sin recibos.** |
| Media | **No se guarda ni se descarga**: marcador `[imagen]`/`[documento]` + pie (`payload.ts:15,89`); el `media.id` se pierde al minimizar el crudo (`payload.ts:154`). |
| Telegram del analizador | **No hay**: solo auditoría. |
| Póliza → oportunidad | `oportunidadDesdeFichero` (`lib/oportunidad-documento.ts:155`, `leerPoliza`): lee, casa personas por DNI ciego, abre/actualiza oportunidad sin duplicar. Reutilizable tal cual. |
| Bots RPA (gratis) | Cola `tarificacion_trabajos` → worker Fly. Entrada `Formulario*` de `module-tarificacion`; `faltanParaTarificar`/`llegaAPrecio` (`obligatorios.ts:318,350`). Lanzamiento de lead hoy SOLO tras botón de Alberto (`clp_tar`, `tarificacion-lead.ts:3`). |
| Enlace `/datos` | `crearSolicitud` (`solicitud-datos.ts:111`): campos por ramo según lo que sabe la FICHA (`camposSolicitud`, `module-seguros/solicitud-datos.ts:518`), **no** según lo que le falta al bot. |
| Enlace presupuesto | `envio-presupuesto.ts` canal `whatsapp_enlace`: devuelve texto + `wa.me` + código de 6 dígitos (`presupuesto-codigo-whatsapp.ts`); **rota token y código** al generarse. |

## 3. Flujo
1. Alberto pulsa un `wa.me` de plataforma → se registra un **saliente previsto** (§4) con su origen.
2. Alberto envía desde el móvil → llega el echo (`saliente`) → `procesar.ts` lo guarda y lo **casa** con el previsto.
3. El cliente contesta (texto, foto o PDF) → `entrante`. Media: se descarga en el `after()` del webhook (§6).
4. Cron `whatsapp-analizar` (ya existe, ≥10 min de silencio): contexto ampliado con el **último saliente vinculado**
   (tipo + recibo/oportunidad + fecha/importe redactados) y los recibos pendientes/devueltos de pólizas en vigor.
5. Plan → ejecutor (lista blanca ampliada §5) → auditoría → **Telegram a Alberto** con lo hecho, lo propuesto (botones) y el
   `wa.me` siguiente si toca.

## 4. Vínculo saliente ↔ respuesta
- Tabla nueva `seguros.whatsapp_salientes_previstos`: `id, correduria_id, cliente_id, telefono_hash, origen
  ('recibo_devuelto'|'lead'|'recaptacion'|'solicitud_datos'|'presupuesto'|'renovacion'|'generico'), recibo_id, oportunidad_id,
  poliza_id, solicitud_id, texto_hash (sha256 del texto normalizado), abierto_at, abierto_por, mensaje_id (FK mensajes, el echo),
  casado_at`. Todos los `onAbrir` de plataforma pasan a un único `POST /api/operador/whatsapp/saliente-previsto` (el existente
  sigue haciendo lo suyo). `BotonWhatsapp` sin contexto → `origen='generico'`.
- **Casado** (puro, `vinculo.ts`): echo del mismo `telefono_hash` en ≤24 h desde `abierto_at`; si el `texto_hash` coincide →
  `exacto`; si Alberto editó el texto → `aproximado` (solo si hay UN previsto abierto para ese teléfono). Dos previstos
  candidatos y ningún hash exacto → **sin vínculo** (no se elige). Sin vínculo, el analizador trabaja como hoy.
- La respuesta se interpreta contra el saliente vinculado más reciente anterior a ella (≤14 días).

## 5. Acciones y autonomía
| Acción | Disparador típico | Autonomía |
|---|---|---|
| a) `createOpportunity` (existe) | «sí, mírame el de casa» | **Automática** + aviso. Dedupe por ramo ya existe. |
| b1) `proponerFechaCobro` (nueva) | «pásamelo el día 15» sobre recibo devuelto | **Propuesta** ✅ Aplicar/❌. Aplicar = nota + tarea «comprobar cobro» en esa fecha (`origen_trigger='whatsapp_ia'`). El recibo NO se toca: lo manda CIMA/la compañía; no hay columna de fecha prometida (si Alberto la quiere, `recibo_devolucion.pago_prometido` en SQL). |
| b2) `proponerPagado` (nueva) | «ya lo pagué» | **Propuesta**. Aplicar = tarea «verificar cobro» + nota. Cerrar la devolución solo con el botón existente «cobrado de nuevo» (`resolverDevolucion`, `devoluciones-recibo.ts:420`): nunca por la IA. |
| b3) `proponerVencimiento` (nueva) | «renuévalo» / «vence en marzo» | **Propuesta**. Aplicar = la misma escritura que `EditarVencimiento.tsx` (pisa `fecha_fin_vigencia` del seguimiento + `planTareaTrasVencimiento`). |
| c) `leerPolizaRecibida` (nueva, sin IA de texto) | foto/PDF de póliza de otra compañía | **Extracción automática** (`oportunidadDesdeFichero`) + aviso. **Bots: botón** 🤖 Tarificar (ver abajo). |
- Las propuestas (b) se guardan en `whatsapp_propuestas` (estado `pendiente|aplicada|descartada|caducada`, 7 días) y se aplican
  por callback de Telegram (prefijo nuevo `wap_`, registrado en el enrutador de `core-telegram`, handler en plataforma que llama a
  un `POST /api/operador/whatsapp/propuesta` envuelto en `auditado()`). Anti-replay: un solo uso por propuesta.
- **Bots tras c):** los datos leídos alimentan `info_riesgo` (bloque del ramo, sin confirmar) → `faltanParaTarificar` por cada
  bot con `llegaAPrecio=true` (hoy: Mapfre auto/moto, Allianz moto/comunidades). Lanzamiento **con botón** 🤖 (patrón `clp_tar`):
  aunque son gratis, entran con las **credenciales de Alberto** en portales de compañía, dejan rastro allí (proyecto guardado,
  posible alta de cliente en Mapfre, SMS de Generali que reenvía Alberto) y consumen el tope diario. Duda D2 por si quiere auto.
- **Cierre:** si a algún bot le faltan campos → el aviso trae `wa.me` con enlace `/datos` **acotado a esos campos** (falta un
  mapa clave-del-bot → campo de solicitud y un `camposSolicitud(…, { soloClaves })`). Con precio → `wa.me` con el enlace del
  presupuesto: se genera AL PULSAR (callback que llama a `envio-presupuesto` canal `whatsapp_enlace` y responde con el botón URL),
  porque generarlo rota token y código.

## 5 bis. Aprendizaje y autonomía (04/11/2026, decidido por Alberto)
Mismo patrón que el agente de huéspedes de pisos (`apps/plataforma/lib/sivra/agente-huesped/`: aprendizajes, ✏️, auto-envío
por regla pura). Reglas puras en `apps/asegura/lib/whatsapp/aprendizaje-reglas.ts`; consultas en `aprendizaje.ts`.
- **✏️ Modificar** (`wap_ed:<uuid>`): plataforma pide la corrección con force_reply (marca `[wap <uuid>]`); la respuesta va a
  `POST /api/operador/whatsapp/propuesta` `{decision:'modificar', correccion}` → `leerCorreccion` (fecha dd/mm[/aaaa] o
  aaaa-mm-dd y/o observación; inválida → 422 sin tocar nada) → se aplica la versión corregida (payload con la fecha nueva,
  observación en la nota y la tarea). Solo actor `humano:`.
- **Registro** `seguros.whatsapp_aprendizaje` (SQL `apps/asegura/prisma/sql/2026-11-04b_whatsapp_aprendizaje.sql`, aplicado
  el 04/11/2026; RLS sin policies, grants solo `prisma_seguros`, sin DELETE): una fila por propuesta con tipo, origen del saliente,
  extracto REDACTADO (`redactarPii` + nombre, ≤300) del último mensaje del cliente, propuesta original, versión final,
  observación redactada y resolución (`aplicada`/`descartada`/`modificada`, `autonoma`, `deshecha_at`). El extracto se anula
  con la conversación (retención, purga «personal», supresión). Sin la tabla: no-op, `casos_previos: null`, nunca autónomo.
- **Casos parecidos al prompt**: palabras de contenido en común + mismo origen del saliente (como `similitud-reglas.ts`, sin
  embeddings ni servicios de pago), 6 como mucho con 2 huecos para los más recientes; solo con ficha única y póliza en vigor.
- **Autonomía por TIPO** (`fecha_cobro`, `pagado`, `vencimiento`): racha = aprobadas ✅ SEGUIDAS sin modificar, calculada (no
  guardada). ≥ umbral (`ASEGURA_WHATSAPP_AUTONOMIA_UMBRAL`, por defecto 20; fuera de [5, 1000] o mal formado = nunca) Y flag
  global `ASEGURA_WHATSAPP_AUTONOMIA_ACTIVA=1` (apagado por defecto) → se aplica sola (actor `agente:whatsapp-ia-autonomo`) y
  el aviso lleva **↩️ Deshacer** (`wap_un:<uuid>`): solo `TELEGRAM_CHAT_ID` + actor `humano:`, un uso (UPDATE condicionado),
  vuelve al valor previo guardado en `resultado.previo`; si el dato se cambió después, 409 `cambiado_despues` (no se pisa).
  Cualquier ❌, ✏️ o ↩️ reinicia la racha (el ↩️ cuenta en SU fecha). Una autónoma ni suma ni corta.
- **NUNCA autónomo**: bots RPA de tarificación, Avant2 o cualquier envío a terceros (`TIPOS_AUTONOMIZABLES` = los tres tipos;
  cepo de importaciones). Siguen: ningún envío por API de WhatsApp, una ficha exacta o nada, D4.
- Cepos (`aprendizaje.test.ts`, `whatsapp-propuesta-tg.test.ts`), vistos en rojo: umbral/racha, reset por ❌/✏️/↩️, flag
  apagado, deshacer un uso y solo titular, RPA nunca autónomo, prefijos `wap_*` únicos y plataforma = asegura.
- Pendiente: tras ✏️ el mensaje original conserva sus botones (pulsarlos da 409 «ya resuelta»).

## 6. Media (para c)
- `payload.ts`: conservar `media.id`, `mime_type`, `sha256` del mensaje `image|document` (no PII) en `crudoMinimizado`.
- Descarga en `after()` de `procesar.ts` solo si la conversación tiene **una ficha** y no hay opt-out: `GET /{media-id}` → URL →
  `GET` con Bearer (`corredurias.wa_access_token`), en `lib/whatsapp/media.ts` (único fichero con Graph aparte de `graph.ts`;
  cepo: solo `GET`). Tope 10 MB, mime PDF/JPEG/PNG/HEIC. Se archiva en `documentos` (mismo almacén que `poliza-de-documento.ts`).
- ¿Es una póliza? Lo decide `leerPoliza` (fase `ninguno` = no es documento de seguro → solo nota «imagen recibida»).

## 7. Identidad
- Una ficha exacta o nada (`procesar.ts:170-172`). Teléfono compartido → nada se ejecuta, aviso sin datos.
- «Cliente» = póliza `esCarteraEnVigor()` (`packages/module-seguros/src/cartera-viva.ts:113`), nunca `clientes.tipo`.
- c): si el DNI del tomador leído casa con OTRA ficha distinta a la de la conversación → `revisar` + Telegram; no se mueve nada.
- Recibos al contexto solo de pólizas en vigor de ESA ficha; la IA nunca da ids (los pone el vínculo/servidor).

## 8. PII
- A la IA: transcripción por `redactarPii`, saliente vinculado como `{origen, ramo, fecha, importe}`; nunca DNI, IBAN, nº completo.
- Telegram: nombre de pila + enlace a ficha (`enlaceFichaCliente`, `datos-cotizados.ts:227`); importes `eur()`. El `wa.me`
  del aviso lleva el texto de plantilla (con código del presupuesto solo si Alberto pulsa: ver §5).
- Media: cifrada en reposo como el resto de documentos; retención = la de `documentos`; supresión de conversación la incluye.

## 9. Coste IA
- Sin llamadas nuevas para texto: el mismo análisis por conversación (`iaTexto`, `privado`), prompt +~400 tokens de contexto.
- c) usa la lectura de póliza existente (modelo de visión de `modelosLecturaPoliza`): tope `ASEGURA_WHATSAPP_POLIZAS_MAX_DIA`
  (defecto 10). Todo dentro del tope de 5 €/mes de asegura; sin pasarela → no se lee.

## 10. Tests y cepos (`node --test`, un brazo por aserción, visto en rojo)
1. No-envío: `graph.test.ts` intacto; `media.ts` solo `GET`; ningún fichero llama a `/messages`.
2. Vínculo: exacto, aproximado, dos candidatos → ninguno, fuera de 24 h, otro teléfono.
3. Planificador: b1-b3 nunca escriben, solo crean propuesta; IA con id inventado → rechazo; recibo de póliza no en vigor → rechazo.
4. Callback: propuesta usada dos veces → 409; caducada → no aplica; b2 jamás llama a `resolverDevolucion`.
5. Media: sin ficha única / opt-out → no descarga; mime fuera de lista → no; DNI de otra ficha → `revisar`.
6. Bots: ningún encolado sin callback; `/datos` acotado solo con claves que faltan.

## 11. Prerrequisitos externos (Alberto)
1. Verificación de empresa Meta **aprobada (04/11/2026)**.
2. Pasar el número de la correduría a **WhatsApp Business app** (Coexistence; nunca `register`).
3. Revisión de la app 2876291632747697 (`whatsapp_business_management` + `_messaging`) y **publicarla (Live)**; Embedded Signup
   con «No compartir chats»; abrir la app del móvil cada <14 días.
4. Envs: `ASEGURA_WHATSAPP_ACTIVO=1`, `ASEGURA_WHATSAPP_IA_ACTIVO=1`; SQL nuevos por MCP `Supabase` (no `Supabase_asegura`).

## 12. Tareas para agentes (en orden)
1. `agente-architect`: SQL `whatsapp_salientes_previstos` + `whatsapp_propuestas` + Prisma + grants (no aplicar sin OK).
2. `general-purpose` (sonnet): endpoint saliente-previsto + cambiar los `onAbrir` de plataforma (recibo devuelto con `recibo_id`).
3. `general-purpose`: `vinculo.ts` puro + casado en `procesar.ts` + tests 2.
4. `general-purpose`: contexto ampliado (saliente vinculado + recibos) + acciones b1-b3 en `analisis.ts`/`ejecutor.ts` + tests 3.
5. `general-purpose`: aviso Telegram del analizador + callback `wap_` + `/api/operador/whatsapp/propuesta` + tests 4.
6. `agente-architect`: `media.ts` + `payload.ts` + enganche a `oportunidadDesdeFichero` + tests 1, 5.
7. `general-purpose`: mapa faltantes-bot → campos `/datos`, botón 🤖 y `wa.me` de cierre (presupuesto al pulsar) + tests 6.
8. `verificador-esceptico`: romper cada cepo y verlo en rojo. 9. `agente-mecanico`: `WHATSAPP.md`, catálogo de Telegram.

## Dudas para Alberto
- **D1** b): ¿aplicar con botón (propuesto) o automático con «deshacer»? ¿Quieres columna de «fecha prometida» en el recibo?
- **D2** Bots tras recibir una póliza: ¿botón 🤖 (propuesto) o lanzamiento automático con aviso, dado que usan tus credenciales?
- **D3** ¿Registramos también el `BotonWhatsapp` genérico (ficha/buscador) o solo los que llevan mensaje de plantilla?
- **D4** Ficha sin póliza en vigor (lead/ex-cliente): ¿mismas acciones o solo a) y c)?
