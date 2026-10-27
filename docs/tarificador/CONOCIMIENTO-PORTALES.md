# Conocimiento de portales del tarificador RPA

> Qué sabemos de cada portal de compañía y cómo se trabaja con él. Sin datos personales ni valores reales:
> solo nombres de pantalla y claves de catálogo. Estado vivo, DOM detallado y plan: `docs/TARIFICADOR-RPA.md`.
> Técnica del worker: `services/tarificador-rpa/README.md`. Revisado: 15/10/2026.

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
| 26/10/2026 | Mapfre | «Figuras» de coche sin `app-historial-siniestralidad`: solo etiquetas «Compañia», «Procedencia Siniestralidad», «Siniestros», «Bonus Malus»; el bot paraba sin compañía anterior (0.8.23) | El portal pinta otra variante de Figuras; el selector del bloque no existía | La compañía anterior se busca también por la ETIQUETA exacta «Compañia» (un `mat-select` visible y habilitado; si no, el hueco de siempre). La etiqueta es el concepto `compania_anterior` de `src/vocabulario.ts` | `test/mapfre-v0824.test.ts`, `test/vocabulario.test.ts` |
| 26/10/2026 | Mapfre | «Generar Proyecto» no deja guardar el proyecto: faltan datos obligatorios en el formulario que abre «Ir a generar proyecto» (0.8.22) | Ese formulario pide el CONTACTO DEL TOMADOR (teléfono móvil, email, nombre) y revalida «Clase», «Valido desde» y «1ª Matriculación» con otro control | Se rellena el contacto SOLO si el riesgo lo trae (nunca se inventa; sin dato → aviso y no se pulsa); lo ya tecleado se re-confirma por el mismo camino. Interruptor `MAPFRE_PROYECTO_CONTACTO` | `test/mapfre-v0822.test.ts` |
| 26/10/2026 | Allianz | No se descargaba el PDF tras «Guardar presupuesto»: el botón se llama «Descargar propuesta» (0.6.29) | El buscador de descarga solo conocía proyecto/presupuesto/oferta | «propuesta» cuenta SOLO junto a imprimir/descargar/pdf (nunca con «documento» suelto); la lista de bloqueo sigue mandando («Contratar propuesta» no pasa). Término en el concepto `descargar_documento` del vocabulario | `test/allianz-propuesta.test.ts`, `test/vocabulario.test.ts` |
| 27/10/2026 | Allianz | «Descargar propuesta» seguía bloqueado en producción por un token opaco de href que acaba en «emit» (0.6.33) | La raíz casaba por `endsWith` en tokens sin trocear | `endsWith` solo con prefijo corto y pronunciable (btnemitir sí, `nrzldmqexemit` no) y se saltan segmentos de URL codificados; lo legible (emitirPoliza, /poliza/emitir) sigue bloqueando | `test/allianz-v0633.test.ts` |
| 26/10/2026 | Generali | El precio salía de la pantalla de garantías con varias cifras (0.2.30); el importe de verdad está en la tabla «Modalidades de Seguro» (0.2.31) | Columnas «Recibo Anual» y «Prima Anualidad» por modalidad; la modalidad MARCADA es la elegida | Precio = «Recibo Anual» de la modalidad marcada; sin marcada y con varias filas, la más barata y las demás como aviso. Sin columnas localizables (0.2.34): primera cifra de la fila con aviso «revisar en la emisión». Cabeceras en el vocabulario (`recibo_anual`, `prima_anualidad`, `modalidades`) | `test/generali-v0231.test.ts`, `test/generali-v0234.test.ts` |
| 26/10/2026 | Generali | La pestaña «Garantías y Resultados» no cambiaba la pantalla (0.2.26); el avance real es el botón «Siguiente ›» (0.2.28-0.2.29) | El botón se pinta con adorno («Siguiente ›») y el texto exacto «Siguiente» no casaba | Texto ENTERO «Siguiente» seguido solo de adornos finales (`›`, `>`, `»`, NBSP); nunca si la página o un diálogo muestran emitir/contratar/grabar póliza/pagar/firmar. Término en el concepto `avanzar` del vocabulario | `test/generali-v0229.test.ts`, `test/vocabulario.test.ts` |
| 15/10/2026 | Mapfre | Presencia de campos dada por buena con elementos ocultos (mat-select de uso/ámbito en el DOM) | Contar sobre el DOM, no sobre lo visible (bots 0.8.2→0.8.5) | Contar presencia solo con elementos VISIBLES (`locator('visible=true')`) | — |
| 15/10/2026 | Mapfre | Campo de texto recién escrito que el portal vacía | Escritura sin esperar a que el campo se asiente (bots 0.8.2→0.8.5) | Tras escribir: blur + esperar sin `ng-pending` ni spinner; si el portal lo vacía, error `portal` | — |
| 15/10/2026 | Mapfre | `fill` sobre «siniestros» cuando el campo viene DESHABILITADO | No consta (bots 0.8.2→0.8.5) | Esperar a que sea editable antes de cada `fill`. Con 0 siniestros se deja como está; con >0 → atasco | — |
| 15/10/2026 | Mapfre | «Continuar» falla y el atasco no dice qué campo | No consta (bots 0.8.2→0.8.5) | Si «Continuar» falla, el atasco nombra los campos con `mat-error` | — |
| 15/10/2026 | Mapfre | Lector de primas de «Coberturas» con formatos distintos; TODO RIESGO bloqueada | Prima con 0, 1 o 2 decimales; tarjeta con «Existen controles técnicos…» (primer precio real) | Lector admite 0-2 decimales; TODO RIESGO se omite si otra tarjeta tiene prima; firma de estabilidad solo con campos normalizados, nunca `textContent` crudo | — |
| 15/10/2026 | Mapfre | Timeout de Playwright sobre un control tratado como error definitivo | No consta (bots 0.8.2→0.8.5) | Un timeout sobre un control abre atasco (`hueco_mapa`), no error definitivo | — |
| 14/10/2026 | Allianz | Hogar: las exploraciones no pasan de la pantalla 1; «Año de construcción»/«Superficie» siguen inválidos (`nodo_no_relocalizado`) | Angular repinta el formulario tras el autocompletado de CP/vía; refs viejos | Adaptador de tarificación por `formcontrolname` (sin refs), año/m² los ÚLTIMOS, comprobación de valor y de inválidos; radios del riesgo solo por `marcarOpcionRiesgoHogarAllianz` (guard.ts, lista cerrada) porque el portal trae opciones marcadas de serie | `services/tarificador-rpa/test/allianz-hogar.test.ts` |
| 14/10/2026 | Mapfre | Tercera exploración real: login OK y llega a la página «Automóviles», pero no halla «Tarificación y Emisión Rápida» (0 coincidencias visibles) | La página no expone el enlace en el DOM principal (probable iframe o elemento no estándar) | URL directa del formulario NSEI como entrada principal (pestaña nueva, vale si aparece `app-datos-basicos`; el 401 no cuenta) con respaldo por menús; error con los dos motivos | `services/tarificador-rpa/test/mapfre-entrada.test.ts` (4 casos de URL directa + `URL_NSEI_AUTO` vs `PATRON_EMISION`) |
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

