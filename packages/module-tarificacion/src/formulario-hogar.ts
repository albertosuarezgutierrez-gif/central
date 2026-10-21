// Formulario CANÓNICO de HOGAR (14/10/2026). PURO: ni BD, ni red, ni Playwright.
//
// Lo que un robot necesita para TARIFICAR una vivienda en un portal de compañía. Primera compañía: Allianz ePAC
// «Allianz HOGAR» (app Angular `ngx-allianzhogar…` en el iframe `appArea`; pantalla 1 «¿Quién es el tomador?» + «Datos de
// la vivienda», vista en 6 exploraciones IA del 13-14/10/2026). Cualquier otra compañía de Hogar valida con esto mismo.
//
// 🚨 Reglas de la casa:
//   · USO, RÉGIMEN y TIPO de vivienda deciden la tarifa: SIEMPRE explícitos, sin valor por defecto (el portal trae uno
//     marcado de serie y el robot lo cambia SIEMPRE al del formulario). Lo mismo «con/sin madera» (Allianz lo pregunta).
//   · Año de construcción y m²: OBLIGATORIOS (Allianz no avanza sin ellos). Los completa quien encola (Catastro, solo si es
//     inequívoco: `riesgo-oportunidad.ts`); aquí no se inventan.
//   · Tres estados: `null` = «no consta» (el robot no rellena nada en su lugar), nunca 0/'' por defecto.
//   · El documento y la fecha de nacimiento son datos PERSONALES: solo viven aquí y en su campo del portal; nunca en logs,
//     trazas ni mensajes de error (los errores nombran el campo, no el valor).
// Las rutas coinciden con el `riesgo` de la exploración (`tomador.*`, `inmueble.*`, `hogar.*`, `rutaRiesgo` del catálogo de
// `explorador.ts`); los VALORES de uso/régimen/tipo, no: aquí son claves canónicas en español, no ids de Codeoscopic.
import { esDniNie, normalizarDocumento } from './tomador.ts'
import { tieneCaracteresProhibidos } from './poblacion.ts'
import { validarDatosTomadorFicha, type DatosTomadorFicha } from './formulario-auto.ts'

/** USO de la vivienda (decide la tarifa). */
export const USOS_VIVIENDA = ['habitual', 'secundaria', 'alquiler', 'turistico'] as const
export type UsoVivienda = (typeof USOS_VIVIENDA)[number]
/** RÉGIMEN de quien asegura (decide la tarifa). */
export const REGIMENES_VIVIENDA = ['propietario', 'inquilino'] as const
export type RegimenVivienda = (typeof REGIMENES_VIVIENDA)[number]
/**
 * Tipo de vivienda. `planta_baja` = planta baja O piso con ventanas a menos de 3 m del suelo (así lo agrupa Allianz). Fuera a
 * propósito (no son viviendas que tarifiquemos hoy): trastero, plaza de garaje, caravana/casa móvil.
 */
export const TIPOS_VIVIENDA = ['piso', 'planta_baja', 'atico', 'adosada', 'independiente'] as const
export type TipoVivienda = (typeof TIPOS_VIVIENDA)[number]

export type TomadorHogar = {
  /** DNI/NIE normalizado (mayúsculas, sin espacios ni guiones), con la letra de control correcta. */
  documentoIdentidad: string
  /** ISO AAAA-MM-DD. */
  fechaNacimiento: string
}

export type InmuebleHogar = {
  /** 5 dígitos, provincia 01-52. */
  codigoPostal: string
  /** Población esperada del CP: si viene, el robot comprueba que el portal autocompleta ESA (si no, para). `null` = no consta. */
  municipio: string | null
  nombreVia: string
  /** Número de la vía (texto: «12», «12B», «s/n»…). */
  numero: string
  bloque: string | null
  escalera: string | null
  /** Planta/piso («2», «BJ»…). */
  planta: string | null
  puerta: string | null
  anioConstruccion: number
  /** `null` = no consta / sin reforma declarada. */
  anioReforma: number | null
  /** Superficie construida de la vivienda en m². */
  superficieM2: number
  /**
   * Referencia catastral (14 = parcela, 20 = bien), en mayúsculas y sin espacios. Opcional: `undefined` = no consta (Mapfre
   * Hogar la necesita; Allianz no). La consulta @central/core-catastro la resuelve ANTES de encolar; nunca la inventa el bot.
   */
  referenciaCatastral?: string
}

