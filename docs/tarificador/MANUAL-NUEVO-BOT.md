# Manual: crear el bot tarificador de una compañía nueva

> Lo primero que lee una conversación nueva de Claude cuyo encargo es «bot de <compañía>» (Mapfre, etc.).
> Sin datos personales ni valores reales: solo rutas, claves de catálogo y nombres de variable. Revisado: 14/10/2026.
> Detalle vivo: `docs/TARIFICADOR-RPA.md` (estado, DOM, decisiones) · `docs/tarificador/CONOCIMIENTO-PORTALES.md`
> (qué sabemos de cada portal) · `services/tarificador-rpa/README.md` (técnica del worker) · `apps/asegura/CLAUDE.md`
> (sección «Tarificador RPA»). Lee también el `CLAUDE.md` de la raíz (agentes ejecutan, la sesión ordena y revisa).

## 1. Arquitectura en 10 líneas
1. **Plataforma** (`apps/plataforma`, `/correduria/oportunidad/[id]` y `/correduria/tarificador/exploraciones`) es la pantalla de Alberto; no tiene BD del tarificador, habla con asegura por proxy (`/api/correduria/tarificador/*`).
2. **asegura** (`apps/asegura`) es la trastienda: puerto `/api/operador/tarificador/*`, BD schema `seguros` (cola `tarificacion_trabajos`, `tarificador_exploraciones`, `companias_integracion`), orquestador `apps/asegura/lib/tarificador*.ts`.
3. Encola y lanza una máquina **Fly efímera** (`asegura-tarificador`, una por trabajo, imagen `TARIFICADOR_FLY_IMAGE`).
4. El **worker** (`services/tarificador-rpa`, Playwright, FUERA del workspace pnpm) hace login con `CRED_<CLAVE>_USER/_PASS` (fly secrets) y ejecuta el **adaptador** de la compañía (`src/adapters/<compañía>/`).
5. Para portales nuevos primero se **explora**: `src/explorador.ts` (worker) manda a asegura el inventario SANEADO de cada pantalla (`POST /api/tarificador/explorador/paso`); asegura responde un lote de acciones de lista blanca (memoria del mapa o IA del explorador vía OpenRouter, `apps/asegura/lib/tarificador-explorador*.ts`), validado por `validarRespuestaExplorador` (`packages/module-tarificacion/src/explorador.ts`).
6. El worker REVALIDA el lote contra su inventario propio, ejecuta (`rellenar`/`elegir`/`marcar`/`avanzar`/`terminar`/`parar`) y la IA nunca ve valores: solo claves del catálogo; el valor lo pone el worker (`resolverDato`).
7. Al terminar, `POST …/cierre`: asegura construye el **MAPA** determinista (pantallas, campos, selectores, huecos, `detalleFin`) y lo guarda como `borrador`.
8. Alberto lo revisa en plataforma (Exploraciones → «Aprobar mapa» = solo marca `revisado`, no genera código ni enciende nada).
9. Con el mapa revisado se escribe el **adaptador real** (tarifica, lee precio, guarda presupuesto, descarga PDF) y se registra en `src/adapters/index.ts` tras un flag apagado.
10. El módulo puro `packages/module-tarificacion` (riesgo canónico, capacidades, guardas de emisión, catálogo) lo comparten asegura, plataforma y worker.

