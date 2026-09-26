# Importar proyectos de Avant2 (fila 13) + emitir desde el asistente de Telegram (fase 3)

> Plan, 26/09/2026. Nada de esto está construido. Mapa del código actual verificado ese día
> leyendo `apps/asegura/app/api/operador/codeoscopic/{emitir,oferta,proyecto}/route.ts` y
> `apps/asegura/lib/codeoscopic/{emitir,emitir-envio,emitir-iban,libro-emision,consumo,reintento-emision}.ts`.

## Lo que el mapa corrige

La fila 13 decía «hace falta una línea en `codeoscopic_consumo` y un `intentoId` para emitir». **No es así.**
`/emitir` solo pide una fila de `codeoscopic_projects` con `accepted_offer_id_codeoscopic`, `aseguradora`
y `poliza_id` (`emitir/route.ts:104-131`); el `intentoId` del libro lo genera él mismo en cada envío
(`libro-emision.ts:107-120`). El requisito venía de otro sitio: la única ruta que crea esa fila es
`/oferta`, y `/oferta` parte de una `tarificaciones` real, cuyo `intento_id` es FK al libro
(`2026-09-02_tarificaciones_guardadas.sql:38-40`). **No hay que fabricar una tarificación falsa**: basta
con una ruta que enlace el proyecto con su póliza.

## Fila 13 — Importar un proyecto hecho a mano en Avant2

**Caso:** Pablo Guzmán (cliente `0af158d6…`), proyecto `40842815`, sustituye a su Mapfre
`0008414300069` (vence 29/09/2026). La póliza que se sustituye es el `poliza_id` del enlace, igual que
en la retarificación.

1. **Vista previa, gratis.** `GET /api/operador/codeoscopic/importar?projectId=` (asegura) = el `GET
   /insurances/{id}` que ya hace `proyecto/route.ts`, pasado por un helper PURO
   `ofertasImportables(crudo, hoy)` → por oferta: compañía, prima, fraccionamiento, efecto, caducidad
   y si trae `SubmitPolicyApplication`. Su test usa el JSON REAL del proyecto de Pablo como fixture
   (regla «valida el parser contra un documento de la fuente»).
2. **Enlace.** `POST …/importar {projectId, polizaId, offerId, confirmado}`, envuelto en `auditado()`:
   - la póliza es de la correduría y está viva; el proyecto no está enlazado ya a otra (índice único
     correduría+proyecto, `2026-09-11_…unique_proyecto.sql`);
   - **oferta vigente y efecto válido → upsert directo** de `codeoscopic_projects`
     (`estado='preemision'`), sin ReRate y sin gasto;
   - **caducada o efecto a mover → ReRate** por `conLibroDeEmision` (motivo `rerate`), el mismo
     camino que `/oferta` (`oferta/route.ts:183-444`), reutilizando sus helpers, no copiándolos.
   - Sin migración: el rastro de «importado» queda en el log de `auditado()`.
3. **Plataforma.** En la ficha de la póliza a sustituir: «Importar proyecto de Avant2» (campo
   projectId → vista previa → elegir oferta → enlazar) y de ahí a la pantalla de emisión que ya existe
   (`correduria/poliza/[id]/retarificar/emision.tsx`), que hereda la cuenta confirmada, los 409 de
   reintento y el acuñado.

**A medir antes de dar la fila por buena** [Probable, no verificado]:
- que un Submit sobre una oferta creada en la web, SIN ReRate nuestro, lo acepte la API (la web le
  pone la acción `SubmitPolicyApplication`, que es buena señal); la primera vez, leer antes
  `policy-application-fields` (gratis);
- que `emision.tsx` se monte con un proyecto que no nació de una `tarificaciones`.

Tamaño: **M**, un PR (asegura + plataforma + test con fixture real).

## Fase 3 — Emitir desde Telegram

Flujo dictado por Alberto: *pregunto por la propuesta → me la pasa → la reviso con él → resumen →
botón Emitir.*

**Principio: el modelo nunca emite ni escribe el resumen.** El resumen lo construye el SERVIDOR con
datos de la BD y del GET gratuito; la IA solo decide cuándo ofrecerlo. El único camino a `/emitir`
es el botón.

