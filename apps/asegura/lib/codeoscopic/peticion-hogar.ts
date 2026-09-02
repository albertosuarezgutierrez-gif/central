// Constructor del cuerpo de una cotización de HOGAR para Codeoscopic / Avant2.
// PURO: entran los datos de la ficha (+ Catastro), sale el JSON que viaja.
//
// ─── ✅ CONTRATO VERIFICADO (02/09/2026) ────────────────────────────────────
// El esquema `HomeRisk` de `POST /insurances` sale del snapshot MHTML del
// portal del fabricante (`portal.api-int.codeoscopic.io`, 01/09/2026) y está
// transcrito en `docs/CODEOSCOPIC-API-PORTAL.md` (§ Hogar). Lo que el vendor
// EXIGE (asterisco en el portal) es bastante más que m², año y CP:
//
//   address{postalCode, town.id, roadType.id, roadName, roadNumber}  yearBuilt
//   floorArea  rooms(≥1)  buildingType  use  occupancy  location  materials
//   buildQuality  alarm  securityMainDoor  secondaryDoorsType  securityWindows
//   gatedCommunity  settlementType  jewelsInSafeBoxLimit  jewelsOutSafeBoxLimit
//   highValueItemsLimit  numberOfDangerousDogs  y buildingsLimit o contentsLimit.
//
// Ojo con dos nombres que engañan: `use` es el RÉGIMEN (propietario/inquilino,
// catálogo `/home/uses`, ejemplo del portal `Owner`/«Propietario») y `occupancy`
// es el USO (habitual/segunda residencia, catálogo `/home/occupancy-types`,
// ejemplo `MainResidence`/«Habitual»). Nuestro `uso` va a `use` y nuestra
// `ocupacion` a `occupancy` porque cada uno se alimenta de SU catálogo; las
// etiquetas de la pantalla dicen lo que significan de verdad.
//
// Qué protege el bolsillo: un 400 de VALIDACIÓN del vendor es «no se cobra»
// (`pruebaQueNoHuboCargo` en cliente.ts). Un cuerpo aceptado es una cotización
// de verdad (0,50€) — que es lo que se quiere.
//
// Lo que no se adivina: `insuranceLine.id` viene de `GET /insurance-lines`
// (gratis) y nunca se escribe a mano; los ids de los desplegables vienen de sus
// catálogos; la persona es la MISMA proyección que en auto (`persona.ts`).

import {
  construirPersona,
  revisarPersona,
  texto,
  RE_FECHA,
  type DatosPersona,
} from './persona.ts'

/** Lo que recoge el formulario de hogar. Nombres en castellano: nuestro dominio. */
export type DatosHogar = DatosPersona & {
  // ── Dónde está la vivienda ──
  cp: string
  /** `town.id` del catálogo `/towns?postalCode=`. Un número, nunca el nombre. */
  municipioId: number
  /** id de `/road-types` (p. ej. `Calle`). */
  tipoViaId: string
  nombreVia: string
  numeroVia: string
  planta?: string | null
  puertaVivienda?: string | null
  referenciaCatastral?: string | null

  // ── Cómo es ──
  /** Superficie construida (el vendor la quiere con terrazas, trastero y garaje). */
  metrosCuadrados: number
  anioConstruccion: number
  /** Dormitorios/estancias sin contar salón, cocina ni baños. Mínimo 1. */
  habitaciones: number
  /** Solo si se ha reformado. Algunas compañías lo exigen. */
  anioUltimaReforma?: number | null
  /** id de `/home/property-types` (piso intermedio, unifamiliar…) → `buildingType`. */
  tipoVivienda: string
  /** id de `/home/uses` (propietario, inquilino…) → `use`. */
  uso: string
  /** id de `/home/occupancy-types` (habitual, segunda residencia…) → `occupancy`. */
  ocupacion: string
  /** id de `/home/locations` (núcleo urbano, aislada…) → `location`. */
  ubicacion: string
  /** id de `/home/build-materials` → `materials`. */
  material: string
  /** id de `/home/build-qualities` → `buildQuality`. */
  calidad: string
  /** id de `/home/alarm-types` → `alarm`. */
  alarma: string
  /** id de `/home/door-types` (puertas SECUNDARIAS) → `secondaryDoorsType`. */
  puertasSecundarias: string
  /** id de `/home/settlement-types` (valor de reposición…) → `settlementType`. */
  asentamiento: string
  puertaPrincipalBlindada: boolean
  ventanasSeguras: boolean
  vigilante?: boolean | null
  urbanizacionCerrada: boolean

  // ── Quién ──
  /** Si el tomador es el dueño, viaja también como `risk.owner` (misma persona). */
  propietarioEsTomador: boolean

  // ── Cuánto se asegura (€) ──
  capitalContinente?: number | null
  capitalContenido?: number | null
  /** Los cuatro siguientes son OBLIGATORIOS para el vendor; `null` = 0. */
  joyasEnCajaFuerte?: number | null
  joyasFueraDeCaja?: number | null
  objetosDeValor?: number | null
  perrosPeligrosos?: number | null

  // ── Cotización ──
  fechaEfecto: string
  referenciaExterna?: string | null
}

