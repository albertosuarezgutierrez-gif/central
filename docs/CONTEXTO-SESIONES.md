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

- **🏢 GLOBAL 2: el titular no salía en su propia póliza (02/09/2026, noche).** Alberto, revisando la
  6930FBP: «¿no aparece propietario la empresa?». Cierto — el **tomador NO es un interviniente** (es el
  `cliente_id` de la póliza), así que la tarjeta, que solo pintaba `poliza_intervinientes`, dejaba fuera
  a la empresa titular en las 4 pólizas vivas de GLOBAL 2. Ahora va delante y con su rótulo
  (`filasIntervinientes`, con cepo). Dos hallazgos más de la misma ficha: la consulta de intervinientes
  **no tenía `orderBy`**, y con tres furgonetas y tres conductores habituales distintos el teléfono
  «de la empresa» que se pintaba podía cambiar de una recarga a otra — ahora es determinista y dice de
  qué matrícula sale. Y a una sociedad se le pedía «DNI, apellidos y fecha de nacimiento»:
  `etiquetasIdentidad` rotula CIF/razón social/constitución. El CIF de GLOBAL 2 es suyo, no el DNI de
  nadie (comprobado por hash, sin leer el valor). Mergeado #2139.

- **🏠🏍️ «Haz todo» + el catálogo de Avant2 (02/09/2026, noche).** Mergeado #2130 (horquilla enchufada
  + capital de hogar por corroboración). Alberto pasó el catálogo de Integra: cruzado con las 109 vivas
  (tres compañías) sale que **RC no es un ramo de Codeoscopic** —8 activas sin camino automático— y que
  **moto sí existe** y no la tarificamos; ⚠️ es catálogo comercial, no configuración (Fidelidade, viva
  para nosotros, ni sale). Probando la ficha contra pólizas REALES de hogar aparecieron dos fallos:
  «responsabilidad civil del **inmueble**» se colaba como capital del continente (353.665,88€ plausible
  y falso; en EIAC `RC` es otro `claves_bien`), y `GET /car/brands` traía las marcas recortadas porque
  `onlyPopular` es `true` por defecto. Los dos con cepo mordido. Segunda pasada al snapshot del portal:
  contrato de moto, 131 operaciones, y la caducidad de un precio **solo aparece tras el re-rate** (que
  explica los 15 `expires_at` a NULL). PR #2133. `portal.api-int.codeoscopic.io` está **bloqueado por
  la política de red** del entorno: se lee del snapshot del 01/09.

- **🧹 Limpieza de duplicados: 16 fusiones más (02/09/2026, noche).** «Unifica lo que puedas». José
  Suárez Salas **ya estaba** unificado (una ficha, 21 pólizas) — corregido lo que se le dijo antes.
  Dos lotes nuevos sobre el motor del de la tarde: **`fusion-dni`** (8, mismo hash de DNI, criterio ya
  aprobado) y **`fusion-nombre-telefono`** (8, nombre+apellidos+teléfono, **fuera** del criterio porque
  no comparten póliza → se preguntó y Alberto dijo que sí; 20 pólizas y 14 bienes movidos). Tras los
  tres lotes: **0 DNI repetidos, 0 grupos nombre+teléfono con cartera viva, 0 pólizas en una lápida**;
  50 fusionadas, 32.551 vivas. ⚠️ Fallo propio: la herencia de huecos no cogió unos apellidos porque
  `clientes.apellidos` es **NOT NULL** (su hueco es `''`) y se filtraba por `is_nullable` comparando con
  `IS NULL` — la cadena vacía se cuela por toda guarda de NULL. Y `cliente_merge_log` es **append-only**
  por trigger: una corrección posterior no se anota editando su fila. PR #2139. **NO se tocan** los ~545
  grupos que solo comparten nombre+teléfono sin cartera viva (familias con el fijo común).

