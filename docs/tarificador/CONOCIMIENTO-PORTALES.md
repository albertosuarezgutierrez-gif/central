# Conocimiento de portales del tarificador RPA

> Qué sabemos de cada portal de compañía y cómo se trabaja con él. Sin datos personales ni valores reales:
> solo nombres de pantalla y claves de catálogo. Estado vivo, DOM detallado y plan: `docs/TARIFICADOR-RPA.md`.
> Técnica del worker: `services/tarificador-rpa/README.md`. Revisado: 14/10/2026.

> **Crear el bot de una compañía nueva: lee primero `docs/tarificador/MANUAL-NUEVO-BOT.md`.**

## Capa común (todas las compañías)

- **Navegación:** casi todas las compañías tienen el menú **Venta → «Nueva Alta»**, que lista TODOS los
  productos. Cada producto abre su formulario; se rellena y se pide presupuesto.
- **Ante cualquier duda sobre un portal, PREGUNTAR a Alberto** antes de suponer. Él conoce los portales.
  El bot manda la información (inventario de la pantalla, mapa) y la IA ayuda a resolver los errores de
  navegación; el significado de una opción de negocio lo fija Alberto.
- **Datos que determinan la tarifa en Hogar: SIEMPRE explícitos, nunca valor por defecto.**
  - **USO** de la vivienda: habitual · secundaria · alquiler · turístico.
  - **RÉGIMEN**: propietario · inquilino.
  - Si la opción del portal no encaja exactamente con la nuestra, la IA PARA. No elige la más parecida.
- **Año de construcción y m²:** los portales los autocompletan desde Catastro al introducir la dirección.
  No se inventan ni se sobrescriben.
- **Primera pantalla típica de Hogar:** datos del tomador (tipo y nº de documento, fecha de nacimiento…) y
  datos de la vivienda a asegurar (CP, provincia, población, vía, número, planta/puerta…). Después, «Siguiente».
- **Mapa por producto:** cada exploración define los datos necesarios por producto. Ese mapa es la base del
  formulario de recogida en plataforma (campos comunes + específicos de cada compañía).
- **Reglas:**
  - La IA nunca ve valores: elige claves de catálogo y el worker inyecta el valor.
  - Para pedir NIF se hace una exploración sintética.
  - Datos reales SOLO anclados a una tarificación u oportunidad real del mismo cliente.
  - Nunca mezclar datos reales con valores de prueba.
  - Nada de emitir sin OK de Alberto (TARIFICAR ≠ EMITIR).
  - **Frontera de emisión = cuenta bancaria (Alberto, 14/10/2026).** Flujo de todas las compañías: presupuesto (el bot
    lo hace entero, lo guarda y baja el PDF) → al aceptarlo el portal pasa a emisión, que pide fecha de efecto + **número
    de cuenta** + confirmar datos → Emitir. Sin cuenta no se emite: el bot NUNCA escribe ni elige en un campo de cuenta
    (IBAN, CCC, entidad/oficina/DC, «número de cuenta», domiciliación, BIC/SWIFT), y si uno APARECE en pantalla PARA sin
    pulsar nada más: «frontera de emisión: el portal pide cuenta bancaria («etiqueta»)». En el explorador es fin correcto
    (`cerca_de_emision` + detalle `frontera_cuenta_bancaria`). Código: `RE_CAMPO_CUENTA_BANCARIA` / `senalCuentaBancaria`
    (módulo) y `ErrorFronteraEmision`, `exigirSinCuentaBancaria` (en `pulsar()`), `exigirCampoNoBancario` (en
    `comprobarCampo`) de `guard.ts`.
  - **«Emisión» como sustantivo de menú:** excepciones EXACTAS y por compañía en `ENLACES_ENTRADA_AUTORIZADOS` (`guard.ts`),
    solo en la fase de ENTRADA (nunca en el bucle IA). Un bloqueo del guard lleva el texto exacto del elemento en el
    mensaje: se desbloquea uno a uno, con OK de Alberto.
