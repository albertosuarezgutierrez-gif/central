// Imputación de una factura (gasto VARIABLE) a inmueble + categoría.
//
// Flujo: el cliente sube la factura → el extractor de IA (idea de `apps/plataforma/lib/agente-facturas/extraer.ts`)
// devuelve campos sueltos → `proponerImputacion` PROPONE inmueble y categoría con su motivo → el cliente CONFIRMA
// o corrige → `confirmarImputacion` valida la elección contra lo que esa identidad gestiona.
//
// 🚨 La IA nunca confirma: lo propuesto no entra en la rentabilidad hasta que el cliente lo confirma.
// 🚨 Aislamiento: el `inmuebleId` que llega de la pantalla NO se cree; se busca DENTRO de los inmuebles que la
//    identidad gestiona (mismo patrón que `/boveda/poliza/[id]`). Fuera de la lista → `inmueble_ajeno` (la ruta
//    responde 404, nunca 403).
// 🚨 Valor de cajón: la categoría `OTRO` (o cualquier etiqueta fuera del catálogo) que devuelva la IA se ANULA
//    (`null` = sin proponer), no se escribe como si fuera un dato.

import type { CategoriaGasto, Centimos, Gasto, Inmueble, Titular } from './tipos.ts'
import { esCategoriaGasto } from './tipos.ts'
import { esFecha, type Fecha } from './fechas.ts'

/** Lo que sale del extractor, ya normalizado a céntimos por el adaptador de la app. Todo opcional. */
export interface FacturaLeida {
  fecha?: string | null
  proveedor?: string | null
  nifProveedor?: string | null
  /** Destinatario de la factura (el titular, si es suya). */
  nifCliente?: string | null
  concepto?: string | null
  /** Dirección del suministro / del inmueble que figura en la factura. */
  direccion?: string | null
  /** CUPS o nº de contrato de suministro que figure. */
  referenciaSuministro?: string | null
  referenciaCatastral?: string | null
  base?: Centimos | null
  total?: Centimos | null
  /** Categoría que sugiere la IA (texto libre): se valida contra el catálogo. */
  categoria?: string | null
}

export type Confianza = 'alta' | 'media' | 'baja'

export interface PropuestaImputacion {
  titularId: string | null
  inmuebleId: string | null
  categoria: CategoriaGasto | null
  confianza: Confianza
  /** Por qué se propone esto (se enseña al cliente). */
  motivos: string[]
  /**
   * La factura va a nombre de un NIF que no es de ningún titular que gestionas: probablemente no es tuya
   * (o es del inquilino). No se imputa sola.
   */
  aNombreDeOtro: boolean
}

export function normalizarNif(v: string | null | undefined): string | null {
  if (typeof v !== 'string') return null
  let s = v.toUpperCase().replace(/[\s.\-_/]/g, '')
  if (s.startsWith('ES') && s.length > 9) s = s.slice(2)
  return s === '' ? null : s
}

function normalizarRef(v: string | null | undefined): string | null {
  if (typeof v !== 'string') return null
  const s = v.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return s === '' ? null : s
}

const sinAcentos = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const PALABRAS_VACIAS = new Set(['calle', 'c', 'cl', 'avda', 'avenida', 'plaza', 'pza', 'de', 'del', 'la', 'el', 'los', 'las', 'y', 'n', 'no', 'num', 'bajo', 'piso', 'puerta', 'esc', 'escalera'])

function fichasDireccion(s: string | null | undefined): Set<string> {
  if (typeof s !== 'string') return new Set()
  return new Set(
    sinAcentos(s)
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 0 && !PALABRAS_VACIAS.has(t)),
  )
}

/**
 * Coincidencia de dirección: TODAS las fichas de la dirección del inmueble (calle + número + CP…) aparecen en la
 * de la factura, y al menos una es un número. Exigir todas evita que «Socorro 24» case con «Socorro 2».
 */
