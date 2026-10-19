// La RESPUESTA del cliente a la petición de datos de su lead (19/10/2026, spec
// docs/superpowers/specs/2026-10-19-correduria-lead-a-propuesta-automatica-design.md, F2). PURO: ni red, ni BD, ni env.
//
// Lo comparten plataforma (lee el correo con IA y valida contra el texto) y asegura (vuelve a validar la forma y
// decide qué se escribe en `info_riesgo` sin pisar nada). Las tres reglas que no se negocian:
//   1. Solo cuenta lo que APARECE en el correo: la IA devuelve cada valor con su `cita` literal; si la cita no está en
//      el texto, o el valor no sale de la cita, el dato no existe (`null` = «no se sabe»). Nunca se inventa ni se
//      corrige a ojo: un DNI con la letra mal es INVÁLIDO y se repregunta.
//   2. Lo que ya se sabía manda: un dato nuevo igual al guardado no cambia nada; uno DISTINTO es una discrepancia que
//      se le enseña a Alberto y no se escribe. Lo confirmado por Alberto (`confirmadoAt` del bloque del riesgo) no se
//      toca: lo que el cliente da de un bloque confirmado se guarda aparte y se dice.
//   3. «Completo» = ningún obligatorio del contrato sin saber. Es la ÚNICA puerta a `lista_para_tarificar` en F2; la F3
//      vuelve a pasar `revisarDatos<Ramo>()` antes de pagar un precio.
import { contratoDatos, peticionDatos, sePideDeEntrada, type CampoContrato } from './contrato-datos.ts'
import { normalizarDni, normalizarEmail } from './cliente-edicion.ts'
import { formatoMatricula, normalizarMatricula } from './matricula.ts'
import type { RamoOportunidad } from './oportunidad-seguimiento.ts'

export type ValorContrato = string | number | boolean

type Tipo =
  | { t: 'dni' } | { t: 'telefono' } | { t: 'email' } | { t: 'cp' } | { t: 'matricula' } | { t: 'sexo' } | { t: 'bool' }
  | { t: 'fecha'; que: 'nacimiento' | 'pasada' | 'efecto' }
  | { t: 'numero'; min: number; max: number; entero?: true }
  | { t: 'texto'; max: number }

const ENTERO = (min: number, max: number): Tipo => ({ t: 'numero', min, max, entero: true })

/** Tipo de valor por clave del contrato. Lo que no está aquí es texto libre (≤ 300). */
const TIPO_DE_CLAVE: Readonly<Record<string, Tipo>> = {
  dni: { t: 'dni' },
  telefono: { t: 'telefono' },
  email: { t: 'email' },
  cp: { t: 'cp' }, cpCirculacion: { t: 'cp' }, cpResidencia: { t: 'cp' }, 'direccion.codigoPostal': { t: 'cp' },
  matricula: { t: 'matricula' },
  sexo: { t: 'sexo' },
  fechaNacimiento: { t: 'fecha', que: 'nacimiento' },
  fechaCarnet: { t: 'fecha', que: 'pasada' },
  fechaEfecto: { t: 'fecha', que: 'efecto' },
  kmAnuales: ENTERO(0, 200_000),
  metrosCuadrados: { t: 'numero', min: 10, max: 100_000 },
  m2Construidos: { t: 'numero', min: 10, max: 1_000_000 },
  anioConstruccion: ENTERO(1500, 9999),
  anioUltimaReforma: ENTERO(1500, 9999),
  habitaciones: ENTERO(1, 60),
  plantas: ENTERO(1, 200),
  numEdificios: ENTERO(1, 500),
  duracionAnios: ENTERO(1, 60),
  capital: { t: 'numero', min: 1, max: 100_000_000 },
  capitalContinente: { t: 'numero', min: 1, max: 100_000_000 },
  capitalContenido: { t: 'numero', min: 1, max: 100_000_000 },
  fumador: { t: 'bool' },
  puertaPrincipalBlindada: { t: 'bool' },
  ventanasSeguras: { t: 'bool' },
  urbanizacionCerrada: { t: 'bool' },
  propietarioEsTomador: { t: 'bool' },
}
const tipoDe = (clave: string): Tipo => TIPO_DE_CLAVE[clave] ?? { t: 'texto', max: 300 }

/**
 * Claves cuyo valor es dato personal que NO se guarda en claro en `info_riesgo` (asegura las cifra con la clave PII; sin
 * clave, no se guardan): el documento, lo que la ficha ya guarda cifrado (nacimiento, teléfono, email, dirección del
 * tomador) y los datos de OTRAS personas (conductor, titular, asegurados), que suelen traer su DNI.
 */
