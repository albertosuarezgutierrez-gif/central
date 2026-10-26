// VOCABULARIO COMÚN del tarificador RPA (26/10/2026). PURO: sin Playwright, sin red, sin I/O.
//
// Lo que aprende un bot sobre los RÓTULOS de un portal (sinónimos de etiquetas y de botones) tiene que servir al siguiente bot y a otros ramos.
// Por eso el diccionario se organiza por CONCEPTO, no por compañía, con ramo opcional (sin ramo = común a todos). Cada término lleva su ORIGEN
// (compañía + fecha de cuando se vio en un portal real). Tres listas, SEPARADAS y tipadas:
//
//   · CONCEPTOS DE LECTURA (`CONCEPTOS_LECTURA`): etiquetas, cabeceras y rótulos que el bot solo LEE o localiza (precio, compañía anterior, fechas…).
//     Equivocarse aquí es un dato mal leído, no un clic.
//   · CONCEPTOS DE ACCIÓN (`CONCEPTOS_ACCION`): rótulos de botones que el bot PULSA (avanzar, guardar/generar proyecto, descargar documento).
//     Pulsar sigue siendo cosa EXCLUSIVA de `pulsar()` y su familia en `guard.ts`: estar aquí NO autoriza ningún clic.
//   · LISTA DE BLOQUEO (`BLOQUEO`): emitir, contratar, pagar, firmar, formalizar, grabar póliza, enviar… SIEMPRE gana sobre una acción
//     (`clasificarRotulo` mira el bloqueo antes que nada). Nunca se relaja desde aquí.
//
// 🔒 Reglas del repo que afectan a este fichero: las palabras de ciertos controles de alta/credenciales y de los selectores de opción solo pueden
// escribirse en `guard.ts` (guardián `test/regression-tarificador-rpa.test.ts`). Si un término es una de esas palabras, VIVE en `guard.ts`
// (`TERMINOS_BLOQUEO_SOLO_GUARD`) y el guard lo suma a la lista de aquí. Este fichero no las nombra ni en cadenas.
// Cómo crece: a mano al dar de alta un bot (MANUAL-NUEVO-BOT.md) y por PROPUESTA con `scripts/vocabulario-candidatos.ts`, que nunca aplica nada solo.

/** Ramo al que se restringe un término. Sin ramo = común. */
export type Ramo = 'auto' | 'moto' | 'hogar' | 'comunidades' | 'comercio'

/** De dónde sale un término: compañía (o `comun`) y fecha `dd/mm/aaaa` en que se vio/introdujo. Sin datos personales. */
export type Origen = Readonly<{ compania: string; fecha: string; nota?: string }>

/** Un término. `texto` en minúsculas y SIN tildes (salvo los de `regexEtiquetaExacta`, que conservan la tilde para reconstruir el patrón). `prefijo`: admite sufijo de palabra (`imprim` → imprimir, imprimible). `plural`: admite `s` final. */
export type Termino = Readonly<{ texto: string; origen: Origen; prefijo?: boolean; plural?: boolean; ramos?: readonly Ramo[] }>

const o = (compania: string, fecha: string, nota?: string): Origen => Object.freeze(nota ? { compania, fecha, nota } : { compania, fecha })
const t = (texto: string, origen: Origen, extra: { prefijo?: boolean; plural?: boolean; ramos?: readonly Ramo[] } = {}): Termino => Object.freeze({ texto, origen, ...extra })

/** Construye un término del guard (para listas que SOLO pueden nombrarse en `guard.ts`). */
export function terminoPropio(texto: string, compania: string, fecha: string, nota?: string): Termino {
  return t(texto, o(compania, fecha, nota))
}

