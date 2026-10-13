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
//    Y su id tiene que estar en el mapa cerrado `ETIQUETAS_ID_HOGAR` (la IA ve su significado en español).

const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null

const texto = (v: unknown, max = 120): string | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  if (typeof v !== 'string') return null
  const t = v.trim().replace(/\s+/g, ' ')
  return t !== '' && t.length <= max ? t : null
}

const positivo = (v: unknown, max: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= max ? v : null)

/**
 * MAPA CERRADO id de Codeoscopic → su significado en español, para los tres catálogos de Hogar cuyo valor ve la IA
 * (`CLAVES_VALOR_VISIBLE_IA` de `explorador.ts`). La IA casa la opción del portal (en español) con el SIGNIFICADO, no con
 * el id inglés. Solo ids con su etiqueta atestiguada en el repo (DEFECTOS_HOGAR y tests de `apps/asegura/lib/codeoscopic`,
 * `docs/CODEOSCOPIC-API-PORTAL.md` § Hogar): `Owner`/«Propietario», `Tenant`/«Inquilino», `MainResidence`/«Habitual»,
 * `MiddleFloor`/«Piso intermedio». 🚨 Un id que no esté aquí NO se traduce ni se adivina: la oportunidad se rechaza
 * (`noReconocidos` → 409 `oportunidad_incompleta`). Añadir uno = verlo en el catálogo vivo (`GET /home/<catálogo>`).
 */
export const ETIQUETAS_ID_HOGAR = Object.freeze({
  /** `datosVivienda.ocupacion` → catálogo `/home/occupancy-types` = USO de la vivienda. */
  uso: Object.freeze({ MainResidence: 'Vivienda habitual' }) as Readonly<Record<string, string>>,
  /** `datosVivienda.uso` → catálogo `/home/uses` = RÉGIMEN. */
  regimen: Object.freeze({ Owner: 'Propietario', Tenant: 'Inquilino' }) as Readonly<Record<string, string>>,
  /** `datosVivienda.tipoVivienda` → catálogo `/home/property-types`. */
  tipoVivienda: Object.freeze({ MiddleFloor: 'Piso intermedio' }) as Readonly<Record<string, string>>,
})
export type CampoIdHogar = keyof typeof ETIQUETAS_ID_HOGAR

/** El significado en español de un id del mapa cerrado; `null` si no está (nunca se adivina). */
export function etiquetaIdHogar(campo: CampoIdHogar, id: unknown): string | null {
  if (typeof id !== 'string') return null
  const m = ETIQUETAS_ID_HOGAR[campo]
  return Object.hasOwn(m, id) ? m[id] : null
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

/** Ids presentes en `datosVivienda` pero fuera de {@link ETIQUETAS_ID_HOGAR}: no se sabe qué significan. */
export type NoReconocidoRiesgoOportunidad = 'datosVivienda.ocupacion' | 'datosVivienda.uso' | 'datosVivienda.tipoVivienda'

export type ResultadoRiesgoOportunidad =
  | { ok: true; riesgo: { tomador: Record<string, string>; inmueble: Record<string, string | number>; hogar: Record<string, string | number> } }
  | { ok: false; faltan: FaltaRiesgoOportunidad[]; noReconocidos?: NoReconocidoRiesgoOportunidad[] }

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
  const noReconocidos: NoReconocidoRiesgoOportunidad[] = []
  // Id → solo si está en el mapa cerrado. Vacío = falta; presente y desconocido = no reconocido (los dos → 409).
  const idConocido = (campo: CampoIdHogar, bruto: unknown, nombre: NoReconocidoRiesgoOportunidad, obligatorio: boolean): string | null => {
    const t = texto(bruto, 60)
    if (t === null) {
      if (obligatorio) faltan.push(nombre as FaltaRiesgoOportunidad)
      return null
    }
    if (etiquetaIdHogar(campo, t) === null) {
      noReconocidos.push(nombre)
      return null
    }
    return t
  }
  let uso: string | null = null
  let regimen: string | null = null
  let tipoVivienda: string | null = null
  if (!v) faltan.push('datosVivienda')
  else {
    uso = idConocido('uso', v.ocupacion, 'datosVivienda.ocupacion', true)
    regimen = idConocido('regimen', v.uso, 'datosVivienda.uso', true)
    tipoVivienda = idConocido('tipoVivienda', v.tipoVivienda, 'datosVivienda.tipoVivienda', false)
  }
  if (faltan.length || noReconocidos.length) return { ok: false, faltan, ...(noReconocidos.length ? { noReconocidos } : {}) }

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
  if (tipoVivienda) hogar.tipoVivienda = tipoVivienda
  const cc = positivo(v!.capitalContinente, 100_000_000)
  if (cc !== null) hogar.capitalContinente = cc
  const ct = positivo(v!.capitalContenido, 100_000_000)
  if (ct !== null) hogar.capitalContenido = ct

  return { ok: true, riesgo: { tomador, inmueble, hogar } }
}