- **💾📐🗺️ Etapa 2 de tarificación + el mapa de campos (02/09/2026, tarde-noche).** Cada cotización
  cuesta 0,50€ y no es idempotente, así que ahora se GUARDA lo que se recibe (`seguros.cotizaciones` +
  `cotizacion_precios`, invariante `simulado = (intento_id is null)` en la BD) y `estimar()`/`mereceLaPena()`
  dicen si merece la pena pedirla (PR #2116). Cerrado de paso el fallo que el propio cambio creó: la ruta
  no pasaba `contexto`, o sea se pagaba y NO se guardaba. **⚠️ El SQL sigue SIN aplicar en Supabase.**
  🐛 CI rojo dos veces por un motivo que no hablaba de cotizaciones: `lib/db.ts` construía el `PrismaClient`
  AL IMPORTAR, y el job `Tests` no corre `prisma generate` (en local sí estaba, por los typechecks) —
  ahora es diferido tras un `Proxy`, con cepo. 🗺️ Un agente midió el **mapa de campos** Codeoscopic×CIMA
  (PR #2125, `docs/ASEGURA-MAPA-CAMPOS-RAMOS.md`): **RC está bloqueado porque Codeoscopic NO ofrece el ramo**
  (lo cierra `GET /insurance-lines`, gratis y ya implementado, sin llamar nunca); 14 de las 80 «auto» son motos por marca con `insuranceLine:'Car'` a fuego.
  ⚠️ **Y una corrección del mismo día, que la cazó Alberto acordándose mejor que yo:** el informe decía
  «hogar tiene `capital_asegurado` NULL en sus 37 filas de coberturas» y lo di por bueno sin medirlo. Son
  **716 filas en las 19 pólizas, 365 con capital**: CIMA SÍ trae continente y contenido, pero cada compañía
  los llama a su manera («daños vivienda» = continente, hasta 912.322€). Faltaba el diccionario de
  nomenclaturas, no el dato. Corregido en `docs/ASEGURA-MAPA-CAMPOS-RAMOS.md`.
  Corregido en `apps/asegura/CLAUDE.md` (PR #2121) que auto «solo trae matrícula»: trae marca y modelo al 100%,
  lo que falta es la versión. Pendiente de Alberto: 20 suposiciones por aprobar y `CODEOSCOPIC_SIMULACION=true`.
- **🧠 El agente de huéspedes «no aprendía» — y el que decidía nunca leyó lo aprendido (02/09/2026).** Queja de
  Alberto sobre el borrador a Claudio (153122091). El aprendizaje SÍ escribía: el phishing por WhatsApp estaba
  enseñado tres veces. Lo que fallaba: (1) `debeEscalar` (control de calidad) solo veía ficha+guía, nunca
  `ctx.hechos` → ESCALAR eterno, y ese veredicto es el que dispara el «❓ no lo encuentro en la guía»;
  (2) «no se pudo verificar» (clasificador mudo) se contaba como hueco de guía → nuevo `tipoHueco` puro;
  (3) el «hecho» guardado era la carta entera, con nombre del huésped, el móvil de Bizum y estados de un día
  («el parking está ocupado») → ahora se destila a una frase y, si no se puede, no se guarda y se dice;
  (4) `esHechoDelPiso` exigía pregunta y el phishing llega como afirmación → el hueco declarado viaja en
  `mensajes_pendientes_tg.hueco_guia` (migración aplicada). ⏳ PENDIENTE de Alberto: purgar los 6 hechos
  ya guardados (móvil de Bizum, «parking ocupado», «no hay cuna» ya desmentido). PR pendiente.
- **🧾🔑🧲 «Haz todo ok, aplica y canal leads» (02/09/2026, noche).** Alberto dio OK a la spec de emisión,
  «aplica» al DDL del portal y pidió el canal de leads. **BD (irreversible, aplicado):** Fase 1 del portal +
  `portal_vinculo` + rol `prisma_asegura_portal` (NOBYPASSRLS, sin contraseña, SELECT por columnas, sin PII);
  enums `fuente_origen` +`web/portal/whatsapp` y `poliza_origen` +`emitida_codeoscopic`; tabla
  `companias_dgs` (15 códigos, `nombre_cima` solo en las 3 medidas). **Emisión:** reglas puras D2/D3/D4
  (`module-seguros/emision.ts`) + `registrarPolizaEmitida` + puerto cerrado tras `CODEOSCOPIC_EMISION_ACTIVA`;
  **el envío al vendor NO se construye** (no hay sandbox para el gate de idempotencia). Portal Fase 4 (vínculo
  por email, lectura por columnas) y canal web (`/seguros` en plataforma → alta `fuente=web` → Telegram
  `correduria.lead-nuevo`) construidos por agentes. **PR #2118 mergeado** (`f0dc7cbb`); probado en prod:
  `/seguros` 200, lead vacío 422, honeypot 200 sin efectos. **«Hazlo» (portal):** contraseña de
  `prisma_asegura_portal` generada EN la BD y guardada en el **Vault** (`prisma_asegura_portal_password`),
  verificada por dblink (pooler OK, `dni` → 42501); proyecto Vercel `asegura-portal` creado por API
  (`prj_MNrsMRVrBft6KLq1skgi8XU9s9y9`; enlace Git verificado: el bot de Vercel ya lo lista con su Root
  Directory, deployment «Ignored» por `--sin-previews`). Pendiente de Alberto en el panel:
  `DATABASE_URL` (plantilla en el SQL), `PII_LOOKUP_KEY` = la de central-asegura, secretos de sesión/canal.
- **Mergeado, probado hasta donde se puede, y el doc de plataforma al día (02/09/2026, noche).** #2131 y
  #2122 (agente de huéspedes) mergeados; los checks arrancaron solos con el PR EN DRAFT y sin lag, así que no
  hizo falta ninguna palanca de la sección de CI. 🚨 **No hay fuga de coste en Vercel**: los 11 proyectos
  acabaron `Ignored`, los «Building» del bot eran el estado transitorio antes del ignore step — la hipótesis
  del merge de `main` sobraba. ⚠️ **Y el aspecto sigue SIN ver**: con `--sin-previews` la rama no construyó
  ninguna vez, y probar las rutas desde fuera no vale (un `/ruta-que-no-existe` da el MISMO 307 a `/login`
  que `/asistentes`, porque el middleware corre antes). `apps/plataforma/CLAUDE.md` corregido: decía que el
  chat vivía en `/agente` y `/contable`, que hoy son redirects.
- **Inicio: arriba lo accionable, y dos tokens CSS fantasma (02/09/2026).** Alberto pidió «página de inicio
  con resumen de lo más importante». Inicio NO estaba vacío: estaba saturado (512 líneas — saldo, cuentas,
  bróker, gráficas, P&L, fiscal, antifraude, fugas, benchmark y el libro entero), y lo accionable quedaba
  bajo cuatro secciones de consulta. Nueva banda «Pide acción hoy» encima de todo (`HoyAccionable.tsx` +
  `lib/inicio-acciones.ts`, puro, 14 tests): banco viejo PRIMERO (envenena el resto de números), pólizas
  ≤60d desde la correduría, y movimientos/ingresos/duplicados/facturas sin clasificar. Tres estados en
  todo: `0` ≠ `null` ≠ `'no_aplica'` — «no hay banco» no es «no se sabe», y un fallo de consulta se
  declara en vez de callarse. De camino: **`var(--card)` y `var(--line)` NO existían** y los usaban 4
  pantallas (`/operador/agentes`, `/operador/ia`, facturas, partes) → se pintaban sin fondo NI borde,
  porque CSS invalida la declaración entera y no da error; por eso la página de agentes «no parecía una
  página». Guardián `test/regression-tokens-css.test.ts`. Y consulta por agente en `/operador/agentes`
  (expediente: ficha + semáforo + latidos + vigía). Y `/asistentes`: los dos chats con los que SE
  PUEDE hablar (contable y precios) juntos, movidos con `git mv` sin reescribirlos —/contable y
  /agente quedan como redirect, y el menú pasa de dos entradas a una. PR #2131.
- **«Repara»: el menú mentía en dos sitios (02/09/2026).** Sin objetivo dicho, así que se buscó qué estaba roto de
  verdad. (1) El lateral encendía DOS entradas a la vez: «Inicio» + el segmento en `/banca?tab=*` (lo introdujo
  #2106 — «Inicio» ES `/banca` y los cinco segmentos comparten esa ruta), y «Pricing Lab» + «Pricing auto» /
  «Motor vs PL» (el activo de Pisos era `startsWith(href)` SIN la barra, y una ruta es prefijo del hermano
  homónimo). El criterio estaba inline en tres sitios del TSX, de tres formas y dos mal → `lib/nav-activo.ts`,
  puro y con 13 tests (con la implementación vieja fallan 7). (2) `/finanzas/tarjeta-credito` no la enlazaba
  NADIE (pre-existente, no de #2083): enlace desde `/finanzas/gastos` + paleta. Tercer caso en dos días
  (`sivra/partes/establecimientos`, `/apartamentos`), así que `test/regression-panel-alcanzable.test.ts` recorre
  las 69 pantallas del panel y exige un enlace de entrada a cada una; excepciones vacías a posta. PR #2115.
- **💶 «¿Por qué ha subido la prima?» (02/09/2026).** Punto 7 de la visión, tras el «cuando vayan terminando
  mergea prueba y actualiza» de Alberto (#2111 mergeado). `evolucionPrima()` en module-seguros: prima por
  anualidad derivada de recibos `CA`/`NP` agrupados POR ANIVERSARIO (no año natural), ciclo solo si completo,
  siniestros del ciclo anterior → seis veredictos; `sin_datos` es lo normal (29 vivas con dos anualidades /
  25 con una / 13 sin recibos). Asegura lo manda en `/poliza` (entero) y `/cliente` (compacto); plataforma
  chip + tarjeta (`EvolucionPrima.tsx`). Con esto el orden §9 queda: 1 (emisión/conciliación) pendiente de
  OK, 4 (leads) sin canal, 5 (portal) sin DDL; todo lo demás hecho.
- **🚨 Siniestros desde la ficha (02/09/2026).** Punto 6 del orden de la visión del CRM, tras el «todo ok» de
  Alberto al #2104. Reglas puras `module-seguros/siniestros.ts` (catálogo de tipos, transiciones, plazo art. 16
  LCS, apertura/seguimiento revisados, 7 tests); `asegura/lib/cartera-siniestros.ts` + puerto `/api/operador/
  siniestro` (GET/POST/PATCH); plataforma `Siniestros.tsx` en ficha de cliente y de póliza con abrir, seguimiento,
  estado y documentos del parte. Medido: 67 siniestros, todos de CIMA, `tipo` = código EIAC (se pinta como código,
  no se inventa nombre); el legacy reescribe solo estado/tipo/fecha/lugar → en uno de CIMA el estado no se toca;
  en uno nuestro la referencia va también a `id_siniestro_entidad` para que el pull case y no duplique. Sigue
  parado a la espera de Alberto: spec emisión/conciliación, DDL del portal (tablas inexistentes), leads sin canal.
- **«Haz todo» del CRM, primera tanda (02/09/2026).** Estado del cliente DERIVADO (`estadoCliente`: cliente =
  póliza confirmada por CIMA, `id_poliza_entidad` informado — las 109 vivas lo tienen; emitida pendiente de CIMA;
  con presupuesto = cotización ≤60 días; ex-cliente; lead), historial visible en la ficha (plegado), guardián de
  pólizas duplicadas (`/api/operador/duplicados`, hoy 0) y spec de emisión en central + conciliación CIMA
  (`docs/superpowers/specs/2026-09-02-emision-conciliacion-cima-design.md`, **pendiente de OK de Alberto**: no se
  emite sin la prueba de idempotencia del sandbox). Medido: las tablas `portal_*` del portal del cliente NO existen
  en la BD (DDL sin aplicar) → el portal es código sin base; leads por canal sin canal aún (no hay WABA ni web).

- **🏠 Ficha revisable de hogar + precios simulados (02/09/2026).** PR #2096. La pantalla que faltaba
  entre «tengo los datos» y «gasto 0,50€»: cada campo dice de dónde sale (póliza / volcado / Catastro /
  ficha / supuesto), los supuestos que ABARATAN van marcados aparte, lo que falta bloquea y dice qué
  falta, y la firmeza va pegada al precio (en hogar la 1ª cotización SIEMPRE es estimada). Lógica en el
  puro `lib/codeoscopic/resumen-hogar.ts`, que la pantalla reusa en cliente al corregir.
  **Modo simulación** `CODEOSCOPIC_SIMULACION=true`: paso 0 del embudo, sin vendor ni libro ni tope;
  se marca con `simulado` (dato, no texto), `projectId` NEGATIVO y `estimate:true`; `restantesHoy` es
  `null` = «no se ha mirado», no 0. Arreglado: `origenRetarificacion()` sin try/catch dejaba la página
  en blanco; `primaAnual` viaja con NULL intacto (sin él NO se pinta la comparación).
  ⏳ Alberto: poner `CODEOSCOPIC_SIMULACION=true` en Vercel `central-asegura` para ver precios.
  ❓ Sin contestar: qué decía el error que vio en `/cartera/poliza/5b0150ee-…`.

- **🛡️ Auditoría: NO hace falta tabla de garantías por compañía (02/09/2026).** PR #2096 (docs) +
  `docs/superpowers/specs/2026-09-02-expediente-tarificacion-hogar-design.md`. No existe catálogo de
  garantías por API (`guarantee`/`warranty`/`franchise`/`excess` = 0 apariciones en todo el portal del
  fabricante), no hay forma de fijar por API los defectos de una compañía, y los que Alberto ya
  configuró en Avant2 se heredan solos al cotizar: una tabla nuestra crearía dos verdades. Las opciones
  por compañía solo se pintan con el iframe del fabricante + puerto que le reenvíe (aparcado).

- **📘 Visión del CRM de la correduría (02/09/2026).** Alberto, por voz: «lo que estamos hablando es un
  CRM» — buscador → ficha cliente (pólizas confirmadas por CIMA) → ficha póliza (datos, recibos,
  siniestros, limpio, detalle al pinchar), misma forma para la intranet del cliente; leads que se
  crean solos por web/WhatsApp/agente; todo cambio guardado; CIMA y Codeoscopic «saben más que
  nosotros» y hay que compaginarlas al emitir. Escrito en **`docs/CORREDURIA-CRM-VISION.md`** (visión,
  estado medido §4, la pieza crítica §5: hoy CIMA empareja por número + NOMBRE de compañía, ignora
  `import_ref` y pisa `cliente_id` → una emitida por Codeoscopic se duplica o se sobreescribe; orden de
  trabajo §9) + skill router **`correduria-crm`**. Nada de código: el punto 1 del orden exige spec y OK.

- **👪 Relaciones entre clientes + autorización para ver los seguros del otro (02/09/2026).** Alberto, tras
  probar la edición (José: móvil principal, verificado en `historial_interno`): «es marido de María Antonia…
  por si autoriza María Antonia que José vea sus seguros». La tabla `cliente_relaciones` YA existía (1.708 filas
  del CRM, dos por vínculo). Fijado: fila A→B = «B es <tipo> de A», `puede_ver_polizas` = **A autoriza a B**,
  direccional y solo desde la ficha de quien autoriza. Módulo puro `module-seguros/relaciones.ts` (3 tests),
  `apps/asegura/lib/cartera-relaciones.ts` + puerto `/cliente/relaciones`, tarjeta «👪 Relaciones» en la ficha
  de plataforma con 💍 en cabecera. Consentimiento anotado en el historial de las dos fichas. Pendiente: el
  portal del cliente no lo usa aún (`clientesQuePuedeVer()` listo; falta grant a `prisma_asegura_portal`).

- **✏️ Editar y ➕ dar de alta clientes desde `/correduria` (02/09/2026).** Alberto: «no puedo editar», «cliente
  puede tener varios tlf y mails», «DNI, nombre, fecha de nacimiento… tendrá que solicitarlo documentado».
  Primeras ESCRITURAS del puerto de asegura: `/api/operador/cliente/contactos` (varios teléfonos/emails con
  etiqueta y ⭐ principal espejado en `clientes.telefono/email`), `PATCH /cliente` (libre: dirección/CP/ciudad/
  provincia/notas; identidad SOLO con `documentoId` de un DNI recibido → 422 `documento_requerido`) y `POST
  /cliente` (alta `lead`, 409 con las fichas que ya tienen ese DNI/tel/email; DNI nunca se fuerza). Reglas
  puras en `module-seguros/cliente-edicion.ts` (10 tests); pantalla `EditarCliente.tsx` + `/cliente/nuevo`.
  Historial en `historial_interno` sin PII. **PR #2093 mergeado.** ⚠️ Sin prueba real todavía: el proxy del
  contenedor bloquea `central-asegura.vercel.app` (CONNECT 403) y plataforma redirige sin sesión, así que la
  primera edición/alta la hace Alberto y se comprueba después en `seguros.historial_interno` (0 filas hoy). CIMA NO cambia `tipo` de una ficha `lead` al engancharle
  póliza: la ficha pinta «Cliente (CIMA)» por pólizas vivas. Buscador ya mira los teléfonos secundarios.

---

### 🛡️ (02/09/2026, noche III) Auditoría de garantías por compañía + diseño del expediente de tarificación
- Alberto pregunta si hace falta una pantalla para preconfigurar las garantías y capitales de cada
  compañía (lo que él hacía en Avant2). **Auditado el portal entero y el CRM de Manuel: NO hace falta.**
  No existe catálogo de garantías por API (`guarantee`/`franchise` = 0 apariciones), no se pueden fijar
  por API los valores por defecto, y los que él configuró en Avant2 **se heredan solos al cotizar**.
  Detalle citado en `docs/CODEOSCOPIC-API-PORTAL.md` § Garantías y opciones por compañía.
- 🚨 Dos hallazgos que cambian el plan: en hogar **el primer precio es siempre estimado** y el re-rate
  es obligatorio (probablemente cuesta el doble, sin medir), y las opciones por compañía solo se pintan
  con desplegable usando el **formulario incrustado** del fabricante.
- Diseño acordado en `docs/superpowers/specs/2026-09-02-expediente-tarificacion-hogar-design.md`:
  un **expediente puro** con procedencia por campo, tres puertas (corredor, agente, web) con tope propio
  cada una, ficha revisable con la prima actual al lado, y guardar cada cotización para estimar una
  horquilla propia y **decidir si merece la pena gastar** los 0,50€. Falta el visto bueno de Alberto.

### 🏠 (02/09/2026, noche II) Codeoscopic: el contrato `HomeRisk` de hogar, VERIFICADO y cableado (PR #2088)
- Alberto: «usa la IA e internet para nombres, no? tienes ya el contexto de todo como yo». Internet no sirvió
  (codeoscopic.com, el portal y archive.org están bloqueados por el proxy) pero el **snapshot MHTML del portal
  que subió el 01/09 seguía en los uploads de la sesión**: decodificado entero, traía el esquema `HomeRisk`
  completo, `recommend-limits` y los roles de hogar. La sección «no se extrajo» de `CODEOSCOPIC-API-PORTAL.md`
  era falsa por no haberlo buscado.
- Hecho: `peticion-hogar.ts` reescrito con los nombres reales (+6 tests), `desde-cartera-hogar.ts` con
  `partirDireccion` + supuestos para todo lo que el vendor exige y la ficha no tiene (+9), `tiposDeVia` /
  `DEFECTOS_HOGAR` / `elegirDefecto` en `catalogos.ts` (+3), ruta + página + pantalla de hogar por agente,
  docs (§ Hogar del portal reescrita, CLAUDE.md de asegura). ⚠️ `use` = régimen y `occupancy` = uso.
- Queda: `POST /home/recommend-limits` por cablear; envs de `central-asegura`; primera prueba real de J.S.S.

### 🏠 (02/09/2026, noche) Codeoscopic: retarificar HOGAR, cableado de punta a punta (PR #2071 mergeado)
- Alberto: «revisa todo lo de Codeoscopic para probar tarificar con un seguro de hogar… con algún hogar de
  José Suárez Salas». Auditado con agente: TODA la infraestructura (interruptor, libro, tope, `cotizar()`,
  puerto, botón) era agnóstica del ramo; faltaban las piezas de hogar y el contrato del `risk` del vendor.
- Hecho: `persona.ts` (tomador compartido auto/hogar), `peticion-hogar.ts` (+6 tests), `desde-cartera-hogar.ts`
  (+6; riesgo de póliza / gemela / Catastro, rotulado), `retarificabilidad()` en module-seguros (+5; sustituye
  la expresión copiada en 3 sitios), 10 catálogos `/home/*`, rama de hogar en la página y el POST de
  `/cartera/poliza/[id]`, botón por ramo en plataforma. `origenRetarificacion` carga la gemela.
- 🚨 El esquema del `risk` de hogar NO está en el repo ni se puede leer desde aquí (portal bloqueado):
  `CAMPOS_VENDOR` es provisional; un 400 de validación no se cobra. Alberto exporta el ejemplo del portal
  (`docs/CODEOSCOPIC-API-PORTAL.md` § Hogar). Caso de prueba: Occident GPDFS3000276 (Sevilla, 76 m²/1994).

### 🧹 (02/09/2026) Cerrado lo que quedaba del auditor: novedades fuera del generado + la ambigüedad, vigilada
- **Opción 2 hecha:** `novedades` sale a `apps/plataforma/lib/novedades.generated.json`. Se derivan de la
  MEMORIA, no del código, así que mezclarlas con la radiografía hacía que cada PR que anotara memoria
  reescribiera el JSON grande. Comprobado: añadir una entrada ya no toca `estructura.generated.json`.
- 🪤 **La ambigüedad del troceo era un bug ACTIVO, no teórico:** `- **Hecho por Claude Chrome (02/09):**`
  —cuerpo de una entrada— se leía como cabecera y salía como novedad con fecha vacía; solo se salvaba por
  caer en la posición 16 de 15. Medido, no supuesto.
- **El arreglo NO fue endurecer el parser.** Se probó exigir la fecha al final de la negrita y los datos lo
  tumbaron: 14 de 137 cabeceras reales de la historia la llevan en medio (`**título (30/06) — texto.**`).
  Endurecer las habría convertido en cuerpo. Se arregló el DATO (fecha fuera de los paréntesis) y se puso
  un guardián que caza la recaída con el mensaje de cómo escribirlo.
- Guardián probado en los dos sentidos: falla con la línea mala, pasa con la buena. 180/180 en la raíz,
  17/17 rotar-memoria, `--check` ✓, typecheck de plataforma OK.
- ⚠️ Y una trampa de método: un `git checkout -- docs/CONTEXTO-SESIONES.md` para limpiar una prueba se
  llevó por delante el arreglo de esa misma línea. Verificar después de restaurar, no antes.

### 🗞️ (02/09/2026) Las «novedades» del panel no eran novedades — y debajo, la memoria se fragmentaba
- El extractor usaba un regex que casa con CUALQUIER bullet en negrita, y el cuerpo de cada entrada está
  lleno de sub-bullets SIN indentar. El panel pintaba trozos de argumentación a media frase («Cablear un
  valor es lo que deja una primitiva sin adoptar:»), **0 de 15 con fecha**, y las entradas `###` —el
  formato de casi todas las sesiones— no salían NUNCA. Ahora, 15 de 15 fechadas.
- 🔍 **Lo gordo estaba debajo:** `rotar-memoria` tenía el mismo agujero, porque un sub-bullet y una cabecera
  antigua son la MISMA sintaxis. Contaba **138 «entradas» donde hay 65**: al rotar el mes, 73 sub-bullets se
  habrían archivado como sesiones sueltas. No había saltado porque aún no tocaba rotar.
- La separación no es sintáctica sino de ESTADO: con una entrada nueva abierta, un bullet en negrita es
  cuerpo suyo — salvo que lleve fecha, que es lo que tiene una cabecera de verdad. La primera versión sin
  esa excepción rompió un test de `rotar-memoria`; el fixture tenía razón y la regla estaba mal.
- Un solo criterio: `auditar-novedades.mjs` importa el troceo de `rotar-memoria`, no lo reimplementa.
  Guardián `regression-novedades-memoria.test.ts` (5 tests), uno contra la memoria REAL. PR #2064.
- 🪤 **Y al anotar ESTA entrada me la pegué con lo mismo:** insertarla buscando la subcadena `###` la metió
  dentro del PREÁMBULO, que cita el formato como ejemplo. Se vio porque la novedad 1 salió sin fecha. Para
  localizar la primera entrada hay que mirar LÍNEAS en columna 0, no subcadenas.
- Antes, en la misma sesión: **PR #2044** (panel de Salud a cero avisos: la reimplementación de alquiler al
  módulo compartido + CLAUDE.md de almacen y asegura-portal) y **PR #2053** (el `--check` deja de romperse
  porque una sesión anote memoria; criterio de comparación a `auditar-comparacion.mjs`, testeado).
- ⚠️ **Carrera confirmada dos veces:** si `main` avanza entre tu merge y el squash, el generado entra
  mintiendo (el #2044 dejó el mapa apuntando a un archivo que #2047 había borrado). Lo absorbe
  `auditoria.yml`, que YA existe y regenera post-merge por PR — comprobado corriendo tras el merge.

### 📄 (02/09/2026) El agente contable no sabía leer un PDF escaneado — y tampoco decía por qué (PR #2051 mergeado)
- Alberto subió «movimientos (2).pdf» al chat 📎 y recibió «prueba con una foto más nítida o un PDF que tenga texto».
- **Descartado que fuera pdf-parse, con datos:** el cron `subastas-enriquecer` leyó decenas de PDF en prod esa misma
  mañana (06:15-09:31 UTC) y la lib va bien en local con la misma versión del lockfile desde el 16/07. **El PDF no
  traía capa de texto**, y el chat contable era el ÚNICO camino de PDF del repo sin OCR.
- Ahora: `MotivoSinLectura` (pdf_ilegible · pdf_sin_texto{no_intentado|sin_paginas|error|sin_datos} · formato) →
  el mensaje dice si el documento se ha MIRADO o no; y `opts.ocr` (JPEG embebidos → PDFium → visión), solo en el chat.
- **Probado sobre un PDF sin capa de texto fabricado a propósito** (y repetido sobre `main` ya mergeado): pdf-parse
  abre 1 página y saca 0 caracteres, los dos rasterizadores devuelven la página y la imagen sale legible. Guardián
  `rasterizar-pdf.test.ts` — sin él la regresión es INVISIBLE: saldría `ocr:'sin_paginas'`, un desenlace legítimo.
- 🚨 **Lección de proceso:** el PR chocó TRES veces por `CONTEXTO-SESIONES.md` (main recibe automerges cada pocos
  minutos). Se resolvió sacando la memoria del PR: **un PR de código no debe tocar el fichero de memoria**.
- **Sin cerrar:** la visión no se ha probado end-to-end (el contenedor no tiene claves de IA) ni se ha visto el PDF de
  Alberto; `expenses/agent/scan` (Gmail) sigue sin OCR y `parse-invoice` sigue con `require('pdf-parse')` en la raíz.

---

### 🔌 (02/09/2026, tarde) Cinco vigías sin canal dejan latido y se ven en la pantalla (PR #2086)
- Ocho rutinas de Claude sin `ALERTA_TOKEN`: Telegram mudo y sin latido, o sea **invisibles**. Alberto decidió no
  poner el token; se deja el circuito cerrado para que, cuando lo pegue, aparezcan solas. Mientras: **rojo con «sin
  ninguna señal registrada»**, que es la verdad, no ruido.
- Se cablean **cinco** (`psd2_health_check` 192 h · `facturas_correo` 30 h · `fiscal_novedades`, `rrhh_compliance`,
  `github_vigia` 840 h) en los CUATRO sitios: allowlist de `/api/internal/latido`, `AGENTES_VIGILADOS` (27→32), sonda
  del cron vigía y mapa de `/operador/agentes`, más el paso «Deja huella» en cada `SKILL.md`.
- **Las otras tres, a propósito NO:** `mercado-booking`/`trading-analista` ya estaban cableadas (solo falta token);
  `pricing-agente` ya se vigila por datos; `ialimp-client-health` vigila a un cliente que **ya no usa ialimp** — cablear
  un agente muerto es fabricar un rojo sin sentido.
- ⚠️ **Mi «salida sin tokens» era falsa**: el endpoint de latido se autentica con el MISMO `ALERTA_TOKEN`. Lo que sí
  es cierto y cambia el coste: es **UN valor**, pegado ocho veces, no ocho secretos.
- Corregido un verde prestado: `facturas-correo` (rutina 11:00) apuntaba al latido del **cron** `facturas_gmail` (06:15).
- 🪤 **Lección de guardián:** un `(dd/mm)` dentro de un bullet de cuerpo rompe `rotar-memoria` y dos tests. Las fechas
  del cuerpo van SIN paréntesis.

### 🧭 (02/09/2026, tarde) Los segmentos de `/banca` estaban escondidos detrás de «Inicio» (PR #2106 mergeado)
- **Alberto creyó que los cambios no estaban desplegados.** Lo estaban: su propia captura lo probaba —«Transferencia»
  ya no salía en el menú—. Lo que pasaba es que fue a buscar «Ingresos» **al menú**, que es donde uno lo busca, y los
  cinco segmentos de `/banca` vivían SOLO en la fila de pestañas de la página: cinco pantallas tras una sola entrada.
- Ahora cuelgan de «Inicio» como sub-entradas. El activo lo decide el `?tab=`, no la ruta (`usePathname()` devuelve
  `/banca` para todos), lo que obliga a `useSearchParams()` en el sidebar: **comprobado con `pnpm run build`** que no
  pide Suspense porque todas las rutas del panel son dinámicas. Era el riesgo real y se midió.
- **«Dinero» NO tiene entrada propia a posta:** es `/banca` sin query, o sea lo mismo que «Inicio». Ponerlo habría sido
  una segunda entrada de menú a la misma URL — la duplicidad que el panel llevaba todo el día quitándose.
- ⚠️ **Un guardián frágil dio rojo sin que nada estuviera roto:** `regression-correduria-menu` buscaba
  `const NAV_NEGOCIO = [` LITERAL y bastó añadir la anotación de tipo. Se hizo tolerante, pero **se verificó que sigue
  saltando** al quitar de verdad la Correduría (fuera → `not ok`; dentro → verde). Un guardián arreglado a base de
  relajarlo deja de guardar; comprobar que aún caza el fallo real es parte del arreglo, no un extra.
- **El guardián de rama hizo su trabajo:** bloqueó un push estando en `main` que habría mandado la rama SIN el commit
  —el fallo del PR #1787—. Rehecho con `git push -u origin HEAD`.

### 🔗 (02/09/2026, tarde) Un SOLO hub financiero: `/finanzas` entra en `/banca` (PR #2083 mergeado)
- **Alberto lo dijo horas antes («hay mucha duplicidad») y esta sesión lo convirtió en un dilema de arquitectura
  en vez de medirlo.** Medido: la pestaña «Categorías» de `/finanzas` montaba `finanzas/CategoriasTab.tsx`, **el
  mismo fichero** que el segmento Personal de `/banca` — la misma pantalla en dos URLs, con enlaces de ida y vuelta.
- ⚠️ **Y corrige una segunda afirmación propia hecha sin mirar** («la única diferencia es una pestaña»): el resto de
  `/finanzas` NO era duplicado — traía sus banners de salud de extracción, ayudas con plazo y novedad fiscal, y sus
  KPIs. Nada de eso existía en `/banca`. No había que ELEGIR entre dos hubs: había que traer uno dentro del otro.
- `/banca` gana el segmento **«Ingresos»** (monta `FinanzasClient` con prop `embebido`, sin su `<main>` porque ya lo
  pone `<Pagina>`); `FinanzasClient` pierde su sistema de pestañas; `/finanzas` queda como **redirect** (conserva
  `?tab=gastos|fiscal` y manda `?tab=categorias` a `/banca?tab=personal`, la que sobrevive).
- Las hijas (`/finanzas/gastos`, `/fiscal`, `/pilar`, `/tarjeta-credito`) **no se tocan**: solo dejan de colgar de un
  hub que ya no existe. Repuntados los 3 enlaces a la raíz vieja (sivra/fiscal, PilarClient, paleta de comandos).
- **Método, que es la lección de la tarde:** dos veces se afirmó algo del diseño sin haberlo medido, y las dos veces
  era falso. La medición era barata (un `grep` de quién importa `CategoriasTab`).
- **Sigue pendiente de Alberto:** las 8 rutinas sin `ALERTA_TOKEN` — **decidió dejarlo como está el mismo 02/09**, con la
  consecuencia declarada: si el sync bancario se rompe, no hay canal que avise. Y las 9 páginas sin contenedor.

### 🫀 (02/09/2026, tarde) El vigía de agentes tiraba su trabajo, y el panel se descuadraba en móvil (PR #2066 mergeado)
- **`/operador/agentes` pintaba ⚪ sobre 23 de 29 agentes… y el dato SÍ existía.** El cron `agentes-latido` evalúa 27
  agentes cada mañana con su umbral y su sonda, y **no lo guardaba**: solo iba al JSON de su respuesta y a un Telegram
  que en **8 rutinas no está cableado**. Ahora lo persiste en `agente_salud` y la pantalla lo lee (6 → 13 con
  telemetría), más una sección con los **19 latidos vigilados que no salían en ninguna pantalla**.
- ⚠️ **Persistir un veredicto crea un riesgo PEOR:** un vigía muerto congelaría la pantalla en su último verde. Por eso
  **caduca a las 36 h** → gris «nadie ha comprobado». Decisión en `lib/agentes-salud-clasificar.ts` (puro, 10 tests):
  caducado ≠ veredicto · sonda rota ≠ sano · `horas` NULL ≠ 0 (colapsarlo a 0 lo pinta VERDE, 0 ≤ cualquier umbral).
- 📱 **Responsive, y el hallazgo de MÉTODO que lo tapaba:** `LayoutShell` declara `overflowY:'auto'` sin `overflowX`, y
  por la regla de CSS Overflow el eje X computa a `auto` → **el scroller horizontal es LayoutShell, no `<body>`**. O sea
  **`document.body.scrollWidth` NUNCA delata un desbordamiento en esta app**, y con esa medición mala se dio el problema
  por inexistente. Se mide sobre el scroller.
- **La causa:** un `display:grid` sin `gridTemplateColumns` dimensiona su pista implícita con el contenido más ancho, así
  que una tabla de `minWidth:880` arrastra la página y **anula el `overflowX` de la propia tabla**. Medido en Chromium:
  cliente 910→390 · póliza 590→390 · pricing-auto 354→320. `apartamentos` NO se cura así (su gráfica de 12 meses mide
  ~513 px de min-content): el scroll va en la gráfica, 408→320/390.
- **Pendiente de Alberto:** las **9 páginas sin ningún contenedor** (van a sangre, sin margen) y las 8 rutinas sin
  `ALERTA_TOKEN` — esos tokens se ponen en `/operador/secretos`, no los puede poner un agente.

### 🧱 (02/09/2026, noche) Las 43 cabeceras restantes, al componente compartido (PR #2054 mergeado)
- Con #2045, `apps/plataforma` queda **entera** sobre `PageHeader`: 43 cabeceras + 3 `BtnLink` + 9 `ThinBar`, en
  **4 tandas de agentes** con lista EXPLÍCITA de ficheros por tanda (y de los prohibidos) para no pisarse.
- 🔧 **Dos huecos de las primitivas que solo se ven al adoptarlas de verdad**, los dos destapados por botones reales
  que se quedaban fuera: `BtnLink` **no soportaba `target`/`rel`** (firma SCA del banco, subir póliza, comparar
  precio: los tres abren pestaña nueva) → prop `nuevaPestana` con `rel="noopener noreferrer"` implícito y NO
  opcional; y `ThinBar` **no llevaba transición**, así que dos barras perdían su animación al migrar.
- **Es un cambio de ASPECTO, no solo de código:** títulos a 20px/700 (venían de 18-24 y peso 700-900), margen bajo
  la cabecera unificado en 24px, y el emoji que iba dentro del `<h1>` pasa a la cápsula de 38×38 `--primary-light`.
  `pricing-auto`/`pricing-rentabilidad` dejan su paleta hex fija: su título ya responde al tema.
- El commit lleva **`[preview]`** a propósito: con `--sin-previews`, 43 pantallas cambiando de aspecto se verían por
  primera vez EN PRODUCCIÓN. Un build es más barato que eso.
- 🚨 **Y el `[preview]` falló DOS veces seguidas antes de funcionar** (lo caro: el síntoma es idéntico a un
  build legítimamente ignorado, así que no falla nada). Necesita **DOS condiciones a la vez**: ir en el asunto
  del **ÚLTIMO** commit del push (el script lee `VERCEL_GIT_COMMIT_MESSAGE`, el HEAD empujado) **Y** que ese
  commit **toque la app** — `[preview]` levanta el veto de `--sin-previews` (paso 1b de
  `scripts/vercel-ignore-build.mjs`) pero el paso 3 salta igual por rutas. Un commit que solo toca un `.md` de
  la raíz NO construye, lleve marcador o no. Documentado en el `CLAUDE.md` raíz y en el de plataforma.
- **Sin migrar a propósito:** `banca/transferencia` (sus 3 `<h1>` son estados de un formulario) e
  `invitado/limpieza` (única pantalla de Vanesa, intranet de invitado, no el panel `(usuario)`).

### 🩺 (02/09/2026) Salud de la arquitectura a cero avisos (/admin → 🗺️ Estructura)
- **La reimplementación era real, no un falso positivo:** `apps/alquiler` llevaba su propio catálogo y calculaba
  el disponible a mano teniendo `@central/module-materiales` al lado. Puente en `lib/materiales-compartidos.ts`
  (NO se migra la tabla). Su límite es lo caro: `alquiler_materiales` no tiene columnas económicas, así que
  `resumenStockUnidades()` **recorta `valorTotal` del tipo** para que no compile pintar «0 €» de inventario.
- **`CLAUDE.md` propios** para `apps/almacen` y `apps/asegura-portal` (los escribieron dos agentes leyendo el código;
  lo no verificable va marcado «pendiente de confirmar», no inventado). `docs/FUENTES-DE-VERDAD.md` y el raíz, al día.
- `asegura-portal` no tenía ficha curada en `estructura.ts` (el auditor lo avisaba); añadida y radiografía regenerada:
  **0 reimplementaciones · 0 apps sin CLAUDE.md**. Guardián 168/168, suite completa en verde. **PR #2044 mergeado**.
- 🏁 **Y una CARRERA que deja el generado mintiendo, medida aquí:** `main` avanzó con el PR #2047 entre mi
  `git merge main` y el squash, y ese PR borraba `apps/asegura/lib/comisiones-motivo.ts`. GitHub aplica el squash
  sobre el main NUEVO, pero `mapa-funciones.generated.json` se generó con el VIEJO → entró en `main` con una entrada
  a un archivo que ya no existe. **Regenerar el índice antes de empujar no basta si la base se mueve**; el
  `auditar --check` (que ya fallaba en la base 2cb05af6, comprobado en worktree) es quien lo caza. Regenerado en PR aparte.

### 🧩 (02/09/2026, noche) Las 5 primitivas huérfanas: se MIDIÓ antes de decidir (PR #2045 mergeado)
- Llevaban desde su creación a cero consumidores. La pregunta «¿la uso o la borro?» se contestó contando sitios
  reales en toda la app, no a ojo: `PageHeader` **53** · `BtnLink` 11 · `ThinBar` 11 · `BarListRow` **0** ·
  `LegendDot` **1**. Las dos últimas, **borradas**; las tres primeras, adoptadas.
- **Cablear un valor es lo que deja una primitiva sin adoptar:** `ThinBar` fallaba en 8 de 11 sitios solo por
  llevar el alto fijo a 6px. `alto` y `track` pasan a props. Y una primitiva con UN consumidor no es sistema
  de diseño, es un componente local.
- Migradas las 10 cabeceras que además repetían su propia media query → **15 reglas `!important` fuera** de
  `globals.css`. Quedan 43 cabeceras, 7 `BtnLink` y 9 `ThinBar` para tandas siguientes.
- 🚨 **`.seo-header` parecía redundante y NO lo era:** sus reglas de ≤480px ponen los botones a ancho completo
  y `.page-header` no hace eso. Antes de borrar una clase «duplicada», compara regla por regla.
- Verificado por la sesión, no por el informe de los agentes: tsc 0 · 165/165 en la raíz · tokens 10/10.

### 🕳️ (02/09/2026, noche) El feed PSD2 tenía dos estados donde hay tres (PR #2042 mergeado)
- `/banca` pintaba «último mov. **ninguno**» sobre un NULL. `ultimoMov` es `MAX(fecha_operacion)` y esa columna es
  **nullable**: NULL = «trajo apuntes, pero no sé de cuándo son», que es lo contrario de lo que decía el texto.
- **Medido antes de tocar, y corrige lo que yo mismo había apuntado:** 0 filas sin fecha en las **2.123** de la tabla
  (los seis orígenes). Es una violación **latente**, no una mentira activa — pero el esquema la permite.
- Se saca del JSX a `lineaCuentasFeed()` (helper puro + 5 tests). De paso: la lista vacía dejaba la línea en blanco
  (una conexión vinculada que aún no trae nada) y la fecha salía en ISO crudo en un panel que usa dd/mm.
- ⚠️ **Mismo agujero en la skill `psd2-health-check`**, y ahí el fallo es peor: `MAX()` y los `COUNT(... FILTER)`
  ignoran los NULL, así que un feed que entregue apuntes sin fecha se declararía **roto**. Anotado con su consulta
  de descarte.
- 🔁 **El bloque Personal de `/banca` daba vueltas en círculo**: sus salidas iban a `/finanzas?tab=categorias`, que
  monta EL MISMO componente que ya estabas viendo. Ahora apuntan a `/banca?tab=personal` (el filtro `?banco=` viaja igual).
- **Límite estructural anotado, no arreglable ahí:** `cuentas_bancarias` no tiene columna que la ligue a
  `conexiones_banco` — una cuenta psd2 recién vinculada y a cero es indistinguible de una manual o de Excel.

### 🗺️ (02/09/2026, noche) plataforma: podar lo inalcanzable y agrupar el menú por TRABAJO (PR #2038 mergeado)
- Inventario medido de la app entera: **76 páginas · 51 entradas de menú · 25 fuera del menú · 7 inalcanzables · 0 enlaces rotos**.
  Mapa completo en `docs/PLATAFORMA-MAPA-PAGINAS.md` (incluye qué NO se comprobó).
- **Podado (1.204 líneas):** `/sivra/inversion` (616 líneas, la 3.ª página más grande, **sin un solo enlace** desde PR #1117),
  `RadiografiaClient.tsx` y `ProyeccionClient.tsx` (cuerpos muertos desde la unificación en `/banca`). Las RUTAS quedan como
  redirect: borrar el cuerpo no rompe marcadores, y el historial de git es el «por si acaso».
- **Menú reagrupado por trabajo:** nace `NAV_OPORTUNIDADES` (concursos · subastas · analizar compra · empresas · trading ·
  patrimonio), antes repartidas entre secciones que no las explicaban. Trampa evitada: `seccionActiva()` con `rol='empresas'`
  vaciaba el menú de esa cuenta en silencio.
- Cableado `/sivra/partes/establecimientos`: el cron `ses-latido` apuntaba a una pantalla que **no se podía abrir**.
- **Pendiente de decisión de Alberto:** fundir duplicadas de verdad (2 hubs financieros, 6 pantallas de dinero de pisos,
  4 de pricing) — semanas, por goteo · `PageHeader`/`BtnLink`/`BarListRow`/`ThinBar`/`LegendDot` siguen con 0 consumidores ·
  `banca/page.tsx:221` pinta «último mov. ninguno» sobre un NULL (viola la regla NULL≠0) · Operador = 20 de 51 entradas.

### ⚪ (02/09/2026, noche) Comisiones: el «no se ha podido leer la cartera» no decía DÓNDE mirar (PR #2029 mergeado)
- El cron `cima-liq` avisaba `asegura_error` y `comisiones_devengo`/`comisiones_cobertura` siguen a **0 filas**: nunca
  ha leído. Comprobado contra la BD: `seguros` está SANA (1 correduría · 7 `cuenta_efectivo` · 9 liquidaciones ·
  184 recibos, 104 cobrados · grants y enums de `prisma_seguros` correctos). El fallo es de la app, no del dato.
- **No se pudo diagnosticar porque nadie lo contaba:** dos `catch {}` mudos en asegura (ruta + `lib/comisiones.ts`),
  sin `console.error`, colapsaban conexión/schema/permisos/fila-que-falta en un `{estado:'error'}` pelado. Ahora
  llevan `motivo` (`bd`/`sin_correduria`) + pista corta SIN secretos (`central/…/P2021/public.corredurias`, módulo
  puro `comisiones-motivo.ts`), plataforma la propaga y el Telegram la enseña. La próxima pasada se nombra sola.
- ⚠️ **Y la hipótesis que escribí era FALSA — corregido en el PR #2047.** Dije «probablemente el schema»:
  `urlFuenteCartera` fuerza `schema=seguros` en vez de respetar el que traiga `DATABASE_URL`. Se conserva como
  blindaje (esa cadena es la MISMA que la auth, donde el schema bueno es `public`, y ahí `clientes` es OTRA tabla),
  pero **no era la causa**. La midió el PR #2034: `credenciales` — la contraseña de `prisma_seguros` se rotó TRES
  veces ese día (05:51, 05:52 y 10:17, en `postgres_logs`) y el `DATABASE_URL` de Vercel `central-asegura` se quedó
  con la vieja. El repo ya se había avisado a sí mismo en el SQL de `crm_seguros` («rotarla tumbaría
  central-asegura») y se rotó igual. Regla nueva en el CLAUDE.md raíz: **rotación y env, en el mismo paso.**
- **Deuda propia, saldada en #2047:** #2029 y #2034 crearon dos clasificadores del mismo error con horas de
  diferencia. Gana `lib/error-cartera.ts` (seis causas accionables y borra la URL del log); `comisiones-motivo.ts`
  retirado y la ruta de comisiones al compartido → las NUEVE rutas del puerto hablan igual.
- Verificado: 2.568 tests `node --test` + 53 vitest en verde, typecheck de asegura y plataforma OK.
- **De regalo, la 7ª medición del CI mudo (anotada en `CLAUDE.md`), y la más limpia:** el MISMO acto —merge
  de `main` con contenido real + push— salió **mudo en draft** y **disparó los 19 runs ya sin draft**. O sea:
  des-draftear no reprocesa lo empujado antes, solo arma la rama para el push SIGUIENTE. Corrige el «no
  des-draftees, no mergees main» del #1962, que solo vale mientras haya lag (aquí el `head.sha` coincidía).

---

### 🪞 (02/09/2026, tarde) La skill de UI llevaba DOS MESES contradiciendo al CLAUDE.md de su app
- Al actualizar la documentación tras el PR #2024, `plataforma-maestro/references/ui-inicio-dashboard.md`
  decía «**modo oscuro automático (`prefers-color-scheme: dark`)**» y un toggle de TRES estados
  «🌗 Auto → ☀️ Claro → 🌙 Oscuro». Las dos cosas son falsas desde el **PR #707 (03/07/2026)** — y lo que
  describía **es exactamente la causa del bug** que Alberto reportó con captura: el ahorro de batería del
  móvil ponía el sistema en oscuro y el panel se oscurecía solo.
- Medido contra el código, no supuesto: `prefers-color-scheme` **no aparece** en `globals.css`; `:root`
  lleva `color-scheme: only light`; `ThemeToggle.tsx` es `type Tema = 'light' | 'dark'`, sin «Auto».
- 🚨 **Lección de método:** una skill puede contradecir al `CLAUDE.md` de su propia app durante dos meses
  sin que nada falle — ni `tsc` ni los tests leen prosa, y la auditoría diaria no lo cazó. Antes de dar por
  buena una afirmación de una skill sobre COMPORTAMIENTO, cotéjala con el código (un `grep` basta).
  Hermana de la exención con motivo falso del PR #2024: en los dos casos lo que protegía al error era que
  su justificación tenía buena pinta.
- Corregido en la skill (con el porqué y el veto a reintroducirlo) y ampliado el `CLAUDE.md` de la app con
  el estado del sistema de diseño y los dos pendientes que decide Alberto. Prueba sobre `main` ya fusionado:
  165 tests · tsc 0 · build OK.

### 🧱 (02/09/2026, tarde) plataforma: el CUERPO del Inicio, al sistema de diseño (PR #2024 mergeado)
- Alberto sobre `/banca` en producción: **«no está terminado, ¿no?»**. Correcto. Los tres PRs anteriores
  tocaron el CHROME (pestañas, migas, ancho, cabecera del libro); **el cuerpo de la página no lo tocó
  nadie**, y el cuerpo es lo que se ve al abrir. Su captura además iba desplazada: el sidebar es fijo.
- Medido antes de tocar: **7 primitivas con CERO consumidores**. `ResumenPeriodo.tsx` tenía su propia
  `card`, su propio `Kpi` y su propio `<style>` — copias de lo que `components/ui.tsx` ya daba. Copiar el
  estilo en vez de importarlo es por qué arreglar el oscuro o el móvil hay que hacerlo N veces.
- Enchufado: `KpiCard`/`CardHeader`/`cardStyle`/`Stat`/`Badge`/`TablaScroll`/`Pendiente` en
  `ResumenPeriodo`, `NegociosResumen` y `banca/page.tsx`; `DeltaBadge` colorea **por significado** (gastar
  menos = verde). Rejillas de los `<style>` a `globals.css` (sin el `!important`, que solo existía para
  ganarle al estilo en línea). El `IntervaloSelector` —compartido con `/finanzas`— deja de ser 15
  pastillas con borde: segmentado + chips.
- 🚨 **Las barras del gráfico estaban exentas del guardián con un motivo FALSO**: «son series, no estados».
  Ingreso y gasto SON el par semántico, y el hex no cambiaba en oscuro. Convertidas a token, exención
  retirada; la dona sí sigue categórica (ahí el motivo se sostiene).
- **Pendiente de decisión de Alberto:** `PageHeader`, `BtnLink`, `BarListRow`, `ThinBar` y `LegendDot`
  siguen a cero consumidores — NO se enchufaron a la fuerza (sería repetir el defecto): o se usan donde
  encajen o se borran. Y `page.tsx:221` dice «último mov. ninguno» sobre un NULL (regla del NULL), sin
  tocar por ser cambio de texto que Alberto lee a diario.

### 📎 (02/09/2026, tarde) Correduría: documentos de verdad sobre la BD de casa (PR #2022 mergeado)
- Alberto: «ya está nuestra bbdd, prueba y sigue». Probado: `seguros` en central tiene los mismos recuentos que se
  midieron en el origen (32.600 fichas, 28.843 pólizas, 109 CIMA/67 activas, 172 calles cifradas, 181 localidades,
  330 CP, 4.506 matrículas, `unaccent` instalada) → el buscador por riesgo/calle de #2001 funciona sobre la copia.
- Lo único que estaba bloqueado por el traspaso eran los **documentos**: tabla propia `seguros.documentos`
  (cliente | póliza | siniestro, estado pedido/recibido/revisado, fichero en `bytea` ≤10 MB, sin claves de Storage),
  migración aplicada y sus 4 CHECK probados en la BD real con rollback (0 filas dejadas). Puerto en asegura
  (`/api/operador/documentos[/id]`), lógica pura en module-seguros (5 tests), pantalla en la ficha de cliente y de
  póliza de plataforma (subir · anotar pedido · ver · revisado · borrar). `NECESARIOS_EMISION_AUTO` = DNI, permiso,
  ficha técnica: un «pedido» sigue faltando.
- No probado de punta a punta con la app (el contenedor no tiene `DATABASE_URL`): la primera subida real la hace
  Alberto desde `/correduria/cliente/[id]`. Sigue pendiente (y cuesta dinero): la petición de hogar a Codeoscopic.


### 🔐 (02/09/2026, ~09:00 UTC) Correduría: TRASPASO CERRADO salvo Fly — auth copiada, CRM solo como motor de CIMA (PR #2007 mergeado)
- Alberto: «el punto 2 no se hace… quiero tener todo en nuestra bbdd» → **NO se rota `crm_seguros`** (anotado en
  `apps/asegura/CLAUDE.md` y `docs/TRASPASO-CORREDURIA.md`) y se copió `auth.*` de Manuel a central por dblink con
  los mismos UUID: 9 users (2 reales con bcrypt + TOTP), 11 identities, 2 mfa_factors; 9/9 enlazados con
  `seguros.usuarios`. Trigger `on_auth_user_created` → `seguros.handle_new_user()` creado. Rol temporal de origen borrado.
- Tres trampas medidas: `auth.*` de origen con RLS y 0 políticas → **0 filas sin error** para un rol sin BYPASSRLS
  (un count=0 ahí no es «no hay»); en PG16 INHERIT va por GRANT (un rol NOINHERIT no hereda tras `ALTER … INHERIT`);
  `postgres` no puede hacer GRANT sobre `auth.*` (aviso mudo) → `pg_read_all_data`. Todo en `prisma/sql/2026-09-02_seguros_auth_traspaso.sql`.
- Inventario del CRM: Supabase = solo Auth; el único PostgREST (`record-evidence.ts`) no tiene llamadores → **sin cambios de código**.
- 🛑 **Decisión de Alberto acto seguido: «yo eso no lo quiero… no es necesario el acceso, eso ya desarrollaremos».** La web
  del CRM de Manuel NO se usa ni se migra su login (nada de variables Supabase en Vercel `asegura`, ni Google/TOTP/SMTP);
  las pantallas van en `plataforma` → `/correduria`. El CRM queda desplegado SOLO como motor de ingesta de CIMA (escribe en
  `seguros` con `crm_seguros`); dependencia viva: adaptador Fly de Manuel, hasta tener ingesta propia. PR #2007 mergeado (`7ba37122`).
- ⏸️ **Cierre del día (Alberto): «fly es barato y ya está hecho, hay otras prioridades».** Statu quo: cron → CRM (motor) → Fly →
  `seguros`. Único pendiente: transferir la app de Fly a cuenta de Alberto cuando Manuel pueda (borrador v8 en TRASPASO). El port
  de `cima-pull` a `apps/asegura` queda APARCADO; el inventario del grafo se guarda de referencia. Vigila la auditoría diaria.
- Tras el merge se barrieron las afirmaciones «cartera NO migrada / foto vs origen» que quedaban en `CLAUDE.md`, skills
  `central-maestro`/`auditoria-central`/`agente-correduria`, bloque 2-quater de `/auditoria-diaria`, `RUTINAS` y `FUENTES-DE-VERDAD`:
  el origen de Manuel es foto congelada; la señal de salud pasa a ser el heartbeat `cima_pull_*` en `seguros.operational_events`.
- ✅ **Prueba punta a punta (09:25 UTC, run #188, `mode: real`):** Actions → CRM (Vercel) → Fly → TIREA (6 páginas, 128
  resultados) → `seguros` de central, 0 errores. `processed: 0` = los 128 ya estaban en `cima_ficheros` (86 confirmed + 42
  review), no un fallo. Con esto el traspaso queda CERRADO salvo el adaptador de Fly. PRs #2007 y #2020 mergeados.
- 🔴 **`/correduria` en plataforma sin cartera (captura de Alberto 12:06):** causa medida en `supavisor_logs`, no supuesta:
  `password authentication failed for user "prisma_seguros"` (la URL de Vercel `central-asegura` llevaba otra contraseña).
  Contraseña ROTADA 10:17 UTC y verificada por dblink en pooler 6543/5432 (el pooler tardó ~3 min en aceptarla: caché).
  Alberto pega la URL nueva en `DATABASE_URL`/`DIRECT_URL` de `central-asegura` y redespliega. PR #2034: el puerto devuelve
  `causa` (`lib/error-cartera.ts`) y plataforma la pinta; el texto viejo («ASEGURA_DATABASE_URL / central_asegura») fuera.
  ✅ Pegado y redesplegado 11:10 UTC (Claude Chrome); sesión `prisma_seguros` aceptada 11:15; `/correduria` en plataforma
  pinta la cartera desde central (captura 14:45 local, buscador con 4 fichas).
- 🔒 **Control de la BD sin cortar a Manuel (decisión 02/09):** las 8 cuentas suyas copiadas a `auth.users` de central quedan
  `banned_until = infinity` (solo vive la de Alberto). **PENDIENTE de Alberto, sin prisa:** (1) Vercel `asegura` →
  `NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY` a central (+ `SUPABASE_SERVICE_ROLE_KEY` de central) y redeploy, para que el login del
  CRM se valide contra central; (2) GitHub `asegura` → ruleset: `main` exige PR con su aprobación (Manuel tiene write);
  (3) Vercel → Team → Members: comprobar si Manuel está y sacarlo del proyecto `asegura`. Detalle en el chat de esta sesión.
- 🔁 **Duplicidad medida en `seguros.clientes` (32.601 filas, 0 fusionadas):** 587 grupos con MISMO nombre+teléfono (610 fichas
  de más), 556 de ellos `asegura_app`+`intranet` (la misma persona cargada de dos volcados); 121 grupos tienen pólizas en varias
  fichas y 46 pólizas VIVAS de CIMA cuelgan de una ficha duplicada (siempre la de `intranet`). DNI casi no sirve para deduplicar
  (28.697 fichas sin DNI). El CRM trae la infra de fusión (`merged_into_cliente_id`, `cliente_merge_log`, mig 0093) pero
  NUNCA se usó (0 fusiones); plataforma detecta el gemelo y avisa «sin fusionar». Fusión pendiente de decisión de Alberto.
  Caso medido (cliente real por CIMA): las 14 pólizas de la ficha gemela son las mismas 6 de CIMA con datos viejos (números sin
  ceros, Plus Ultra por Occident, dos «activa» que CIMA da por canceladas); la ficha viva trae ciudad «34143»/Tarragona con CP
  41003 (basura del volcado `intranet`); y ⚠️ **los recibos CIMA guardan el NIF del tomador EN CLARO en `datos_extra`**
  (`DOCUMENTO TOMADOR`, `NIF_PAGADOR`) aunque la ficha lo cifra. Pendiente: cifrar/borrar ese campo.
- 📋 **Coberturas CIMA inventariadas** (`docs/ASEGURA-CIMA-COBERTURAS.md`): 1.425 en 110 pólizas, 182 códigos y son de cada
  compañía. `capital_asegurado` es texto: «0» (618) = sin capital propio, «INF» = ilimitado. La ficha de póliza en plataforma
  ya lo distingue (`interpretarCapital`) y añade límites, franquicias, prima por cobertura y modalidad leídos de `datos_extra`
  (`extraerDetalleCobertura`, `@central/module-seguros`; el puerto los manda como `modalidad`/`detalle`).

### 🖼️ (02/09/2026) plataforma: el rediseño LLEGA a la pantalla (PRs #2013 y #2018)
- Alberto tras mergear #2011: «yo lo veo igual». **No era caché.** Ese PR mandó a producción cuatro
  primitivas —`PageHeader`, `KpiCard`, `Badge`, `btnStyle`— **con CERO consumidores**: exactamente el
  defecto que ese mismo PR diagnosticaba en el `ui.tsx` viejo, repetido el mismo día. Un sistema de
  diseño que nadie importa no cambia ni un píxel; el guardián de tokens no lo caza porque no hay falta.
- **#2013** enchufa lo visible: pestañas de `SegTabs` de pastilla-en-caja a **subrayado con iconos
  lucide**, migas sobre el saldo, `<Pagina>` en las 4 vistas de `/banca`, azulejo de icono en cuentas y
  brókeres, `colorImporte` en vez de hex, `<Dato>` en el saldo sin informar.
- **#2018** pone la cabecera del libro de movimientos, y lo interesante es lo que destapó: **dos de las
  columnas no eran columnas.** El 🤖 solo se pintaba en los cargos (en un ingreso, negocio e importe se
  corrían 30 px) y el `<select>` de negocio se anchaba según el texto de su opción. Sin rótulos encima
  no se notaba. Cabecera oculta en móvil (la fila se apila) y solo si hay filas.
- **Pendiente:** siguen ~4.900 inline styles y 20 clases muertas movidas a `globals.css`, tres de ellas
  con hueco responsive real (`/sivra/expenses` con modal a `maxWidth:520` en móvil). CI verde en ambos.

### 🎨 (02/09/2026) plataforma: sistema de diseño vivo, color por tokens y SEIS tokens fantasma (PR #2011)
- Salió de «mírate Argon Dashboard». No se importó nada de él: es un kit Bootstrap estático y el problema
  no era la piel. **`dashboard/ui.tsx`, que el CLAUDE.md documentaba como sistema de diseño, NO lo importaba
  nadie** — existía como documento, no como código, con ~4.900 `style={{}}` a mano alrededor.
- Movido a **`components/ui.tsx`** + `Pagina` (ancho por contenido, contra el `maxWidth:'960px'` de 14
  páginas), `PageHeader`, `KpiCard`, `Badge`, `btnStyle`, `TablaScroll`, y **`Dato`/`Pendiente`** con
  `lib/dato.ts`: la regla del NULL deja de depender de la vigilancia. `/banca` es la referencia; el resto,
  por goteo. Sidebar con iconos lucide y secciones plegables (eran 52 entradas planas).
- 🚨 **~734 hex → tokens en 77 archivos, y SEIS tokens que NO EXISTEN** usados como `var(--danger, #dc2626)`
  en ~37 sitios: `--danger`, `--success`, `--card`, `--background`, `--warn`, `--warn-bg`. El CSS es válido,
  nadie se queja, y siempre se aplica el respaldo. El peor, en **transferencias**: `var(--card, #fff)` junto
  a `var(--text)` = texto claro sobre blanco. Los dos últimos venían de main (PR #2001) y los cazó el
  guardián nuevo en su primera pasada de CI. Guardianes: `regression-tokens-color` (3 tests: hex, media
  pareja y tokens fantasma) y `regression-dato-tres-estados` (fija que el **0 es un valor**, no un hueco).
- 45 bloques `<style>` sacados de 43 `.tsx` a `globals.css` (179→618 líneas), sin colisiones de clase.
- Regla nueva en el CLAUDE.md raíz: **todo lo mecánico va a un subagente**, repartido POR ARCHIVOS.
- **Pendiente:** migrar los ~4.900 inline styles restantes (semanas, por goteo). CI 19/19 verde.

### 🔑 (02/09/2026) `GH_PAT_TRIGGER`: rotado (caduca 01/12/2026, sin `Workflows`); clásico borrado; B pendiente en Vercel
- La entrada 🔴 del 01/09 («renovar el PAT») **ya está resuelta**: el 401 duró del 31/08 13:25 al 01/09 ~08:50 UTC;
  desde el PR #1933 (08:53) la radiografía vuelve a abrirse y a mergearla el bot (38 PRs hasta hoy, #2008 incluido).
  Las 123 ramas huérfanas quedaron barridas (1 viva). Nadie anotó la renovación: se dedujo de los PRs.
- **Lo que un agente NO puede ver:** tipo de token (clásico con `repo` = TODOS los repos de Alberto; fine-grained =
  solo `central`), permisos y fecha de caducidad. Lo usa en 4 workflows (`auditoria.yml`, `rutinas-automerge.yml`,
  `ai-programar.yml`, `latido-reparar.yml`) y necesita solo **Contents + Pull requests: write** sobre `central`.
- **Medido por Chrome (02/09, solo lectura):** es fine-grained, solo `central`, pero **SIN caducidad** y con
  **Workflows: read/write** además de Contents + Pull requests. El secret se actualizó el 01/09 10:52 CEST. Ese
  permiso extra es el que convierte una fuga en «leo todos los secrets»: con él se puede empujar a una rama un
  workflow que vuelque `${{ secrets.* }}` y abrir el PR (mismo repo = con secrets). Lo que lo justificaría es el
  camino 6b de `rutinas-automerge.yml` (merge de `main` en la rama del PR: si `main` tocó un workflow desde que
  nació la rama, el push lo necesita) — no hay ningún rechazo por ese motivo en la memoria.
- **Segundo token vivo** `central-ai-programar-trigger-2` (29/07, sin caducidad, Contents + PRs, usado esta
  semana): NO es el del secret. [Probable] es el `GITHUB_TOKEN` de Vercel (sivra/plataforma, agente SEO de los
  lunes, `seo-landing.ts`) o el `GH_PAT` de ia-rest (`blog-seo`, `agente-arquitecto`): los tres escriben en
  `central` por Contents API con justo esos permisos. **No borrar sin comprobar en Vercel** qué env lo lleva.
- Un clásico «Claude Full Access Token» (21 scopes, sin caducidad, «Never used») está para borrar.
- 🔴 **El camino 6b de `rutinas-automerge.yml` NO empuja con el PAT aunque lo lleve en la URL (medido 02/09 06:39 UTC
  en este mismo PR):** el bot resolvió el conflicto y empujó el merge, pero `tests.yml` salió con `actor:
  github-actions[bot]` y `conclusion: action_required` (a la espera de aprobación manual), así que los 12
  requeridos no corren y el PR se queda en BLOCKED. Causa [Probable]: `actions/checkout@v4` deja
  `http.https://github.com/.extraheader` con el `GITHUB_TOKEN` y pisa al PAT de la URL — el mismo fallo que
  explicaba el «git push sí cuela» del 01/09 en `auditoria.yml`. Arreglo: `persist-credentials: false` en el
  checkout (o borrar el extraheader antes del push). Es workflow → carril 2, PR aparte. Hasta entonces, un PR de
  registro que entre en conflicto necesita un push humano después del merge del bot.
- **Rotado por Alberto (Chrome, 02/09 09:03 CEST):** token nuevo fine-grained `GH_PAT_TRIGGER (central) 2026-12-01`,
  solo `central`, Metadata R + Contents R/W + Pull requests R/W, **sin `Workflows`, caduca el 01/12/2026** (la
  primera generación salió sin caducidad y se regeneró). Secret actualizado 09:03. Clásico «Claude Full Access
  Token» **borrado**. El token viejo A (`… - sep 2026`) sigue vivo A PROPÓSITO hasta ver «Last used» en el nuevo;
  [Probable] ya lo usó: la radiografía #2017 se abrió a las 07:14 UTC, 11 min después del cambio de secret.
  Quedan sin caducidad: `central-ai-programar-trigger-2` (= B), `seo-housesevillana-panel` y `token` (nunca
  usados) y los clásicos `house-sevillana-deploy` / `roi-intranet deploy token`. **Pendientes:** borrar A mañana,
  inventariar B en Vercel (prompt dado) y rotarlo, guardián Telegram del 401 + `persist-credentials: false` (PR aparte).
- 🚨 **Método: el bot lee la lista de archivos del OBJETO PR, y GitHub la deja atrasada.** Tras el merge 6b del bot,
  el PR seguía con `base.sha` = el `main` de la madrugada y **98 archivos** (el diff real `origin/main...HEAD` era 1);
  el bot lo rechazó como «no registro». Se desatasca como el lag de #1962: push con contenido real y esperar.

### 🔍 (02/09/2026) Rutinas de auditoría: cobertura exhaustiva tras la correduría
- Alberto pidió revisar la diaria y la semanal («hemos metido más cosas como correduría»). Medido: las dos decían
  **«8 apps»** desde junio (y `AGENTES-MAPA` «4») con **12** en `apps/`; ni una línea sobre la correduría; el
  conector `Supabase_asegura` no figuraba. `auditoria-central` contaba 7 apps con Prisma (son 10; asegura tiene DOS
  schemas) y solo conocía el schema `iarest` (faltaban `rrhh` y `seguros`, los dos con BYPASSRLS).
- Nuevo bloque **2-quater «🛡️ Salud de la correduría»** (obligatorio, también en ligera): latidos `correduria_*`
  (sin fila = nunca corrió), foto `seguros.*` vs origen de Manuel, gasto Codeoscopic, cepos de aislamiento, §21
  pausada a propósito. Regla nueva: la frescura del ORIGEN es actividad, no salud (CIMA trae 0-3 filas/semana).
- Semanal: tramo correduría (typecheck asegura con dos schemas, tests `module-seguros*`, checksums foto vs origen,
  TRASPASO §pendientes). Toda cifra de apps se cruza contra `ls apps` + matriz de `tests.yml`, nunca contra otro doc.
- Añadido a la diaria (petición de Alberto en la misma sesión): revisar las **conversaciones** del rango por `list_sessions`
  (sesión sin memoria, sin PR y sin bitácora = pendiente perdido) y reconciliar TODAS las skills de agentes contra código y
  `list_triggers`, no solo las maestro. PR #2006. Ojo: `guardian-rama.mjs` da falso positivo en clon **shallow** (el `main`
  local no está en la historia truncada de `origin/main`); un `git fetch origin` lo calla.
- **Hecho por Claude Chrome el 02/09:** las rutinas 1 y 2 quedan con **Supabase + Supabase asegura + Vercel** (llevaban los 16
  conectores heredados, Gmail/Stripe/HubSpot incluidos). Verificado contra la skill: no usa ninguno de los quitados. Chrome
  destapó además que la diaria corre a **10:00 CEST** desde el 27/08 (Alberto la movió por el reset de cuota, memoria
  del 27/08) y el doc decía 04:00; corregido en `RUTINAS-PROGRAMADAS.md` §1/§3/cadencias. `ALERTA_TOKEN` de las rutinas
  1-2 vive en el entorno `Default`, no en el prompt: el «NO/NO» de Chrome no es un fallo. Visto al pasar: `sivra_domotica_acceso`
  en rojo (1 cerradura con ERROR).


### 📌 Buscador ya distingue ficha viva de volcado; Vercel deja de comentar en los PRs (02/09/2026)
- **Duplicado «Jose Suarez Salas»**: dos fichas `tipo='cliente'`, la de 14 pólizas es el volcado (vence 2016) y la de 7 la viva (vence 2027). `clientes.tipo` no sirve → `vitalidadFicha()` en `@central/module-seguros` (CIMA o vencimiento < 18 meses = viva; `null` = no contado ≠ histórica). Buscador rotula y enlaza «Abrir la ficha viva →».
- **Auditoría de duplicidades** (Alberto): 80 vivos, 48 con otra ficha; 740 grupos por teléfono, 203 con nombres distintos (familias, NO se fusiona); **16/109 pólizas vivas en las dos caras**, en 10 la copia del volcado tiene la dirección del riesgo y la de CIMA el vencimiento; **1 cliente partido en dos fichas vivas por la propia ingesta CIMA** (Juan Manuel Duran Ibañez) → Manuel.
- **Corrección**: «dirección imposible» era rotundo de más — la calle va cifrada pero `localidad`/`cp` del riesgo van en claro y asegura tiene la clave. No hecho aún.
- `github.silent: true` en los 12 `vercel.json` → adiós a ~50 ediciones de comentario por PR.
- **Contacto/intervinientes** (Alberto, caso Esquiansa): 81/109 vivas traen intervinientes por CIMA, 14 enlazados a OTRA ficha; 6 de 25 tomadores «sin teléfono» lo tienen en un interviniente. `contactoEfectivo()` (module-seguros) decide a quién llamar y la ficha dice de quién es el número. Botón «Subir póliza ↗» en la ficha (asegura ya lo tenía; solo auto, no guarda fichero).
- **Catastro para hogar HECHO**: paquete `@central/core-catastro` (parser+http extraídos de subastas, que lo re-exporta; 548 tests de subastas siguen verdes) + `precalificarHogar()` + `/correduria/hogar` en plataforma. Probado en vivo: San Vicente 40 2º-14 → 76 m²/1994/Residencial/41002 = la póliza. `GET /insurance-lines` hecho en #2001; cotizar hogar en Codeoscopic sigue pendiente (0,50€, con OK).
- **Forma de pago** (Alberto): columna «Pago» en la ficha; CIMA da `fraccionamiento` (108/109) y `forma_pago` de recibos, NO el recargo → `recargoFraccionamiento()` con 3 estados (solo con ciclo completo). `ventanaAnulacion()`: contrato anual, aviso 30 días.
- **Pantalla de PÓLIZA hecha** (`/correduria/poliza/[id]` + puerto `/api/operador/poliza`): coberturas (1.418 filas), recibos, siniestros, intervinientes, documentos (0 en toda la base, declarado) y copia gemela. De paso: **42/109 CIMA canceladas** (bloque aparte, sin Retarificar), recibos todos anulados = «⚪ anulados» (no 🟢), prima 0 = sin dato.
- Hecho ya (era pendiente): (`/correduria/poliza/[id]`: datos, coberturas, documentación, siniestros, recibos); separar canceladas de «vivas»; recibos todos anulados no es «🟢 0 cobrados»; leer la copia gemela del volcado para la dirección del riesgo; 📞 «cifrado» = falta `PII_ENCRYPTION_KEY` en el Vercel de asegura.
- **«Haz todo» (2ª tanda, mismo PR #2001):** buscador por **localidad/CP del riesgo** (`porRiesgo`, SQL sobre `datos_especificos`) y por **calle descifrada en memoria** (`porDireccion`, ~170 pólizas; sin clave → «N ilegibles», no vacío); `GET /insurance-lines` de Codeoscopic (gratis, `hogarDisponible()` con 3 estados, pintado en `/correduria/hogar`). **Documentos: HECHOS en #2022** (tabla `seguros.documentos`, puerto y pantalla; falta la primera subida real de Alberto desde `/correduria/cliente/[id]`). Pendiente que cuesta dinero: `peticion-hogar.ts` (0,50€/prueba, solo con OK).
- **Coberturas CIMA leídas de verdad (PR #2068 mergeado):** `interpretarCapital()`/`extraerDetalleCobertura()` en module-seguros; `0` = «sin capital propio», `INF` = ilimitado; límites/franquicias/prima desde `datos_extra`. Inventario en `docs/ASEGURA-CIMA-COBERTURAS.md`.
- **FUSIÓN de fichas, con OK de Alberto (solo clientes CIMA):** regla = ficha CIMA sobrevive; gemela = mismo nombre o teléfono + nº de póliza compartido (sin ceros a la izquierda) o mismo DNI → **33 pares** medidos (nunca por nombre solo: 94 pares por nombre no se tocan; 7 con póliza común y nombre distinto, tampoco). Piloto **José Suárez Salas HECHO** en BD (lote `fusion-cima-2026-09-02`, fila en `cliente_merge_log` con snapshot): 14 pólizas + 7 bienes + tels/emails reapuntados, ciudad `34143` → SEVILLA, lápida en la de junio. **HECHOS los 34 (validado José → resto en una pasada):** 33 supervivientes, 143 pólizas reapuntadas, 26 ciudades numéricas curadas; función `pg_temp.fusionar` (reapunta 24 FKs, hereda solo huecos; los índices ciegos son ÚNICOS: la lápida suelta email/teléfono antes de heredarlos). **Juan Manuel Durán Ibáñez unificado por decisión de Alberto** («seguros en vigor, los de CIMA») pese a DNI/nacimiento distintos en la base: sobrevive la ficha con Allianz 2027. Clientes CIMA: 80 → 79. **Provincia por CP** en 32 vivas (30 «Tarragona» falsas + 2 NULL); 17 siguen sin provincia porque tampoco tienen CP. Comprobar tras el pull CIMA de mañana (05:30 UTC) que no reaparece ficha nueva para ninguno de los 33. Al verla Alberto: «Tarragona» = provincia basura de la ingesta CIMA (**29/80 vivas** con provincia ≠ CP, 19 sin provincia; José corregido a mano, el resto con su OK); **«recibo pendiente» NO es deuda**: EIAC `pendiente` = emitido y sin cargar aún (rótulo cambiado a «al cobro» en fichas y `explicarCobro`); **Juan Manuel Durán Ibáñez NO es un duplicado** (DNI y nacimiento distintos: dos personas, corrige la nota del día anterior). Tel/email «cifrado» = falta `PII_ENCRYPTION_KEY`/`PII_LOOKUP_KEY` en Vercel `central-asegura` (copiar del proyecto `asegura`; nombres confirmados en el código del CRM, 92 y 40 usos). Claude Chrome vio `PII_ENCRYPTION_KEY` marcada «needs-rotation» en `asegura`: es la **cadencia de 90 días del runbook de Manuel** (`docs/runbooks/secret-rotation-LOO-132.md` del repo `asegura`; clave del 13/04, vencida desde julio), no una fuga. ⏸️ **Rotarla es tarea aparte**: el cifrado `v1:` es de clave ÚNICA (sin doble clave), así que rotar = job que descifra con la vieja y recifra con la nueva las columnas PII de `seguros` + cambiar las DOS Vercel a la vez. Primero copiar, rotar después. ✅ **Copiadas por Alberto y REDESPLEGADO central-asegura: la ficha de José Suárez ya pinta teléfono y email en claro.** La marca «Needs Attention» de Vercel resultó ser SU aviso «parece un secreto y es visible: guárdala como Sensitive» (no el runbook de Manuel: corrección a lo anterior); «Rotate Variable» NO se pulsa. De paso: `estadoClavePii()` (`apps/asegura/lib/pii-estado.ts`, 5 tests) viaja en `/api/operador/cliente` como `pii.clave` y la ficha de plataforma dice POR QUÉ no descifra (`sin_clave` · `mal_formada` · `no_abre`) — antes «cifrado» era el mismo texto para tres arreglos distintos y Alberto copió a ciegas tres veces. El índice de `module-seguros-pii` lleva ahora extensiones `.ts` (sin ellas `node --test` no lo resolvía).
### 🔑 (02/09/2026) Domótica: el aviso «PIN con la ventana desactualizada» lleva botón para reponerla desde Telegram (PR #2003)
- Disparador: aviso 🕒 de Socorro con 2 PIN (reservas 152490601 y 150885616) caducando 2 h antes de lo debido,
  y su única salida era abrir `/sivra/domotica` en el portátil. Desde el contenedor no hay Tuya/Smoobu, así que
  **esos dos PIN siguen SIN reponer**: hay que pulsar «🔄 ventana» en el panel o, tras desplegar, el botón del aviso.
- La reposición se extrajo a `lib/domotica/reponer-ventana.ts` (un solo camino para el PATCH del panel y el
  webhook); el cron manda el aviso con `tgAvisoAlertaBotones` y un botón `dom_ventana:<disp>:<ref>` por PIN
  (helper puro `reponer-ventana-puro.ts`, límite de 64 bytes vigilado por test). Resultado por mensaje nuevo,
  y si Tuya cae a offline y el código CAMBIA se canta en mayúsculas (antes el PATCH lo callaba).
- Sigue sin tocarse solo, a propósito (Tuya borra+recrea). Guardián del catálogo ampliado a `tgAvisoAlertaBotones`.
- **Alberto repuso los dos PIN desde el panel** (BD: ambos → 13:00, mismo código, `tuya_password_id` nuevo) pero
  la pantalla seguía en «11:00»: `ajustarVentana` no recargaba la lista tras el PATCH. Corregido en el mismo PR. Doc: `docs/DOMOTICA-TUYA.md` (Fase 2).

### ✅ (02/09/2026, 06:36 UTC) Correduría: TRASPASO CERRADO — el CRM corre sobre la BD de central
- Rol nuevo `crm_seguros` en central (LOGIN, BYPASSRLS, DML en `seguros`, `search_path=seguros`, sin `public`)
  porque `DATABASE_URL` de `central-asegura` es Sensitive en Vercel y no se puede copiar. Alberto pegó la URL
  en el proyecto Vercel `asegura` (con el agente de Chrome haciendo redeploy/health/dry run).
- Prueba real: `/api/health` → `db: ok`; `cima-pull` dry run #187 → `cima_pull_started/completed` en
  `seguros.operational_events` DE CENTRAL, `queueDepth: 128`. El cron (05:30/11:30 UTC) escribe ya aquí.
- 40 min perdidos por pegar la plantilla `TU_CONTRASEÑA_AQUI` sin sustituir: el health lo tapa; la causa
  estaba en `get_runtime_errors` de Vercel. ⚠️ La contraseña de `crm_seguros` pasó por el chat: **rotar**.
- Queda: auth del CRM sigue en el Supabase de Manuel (9 usuarios); `record-evidence.ts` por PostgREST; Fly;
  y el banner rojo de Supabase «Grace period is over» en la org de Alberto (cuota) — revisar billing.

### 🏠 (02/09/2026) Correduría «todo nosotros»: el CRM ya es nuestro, está CAÍDO desde el 31/08, y falta UNA variable
- Alberto: «haz lo necesario para tener todo nosotros». Hallazgo: el repo `asegura` (CRM de Manuel) y su
  proyecto Vercel `asegura` (`app.grupoasegura.com`) **ya están en la cuenta/equipo de Alberto** — el doc
  del traspaso iba por detrás. Secrets de Actions viajaron.
- 🚨 **El CRM lleva caído desde el 31/08 06:15 UTC** (primer despliegue en nuestro equipo): `password
  authentication failed for user "postgres"` en TODA consulta (386× en `/api/health`); `cima-pull` → 500
  (3 corridas). Nadie lo vio (sin Slack). Origen congelado ⇒ la copia del 02/09 es completa.
- Hecho: 12 funciones + 26 triggers portados a `seguros`; `prisma_seguros` con `search_path=seguros`;
  `apps/asegura` lee de central por defecto (`urlFuenteCartera`, probado; `ASEGURA_FUENTE=origen` vuelve).
- **Pendiente de Alberto (panel Vercel, 4 pasos en `docs/TRASPASO-CORREDURIA.md` «CIERRE»):** poner en el
  proyecto `asegura` el `DATABASE_URL` de `central-asegura`, redesplegar, `/api/health`, `cima-pull` dry run.
- Queda para después: auth (9 usuarios en el Supabase de Manuel), `record-evidence.ts` por PostgREST, Fly.
- PR #2002 (lateral plegable + copia) **mergeado** por orden de Alberto.

### 🗄️ (02/09/2026) Correduría: la cartera YA ESTÁ COPIADA en `seguros` (foto fija, origen sigue vivo)
- Alberto: «vamos con la copia de BBDD, es prioritario». **Hecho:** 52 tablas, 86.628 filas, 131 FKs,
  verificación por recuento (52/52) y checksum de contenido (clientes, pólizas, recibos, siniestros).
  Central pasa de 213 a 274 MB (plan free, 500 MB).
- 🔑 El bloqueo del 01/09 era el secreto del Vault: traía una contraseña suelta de 10 caracteres, no una
  URL, y no era la de ningún rol. Salida: **`apply_migration` entra en el proyecto de Manuel como
  `postgres`** (`execute_sql` solo como `supabase_read_only_user`) → rol temporal `traspaso_lectura` →
  dblink desde central por el pooler `aws-1` → **rol borrado y secreto vaciado al acabar**.
- ⚠️ Es una FOTO: CIMA sigue entrando en la BD de Manuel y TODAS las apps siguen leyendo de allí
  (`ASEGURA_DATABASE_URL`). Repuntar lectura + ingesta es el paso siguiente, no este PR.
- `tenant.ts`: vínculo real cuenta ↔ correduría por email contra `seguros.usuarios` (cierra el TODO).
- 🐛 El script fallaba en `codeoscopic_consumo` (tabla nuestra, no del origen) y hacía rollback de todo:
  añadida la guarda «solo tablas que existen en el origen».

### 📐 (02/09/2026) Plataforma: botón « para plegar el lateral
- `UserSidebar.tsx` (escritorio): botón «/» en el cabecero → tira de iconos de 56px (tooltips por `title`),
  pie con solo ⏻. Estado en `localStorage('nav-plegado')` aplicado por el **script anti-parpadeo de
  `layout.tsx`** (`html[data-nav-plegado]`, CSS en `globals.css`), igual que tema y saldo oculto: sin salto
  al recargar. Móvil (drawer) intacto.
- 🔎 Hallazgo de paso, SIN tocar: en la ficha de Jose Suarez Salas sale «📍 34143, Tarragona» porque en la BD
  de **Manuel** (sigue siendo la fuente, `ASEGURA_DATABASE_URL`; NO hay copia) la ficha `intranet:cli:17`
  tiene `ciudad='34143'` / `provincia='Tarragona'` (CP correcto 41003). **504 fichas** del volcado
  `intranet:` tienen `ciudad` numérica y 488 `provincia='Tarragona'`: columnas corridas en ESA importación.
  Hay duplicado sin fusionar (`asegura_app:cli2:17`, SEVILLA/41003) con las 14 pólizas históricas.

### 🔎 (01/09/2026) Correduría: buscador de TODO, cola de retención y limpieza de la pantalla
- 🗑️ **Borrada** `/cartera/renovaciones` de asegura (duplicaba la de plataforma) y su menú.
- 🔎 **Buscador universal**: nombre · matrícula · nº póliza · DNI · teléfono · email · ciudad · CP.
  Un término se busca por TODOS los criterios que encaje. 🚨 **DNI/teléfono/email solo alcanzan al
  12-16%** de las fichas (índice ciego) y **la dirección va CIFRADA: no se puede buscar** — cada
  bloque enseña su cobertura, porque ahí un vacío no es una ausencia.
- 📞 **Cola de retención** (art. 15 LCS): manda el RELOJ, no el importe. Al mes la cobertura queda
  **suspendida** y el cliente no lo sabe; pagar la devuelve en **24 h**; a los 6 meses se extingue y
  retener = póliza nueva. Botón `tel:` y salto a retarificar. Vacía ≠ «todo cobrado»: se declaran las
  18 pólizas vivas sin ningún recibo.
- 🧹 **Pantalla reorganizada por el agente de diseño**: 12 KPIs → 4; el buscador sale del bloque que
  hacía `return` al fallar (desaparecía con el puerto caído); «pendiente de confirmar» sale del gate
  `totalAnual>0` que lo escondía; la matriz del banco se pliega (no se borra: es donde se aprende).
- 32 tests nuevos (`busqueda`, `retencion`, `correduria-puerto`). CI verde. PR #1999.

### 🗂️ (01/09/2026) La correduría se trabaja desde plataforma: ficha del cliente y accesos directos
- 📌 **Dictado de Alberto:** *«asegura hay que meterlo en correduría, yo solo uso UNA página»*. Su
  pantalla es `plataforma → /correduria`; **asegura es la trastienda** (BD + el botón que gasta 0,50€).
  Escrito en los tres CLAUDE.md: pantalla nueva de la correduría → se monta en plataforma.
- 🔎 Se destapó una **duplicación**: la lista de renovaciones que se hizo ayer en asegura era paralela
  a la que plataforma ya tenía. Se conserva (enseña el coste de la tanda) pero no crece.
- ✅ **`/correduria/cliente/[id]`**: pólizas, recibos, siniestros y contacto en UNA pantalla. El nombre
  de Renovaciones es enlace directo + buscador. Único salto a asegura: «Retarificar ↗».
- 🚨 **Cuatro «no lo sé» que no se colapsan**: `recibos.total 0` ≠ al corriente (**18 de 109 vivas** no
  tienen recibo), `recibos null` = asegura sin desplegar, `clienteId null` = sin enlace, y
  `no_encontrado` ≠ `error`. Y `importeEiac()`: `Number('1.234')` daría 1,23€ donde pone 1.234€.
- Puerto nuevo `/api/operador/{cliente,clientes}` (DNI/IBAN NO cruzan). 15 tests nuevos, CI verde.

### 🔁 (01/09/2026) asegura: renovaciones + dos bugs vivos encontrados al repasar
- **`/cartera/renovaciones`**: qué vence en 90 días por urgencia REAL, con el objeto asegurado
  (distingue tres pólizas del mismo cliente) y el coste de retarificar la tanda. `cabenEnTanda()`
  **estaba construido y sin usar**: la cartera viva entera son ~40€.
- **NO hay botón de «retarificar todas»** y es honesto: las 80 vivas traen solo matrícula, así que
  cada una necesita elegir versión. Se podrá con el PDF subido o con créditos de `/vehicles`.
- 📜 La ley ya estaba modelada y vale dinero: **una subida de prima es una MODIFICACIÓN** (LCS 22),
  exige 2 meses de preaviso; sin él, la compañía **no puede imponerla**. Eso es «última llamada».
- 🐛 **Bug 1:** `estadoMigracion()` contaba TABLAS → 53 tablas vacías hacían `migrado:true` y la
  pantalla decía «tu cuenta no está vinculada» (ausencia COMPROBADA) sobre 32.600 fichas. Ahora
  cuenta **corredurías** (no clientes: no toca PII) y la decisión es pura en `migracion-decision.ts`.
- 🐛 **Bug 2:** el guardián de aislamiento marcaba infractor un fichero PURO por nombrar
  `seguros.clientes` **en un comentario**. Ahora ignora comentarios; verificado que sigue mordiendo
  SQL real.

### 📄 (01/09/2026) asegura: subir una póliza y que el agente la lea — primera pasada
- `/cartera/subir`: PDF (texto) o foto (visión). **No gasta cotizaciones** — leer es gratis.
- Reutiliza el pipeline ya probado de `apps/asegura-portal`; lo nuevo es QUÉ se busca (17 campos
  para cotizar, no los 5 de la bóveda) y la validación dura: **letra del DNI** y **formato de
  matrícula** se comprueban, porque un DNI mal leído es otra persona y una matrícula, otro coche.
- Procedencia nueva **`documento`** (entre `compania` y `calculado`) + `debeSustituir()`: lo leído
  **nunca pisa lo que mandó la compañía**. Guardián `test/regression-marcadores-sin-dato.test.ts`
  fija que los DOS extractores traten igual los «no lo sé». Cepo verificado rompiéndolo.
- 🐛 Fallo cazado por su test: limpiar «muchos» dejaba '' y `Number('')` = **0** → «muchos
  siniestros» se guardaba como «ninguno», y en la dirección que abarata la prima. Con regresión.
- ⚠️ **NO escribe en la cartera** (rol SELECT-only) ni **guarda el fichero** (falta decidir dónde y
  cuánto tiempo se conserva PII, y `cliente_documentos` no existe). Devuelve el hash, no el papel.

### 🧭 (01/09/2026) asegura — EL PRINCIPIO de Alberto: presupuesto rápido, verificación al emitir
- *«Todas las opciones posibles; presupuesto = lo más fácil y rápido; y ya en caso de cuadrar al
  cliente, nos centramos en que todos los datos estén bien.»* **Dos fases con exigencias OPUESTAS.**
- Consecuencias en el código: (1) **ningún dato con un solo camino** — la versión del vehículo tiene
  cuatro (ficha en texto · foto ficha técnica · catálogo a mano ✅ · matrícula de pago); (2) la fase 1
  no se bloquea salvo por lo que no se puede inventar sin mentir; (3) 🎯 **los `supuestos` de la
  precalificación SON la lista de verificación de la fase 2**, con los `optimista` en cabeza.
- ⚠️ Matiz medido: las **80 pólizas vivas (CIMA) NO traen marca/modelo en texto** (solo matrícula);
  ese camino sirve para el volcado histórico. Por eso el catálogo a mano era lo primero a construir.

### 📸 (01/09/2026) asegura: alta por fotos, SINCO y el siguiente ramo — investigado y anotado
- 🚨 **La ficha técnica SÍ trae la versión (campo `D.2`)**, más `K` de homologación. Se creía que
  solo la marca. Pero `D.2` es homologación EUROPEA, no Base7: sigue habiendo emparejamiento, que se
  cierra filtrando por cilindrada + potencia + combustible + año. **Con 2+ candidatos decide una persona.**
- **BD de matrículas gratis: no la hay útil.** DGT open data va anonimizada (sin matrícula); el resto
  de pago; y todas darían TEXTO, no el código Base7. La foto de la ficha técnica es mejor fuente.
- 🎯 **SINCO = fichero SIHSA de TIREA**: siniestralidad de los **últimos 5 años** (la ventana exacta de
  `lastFiveYearsAccidents`), consultable al tarificar. ⚠️ Se ofrece a «Entidades Aseguradoras» y una
  correduría NO lo es → **preguntar a TIREA** (`accesos.cima@tirea.es`). El asegurado sí puede pedir el
  suyo gratis. Y la compañía lo consulta igual al emitir: la siniestralidad presumida se corrige sola.
- **Siguiente ramo: HOGAR** (dictado de Alberto). Más fácil porque no hay vehículo que identificar.
  Primer paso gratis: `GET /insurance-lines` dice si tarifica para nosotros.
- Diseño: `docs/superpowers/specs/2026-09-01-asegura-alta-por-fotos-y-bonificadores.md`.

### 🔘 (01/09/2026) asegura: el botón «Retarificar» sobre la cartera REAL, de punta a punta
- `/cartera` → buscar cliente → ficha → **Retarificar** en una póliza de auto. Plan de Alberto:
  primero a mano sobre clientes de verdad, automatizar después.
- ✅ **`seguros.codeoscopic_consumo` YA CREADA en la BD** (con sus dos CHECK). Era el bloqueo real.
- 🚨 **Medido: las 80 pólizas de auto vivas (CIMA) traen SOLO matrícula** — ni marca ni modelo ni
  año. Pero el código de versión sale **gratis** navegando `car/brands→models→vehicles`; lo que
  cuesta créditos es buscar **por matrícula**. Se cotiza HOY sin comprar nada.
- `desde-cartera.ts` devuelve **tres** cosas: lo que se manda, lo **supuesto** y lo que falta. Los
  supuestos tiran a la baja salvo la siniestralidad (decisión de Alberto, marcada `optimista`).
  **Nunca se supone un dato personal.** Centinela nuevo: 20.860 fichas se llaman «Lead».
- Guardián `test/regression-asegura-gasto-codeoscopic.test.ts`: un solo puerto gasta y es POST
  (un `GET` que cotice lo dispararía un prefetch). **Cepo verificado rompiéndolo.**
- Falta de Alberto: contraseña al rol, `CODEOSCOPIC_TARIFICACION_ACTIVA=true` y redeploy.

### 📚 (01/09/2026) Conseguida la documentación OFICIAL de la API de Codeoscopic
- Alberto exportó el portal (`portal.api-int…`, MHTML) y de ahí sale el índice completo de
  operaciones → **`docs/CODEOSCOPIC-API-PORTAL.md`**. Primera fuente del FABRICANTE (el traspaso de
  Manuel describe lo que él implementó, no lo que la API ofrece).
- 🚨 **Hogar SÍ está en la API** (11 catálogos `/home/*` + `recommend-limits`), y hay SEIS ramos:
  auto, moto, hogar, vida temporal, salud, decesos. Corrige lo dicho esta misma tarde.
- 🚨 **`GET /insurance-lines` dice si cada ramo tarifica** (`supports.rating`) para tu organización,
  y es GRATIS: no hay que preguntárselo a JM.
- 🚨 **`GET /car/registration-date?plate=`** da la fecha (aproximada, `null` si no la halla), y
  **`GET /vehicles?registrationPlate=`** resuelve el VEHÍCULO — pero es la ÚNICA operación de la API
  que exige **créditos de pago** (comercial@codeoscopic.com). Era el cuello de botella de «matrícula→precio».
- `portal.` NO es el host de la API: el propio portal muestra `api-int.codeoscopic.io/oauth2/token`.
- 🚫 La API expone pólizas/recibos/siniestros, pero **NO se usan**: eso ya lo da **CIMA, conectado y
  directo con las compañías** (dictado de Alberto). Codeoscopic sería el espejo parcial de Avant2.
- 🧭 Regla de reparto, palabras de Alberto: **«Avant2 vender, CIMA backoffice.»** De esta API interesa
  lo que ayude a VENDER (cotizar, borradores, catálogos, matrícula); lo que huela a backoffice, no.

### 🔍 (01/09/2026) El fixture de Codeoscopic, releído entero: 3 fallos del parser corregidos
- 🚨 **`errors[]` es por CONFIGURACIÓN de producto, no por compañía.** Reale falla con la config
  `37786__` **y da 8 precios** con `83474 (ASM y API)`. El resumen decía «Reale sin precio»: falso
  sobre la que más dio. Ahora `tambienDioPrecio` y solo se nombran las mudas (Pelayo, Zurich).
- **`deductible` la traen 10 de 18 precios** y se tiraba: enseñar 427,79€ de todo riesgo callando
  1.500€ de franquicia es «dato que SÍ está pero se lee mal». Ausente = `null`, nunca `0`.
- **`modality.category`** da los 6 niveles (Terceros → Todo Riesgo Sin Franquicia): la agrupación
  de la comparativa. Sin usar aún: `addonQuotes` (RACE asistencia 54,99€/199,00€) y `links[]`.
- Lección de método: el fixture llevaba en el repo desde por la mañana y estos tres solo salieron
  al leerlo ENTERO, no por muestreo. 73 tests en asegura, todo verde.

### 🎯 (01/09/2026) CI: el push «mudo» es LAG de GitHub — causa medida, no otra hipótesis
- Dos pushes sobre el PR #1962 (ya fuera de draft) no dispararon ningún requerido. Al mirar el **objeto
  PR** en vez de los runs: `git ls-remote` daba `5a732a51` y el PR seguía en `d0d23c65`, con 2 commits de
  5 y `mergeable_state:"dirty"`. GitHub no había procesado el `synchronize`.
- A los ~2 min se puso al día SOLO y los 12 arrancaron en ese instante, sin des-draftear, sin mergear
  `main` y sin push nuevo. Verdes y mergeado (`3804b42e`).
- Corrige tres días de teoría del `CLAUDE.md` (draft, identidad, «merge de main»): cada palanca que
  «funcionó» llevaba minutos de espera detrás. **Procedimiento: compara `ls-remote` con el `head.sha`
  del PR ANTES de tocar nada; si no coinciden, espera 2-3 min.** Cada palanca crea un head nuevo y
  reinicia la espera.

### 🧾 (01/09/2026) asegura: constructor de la petición de cotización de auto (validación gratis)
- `lib/codeoscopic/peticion-auto.ts` — puro: de los datos de la ficha al `CreateInsuranceRequest_V1`.
  **23 tests.** `revisarDatosAuto()` devuelve todos los reparos a la vez; `construirPeticionAuto()`
  lanza si queda alguno. Motivo: un cuerpo mal formado da un 400 **ya facturado**.
- Reglas del vendor encerradas en test: la MISMA persona idéntica en los tres papeles (holder/owner/
  primaryDriver, el vendor cruza por DNI), la dirección solo con sus dos mitades, y
  `lastFiveYearsAccidents` obligatorio si años sin siniestros < 5 y ≠ años asegurado (con `0` como
  respuesta válida, no hueco). Y los 5 campos que NO viajan (email, calle, ocupación…).
- Convenciones de UI mapeadas para la pantalla: **no hay Server Actions en el repo** (route handler
  + form cliente), asegura usa tokens de `globals.css` (no Tailwind) y zod solo en el route.
  Molde: `apps/mariscos/app/(usuario)/_forms.tsx` + `app/api/partidas/route.ts`.
- Sigue bloqueado en lo mismo: redeploy de `central-asegura` + sonda. Sin eso, nada verificado.

### 🧭 (01/09/2026) Portal de Grupo Asegura — Fase 1 MERGEADA (PR #1965 → `f12b7b46`)
- App nueva `apps/asegura-portal` (Next.js, rol propio SIN BYPASSRLS) + `@central/module-seguros-portal`
  (puro: niveles de acceso, procedencia en tres estados, código de un solo uso). 6 tablas `portal_*`
  en el schema `seguros` — **el SQL NO está aplicado todavía**; las otras 5 del spec llegan con sus fases.
- **El canal es un PUERTO**: la WABA no existe aún, así que en Fase 1 se enchufan email y consola;
  WhatsApp entra añadiendo un fichero. `canal_no_disponible` (503) ≠ `envio_fallido` (502).
- 🚨 Los 3 ENUM del DDL estaban tipados `String` en Prisma: typecheckea y **revienta en el primer
  INSERT** (42804). Arreglado declarándolos con `@@map` — no hay migración, la BD ya era así.
- Guardián `test/regression-portal-aislamiento.test.ts` (importar `lib/session` **y** nombrar
  `identidadId`), verificado con un infractor real en sus dos variantes.
- Mergeado el 01/09 con los 19 checks en verde; re-probado sobre `main`: `pnpm test` EXIT=0 (guardián
  108/108) y typecheck de `asegura-portal` limpio. Falta de Alberto: proyecto Vercel, rol
  `prisma_asegura_portal` con contraseña, envs, ejecutar el SQL de Fase 1, y la WABA.
- 🚧 **Volcado de la cartera: LANZADO Y BLOQUEADO (01/09/2026).** DDL ya aplicado (52 tablas,
  42 enums, `dblink`+`vector` OK), pero el secreto `asegura_origen_url` del Vault **mide 10
  caracteres: no es una cadena de conexión**, así que `dblink` falla con «password or GSSAPI
  delegated credentials required» en la primera tabla. **Nada escrito** (la transacción revierte:
  bitácora 0, clientes 0, pólizas 0, FKs 0). Al corregirlo: pegar el `ASEGURA_DATABASE_URL` del
  proyecto Vercel `central-asegura` **sin `pgbouncer=true`** (no es un parámetro de libpq) y mejor
  por el **puerto 5432**, no el pooler.

### 🔬 (01/09/2026) Codeoscopic: forense de la única cotización real — dos docs corregidos
- No hay conexión desde el contenedor: el proxy deniega por política `codeoscopic.io`,
  `central-asegura.vercel.app` y `app.grupoasegura.com` (403 en el CONNECT). La verificación
  tiene que salir del despliegue de Vercel, no de la sesión.
- 🚨 **El `project_not_found` del webhook NO era un fallo de correlación:** los 2 eventos son smoke
  tests con ids inventados (`999999`/`smoke-test-s168`, `smoke-fix-webhook`). **Codeoscopic no ha
  mandado nunca un webhook real** — solo los dispara al emitir, y no se ha emitido. Corregido en
  `sector.md` §4 y en la cabecera de `CODEOSCOPIC-TRASPASO-MANUEL.md`.
- **Los 15 precios reales del 29/07 son TODOS `estimado`** (el fixture del sandbox, 0 de 18). Dos de
  dos: el precio con reservas es el caso general. Parrilla real: Mapfre, Allianz, Occident
  (278,59€–609,64€), no Reale/Fidelidade. `expires_at` NULL en los 15 → un precio pagado NO se puede
  reutilizar. `referenceFromVendor` es por compañía (Mapfre no lo manda).
- Cartera viva por ramo: 81 auto/moto · 19 hogar · 9 RC. Hogar NO tiene cotización en el repo de
  Manuel, pero la API es multi-ramo (`insuranceLine`) y `insurance-lines` se puede consultar GRATIS.

### 🚨 (01/09/2026) Vigía de reservas: los 3 avisos que mandó eran FALSOS (y no solo hay Booking)
- El 🚨 «reserva 153896946 que Smoobu NO tiene» era falso: está en Smoobu y en `incomes` (Expedia,
  Busto Reform, 03→07/09, Karl Brunelliere). El nº salía del **enlace del propio correo de Smoobu**
  (`login.smoobu.com/es/booking/detail/153896946` = `incomes.reservationId`), y el vigía solo
  comparaba contra las referencias de la OTA. Las 3 alertas emitidas hasta hoy, falsas.
- Arreglado: la notificación de `service@smoobu.com` ya no entra al vigía ni al agente de huéspedes
  (parser `lib/correo/smoobu-notificacion.ts`, 8 tests con el correo real); el vigía compara también
  contra `b.id` y mira `incomes` antes de preguntar; y el aviso dice el **canal REAL** (Expedia,
  Agoda…) o ninguno — ya no manda a la extranet de Booking a por una reserva de Expedia.
- Fila 10 (cancelación de JUAN PONCE) corregida a mano en BD: era `nueva`/`huerfana`. PR #1978, mergeado.

### 🧹 (01/09/2026) Vanesa = Sique Brilla, y su ÚNICA pantalla es /invitado/limpieza
- Tras el PR #1991, Alberto miró el viernes 04/09 en la intranet y **la cuna no estaba**: la orden
  salió por email y se pintó en `/sivra/mensajes`, dos canales que ella no abre.
- **Corrección de hecho:** Vanessa Cruz = Sique Brilla SL (los docs las trataban como dos actores) y
  **ya no usa ialimp** — se le retiró el acceso. ialimp **se queda tal cual** como producto a vender.
- `enviarOrdenLimpieza` crea ahora la fila en `limpieza_tareas` ANTES del email; columna
  `sivra_ordenes_limpieza.tarea_id` (aplicada): NULL = **la limpieza NO lo ve**, y se canta.
- Corregidos los docs que afirmaban lo contrario: landmine #7 de `sivra-maestro`, `ialimp-maestro`,
  `ialimp-client-health` (sus «0 accesos» ya no son avería) y `apps/plataforma/CLAUDE.md`.
- Regla global nueva en el `CLAUDE.md` raíz: antes de dar por avisado a alguien, mira EN QUÉ PANTALLA
  trabaja. **PR #1994.**

### 🧹 (01/09/2026) SIVRA: la orden a la limpieza deja de depender de que Stripe vea el dinero
- Raquel (reserva 152490601) pagó la cuna **por Bizum**: `sivra_extras_reserva` congelada en
  `ofrecido` y Sique Brilla sin enterarse — el email lo dispara SOLO el webhook de Stripe. Orden
  mandada a mano ese día con autorización expresa de Alberto.
- Dictado suyo: **la orden NO lleva estado de cobro** («ni pagado ni confirmar, simplemente una orden»).
  Tabla nueva `sivra_ordenes_limpieza` (aplicada) sin importe: qué se pidió y si el email SALIÓ.
- Botón 🧹 en el Telegram del borrador (callback `hsp_clean`, va ANTES del lookup del pendiente porque
  se ofrece justo después del ✅ Enviar, que ya lo borró); órdenes visibles en `/sivra/mensajes` y
  dentro del prompt del agente (deja de re-escalar «¿está confirmada la cuna?»).
- `[]` = nada pedido · `null` = no se pudo leer · `enviado_at` NULL = se intentó y no salió. **PR #1991.**

### 💶 (01/09/2026) asegura: cliente de tarificación Codeoscopic con contador y TOPE
- `apps/asegura/lib/codeoscopic/` — config · contador (puro) · libro en BD · token+transporte ·
  parser (puro) · orquestador. **43 tests verdes**; typecheck y QA limpios.
- **Apagado por defecto** (`CODEOSCOPIC_TARIFICACION_ACTIVA`); sonda GRATIS
  `/api/operador/codeoscopic/sonda` (solo token) que corre con el interruptor apagado y separa
  fallo de HOST de fallo de CREDENCIALES.
- 🚨 **Tope persistente en `seguros.codeoscopic_consumo`** (en memoria sería mentira en serverless):
  tres estados y solo `descartado` con evidencia libera cupo — **un timeout NO es evidencia**.
  Sin libro legible NO se cotiza. Topes 20/día · 200/mes, techo duro 250/1000.
- **Hallazgo:** en el fixture real **0 de 18 precios eran firmes** (2 estimados, 16 condicionados) →
  el parser devuelve `firmeza` + avisos. Envs de Codeoscopic ya puestas en Vercel por Alberto.
- ⚠️ Detectado de paso: el schema `seguros` **ya tiene sus 52 tablas** (todas a 0 filas), así que
  `estadoMigracion()` (cuenta TABLAS) dirá «migrado» sobre una cartera vacía. Sin tocar: avisado.

### 🔑 (01/09/2026) Codeoscopic: credenciales de PRODUCCIÓN activas + host prod — ya se puede cotizar
- Mensaje de Manuel: el Bitwarden Send trae el set `CODEOSCOPIC_*` de **PRODUCCIÓN, ACTIVO** (lo
  caducado era solo el usuario sandbox `albertocsf0170ws` → regeneración EN PAUSA; si 401, escribe
  Manuel a JM). **Host prod: `https://api.codeoscopic.io`** (`-int` = sandbox). OpenAPI no lo tiene.
- 🚨 Consecuencia: **sin sandbox utilizable, toda cotización es real (0,50€)** → contador+tope desde
  el PRIMER smoke, y el smoke (1 cotización) solo con OK explícito de Alberto. Anotado en `sector.md` §4.
- Alberto está metiendo las 6 envs de cotizar en Vercel `central-asegura` con Claude Chrome (valores
  solo por Bitwarden; a Vercel únicamente las 6 — webhook/legacy/flags NO). `BASE_URL` = host de prod.
- ✅ **Fixture incorporado**: `apps/asegura/fixtures/codeoscopic/` (18 precios + 3 errores reales;
  sanitizado verificado, no solo dicho). Su README anota lo que el traspaso NO decía: `$ref`
  JSON-Pointer en `offers[]`, `id` raíz numérico vs `"Q…"` string, y 🚨 **`estimate`+`messages[]`
  deciden si un precio va en firme** («Riesgo condicionado»). Compañías del fixture = sandbox, no la
  parrilla real. **PR #1972.**
- **Siguiente paso al confirmar envs:** cliente de tarificación en `apps/asegura` + smoke.

### 📱 (01/09/2026) WhatsApp de la correduría: descartados el rodeo por SMS y la campaña masiva
- **SMS con enlace `wa.me` para que escriba el cliente primero y salga gratis: descartado.** Un SMS en España
  cuesta ~4-8 cént. contra **0,0166€** de una plantilla utility → pagas 3-5× por no pagar 1×. Y un `wa.me`
  desde SMS **no** es *free entry point* (esos son click-to-WhatsApp y el botón de web/Facebook, 72h gratis).
  Además el **01/10/2026** Meta empieza a cobrar los mensajes de servicio: el ahorro caduca en 30 días.
- **Campaña a los 32.520 leads: descartada.** No es que sea cara — **es que no se puede gastar**: Tier 0 = 250
  destinatarios/24h → 130 días; los bloqueos de una lista de 2013-2018 tumban el *quality rating* en la primera
  tanda y queman el MISMO número que atiende a los 80 clientes vivos. Sin opt-in: LSSI art. 38.3.c, hasta 150.000€.
- **Sí al inbound de cualquiera** (gratis, no penaliza calidad, es un lead con intención propia) — pero **Nivel 0
  aunque el móvil esté en las 32.600 fichas**: un teléfono de hace 12 años hoy es de otra persona; decirle «veo
  que tienes pólizas con nosotros» es una brecha, no una bienvenida.
- **Decisión de orden: WhatsApp entra como CANAL (OTP + avisos), NO como agente conversacional.** A 80 clientes
  vivos un bot atiende ~12 conversaciones/mes; el canal, en cambio, trabaja solo. Difiere entera la DPIA y el
  art. 50 del AI Act, y encaja sin tocar nada con `2026-09-01-asegura-portal-fase-1.md` (canal = puerto).
- **Cloud API directa de Meta, no 360dialog**: sus 49€/mes no compran nada a este volumen (mensajería real
  <2€/mes). Captación por *free entry points*: botón en la web, QR en el PDF de póliza, firma de email — coste 0.
- **PENDIENTE que no depende de nadie y es el único camino crítico: dar de alta la WABA** (Business Verification
  = 2-14 días de espera de Meta). Nombre EXACTO del Registro Mercantil, CIF, factura de suministro y
  `grupoasegura.com` en pie con aviso legal coincidente. Número nuevo (no puede estar ya en WhatsApp).

### 💶 (01/09/2026) Comisiones de la correduría: IMPLEMENTADO devengo → liquidación → cobro → renta

- Libro `comisiones_devengo` + `comisiones_cobertura` (migración aplicada; se retira `cima_liquidaciones`, 0 filas).
- `/api/cron/cima-liq` deja el SOAP a `ws.cimaseg.es` (nunca funcionó, 404) y lee el **puerto HTTP** de
  `apps/asegura` (`/api/operador/comisiones`) — NO `ASEGURA_DATABASE_URL`, que solo existe en esa app.
- Helper puro `lib/correduria/cuadre.ts` con **9 estados**: `deudor` (Occident) ≠ impago, `sin-cobertura`
  (Generali) ≠ `sin-datos` (Mapfre), y `no-comprobado` manda sobre todo. Total anual con huecos = provisional.
- 🚨 Los tres números NO son el mismo: la compañía retiene el **15 % de IRPF** (modelo 190 → borrador AEAT),
  al banco llega la **remesa**. Allianz feb/2026 medido: 95,03 − 14,26 = 80,77 exacto contra el BBVA.
- Lector del PDF de Allianz (**EBCDIC cp500**, tabla propia: Node no lo trae) + confirmación manual (Mapfre).
- Pestaña «Cuadre» en `/correduria`. 31 tests nuevos. Los 12 checks en verde. **Mergeado (#1962).**
- 🚨 **Dictado de Alberto:** «la retención la hacen ellos, yo solo recibo ya lo mío». La practica y la
  ingresa LA COMPAÑÍA → para él NO es un gasto, es un **pago a cuenta** que resta de la CUOTA. A la
  renta va el BRUTO; contra el banco se compara la REMESA. Llevado a `cuadre.ts`, a la pantalla y a las
  skills `perfil-fiscal` / `agente-correduria`.
- **PENDIENTE (nuevo):** `lib/finanzas.ts:594` sigue ESTIMANDO el bruto elevando el neto del banco
  (`× 0,15/0,85`) y da por hecho que todo abono de seguros es comisión al 15 % — un periodo deudor de
  Occident rompe el supuesto. El bruto y la retención REALES ya están en `comisiones_devengo`: falta
  sustituir la estimación por el dato real. Hasta entonces, la cifra fiscal de comisiones es estimada.

### 🗂️ (01/09/2026) Rediseño de la ficha de cliente: es un índice, no un expediente
- Alberto: «el CRM no me convence… en una visual tengo que ver quién es, con quién está relacionado
  y qué tiene». Diseño + maqueta →
  `docs/superpowers/specs/2026-09-01-asegura-ficha-cliente-design.md` · artifact `22b57a16`.
- Inventariado qué hay detrás de cada pantalla (skill `agente-correduria`, `sector.md` §8). Con
  contenido: recibos (182 en 89 pólizas), **coberturas 1.418 en las 109** (la puerta más rica y hoy
  invisible), siniestros 67, comisión por póliza vía `comision_bruta`. Vacías: notas, WhatsApp,
  gestiones (23 de cartera viva, no 694).
- 🚨 Tres cifras que engañan: **902 de las 1.710 relaciones son roles de póliza**, no familia; los
  **3.676 «presupuestos» son pólizas de la competencia** del volcado; y las cotizaciones reales (24)
  tienen prima y compañía **al 0%**.
- 🚨 **Documentos: hacen falta en cliente/póliza/siniestro y solo la póliza tiene tabla.** Faltan
  `cliente_documentos` y `siniestro_documentos`; `bienes_asegurables` sin `poliza_id`. **0 ficheros
  en todo el sistema.** Falta el estado «pedido pero no recibido».
- ✅ PR #1949 (vigía de CIMA) **mergeado**: los 12 checks arrancaron al mergear `main` en la rama —
  quinta confirmación del orden documentado en `CLAUDE.md`.
### 📜 (01/09/2026) Codeoscopic: el Claude de Manuel CONTESTÓ — contrato de la API completo
- Respuesta transcrita en **`docs/CODEOSCOPIC-TRASPASO-MANUEL.md`**; resumen operativo en
  `agente-correduria/references/sector.md` §4. Resuelve el host base (**sandbox
  `api-int.codeoscopic.io`**, sin `portal.`; producción no consta → pedir), auth (OAuth2
  client_credentials + `X-Client-App`/`X-User-Email` + media type `vnd.codeoscopic.v1+json`) y el
  flujo: **`POST /insurances` SÍNCRONO, facturable y NO idempotente (jamás retry)** → `id` =
  project_id (persistirlo SIEMPRE: su ausencia era el `project_not_found` del webhook).
- Basic Auth del webhook: DEFINIDO (lo genera ASegura, lo carga Codeoscopic); solo falta ejecutarlo.
  Sin contador/tope de coste en su repo → se pondrá en central. Solo AUTO cableado.
- **Quedan 3 peticiones fuera del repo:** credenciales OAuth2 sandbox nuevas (JM Fernández, PM API),
  el OpenAPI oficial, y que Manuel adjunte el fixture `2026-06-10-sandbox-quote-response.json`.

### 🧾 (01/09/2026) asegura: prompt para el Claude de Manuel (Codeoscopic/Avant2, tarificación)
- Manuel pidió un prompt para su Claude → escrito en **`docs/CODEOSCOPIC-PROMPT-MANUEL.md`** (lo envía
  Alberto). Pide: doc de la API + host base (no consta en ningún correo de Alberto), esquema de auth,
  endpoints del flujo de cotización con payloads anonimizados, webhook (Basic Auth pendiente +
  `project_not_found`), tablas/estados, NOMBRES de envs (valores por gestor) y si el 0,50€ es por
  cotización o emisión. Solo tarificar; la emisión sigue tras su flag, apagada.
- Contexto medido: las tablas `codeoscopic_*` del volcado traen solo el rastro de pruebas (1 proyecto,
  15 precios, 2 webhooks fallidos) — lo necesario para conectar vive en el repo de Manuel.
- ✅ **Resuelto en el Gmail el 0,50€: es POR COTIZACIÓN**, facturado a mes vencido (correo del CEO
  09/04 + presupuesto de Cristina 14/05 en texto). Actualizado en `sector.md` §4 — todo automatismo
  que cotice lleva contador y tope (~109 pólizas vivas ≈ 54,50€/pasada).
- Al contestar Manuel: volcar a `references/sector.md` §4 y pedir regeneración de credenciales sandbox.
### 📬 (01/09/2026) El correo de Alberto es la TERCERA base de datos — y resuelve una de las diez
- Idea suya: «las compañías me escriben y dan información». Cierto y medible. `mediadores@occidentinforma.com`
  manda **un correo por movimiento de póliza** con nº de póliza, cliente y contrato `M00171`;
  `mediador@allianz.es` manda cartera No Vida, Cuenta Agente y anulaciones por impago **con adjunto**.
- ✅ **La 549147797 NO está anulada**: es una RC profesional del «Instituto Técnico Superior de
  Informática Studium» **emitida el 27/06/2025**, un año antes del arranque de la ingesta. Confirma que
  las huérfanas son cartera pre-CIMA, no bajas.
- 📇 **Mapa de claves** (en la skill): Mapfre `5239640` · Allianz **código 18638 / clave PA342520**,
  sucursal 209 (las cinco variantes `209-x-…` son la misma) · Occident `8-92361`, `M00171`, `306333` ·
  Reale `38605` · Fidelidade con credenciales CIMA desde el 31/08. **`306333` y `8-92361` no aparecen
  en ningún correo**: su origen (Catalana / Plus Ultra tras la absorción) sigue sin confirmar.
- 📌 **Acción que lo cierra:** pedir a Occident la **carga inicial de cartera en EIAC de `8-92361`** —
  Alberto ya hizo esa petición exacta a Reale el 11/04/2026. **No se manda nada sin su OK.**

### 🔑 (01/09/2026) La CLAVE DE MEDIADOR: por qué CIMA perdía datos de una cartera y no de otra
- Idea de Alberto («cada compañía asigna una clave»), medida y confirmada: el 2º campo del nombre
  EIAC es la clave de mediador. **Nueve claves en cinco compañías**; Occident manda por TRES
  (`8-92361`, `M00171`, `306333`) y el atasco NO está repartido — bajo `8-92361` están en cuarentena
  sus 10 SIN y 6 de 9 REC, `306333` va limpia. Agrupar por `codigo_entidad` manda a revisar la
  cartera que va bien.
- **Son DOS averías:** 3 de las 20 huérfanas YA están en cartera (el movimiento llegó antes que la
  póliza; una esperó del 24/06 al 26/07) → se arreglan **reprocesando**. Las otras 17 son cartera
  que la compañía nunca mandó: **CIMA solo envía POL en altas y modificaciones**, así que falta una
  **carga inicial por clave**. Contarlas juntas manda a pedir algo que ya está en la BD.
- PR #1949: el vigía reparte por clave (`porClave`) y separa `huerfanasResolubles`; el puerto extrae
  la clave del nombre; `clave` NO es obligatoria en la validación (un puerto viejo sigue siendo
  legible). 7 tests nuevos. Skill `agente-correduria` actualizada.
- **Pendiente:** el CI del PR no arranca los 12 requeridos ni con merge de main, ni con push real,
  ni des-drafteando (mismo patrón que #1789).

### 🛡️ (01/09/2026) CIMA perdía recibos y siniestros hace 2 meses — vigía nuevo + causa raíz
- Analizando qué CRM necesita la correduría salió una avería VIVA: del 24/06 al 30/08 se quedaron
  **42 ficheros de CIMA en cuarentena — 23 recibos (7.721,71€ de prima) y 20 siniestros**, 39 de
  Occident. Eventos `cima_{recibo,siniestro}_sin_poliza_review`, `reason=sin_poliza_en_cartera`.
- **Causa raíz:** se empareja por `id_poliza_entidad` y **Occident / Catalana Occidente / Plus Ultra
  son el MISMO grupo bajo C0468** — 9 de las 19 pólizas afectadas SÍ están en cartera, con otro
  nombre de compañía y sin código de entidad. Al agrupar por compañía, normalizar el grupo primero.
- **Por qué duró dos meses:** el health-check de origen traía `cuarentenaTotal: 41` (39→40→41 en seis
  días) en su propio parte y sus señales de alarma eran `ficherosError`/`ficherosDeferred` = 0.
  Verde todo el tiempo **midiendo lo que no era**. El reconciliador (`cima_reconcile_resumen`) lleva
  parado desde el 25/06.
- **Hecho (nuestro lado):** helper puro `@central/module-seguros/ingesta` (`saludIngesta`, 11 tests,
  `sin_datos` ≠ `ok`), puerto `/api/operador/ingesta` en asegura, cron `correduria-ingesta` (06:45)
  + aviso `correduria.ingesta` + latido `correduria_ingesta` con su sonda.
- **De Manuel (su repo, no el nuestro):** emparejar por `numero_poliza` normalizado y por grupo de
  entidad; reactivar el reconciliador; meter `cuarentenaTotal` en las señales.
- **De Alberto:** verificar en la intranet de Occident las 10 pólizas que no aparecen (solo 1 da
  señales de anulación; el resto tienen recibos cobrados/pendientes y siniestros abiertos).
- **Corregida deriva documental:** `TRASPASO-CORREDURIA.md` afirmaba que «jamás se ha persistido un
  REC, un SIN ni un CEF» y que no era avería sino función sin encender. Falso: hay 184 recibos, 67
  siniestros y 7 CEF. También 69→67 siniestros en la skill.
- 🧭 **Decisión de producto:** el CRM ESCRIBE donde manda Alberto (leads, notas, tareas,
  renovaciones) y CONSULTA donde manda la compañía (pólizas, recibos, siniestros). Sin módulo de
  siniestros: no se puede aperturar por CIMA y los 67 están congelados (1 actualizado, 0 con
  tramitador). Cartera real: **80 clientes / 109 pólizas**; de los 32.520 leads, **26.964 no tienen
  ni teléfono ni email** y solo **1 ficha** tiene consentimiento registrado.

### 💶 (01/09/2026) Comisiones de la correduría: spec del control devengo → liquidación → cobro → renta
- Alberto: «controlar que me pagan lo que me deben y que está ingresado en cuenta», y que el borrador
  del IRPF cuadre. Medido: **hoy el borrador no se cuadra, se COPIA** (hilo Asecon IRPF 2025: «ingresos
  los que aparece en el borrador»). Retención implícita 14,75% → **15% de IRPF, modelo 190**.
- 🚨 **`apps/plataforma/lib/cima.ts` sobra:** SOAP nunca validado (404), parser adivinado y mapa de
  compañías con códigos numéricos cuando los reales son `C0109`/`C0468`/`C0058`/`C0613`. La BD de Manuel
  YA trae `cuenta_efectivo`/`liquidaciones`/`poliza_recibos` parseadas por el JAR de TIREA, con
  **comisión, retención y remesa separadas** (Allianz feb/26: 95,03 − 14,26 = 80,77 exacto).
- El PDF «Cuenta Agente» de Allianz es legible (**EBCDIC dentro del PDF, `cp500`**) y cuadra al céntimo
  con CIMA. Revela **558,88€ parados** por no haber dado la cuenta bancaria. Mapfre devenga 3.614,65€ en
  recibos cobrados y **cero liquidaciones**. Del banco, el **85% de 2026 sin identificar compañía**.
- Spec en `docs/superpowers/specs/2026-09-01-comisiones-renta-control-design.md` (**PR #1947**), con
  `agente-correduria`, `perfil-fiscal` y `apps/asegura/CLAUDE.md` actualizados: comisión tiene TRES
  estados (devengado→liquidado→cobrado) y la cobertura de CIMA es DESIGUAL por compañía. Pendiente:
  plan de implementación, y 5 gestiones con compañías (Allianz cuenta, Generali/Reale/Mapfre CIMA,
  Occident saldos) que **no se envían sin autorización**.

### 📖 (01/09/2026) EIAC: lo que llega NO es toda la cartera — leído de la norma, no inferido
- Alberto aportó el estándar oficial (TIREA `209_IAC_ESP_DOC` V07.1 v05, 03/06/2026 + XSD). El 4º
  campo del nombre de fichero es el **código de proceso**: los ordinarios (`131/132/133/151`,
  `211-261`, `311/361`) no traen histórico — **`132` «cartera» es solo lo que renueva en el periodo**.
- **La carga masiva es otra cosa y hay una por objeto: `199` pólizas · `299` recibos · `269`
  movimientos · `399` siniestros.** Medido: Mapfre mandó 199+299, Allianz 199 (26 → 26 en cartera,
  cuadra), **Occident y Reale ninguna**, y el **399 no lo ha mandado nadie** (de ahí los 67
  siniestros congelados).
- 🚨 **«Carga inicial» / «primera carga» NO existen en EIAC** — por eso las compañías le decían a
  Alberto que no se hace. El nombre correcto es **carga masiva, proceso 199/299/399**, y **se pide
  fuera del canal**: no hay proceso EIAC para solicitarla (el único `SO` es el `841`, solicitud de
  alta de siniestro — que además demuestra que declarar siniestros desde el CRM **sí** está previsto).
- Escrito en la skill `agente-correduria` (`references/sector.md`) y en `TRASPASO-CORREDURIA.md`.
  Mergeado también el **#1949** (vigía de la ingesta: 42 ficheros en cuarentena, 23 recibos por
  7.721,71€ de prima y 24 siniestros perdidos desde junio por el grupo Occident bajo un solo código).

### 🧭 (01/09/2026) asegura-portal: plan TDD de la Fase 1 (entrar + aportar póliza)

- **#1946**: plan de 12 tareas para `apps/asegura-portal` — módulo puro (niveles de acceso, procedencia
  en TRES estados, código de un solo uso), 6 tablas `portal_*`, sesión propia y bóveda con subida de póliza.

- **El canal de OTP es un PUERTO, no una llamada a WhatsApp**: la WABA de Grupo Asegura no existe todavía;
  en Fase 1 se enchufan email y consola y WhatsApp entra añadiendo un fichero.
- 🚨 **Lección de método:** las firmas de `aiComplete`, `openrouterVision` y `createMailTransporter` que
  parecían obvias eran las TRES falsas (`aiComplete` devuelve `string`; `openrouterVision` toma 5 args e
  `ImageInput` es `{data,mediaType}`; `createMailTransporter()` **no recibe credenciales**, las lee del
  entorno y devuelve `Transporter | null`). Comprobarlas contra `packages/*` antes de escribirlas.
- 🐛 **Bug del rotador de memoria, ARREGLADO en la misma sesión (#1952).** `rotar-memoria.mjs` archivaba
  por la ÚLTIMA fecha de la cabecera: mandaba a agosto la entrada `### 🔴 (01/09/2026) GH_PAT_TRIGGER …
  desde el 31/08` y, peor, a **octubre-2025** la de `### 💶 (15/08/2026) Reserva Luxury 22-25/10 …` (un
  rango de noches leído como fecha). Ahora manda la fecha ENTRE PARÉNTESIS. Guardián nuevo
  `test/regression-rotar-memoria.test.ts`, verificado que falla sin el fix. ⚠️ El flag es `--dry-run`:
  `--check` NO existe y ejecuta la rotación de verdad.
- **Cola de PRs vaciada a petición de Alberto:** 10 mergeados (#1946, #1914, #1928, #1913, #1921, #1865,
  #1879, #1947, #1952, #1927), revisando el diff de cada uno. La rotación mensual de la auditoría (#1927)
  se **rehízo** sobre `main` actual con el rotador ya corregido — 540 entradas a agosto, 23 vivas — y se
  retiró el `docs/memoria/2025-10.md` que había creado el bug.

- **Pendiente de Alberto:** elegir modo de ejecución del plan, y la infra (proyecto Vercel `asegura-portal`,
  rol `prisma_asegura_portal` SIN BYPASSRLS con contraseña, envs, WABA).

### 🗄️ (01/09/2026) asegura: estructura del volcado CREADA en `seguros` + el runbook mentía con las FKs
- Alberto: «la copia de la BD, mejor tener todo nosotros». Hecho el 50%: **estructura aplicada y
  verificada en central** (`seguros`): 42 enums, 52 tablas, 721 columnas, 265 índices, 67 constraints
  y 353 NOT NULL — **coincidencia EXACTA con el origen** en los cinco recuentos.
- 🚨 **`docs/TRASPASO-CORREDURIA.md` decía «cero claves foráneas». Hay 131.** Se destapó comparando
  constraints origen (198) vs destino (67). Y la conclusión que sacaba («no hay orden de carga que
  respetar») era al revés. Corregido en el doc. Las FKs van en fichero aparte y **se crean DESPUÉS de
  los datos**: no hay orden topológico posible (hay autorreferencias) y así sirven de verificación.
- DDL **generado desde los catálogos del origen**, no escrito a mano. Tres ficheros en
  `apps/asegura/prisma/sql/2026-09-01_seguros_volcado_{ddl,datos,fks}.sql`.
- Copia de datos: por **`dblink`** (ya instalado en central), server-side. `pg_dump` local es 16.13 y
  el origen 17.6 → se niega. **Bloqueado a falta de UNA cosa:** secreto `asegura_origen_url` en el
  Vault de Supabase de central (lo pone Alberto; nunca por chat). El script lo lee dentro del bloque.
- ⚠️ Sigue vigente: Manuel NO borra hasta verificar **descifrar Y buscar** sobre nuestra copia.

### 🛡️ (01/09/2026) asegura: dos specs (portal + agente de venta) y la cartera NO era lo que decíamos
- Brainstorming con Alberto → specs `2026-09-01-asegura-portal-clientes-empresas-design.md` y
  `2026-09-01-asegura-agente-venta-design.md`. PR #1941.
- 🚨 **Medido: la cartera viva son ~80 clientes / 109 pólizas, no 32.600/28.843.** El resto es volcado
  histórico (`import_ref` `intranet:` 26.117 con vto. 2013-2018 y `asegura_app:` 2.612, CERO con vto.
  futuro). Regla de Alberto: **CIMA (`import_ref IS NULL`) = cliente; el resto, lead** (32.520).
  **Cifra ya corregida** en `CLAUDE.md`, `apps/asegura/CLAUDE.md` y `docs/TRASPASO-CORREDURIA.md`.
- Portal: app nueva `apps/asegura-portal` (rol propio SIN BYPASSRLS) + `@central/module-seguros-portal`;
  schema `seguros`; WhatsApp con **WABA nueva** (`wa_opt_in`=0 en las 32.600). Eje: **«aporta tus seguros»**,
  que sirve a leads y clientes a la vez. El móvil identifica un **HOGAR** (740 números compartidos, 630 con
  el mismo apellido → familias): nunca se resuelve solo. El papel en la póliza PROPONE acceso, no lo concede.
- Agente: de **VENTA**, prepara fichas en frío sin contactar a nadie. Dos corpus con autoridad distinta —
  el contrato dice qué cubre, la **LCS/LDS** qué derechos hay (del texto consolidado del BOE, nunca de
  memoria del modelo). Sin fine-tuning. Techo real: solo **5.613** fichas son contactables.
- Regla que evita un desastre: **las pólizas del volcado histórico NO generan recordatorios** (serían
  28.729 avisos de «se te venció» sobre pólizas de 2013-2018). `recordatorios` del CRM origen no sirve:
  su `poliza_id` es NOT NULL.

### 🚗 (01/09/2026) Renovaciones: columna «Qué asegura» (matrícula, dirección, tipo de RC)
- Alberto, sobre la tabla de renovaciones de `/correduria`: «necesito otra columna con datos — auto
  matrícula marca modelo, hogar dirección, RC de qué tipo… y siempre informa al agente».
- Helper puro nuevo **`@central/module-seguros/objeto`** (`objetoAsegurado`, 17 tests) con **cuatro**
  salidas: `conocido` · `no_informado` (la compañía no lo manda) · `cifrado` (la dirección de hogar
  viene `v1:…`, AES-256-GCM; la clave sigue en el Vercel de Manuel) · `sin_objeto` (vida/salud/decesos
  son seguros de PERSONAS: ausencia definitiva, no «pendiente»). Ninguno se pinta como hueco vacío.
- Medido en la cartera real: `matricula`/`marca`/`modelo` en claro; **`datos_especificos.vehiculo` NO
  es una descripción, contiene la matrícula**; una RC se identifica por sus modalidades
  (`poliza_coberturas`), no por `datos_especificos`. Las 16 pólizas de la ventana salen `conocido`.
- Cableado de punta a punta: `apps/asegura/lib/cartera.ts` (+ intento de descifrado) → puerto
  `/api/operador/vencimientos` → `interpretarObjeto` en plataforma (campo opcional: una versión vieja
  del puerto da `null` = «aún no llega», distinto de «no informado») → columna en `/correduria` y línea
  del Telegram de renovaciones. Skill `agente-correduria` actualizada (SKILL §2 + sector §5).

- **#1938 MERGEADO** (`1ba3c254`, 12 requeridos verdes). El CI volvió a no arrancar en draft: ni abrir
  el PR ni des-draftearlo dispararon nada; lo desatascó **mergear `main` en la rama** (paso 2 del orden
  de `CLAUDE.md`), 5ª medición de esa sección — anotada ahí con la secuencia completa. 🔀 Y el PR de
  seguimiento #1940, abierto IGUAL (MCP, draft, misma identidad), **sí disparó al instante**: el draft
  no es la causa. Sigue sin explicación; lo accionable es el orden, no el diagnóstico.

### 📅 (01/09/2026) mercado-booking: objetivo jul/ago-2027 cumplido — falta quitar la prioridad del prompt
- Pasada acotada (`?desde=2027-07-01&hasta=2027-08-31&max=24`) de la skill `mercado-booking`: 238 comps
  reales en 24 ventanas (3 fechas × 4 pisos por mes) + 4/4 escaparate propio. **El objetivo (≥3
  comparables en ≥3 fechas/piso en jul y ago 2027) ya estaba cumplido desde ayer (31/08)** — esta
  pasada repitió trabajo porque el párrafo "PRIORIDAD TEMPORAL" seguía en el prompt de la rutina.

- **Pendiente para Alberto:** borrar ese párrafo del prompt programado de `mercado-booking` (esta
  sesión no tiene acceso al store del trigger para editarlo ella misma). Detalle en
  `docs/AGENTES-BITACORA.md` (entrada 01/09/2026).

### 🔔 (01/09/2026) Panel «Avisos Telegram» (`/telegram`): catálogo + interruptor por aviso
- Alberto: «las notificaciones de Telegram son muchas… un panel que las resuma y que pueda activarlas
  o desactivarlas». Hecho en `apps/plataforma`: **76 avisos PROACTIVOS catalogados** (`lib/telegram/catalogo.ts`),
  interruptor por aviso y por categoría, y contadores REALES de lo que llega (bitácora, 30 días).
- Los ~57 emisores pasan ahora por `tgAviso`/`tgAvisoBotones`/`tgAvisoAlerta` (`lib/telegram/avisos.ts`).
  **Fail-open**: si la BD no responde, el aviso SALE — un fallo de red no puede volverse silencio.
- Guardián `lib/telegram/catalogo.test.ts`: falla si un id emitido no está catalogado (aviso que no se
  puede callar) o si uno catalogado no lo emite nadie (interruptor que no hace nada). Ni tsc ni build lo cazan.
- Fuera del catálogo a propósito: las RESPUESTAS del bot a un mensaje/botón de Alberto (contable,
  borradores de huéspedes, clasificar movimiento). Silenciarlas rompería la conversación, no quitaría ruido.
- El triaje de correo tiene un interruptor **por categoría** (`avisoDeCategoriaCorreo`). Ya silenciado
  `correo.huespedes` a petición suya (📬 Huésped de Smoobu «Nueva reserva»); los borradores del agente siguen.
- La bitácora nace vacía: el panel dice «aún no se ha medido», nunca «0 avisos». Migración
  `2026-09-01_telegram_avisos.sql` **aplicada**. Purga a 90 días desde el cron `agentes-latido`.

- **#1924 MERGEADO** (`ff136ac0`, 12 requeridos verdes). El CI cazó un `make_interval(days => ${n})`
  sin `::int` (Prisma manda int8 → 42883 SOLO en runtime): guardián `regression-sql-fecha-parametro`.
  ⚠️ Ese guardián enumera con `git ls-files`, así que **no ve ficheros sin `git add`** — la suite
  local daba verde con el bug delante. Haz `git add` antes de dar por buena una suite con archivos nuevos.
- Documentado en `apps/plataforma/CLAUDE.md` (§Panel Avisos Telegram), skills `plataforma-maestro`
  (punto 12) y `correo-triaje`, y `docs/FUENTES-DE-VERDAD.md`.

### 🩺 (01/09/2026) Siniestros de CIMA: la avería tiene fecha de corte — 8 de julio
- Re-verificada la cuarentena contra la BD: el último fichero `SIN` que pasó a `confirmed` fue el **08/07**
  y el último siniestro persistido, el **02/07**. Desde el 19/07, **7 ficheros de siniestros seguidos, los 7
  en `review`**. 21 de 38 `SIN` (55%) en cuarentena; los recibos sí siguen entrando a ratos (último, 24/08).
  Encaja con el reconciliador parado el 25/06. Causa raíz y arreglo ya estaban en `TRASPASO-CORREDURIA.md`.
- Matiz de la cartera viva: de las ~109 pólizas de CIMA, **68 en estado `activa` y solo 50 con vencimiento
  futuro**; ninguna del volcado histórico lo tiene. ⚠️ `estado='activa'` NO es «en vigor»: de las 1.235 así
  marcadas, 846 no tienen fecha de vencimiento y 339 la tienen pasada.
- Frecuencia CIMA: el cron llama 2×/día pero en 21 días solo entró fichero **10 días (13 en total)**. Con
  esta cartera, **una pasada diaria sobra**; el problema nunca fue la frecuencia.

### 🔴 (01/09/2026) `GH_PAT_TRIGGER` caducado: la radiografía del repo lleva desde el 31/08 sin actualizarse
- El workflow «Auditoría de estructura» falla en TODOS los pushes a `main` desde el 31/08 ~13:25 UTC:
  `gh` responde `HTTP 401: Bad credentials`. El `git push` sí cuela —`actions/checkout` deja un
  `http.extraheader` con el GITHUB_TOKEN que pisa el PAT de la URL—, así que **la rama se sube y el PR
  nunca se abre**: el fallo es mudo salvo por el correo de Actions.
- Efectos medidos: `estructura.generated.json` congelado en `6a4d53c4d` (#1887, 31/08 08:43) y **123 ramas
  `claude/auditoria-radiografia-*` huérfanas** en el remoto (el `gh pr close --delete-branch` tampoco corre).
- 🔴 **Para Alberto: renovar el secret `GH_PAT_TRIGGER`** — un agente no puede. Mientras tanto la radiografía
  se regenera a mano (va en este PR) y las ramas huérfanas siguen ahí, pendientes de barrido.

### 🔌 (01/09/2026) Fly.io: el adapter CIMA se transfirió… y Manuel lo devolvió a su organización
- 08:16 UTC `fly apps move asegura-app-cima-adapter --org grupo-asegura` → OK (48 s). 08:32 UTC Manuel lo
  devolvió a `manuel-suarez-678` (119 s): aceptar la invitación de miembro le bastó para sacarlo. `grupo-asegura`
  quedó vacía. **No es un problema técnico, es una conversación con Manuel** — no se vuelve a mover sin su OK.
- La app no se cayó (`/health` 200 tras ambos moves) y **los ficheros no se pierden en `/tmp`**: los logs de Fly
  cuadran al minuto con `cima_ficheros` (27/08 08:15, 28/08 15:32, 30/08 11:34).
- ❌ Corrección: el fichero CIMA **no** entra «a diario entre 11:35 y 11:42 UTC» (se afirmó y era falso). El horario
  es irregular y el 01/09 (00:00–08:35 UTC) no entró ninguna tanda. Pendiente real: traer el disparador a
  `CRON_JOBS` de plataforma —hoy lo llama infra de Manuel—, que quita la dependencia sin mover infraestructura.

### ✅ (01/09/2026) V4 Flash CONFIRMADO en producción con tráfico real — serie cerrada al 100%
- Sonda diaria 07:00:48 UTC: `plataforma·sonda·openrouter·deepseek/deepseek-v4-flash·ok` →
  no hay override `OPENROUTER_MODEL` en Vercel; el default nuevo sirve en producción.
- Además tráfico de negocio real: `extraer-factura` procesó facturas con el V4 Flash a las
  06:34-06:35, y el Director escala por tarea con normalidad (gemini-flash / gpt-5.6-luna /
  sonnet-4.5). Cabo único de la verificación del 31/08: CERRADO. Nada pendiente de la serie.

### 💶 (01/09/2026) Pasada mensual `fiscal-novedades`: sin cambios en deducciones, 1 aviso a cliente
- Deducciones IRPF (mínimos, maternidad, FN estatal/andaluza) contrastadas contra BOE/BOJA/AEAT: **sin
  cambios**, PGE 2027 aún sin publicar. Radar de ayudas: ayuda Junta Andalucía 600€/hijo<3 tras 3er hijo
  detectada y descartada (renta de Alberto muy por encima del tope 6× IPREM). 1ª pasada por cliente:
  Joaquín Jaén avisado por Telegram del plan de choque hostelería (RD 638/2026, hasta 11.000€, plazo
  30/09/2026, **CNAE sin confirmar** — pendiente de que Alberto/Joaquín lo verifiquen); Sique Brilla sin
  novedad. Detalle en `docs/FISCAL-AYUDAS.md` y `docs/AGENTES-BITACORA.md`.

### 🛡️ (01/09/2026) Nace el agente de la correduría (`agente-correduria`) — decisión de Alberto
- Alberto quiere un agente que lleve Grupo ASegura «casi al 100%» y responda a clientes. Se montó por
  fases: **Fase 0** (aprender sector + informar, activa ya) → emisión Avant2 → cliente-facing (esta
  última SOLO con diseño de canal + OK explícito). Skill `agente-correduria` (router + `references/sector.md`
  acumulativo) + rutina semanal martes 05:30 UTC (§21 de `RUTINAS-PROGRAMADAS.md`).
- 🔴 Pendiente de Alberto: añadir `ALERTA_TOKEN` al prompt de la rutina en la UI (sin él, informe solo en bitácora).
- Decisión previa de la sesión: credenciales Codeoscopic se piden a **Manuel** (env vars de su Vercel),
  NO a Codeoscopic; el borrador de Gmail a Juan Fernández queda muerto sin enviar. #1918 mergeado.

- **Vencimientos ya funcionando** (mismo PR #1919): `@central/module-seguros/vencimientos` (puro, LCS
  art. 22: <1 mes = se prorroga sí o sí) + puerto `/api/operador/vencimientos` en asegura + tabla en
  plataforma `/correduria`. Real: **5 vencen en 30 días, 7 en 60, 13 en 90** (3.899,05€ de prima
  conocida, 4 sin informar). ⚠️ Contar por fecha SIN filtrar estado colaba canceladas (daba 6/8).
- Cartera viva = **59 pólizas `situacion='EV'`** (37 auto/13 hogar/8 RC/1 moto); el resto es histórico.
  Ingesta CIMA = cron diario ~11:40 UTC **fuera de nuestro alcance**: en ese Supabase NO hay pg_cron ni
  Edge Functions, así que todo lo alimenta el Vercel de Manuel — y ese Vercel **no se ve desde aquí**
  (el conector solo alcanza el team «Pisos turisticos», donde ni `asegura` ni `central-asegura` están).
- 💡 **Idea de Alberto guardada: «Agente IA Defensa cartera»** (`references/defensa-cartera.md`
  + su diagrama). Recibo de PRECARTERA → agente nocturno → retarificar → comparar nueva producción
  vs cartera → pantalla de desviación de recibos → respuesta al cliente. NO implementado; depende
  de (a) saber qué estado de `poliza_recibos` es la precartera, (b) la API de Avant2 —y **cada
  cotización cuesta 0,50€**, así que necesita presupuesto—, y (c) Fase 3 para lo del cliente.
- 🚨 **Método — cómo NO verificar un deploy de Vercel (01/09/2026, me costó 3 falsos negativos):** se
  dio por hecho que plataforma «no había desplegado» porque el identificador `dpl_…` incrustado en el
  HTML de `/login` no cambiaba. **`/login` es una página PRERENDERIZADA (ISR)**: su HTML lo sirve el CDN
  y ese `dpl_` puede seguir siendo el del build anterior con el deployment nuevo ya en producción (el
  panel mostraba los dos commits en **Production · Ready**). La comprobación que SÍ vale desde aquí:
  pedir una **ruta de API nueva** y ver si responde **401/200 en vez de 404** — eso prueba que el código
  está sirviendo (`/api/cron/correduria-renovaciones` → 401). Y el conector de Vercel **no puede leer
  deployments (403) ni env vars (no existe la herramienta)**: para eso hace falta el panel.

- **Migrar la cartera al schema `seguros`: NO todavía** — copiar 32.600 filas es trivial, pero sin mover
  la ingesta EIAC/CIMA la copia envejece al día siguiente y quedan dos carteras. Orden: vencimientos ya
  (hecho) → pedir a Manuel cómo se alimenta → migrar + repuntar ingesta. Al mover, ojo: las 86 RLS por
  `auth.uid()` no viajan (nuestros roles llevan BYPASSRLS) → el aislamiento pasa a ser del código.

### 🧾 (01/09/2026) Codeoscopic = LA fuente de tarificación y EMISIÓN de pólizas nuevas (dictado por Alberto)
- La web «ASegura» es de ALBERTO (Manuel la desarrolló); EIAC no le preocupa. Codeoscopic es el motor
  de venta: sin él la plataforma no tarifica ni emite.
- Del Gmail de Alberto (verificado): cuenta **Avant2 Sales Manager** propia y operativa desde 09/06
  (alta «SOLO ASM», formación hecha); compañías vivas: Reale (26/05, multirramo) y Fidelidade (hogar,
  14/07); claves entregadas de Mapfre/Allianz(PA342521)/Occident(M00171). Contrato Workspace 20/05 y
  DPA art. 28 remitido el 25/05 (el «contrato de encargado» de la lista ya existe con Codeoscopic).
- La integración API de la web quedó EN SANDBOX (03/06: Quote→preemisión→Submit→webhook Basic Auth sin
  cerrar; correo de manuel@loor.es a juan.fernandez@codeoscopic.com) → por eso el flag de emisión sigue
  apagado. **Borrador creado en Gmail** (no enviado) a Juan Fernández: renovar sandbox + pendientes +
  prueba de idempotencia del attempt_id. Pendiente: quién es manuel@loor.es; inventario BD cuando
  reconecte el conector Supabase_asegura.
- ⚠️ Higiene: en mayo viajaron por email claves de portales de compañías en texto plano (Mapfre,
  Occident) — rotarlas con calma.

### ✅ (01/09/2026) CARTERA EN VIVO FUNCIONANDO — rotación hecha; cron `postgres` de Manuel roto desde el reset
- Números reales en plataforma→Correduría: 50 en vigor · 995 sin fecha · 27.793 históricas · 2.742
  clientes · 29.858 leads · 7 siniestros (el 1.194 de la víspera era lectura vieja: la BD ingesta a diario).
- Contraseña de `central_asegura` ROTADA (04:39, del gestor de Alberto); snippet con clave en claro
  borrado; env recreada en Vercel; pooler registra `Connection authenticated`. Exposición de la clave
  débil (20:51→04:39): cero autenticaciones del rol en lo auditable — matiz: `log_connections` OFF,
  solo audita el pooler.
- 🚨 Un job con `postgres.js` (IPs Vercel fra1) falla como `postgres` cada ~5 min desde 31/08 ~08:00
  (antes autenticaba): es del CRM de Manuel — nada nuestro usa esa BD salvo apps/asegura (verificado
  por código). Probable daño colateral del reset de la database password durante el montaje. NO tocar
  su Vercel; avisar a Manuel (borrador, regla de comunicaciones).
- `central-asegura` servía desde us-east-1 contra BD eu-central-1 → `regions: ["fra1"]` en su vercel.json.

### 🔑 (01/09/2026) La cartera en vivo: era la CONTRASEÑA — y un valor del chat acabó de contraseña
- Logs del pooler (MCP Supabase_asegura, nuevo conector): `password authentication failed for user
  "central_asegura"` → el fallo era la contraseña del `ASEGURA_DATABASE_URL` pegado en Vercel
  (host/usuario correctos; el blindaje pgbouncer de #1905 quedó descartado como causa).
- 🚨 Incidente: al guiar el arreglo por Claude Chrome, la HUELLA de verificación (md5 del verificador
  SCRAM) publicada en el chat se usó como contraseña del rol. Lección: **jamás publicar un valor con
  pinta de credencial sin marcarlo como NO-USAR**; los secretos los genera el gestor de Alberto y no
  pasan por ningún chat. Exposición revisada en logs: solo fallos de auth, ninguna huella de acceso
  (matiz: log_connections apagado). Rotación en curso con marcador `<<CLAVE>>` que rellena Alberto.
- Aparte: algo con `postgres.js` desde `63.180.181.94` intenta entrar como `postgres` cada 5 min y
  falla — no es nuestro (nosotros: Prisma + central_asegura). Preguntar a Manuel en el traspaso.
- Además: 🛡️ Correduría entra por fin en el menú de plataforma (PR #1907, guardián incluido) —
  «no me sale correduría»: /correduria nunca estuvo en NAV_NEGOCIO.
