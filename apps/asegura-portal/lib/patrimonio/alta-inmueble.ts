// PATRIMONIO (22/10/2026) — validación PURA del alta de un inmueble (`POST /api/patrimonio/inmuebles`).
//
// Lo que entra es lo que la persona tecleó y NADA de ello decide a quién pertenece el inmueble: `titular` es solo la
// petición («quiero darlo de alta en esta ficha»); el handler (`inmuebles-api.ts`) la busca DENTRO de los accesos
// resueltos por la cookie y, si no está, 404. Aquí solo se valida la FORMA.
//
// Regla de la casa de direcciones (`direccion-cp.ts`): CP primero. Sin CP válido, provincia y municipio no hay
// dirección; la calle del callejero oficial (`viaOficial`) solo cuenta si el texto sigue empezando por ella. Una calle
// que no casa con el callejero (o que se escribió porque el callejero no respondía) se guarda como TEXTO y marca
// `porValidar`: no se inventa un `via`/`numero` que nadie ha validado.
import { partirCalle, viaSigueVigente } from '@central/core-catastro'
import { MAX_UNIDADES_EDIFICIO, esCriterioReparto, type CriterioReparto } from '@central/module-patrimonio'

import { componerDireccionNormalizada, cpValido } from './direccion-cp.ts'

import { USOS_INMUEBLE, type UsoInmueble } from './usos.ts'

export { USOS_INMUEBLE, type UsoInmueble }

export type DatosAltaInmueble = {
  alias: string
  uso: UsoInmueble
  referenciaCatastral: string | null
  cp: string
  /** `null` = la calle no viene del callejero (queda «por validar»). */
  via: string | null
  numero: string | null
  resto: string | null
  direccionNormalizada: string
  porValidar: boolean
  /** Tri-estado: `null` = «no lo sé», nunca `false` por defecto. */
  enComunidad: boolean | null
  /** Solo `uso: 'edificio'`: nombres de las unidades que se crean con él (vacío = se añaden luego desde su ficha). */
  unidades: string[]
  /** Solo `uso: 'edificio'`: criterio de reparto de sus gastos. `null` = sin elegir (no se reparte). */
  repartoCriterio: CriterioReparto | null
}

export type ResultadoAlta = { ok: true; datos: DatosAltaInmueble } | { ok: false; campo: string }

const texto = (v: unknown, min: number, max: number): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim().replace(/\s+/g, ' ')
  return t.length >= min && t.length <= max ? t : null
}

/** El número de portal de lo que sigue a la calle: «, 12 2ºB» → { numero: '12', resto: '2ºB' }. */
export function numeroYResto(cola: string): { numero: string | null; resto: string | null } {
  const limpia = cola.trim().replace(/^[,;\s]+/, '')
  const m = limpia.match(/^(\d{1,4}[A-Za-z]?)(?:\s*[,;]?\s*(.*))?$/)
  if (!m) return { numero: null, resto: limpia || null }
  return { numero: m[1].toUpperCase(), resto: (m[2] ?? '').trim() || null }
}

export function validarAltaInmueble(cuerpo: unknown): ResultadoAlta {
  const b = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as Record<string, unknown>
  const alias = texto(b.alias, 1, 80)
  if (!alias) return { ok: false, campo: 'alias' }
  const uso = (USOS_INMUEBLE as readonly string[]).includes(b.uso as string) ? (b.uso as UsoInmueble) : null
  if (!uso) return { ok: false, campo: 'uso' }

  // CP PRIMERO: sin CP, provincia y municipio no se mira ni la calle.
  const cp = typeof b.cp === 'string' ? b.cp.trim() : ''
  if (!cpValido(cp)) return { ok: false, campo: 'cp' }
  const provincia = texto(b.provincia, 2, 100)
  if (!provincia) return { ok: false, campo: 'provincia' }
  const municipio = texto(b.municipio, 2, 100)
  if (!municipio) return { ok: false, campo: 'municipio' }
  const direccion = texto(b.direccion, 3, 200)
  if (!direccion) return { ok: false, campo: 'direccion' }

  let referenciaCatastral: string | null = null
  if (b.referenciaCatastral !== undefined && b.referenciaCatastral !== null && b.referenciaCatastral !== '') {
    const rc = typeof b.referenciaCatastral === 'string' ? b.referenciaCatastral.trim().toUpperCase() : ''
    if (!/^[0-9A-Z]{20}$/.test(rc)) return { ok: false, campo: 'referenciaCatastral' }
    referenciaCatastral = rc
  }

  let enComunidad: boolean | null = null
  if (b.enComunidad !== undefined && b.enComunidad !== null) {
    if (typeof b.enComunidad !== 'boolean') return { ok: false, campo: 'enComunidad' }
    enComunidad = b.enComunidad
  }

  // Edificio sin división horizontal (27/10/2026): las unidades nacen con él, con nombres editables.
  const unidades: string[] = []
  let repartoCriterio: CriterioReparto | null = null
  if (b.unidades !== undefined && b.unidades !== null) {
    if (!Array.isArray(b.unidades) || b.unidades.length > MAX_UNIDADES_EDIFICIO) return { ok: false, campo: 'unidades' }
    if (b.unidades.length > 0 && uso !== 'edificio') return { ok: false, campo: 'unidades' }
    const vistos = new Set<string>()
    for (const u of b.unidades) {
      const nombre = texto(u, 1, 80)
      if (!nombre || vistos.has(nombre.toLocaleLowerCase('es'))) return { ok: false, campo: 'unidades' }
      vistos.add(nombre.toLocaleLowerCase('es'))
      unidades.push(nombre)
    }
  }
  if (b.repartoCriterio !== undefined && b.repartoCriterio !== null && b.repartoCriterio !== '') {
    if (uso !== 'edificio' || !esCriterioReparto(b.repartoCriterio)) return { ok: false, campo: 'repartoCriterio' }
    repartoCriterio = b.repartoCriterio
  }

  const v = b.viaOficial as { tipo?: unknown; nombre?: unknown } | null | undefined
  const via =
    v && typeof v.tipo === 'string' && typeof v.nombre === 'string' && v.nombre.trim() !== ''
      ? { tipo: v.tipo, nombre: v.nombre }
      : null
  const oficial = via !== null && viaSigueVigente(direccion, via)

  let numero: string | null = null
  let resto: string | null = null
  if (oficial) ({ numero, resto } = numeroYResto(partirCalle(direccion).cola))

  return {
    ok: true,
    datos: {
      alias,
      uso,
      referenciaCatastral,
      cp,
      via: oficial ? `${via!.tipo} ${via!.nombre}` : null,
      numero,
      resto,
      direccionNormalizada: componerDireccionNormalizada({ direccion, cp, municipio, provincia }),
      porValidar: !oficial,
      enComunidad,
      unidades,
      repartoCriterio,
    },
  }
}