// ───────────────────────── orígenes (cada uno, una vez) ─────────────────────────
const GEN_LECTOR = o('generali', '19/10/2026', 'lector tolerante del precio, Generali 0.2.x')
const GEN_GARANTIAS = o('generali', '26/10/2026', 'pantalla «Garantías y Capitales opcionales», Generali 0.2.30')
const GEN_MODALIDADES = o('generali', '26/10/2026', 'tabla «Modalidades de Seguro», Generali 0.2.31')
const GEN_DIAG = o('generali', '26/10/2026', 'diagnóstico de importes sin datos personales, Generali 0.2.3x')
const GEN_RIESGO = o('generali', '18/10/2026', 'mapa provisional de «Datos de Valoración»')
const GEN_SIGUIENTE = o('generali', '26/10/2026', '«Siguiente ›» de Valoración Riesgo, Generali 0.2.29')
const GEN_EMISION = o('generali', '26/10/2026', 'textos de emisión en página o diálogo, Generali 0.2.29-0.2.34')
const MAP_COMPANIA = o('mapfre', '26/10/2026', 'Figuras sin app-historial-siniestralidad, Mapfre 0.8.24')
const MAP_PROYECTO = o('mapfre', '22/10/2026', 'Generar Proyecto / Ir a generar proyecto / Guardar proyecto, Mapfre 0.8.x')
const MAP_CONTINUAR = o('mapfre', '14/10/2026', '«Continuar» de NSEI')
const ALZ_CALCULAR = o('allianz', '06/10/2026', 'Calcular de ePAC (tabla cerrada del formador)')
const ALZ_PROPUESTA = o('allianz', '26/10/2026', '«Descargar propuesta» tras guardar presupuesto, Allianz 0.6.29')
const DESCARGA = o('allianz+mapfre+generali', '26/10/2026', 'descarga del proyecto/presupuesto guardado, Allianz 0.6.28 / Mapfre 0.8.23 / Generali 0.2.33')
const DESCARGA_BLOQUEO = o('allianz+mapfre+generali', '26/10/2026', 'lista negra del rótulo de descarga')
const GUARD_OCULTO = o('allianz+mapfre+generali', '26/10/2026', 'lista negra de atributos internos (id, name, href, manejadores)')

// ───────────────────────── CONCEPTOS ─────────────────────────

export type ClaseConcepto = 'lectura' | 'accion'

export type Concepto<Id extends string = string, G extends string = string> = Readonly<{
  clase: ClaseConcepto
  id: Id
  /** Sin `ramos` = común a todos los ramos. */
  ramos?: readonly Ramo[]
  descripcion: string
  /** Grupos de términos con rol propio (p. ej. verbo/objeto). */
  grupos: Readonly<Record<G, readonly Termino[]>>
}>

const gen = o('generali', '18/10/2026')

