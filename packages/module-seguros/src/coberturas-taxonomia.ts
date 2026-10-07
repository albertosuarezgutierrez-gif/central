/**
 * Taxonomía de garantías para comparar ofertas de ramos «libres» (comunidades, comercio/pymes, hogar).
 * Tipos y reglas PURAS: sin BD ni IA. La extracción de PDFs escribe en estas claves; si una garantía de la
 * compañía no encaja, `normalizarGarantia` devuelve `null` y la fila va a «extras» (nunca se inventa clave).
 */
import { RAMOS_OPORTUNIDAD } from './oportunidad-seguimiento.ts'

export type RamoOferta = 'comunidades' | 'comercio' | 'hogar' | 'generico'
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

export const TAXONOMIA_POR_RAMO: Readonly<Record<RamoOferta, readonly GarantiaCanonica[]>> = {
  comunidades: COMUNIDADES,
  comercio: COMERCIO,
  hogar: HOGAR,
  generico: GENERICO,
}

/** Ramo de oportunidad (`RAMOS_OPORTUNIDAD`) → ramo comparable. `pymes` (alias comercial) → comercio. */
export function ramoOfertaDe(ramoOportunidad: string | null | undefined): RamoOferta {
  const r = (ramoOportunidad ?? '').trim().toLowerCase()
  if (r === 'comunidades') return 'comunidades'
  if (r === 'comercio' || r === 'empresas' || r === 'pymes' || r === 'pyme') return 'comercio'
  if (r === 'hogar') return 'hogar'
  return 'generico'
}

/** Ramos de oportunidad que cubre la comparación con taxonomía propia (guardián de alineación con el enum). */
export const RAMOS_OPORTUNIDAD_CON_TAXONOMIA = RAMOS_OPORTUNIDAD.filter(r => ['comunidades', 'comercio', 'hogar'].includes(r))

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
