// De una póliza de HOGAR de la cartera a una precalificación lista para cotizar.
// PURO: entran los datos ya leídos y descifrados, sale qué se va a mandar, qué
// se ha SUPUESTO y qué falta. Misma disciplina que `desde-cartera.ts` (auto).
//
// ─── De dónde salen los datos del riesgo, y por qué hay que decirlo ─────────
// CIMA (la póliza VIVA, `import_ref IS NULL`) no manda el objeto de hogar: ni
// m², ni año, ni CP del riesgo. La copia GEMELA del volcado de junio/2026 (mismo
// `numero_poliza`) sí los trae, tecleados a mano en el CRM. Medido el 02/09/2026
// sobre las dos vivas de Occident de J.S.S.: todo el riesgo está en la gemela.
// Así que el dato que viaja al vendor puede tener tres procedencias —la póliza,
// su gemela o el Catastro— y la pantalla tiene que enseñar cuál, porque un m²
// tecleado hace tres años y un m² oficial de hoy no merecen la misma confianza.
//
// ─── Lo que NO se supone ────────────────────────────────────────────────────
// Nada personal (DNI, nombre, nacimiento, teléfono, sexo) — igual que en auto.
// Y tampoco el CAPITAL: un continente inventado da un precio inventado. Si no
// viene de la póliza, lo teclea el corredor (o lo recomienda el vendor con
// `POST /home/recommend-limits`, que está por cablear).

import { revisarDatosHogar, type DatosHogar, type ReparoHogar } from './peticion-hogar.ts'
import { partirApellidos, sexoDeSaludo, diaSiguiente, type ClienteCartera } from './desde-cartera.ts'

/** El riesgo de hogar tal como lo trae la ficha (póliza o gemela), ya descifrado. */
export type HogarCartera = {
  cp: string | null
  localidad: string | null
  /** Calle y número, descifrados. NO viaja al vendor; se pinta para reconocer la casa. */
  direccion: string | null
  metrosCuadrados: number | null
  anioConstruccion: number | null
  capitalContinente: number | null
  capitalContenido: number | null
  /** De dónde salió: `null` = ni la póliza ni su gemela traen nada. */
  fuente: 'poliza' | 'gemela' | null
}

/** Lo que el Catastro puede aportar (ya consultado, gratis). Opcional. */
export type CatastroHogar = {
  metrosCuadrados: number | null
  anioConstruccion: number | null
  codigoPostal: string | null
  uso: string | null
}

/** Lo que exige red: ids de los catálogos del vendor. `null` = no resuelto. */
export type ResueltosHogar = {
  municipioId: number | null
  estadoCivilId: string | null
  tipoVivienda: string | null
  uso: string | null
  ocupacion: string | null
  /** Cuáles de los tres ids anteriores son un DEFECTO de la pantalla, no una elección. */
  supuestos?: { tipoVivienda?: boolean; uso?: boolean; ocupacion?: boolean }
}

export type SupuestoHogar = {
  campo: keyof DatosHogar
  valor: unknown
  porque: string
  optimista?: boolean
}

export type PrecalificacionHogar = {
  datos: Partial<DatosHogar>
  supuestos: SupuestoHogar[]
  faltan: ReparoHogar[]
  /** Procedencia de m²/año/CP, para rotular la pantalla. */
  fuenteRiesgo: 'poliza' | 'gemela' | 'catastro' | null
}

type PolizaHogarCartera = {
  numeroPoliza: string | null
  fechaVencimiento: string | null
  hogar: HogarCartera | null
}

function limpio(v: string | null | undefined): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t
}