/** CONCEPTOS DE LECTURA: etiquetas que el bot solo lee o localiza. */
export const CONCEPTOS_LECTURA = Object.freeze({
  /** Línea de la pantalla que puede llevar el precio (lector tolerante de Generali). */
  precio: {
    clase: 'lectura', id: 'precio', descripcion: 'Líneas de la pantalla que pueden llevar el precio (prima, importe, recibo, anual…).',
    grupos: {
      rotulos: [
        t('prima', GEN_LECTOR, { plural: true }), t('precio', GEN_LECTOR), t('importe', GEN_LECTOR), t('total', GEN_LECTOR), t('a pagar', GEN_LECTOR),
        t('recibo', GEN_LECTOR), t('coste', GEN_LECTOR), t('contado', GEN_LECTOR), t('anual', GEN_LECTOR),
      ],
    },
  },
  /** Mismo concepto, solo en la pantalla de garantías (v0.2.30): «cuota». */
  precio_cuota: {
    clase: 'lectura', id: 'precio_cuota', descripcion: 'Etiqueta «cuota»: cuenta como línea de precio SOLO en la pantalla «Garantías y Capitales opcionales».',
    grupos: { rotulos: [t('cuota', GEN_GARANTIAS, { plural: true })] },
  },
  /** La línea de precio que gana cuando hay varias. */
  precio_total: {
    clase: 'lectura', id: 'precio_total', descripcion: 'Línea de precio TOTAL (manda sobre las demás líneas de precio).',
    grupos: { rotulos: [t('total', GEN_LECTOR)] },
  },
  precio_total_anual: {
    clase: 'lectura', id: 'precio_total_anual', descripcion: 'Prima/cuota total anual: la que se elige si hay varios importes.',
    grupos: { rotulos: [t('total anual', GEN_GARANTIAS), t('anual total', GEN_GARANTIAS), t('prima anual', GEN_GARANTIAS), t('cuota anual', GEN_GARANTIAS)] },
  },
  /** Líneas con importes que NO son el precio. */
  importe_ajeno: {
    clase: 'lectura', id: 'importe_ajeno', descripcion: 'Líneas con importes que NO son el precio (capitales, franquicias, valores, límites).',
    grupos: {
      rotulos: [
        t('franquicia', GEN_LECTOR), t('capital', GEN_LECTOR), t('suma asegurada', GEN_LECTOR), t('limite', GEN_LECTOR), t('valor', GEN_LECTOR),
        t('accesorios', GEN_LECTOR), t('indemnizacion', GEN_LECTOR), t('km', GEN_LECTOR), t('kilometros', GEN_LECTOR),
      ],
    },
  },
  /** Cabeceras de COLUMNA de precio de las tablas (lector en página, `JS_IMPORTES_TABLA`): por subcadena, sin distinguir mayúsculas. «cuota» se suma solo en «Garantías y Capitales opcionales» (`precio_cuota`). */
  precio_cabecera_tabla: {
    clase: 'lectura', id: 'precio_cabecera_tabla', descripcion: 'Cabeceras de columna de precio en las tablas de importes (prima, precio, importe, total, recibo, anual, contado, pagar).',
    grupos: {
      rotulos: [
        t('prima', GEN_LECTOR), t('precio', GEN_LECTOR), t('importe', GEN_LECTOR), t('total', GEN_LECTOR),
        t('recibo', GEN_LECTOR), t('anual', GEN_LECTOR), t('contado', GEN_LECTOR), t('pagar', GEN_LECTOR),
      ],
    },
  },
  /** Lista BLANCA de etiquetas de dinero/garantías que SÍ se enseñan en los diagnósticos (cualquier otra podría ser un nombre → «(otra)»). */
  dinero_diagnostico: {
    clase: 'lectura', id: 'dinero_diagnostico', descripcion: 'Etiquetas de dinero y garantías que pueden mostrarse en un diagnóstico sin riesgo de ser datos personales.',
    grupos: {
      rotulos: [
        t('prima', GEN_DIAG, { plural: true }), t('cuota', GEN_DIAG, { plural: true }), t('recibo', GEN_DIAG, { plural: true }), t('total', GEN_DIAG), t('neta', GEN_DIAG), t('neto', GEN_DIAG),
        t('anual', GEN_DIAG), t('anuales', GEN_DIAG), t('semestral', GEN_DIAG), t('trimestral', GEN_DIAG), t('mensual', GEN_DIAG), t('contado', GEN_DIAG), t('fraccionado', GEN_DIAG),
        t('pagar', GEN_DIAG), t('importe', GEN_DIAG), t('precio', GEN_DIAG), t('impuesto', GEN_DIAG, { plural: true }), t('recargo', GEN_DIAG, { plural: true }), t('consorcio', GEN_DIAG),
        t('tasa', GEN_DIAG, { plural: true }), t('descuento', GEN_DIAG), t('bonificacion', GEN_DIAG), t('bonus', GEN_DIAG), t('malus', GEN_DIAG), t('comision', GEN_DIAG),
        t('franquicia', GEN_DIAG), t('capital', GEN_DIAG), t('capitales', GEN_DIAG), t('garantia', GEN_DIAG, { plural: true }), t('cobertura', GEN_DIAG, { plural: true }),
        t('modalidad', GEN_DIAG), t('opcion', GEN_DIAG), t('concepto', GEN_DIAG), t('descripcion', GEN_DIAG), t('todo riesgo', GEN_DIAG), t('terceros', GEN_DIAG), t('ampliado', GEN_DIAG),
        t('basico', GEN_DIAG), t('completo', GEN_DIAG), t('lunas', GEN_DIAG), t('rotura', GEN_DIAG), t('robo', GEN_DIAG), t('incendio', GEN_DIAG), t('asistencia', GEN_DIAG),
        t('defensa', GEN_DIAG), t('ocupantes', GEN_DIAG), t('accidentes', GEN_DIAG), t('seguro', GEN_DIAG, { plural: true }), t('colision', GEN_DIAG), t('colisiones', GEN_DIAG), t('averias', GEN_DIAG),
      ],
    },
  },
  recibo_anual: {
    clase: 'lectura', id: 'recibo_anual', ramos: ['auto', 'moto'], descripcion: 'Cabecera de la columna con el importe anual de cada modalidad.',
    grupos: { rotulos: [t('recibo anual', GEN_MODALIDADES)] },
  },
  prima_anualidad: {
    clase: 'lectura', id: 'prima_anualidad', ramos: ['auto', 'moto'], descripcion: 'Cabecera de la columna «Prima Anualidad» de la tabla de modalidades.',
    grupos: { rotulos: [t('prima anualidad', GEN_MODALIDADES)] },
  },
  modalidades: {
    clase: 'lectura', id: 'modalidades', ramos: ['auto', 'moto'], descripcion: 'Cabecera de la tabla de modalidades de seguro.',
    grupos: { rotulos: [t('modalidades de seguro', GEN_MODALIDADES)] },
  },
  prima_total_tarjeta: {
    clase: 'lectura', id: 'prima_total_tarjeta', descripcion: 'Etiqueta «PRIMA TOTAL» de la tarjeta de producto (Mapfre NSEI, Coberturas).',
    grupos: { rotulos: [t('prima total', o('mapfre', '15/10/2026', 'tarjetas de Coberturas'))] },
  },
  /** Etiqueta EXACTA (con o sin asterisco) del desplegable de compañía anterior (el término conserva la tilde: `regexEtiquetaExacta` admite también la forma sin ella). */
  compania_anterior: {
    clase: 'lectura', id: 'compania_anterior', ramos: ['auto', 'moto'], descripcion: 'Etiqueta exacta del desplegable de compañía anterior (variante de «Figuras» sin app-historial-siniestralidad).',
    grupos: { etiqueta_exacta: [t('compañía', MAP_COMPANIA)] },
  },
  fecha_nacimiento: {
    clase: 'lectura', id: 'fecha_nacimiento', ramos: ['auto', 'moto'], descripcion: 'Fecha de nacimiento del tomador/conductor.',
    grupos: { etiqueta_exacta: [t('fecha de nacimiento', GEN_RIESGO), t('fecha nacimiento', GEN_RIESGO), t('f nacimiento', GEN_RIESGO)] },
  },
  fecha_carne: {
    clase: 'lectura', id: 'fecha_carne', ramos: ['auto', 'moto'], descripcion: 'Fecha de expedición del carné/permiso.',
    grupos: {
      etiqueta_exacta: [
        t('fecha de carne', GEN_RIESGO), t('fecha carne', GEN_RIESGO), t('fecha de carnet', GEN_RIESGO), t('fecha carnet', GEN_RIESGO),
        t('fecha expedicion carne', GEN_RIESGO), t('fecha expedicion carnet', GEN_RIESGO), t('fecha de expedicion del carne', GEN_RIESGO),
        t('fecha de expedicion del carnet', GEN_RIESGO), t('fecha expedicion permiso', GEN_RIESGO), t('fecha de expedicion del permiso', GEN_RIESGO),
      ],
    },
  },
  codigo_postal: {
    clase: 'lectura', id: 'codigo_postal', descripcion: 'Código postal.',
    grupos: { etiqueta_exacta: [t('codigo postal', gen), t('c p', gen), t('cp', gen)] },
  },
  anios_asegurado: {
    clase: 'lectura', id: 'anios_asegurado', ramos: ['auto', 'moto'], descripcion: 'Años asegurado (antigüedad con la compañía anterior).',
    grupos: {
      etiqueta_exacta: [
        t('anos asegurado', GEN_RIESGO), t('anos asegurados', GEN_RIESGO), t('anos de aseguramiento', GEN_RIESGO),
        t('anos asegurado anterior', GEN_RIESGO), t('anos en la compania anterior', GEN_RIESGO),
      ],
    },
  },
  siniestros_5_anios: {
    clase: 'lectura', id: 'siniestros_5_anios', ramos: ['auto', 'moto'], descripcion: 'Siniestros de los últimos 5 años.',
    grupos: {
      etiqueta_exacta: [
        t('siniestros ultimos 5 anos', GEN_RIESGO), t('n siniestros ultimos 5 anos', GEN_RIESGO), t('numero de siniestros', GEN_RIESGO),
        t('siniestros con culpa ultimos 5 anos', GEN_RIESGO),
      ],
    },
  },
} as const satisfies Record<string, Concepto>)
export type IdLectura = keyof typeof CONCEPTOS_LECTURA

