// Constructor PURO del riesgo de HOGAR para los bots (movido desde apps/plataforma/lib/tarificador-hogar-formulario.ts el 27/10/2026
// para que apps/asegura («Probar» autónomo) use EXACTAMENTE el mismo constructor que el botón «pedir precio» de la oportunidad;
// plataforma lo re-exporta). Mismo patrón que moto y coche. Sin red ni envs.
// 🚨 TARIFICAR ≠ EMITIR: solo precio. 🚨 Tres estados: `null`/'' = «no consta» o «no contestado»; nunca un valor por defecto.
// 🚨 Datos personales: el DNI/NIE y el nacimiento del tomador NO están aquí; asegura los lee de la ficha al encolar.
import { REGIMENES_VIVIENDA, TIPOS_VIVIENDA, USOS_VIVIENDA, validarFormularioHogarSinTomador, type ObjetosValorHogar, type ProteccionesHogar } from './formulario-hogar.ts'
import { claveHogarDeCatalogo } from './riesgo-oportunidad.ts'

export type CampoDeFichaHogar = 'codigoPostal' | 'fechaNacimiento' | 'fechaCarne'

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
  /**
   * Medidas de seguridad y objetos de valor (21/10/2026), de los MISMOS campos de «Datos de la vivienda» (fuente única:
   * `datosVivienda`, ver `CAMPOS_VIVIENDA_DEL_BOT`). `null` = ninguno consta; dentro, cada campo `null` = no se sabe (nunca «no»).
   */
  protecciones: ProteccionesHogar | null
  objetosValor: ObjetosValorHogar | null
  /** El tomador de la oportunidad es una empresa: el bot de hogar de Allianz solo tarifica personas con DNI/NIE. */
  tomadorEmpresa: boolean
}

/** Las elecciones del corredor: '' / ausente = sin contestar. */
export type EleccionesHogar = { uso?: string | null; regimen?: string | null; tipoVivienda?: string | null; conMadera?: string | null }

export type EntradaBotHogar = DatosViviendaBot & EleccionesHogar

export type FormularioBotHogar =
  | { ok: true; riesgo: Record<string, unknown>; completarDesdeFicha: CampoDeFichaHogar[] }
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
  // Opcionales de tres estados: solo viajan si algo consta (un bloque todo `null` no se manda: «no se sabe» ≠ «no tiene»).
  const prot = e.protecciones && Object.values(e.protecciones).some((x) => x !== null) ? e.protecciones : null
  const valor = e.objetosValor && Object.values(e.objetosValor).some((x) => x !== null) ? e.objetosValor : null
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
      ...(prot !== null ? { protecciones: prot } : {}), ...(valor !== null ? { objetosValor: valor } : {}),
    },
  }
  // Todo lo que viaja pasa por el MISMO validador que asegura (rangos, caracteres, coherencia de años).
  // Se manda el riesgo tal como se armó (más corto: solo lo que consta); asegura lo vuelve a validar y normalizar al encolar.
  const v = validarFormularioHogarSinTomador(riesgo, hoy)
  if (!v.ok) return { ok: false, faltan: v.errores }
  return { ok: true, riesgo, completarDesdeFicha: [] }
}

const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null)
const noNeg = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null)
const algo = <T extends Record<string, unknown>>(o: T): T | null => (Object.values(o).some((x) => x !== null) ? o : null)

/** Lo mínimo del `Riesgo` (`lib/riesgo-asegura.ts`) que hace falta; estructural para no acoplar el helper al tipo entero. */
export type RiesgoParaBotsHogar = {
  datosRiesgo: { clave: string; datos: unknown } | null
  figuras: readonly { rol: string; clienteId: string; empresa: boolean; faltan: string[] | null }[]
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
    protecciones: algo({ puertaBlindada: bool(d?.puertaPrincipalBlindada), ventanasSeguridad: bool(d?.ventanasSeguras), urbanizacionCerrada: bool(d?.urbanizacionCerrada), vigilancia: bool(d?.vigilante) }),
    objetosValor: algo({ joyasCajaFuerteEur: noNeg(d?.joyasEnCajaFuerte), joyasFueraCajaEur: noNeg(d?.joyasFueraDeCaja), objetosValorEur: noNeg(d?.objetosDeValor) }),
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
