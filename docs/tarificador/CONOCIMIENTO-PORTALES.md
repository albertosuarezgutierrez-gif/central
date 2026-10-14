# Conocimiento de portales del tarificador RPA

> Qué sabemos de cada portal de compañía y cómo se trabaja con él. Sin datos personales ni valores reales:
> solo nombres de pantalla y claves de catálogo. Estado vivo, DOM detallado y plan: `docs/TARIFICADOR-RPA.md`.
> Técnica del worker: `services/tarificador-rpa/README.md`. Revisado: 13/10/2026.

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
  - A la compañía no se la contacta.
- **Organización:** una conversación de Claude por compañía/bot, abierta cuando el bot anterior esté estable.
  Orden previsto: Allianz Hogar primero, luego Mapfre…

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
> `MAPFRE_AUTO_ACTIVO=false`, fila de integración `mapfre/auto` apagada (`2026-10-14_tarificador_mapfre_auto.sql`).

- **Entrada (confirmada por Alberto, 14/10/2026):** login en `https://wmediadores.mapfre.com/PortalMediadores_fe-web/#/login`
  (usuario + contraseña; **no pide SMS**). Después: pestaña «Nueva producción» → bloque «Automóviles» → tarjeta «Turismos y
  Motos» → enlace «Tarificación y Emisión Rápida», que **abre una PESTAÑA NUEVA** con el formulario NSEI. Código:
  `adapters/mapfre/entrada.ts` (clave `mapfre:nueva_produccion:auto`, sin avances autorizados).
- **Diálogo HTTP:** en la pestaña nueva Chromium pinta el diálogo nativo de auth («wmediadores.mapfre.com necesita un nombre de
  usuario y una contraseña»). Alberto lo **cancela**; detrás ya está el formulario (`app-datos-basicos`: «Fecha Condiciones»,
  «Fecha de mecanización»). El bot lo cancela dejando el contexto SIN `httpCredentials` (Chromium responde 401). Cepo en
  `test/mapfre-entrada.test.ts`.
- 🚨 **Trampas de la entrada:** (1) el guard de emisión bloquea hoy el texto «Tarificación y Emisión Rápida» (casa `emisi`):
  hace falta una excepción exacta y guardada; (2) el explorador debe poder continuar en la pestaña nueva (hoy usa la `page`
  original y para con `sin_salida` si hay más de una). Sin ambas, la entrada no está conectada en `PORTALES_EXPLORACION`.
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
  - Login y entrada: hechos (ver «Entrada»); falta conectarlos al explorador (pestaña nueva + guard).
  - Avance «Continuar» entre pasos; elegir fila y confirmar el diálogo de vehículo.
  - `mat-select` (uso, ámbito, clase de permiso, compañía anterior): no se grabaron abiertos. Significado de uso,
    ámbito y clase de permiso: PENDIENTE — preguntar a Alberto.
  - Búsqueda del tomador/conductor por NIF (lupa).
  - Botón de guardar y descarga de PDF: PENDIENTE — preguntar a Alberto.
