// «Bots (gratis)» de HOGAR (19/10/2026) — lo PURO: de los datos de la vivienda de la oportunidad (`info_riesgo.datosVivienda`) y de
// las elecciones del corredor al `riesgo` de hogar que valida asegura (`ramo: 'hogar'`, sin tomador). Mismo patrón que moto y coche
// (`tarificador-moto-formulario.ts`, `tarificador-auto-formulario.ts`): sin red ni envs, importable desde 'use client' y desde tests.
//
// 🚨 TARIFICAR ≠ EMITIR: solo precio. 🚨 Tres estados: `null`/'' = «no consta» o «no contestado»; nunca un valor por defecto.
// USO, RÉGIMEN, TIPO de vivienda y MADERA deciden la tarifa de Allianz: los elige una persona EXPLÍCITAMENTE. Se precargan solo
// si el dato guardado casa EXACTAMENTE con una opción (`claveHogarDeCatalogo`); si no, "Elegir…" y el botón no encola.
// 🚨 Datos personales: el DNI/NIE y el nacimiento del tomador NO están aquí ni viajan desde plataforma; asegura los lee de la ficha
// al encolar y los inyecta al entregar el trabajo. Los avisos dicen QUÉ falta, jamás el valor.
import {
  REGIMENES_VIVIENDA, TIPOS_VIVIENDA, USOS_VIVIENDA, claveHogarDeCatalogo, validarFormularioHogarSinTomador,
} from '@central/module-tarificacion'
import type { CampoDeFicha } from './tarificador-moto-formulario.ts'

/** Opciones del bloque (etiqueta para la persona, clave cerrada para el bot). La primera, vacía, es «sin elegir». */
const ELEGIR = { valor: '', etiqueta: 'Elegir…' } as const
export const OPCIONES_USO_HOGAR: readonly { valor: string; etiqueta: string }[] = [
  ELEGIR, { valor: 'habitual', etiqueta: 'Vivienda habitual' }, { valor: 'secundaria', etiqueta: 'Segunda residencia' },
  { valor: 'alquiler', etiqueta: 'Alquiler' }, { valor: 'turistico', etiqueta: 'Turístico o vacacional' },
]
export const OPCIONES_REGIMEN_HOGAR: readonly { valor: string; etiqueta: string }[] = [
  ELEGIR, { valor: 'propietario', etiqueta: 'Propietario' }, { valor: 'inquilino', etiqueta: 'Inquilino' },
]
export const OPCIONES_TIPO_HOGAR: readonly { valor: string; etiqueta: string }[] = [
  ELEGIR, { valor: 'piso', etiqueta: 'Piso' }, { valor: 'planta_baja', etiqueta: 'Planta baja (o piso con ventanas a menos de 3 m del suelo)' },
  { valor: 'atico', etiqueta: 'Ático' }, { valor: 'adosada', etiqueta: 'Vivienda adosada' }, { valor: 'independiente', etiqueta: 'Vivienda independiente' },
]
export const OPCIONES_MADERA_HOGAR: readonly { valor: string; etiqueta: string }[] = [
  ELEGIR, { valor: 'no', etiqueta: 'Sin madera' }, { valor: 'si', etiqueta: 'Con madera' },
]

/** Lo que el bloque sabe de la vivienda, sin las elecciones (esas se eligen en el propio bloque). `null` = no consta. */
export type DatosViviendaBot = {
  codigoPostal: string | null
  municipio: string | null
  nombreVia: string | null
  numero: string | null
  planta: string | null
  puerta: string | null
  anioConstruccion: number | null
  anioReforma: number | null
  superficieM2: number | null
  referenciaCatastral: string | null
  capitalContinenteEur: number | null
  capitalContenidoEur: number | null
  /** El tomador de la oportunidad es una empresa: el bot de hogar de Allianz solo tarifica personas con DNI/NIE. */
  tomadorEmpresa: boolean
}

/** Las elecciones del corredor: '' / ausente = sin contestar. */
export type EleccionesHogar = { uso?: string | null; regimen?: string | null; tipoVivienda?: string | null; conMadera?: string | null }

export type EntradaBotHogar = DatosViviendaBot & EleccionesHogar

export type FormularioBotHogar =
  | { ok: true; riesgo: Record<string, unknown>; completarDesdeFicha: CampoDeFicha[] }
  | { ok: false; faltan: string[] }

const txt = (v: string | null | undefined): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim().replace(/\s+/g, ' ') : null)
const clave = (v: string | null | undefined, lista: readonly string[]): string | null => {
  const k = txt(v)
  return k !== null && lista.includes(k) ? k : null
}

/**
 * Vivienda + elecciones → `riesgo` de hogar, o QUÉ falta (en castellano, sin valores). El tomador NO va: lo pone asegura desde la
 * ficha. Lo que arma pasa por el MISMO validador que asegura (`validarFormularioHogarSinTomador`); sus errores nombran campos.
 */
