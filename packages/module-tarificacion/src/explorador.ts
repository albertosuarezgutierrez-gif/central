// EXPLORADOR IA del tarificador RPA (13/10/2026) — el núcleo PURO. Diseño: plan del explorador (docs/TARIFICADOR-RPA.md,
// sección «Explorador IA»). Sin BD, sin red, sin Playwright: lo consumen apps/asegura (ruta del worker que pregunta a la
// IA y guarda el mapa) y services/tarificador-rpa (que REVALIDA cada acción antes de tocar el portal).
//
// Qué hay aquí:
//   · ENTRADAS cerradas (nada de URLs libres) y los avances «Aceptar» que Alberto autorizó SOLO en exploración.
//   · CATÁLOGO de datos de prueba por CLAVE. La IA solo elige claves; el VALOR lo pone el worker (`resolverDato`):
//     sintético fijo, del riesgo del trabajo (solo si la exploración va ligada a una petición REAL de ese cliente/lead)
//     o de entorno (contacto de Alberto). La IA nunca ve un dato personal.
//   · LISTA BLANCA de acciones y el VALIDADOR estricto de la respuesta JSON (fail-closed: cualquier cosa rara = parar).
//   · Detector de PARADAS (SMS/OTP, CAPTCHA, pantallas de emisión), de BUCLE y los TOPES (llamadas, acciones, €, tiempo).
//   · El MAPA determinista versionado (`MapaExploracion` v1), su validador y la reutilización («memoria»): una pantalla
//     ya mapeada se rellena sin IA.
//
// 🚨 TARIFICAR ≠ EMITIR. 🚨 Nada de automatizar SMS/OTP/CAPTCHA: se para y se avisa. 🚨 La IA no escribe texto libre
// en el portal: solo claves del catálogo y valores de opciones que YA están en el inventario.

import { pareceEmision } from './guard-emision.ts'
import { clasificarAccionPortal, referenciaPresupuestoValida } from './acciones-portal.ts'
import {
  MAX_TITULOS_MARCO,
  pareceDatoPersonalInventario,
  valoresSensiblesDeRiesgo,
  type ElementoInventario,
  type InventarioDom,
  type MarcoInventario,
} from './inventario-dom.ts'
import { etiquetaIdHogar, type CampoIdHogar } from './riesgo-oportunidad.ts'

// ─── Entradas ────────────────────────────────────────────────────────────────

export type AvanceAutorizado = {
  /** Texto EXACTO (sin tildes, sin mayúsculas) del botón. */
  texto: RegExp
  /** Un título de la pantalla tiene que casar: el «Aceptar» de Datos básicos avanza a Tarificar; el de Tarificar EMITE. */
  enTitulo: RegExp
  /** …y ninguno de estos (si la pantalla dice «Tarificar», ese «Aceptar» ya no es el autorizado). */
  nuncaConTitulo: RegExp
}

export type EntradaExploracion = {
  compania: string
  ramo: string
  producto: string
  /** Pestaña y producto del menú «Nueva alta» del portal (los lee la función de entrada del worker). */
  pestana: string
  productoMenu: string
  avancesAutorizados: readonly AvanceAutorizado[]
}

/**
 * Alberto (13/10/2026): OK al «Aceptar» de Datos básicos → Tarificar EN EXPLORACIÓN (puede quedar un proyecto en ePAC; no
 * hace falta limpiarlo). Solo ese: el de la pantalla Tarificar contrata y sigue bloqueado por `pareceEmision`.
 */
const ACEPTAR_DATOS_BASICOS: AvanceAutorizado = Object.freeze({
  texto: /^aceptar$/,
  enTitulo: /datos\s+basicos/,
  nuncaConTitulo: /tarific|revisi|emisi|contrat|pago|firma|iban/,
})

export const ENTRADAS_EXPLORACION: Readonly<Record<string, EntradaExploracion>> = Object.freeze({
  'allianz:particulares:hogar': Object.freeze({
    compania: 'allianz', ramo: 'hogar', producto: 'hogar', pestana: 'Particulares',
    // Etiqueta REAL del tile en el acordeón «Particulares» de «Nueva Alta» (captura de Alberto, 13/10/2026): «Allianz HOGAR».
    productoMenu: 'Allianz HOGAR',
    avancesAutorizados: Object.freeze([ACEPTAR_DATOS_BASICOS]),
  }),
  // Oráculo: ya tiene adaptador real; sirve para comparar el mapa que sale con el conocido.
  'allianz:particulares:comunidades': Object.freeze({
    compania: 'allianz', ramo: 'comunidades', producto: 'comunidades', pestana: 'Particulares', productoMenu: 'Comunidades',
    avancesAutorizados: Object.freeze([ACEPTAR_DATOS_BASICOS]),
  }),
})

export function esEntradaExploracion(v: unknown): v is keyof typeof ENTRADAS_EXPLORACION {
  return typeof v === 'string' && Object.hasOwn(ENTRADAS_EXPLORACION, v)
}

// ─── Catálogo de datos de prueba ─────────────────────────────────────────────

export type FuenteDato = 'sintetico' | 'riesgo' | 'entorno'
export type TipoDato = 'texto' | 'numero' | 'fecha' | 'opcion'

export type DatoCatalogo = {
  clave: string
  descripcion: string
  tipo: TipoDato
  /** Dato de una PERSONA: con datos reales sale del riesgo o se para; nunca se mezcla con lo sintético. */
  personal: boolean
  fuente: FuenteDato
  /** Valor fijo de prueba (no personal o marcado «PRUEBA» para borrarlo en el portal). `'@manana'` = fecha de efecto. */
  sintetico?: string
  /** Ruta en el `riesgo` del trabajo (`a.b.c`). */
  rutaRiesgo?: string
  /** Variable de entorno (contacto de Alberto). Nunca en código, tests ni logs. */
  env?: string
}

export const ENV_EXPLORADOR_EMAIL = 'TARIFICADOR_EXPLORADOR_EMAIL'
export const ENV_EXPLORADOR_TELEFONO = 'TARIFICADOR_EXPLORADOR_TELEFONO'

const D = (d: DatoCatalogo): DatoCatalogo => Object.freeze(d)

/** Comunes a todo ramo: tomador de prueba, contacto (de Alberto, por entorno) y fecha de efecto. */
const DATOS_COMUNES: readonly DatoCatalogo[] = [
  D({ clave: 'tomador.nombre', descripcion: 'Nombre de pila del tomador', tipo: 'texto', personal: true, fuente: 'sintetico', sintetico: 'PRUEBA', rutaRiesgo: 'tomador.nombre' }),
  D({ clave: 'tomador.apellido1', descripcion: 'Primer apellido del tomador', tipo: 'texto', personal: true, fuente: 'sintetico', sintetico: 'EXPLORADOR', rutaRiesgo: 'tomador.apellido1' }),
  D({ clave: 'tomador.apellido2', descripcion: 'Segundo apellido del tomador', tipo: 'texto', personal: true, fuente: 'sintetico', sintetico: 'IA', rutaRiesgo: 'tomador.apellido2' }),
  D({ clave: 'tomador.nombre_completo', descripcion: 'Nombre y apellidos del tomador en un solo campo', tipo: 'texto', personal: true, fuente: 'sintetico', sintetico: 'PRUEBA EXPLORADOR IA', rutaRiesgo: 'tomador.nombreCompleto' }),
  D({ clave: 'tomador.fecha_nacimiento', descripcion: 'Fecha de nacimiento del tomador (dd/mm/aaaa)', tipo: 'fecha', personal: true, fuente: 'sintetico', sintetico: '15/01/1980', rutaRiesgo: 'tomador.fechaNacimiento' }),
  // Sin valor sintético A PROPÓSITO: un NIF inventado con letra válida puede ser de una persona real.
  D({ clave: 'tomador.nif', descripcion: 'NIF/NIE del tomador', tipo: 'texto', personal: true, fuente: 'riesgo', rutaRiesgo: 'tomador.nif' }),
  D({ clave: 'contacto.email', descripcion: 'Correo de contacto', tipo: 'texto', personal: true, fuente: 'entorno', env: ENV_EXPLORADOR_EMAIL }),
  D({ clave: 'contacto.telefono', descripcion: 'Teléfono de contacto', tipo: 'texto', personal: true, fuente: 'entorno', env: ENV_EXPLORADOR_TELEFONO }),
  D({ clave: 'efecto.fecha', descripcion: 'Fecha de efecto de la póliza (dd/mm/aaaa)', tipo: 'fecha', personal: false, fuente: 'sintetico', sintetico: '@manana' }),
]

/** Riesgo de una vivienda (Hogar) y de un edificio (Comunidades). Valores medios fijos; CP real de Sevilla (no es personal). */
const DATOS_INMUEBLE: readonly DatoCatalogo[] = [
  D({ clave: 'inmueble.tipo_via', descripcion: 'Tipo de vía (calle, avenida…)', tipo: 'opcion', personal: false, fuente: 'sintetico', sintetico: 'Calle', rutaRiesgo: 'inmueble.tipoVia' }),
  D({ clave: 'inmueble.nombre_via', descripcion: 'Nombre de la vía', tipo: 'texto', personal: false, fuente: 'sintetico', sintetico: 'PRUEBA', rutaRiesgo: 'inmueble.nombreVia' }),
  D({ clave: 'inmueble.numero', descripcion: 'Número de la vía', tipo: 'numero', personal: false, fuente: 'sintetico', sintetico: '1', rutaRiesgo: 'inmueble.numero' }),
  D({ clave: 'inmueble.codigo_postal', descripcion: 'Código postal', tipo: 'texto', personal: false, fuente: 'sintetico', sintetico: '41001', rutaRiesgo: 'inmueble.codigoPostal' }),
  D({ clave: 'inmueble.municipio', descripcion: 'Municipio', tipo: 'texto', personal: false, fuente: 'sintetico', sintetico: 'SEVILLA', rutaRiesgo: 'inmueble.municipio' }),
  D({ clave: 'inmueble.provincia', descripcion: 'Provincia', tipo: 'opcion', personal: false, fuente: 'sintetico', sintetico: 'SEVILLA', rutaRiesgo: 'inmueble.provincia' }),
  D({ clave: 'inmueble.superficie_m2', descripcion: 'Superficie construida en m²', tipo: 'numero', personal: false, fuente: 'sintetico', sintetico: '90', rutaRiesgo: 'inmueble.superficieM2' }),
  D({ clave: 'inmueble.anio_construccion', descripcion: 'Año de construcción', tipo: 'numero', personal: false, fuente: 'sintetico', sintetico: '1990', rutaRiesgo: 'inmueble.anioConstruccion' }),
  D({ clave: 'inmueble.planta', descripcion: 'Planta de la vivienda', tipo: 'numero', personal: false, fuente: 'sintetico', sintetico: '2', rutaRiesgo: 'inmueble.planta' }),
]