### Vocabulario común (26/10/2026)

> Lo que aprende un bot sobre los RÓTULOS de un portal tiene que servir al siguiente bot y a otros ramos. Código: `services/tarificador-rpa/src/vocabulario.ts`
> (puro, sin Playwright); candidatos nuevos: `services/tarificador-rpa/scripts/vocabulario-candidatos.ts`. Cepo: `test/vocabulario.test.ts`.

- **Por concepto, no por compañía**, con ramo opcional (sin ramo = común). Cada término lleva su ORIGEN (compañía + fecha). Tres listas separadas y tipadas:
  - **Lectura** (`CONCEPTOS_LECTURA`): etiquetas y cabeceras que el bot solo lee (precio, recibo anual, prima anualidad, compañía anterior, fechas, años asegurado…).
  - **Acción** (`CONCEPTOS_ACCION`): rótulos de botones que se pulsan (avanzar, calcular, generar/guardar proyecto, descargar documento). Estar en la lista **no autoriza ningún clic**:
    pulsar sigue siendo cosa de `pulsar()` y su familia en `guard.ts`.
  - **Bloqueo** (`BLOQUEO`): emitir, contratar, pagar, firmar, formalizar, grabar póliza, enviar… **Siempre gana sobre una acción** (`clasificarRotulo` lo mira primero).
    Los términos que solo puede nombrar `guard.ts` (guardián de la raíz) viven en `TERMINOS_BLOQUEO_SOLO_GUARD` y el guard los suma.
- **Migrado ya** (mismo comportamiento, comprobado con regexes antiguos congelados en el test): descarga de proyecto/presupuesto/propuesta, «Siguiente ›», «Generar/Guardar/Ir a generar
  proyecto» de Mapfre, etiquetas de precio y de «Datos de Valoración» de Generali, cabeceras de la tabla de modalidades y «Compañia» de Mapfre.