const CLAVES_CIFRADAS = new Set([
  'dni', 'fechaNacimiento', 'telefono', 'email', 'conductor', 'propietario', 'conductorOcasional', 'asegurado', 'aseguradosAdicionales',
])
export function seGuardaCifrado(campo: Pick<CampoContrato, 'clave' | 'sensible' | 'deLaPersona'>): boolean {
  if (campo.sensible === 'documento' || CLAVES_CIFRADAS.has(campo.clave)) return true
  return campo.deLaPersona === true && (campo.clave === 'nombreVia' || campo.clave === 'numeroVia')
}

// ─── Qué se le pide a la IA ───────────────────────────────────────────────────────────────────────────────────────

/** Campos que se pueden leer de la respuesta: los que tienen pregunta (nunca salud), sin repetir clave. */
export function camposLeibles(ramos: readonly (RamoOportunidad | string)[]): CampoContrato[] {
  const out = new Map<string, CampoContrato>()
  for (const r of ramos.length ? ramos : [null]) {
    for (const f of contratoDatos(r).campos) {
      if (f.pregunta === null || f.sensible === 'salud') continue
      if (f.origen !== 'cliente' && f.origen !== 'catalogo') continue
      if (!out.has(f.clave)) out.set(f.clave, f)
    }
  }
  return [...out.values()]
}

/** El prompt de extracción: SOLO las claves del contrato, con su cita literal. */
export function promptExtraerRespuesta(ramos: readonly (RamoOportunidad | string)[], hoy: string): string {
  const lista = camposLeibles(ramos).map((f) => `- ${f.clave}: ${f.etiqueta}`).join('\n')
  return [
    'Eres el asistente de una correduría de seguros. Te paso la RESPUESTA de un cliente a nuestra petición de datos.',
    'Extrae SOLO los datos que el cliente escribe en ESTE texto, y solo de estas claves:',
    lista,
    '',
    'Devuelve SOLO un JSON: {"<clave>": {"valor": ..., "cita": "<fragmento LITERAL del texto, máx. 60 caracteres>"}}.',
    `Fechas en formato aaaa-mm-dd (hoy es ${hoy}). Números sin puntos de miles. Sí/no como true/false. Sexo como "H" o "M".`,
    'Si un dato no está escrito en el texto, NO lo pongas. No deduzcas, no completes, no corrijas (si la letra del DNI',
    'parece errónea, cópialo tal cual). Nada de salud ni enfermedades. Sin datos: {}.',
  ].join('\n')
}

// ─── Validación de la FORMA (la usan los dos lados) ───────────────────────────────────────────────────────────────

export type Validado = { ok: true; valor: ValorContrato } | { ok: false; motivo: string }

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
const norm = (s: string) => sinTildes(s).toLowerCase().replace(/\s+/g, ' ').trim()
const compacto = (s: string) => sinTildes(s).toUpperCase().replace(/[^A-Z0-9]/g, '')
/** «90.000» / «90 000» → «90000» (solo separadores de miles, no decimales). */
const sinMiles = (s: string) => {
  let t = s
  for (let i = 0; i < 4; i++) t = t.replace(/(\d)[.\s](?=\d{3}(?!\d))/g, '$1')
  return t
}
const CAJON = /^(otro|otra|n\/?a|no se|no lo se|desconocid[oa]|no consta|ninguno|-+|null|undefined)$/

function fechaIso(v: unknown): { a: number; m: number; d: number } | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  const esp = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s)
  const [a, m, d] = iso ? [+iso[1], +iso[2], +iso[3]] : esp ? [+esp[3], +esp[2], +esp[1]] : [NaN, NaN, NaN]
  if (!Number.isFinite(a)) return null
  const f = new Date(Date.UTC(a, m - 1, d))
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null
  return { a, m, d }
}
const iso = (f: { a: number; m: number; d: number }) => `${f.a}-${String(f.m).padStart(2, '0')}-${String(f.d).padStart(2, '0')}`
const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

/**
 * ¿El valor tiene forma válida para esa clave? Normaliza (DNI sin separadores, matrícula en mayúsculas, fecha
 * aaaa-mm-dd…). `hoy` aaaa-mm-dd: las fechas se miden contra él (inyectado: nada de reloj real en la regla). PURA.
 */
