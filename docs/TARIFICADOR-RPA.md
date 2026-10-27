# Tarificador RPA — guía viva (06/10/2026)

> Estado, decisiones y plan del bot de cotización de Grupo ASegura. Sin secretos: solo nombres de variable.
> Técnica del worker: `services/tarificador-rpa/README.md` · alta/puesta en marcha: `docs/TARIFICADOR-RPA-PUESTA-EN-MARCHA.md`
> · plan de ramos con la API: `docs/CODEOSCOPIC-PLAN-RAMOS-2026-09.md`. Hitos: #4310, #4327, #4370, #4375, #4383, #4387 y `9d1f1ba38`→`226968775` (oportunidades, fichas, grabador).

## Arquitectura
Plataforma (**Oportunidades**) → asegura (cola `seguros.tarificacion_trabajos`, orquestador `apps/asegura/lib/tarificador*.ts`) → **worker Playwright** en Fly `asegura-tarificador` (una máquina efímera por trabajo). Imagen vigente `registry.fly.io/asegura-tarificador:v20261005`, construida por el workflow `tarificador-rpa-imagen.yml` (se lanza A MANO con input `etiqueta`). Módulo puro: `packages/module-tarificacion`. Servicio fuera del workspace pnpm.

## Flujo de usuario
Todo desde `/correduria/oportunidad/[id]`, sección **Presupuestos de compañías**: un formulario canónico de riesgo común a todas las compañías + registro de capacidades `packages/module-tarificacion/src/capacidades.ts` (cada bot declara ramo, extras de su portal, validación y mapeo). **Añadir un bot = registrar su adaptador/capacidad**; el formulario no cambia. El botón antiguo de la ficha de cliente sigue (#4327).

## Hechos del DOM — Allianz ePAC Comunidades
- Formulario en `iframe#appArea`; nueva póliza `#link_new_policy`; **Calcular = `div#calcular`**, **Aceptar = `div#aceptar`** (no son `<button>`, #4370). Edificación: capital obligatorio.
- Población: lupa del CP `img#codigoPostalAjaxLocFinderImg`.
- **«Nueva Alta»** (Venta → Nueva Alta, `#link_new_policy`): modal con ACORDEONES plegados (Autos · Particulares · Empresas · Vida y Salud); se pulsa la sección para desplegarla. Dentro, rejilla de tiles (icono + texto). Particulares (captura de Alberto, 13/10/2026): «Allianz HOGAR», «Allianz Negocio Plus», «Decesos Prima periódica», «Allianz Accidentes Plus», «Decesos Prima única», «Comunidades», «RC Cazador/Pescador», «Embarcaciones», «Allianz Mascotas».
- El tile se elige por etiqueta EXACTA (`etiquetaProducto` en `allianz/entrada.ts`: sin mayúsculas, tolerante al espacio entre palabras, nunca «contiene»). Hogar = «Allianz HOGAR», no «Hogar» (causa del timeout de la 1.ª exploración del 13/10).
- Resultado: tabla `#tablaTarificacion` con tabla ANIDADA. **Columna «Anual» = PRIMER RECIBO prorrateado** (ePAC fija el vencimiento al día 1); **«Sucesivos» = prima anual real**. La UI muestra la anual y aparte el primer recibo (#4383).
- Término real: `#fechaTermino` / `#fechaTerminoTarificar`.
- Proyecto (PDF): `td#MENU` → «Proyecto». **«Proyecto Ampliado» (`td#EMISION_PROJ`) es GUARDAR (Alberto, 14/10/2026): solo en resultado con importes y `efectoEsperado: guardar_presupuesto`, y solo con id EXACTO `EMISION_PROJ` + texto exacto (`EXCEPCION_PROYECTO_AMPLIADO`, acciones-portal.ts); cualquier otro id con «emisi» o «…y emitir» sigue bloqueado.**
- Precio verificado contra el manual (06/10/2026): **347,55 € anual / 342,77 € primer recibo.**

## Seguridad (TARIFICAR ≠ EMITIR)
- Guardián `test/regression-tarificador-rpa.test.ts`: lista blanca; nunca Emitir/Contratar/Formalizar/Grabar/Archivar ni Aceptar fuera de Tarificar; pulsar solo con `ctx.pulsar()`; sin `.click()` directo.
- Credenciales (`CRED_<CLAVE>_USER/_PASS`) solo como fly secrets: nunca en código, logs, BD ni IA (se redactan). El worker no lleva `DATABASE_URL` ni `CODEOSCOPIC_*`.
- CAPTCHA → `requiere_humano`, nunca se evita. **Un cepo se ve en rojo antes de darlo por bueno.**

## IA formador (`src/formador.ts`)
Fallback cuando `campoPorEtiqueta`/Calcular no resuelven (lista cerrada de acciones + `pareceEmision`); **modo acompañado** (hasta 10 cotizaciones) con contraste por etiqueta; registro inmutable `tarificador_intervenciones`. Tope de llamadas por trabajo: `TARIFICADOR_FORMADOR_MAX_LLAMADAS` (12).

## Regla: todo bot con IA detrás y aprendizaje (Alberto, 14/10/2026)
- **Para TODOS los bots** (Allianz, Mapfre, Occident y los que vengan). Capa común: `services/tarificador-rpa/src/formador.ts`
  (`conRespaldoIA` para acciones, `campoConRespaldo` para campos). Orden: **selector fijo → aprendido** (`tarificador_conocimiento`,
  por compañía/ramo) **→ IA** (asegura `/api/tarificador/formador/sugerir`, pasarela/OpenRouter, `privado`). Lo que funciona se
  **confirma** y queda aprendido. La IA solo devuelve el índice de un candidato; el worker lo **valida** (tablas cerradas
  `ACCIONES_PERMITIDAS` + enlace de entrada de `guard.ts`, `pareceEmision`, `BLOQUEO_FORMADOR`, campo editable con etiqueta
  contrastada) y lo pulsa por el MISMO guard que el fijo. Lo aprendido pasa la misma validación: nunca abre una acción nueva.
- **Sin PII ni credenciales al modelo**: estructura sin `value`, textos por el redactor y `redactarDatosPersonales` en asegura.
- **Plan B (nunca colgado)**: por trabajo ≤10 consultas y ≤150 s de IA en el worker (`PRESUPUESTO_RESPALDO`), ≤12 llamadas y ≤0,50 € en
  asegura (`TARIFICADOR_FORMADOR_MAX_LLAMADAS`/`_MAX_EUR`), tope del intento del runner; si nada resuelve → el error ORIGINAL
  (`ErrorMapaIncompleto` + inventario de todos los marcos + captura + HTML). Sin reintentos (un hueco de mapa no es transitorio).
- **Encendido**: `TARIFICADOR_FORMADOR_ACTIVO=1` en `central-asegura`; modelo potente `TARIFICADOR_FORMADOR_MODELO` (por defecto
  `anthropic/claude-sonnet-4.5`). Guardián: `services/tarificador-rpa/test/regla-respaldo-ia.test.ts` (todo adaptador registrado
  usa la capa o está en `PENDIENTES_RESPALDO_IA` con motivo; hoy: Allianz Moto).

## Plan de robustez (fases)
- **F1 (este PR)**: fijo → aprendido → IA en la capa común; Mapfre Auto (entrada + campos) y Allianz Comunidades (campos +
  «Calcular») la usan. **IA escalonada**: 1º modelo por defecto (barato), 2º el potente solo si el 1º no señala nada; tope de € por
  trabajo. Aprendido: se usa al momento y suma confirmaciones.
- **F2**: aprendido con confianza (se consolida tras 3 éxitos o confirmación de Alberto, se descarta tras 2 fallos: necesita
  columna de fallos en `tarificador_conocimiento`); **corte por compañía/ramo tras 3 fallos seguidos** con aviso Telegram; estado
  «atascado» + Telegram y pantalla «Bots atascados» con captura y elementos numerados: Alberto elige/escribe, queda aprendido y se
  reanuda re-ejecutando el camino aprendido (checkpoint, sin máquina esperando). Allianz Moto a la capa común. Respaldo para
  «Continuar» de Mapfre y los `mat-select` (hoy en guard.ts / sin DOM: necesitan su propia puerta).
- **F2 hecha (14/10/2026, sin desplegar)** — reglas puras `packages/module-tarificacion/src/robustez.ts`, BD
  `apps/asegura/lib/tarificador-robustez.ts`, SQL `apps/asegura/prisma/sql/2026-10-14e_tarificador_robustez_f2.sql` (aplicar ANTES):
  · **Aprendido con confianza**: `fallos` seguidos + `consolidado_at` + `descartado_at` en `tarificador_conocimiento`. Consolida a los
    3 éxitos (o al momento si es `humano`), se descarta a los 2 fallos seguidos (no resolvió/no validó, o usado y el trabajo cayó sin
    confirmarlo: el worker lo manda en `aprendidoFallido` del cierre). Lo descartado no se sirve; un éxito lo rehabilita.
  · **Corte por compañía/ramo** (`tarificador_pausas`): 3 trabajos seguidos en `error_definitivo` por portal/infra (desde la última
    reanudación) → pausa: ni se encola (409 `bot_pausado`) ni se reclama. Telegram `correduria.tarificador-pausa` con «▶️ Reanudar»
    (`tpa_r`) y botón en /correduria/tarificador. `companias_integracion` no se toca.
  · **Atasco** (estado `atascado`, `tarificador_atascos`): si fijo + aprendido + IA no resuelven un paso de `conRespaldoIA` /
    `campoConRespaldo`, el worker manda en `error.atasco` los candidatos ELEGIBLES (acción: solo texto de su fila de
    `ACCIONES_PERMITIDAS`; campo: solo editable sin casillas; nunca palabras de emisión/pago), redactados y numerados (≤20). asegura
    (con `TARIFICADOR_ATASCO_ACTIVO=1`, ≤3 rondas por trabajo) deja el trabajo `atascado` SIN purgar el riesgo; Telegram
    `correduria.tarificador-atasco` con la captura (si el worker la hizo) + botones numerados (`atq_e`/`atq_x`, solo
    `from.id = TELEGRAM_CHAT_ID`), y pantalla «Bots atascados» en /correduria/tarificador. Elegir = se aprende como `humano`
    (consolidado) y el MISMO trabajo vuelve a `pendiente` (intentos 0): el worker repite el camino y lo aprendido lo resuelve por la
    MISMA validación (en un campo humano solo se relaja el contraste de etiqueta; una acción, nunca). Sin respuesta en
    `TARIFICADOR_ATASCO_HORAS` (24) → `error_definitivo` en el barrido. Descartar = `cancelado`.
  · **Pieza 4 hecha (14/10/2026, sin desplegar)** — helpers COMUNES para todos los bots: `src/continuar.ts` (`pulsarContinuarSeguro`:
    botón de texto ENTERO «Continuar»/«Siguiente» → aprendido → IA, SIEMPRE por `ctx.pulsar` = guard, fuera de diálogos, espera el
    cambio de pantalla y si no llega error tipado; nueva fila `continuar` en `ACCIONES_PERMITIDAS`) y `src/mat-select.ts`
    (`elegirOpcionMatSelect`: abre el panel, lee `mat-option`/`role=option` del overlay, coincidencia normalizada → IA con la lista
    de opciones (`sugerirOpcion`, solo un índice) → `ErrorOpcionSinResolver` que pide inventario). Runner: `ctx.continuar` y
    `ctx.elegirMatSelect`; Mapfre: `continuarMapfre` con respaldo y mapeo explícito `MAPEO_MAPFRE_AUTO` (textos candidatos).
    **Abierto**: `FormularioAuto` aún no trae uso/ámbito/clase de permiso/compañía anterior (siguen pendientes → paran en el paso 2
    con inventario hasta ampliar validador + plataforma), el interruptor «¿compañía anterior?» y «Generar
    Proyecto»; el atasco F2 de un mat-select sin resolver no es elegible por Telegram (las opciones no tienen selector).
  · **Tomador de Mapfre auto: SIN LUPA (14/10/2026, 0.7.0)** — regla (Alberto, operador real del portal): «sin lupa; autobúsqueda al
    teclear NIF; si no existe se crea en el propio formulario». Se retiró la acción `buscar_tomador` (y `pulsarBuscarTomadorMapfre`,
    `esControlBuscarTomador`, `ctx.buscarTomadorMapfre`): el bot teclea el NIF, sale del campo (`blur`) y espera la reacción de Mapfre
    (`esperarReaccionTomador`, ≤8 s, solo lectura). EXISTE (algún campo Nombre/Apellido/Fecha de Nacimiento autorrellenado y quieto) →
    no se teclea ni sobrescribe nada (razón social de empresa incluida). NO EXISTE (campos presentes y vacíos CON el aviso «NO EXISTE
    NINGUN REGISTRO PARA ESA CONDICION DE BUSQUEDA»; agotada la espera sin aviso ni autorrelleno → `indeterminado` → atasco) → es lo
    NORMAL para un lead: se rellenan SOLO los campos vacíos del alta con `FormularioAuto.tomador` o `datosTomador` (de la ficha, por asegura)
    (`input[name=nombre|primerApellido|segundoApellido|fechaNacimiento]`, fecha dd/mm/aaaa; jurídica: razón social) por la capa común
    (fijo → aprendido → IA → atasco) y se comprueba que no queda ningún `mat-error` «Campo obligatorio» (si queda: hueco con inventario).
    No hay botón de alta en el DOM real. Sin nombre/apellido/nacimiento en la ficha → asegura no encola (422 `falta_datos_tomador`; si
    llegara al worker, `datos`); diálogo de selección, indeterminado, autorrelleno tardío, fecha alterada por la máscara o «Campo
    obligatorio» pendiente → `registrarAtasco` (Telegram) + `ErrorMapaIncompleto` con inventario. Guardián: `test/regression-tarificador-rpa.test.ts` (ni rastro de la lupa
    ni de un clic en auto.ts). Guardián `stubsDeHueco` (regla-respaldo-ia.test.ts): ningún adaptador con una función que solo lanza `ErrorMapa…`.
  · **Pendiente de la F2**: Allianz Moto a la capa común; diálogo de selección de tomador de Mapfre (si aparece en real).
- **F3**: canario diario 07:00 por bot hasta antes de calcular (datos de prueba, sin generar proyecto) con huella de las pantallas
  clave y aviso si cambian; panel de salud (éxito, % IA, % humano, coste IA).
- **Futuro**: las mismas capas para otras tareas (siniestros…) con su lista blanca por tarea.

## Robustez
Reintento único y solo transitorio (infraestructura); sesión en memoria con TTL 10 min (hoy NO ahorra logins: cada máquina hace 1 trabajo); pausas de ritmo humano; `VARIANTES` vacía (sin variantes de modalidad por ahora).

## Renovaciones, detector y paneles
- **Renovaciones:** cron asegura `/api/cron/tarificador-renovaciones`; `TARIFICADOR_RENOVACIONES_ACTIVO=1`, `MAX_DIA=3`.
- **Cola (13/10/2026):** barrido propio cada 5 min (`/api/cron/tarificador-cola`, apagado con `TARIFICADOR_RPA_ACTIVO`) + lanzamiento al encolar. Un `en_curso` con lease vencido no ocupa hueco: `reclamarSiguiente` lo pasa a fallo de infra (y destruye su máquina). Encolar el mismo cliente+compañía+ramo+riesgo con un trabajo vivo devuelve ESE con `duplicado: true` (cerrojo consultivo por clave).
- **Detector de tarifa** (cambio de tarifa del portal) y panel `/correduria/tarificador`.
- **Grabador** `/correduria/tarificador/grabaciones`: bookmarklet, redacción de datos, mapa IA → da de alta compañías/ramos sin escribir adaptador a mano. Tope `TARIFICADOR_GRABADOR_MAX_LLAMADAS` (60).
- **Fichas** `/correduria/tarificador/fichas`: catálogo de garantías, validador anti-alucinación, validación humana, «Extraer coberturas» del PDF y `compararOfertas` (comparador determinista).
- **Aviso de infraseguro** (1.100 / 1.400 / 1.800 €/m²): cifras **PENDIENTES de validar por Alberto**.

- **Grabador v2**: tapa la pantalla de login, los datos de personas/mediador y los tokens de sesión; avisa con enlace si el formulario está en un marco de otro origen (Occident: `catalanaaplicaciones.gco.global`).
- **Análisis de grabaciones**: categoría IA `contexto` (gemini-2.5-flash, ~5 s, ~0,006 €/pantalla grande); la pasarela ya respeta `timeoutMs` (tope 55 s).
- **Allianz ePAC, entrada común**: «Venta → Nueva Alta» abre un popup compartido por todos los productos (Particulares: HOGAR, Negocio Plus = Comercio, Comunidades…; Empresas: RC PYME) → paso de entrada compartido entre bots de Allianz.
- **RC PYME**: pantalla de resultado mapeada (primas en `#tableTarifaAnual_{0,1,2}_0`). PROHIBIDOS: Aceptar `#btnAccept`→emision_ipid, Datos emisión, Pago fraccionado (Archivar y Proyecto ampliado: solo guardar presupuesto en resultado, ver arriba). Seguros: Datos básicos, Proyecto, IPID, Retarificar. Faltan por mapear Datos básicos y Proyecto.
- **Generali** pide SMS → reutilizar sesión + aviso Telegram.
  - **Relevo del código por Telegram (19/10/2026, decisión de Alberto; sustituye a «el robot nunca reenvía SMS»):** pantalla Okta `access.generali.es/signin/verify/okta/sms` → el worker abre petición en asegura (`POST /api/tarificador/codigo-sms`, alarga el lease) con una pública X25519 generada en memoria → «Enviar» (guard, lista blanca exacta) → cron de plataforma cada minuto manda `correduria.tarificador-codigo-sms` (force_reply) → Alberto responde (al aviso, `/sms 123456` o el número solo) → webhook (antes de cualquier otro flujo, solo `TELEGRAM_CHAT_ID`) → asegura SELLA el código para la pública (nunca en claro, un uso, 10 min) → el worker lo recoge (sondeo 4 s, tope 5 min), marca «No volver a solicitar en este dispositivo en 30 días», «Verificar», guarda el estado en la bóveda (30 días, `CADUCIDAD_DISPOSITIVO_MS`; asegura admite 30 d + 1 h solo para generali) y repite el intento. Sin código → `requiere_humano` con motivo claro. Código: `src/relevo-sms.ts`, `guard.ts` (Okta), `lib/tarificador-codigo-sms*.ts`. ⏳ SQL `2026-10-19_tarificador_codigos_sms.sql` + `2026-10-07e_tarificador_sesiones.sql` y fly secret `TARIFICADOR_SESION_KEY` (sin él se releva pero no se recuerda).
  - Hecho en el worker (07/10): `src/boveda-sesion.ts` + `src/sesion-manual.ts`; adaptador con `sesion: 'manual'` = sin CRED_*, el robot NUNCA hace login; reutiliza el storageState que inició Alberto, sellado AES-256-GCM (fly secret `TARIFICADOR_SESION_KEY`; asegura guarda el blob opaco), caducidad máx. `TARIFICADOR_SESION_MAX_HORAS` (8 h, techo 24). Sin sesión/caducada/rechazada → se borra y `requiere_humano` + Telegram.
  - Hecho en asegura (07/10): `GET|PUT|DELETE /api/tarificador/sesion/[compania]` (Bearer del worker, lista blanca de slugs de `TELEFONOS_COMPANIAS`, token ≤1 MB, caduca ≤25 h, GET 404+borra la caducada, DELETE idempotente, 503 `sesion_sin_activar`) + tabla `tarificador_sesiones` — ⏳ aplicar `apps/asegura/prisma/sql/2026-10-07e_tarificador_sesiones.sql`.
  - ⏳ Pendiente: el fly secret, y el ALTA de la sesión (opciones: script local con navegador visible en el PC de Alberto que sella y sube; o máquina Fly con navegador remoto por `fly proxy`).
- **13 pólizas Allianz sin `prima_anual` = por diseño** (no es un fallo a revisar).

## Grabador v3, propuesta por oportunidad y aviso de verificación (07/10/2026)
- **Grabador v3 automático:** recorre las pantallas solo y entrega UN fichero multi-pantalla (separador `MARCA_PANTALLA`); si pasa de 4 MB se trocea en el navegador. El servidor re-redacta cada pantalla (`redactarHtmlGrabacion`).
- **Rendimiento de la redacción:** el patrón de correo de `PATRONES_PERSONALES` (`packages/module-tarificacion/src/formador.ts`) era cuadrático con tramos largos sin espacios (data: URIs base64 de cientos de KB: 100 KB ≈ 15 s). Ahora `(?<![A-Z0-9._%+-])` lo hace lineal; el bookmarklet lo hereda (usa los mismos patrones). Test: 1,6 MB con 500 KB seguidos < 1 s.
- **Propuesta por oportunidad:** PDF/JSON con recomendación de compañía y control de calidad (QC). Ruta asegura `/api/operador/tarificador/oportunidad/[id]`, proxy `/api/correduria/tarificador/oportunidad/[id]` en plataforma y bloque «Recomendación» en `PresupuestosCompanias`.
- **Aviso de verificación humana:** cron de plataforma cada 10 min (`/api/cron/tarificador-verificacion`) lee `/api/operador/tarificador/avisos-verificacion` de asegura y avisa por Telegram. Interruptor `correduria.tarificador-verificacion`. **Orden de despliegue: asegura antes que plataforma.**

## Interruptores y env (Vercel `central-asegura`)
`TARIFICADOR_RPA_ACTIVO` (=1; apagado por defecto) · `TARIFICADOR_HOGAR_COMPANIAS_EXTRA` (21/10/2026; hoy solo admite `mapfre`: abre Mapfre Hogar) · emisión (10/10/2026, `docs/TARIFICADOR-EMISION-DISENO.md`): `TARIFICADOR_EMISION_ACTIVA` (también fly secret de la máquina) · `TARIFICADOR_EMISION_TELEGRAM_ID` (asegura) · `TARIFICADOR_EMISION_WEBHOOK_SECRET` (MISMO valor en plataforma y asegura, ≥ 32 caracteres: firma HMAC del botón; sin él nadie autoriza) · `TARIFICADOR_EMISION_SOLICITANTE` (plataforma) · `TARIFICADOR_FORMADOR_ACTIVO` · `TARIFICADOR_RENOVACIONES_ACTIVO` · `TARIFICADOR_GRABADOR_MAX_LLAMADAS` · `TARIFICADOR_WORKER_SECRET` · `FLY_API_TOKEN` · `TARIFICADOR_FLY_APP` · `TARIFICADOR_FLY_IMAGE` · `TARIFICADOR_API_URL`.

## SQL aplicados (`apps/asegura/prisma/sql/`)
`2026-10-05_tarificador_rpa` · `2026-10-06b_tarificador_formador` · `2026-10-06c_tarificador_formador_revoke` · `07b` · `07c` (los dos últimos, de la sesión del 07/10; ver su cabecera). Mira `2026-10-06_tipo_seguro_ramos_ofertas` para los ramos de ofertas.

## Allianz RC PYME (en construcción)
- App 1430 (`/drrg01/pme1430`). **No registrado** en `adapters/index.ts` (`RC_PYME_ACTIVO = false`); el tipo `RamoRpa` aún solo admite `comunidades`.
- Hecho: entrada común «Nueva Alta» (`allianz/entrada.ts`, compartida con Comunidades; pestaña Empresas por texto, TODO selectores reales); lector de primas de `#tarifaViewForm` (`rc-pyme.ts`: 27 inputs readonly sin id; neta idx 0, impuestos 6, total 12; fail-closed si no son 27 o no cuadra); guard ampliado (menu3/4/5, #btnAccept, #btnFracciona, «Pago fraccionado»).
- HUECO: «Datos básicos» (td#menu1: actividad con tabla de códigos Allianz, facturación, empleados, límites, ámbito, siniestros) lanza `ErrorMapaIncompleto`. Faltan también: nombre de la tarjeta RC PYME en el modal, cómo se llega a Calcular (`#btnRetarifa` duplicado: anclar por sección), Proyecto/IPID (PDF), pantalla de bloqueos, mapeo a `OfertaNormalizada` y ramo `rc_pyme` en el contrato.
- Prohibido siempre: Datos emisión, Aceptar (#btnAccept → emision_ipid), Pago fraccionado.

## Allianz Negocio 2038 (en construcción)
- `allianz/comercio.ts` (`COMERCIO_ACTIVO=false`, no registrado; entrada: acordeón «Particulares» → tile «Allianz Negocio Plus», no Empresas/«Negocio»): hecho paso 4 «Datos» (tomador canónico `tomador.ts`, solo `fill`, RGPD intacto) y lector de prima `.alz-presupuesto-precio span` (fail-closed); HUECO pasos 1-3 (`ErrorMapaIncompleto`); prohibido «Siguiente» (#idbtnAceptar → Revisión), bloqueado en el guard.

**«Llega a precio» (19/10/2026, F3b de la correduría).** Cada declaración de `obligatorios.ts` lleva `llegaAPrecio` explícito
(`llegaAPrecio(compania, ramo)`; sin declaración = `false`). Desde el aviso de un LEAD solo se lanzan los que llegan; los demás salen
«🧪 en pruebas» y no gastan cupo. Hoy `false`: Generali auto y Allianz Turismos (se paran antes del precio), hogares y Occident. Al ver
el primer precio real de un bot, se pone `true` ahí (con su cepo en `obligatorios.test.ts`).

> Generali auto 0.2.21 (22/10/2026): el «ffnain/ffcain no_existe» de 0.2.20 era un artefacto del lector (tope de 60 llenado de `div`; los ids sí existen); ahora el lector solo mira controles, la pestaña «Personas» se busca por botón/pestaña/enlace/texto y cada campo omitido da su motivo, con «Tomador/Personas» al principio del atasco. PENDIENTE: radios `roles_zprieq/cconno`, desplegables `ycond1/2` y `lnkPers` sin tocar (hace falta puerta en guard.ts + cableado en runner/adaptador y ver qué texto/rol tienen).
> Generali auto 0.2.20 (22/10/2026): el tomador sigue vacío con 0.2.19 aunque los ids eran buenos; ahora se pulsa la pestaña «Personas» (si los campos están ocultos) y el atasco trae el inventario saneado de `reg1063A_personas_*` y el motivo por campo.
> Generali auto 0.2.19 (22/10/2026): «Garantías y Resultados» no daba precio porque el «Interesado / Tomador» estaba vacío (el portal avisa «Es obligatorio informar el tomador»); ahora se rellena por ids reales, el lector mira también `<input>` y el atasco trae avisos y fragmentos saneados con «€».

## Allianz Autos/Moto (en construcción, 10/10/2026)
- `allianz/auto.ts` → `allianzAuto` y `allianzMoto` (`AUTO_ACTIVO=false`, Turismos no se registra; Moto solo con `MOTO_ACTIVO`). Mapa de la grabación de Moto del 09/10 (app legada «Motos-online» en el iframe `appArea`); se SUPONE que Turismos usa los mismos ids (la grabación de Auto del 08/10 no pudo leer el iframe).
- Hecho: entrada (`entrada.ts`, sección «Autos», tarjeta por clase de icono `alz-icon-coches`/`alz-icon-moto`); consulta por matrícula (`#licensePlate` + `change`) → lectura de `#marca/#modelo/#version/#motorPower/#fechaMatriculacion/#mobileCode` → **vehículo canónico** (`module-tarificacion/src/vehiculo.ts`, reutilizable por otros bots); varias versiones sin elección → `requiere_humano` con las opciones (prefijo `requiere_eleccion_version:`, lo enseña `motivoLegible`); la elección vuelve en `FormularioAuto.eleccionVersion` (código o etiqueta EXACTA, nunca «la más parecida»); Datos básicos del conductor (`fill`); lector de primas de Tarificar (`td#<m>_B_A_<0|1>_0`) → `OfertaNormalizada` por modalidad.
- HUECO: avance Riesgo municipio/Datos básicos → Tarificar (su handler lleva «aceptar»: hace falta una función guardada por FASE en `guard.ts`, como la de Comunidades) y el formulario real de Turismos. Combustible: Moto no lo enseña → `null`.
- MOTO (grabación 13/10/2026, sección MOTO de `auto.ts`): el vehículo NO se busca por matrícula; cascada marca→clase→modelo→versión en Riesgo municipio (`FormularioAuto.seleccionVehiculo`, nombres de catálogo; versión múltiple → requiere_humano), CP con lupa (`ctx.pulsar`, nunca Enter), Datos básicos con plan puro fail-closed (sin sexo / antigüedad / siniestros el portal asumiría Hombre / 0 años: se para) y detector de la pantalla de error. Avance entre pestañas: ver el punto siguiente. Turismos: sigue sin formulario grabado (`AUTO_ACTIVO=false`, hueco).
- **Avance de pestaña AUTORIZADO (Alberto, 13/10/2026, «no hay problema con aceptar»)**: SOLO Moto, SOLO `td#datosBasicos` (Riesgo municipio → Datos básicos) y `td#rate` (Datos básicos → Tarificar), por `pulsarAvancePestanaAutorizado` de `guard.ts` (lista blanca cerrada; id, texto, `onclick` y `form#formulari` de origen exactos; una vez por trabajo). En Tarificar solo se abre la pestaña y se leen primas. **Riesgo aceptado: puede quedar un PROYECTO guardado en Allianz** (nunca póliza).
- Ventana de red del clic (≤20 s, se cierra en `finally`): capa (a) `parametrosParecenEmision` en query y cuerpo (store/contract/validar_aceptar/emitir… abortan y el trabajo cae); capa (b) todo no-GET a un destino fuera de la lista exacta se aborta. Lista: el `action` del formulario de origen (`/drpc18/riesgoMunicipio/control.do`, `/drpc18/datosBasicos/control.do`), sacada del DOM de la grabación: **la grabación no registra la red** → fail-closed; si en real sale otro POST, el trabajo muere y se añade tras verlo.
- Sigue prohibido: Emitir, Contratar, Formalizar, Grabar, Archivar (salvo guardar presupuesto en resultado), pie de Tarificar, Datos emisión, Pago fraccionado, Siguiente a Revisión, RGPD «Sí». Flag propio `MOTO_ACTIVO=false` (`allianz/auto.ts`): `adapters/index.ts` registra `allianzMoto` SOLO con él en `true`; el runner ya valida por ramo (`src/ramo.ts`: comunidades → `validarRiesgoComunidad`, auto/moto → `validarFormularioAuto`). Solo se aplica «aceptar» a peticiones hacia la lista blanca; un diálogo del portal nunca se acepta (confirm → cae; alert → `datos`); si el portal rechaza el avance, su informe de incidencias sale como `datos`.
- **Primera prueba real de Moto (13/10/2026; lo decide Alberto, nada se enciende solo).** Cadena: plataforma `POST /api/correduria/tarificador/encolar {clienteId, ramo:'moto', riesgo: FormularioAuto con seleccionVehiculo}` (sin pantalla propia aún) → asegura `/api/operador/tarificador/encolar` (valida con `validarFormularioAuto`) → worker → `allianzMoto`. Pasos: (1) aplicar `apps/asegura/prisma/sql/2026-10-13_tarificador_moto.sql` (fila `allianz/moto` en `companias_integracion`, nace `activo=false`) y activarla: `update seguros.companias_integracion set activo = true where compania='allianz' and ramo='moto'`; (2) poner `MOTO_ACTIVO = true` en `allianz/auto.ts` y construir la imagen nueva (`fly deploy … --build-only --push --image-label <etiqueta>`, README del servicio); (3) `TARIFICADOR_FLY_IMAGE` de Vercel (asegura) = esa imagen y redeploy; (4) con `TARIFICADOR_RPA_ACTIVO=1` y el fly secret `CRED_ALLIANZ_EPAC_*` ya puestos, pedir el trabajo (cliente de PRUEBA) y mirar la bandeja/traza. Riesgo aceptado: puede quedar un proyecto en Allianz, nunca una póliza. Con el flag apagado el trabajo cae como `datos` («sin adaptador») sin abrir el navegador.
- Prohibido siempre (guard ampliado): td#store «Archivar» (`sendActionEvent('store')`), td#contract «Emitir», el pie de Tarificar (`validar_aceptar()`). La matrícula nunca va a logs/mensajes; el grabador ahora tapa matrícula, fecha de matriculación y bastidor.

## Allianz HOGAR (en construcción, 14/10/2026)
- Contrato: ramo `'hogar'` en `RamoRpa` y `FormularioHogar` / `validarFormularioHogar` (`module-tarificacion/src/formulario-hogar.ts`):
  tomador (DNI/NIE + nacimiento), inmueble (CP, vía, número, opcionales, año y m² OBLIGATORIOS), hogar (uso · régimen · tipo ·
  `conMadera`, explícitos y sin valor por defecto; capitales opcionales). El worker valida con él (`src/ramo.ts`, `case 'hogar'`).
  Occident Hogar (`occident/hogar.ts`) sigue con su tipo propio; puede pasar a `AdaptadorHogar` cuando tenga formulario.
- Adaptador `allianz/hogar.ts` → `allianzHogar` (`ALLIANZ_HOGAR_ACTIVO=true` desde el 21/10/2026, OK de Alberto para la 1.ª prueba real de TARIFICACIÓN; registrado al construir la imagen nueva). Hace: login → Nueva Alta →
  Particulares → «Allianz HOGAR» → iframe de la app `ngx-allianzhogar…` → pantalla 1 «Vivienda» por `formcontrolname` (año/m² los
  últimos; comprueba valor, población/tipo de vía autocompletados e inválidos) → opciones del riesgo SOLO por
  `marcarOpcionRiesgoHogarAllianz` (guard.ts, lista cerrada de 13 etiquetas exactas) → «SIGUIENTE» por `ctx.pulsar`.
- HUECOS (`ErrorMapaIncompleto` con inventario de estructura): «Tipo de documento» que no muestre NIF/DNI (o NIE); CP con varias
  poblaciones; vía no resuelta; obligatorio inválido o «SIGUIENTE» deshabilitado (no pulsa «Comprobar»: no está visto);
  **todo lo de después de «SIGUIENTE»: «Valoración de bienes» y la pantalla de PRECIO** (para ahí, en la 1.ª prueba real, con el
  inventario). En «Datos/Revisión/Pago/Confirmación» para sin tocar nada (`EmisionBloqueadaError`).
- **Qué activar para la 1.ª prueba real (lo hace Alberto):** 1) `ALLIANZ_HOGAR_ACTIVO = true` en `allianz/hogar.ts` + imagen
  nueva; 2) asegura YA acepta hogar desde el 19/10/2026 (`validarEntradaRamo`, solo `companiasHogarRpa()`: Allianz fija; Occident
  nunca, su fila está activa solo para explorar). 3) Lanzar una cotización con riesgo completo y leer `error.inventarioDom` del trabajo.
  **Activación 21/10/2026:** flag en `true` (paso 1 en código). Falta: mergear → lanzar A MANO el workflow `tarificador-rpa-imagen.yml`
  desde `main` con una etiqueta nueva → `TARIFICADOR_FLY_IMAGE` de `central-asegura` = esa imagen (antes, copiar la vigente a
  `TARIFICADOR_FLY_IMAGE_ANTERIOR`) → redeploy de producción de asegura (el `ignoreCommand` no reconstruye asegura por un cambio solo en
  `services/`). ⚠️ El inventario de «Valoración»/«Precio» solo sobrevive si el trabajo acaba `atascado` (`TARIFICADOR_ATASCO_ACTIVO=1` +
  formador): un `error_definitivo` purga `error.inventarioDom` al cerrarse (`purgarRiesgoTrabajos`); `error.recorrido` se queda 30 días.
- **21/10/2026 — contrato y cableado de Hogar completos sin portal:** `FormularioHogar` lleva además `hogar.protecciones`
  (puerta blindada, ventanas de seguridad, urbanización cerrada, vigilancia) y `hogar.objetosValor` (joyas en/fuera de caja fuerte,
  objetos de valor; el 0 es dato), ambos opcionales de TRES estados y sacados de «Datos de la vivienda» (`datosVivienda`, fuente
  única; cepo `CAMPOS_VIVIENDA_DEL_BOT` en plataforma). Ningún adaptador los escribe hasta grabar su pantalla. `datosTomador`
  (nombre/apellidos) es parte del formulario del worker (lo inyecta asegura; plataforma no puede mandarlo). La parrilla Avant2↔bot
  ya lee el lado bot en moto, coche y hogar (`ladoBotDeLecturas`): antes decía «no aplica» en esos ramos.
- **Mapfre Hogar** (`mapfre/hogar.ts`, borrador 0.2.0): registrado SOLO con `MAPFRE_HOGAR_ACTIVO` (apagado) y encolable SOLO con
  `TARIFICADOR_HOGAR_COMPANIAS_EXTRA=mapfre` en asegura (lista cerrada; entonces asegura comprueba al encolar e inyecta al entregar
  DNI, nacimiento, nombre y apellidos de la ficha). Huecos `TODO(grabación)`: campo de la referencia catastral, clics `#vc`/radio y
  panel `#protecciones-panel`, y la pantalla de precio. Con el flag encendido cada hueco PARA con inventario DOM (modo grabación).
- **Occident Hogar**: `planFormularioHogar` lee ya el `FormularioHogar` canónico (antes `tomador.nif`: todo trabajo caía en `datos`).
  Sigue SIN registrar (aparcado: SSO paso 2 y formulario sin mecánica).

## Mapfre Auto · NSEI (en construcción, 13/10/2026)

**Presupuesto GUARDADO en el portal con su nº (Alberto, 22/10/2026).** Cada presupuesto de bot de auto queda guardado en la compañía para rescatarlo si el cliente acepta (nunca emitir/contratar/firmar/pagar). **Mapfre 0.8.14:** tras LEER las primas pulsa «Generar Proyecto» por `generarProyectoMapfre` (guard.ts: texto exacto; `Generar proyecto` SIGUE en `TEXTOS_BLOQUEADOS_ALTA` y solo lo abre la opción estrecha `permitirGenerarProyectoMapfre`, para su botón y su ventana de red —no es permiso general de guardado: el explorador IA lo sigue viendo como `boton_de_emision`—; un error del portal → `no_generado` con el precio intacto; una fecha nunca es nº de proyecto; nada más tras el clic; «Ir a generar» sigue bloqueado) y lleva el nº a `referenciaPortal`. **Allianz Turismos 0.6.22 (formulario oculto + «Guardar presupuesto» visible en la barra: lo pulsa UNA vez para abrirlo, en línea o diálogo, y sigue el guardado; antes 0.6.20:** el guardado nunca había funcionado («formulario no está a la vista», 19 y 22/10): ahora espera/desplaza hasta el bloque y lo da por visible por su botón. Sin nº → precio intacto + aviso legible («Presupuesto/Proyecto NO guardado en …: motivo»). Llega a `tarificacion_precios.referencia_vendor` y plataforma lo pinta bajo cada precio de bot (`PrecioBots`, «Nº proyecto Mapfre: …»).

> **Mapfre 0.8.15 / Allianz Turismos 0.6.21 (22/10/2026, primer run real: ambos guardados fallaron, precio intacto).** Mapfre: «no aparece el botón «Generar Proyecto»»: ahora se busca en TODA la pantalla (el pie del paso queda fuera de `app-coberturas`), como `<button>`/`<a>`/`[role=button]`, con el texto sin iconos o por aria-label/title, esperando ≤10 s con scroll; texto exacto y guard intactos. Allianz: «formulario OCULTO»: si cuelga de un panel plegado (acordeón/pestaña/`<details>`) se despliega SOLO el que contiene o gobierna el bloque (`desplegarBloqueGuardarTurismos`, guard.ts; ≤2 por trabajo; nunca el botón de guardar ni algo de emisión). Si aun así falla, el aviso lista ≤10 etiquetas de botones/enlaces a la vista (`etiquetasControlesSaneadas`: ≤40 caracteres, sin cifras largas/@/nombres) para saber qué hay. Sin HTML guardado, la ubicación real es una INFERENCIA: el siguiente run lo confirma.

> **Mapfre 0.8.16 / Allianz Turismos 0.6.23 (22/10/2026, segundo run real, mismo fallo benigno).** Mapfre: en «Coberturas» solo había «Ir a generar proyecto»: si falta «Generar Proyecto» y hay UN «Ir a generar proyecto» (texto entero exacto, opción estrecha `permitirIrAGenerarProyectoMapfre` de `guard-emision.ts`, una vez por trabajo, misma ventana de red estrecha), se pulsa (solo navega) y en la vista siguiente va la única pulsación de «Generar Proyecto»; «Contratar» sigue prohibido. Allianz: el abridor `marcarAbridorGuardarTurismos` usa el mismo conjunto de controles que el diagnóstico (Angular envuelve la pantalla en un `<form>`): ya no excluye todo `closest('form')`, solo el bloque de guardado y los submit explícitos.

`services/tarificador-rpa/src/adapters/mapfre/auto.ts`, registrado SIEMPRE (`mapfre/auto` y `mapfre/moto`, mismo NSEI; 14/10/2026: el worker de Fly no recibe secretos nuevos y el interruptor `TARIFICADOR_MAPFRE_ACTIVO` se RETIRÓ). **La puerta es la fila `seguros.companias_integracion` mapfre/<ramo> activa y `rpa_autorizada`**: sin ella asegura no encola, no reclama ni lanza, y el worker solo recibe trabajos `en_curso` (lo vigila `test/regression-tarificador-rpa.test.ts`). **NIF del tomador (paso 1):** lo pone ASEGURA desde la ficha del cliente (de esa correduría) como `riesgo.documentoTomador`, solo en Mapfre auto/moto y solo si el riesgo no trae `tomador.documentoIdentidad`. **No se persiste** (seguridad, 14/10/2026): `encolarTrabajo` solo COMPRUEBA la ficha (`riesgoParaEncolar`; sin NIF → 422 `falta_nif_tomador`, ilegible → 503 `nif_tomador_ilegible`, inválido → 422, sin encolar ni documento en el motivo) y guarda el riesgo SIN `documentoTomador`; el NIF se descifra e inyecta en `trabajoParaWorker` solo en la respuesta al worker (si para entonces la ficha ya no lo permite, el trabajo falla `datos`/`infra` y no se sirve). Otra compañía: se quita. En el worker es SECRETO del trabajo (`secretosDelRiesgo`: redactado en mensajes/URL/HTML y sin captura). **Nombre, apellidos y nacimiento del tomador (revisión PR #4710):** mismo régimen que el NIF: `encolarTrabajo` los COMPRUEBA en la ficha (`lecturaTomadorFicha`; faltan → 422 `falta_datos_tomador` «falta X en la ficha», ilegibles → 503 `datos_tomador_ilegibles`, sin máquina) y `trabajoParaWorker` los inyecta como `riesgo.datosTomador` solo en la respuesta (empresa: razón social); también son secretos del trabajo. Plataforma (`BotsAutoRiesgo`) bloquea el botón de Mapfre con el mismo aviso. **Paso 1 SIN LUPA (v0.7.0):** se teclea el NIF y, al salir del campo, Mapfre busca solo; «nuevo» SOLO con el aviso «no existe ningún registro» (sin aviso ni autorrelleno → `indeterminado` → atasco); el alta rellena solo campos VACÍOS (autorrelleno tardío → atasco, no se sobrescribe), la fecha se verifica tras salir del campo (inversión día/mes → atasco) y no puede quedar ningún «Campo obligatorio» (también si el tomador existe). Todos esos huecos pasan por `registrarAtasco` (Telegram). **«Continuar» (Alberto, 14/10/2026):** solo por `pulsarContinuarMapfre` (guard.ts), lista cerrada desde Datos básicos → Objeto asegurado → Figuras (el del paso 3 calcula las primas: PERMITIDO), una vez por paso, en orden (el paso 2 exige el vehículo confirmado), con el paso activo del stepper (`mat-step-header[aria-selected=true]`) comprobado antes y después; nada desde Coberturas/Proyectos ni hacia Contratación. Antes de cada «Continuar» el paso tiene que estar completo: hoy uso/ámbito (mat-select) paran en el paso 2 con inventario, sin precio supuesto. Los huecos de la entrada y del NSEI piden inventario DOM, que el runner toma de TODAS las pestañas (la más reciente primero), con enlaces, menús y mat-icon (14/10/2026). Fuente: una grabación de 19 pantallas de wmediadores.mapfre.com (app NSEI, SPA Angular Material **sin iframes**: todo legible). **Llega a precio**: 3 productos con «PRIMA TOTAL» anual en el paso 4 Coberturas (`app-primas > prima-producto`; `.caja-primas p strong`; icono `.ccttVerificacion .warning-color` = exige verificar el vehículo antes de contratar). Selectores por `name`/`formcontrolname` con ámbito de componente (`app-datos-vehiculo`, `app-conductor-habitual`, `app-historial-siniestralidad`…); los `mat-input-N` NO se usan (contadores de Angular Material). Hecho: mapa de pantallas, lector de primas, lector de filas del diálogo «Selección de vehículo» (sin matrícula ni bastidor), lector del «Resumen vehículo», plan de campos de texto con `comprobarCampo`. **Nada pulsa**: faltan (a) login y entrada (la grabación empieza ya dentro de NSEI), (b) el avance «Continuar» (el del paso 3 calcula las primas: decisión de Alberto), (c) elegir fila y confirmar el diálogo de vehículo, (d) los `mat-select` (uso, ámbito, clase de permiso, compañía anterior: no se grabaron abiertos). La búsqueda del tomador por NIF ya NO usa la lupa (ver arriba). Mapfre no separa marca/modelo/versión (una sola «denominación comercial»): el `Vehiculo` canónico no se puede construir sin decidir cómo partirla. **Guard**: «Generar Proyecto» / «Ir a generar proyecto» (crean un nº de proyecto y documentación) están PERMITIDOS por decisión de Alberto del 13/10/2026 («el bot SÍ puede hacer proyectos»): no los bloquea `guard-emision.ts`. Sigue prohibido emitir/contratar/formalizar/grabar póliza, pago y RGPD «Sí»; «Contratar» y todo «Aceptar» siguen bloqueados. «Calcular» pasa.

**Vehículo confirmado por matrícula (14/10/2026).** Tipo puro `VehiculoConfirmado {origen:'mapfre', denominacion, cv, cc, puertas, fechaInicio}` (`module-tarificacion/src/vehiculo-confirmado.ts`), opcional en `FormularioAuto.vehiculoConfirmado` (auto y moto), conservado por la purga (lista blanca + SQL espejo) y SIN matrícula ni bastidor (clave extra = rechazo). En el worker, `consultarVehiculoPorMatricula` (mapfre/auto.ts) teclea la matrícula, lee la fila del diálogo «Selección de vehículo» y la confirma SOLO por `confirmarVehiculoMapfre` de guard.ts: exactamente un diálogo, la PRIMERA fila y solo si tiene la matrícula del riesgo (comparada dentro del guard; nunca sale a logs, errores, IA ni resultado), un solo control de elección en esa fila y un único «Aceptar» de texto exacto dentro del diálogo; una vez por trabajo. 0 filas → `datos`; **varias → la PRIMERA (decisión de Alberto, 14/10/2026; antes requiere_humano)**; primera fila con otra matrícula → `datos` (nunca se prueba otra fila). «No es el vehículo» y «Vehículo NO catalogado» bloqueados en `TEXTOS_BLOQUEADOS_ALTA`. Allianz (auto y moto): `eleccionVersionEfectiva` elige versión por el vehículo confirmado **por SIMILITUD** (decisión de Alberto 14/10/2026: Mapfre saca el vehículo exacto; en Allianz y futuros bots basta la versión «prácticamente la misma»): CV y CC leídos de la etiqueta con unidad explícita, tolerancia CV ±10 % y CC ±5 %, puertas solo si ambas lo traen (si difieren, descartada); gana la más próxima, desempate por palabras de la denominación y luego la primera de la lista; el resultado lleva el aviso «Versión elegida por similitud con el vehículo confirmado en Mapfre» (`Vehiculo.versionPorSimilitud`). Fuera de tolerancia o sin CV/CC legibles → flujo de siempre (memoria/IA/persona); la elección explícita de persona/IA manda siempre. (Excepción acotada: el resto de elecciones de versión siguen sin «la más parecida».) `mapfreAuto.tarificar` pasa el paso 1 sin lupa (tomador existente o alta con los datos de la ficha); detrás quedan los mat-select (uso, ámbito, clase de permiso, compañía anterior). Sin encadenado ni UI (fase siguiente); el cable worker→asegura aún no lleva `vehiculoConfirmado`.

## Elección de versión con IA y memoria (13/10/2026)
Cuando el catálogo de la compañía ofrece varias versiones del vehículo (caso real: Allianz Moto, BMW «F 800» → 20 versiones en `#version`), el bot NO adivina. Código: `module-tarificacion/src/eleccion-lista.ts` y `eleccion-memoria.ts` (puros), `apps/asegura/lib/tarificador-eleccion-reglas.ts` (reglas puras con test), `tarificador-eleccion.ts` (cableado BD+IA), `tarificador-memoria.ts` (BD), `tarificador-bandeja.ts`.

**Flujo (máx. 1 intento automático por trabajo)**
1. Worker: `ErrorEleccionVersion` (`allianz/auto.ts`) para y devuelve error `captcha` con la lista COMPLETA en `error.opcionesVersion` (sin IA en el worker).
2. `POST /api/tarificador/resultado` registra el fallo → `requiere_humano` y responde al worker. Si `l.r.error.opcionesVersion` y estado `requiere_humano` y `TARIFICADOR_IA_ELECCION=1`, lanza `intentarEleccionVersionIa` en `after()` (`maxDuration` 90 s; el worker no espera).
3. `procesarEleccionVersion`: (a) si la versión de una elección de MEMORIA vuelve a pedir versión, se borra esa entrada (`memoriaAInvalidar`); (b) `planEleccionVersion` decide si se intenta; (c) MEMORIA primero (`seguros.tarificador_elecciones`); (d) si no hay, IA; (e) con elección válida, `aplicar` (transacción `for update`) escribe `riesgo.eleccionVersion {codigo, etiqueta}` + `riesgo.eleccionVersionIa {origen: ia|memoria, clave, motivo, en}`, y devuelve EL MISMO trabajo a `pendiente` (intentos 0, error null); (f) `lanzarPendientes` (mejor esfuerzo: si Fly falla queda `pendiente` para el barrido).
4. Si la IA no se atreve (`baja`), el trabajo sigue `requiere_humano` y se anota `error.eleccionIa {confianza:'baja', motivo}`. Una persona decide en la bandeja.

**Tope de 1 intento:** no se intenta si el riesgo ya trae `eleccionVersion` (de IA o persona) o `eleccionVersionIa`. Tampoco si estado ≠ `requiere_humano`, `modo = emision`, ramo ∉ {moto, auto}, error ≠ `captcha`, sin lista válida, riesgo no válido, o la lista tiene opciones sin código/repetidas. `aplicar` re-comprueba bajo lock (mismo `error.en`, sin elección previa): si no, `carrera` y no hace nada.

**Interruptor:** `TARIFICADOR_IA_ELECCION=1` exacto (cualquier otro valor = apagado, fail-closed), en Vercel `central-asegura`. Apagado: no hay IA ni se USA la memoria; la elección HUMANA sí se guarda siempre.

**IA**
- Solo acepta `confianza: "alta"` con un `codigo` que esté EXACTAMENTE una vez en la lista (`validarEleccionIa`). Código inventado, JSON ilegible, IA caída/timeout (30 s), dudas o <2 opciones = `baja`. Nunca «la más parecida». Se aplica la etiqueta del CATÁLOGO, no la de la IA.
- Lista blanca de 6 campos enviados (`contextoEleccionVersion`): `ramo, marca, modelo, clase, cilindradaCc, descripcion` + la lista de opciones. Nada de matrícula, CP, conductor, fechas ni tomador. Un campo nuevo no se cuela solo (test congelado).
- `iaTexto(..., privado: true, categoria: 'redaccion')` por la pasarela (queda en `ai_usos`, app `asegura`). La categoría `redaccion` solo sirve su modelo (hoy Claude Sonnet) si en plataforma `DIRECTOR_MODO=activo`; en sombra se sirve el modelo por defecto.

**Memoria** (`seguros.tarificador_elecciones`; SQL `prisma/sql/2026-10-13_tarificador_elecciones.sql`, deshacer: `drop table`)
- Única por (`correduria_id`, `compania`, `ramo`, `tipo='version'`, `clave_normalizada`). Todo va por `correduria_id`. Clave = `MARCA|MODELO|CLASE|CC|DESCRIPCION` en mayúsculas, sin tildes, espacios colapsados (`claveMemoriaVersion`); sin marca o sin modelo = sin clave (no se recuerda).
- Lo recordado solo se usa si su código está exactamente una vez en la lista de HOY; si el catálogo cambió, se ignora y se pregunta a la IA.
- Humano gana a IA (`fusionarMemoria`): la IA no pisa una humana; mismo código suma `confirmaciones`; humano sustituye; IA sobre IA sustituye.
- La IA NO enseña al elegir: su elección (o la de memoria) se guarda con origen `ia` SOLO cuando el trabajo termina `ok` con `tarificacionId` (`registrarResultado` → `memoriaTrasExito`). Marcas antiguas sin `origen`/`clave` no enseñan.
- Se invalida (delete solo si sigue apuntando a ese código) cuando una versión sacada de memoria vuelve a pedir versión.
- Fail-soft: sin la tabla (SQL sin aplicar) o BD caída, leer = «no se sabe» (va a la IA) y guardar no hace nada. Nunca rompe bandeja ni resultado.

**Bandeja (`aplicarAccionBandeja`, acción `reintentar` con `eleccionVersion`)**: se valida bajo `for update` contra `error.opcionesVersion` del propio trabajo (`eleccionContraLista`: código exactamente una vez; si trae etiqueta, debe ser la de ese código). Fuera de lista = `conflicto`. Escribe `riesgo.eleccionVersion`, quita `eleccionVersionIa` y vuelve a `pendiente`; después, fuera de la transacción, guarda la memoria con origen `humano`. Doble clic con la misma versión = `sin_cambios`; con otra sobre un trabajo ya en marcha = `conflicto`.

**Población del CP (13/10/2026, adaptador allianz 0.3.0)**: tras la lupa, si aparecen celdas `td[onclick*=receivedDataLocationFinder]` («CP- NOMBRE»): una → se pulsa (`ctx.pulsar`); varias → `resolverPoblacion` (`module-tarificacion/src/poblacion.ts`): `riesgo.eleccionPoblacion` (texto exacto de la celda) o `riesgo.poblacion` si casa con UNA (sin mayúsculas/tildes/espacios); si no, `ErrorEleccionPoblacion` → `captcha`/`requiere_humano` con `error.opcionesPoblacion`. Tras pulsar, `#_destown` vacío = `ErrorMapaIncompleto` con inventario.
Bandeja: `reintentar` + `eleccionPoblacion` se valida bajo `for update` contra `error.opcionesPoblacion` (`eleccionPoblacionContraLista`) y escribe `riesgo.eleccionPoblacion`; versión y población no van en la misma petición. La IA y la memoria NO eligen poblaciones.
Encolar moto desde plataforma: sin `poblacion` en el riesgo, se toma `ciudad` de la ficha del cliente (`seguros.clientes.ciudad`, vía `/api/operador/cliente`) solo si su `codigo_postal` = el CP del riesgo (`poblacionDesdeFicha`); sin logs del valor.
⚠️ El guard de `pulsar` bloquea una celda cuyo nombre case con su patrón (p. ej. una población con «BAJA»): el trabajo cae como `emision` (fail-closed); no se ha tocado `guard.ts`.

**Moto: clase y cilindrada** (`FormularioAuto.seleccionVehiculo {marca, modelo, clase, cilindradaCc, descripcion?}`, nombres de catálogo): clase 1 = 51-125 cc · 2 = 126-350 · 3 = 351-750 · 4 = >750. `cilindradaCc` es OBLIGATORIA en moto (Allianz separa Moto y Ciclomotor); ≤50 cc = ciclomotor = otro producto de Allianz, NO soportado (se rechaza en `validarFormularioAuto` y en `tarificarMoto`); clase que no casa con las cc = error. `descripcion` (≤200 car., p. ej. «BMW F 800 S 85 CV») es solo del vehículo: se rechaza si parece matrícula, NIF/NIE, email, teléfono, IBAN o bastidor (`pareceDatoPersonalEnDescripcion`) y el error nunca repite el valor.

**Límites conocidos (no resueltos)**
- `buscarPoblacion`: la lista de celdas sale del inventario de estructura, no de una prueba real (si la sección plegable las deja ocultas, el clic fallará → `portal`). La bandeja de plataforma aún no pinta el selector de población (`opcionesPoblacion` ya viaja en el item).
- Allianz Turismos (coche): sigue con mapa SUPUESTO, pendiente de regrabar (`AUTO_ACTIVO=false`).
- `reclamarSiguiente` cuenta los `en_curso` para el cupo sin mirar `lease_hasta`: un lease vencido ocupa hueco hasta que lo barre `barrerTarificadorRpa`.
- Ese barrido no tiene cron propio: solo corre desde el cron de renovaciones (`/api/cron/tarificador-renovaciones` → `tarificador-ops`).
- `encolarTrabajo` no deduplica: encolar dos veces lo mismo crea dos trabajos.
- La memoria solo cubre `tipo='version'` (la población la elige siempre una persona).

**Errores frecuentes / cómo diagnosticar** (sin pegar datos de clientes en el chat)
- Dónde mirar: `seguros.tarificacion_trabajos` → `estado`, `error->>'tipo'` (`captcha` + `opcionesVersion` = pidió versión), `error->>'mensaje'`, `error->'eleccionIa'` (la IA dijo `baja` y su motivo), `riesgo->'eleccionVersion'` (qué se aplicó), `riesgo->'eleccionVersionIa'` (`origen` ia|memoria, `clave`, `en`). Memoria: `seguros.tarificador_elecciones` (`origen`, `confirmaciones`, `ultima_vez`). Log: `[tarificador] elección de versión con IA <id> <estado>` (omitido|baja|carrera|aplicado) en Vercel `central-asegura`.
- Se queda en `requiere_humano` y no hay `eleccionIa`: interruptor ≠ `1`; o `omitido` (mira el motivo del log: ya tuvo elección, `modo=emision`, lista sin códigos, riesgo no válido).
- Hay `eleccionIa` baja: legítimo (ambigua). Elegir a mano en la bandeja; queda aprendida.
- Vuelve a pedir versión tras aplicar: tope de 1 intento → persona. Si venía de memoria, la entrada se borró sola.
- No aprende: el trabajo no llegó a `ok` con tarificación, la tabla no existe (SQL sin aplicar), o el vehículo no tiene marca/modelo.
- 409 en la bandeja: la versión no está en `error.opcionesVersion` de ese trabajo, o ya está en marcha con otra.
- «ciclomotor (≤50 cc)» / «falta la cilindrada» al encolar: dato de entrada, no fallo del bot.

## Explorador IA (fase A hecha 13/10/2026; B worker y C plataforma pendientes)
`modo='exploracion'`: el worker llega a una ENTRADA cerrada (`ENTRADAS_EXPLORACION`: `allianz:particulares:hogar`, y comunidades como oráculo) y en cada pantalla manda el inventario SANEADO a `POST /api/tarificador/explorador/paso`; asegura responde un lote de la LISTA BLANCA (`rellenar` clave · `elegir` opción · `marcar` radio · `avanzar` · `terminar` · `parar`) que sale de la MEMORIA (mapa ya visto, sin IA) o de la IA, siempre validado (`validarRespuestaExplorador`, `@central/module-tarificacion/explorador.ts`). Al final `POST …/cierre` y asegura construye el MAPA v1 (`construirMapa`) desde sus pasos.
- **Datos:** la IA solo elige CLAVES del catálogo; el valor lo pone el worker (`resolverDato`). NIF real SOLO si el trabajo cuelga de una petición REAL del mismo cliente (trabajo `tarificar` u oportunidad suya; trigger en BD); si no, sintético y se PARA si piden NIF. Contacto = `TARIFICADOR_EXPLORADOR_EMAIL`/`_TELEFONO` (de Alberto, solo env).
- **Paradas:** OTP/SMS, CAPTCHA y títulos de emisión (Revisión, Forma de pago, IBAN, Firma, Emitir, Contratar, Formalizar, Grabar, Archivar) → `parar`, nunca se automatizan. «Aceptar» SOLO el de Datos básicos (Alberto, 13/10/2026; puede quedar proyecto en ePAC).
- **Topes (techo; el env solo baja):** 30 llamadas, 80 acciones, 40 pasos, 15 min, **2 €** (peor caso ANTES de llamar). Coste real en `ai_usos` con `cliente_ref='explorador:<trabajo>'`.
- **PII y concurrencia (revisión 13/10):** con datos reales la ruta `paso` carga el `riesgo` del trabajo y QUITA del inventario todo texto con sus valores (nombre, dirección, CP, fecha de nacimiento, matrícula, NIF, contacto de env) antes de la IA y de guardarlo; sin riesgo legible → 503 `parar`. «Aceptar» solo con título `h1-h6/legend` (nunca `th`) y lista de títulos sin recortar; `avanzar` exige texto/aria entero y onclick sin recortar. Lock `pg_try_advisory_xact_lock`: ocupado → 409 sin IA.
- **Fase B (worker, 13/10/2026, rama `claude/explorador-ia-worker`):** `services/tarificador-rpa/src/explorador.ts` (login ePAC por código → `abrirNuevaAlta` → bucle: CAPTCHA/OTP/ventana nueva = parar; inventario con refs y handles en el MISMO orden que el crudo; REVALIDA el lote; anti-TOCTOU por nodo; `rellenar` con `resolverDato` sin log; `marcar`/`avanzar` por `ctx.pulsar()`; el «Aceptar» de Datos básicos SOLO por `pulsarExploracionAutorizada` de `guard.ts`, una vez, con ventana de red al `action` del formulario; red no-GET → `redNoGet`) → `/cierre` → resultado `explorado` (o `captcha`/`emision`/error). El worker declara sus modos en `X-Tarificador-Modos`: asegura solo sirve una exploración a quien la declara; la cola solo la RECLAMA con `TARIFICADOR_EXPLORADOR_ACTIVO=1`. Lease renovado en cada paso con techo = inicio ACUMULADO + 15 min + 2 min. `MAX_TOKENS_SALIDA_EXPLORADOR` = 4000. `paso` ya no tiene la conexión abierta durante la IA (tx1 reserva `ia_en_vuelo_hasta` y suelta → IA fuera → tx2 registra o descarta con 409 si el estado cambió); `cierre` toma el mismo try-lock. Encolar: `POST /api/operador/tarificador/exploracion {entrada, trabajoOrigenId?}` (sintética o ligada a un `tarificar` del mismo cliente y ramo). SQL nuevo `2026-10-13c_tarificador_explorador_fase_b.sql` (columna de reserva + fila `allianz/hogar` APAGADA), NO aplicado.
- **Envs:** `TARIFICADOR_EXPLORADOR_VISTA=dom|aria|ambas` (defecto `dom`; se pone en Vercel `central-asegura` y `peticionMaquina` la REENVÍA a la máquina Fly — lista blanca `ENV_MAQUINA_PERMITIDAS`; ausente o con otro valor no viaja y el worker usa `dom`), `TARIFICADOR_EXPLORADOR_ACTIVO=1`, `TARIFICADOR_EXPLORADOR_MODELO` (por defecto `anthropic/claude-sonnet-4.5`, por OpenRouter con `modeloOpenRouter` de la pasarela: NO con `model`, que es el pin a NIM). SQL `2026-10-13_tarificador_explorador.sql` (NO aplicado).

## Rutina «Médico del bot tarificador»
`trig_011zoZZAiTQnQ48qEWdRJq2Y`: laborables 8:52 Madrid; mira Supabase + repo; abre PR **draft**; **nunca mergea**.

## Decisiones de Alberto
- **Allianz NO se avisa** del acceso automatizado: riesgo de bloqueo asumido (volumen bajo, ritmo humano).
- Todo lo hacen agentes, ahorrando tokens.
- Auto/hogar/moto/vida/salud/decesos se quedan en **Avant2** (la API de Codeoscopic no cubre comunidades/RC/comercio).
- (27/10/2026) Se tarifica SIEMPRE en pago ANUAL; la forma de pago la cambia el cliente al contratar.
- (27/10/2026) «Envío e-mail» del portal (Generali) nunca en «Sí» sin OK de Alberto (comunicación a tercero). «Verificación del riesgo» (Generali): pendiente de su decisión; mientras, el bot se para y la nombra.
- (27/10/2026) Pruebas de imagen de rama sin mergear: solo con interruptor en BD que enciende Alberto (sustituye en ese caso a «Nunca desplegar imagen desde una rama sin su OK»: el interruptor ES el OK; producción solo `main-*`).
- (27/10/2026) Allianz auto con compañía actual = Allianz (Allianz→Allianz): no se tarifica por bot (el portal no la ofrece); error de datos claro, se hace a mano.

## PLAN

**Fase 1 · Auto y hogar de punta a punta (en curso 27/10)**
- [hecho] Allianz auto precio; [pendiente] guardar proyecto + PDF (0.6.34 espera confirmación más larga, sin verificar en real).
- [hecho 27/10] Allianz hogar precio (3 modalidades).
- [en curso] Mapfre auto: 0.8.33 deja de buscar «compañía anterior» cuando el portal no la pide (la toma de su consulta de historial) y avisa en la oferta.
- [en curso] Generali auto: el portal no calcula por «datos incompletos»; 0.2.42 nombra los campos que faltan; forma de pago anual por defecto.
- [pendiente] Mapfre hogar: encender flag + fila companias_integracion + env TARIFICADOR_HOGAR_COMPANIAS_EXTRA=mapfre; 3-5 vueltas reales.
- [pendiente] Generali hogar: no hay bot; construirlo con capturas de Alberto + atascos (modo grabación).
- [pendiente] Flujo completo tras precio: PDF → análisis de coberturas → comparativa → borrador al cliente (Alberto emite a mano).

**Fase 2 · Ciclo de prueba rápido (en curso 27/10)**
- Volcado completo en cada atasco (todos los marcos, errores visibles, botones, obligatorios vacíos, sin valores) para cerrar huecos en una vuelta.
- Imagen del bot desde la BD (la apunta el workflow de imagen al construir en main; sin cambiar la env de Vercel ni redesplegar; no se vuelve atrás salvo forzar).
- Descartar un atasco no cuenta como fallo para la pausa automática.
- Prueba con imagen de rama (`rama-*`) por `probar`, solo con interruptor de Alberto; se anota en el trabajo qué imagen corrió.
- `probar` autónomo para hogar (riesgo desde la oportunidad con los catálogos vivos de Codeoscopic).

**Fase 3 · Formas de pago y recargo por fraccionar (idea Alberto 27/10)**
- Tabla `seguros.condiciones_fraccionamiento` (compañía, ramo, frecuencia, recargo %, permite: sí/no/no se sabe, fuente, fecha). Nunca inventar: «no se sabe» ≠ «no».
- Lectura pasiva en cada tarificación de lo que la pantalla ya muestra: Generali auto (Recibo Anual / 1er Semestral / 1er Trimestral), Mapfre hogar (bloques anual/semestral/trimestral/mensual). Allianz moto (sección FRACCIONAMIENTOS).
- Donde la pantalla solo muestra la forma elegida (Allianz auto/hogar): tras guardar el precio ANUAL, cambiar el desplegable de forma de pago y recalcular (puerta de guard con lista blanca, límite de tiempo, se deja en anual antes de guardar proyecto/PDF; nunca el botón «Pago fraccionado»). Por compañía y desactivable.
- El dato bueno es el del riesgo concreto (recibo mínimo, ramos que solo admiten anual); la tabla general es respaldo «estimado».
- Borrador / presupuesto: «Anual X € · Semestral 2×Y € (+Z %) · Trimestral 4×W € (+V %)», con coste total del año (transparencia IDD); omitir lo desconocido.

**Fase 4 · Presupuesto propio por URL dinámica**
- Presupuesto de Grupo ASegura en una URL viva: el cliente elige forma de pago y se filtran/ordenan al momento las compañías que la permiten por coste anual real; «a consultar» si no se sabe.
- Escala con cada compañía nueva.

**Fase 5 · Más ramos y compañías**
- Repetir el patrón (mapa → atascos con volcado → cierre) en cada ramo/compañía; tarea semanal de actualización de vocabulario (pendiente).

Comunidades / RC / Comercio (anterior):
1. Confirmar Allianz Comunidades con una **cotización real desde Oportunidades** (PDF + sesión).
2. Comunidades con **Occident (Catalana Occidente)** vía grabador → comparador.
3. RC con Occident.
4. Comercio, más adelante.

Por qué (cartera, 06/10): 103 pólizas en vigor de estos ramos/compañías; Occident ~46; Comunidades 4; RC 12; **13 pólizas Allianz sin prima cargada → revisar.**

## Pendientes en vivo
Generali: decisión de Alberto sobre "Verificación del riesgo" · Capturas de Generali "Garantías y Resultados" con precio · Capturas del recorrido de Hogar en Genernet + OK de RPA en Generali hogar · Cotización real de punta a punta (paso 1) · validar umbrales de infraseguro · revisar las 13 pólizas Allianz sin prima · rotar la contraseña de Occident que viajó en claro en un correo de Codeoscopic (08/06) · confirmar que los fly secrets llegan a las máquinas de la API de Machines.