- **Aprendizaje automático (propuesta, nunca runtime):** el script lee avisos (`seguros.tarificacion_precios.avisos`) y errores (`seguros.tarificacion_trabajos.error->>'mensaje'`; NUNCA
  la columna `riesgo`), extrae los rótulos de «controles a la vista», «etiquetas:», «Botones:» y «Tablas:» que NO están en el vocabulario y los clasifica por concepto: lectura =
  auto-aplicable, acción = requiere revisión, lo que casa el bloqueo = descartado. Una persona (o un PR draft) los añade a `vocabulario.ts`.
- **Al dar de alta un bot:** parte del vocabulario (MANUAL-NUEVO-BOT.md, «Parte del vocabulario»); si el portal usa un sinónimo nuevo de un concepto conocido, se AÑADE al
  vocabulario con su origen, no se copia en el adaptador (el test lo vigila: ≥3 términos de un concepto en un patrón fuera de `vocabulario.ts` rompen).

### Receta corta: añadir un producto

> Versión completa y pasos de verificación: `docs/tarificador/MANUAL-NUEVO-BOT.md`.

1. Fila en `seguros.companias_integracion` (SQL idempotente en `apps/asegura/prisma/sql`, modelo
   `2026-10-14_tarificador_mapfre_auto.sql`).
2. Credenciales en fly secrets `CRED_<CLAVE>_USER` / `CRED_<CLAVE>_PASS`.
3. Mapa: grabación del flujo hasta la pantalla de precio, o inventario de estructura del bot
   (`services/tarificador-rpa/src/inventario-dom.ts`) cuando la grabación no lo ve (iframe de otro origen).
4. Adaptador en `services/tarificador-rpa/src/adapters/<compañía>/` con flag de registro y tests (`npm test`).
5. PR → imagen (workflow `.github/workflows/tarificador-rpa-imagen.yml`, input `etiqueta`) → env Vercel
   `TARIFICADOR_FLY_IMAGE` (`central-asegura`, production) → redeploy → lanzar un trabajo real y vigilar hasta precio.

## Capa por ramo (etiquetas de cada compañía)

> **Al dar de alta un bot de un ramo ya conocido, se parte de esta tabla y solo se añaden las etiquetas de la compañía nueva.**
> Claves = `CATALOGO_EXPLORACION` (`packages/module-tarificacion/src/explorador.ts`). Las celdas salen solo de lo documentado o del
> código; **vacía = no consta** (no se inventa ni se copia de otra compañía).

### Auto

| Clave canónica | Allianz | Mapfre (NSEI) | Generali (mediadores) |
|---|---|---|---|
| `efecto.fecha` | — | «Fecha Condiciones» (paso 1, datos básicos) | — |
| `tomador.nif` | — | `codigoDocumento` (datos básicos, NIF/CIF con lupa) | `reg1063A_personas_interesado_nifcif` (bloque «Interesado / Tomador» de «Datos de Valoración») |
| `vehiculo.matricula` | — | `matricula` (`app-datos-vehiculo`) | Con ASTERISCO entre cifras y letras («1234*BCD»), también en el campo de verificación (opcional) |
| `vehiculo.codigo_postal` | — | `cpCirculacion` (CP de circulación) | «CODIGO POSTAL» · «C P» · «CP» (mapa provisional de «Datos de Valoración») |
| `vehiculo.marca` / `vehiculo.modelo` | — | Sin separar: una sola «denominación comercial» (buscador `txtPredictivo`) | Desplegables de tipo, subtipo, marca, modelo y versión (el vehículo llega confirmado de Allianz/Mapfre; casado exacto → palabra entera → uno solo) |
| `vehiculo.cilindrada_cc` | — | Columna «cc» del diálogo «Selección de vehículo» | — |
| `conductor.fecha_nacimiento` | — | `fechaNacimiento` (`app-conductor-habitual`) | «FECHA DE NACIMIENTO» · «FECHA NACIMIENTO» · «F NACIMIENTO» |
| `conductor.fecha_carne` | — | `fechaExpedicion` (`app-conductor-habitual`) | «FECHA DE CARNE/CARNET» · «FECHA EXPEDICION CARNE/CARNET/PERMISO» · «FECHA DE EXPEDICION DEL CARNE/CARNET/PERMISO» |
| `historial.siniestros_5_anios` | — | «Siniestros RC 5 últimos años» (`siniestros`) | «SINIESTROS ULTIMOS 5 ANOS» · «N SINIESTROS ULTIMOS 5 ANOS» · «NUMERO DE SINIESTROS» · «SINIESTROS CON CULPA ULTIMOS 5 ANOS» |
| `historial.anios_asegurado` | — | `tiempoAntComp`: lo calcula el portal, llega DESHABILITADO; nunca se escribe | «ANOS ASEGURADO(S)» · «ANOS DE ASEGURAMIENTO» · «ANOS ASEGURADO ANTERIOR» · «ANOS EN LA COMPANIA ANTERIOR» |
| `conductor.clase_permiso` | — | «Clase *» (acordeón «Permiso Conducir», paso 3 Figuras; `codigoTipoLicencia`): la que TIENE el conductor (dato real); si no consta y el vehículo exige más que B, el bot PARA. Mínimo DGT (`claseMinimaPermiso`): turismo/ciclomotor ≤50 cc «B»; ≤125 cc y ≤11 kW «B» con B ≥3 años (si no «A1»); ≤35 kW «A2»; más «A». Sintético por defecto «B» | — |

