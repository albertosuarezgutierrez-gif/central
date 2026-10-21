# Agente corredor de correo — especificación (21/10/2026)

> Estado: **ESPECIFICACIÓN, sin código.** Fuente: inventario del 21/10/2026 (856 hilos del sector en el Gmail
> de Alberto, saneado, sin PII) + el código vivo del triaje y de los eventos de compañía + el PR #4893.
> Router de la correduría: skill `correduria-crm`; triaje: skill `correo-triaje`; CIMA: skill `cima-ingesta`.

## 0. Riesgos que hay HOY, antes de construir nada

1. **El triaje ya manda correo del sector a proveedores de IA sin DPA UE.** `clasificador.ts::llamarIA` envía
   remitente + asunto + `extracto` (1.500 chars) a **Groq** y, si falla, a **NIM** (EE. UU.) cuando ninguna regla
   decide. Los asuntos de Occident llevan `<TOMADOR>` y `tirea.es` **no está** en `keywords.ts`: un hilo de alta
   CIMA con credenciales en claro puede haber ido ya a la IA. `extraer-poliza.ts` lee pólizas con
   `openrouterVision`. Esto **no lo crea** el agente, pero el agente no puede construirse encima sin cerrarlo (F0, §5).
2. **Ya existe una cola de aprobaciones** (`seguros.aprobacion`, `apps/asegura/lib/aprobaciones.ts`, «Hoy · Esperan
   tu OK»). Su `aprobar` **ENVÍA un correo**. El agente la reutiliza con acciones NUEVAS cuyo `aprobar` escribe en
   BD; **un borrador a una compañía nunca entra por ahí** (se queda en Borradores de Gmail, §4.5).
3. `seguros.documentos` guarda el fichero en `contenido bytea` (≤10 MB), no en `core-storage`. Decisión en §6.

## 1. Objetivo y métricas

Que el correo de compañías (Gmail de Alberto) **complete y vigile** la cartera de CIMA sin sustituirla.

| Métrica | Hoy | Objetivo | Cómo se mide |
|---|---:|---:|---|
| Cobertura de hilos operativos (380 = reconocidos + no reconocidos + otro lector) | 35,8 % (136) | F0 ≥ 55 % · F2 ≥ 85 % | Reejecutar el corpus del inventario (script `probar.mjs`) por fase |
| Precisión en sombra por tipo (lecturas correctas / lecturas emitidas) | — | ≥ 98 % deterministas · ≥ 95 % LLM | Revisión manual de la bandeja sombra (§8) |
| «Ilegibles» declarados (no es error: es honestidad) | — | se cuentan, no se ocultan | `ilegibles` por evento |
| Falsos «falta en CIMA» enviados por Telegram | — | 0 en las 2 semanas de sombra | Alberto marca «no era» |

Fuera de las métricas (por diseño): ruido (28 %) y conversaciones humanas (27,6 %) — no se leen como plantilla.

## 2. Principios (vinculantes)

- **CIMA manda** en pólizas y recibos. El correo **cruza y avisa**; nunca sobrescribe un campo que trae CIMA.
- **Lo que solo trae el correo se escribe**: estado de solicitudes, documentos, tareas, notas, siniestralidad
  declarada por la compañía (como anotación, no como siniestro si CIMA ya lo trae).
- **Dinero o estado de póliza → cola de aprobación 1 clic** (`seguros.aprobacion`), nunca automático.
- **Salientes solo en BORRADOR.** Nada sale sin OK de Alberto para ESE envío.
- **NULL = «no se sabe»**: un campo no leído es `null`, un correo no reconocido es `null`, un lector que reconoce
  pero no sabe leer filas devuelve `ilegibles > 0`. Un `catch` vacío no autoriza a decir «no hay».
- **Identidad**: se empareja por nº de póliza/recibo/solicitud/siniestro + código DGS. Nombre del tomador nunca es
  clave. Dos números distintos no se funden.
