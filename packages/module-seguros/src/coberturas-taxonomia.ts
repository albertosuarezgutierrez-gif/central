/**
 * Taxonomía de garantías para comparar ofertas de ramos «libres» (comunidades, comercio/pymes, hogar).
 * Tipos y reglas PURAS: sin BD ni IA. La extracción de PDFs escribe en estas claves; si una garantía de la
 * compañía no encaja, `normalizarGarantia` devuelve `null` y la fila va a «extras» (nunca se inventa clave).
 */
import { RAMOS_OPORTUNIDAD } from './oportunidad-seguimiento.ts'
import { CATALOGO_GARANTIAS, clavesCatalogo } from './catalogo-garantias.ts'

/**
 * Ramos comparables. `auto` y `moto` (20/10/2026, comparativa única): sus claves son las del CATÁLOGO de Avant2
 * (`catalogo-garantias.ts`), así una cotización de Avant2, un PDF de compañía y la póliza actual caen en las
 * MISMAS filas. No hay una segunda lista de garantías de vehículo: se DERIVA del catálogo.
 */
export type RamoOferta = 'comunidades' | 'comercio' | 'hogar' | 'auto' | 'moto' | 'generico'
export type GrupoGarantia = 'danos' | 'rc' | 'asistencia' | 'juridica' | 'otros'
export type TipoValorGarantia = 'capital' | 'limite' | 'incluida'

export type GarantiaCanonica = {
  clave: string
  etiqueta: string
  grupo: GrupoGarantia
  tipoValor: TipoValorGarantia
  /** Sinónimos ya normalizados (minúsculas, sin tildes). Se busca por inclusión; gana el más largo. */
  sinonimos: readonly string[]
}

const g = (
  clave: string, etiqueta: string, grupo: GrupoGarantia, tipoValor: TipoValorGarantia, sinonimos: string[],
): GarantiaCanonica => ({ clave, etiqueta, grupo, tipoValor, sinonimos })

const COMUNES: GarantiaCanonica[] = [
  g('incendio', 'Incendio, explosión y rayo', 'danos', 'incluida', ['incendio', 'explosion', 'rayo']),
  g('danos_agua', 'Daños por agua', 'danos', 'limite', ['danos por agua', 'danos agua', 'escape de agua', 'agua']),
  g('fenomenos_atmosfericos', 'Fenómenos atmosféricos', 'danos', 'incluida', ['fenomenos atmosfericos', 'fenomenos meteorologicos', 'lluvia viento pedrisco', 'pedrisco', 'atmosfericos', 'tormenta']),
  g('rotura_cristales', 'Rotura de cristales', 'danos', 'limite', ['rotura de cristales', 'cristales', 'lunas', 'rotura de lunas']),
  g('robo_vandalismo', 'Robo y vandalismo', 'danos', 'limite', ['robo y vandalismo', 'robo', 'expoliacion', 'vandalismo', 'actos vandalicos']),
  g('danos_electricos', 'Daños eléctricos', 'danos', 'limite', ['danos electricos', 'dano electrico', 'sobretension', 'electricos']),
  g('derrumbe', 'Derrumbe', 'danos', 'incluida', ['derrumbe', 'derrumbamiento', 'hundimiento']),
  g('desatascos', 'Desatascos y averías de conducciones', 'asistencia', 'limite', ['desatasco', 'atasco', 'obstruccion de tuberias']),
  g('plagas', 'Plagas (desinsectación/desratización)', 'asistencia', 'incluida', ['plagas', 'desinsectacion', 'desratizacion', 'insectos']),
  g('asistencia', 'Asistencia (urgencias 24 h)', 'asistencia', 'incluida', ['asistencia', 'servicio de urgencia', 'urgencias 24', 'manitas']),
  g('defensa_juridica', 'Defensa jurídica', 'juridica', 'limite', ['defensa juridica', 'defensa legal', 'proteccion juridica', 'reclamacion de danos', 'asesoramiento juridico']),
]