function direccionCasa(inmueble: Inmueble, direccionFactura: string | null | undefined): boolean {
  const a = fichasDireccion(inmueble.direccion)
  if (a.size === 0) return false
  const b = fichasDireccion(direccionFactura)
  if (b.size === 0) return false
  let hayNumero = false
  for (const t of a) {
    if (!b.has(t)) return false
    if (/^\d+$/.test(t)) hayNumero = true
  }
  return hayNumero
}

// Palabras → categoría. El orden importa: la primera regla que casa gana (seguro antes que «hogar»…).
const REGLAS_CATEGORIA: ReadonlyArray<[CategoriaGasto, RegExp]> = [
  ['COMUNIDAD', /\b(comunidad de propietarios|cuota de comunidad|derrama|cdad\.? ?prop)/],
  ['IMPUESTOS', /\b(ibi|impuesto sobre bienes inmuebles|tasa de basura|basuras|tributo|recaudacion|ayuntamiento|plusvalia)\b/],
  ['SEGURO', /\b(seguro|poliza|prima|aseguradora)\b/],
  ['SUMINISTROS', /\b(electricidad|energia|luz|gas natural|agua|emasesa|canal de isabel|endesa|iberdrola|naturgy|fibra|internet|telefonia|kwh|cups)\b/],
  ['GESTION', /\b(administrador de fincas|administracion de fincas|gestoria|asesoria|honorarios|notaria|registro de la propiedad)\b/],
  ['FINANCIACION', /\b(hipoteca|prestamo|intereses|cuota del prestamo)\b/],
  ['REFORMAS', /\b(reforma|obra|rehabilitacion)\b/],
  ['MANTENIMIENTO', /\b(reparacion|fontaner\w*|electricista|cerrajer\w*|mantenimiento|averia|pintura|caldera|aire acondicionado)\b/],
  ['MOBILIARIO', /\b(mueble|mobiliario|electrodomestico|colchon|sofa|frigorifico|lavadora)\b/],
]

export function categoriaPorTexto(...textos: Array<string | null | undefined>): CategoriaGasto | null {
  const t = sinAcentos(textos.filter((x): x is string => typeof x === 'string').join(' '))
  if (t.trim() === '') return null
  for (const [cat, re] of REGLAS_CATEGORIA) if (re.test(t)) return cat
  return null
}

/** Categoría que dice la IA, si es del catálogo y no es el cajón `OTRO`. */
function categoriaDeIa(v: string | null | undefined): CategoriaGasto | null {
  if (typeof v !== 'string') return null
  const s = sinAcentos(v).toUpperCase().trim()
  return esCategoriaGasto(s) && s !== 'OTRO' ? s : null
}

export interface ContextoImputacion {
  /** Titulares que la identidad GESTIONA (ya resueltos con su nivel). */
  titulares: readonly Titular[]
  /** Inmuebles de esos titulares. */
  inmuebles: readonly Inmueble[]
}