> Columna Generali: solo lo que consta en `services/tarificador-rpa/src/adapters/generali/` (etiquetas de `ETIQUETAS_RIESGO_GENERALI`, que ahora salen de `src/vocabulario.ts`). Los sinónimos de estas etiquetas viven en el **vocabulario común** (apartado de abajo): un bot nuevo parte de ahí.

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
| `tomador.fecha_nacimiento` | «Fecha de nacimiento» (`dateOfBirth`, pantalla 1) | — |
| `tomador.nif` | «Tipo de documento» (`nx-dropdown`) + nº de documento | — |
| `contacto.email` / `contacto.telefono` | — | — |
| `inmueble.codigo_postal` | CP de la pantalla 1 (dispara el autocompletado) | — |
| `inmueble.provincia` / `inmueble.municipio` | Autocompletadas tras el CP; población no es texto libre | — |
| `inmueble.tipo_via` / `inmueble.nombre_via` | Vía autocompletada | — |
| `inmueble.numero` / `inmueble.planta` | «Número» y «planta/puerta» de la pantalla 1 (etiqueta exacta sin documentar) | — |
| `inmueble.superficie_m2` / `inmueble.anio_construccion` | Obligatorios; sin autocompletar antes de avanzar; Catastro solo si es inequívoco | — |
| `hogar.uso` / `hogar.regimen` | Explícitos (habitual, secundaria, alquiler, turístico / propietario, inquilino); sin valor por defecto | — |
| `hogar.tipo_vivienda` / `hogar.capital_continente` / `hogar.capital_contenido` | — | — |
| `inmueble.referenciaCatastral` (20) | — | «Ref. catastral» tras el CP (campo exacto: TODO grabación) |
| `hogar.protecciones` / `hogar.objetosValor` (21/10/2026, tres estados, de `datosVivienda`) | ¿«Valoración de bienes»? (sin ver) | `#protecciones-panel` (sin etiquetas) |

## Allianz (ePAC)

- **Entrada:** Venta → «Nueva Alta» abre un modal con acordeones plegados: **Autos, Particulares, Empresas,
  Vida y Salud**. Hay que desplegar el acordeón de la sección antes de elegir el tile.
- **Particulares (teselas):** «Allianz HOGAR», «Allianz Negocio Plus», «Decesos Prima periódica»,
  «Allianz Accidentes Plus», «Decesos Prima única», «Comunidades», «RC Cazador/Pescador», «Embarcaciones»,
  «Allianz Mascotas».
- **Hogar y Negocio Plus (comercio) se entran desde Particulares, NO desde Autos.** La tesela se elige por
  etiqueta exacta (`etiquetaProducto`), nunca por «contiene».
- **Mapa de menú completo (capturas de Alberto, 15/10/2026):** Venta → «Nueva Alta» abre el popup «Nueva Alta» con acordeones:
  - **Autos:** «AUTOS Turismos», «Vehículo Comercial», «Moto», «Flotas Autos», «Ciclomotor», «Movilidad Personal», «Furgonetas».
    Cada tarjeta abre su formulario y tarifica.
  - **Particulares:** las nueve teselas de arriba.
  - **Empresas:** «Allianz Cyber Plus», «Flotas Diversos», «Allianz Negocio Plus», «Allianz Multiseguro Empresarial», «Mercancías»,
    «Equipos Electrónicos», «Accidentes Convenio (Pyme y No Pyme)», «RC Pyme», «Allianz D&O Pyme», «Agroseguros»,
    «Allianz Mercancías Pyme», «Accidentes Colectivos».
  - **Vida y Salud:** sin detallar aún.
  - «Allianz Negocio Plus» aparece en Particulares Y en Empresas: la etiqueta exacta no basta. Pendiente de confirmar con
    Alberto por cuál de las dos entradas se tarifica el comercio (hoy el bot la entra desde Particulares).
