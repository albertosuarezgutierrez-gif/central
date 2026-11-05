// CNAE-2009 (4 dígitos) → plantilla sectorial SUGERIDA. DATOS + funciones puras. Pedido de Alberto (05/11/2026): el alta pide la actividad
// (CNAE) y la app SUGIERE la plantilla; el dueño o el gestor CONFIRMA o cambia (Ajustes → Actividad). Nunca se impone: un CNAE
// desconocido o un dato inválido cae en la plantilla genérica, que es la única que no presupone nada del negocio.
//
// El CNAE también acota (a) los ejes de rentabilidad que se ofrecen (p. ej. un comercio de recambios no tiene «mecánico») y (b) qué
// avisos se priorizan. Solo ACOTA lo que la plantilla ya ofrece: no inventa ejes ni cuentas.
import type { TipoAviso } from '../avisos/motor.ts'
import { plantillaDe, type DimensionDef, type SectorPlantilla } from './plantillas.ts'

type Ficha = { nombre: string; sector: SectorPlantilla; ejes: readonly string[] }

/** Solo las actividades que tienen plantilla propia; todo lo demás es genérico (no se enumera el CNAE entero). */
export const CNAE_ACTIVIDADES: Readonly<Record<string, Ficha>> = {
  // Taller y repuestos de automoción
  '4520': { nombre: 'Mantenimiento y reparación de vehículos de motor', sector: 'taller', ejes: ['ot', 'cliente', 'tipo_trabajo', 'mecanico', 'proveedor'] },
  '4531': { nombre: 'Comercio al por mayor de repuestos y accesorios de vehículos de motor', sector: 'taller', ejes: ['cliente', 'proveedor'] },
  '4532': { nombre: 'Comercio al por menor de repuestos y accesorios de vehículos de motor', sector: 'taller', ejes: ['cliente', 'proveedor'] },
  // Hostelería
  '5610': { nombre: 'Restaurantes y puestos de comidas', sector: 'hosteleria', ejes: ['producto', 'franja', 'mesa'] },
  '5621': { nombre: 'Provisión de comidas preparadas para eventos (catering)', sector: 'hosteleria', ejes: ['producto', 'franja'] },
  '5629': { nombre: 'Otros servicios de comidas', sector: 'hosteleria', ejes: ['producto', 'franja'] },
  '5630': { nombre: 'Establecimientos de bebidas', sector: 'hosteleria', ejes: ['producto', 'franja', 'mesa'] },
  // Limpieza
  '8121': { nombre: 'Limpieza general de edificios', sector: 'limpieza', ejes: ['cliente', 'servicio', 'empleado'] },
  '8122': { nombre: 'Otras actividades de limpieza industrial y de edificios', sector: 'limpieza', ejes: ['cliente', 'servicio'] },
  '8129': { nombre: 'Otras actividades de limpieza', sector: 'limpieza', ejes: ['cliente', 'servicio'] },
  // Alquiler
  '6820': { nombre: 'Alquiler de bienes inmobiliarios por cuenta propia', sector: 'alquiler', ejes: ['cliente'] },
  '7711': { nombre: 'Alquiler de automóviles y vehículos de motor ligeros', sector: 'alquiler', ejes: ['cliente', 'material'] },
  '7712': { nombre: 'Alquiler de camiones', sector: 'alquiler', ejes: ['cliente', 'material'] },
  '7721': { nombre: 'Alquiler de artículos de ocio y deportivos', sector: 'alquiler', ejes: ['cliente', 'material'] },
  '7729': { nombre: 'Alquiler de otros efectos personales y artículos de uso doméstico', sector: 'alquiler', ejes: ['cliente', 'material'] },
  '7732': { nombre: 'Alquiler de maquinaria y equipo de construcción e ingeniería civil', sector: 'alquiler', ejes: ['cliente', 'material'] },
  '7739': { nombre: 'Alquiler de otra maquinaria, equipos y bienes tangibles n.c.o.p.', sector: 'alquiler', ejes: ['cliente', 'material'] },
}

/**
 * Normaliza lo que teclea una persona: «45.20», «4520», «4520Z», « 45 20 » → «4520». Se queda con los 4 primeros dígitos; menos de 4 dígitos,
 * letras al principio o un grupo CNAE inexistente (empieza por 0 o es mayor que 99) → null.
 */
