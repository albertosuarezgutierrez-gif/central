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

## Fila 13 — Importar un proyecto hecho a mano en Avant2 ✅ CONSTRUIDA (26/09/2026)

**Caso:** Pablo Guzmán, proyecto `40842815`, sustituye a su Mapfre `0008414300069` (vence
29/09/2026). La póliza que se sustituye es el `poliza_id` del enlace, igual que en la retarificación.

**Decisión al construir: el import NO hace ReRate.** Solo se importa un precio que YA trae la acción
`SubmitPolicyApplication` (confirmado en Avant2) y sigue en plazo (`expirationDate` ≥ hoy, efecto ≥ hoy).
Si no, se confirma en Avant2 y se vuelve a importar. Así el import es gratis y no se duplica la
lógica de `/oferta` (que parte de una `tarificaciones` nuestra).

- **asegura** `app/api/operador/codeoscopic/importar/route.ts`: `GET ?projectId=&polizaId=` (vista
  previa: lectura gratis del vendor) y `POST {projectId, polizaId, quoteId, confirmado}` (`auditado`).
  Bloquea si el ramo no casa (hoy solo auto y moto), si el **tomador** no es el cliente de la póliza
  —por el hash del DNI (`dni_lookup_hash`), nunca por nombre; sin dato en un lado también bloquea— o si
  el proyecto ya está emitido o enlazado a otra póliza. El POST deja `codeoscopic_projects` con
  `accepted_offer_id_codeoscopic` = id del `mainQuote` y `estado='preemision'`, y responde con la
  misma forma que `/oferta`.
- **Regla pura** `lib/codeoscopic/importar.ts` (`ofertasDelProyecto`, `ramoDeLinea`, `documentoTomador`),
  probada contra el JSON REAL del proyecto de Pablo sin datos personales
  (`fixtures/codeoscopic/2026-09-26-proyecto-web-avant2.json`): 2 de 21 precios emitibles.
- **plataforma**: enlace «Traer un proyecto hecho en Avant2» en la ficha de la póliza (Gestión, solo
  auto/moto) → `retarificar?avant2=1` (esa página tiene el `maxDuration` 180 que necesita la emisión) →
  `ImportarAvant2.tsx` → el panel `Emision` de siempre, que ahora acepta `ofertaImportada` y arranca en
  el paso de emitir. Todas las guardas de `/emitir` (IBAN confirmado, solicitud viva, reintento) intactas.

**Sigue sin medir** [Probable]: que el Submit acepte una oferta creada en la web sin ReRate nuestro (la
web le pone `SubmitPolicyApplication`, buena señal). Se verá en la primera emisión real.

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

1. ~~Fila 13 (importar)~~ ✅ construida.
2. Fila 5 (timeouts).
3. Fase 3a (preparar, resumen y botón).
4. Fase 3b (correcciones por chat).

Cada una en su PR, con code-review antes de sacarla de draft y `agente-architect` en la 3a, porque
toca emisión y dinero.

**Pablo no espera a esto:** la Mapfre vence el 29/09 y construir y medir la fila 13 no cabe con
margen. Su póliza se emite a mano en Avant2.