- **Alcance de buzón**: solo el Gmail de Alberto. `hola@grupoasegura.es` fuera (los leads siguen su ruta actual).
- **Mandato SEPA de la compañía** (Occident «Suscripción … - Póliza …» recordatorio de firma): se reconoce y se
  **ignora** (sin tarea, sin aviso). Es documento de la compañía.

## 3. Arquitectura por capas

```
IMAP (triaje.ts, cursor) ─► 0. Exclusión de seguridad (antes de parsear cuerpo/adjuntos, §5)
  ─► 1. Triaje (keywords.ts → correo_reglas → IA de categoría SOLO si el proveedor es UE, §6)
  ─► 2. Lectores deterministas (module-seguros: evento-correo-aseguradora, devolucion-correo, pdf-filas)
        └─ null ─► 3. Extractor LLM (cola larga, F2) + validación contra el texto
  ─► 4. Resolución contra cartera (apps/asegura: resolverPolizaEvento, esCarteraEnVigor, oportunidad/solicitud)
  ─► 5. Acciones: AUTO (nota/tarea/documento/estado de solicitud) · APROBACIÓN (dinero/estado) · AVISO (Telegram)
```

- **Capa 2 es la vía rápida y la de referencia.** Un lector determinista gana siempre al LLM; si ambos leen, se
  compara y la discrepancia va a la bandeja (sirve de evaluación continua del LLM).
- **Capa 3 (LLM)** devuelve JSON con esquema cerrado por tipo (`EventoAseguradora` + `liquidacion` + `documento`)
  y **cita literal** de cada valor. Validación: cada nº/importe/fecha debe aparecer **literalmente** en
  cuerpo/adjunto (normalizado: espacios, puntos de miles); si no aparece → `null`. Importes: coma decimal española.
  Confianza < umbral → solo nota «lectura dudosa» en bandeja. El LLM **nunca** decide la acción: la decide el
  mismo despachador puro (`correo-evento.ts`) que ya usan los lectores.
- **Capa 4** reutiliza el puerto `/api/operador/eventos` de asegura (validación `validarEntradaEvento`,
  idempotencia por `correo_evento_entrante_unico`). Sin póliza en vigor que case (o casa con dos) → `sin_resolver`.
- **Capa 5**:
  - AUTO: nota en `historial_interno`, tarea en `gestiones`, PDF a `documentos`, estado de solicitud, siniestro
    nuevo por la MISMA lógica que el POST manual (`abrirSiniestro`) si CIMA no lo trae.
  - APROBACIÓN: cambiar estado de póliza/recibo **no cubierto por CIMA** (p. ej. recibo devuelto de compañía cuyos
    recibos CIMA no actualiza), registrar importe de liquidación, enlazar póliza↔oportunidad cuando no es unívoco.
  - AVISO Telegram (`core-telegram`, prefijo `corr:`): emisión que CIMA aún no trajo (tras N días, §4.2),
    devolución/anulación que no consta en CIMA, solicitud rechazada, plazo de recibo a 70 días.

## 4. Funcionalidades

### 4.1 Seguimiento de solicitudes de principio a fin
Una fila por (compañía, nº de solicitud). Cada correo es un hito (`correo_evento_entrante`, tipo `solicitud`).
Estados normalizados: `presentada · pte_documentacion · pte_autorizacion · aceptada · emitida · rechazada ·
cerrada` + el texto literal de la compañía. **Emitida con nº de póliza** → se apunta `numero_poliza` y se espera a
CIMA; cuando la póliza llega por CIMA se enlaza sola (4.8). Rechazada → tarea en la oportunidad con el motivo.

### 4.2 Cruce con CIMA y avisos
Job diario (plataforma → asegura): eventos `emision`/`solicitud emitida` sin póliza CIMA tras **5 días hábiles**
(ajustable por compañía: Allianz/Reale traen EIAC semanal) → Telegram «emitida por correo, CIMA no la trae».
Devolución/anulación de correo sin reflejo en CIMA tras el siguiente pull → Telegram. Nunca se escribe la póliza.