export type DatosHogar = {
  uso: UsoVivienda
  regimen: RegimenVivienda
  tipoVivienda: TipoVivienda
  /** ¿Construcción con madera? (Allianz: «Sin madera» / «Con madera»). Explícito: sin valor por defecto. */
  conMadera: boolean
  /** Capitales en euros (número). `null` = no consta: la pantalla de valoración de bienes no está mapeada todavía. */
  capitalContinenteEur: number | null
  capitalContenidoEur: number | null
  /**
   * Medidas de seguridad de la vivienda (21/10/2026). Ausente = el bloque no consta; cada campo `null` = «no se sabe» (NUNCA «no
   * tiene»). Fuente única: `info_riesgo.datosVivienda` de la oportunidad (module-seguros, datos-vivienda-riesgo.ts:
   * `puertaPrincipalBlindada`, `ventanasSeguras`, `urbanizacionCerrada`, `vigilante`). Las piden «Valoración de bienes» de Allianz y
   * el panel `#protecciones-panel` de Mapfre, AÚN SIN MAPEAR: ningún adaptador las escribe hasta grabar esa pantalla, y un `null`
   * nunca se escribe en el portal como «No». La alarma NO está: en la oportunidad es un id del catálogo de Codeoscopic sin
   * traducción atestiguada (no se adivina).
   */
  protecciones?: ProteccionesHogar
  /** Joyas y objetos de valor declarados (21/10/2026), en euros. Ausente = no consta; `0` = declarado «nada» (es un dato). */
  objetosValor?: ObjetosValorHogar
}

/** Ver `DatosHogar.protecciones`. `null` = no se sabe. */
export type ProteccionesHogar = {
  puertaBlindada: boolean | null
  ventanasSeguridad: boolean | null
  urbanizacionCerrada: boolean | null
  vigilancia: boolean | null
}
export const CLAVES_PROTECCIONES_HOGAR = ['puertaBlindada', 'ventanasSeguridad', 'urbanizacionCerrada', 'vigilancia'] as const satisfies readonly (keyof ProteccionesHogar)[]

/** Ver `DatosHogar.objetosValor`. `null` = no se sabe; `0` = declarado sin. */
export type ObjetosValorHogar = {
  joyasCajaFuerteEur: number | null
  joyasFueraCajaEur: number | null
  objetosValorEur: number | null
}
export const CLAVES_OBJETOS_VALOR_HOGAR = ['joyasCajaFuerteEur', 'joyasFueraCajaEur', 'objetosValorEur'] as const satisfies readonly (keyof ObjetosValorHogar)[]

export type FormularioHogar = {
  ramo: 'hogar'
  tomador: TomadorHogar
  inmueble: InmuebleHogar
  hogar: DatosHogar
  /**
   * Nombre y apellidos del tomador (21/10/2026), SOLO para los portales que dan de alta al tomador si no lo conocen (Mapfre Hogar).
   * Mismo régimen que el DNI: lo pone ASEGURA desde la ficha al ENTREGAR el trabajo (nunca viaja desde plataforma ni se guarda en la
   * cola) y el worker lo trata como SECRETO (`secretosDelRiesgo`). Ausente = no lo necesita el bot o no se inyectó.
   */
  datosTomador?: DatosTomadorFicha
}

export type ValidacionFormularioHogar = { ok: true; formulario: FormularioHogar } | { ok: false; errores: string[] }

/**
 * El formulario de hogar SIN el bloque `tomador` (19/10/2026): lo que viaja de plataforma a asegura y lo que se GUARDA en la cola.
 * El DNI/NIE y la fecha de nacimiento del tomador son datos personales que NO cruzan el puerto: los pone asegura desde la ficha
 * del cliente al ENTREGAR el trabajo al worker (mismo régimen que el NIF de Mapfre), y el worker valida el formulario ENTERO.
 */
export type FormularioHogarSinTomador = Omit<FormularioHogar, 'tomador' | 'datosTomador'>
export type ValidacionFormularioHogarSinTomador = { ok: true; formulario: FormularioHogarSinTomador } | { ok: false; errores: string[] }

const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
const vacio = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '')

