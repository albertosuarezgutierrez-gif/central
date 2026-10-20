// De la ficha del Catastro a lo que un seguro de HOGAR necesita para dar
// precio: m², año de construcción, uso y dónde está. PURO.
//
// ─── Por qué existe (Alberto, 02/09/2026) ───────────────────────────────────
// «En el Catastro, con la referencia catastral te da todos los datos
// importantes para poder tarificar: m², año de construcción… así el cliente
// con solo la dirección nos da para presupuesto.»
//
// Verificado sobre su caso real ese mismo día: CL SAN VICENTE 40, 2º-14,
// Sevilla → Consulta_DNPLOC lista 15 inmuebles del portal → el 2º-14 es la
// referencia `…0015JW` → Consulta_DNPRC devuelve `sfc=76`, `ant=1994`,
// `luso=Residencial`, CP 41002. Es EXACTAMENTE lo que el CRM tenía tecleado a
// mano en `datos_especificos` (`metrosCuadrados: 76`, `anioConstruccion: 1994`).
//
// ─── Misma disciplina que la precalificación de auto ─────────────────────────
// Lo que sale de aquí son TRES cosas, no una: lo que se da por bueno, lo que se
// ha SUPUESTO y lo que falta. Un dato del Catastro es oficial, pero no es lo
// mismo que lo que el cliente declara: la superficie catastral es la
// CONSTRUIDA (con parte proporcional de zonas comunes), no la útil, y las
// compañías preguntan una u otra según su cuestionario.

import { caracterizarVivienda, type DatosCatastro } from './parser.ts'

/** Un anexo del inmueble (aparcamiento, almacén…) con sus m² construidos. */
export type AnexoCatastro = { uso: string; superficie: number }

export type DatosHogar = {
  /** m² CONSTRUIDOS TOTALES del inmueble (vivienda + anexos), como los da el Catastro. Para la vivienda sola, `metrosVivienda`. */
  metrosCuadrados: number | null
  /** m² de la VIVIENDA propiamente dicha (sin aparcamiento, almacén ni comunes). `null`/ausente = el Catastro no publica el desglose. */
  metrosVivienda?: number | null
  /** Desglose de anexos por uso (suma de sus m²). Vacío/ausente = no hay anexos publicados (no es «no tiene»). */
  anexos?: AnexoCatastro[]
  anioConstruccion: number | null
  /** «Residencial», «Comercial», «Industrial»… tal cual lo da el Catastro. */
  uso: string | null
  /** Dirección oficial legible, sin los artículos entre paréntesis del Catastro. */
  direccion: string | null
  localidad: string | null
  provincia: string | null
  codigoPostal: string | null
  /** `true` = piso en propiedad horizontal (tiene cuota de participación). */
  enBloque: boolean | null
}

export type SupuestoHogar = {
  campo: keyof DatosHogar
  porque: string
  /** `true` cuando puede ABARATAR el precio respecto de la realidad. */
  optimista?: boolean
}

export type ReparoHogar = { campo: keyof DatosHogar; motivo: string }

export type PrecalificacionHogar = {
  datos: DatosHogar
  supuestos: SupuestoHogar[]
  /** Lo que ni el Catastro da. Vacío = se puede pedir precio. */
  faltan: ReparoHogar[]
  /** Avisos que NO bloquean pero el corredor tiene que ver antes de cotizar. */
  avisos: string[]
}

/**
 * Lo que pide un cuestionario de hogar y el Catastro puede dar. `uso` no es
 * obligatorio para cotizar pero sí para NO cotizar un local como vivienda.
 */
const OBLIGATORIOS: Array<keyof DatosHogar> = ['metrosCuadrados', 'anioConstruccion', 'codigoPostal']

function limpiaDireccion(ldt: string | null): string | null {
  if (!ldt) return null
  return ldt
    .replace(/\((?:DE|DEL|DE LA|DE LOS|DE LAS|LA|EL|LOS|LAS)\)/gi, ' ')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim() || null
}

/** Anexos por uso con los m² sumados (aparcamiento, almacén…). Excluye vivienda y elementos comunes. PURA. */
export function anexosDeConstrucciones(c: DatosCatastro): AnexoCatastro[] {
  const porUso = new Map<string, number>()
  for (const k of c.construcciones ?? []) {
    const uso = (k.uso ?? '').trim()
    if (uso === '' || /VIVIENDA|COMUN/i.test(uso) || k.superficie === null || k.superficie <= 0) continue
    porUso.set(uso, (porUso.get(uso) ?? 0) + k.superficie)
  }
  return [...porUso].map(([uso, superficie]) => ({ uso, superficie }))
}

export function precalificarHogar(c: DatosCatastro): PrecalificacionHogar {
  const datos: DatosHogar = {
    metrosCuadrados: c.superficie,
    metrosVivienda: caracterizarVivienda(c)?.superficieVivienda ?? null,
    anexos: anexosDeConstrucciones(c),
    anioConstruccion: c.anioConstruccion,
    uso: c.uso,
    direccion: limpiaDireccion(c.direccion),
    localidad: c.municipio,
    provincia: c.provincia,
    codigoPostal: c.codigoPostal,
    enBloque: c.cuotaParticipacion === null ? null : true,
  }
  const supuestos: SupuestoHogar[] = []
  const faltan: ReparoHogar[] = []
  const avisos: string[] = []

  if (datos.metrosCuadrados !== null) {
    supuestos.push({
      campo: 'metrosCuadrados',
      porque:
        'Superficie CONSTRUIDA según Catastro (incluye parte de zonas comunes). Si la compañía pregunta la útil, es menor.',
      // Más metros ⇒ más continente asegurado ⇒ prima más alta: no abarata.
      optimista: false,
    })
  }
  if (datos.uso !== null && !/residencial/i.test(datos.uso)) {
    avisos.push(`El Catastro clasifica este inmueble como «${datos.uso}», no como vivienda: comprobar antes de cotizar hogar.`)
  }
  if (datos.uso === null) {
    avisos.push('El Catastro no informa el uso del inmueble: no se puede confirmar que sea vivienda.')
  }
  for (const campo of OBLIGATORIOS) {
    if (datos[campo] === null) faltan.push({ campo, motivo: `El Catastro no lo publica para esta referencia.` })
  }
  // Una referencia de PARCELA (14) devuelve el edificio, no el piso: superficie
  // y año salen vacíos y la pantalla tiene que pedir el piso concreto.
  if (datos.metrosCuadrados === null && datos.anioConstruccion === null) {
    avisos.push('Sin superficie ni año: probablemente es la referencia del EDIFICIO (14 caracteres). Hace falta la del piso (20).')
  }
  return { datos, supuestos, faltan, avisos }
}
