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
- Resultado: tabla `#tablaTarificacion` con tabla ANIDADA. **Columna «Anual» = PRIMER RECIBO prorrateado** (ePAC fija el vencimiento al día 1); **«Sucesivos» = prima anual real**. La UI muestra la anual y aparte el primer recibo (#4383).
- Término real: `#fechaTermino` / `#fechaTerminoTarificar`.
- Proyecto (PDF): `td#MENU` → «Proyecto». **«Proyecto Ampliado» (`td#EMISION_PROJ`) PROHIBIDO.**
- Precio verificado contra el manual (06/10/2026): **347,55 € anual / 342,77 € primer recibo.**

## Seguridad (TARIFICAR ≠ EMITIR)
- Guardián `test/regression-tarificador-rpa.test.ts`: lista blanca; nunca Emitir/Contratar/Formalizar/Grabar/Archivar ni Aceptar fuera de Tarificar; pulsar solo con `ctx.pulsar()`; sin `.click()` directo.
- Credenciales (`CRED_<CLAVE>_USER/_PASS`) solo como fly secrets: nunca en código, logs, BD ni IA (se redactan). El worker no lleva `DATABASE_URL` ni `CODEOSCOPIC_*`.
- CAPTCHA → `requiere_humano`, nunca se evita. **Un cepo se ve en rojo antes de darlo por bueno.**

## IA formador (`src/formador.ts`)
Fallback cuando `campoPorEtiqueta`/Calcular no resuelven (lista cerrada de acciones + `pareceEmision`); **modo acompañado** (hasta 10 cotizaciones) con contraste por etiqueta; registro inmutable `tarificador_intervenciones`. Tope de llamadas por trabajo: `TARIFICADOR_FORMADOR_MAX_LLAMADAS` (12).

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
- **RC PYME**: pantalla de resultado mapeada (primas en `#tableTarifaAnual_{0,1,2}_0`). PROHIBIDOS: Archivar, Aceptar `#btnAccept`→emision_ipid, Datos emisión, Proyecto ampliado, Pago fraccionado. Seguros: Datos básicos, Proyecto, IPID, Retarificar. Faltan por mapear Datos básicos y Proyecto.
- **Generali** pide SMS → reutilizar sesión + aviso Telegram.
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
`TARIFICADOR_RPA_ACTIVO` (=1; apagado por defecto) · emisión (10/10/2026, `docs/TARIFICADOR-EMISION-DISENO.md`): `TARIFICADOR_EMISION_ACTIVA` (también fly secret de la máquina) · `TARIFICADOR_EMISION_TELEGRAM_ID` (asegura) · `TARIFICADOR_EMISION_WEBHOOK_SECRET` (MISMO valor en plataforma y asegura, ≥ 32 caracteres: firma HMAC del botón; sin él nadie autoriza) · `TARIFICADOR_EMISION_SOLICITANTE` (plataforma) · `TARIFICADOR_FORMADOR_ACTIVO` · `TARIFICADOR_RENOVACIONES_ACTIVO` · `TARIFICADOR_GRABADOR_MAX_LLAMADAS` · `TARIFICADOR_WORKER_SECRET` · `FLY_API_TOKEN` · `TARIFICADOR_FLY_APP` · `TARIFICADOR_FLY_IMAGE` · `TARIFICADOR_API_URL`.

## SQL aplicados (`apps/asegura/prisma/sql/`)
`2026-10-05_tarificador_rpa` · `2026-10-06b_tarificador_formador` · `2026-10-06c_tarificador_formador_revoke` · `07b` · `07c` (los dos últimos, de la sesión del 07/10; ver su cabecera). Mira `2026-10-06_tipo_seguro_ramos_ofertas` para los ramos de ofertas.

## Allianz RC PYME (en construcción)
- App 1430 (`/drrg01/pme1430`). **No registrado** en `adapters/index.ts` (`RC_PYME_ACTIVO = false`); el tipo `RamoRpa` aún solo admite `comunidades`.
- Hecho: entrada común «Nueva Alta» (`allianz/entrada.ts`, compartida con Comunidades; pestaña Empresas por texto, TODO selectores reales); lector de primas de `#tarifaViewForm` (`rc-pyme.ts`: 27 inputs readonly sin id; neta idx 0, impuestos 6, total 12; fail-closed si no son 27 o no cuadra); guard ampliado (menu3/4/5, #btnAccept, #btnFracciona, «Pago fraccionado»).
- HUECO: «Datos básicos» (td#menu1: actividad con tabla de códigos Allianz, facturación, empleados, límites, ámbito, siniestros) lanza `ErrorMapaIncompleto`. Faltan también: nombre de la tarjeta RC PYME en el modal, cómo se llega a Calcular (`#btnRetarifa` duplicado: anclar por sección), Proyecto/IPID (PDF), pantalla de bloqueos, mapeo a `OfertaNormalizada` y ramo `rc_pyme` en el contrato.
- Prohibido siempre: Archivar, Proyecto ampliado, Datos emisión, Aceptar (#btnAccept → emision_ipid), Pago fraccionado.

## Allianz Negocio 2038 (en construcción)
- `allianz/comercio.ts` (`COMERCIO_ACTIVO=false`, no registrado): hecho paso 4 «Datos» (tomador canónico `tomador.ts`, solo `fill`, RGPD intacto) y lector de prima `.alz-presupuesto-precio span` (fail-closed); HUECO pasos 1-3 (`ErrorMapaIncompleto`); prohibido «Siguiente» (#idbtnAceptar → Revisión), bloqueado en el guard.

## Allianz Autos/Moto (en construcción, 10/10/2026)
- `allianz/auto.ts` → `allianzAuto` y `allianzMoto` (`AUTO_ACTIVO=false`, Turismos no se registra; Moto solo con `MOTO_ACTIVO`). Mapa de la grabación de Moto del 09/10 (app legada «Motos-online» en el iframe `appArea`); se SUPONE que Turismos usa los mismos ids (la grabación de Auto del 08/10 no pudo leer el iframe).
- Hecho: entrada (`entrada.ts`, sección «Autos», tarjeta por clase de icono `alz-icon-coches`/`alz-icon-moto`); consulta por matrícula (`#licensePlate` + `change`) → lectura de `#marca/#modelo/#version/#motorPower/#fechaMatriculacion/#mobileCode` → **vehículo canónico** (`module-tarificacion/src/vehiculo.ts`, reutilizable por otros bots); varias versiones sin elección → `requiere_humano` con las opciones (prefijo `requiere_eleccion_version:`, lo enseña `motivoLegible`); la elección vuelve en `FormularioAuto.eleccionVersion` (código o etiqueta EXACTA, nunca «la más parecida»); Datos básicos del conductor (`fill`); lector de primas de Tarificar (`td#<m>_B_A_<0|1>_0`) → `OfertaNormalizada` por modalidad.
- HUECO: avance Riesgo municipio/Datos básicos → Tarificar (su handler lleva «aceptar»: hace falta una función guardada por FASE en `guard.ts`, como la de Comunidades) y el formulario real de Turismos. Combustible: Moto no lo enseña → `null`.
- MOTO (grabación 13/10/2026, sección MOTO de `auto.ts`): el vehículo NO se busca por matrícula; cascada marca→clase→modelo→versión en Riesgo municipio (`FormularioAuto.seleccionVehiculo`, nombres de catálogo; versión múltiple → requiere_humano), CP con lupa (`ctx.pulsar`, nunca Enter), Datos básicos con plan puro fail-closed (sin sexo / antigüedad / siniestros el portal asumiría Hombre / 0 años: se para) y detector de la pantalla de error. Avance entre pestañas: ver el punto siguiente. Turismos: sigue sin formulario grabado (`AUTO_ACTIVO=false`, hueco).
- **Avance de pestaña AUTORIZADO (Alberto, 13/10/2026, «no hay problema con aceptar»)**: SOLO Moto, SOLO `td#datosBasicos` (Riesgo municipio → Datos básicos) y `td#rate` (Datos básicos → Tarificar), por `pulsarAvancePestanaAutorizado` de `guard.ts` (lista blanca cerrada; id, texto, `onclick` y `form#formulari` de origen exactos; una vez por trabajo). En Tarificar solo se abre la pestaña y se leen primas. **Riesgo aceptado: puede quedar un PROYECTO guardado en Allianz** (nunca póliza).
- Ventana de red del clic (≤20 s, se cierra en `finally`): capa (a) `parametrosParecenEmision` en query y cuerpo (store/contract/validar_aceptar/emitir… abortan y el trabajo cae); capa (b) todo no-GET a un destino fuera de la lista exacta se aborta. Lista: el `action` del formulario de origen (`/drpc18/riesgoMunicipio/control.do`, `/drpc18/datosBasicos/control.do`), sacada del DOM de la grabación: **la grabación no registra la red** → fail-closed; si en real sale otro POST, el trabajo muere y se añade tras verlo.
- Sigue prohibido: Emitir, Contratar, Formalizar, Grabar, Archivar, pie de Tarificar, Proyecto Ampliado, Datos emisión, Pago fraccionado, Siguiente a Revisión, RGPD «Sí». Flag propio `MOTO_ACTIVO=false` (`allianz/auto.ts`): `adapters/index.ts` registra `allianzMoto` SOLO con él en `true`; el runner ya valida por ramo (`src/ramo.ts`: comunidades → `validarRiesgoComunidad`, auto/moto → `validarFormularioAuto`). Solo se aplica «aceptar» a peticiones hacia la lista blanca; un diálogo del portal nunca se acepta (confirm → cae; alert → `datos`); si el portal rechaza el avance, su informe de incidencias sale como `datos`.
- **Primera prueba real de Moto (13/10/2026; lo decide Alberto, nada se enciende solo).** Cadena: plataforma `POST /api/correduria/tarificador/encolar {clienteId, ramo:'moto', riesgo: FormularioAuto con seleccionVehiculo}` (sin pantalla propia aún) → asegura `/api/operador/tarificador/encolar` (valida con `validarFormularioAuto`) → worker → `allianzMoto`. Pasos: (1) aplicar `apps/asegura/prisma/sql/2026-10-13_tarificador_moto.sql` (fila `allianz/moto` en `companias_integracion`, nace `activo=false`) y activarla: `update seguros.companias_integracion set activo = true where compania='allianz' and ramo='moto'`; (2) poner `MOTO_ACTIVO = true` en `allianz/auto.ts` y construir la imagen nueva (`fly deploy … --build-only --push --image-label <etiqueta>`, README del servicio); (3) `TARIFICADOR_FLY_IMAGE` de Vercel (asegura) = esa imagen y redeploy; (4) con `TARIFICADOR_RPA_ACTIVO=1` y el fly secret `CRED_ALLIANZ_EPAC_*` ya puestos, pedir el trabajo (cliente de PRUEBA) y mirar la bandeja/traza. Riesgo aceptado: puede quedar un proyecto en Allianz, nunca una póliza. Con el flag apagado el trabajo cae como `datos` («sin adaptador») sin abrir el navegador.
- Prohibido siempre (guard ampliado): td#store «Archivar» (`sendActionEvent('store')`), td#contract «Emitir», el pie de Tarificar (`validar_aceptar()`). La matrícula nunca va a logs/mensajes; el grabador ahora tapa matrícula, fecha de matriculación y bastidor.

## Mapfre Auto · NSEI (en construcción, 13/10/2026)

`services/tarificador-rpa/src/adapters/mapfre/auto.ts`, `MAPFRE_AUTO_ACTIVO=false`, sin registrar (`adapters/index.ts` no lo conoce; lo vigila `test/mapfre-auto.test.ts`). Fuente: una grabación de 19 pantallas de wmediadores.mapfre.com (app NSEI, SPA Angular Material **sin iframes**: todo legible). **Llega a precio**: 3 productos con «PRIMA TOTAL» anual en el paso 4 Coberturas (`app-primas > prima-producto`; `.caja-primas p strong`; icono `.ccttVerificacion .warning-color` = exige verificar el vehículo antes de contratar). Selectores por `name`/`formcontrolname` con ámbito de componente (`app-datos-vehiculo`, `app-conductor-habitual`, `app-historial-siniestralidad`…); los `mat-input-N` NO se usan (contadores de Angular Material). Hecho: mapa de pantallas, lector de primas, lector de filas del diálogo «Selección de vehículo» (sin matrícula ni bastidor), lector del «Resumen vehículo», plan de campos de texto con `comprobarCampo`. **Nada pulsa**: faltan (a) login y entrada (la grabación empieza ya dentro de NSEI), (b) el avance «Continuar» (el del paso 3 calcula las primas: decisión de Alberto), (c) elegir fila y confirmar el diálogo de vehículo, (d) los `mat-select` (uso, ámbito, clase de permiso, compañía anterior: no se grabaron abiertos), (e) la búsqueda del tomador/conductor por NIF (lupa). Mapfre no separa marca/modelo/versión (una sola «denominación comercial»): el `Vehiculo` canónico no se puede construir sin decidir cómo partirla. **Guard**: «Generar Proyecto» / «Ir a generar proyecto» (crean un nº de proyecto y documentación) están PERMITIDOS por decisión de Alberto del 13/10/2026 («el bot SÍ puede hacer proyectos»): no los bloquea `guard-emision.ts`. Sigue prohibido emitir/contratar/formalizar/grabar póliza, pago y RGPD «Sí»; «Contratar» y todo «Aceptar» siguen bloqueados. «Calcular» pasa.

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

**Moto: clase y cilindrada** (`FormularioAuto.seleccionVehiculo {marca, modelo, clase, cilindradaCc, descripcion?}`, nombres de catálogo): clase 1 = 51-125 cc · 2 = 126-350 · 3 = 351-750 · 4 = >750. `cilindradaCc` es OBLIGATORIA en moto (Allianz separa Moto y Ciclomotor); ≤50 cc = ciclomotor = otro producto de Allianz, NO soportado (se rechaza en `validarFormularioAuto` y en `tarificarMoto`); clase que no casa con las cc = error. `descripcion` (≤200 car., p. ej. «BMW F 800 S 85 CV») es solo del vehículo: se rechaza si parece matrícula, NIF/NIE, email, teléfono, IBAN o bastidor (`pareceDatoPersonalEnDescripcion`) y el error nunca repite el valor.

**Límites conocidos (no resueltos)**
- `buscarPoblacion`: si el CP deja varias poblaciones sin mapear (ventana/lista), lanza `ErrorMapaIncompleto`; falta una grabación de Alberto de esa pantalla. No se adivina.
- Allianz Turismos (coche): sigue con mapa SUPUESTO, pendiente de regrabar (`AUTO_ACTIVO=false`).
- `reclamarSiguiente` cuenta los `en_curso` para el cupo sin mirar `lease_hasta`: un lease vencido ocupa hueco hasta que lo barre `barrerTarificadorRpa`.
- Ese barrido no tiene cron propio: solo corre desde el cron de renovaciones (`/api/cron/tarificador-renovaciones` → `tarificador-ops`).
- `encolarTrabajo` no deduplica: encolar dos veces lo mismo crea dos trabajos.
- La memoria solo cubre `tipo='version'` (la lista de poblaciones por CP aún no usa `elegirDeLista`).

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
- **Envs:** `TARIFICADOR_EXPLORADOR_ACTIVO=1`, `TARIFICADOR_EXPLORADOR_MODELO` (por defecto `anthropic/claude-sonnet-4.5`, por OpenRouter con `modeloOpenRouter` de la pasarela: NO con `model`, que es el pin a NIM). SQL `2026-10-13_tarificador_explorador.sql` (NO aplicado).

## Rutina «Médico del bot tarificador»
`trig_011zoZZAiTQnQ48qEWdRJq2Y`: laborables 8:52 Madrid; mira Supabase + repo; abre PR **draft**; **nunca mergea**.

## Decisiones de Alberto
- **Allianz NO se avisa** del acceso automatizado: riesgo de bloqueo asumido (volumen bajo, ritmo humano).
- Todo lo hacen agentes, ahorrando tokens.
- **Nunca desplegar imagen desde una rama sin su OK** (preview/producción: la imagen de Fly es única).
- Auto/hogar/moto/vida/salud/decesos se quedan en **Avant2** (la API de Codeoscopic no cubre comunidades/RC/comercio).

## PLAN
1. Confirmar Allianz Comunidades con una **cotización real desde Oportunidades** (PDF + sesión).
2. Comunidades con **Occident (Catalana Occidente)** vía grabador → comparador.
3. RC con Occident.
4. Comercio, más adelante.

Por qué (cartera, 06/10): 103 pólizas en vigor de estos ramos/compañías; Occident ~46; Comunidades 4; RC 12; **13 pólizas Allianz sin prima cargada → revisar.**

## Pendientes en vivo
Cotización real de punta a punta (paso 1) · validar umbrales de infraseguro · revisar las 13 pólizas Allianz sin prima · rotar la contraseña de Occident que viajó en claro en un correo de Codeoscopic (08/06) · confirmar que los fly secrets llegan a las máquinas de la API de Machines.