export function precalificarHogarCartera(
  cliente: ClienteCartera,
  poliza: PolizaHogarCartera,
  resueltos: ResueltosHogar,
  hoy: string,
  catastro: CatastroHogar | null = null,
): PrecalificacionHogar {
  const supuestos: SupuestoHogar[] = []
  const suponer = (campo: keyof DatosHogar, valor: unknown, porque: string, optimista = false) => {
    supuestos.push({ campo, valor, porque, optimista })
    return valor
  }
  const { primero, segundo } = partirApellidos(cliente.apellidos)
  const h = poliza.hogar

  // ── Fecha de efecto: el día después del vencimiento, o mañana ──
  const vencimiento = limpio(poliza.fechaVencimiento)
  const fechaEfecto =
    vencimiento && vencimiento >= hoy
      ? (suponer('fechaEfecto', diaSiguiente(vencimiento), `el día siguiente al vencimiento de la póliza actual (${vencimiento})`) as string)
      : (suponer(
          'fechaEfecto',
          diaSiguiente(hoy),
          vencimiento
            ? `la póliza actual venció el ${vencimiento}, así que se pide precio para mañana`
            : 'la póliza actual no tiene fecha de vencimiento en la ficha, así que se pide precio para mañana',
        ) as string)

  // ── El riesgo: póliza/gemela primero, Catastro para los huecos ──
  let fuenteRiesgo: PrecalificacionHogar['fuenteRiesgo'] = h?.fuente ?? null
  const metros = h?.metrosCuadrados ?? null
  const anio = h?.anioConstruccion ?? null
  let metrosFinal = metros
  let anioFinal = anio
  if (metrosFinal === null && catastro?.metrosCuadrados) {
    metrosFinal = suponer(
      'metrosCuadrados',
      catastro.metrosCuadrados,
      'superficie CONSTRUIDA según el Catastro (incluye parte de zonas comunes); si la compañía pregunta la útil, es menor',
    ) as number
    fuenteRiesgo = fuenteRiesgo ?? 'catastro'
  }
  if (anioFinal === null && catastro?.anioConstruccion) {
    anioFinal = suponer('anioConstruccion', catastro.anioConstruccion, 'año de construcción según el Catastro') as number
    fuenteRiesgo = fuenteRiesgo ?? 'catastro'
  }
  if (h?.fuente === 'gemela' && (metros !== null || anio !== null)) {
    supuestos.push({
      campo: 'metrosCuadrados',
      valor: metros,
      porque:
        `los datos del riesgo (m², año, CP) no vienen por CIMA: salen de la copia del volcado de junio/2026 de la misma ` +
        `póliza${poliza.numeroPoliza ? ` (nº ${poliza.numeroPoliza})` : ''}, tecleados a mano en el CRM — comprobar con el Catastro si hay dudas`,
    })
  }

  // ── Dónde está: CP del riesgo; si no, el del Catastro; si no, el del tomador ──
  let cp = limpio(h?.cp) ?? limpio(catastro?.codigoPostal)
  if (cp === null && limpio(cliente.codigoPostal) !== null) {
    cp = suponer('cp', limpio(cliente.codigoPostal), 'la ficha no dice dónde está la vivienda; se supone que es donde vive el tomador') as string
  }

  // ── Capitales: de la póliza o nada. No se inventan ──
  const capitalContinente = h?.capitalContinente ?? null
  const capitalContenido = h?.capitalContenido ?? null
  if (h?.fuente === 'gemela' && (capitalContinente !== null || capitalContenido !== null)) {
    supuestos.push({
      campo: 'capitalContinente',
      valor: capitalContinente,
      porque:
        'los capitales de continente/contenido son los de la copia del volcado de junio/2026, no los de la póliza vigente en CIMA: ' +
        'si la compañía los revalorizó, hoy son mayores',
      // Menos capital ⇒ prima más baja ⇒ el precio real puede subir.
      optimista: true,
    })
  }

  // ── Los tres ids de catálogo: la pantalla puede haberlos puesto por defecto ──
  const s = resueltos.supuestos ?? {}
  if (s.tipoVivienda && limpio(resueltos.tipoVivienda)) {
    suponer('tipoVivienda', resueltos.tipoVivienda, 'la ficha no dice si es piso o casa; se usa el tipo por defecto de la pantalla')
  }
  if (s.uso && limpio(resueltos.uso)) {
    suponer('uso', resueltos.uso, 'la ficha no dice si es vivienda habitual o segunda residencia; se usa el uso por defecto', true)
  }
  if (s.ocupacion && limpio(resueltos.ocupacion)) {
    suponer('ocupacion', resueltos.ocupacion, 'la ficha no dice si el tomador es propietario o inquilino; se usa el valor por defecto')
  }

  const datos: Partial<DatosHogar> = {
    // ── Persona: NUNCA se supone ──
    dni: limpio(cliente.dni) ?? undefined,
    nombre: nombreUtil(cliente.nombre) ?? undefined,
    apellido1: primero ?? undefined,
    apellido2: segundo,
    fechaNacimiento: limpio(cliente.fechaNacimiento) ?? undefined,
    sexo: sexoDeSaludo(cliente.saludo) ?? undefined,
    estadoCivil: limpio(resueltos.estadoCivilId) ?? undefined,
    telefono: limpio(cliente.telefono)?.replace(/\s/g, '') ?? undefined,
    cpResidencia: limpio(cliente.codigoPostal),
    municipioResidenciaId: null,

    // ── Riesgo ──
    cp: cp ?? undefined,
    municipioId: resueltos.municipioId ?? undefined,
    metrosCuadrados: metrosFinal ?? undefined,
    anioConstruccion: anioFinal ?? undefined,
    tipoVivienda: limpio(resueltos.tipoVivienda) ?? undefined,
    uso: limpio(resueltos.uso) ?? undefined,
    ocupacion: limpio(resueltos.ocupacion) ?? undefined,
    capitalContinente,
    capitalContenido,

    fechaEfecto,
  }

  return { datos, supuestos, faltan: revisarDatosHogar(datos), fuenteRiesgo }
}