function texto(v: unknown, campo: string, errores: string[], max: number, obligatorio: boolean): string | null {
  if (vacio(v)) {
    if (obligatorio) errores.push(`${campo}: obligatorio`)
    return null
  }
  if (typeof v !== 'string' && !(typeof v === 'number' && Number.isFinite(v))) {
    errores.push(`${campo}: tiene que ser texto`)
    return null
  }
  const t = String(v).trim().replace(/\s+/g, ' ')
  if (t.length > max) { errores.push(`${campo}: más de ${max} caracteres`); return null }
  if (tieneCaracteresProhibidos(t)) { errores.push(`${campo}: caracteres no admitidos`); return null }
  return t
}

function enLista<T extends string>(v: unknown, lista: readonly T[], campo: string, errores: string[]): T | null {
  if (vacio(v)) { errores.push(`${campo}: obligatorio (sin valor por defecto: ${lista.join(', ')})`); return null }
  if (typeof v === 'string' && (lista as readonly string[]).includes(v)) return v as T
  errores.push(`${campo}: no es uno de ${lista.join(', ')}`)
  return null
}

function entero(v: unknown, campo: string, errores: string[], min: number, max: number, obligatorio: boolean): number | null {
  if (vacio(v)) {
    if (obligatorio) errores.push(`${campo}: obligatorio`)
    return null
  }
  const n = typeof v === 'number' ? v : NaN
  if (!Number.isInteger(n) || n < min || n > max) { errores.push(`${campo}: tiene que ser un entero entre ${min} y ${max} (número, no texto)`); return null }
  return n
}

function importe(v: unknown, campo: string, errores: string[]): number | null {
  if (vacio(v)) return null
  const n = typeof v === 'number' ? v : NaN
  if (!Number.isFinite(n) || n <= 0 || n > 100_000_000) { errores.push(`${campo}: tiene que ser un importe en euros mayor que 0 (número, no texto)`); return null }
  return Math.round(n * 100) / 100
}

/** Importe que admite el `0` (declarado «nada»): vacío → `null` (no se sabe). */
function importeCeroValido(v: unknown, campo: string, errores: string[]): number | null {
  if (vacio(v)) return null
  const n = typeof v === 'number' ? v : NaN
  if (!Number.isFinite(n) || n < 0 || n > 100_000_000) { errores.push(`${campo}: tiene que ser un importe en euros ≥ 0 (número, no texto)`); return null }
  return Math.round(n * 100) / 100
}

/** Bloque opcional de tres estados: ausente/`null` → `undefined` (no consta); objeto → cada clave `null` o su valor. */
function bloqueOpcional<K extends string, T>(
  v: unknown, nombre: string, claves: readonly K[], errores: string[], leer: (x: unknown, campo: string) => T | null,
): Record<K, T | null> | undefined {
  if (v === undefined || v === null) return undefined
  const o = obj(v)
  if (!o) { errores.push(`${nombre}: tiene que ser un objeto`); return undefined }
  const fuera = Object.keys(o).filter((k) => !(claves as readonly string[]).includes(k))
  if (fuera.length) { errores.push(`${nombre}: claves no admitidas (${fuera.join(', ')})`); return undefined }
  const out = {} as Record<K, T | null>
  for (const k of claves) out[k] = leer(o[k], `${nombre}.${k}`)
  return Object.values(out).some((x) => x !== null) ? out : undefined
}

function booleano(v: unknown, campo: string, errores: string[]): boolean | null {
  if (v === undefined || v === null) return null
  if (typeof v === 'boolean') return v
  errores.push(`${campo}: tiene que ser true, false o no venir (sin valor por defecto)`)
  return null
}

function fechaIsoReal(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return false
  const f = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return f.getUTCFullYear() === Number(m[1]) && f.getUTCMonth() === Number(m[2]) - 1 && f.getUTCDate() === Number(m[3])
}

