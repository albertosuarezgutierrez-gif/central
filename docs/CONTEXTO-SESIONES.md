# 🧠 Memoria de sesiones — central (repo GitHub: ia.rest → renombrar)

> Contexto persistente entre sesiones de Claude Code. El entorno cloud es
> **efímero** (el contenedor se borra al acabar), así que lo único que sobrevive
> es lo commiteado aquí. Este archivo es el "estado vivo" del proyecto entre sesiones.
>
> **Cómo se mantiene:** al terminar cada sesión, Claude añade una entrada nueva
> arriba del todo y actualiza el estado si algo cambió. Un hook `Stop`
> (`.claude/hooks/persist-memoria.sh`) commitea y empuja este archivo automáticamente.
>
> **🚨 Regla de tamaño (ahorro de contexto):** cada entrada, **máximo ~8 líneas**:
> qué se hizo, decisiones, pendientes y nº de PR. El detalle ya vive en el PR y en
> el código — NO re-narrarlo aquí. Fecha SIEMPRE en la primera línea `(dd/mm/aaaa)`.
>
> **🔄 Rotación mensual:** aquí vive SOLO el mes corriente. Los meses cerrados se
> archivan en `docs/memoria/AAAA-MM.md` con `node scripts/rotar-memoria.mjs`
> (idempotente; lo dispara `/auditoria-diaria` a primeros de mes). La historia no
> se pierde: se lee de `docs/memoria/` solo cuando hace falta.
>
> **📌 «Estado vivo» (bloque al final):** SOLO pendientes y decisiones abiertas, en
> sub-bullets de 1-3 líneas — no es un segundo diario: el relato de cada sesión va en su
> entrada fechada y el detalle en el PR. Al cerrar un pendiente, borra su bullet; al
> actualizar el bloque, re-fecha su cabecera (si su fecha queda en un mes cerrado, la
> rotación se lo lleva al archivo).
>
> **Formato de cabecera de entrada:** `- **… (dd/mm/aaaa).**` o `### … (dd/mm/aaaa)` —
> son los ÚNICOS que `rotar-memoria.mjs` reconoce como entrada; una cabecera `## ` se
> funde con la entrada anterior y se archiva mal.
>
> Para arquitectura/módulos completos → skill `ia-rest-maestro`. Esto es solo el
> registro de qué se hizo y qué queda.

---

### 📱 (12/08/2026) La portada de House Sevillana suspendía el mínimo táctil de 44px (PR #1399)
- Claude in Chrome **no puede medir 320px** (su gestor de ventanas fuerza ~1536px de ancho mínimo), así que
  lo medí con Playwright sobre la app en local: **18 elementos por debajo de 44px** en la portada (marca del
  nav 27px, hamburguesa 27px, los 11 enlaces del pie 16px, los 4 SEO del final 40px). `/parking` limpia.