- **Guardar el presupuesto SÍ; emitir NO (Alberto, 13-14/10/2026: «el bot tiene que hacer absolutamente todo, menos la
  emisión […] el presupuesto hay que guardarlo; lo guardas con la referencia y ahí te descarga el presupuesto»).**
  - Lista ÚNICA en `packages/module-tarificacion/src/acciones-portal.ts` (`ACCIONES_PORTAL`): de ella salen el prompt del
    explorador, el validador y el guard del worker. Tres categorías:
    - **Emisión — prohibida siempre:** Emitir, Contratar, Formalizar, Firmar, Pagar/Pago, Pago fraccionado, Tramitar póliza,
      Confirmar contratación, Domiciliar, Suplemento, Anular/Baja, `validar_aceptar`/`btnAccept`.
    - **Prohibida (no emite, pero no se pulsa):** Enviar, Salir/Cerrar sesión.
    - **Guardar presupuesto — permitida SOLO en la pantalla de resultado (con el precio a la vista) y con
      `efectoEsperado: 'guardar_presupuesto'`:** Grabar, Guardar (presupuesto/proyecto), Archivar (ePAC `td#store`,
      `action=store`), **Proyecto ampliado** (Alberto, 14/10/2026: «es el proyecto que hay que descargarse»; mismas condiciones que
      Descargar y cuenta en el tope de `pulsarGuardadoPresupuesto`; «Proyecto ampliado y emitir» sigue siendo emisión; excepción estrecha Allianz: id EXACTO `EMISION_PROJ` (igualdad, no patrón) + texto visible exactamente «proyecto ampliado», constante `EXCEPCION_PROYECTO_AMPLIADO`; cualquier otro id con «emisi» sigue bloqueado), Descargar, Imprimir, Generar PDF. Fuera de ahí (formulario, sin precio, como navegación), prohibida.
      Un botón que mezcle guardar con emitir/contratar/pagar («Guardar y emitir») cae como emisión.
  - **Frontera de emisión por campos (14/10/2026):** la compañía pide la cuenta bancaria solo para emitir, tras la aceptación
    del cliente. Si el inventario de una pantalla tiene un campo de IBAN, cuenta bancaria, número de cuenta, domiciliación,
    titular de la cuenta, entidad bancaria o SWIFT/BIC (etiqueta, name, id o placeholder; sin mayúsculas ni acentos), el
    explorador PARA con `cerca_de_emision` antes de llamar a la IA: nunca recibe ni rellena ese campo. Lista en
    `CAMPOS_BANCARIOS` (acciones-portal.ts), aplicada en `detectarParada`. La **fecha de efecto** NO para por sí sola (sale
    también al tarificar); solo cuenta si coincide en la pantalla con un campo bancario.
  - Flujo al ver el precio: guardar → (pantalla siguiente) descargar/imprimir el PDF si hay botón → terminar. El robot lee la
    **referencia** del presupuesto del texto de la pantalla (solo con etiqueta «Referencia / Nº de presupuesto / proyecto…»;
    nada con forma de NIF, teléfono o IBAN; nunca al log) y escucha el **PDF** desde antes del clic (descarga, ventana nueva o
    respuesta PDF). Ambos van al mapa (`mapa.presupuesto`: guardado, referencia, pdf) y al resultado del trabajo; el PDF se
    guarda en `seguros.documentos` y en `evidencia_documento_id` del trabajo **solo si la exploración va ligada a un
    cliente/póliza** (una exploración sintética no tiene de qué colgarlo).
  - En el worker, el guardado va SOLO por `pulsarGuardadoPresupuesto` (guard.ts): re-clasifica el control vivo, abre
    únicamente Archivar en la red y solo hacia el origen del marco; `contract`/emitir/«Aceptar» siguen abortando. Como
    mucho 3 pulsaciones por trabajo. Si el portal pide confirmar con un diálogo, el robot no confirma y para.
  - A la compañía no se la contacta.
- **Organización:** una conversación de Claude por compañía/bot, abierta cuando el bot anterior esté estable.
  Orden previsto: Allianz Hogar primero, luego Mapfre…

### Bitácora común de errores (todas las compañías)