- **Producto nuevo de Allianz:** misma entrada (Nueva Alta → acordeón → tarjeta por texto EXACTO) más su formulario.
- **Turismos (iframe de OTRO origen):** es una app Angular servida vía puente SSO. El grabador bookmarklet NO la lee;
  Playwright sí. Para explorarla usar el inventario de estructura del bot (`src/inventario-dom.ts`), no pedir otra grabación.
- **Iframe:** el formulario carga en el iframe `appArea`. Puede tardar; se espera hasta 30 s.
- **Hogar, pantalla 1:**
  - El botón «Siguiente» (`NextPageFromRisk`) está deshabilitado hasta rellenar los datos obligatorios.
  - «Tipo de documento» es un `nx-dropdown` de Angular, NO un `<select>`.
  - Población y vía se autocompletan; no son campos de texto libre.
- **Hogar, lo visto en las 6 exploraciones IA (13-14/10/2026; ninguna pasó de la pantalla 1):** el iframe `appArea` carga una app
  Angular de OTRO origen, `https://cloud.e-pacallianz.com/ngx-allianzhogar2053/` (no el servlet de Comunidades/Moto). Asistente
  `nx-multi-step-item`: Vivienda · Valoración de bienes · Precio · Datos · Revisión · Pago · Confirmación. Pantalla 1 («¿Quién es
  el tomador?» + «Datos de la vivienda») por `formcontrolname`: `idType`, `idNumber`, `dateOfBirth`, `postalCode`, `province`
  (deshab.), `town`, `streetType` (deshab.), `streetName`, `streetNumber`, `block`, `stair`, `floor`, `flat`, `extraAddress`,
  botón «Comprobar», `yearOfConstruction`, `yearOfRefurbishment`, `surfaceAreaLiving`. Radios: «Sin/Con madera»; tipo («Piso en
  alto», «Unifamiliar Adosada / Pareada», «Planta Baja o piso con ventanas a menos de 3 metros del suelo», «Ático», «Unifamiliar
  Independiente», trastero, parking, caravana); régimen (toggle «Propietario»/«Inquilino», etiqueta duplicada); uso («Habitual»,
  «Alquiler», «En venta y/o deshabitada», «Secundaria», «Turístico o vacacional»). Hogar NO tiene «Datos básicos» ni su «Aceptar».
  - **Ojo:** el portal trae marcados de serie «Sin madera», «Piso en alto», «Propietario» y «Habitual»: el bot los fija SIEMPRE
    al valor del riesgo. Año y m² quedaban inválidos tras el autocompletado (repintado): el bot los rellena los últimos.
  - Adaptador de tarificación: `services/tarificador-rpa/src/adapters/allianz/hogar.ts` (apagado; estado en `docs/TARIFICADOR-RPA.md`).
- Hechos de DOM de Comunidades (Calcular, Aceptar, fechas, primer recibo): `docs/TARIFICADOR-RPA.md`, sección
  «Hechos del DOM — Allianz ePAC Comunidades».

## Mapfre (wmediadores · NSEI) — Auto

> Solo lo que consta en `services/tarificador-rpa/src/adapters/mapfre/auto.ts` y `docs/TARIFICADOR-RPA.md`
> (sección «Mapfre Auto · NSEI»). Fuente: una grabación de 19 pantallas del 13/10/2026. Adaptador registrado SIEMPRE
> (14/10/2026); la puerta es la fila de integración `mapfre/<ramo>` (apagada: `2026-10-14_tarificador_mapfre_auto.sql`, `…14b…moto.sql`).