const DATOS_HOGAR: readonly DatoCatalogo[] = [
  D({ clave: 'hogar.tipo_vivienda', descripcion: 'Tipo de vivienda (piso, casa…)', tipo: 'opcion', personal: false, fuente: 'sintetico', sintetico: 'Piso', rutaRiesgo: 'hogar.tipoVivienda' }),
  D({ clave: 'hogar.uso', descripcion: 'Uso de la vivienda (habitual, secundaria, alquiler, alquiler turístico…): decide la tarifa', tipo: 'opcion', personal: false, fuente: 'sintetico', sintetico: 'Habitual', rutaRiesgo: 'hogar.uso' }),
  D({ clave: 'hogar.regimen', descripcion: 'Régimen (propietario / inquilino): decide la tarifa', tipo: 'opcion', personal: false, fuente: 'sintetico', sintetico: 'Propietario', rutaRiesgo: 'hogar.regimen' }),
  D({ clave: 'hogar.capital_continente', descripcion: 'Capital de continente en euros', tipo: 'numero', personal: false, fuente: 'sintetico', sintetico: '120000', rutaRiesgo: 'hogar.capitalContinente' }),
  D({ clave: 'hogar.capital_contenido', descripcion: 'Capital de contenido en euros', tipo: 'numero', personal: false, fuente: 'sintetico', sintetico: '30000', rutaRiesgo: 'hogar.capitalContenido' }),
]

const DATOS_COMUNIDADES: readonly DatoCatalogo[] = [
  D({ clave: 'comunidad.num_viviendas', descripcion: 'Número de viviendas del edificio', tipo: 'numero', personal: false, fuente: 'sintetico', sintetico: '12', rutaRiesgo: 'comunidad.numViviendas' }),
  D({ clave: 'comunidad.plantas', descripcion: 'Plantas sobre rasante', tipo: 'numero', personal: false, fuente: 'sintetico', sintetico: '4', rutaRiesgo: 'comunidad.plantas' }),
  D({ clave: 'comunidad.capital_continente', descripcion: 'Capital de continente en euros', tipo: 'numero', personal: false, fuente: 'sintetico', sintetico: '1500000', rutaRiesgo: 'comunidad.capitalContinente' }),
]

export const CATALOGO_EXPLORACION: Readonly<Record<string, readonly DatoCatalogo[]>> = Object.freeze({
  hogar: Object.freeze([...DATOS_COMUNES, ...DATOS_INMUEBLE, ...DATOS_HOGAR]),
  comunidades: Object.freeze([...DATOS_COMUNES, ...DATOS_INMUEBLE, ...DATOS_COMUNIDADES]),
})

export function catalogoDe(ramo: string): readonly DatoCatalogo[] {
  return Object.hasOwn(CATALOGO_EXPLORACION, ramo) ? CATALOGO_EXPLORACION[ramo] : []
}

/**
 * Lo que la IA ve del catálogo: clave, descripción y tipo. La `pista` (el valor de prueba) SOLO de lo no personal; de un
 * dato personal la IA no ve nada más que su clave.
 */
export function catalogoParaIA(
  ramo: string,
  real?: { riesgo: unknown },
): { clave: string; descripcion: string; tipo: TipoDato; pista?: string; valor?: string; significado?: string; sinValor?: true }[] {
  return catalogoDe(ramo).map((d) => {
    const base = { clave: d.clave, descripcion: d.descripcion, tipo: d.tipo }
    // Con datos REALES (13/10/2026): nada de pistas de prueba en las claves del riesgo (la IA creería que hay un valor).
    // La clave sin valor se MARCA (`sinValor`); el valor solo se enseña de las claves de `CLAVES_VALOR_VISIBLE_IA` (uso,
    // régimen, tipo de vivienda) y SOLO con su significado en español del mapa cerrado (`valorVisibleIA`): la IA casa la
    // opción del portal con el `significado`, nunca con el id inglés de Codeoscopic.
    if (real && d.rutaRiesgo) {
      if (enRuta(real.riesgo, d.rutaRiesgo) === null) return { ...base, sinValor: true as const }
      const vis = valorVisibleIA(d.clave, real.riesgo)
      return vis ? { ...base, ...vis } : base
    }
    return { ...base, ...(!d.personal && d.sintetico && d.sintetico !== '@manana' ? { pista: d.sintetico } : {}) }
  })
}

/**
 * Claves cuyo VALOR real ve la IA con datos reales: opciones de catálogo, no personales, que deciden la tarifa (el uso
 * de la vivienda, el régimen, el tipo de vivienda) y que la IA tiene que casar con una opción del portal. Nunca
 * dirección, CP ni persona. Cada una con su catálogo del mapa cerrado id → significado (`ETIQUETAS_ID_HOGAR`).
 * 🚨 Con datos reales son las ÚNICAS que se pueden `elegir`/`marcar` (`validarRespuestaExplorador`).
 */
const CAMPO_ID_DE_CLAVE: Readonly<Record<string, CampoIdHogar>> = Object.freeze({
  'hogar.uso': 'uso',
  'hogar.regimen': 'regimen',
  'hogar.tipo_vivienda': 'tipoVivienda',
})
export const CLAVES_VALOR_VISIBLE_IA: readonly string[] = Object.freeze(Object.keys(CAMPO_ID_DE_CLAVE))

/**
 * El valor REAL que la IA puede ver de una clave: id + significado, SOLO si la clave es de {@link CLAVES_VALOR_VISIBLE_IA},
 * no personal, con valor en el riesgo y ese id en el mapa cerrado. `null` = la IA no sabe el valor (y con datos reales
 * no puede elegir/marcar nada en su nombre).
 */
export function valorVisibleIA(clave: string, riesgo: unknown): { valor: string; significado: string } | null {
  if (!Object.hasOwn(CAMPO_ID_DE_CLAVE, clave)) return null
  const d = catalogoDe('hogar').find((x) => x.clave === clave)
  if (!d || d.personal || !d.rutaRiesgo) return null
  const v = enRuta(riesgo, d.rutaRiesgo)
  const significado = v === null ? null : etiquetaIdHogar(CAMPO_ID_DE_CLAVE[clave], v)
  return v !== null && significado !== null ? { valor: v, significado } : null
}

export type ContextoDatos = {
  ramo: string
  /**
   * `true` SOLO si la exploración va ligada a una petición de tarificación REAL de ese cliente/lead (trabajo origen del
   * mismo cliente). Sin ella, todo lo personal es sintético y lo que no tiene sintético (NIF) PARA.
   */
  conDatosReales: boolean
  /** `riesgo` del trabajo de exploración (copiado del de la petición real). */
  riesgo: unknown
  env: Record<string, string | undefined>
  hoy: Date
}

export type MotivoSinDato = 'clave_desconocida' | 'dato_sensible_requerido' | 'dato_no_disponible'
export type DatoResuelto = { ok: true; valor: string } | { ok: false; motivo: MotivoSinDato }

function enRuta(raiz: unknown, ruta: string): string | null {
  let v: unknown = raiz
  for (const k of ruta.split('.')) {
    if (typeof v !== 'object' || v === null || Array.isArray(v) || !Object.hasOwn(v, k)) return null
    v = (v as Record<string, unknown>)[k]
  }
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  if (typeof v === 'string' && v.trim() !== '' && v.length <= 200) return v.trim()
  return null
}