const NOMBRES_CENTINELA = new Set(['lead', 'cliente', 'sin nombre', 'desconocido', 'n/a', '-'])
function nombreUtil(v: string | null): string | null {
  const t = limpio(v)
  if (t === null) return null
  return NOMBRES_CENTINELA.has(t.toLowerCase()) ? null : t
}

/**
 * Lee el riesgo de hogar de un `datos_especificos` (póliza o gemela). Los
 * números del volcado vienen como TEXTO («76», «61000»): se convierten, y lo
 * que no es número queda a `null` — nunca a 0.
 */
export function hogarDeDatos(
  datos: Record<string, unknown> | null,
  fuente: 'poliza' | 'gemela',
  direccionDescifrada: string | null = null,
): HogarCartera | null {
  if (!datos) return null
  const h: HogarCartera = {
    cp: cpDe(datos.cp),
    localidad: limpio(typeof datos.localidad === 'string' ? datos.localidad : null),
    direccion: direccionDescifrada,
    metrosCuadrados: num(datos.metrosCuadrados),
    anioConstruccion: entero(datos.anioConstruccion),
    capitalContinente: num(datos.continente),
    capitalContenido: num(datos.contenido),
    fuente,
  }
  const hayAlgo = Object.entries(h).some(([k, v]) => k !== 'fuente' && v !== null)
  return hayAlgo ? h : null
}

/** El riesgo que se usa: el de la póliza si trae algo; si no, el de la gemela. */
export function elegirRiesgo(propio: HogarCartera | null, gemela: HogarCartera | null): HogarCartera | null {
  const completo = (x: HogarCartera | null) => x !== null && x.metrosCuadrados !== null && x.anioConstruccion !== null && x.cp !== null
  if (completo(propio)) return propio
  if (completo(gemela)) return gemela
  return propio ?? gemela
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.trim().replace(',', '.')) : v
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
}
function entero(v: unknown): number | null {
  const n = num(v)
  return n !== null && Number.isInteger(n) ? n : null
}
function cpDe(v: unknown): string | null {
  const t = limpio(typeof v === 'string' ? v : null)
  return t !== null && /^\d{5}$/.test(t) ? t : null
}