const COMUNIDADES: GarantiaCanonica[] = [
  g('continente', 'Continente (edificio)', 'danos', 'capital', ['continente', 'edificio', 'inmueble', 'capital edificio', 'estructura']),
  g('contenido', 'Contenido / enseres comunes', 'danos', 'capital', ['enseres comunes', 'enseres', 'mobiliario comun', 'contenido', 'mobiliario', 'ajuar comun']),
  ...COMUNES,
  g('rc_general', 'RC general / inmobiliaria', 'rc', 'limite', ['rc general', 'responsabilidad civil general', 'responsabilidad civil inmobiliaria', 'responsabilidad civil comunidad', 'responsabilidad civil', 'rc comunidad', 'rc']),
  g('rc_organos_gobierno', 'RC órganos de gobierno (presidente/administrador)', 'rc', 'limite', ['rc organos de gobierno', 'rc organos gobierno', 'organos de gobierno', 'rc administradores', 'rc administrador', 'responsabilidad civil administradores', 'rc presidente', 'rc junta', 'rc cargos', 'responsabilidad civil de la junta']),
  g('rc_patronal', 'RC patronal (portero/empleados)', 'rc', 'limite', ['rc patronal', 'responsabilidad civil patronal', 'rc empleador']),
  g('mantenimiento_ascensor', 'Ascensor / mantenimiento (avería, rescate)', 'otros', 'incluida', ['ascensor', 'mantenimiento', 'averia de ascensor']),
  g('gastos_alojamiento', 'Gastos de alojamiento / pérdida de alquileres', 'otros', 'limite', ['perdida de alquileres', 'alojamiento provisional', 'gastos de alojamiento', 'alquileres']),
]

const COMERCIO: GarantiaCanonica[] = [
  g('continente', 'Continente (local/instalaciones)', 'danos', 'capital', ['continente', 'edificio', 'local', 'instalaciones fijas', 'reformas']),
  g('contenido', 'Contenido (mobiliario y utillaje)', 'danos', 'capital', ['mobiliario y utillaje', 'utillaje', 'contenido', 'mobiliario', 'enseres']),
  g('mercancias', 'Mercancías / existencias', 'danos', 'capital', ['mercancias', 'existencias', 'stock', 'materias primas']),
  g('equipos_electronicos', 'Equipos electrónicos', 'danos', 'capital', ['equipos electronicos', 'equipo electronico', 'equipos informaticos', 'material electronico', 'electronica']),
  g('averia_maquinaria', 'Avería de maquinaria', 'danos', 'capital', ['averia de maquinaria', 'rotura de maquinaria', 'averia maquinaria', 'maquinaria']),
  g('perdida_beneficios', 'Pérdida de beneficios / paralización', 'otros', 'limite', ['perdida de beneficios', 'paralizacion', 'lucro cesante', 'interrupcion de negocio', 'perdida de explotacion', 'gastos permanentes']),
  ...COMUNES.filter(x => !['derrumbe', 'plagas', 'desatascos'].includes(x.clave)),
  g('dinero_efectivo', 'Dinero en efectivo', 'danos', 'limite', ['dinero en efectivo', 'dinero', 'fondos', 'metalico']),
  g('rc_explotacion', 'RC explotación', 'rc', 'limite', ['rc explotacion', 'responsabilidad civil explotacion', 'responsabilidad civil de explotacion', 'responsabilidad civil general', 'rc general', 'responsabilidad civil']),
  g('rc_patronal', 'RC patronal', 'rc', 'limite', ['rc patronal', 'responsabilidad civil patronal']),
  g('rc_productos', 'RC productos / post-trabajos', 'rc', 'limite', ['rc productos', 'responsabilidad civil productos', 'post trabajos', 'rc post']),
  g('rc_locativa', 'RC locativa', 'rc', 'limite', ['rc locativa', 'responsabilidad civil locativa', 'locativa']),
]