const ddmmaaaa = (d: Date) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`
const RE_EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i
const RE_TELEFONO = /^\+?\d[\d\s]{7,15}$/

/**
 * El VALOR de una clave del catálogo. Solo lo llama el WORKER (justo antes de escribir en el portal): el valor no va a la
 * IA, ni a asegura, ni al log. Fail-closed: sin valor seguro → motivo de parada.
 */
export function resolverDato(clave: string, ctx: ContextoDatos): DatoResuelto {
  const d = catalogoDe(ctx.ramo).find((x) => x.clave === clave)
  if (!d) return { ok: false, motivo: 'clave_desconocida' }
  if (d.fuente === 'entorno') {
    const v = (d.env ? ctx.env[d.env] : undefined)?.trim() ?? ''
    const ok = d.clave === 'contacto.email' ? RE_EMAIL.test(v) : RE_TELEFONO.test(v)
    return ok ? { ok: true, valor: v } : { ok: false, motivo: 'dato_no_disponible' }
  }
  if (d.personal) {
    if (ctx.conDatosReales) {
      // Lo personal de una exploración ligada a un cliente sale de SU riesgo o no sale: nunca un nombre de prueba con un NIF real.
      const v = d.rutaRiesgo ? enRuta(ctx.riesgo, d.rutaRiesgo) : null
      return v !== null ? { ok: true, valor: v } : { ok: false, motivo: 'dato_sensible_requerido' }
    }
    return d.sintetico ? { ok: true, valor: d.sintetico } : { ok: false, motivo: 'dato_sensible_requerido' }
  }
  if (ctx.conDatosReales && d.rutaRiesgo) {
    // 🚨 Con datos REALES una clave del riesgo sale del riesgo o NO sale: nunca su valor de prueba («PRUEBA», CP 41001)
    //    junto a un NIF real. Sin valor, el worker deja el campo como está si el portal ya lo rellenó (Catastro) o para.
    const v = enRuta(ctx.riesgo, d.rutaRiesgo)
    return v !== null ? { ok: true, valor: v } : { ok: false, motivo: 'dato_no_disponible' }
  }
  if (d.sintetico === '@manana') return { ok: true, valor: ddmmaaaa(new Date(ctx.hoy.getTime() + 86_400_000)) }
  return d.sintetico ? { ok: true, valor: d.sintetico } : { ok: false, motivo: 'dato_no_disponible' }
}

/**
 * Valores que hay que QUITAR del inventario antes de mandarlo a la IA o guardarlo (`redactarValoresInventario`): el
 * contacto de entorno siempre y, con datos reales, los del riesgo del trabajo. `null` = exploración con datos reales SIN
 * riesgo legible → quien llama PARA (fail-closed: sin saber qué quitar no se manda nada).
 */
export function valoresSensiblesExploracion(ctx: { conDatosReales: boolean; riesgo: unknown; env: Record<string, string | undefined> }): string[] | null {
  const valores: string[] = []
  for (const k of [ENV_EXPLORADOR_EMAIL, ENV_EXPLORADOR_TELEFONO]) {
    const v = ctx.env[k]?.trim()
    if (!v) continue
    valores.push(v)
    // «+34 600…» en el entorno y «600…» en el portal: también los 9 últimos dígitos.
    const dig = v.replace(/\D/g, '')
    if (k === ENV_EXPLORADOR_TELEFONO && dig.length > 9) valores.push(dig.slice(-9))
  }
  if (!ctx.conDatosReales) return valores
  if (typeof ctx.riesgo !== 'object' || ctx.riesgo === null || Array.isArray(ctx.riesgo)) return null
  return [...valores, ...valoresSensiblesDeRiesgo(ctx.riesgo)]
}

// ─── Respuesta de la IA: lista blanca y validador ────────────────────────────

export const ACCIONES_EXPLORADOR = ['rellenar', 'elegir', 'marcar', 'avanzar', 'terminar', 'parar'] as const
export type AccionExplorador = (typeof ACCIONES_EXPLORADOR)[number]

/**
 * Motivos de `parar` que puede dar la IA. FUENTE ÚNICA: el prompt de asegura se genera de aquí
 * (`lineaMotivosPararParaIA`) y `MOTIVOS_FIN_EXPLORACION` los incluye. Añadir uno = añadirlo aquí con su descripción.
 */
export const MOTIVOS_PARAR = ['otp', 'captcha', 'dato_sensible_requerido', 'dato_no_disponible', 'cerca_de_emision', 'ambiguo', 'aceptar_requerido', 'sin_salida'] as const
export type MotivoParar = (typeof MOTIVOS_PARAR)[number]

/** Qué significa cada motivo (va al prompt tal cual). */
export const DESCRIPCION_MOTIVOS_PARAR: Readonly<Record<MotivoParar, string>> = Object.freeze({
  otp: 'piden un código de verificación (SMS, correo, app)',
  captcha: 'hay un CAPTCHA o una comprobación de humano',
  dato_sensible_requerido: 'un campo OBLIGATORIO pide NIF/DNI u otro dato personal sin clave con valor en el catálogo',
  dato_no_disponible: 'con datos REALES, un desplegable o radio OBLIGATORIO pide un dato cuyo valor no se te ha dado (solo se elige/marca uso, régimen o tipo de vivienda con su significado)',
  cerca_de_emision: 'la pantalla es de contratar, emitir, firmar o pagar',
  ambiguo: 'no sabes qué hacer en esta pantalla',
  aceptar_requerido: 'solo se sigue con un «Aceptar» que no es el autorizado',
  sin_salida: 'no hay ningún control con el que avanzar',
})

/**
 * Motivos de FIN de una exploración (`motivo_fin` en BD, cuerpo de cierre del worker): los de `parar` más los que pone
 * el propio sistema. asegura y el worker validan contra ESTA lista.
 */
export const MOTIVOS_FIN_EXPLORACION = [...MOTIVOS_PARAR, 'resultado', 'bucle', 'tope', 'error_portal', 'guard_emision'] as const
export type MotivoFinExploracion = (typeof MOTIVOS_FIN_EXPLORACION)[number]

/**
 * DETALLE interno de una parada del worker (14/10/2026): QUÉ comprobación la cortó, para distinguir los `ambiguo` entre sí
 * sin abrir la traza. Lista CERRADA de códigos, sin valores ni textos del portal. Viaja en el cierre (`detalleFin`,
 * opcional) y asegura lo deja en `mapa.huecos`. Añadir uno = añadirlo aquí (worker y asegura validan contra ESTA lista).
 */
export const DETALLES_FIN_EXPLORACION = [
  /** El lote de la IA/memoria no pasó la revalidación del worker contra su propio inventario. */
  'lote_no_valido',
  /** asegura devolvió el paso en un estado distinto de `ok` sin un `parar` propio. */
  'paso_no_ok',
  /** La ref del lote no está en la captura del worker (incoherencia inventario ↔ captura). */
  'ref_fuera_de_captura',
  /** El nodo de la PRIMERA acción del lote ya no es el inventariado (anti-TOCTOU) y aún no se había tocado nada. */
  'nodo_no_localizado',
  /** `elegir`: el portal no dejó seleccionada exactamente la opción pedida. */
  'opcion_no_aplicada',
  /** `rellenar` con una clave fuera del catálogo. */
  'clave_desconocida',
  /** Demasiados lotes seguidos cortados por repintado de la pantalla (sin completar ninguno). */
  'repintados_seguidos',
  /** Al GUARDAR el presupuesto el portal abrió un diálogo (confirm/alert): el robot no confirma; se para. */
  'guardado_con_dialogo',
] as const
export type DetalleFinExploracion = (typeof DETALLES_FIN_EXPLORACION)[number]

/**
 * Claves del catálogo cuyo `rellenar` suele disparar AUTOCOMPLETADO en el portal (población/vía tras el CP, municipios tras
 * la provincia…): tras rellenarlas el worker corta el lote y vuelve a inventariar (la pantalla ya no es la que vio la IA).
 */
export const CLAVES_AUTOCOMPLETADO: ReadonlySet<string> = new Set(['inmueble.codigo_postal', 'inmueble.provincia', 'inmueble.municipio'])

/** La línea del prompt con los motivos de `parar`, generada de {@link MOTIVOS_PARAR}. */
export function lineaMotivosPararParaIA(): string {
  return MOTIVOS_PARAR.map((m) => `${m} (${DESCRIPCION_MOTIVOS_PARAR[m]})`).join(' | ')
}

const planoMotivo = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

/**
 * El motivo de `parar` que manda la IA, a su código. Admite mayúsculas, espacios/guiones por «_» y un código seguido de
 * una explicación («dato_sensible_requerido: piden NIF», «ambiguo (…)»). Una frase libre sin código delante → `null`
 * (no se adivina el motivo por palabras sueltas). Parar es siempre seguro: esto no relaja ninguna acción.
 */
export function normalizarMotivoParar(v: unknown): MotivoParar | null {
  if (typeof v !== 'string' || v.length > 400) return null
  const cabeza = planoMotivo(v).split(/\s+[-–—]\s+|[:(,.;–—]/)[0].trim().replace(/[\s-]+/g, '_')
  return MOTIVOS_PARAR.find((m) => m === cabeza) ?? null
}

/** Para el error del validador: el motivo rechazado SOLO si es un código corto sin cifras (nunca un texto con datos). */
function motivoRechazadoParaLog(v: unknown): string {
  if (typeof v !== 'string') return `(${v === undefined ? 'sin motivo' : typeof v})`
  const t = planoMotivo(v)
  return /^[a-z_ ]{1,40}$/.test(t) && !pareceDatoPersonalInventario(t) ? `«${t}»` : `(texto libre de ${v.length} car.)`
}

/**
 * `guardar_presupuesto` (14/10/2026): SOLO para un botón de la categoría «guardar presupuesto» de la lista única
 * (acciones-portal.ts: Grabar, Guardar, Archivar, Descargar, Imprimir, Generar PDF) y SOLO en pantalla de resultado
 * (`bloqueoGuardadoPresupuesto`). Ningún otro efecto puede pulsar esos botones.
 */
export const EFECTOS_AVANCE = ['siguiente_pantalla', 'calcular', 'abrir_seccion', 'ver_resultado', 'guardar_presupuesto'] as const
export const CONFIANZAS = ['alta', 'media', 'baja'] as const
export const TIPOS_PANTALLA = ['formulario', 'seleccion_producto', 'resultado', 'otro'] as const
export type Confianza = (typeof CONFIANZAS)[number]

export type Accion =
  | { accion: 'rellenar'; ref: string; dato: string }
  | { accion: 'elegir'; ref: string; opcion: { valor: string } }
  | { accion: 'marcar'; ref: string }
  | { accion: 'avanzar'; ref: string; efectoEsperado: (typeof EFECTOS_AVANCE)[number]; confianza: 'alta' | 'media' }
  /** `refsPrecio` vacío SOLO tras guardar el presupuesto, en una pantalla que ya no enseña importes. */
  | { accion: 'terminar'; refsPrecio: string[] }
  | { accion: 'parar'; motivo: MotivoParar }

export type MapeoCampo = { ref: string; campoCanonico: string | null; confianza: Confianza }

export type RespuestaExplorador = {
  version: 1
  pantalla: { nombre: string | null; tipo: (typeof TIPOS_PANTALLA)[number] }
  acciones: Accion[]
  mapeo: MapeoCampo[]
  motivo: string | null
}

export const MAX_ACCIONES_RESPUESTA = 15
export const MAX_MAPEO_RESPUESTA = 60
const MAX_NOMBRE_PANTALLA = 60
const MAX_MOTIVO = 200

/** Recorta el `motivo` libre a {@link MAX_MOTIVO} caracteres con «…» (no invalida la respuesta). */
export function recortarMotivo(t: string | null): string | null {
  if (t === null) return null
  return t.length > MAX_MOTIVO ? t.slice(0, MAX_MOTIVO - 1).trimEnd() + '…' : t
}

export type ContextoValidacion = {
  inventario: InventarioDom
  ramo: string
  /** Clave de `ENTRADAS_EXPLORACION` (para los avances «Aceptar» autorizados). */
  entrada: string
  /**
   * OBLIGATORIO a propósito (que ningún llamante lo olvide): `null` = exploración sintética; con datos reales, el riesgo
   * del trabajo. Con datos reales un `elegir`/`marcar` solo vale sobre un campo mapeado a una clave con valor visible
   * (`valorVisibleIA`): lo demás lo decidiría la IA sin dato junto a un NIF real.
   */
  datosReales: { riesgo: unknown } | null
  /**
   * `true` si en un paso ANTERIOR de esta exploración ya se pulsó un `guardar_presupuesto` (el precio se vio allí): habilita
   * un segundo guardar_presupuesto (Descargar/Imprimir) y `terminar` sin importes en la pantalla posterior al guardado.
   * Por defecto `false` (lo calcula `presupuestoEnCursoDe` sobre los pasos validados anteriores).
   */
  presupuestoEnCurso?: boolean
}

/** ¿Algún paso anterior (validado) pulsó un `guardar_presupuesto`? Para {@link ContextoValidacion.presupuestoEnCurso}. */
export function presupuestoEnCursoDe(respuestas: readonly (RespuestaExplorador | null | undefined)[]): boolean {
  return respuestas.some((r) => !!r && r.acciones.some((a) => a.accion === 'avanzar' && a.efectoEsperado === 'guardar_presupuesto'))
}

export type ValidacionRespuesta = { ok: true; respuesta: RespuestaExplorador } | { ok: false; errores: string[] }

const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
const plano = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** Primer objeto JSON balanceado del texto (la IA a veces añade prosa o ```json). `null` si no hay. */
export function primerObjetoJsonExplorador(texto: string): Record<string, unknown> | null {
  const ini = texto.indexOf('{')
  if (ini < 0) return null
  let prof = 0
  let enCadena = false
  let escape = false
  for (let i = ini; i < texto.length; i++) {
    const ch = texto[i]
    if (enCadena) {
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === '"') enCadena = false
      continue
    }
    if (ch === '"') enCadena = true
    else if (ch === '{') prof++
    else if (ch === '}' && --prof === 0) {
      try {
        return obj(JSON.parse(texto.slice(ini, i + 1)))
      } catch {
        return null
      }
    }
  }
  return null
}