export type ReparoHogar = { campo: keyof DatosHogar; motivo: string }

/**
 * Nombres del vendor, en un solo sitio. ✅ Verificados contra el esquema
 * `HomeRisk` del portal (02/09/2026). Si el vendor cambia el contrato, se
 * corrige aquí y en ningún otro sitio.
 */
export const CAMPOS_VENDOR = {
  direccion: 'address',
  tipoVia: 'roadType',
  nombreVia: 'roadName',
  numeroVia: 'roadNumber',
  planta: 'floor',
  puertaVivienda: 'door',
  referenciaCatastral: 'cadastralReference',
  anioConstruccion: 'yearBuilt',
  metrosCuadrados: 'floorArea',
  habitaciones: 'rooms',
  anioUltimaReforma: 'lastReformYear',
  tipoVivienda: 'buildingType',
  uso: 'use',
  ocupacion: 'occupancy',
  ubicacion: 'location',
  material: 'materials',
  calidad: 'buildQuality',
  alarma: 'alarm',
  puertasSecundarias: 'secondaryDoorsType',
  asentamiento: 'settlementType',
  puertaPrincipalBlindada: 'securityMainDoor',
  ventanasSeguras: 'securityWindows',
  vigilante: 'securityGuard',
  urbanizacionCerrada: 'gatedCommunity',
  propietario: 'owner',
  continente: 'buildingsLimit',
  contenido: 'contentsLimit',
  joyasEnCajaFuerte: 'jewelsInSafeBoxLimit',
  joyasFueraDeCaja: 'jewelsOutSafeBoxLimit',
  objetosDeValor: 'highValueItemsLimit',
  perrosPeligrosos: 'numberOfDangerousDogs',
} as const

export const ANIO_MINIMO = 1500
/** Tope que pone el portal a los límites de joyas (`Min 0 ┃ Max 100000`). */
export const TOPE_JOYAS = 100000

/** Los nueve desplegables de catálogo sin los que el vendor no acepta el cuerpo. */
export const CATALOGOS_HOGAR_OBLIGATORIOS = [
  'tipoVivienda',
  'uso',
  'ocupacion',
  'ubicacion',
  'material',
  'calidad',
  'alarma',
  'puertasSecundarias',
  'asentamiento',
] as const satisfies readonly (keyof DatosHogar)[]

/**
 * Comprueba los datos ANTES de gastar. Devuelve TODOS los reparos a la vez.
 */