export function validarValorContrato(clave: string, valor: unknown, hoy: string): Validado {
  const tipo = tipoDe(clave)
  const txt = typeof valor === 'string' ? valor.trim() : typeof valor === 'number' && Number.isFinite(valor) ? String(valor) : ''
  switch (tipo.t) {
    case 'dni': {
      const r = normalizarDni(txt)
      return r.ok ? { ok: true, valor: r.valor.valor } : { ok: false, motivo: r.motivo }
    }
    case 'telefono': {
      const d = txt.replace(/[\s.()-]/g, '').replace(/^(\+34|0034)/, '')
      return /^[6-9]\d{8}$/.test(d) ? { ok: true, valor: d } : { ok: false, motivo: 'el teléfono no tiene 9 cifras de un número español' }
    }
    case 'email': {
      const r = normalizarEmail(txt)
      return r.ok ? { ok: true, valor: r.valor } : { ok: false, motivo: 'el email no es válido' }
    }
    case 'cp': {
      const d = txt.replace(/\s/g, '')
      if (!/^\d{5}$/.test(d)) return { ok: false, motivo: 'el código postal son 5 cifras' }
      const prov = Number(d.slice(0, 2))
      return prov >= 1 && prov <= 52 ? { ok: true, valor: d } : { ok: false, motivo: 'ese código postal no es de España' }
    }
    case 'matricula': {
      const m = normalizarMatricula(txt)
      return formatoMatricula(m) === 'desconocido' ? { ok: false, motivo: 'la matrícula no tiene un formato español' } : { ok: true, valor: m }
    }
    case 'sexo': {
      const s = norm(txt)
      if (/^(h|hombre|varon|masculino)$/.test(s)) return { ok: true, valor: 'H' }
      if (/^(m|mujer|femenino)$/.test(s)) return { ok: true, valor: 'M' }
      return { ok: false, motivo: 'el sexo no se entiende' }
    }
    case 'bool': {
      if (typeof valor === 'boolean') return { ok: true, valor }
      const s = norm(txt)
      if (/^(si|true)$/.test(s)) return { ok: true, valor: true }
      if (/^(no|false)$/.test(s)) return { ok: true, valor: false }
      return { ok: false, motivo: 'no se entiende si es sí o no' }
    }
    case 'fecha': {
      const f = fechaIso(txt)
      if (!f) return { ok: false, motivo: 'la fecha no existe o no se entiende' }
      const v = iso(f)
      const d = diasEntre(v, hoy) // > 0: en el pasado
      if (tipo.que === 'nacimiento') {
        const edad = d / 365.25
        if (edad < 16 || edad > 110) return { ok: false, motivo: 'la fecha de nacimiento no es plausible' }
      } else if (tipo.que === 'pasada') {
        if (d < 0) return { ok: false, motivo: 'la fecha es futura' }
        if (f.a < 1940) return { ok: false, motivo: 'la fecha es demasiado antigua' }
      } else {
        if (d > 0) return { ok: false, motivo: 'la fecha de efecto ya ha pasado' }
        if (-d > 400) return { ok: false, motivo: 'la fecha de efecto es de dentro de más de un año' }
      }
      return { ok: true, valor: v }
    }
    case 'numero': {
      const n = typeof valor === 'number' ? valor : Number(sinMiles(txt).replace(/[€\s]|m2|m²|km/gi, '').replace(',', '.'))
      if (!Number.isFinite(n)) return { ok: false, motivo: 'no es un número' }
      if (tipo.entero && !Number.isInteger(n)) return { ok: false, motivo: 'tiene que ser un número entero' }
      const max = clave.startsWith('anio') ? Number(hoy.slice(0, 4)) : tipo.max
      if (n < tipo.min || n > max) return { ok: false, motivo: 'el número está fuera de lo razonable' }
      return { ok: true, valor: n }
    }
    case 'texto': {
      const s = (typeof valor === 'string' ? valor : '').replace(/\s+/g, ' ').trim()
      if (!s || CAJON.test(norm(s))) return { ok: false, motivo: 'vacío' }
      return { ok: true, valor: s.slice(0, tipo.max) }
    }
  }
}

// ─── ¿Aparece en el correo? ───────────────────────────────────────────────────────────────────────────────────────

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const conNumero = (texto: string, n: number | string) => new RegExp(`(?<!\\d)0?${n}(?!\\d)`).test(texto)

