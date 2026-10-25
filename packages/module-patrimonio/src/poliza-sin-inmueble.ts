// Enlace PÓLIZA → INMUEBLE (sentido inverso al de `enlace-seguro.ts`, 25/10/2026): las pólizas de hogar o comunidad del
// cliente (cartera viva o declaradas por él) que NO cuelgan de ningún inmueble de su patrimonio. Es lo que vende:
// «esta póliza protege una vivienda que no tienes en tu patrimonio».
//
// Reglas PURAS (sin BD, red ni reloj). El adaptador (`apps/asegura-portal/lib/patrimonio/poliza-sin-inmueble-bd.ts`)
// resuelve niveles y vigencias y las mete ya resueltas.
//
// 🚨 Lo que NO hace:
//  · No inventa ubicación: usa SOLO la `ubicacion` que quien mira ya ve (`describirBien().ubicacion`: desde `completo`
//    y nunca a un tercero persona física) o la referencia catastral de una declarada suya. Sin ninguna de las dos no
//    hay base para proponer nada → la póliza se calla (no es «sin inmueble», es «no sabemos dónde está»).
//  · No ofrece lo que el nivel no permite: «enlazar» exige `enlazar_seguro` en el inmueble; «añadir» exige que quien
//    mira pueda dar de alta (`alta_baja`) en el titular de la póliza. Sin nivel, no se ofrece.
//  · Una póliza solo cuenta si consta EN VIGOR (`vigente === true`): `null` (no se pudo comprobar) y `false` se callan.
//  · Un «No es este» vivo contra el inmueble que casaría = el cliente ya dijo que no: no se vuelve a proponer nada.
//  · Nunca por municipio solo ni por parecido: el emparejamiento es el de `proponerEnlaces` (refcat idéntica, o CP +
//    vía + número completos).
import { normalizarRefCatastral, proponerEnlaces, type OrigenEnlace, type TipoPolizaEnlace } from './enlace-seguro.ts'

const RAMOS_VIVIENDA = new Set(['hogar', 'comunidad', 'comunidades'])

/** Familia «hogar/comunidad»: el bien es una vivienda o un edificio. (Comercio, alquiler, decenal… no: otro encargo.) */
export function esRamoDeVivienda(ramo: string | null | undefined): boolean {
  return RAMOS_VIVIENDA.has((ramo ?? '').trim().toLowerCase())
}

export interface PolizaParaAvisoInmueble {
  tipo: TipoPolizaEnlace
  id: string
  ramo: string | null
  /** `true` en vigor · `false` consta que no · `null` no se pudo comprobar. */
  vigente: boolean | null
  /** La dirección TAL COMO LA VE quien mira (`null` en su nivel = no se usa). */
  ubicacion: string | null
  /** Solo declaradas. */
  referenciaCatastral: string | null
  /** ¿Puede quien mira dar de alta un inmueble en el titular de esta póliza? (adaptador: nivel `alta_baja`). */
  puedeAnadir: boolean
}

export interface InmuebleParaAvisoPoliza {
  id: string
  referenciaCatastral: string | null
  cp: string | null
  via: string | null
  numero: string | null
  /** ¿Puede quien mira enlazar seguros a este inmueble? (adaptador: nivel `enlazar_seguro`). */
  puedeEnlazar: boolean
}

/** Una fila de `portal_patrimonio_inmueble_poliza`. */
export interface EnlaceParaAvisoPoliza {
  inmuebleId: string
  tipo: TipoPolizaEnlace
  polizaId: string
  /** Tal cual la BD: lo que no se reconoce no cuenta como confirmado. */
  estado: string
  archivado: boolean
}

export type PropuestaDePoliza =
  | { accion: 'enlazar'; inmuebleId: string; origen: Exclude<OrigenEnlace, 'manual'> }
  | { accion: 'anadir' }

export interface AvisoPolizaSinInmueble {
  tipo: TipoPolizaEnlace
  id: string
  ubicacion: string | null
  /** Normalizada (20 caracteres) o `null`. */
  referenciaCatastral: string | null
  propuesta: PropuestaDePoliza
}