## 2. Reglas duras (no negociables)
- **TARIFICAR ≠ EMITIR.** Nunca se emite sin OK de Alberto por Telegram + aceptación del cliente (`docs/TARIFICADOR-EMISION-DISENO.md`). Guardián: `test/regression-tarificador-rpa.test.ts`; guard en `services/tarificador-rpa/src/guard.ts` y `packages/module-tarificacion/src/guard-emision.ts`. Pulsar solo con `ctx.pulsar()`; jamás `.click()` directo.
- **Frontera de emisión por campos:** una pantalla con campo de IBAN / cuenta bancaria / número de cuenta / domiciliación / titular de la cuenta / entidad bancaria / SWIFT-BIC es emisión: el explorador para (`cerca_de_emision`) sin dárselo a la IA (`CAMPOS_BANCARIOS` en `acciones-portal.ts`). La fecha de efecto sola NO para; sí junto a un campo bancario. En un portal nuevo, revisa que sus etiquetas de cuenta casen.
- **«Proyecto ampliado» es GUARDAR** (descargar el proyecto), no prohibido: solo en resultado con importes y `efectoEsperado: guardar_presupuesto`, dentro del tope de guardados; combinado con «emitir» sigue bloqueado.
- **El bot hace todo lo demás:** rellenar, tarificar, **GUARDAR el presupuesto/proyecto con su referencia y descargar el PDF** una vez visto el precio. Generar proyecto está permitido (Alberto, 13/10/2026); Emitir/Contratar/Formalizar/Grabar póliza/Pago/Firma/IBAN no.
- **No automatizar SMS/OTP ni CAPTCHA:** `requiere_humano` + aviso (modo `sesion: 'manual'` si el portal pide SMS: `src/boveda-sesion.ts`).
- **Nada de datos personales** en código, tests, fixtures, docs, logs, commits ni chat. Credenciales solo como fly secrets; en docs, solo el nombre de variable.
- **La IA nunca ve valores**, solo claves de catálogo. Excepción cerrada: uso, régimen y tipo de vivienda de Hogar, con su significado en español (`CLAVES_VALOR_VISIBLE_IA`, `ETIQUETAS_ID_HOGAR` en `riesgo-oportunidad.ts`). Un id fuera del mapa cerrado no se traduce ni se adivina.
- **Datos reales solo anclados a una oportunidad/tarificación real del MISMO cliente** (`riesgo-oportunidad.ts`). Para llegar a la pantalla que pide NIF, exploración **sintética**; si piden NIF y no hay datos reales, se PARA.
- **Nunca mezclar** datos reales con valores de prueba en una misma exploración.
- **Elegir/marcar con datos reales solo sobre claves con valor real.** Si el portal exige un desplegable/radio sin valor real disponible → `dato_no_disponible`, no se rellena «lo más parecido».
- **Ante la duda, parar** (fail-closed). Nunca «la opción más parecida»; las etiquetas se casan EXACTAS (sin mayúsculas/tildes/espacios), nunca «contiene».
- **A la compañía no se la contacta.** Ni correos ni llamadas; el portal se usa como un mediador.
- **Pregunta a Alberto lo que no sepas del portal:** él lo conoce (menús, significado de opciones, qué botón es seguro). Tú propones con la evidencia (inventario/mapa); él decide.
- Una exploración viva por compañía. Nunca desplegar imagen desde una rama sin su OK (la imagen de Fly es única).
- Un cepo no está terminado hasta verlo FALLAR (rompe lo que protege, míralo en rojo, restaura). Uso/régimen de Hogar siempre explícitos, sin valor por defecto.

