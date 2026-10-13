// Riesgo de una EXPLORACIÓN con datos reales anclada a una OPORTUNIDAD de Hogar (vía «c», 13/10/2026). PURO.
//
// De la ficha del cliente (ya descifrada por quien llama) + `oportunidades.info_riesgo.datosVivienda` (nombres de
// `@central/module-seguros` → datos-vivienda-riesgo.ts) a la forma que lee el worker por `rutaRiesgo` del catálogo
// (`explorador.ts`): `{ tomador, inmueble, hogar }`.
//
// 🚨 Nada se inventa: lo que la oportunidad no trae se OMITE (año de construcción y m² los autocompleta el portal desde el
//    Catastro al meter la dirección). 🚨 USO de la vivienda y RÉGIMEN deciden la tarifa: tienen que venir EXPLÍCITOS en
//    `datosVivienda` (`ocupacion` = uso habitual/secundaria/alquiler…, `uso` = régimen propietario/inquilino, ids del
//    catálogo de Codeoscopic). Sin ellos no hay riesgo: la exploración no se encola. Nunca un valor por defecto.

const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null

const texto = (v: unknown, max = 120): string | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  if (typeof v !== 'string') return null
  const t = v.trim().replace(/\s+/g, ' ')
  return t !== '' && t.length <= max ? t : null
}

const positivo = (v: unknown, max: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= max ? v : null)

/** Id de catálogo (`MainResidence`, `Owner`…): una palabra corta. Lo que no lo parece cuenta como ausente. */
const RE_ID_CATALOGO = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 _-]{0,40}$/
const idCatalogo = (v: unknown): string | null => {
  const t = texto(v, 41)
  return t !== null && RE_ID_CATALOGO.test(t) ? t : null
}

/** Tipo de vía solo si ya es una palabra («Calle», «Avenida»): un código numérico de catálogo no lo es. */
const RE_TIPO_VIA = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ. ]{2,30}$/

/** dd/mm/aaaa desde ISO (`aaaa-mm-dd…`) o desde dd/mm/aaaa. Otra forma → `null` (se omite, no se adivina). */
export function fechaDdMmAaaa(v: unknown): string | null {
  const t = texto(v, 40)
  if (!t) return null
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(t)
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`
  return /^\d{2}\/\d{2}\/\d{4}$/.test(t) ? t : null
}

export type FichaTomadorExploracion = {
  nif?: string | null
  nombre?: string | null
  apellido1?: string | null
  apellido2?: string | null
  /** ISO o dd/mm/aaaa. */
  fechaNacimiento?: string | null
}

/** Lo que falta para poder explorar con datos reales (nombres de campo, nunca valores). */
export type FaltaRiesgoOportunidad =
  | 'tomador.nif' | 'tomador.nombre' | 'tomador.apellido1' | 'datosVivienda' | 'datosVivienda.ocupacion' | 'datosVivienda.uso'

export type ResultadoRiesgoOportunidad =
  | { ok: true; riesgo: { tomador: Record<string, string>; inmueble: Record<string, string | number>; hogar: Record<string, string | number> } }
  | { ok: false; faltan: FaltaRiesgoOportunidad[] }

/**
 * Ficha + `datosVivienda` → `{ tomador, inmueble, hogar }`. Obligatorios: NIF, nombre y primer apellido del tomador, el
 * bloque `datosVivienda`, su USO (`ocupacion`) y su RÉGIMEN (`uso`). Todo lo demás, solo si viene (si no, la clave no
 * está y el worker no rellena nada en su lugar).
 */
export function riesgoExploracionDeOportunidad(ficha: FichaTomadorExploracion | null | undefined, datosVivienda: unknown): ResultadoRiesgoOportunidad {
  const f = ficha ?? {}
  const faltan: FaltaRiesgoOportunidad[] = []
  const nif = texto(f.nif, 20)?.toUpperCase().replace(/[\s-]/g, '') ?? null
  const nombre = texto(f.nombre)
  const apellido1 = texto(f.apellido1)
  const apellido2 = texto(f.apellido2)
  if (!nif) faltan.push('tomador.nif')
  if (!nombre) faltan.push('tomador.nombre')
  if (!apellido1) faltan.push('tomador.apellido1')
  const v = obj(datosVivienda)
  const uso = idCatalogo(v?.ocupacion)
  const regimen = idCatalogo(v?.uso)
  if (!v) faltan.push('datosVivienda')
  else {
    if (!uso) faltan.push('datosVivienda.ocupacion')
    if (!regimen) faltan.push('datosVivienda.uso')
  }
  if (faltan.length) return { ok: false, faltan }

  const tomador: Record<string, string> = { nif: nif!, nombre: nombre!, apellido1: apellido1! }
  if (apellido2) tomador.apellido2 = apellido2
  tomador.nombreCompleto = [nombre, apellido1, apellido2].filter(Boolean).join(' ')
  const nac = fechaDdMmAaaa(f.fechaNacimiento)
  if (nac) tomador.fechaNacimiento = nac

  const inmueble: Record<string, string | number> = {}
  const pon = (k: string, x: string | number | null) => { if (x !== null) inmueble[k] = x }
  const tipoVia = texto(v!.tipoViaId, 30)
  pon('tipoVia', tipoVia !== null && RE_TIPO_VIA.test(tipoVia) ? tipoVia : null)
  pon('nombreVia', texto(v!.nombreVia, 80))
  pon('numero', texto(v!.numeroVia, 10))
  const cp = texto(v!.cp, 5)
  pon('codigoPostal', cp !== null && /^\d{5}$/.test(cp) ? cp : null)
  pon('municipio', texto(v!.municipio, 80))
  pon('provincia', texto(v!.provincia, 60))
  pon('planta', texto(v!.planta, 10))
  pon('superficieM2', positivo(v!.metrosCuadrados, 100_000))
  const anio = v!.anioConstruccion
  pon('anioConstruccion', typeof anio === 'number' && Number.isInteger(anio) && anio >= 1500 && anio <= 2100 ? anio : null)

  const hogar: Record<string, string | number> = { uso: uso!, regimen: regimen! }
  const tipoVivienda = idCatalogo(v!.tipoVivienda)
  if (tipoVivienda) hogar.tipoVivienda = tipoVivienda
  const cc = positivo(v!.capitalContinente, 100_000_000)
  if (cc !== null) hogar.capitalContinente = cc
  const ct = positivo(v!.capitalContenido, 100_000_000)
  if (ct !== null) hogar.capitalContenido = ct

  return { ok: true, riesgo: { tomador, inmueble, hogar } }
}