export function polizasSinInmueble(x: {
  polizas: readonly PolizaParaAvisoInmueble[]
  inmuebles: readonly InmuebleParaAvisoPoliza[]
  enlaces: readonly EnlaceParaAvisoPoliza[]
}): AvisoPolizaSinInmueble[] {
  const vivos = x.enlaces.filter((e) => !e.archivado)
  const out: AvisoPolizaSinInmueble[] = []
  const vistas = new Set<string>()
  for (const p of x.polizas) {
    const clave = `${p.tipo}:${p.id}`
    if (vistas.has(clave)) continue
    vistas.add(clave)
    if (p.vigente !== true || !esRamoDeVivienda(p.ramo)) continue
    // Ya enlazada (confirmado vivo) a algún inmueble: no es una póliza «suelta».
    if (vivos.some((e) => e.tipo === p.tipo && e.polizaId === p.id && e.estado === 'confirmado')) continue
    const ref = p.tipo === 'declarada' ? normalizarRefCatastral(p.referenciaCatastral) : null
    const ubicacion = p.ubicacion?.trim() ? p.ubicacion.trim() : null
    // Sin ubicación visible ni referencia catastral no hay base para decir nada.
    if (ubicacion === null && ref === null) continue

    const candidata = { tipo: p.tipo, id: p.id, ramo: p.ramo, referenciaCatastral: ref, ubicacion }
    let casa: { inmueble: InmuebleParaAvisoPoliza; origen: Exclude<OrigenEnlace, 'manual'> } | null = null
    let rechazada = false
    for (const i of x.inmuebles) {
      // Sin decisiones: primero hay que saber si CASA, y luego mirar si el cliente ya dijo que no.
      const prop = proponerEnlaces(i, [candidata], [])
      if (prop.length === 0) continue
      const dijoNo = vivos.some((e) => e.inmuebleId === i.id && e.tipo === p.tipo && e.polizaId === p.id && e.estado === 'rechazado')
      if (dijoNo) {
        rechazada = true
        continue
      }
      casa ??= { inmueble: i, origen: prop[0]!.origen }
    }
    if (rechazada && casa === null) continue
    if (casa !== null) {
      if (casa.inmueble.puedeEnlazar) {
        out.push({ tipo: p.tipo, id: p.id, ubicacion, referenciaCatastral: ref, propuesta: { accion: 'enlazar', inmuebleId: casa.inmueble.id, origen: casa.origen } })
      }
      continue
    }
    if (p.puedeAnadir) out.push({ tipo: p.tipo, id: p.id, ubicacion, referenciaCatastral: ref, propuesta: { accion: 'anadir' } })
  }
  return out
}

/**
 * Prerrelleno del alta desde una ubicación en texto libre («CALLE SOCORRO 24, 41003 SEVILLA»): el CP (5 cifras sueltas)
 * y la calle con número (lo que va ANTES del CP, sin comas ni guiones finales). Municipio y provincia NO se adivinan:
 * salen del CP por el validador de dirección del formulario, y la calle pasa por el callejero del Catastro. Sin CP →
 * `cp` vacío y la calle entera (la persona empieza por el CP, como en toda dirección).
 */
export function precargaDeUbicacion(ubicacion: string | null): { cp: string; direccion: string } {
  const t = (ubicacion ?? '').replace(/\s+/g, ' ').trim()
  if (t === '') return { cp: '', direccion: '' }
  const m = /(?:^|[^0-9])(\d{5})(?![0-9])/.exec(t)
  if (!m) return { cp: '', direccion: t.slice(0, 200) }
  const cp = m[1]!
  const inicioCp = m.index + (m[0].length - cp.length)
  const antes = t.slice(0, inicioCp).replace(/[\s,;\-–]+$/, '').trim()
  const despues = t.slice(inicioCp + cp.length).replace(/^[\s,;\-–]+|[\s,;\-–]+$/g, '')
  return { cp, direccion: (antes !== '' ? antes : despues).slice(0, 200) }
}

// ─── Oportunidades ya abiertas ──────────────────────────────────────────────────────────────────────────────────

export type PeticionPolizaAbierta = { polizaId: string; pedidoEl: string }
export type PeticionInmuebleAbierta = { inmuebleId: string; pedidoEl: string }

export type EstadoPeticionAviso =
  | { estado: 'libre' }
  | { estado: 'pedida'; el: string }
  /** No se pudo leer una fuente que hacía falta: ni se ofrece el botón ni se afirma nada. */
  | { estado: 'sin_comprobar' }

/**
 * ¿Hay ya una petición abierta («mejorar precio» de la póliza, «pedir precio» del inmueble)? `null` = la fuente no se
 * pudo leer. Cartera → hace falta la de pólizas; con inmueble candidato → la de inmuebles. Una declarada no tiene
 * «mejorar precio» del portal. Una petición encontrada gana a una fuente caída; una fuente caída sin hallazgo →
 * `sin_comprobar` (nunca «libre»).
 */
export function estadoPeticionAviso(x: {
  tipo: TipoPolizaEnlace
  polizaId: string
  inmuebleId: string | null
  deMejorarPrecio: readonly PeticionPolizaAbierta[] | null
  dePedirPrecio: readonly PeticionInmuebleAbierta[] | null
}): EstadoPeticionAviso {
  const encontradas: string[] = []
  let falta = false
  if (x.tipo === 'cartera') {
    if (x.deMejorarPrecio === null) falta = true
    else for (const f of x.deMejorarPrecio) if (f.polizaId === x.polizaId) encontradas.push(f.pedidoEl)
  }
  if (x.inmuebleId !== null) {
    if (x.dePedirPrecio === null) falta = true
    else for (const f of x.dePedirPrecio) if (f.inmuebleId === x.inmuebleId) encontradas.push(f.pedidoEl)
  }
  if (encontradas.length > 0) return { estado: 'pedida', el: [...encontradas].sort()[0]! }
  return falta ? { estado: 'sin_comprobar' } : { estado: 'libre' }
}