> **Se escribe UNA fila por cada fallo de cualquier bot (Allianz, Mapfre, Occident y los que vengan); la más reciente va ARRIBA.**
> **Antes de dar de alta o arreglar un bot se lee esta tabla ENTERA.** Las lecciones de Allianz están resumidas en filas
> (sin el texto largo): el detalle sigue en [Allianz (ePAC)](#allianz-epac) y en `MANUAL-NUEVO-BOT.md` §5.

| Fecha | Compañía | Síntoma | Causa | Regla común / qué cambió | Test o cepo |
|---|---|---|---|---|---|
| 14/10/2026 | Mapfre | Segunda exploración real: login OK, llega a la página «Automóviles» (título y «Turismos y Motos» encontrados) pero falla: no halla el enlace «Tarificación y Emisión Rápida» en la tarjeta | El acotado a la tarjeta (`tarjetaDe`) no casa con el DOM real (desconocido); y el HTML del fallo no queda guardado: asegura descarta captura/HTML de las exploraciones (`lib/tarificador.ts`, «una exploración no guarda captura ni HTML») | Tarjeta (3 s) → si no, texto EXACTO en TODA la página, subiendo al control pulsable, y solo con EXACTAMENTE 1 coincidencia visible (0 o ≥2 → `ErrorMapaIncompleto` con el nº y los candidatos sin datos personales en el mensaje). Regla común: un acotado por contenedor lleva fallback a texto exacto único, nunca a «el primero» | `services/tarificador-rpa/test/mapfre-entrada.test.ts` |
| 14/10/2026 | Mapfre | Primera exploración real: login OK, pero la entrada falló con mapa incompleto (la URL seguía en `#/`) | Se asumió que «Turismos y Motos» era pulsable y no se pulsaba la opción «Automóviles» del desplegable de «Nueva producción» | Ruta real: pestaña → opción «Automóviles» (se pulsa) → página con tarjetas → enlace «Tarificación y Emisión Rápida» dentro de la tarjeta «Turismos y Motos» (que no se pulsa). Lección: los menús desplegables se confirman con captura antes de mapear | `services/tarificador-rpa/test/mapfre-entrada.test.ts` (fixture con menú + página y enlaces homónimos) |
| 14/10/2026 | Mapfre | Enlace de menú «Tarificación y Emisión …» bloqueado por el guard de emisión | «Emisión» como sustantivo de menú casa `PATRON_EMISION` (falso positivo) | Lista cerrada de etiquetas EXACTAS, solo en la fase de ENTRADA (`ENLACES_ENTRADA_AUTORIZADOS`, `pulsarEnlaceEntradaAutorizado`). Nunca relajar `PATRON_EMISION`; nunca desde el bucle IA | `services/tarificador-rpa/test/frontera-cuenta.test.ts` (importa `pulsarEnlaceEntradaAutorizado`) |
| 14/10/2026 | Mapfre | El producto abre PESTAÑA NUEVA y el bucle se quedaba en la pestaña de origen | `entrar()` devolvía la página de partida | `entrar()` devuelve la `Page` de la pestaña nueva y el bucle sigue en ella (`entrarYExplorar`); las páginas de la entrada no cuentan. `EXPLORADOR_VERSION` 0.1.3 (0.2.1 al fusionar con el guardado de presupuesto de main, que iba en 0.2.0) | Sin cepo específico de pestaña nueva |
| 14/10/2026 | Mapfre | Diálogo nativo de autenticación HTTP al abrir el tarificador | Chromium pide usuario y contraseña en la pestaña nueva | Se CANCELA: el contexto va SIN `httpCredentials` (Chromium responde 401). No meter credenciales en el bot | `services/tarificador-rpa/test/mapfre-entrada.test.ts` |
| 14/10/2026 | Común | El bot podía avanzar hasta un campo de cuenta bancaria | La cuenta bancaria no estaba fijada como frontera de emisión | Cuenta bancaria = FRONTERA: el bot NUNCA escribe ni elige; si aparece, PARA sin pulsar (`ErrorFronteraEmision`, `exigirSinCuentaBancaria`, `exigirCampoNoBancario`; explorador: `frontera_cuenta_bancaria`) | `services/tarificador-rpa/test/frontera-cuenta.test.ts` |
| 14/10/2026 | Común | Firmar, pagar y domiciliar no estaban en el guard | Verbos de emisión fuera de `PATRON_EMISION` | Añadidos a `PATRON_EMISION` (`guard-emision.ts`, commit df35eb7) | Cubiertos por `services/tarificador-rpa/test/occident-guarda.test.ts` (lista los verbos); falta cepo del patrón común |
| 14/10/2026 | Común | Falsos positivos de la frontera: «no cuenta con alarma» (el «nº» casaba), «Oficina de la entidad mediadora», «accc»; un label que incluye opciones de un select | Regex sin acotar; se miraba texto ajeno al label | Regex acotado (`RE_CAMPO_CUENTA_BANCARIA`: «nº» exige º/°/«o.»; entidad…oficina ≤ 20 separadores; `ccc` como palabra). Se usa el texto propio del label, no el de sus opciones. Cambio en el árbol, pendiente de commit | `packages/module-tarificacion/src/explorador.test.ts` (regresión de `RE_CAMPO_CUENTA_BANCARIA`) |
| 14/10/2026 | Común | La frontera no veía controles Angular no nativos (`mat-select`, `role=combobox`) | Solo miraba `input`, `select` y `textarea` | `SELECTOR_CONTROLES_FRONTERA` añade `[role=combobox]`, `[role=textbox]`, `[contenteditable=true]` y `mat-select` | Sin cepo específico del selector (`frontera-cuenta.test.ts` cubre la frontera, no el selector) |
| previa | Allianz | Iframe tardío: se inventariaba la carcasa | El formulario carga en `iframe#appArea` con retraso | Esperar el marco hasta 30 s (`esperarMarcoApp`) antes de inventariar | — |
| previa | Allianz | «Allianz HOGAR» ≠ «Hogar»: timeout al elegir la tesela | Casar por «contiene» | Etiqueta EXACTA (`etiquetaProducto`); Hogar y Negocio Plus se entran desde Particulares | — |
| previa | Allianz | `selectOption` no funciona con el desplegable | `nx-dropdown` de Angular, no `<select>` | Abrir, leer la lista y elegir por valor exacto; si no está, `opcion_no_aplicada` | — |
| previa | Allianz | Refs viejos tras rellenar el CP (la pantalla se repinta) | El autocompletado repinta el formulario | Cortar el lote tras rellenar (`CLAVES_AUTOCOMPLETADO`, `cortarLoteTrasRellenar`) y reinventariar | — |
| previa | Allianz | Varias poblaciones para un CP | La IA elegía población | `resolverPoblacion` con elección explícita o `ErrorEleccionPoblacion`; la IA no elige | — |
| previa | Allianz | Varias versiones de vehículo: elección incorrecta | Elección por parecido | Parar con la lista completa; la IA solo elige con confianza `alta` y código EXACTO, o persona/memoria (`eleccion-lista.ts`, `eleccion-memoria.ts`) | — |
| previa | Allianz | Motivo de parada de la IA rechazado por la validación | Motivo demasiado largo | `MOTIVOS_PARAR` es la fuente única; motivo ≤ 200 caracteres (`recortarMotivo`) | — |
| previa | Allianz | Año y m² inventados o sobrescritos | Dato no explícito | Catastro SOLO si es inequívoco; si no, el riesgo no se encola. Uso y régimen explícitos, sin valor por defecto | — |
| previa | Allianz | Avance mal identificado: «Aceptar» de otra pantalla puede EMITIR | «Calcular» y «Aceptar» son `div` con `onclick` | Identificar por id, texto, `onclick` y formulario de origen EXACTOS | — |
| previa | Allianz | Un POST nuevo no lo vio la grabación | La grabación no registra la red | Ventana de red que aborta los no-GET fuera de la lista; si sale un POST nuevo, el trabajo muere hasta verlo | — |
| previa | Allianz | Precio «Anual» distinto del portal | «Anual» = primer recibo prorrateado; «Sucesivos» = prima anual | Verificar el precio contra el portal con una cotización conocida antes de confiar en el lector | — |

## Capa por ramo (etiquetas de cada compañía)

> **Al dar de alta un bot de un ramo ya conocido, se parte de esta tabla y solo se añaden las etiquetas de la compañía nueva.**
> Claves = `CATALOGO_EXPLORACION` (`packages/module-tarificacion/src/explorador.ts`). Las celdas salen solo de lo documentado o del
> código; **vacía = no consta** (no se inventa ni se copia de otra compañía).

### Auto

| Clave canónica | Allianz | Mapfre (NSEI) |
|---|---|---|
| `efecto.fecha` | — | «Fecha Condiciones» (paso 1, datos básicos) |
| `tomador.nif` | — | `codigoDocumento` (datos básicos, NIF/CIF con lupa) |
| `vehiculo.matricula` | — | `matricula` (`app-datos-vehiculo`) |
| `vehiculo.codigo_postal` | — | `cpCirculacion` (CP de circulación) |
| `vehiculo.marca` / `vehiculo.modelo` | — | Sin separar: una sola «denominación comercial» (buscador `txtPredictivo`) |
| `vehiculo.cilindrada_cc` | — | Columna «cc» del diálogo «Selección de vehículo» |
| `conductor.fecha_nacimiento` | — | `fechaNacimiento` (`app-conductor-habitual`) |
| `conductor.fecha_carne` | — | `fechaExpedicion` (`app-conductor-habitual`) |
| `historial.siniestros_5_anios` | — | «Siniestros RC 5 últimos años» (`siniestros`) |
| `historial.anios_asegurado` | — | `tiempoAntComp`: lo calcula el portal, llega DESHABILITADO; nunca se escribe |
| `conductor.clase_permiso` | — | «Clase *» (acordeón «Permiso Conducir», paso 3 Figuras; `codigoTipoLicencia`): la que TIENE el conductor (dato real); si no consta y el vehículo exige más que B, el bot PARA. Mínimo DGT (`claseMinimaPermiso`): turismo/ciclomotor ≤50 cc «B»; ≤125 cc y ≤11 kW «B» con B ≥3 años (si no «A1»); ≤35 kW «A2»; más «A». Sintético por defecto «B» |

Fuera del catálogo a propósito (`DATOS_AUTO`): uso y ámbito de circulación (`mat-select`; Mapfre: `uso`, `ambitoCirculacion`) y compañía anterior (`companiaAnterior`).

**Decisiones de Alberto (14/10/2026) para Auto, válidas para TODAS las compañías:**
- «Clase» del permiso (`conductor.clase_permiso`): se declara la que TIENE el conductor; el vehículo fija el mínimo (`claseMinimaPermiso`, pura, DGT): turismo → **B**; ciclomotor ≤50 cc → **B**; moto ≤125 cc y ≤11 kW → **B** con ≥3 años de B, **A1** con menos; ≤35 kW → **A2**; más → **A**. Si falta un dato (cc, kW, antigüedad) devuelve null y no se adivina; si la clase del conductor no consta y el vehículo exige más que B, se para.
- La columna «CV/KW» del diálogo «Selección de vehículo» de Mapfre se llama así pero el valor son **CV** (confirmado por Alberto): `cvAKw()` (1 CV = 0,73549875 kW) antes de `claseMinimaPermiso`, que recibe kW.
- Coche y moto se tarifican en el MISMO tarificador (Mapfre: NSEI).
- Paso «Coberturas»: se dejan las coberturas **POR DEFECTO**; el bot no cambia nada ahí, solo avanza.

### Hogar

| Clave canónica | Allianz | Mapfre (NSEI) |
|---|---|---|
| `efecto.fecha` | — | — |
| `tomador.fecha_nacimiento` | Pantalla 1 típica de Hogar; etiqueta de Allianz sin documentar | — |
| `tomador.nif` | «Tipo de documento» (`nx-dropdown`) + nº de documento | — |
| `contacto.email` / `contacto.telefono` | — | — |
| `inmueble.codigo_postal` | CP de la pantalla 1 (dispara el autocompletado) | — |
| `inmueble.provincia` / `inmueble.municipio` | Autocompletadas tras el CP; población no es texto libre | — |
| `inmueble.tipo_via` / `inmueble.nombre_via` | Vía autocompletada | — |
| `inmueble.numero` / `inmueble.planta` | «Número» y «planta/puerta» de la pantalla 1 (etiqueta exacta sin documentar) | — |
| `inmueble.superficie_m2` / `inmueble.anio_construccion` | Obligatorios; sin autocompletar antes de avanzar; Catastro solo si es inequívoco | — |
| `hogar.uso` / `hogar.regimen` | Explícitos (habitual, secundaria, alquiler, turístico / propietario, inquilino); sin valor por defecto | — |
| `hogar.tipo_vivienda` / `hogar.capital_continente` / `hogar.capital_contenido` | — | — |

## Allianz (ePAC)

- **Entrada:** Venta → «Nueva Alta» abre un modal con acordeones plegados: **Autos, Particulares, Empresas,
  Vida y Salud**. Hay que desplegar el acordeón de la sección antes de elegir el tile.
- **Particulares (teselas):** «Allianz HOGAR», «Allianz Negocio Plus», «Decesos Prima periódica»,
  «Allianz Accidentes Plus», «Decesos Prima única», «Comunidades», «RC Cazador/Pescador», «Embarcaciones»,
  «Allianz Mascotas».
- **Hogar y Negocio Plus (comercio) se entran desde Particulares, NO desde Autos.** La tesela se elige por
  etiqueta exacta (`etiquetaProducto`), nunca por «contiene».
- **Iframe:** el formulario carga en el iframe `appArea`. Puede tardar; se espera hasta 30 s.
- **Hogar, pantalla 1:**
  - El botón «Siguiente» (`NextPageFromRisk`) está deshabilitado hasta rellenar los datos obligatorios.
  - «Tipo de documento» es un `nx-dropdown` de Angular, NO un `<select>`.
  - Población y vía se autocompletan; no son campos de texto libre.
- Hechos de DOM de Comunidades (Calcular, Aceptar, fechas, primer recibo): `docs/TARIFICADOR-RPA.md`, sección
  «Hechos del DOM — Allianz ePAC Comunidades».

## Mapfre (wmediadores · NSEI) — Auto

> Solo lo que consta en `services/tarificador-rpa/src/adapters/mapfre/auto.ts` y `docs/TARIFICADOR-RPA.md`
> (sección «Mapfre Auto · NSEI»). Fuente: una grabación de 19 pantallas del 13/10/2026. Adaptador SIN registrar,
> interruptor de máquina `TARIFICADOR_MAPFRE_ACTIVO=1` (apagado por defecto), fila de integración `mapfre/auto` apagada (`2026-10-14_tarificador_mapfre_auto.sql`).

- **Entrada (confirmada por Alberto, 14/10/2026):** login en `https://wmediadores.mapfre.com/PortalMediadores_fe-web/#/login`
  (usuario + contraseña; **no pide SMS**). Pantalla: bloque «Acceso», «Código de usuario (NUUMA)» y «Contraseña:»; el botón «Entrar»
  está **deshabilitado** hasta rellenar ambos (Angular: el bot espera a que se habilite o falla con `ErrorMapaIncompleto`); «Cambiar contraseña» jamás se pulsa. Después: pestaña «Nueva producción» (despliega un MENÚ) → PULSAR la opción «Automóviles» del
  desplegable → página «Automóviles» con tarjetas; «Turismos y Motos» es solo el TÍTULO de una tarjeta (no es enlace, no se pulsa) y
  bajo ella están los enlaces «Tarificación y Emisión Rápida», «(General)» y «(Otros Acuerdos)» (otras tarjetas traen enlaces parecidos)
  → enlace «Tarificación y Emisión Rápida» acotado a esa tarjeta, que **abre una PESTAÑA NUEVA** con el formulario NSEI. Código:
  `adapters/mapfre/entrada.ts` (clave `mapfre:nueva_produccion:auto`, sin avances autorizados). Conectada al explorador
  (`PORTALES_EXPLORACION.mapfre.entrar` devuelve la pestaña nueva y el bucle sigue en ella; v0.1.3).
- **Diálogo HTTP:** en la pestaña nueva Chromium pinta el diálogo nativo de auth («wmediadores.mapfre.com necesita un nombre de
  usuario y una contraseña»). Alberto lo **cancela**; detrás ya está el formulario (`app-datos-basicos`: «Fecha Condiciones»,
  «Fecha de mecanización»). El bot lo cancela dejando el contexto SIN `httpCredentials` (Chromium responde 401). Cepo en
  `test/mapfre-entrada.test.ts`.
- **Excepción del guard (OK de Alberto, 14/10/2026):** en la ENTRADA de Mapfre se pueden pulsar, por texto visible EXACTO
  (normalizado: espacios y mayúsculas), «Tarificación y Emisión Rápida», «Tarificación y Emisión (General)», «… (Otros
  Acuerdos)», «… (Acuerdos)» y «Tarificación y Emisión» (`pulsarEnlaceEntradaAutorizado`, cada una una vez). Con sufijo,
  prefijo u otra redacción, desde el bucle IA u otra compañía: bloqueado. La URL de la pestaña nueva sigue pasando por el
  guard de red: si llevara «emision», se aborta (fail-closed). Comprobado por Alberto (14/10/2026): la pestaña abre en
  `/evt21_nsei_fe-web/#/evt21_nsei_fe-web/accesosguiados?…` (sin «emision»; parámetros de sesión no se guardan).
- **Catálogo auto (14/10/2026):** `CATALOGO_EXPLORACION.auto` (explorador.ts) con claves de `FormularioAuto` (efecto, tomador, matrícula, CP, marca/modelo/cc, conductor nacimiento/carné, siniestros 5 años, años asegurado). Fuera por no tener origen en `FormularioAuto`: uso, ámbito, clase de permiso, compañía anterior (nombre) y NIF del conductor. Guard: `firmar/pagar/domiciliar` añadidos a `PATRON_EMISION`.
- **Tecnología:** SPA Angular Material **sin iframes**; todo el DOM es legible. Los `mat-input-N` NO se usan
  (son contadores de Angular Material); los selectores van por `name`/`formcontrolname` con ámbito de componente.
- **Stepper de 6 pasos** (todos los componentes viven a la vez en el DOM; manda el paso activo):
  1. Datos básicos (`app-datos-basicos`): tomador por NIF/CIF + compañía, agente, acuerdo, fechas.
  2. Objeto asegurado (`app-objeto-asegurado`): matrícula + CP de circulación; diálogo «Selección de vehículo»;
     resumen del vehículo.
  3. Figuras (`app-figuras`): conductor habitual (`app-conductor-habitual`) + historial de siniestralidad
     (`app-historial-siniestralidad`).
  4. Coberturas (`app-coberturas`): 3 productos con «PRIMA TOTAL» anual.
  5. Proyectos (`app-proyecto`): genera nº de proyecto y documentación.
  6. Contratación: emite; sin selector a propósito.
- **Lector de primas (llega a precio):** `app-primas > prima-producto`; importe en `.caja-primas p strong`; el icono
  `.ccttVerificacion .warning-color` indica que hay que verificar el vehículo antes de contratar.
- **Vehículo:** Mapfre no separa marca/modelo/versión (una sola «denominación comercial»). Hay lectores del diálogo
  «Selección de vehículo» (sin matrícula ni bastidor) y del «Resumen vehículo». Cómo partir la denominación para el
  `Vehiculo` canónico: PENDIENTE — preguntar a Alberto.
- **«Continuar» del paso 3** no es un avance neutro: lanza «Verificando controles técnicos» + «Calculando las primas»
  (es lo que lleva a precio). Si cuenta como «tarificar»: decisión pendiente de Alberto.
- **Guard:** «Generar Proyecto» / «Ir a generar proyecto» PERMITIDOS (Alberto 13/10/2026: «el bot SÍ puede hacer
  proyectos»; no los bloquea `guard-emision.ts`). Sigue prohibido emitir/contratar/formalizar/grabar póliza, pago y
  RGPD «Sí»; «Contratar» y todo «Aceptar» siguen bloqueados. «Calcular» pasa.
- **Huecos (el adaptador no pulsa nada todavía):**
  - Login y entrada: hechos y conectados al explorador (pestaña nueva + excepción exacta del guard).
  - Elegir fila y confirmar el diálogo de vehículo: RESUELTO (radio por fila + «Aceptar», deshabilitado hasta elegir; ver
    «Flujo NSEI Auto»). Avance «Continuar» entre pasos: descrito en esa subsección, sin automatizar.
  - `mat-select` (uso, ámbito, clase de permiso, compañía anterior): no se grabaron abiertos. Significado de uso,
    ámbito y clase de permiso: PENDIENTE — preguntar a Alberto.
  - Búsqueda del tomador por NIF (lupa): RESUELTO a nivel de flujo (autocompleta Nombre y Apellidos; ver «Flujo NSEI Auto»).
    Sin automatizar.
  - Botón de guardar y descarga de PDF: PENDIENTE — preguntar a Alberto.

### Flujo NSEI Auto (tarificación rápida) — visto por Alberto 14/10/2026

> Solo lo que Alberto enseñó en pantalla. Sin datos de clientes ni códigos.

- **Menú «Nueva producción»:** despliega los ramos Agropecuaria, Automóviles, Empresas, Patrimoniales, Salud y Vida.
- **Stepper de 6 pasos:** 1. Datos básicos · 2. Objeto asegurado · 3. Figuras · 4. Coberturas · 5. Proyectos · 6. Contratación.
  **«Contratación» (6) es la frontera de emisión: el bot NUNCA entra en el paso 6.** «Proyectos» (5) es donde se guarda
  el presupuesto (botón exacto: PENDIENTE).
- **Paso 1 · Datos básicos:**
  - Bloque «Tomador»: «Introduzca NIF/NIE/CIF *» con lupa (al buscar autocompleta Nombre y Apellidos) y «Fecha de Nacimiento *».
  - Bloque «Información General»: «Compañía *» y «Agente *» vienen preseleccionados; «Acuerdo» en SIN ACUERDO por defecto;
    «Tipo de comisión» deshabilitado; «Fecha de efecto *» por defecto hoy; «Fecha de vencimiento», «Fecha Condiciones» y
    «Fecha de mecanización» deshabilitadas; «Duración» en ANUAL PRORROGABLE.
  - Pie: «Salir», «Volver», «Controles técnicos», «Continuar».
- **Paso 2 · Objeto asegurado:** se introduce la matrícula → diálogo «Selección de vehículo» con tabla (Matrícula, Nº Bastidor,
  Denominación comercial, CV/KW, CC, Nº Puertas, Fecha Inicio) y un radio por fila. Si las filas son casi iguales, se elige
  la primera y se pulsa «Aceptar» (deshabilitado hasta elegir fila). Otros botones del diálogo: «Cancelar» y «No es el
  vehículo.» (el bot NUNCA pulsa «Cancelar», «No es el vehículo.» ni «Vehiculo NO catalogado»; si ninguna fila casa con la
  matrícula, para). Una moto trae 0 en Nº Puertas. Fuera del diálogo: «Buscador de vehículos», «Vehículo NO catalogado», «Resumen vehículo». Después se pide
  código postal y «Continuar».
- **Paso 3 · Figuras:** pestañas «Tomador» y «Conductores Ocasionales»; casillas «Actúa como Conductor Habitual» y «Tomador y
  propietario son la misma persona» (ambas marcadas por defecto); acordeones «Datos Básicos», «Dirección Habitual» y
  «Permiso Conducir» con «Clase *» (desplegable) y «Valido desde *» (la fecha es la del carné). Cabecera resumen con Acuerdo,
  Tomador, Matrícula y O. Asegurado, y las secciones «Información general» y «Obs. y Cláusulas».
- **Flujo resumido (Alberto):** NIF → matrícula → elegir versión → CP → Continuar → fecha de nacimiento y fecha de carné →
  Continuar → precio.
- **Resuelto por esta vista:** cómo se elige el vehículo (radio por fila + «Aceptar») y la búsqueda del tomador por NIF (lupa).
- **PENDIENTE (Alberto):**
  - ~~Valor habitual de «Clase» del permiso de conducir.~~ **RESUELTO (14/10/2026):** siempre «B» en turismos.
  - ~~Qué se elige en «Coberturas».~~ **RESUELTO (14/10/2026):** coberturas por defecto; el bot solo avanza.
  - Botón exacto de guardar en «Proyectos».
  - Cómo sale el PDF.