### 4.3 Documentos (adjuntos) a fichas
PDF → `seguros.documentos` con `cliente_id`/`poliza_id`/`siniestro_id` resueltos en capa 4; sin resolver →
`cliente_id = null` y en bandeja para asignar a mano (no se adivina por nombre). `tipo` del catálogo actual;
`subido_por = 'correo'`; dedupe por `sha256` + póliza. PDF con contraseña: `pdf-contrasena.ts` (contraseñas de la
ficha), nunca se guarda la clave.

### 4.4 Siniestralidad desde correo
Los avisos `siniestro` (Occident, Plus Ultra/Catalana tramitador, Mapfre parte de trabajo) alimentan la lista de
siniestros por póliza. Para **renovaciones** y **declaraciones de no siniestralidad**: el certificado lo firma
Alberto; el agente solo aporta «siniestros conocidos por CIMA + por correo» y **«sin dato» ≠ «sin siniestros»**
(si no hay fuente que cubra el periodo completo, la declaración no se propone).

### 4.5 Borradores de respuesta a compañías (F3)
Solo para plantillas que piden algo (Mapfre CST «información inicial», Occident «PTE DOCUMENTACION», regularización).
Se crea **borrador en Gmail** (IMAP APPEND a Borradores, `In-Reply-To` del hilo) + aviso. Sin envío desde el
sistema. Sin PII nueva en el texto: solo lo que ya está en el hilo.

### 4.6 Conciliación de liquidaciones de comisiones (F3)
Fuentes legibles: Allianz «Cuenta Agente» (PDF, `pdf-allianz.ts`), Reale «LIQUIDACION DE COMISIONES» (adjunto),
liquidaciones de CIMA (`seguros.liquidaciones`). **Mapfre FACTURA (43 hilos): el importe va en un documento
cifrado detrás de un enlace** → solo se registra «liquidación de MM/AAAA recibida» (sin importe, `null`), y se
cuadra contra CIMA. Abrir el enlace queda **fuera de alcance** (propuesta futura: descarga manual por Alberto a una
etiqueta Gmail → el agente lo lee como adjunto). Descuadre (importe correo ≠ suma recibos CIMA del periodo) →
aprobación «registrar diferencia», nunca ajuste automático. La clave es periodo + compañía: un PDF de otro periodo
no cuadra contra este.

### 4.7 Aprendizaje de correcciones (F3)
Cuando Alberto corrige en la bandeja (campo X era Y), se guarda el par (texto saneado, salida corregida) como
ejemplo few-shot por (compañía, plantilla). Máx. 5 por plantilla en el prompt; el ejemplo se guarda **ya saneado**
(sin nombres/NIF/IBAN). Tres correcciones iguales en una plantilla → propuesta (PR draft) de lector determinista.

### 4.8 Enlace póliza CIMA nueva ↔ oportunidad abierta
Al llegar una póliza nueva por CIMA: buscar oportunidad abierta con mismo CIF/NIF del tomador (por `pii_lookup`),
misma compañía (DGS) y mismo ramo. **Una** → enlace automático + nota. **Varias o ninguna** → aprobación con las
candidatas. Prioridad: nº de solicitud→póliza (4.1) antes que la heurística CIF+compañía+ramo.

### 4.9 Resumen semanal (F3)
Lunes por Telegram (reutiliza `resumenSemanal()`): solicitudes abiertas por estado, emisiones sin CIMA, avisos
de recibo sin resolver, documentos sin asignar, liquidaciones recibidas/sin cuadrar, cobertura y precisión de la
semana. Cifras en formato `2.162,49€`.

## 5. Exclusiones de seguridad (capa 0)

- **Lista de exclusión por remitente y asunto**, evaluada ANTES de leer cuerpo o adjuntos: `@tirea.es`,
  `@codeoscopic.com` (tickets y Avant de alta/contraseña), y asuntos con `contraseña|clave de acceso|credenciales|
  recuperación de la clave|usuario y contraseña`. Excepción explícita: `Avant2: Póliza aceptada/Documentos de la
  emisión` (sin credenciales; se leen solo PDF, nunca cuerpo).
- Excluido = **no se parsea, no se guarda extracto ni adjunto, no va a ningún LLM**; solo `correo_triaje` con
  `categoria='excluido_seguridad'` y asunto truncado. Tampoco va al clasificador IA actual (arregla §0.1).