export function proponerImputacion(f: FacturaLeida, ctx: ContextoImputacion): PropuestaImputacion {
  const motivos: string[] = []
  const nifCliente = normalizarNif(f.nifCliente)
  const titularPorNif = nifCliente ? ctx.titulares.find((t) => t.nif !== null && normalizarNif(t.nif) === nifCliente) ?? null : null
  const aNombreDeOtro = nifCliente !== null && titularPorNif === null

  // Inmuebles candidatos: los del titular de la factura si se sabe; si no, todos los gestionados.
  const candidatos = titularPorNif ? ctx.inmuebles.filter((i) => i.titularId === titularPorNif.id) : [...ctx.inmuebles]

  let inmueble: Inmueble | null = null
  let confianza: Confianza = 'baja'

  const rc = normalizarRef(f.referenciaCatastral)
  if (rc) {
    const hit = candidatos.filter((i) => normalizarRef(i.referenciaCatastral) === rc)
    if (hit.length === 1) {
      inmueble = hit[0]
      confianza = 'alta'
      motivos.push('La referencia catastral de la factura es la de este inmueble.')
    }
  }
  const sum = normalizarRef(f.referenciaSuministro)
  if (!inmueble && sum) {
    const hit = candidatos.filter((i) => i.suministros.some((s) => normalizarRef(s) === sum))
    if (hit.length === 1) {
      inmueble = hit[0]
      confianza = 'alta'
      motivos.push('El nº de suministro (CUPS/contrato) es el de este inmueble.')
    }
  }
  if (!inmueble && f.direccion) {
    const hit = candidatos.filter((i) => direccionCasa(i, f.direccion))
    if (hit.length === 1) {
      inmueble = hit[0]
      confianza = 'media'
      motivos.push('La dirección de la factura coincide con la de este inmueble.')
    } else if (hit.length > 1) {
      motivos.push('La dirección encaja con varios inmuebles: elige cuál.')
    }
  }
  if (!inmueble && titularPorNif && candidatos.length === 1) {
    inmueble = candidatos[0]
    confianza = 'media'
    motivos.push('La factura va a nombre de un titular que solo tiene este inmueble.')
  }

  const cat = categoriaPorTexto(f.concepto, f.proveedor) ?? categoriaDeIa(f.categoria)
  if (cat) motivos.push(`Categoría propuesta por el concepto: ${cat}.`)

  if (aNombreDeOtro) {
    motivos.push('La factura va a nombre de otro NIF: comprueba que es tuya antes de imputarla.')
    confianza = 'baja'
  }
  if (!inmueble) {
    confianza = 'baja'
    motivos.push('No hemos podido saber a qué inmueble corresponde.')
  }

  return {
    titularId: inmueble ? inmueble.titularId : (titularPorNif?.id ?? null),
    inmuebleId: inmueble?.id ?? null,
    categoria: cat,
    confianza,
    motivos,
    aNombreDeOtro,
  }
}

// ─── Confirmación por el cliente ─────────────────────────────────────────────────────────────────────────────

export interface EleccionCliente {
  /** `null` = gasto del titular sin inmueble (gestoría de la sociedad). */
  inmuebleId: string | null
  /** Titular, obligatorio si `inmuebleId` es `null`. */
  titularId: string | null
  categoria: string
  fecha: string
  base: Centimos | null
  total: Centimos | null
  concepto: string | null
}

export type ResultadoConfirmacion =
  | { ok: true; gasto: Omit<Gasto, 'id'> }
  | { ok: false; error: 'inmueble_ajeno' | 'titular_ajeno' | 'categoria_invalida' | 'fecha_invalida' | 'sin_importe' | 'importe_invalido' }

const centimosValidos = (v: unknown): v is Centimos => typeof v === 'number' && Number.isInteger(v) && v >= 0

export function confirmarImputacion(e: EleccionCliente, ctx: ContextoImputacion): ResultadoConfirmacion {
  let titularId: string
  let inmuebleId: string | null = null
  if (e.inmuebleId !== null) {
    const inm = ctx.inmuebles.find((i) => i.id === e.inmuebleId)
    // El inmueble tiene que ser de un titular gestionado (doble comprobación: la lista podría venir sin filtrar).
    if (!inm || !ctx.titulares.some((t) => t.id === inm.titularId)) return { ok: false, error: 'inmueble_ajeno' }
    titularId = inm.titularId
    inmuebleId = inm.id
  } else {
    const t = ctx.titulares.find((x) => x.id === e.titularId)
    if (!t) return { ok: false, error: 'titular_ajeno' }
    titularId = t.id
  }
  if (!esCategoriaGasto(e.categoria)) return { ok: false, error: 'categoria_invalida' }
  if (!esFecha(e.fecha)) return { ok: false, error: 'fecha_invalida' }
  if (e.base === null && e.total === null) return { ok: false, error: 'sin_importe' }
  if ((e.base !== null && !centimosValidos(e.base)) || (e.total !== null && !centimosValidos(e.total))) {
    return { ok: false, error: 'importe_invalido' }
  }
  return {
    ok: true,
    gasto: {
      titularId,
      inmuebleId,
      fecha: e.fecha as Fecha,
      categoria: e.categoria,
      concepto: e.concepto,
      base: e.base,
      total: e.total,
      estado: 'confirmado',
      origen: 'factura',
      clave: null,
    },
  }
}