/** Índice ref → {elemento, marco} del inventario. */
export function indiceRefs(inv: InventarioDom): Map<string, { el: ElementoInventario; marco: MarcoInventario }> {
  const m = new Map<string, { el: ElementoInventario; marco: MarcoInventario }>()
  for (const marco of inv.marcos) for (const el of marco.elementos) if (el.ref) m.set(el.ref, { el, marco })
  return m
}

const TIPOS_INPUT_TEXTO = new Set(['', 'text', 'number', 'date', 'tel', 'email', 'search'])
/** Etiquetas de radio que NUNCA se marcan: consentimientos (RGPD, publicidad, cesión…). */
const RE_CONSENTIMIENTO = /rgpd|lopd|acept|consient|autoriz|publicidad|comercial|cesion|privacidad|proteccion de datos|condiciones/

/** Todo lo que describe a un elemento (para el guard de emisión y el de consentimientos). */
export function descripcionesElemento(el: ElementoInventario): string[] {
  return [el.texto, el.ariaLabel, el.etiqueta, el.id, el.name, el.onclick, el.placeholder, el.formControlName].filter((x): x is string => typeof x === 'string' && x !== '')
}

function esControlTexto(el: ElementoInventario): boolean {
  if (el.tag === 'textarea') return true
  return el.tag === 'input' && TIPOS_INPUT_TEXTO.has((el.type ?? '').toLowerCase())
}

function esAvanzable(el: ElementoInventario): boolean {
  if (el.tag === 'button') return true
  if (el.tag === 'input') return ['submit', 'button'].includes((el.type ?? '').toLowerCase())
  if (el.role === 'button' || el.role === 'tab') return true
  return el.tag === 'td' && typeof el.onclick === 'string'
}

/**
 * El «Aceptar» de Datos básicos del servlet de Allianz no es un button: es `<div id="aceptar" onclick="btnAceptar();">`
 * (DOM real de Comunidades, 06/10/2026). El extractor del worker lo recoge SOLO con ese id exacto y onclick, y aquí cuenta
 * como avanzable SOLO si además es el avance AUTORIZADO de esta entrada en esta pantalla (`esAvanceAutorizado`). Ningún
 * otro `div` se puede pulsar; y `rellenar`/`elegir`/`marcar` ya exigen input/select por su cuenta.
 */
export function esAceptarDivAutorizado(entrada: string, el: ElementoInventario, marco: MarcoInventario): boolean {
  return el.tag === 'div' && el.id === 'aceptar' && typeof el.onclick === 'string' && el.onclick.trim() !== '' && esAvanceAutorizado(entrada, el, marco)
}

/**
 * ¿Este avance es un «Aceptar» autorizado para ESTA entrada en ESTA pantalla? Además del texto exacto exige el título de
 * la pantalla (marco del botón) y que no haya ningún título de tarificación/emisión. Lo demás del guard (onclick
 * `validar_aceptar`, `btnAccept`, `idbtnAceptar`…) sigue bloqueando aunque esté autorizado.
 */
export function esAvanceAutorizado(entrada: string, el: ElementoInventario, marco: MarcoInventario): boolean {
  const e = esEntradaExploracion(entrada) ? ENTRADAS_EXPLORACION[entrada] : null
  if (!e || typeof el.texto !== 'string') return false
  // Lista de títulos en el TOPE = recortada: el título de Tarificar podría ser justo el que no llegó → ningún «Aceptar».
  if ((marco.titulos?.length ?? 0) >= MAX_TITULOS_MARCO || (marco.titulosPantalla?.length ?? 0) >= MAX_TITULOS_MARCO) return false
  // Autoriza SOLO un título de pantalla (h1-h6/legend), nunca el `th` de una tabla; prohíbe CUALQUIER título.
  const dePantalla = (marco.titulosPantalla ?? []).map(plano)
  const todos = [...(marco.titulos ?? []), ...(marco.titulosPantalla ?? [])].map(plano)
  const texto = plano(el.texto)
  return e.avancesAutorizados.some((a) => a.texto.test(texto) && dePantalla.some((t) => a.enTitulo.test(t)) && !todos.some((t) => a.nuncaConTitulo.test(t)))
}

/** Texto que el saneado recortó (acaba en «…»): no se sabe qué decía el final. */
const truncado = (s: string) => s.endsWith('…')

/** `null` = el botón se puede pulsar en exploración; si no, por qué no. */
export function bloqueoAvance(entrada: string, el: ElementoInventario, marco: MarcoInventario): string | null {
  // Hace falta saber QUÉ es el botón: al menos una descripción visible (texto o aria) entera, no recortada por el saneado.
  if (![el.texto, el.ariaLabel].some((d) => typeof d === 'string' && d.trim() !== '' && !truncado(d))) return 'sin_descripcion_completa'
  // Un onclick recortado puede esconder la llamada de emisión en la parte que no llegó.
  if (typeof el.onclick === 'string' && truncado(el.onclick)) return 'onclick_truncado'
  const desc = descripcionesElemento(el)
  const cat = clasificarAccionPortal(desc)
  // Emisión dura (patrón del guard: emitir, contratar, archivar, proyecto ampliado, pago fraccionado, validar_aceptar…; y la
  // categoría EMISIÓN de la lista única: firmar, pagar, tramitar, confirmar, domiciliar…): siempre.
  if (desc.some((d) => pareceEmision(d, { permitirAceptar: true })) || cat.emision) return 'boton_de_emision'
  // «Aceptar» (y lo que solo cae por él): solo el autorizado.
  if (desc.some((d) => pareceEmision(d)) && !esAvanceAutorizado(entrada, el, marco)) return 'aceptar_no_autorizado'
  // Lista única, categoría PROHIBIDA (enviar, salir, proyecto ampliado…).
  if (cat.prohibida) return 'boton_prohibido'
  // GUARDAR PRESUPUESTO (grabar, guardar, imprimir, descargar…): nunca como navegación; solo con `efectoEsperado:
  // 'guardar_presupuesto'` en resultado (`bloqueoGuardadoPresupuesto`).
  if (cat.guardar) return 'guardar_solo_en_resultado'
  return null
}

export type PantallaGuardado = {
  /** `pantalla.tipo` de la respuesta que lo pide. */
  tipoPantalla: RespuestaExplorador['pantalla']['tipo']
  /** El inventario de ESTA pantalla tiene importes (precio a la vista). */
  hayImportes: boolean
  /** Ya se guardó antes en esta exploración (`presupuestoEnCursoDe`). */
  presupuestoEnCurso: boolean
}