/** CONCEPTOS DE ACCIÓN: rótulos de botones que el bot pulsa SIEMPRE por el guard. Estar aquí no autoriza ningún clic. */
export const CONCEPTOS_ACCION = Object.freeze({
  avanzar: {
    clase: 'accion', id: 'avanzar', descripcion: 'Avanzar entre pantallas: texto ENTERO (el «Siguiente ›» de Generali admite adornos al final).',
    grupos: { continuar: [t('continuar', MAP_CONTINUAR)], siguiente: [t('siguiente', GEN_SIGUIENTE)] },
  },
  calcular: {
    clase: 'accion', id: 'calcular', descripcion: 'Calcular/recalcular la prima.',
    grupos: { rotulos: [t('calcular', ALZ_CALCULAR), t('calcular prima', ALZ_CALCULAR), t('recalcular', ALZ_CALCULAR)] },
  },
  generar_proyecto: {
    clase: 'accion', id: 'generar_proyecto', descripcion: 'Generar el proyecto (Mapfre NSEI): texto ENTERO.',
    grupos: { rotulos: [t('generar proyecto', MAP_PROYECTO)] },
  },
  ir_a_generar_proyecto: {
    clase: 'accion', id: 'ir_a_generar_proyecto', descripcion: 'Navegación hacia «Generar Proyecto» (Mapfre NSEI): texto ENTERO.',
    grupos: { rotulos: [t('ir a generar proyecto', MAP_PROYECTO)] },
  },
  guardar_proyecto: {
    clase: 'accion', id: 'guardar_proyecto', descripcion: 'Botón final alternativo tras «Ir a generar proyecto» (Mapfre NSEI): texto ENTERO.',
    grupos: { rotulos: [t('guardar proyecto', MAP_PROYECTO)] },
  },
  /** Descargar/imprimir el proyecto o presupuesto GUARDADO. Compuesto: verbo + objeto. */
  descargar_documento: {
    clase: 'accion', id: 'descargar_documento', descripcion: 'Descargar/imprimir el proyecto, presupuesto, oferta o propuesta guardados: verbo + objeto (o verbo a secas si ya está guardado).',
    grupos: {
      verbo: [t('imprim', DESCARGA, { prefijo: true }), t('descarg', DESCARGA, { prefijo: true }), t('print', DESCARGA, { prefijo: true }), t('download', DESCARGA, { prefijo: true }), t('pdf', DESCARGA)],
      /** Con objeto delante, «documento» también cuenta como verbo (nunca solo). */
      verbo_con_objeto: [t('documento', DESCARGA)],
      objeto: [t('proyecto', DESCARGA, { plural: true }), t('presupuesto', DESCARGA, { plural: true }), t('oferta', DESCARGA, { plural: true })],
      /** «propuesta» SOLO junto a imprimir/descargar/pdf (nunca con «documento» suelto). */
      objeto_propuesta: [t('propuesta', ALZ_PROPUESTA, { plural: true })],
      /** Rótulos de documentos AJENOS al proyecto: descartan el control. */
      excluir: [
        t('condicion', DESCARGA_BLOQUEO, { prefijo: true }), t('condicionado', DESCARGA_BLOQUEO), t('clausulad', DESCARGA_BLOQUEO, { prefijo: true }),
        t('manual', DESCARGA_BLOQUEO, { prefijo: true }), t('ayuda', DESCARGA_BLOQUEO), t('aplicacion', DESCARGA_BLOQUEO), t('app', DESCARGA_BLOQUEO),
        t('tarifa', DESCARGA_BLOQUEO, { prefijo: true }), t('bases', DESCARGA_BLOQUEO), t('politica', DESCARGA_BLOQUEO, { prefijo: true }),
        t('privacidad', DESCARGA_BLOQUEO), t('protocolo', DESCARGA_BLOQUEO), t('precontractual', DESCARGA_BLOQUEO, { prefijo: true }),
        t('ipid', DESCARGA_BLOQUEO), t('informativ', DESCARGA_BLOQUEO, { prefijo: true }), t('informacion', DESCARGA_BLOQUEO),
        t('extracto', DESCARGA_BLOQUEO), t('cuestionario', DESCARGA_BLOQUEO), t('licencia', DESCARGA_BLOQUEO), t('factura', DESCARGA_BLOQUEO, { prefijo: true }),
        t('carta', DESCARGA_BLOQUEO), t('mandato', DESCARGA_BLOQUEO), t('catalogo', DESCARGA_BLOQUEO), t('folleto', DESCARGA_BLOQUEO),
      ],
    },
  },
} as const satisfies Record<string, Concepto>)
export type IdAccion = keyof typeof CONCEPTOS_ACCION