export function formularioBotHogar(e: EntradaBotHogar, hoy: Date = new Date()): FormularioBotHogar {
  const faltan: string[] = []
  if (e.tomadorEmpresa) faltan.push('El tomador es una empresa: el bot de hogar de Allianz solo tarifica a una persona con DNI/NIE')

  const cp = txt(e.codigoPostal)
  if (cp === null || !/^\d{5}$/.test(cp)) faltan.push('Código postal de la vivienda (5 cifras)')
  const nombreVia = txt(e.nombreVia)
  if (nombreVia === null) faltan.push('Calle de la vivienda (solo el nombre, sin el tipo de vía)')
  const numero = txt(e.numero)
  if (numero === null) faltan.push('Número de la calle')
  const anio = e.anioConstruccion
  if (typeof anio !== 'number' || !Number.isInteger(anio)) faltan.push('Año de construcción (el bot no avanza sin él; el Catastro lo trae)')
  const m2 = e.superficieM2
  if (typeof m2 !== 'number' || !Number.isFinite(m2) || m2 <= 0) faltan.push('Superficie construida (m²) (el bot no avanza sin ella; el Catastro la trae)')
  else if (!Number.isInteger(m2)) faltan.push('Superficie (m²): el bot pide un número entero; corrígela en los datos de la vivienda')

  const uso = clave(e.uso, USOS_VIVIENDA)
  if (uso === null) faltan.push('Uso de la vivienda (elígelo: decide la tarifa; el Catastro no lo sabe)')
  const regimen = clave(e.regimen, REGIMENES_VIVIENDA)
  if (regimen === null) faltan.push('Régimen: propietario o inquilino (elígelo: decide la tarifa)')
  const tipo = clave(e.tipoVivienda, TIPOS_VIVIENDA)
  if (tipo === null) faltan.push('Tipo de vivienda (elígelo)')
  const madera = txt(e.conMadera)
  const conMadera = madera === 'si' ? true : madera === 'no' ? false : null
  if (conMadera === null) faltan.push('Si la construcción lleva madera (pregunta explícita: sin respuesta no se asume «sin madera»)')

  if (faltan.length) return { ok: false, faltan }

  const municipio = txt(e.municipio)
  const planta = txt(e.planta)
  const puerta = txt(e.puerta)
  const reforma = typeof e.anioReforma === 'number' && Number.isInteger(e.anioReforma) ? e.anioReforma : null
  const rc = txt(e.referenciaCatastral)?.replace(/[\s-]/g, '').toUpperCase() ?? null
  const cont = typeof e.capitalContinenteEur === 'number' && e.capitalContinenteEur > 0 ? e.capitalContinenteEur : null
  const cnt = typeof e.capitalContenidoEur === 'number' && e.capitalContenidoEur > 0 ? e.capitalContenidoEur : null
  const riesgo: Record<string, unknown> = {
    ramo: 'hogar',
    inmueble: {
      codigoPostal: cp, ...(municipio !== null ? { municipio } : {}), nombreVia, numero,
      ...(planta !== null ? { planta } : {}), ...(puerta !== null ? { puerta } : {}),
      anioConstruccion: anio, ...(reforma !== null ? { anioReforma: reforma } : {}), superficieM2: m2,
      ...(rc !== null ? { referenciaCatastral: rc } : {}),
    },
    hogar: {
      uso, regimen, tipoVivienda: tipo, conMadera,
      ...(cont !== null ? { capitalContinenteEur: cont } : {}), ...(cnt !== null ? { capitalContenidoEur: cnt } : {}),
    },
  }
  // Todo lo que viaja pasa por el MISMO validador que asegura (rangos, caracteres, coherencia de años).
  // Se manda el riesgo tal como se armó (más corto: solo lo que consta); asegura lo vuelve a validar y normalizar al encolar.
  const v = validarFormularioHogarSinTomador(riesgo, hoy)
  if (!v.ok) return { ok: false, faltan: v.errores }
  return { ok: true, riesgo, completarDesdeFicha: [] }
}

// ─── Del riesgo de la oportunidad al bloque ──────────────────────────────────────────────────────────────────────────

const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/** Lo mínimo del `Riesgo` (`lib/riesgo-asegura.ts`) que hace falta; estructural para no acoplar el helper al tipo entero. */
export type RiesgoParaBotsHogar = {
  datosRiesgo: { clave: string; datos: unknown } | null
  figuras: readonly { rol: string; clienteId: string; empresa: boolean; faltan: string[] | null }[]
}