- Detector de secretos en todo texto que vaya a capa 3: patrones `usuario:|password|contraseña:|clave:` seguidos
  de token → el correo se degrada a excluido.
- IBAN/NIF/nombre: `sinDatosSensibles` antes de cualquier LLM y en todo texto que se escriba (ya existe).
- Cepo: `test/regression-correo-exclusion.test.ts` (ver F0).

## 6. RGPD, proveedor LLM y adjuntos

**DECISIÓN PENDIENTE (Alberto): proveedor del extractor y del clasificador para correo del sector.** Requisitos:
DPA firmado, región UE, sin entrenamiento con los datos, retención ≤30 días o cero. Hasta decidir, **F2 no arranca**
y la capa 1 no manda correo del sector a la IA (va a `dudoso`).

| Opción | Pros | Contras |
|---|---|---|
| Anthropic (API, residencia UE donde esté disponible) | Mejor extracción con citas; mismo proveedor que el resto del trabajo; DPA estándar, sin entrenamiento por defecto | Verificar que la residencia de datos UE cubre la API que se use; coste por token mayor; integración nueva en `core-ai` |
| Azure OpenAI (región UE, p. ej. Sweden Central / West Europe) | Residencia UE contractual y DPA de Microsoft; opción de abuse-monitoring off | Alta de suscripción Azure y cuota; otra pasarela que mantener; modelo de extracción algo peor con PDFs largos |

En ambos casos: entra como proveedor nuevo en `core-ai` y pasa por la **pasarela** (`AI_GATEWAY_URL`, `ai_usos`,
topes `ia_presupuestos`); el agente no llama directo. Registro de actividades de tratamiento: añadir «lectura
automatizada de comunicaciones de aseguradoras» (base: ejecución del contrato de mediación).

**Adjuntos**: descarga por IMAP en la misma sesión del triaje (`imap.ts`, ya conserva PDFs de `REMITENTES_CON_PDF`).
Ampliar a los dominios de compañía con tope **5 adjuntos/correo, 10 MB/adjunto, 40 MB/pasada**; tipos PDF, XLS/XLSX,
EML (el EML reenviado de Mapfre CST se abre un nivel, no recursivo). Lo que excede → evento con `ilegibles`, no se
descarta en silencio. **Almacenamiento** (decisión de Alberto, recomendación entre paréntesis): (a) seguir en
`documentos.contenido bytea` como hoy (recomendado para F1: un solo camino, mismas lecturas); (b) `core-storage` en
bucket privado con URL firmada y columna `storage_path`, si el backfill supera ~500 MB. Cifrado: at-rest de Supabase
+ TLS; no se guarda la contraseña del PDF. Mapfre «FACTURA» y «Welcome Pack» (documento tras enlace): fuera.

## 7. Modelo de datos mínimo (schema `seguros`, SQL en `apps/asegura/prisma/sql/`)

- `solicitud_compania` — `id, correduria_id, codigo_entidad_dgs, numero_solicitud, numero_poliza NULL,
  oportunidad_id NULL, poliza_id NULL, ramo NULL, estado, estado_compania (literal), estado_at, cerrada_at NULL,
  created_at`; único `(correduria_id, codigo_entidad_dgs, numero_solicitud)`. Los hitos son filas de
  `correo_evento_entrante` (añadir `solicitud_id NULL`).
- `correo_evento_entrante` + columnas: `via` (`lector|llm`), `confianza NULL`, `modo` (`sombra|vivo`),
  `lectura_llm jsonb NULL` (para comparar con el lector), `corregido jsonb NULL`.
- `correo_ejemplo` (few-shot) — `id, correduria_id, compania, plantilla, entrada_saneada text, salida jsonb,
  creado_por, created_at`; máx. por plantilla en código.