- **No era una regresión:** `git log` sobre `app/route.ts` da un solo commit, el de la importación (#1390).
  `/parking` se escribió en el monorepo con la regla delante; la portada entró tal cual del repo suelto.
- Arreglo acotado a `max-width:768px` salvo los SEO (su altura no depende del ancho). El teléfono de
  «o llámanos al …» va DENTRO de una frase: se amplía con padding + margen negativo, no estirándolo.
- Medido antes/después en las **6 rutas** (3 idiomas × 2 páginas): 18 → **0**, sin scroll horizontal.
- ⚠️ El CSS vive en un template literal de JS: una comilla invertida en un comentario rompe el build (me pasó).

### 💸 (12/08/2026) El cotizador de IA de ialimp no ha generado NUNCA una propuesta (PR #1394)
- 8 leads, **0 con `propuesta_url` o `propuesta_ia_at`**; el bucket `propuestas-leads` tiene **0 objetos**.
  Tres fallos encadenados, todos mudos: (1) el disparo desde `/api/leads` iba sin `Bearer CRON_SECRET` →
  401 del middleware, y `fetch` no rechaza ante un 401 así que el `.catch()` no veía nada; (2) la subida a
  Storage usaba la anon key contra un bucket **privado**, sin mirar `r.ok`; (3) la URL guardada era la ruta
  **pública** de ese bucket privado → rota igualmente. El lead quedaba `propuesta_enviada` con un enlace muerto.
- Arreglado: auth por sesión (el `empresa_id` venía del **body**, sin comparar con la sesión = frontera
  multi-tenant que dependía de que un uuid no se filtrase), Storage fuera (se sirve de `leads.propuesta_html`
  por `GET /api/admin/leads/[id]/propuesta`) y los dos `UPDATE leads` scopeados por empresa.
- **Corrige el aviso del PR #1392:** añadir `SUPABASE_SERVICE_ROLE_KEY` a ialimp **no** eleva privilegios de
  RLS — esa clave solo se usaba para subir a Storage, nunca contra Postgres. Y tras este PR ni eso.

### 🔑 (12/08/2026) El expediente de RR.HH. de ialimp NO puede escribir en Storage (PR #1392)
- El proyecto Vercel `ialimp` **no tiene `SUPABASE_SERVICE_ROLE_KEY`** por ninguna vía: ni propia, ni
  compartida enlazada, ni del equipo. Pero `lib/storage-limpiadora.ts` la usaba con `process.env.X!` →
  cabecera `Bearer undefined` → **401** al subir/borrar documento del expediente y al generar la nómina PDF.
- **0 errores de runtime en 7 días. Eso no era que funcionara: era que nadie lo había usado.** Se cobraría
  la primera vez que Vanessa generase una nómina.
- Salió de cruzar el inventario de la clave en Vercel (hecho para poder rotarla) contra los consumidores
  reales del código. Un solo nombre de variable en todo el monorepo, así que el mapa está completo:
  `ia-rest` ✅ (en TODOS los entornos, Development incluido — acotarlo al rotar) · `central-rrhh` ✅ ·
  **`ialimp` ❌ pese a usarla** · `plataforma` ❌ correcto (solo la nombra `secrets-registry.ts`, que es doc).
- El PR NO añade la clave (es de Alberto): cambia `!` por `requireSecret` para que el error **diga qué falta**.
- ~~⚠️ Al añadirla, `agente-cotizador` empezará a saltarse RLS~~ → **falso, comprobado el mismo día** (ver la
  entrada 💸 de arriba): esa clave nunca tocó Postgres, solo la cabecera de una subida a Storage. RLS es
  seguridad de fila en Postgres; ahí no había ninguna que saltarse.

### 🔒 (12/08/2026) Cero tablas sin RLS en `public` — eran las 2 de trading (PR #1395)
- `trading_cohetes_rebalanceo` y `trading_cohetes_track` eran las **últimas** de `public` con RLS
  desactivado (las otras 296 ya lo tenían). Aplicado por migración `rls_trading_cohetes`; verificado
  después: 0 tablas sin RLS y las filas (3 y 12) se siguen leyendo.
- **No cerraba una fuga**: `anon`/`authenticated` no tenían ningún privilegio, y los cinco roles que sí
  (app_user, postgres, prisma_plataforma, prisma_sivra, service_role) llevan **BYPASSRLS** → nada
  operativo cambia. Lo que fija es el suelo: un GRANT futuro a anon ya no las deja abiertas.
- Lo importante es la otra mitad: el `.sql` del repo hacía `DISABLE ROW LEVEL SECURITY` **explícito**,
  así que reejecutarlo habría deshecho la migración sin que nadie lo notase. Corregido en el fichero.

### 🕳️ (12/08/2026) Las cancelaciones NO EXISTEN en nuestra BD — el cuadro de mando es ciego a ellas
- Smoobu dice **269 noches canceladas contra 241 reservadas** (may-nov 2026, 67 cancelaciones). Se cancela
  más de lo que se consume y **ningún panel nuestro lo puede ver**.
- Comprobado columna a columna: `incomes` (13 col.) **no tiene estado ni flag de cancelación** — solo
  guarda el ingreso de lo que sí entró. `cleaning_sessions` tampoco. Es decir: no es que el dato esté a
  NULL, es que **el concepto no existe en el esquema**. Ninguna consulta puede responder «¿cuánto se
  cancela?» porque no hay dónde mirar.
- **La buena noticia: la puerta ya está abierta.** `pms_connections` tiene una conexión **Smoobu API viva**
  («Alberto Suarez — Smoobu», `pms_tipo='smoobu_api'`, `activa=true`, `sync_error` NULL, último sync
  12/08 12:11) con los CUATRO `apartment_id`: 352007 House Sevillana · 352928 Duplex Center · 352943
  Luxury Busto · 352418 Busto Reform. Hoy solo se usa para programar limpiezas.
- Siguiente paso natural: traer las reservas CON su estado por esa misma conexión y darles tabla propia.
  Sin eso, cualquier medida sobre el canal directo mide solo la mitad del embudo.
- ⚠️ Al mirar esto salió otra cosa: **`trading_cohetes_rebalanceo` y `trading_cohetes_track` tienen RLS
  DESACTIVADO** — expuestas a la clave `anon`, que es pública por diseño. Ver aviso al final.

### 🔗 (12/08/2026) Los SEIS botones de reserva de la landing iban a un dominio INEXISTENTE (PR #1390)
- `reservas.house-sevillana.com` **no tiene registro DNS**, ni su padre `house-sevillana.com`. Comprobado
  por dos vías (resolución del sistema y fetch → `ENOTFOUND`, distinto del «bloqueado por proxy» que da
  un dominio vivo). Ahí apuntaban hero, enlaces internos, `/barrio`, `/que-ver` y los dos de `/parking`.
- El botón principal de una web cuyo único objetivo es la reserva directa daba error de DNS. **Falla en el
  PRIMER paso, no en el último**, y explica el dato de GA4 mejor que ninguna hipótesis de diseño: 109
  sesiones en 12 meses y **1 clic saliente en todo el año**.
- Ahora la URL vive en `apps/housesevillana/app/reservas.ts`. Lo que arregla el fondo no es el valor: es que
  haya **un solo sitio donde equivocarse** — copiado seis veces no se revisa nunca, porque mirar uno no dice
  nada de los otros cinco. `app/enlaces.test.ts` lo blinda (verificado que muerde).
- Destino nuevo: `booking.smoobu.com/yourothercity?apartmentId=352007` — **enlace profundo**, entra directo
  a House Sevillana y sigue bloqueada en ella al cambiar fechas. Sin el id abre el portal multi-propiedad
  con las 4 casas. Validado con prueba real de huésped (solo tarjeta, Stripe live, sin sandbox).
- Por qué `reservas.house-sevillana.com` nunca existió: el campo «External link» de Smoobu **no aloja
  nada**, solo redirige enlaces a una URL propia YA montada. Nadie publicó la página con el iframe — así
  que aquello no fue un enlace que se rompiera, fue **un enlace que nunca llegó a funcionar**.
- ✅ Arreglado antes por Alberto en Smoobu: el método de pago por defecto era **PayPal en sandbox** (no
  cobraba). Ahora Stripe único y preseleccionado, verificado hasta la pantalla de pago.

### 🅿️ (12/08/2026) Landing housesevillana: `/parking` en 3 idiomas + auditoría de Chrome (PR #1390)
- Nueva `/parking` (es/en/it) — la búsqueda de más intención y menos competencia; la URL del anuncio de
  Booking ya es `house-sevillana-parking`. Dato clave y contraintuitivo: **la ZBE de Sevilla es SOLO la Isla
  de la Cartuja**; el casco histórico tiene otro régimen. Lo no comprobado (precio de la plaza, medidas,
  matrícula) se remite a Alberto en vez de rellenarse a ojo, y queda anotado en `app/parking/contenido.ts`.
- Dos fallos de i18n corregidos: `description`/`og:description` de la portada **nunca se tradujeron**
  (`/en` servía castellano a Google con el 72% del tráfico en inglés), y el `<title>` era clave de
  diccionario — el agente SEO reescribe esa frase cada lunes, así que el primer lunes la portada inglesa
  habría pasado a anunciarse en español sin error ni aviso. Ahora van por `Variante.meta`, por etiqueta.
- 🔴 **PENDIENTE URGENTE DE ALBERTO — el motor de reservas no cobra por defecto:** en Smoobu, PayPal está en
  **sandbox** Y es el **método por defecto**. Cambiar el default a Stripe (live, sí cobra) y desactivar PayPal.
- Auditoría de Chrome: Search Console verificado y sitemap enviado (**3 URLs → confirma que lo desplegado
  sigue siendo el repo viejo**; reenviar tras crear el proyecto Vercel). Smoobu: quedarse en Pre-paid, Flex
  sale **el doble** con el 0,9%. GBP: 1 reseña vs 50 de Booking (link `g.page/r/CX403tjxZhLaEBM/review`),
  web en `http://`, sin logo ni horario, posible **ficha duplicada**.
- ⚠️ Dato sin explicar y más gordo que la landing: **269 noches canceladas contra 241 reservadas** (may-nov).

### 🚨 (12/08/2026) CREDENCIAL EXPUESTA: `service_role` de Supabase en repo público — ROTAR
- Al traer `house-sevillana-landing` al monorepo, **gitleaks tumbó el PR**: 12 hallazgos en sus 64 commits.
- **El grave: una `service_role` del proyecto de PRODUCCIÓN `wswbehlcuxqxyinousql`**, commit `7c53e19`
  del **06/05/2026**, emitida el 15/04/2026 y **vigente hasta 2036**, en un repo **PÚBLICO** (`central`
  también lo es). Se salta el RLS → lectura/escritura total sobre la BD compartida de TODAS las verticales.
- Los otros 11 son claves `anon` (públicas por diseño, sin riesgo). En la historia hay versiones con el
  `ref` alterado a mano: alguien lo vio e intentó taparlo editando — **editar no borra la historia de git**.
- ⚠️ **PENDIENTE DE ALBERTO: rotar en Supabase.** Orden obligatorio: inventariar dónde se usa
  (env vars de los 8 proyectos Vercel + secrets de Actions) → rotar → actualizar → redesplegar. Rotar antes
  del inventario tumba producción. Revisar además logs de Supabase por si hubo uso ajeno en estos 3 meses.
- La landing se importó **SIN historia** (PR #1390) para no replicarla; silenciar gitleaks se descartó.

### 🗄️ (12/08/2026) Supabase ia-rest: 290 MB → 60 MB (eran logs, no datos)
- Alberto pregunta la capacidad usada. Compartida (`wswbeh…`) 137 MB, sana. Silo ia-rest (`efncqy…`) **290 MB**,
  de los que 252 MB eran infraestructura: `net._http_response` 123 MB con **368 filas vivas** (bloat puro,
  pg_net purga pero no devuelve el disco), `cron.job_run_details` 98 MB/158k filas desde el 04/05 (pg_cron
  **no purga por defecto** y nadie le puso retención) y `alerta_log` 31 MB/51.559 filas.
- **Bucle de alertas encontrado:** el 100% de `alerta_log` es del "Restaurante Demo" — 1.170/día EXACTAS,
  0 leídas, 0 actuadas. 3 comandas demo con items abiertas desde el 21 y 27/05 mantenían B1/S2/T5 en `activa`
  77 días; `limpiar-mesas-fantasma` solo cerraba comandas SIN items → nunca las tocaba.
- Hecho: VACUUM FULL de las 3 tablas + purga (7d cron, 30d alertas) → **60 MB**; migración
  `20260812_retencion_logs_y_mesas_fantasma.sql` con crons de retención diarios y corte de comandas >24 h.
  Verificado: 0 comandas vivas, 0 mesas ocupadas. **Ojo:** el silo NO tiene alerta de tamaño de disco. PR #1391.

### 🏠 (12/08/2026) CORRECCIÓN: la web de housesevillana SÍ existe — el fallo era la atribución
- Alberto desmonta el plan del PR #1387: «punto 4, para eso hicimos la web de housesevillana.es». Tenía razón.
- La landing **vive en OTRO repo** (`albertosuarezgutierrez-gif/house-sevillana-landing`, `app/route.ts`, edge);
  el puente es `apps/sivra/lib/seo-landing.ts:5` y el agente SEO la reescribe sola (último: 10/08/2026). Tiene
  motor propio (`reservas.house-sevillana.com`), WhatsApp de grupos, teléfono. Todo el copy es **grupos grandes**
  (6 dorm, 12 personas) → el «punto 4» que yo iba a proponer ya estaba ejecutado.
- **«DIRECTO = 0 €» era la etiqueta, no el negocio:** el directo de 2026 está como `portal='OTRO'` con
  **comisión 0,00%**, incl. **1.383,24 € por 2 noches** (≈691 €/noche, perfil de grupo). Fase 0 reescrita:
  arreglar atribución + **sacar el motor del pie de página** (hoy es el 3er botón a 13 px, junto a «Qué ver en Sevilla»).
- Causa del error, para no repetirla: se comprobó `apps/sivra` y se afirmó una ausencia **global**. Comprobar
  donde el dato viviría si existiera; si no aparece, escribir «no lo he encontrado», nunca «no existe».

### 🔍 (12/08/2026) Los eventos PREVISTOS se verifican y deciden SOLOS (PR #1386)
- Alberto, ante el aviso 🔮 con 3 fechas de Mangafest: «esto tiene q ser automático, yo no sé de esta
  información». **Retirado ese Telegram**; decide el cron nuevo `/api/sivra/eventos/verificar` (05:30 UTC).
- Tres señales independientes (`lib/sivra/eventos-verificacion.ts`, puro, 23 tests): fila ya confirmada
  de la misma fecha con nombre parecido · búsqueda dirigida (confirma ≥0,8; desmentido → descarta) ·
  mercado real de esa noche (+25% sobre la línea del mes). **Caducidad a 21 días.**
- 🚨 Con la búsqueda caída NO se decide nada (solo cuentan las verificaciones ÚTILES) y el latido nuevo
  `sivra_eventos_verificar` se pone en rojo. Migración `2026-08-12_eventos_verificacion.sql` **aplicada**.
- Decisiones de Alberto: verificar y decidir solo (incl. auto-confirmar) · Telegram solo para pelotazos
  (factor ≥1,4) y para el latido. `decidido_por='alberto'` bloquea al cron. Diseño en `docs/superpowers/specs/`.

### 💸 (12/08/2026) Veredicto: intradía NO, y la mejor inversión no está en bolsa — `docs/INVERSION-VEREDICTO-2026-08.md`
- Alberto pregunta si meter toda la cuenta a intradía al 0,5-1% diario, y luego por cruces de medias.
  **No, con sus propios datos:** 227 ejecuciones reales 2026 → −34,0% YTD, acierto 17,2%, PF 0,28,
  esperanza −172 $/op (Kelly negativo). Retorno monótono por horizonte: **−1,88% a <1 día vs +1,16% a >10 días**.
- Cruces de medias ya medidos: `momentum` (EMA12/26+MACD) es la PEOR del torneo (hit 24,1%, ret −0,63%).
  Backtest propio SPY 30 min/77 sesiones: ninguna variante bate comprar-y-no-tocar (+8,43%).
- **Hallazgo grande:** comisión Booking = 19,72% real (`amount_gross−amount`), **120.635 € en 5 años**;
  en 2026 (22.504 €) supera la pérdida bursátil (16.698 €). DIRECTO en 2026 = 0 € con `apps/sivra` y la
  skill SEO ya construidas. Booking = 92% de facturación (riesgo de canal: Airbnb 42.460 €→1.219 €).
- Regla dura añadida a la skill `trading-analista`. Decisión de no operar en real SIGUE vigente. PR draft #1387.
- **Plan de reservas directas** (`docs/PLAN-RESERVAS-DIRECTAS.md`). Palanca clave: Booking renunció a la
  paridad de precios en el EEE el 02/12/2024 (DMA art. 5(3)) → **legal ser −10% en web propia**.
  Meta año 1: 20% directo ≈ 5.000 €. ⚠️ **Diagnóstico inicial CORREGIDO el mismo día — ver entrada 🏠.**

### 📧 (12/08/2026) facturas-correo — pasada diaria sin novedades
- Vía B sana (`dias_caido=0`), backlog `PDF-pendiente`/`Revisar` vacío, 0 candidatos Gmail y 0
  subidas manuales nuevas.
- Paso 4.0: única fila `sin_revisar` (Endesa-Dúplex marzo, 69,21€) ya estaba conciliada de antes
  (mismo `factura_ref`) — solo faltaba el FK `movimiento_id`, backfilleado en Supabase.
- PR draft #1383 (solo bitácora) abierto y en seguimiento (`subscribe_pr_activity`).
- Pendiente sin resolver: `search_threads label:Facturas/Extraccion-fallida` (Label_16, 1 mensaje
  según `list_labels`) devuelve vacío — posible lag del índice del conector Gmail, revisar a mano.

### 🏷️ (12/08/2026) El contraste diferido casi anula tesis BUENAS: el ref con la fecha corrida
- Mergeado **#1370** (contraste diferido, opción (a)). La pasada del 11/08 —primera con #1363 en prod—
  salió perfecta: **22 símbolos** (13 la víspera), **0 vetados**, 0 anulados, 4 huellas + 2 latidos,
  1 sola pasada. El arreglo del veto falso funciona en real.
- Al probarlo contra IBKR apareció un fallo del propio #1370: una pasada que corre ANTES del cierre
  guarda bajo la fecha de hoy el **cierre de AYER**. El repaso manual del 06/08 (09:34 UTC) dejó MSFT
  en `precio_ref` 487,46 con cierre real 499,86 → **−2,48%, por encima del umbral: habría anulado esas
  tesis**. Y 487,46 es al céntimo el cierre del 05/08 (CVX igual, pero su desvío se quedó en −1,49% y
  no llegó a saltar: no se vio antes por suerte del mercado, no porque no estuviera).
- Arreglo (**PR #1382**): `ETIQUETA_TOL` — si el ref se parece al cierre de la sesión ANTERIOR mucho más
  que al de la suya, es la etiqueta corrida, no un precio malo: no se juzga ni se anula, y se canta.
  Un precio envenenado no se parece a ninguno de los dos, así que sigue cayendo. 50/50 tests.
- Skill `trading-analista`: sección nueva **«cuándo se corre y por qué importa la hora»** (repasos a mano,
  SIEMPRE después del cierre americano).

### ⏰ (11/08/2026) Recordatorios de seguimiento del laboratorio de inversión (decisión: seguir en paper)
- Alberto, tras el informe de la auditoría: **seguimos en paper** («ok seguimos entonces») + recordatorios.
- Trigger **quincenal** `trig_01FJtQFiEMVGnEj9vpdBYA3f` (días 1 y 15, 08:00 UTC, sesión nueva + push):
  informe del forward vs SPY, escalera con cobertura, cohetes y veredicto sobre dinero real. Solo escribe
  en memoria/PR si hay cambio material. **One-shot** `trig_014V3ytMp9JZPwnbkEPxZRWu` el 16/11/2026
  (hito ~4 meses de la cohorte 18/07 → evaluar Tramo 2; push+email).
- ⚠️ Limitación: los triggers por MCP no almacenan conectores en esta org → el prompt lleva plan B
  (leer el hero de `/invitado/trading` con el token de `trading_acceso_token`; si se rota el token,
  `update_trigger`). Documentado como rutina 14 en `docs/RUTINAS-PROGRAMADAS.md`.

### 🛡️ (11/08/2026) Auditoría completa del laboratorio de inversión + guardián de datos en TODOS los caminos
- Origen: Alberto vio a RDY nº 1 (score 6,03) — EY 682% (ADR en rupias, familia ORCL #1189). **#1373**: la página
  puntuaba la caché CRUDA (el guardián `calidad-datos.ts` solo lo aplicaban cron y analisis-simbolo) →
  `neutralizarUniverso()` + backfill BD (RDY/BMNR/VRSN). Verificado en prod: nº 1 ahora SNDK, RDY score null.
- **#1374**: mismo agujero en `/api/trading/seleccion` (¡la ruta que congela cohortes!), caza-cohetes y `/factores`.
- Auditoría (agente + SQL): 🔴 PENDIENTE GORDO — el walk-forward que alimenta la 🪜 escalera mide con ventanas
  DESALINEADAS (series truncadas de Stooq → retorno de otra ventana; riesgo cesta vs bench en longitudes distintas)
  y sin declarar cobertura. 🟡 momentum sin ventana declarada ni guarda de costuras; Piotroski NULL→0 regala puntos;
  cohetes sin precio se congelan a precio de entrada; `/analizar` se cree el nav del body; Dataroma caído = «sin gurús».
- Track real (23 días): cesta mediana +0,24% vs SPY +4,20% (baten 3/8) · cohetes −2,6% (alpha −7,2%) · torneo hit 26-28%
  ret ~0 (n=460) · Tramo 1. Sin señal de ventaja aún — la decisión de no operar en real sigue vigente.
- **El 🔴 gordo ARREGLADO en la misma sesión:** nuevo `module-trading/medicionAlineada.ts` (series FECHADAS,
  misma ventana cesta/bench, cobertura declarada — serie truncada de Stooq → `sinDatos`, nunca un retorno de
  otra ventana); `paper-tracker` migrado y la escalera gana gate `cobertura ≥ 80%` (enmienda de
  operacionalización, `COBERTURA_MIN_ESCALERA`). Quedan 🟡: momentum/costuras, Piotroski NULL→0, cohetes
  a precio de entrada, nav de `/analizar` sin contrastar, Dataroma caído = «sin gurús».

### 🔁 (11/08/2026) FK real facturas↔banco y el barrido del backlog como paso OBLIGATORIO
- Cierre del hilo de la factura 47/2026 (#1372). El fallo de fondo no era de dato sino de método: la pasada
  solo miraba el correo nuevo, así que su «sin novedades» era cierto sobre la bandeja y falso sobre la
  contabilidad — 11 facturas archivadas llevaban desde enero sin cargo casado.
- **Causa estructural:** `facturas_drive` y `movimientos_bancarios` no tenían relación; el único puente era
  `factura_ref`, texto libre con 4 formatos. **FK APLICADA** (Alberto: «tira con la FK»):
  `facturas_drive.movimiento_id` + `sin_cargo_motivo` (migración `2026-08-11_facturas_drive_movimiento_fk.sql`).
  **Tres estados**: casada · `revisada_sin_cargo` (con motivo) · `sin_revisar` — un NULL ya no es «no hay».
- Backfill 2026 de las 38: **29 casadas** (25 automáticas + 4 a mano), **8 revisadas sin cargo** (Pepephone
  ene–jun y Giraldillo mayo `sin_cargo_localizado`, CREATE junio `duplicada`), **1 sin revisar a propósito**
  (Endesa Dúplex marzo: su cargo se separa 9,70€ y no 5,78€ del patrón → que alguien abra el PDF).
- Nuevo **Paso 4.0** en la skill: toda pasada abre `v_facturas_sin_cargo` ANTES de conciliar lo del día, y
  al conciliar escribe la FK (o el motivo). PR #1376. Pendiente de Alberto: Pepephone (¿cuenta de la SL?) y
  si el Giraldillo de mayo está sin pagar.

### 🧾 (11/08/2026) Conciliada la factura 47/2026 de Jaime Salas (electricidad Socorro 24)
- Alberto preguntó por el cargo `TRANSF. 2100 FACTURA 472026 REPARACIN ELECTRICIDAD` −278,30€ (Kutxa, 07/08),
  que salía ❌ en `/finanzas`. La factura SÍ estaba archivada desde el 07/08 (Drive `1BNr2lF0…`, fila en
  `facturas_drive`, proveedor `jaime-salas-electricidad`); lo que faltaba era la conciliación bancaria.
- Causa: la pasada del 07/08 archivó la factura ANTES de que el cargo entrara por PSD2 (feed iba por el 06/08),
  y al importarse después cayó con `destino='personal'` por defecto — nadie volvió a recogerlo.
- Movimiento `1b1204d7` actualizado: `turistico_pisos` · `prop_house_sevillana` · `conciliado=true` ·
  `destino_confirmado=true` · `factura_ref` al PDF de Drive. Deducible al 100% (gasto corriente).
- **Barrido del mismo fallo en todo 2026** (Alberto: «mira si hay más facturas sin conciliar»): 10 más
  casadas — 8 recibos EMASESA (ene/mar/may, los 3 pisos, con `propiedad_id`; los de mar y may traen el
  nº de factura en el propio concepto), CREATE ventilador Socorro 123,45€ e IONOS 1,82€.
- **PriceLabs resuelto por Alberto (11/08): «es por el cambio».** Factura SIEMPRE 64,96 USD el día 8 de
  cada mes (feb–jul) y el banco carga el euro del día — 54,99 · 55,91 · 55,59 · 55,38 · 56,38 · 56,98€.
  La diferencia es solo FX, no un descuadre. Conciliado el cargo de junio (56,38€) con su PDF; feb, mar,
  abr, may y jul siguen sin PDF archivado (hay que bajarlos del portal). El deducible es el EURO cargado.
- Quedan 4 avisos SIN tocar (necesitan a Alberto): Pepephone ene–jun (6 PDF archivados y **ningún**
  cargo suyo en las cuentas de Alberto → probablemente se carga en la cuenta de la SL); lavandería
  Giraldillo mayo 504,57€ sin cargo (paga el mes vencido; el de abril sí está); Endesa Dúplex 24/07
  87,42€ con cargo pero sin PDF archivado; fila duplicada en `facturas_drive` del ticket CREATE
  (`create-socorro` + `create_ventilador`, mismo importe y fecha, distinto fileId — el banco solo tiene
  UN cargo).

### 📈 (11/08/2026) /trading rediseñado: hero con las 2 respuestas (empresas + rentabilidad)
- Petición de Alberto: la página daba mucha info; lo que importa es qué empresas interesan y cómo va la cartera.
- Hero doble arriba (💡 señales 📈 + top ranking + compras del agente · 📊 mediana vs SPY + curva + tramo escalera);
  onboarding condensado a 1 línea; forward paper, cartera cohetes y caza-cohetes PLEGADOS.
- Nuevo `DetallePerezoso.tsx` (details con montaje perezoso — la cartera de estudio ya no paga fetch+Recharts si nadie la abre).
- Honestidad de datos: banner «datos parciales» si falla una query (antes un fallo de BD pintaba el 🌱 vacío),
  alpha/IPO null ya no salen como ⚠️/0€, celda de señal «no calculado» fuera del top-20; fixes móvil 320px + hex→tokens.
- **PR #1368 MERGEADO y verificado en producción** (hero servido, 0 errores runtime; revisión previa con
  agente de diseño). Follow-up: 401 de `/api/trading/cartera-estudio` al invitado ya no se pinta como «fuente caída».

### 🔀 (11/08/2026) Rescatados los 2 PRs con semanas en conflicto: #755 y #1055 MERGEADOS
- Orden de Alberto tras el FYI de la auditoría. Conflicto en ambos = memoria (sus entradas de julio
  chocaban con la rotación mensual) + radiografía generada; las entradas se archivaron en
  `docs/memoria/2026-07.md` (05/07 CSV con su caveat; 21/07 mariscos) y se regeneró la radiografía.
- **#755** banca: importar extractos CSV (tests 6/6; ⚠️ caveat: re-importar el export completo sin IBAN duplica el ledger).
- **#1055** NUEVA vertical `apps/mariscos` + `@central/module-pesca` (Fase 1 trazabilidad/etiquetado, 8/8 tests, build OK).
  **Pendiente para darla por viva:** proyecto Vercel (Root `apps/mariscos`), ejecutar su SQL en Supabase
  (preview→prod), sembrar cuenta real de Mariscos González; Fase 2 báscula/etiquetadora.

### ⚖️ (11/08/2026) Contraste diferido: la 2ª fuente juzga AYER, que es lo que sí ha publicado
- Mergeado **#1363** (el contraste del mismo día dejaba de vetar precios buenos) y desplegado en prod.
  Efecto colateral asumido: a las 20:30 UTC la fuente casi nunca tiene el cierre del día → contraste inerte.
- Alberto elige la **opción (a)**: comparar el cierre que la fuente SÍ publica de la sesión D contra
  nuestro `precio_ref` de D. Siempre disponible, cero falsos vetos; el remedio cambia — en vez de vetar
  el precio de hoy, **anula la tesis de ayer** (y su resultado) antes de recalcular el walk-forward.
- `juzgarDiferido` (puro, 9 tests) con dos frenos: un **split** desplaza TODAS las sesiones por el mismo
  factor → no se anula; si discrepa en **>½ de los símbolos** (≥4 con dato) la sospechosa es la FUENTE y
  tampoco se anula nada. El mínimo de 4 salió de un fallo real: sin él el interruptor se disparaba con un
  solo símbolo y la guardia quedaba muda justo en el caso que existe para cazar.

### 🔧 (10/08/2026) Pricing: el reparto mes/global del factor de demanda deja de perderse (#1361)
- `factorDemandaFecha` decidía por fecha si la demanda se mueve con la ocupación DEL MES o la anual,
  pero esa decisión solo viajaba en la respuesta HTTP del cron (nadie la guarda) — y su `.catch(() => [])`
  hacía que un fallo de la consulta cayera TODO a factor global sin un solo error en el log.
- Fix: `pricing_applied.demanda_fuente`/`demanda_gateada` por fecha (filas viejas a NULL a propósito) +
  aviso Telegram si la ocupación mensual es ilegible. `ok` no pasa a false (degradación, no fallo).
  Migración `2026-08-10_pricing_applied_demanda.sql` aplicada antes que el código. Detalle en skill
  `pricing-agente` (`estado-y-protocolo.md`).

### 🛡️ (10/08/2026) La 2ª fuente vetaba precios BUENOS: el contraste comparaba contra la sesión anterior
- La pasada del lunes 10/08 corrió **entera y por primera vez con las 4 huellas + el latido
  `trading_analizar`** (20:33 UTC). Pero vetó 8 de 21 símbolos en `/analizar` y descartó 5 precios
  en `/puntuar` — **ninguno estaba mal**.
- Causa: la pasada corre a las 20:33 UTC, media hora tras el cierre de Wall Street; Stooq/Yahoo aún
  publicaban el cierre del **viernes 07/08** (verificado contra IBKR) y `DIAS_CONTRASTE_MAX = 5` lo
  aceptaba *como si fuera el de hoy*. Cada «divergencia» era el hueco viernes→lunes de esa acción.
- Arreglo (**PR #1363**): el contraste **solo acepta el cierre de la MISMA sesión** (`juzgarPuntos`,
  puro y testeado con los datos reales del 10/08); si la fuente va por detrás → `desfasados`, que no
  veta y se canta en el latido. Consecuencia asumida: **el contraste queda inerte casi todas las
  noches** a esta hora — visible, no silencioso. Pendiente de decisión de Alberto: contraste diferido
  (comparar el cierre publicado contra nuestro `precio_ref` de ESA fecha) o cron aparte unas horas después.

### 💸 (10/08/2026) Decisión: Alberto deja de operar en real hasta aviso del agente
- Dos operaciones manuales reales en IBKR hoy con stops demasiado pegados: SPCX (270 acc.
  a 134,25 $, stop −2,35% saltó en 1 h, −855,10 $; luego recuperó POR ENCIMA de la entrada)
  y PLTR (200 acc. a 178,04 $, stop −0,72% saltó en 46 min, −258,77 $). Total −1.113,87 $.
  Confirmación en vivo de H9: el stop convierte el bache temporal en pérdida cerrada.
- **Decisión (sesión de solo charla, anotada a mano):** no operar más en real por impulso;
  esperar los avisos del agente `trading-analista`. OJO: el agente sigue en Fase 1 (paper) —
  sus ideas por Telegram son simuladas y la puerta a Fase 2 sigue cerrada (decisión de Alberto).
- Alberto pide **aviso explícito cuando el forward justifique plantear Fase 2** (hoy lejos:
  hit rate 26-29%, retorno medio ~0 sobre n=103 en `trading_estrategia_stats` al 08/08).

### ✅ (10/08/2026) Confirmación final: motor 100% operativo y probado tras la baja de PriceLabs
- **Prueba reina:** snapshot Smoobu 10/08 = últimas escrituras del motor del 09/08 **al euro en
  604/604 fechas** (129/205/103/167 por piso). PL mudo post-pausa (0 divergencias 14:30↔20:30).
- Alertas «precio_revertido» del guard 07:31 = restos PRE-pausa (últ. escritura 08/08, PL las pisó
  antes de las 15:00 del 09/08); la pasada 08:30 de hoy ya re-escribió las 7 → se autolimpian.
- Pasada 08:30 sana: 455 escrituras, 0 bajo suelo, 0 bajadas fuera del raíl (106 subidas sobre-raíl
  = suelos/eventos/ancla, legales por diseño). Previstos v2 verificado en vivo (House 25-nov 467 =
  base×1,25 ASEICA). 1ª reserva House bajo el motor: 11-13/09, 672€/noche ≈ 1,4× p50 fiable.
- **Vigilancia diaria 09:00 UTC** (`trig_01Eagedr...`) sigue hasta el OK de Alberto; PR #1345 mergeado.

### 💶 (10/08/2026) Pricing sivra — ciclo semanal completo (4 pisos)
- Ciclo semanal del agente de pricing: los 4 pisos (no solo los ya en vivo). Mercado real Booking
  (aforo real) para may/jun/jul-27 (estaban con 1 sola fecha, rancios) — 120 comps nuevos, ninguno a 0.
  Propuestas dry-run aplicadas por los raíles en los 4 pisos; circuit-breaker sano.
- Hallazgo: el bucket MENSUAL de junio-27 queda inflado por Karol G (11-13 jun) — el finde normal
  (25-27 jun) vale 126€ real, no los 339€ del mes. Usar siempre fecha exacta, no el mes, en junio.
- Pendiente: confirmar con Alberto si la venta de Busto-Feria (17-abr-27) a 103€ es real (sin fila en
  `incomes`) o un bloqueo/desfase; revisar 3 fechas de Luxury marcadas "no_disponible" pese a libres.
- Detalle en `pricing_aprendizaje` y `pricing_decisiones` (fuente=`agente_ciclo_10_08_2026`).

---

### ⏳ (09/08/2026) Last-minute encendido · sin techo de precio (decisión) · barrido PL de baja
- **Decisión de Alberto (2 palancas):** (1) **SIN techo** — `max_price` queda NULL a propósito
  («no tope! final copa rey hay q aprovechar»; el raíl permite bajar a tiempo). NO re-proponer.
  (2) **Last-minute ON**: `lastminute_k=0.5` en los 4 pisos, con su condición «que ganemos dinero,
  si no prefiero no vender» — cubierta porque el descuento va ANTES de min_price/suelo estacional/raíl
  y las noches de evento no se rebajan. De paso `seasonal_floor_k` 0→1 en Dúplex/House (venían del
  dry-run). SQL registro: `prisma/sql/2026-08-09_lastminute_activado.sql` (aplicado ~16:00 UTC).
- **Barrido «PriceLabs de baja»** en memoria/skills/facturas-control/UI → PR #1345 (draft).

### 🌊 (09/08/2026) Lente costa norte en mercado: preferencia por viviendas de playa Asturias/Cantabria
- **Preferencia de Alberto** (con una casona en Colunga, 235.000€/257 m²/~914€/m²): «da preferencia a
  casas como estas, cerca de playa en el norte». Nueva lente PURA `costa-norte.ts` en `module-subastas`
  (litoral asturiano+cántabro, matching por palabra completa — «Isla»/«Salinas» fuera por Isla Cristina)
  + `lenteCostaNorte`: viviendas sin señales de obra AUNQUE no lleguen a chollo (en el norte casi nunca
  hay mediana de zona; referencia null SE DICE, no se calla). `lentesMercado()` en plataforma: sección 🌊
  en el Telegram del cron `subastas-mercado` y en /subastas; chollos de esas zonas etiquetados 🌊 y primero.
- **MERGEADO** (#1346 + fix #1347) y probado contra el corpus real (741 comps, 99 en zona norte — las
  alertas ya cubren Gijón/Villaviciosa/Llanes): lente 93 viviendas, 15 chollos 🌊, 0 falsos positivos del
  sur. El fix #1347: un descuento de derribo (>50%) saca de la lente (la derruida de Llanes salía 1ª con
  −73% y título limpio — la doctrina del peaje de obra aplica también aquí). Prod desplegado y verificado.
- **Refinada por Alberto y MERGEADA (#1349):** solo CASAS (pisos fuera), tope 230.000€, +Islantilla
  como zona preferente; orden rebajadas→particular→descuento (ordenan, NO filtran — exigir rebaja
  escondería el recién publicado mal preciado). `dedupeRelistados`: Idealista re-publica con ref nuevo
  (piso de Ceares duplicado en la UI, verificado en BD) — colapso por (portal,título,precio,m²) al corpus
  entero. Corpus real: 11 casas ≤230k (Villaviciosa −49%, 6 adosados Islantilla), 43 re-listados fuera.
- **3ª ronda (#1351, mergeado):** (a) la preferencia llega a SUBASTAS — vivienda en zona 🌊 suena SIEMPRE
  en `subastas-avisos` con cabecera «🌊 TU PREFERENCIA» aunque el filtro rentable/limpia la silenciara
  (honestidad: el aviso dice si va sin verificar); (b) **Matalascañas** entra como zona preferente tras
  medirla en vivo (Fotocasa: 216 anuncios vs 133 Islantilla, mediana 2.857 vs 3.308 €/m²); (c) pestaña
  **🔥 Oportunidades** default de /subastas (diseño del agente Plan): bloque 🌊 fijo + lista única
  portal+subastas por atractivo, tarjeta compacta de subasta, filtros casas/rebajados/particular/fuente.
- **4ª ronda (#1353, mergeado y READY en prod):** Alberto creó la alerta de Idealista en Matalascañas SIN
  límite de precio (casas/adosados) → `ZONAS_SIN_TOPE = ['Matalascañas']` en la lente (el tope 230k sigue
  en el resto); copy de Telegram y /subastas lo dicen. Las SUBASTAS ya iban sin tope (el aviso forzado 🌊
  nunca filtró por precio). Decisión de estrategia: Asturias = chollo puro con gestora (~20-25% comisión);
  Huelva = uso mixto autogestionado — el radar vigila ambas. Skill `plataforma-maestro` actualizada.
- **5ª ronda — rediseño de 🔥 Oportunidades** («veo muy destartalada la página y poco clara», agente de
  diseño): UNA tarjeta `TarjetaOportunidad` para chollos/preferentes/subastas (precio 20px primero, chips
  homogéneos `ChipUI` con tokens --positive/--warning/--info, evidencia €/m² siempre visible, resto plegado
  en «Más datos»); cabecera con contador real + explicación en `<details>`; 🌊 en caja --info-bg colapsada
  a 5 con «Ver todas (N)»; filtros en fila scrollable (320px OK). Solo presentación, lógica intacta.
- **Repaso 12/08 EJECUTADO — todo sano:** corpus fresco (844, último hoy 05:50) y avisos vivos (93
  chollo_avisado_at en 7d, último hoy 06:21; Islantilla/Ribadesella avisados hoy); crons subastas al día
  (ingesta 06:00 · enriquecer 06:16 · radar 06:30); 0 errores runtime en rutas subastas (48h). Matalascañas
  sigue en 2 comparables PERO la alerta de Idealista SÍ llega (digest diario: «Viviendas en Matalascañas,
  Almonte — Nada nuevo por aquí hoy») — no hay chalets nuevos publicados, no es fallo. 0 subastas vigentes
  en zona 🌊 ahora mismo (el aviso forzado no ha tenido con qué dispararse; camino fijado por tests).
- Ojo: la lente solo ve las alertas guardadas — para vigilar más norte, crear alertas de Idealista en
  esas zonas. Galicia/Euskadi pendientes (patrón Cádiz).

### 🎯 (09/08/2026) Los 4 pisos bajo el motor · PriceLabs de baja · previstos v2 · fix verificado en vivo
- **Decisión de Alberto:** «el agente coge las riendas de los 4 apartamentos». Los 4 con
  `apply_enabled=true` + `channel_markup=1.0` (SQL aplicado tras deploy del PR #1337, mergeado).
  Pasada real 14:30 verificada: 4 pisos escritos, anclas al euro de lo predicho (House 4-sep 421€,
  Dúplex 13-nov 149€…), raíl ±20% respetado vs ancla diaria; 0 alertas nuevas.
- **PriceLabs:** Alberto pausó Dúplex/House en PL ~15:00 UTC (medido: 1.140/1.653 escrituras suyas
  sin motor esa semana; Busto/Luxury ya limpios). Curva PL persistida como suelo (120 días).
  Vigilancia: test de silencio de PL tras pasada 20:30 + snapshot y guard mañana (triggers armados).
- **Previstos v2 (idea de Alberto, riesgo asimétrico):** evento `previsto` LEJANO (≥60d) sube precio
  ponderado por confianza (×0,5); cerca se retira solo; confirmado = factor pleno. Tests 1.081 verdes.

### ✅ (09/08/2026) Pasada diaria de trading completada — 2 PRs mergeados en caliente para arreglar `date - bigint`
### 🔀 (09/08/2026) Backlog de PRs revisado y drenado: 3 mergeados, 1 superado, 2 a decisión
- Revisión "que no sea antiguo lo pendiente": mergeados #1304 (informe auditoría 08/08), #1329
  (auditoría profunda 09/08 + landmines subastas en CLAUDE.md + watchdog 3 tramos en RUTINAS) y
  #1333 (entrenador: fix `fecha`→`fecha_operacion` en `psd2-health-check` + poda bitácora),
  resolviendo sus conflictos de inserción contra el vivo podado. #1340 (::int trading) ya estaba en main.
- **#1323 (demanda por mes) SUPERADO a medias:** main ya tiene OTRO `pricing-demanda.ts` (gateo por
  antelación, 09/08) con API distinta; lo que #1323 añade de más (ocupación POR MES + boost
  `mes-anticipado`) hay que rehacerlo sobre el código nuevo — no mergear tal cual (ver Estado vivo).
- #1055 (mariscos) y #755 (CSV banca) siguen a decisión de Alberto. Verificado post-merge: CI verde
  ×3, rotación 17/17 + dry-run limpio, 0 marcadores de conflicto, vivo en 17 KB.

### 🔴 (09/08/2026) Pasada diaria de trading BLOQUEADA desde el despliegue de la guardia de precios — fix en PR draft
- Rutina `trading-analista`: NAV IBKR (33.328,17€) empujado a `/banca` OK; watchlist + histórico de 16
  símbolos bajado sin incidencias. `POST /api/trading/analizar` devolvía **500 en cada intento** (payload
  completo y mínimo de prueba) → causa raíz: `lib/trading/precios-guardia`, query hace
  `fecha - DIAS_REFERENCIA_MAX` sin castear la constante, Prisma la manda `bigint`, Postgres no define
  `date - bigint`. Rota desde que se desplegó esa guardia (post-incidente CVX 03/08) — toda pasada de
  análisis desde entonces había fallado en silencio.
- Fix de una línea (`::int`), verificado byte a byte contra Supabase. **PR #1340 mergeado a petición de
  Alberto** ("mergea"); tras el redeploy se encontró el MISMO bug sin corregir en `/puntuar` (copia literal
  de la query, no cubierta por #1340) → **PR #1341**, mismo fix, mergeado también.
- Pasada completada tras los dos redeploys: 14/16 símbolos analizados (SNDK/WDC vetados por la guardia de
  suplantación), 2 compras paper nuevas (NVO 90u@47,26€, PLTR 17u@172,01€), 24 tesis puntuadas walk-forward,
  0 stops. Resumen enviado por Telegram.
- **Fase 2 (dinero real):** Alberto preguntó por adelantar el plazo — recordado que ya existe
  `docs/TRADING-HIPOTESIS-PREREGISTRO.md` § «Plan de despliegue de capital REAL» (firmada 05/08): la
  escalera la suben las SEÑALES, no el calendario (`lib/trading/puerta-fase2.ts`). Estado real hoy:
  cohortes paper en 14-16 de los 120 días que exige el Tramo 2 (~12%). Verificado que el cron semanal
  `paper-tracker` (lunes 10:00 UTC) NO está roto — el dato del 03/08 es el último lunes, no un fallo.
- **Watchlist ampliada** (`trading_watchlist`, capa C): +**ORCL** (a petición expresa, con caveat: la
  tesis de rebote en EMA100 mensual que la motivaba ya fue REFUTADA por H8 y tuvo un incidente de datos
  serio el 31/07); +**BKNG**/+**APP** (únicos `guru:true` del top-20 del radar factorial 03/08 no
  presentes en la watchlist); +**SQM**/+**CHT** (mejor calidad restante del top-20, sector diverso —
  litio/materiales y telecom, sin solapar con lo ya cableado). `trading_cantera` (pipeline de
  descubrimiento IBKR-temas+FMP) sigue vacía — no se ha ejecutado ese flujo, es un mecanismo distinto
  del radar factorial usado aquí.
- **Decisión explícita: NO maximizar la watchlist.** Alberto preguntó por meter "el máximo posible" de
  símbolos; se explicó y se decidió NO hacerlo — más símbolos no acelera Fase 2 (gate por antigüedad de
  cohorte, tabla `trading_paper_track`, no por nº de tickers de la watchlist diaria), y sí infla el
  fetch secuencial de IBKR (techo 300s en `/analizar`) y arriesga meter ruido/correlación en las
  estadísticas de `trading_estrategia_stats`. Watchlist final: **21 símbolos** (3 índices, 10 capa B,
  8 capa C). Alberto delegó la decisión final ("lo dejo en tu decisión").

### 🛡️ (09/08/2026) Auditoría PROFUNDA semanal — todo verde, PR #1329
Pasada completa `auditoria-central` (no solo la ligera): typecheck 0 errores en las **8 apps**, tests
sin fallos, sin secretos con fallback literal, Supabase advisors 0 ERROR, heartbeat de crons/agentes
limpio, automerge de rutinas sano. Único hallazgo: 21 vulns de `pnpm audit`, ninguna explotable
(documentado). Reconciliados 2 docs desactualizados que #1328 (ligera, mismo día) no cubrió:
`apps/plataforma/CLAUDE.md` (subastas sin los PRs #1324/#1325/#1327) y `docs/RUTINAS-PROGRAMADAS.md`
(watchdog de trading descrito con 2 tramos en vez de 3, huella de pricing desactualizada). Informe
completo `docs/AUDITORIA-2026-08.md`.

### 🤖 (09/08/2026) agentes-entrenador — pasada semanal (29/07→09/08): backlog sano, un fix trivial
- Backlog de PRs `claude/*` abiertos: **5** (bajando desde 73→31 del barrido de Alberto de 29/07) —
  sin crecimiento, sin necesidad de escalar. `FEEDBACK-AGENTES.md` sin pendientes.
- Único fix: `psd2-health-check/SKILL.md` usaba la columna `fecha` (no existe; real
  `fecha_operacion`, confirmado contra Supabase) — señalado el 05/08, corregido ahora.
- Resto de fallos del rango (tope real de mercado-booking, sonda pricing en verde falso) ya
  resueltos por PRs de sus propias sesiones (#1314, #1318) antes de esta pasada.
- 🔇→✅ Canal Telegram mudo (401, `ALERTA_TOKEN` desincronizado) — a petición de Alberto, resuelto en la
  misma sesión SIN tocar Vercel: registrado el token que ya lleva esta rutina en `rutina_tokens`
  (3ª vía de `docs/AVISOS-AGENTES.md`). Verificado end-to-end (200 + Telegram real recibido). Ningún
  tool de Vercel MCP expone env vars — la sincronización byte-a-byte en Vercel sigue sin ser algo que
  una sesión pueda ejecutar.

### 🧹 (09/08/2026) «Estado actual» podado: el vivo baja de 121 KB a ~15 KB por sesión
- La sección acumulaba 42 bloques (1.212 de 1.329 líneas, ~30k tokens de peaje en CADA
  sesión) porque la rotación mensual no la tocaba. Contenido ÍNTEGRO movido a
  `docs/memoria/2026-08.md`; queda solo el bloque «Estado vivo» (pendientes/decisiones).
- Reglas nuevas en la cabecera: qué admite «Estado vivo» y formato de cabecera de entrada
  (las entradas `## ` del 08-09/08 se convirtieron a `### ` — `rotar-memoria.mjs` no
  reconoce `## ` como entrada y las habría archivado fundidas con la anterior).
- Verificado: tests de `rotar-memoria` + `--dry-run` sobre el archivo nuevo. El dry-run cazó
  además un título con «16-18/10» al final que la rotación habría archivado en 2025-10 (la
  fecha de la cabecera es la ÚLTIMA que aparece) — reescrito «16-18 de octubre».

### 🔧 (09/08/2026) Reparadas las 3 causas de la venta bajo mercado del finde (motor pricing)
- **El `channel_markup` 1,16 NO existe en el escaparate** (20 reservas: bruto/listado 0,66-1,08,
  mediana 0,92; la del 06/11 a factor 1,004 exacto). La «confirmación» del 01/08 usó el importe
  corrupto pre-fix de la doble comisión. Guardas `>= 1` (con `> 1`, un 1.0 se ignoraba) en
  apply/settings/pricing-engine + `prisma/sql/2026-08-09_channel_markup_sin_recargo.sql` →
  **aplicar SOLO tras desplegar el código**.
- **Ancla suave por fecha** (`pricing-ancla-fecha.ts`): finde con mediana fiable (≥5 comps) ya no se
  tarifica al bucket del mes. **Demanda gateada por antelación** (`pricing-demanda.ts`): sin descuento
  por ocupación en fechas fuera de la ventana de venta. Detalle: adenda 09/08 en
  `docs/AUDITORIA-2026-08-precios-dinamicos.md`. tsc 0 · 1.067 tests · build OK.

### 🔎 (09/08/2026) Auditoría subastas 100% + captura de resultados por fin validada con la 1ª real
- Auditoría completa del módulo: 6 crons 200 hoy · corpus 41 vigentes sano (0 sin valor/docs/semáforo,
  18/18 con puja_minima) · barrido umbrales/coste/ITP sobre las 41 filas → 0 excepciones · 447+1054 tests.
- Hallazgo 🔴 (arreglado, PR): `capturarResultados` NUNCA capturó nada — la ficha concluida real
  (SUB-JA-2026-264154, El Puerto) publica el estado como BANNER, no como par, y el desenlace vive en el
  **certificado de cierre** (PDF público). Nuevos `resultadoDeBanner`/`parsearCertificadoCierre` (fixtures
  reales) + fetch del certificado en el cron; `con_pujas` calibra como adjudicada. E2E: las 2 concluidas
  reales resuelven con su puja máxima oficial (170.627,72€ / 161.712,72€).
- 🟡 sin tocar: dispatcher marca timeout en subastas-mercado si desborda 280s (2 veces/7d, el job acaba).

### ⚖️ (09/08/2026) Seguimiento subastas: backfill puja_minima + fix starvation de la cola
- Check-in post PRs #1324/#1327: parser OK (las 2 fichas releídas hoy → `puja_minima=0`), pero la cola
  del cron `subastas-enriquecer` (LIMIT 12/día) la monopolizaban re-pasadas NO-OP de la Junta (23 filas
  ya geocodificadas que solo refrescaban `enriquecida_at`) → las fichas del BOE se releían cada 3-4 días.
- Backfill manual con el parser real del módulo: 16 fichas vivas → `puja_minima=0` (18/18 al día).
- Fix (PR draft): la cola solo coge fuentes sin ficha si les queda trabajo real; `max` default 12→24;
  `REFRESCO_HORAS` 24→23 (el umbral exacto de 24 h hacía saltar un día sí/uno no por segundos).
- Verificado: cierre 09:00 → 200; sin errores runtime nuevos; Cancienes al ITP 8% asturiano = 95.112€.

### 💶 (09/08/2026) Verificación reserva Luxury 16-18 de octubre: 3ª venta bajo el p50 de fecha exacta
- Reserva Booking (Genius, 5p): 341,74€/2 noches = 170,87€/noche efectivo; lista 194€ (el motor
  bajó 208→194 el 08/08 14:30, reserva entró el 09/08 08:36). p50 real de esas fechas (comps 5p,
  barrido 09/08): 275€ (vie) / 258,50€ (sáb) → −27% en lista, −36% efectivo, bajo el p25.
- Causa: hueco conocido finde-sin-evento — ratio fecha/mes 1,1 < umbral 1,5 del premio de mercado
  → tarifica por bucket octubre (p50 250€) + descuento de demanda (ocupación ~12%). Mismo patrón
  que 06/11 (−43%) y 18/09 (−40%). Margen sano (coste 29,70€/noche); no ruinosa, sí barata.
- Sin cambios de código; el guardián debería avisar `reserva_bajo_mercado` en su cron. Pendiente
  (ya apuntado en skill): bajada last-minute real + revisar si el premio 1,5× deja escapar findes.
- Vía B sana (`dias_caido=1`), sin backlog en `PDF-pendiente`/`Revisar`/`Extraccion-fallida`, 0
  candidatos nuevos en Gmail ni subidas manuales.
- Cerrado 1 pendiente de días atrás: recibo Anthropic/Claude Max (180€, 05/08) archivado en Drive
  y conciliado contra el cargo bancario del 07/08.
- Sigue pendiente: Roborock Amazon -247,92€ aún sin aparecer en `movimientos_bancarios`. Detalle
  completo en `docs/AGENTES-BITACORA.md`.

### 🏛️ (08/08/2026) Subastas 3ª tanda: coste autoexplicativo, ITP valenciano al 9% y presupuesto del vigía — PR #1327
- «Coste real estimado: 806.015,16€» se leía como valoración de mercado (pregunta de Alberto sobre
  SUB-JA-2026-264062): es el coste puerta abierta simulando el remate al 100% de la salida — el
  titular y el aviso de Telegram lo dicen ahora explícitamente («…si rematas a la salida»).
- ITP Comunidad Valenciana corregido: 10%→**9%** (Ley 5/2025), tabla de tipos por CCAA re-verificada
  contra fuentes vigentes. `subastas-cierre` gana presupuesto de tiempo (mismo patrón que #1281/#1296).
- Rediseño de la ficha de subasta con la información de las tandas anteriores (ITP, umbrales, simulador).

### 📬 (08/08/2026) Subastas: cursor incremental por UID — la ingesta dejaba de releer 300 correos/día — PR #1296
- El cron diario pedía «últimos 30 días, hasta 150 correos/portal» siempre — como el corpus de
  Idealista/Fotocasa es acumulativo, relía ~300 correos para encontrar los pocos nuevos y se comía el
  presupuesto de tiempo (latido 07/08: «cortado tras 0 fichas»). Ahora cada portal guarda hasta qué UID
  leyó (`subastas_correo_cursor`, tabla propia — NO `correo_cursor`, que es el latido del triaje de correo).
- `lib/subastas/correo-incremental.ts` (puro, testeado): filtro `>lastUid` en cliente (RFC 3501),
  `uidvalidity` distinto → vuelve a ventana por fecha, cursor solo se confirma tras ingerir (at-least-once).
  BOE (`leerAlertas`) queda intacto, sin cursor. 826 tests, tsc 0, build OK.
- **VERIFICADO en producción (10/08/2026, 2ª pasada — la 1ª fue el bootstrap):** 34 correos leídos
  (23 idealista + 11 fotocasa, «desde uid N») frente a 300, **55s** frente a 284s, y **cero cortes por
  presupuesto** — fichas de anunciante y zonas se enriquecen enteras por primera vez desde el 05/08.

### 🧮 (08/08/2026) Subastas 2ª tanda: ITP por CCAA, puja en vivo, vivienda habitual y simulador
- **ITP por CCAA** (`module-subastas/src/impuestos.ts`): `calcularCoste` deja de aplicar el 7% andaluz a
  todo — la provincia elige el tipo general de su CCAA (Asturias 8%: Cancienes pasa de 94.248€ a 95.112€),
  con aviso del tipo aplicado y de las escalas progresivas. `params.tipoItp` explícito sigue mandando.
- **Vigía de pujas en vivo** en `subastas-cierre`: `mejorPujaViva()` (1 llamada/ficha, seguidas a ≤3 días)
  → `subastas.mejor_puja(_at)` (migración `2026-08-08_subastas_mejor_puja.sql`, aplicada) + Telegram 🔥 una
  sola vez si superan tu techo (`sobrepuja_avisada_at`). NULL nunca pisa un valor visto.
- **Vivienda habitual** (ya se extraía del edicto): `viviendaHabitualDeNotas` (round-trip testeado) afina la
  nota del art. 671 en umbrales/ficha. **Simulador «¿y si pujo X?»** en la ficha (módulo puro + financiación
  de criterios; banda de aprobación, admisibilidad, tramos). Tests 443 módulo + 1045 app, tsc 0, build OK.

### ⚖️ (08/08/2026) Subastas: deuda, puja mínima y umbrales LEC 670 en la ficha
- Pregunta de Alberto («¿se puja por la deuda? ¿el 70%?»): la «salida» YA es el valor de puja (tipo del
  BOE, no mercado); el 70% legal es del VALOR DE SUBASTA, no de la deuda (LEC 670). SUB-JA-* = judicial.
- 3 huecos arreglados: `cantidad_reclamada` era campo muerto (ahora en ficha), `puja_minima` sin consumidor
  (la puja máxima marca inadmisible/sin aprobación automática), y «Sin puja mínima» → centinela `0`
  (≠ NULL no publicada; COALESCE-safe, backfill solo vía relectura 24h del cron).
- Nuevo `module-subastas/src/umbrales.ts` (`umbralesPuja`/`estadoPujaMinima`) + `escenariosCoste` (70% del
  tipo + mediana provincial real). Score/coste siguen conservadores al 100% (decisión de Alberto).
- Telegram avisos con línea de umbrales+deuda. Migración documental `2026-08-08_puja_minima_centinela.sql`.
## 💹 (09/08/2026) La palanca de DEMANDA ya mira el MES, no el año — PR #1323 (draft, rehecho sobre #1337)
- #1337 (mergeado el 09/08) quitó el castigo a las fechas sin abrir, pero el `occ` de `pricing/apply`
  seguía siendo UNA ocupación anual por piso: el mes que se LLENA no podía subir el precio.
- #1323 se rehízo encima: consulta nueva de ocupación por piso+mes y `factorDemandaFecha`
  (`pricing-demanda.ts`) decide las dos cosas a la vez. Módulo único, +8 tests (1.075 verdes).
- 🚨 Trampa medida ANTES de darlo por bueno: usar el mes sin poder juzgar su ventana es PEOR que el bug
  — con muestra de antelación <10 (House jun/jul-2027) el 0% de un mes sin abrir hundía al suelo 0,92.
  Regla: la ocupación del mes solo se usa si la ventana es JUZGABLE; si no, factor global de siempre.
- Efecto real medido: 41 de 1.460 noches. House sept **+4,1%** (30 fechas); 11 fechas de agosto bajan
  ≤1,4%. Mucho menor que el +7,6% que se midió antes de #1337: aquel ya se llevó casi todo.
- Pendientes ya declarados: buckets feb→jul-2027, 23-oct/27-nov sin catalogar, `seasonal_floor_k` 0 vs 1.

### 🧱 (08/08/2026) Bandeja «cargos duplicados» de /banca responsive en móvil — PR #1319
- Captura de Alberto: en móvil las filas desbordaban (chips `flexShrink:0` + importe fuera de pantalla).
- Fix CSS-only en `BancaClient.tsx::DuplicadosBandeja`: media query ≤768px, concepto a ancho completo,
  fecha+chips+importe con wrap, botonera con wrap y botones ≥44px (`#duplicados`). Igual en «Ya resueltos».
- Mismo patrón que la bandeja «Gastos por revisar» del mismo archivo.
- Verificado 320/360px con Playwright (0px overflow). OJO: `next build` en el contenedor falla en
  page data de `/api/admin/clientes/[vertical]/[id]` YA en main (envs ausentes), no es del cambio.


- **📌 Estado vivo — pendientes y decisiones abiertas (actualizado 12/08/2026).** Detalle en
  `docs/memoria/2026-08.md` y en los PRs citados.
  - **Pricing SIVRA (motor vivo en los 4 pisos, resuelto desde el 09-10/08):** #1323 (ocupación
    POR MES) rehecho y mergeado sobre `pricing-demanda.ts`, `channel_markup_sin_recargo.sql`
    aplicado, last-minute encendido (`lastminute_k=0,5`) y reparto mes/global ya se persiste en
    `pricing_applied` (#1361, 10/08). Sigue abierto: el bucket mensual mezcla Serper+Booking sin
    filtrar `fuente` (propuesta: preferencia condicional + `bucket_fuente`, informe
    `docs/AUDITORIA-2026-08-precios-dinamicos.md`). feb→jul-2027 sin bucket (fallback de diseño;
    la rutina Booking lo va rellenando). A vigilar: 23-oct y 27-nov muy por encima de su mes sin
    evento catalogado.
  - **Mercado SIVRA:** `sivra_mercado_sweep` con latido rojo A PROPÓSITO hasta que la Rutina Booking
    consolide (Serper no distingue fecha). Incidente sin diagnosticar: 2º disparo de `mercado-booking`
    el mismo día sin huella del 1º (08/08, `docs/AGENTES-BITACORA.md`). Tope real ≈10-12 ventanas por
    pasada (las respuestas del conector no caben en contexto).
  - **Trading (solo paper):** auditoría del laboratorio 11/08 — el 🔴 gordo (walk-forward de la
    escalera desalineado entre cesta y bench) YA ARREGLADO en la misma sesión (`medicionAlineada.ts`,
    gate `COBERTURA_MIN_ESCALERA=0,8`, PR #1377). Quedan 🟡: momentum sin ventana declarada ni guarda
    de costuras, Piotroski NULL→0 regala puntos, cohetes sin precio se congelan al de entrada, nav de
    `/analizar` sin contrastar, Dataroma caído = «sin gurús». Contraste DIFERIDO (la 2ª fuente juzga el
    cierre de AYER en vez del de hoy, que casi nunca está publicado a la hora de la pasada) ya
    implementado y testeado — **PR #1370 en draft, pendiente de que Alberto lo revise/mergee**. H9
    (stop −10%/trailing −15%) sigue sin decisión de Alberto. Decisión vigente (10/08): no operar más
    en real por impulso, esperar aviso explícito del agente cuando el forward justifique Fase 2 (hoy
    lejos: hit rate 26-29%, alpha ≈0 sobre n grande). FMP sin créditos y redundante (Yahoo cubre); NO
    recargar. Solo el DCF sigue sin fuente.
  - **Subastas:** lente 🌊 (costa norte + Matalascañas sin tope) MERGEADA y en prod (#1346/#1349/
    #1351/#1353); pestaña 🔥 Oportunidades rediseñada (#1358 — una tarjeta, chips homogéneos,
    €/m² siempre visible). Repaso programado **12/08 07:00 UTC** (`trig_01AzUvq8vW2K8Aan4T7HG7c6`,
    HOY): verificar corpus Matalascañas creciendo, lente sin tope, avisos 🌊 sin duplicados. 🟡 el
    dispatcher marca timeout en `subastas-mercado` si desborda 280 s (2×/7d, el job acaba).
  - **Facturas/banca sin conciliar:** Roborock −247,92€ (House) sin aparecer en banco; Booking Dúplex
    587,23€ vence 16/08; Socorro 24 julio sin factura de comisión; Endesa Dúplex 24/07 87,42€ con
    cargo pero sin PDF archivado; fila duplicada CREATE (`create-socorro` + `create_ventilador`,
    mismo importe/fecha, distinto fileId — el banco solo tiene un cargo). PriceLabs: la diferencia es
    SOLO el cambio USD→EUR (confirmado por Alberto 11/08), junio ya conciliado; feb/mar/abr/may/jul
    sin PDF archivado (bajar del portal). Pepephone ene-jun (6 PDF, **ningún** cargo en las cuentas de
    Alberto — probable cuenta de la SL) y lavandería Giraldillo mayo 504,57€ (paga el mes vencido)
    marcados `revisada_sin_cargo`, a la espera de que Alberto confirme. Casos abiertos sin respuesta:
    Bernardi −466,70€ (House) y Valantin −84,61€ (Busto). Desde #1376 hay FK real
    `facturas_drive.movimiento_id` + `sin_cargo_motivo` (3 estados: casada · revisada-sin-cargo ·
    sin-revisar) y el Paso 4.0 abre `v_facturas_sin_cargo` en cada pasada, antes de conciliar lo del
    día. El cron `facturas-scan` sigue archivando TODO en `ALBERTO 2026 PERSONAL (SEGUROS)/<mes>` —
    revisar su resolución de carpeta algún día.
  - **Infra/entorno:** el proxy de egress del contenedor da 403 al CONNECT contra `*.vercel.app` y
    `script.google.com` → el raíl HTTP de plataforma no sirve desde sesiones (usar SQL o `pg_net`
    desde Supabase) hasta abrir la allowlist de red del environment. NIM tier gratis degradado
    (p50 ~25 s); pendiente suplente de `meta/llama-3.3-70b-instruct` (`buscador-ia`). Gemini apagado
    por defecto (gates `GEMINI_TEXTO`/`GEMINI_WEBSEARCH`). Pendiente en Vercel (fuera del repo):
    `SEO_AGENT_ENABLED=true` + bajar `SEO_MIN_IMPR` a 3-5 (ia-rest); PAT de Alberto sin
    `contents:write` sobre `house-sevillana-landing`; confirmar `CONTABLE_MODEL` con `NVIDIA_API_KEY`.
    Trial Tuya IoT Core caduca ~04/02/2027 (recordatorio one-shot creado para el 04/01/2027).
  - **Deuda de doc:** los datos vivos del CRM de ia-rest están en la BD COMPARTIDA (schema `iarest`);
    su AGENTS.md aún dice silo.