/**
 * ¿La cita está LITERAL en el texto y el valor sale de ella? Un dato sin cita, con una cita que no está en el correo,
 * o cuyo valor no se ve en su cita, no existe. PURA.
 */
export function apareceEnCorreo(clave: string, valor: ValorContrato, cita: unknown, texto: string): boolean {
  if (typeof cita !== 'string') return false
  const c = norm(cita)
  if (c.length < 1 || c.length > 300 || !norm(texto).includes(c)) return false
  const tipo = tipoDe(clave)
  switch (tipo.t) {
    case 'dni': case 'matricula': case 'cp':
      return compacto(cita).includes(compacto(String(valor)))
    case 'telefono':
      return cita.replace(/\D/g, '').includes(String(valor))
    case 'email':
      return c.includes(String(valor).toLowerCase())
    case 'numero': {
      const n = Math.trunc(Number(valor))
      const enCita = sinMiles(cita)
      if (new RegExp(`(?<!\\d)${n}(?!\\d)`).test(enCita)) return true
      const mil = /(\d+(?:[.,]\d+)?)\s*(k|mil)\b/i.exec(enCita)
      return !!mil && Math.round(Number(mil[1].replace(',', '.')) * 1000) === n
    }
    case 'fecha': {
      const f = fechaIso(String(valor))
      if (!f) return false
      const dia = conNumero(c, f.d)
      const mes = conNumero(c, f.m) || c.includes(MESES[f.m - 1])
      const anio = c.includes(String(f.a)) || new RegExp(`(?<!\\d)${String(f.a).slice(2)}(?!\\d)`).test(c)
      // La fecha de efecto se dice sin año («el 1 de noviembre»); la de nacimiento y la del carné, no.
      return dia && mes && (anio || tipo.que === 'efecto')
    }
    case 'bool': case 'sexo':
      return true
    case 'texto':
      return norm(String(valor)).length >= 2 && c.includes(norm(String(valor)))
  }
}

// ─── Lo que devuelve la IA → datos válidos ────────────────────────────────────────────────────────────────────────

export type LecturaRespuesta = {
  /** clave → valor normalizado. Solo lo que aparece en el correo y tiene forma válida. */
  valores: Record<string, ValorContrato>
  /** Lo que el cliente escribió pero no vale (letra del DNI, fecha imposible…): se repregunta. */
  invalidos: { clave: string; motivo: string }[]
}

/**
 * JSON de la IA → valores válidos y aparecidos en el texto. Claves fuera del contrato, salud, citas inventadas y
 * valores de cajón se ignoran (no son «no lo tiene»: simplemente no se sabe). PURA.
 */
export function leerRespuestaIa(raw: unknown, ctx: { texto: string; ramos: readonly (RamoOportunidad | string)[]; hoy: string }): LecturaRespuesta {
  const o = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const leibles = new Set(camposLeibles(ctx.ramos).map((f) => f.clave))
  const valores: Record<string, ValorContrato> = {}
  const invalidos: { clave: string; motivo: string }[] = []
  for (const [clave, x] of Object.entries(o)) {
    if (!leibles.has(clave)) continue
    const e = typeof x === 'object' && x !== null && !Array.isArray(x) ? (x as Record<string, unknown>) : null
    if (!e || e.valor === null || e.valor === undefined || e.valor === '') continue
    const crudo = typeof e.valor === 'string' || typeof e.valor === 'number' || typeof e.valor === 'boolean' ? e.valor : null
    if (crudo === null) continue
    // Primero, que esté en el correo con lo que el cliente escribió (si no, no existe: ni válido ni inválido).
    if (typeof e.cita !== 'string' || !norm(ctx.texto).includes(norm(e.cita)) || norm(e.cita).length === 0) continue
    const v = validarValorContrato(clave, crudo, ctx.hoy)
    if (!v.ok) {
      if (v.motivo !== 'vacío') invalidos.push({ clave, motivo: v.motivo })
      continue
    }
    if (!apareceEnCorreo(clave, v.valor, e.cita, ctx.texto)) continue
    valores[clave] = v.valor
  }
  return { valores, invalidos }
}

/**
 * El cuerpo de la respuesta SIN lo citado: nuestra petición (con sus ejemplos «Seat León 1.5 TSI») y el pie legal (NIF y
 * CP del mediador) vienen debajo y la IA los tomaría por datos del cliente. Se corta en la primera marca de cita. PURA.
 */