- `liquidacion_correo` — `id, correduria_id, codigo_entidad_dgs, periodo_desde, periodo_hasta, importe NULL,
  fuente (`correo_pdf|correo_aviso`), documento_id NULL, liquidacion_id NULL (CIMA), estado_cuadre
  (`pendiente|cuadra|descuadre|sin_importe`), mensaje_id`; único `(correduria_id, codigo_entidad_dgs, periodo_desde,
  periodo_hasta, mensaje_id)`.
- `documentos`: nuevo valor `subido_por='correo'` y columna `mensaje_id NULL` (dedupe + rastro).
- `aprobacion`: acciones nuevas `cambiar_estado_recibo_correo`, `registrar_liquidacion`, `enlazar_poliza_oportunidad`
  (su `aprobar` escribe en BD; `POLITICA` las declara `con_ok`).
- `correo_backfill_lote` — `id, desde, hasta, uid_desde, uid_hasta, estado, contadores jsonb, created_at`.

## 8. Backfill del histórico y modo sombra

- **Backfill**: ruta cron separada (`/api/cron/correo-backfill`), por lotes de 50 correos por UID descendente
  dentro de etiquetas/dominios del sector, `correo_backfill_lote` como cursor. Idempotente por
  `correo_evento_entrante_unico` y `documentos(sha256, poliza_id)`. **Siempre en modo sombra**: escribe eventos con
  `modo='sombra'`, sin tareas, sin Telegram, sin aprobaciones; los documentos sí se vuelcan (no tocan cartera)
  tras revisar 20 al azar. Un evento histórico cuyo plazo ya pasó no genera tarea nunca.
- **Modo sombra en vivo (2 semanas por tipo nuevo)**: el tipo lee y resuelve, pero la acción queda en la bandeja
  «Correos de compañía» (`CorreosCompania.tsx`) como «habría hecho X» con botón ✓/✗/corregir.
- **Pasar un tipo a automático** (por tipo y compañía, flag en código, no env): ≥ 20 casos revisados, precisión
  ≥ 98 % (determinista) / ≥ 95 % (LLM), 0 errores de identidad (póliza equivocada), 0 credenciales/PII en
  `lectura_llm`. Uno solo de identidad → vuelve a sombra.

## 9. Plan por fases (valor / esfuerzo)

### F0 — Quick wins deterministas sobre #4893, SIN LLM (≈ 2 días)
Parte de la rama `claude/daily-tasks-opportunities-ns5s4c` (ya lee «Suscripción X N, TOMADOR» rechazada y
«Resumen de recibos anulados por impago»). Añade (~75 hilos recuperables):
- Occident «Suscripción X N, TOMADOR» **emitida/aceptada** con «Póliza: N» → `solicitud` estado `emitida` + nº póliza.
- Occident «Mensaje recibo N (póliza N)» → `pre_anulacion` con fecha límite del cuerpo.
- Plus Ultra / Catalana tramitador: aceptar `plusultra.es` y `catalanaoccidente.com` y el asunto sin «Tramitador».
- Allianz «Cartera No Vida» (PDF) → evento `cartera_vencimientos` solo informativo; **periodo leído del PDF, no
  del asunto** (el asunto miente).
- Occident recordatorio de mandato SEPA → reconocido e **ignorado** (decisión 6).
- Capa 0: exclusión `tirea.es`/`codeoscopic.com`/asuntos de credenciales también en el clasificador IA actual.

