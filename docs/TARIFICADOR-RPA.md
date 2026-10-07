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
`TARIFICADOR_RPA_ACTIVO` (=1; apagado por defecto) · `TARIFICADOR_FORMADOR_ACTIVO` · `TARIFICADOR_RENOVACIONES_ACTIVO` · `TARIFICADOR_GRABADOR_MAX_LLAMADAS` · `TARIFICADOR_WORKER_SECRET` · `FLY_API_TOKEN` · `TARIFICADOR_FLY_APP` · `TARIFICADOR_FLY_IMAGE` · `TARIFICADOR_API_URL`.

## SQL aplicados (`apps/asegura/prisma/sql/`)
`2026-10-05_tarificador_rpa` · `2026-10-06b_tarificador_formador` · `2026-10-06c_tarificador_formador_revoke` · `07b` · `07c` (los dos últimos, de la sesión del 07/10; ver su cabecera). Mira `2026-10-06_tipo_seguro_ramos_ofertas` para los ramos de ofertas.

## Allianz RC PYME (en construcción)
- App 1430 (`/drrg01/pme1430`). **No registrado** en `adapters/index.ts` (`RC_PYME_ACTIVO = false`); el tipo `RamoRpa` aún solo admite `comunidades`.
- Hecho: entrada común «Nueva Alta» (`allianz/entrada.ts`, compartida con Comunidades; pestaña Empresas por texto, TODO selectores reales); lector de primas de `#tarifaViewForm` (`rc-pyme.ts`: 27 inputs readonly sin id; neta idx 0, impuestos 6, total 12; fail-closed si no son 27 o no cuadra); guard ampliado (menu3/4/5, #btnAccept, #btnFracciona, «Pago fraccionado»).
- HUECO: «Datos básicos» (td#menu1: actividad con tabla de códigos Allianz, facturación, empleados, límites, ámbito, siniestros) lanza `ErrorMapaIncompleto`. Faltan también: nombre de la tarjeta RC PYME en el modal, cómo se llega a Calcular (`#btnRetarifa` duplicado: anclar por sección), Proyecto/IPID (PDF), pantalla de bloqueos, mapeo a `OfertaNormalizada` y ramo `rc_pyme` en el contrato.
- Prohibido siempre: Archivar, Proyecto ampliado, Datos emisión, Aceptar (#btnAccept → emision_ipid), Pago fraccionado.

## Allianz Negocio 2038 (en construcción)
- `allianz/comercio.ts` (`COMERCIO_ACTIVO=false`, no registrado): hecho paso 4 «Datos» (tomador canónico `tomador.ts`, solo `fill`, RGPD intacto) y lector de prima `.alz-presupuesto-precio span` (fail-closed); HUECO pasos 1-3 (`ErrorMapaIncompleto`); prohibido «Siguiente» (#idbtnAceptar → Revisión), bloqueado en el guard.

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