- **Entrada PRINCIPAL = URL directa (14/10/2026, 3ª exploración):** ya logueado, el bot abre en una pestaña nueva del mismo contexto
  `https://wmediadores.mapfre.com/evt21_nsei_fe-web/#/evt21_nsei_fe-web/autos/oferta` (`URL_NSEI_AUTO` en `entrada.ts`; misma sesión,
  pública dentro de ella, sin datos personales ni ids). Vale solo si aparece `app-datos-basicos` (30 s); un 401/4xx del `goto` (desafío
  de auth básica, que se cancela) no cuenta. Si no aparece, cierra esa pestaña y cae a la ruta por menús de abajo (respaldo); si
  también falla, `ErrorMapaIncompleto` cita ambos intentos. La URL se comprueba contra `PATRON_EMISION` en test.
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
  (es lo que lleva a precio). **PERMITIDO (Alberto, 14/10/2026)**, solo por `pulsarContinuarMapfre` (guard.ts): lista
  cerrada 1 → 2 → 3, en orden, una vez por paso. El NIF del tomador lo pone asegura desde la ficha (`documentoTomador`).
- **Pantalla «Coberturas» (15/10/2026, primer precio real):** tarjetas «PRIMA TOTAL: x €» con 0, 1 o 2 decimales
  (p. ej. «670,1 €»). TODO RIESGO puede salir bloqueada («Existen controles técnicos que impiden tarificar»): se omite
  si otra tarjeta tiene prima. Los errores y atascos de estos bots están en la bitácora común (filas 15/10/2026, Mapfre).
- **Elección de versión del catálogo (decisión 15/10/2026):** si hay varias versiones, el bot para con `requiere_humano`
  y la lista de opciones; la elección queda en `riesgo.eleccionVersion` (por etiqueta en Mapfre). No se elige por parecido.
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

## Generali (mediadores) — bot Auto (Turismos) en marcha

- **Bot:** `services/tarificador-rpa/src/adapters/generali/auto.ts` (reglas puras en `reglas.ts`; versión actual `VERSION_GENERALI_AUTO`, 0.2.34 el 26/10/2026).
  Turismos (Ramo UV); moto, después. Mapa de pantallas: `services/tarificador-rpa/docs/generali-mapa-capturas.md`.
- **Flujo:** login (Okta) → «Seleccionar mediador» (cascada; se elige el mediador de la correduría por código EXACTO) → menú NEGOCIO › EMISIÓN ›
  CONTRATACIÓN › AUTOMÓVILES › TURISMOS → «Valoración Riesgo» / «Datos de Valoración» (vehículo por desplegables, tomador, conductor, antecedentes) →
  «Siguiente ›» → «Garantías y Capitales opcionales» (precio). Hasta el precio; sin emitir. La entrada al menú y la confirmación del mediador solo van
  por el guard (`entrarTurismosGenerali`, `confirmarMediadorGenerali`).
- **SMS de confirmación cada 30 días** en el acceso. Decisión de Alberto: el bot pide el código por Telegram
  (solo a su chat, máx. 5 min, sin reenviar SMS, el código nunca se registra).
- **«Equipo recordado»:** el bot conserva cifrado el equipo recordado (`services/tarificador-rpa/src/boveda-sesion.ts`).
- Credenciales: `CRED_GENERALI_MEDIADORES_USER` / `CRED_GENERALI_MEDIADORES_PASS` (fly secrets).

## Occident — aparcado

- Aparcado: el acceso es SSO y, en auto, no interesa. Lo de Occident Hogar (descuentos) está en la sección de descuentos.

## Prioridades de producto (Alberto, 15/10/2026)

1. **Prioridad: que todos los bots den PRECIO.**
2. Después, leer GARANTÍAS de la pantalla de coberturas (sin PDF ni «Generar Proyecto»).
3. Textos cortos de garantías como catálogo fijo revisado (sin IA).
4. IA solo para la nota personalizada, con el proveedor actual. Nunca IA gratuita extranjera (RGPD).
5. Un 2.º bot monta el presupuesto como BORRADOR que envía una persona.

## Descuentos comerciales (regla de Alberto, 14/10/2026)

**Descuentos comerciales: siempre al máximo; nunca los que se pagan con comisión** (Occident: «Descuentos ABC» / «Ajuste contra
comisión», que rebaja la comisión de la correduría: no se toca, ni lápiz ni papelera). Occident Hogar, paso 2 «Proyecto»: caja
«Ajustes comerciales» → «Modificar» (no el de «Datos principales del riesgo») → secciones «Descuentos cliente» y «Descuentos por
perfil/actividad» (lápiz → máximo disponible); la papelera nunca. Código: `elegirMaximoDescuento` en `occident/hogar.ts`.
Selector desplegado y guardado de los ajustes: sin ver. «Imprimir» (cabecera) guarda el proyecto y descarga el PDF.