## 3. Alta de una compañía nueva (checklist de piezas)
1. **BD:** SQL idempotente en `apps/asegura/prisma/sql/AAAA-MM-DD_<tema>.sql` con la fila en `seguros.companias_integracion` (`compania`, `ramo`, `modo='rpa_autorizada'`, `nota_autorizacion`, `credencial_clave`, `max_concurrencia`, `activo=false`). Modelo: `2026-10-13c_tarificador_explorador_fase_b.sql`. Nace APAGADA; la enciende Alberto. Se aplica con la sesión de Supabase de asegura, nunca a ciegas.
2. **Credenciales:** `CRED_<CLAVE>_USER` / `_PASS` como fly secrets de `asegura-tarificador` (`<CLAVE>` = `credencial_clave`, p. ej. `ALLIANZ_EPAC`). Pide a Alberto que los ponga; tú solo nombras la variable. Nunca `DATABASE_URL`/`CODEOSCOPIC_*` en el worker.
3. **Login y entrada:** función de login por código (con `exigirSinCaptcha` y detección de 2FA/SMS → parar) y entrada común del portal (casi todas: Venta → «Nueva Alta» → producto). Referencia: `src/adapters/allianz/entrada.ts` (`loginEpac`, `abrirNuevaAlta`, `etiquetaProducto`). Regístrala en `PORTALES_EXPLORACION` (`src/explorador.ts`).
4. **Entradas del explorador (lista cerrada):** una clave `compania:seccion:producto` en `ENTRADAS_EXPLORACION` (`packages/module-tarificacion/src/explorador.ts`) con `pestana`, `productoMenu` (etiqueta EXACTA del portal) y, solo si Alberto lo autoriza, `avancesAutorizados` (patrón texto + título de pantalla + títulos prohibidos).
5. **Catálogo de claves:** reutiliza las de `CATALOGO_EXPLORACION` (`tomador.*`, `inmueble.*`, `hogar.*`…, cada una con `personal`, `fuente`, `sintetico`, `rutaRiesgo`). Clave nueva = en el catálogo, con test; la IA solo conoce lo que está ahí. Marca como `personal: true` todo dato de persona.
6. **Capacidad y riesgo canónico:** declara ramo y extras en `packages/module-tarificacion/src/capacidades.ts`; el formulario de Oportunidades no cambia. Riesgo con datos reales: `riesgo-oportunidad.ts`.
7. **Adaptador** (tras mapa revisado): `services/tarificador-rpa/src/adapters/<compañía>/<ramo>.ts` con flag `<X>_ACTIVO=false`, `ErrorMapaIncompleto` en los huecos (nunca inventar selectores), lector de precio fail-closed, y registro en `adapters/index.ts` solo bajo el flag. Si usa guard por fase, función guardada en `guard.ts` (lista blanca cerrada, una vez por trabajo).
8. **Tests con fixtures:** HTML sintético y redactado (nunca evidencia real sin pasar por `redactarHtml`). Puros en `packages/module-tarificacion/src/*.test.ts` y `apps/asegura/lib/*.test.ts`; del worker, `npm test` en `services/tarificador-rpa`. Ejemplo de adaptador en construcción: `src/adapters/mapfre/auto.ts` con `test/mapfre-auto.test.ts`.
9. **Guardianes:** ampliar `test/regression-tarificador-rpa.test.ts` (sin `.click()`, sin emisión, lista blanca) y, si el portal tiene botones peligrosos propios, su patrón en `guard-emision.ts` con test en rojo antes de darlo por bueno.
10. **Docs:** sección de la compañía en `docs/tarificador/CONOCIMIENTO-PORTALES.md` (pantallas, teselas, trampas) y estado en `docs/TARIFICADOR-RPA.md`.

## 3 bis. Entrada al formulario (patrón general, decisión de Alberto, 14/10/2026)
Patrón preferido para TODAS las compañías:
1. **Login siempre** por la URL de acceso en cada ejecución (máquina nueva, sin sesión guardada).
2. **Ya logueado, `goto` a la URL DIRECTA del formulario del producto** (no por menús).
3. **Respaldo:** si el formulario no aparece (sesión caducada, redirección al login, URL que cambió), ruta por menús; si tampoco, parar con `ErrorMapaIncompleto` citando ambos intentos.

Por qué: es más rápido, tiene menos clics (cada clic es un punto de fallo y de guard) y evita menús desplegables e iframes.

Condiciones para adoptar la URL directa en un portal:
- Que sea estable y **SIN tokens/ids de sesión ni datos personales** en la URL. Si lleva parámetros de sesión, no vale: menús.
- Que el formulario no dependa de un contexto que solo fijan los menús (producto/acuerdo seleccionado en servidor). Se confirma con una exploración real.
- La navegación por URL **no pasa por el guard de botones**: la URL constante se comprueba con un test contra `PATRON_EMISION`.