export function revisarDatosHogar(d: Partial<DatosHogar>): ReparoHogar[] {
  const r: ReparoHogar[] = []
  const falta = (c: keyof DatosHogar, m = 'hace falta para poder cotizar') => r.push({ campo: c, motivo: m })

  for (const x of revisarPersona(d)) r.push(x)

  // ── Dónde ──
  if (!texto(d.cp)) falta('cp')
  else if (!/^\d{5}$/.test(String(d.cp).trim())) r.push({ campo: 'cp', motivo: 'el código postal son 5 dígitos' })
  if (!enteroPositivo(d.municipioId))
    falta('municipioId', 'hay que resolver el municipio por código postal antes de cotizar')
  if (!texto(d.tipoViaId)) falta('tipoViaId', 'el tipo de vía (calle, avenida…) es obligatorio para el vendor')
  if (!texto(d.nombreVia)) falta('nombreVia', 'el nombre de la calle es obligatorio para el vendor')
  if (!texto(d.numeroVia)) falta('numeroVia', 'el número de la calle es obligatorio para el vendor')

  // ── Cómo es ──
  if (!numeroPositivo(d.metrosCuadrados)) falta('metrosCuadrados', 'la superficie en m² tiene que ser un número mayor que 0')
  const anioTope = new Date().getUTCFullYear() + 1
  if (!enteroPositivo(d.anioConstruccion)) falta('anioConstruccion')
  else if (d.anioConstruccion! < ANIO_MINIMO || d.anioConstruccion! > anioTope)
    r.push({ campo: 'anioConstruccion', motivo: `el año tiene que estar entre ${ANIO_MINIMO} y ${anioTope}` })
  if (!enteroPositivo(d.habitaciones)) falta('habitaciones', 'el número de habitaciones (mínimo 1, sin salón, cocina ni baños)')
  if (d.anioUltimaReforma !== undefined && d.anioUltimaReforma !== null) {
    if (!enteroPositivo(d.anioUltimaReforma) || d.anioUltimaReforma < ANIO_MINIMO || d.anioUltimaReforma > anioTope)
      r.push({ campo: 'anioUltimaReforma', motivo: `el año de la última reforma tiene que estar entre ${ANIO_MINIMO} y ${anioTope}` })
    else if (enteroPositivo(d.anioConstruccion) && d.anioUltimaReforma < d.anioConstruccion!)
      r.push({ campo: 'anioUltimaReforma', motivo: 'la reforma no puede ser anterior a la construcción' })
  }
  for (const c of CATALOGOS_HOGAR_OBLIGATORIOS) if (!texto(d[c])) falta(c)
  for (const c of ['puertaPrincipalBlindada', 'ventanasSeguras', 'urbanizacionCerrada', 'propietarioEsTomador'] as const) {
    if (typeof d[c] !== 'boolean') falta(c, 'hay que decir sí o no')
  }

  // ── Capitales: al menos uno. Un inquilino asegura solo contenido; un
  // propietario que alquila, solo continente. Cero en los dos no es una póliza.
  const cont = numeroPositivo(d.capitalContinente)
  const contd = numeroPositivo(d.capitalContenido)
  if (!cont && !contd)
    r.push({ campo: 'capitalContinente', motivo: 'hace falta capital de continente o de contenido (en euros, mayor que 0)' })
  if (d.capitalContinente !== undefined && d.capitalContinente !== null && !cont && d.capitalContinente !== 0)
    r.push({ campo: 'capitalContinente', motivo: 'tiene que ser un importe en euros' })
  if (d.capitalContenido !== undefined && d.capitalContenido !== null && !contd && d.capitalContenido !== 0)
    r.push({ campo: 'capitalContenido', motivo: 'tiene que ser un importe en euros' })
  for (const c of ['joyasEnCajaFuerte', 'joyasFueraDeCaja'] as const) {
    const v = d[c]
    if (v !== undefined && v !== null && !(enteroNoNegativo(v) && v <= TOPE_JOYAS))
      r.push({ campo: c, motivo: `tiene que ser un entero entre 0 y ${TOPE_JOYAS}` })
  }
  for (const c of ['objetosDeValor', 'perrosPeligrosos'] as const) {
    const v = d[c]
    if (v !== undefined && v !== null && !enteroNoNegativo(v)) r.push({ campo: c, motivo: 'tiene que ser un entero, 0 o más' })
  }

  if (!texto(d.fechaEfecto)) falta('fechaEfecto')
  else if (!RE_FECHA.test(String(d.fechaEfecto))) r.push({ campo: 'fechaEfecto', motivo: 'la fecha tiene que ser aaaa-mm-dd' })

  return r
}

function numeroPositivo(v: unknown): boolean {
  return typeof v === 'number' && Number.isFinite(v) && v > 0
}
function enteroPositivo(v: unknown): boolean {
  return numeroPositivo(v) && Number.isInteger(v)
}
function enteroNoNegativo(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0
}