/** Id de la ficha del tomador (la figura `tomador`; sin ella, el cliente de la oportunidad). */
export function tomadorDeRiesgoHogar(r: RiesgoParaBotsHogar & { oportunidad: { clienteId: string } }): string {
  return r.figuras.find((f) => f.rol === 'tomador')?.clienteId ?? r.oportunidad.clienteId
}

/** `datosVivienda` de la oportunidad (ya leídos) → vivienda del bloque. Sin el bloque de vivienda → todo `null` («no se sabe»). PURA. */
export function datosViviendaParaBot(r: RiesgoParaBotsHogar): DatosViviendaBot {
  const b = r.datosRiesgo
  const d = b && b.clave === 'datosVivienda' ? obj(b.datos) : null
  const tomador = r.figuras.find((f) => f.rol === 'tomador') ?? null
  return {
    codigoPostal: str(d?.cp), municipio: str(d?.municipio), nombreVia: str(d?.nombreVia), numero: str(d?.numeroVia),
    planta: str(d?.planta), puerta: str(d?.puertaVivienda),
    anioConstruccion: num(d?.anioConstruccion), anioReforma: num(d?.anioUltimaReforma), superficieM2: num(d?.metrosCuadrados),
    referenciaCatastral: str(d?.referenciaCatastral),
    capitalContinenteEur: num(d?.capitalContinente), capitalContenidoEur: num(d?.capitalContenido),
    tomadorEmpresa: tomador?.empresa === true,
  }
}

/** Catálogos de Codeoscopic ya leídos (id → nombre). `undefined` = no se pudo leer: solo valen los ids atestiguados. */
export type CatalogosHogarLeidos = {
  tipoVivienda?: readonly { id: string; nombre: string }[]
  ocupacion?: readonly { id: string; nombre: string }[]
  uso?: readonly { id: string; nombre: string }[]
}

/**
 * Elecciones iniciales del bloque desde los datos guardados: SOLO lo que casa EXACTAMENTE (id atestiguado o nombre del catálogo);
 * el resto, '' («Elegir…»). La madera: sí/no solo si se contestó (`null` = '' = sin contestar). Ojo: en Codeoscopic `ocupacion` es
 * el USO de la vivienda y `uso` el RÉGIMEN. PURA.
 */
export function eleccionesInicialesHogar(r: RiesgoParaBotsHogar, catalogos: CatalogosHogarLeidos = {}): Record<string, string> {
  const b = r.datosRiesgo
  const d = b && b.clave === 'datosVivienda' ? obj(b.datos) : null
  const nombre = (lista: CatalogosHogarLeidos[keyof CatalogosHogarLeidos], id: unknown): string | undefined =>
    typeof id === 'string' ? lista?.find((o) => o.id === id)?.nombre : undefined
  return {
    uso: claveHogarDeCatalogo('uso', d?.ocupacion, nombre(catalogos.ocupacion, d?.ocupacion)) ?? '',
    regimen: claveHogarDeCatalogo('regimen', d?.uso, nombre(catalogos.uso, d?.uso)) ?? '',
    tipoVivienda: claveHogarDeCatalogo('tipoVivienda', d?.tipoVivienda, nombre(catalogos.tipoVivienda, d?.tipoVivienda)) ?? '',
    conMadera: d?.conMadera === true ? 'si' : d?.conMadera === false ? 'no' : '',
  }
}

/**
 * Lo que a la FICHA del tomador le falta para que asegura pueda entregar al bot su DNI/NIE y su nacimiento (lo comprueba al encolar:
 * 422 `falta_datos_tomador`, sin gastar máquina). `null` = no se pudo leer la ficha (no se afirma que falte). PURA.
 */
export function faltanFichaTomadorParaHogar(r: Pick<RiesgoParaBotsHogar, 'figuras'>): string[] | null {
  const t = r.figuras.find((f) => f.rol === 'tomador') ?? null
  if (!t || t.faltan == null) return null
  if (t.empresa) return ['una persona física con DNI/NIE (el hogar de Allianz no admite empresas)']
  const k = new Set(t.faltan)
  const out: string[] = []
  if (k.has('dni')) out.push('el DNI/NIE')
  if (k.has('fechaNacimiento') || k.has('fechaNacimiento_invalida')) out.push('la fecha de nacimiento')
  return out
}

/** «Falta el DNI/NIE y la fecha de nacimiento en la ficha del tomador…» o `null` si no falta nada (o no se sabe). PURA. */
export function avisoFichaTomadorParaHogar(faltan: readonly string[] | null): string | null {
  if (!faltan || faltan.length === 0) return null
  const lista = faltan.length === 1 ? faltan[0] : `${faltan.slice(0, -1).join(', ')} y ${faltan[faltan.length - 1]}`
  return `Falta ${lista} en la ficha del tomador: Allianz Hogar los pide en su primera pantalla y los toma de la ficha. Complétalo en la ficha.`
}