/**
 * GUARDAR PRESUPUESTO (Alberto, 13-14/10/2026). `null` = el botón se puede pulsar con `efectoEsperado: 'guardar_presupuesto'`;
 * si no, por qué no. Exige, sin atajos:
 *   1. descripción visible entera y onclick no recortado (como `bloqueoAvance`);
 *   2. NADA de emisión: el patrón del guard con «Aceptar» bloqueado y solo Archivar abierto (`permitirGuardarPresupuesto`),
 *      y ninguna acción de las categorías EMISIÓN o PROHIBIDA de la lista única (un «Guardar y emitir» cae);
 *   3. que sea de la categoría GUARDAR PRESUPUESTO;
 *   4. pantalla de RESULTADO con importes a la vista (o, tras un guardado previo en esta exploración, la pantalla que sigue).
 * El worker lo repite sobre el control VIVO (`pulsarGuardadoPresupuesto`) antes de pulsar.
 */
export function bloqueoGuardadoPresupuesto(el: ElementoInventario, p: PantallaGuardado): string | null {
  if (![el.texto, el.ariaLabel].some((d) => typeof d === 'string' && d.trim() !== '' && !truncado(d))) return 'sin_descripcion_completa'
  if (typeof el.onclick === 'string' && truncado(el.onclick)) return 'onclick_truncado'
  const desc = descripcionesElemento(el)
  if (desc.some((d) => pareceEmision(d, { permitirGuardarPresupuesto: true }))) return 'boton_de_emision'
  const cat = clasificarAccionPortal(desc)
  if (cat.emision) return 'boton_de_emision'
  if (cat.prohibida) return 'boton_prohibido'
  if (!cat.guardar) return 'no_es_guardar_presupuesto'
  if (p.tipoPantalla !== 'resultado') return 'guardar_fuera_de_resultado'
  if (!p.hayImportes && !p.presupuestoEnCurso) return 'guardar_sin_precio'
  return null
}

/**
 * Valida la respuesta de la IA contra la lista blanca, el catálogo y el inventario de ESA pantalla. Fail-closed: cualquier
 * clave desconocida, texto libre donde no toca, acción fuera de lista o ref inexistente → `{ ok: false }` (quien llama
 * convierte eso en `parar ambiguo`). Devuelve una copia LIMPIA (solo las claves conocidas).
 */
export function validarRespuestaExplorador(entrada: unknown, ctx: ContextoValidacion): ValidacionRespuesta {
  const errores: string[] = []
  const r = typeof entrada === 'string' ? primerObjetoJsonExplorador(entrada) : obj(entrada)
  if (!r) return { ok: false, errores: ['la respuesta no es un objeto JSON'] }
  for (const k of Object.keys(r)) if (!['version', 'pantalla', 'acciones', 'mapeo', 'motivo'].includes(k)) errores.push(`clave desconocida «${k.slice(0, 30)}»`)
  if (r.version !== 1) errores.push('version tiene que ser 1')

  const textoCorto = (v: unknown, max: number, campo: string): string | null => {
    if (v === undefined || v === null) return null
    if (typeof v !== 'string') {
      errores.push(`${campo} tiene que ser texto`)
      return null
    }
    const t = v.replace(/\s+/g, ' ').trim()
    if (t.length > max) errores.push(`${campo} supera ${max} caracteres`)
    if (pareceDatoPersonalInventario(t)) errores.push(`${campo} tiene forma de dato personal`)
    return t || null
  }

  const p = obj(r.pantalla)
  let pantalla: RespuestaExplorador['pantalla'] = { nombre: null, tipo: 'otro' }
  if (!p) errores.push('falta pantalla')
  else {
    for (const k of Object.keys(p)) if (!['nombre', 'tipo'].includes(k)) errores.push(`pantalla.${k.slice(0, 30)} no se admite`)
    const tipo = TIPOS_PANTALLA.find((t) => t === p.tipo)
    if (!tipo) errores.push('pantalla.tipo fuera de lista')
    pantalla = { nombre: textoCorto(p.nombre, MAX_NOMBRE_PANTALLA, 'pantalla.nombre'), tipo: tipo ?? 'otro' }
  }
  // `motivo` es texto libre INFORMATIVO (no es una acción): uno largo se recorta, no invalida el lote
  // (13/10/2026: un motivo de >200 car. tiró un paso 1 bueno a `parar/ambiguo`). El cepo de dato
  // personal sigue mirando el texto ENTERO, antes de recortar.
  const motivo = recortarMotivo(textoCorto(r.motivo, Number.POSITIVE_INFINITY, 'motivo'))

  const refs = indiceRefs(ctx.inventario)
  const importes = new Set(ctx.inventario.marcos.flatMap((m) => (m.importes ?? []).map((i) => i.ref)))
  const claves = new Set(catalogoDe(ctx.ramo).map((d) => d.clave))
  if (claves.size === 0) errores.push(`ramo «${ctx.ramo.slice(0, 30)}» sin catálogo de exploración`)

  const acciones: Accion[] = []
  if (!Array.isArray(r.acciones) || r.acciones.length === 0) errores.push('acciones tiene que ser una lista no vacía')
  else if (r.acciones.length > MAX_ACCIONES_RESPUESTA) errores.push(`más de ${MAX_ACCIONES_RESPUESTA} acciones`)
  else {
    const tocados = new Set<string>()
    r.acciones.forEach((a0, i) => {
      const a = obj(a0)
      const donde = `acciones[${i}]`
      if (!a) return void errores.push(`${donde} no es un objeto`)
      const tipo = ACCIONES_EXPLORADOR.find((x) => x === a.accion)
      if (!tipo) return void errores.push(`${donde}: acción fuera de lista`)
      const permitidas: Record<AccionExplorador, string[]> = {
        rellenar: ['accion', 'ref', 'dato'], elegir: ['accion', 'ref', 'opcion'], marcar: ['accion', 'ref'],
        avanzar: ['accion', 'ref', 'efectoEsperado', 'confianza'], terminar: ['accion', 'refsPrecio'], parar: ['accion', 'motivo'],
      }
      for (const k of Object.keys(a)) if (!permitidas[tipo].includes(k)) errores.push(`${donde}: clave «${k.slice(0, 30)}» no se admite en ${tipo}`)
      if (tipo === 'parar' || tipo === 'terminar') {
        if (r.acciones !== undefined && (r.acciones as unknown[]).length !== 1) errores.push(`${donde}: ${tipo} va SOLO`)
      }
      if (tipo === 'parar') {
        const m = normalizarMotivoParar(a.motivo)
        if (!m) return void errores.push(`${donde}: motivo de parada fuera de lista ${motivoRechazadoParaLog(a.motivo)}`)
        acciones.push({ accion: 'parar', motivo: m })
        return
      }
      if (tipo === 'terminar') {
        if (importes.size === 0) {
          // Tras GUARDAR el presupuesto la pantalla puede no enseñar ya el precio: terminar sin refs, solo entonces.
          if (ctx.presupuestoEnCurso === true && Array.isArray(a.refsPrecio) && a.refsPrecio.length === 0) {
            acciones.push({ accion: 'terminar', refsPrecio: [] })
            return
          }
          return void errores.push(`${donde}: terminar sin importes en la pantalla`)
        }
        const rp = Array.isArray(a.refsPrecio) ? a.refsPrecio : null
        if (!rp || rp.length === 0 || rp.length > 10 || !rp.every((x) => typeof x === 'string' && importes.has(x))) return void errores.push(`${donde}: refsPrecio tiene que señalar importes del inventario`)
        acciones.push({ accion: 'terminar', refsPrecio: [...new Set(rp as string[])] })
        return
      }
      const ref = typeof a.ref === 'string' ? a.ref : ''
      const hit = refs.get(ref)
      if (!hit) return void errores.push(`${donde}: ref «${ref.slice(0, 20)}» no existe en el inventario`)
      const { el, marco } = hit
      if (el.deshabilitado) return void errores.push(`${donde}: el elemento está deshabilitado`)
      if (tipo !== 'avanzar') {
        if (tocados.has(ref)) return void errores.push(`${donde}: ref repetida`)
        tocados.add(ref)
      }
      if (tipo === 'rellenar') {
        if (!esControlTexto(el)) return void errores.push(`${donde}: rellenar solo en input de texto/número/fecha o textarea`)
        if (typeof a.dato !== 'string' || !claves.has(a.dato)) return void errores.push(`${donde}: dato fuera del catálogo`)
        acciones.push({ accion: 'rellenar', ref, dato: a.dato })
      } else if (tipo === 'elegir') {
        if (el.tag !== 'select') return void errores.push(`${donde}: elegir solo en <select>`)
        const op = obj(a.opcion)
        if (!op || Object.keys(op).some((k) => k !== 'valor') || typeof op.valor !== 'string') return void errores.push(`${donde}: opcion tiene que ser { valor }`)
        if (!(el.opciones ?? []).some((o) => o.valor !== null && o.valor === op.valor)) return void errores.push(`${donde}: el valor no está entre las opciones del inventario`)
        acciones.push({ accion: 'elegir', ref, opcion: { valor: op.valor } })
      } else if (tipo === 'marcar') {
        if (el.tag !== 'input' || (el.type ?? '').toLowerCase() !== 'radio') return void errores.push(`${donde}: marcar solo radios (nunca checkbox)`)
        if (descripcionesElemento(el).some((d) => RE_CONSENTIMIENTO.test(plano(d)))) return void errores.push(`${donde}: radio de consentimiento`)
        acciones.push({ accion: 'marcar', ref })
      } else {
        if (i !== (r.acciones as unknown[]).length - 1) return void errores.push(`${donde}: avanzar va el ÚLTIMO (y solo uno)`)
        if (!esAvanzable(el) && !esAceptarDivAutorizado(ctx.entrada, el, marco)) return void errores.push(`${donde}: el elemento no es un botón/pestaña`)
        const efecto = EFECTOS_AVANCE.find((x) => x === a.efectoEsperado)
        if (!efecto) return void errores.push(`${donde}: efectoEsperado fuera de lista`)
        if (a.confianza !== 'alta' && a.confianza !== 'media') return void errores.push(`${donde}: avanzar exige confianza alta o media`)
        const bloqueo = efecto === 'guardar_presupuesto'
          ? bloqueoGuardadoPresupuesto(el, { tipoPantalla: pantalla.tipo, hayImportes: importes.size > 0, presupuestoEnCurso: ctx.presupuestoEnCurso === true })
          : bloqueoAvance(ctx.entrada, el, marco)
        if (bloqueo) return void errores.push(`${donde}: ${bloqueo}`)
        acciones.push({ accion: 'avanzar', ref, efectoEsperado: efecto, confianza: a.confianza })
      }
    })
  }

  const mapeo: MapeoCampo[] = []
  if (r.mapeo !== undefined) {
    if (!Array.isArray(r.mapeo) || r.mapeo.length > MAX_MAPEO_RESPUESTA) errores.push(`mapeo tiene que ser una lista de hasta ${MAX_MAPEO_RESPUESTA}`)
    else
      r.mapeo.forEach((m0, i) => {
        const m = obj(m0)
        const donde = `mapeo[${i}]`
        if (!m) return void errores.push(`${donde} no es un objeto`)
        for (const k of Object.keys(m)) if (!['ref', 'campoCanonico', 'confianza'].includes(k)) errores.push(`${donde}: clave «${k.slice(0, 30)}» no se admite`)
        if (typeof m.ref !== 'string' || !refs.has(m.ref)) return void errores.push(`${donde}: ref inexistente`)
        if (m.campoCanonico !== null && (typeof m.campoCanonico !== 'string' || !claves.has(m.campoCanonico))) return void errores.push(`${donde}: campoCanonico fuera del catálogo`)
        const c = CONFIANZAS.find((x) => x === m.confianza)
        if (!c) return void errores.push(`${donde}: confianza fuera de lista`)
        mapeo.push({ ref: m.ref, campoCanonico: m.campoCanonico as string | null, confianza: c })
      })
  }

  // 🚨 Datos REALES: un desplegable/radio no se elige «a ojo». Solo si su ref está MAPEADA (en esta misma respuesta) a una
  //    clave cuyo valor real ve la IA (uso, régimen, tipo de vivienda, con significado) y a ninguna otra; y una sola
  //    elección por clave. Lo demás → rechazo (quien llama: parar ambiguo); la IA tiene que parar dato_no_disponible.
  if (ctx.datosReales) {
    const riesgo = ctx.datosReales.riesgo
    const usadas = new Set<string>()
    acciones.forEach((a, i) => {
      if (a.accion !== 'elegir' && a.accion !== 'marcar') return
      const campos = [...new Set(mapeo.filter((m) => m.ref === a.ref).map((m) => m.campoCanonico))]
      const campo = campos.length === 1 ? campos[0] : null
      if (campo === null || valorVisibleIA(campo, riesgo) === null) {
        return void errores.push(`acciones[${i}]: con datos reales, ${a.accion} solo sobre un campo mapeado a una clave con valor conocido (${CLAVES_VALOR_VISIBLE_IA.join(', ')}); si no, parar dato_no_disponible`)
      }
      if (usadas.has(campo)) return void errores.push(`acciones[${i}]: con datos reales, ${campo} se elige una sola vez`)
      usadas.add(campo)
    })
  }

  if (errores.length) return { ok: false, errores: errores.slice(0, 20) }
  return { ok: true, respuesta: { version: 1, pantalla, acciones, mapeo, motivo } }
}