const HOGAR: GarantiaCanonica[] = [
  g('continente', 'Continente (vivienda)', 'danos', 'capital', ['continente', 'edificio', 'vivienda', 'inmueble']),
  g('contenido', 'Contenido (ajuar)', 'danos', 'capital', ['contenido', 'ajuar', 'mobiliario', 'enseres']),
  ...COMUNES.filter(x => !['derrumbe', 'plagas'].includes(x.clave)),
  g('joyas_objetos_valor', 'Joyas y objetos de valor', 'danos', 'limite', ['joyas', 'objetos de valor', 'objetos valiosos']),
  g('rc_general', 'Responsabilidad civil familiar', 'rc', 'limite', ['rc familiar', 'rc general', 'responsabilidad civil familiar', 'responsabilidad civil', 'rc']),
]

const GENERICO: GarantiaCanonica[] = [
  g('danos_materiales', 'Daños materiales', 'danos', 'capital', ['danos materiales', 'capital asegurado', 'continente']),
  g('incendio', 'Incendio, explosión y rayo', 'danos', 'incluida', ['incendio', 'explosion', 'rayo']),
  g('danos_agua', 'Daños por agua', 'danos', 'limite', ['danos por agua', 'agua']),
  g('robo', 'Robo', 'danos', 'limite', ['robo', 'vandalismo']),
  g('rc_general', 'Responsabilidad civil', 'rc', 'limite', ['rc general', 'responsabilidad civil', 'rc']),
  g('defensa_juridica', 'Defensa jurídica', 'juridica', 'limite', ['defensa juridica', 'defensa legal']),
  g('asistencia', 'Asistencia', 'asistencia', 'incluida', ['asistencia']),
]

/** Grupo de una garantía del catálogo de vehículo (solo ordena la lectura del cuadro). */
function grupoVehiculo(clave: string): GrupoGarantia {
  if (clave.startsWith('rc_')) return 'rc'
  if (clave === 'defensa_juridica' || clave === 'defensa_multas' || clave === 'retirada_carnet') return 'juridica'
  if (clave.startsWith('asistencia') || clave === 'vehiculo_sustitucion') return 'asistencia'
  if (clave === 'conductor') return 'otros'
  return 'danos'
}

/** Taxonomía de vehículo DERIVADA del catálogo (sin sinónimos propios: `normalizarGarantia` usa sus patrones). */
function deCatalogo(ramo: 'auto' | 'moto'): GarantiaCanonica[] {
  return CATALOGO_GARANTIAS[ramo].map((x) => g(x.clave, x.etiqueta, grupoVehiculo(x.clave), x.clave.startsWith('rc_') ? 'limite' : 'incluida', []))
}

export const TAXONOMIA_POR_RAMO: Readonly<Record<RamoOferta, readonly GarantiaCanonica[]>> = {
  comunidades: COMUNIDADES,
  comercio: COMERCIO,
  hogar: HOGAR,
  auto: deCatalogo('auto'),
  moto: deCatalogo('moto'),
  generico: GENERICO,
}

/** Ramo de oportunidad (`RAMOS_OPORTUNIDAD`) → ramo comparable. `pymes` (alias comercial) → comercio. */
export function ramoOfertaDe(ramoOportunidad: string | null | undefined): RamoOferta {
  const r = (ramoOportunidad ?? '').trim().toLowerCase()
  if (r === 'comunidades') return 'comunidades'
  if (r === 'comercio' || r === 'empresas' || r === 'pymes' || r === 'pyme') return 'comercio'
  if (r === 'hogar') return 'hogar'
  if (r === 'auto' || r === 'coche') return 'auto'
  if (r === 'moto') return 'moto'
  return 'generico'
}

/** Ramos de oportunidad que cubre la comparación con taxonomía propia (guardián de alineación con el enum). */
export const RAMOS_OPORTUNIDAD_CON_TAXONOMIA = RAMOS_OPORTUNIDAD.filter(r => ['comunidades', 'comercio', 'hogar', 'auto', 'moto'].includes(r))

export function garantiasDelRamo(ramo: RamoOferta): readonly GarantiaCanonica[] {
  return TAXONOMIA_POR_RAMO[ramo]
}

export function garantiaCanonica(ramo: RamoOferta, clave: string): GarantiaCanonica | null {
  return TAXONOMIA_POR_RAMO[ramo].find(x => x.clave === clave) ?? null
}