Estado: **Mapfre Auto (NSEI)** adopta el patrón (`https://wmediadores.mapfre.com/evt21_nsei_fe-web/#/evt21_nsei_fe-web/autos/oferta`). **Allianz y demás:** pendientes de revisar con su URL de producto; no se cambian todavía.

## 4. Bucle de trabajo
1. **Explorar.** Sintética para llegar hasta la pantalla que pide NIF; con datos reales solo anclada a oportunidad real (`encolarExploracion`, `apps/asegura/lib/tarificador-explorador.ts`). Topes duros: 30 llamadas IA, 80 acciones, 40 pasos, 15 min, 2 € (el env solo los baja). Envs: `TARIFICADOR_EXPLORADOR_ACTIVO=1`, `TARIFICADOR_EXPLORADOR_MODELO`, contacto `TARIFICADOR_EXPLORADOR_EMAIL/_TELEFONO` (de Alberto, solo env).
2. **Leer** en plataforma (`/correduria/tarificador/exploraciones`) o por el puerto: mapa, `huecos`, `motivoFin`, `detalleFin` (códigos cerrados de `DETALLES_FIN_EXPLORACION`). Sin pegar datos de clientes en el chat.
3. **Arreglar** el worker/adaptador/catálogo (agentes ejecutan; tests puros primero). Sube `EXPLORADOR_VERSION` si tocas la navegación. **Cada fallo arreglado deja fila en la Bitácora común de errores (`CONOCIMIENTO-PORTALES.md`).** Y antes de arreglar o dar de alta un bot, se lee esa tabla entera.
4. **Reconstruir la imagen:** workflow `.github/workflows/tarificador-rpa-imagen.yml` (`workflow_dispatch`, input `etiqueta`; minúsculas, números, `. _ -`). Referencia en el resumen del run: `registry.fly.io/asegura-tarificador:<etiqueta>`. Pide OK de Alberto antes de lanzarlo desde una rama.
5. **Actualizar `TARIFICADOR_FLY_IMAGE`** en Vercel, proyecto `central-asegura`.
6. **Redeploy de asegura** (las envs solo se leen en un deploy nuevo; orden: asegura antes que plataforma si hay contrato nuevo).
7. **Relanzar desde plataforma.** Solo Alberto puede pulsar «Lanzar» (exige el secreto de operador); tú no lo lanzas. Una exploración viva por compañía: si hay una viva, no encoles otra.
8. Repetir hasta que el mapa llegue a precio; entonces «Aprobar mapa» (Alberto) y adaptador real.

## Borrador de mapa desde la evidencia de un fallo

Cada fallo guarda en su HTML de evidencia la sección `<!-- tarificador:aria … -->` (árbol de accesibilidad redactado, sin valores).
Con ella se genera en segundos un BORRADOR de mapa TypeScript de esa pantalla (determinista, sin IA, offline, fuera del worker):

```
cd services/tarificador-rpa
npm run borrador-mapa -- <evidencia.html|snapshot.txt> --compania allianz --ramo comunidades --pantalla datos-riesgo [--salida borrador.ts]
```

Sale un `CAMPOS_<PANTALLA>` con localizadores `getByRole(..., { exact: true })` encadenados por `frameLocator`, los desplegables con sus
opciones, los diálogos (listas de poblaciones) y los mensajes de error. Los `// TODO` marcan lo ambiguo (nombres duplicados, controles
sin nombre, radios sin grupo). NO se registra solo: revísalo a mano, pruébalo con `scripts/probar-formulario.ts` y métela en un PR.
Código: `src/aprendizaje/borrador-mapa.ts`.