export function normalizarCnae(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim().toUpperCase()
  if (!/^[0-9][0-9.\s]*[A-Z]?$/.test(t)) return null
  const digitos = t.replace(/[^0-9]/g, '')
  if (digitos.length < 4 || digitos.length > 5 || digitos.startsWith('0')) return null
  return digitos.slice(0, 4)
}

export type MotivoSugerencia = 'cnae_conocido' | 'cnae_sin_plantilla' | 'cnae_invalido' | 'sin_cnae'
export type SugerenciaCnae = { cnae: string | null; sector: SectorPlantilla; motivo: MotivoSugerencia; actividad: string | null }

/** Sugerencia completa (con el porqué, para decírselo al usuario). */
export function sugerenciaPorCnae(entrada: unknown): SugerenciaCnae {
  if (entrada === null || entrada === undefined || (typeof entrada === 'string' && entrada.trim() === '')) return { cnae: null, sector: 'generico', motivo: 'sin_cnae', actividad: null }
  const cnae = normalizarCnae(entrada)
  if (!cnae) return { cnae: null, sector: 'generico', motivo: 'cnae_invalido', actividad: null }
  const ficha = CNAE_ACTIVIDADES[cnae]
  return ficha
    ? { cnae, sector: ficha.sector, motivo: 'cnae_conocido', actividad: ficha.nombre }
    : { cnae, sector: 'generico', motivo: 'cnae_sin_plantilla', actividad: null }
}

/** Plantilla sugerida para un CNAE. Desconocido, inválido o ausente → `generico`. */
export const plantillaSugeridaPorCnae = (cnae: unknown): SectorPlantilla => sugerenciaPorCnae(cnae).sector

/** Actividades con plantilla propia, para el desplegable de Ajustes. */
export function actividadesConocidas(): { cnae: string; nombre: string; sector: SectorPlantilla }[] {
  return Object.entries(CNAE_ACTIVIDADES).map(([cnae, f]) => ({ cnae, nombre: f.nombre, sector: f.sector }))
}

/**
 * Ejes de rentabilidad que se ofrecen: los de la plantilla ELEGIDA acotados por la actividad. Si la empresa eligió una plantilla distinta de
 * la que sugiere su CNAE (o no hay CNAE), se ofrecen todos los de la plantilla; el filtro nunca deja la lista vacía.
 */
export function dimensionesPorCnae(sector: unknown, cnae: unknown): readonly DimensionDef[] {
  const todas = plantillaDe(sector).dimensiones
  const n = normalizarCnae(cnae)
  const ficha = n ? CNAE_ACTIVIDADES[n] : undefined
  if (!ficha || ficha.sector !== plantillaDe(sector).sector) return todas
  const acotadas = todas.filter((d) => ficha.ejes.includes(d.clave))
  return acotadas.length ? acotadas : todas
}

/** Tipos de aviso que más importan según la actividad (el resto se muestra igual, después). */
const AVISOS_PRIORITARIOS: Readonly<Record<SectorPlantilla, readonly TipoAviso[]>> = {
  generico: [],
  taller: ['margen', 'hechos'],
  hosteleria: ['efectivo', 'margen', 'tesoreria'],
  limpieza: ['tesoreria', 'margen'],
  alquiler: ['tesoreria', 'efectivo'],
}

export function avisosPrioritarios(sector: unknown, cnae: unknown): readonly TipoAviso[] {
  const s = plantillaDe(sector).sector
  const n = normalizarCnae(cnae)
  const ficha = n ? CNAE_ACTIVIDADES[n] : undefined
  // Sin CNAE conocido o con plantilla elegida distinta de la sugerida, manda la plantilla elegida.
  return AVISOS_PRIORITARIOS[ficha && ficha.sector === s ? ficha.sector : s]
}

/** Orden ESTABLE: primero los tipos prioritarios de la actividad, después el resto en su orden. Nunca descarta un aviso. */
export function ordenarAvisosPorRelevancia<T extends { tipo: string }>(avisos: readonly T[], sector: unknown, cnae: unknown): T[] {
  const prio = avisosPrioritarios(sector, cnae) as readonly string[]
  const rango = (a: T) => { const i = prio.indexOf(a.tipo); return i < 0 ? prio.length : i }
  return avisos.map((a, i) => ({ a, i })).sort((x, y) => rango(x.a) - rango(y.a) || x.i - y.i).map((x) => x.a)
}