/** Minúsculas, sin tildes, solo letras/números/espacios. */
export function normalizarTexto(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Texto de la compañía → clave canónica del ramo, o `null` si no se reconoce (va a «extras»).
 * Coincidencia por palabras completas; gana el sinónimo más largo (así «RC administradores» no cae en «rc»).
 */
export function normalizarGarantia(ramo: RamoOferta, textoCompania: string): string | null {
  // Vehículo: los patrones del catálogo de Avant2 (una sola fuente de verdad). Varias claves = ambiguo → extra.
  if (ramo === 'auto' || ramo === 'moto') {
    const ks = clavesCatalogo(ramo, textoCompania)
    return ks.length === 1 ? ks[0]! : null
  }
  const t = ` ${normalizarTexto(textoCompania)} `
  if (t.trim() === '') return null
  let mejor: { clave: string; len: number } | null = null
  for (const gar of TAXONOMIA_POR_RAMO[ramo]) {
    for (const s of gar.sinonimos) {
      if (t.includes(` ${s} `) && (mejor === null || s.length > mejor.len)) mejor = { clave: gar.clave, len: s.length }
    }
  }
  return mejor?.clave ?? null
}

/**
 * Claves de la taxonomía GENÉRICA con su hermana exacta en el catálogo de vehículo. Las ofertas de coche/moto
 * leídas antes del 20/10/2026 se extrajeron con la taxonomía genérica (`rc_general`, `asistencia`…); al LEER se
 * traducen. Lo que no tiene equivalencia exacta (una «RC» genérica no dice si es la obligatoria o la voluntaria;
 * «daños materiales» no es «daños propios») NO se adivina.
 */
const GENERICO_A_VEHICULO: Readonly<Record<string, string>> = {
  incendio: 'incendio',
  robo: 'robo',
  defensa_juridica: 'defensa_juridica',
  asistencia: 'asistencia_viaje',
}

/**
 * Remapeo de LECTURA de unas garantías guardadas al ramo de hoy (PURO). Solo actúa en auto/moto:
 *   · clave del ramo → tal cual;
 *   · clave genérica con hermana exacta → la del catálogo;
 *   · clave genérica SIN equivalencia → fuera del cuadro (queda «no se sabe»: no crea fila propia ni hueco que
 *     penalice a otras ofertas) y se devuelve en `sinEquivalencia` para avisarlo;
 *   · texto literal (extra) → se intenta `normalizarGarantia`; si no casa, sigue como extra.
 * Si dos entradas caen en la misma clave, gana la que afirma `incluida`.
 */
export function remapearGarantiasLectura<V extends { estado: 'incluida' | 'excluida' | null }>(
  ramo: RamoOferta,
  garantias: Record<string, V>,
): { garantias: Record<string, V>; sinEquivalencia: string[] } {
  if (ramo !== 'auto' && ramo !== 'moto') return { garantias, sinEquivalencia: [] }
  const propias = new Set(TAXONOMIA_POR_RAMO[ramo].map((x) => x.clave))
  const genericas = new Set(GENERICO.map((x) => x.clave))
  const out: Record<string, V> = {}
  const sinEquivalencia: string[] = []
  let previo: string | null = null
  for (const [k, v] of Object.entries(garantias)) {
    let destino: string | null
    if (propias.has(k)) destino = k
    else if (genericas.has(k)) destino = GENERICO_A_VEHICULO[k] ?? null
    else destino = normalizarGarantia(ramo, k) ?? k
    if (destino === null) { sinEquivalencia.push(k); continue }
    // Sub-garantía sin nombre canónico («*Indemnización» del PDF de Mapfre): cuelga de la anterior, no crea fila propia.
    if (destino === k && !propias.has(k) && /^\s*[*\-–]/.test(k) && previo !== null) continue
    previo = destino
    const ya = out[destino]
    if (ya && !(v.estado === 'incluida' && ya.estado !== 'incluida')) continue
    out[destino] = v
  }
  return { garantias: out, sinEquivalencia }
}