export function cuerpoSinCita(texto: string): string {
  const lineas = String(texto ?? '').replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i]
    const t = l.trim()
    if (/^>/.test(t)) break
    if (/^-{2,}\s*$/.test(t)) break
    if (/^-{3,}\s*(mensaje original|original message|forwarded message|mensaje reenviado)/i.test(t)) break
    // «El lun, 19 oct 2026 a las 10:00, Grupo ASegura <hola@…> escribió:» (puede partirse en dos líneas)
    const dos = `${t} ${(lineas[i + 1] ?? '').trim()}`
    if (/^(el|on)\s.{0,200}(escribi[oó]|wrote)\s*:/i.test(t) || (/^(el|on)\s/i.test(t) && /(escribi[oó]|wrote)\s*:\s*$/i.test(dos) && dos.length < 260)) break
    if (/^(de|from)\s*:\s.+@/i.test(t)) break
    out.push(l)
  }
  return out.join('\n').trim()
}

// ─── Fusión con lo que ya hay ─────────────────────────────────────────────────────────────────────────────────────

/** Campos de cada bloque del riesgo que un dato del cliente puede rellenar tal cual (misma clave, valor simple). */
const CAMPOS_BLOQUE: Readonly<Record<string, readonly string[]>> = {
  datosVehiculo: ['matricula', 'kmAnuales', 'cpCirculacion'],
  datosVivienda: [
    'cp', 'nombreVia', 'numeroVia', 'planta', 'referenciaCatastral', 'metrosCuadrados', 'anioConstruccion', 'habitaciones',
    'anioUltimaReforma', 'puertaPrincipalBlindada', 'ventanasSeguras', 'urbanizacionCerrada', 'propietarioEsTomador',
    'capitalContinente', 'capitalContenido',
  ],
  datosCapital: ['capital', 'duracionAnios', 'fumador'],
}
export function camposDeBloqueRellenables(claveBloque: string): readonly string[] {
  return CAMPOS_BLOQUE[claveBloque] ?? []
}

/** ¿Dos valores son el mismo dato? Texto sin tildes/mayúsculas/espacios; documentos y códigos sin separadores. PURA. */
/**
 * Estado civil → categoría comparable (19/10/2026, revisión F2). La ficha lo guarda como texto libre del CRM («Casado») o
 * como id del vendor («Married», «Single»); el cliente escribe «casada», «soltero/a», «pareja de hecho». `null` = no se
 * reconoce (entonces se compara el texto tal cual: ante la duda, discrepancia, nunca «es lo mismo»). PURA.
 */
export type CategoriaEstadoCivil = 'soltero' | 'casado' | 'pareja' | 'separado' | 'divorciado' | 'viudo'
export function categoriaEstadoCivil(v: unknown): CategoriaEstadoCivil | null {
  if (typeof v !== 'string') return null
  const s = norm(v).replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!s) return null
  if (/\b(pareja de hecho|pareja|unid[oa] de hecho|registered ?partner|domestic ?partner|commonlaw)\b/.test(s)) return 'pareja'
  if (/\b(solter[oa]s?|single)\b/.test(s)) return 'soltero'
  if (/\b(casad[oa]s?|married)\b/.test(s)) return 'casado'
  if (/\b(divorciad[oa]s?|divorced)\b/.test(s)) return 'divorciado'
  if (/\b(separad[oa]s?|separated)\b/.test(s)) return 'separado'
  if (/\b(viud[oa]s?|widow(ed|er)?)\b/.test(s)) return 'viudo'
  return null
}

export function mismoValor(clave: string, a: unknown, b: unknown): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return false
  if (clave === 'estadoCivil') {
    const ca = categoriaEstadoCivil(a)
    const cb = categoriaEstadoCivil(b)
    if (ca !== null && cb !== null) return ca === cb
    return norm(String(a)) === norm(String(b))
  }
  const t = tipoDe(clave).t
  if (t === 'fecha') {
    // La ficha guarda «aaaa-mm-dd» o «dd/mm/aaaa»: se compara la FECHA, no el texto. Ilegible = distinta.
    const fa = fechaIso(String(a))
    const fb = fechaIso(String(b))
    return fa !== null && fb !== null && iso(fa) === iso(fb)
  }
  if (t === 'numero') return Number(a) === Number(b)
  if (t === 'bool') return Boolean(a) === Boolean(b)
  if (t === 'dni' || t === 'matricula' || t === 'cp' || t === 'telefono') return compacto(String(a)) === compacto(String(b))
  return norm(String(a)) === norm(String(b))
}