## 5. Lecciones aprendidas con Allianz (técnicas, sin datos)
- **Iframe tardío:** el formulario carga en `iframe#appArea` y tarda; espera hasta 30 s al marco (`esperarMarcoApp`) antes de inventariar, o inventarias la carcasa.
- **Teselas y acordeones:** «Nueva Alta» muestra acordeones plegados (hay que desplegar la sección) con teselas por etiqueta EXACTA. «Allianz HOGAR» ≠ «Hogar» (causó un timeout); Hogar y Negocio Plus están en Particulares, no en Autos.
- **`nx-dropdown` de Angular, no `<select>`:** no vale `selectOption`; se abre, se lee la lista y se elige por valor exacto (`opcion_no_aplicada` si el portal no deja exactamente esa opción). Comprueba si «Siguiente» está deshabilitado hasta rellenar obligatorios.
- **Autocompletado tras el CP que repinta la pantalla:** tras rellenar CP/provincia/municipio (`CLAVES_AUTOCOMPLETADO`) hay que CORTAR el lote y reinventariar; los refs viejos ya no valen (`cortarLoteTrasRellenar`, `repintados_seguidos`).
- **Buscador de poblaciones:** un CP puede dar varias poblaciones; una → se pulsa, varias → `resolverPoblacion` (`poblacion.ts`) con elección explícita o `ErrorEleccionPoblacion`; la IA no las elige. Mira que `#_destown` quede relleno.
- **Versiones de vehículo:** varias versiones → parar con la lista completa; elección de IA solo con confianza `alta` y código EXACTO, o persona/memoria (`eleccion-lista.ts`, `eleccion-memoria.ts`). Código del vehículo canónico reutilizable: `vehiculo.ts`.
- **Motivos de parada tipados:** `MOTIVOS_PARAR` (`explorador.ts`) es la FUENTE ÚNICA; el prompt de asegura se genera de ahí. Motivo nuevo = añadirlo con su descripción, en un solo sitio. **El motivo de la IA ≤ 200 caracteres** (`recortarMotivo`); más largo hizo fallar la validación.
- **Año y m²:** obligatorios en Allianz Hogar y no autocompletados antes de avanzar; se completan desde Catastro SOLO si es inequívoco (`apps/asegura/lib/tarificador-explorador-catastro.ts`); si no, el riesgo no se encola. Nunca se inventan ni se sobrescriben.
- **Uso y régimen obligatorios y explícitos** (habitual/secundaria/alquiler/turístico; propietario/inquilino): deciden la tarifa; sin ellos no hay riesgo.
- **Botones que no son botones:** Calcular/Aceptar son `div` con `onclick`; los avances se identifican por id, texto, `onclick` y formulario de origen exactos, y el «Aceptar» de otra pantalla puede EMITIR.
- **La grabación no registra la red:** los avances autorizados se vigilan con ventana de red (aborta no-GET fuera de la lista); si sale un POST nuevo, el trabajo muere y se añade tras verlo.
- **Precio:** ePAC mostraba «Anual» = primer recibo prorrateado y «Sucesivos» = prima anual real; verifica siempre el precio contra el portal con una cotización conocida antes de confiar en el lector.
- **Entrada que abre PESTAÑA NUEVA:** `PortalExploracion.entrar` devuelve esa `Page` y el bucle sigue en ella; las páginas de la entrada no cuentan, una abierta durante el bucle sigue siendo `sin_salida` (`entrarYExplorar`).
- **«Emisión» como sustantivo de menú:** nunca relajar `PATRON_EMISION`; excepción por TEXTO EXACTO, por compañía y solo en la entrada (`ENLACES_ENTRADA_AUTORIZADOS`, `pulsarEnlaceEntradaAutorizado`).
- **Frontera de emisión = campo de cuenta bancaria** (todas las compañías): nunca se rellena; si aparece, el bot PARA sin pulsar nada (`ErrorFronteraEmision`; en el explorador, fin correcto `frontera_cuenta_bancaria`).
- **SPA sin iframes (Mapfre NSEI, Angular Material):** selectores por `name`/`formcontrolname` con ámbito de componente; los `mat-input-N` son contadores, no se usan.