/** La respuesta que se manda al worker cuando algo no cuadra: parar, nunca improvisar. */
export function respuestaParar(motivo: MotivoParar, detalle: string | null = null): RespuestaExplorador {
  return { version: 1, pantalla: { nombre: null, tipo: 'otro' }, acciones: [{ accion: 'parar', motivo }], mapeo: [], motivo: detalle ? detalle.slice(0, MAX_MOTIVO) : null }
}

// ─── Paradas: OTP/SMS, CAPTCHA, emisión ──────────────────────────────────────

export type Parada = { motivo: 'otp' | 'captcha' | 'cerca_de_emision'; senal: string }

const RE_OTP = /\botp\b|\bsms\b|codigo (?:de )?(?:verificacion|seguridad|confirmacion|acceso)|clave de un solo uso|one.?time|doble factor|segundo factor|\b2fa\b|autenticacion reforzada|verificacion en dos pasos/
const RE_CAPTCHA = /captcha|no soy un robot|i'?m not a robot|verifica que eres humano|desafio de seguridad/
/** Títulos de pantalla de emisión. Solo TÍTULOS: «Contratación» como pestaña futura o «Forma de pago» como desplegable de
 *  periodicidad aparecen en pantallas de tarificar y no son parada. */
const RE_TITULO_EMISION = /\brevision\b|forma de pago|domiciliacion|\biban\b|cuenta bancaria|\bfirma\b|firmar|\bemitir\b|emision|contrat|formaliz|\bgrabar\b|archivar|datos (?:de|para) (?:la )?emision|resumen de (?:la )?contratacion|pago con tarjeta/
/** Campos que solo existen en una pantalla de emisión/pago (por etiqueta/name/id). */
const RE_CAMPO_EMISION = /\biban\b|cuenta bancaria|numero de cuenta|\bccc\b|tarjeta de credito|\bcvv\b|\bcvc\b|caducidad de la tarjeta|firma digital|firma manuscrita/

/**
 * ¿Hay que PARAR antes de hacer nada en esta pantalla? `null` = no. Mira títulos, textos y nombres de campos, y la URL
 * de los marcos (un iframe de reCAPTCHA). No es la única barrera: el guard de emisión (botón y red) sigue en el worker.
 */
export function detectarParada(inv: InventarioDom): Parada | null {
  for (const m of inv.marcos) {
    const url = plano(m.url)
    if (/recaptcha|hcaptcha|captcha|turnstile|arkoselabs|funcaptcha/.test(url)) return { motivo: 'captcha', senal: 'marco de captcha' }
  }
  const textos: string[] = []
  const titulos: string[] = []
  const campos: string[] = []
  for (const m of inv.marcos) {
    titulos.push(...(m.titulos ?? []).map(plano))
    for (const el of m.elementos) {
      const desc = descripcionesElemento(el).map(plano)
      textos.push(...desc)
      if (el.tag === 'input' || el.tag === 'select' || el.tag === 'textarea') campos.push(...desc)
    }
  }
  const todos = [...titulos, ...textos]
  const t1 = todos.find((t) => RE_CAPTCHA.test(t))
  if (t1 !== undefined) return { motivo: 'captcha', senal: t1.slice(0, 60) }
  const t2 = todos.find((t) => RE_OTP.test(t))
  if (t2 !== undefined) return { motivo: 'otp', senal: t2.slice(0, 60) }
  const t3 = titulos.find((t) => RE_TITULO_EMISION.test(t))
  if (t3 !== undefined) return { motivo: 'cerca_de_emision', senal: t3.slice(0, 60) }
  const t4 = campos.find((t) => RE_CAMPO_EMISION.test(t))
  if (t4 !== undefined) return { motivo: 'cerca_de_emision', senal: t4.slice(0, 60) }
  return null
}

// ─── Huella de pantalla y bucle ──────────────────────────────────────────────

/** Dos FNV-1a de 32 bits con semillas distintas → hex de 16 (sin BigInt ni node:crypto: el index llega al navegador y asegura
 *  compila con target ES2017). Es una HUELLA para reconocer pantallas, no un hash criptográfico. */