1. **Herramientas nuevas** (en `HERRAMIENTAS` + `ejecutar()`, `correduria-asistente-telegram.ts:85-179`):
   - `propuestas_cliente(clienteId)`: lectura, proyectos enlazados y su estado;
   - `preparar_emision(polizaId)`: servidor → GET del proyecto + ficha → resumen fijo (tomador, DNI
     enmascarado, dirección, vehículo, compañía, prima total y primer recibo, fraccionamiento, efecto,
     IBAN `ES…1332` y de dónde sale, avisos de la API). Guarda una propuesta y manda los botones
     `cas_emitir:<id>` / `cas_emitirno:<id>`. Mismo patrón que `proponer_regla` (148-165).
2. **Tabla `correduria_asistente_emision`** (plataforma): `id`, `turno_id`, `poliza_id`,
   `project_id`, `offer_id`, `resumen jsonb`, `huella` (sha256 del resumen canónico), `estado`
   (`propuesta|emitiendo|emitida|rechazada|caducada|incierta`), `caduca_at` (15 min), `resultado
   jsonb`, `decidida_at`. GRANTs a `prisma_plataforma` (tabla + secuencia).
3. **Al pulsar** (`resolverBotonCorreduria`, 288-308):
   - `UPDATE … SET estado='emitiendo' WHERE id=$1 AND estado='propuesta' AND caduca_at>now()`:
     un solo uso, un doble toque no emite dos veces;
   - se rehace el GET y la huella: **si algo cambió (precio, efecto, oferta) → `caducada`** y nuevo
     resumen, sin emitir;
   - `emitirAsegura()` (`lib/retarificar-asegura.ts:1408`) con `actor: 'agente:asistente-telegram'`:
     mismo puerto, mismos cerrojos (`bloquearEnvio`, `solicitudViva`, libro de gasto, topes
     `CODEOSCOPIC_TOPE_SUBMIT_*`).
4. **Respuestas al chat:**
   - ok → número de póliza + PDF;
   - 422 → qué campo falta y enlace a la ficha;
   - 409 `reintento_sin_confirmar` o 5xx/timeout → `incierta`: «puede haberse emitido, mírala en la
     intranet». **Telegram NUNCA reintenta ni ofrece botón de reintento**, porque el vendedor no
     deduplica.
5. **Correcciones en la conversación** (dirección, apellidos, IBAN):
   - **3a (primero):** el IBAN tecleado viaja en la propia emisión (`campos`/`cuentaConfirmada`,
     ver `emitir-iban.ts`); dirección y apellidos se corrigen en la ficha (el asistente da el enlace) y
     el resumen se rehace;
   - **3b:** herramienta `proponer_correccion` con su propio botón, que escribe por las rutas
     `auditado()` de la ficha.
6. **Interruptores:** `CORREDURIA_ASISTENTE_EMISION_ACTIVA` (apagado por defecto, aparte del
   `CODEOSCOPIC_EMISION_ACTIVA` de asegura). La línea «SOLO LECTURA» del prompt
   (`correduria-asistente.ts:174`) pasa a «puedes PREPARAR una emisión; no digas nunca que está
   emitida hasta que lo confirme el sistema».
7. **Cepos:** botón caducado, botón usado dos veces, huella cambiada, chat ajeno, e interruptor
   apagado. Cada uno visto en rojo.

**Requisito previo: fila 5 del plan** (timeouts de ReRate/Submit a ~150 s y `maxDuration`
180). Con `maxDuration=60` un Submit lento acaba en «quizá emitida». En la intranet Alberto lo
ve en pantalla; por Telegram sería un mensaje que no llega. Primero la fila 5, luego la fase 3.
La fila 10 (`RevisedQuote`) queda como está: si aparece, la emisión sale `incierta` y se mira en
la intranet.

Tamaño: fila 5 **S** → fase 3a **M** → 3b **S**.

## Orden

1. Fila 13 (importar).
2. Fila 5 (timeouts).
3. Fase 3a (preparar, resumen y botón).
4. Fase 3b (correcciones por chat).

Cada una en su PR, con code-review antes de sacarla de draft y `agente-architect` en la 3a, porque
toca emisión y dinero.

**Pablo no espera a esto:** la Mapfre vence el 29/09 y construir y medir la fila 13 no cabe con
margen. Su póliza se emite a mano en Avant2.