## 6. Checklist «bot listo»
- [ ] Llega a precio de punta a punta con una cotización real (desde Oportunidades) y el precio coincide con el del portal.
- [ ] **Guarda** el presupuesto/proyecto con su referencia y **descarga el PDF** (`src/descarga-pdf.ts`).
- [ ] Mapa de la exploración en estado `revisado` por Alberto; sin huecos abiertos que el adaptador no cubra.
- [ ] Tests (puros + fixtures redactados) en verde; `pnpm test` en raíz y `npm test` en el worker; typecheck de asegura/plataforma (cliente Prisma regenerado antes).
- [ ] Guardianes ampliados y vistos en rojo (emisión, `.click()`, lista blanca, flags apagados, sin PII).
- [ ] Sin datos personales en el diff (revisa fixtures, logs, mensajes de error, nombres de test).
- [ ] Flag del adaptador y fila de `companias_integracion` apagados por defecto; Alberto los enciende.
- [ ] Imagen reconstruida, `TARIFICADOR_FLY_IMAGE` actualizada, asegura redeplegada.
- [ ] Docs al día: `CONOCIMIENTO-PORTALES.md`, `TARIFICADOR-RPA.md`, este manual si hay lección nueva.
- [ ] Cada fallo arreglado deja fila en la Bitácora común de errores (`CONOCIMIENTO-PORTALES.md`).
- [ ] Entrada nueva ARRIBA en `docs/CONTEXTO-SESIONES.md` (≤ 8 líneas, fecha dd/mm/aaaa).

## 7. Plantilla del PROMPT inicial (Alberto la pega en la conversación nueva)

```
Vamos a crear el bot tarificador de <COMPAÑÍA> para el producto <PRODUCTO/RAMO> (Grupo ASegura).

LEE PRIMERO, en este orden (sin volcarlos enteros; busca con Grep lo que necesites):
1. CLAUDE.md de la raíz y apps/asegura/CLAUDE.md (sección «Tarificador RPA»).
2. docs/tarificador/MANUAL-NUEVO-BOT.md  <- tu guía de trabajo.
3. docs/tarificador/CONOCIMIENTO-PORTALES.md y docs/TARIFICADOR-RPA.md.
4. Código de referencia: services/tarificador-rpa/src/explorador.ts, src/adapters/allianz/ (entrada.ts, comunidades.ts),
   packages/module-tarificacion/src/explorador.ts y apps/asegura/lib/tarificador-explorador*.ts.

REGLAS (no se discuten): nunca emitir sin mi OK por Telegram y la aceptación del cliente; el bot SÍ rellena, tarifica,
guarda el presupuesto con su referencia y descarga el PDF; no automatizar SMS/OTP/CAPTCHA; cero datos personales en
código, tests, docs y logs; la IA solo ve claves, nunca valores; datos reales solo anclados a una oportunidad real del
mismo cliente y nunca mezclados con valores de prueba; ante la duda, parar; no se contacta a la compañía.

TRABAJO: sigue el manual (alta de compañía -> exploración sintética hasta la pantalla del NIF -> leer mapa y huecos ->
arreglar -> imagen -> TARIFICADOR_FLY_IMAGE -> redeploy -> relanzar). Tú ordenas y revisas; los agentes ejecutan.
Yo pulso «Lanzar» y autorizo cada avance que toque el portal.

DATOS QUE YA TE DOY: portal/URL de acceso: <...> · variable de credenciales: CRED_<CLAVE>_USER/_PASS (ya puestas / por poner)
· ruta de menú al producto: <...> · particularidades (SMS, CAPTCHA, iframes): <...>.

PREGÚNTAME todo lo que no sepas del portal (menús, significado de opciones, qué botón es seguro): lo conozco y prefiero
responder a que supongas. Al terminar: checklist «bot listo» del manual y entrada en docs/CONTEXTO-SESIONES.md.
```