export function huellaTexto(texto: string): string {
  let a = 0x811c9dc5
  let b = 0x9747b28c
  for (const byte of new TextEncoder().encode(texto)) {
    a = Math.imul(a ^ byte, 0x01000193) >>> 0
    b = Math.imul(b ^ byte, 0x01000193) >>> 0
    b = (b ^ (b >>> 13)) >>> 0
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')
}

/**
 * Huella ESTRUCTURAL de la pantalla: ruta de cada marco + identificadores estables de sus controles (id, name,
 * formControlName, tipo), ordenados. No entran textos variables ni valores: dos visitas a la misma pantalla dan la misma
 * huella aunque cambie lo rellenado; un id autogenerado con muchas cifras se normaliza.
 */
export function huellaPantalla(inv: InventarioDom): string {
  const partes: string[] = []
  for (const m of inv.marcos) {
    const ids = m.elementos
      .filter((e) => e.id || e.name || e.formControlName)
      .map((e) => `${e.tag}|${(e.type ?? '').toLowerCase()}|${(e.id ?? '').replace(/\d{3,}/g, '#')}|${e.name ?? ''}|${e.formControlName ?? ''}`)
      .sort()
    partes.push(`${m.url.replace(/^https?:\/\/[^/]+/, '')}::${ids.join(';')}`)
  }
  return huellaTexto(partes.sort().join('\n'))
}

export const MAX_HUELLA_REPETIDA = 3
export const MAX_AVANCES_FALLIDOS = 2

/** `huellas` = las de los pasos ANTERIORES, en orden. Bucle = la actual sería la 3.ª seguida igual, o 2 avances sin efecto. */
export function detectarBucle(huellas: readonly string[], actual: string, avancesFallidos: number): boolean {
  if (avancesFallidos >= MAX_AVANCES_FALLIDOS) return true
  let seguidas = 1
  for (let i = huellas.length - 1; i >= 0 && huellas[i] === actual; i--) seguidas++
  return seguidas >= MAX_HUELLA_REPETIDA
}

// ─── Topes ───────────────────────────────────────────────────────────────────

export type TopesExplorador = { maxLlamadas: number; maxAcciones: number; maxEur: number; maxMs: number; maxPasos: number }

/** Por defecto = TECHO: el entorno solo puede BAJARLOS (Alberto, 13/10/2026: 2 € por exploración). */
export const TOPES_EXPLORADOR: Readonly<TopesExplorador> = Object.freeze({ maxLlamadas: 30, maxAcciones: 80, maxEur: 2, maxMs: 15 * 60_000, maxPasos: 40 })

export function topesExplorador(env: Record<string, string | undefined>): TopesExplorador {
  const lee = (k: string, techo: number, entero: boolean): number => {
    const raw = env[k]?.trim()
    if (!raw) return techo
    const n = Number(raw.replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) return techo
    const v = entero ? Math.floor(n) : n
    return v >= 1 || !entero ? Math.min(v, techo) : techo
  }
  return {
    maxLlamadas: lee('TARIFICADOR_EXPLORADOR_MAX_LLAMADAS', TOPES_EXPLORADOR.maxLlamadas, true),
    maxAcciones: lee('TARIFICADOR_EXPLORADOR_MAX_ACCIONES', TOPES_EXPLORADOR.maxAcciones, true),
    maxEur: lee('TARIFICADOR_EXPLORADOR_MAX_EUR', TOPES_EXPLORADOR.maxEur, false),
    maxMs: lee('TARIFICADOR_EXPLORADOR_MAX_MS', TOPES_EXPLORADOR.maxMs, true),
    maxPasos: lee('TARIFICADOR_EXPLORADOR_MAX_PASOS', TOPES_EXPLORADOR.maxPasos, true),
  }
}

export type ConsumoExplorador = { llamadas: number; acciones: number; eur: number; ms: number; pasos: number }
export type MotivoTope = 'tope_llamadas' | 'tope_acciones' | 'tope_coste' | 'tope_tiempo' | 'tope_pasos'

/**
 * ¿Se puede dar UN paso más con IA? `costeSiguienteMax` = el PEOR caso de la próxima llamada (`costeMaximoLlamada`): se
 * para ANTES de pasarse, no después. `null` = adelante.
 */
export function comprobarTopes(c: ConsumoExplorador, t: TopesExplorador, costeSiguienteMax: number): MotivoTope | null {
  if (!(c.ms < t.maxMs)) return 'tope_tiempo'
  if (!(c.pasos < t.maxPasos)) return 'tope_pasos'
  if (!(c.acciones < t.maxAcciones)) return 'tope_acciones'
  if (!(c.llamadas < t.maxLlamadas)) return 'tope_llamadas'
  if (!(c.eur + Math.max(0, costeSiguienteMax) <= t.maxEur)) return 'tope_coste'
  return null
}

/** € por millón de tokens (entrada, salida). El real queda en `ai_usos`; esto es para PARAR a tiempo, así que redondea arriba. */
export const PRECIOS_MODELO_EUR_MTOK: Readonly<Record<string, readonly [number, number]>> = Object.freeze({
  'anthropic/claude-sonnet-4.5': [3, 15],
  'anthropic/claude-sonnet-4': [3, 15],
  'google/gemini-2.5-flash': [0.3, 2.5],
})
/** Modelo desconocido: precio de un modelo grande (fail-closed: mejor parar antes que pasarse). */
const PRECIO_DESCONOCIDO: readonly [number, number] = [15, 75]

const precio = (modelo: string) => (Object.hasOwn(PRECIOS_MODELO_EUR_MTOK, modelo) ? PRECIOS_MODELO_EUR_MTOK[modelo] : PRECIO_DESCONOCIDO)
const redondeo6 = (n: number) => Math.ceil(n * 1e6) / 1e6

/** Peor caso de una llamada: ~3 caracteres por token de entrada y TODOS los tokens de salida permitidos. */
export function costeMaximoLlamada(modelo: string, caracteresEntrada: number, maxTokensSalida: number): number {
  const [pi, po] = precio(modelo)
  return redondeo6((Math.max(0, caracteresEntrada) / 3) * pi / 1e6 + Math.max(0, maxTokensSalida) * po / 1e6)
}

/** Estimación tras la llamada (~3 caracteres por token, a la alta). */
export function costeLlamada(modelo: string, caracteresEntrada: number, caracteresSalida: number): number {
  const [pi, po] = precio(modelo)
  return redondeo6((Math.max(0, caracteresEntrada) / 3) * pi / 1e6 + (Math.max(0, caracteresSalida) / 3) * po / 1e6)
}

// ─── Mapa determinista (v1) ──────────────────────────────────────────────────

export type SelectorMapa = { por: 'id' | 'name' | 'formControlName' | 'etiqueta' | 'texto'; valor: string; tag: string }

export type CampoMapaExploracion = {
  selector: SelectorMapa
  /** Ruta del marco (sin origen ni query). */
  marco: string
  tipo: 'rellenar' | 'elegir' | 'marcar'
  etiqueta: string | null
  requerido: boolean
  /** Clave del catálogo que va en el campo (`null` = sin mapear: hueco para la revisión humana). */
  campoCanonico: string | null
  confianza: Confianza | null
  /** Para `elegir`: el valor de la opción usada en la exploración. */
  valorOpcion?: string
}

export type PantallaMapaExploracion = {
  huella: string
  titulo: string | null
  tipo: RespuestaExplorador['pantalla']['tipo']
  campos: CampoMapaExploracion[]
  avance: { selector: SelectorMapa; marco: string; efecto: (typeof EFECTOS_AVANCE)[number]; tipo: 'navegacion' | 'aceptar_autorizado' | 'guardar_presupuesto' } | null
  /** Etiquetas de los importes de la pantalla de resultado. */
  importes: string[]
}

export const EFECTOS_EN_PORTAL = ['posible_proyecto_guardado', 'presupuesto_guardado', 'ninguno_visto'] as const

/**
 * Lo que dejó el GUARDADO del presupuesto (14/10/2026). Tres estados, nunca «no hay» por no haberlo mirado:
 * `guardado` = se pulsó un guardar_presupuesto; `referencia` = la que enseñó el portal (`null` = no se vio); `pdf` = `true`
 * descargado · `false` intentado y no llegó · `null` no se intentó (sin guardado).
 */
export type PresupuestoMapa = { guardado: boolean; referencia: string | null; pdf: boolean | null }

/** Valida un {@link PresupuestoMapa} que llega por el cable. `null` si no tiene la forma (o la referencia parece un dato personal). */
export function leerPresupuestoMapa(v: unknown): PresupuestoMapa | null {
  const o = obj(v)
  if (!o || Object.keys(o).some((k) => !['guardado', 'referencia', 'pdf'].includes(k))) return null
  if (typeof o.guardado !== 'boolean') return null
  if (!(o.pdf === null || typeof o.pdf === 'boolean')) return null
  if (!(o.referencia === null || referenciaPresupuestoValida(o.referencia))) return null
  // Sin guardado no hay ni referencia ni PDF de guardado.
  if (!o.guardado && (o.referencia !== null || o.pdf !== null)) return null
  return { guardado: o.guardado, referencia: o.referencia as string | null, pdf: o.pdf as boolean | null }
}

export type MapaExploracion = {
  version: 1
  entrada: string
  compania: string
  producto: string
  modelo: string | null
  fecha: string
  pantallas: PantallaMapaExploracion[]
  resultado: { alcanzado: boolean; huella: string | null }
  huecos: string[]
  efectosEnPortal: (typeof EFECTOS_EN_PORTAL)[number][]
  /** Origen + ruta (sin query ni cuerpo) de las peticiones no-GET que provocaron un avance. */
  redNoGet: string[]
  coste: { llamadas: number; eurEstimado: number }
  motivoFin: string | null
  /** Solo si el worker lo informó en el cierre (mapas anteriores al 14/10/2026 no lo llevan). */
  presupuesto?: PresupuestoMapa
}

const RE_ID_GENERADO = /^(?:mat-|cdk-|ng-|ui-id-|react-|ember|j_id|__)|\d{3,}|[0-9a-f]{8}-[0-9a-f]{4}/i
const RE_SELECTOR_SEGURO = /^[\w.:[\]-]{1,80}$/

/** El selector estable de un elemento: id (no autogenerado) > name > formControlName > etiqueta exacta > texto exacto. */
export function selectorDeElemento(el: ElementoInventario): SelectorMapa | null {
  if (el.id && RE_SELECTOR_SEGURO.test(el.id) && !RE_ID_GENERADO.test(el.id)) return { por: 'id', valor: el.id, tag: el.tag }
  if (el.name && RE_SELECTOR_SEGURO.test(el.name) && !RE_ID_GENERADO.test(el.name)) return { por: 'name', valor: el.name, tag: el.tag }
  if (el.formControlName && RE_SELECTOR_SEGURO.test(el.formControlName)) return { por: 'formControlName', valor: el.formControlName, tag: el.tag }
  if (el.etiqueta && !el.etiqueta.endsWith('…')) return { por: 'etiqueta', valor: el.etiqueta, tag: el.tag }
  if (el.texto && !el.texto.endsWith('…')) return { por: 'texto', valor: el.texto, tag: el.tag }
  return null
}

const casaSelector = (el: ElementoInventario, s: SelectorMapa): boolean =>
  el.tag === s.tag &&
  (s.por === 'id' ? el.id === s.valor
    : s.por === 'name' ? el.name === s.valor
      : s.por === 'formControlName' ? el.formControlName === s.valor
        : s.por === 'etiqueta' ? el.etiqueta === s.valor
          : el.texto === s.valor)

/** Ruta del marco (sin origen): la misma pantalla puede servirse desde otro host del mismo portal. */
export const rutaMarco = (url: string) => url.replace(/^https?:\/\/[^/]+/, '') || '/'

/** Paso guardado de una exploración (lo que `construirMapa` necesita de cada uno). */
export type PasoExploracion = { huella: string; inventario: InventarioDom; respuesta: RespuestaExplorador | null }

export type MetaMapa = {
  entrada: string
  compania: string
  producto: string
  modelo: string | null
  fecha: string
  efectosEnPortal: MapaExploracion['efectosEnPortal']
  redNoGet: string[]
  coste: MapaExploracion['coste']
  motivoFin: string | null
  presupuesto?: PresupuestoMapa | null
}

/**
 * Construye el MAPA a partir de los pasos validados (el último paso de cada huella manda). Determinista: mismo input,
 * mismo mapa. Lo que no tiene selector estable o no se mapeó a una clave del catálogo sale en `huecos`.
 */
export function construirMapa(meta: MetaMapa, pasos: readonly PasoExploracion[]): MapaExploracion {
  const porHuella = new Map<string, PasoExploracion>()
  const orden: string[] = []
  for (const p of pasos) {
    if (!p.respuesta) continue
    if (!porHuella.has(p.huella)) orden.push(p.huella)
    porHuella.set(p.huella, p)
  }
  const huecos: string[] = []
  const pantallas: PantallaMapaExploracion[] = []
  let resultado: MapaExploracion['resultado'] = { alcanzado: false, huella: null }
  for (const h of orden) {
    const p = porHuella.get(h)!
    const r = p.respuesta!
    const refs = indiceRefs(p.inventario)
    const confianzaDe = new Map(r.mapeo.map((m) => [m.ref, m]))
    const titulo = r.pantalla.nombre ?? p.inventario.marcos.flatMap((m) => m.titulos ?? [])[0] ?? null
    const campos: CampoMapaExploracion[] = []
    let avance: PantallaMapaExploracion['avance'] = null
    const importes: string[] = []
    for (const a of r.acciones) {
      if (a.accion === 'parar') continue
      if (a.accion === 'terminar') {
        // `terminar` sin refs (tras guardar, sin importes a la vista) no mueve el resultado ya alcanzado.
        if (a.refsPrecio.length > 0 || !resultado.alcanzado) resultado = { alcanzado: true, huella: h }
        for (const ref of a.refsPrecio) {
          const imp = p.inventario.marcos.flatMap((m) => m.importes ?? []).find((i) => i.ref === ref)
          importes.push(imp?.etiqueta ?? ref)
        }
        continue
      }
      const hit = refs.get(a.ref)
      if (!hit) continue
      const sel = selectorDeElemento(hit.el)
      const etiqueta = hit.el.etiqueta ?? hit.el.ariaLabel ?? hit.el.texto ?? null
      if (!sel) {
        huecos.push(`pantalla «${titulo ?? h}»: ${a.accion} sin selector estable (${etiqueta ?? a.ref})`)
        continue
      }
      if (a.accion === 'avanzar') {
        const tipo = a.efectoEsperado === 'guardar_presupuesto' ? 'guardar_presupuesto' as const : pareceEmision(descripcionesElemento(hit.el).join(' ')) ? 'aceptar_autorizado' as const : 'navegacion' as const
        avance = { selector: sel, marco: rutaMarco(hit.marco.url), efecto: a.efectoEsperado, tipo }
        // Se guardó el presupuesto en esta pantalla: aquí estaba el precio.
        if (tipo === 'guardar_presupuesto' && !resultado.alcanzado) resultado = { alcanzado: true, huella: h }
        continue
      }
      const m = confianzaDe.get(a.ref)
      const canon = a.accion === 'rellenar' ? a.dato : (m?.campoCanonico ?? null)
      if (canon === null) huecos.push(`pantalla «${titulo ?? h}»: campo «${etiqueta ?? a.ref}» sin clave canónica`)
      campos.push({
        selector: sel, marco: rutaMarco(hit.marco.url), tipo: a.accion, etiqueta, requerido: hit.el.requerido === true,
        campoCanonico: canon, confianza: m?.confianza ?? null,
        ...(a.accion === 'elegir' ? { valorOpcion: a.opcion.valor } : {}),
      })
    }
    if (!avance && resultado.huella !== h) huecos.push(`pantalla «${titulo ?? h}»: sin avance conocido`)
    pantallas.push({ huella: h, titulo, tipo: r.pantalla.tipo, campos, avance, importes })
  }
  if (!resultado.alcanzado) huecos.push('no se llegó a la pantalla de resultado (precio)')
  return {
    version: 1, entrada: meta.entrada, compania: meta.compania, producto: meta.producto, modelo: meta.modelo, fecha: meta.fecha,
    pantallas, resultado, huecos, efectosEnPortal: meta.efectosEnPortal, redNoGet: meta.redNoGet.slice(0, 50), coste: meta.coste,
    motivoFin: meta.motivoFin,
    ...(meta.presupuesto ? { presupuesto: meta.presupuesto } : {}),
  }
}

/** Origen + ruta de una petición de red (sin query, fragmento ni credenciales). `null` si no es una URL http(s). */
export function normalizarRedNoGet(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 500) return null
  const m = /^(https?):\/\/([a-z0-9.-]+(?::\d{1,5})?)(\/[^?#\s]*)?/i.exec(v.trim())
  if (!m) return null
  const ruta = (m[3] ?? '/').slice(0, 200)
  if (pareceDatoPersonalInventario(ruta)) return null
  return `${m[1].toLowerCase()}://${m[2].toLowerCase()}${ruta}`
}

/**
 * Valida un mapa leído de BD o de un fichero (estricto: versión 1, forma exacta). `null` si no es un mapa v1 válido.
 * No re-deriva nada: solo comprueba forma y límites.
 */
export function validarMapa(v: unknown): MapaExploracion | null {
  const m = obj(v)
  if (!m || m.version !== 1 || typeof m.entrada !== 'string' || !esEntradaExploracion(m.entrada)) return null
  if (typeof m.compania !== 'string' || typeof m.producto !== 'string' || typeof m.fecha !== 'string') return null
  if (!Array.isArray(m.pantallas) || m.pantallas.length > 100 || !Array.isArray(m.huecos) || !Array.isArray(m.redNoGet) || !Array.isArray(m.efectosEnPortal)) return null
  const selOk = (s: unknown): s is SelectorMapa => {
    const o = obj(s)
    return !!o && ['id', 'name', 'formControlName', 'etiqueta', 'texto'].includes(o.por as string) && typeof o.valor === 'string' && o.valor.length <= 120 && typeof o.tag === 'string'
  }
  for (const p0 of m.pantallas) {
    const p = obj(p0)
    if (!p || typeof p.huella !== 'string' || !/^[0-9a-f]{16}$/.test(p.huella) || !Array.isArray(p.campos) || !Array.isArray(p.importes)) return null
    for (const c0 of p.campos) {
      const c = obj(c0)
      if (!c || !selOk(c.selector) || !['rellenar', 'elegir', 'marcar'].includes(c.tipo as string) || typeof c.marco !== 'string') return null
      if (c.campoCanonico !== null && typeof c.campoCanonico !== 'string') return null
    }
    if (p.avance !== null) {
      const a = obj(p.avance)
      if (!a || !selOk(a.selector) || typeof a.marco !== 'string' || !EFECTOS_AVANCE.includes(a.efecto as never) || !['navegacion', 'aceptar_autorizado', 'guardar_presupuesto'].includes(a.tipo as string)) return null
      // Un avance de guardado solo con su efecto, y al revés.
      if ((a.tipo === 'guardar_presupuesto') !== (a.efecto === 'guardar_presupuesto')) return null
    }
  }
  if (!m.efectosEnPortal.every((e) => EFECTOS_EN_PORTAL.includes(e as never))) return null
  if (!m.redNoGet.every((u) => typeof u === 'string' && normalizarRedNoGet(u) === u)) return null
  if (m.presupuesto !== undefined && !leerPresupuestoMapa(m.presupuesto)) return null
  return m as unknown as MapaExploracion
}

/**
 * MEMORIA: si la pantalla ya está en un mapa, el plan sale del mapa SIN IA. Cada campo y el avance tienen que
 * encontrarse UNA sola vez en el inventario actual (si no, `null` y se pregunta a la IA). La respuesta pasa luego por
 * `validarRespuestaExplorador` igual que una de la IA.
 */
export function planDesdeMapa(pantalla: PantallaMapaExploracion, inv: InventarioDom): RespuestaExplorador | null {
  const unico = (sel: SelectorMapa, marco: string): string | null => {
    const hits = inv.marcos.filter((m) => rutaMarco(m.url) === marco).flatMap((m) => m.elementos.filter((e) => e.ref && casaSelector(e, sel)))
    return hits.length === 1 ? hits[0].ref! : null
  }
  const acciones: Accion[] = []
  const mapeo: MapeoCampo[] = []
  for (const c of pantalla.campos) {
    const ref = unico(c.selector, c.marco)
    if (!ref) return null
    if (c.tipo === 'rellenar') {
      if (!c.campoCanonico) return null
      acciones.push({ accion: 'rellenar', ref, dato: c.campoCanonico })
    } else if (c.tipo === 'elegir') {
      if (c.valorOpcion === undefined) return null
      acciones.push({ accion: 'elegir', ref, opcion: { valor: c.valorOpcion } })
    } else acciones.push({ accion: 'marcar', ref })
    mapeo.push({ ref, campoCanonico: c.campoCanonico, confianza: c.confianza ?? 'media' })
  }
  if (pantalla.avance) {
    const ref = unico(pantalla.avance.selector, pantalla.avance.marco)
    if (!ref) return null
    acciones.push({ accion: 'avanzar', ref, efectoEsperado: pantalla.avance.efecto, confianza: 'alta' })
  }
  if (acciones.length === 0 || acciones.length > MAX_ACCIONES_RESPUESTA) return null
  return { version: 1, pantalla: { nombre: pantalla.titulo, tipo: pantalla.tipo }, acciones, mapeo, motivo: 'del mapa' }
}