Archivos: `packages/module-seguros/src/evento-correo-aseguradora.ts` (+ tests `*-occident-oct.test.ts`, nuevo
`*-plusultra.test.ts`, `*-allianz-cartera.test.ts`), `apps/asegura/lib/correo-evento.ts` (+test),
`apps/plataforma/lib/correo/{keywords.ts,clasificador.ts,evento-aviso.ts}` (+tests), `rutas.ts` si hace falta
categoría `excluido_seguridad`. Fixtures **saneados** y en celda-por-línea.
Cepos (vistos fallar): (1) quitar `tirea.es` de la exclusión → el test de exclusión en rojo; (2) leer el periodo
de Cartera No Vida del asunto → rojo; (3) aceptar «Suscripción … Póliza N» sin «Solicitud: N» en cuerpo → rojo;
(4) mandato SEPA que crea tarea → rojo.
Riesgos: asunto de suplemento confundido con solicitud (ya mitigado en #4893); falsa emisión si el cuerpo dice
«aceptada pte. emisión» sin póliza → `numero_poliza = null`, estado `aceptada`.

### F1 — Adjuntos a documentos + Telegram de cruce con CIMA (≈ 4 días)
`solicitud_compania`, columnas de `documentos`, ampliación de adjuntos en `imap.ts` (topes §6), ruta de asegura
para alta de documento desde correo (reutiliza `lib/cartera-documentos.ts`, validación de destino), job diario de
cruce (4.2), enlace solicitud→póliza→oportunidad (4.1 + 4.8 parte determinista), backfill de documentos en sombra.
Archivos: `apps/plataforma/lib/correo/{imap.ts,triaje.ts}`, `apps/asegura/lib/{correo-evento.ts,correo-evento-bd.ts}`,
`apps/asegura/app/api/operador/{eventos,documentos}/`, `apps/asegura/prisma/{asegura.prisma,sql/…}`,
`CorreosCompania.tsx` (columna «documentos sin asignar»).
Tests/cepos: adjunto > 10 MB → `ilegibles` (rompe el tope → rojo); mismo PDF dos veces → 1 fila; emisión sin CIMA
a los 4 días → sin aviso, a los 6 → aviso (reloj inyectado, nunca fecha fija); póliza que casa con dos → sin
enlace; documento nunca se asocia por nombre del tomador.
Riesgos: volumen bytea; PDF con contraseña sin clave en ficha → queda «recibido» sin leer, se dice.

### F2 — Extractor LLM en sombra (≈ 5 días + 2 semanas de sombra) · requiere decisión §6
Proveedor nuevo en `core-ai` por la pasarela, esquema JSON por tipo, validador literal, comparación con lector,
bandeja de revisión ✓/✗/corregir. Cola larga: Mapfre CST (cierre/info inicial), Allianz OSN «Prefijado»,
Occident regularización accidentes, Reale «Movimientos a fichero», Avant2 documentos.
Archivos: `packages/core-ai/src/<proveedor>.ts`, `packages/module-seguros/src/extractor-correo.ts` (puro: prompt,
esquema, validación), `apps/plataforma/lib/correo/extractor.ts`, `correo_evento_entrante` + columnas.
Cepos: valor inventado que no está en el texto → `null` (desactiva el validador → rojo); texto con IBAN/NIF que
llega al payload del LLM → rojo; correo de `tirea.es` que llega al extractor → rojo; LLM que discrepa del lector →
gana el lector.
Riesgos: alucinación de nº de póliza (mitigado por literalidad + identidad); coste (topes de la pasarela).

### F3 — Aprendizaje, comisiones, borradores, resumen semanal (≈ 1,5-2 semanas)
`correo_ejemplo` + UI de corrección; `liquidacion_correo` + conciliación contra `liquidaciones` CIMA y Cuenta
Agente; borradores Gmail (4.5); acciones nuevas en `aprobacion`; resumen semanal ampliado; propuesta automática
de lector determinista por plantilla repetida.
Cepos: borrador que se ENVÍA en vez de guardarse (forzar `send` → rojo); ejemplo few-shot con NIF → se rechaza al guardarlo;
liquidación de otro periodo que «cuadra» → rojo; Mapfre FACTURA con importe ≠ null → rojo.
Riesgos: un borrador mal enhebrado (otro hilo) — se verifica `In-Reply-To` contra el hilo de origen.

## 10. Decisiones abiertas para Alberto

1. Proveedor LLM UE para el correo del sector (Anthropic vs Azure OpenAI UE) — bloquea F2 y el arreglo
   definitivo del clasificador (§0.1).
2. Almacenamiento de adjuntos: `bytea` (recomendado F1) o `core-storage`.
3. Días de espera antes de avisar «emitida y CIMA no la trae» (propuesta 5 hábiles; por compañía).
4. Mapfre FACTURA: ¿registrar solo «recibida» o montar la vía manual (Alberto descarga → etiqueta → se lee)?
