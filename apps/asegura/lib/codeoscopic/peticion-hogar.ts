// Constructor del cuerpo de una cotización de HOGAR para Codeoscopic / Avant2.
// PURO: entran los datos de la ficha (+ Catastro), sale el JSON que viaja.
//
// ─── 🚨 EL CONTRATO DEL `risk` DE HOGAR NO ESTÁ VERIFICADO (02/09/2026) ─────
// El portal del fabricante (`docs/CODEOSCOPIC-API-PORTAL.md`) documenta los
// ONCE catálogos de hogar (`/home/property-types`, `/home/uses`,
// `/home/occupancy-types`, `/home/build-materials`, `/home/build-qualities`,
// `/home/door-types`, `/home/alarm-types`, `/home/locations`,
// `/home/settlement-types`, `/home/person-roles`, `POST /home/recommend-limits`)
// pero el detalle de `POST /insurances` para hogar NO se exportó. Los nombres
// de campo de `CAMPOS_VENDOR` salen por ANALOGÍA con el cuerpo de auto (que sí
// está verificado) y con el nombre de cada catálogo. Por eso viven en UNA tabla:
// cuando Alberto pegue el ejemplo del portal, se corrige aquí y en ningún otro
// sitio.
//
// Qué protege el bolsillo mientras tanto: un 400 de VALIDACIÓN del vendor es
// «no se cobra» (`pruebaQueNoHuboCargo` en cliente.ts) y su mensaje dice qué
// campo sobra o falta. Un cuerpo que el vendor ACEPTA es una cotización de
// verdad (0,50€) — que es lo que se quiere.
//
// Lo que SÍ es firme y no se adivina: `insuranceLine.id` viene de
// `GET /insurance-lines` (gratis) y nunca se escribe a mano; los ids de los
// desplegables vienen de sus catálogos; la persona es la MISMA proyección que
// en auto (`persona.ts`), porque el vendor cruza por DNI.

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

  // ── Cómo es ──
  metrosCuadrados: number
  anioConstruccion: number
  /** id de `/home/property-types` (piso, unifamiliar…). */
  tipoVivienda: string
  /** id de `/home/uses` (habitual, secundaria…). */
  uso: string
  /** id de `/home/occupancy-types` (propietario, inquilino…). */
  ocupacion: string
  /** Opcionales: solo viajan si el corredor los elige. Ids de sus catálogos. */
  ubicacion?: string | null // /home/locations
  asentamiento?: string | null // /home/settlement-types
  material?: string | null // /home/build-materials
  calidad?: string | null // /home/build-qualities
  puerta?: string | null // /home/door-types
  alarma?: string | null // /home/alarm-types

  // ── Cuánto se asegura (€) ──
  capitalContinente?: number | null
  capitalContenido?: number | null

  // ── Cotización ──
  fechaEfecto: string
  referenciaExterna?: string | null
}

export type ReparoHogar = { campo: keyof DatosHogar; motivo: string }

/**
 * Nombres del vendor, en un solo sitio. 🚨 PROVISIONALES salvo los marcados
 * `verificado` (que coinciden con auto). Ver cabecera.
 */
export const CAMPOS_VENDOR = {
  direccion: 'address', // verificado en persona.addresses (postalCode + town.id)
  tipoVivienda: 'propertyType',
  uso: 'use',
  ocupacion: 'occupancyType',
  ubicacion: 'location',
  asentamiento: 'settlementType',
  material: 'buildMaterial',
  calidad: 'buildQuality',
  puerta: 'doorType',
  alarma: 'alarmType',
  anioConstruccion: 'constructionYear',
  metrosCuadrados: 'surface',
  capitales: 'limits',
  continente: 'building',
  contenido: 'contents',
} as const

export const ANIO_MINIMO = 1500

/**
 * Comprueba los datos ANTES de gastar. Devuelve TODOS los reparos a la vez.
 */
export function revisarDatosHogar(d: Partial<DatosHogar>): ReparoHogar[] {
  const r: ReparoHogar[] = []
  const falta = (c: keyof DatosHogar, m = 'hace falta para poder cotizar') => r.push({ campo: c, motivo: m })

  for (const x of revisarPersona(d)) r.push(x)

  if (!texto(d.cp)) falta('cp')
  else if (!/^\d{5}$/.test(String(d.cp).trim())) r.push({ campo: 'cp', motivo: 'el código postal son 5 dígitos' })
  if (!enteroPositivo(d.municipioId))
    falta('municipioId', 'hay que resolver el municipio por código postal antes de cotizar')

  if (!numeroPositivo(d.metrosCuadrados)) falta('metrosCuadrados', 'la superficie en m² tiene que ser un número mayor que 0')
  const anioTope = new Date().getUTCFullYear() + 1
  if (!enteroPositivo(d.anioConstruccion)) falta('anioConstruccion')
  else if (d.anioConstruccion! < ANIO_MINIMO || d.anioConstruccion! > anioTope)
    r.push({ campo: 'anioConstruccion', motivo: `el año tiene que estar entre ${ANIO_MINIMO} y ${anioTope}` })

  for (const c of ['tipoVivienda', 'uso', 'ocupacion'] as const) if (!texto(d[c])) falta(c)

  // Capitales: al menos uno. Un inquilino asegura solo contenido; un
  // propietario que alquila, solo continente. Cero en los dos no es una póliza.
  const cont = numeroPositivo(d.capitalContinente)
  const contd = numeroPositivo(d.capitalContenido)
  if (!cont && !contd)
    r.push({ campo: 'capitalContinente', motivo: 'hace falta capital de continente o de contenido (en euros, mayor que 0)' })
  if (d.capitalContinente !== undefined && d.capitalContinente !== null && !cont && d.capitalContinente !== 0)
    r.push({ campo: 'capitalContinente', motivo: 'tiene que ser un importe en euros' })
  if (d.capitalContenido !== undefined && d.capitalContenido !== null && !contd && d.capitalContenido !== 0)
    r.push({ campo: 'capitalContenido', motivo: 'tiene que ser un importe en euros' })

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

  const riesgo: Record<string, unknown> = {
    [V.direccion]: { postalCode: d.cp.trim(), town: { id: d.municipioId } },
    [V.tipoVivienda]: { id: d.tipoVivienda },
    [V.uso]: { id: d.uso },
    [V.ocupacion]: { id: d.ocupacion },
    [V.anioConstruccion]: d.anioConstruccion,
    [V.metrosCuadrados]: d.metrosCuadrados,
  }
  const opcionales: Array<[keyof typeof V, string | null | undefined]> = [
    ['ubicacion', d.ubicacion],
    ['asentamiento', d.asentamiento],
    ['material', d.material],
    ['calidad', d.calidad],
    ['puerta', d.puerta],
    ['alarma', d.alarma],
  ]
  for (const [k, v] of opcionales) if (texto(v)) riesgo[V[k]] = { id: v }

  const capitales: Record<string, number> = {}
  if (numeroPositivo(d.capitalContinente)) capitales[V.continente] = d.capitalContinente!
  if (numeroPositivo(d.capitalContenido)) capitales[V.contenido] = d.capitalContenido!
  riesgo[V.capitales] = capitales

  const cuerpo: Record<string, unknown> = {
    insuranceLine: { id: lineaId },
    effectiveDate: d.fechaEfecto,
    holder: persona,
    risk: riesgo,
  }
  if (texto(d.referenciaExterna)) cuerpo.externalId = d.referenciaExterna
  return cuerpo
}