export type DecisionFusion = {
  /** Nuevos de verdad: se guardan (con `_procedencia: cliente`). */
  escribir: string[]
  /** De `escribir`, los que además rellenan un hueco del bloque del riesgo (no confirmado). */
  aBloque: string[]
  /** De `escribir`, los del bloque CONFIRMADO por Alberto: se guardan aparte, el bloque no se toca. */
  protegidos: string[]
  /** Ya se sabían con el mismo valor. */
  iguales: string[]
  /** Ya había OTRO valor: no se pisa, se le enseña a Alberto. */
  discrepancias: string[]
}

/**
 * Qué hacer con cada dato nuevo. `previos` = lo ya guardado de la respuesta del cliente (descifrado); `bloque` = los
 * datos del riesgo del ramo (`info_riesgo.<clave>`), con su `confirmadoAt`; `fichaDni` = el DNI de la ficha comparado
 * por el llamante (`'igual' | 'distinto' | null` si no tiene). Nunca pisa: lo distinto es discrepancia. PURA.
 */
export function decidirFusion(e: {
  nuevos: Readonly<Record<string, ValorContrato>>
  previos: Readonly<Record<string, unknown>>
  claveBloque: string
  bloque: Readonly<Record<string, unknown>> | null
  fichaDni?: 'igual' | 'distinto' | null
}): DecisionFusion {
  const d: DecisionFusion = { escribir: [], aBloque: [], protegidos: [], iguales: [], discrepancias: [] }
  const confirmado = typeof e.bloque?.confirmadoAt === 'string' && e.bloque.confirmadoAt !== ''
  const rellenables = new Set(camposDeBloqueRellenables(e.claveBloque))
  for (const [clave, nuevo] of Object.entries(e.nuevos)) {
    if (clave === 'dni' && e.fichaDni) {
      (e.fichaDni === 'igual' ? d.iguales : d.discrepancias).push(clave)
      continue
    }
    const enBloque = rellenables.has(clave) ? e.bloque?.[clave] : undefined
    const previo = e.previos[clave] ?? (enBloque === null ? undefined : enBloque)
    if (previo !== undefined && previo !== null) {
      ;(mismoValor(clave, nuevo, previo) ? d.iguales : d.discrepancias).push(clave)
      continue
    }
    d.escribir.push(clave)
    if (rellenables.has(clave)) (confirmado ? d.protegidos : d.aBloque).push(clave)
  }
  return d
}

// ─── Qué falta ────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Claves que el riesgo ya tiene: las del bloque (`info_riesgo.<clave>`) no nulas que el contrato pide, incluidas las
 * que el campo `cubre`. PURA.
 */
export function conocidosDeBloque(ramo: RamoOportunidad | string | null, bloque: Readonly<Record<string, unknown>> | null): string[] {
  if (!bloque) return []
  const out = new Set<string>()
  for (const f of contratoDatos(ramo).campos) {
    for (const k of [f.clave, ...(f.cubre ?? [])]) {
      const v = bloque[k]
      if (v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0 && k !== 'asegurados')) out.add(f.clave)
    }
  }
  return [...out]
}

/** Obligatorios (`siempre`) que se le preguntan al cliente y no se saben todavía. Orden del contrato. PURA. */
export function faltanObligatorios(ramo: RamoOportunidad | string | null, conocidos: ReadonlySet<string>): CampoContrato[] {
  return contratoDatos(ramo).campos.filter((f) => sePideDeEntrada(f) && f.obligatorio === 'siempre' && !conocidos.has(f.clave))
}

/** Etiquetas sin repetir (en el orden en que llegan). */
export function etiquetasUnicas(campos: readonly Pick<CampoContrato, 'etiqueta'>[]): string[] {
  return [...new Set(campos.map((f) => f.etiqueta))]
}

/**
 * Las preguntas de la REPREGUNTA: solo las de un obligatorio que falta o de un dato inválido. Lo opcional o condicional
 * que no contestó no se vuelve a pedir (no se le persigue por lo que no hace falta). PURA.
 */
export function preguntasRepregunta(ramos: readonly (RamoOportunidad | string)[], faltan: ReadonlySet<string>): ReturnType<typeof peticionDatos> {
  const todas = new Set<string>()
  for (const r of ramos.length ? ramos : [null]) for (const f of contratoDatos(r).campos) todas.add(f.clave)
  const conocidos = new Set([...todas].filter((k) => !faltan.has(k)))
  return peticionDatos(ramos, conocidos)
}