// ───────────────────────── LISTA DE BLOQUEO ─────────────────────────

/**
 * LISTA DE BLOQUEO. SIEMPRE gana sobre una acción. Cuatro grupos para poder decir POR QUÉ se bloquea y para que una etiqueta de LECTURA
 * (p. ej. la cabecera «Recibo Anual») no se descarte por ser un importe: `economico_ajeno` no se aplica a rótulos de lectura.
 * `atributo_interno` se compara por SUBCADENA (ids, name, href, manejadores); los demás, por palabra entera.
 * Los términos de control de alta/credenciales que solo puede nombrar `guard.ts` NO están aquí: los suma el guard (`TERMINOS_BLOQUEO_SOLO_GUARD`).
 */
export const BLOQUEO = Object.freeze({
  emision: [
    t('emit', DESCARGA_BLOQUEO, { prefijo: true }), t('contrat', DESCARGA_BLOQUEO, { prefijo: true }), t('grabar', DESCARGA_BLOQUEO, { prefijo: true }),
    t('pagar', DESCARGA_BLOQUEO), t('pago', DESCARGA_BLOQUEO, { plural: true }), t('firm', DESCARGA_BLOQUEO, { prefijo: true }),
    t('formaliz', DESCARGA_BLOQUEO, { prefijo: true }), t('domicili', DESCARGA_BLOQUEO, { prefijo: true }), t('poliza', DESCARGA_BLOQUEO), t('solicitud', DESCARGA_BLOQUEO),
  ],
  envio_externo: [
    t('enviar', DESCARGA_BLOQUEO), t('envio', DESCARGA_BLOQUEO), t('envia', DESCARGA_BLOQUEO, { prefijo: true }), t('email', DESCARGA_BLOQUEO), t('e-mail', DESCARGA_BLOQUEO),
    t('mail', DESCARGA_BLOQUEO), t('correo', DESCARGA_BLOQUEO), t('sms', DESCARGA_BLOQUEO), t('whatsapp', DESCARGA_BLOQUEO), t('send', DESCARGA_BLOQUEO),
    t('share', DESCARGA_BLOQUEO), t('compartir', DESCARGA_BLOQUEO), t('cliente', DESCARGA_BLOQUEO),
  ],
  destructivo: [
    t('anular', DESCARGA_BLOQUEO), t('elimin', DESCARGA_BLOQUEO, { prefijo: true }), t('borrar', DESCARGA_BLOQUEO), t('cancelar', DESCARGA_BLOQUEO), t('confirmar', DESCARGA_BLOQUEO),
  ],
  economico_ajeno: [t('recibo', DESCARGA_BLOQUEO, { plural: true })],
  atributo_interno: [
    t('emit', GUARD_OCULTO), t('contrat', GUARD_OCULTO), t('grabar', GUARD_OCULTO), t('pagar', GUARD_OCULTO), t('pago', GUARD_OCULTO), t('firm', GUARD_OCULTO),
    t('formaliz', GUARD_OCULTO), t('enviar', GUARD_OCULTO), t('email', GUARD_OCULTO), t('mail', GUARD_OCULTO), t('sms', GUARD_OCULTO), t('anul', GUARD_OCULTO),
    t('elimin', GUARD_OCULTO), t('borrar', GUARD_OCULTO),
  ],
  /** Texto de emisión visible en la página o en un diálogo (Generali). Palabra entera, sobre texto sin tildes y en minúsculas. */
  emision_pagina: [
    t('emitir', GEN_EMISION), t('contratar', GEN_EMISION), t('grabar poliza', GEN_EMISION), t('grabar la poliza', GEN_EMISION),
    t('pagar', GEN_EMISION), t('firmar', GEN_EMISION), t('formalizar', GEN_EMISION),
  ],
}) satisfies Readonly<Record<string, readonly Termino[]>>
export type GrupoBloqueo = keyof typeof BLOQUEO

