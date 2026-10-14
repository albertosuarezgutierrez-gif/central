# Conocimiento de portales del tarificador RPA

> Qué sabemos de cada portal de compañía y cómo se trabaja con él. Sin datos personales ni valores reales:
> solo nombres de pantalla y claves de catálogo. Estado vivo, DOM detallado y plan: `docs/TARIFICADOR-RPA.md`.
> Técnica del worker: `services/tarificador-rpa/README.md`. Revisado: 14/10/2026.

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
- **Guardar el presupuesto SÍ; emitir NO (Alberto, 13-14/10/2026: «el bot tiene que hacer absolutamente todo, menos la
  emisión […] el presupuesto hay que guardarlo; lo guardas con la referencia y ahí te descarga el presupuesto»).**
  - Lista ÚNICA en `packages/module-tarificacion/src/acciones-portal.ts` (`ACCIONES_PORTAL`): de ella salen el prompt del
    explorador, el validador y el guard del worker. Tres categorías:
    - **Emisión — prohibida siempre:** Emitir, Contratar, Formalizar, Firmar, Pagar/Pago, Pago fraccionado, Tramitar póliza,
      Confirmar contratación, Domiciliar, Suplemento, Anular/Baja, `validar_aceptar`/`btnAccept`.
    - **Prohibida (no emite, pero no se pulsa):** **Proyecto ampliado** (no hay certeza de que solo enseñe/descargue: ePAC lo
      pone junto a Archivar/Emitir; se abrirá cuando Alberto confirme qué hace), Enviar, Salir/Cerrar sesión.
    - **Guardar presupuesto — permitida SOLO en la pantalla de resultado (con el precio a la vista) y con
      `efectoEsperado: 'guardar_presupuesto'`:** Grabar, Guardar (presupuesto/proyecto), Archivar (ePAC `td#store`,
      `action=store`), Descargar, Imprimir, Generar PDF. Fuera de ahí (formulario, sin precio, como navegación), prohibida.
      Un botón que mezcle guardar con emitir/contratar/pagar («Guardar y emitir») cae como emisión.
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