/**
 * Construye el cuerpo `CreateInsuranceRequest_V1` de hogar.
 *
 * `lineaId` es el id EXACTO que devolvió `GET /insurance-lines` para hogar
 * (`hogarDisponible().id`). No tiene valor por defecto a propósito: 'Car' va
 * con mayúscula y adivinar la de hogar sería un 400 pagado.
 */
export function construirPeticionHogar(d: DatosHogar, lineaId: string): Record<string, unknown> {
  if (!texto(lineaId)) throw new Error('codeoscopic_linea_hogar_desconocida: falta el id del ramo de hogar de /insurance-lines')
  const reparos = revisarDatosHogar(d)
  if (reparos.length > 0) {
    throw new Error(`codeoscopic_datos_incompletos: ${reparos.map((x) => `${x.campo} (${x.motivo})`).join(' · ')}`)
  }

  const persona = construirPersona(d)
  const V = CAMPOS_VENDOR

  const direccion: Record<string, unknown> = {
    postalCode: d.cp.trim(),
    town: { id: d.municipioId },
    [V.tipoVia]: { id: d.tipoViaId.trim() },
    [V.nombreVia]: d.nombreVia.trim(),
    [V.numeroVia]: d.numeroVia.trim(),
  }
  if (texto(d.planta)) direccion[V.planta] = d.planta!.trim()
  if (texto(d.puertaVivienda)) direccion[V.puertaVivienda] = d.puertaVivienda!.trim()
  if (texto(d.referenciaCatastral)) direccion[V.referenciaCatastral] = d.referenciaCatastral!.trim()

  const riesgo: Record<string, unknown> = {
    [V.direccion]: direccion,
    [V.anioConstruccion]: d.anioConstruccion,
    [V.metrosCuadrados]: Math.round(d.metrosCuadrados),
    [V.habitaciones]: d.habitaciones,
    [V.tipoVivienda]: { id: d.tipoVivienda },
    [V.uso]: { id: d.uso },
    [V.ocupacion]: { id: d.ocupacion },
    [V.ubicacion]: { id: d.ubicacion },
    [V.material]: { id: d.material },
    [V.calidad]: { id: d.calidad },
    [V.alarma]: { id: d.alarma },
    [V.puertaPrincipalBlindada]: d.puertaPrincipalBlindada,
    [V.puertasSecundarias]: { id: d.puertasSecundarias },
    [V.ventanasSeguras]: d.ventanasSeguras,
    [V.urbanizacionCerrada]: d.urbanizacionCerrada,
    [V.asentamiento]: { id: d.asentamiento },
    // Obligatorios para el vendor aunque valgan 0: se mandan siempre.
    [V.joyasEnCajaFuerte]: d.joyasEnCajaFuerte ?? 0,
    [V.joyasFueraDeCaja]: d.joyasFueraDeCaja ?? 0,
    [V.objetosDeValor]: d.objetosDeValor ?? 0,
    [V.perrosPeligrosos]: d.perrosPeligrosos ?? 0,
  }
  if (typeof d.vigilante === 'boolean') riesgo[V.vigilante] = d.vigilante
  if (enteroPositivo(d.anioUltimaReforma)) riesgo[V.anioUltimaReforma] = d.anioUltimaReforma
  // Los capitales solo viajan si son > 0: `null` no es «0 €», es «no se asegura».
  if (numeroPositivo(d.capitalContinente)) riesgo[V.continente] = Math.round(d.capitalContinente!)
  if (numeroPositivo(d.capitalContenido)) riesgo[V.contenido] = Math.round(d.capitalContenido!)
  // El dueño: la misma persona que el tomador cuando lo es. Si es inquilino no
  // se inventa un dueño; el vendor dirá (400, gratis) si lo exige.
  if (d.propietarioEsTomador) riesgo[V.propietario] = persona

  const cuerpo: Record<string, unknown> = {
    insuranceLine: { id: lineaId },
    effectiveDate: d.fechaEfecto,
    holder: persona,
    risk: riesgo,
  }
  if (texto(d.referenciaExterna)) cuerpo.externalId = d.referenciaExterna
  return cuerpo
}