/** AAAA-MM-DD → dd/mm/aaaa (como lo escriben los portales). Otra forma → `null` (no se adivina). */
export function fechaDdMmAaaaDeIso(iso: string): string | null {
  return fechaIsoReal(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : null
}

/**
 * Riesgo crudo (de asegura) → `FormularioHogar`, todo o nada. Los errores nombran el CAMPO, nunca el valor (son datos
 * personales en el caso del tomador). `hoy` fija la edad del tomador y el año máximo de construcción/reforma.
 */
export function validarFormularioHogar(entrada: unknown, hoy: Date = new Date()): ValidacionFormularioHogar {
  const v = validarHogar(entrada, hoy, true)
  if (!v.ok) return v
  return { ok: true, formulario: { ...v.formulario, tomador: v.formulario.tomador! } }
}

/**
 * Como `validarFormularioHogar` pero IGNORANDO el bloque `tomador` (si viene, no se valida ni se devuelve): lo demás (inmueble,
 * uso, régimen, tipo, madera, capitales) se exige igual. Es la validación de plataforma → asegura al encolar; el tomador lo
 * pone asegura desde la ficha al entregar y el worker valida el formulario completo. Los errores nunca nombran el tomador.
 */
export function validarFormularioHogarSinTomador(entrada: unknown, hoy: Date = new Date()): ValidacionFormularioHogarSinTomador {
  const v = validarHogar(entrada, hoy, false)
  if (!v.ok) return v
  const { tomador: _fuera, ...resto } = v.formulario
  return { ok: true, formulario: resto }
}

function validarHogar(entrada: unknown, hoy: Date, exigirTomador: boolean):
  { ok: true; formulario: Omit<FormularioHogar, 'tomador'> & { tomador: TomadorHogar | null } } | { ok: false; errores: string[] } {
  const e = obj(entrada)
  if (!e) return { ok: false, errores: ['formulario: tiene que ser un objeto'] }
  const errores: string[] = []
  if (e.ramo !== 'hogar') errores.push('ramo: tiene que ser «hogar»')
  const anioHoy = hoy.getUTCFullYear()

  // ── tomador ──
  const t = exigirTomador ? obj(e.tomador) : null
  let tomador: TomadorHogar | null = null
  if (!exigirTomador) { /* el tomador lo pone asegura desde la ficha al entregar el trabajo */ }
  else if (!t) errores.push('tomador: obligatorio (objeto con documentoIdentidad y fechaNacimiento)')
  else {
    let doc: string | null = null
    const docCrudo = texto(t.documentoIdentidad, 'tomador.documentoIdentidad', errores, 20, true)
    if (docCrudo !== null) {
      const d = normalizarDocumento(docCrudo)
      if (esDniNie(d)) doc = d
      else errores.push('tomador.documentoIdentidad: no es un DNI/NIE válido')
    }
    let fn: string | null = null
    const fnCruda = texto(t.fechaNacimiento, 'tomador.fechaNacimiento', errores, 10, true)
    if (fnCruda !== null) {
      if (!fechaIsoReal(fnCruda)) errores.push('tomador.fechaNacimiento: no es una fecha AAAA-MM-DD')
      else {
        const f = new Date(`${fnCruda}T00:00:00Z`)
        let edad = anioHoy - f.getUTCFullYear()
        if (hoy.getUTCMonth() < f.getUTCMonth() || (hoy.getUTCMonth() === f.getUTCMonth() && hoy.getUTCDate() < f.getUTCDate())) edad--
        if (edad < 18 || edad > 110) errores.push('tomador.fechaNacimiento: la edad resultante no es la de un tomador (18-110)')
        else fn = fnCruda
      }
    }
    if (doc !== null && fn !== null) tomador = { documentoIdentidad: doc, fechaNacimiento: fn }
  }

  // ── inmueble ──
  const i = obj(e.inmueble)
  let inmueble: InmuebleHogar | null = null
  if (!i) errores.push('inmueble: obligatorio')
  else {
    const n0 = errores.length
    let codigoPostal: string | null = null
    const cp = typeof i.codigoPostal === 'string' ? i.codigoPostal.trim() : null
    if (cp === null || cp === '') errores.push('inmueble.codigoPostal: obligatorio')
    else if (!/^\d{5}$/.test(cp) || Number(cp.slice(0, 2)) < 1 || Number(cp.slice(0, 2)) > 52) errores.push('inmueble.codigoPostal: no es un código postal español de 5 dígitos')
    else codigoPostal = cp
    const municipio = texto(i.municipio, 'inmueble.municipio', errores, 80, false)
    const nombreVia = texto(i.nombreVia, 'inmueble.nombreVia', errores, 80, true)
    const numero = texto(i.numero, 'inmueble.numero', errores, 10, true)
    const bloque = texto(i.bloque, 'inmueble.bloque', errores, 10, false)
    const escalera = texto(i.escalera, 'inmueble.escalera', errores, 10, false)
    const planta = texto(i.planta, 'inmueble.planta', errores, 10, false)
    const puerta = texto(i.puerta, 'inmueble.puerta', errores, 10, false)
    const anioConstruccion = entero(i.anioConstruccion, 'inmueble.anioConstruccion', errores, 1500, anioHoy, true)
    const anioReforma = entero(i.anioReforma, 'inmueble.anioReforma', errores, 1500, anioHoy, false)
    if (anioConstruccion !== null && anioReforma !== null && anioReforma < anioConstruccion) errores.push('inmueble.anioReforma: anterior al año de construcción')
    const rcCruda = texto(i.referenciaCatastral, 'inmueble.referenciaCatastral', errores, 24, false)
    const rc = rcCruda === null ? null : rcCruda.replace(/[\s-]/g, '').toUpperCase()
    if (rc !== null && !/^[0-9A-Z]{14}(?:[0-9A-Z]{4}[A-Z]{2})?$/.test(rc)) errores.push('inmueble.referenciaCatastral: no es una referencia catastral (14 o 20 caracteres)')
    const superficieM2 = entero(i.superficieM2, 'inmueble.superficieM2', errores, 10, 100_000, true)
    if (errores.length === n0 && codigoPostal !== null && nombreVia !== null && numero !== null && anioConstruccion !== null && superficieM2 !== null) {
      inmueble = { codigoPostal, municipio, nombreVia, numero, bloque, escalera, planta, puerta, anioConstruccion, anioReforma, superficieM2, ...(rc !== null ? { referenciaCatastral: rc } : {}) }
    }
  }

  // ── hogar ──
  const h = obj(e.hogar)
  let hogar: DatosHogar | null = null
  if (!h) errores.push('hogar: obligatorio (uso, regimen, tipoVivienda, conMadera)')
  else {
    const n0 = errores.length
    const uso = enLista(h.uso, USOS_VIVIENDA, 'hogar.uso', errores)
    const regimen = enLista(h.regimen, REGIMENES_VIVIENDA, 'hogar.regimen', errores)
    const tipoVivienda = enLista(h.tipoVivienda, TIPOS_VIVIENDA, 'hogar.tipoVivienda', errores)
    const conMadera = typeof h.conMadera === 'boolean' ? h.conMadera : null
    if (conMadera === null) errores.push('hogar.conMadera: obligatorio (true o false, sin valor por defecto)')
    const capitalContinenteEur = importe(h.capitalContinenteEur, 'hogar.capitalContinenteEur', errores)
    const capitalContenidoEur = importe(h.capitalContenidoEur, 'hogar.capitalContenidoEur', errores)
    // Opcionales de tres estados (21/10/2026): ausentes o todo `null` = el bloque no consta (no se devuelve).
    const protecciones = bloqueOpcional(h.protecciones, 'hogar.protecciones', CLAVES_PROTECCIONES_HOGAR, errores, (x, c) => booleano(x, c, errores))
    const objetosValor = bloqueOpcional(h.objetosValor, 'hogar.objetosValor', CLAVES_OBJETOS_VALOR_HOGAR, errores, (x, c) => importeCeroValido(x, c, errores))
    if (errores.length === n0 && uso && regimen && tipoVivienda && conMadera !== null) {
      hogar = {
        uso, regimen, tipoVivienda, conMadera, capitalContinenteEur, capitalContenidoEur,
        ...(protecciones ? { protecciones } : {}), ...(objetosValor ? { objetosValor } : {}),
      }
    }
  }

  // Nombre/apellidos del tomador (Mapfre Hogar): solo en la validación del worker (lo inyecta asegura al entregar); al encolar desde
  // plataforma NO se acepta (no cruza el puerto), igual que el bloque `tomador`.
  const datosTomador = exigirTomador ? validarDatosTomadorFicha(e.datosTomador, errores) : null

  if (errores.length || (exigirTomador && !tomador) || !inmueble || !hogar) return { ok: false, errores: errores.length ? errores : ['formulario: incompleto'] }
  return { ok: true, formulario: { ramo: 'hogar', tomador, inmueble, hogar, ...(datosTomador ? { datosTomador } : {}) } }
}