/** Grupos del bloqueo que se miran sobre el RÓTULO de un control (palabra entera). */
export const GRUPOS_BLOQUEO_ROTULO: readonly GrupoBloqueo[] = Object.freeze(['emision', 'envio_externo', 'destructivo', 'economico_ajeno'] as const)

// ───────────────────────── utilidades PURAS ─────────────────────────

/** Minúsculas, sin tildes (la ñ pasa a n), `_` → espacio, espacios colapsados. Misma normalización que el guard de descarga. */
export function normalizarRotulo(x: string | null | undefined): string {
  return String(x ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
}

const escapar = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Fragmento de patrón de un término (sin límites de palabra). */
function fragmento(x: Termino, mayus: boolean): string {
  return `${escapar(mayus ? x.texto.toUpperCase() : x.texto)}${x.prefijo ? '\\w*' : ''}${x.plural ? (mayus ? 'S?' : 's?') : ''}`
}

/**
 * `\b(a|b|c)\b` sin banderas. Por defecto sobre texto normalizado en minúsculas; con `mayus`, sobre texto en MAYÚSCULAS sin tildes (como
 * `normalizarCatalogo` de Generali). Con `limites: false`, `(a|b|c)` por subcadena.
 */
export function regexPalabras(terminos: readonly Termino[], opts: { limites?: boolean; mayus?: boolean } = {}): RegExp {
  const alt = terminos.map((x) => fragmento(x, opts.mayus === true)).join('|')
  return new RegExp(opts.limites === false ? `(${alt})` : `\\b(${alt})\\b`)
}

/** Términos de un concepto (todos los grupos, o los indicados), filtrados por ramo (sin ramo en el término = común). */
export function terminosDe(c: Concepto, opts: { grupos?: readonly string[]; ramo?: Ramo } = {}): Termino[] {
  const ramoC = c.ramos
  if (opts.ramo && ramoC && !ramoC.includes(opts.ramo)) return []
  const out: Termino[] = []
  for (const [g, lista] of Object.entries(c.grupos) as [string, readonly Termino[]][]) {
    if (opts.grupos && !opts.grupos.includes(g)) continue
    for (const x of lista) if (!opts.ramo || !x.ramos || x.ramos.includes(opts.ramo)) out.push(x)
  }
  return out
}

/** `a|b|c` (términos escapados, en minúsculas) para incrustar en un patrón de página. Con `plural`/`prefijo` aplica los mismos sufijos que `regexPalabras`. */
export function alternativa(terminos: readonly Termino[]): string {
  return terminos.map((x) => fragmento(x, false)).join('|')
}

/** Textos (en mayúsculas, como los usa Generali tras `normalizarCatalogo`) de un grupo de un concepto. */
export function textosMayus(c: Concepto, grupo: string): string[] {
  return (c.grupos[grupo] ?? []).map((x) => x.texto.toUpperCase())
}

/** Texto de un término único en mayúsculas (p. ej. «GENERAR PROYECTO»). Lanza si el grupo no tiene exactamente uno. */
export function rotuloMayus(c: Concepto, grupo: string, texto: string): string {
  const x = (c.grupos[grupo] ?? []).find((y) => y.texto === texto)
  if (!x) throw new Error(`vocabulario: «${texto}» no está en ${c.id}.${grupo}`)
  return x.texto.toUpperCase()
}

/**
 * ¿Qué parte del texto casa con el bloqueo? Devuelve el grupo y el término, o `null`. `extra`: términos que solo puede nombrar el guard.
 * `excepto`: grupos que NO se miran (una etiqueta de lectura no se descarta por «recibo»).
 */
export function casaBloqueo(texto: string | null | undefined, opts: { extra?: readonly Termino[]; excepto?: readonly GrupoBloqueo[] } = {}): { grupo: GrupoBloqueo | 'solo_guard'; termino: string } | null {
  const n = normalizarRotulo(texto)
  if (n === '') return null
  for (const g of GRUPOS_BLOQUEO_ROTULO) {
    if (opts.excepto?.includes(g)) continue
    const m = regexPalabras(BLOQUEO[g]).exec(n)
    if (m) return { grupo: g, termino: m[0] }
  }
  if (opts.extra && opts.extra.length > 0) {
    const m = regexPalabras(opts.extra).exec(n)
    if (m) return { grupo: 'solo_guard', termino: m[0] }
  }
  return null
}

/** Un único patrón (palabra entera) con TODOS los grupos de rótulo del bloqueo más `extra` (los términos que solo puede nombrar el guard). */
export function regexBloqueoRotulo(extra: readonly Termino[] = []): RegExp {
  return regexPalabras([...GRUPOS_BLOQUEO_ROTULO.flatMap((g) => BLOQUEO[g]), ...extra])
}

const RE_ADORNOS = /[\s ›>»*:]+$/

/** Quita adornos finales de un rótulo (›, >, », *, :, espacios). */
export function sinAdornos(x: string): string {
  return normalizarRotulo(x).replace(RE_ADORNOS, '')
}

/** ¿El rótulo es EXACTAMENTE alguno de estos términos (tras quitar adornos finales)? */
export function esRotuloExacto(texto: string | null | undefined, terminos: readonly Termino[]): boolean {
  const n = sinAdornos(String(texto ?? ''))
  return n !== '' && terminos.some((x) => normalizarRotulo(x.texto) === n)
}

/**
 * Patrón de ETIQUETA EXACTA de un término con tildes opcionales (ñ/n, á/a, é/e, í/i, ó/o, ú/u), con asterisco final opcional, sin
 * distinguir mayúsculas: el de «Compañía» es `^\s*compa(?:ñ|n)(?:í|i)a\s*\*?\s*$` con bandera `i`. Para `locator.filter({ hasText })`.
 */
export function regexEtiquetaExacta(x: Termino): RegExp {
  const cuerpo = [...x.texto].map((ch) => {
    const base: Record<string, string> = { ñ: 'n', á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u' }
    return base[ch] ? `(?:${ch}|${base[ch]})` : escapar(ch)
  }).join('')
  return new RegExp(`^\\s*${cuerpo}\\s*\\*?\\s*$`, 'i')
}

/** Patrón sobre texto en MAYÚSCULAS (`^SIGUIENTE[\s ›>»]*$`): el término seguido solo de adornos finales. */
export function regexRotuloConAdornos(x: Termino, adornos = '\\s\\u00a0›>»'): RegExp {
  return new RegExp(`^${escapar(x.texto.toUpperCase())}[${adornos}]*$`)
}

// ───────────────────────── clasificación ─────────────────────────

export type ClasificacionRotulo =
  | { clase: 'bloqueado'; grupo: GrupoBloqueo | 'solo_guard'; termino: string }
  | { clase: 'accion'; concepto: IdAccion }
  | { clase: 'lectura'; concepto: IdLectura }
  | null

const RE_VERBO_DESCARGA = regexPalabras(terminosDe(CONCEPTOS_ACCION.descargar_documento, { grupos: ['verbo'] }))
const RE_VERBO_DESCARGA_CON_OBJETO = regexPalabras(terminosDe(CONCEPTOS_ACCION.descargar_documento, { grupos: ['verbo', 'verbo_con_objeto'] }))
const RE_OBJETO_DESCARGA = regexPalabras(terminosDe(CONCEPTOS_ACCION.descargar_documento, { grupos: ['objeto'] }))
const RE_OBJETO_PROPUESTA = regexPalabras(terminosDe(CONCEPTOS_ACCION.descargar_documento, { grupos: ['objeto_propuesta'] }))
const RE_EXCLUIR_DESCARGA = regexPalabras(terminosDe(CONCEPTOS_ACCION.descargar_documento, { grupos: ['excluir'] }))

export {
  RE_VERBO_DESCARGA,
  RE_VERBO_DESCARGA_CON_OBJETO,
  RE_OBJETO_DESCARGA,
  RE_OBJETO_PROPUESTA,
  RE_EXCLUIR_DESCARGA,
}

/** ¿Es un rótulo de DESCARGA con objeto (verbo + proyecto/presupuesto/oferta, o verbo + propuesta)? Texto ya normalizado. No mira el bloqueo. */
export function esDescargaConObjeto(normalizado: string): boolean {
  return (RE_VERBO_DESCARGA_CON_OBJETO.test(normalizado) && RE_OBJETO_DESCARGA.test(normalizado)) || (RE_VERBO_DESCARGA.test(normalizado) && RE_OBJETO_PROPUESTA.test(normalizado))
}

/**
 * Clasifica un rótulo: BLOQUEO primero (siempre gana), después acción, después lectura. `null` = no conocido.
 * `extraBloqueo`: términos que solo puede nombrar el guard. Un rótulo de lectura no se descarta por el grupo `economico_ajeno`.
 */
export function clasificarRotulo(texto: string | null | undefined, opts: { ramo?: Ramo; extraBloqueo?: readonly Termino[] } = {}): ClasificacionRotulo {
  const n = normalizarRotulo(texto)
  if (n === '') return null
  const lecturaExacta = lecturaDeEtiqueta(n, opts.ramo)
  const b = casaBloqueo(n, { extra: opts.extraBloqueo, excepto: lecturaExacta ? ['economico_ajeno'] : [] })
  if (b) return { clase: 'bloqueado', ...b }
  const a = accionDeRotulo(n, opts.ramo)
  if (a) return { clase: 'accion', concepto: a }
  if (lecturaExacta) return { clase: 'lectura', concepto: lecturaExacta }
  return null
}

/** Acción que casa con un rótulo normalizado (sin mirar el bloqueo). */
export function accionDeRotulo(n: string, ramo?: Ramo): IdAccion | null {
  const sin = sinAdornos(n)
  if (esDescargaConObjeto(n) && !RE_EXCLUIR_DESCARGA.test(n)) return 'descargar_documento'
  for (const id of ['avanzar', 'calcular', 'generar_proyecto', 'ir_a_generar_proyecto', 'guardar_proyecto'] as const) {
    const c: Concepto = CONCEPTOS_ACCION[id]
    if (ramo && c.ramos && !c.ramos.includes(ramo)) continue
    if (esRotuloExacto(sin, terminosDe(c))) return id
  }
  return null
}

/** Concepto de lectura de una ETIQUETA/cabecera normalizada: exacta (grupos `etiqueta_exacta`/cabeceras) o por palabra (grupo `rotulos` de las de precio). */
export function lecturaDeEtiqueta(n: string, ramo?: Ramo): IdLectura | null {
  const sin = sinAdornos(n)
  for (const [id, c] of Object.entries(CONCEPTOS_LECTURA) as [IdLectura, Concepto][]) {
    if (ramo && c.ramos && !c.ramos.includes(ramo)) continue
    if (id === 'precio' || id === 'precio_cuota' || id === 'precio_total' || id === 'importe_ajeno' || id === 'precio_cabecera_tabla' || id === 'dinero_diagnostico') continue // por palabra, más abajo
    if (esRotuloExacto(sin, terminosDe(c))) return id
  }
  // Cabeceras compuestas: «Recibo Anual» de una columna, «Prima total anual»… (más específico primero).
  if (regexPalabras(terminosDe(CONCEPTOS_LECTURA.precio_total_anual)).test(n)) return 'precio_total_anual'
  if (/\b(recibo|prima|cuota|importe|precio)\b/.test(n) && /\banual(idad)?\b/.test(n)) return 'precio'
  return null
}

/** Todos los textos normalizados del vocabulario (lectura + acción), para saber si un rótulo «ya está». */
export function terminosConocidos(): Set<string> {
  const s = new Set<string>()
  for (const c of [...Object.values(CONCEPTOS_LECTURA), ...Object.values(CONCEPTOS_ACCION)] as Concepto[]) for (const x of terminosDe(c)) s.add(normalizarRotulo(x.texto))
  return s
}
