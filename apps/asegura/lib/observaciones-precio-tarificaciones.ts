// ADAPTADOR: tarificaciones guardadas (Avant2/Codeoscopic y bots RPA) → `ObservacionPrecio[]` (07/11/2026).
// PURO (sin BD ni red). Test: `observaciones-precio-tarificaciones.test.ts`. Lo lee `competitividad-companias.ts`.
//
// Existe para que el cálculo de competitividad (`calcularCompetitividad` de `@central/module-seguros`) no sepa de
// dónde vienen los precios: cuando haya un almacén único de observaciones (pólizas escaneadas, primas de CIMA…), se
// cambia ESTE fichero por otro lector y el cálculo no se toca.
//
// Fuentes: `seguros.tarificaciones` + `seguros.tarificacion_precios`. Canal `codeoscopic` = Avant2 (UNA tarificación
// trae varias compañías); canal `rpa` = bot (UNA tarificación por compañía, que se junta con las demás por la
// OPORTUNIDAD). Las simuladas no se leen (las filtra la consulta).
//
// Qué compite con qué (`grupoComparacion`): la oportunidad si la hay (así un bot de Allianz y el Avant2 de la misma
// petición se comparan; el cálculo separa por ventana de días); si no, la propia tarificación (Avant2 trae todas las
// compañías; un bot suelto queda solo y no compara con nadie).
//
// Qué NO entra (y se cuenta):
//  - precios sin prima válida, o fuera del rango razonable del ramo (`RANGOS_PRIMA_POR_RAMO`) — bots;
//  - precios que `revisarCoherenciaCotizacion` marca como incoherentes (prima inválida o franquicia que no cuadra) — Avant2;
//  - ofertas sin nivel de cobertura (no se inventa un nivel).
// «Sin precio» (rechazo del riesgo / error): SOLO lo dice Avant2, en `fallos` (con la compañía y el motivo). Los fallos
// de los bots son de robot o de datos, no de la compañía, y no se cuentan como rechazo. `fallos` NULL = tarificación
// anterior al 29/09/2026: no se sabe, y no entra en la cuenta de «sin precio».

import { normalizarCompania, resolverCompania, revisarCoherenciaCotizacion, type CompaniaCatalogo, type ObservacionPrecio } from '@central/module-seguros'
import { nivelDeOferta, SIN_CLASIFICAR } from './tarificacion-niveles.ts'
import { RANGOS_PRIMA_POR_RAMO } from './tarificacion-coherencia.ts'
import { fallosDe } from './codeoscopic/fallos-guardados.ts'

export type PrecioLeido = {
  id: string | null
  /** `id_precio` del vendor (solo Avant2). */
  idVendor?: string | null
  compania: string | null
  producto: string | null
  modalidad: string | null
  categoria: string | null
  primaEur: number | null
  franquiciaEur: number | null
  /** `tarificacion_precios.garantias` tal cual (Avant2: `{version, porClave}`). */
  garantias: unknown
  /** `tarificacion_precios.coberturas` tal cual (bot: `{lista: [...]}`). */
  coberturas: unknown
}

export type TarificacionLeida = {
  id: string
  /** `tarificaciones.canal`: `codeoscopic` | `rpa` (otro valor se ignora). */
  canal: string
  ramo: string | null
  oportunidadId: string | null
  /** 'YYYY-MM-DD' (día en Madrid). */
  fecha: string
  /** `tarificaciones.fallos` tal cual. */
  fallos: unknown
  precios: PrecioLeido[]
}

export type FilaSinPrecio = {
  companiaCodigo: string
  ramo: string
  anio: number
  /** Tarificaciones de Avant2 CON detalle de fallos en las que la compañía figura (con precio o sin él). */
  tarificaciones: number
  conPrecio: number
  /** No dio precio por rechazar el riesgo («no contratable», «no asegurable», vehículo no permitido…). */
  rechazos: number
  /** No dio precio por un error de la petición o de la compañía (no es un rechazo del riesgo). */
  errores: number
}

export type LecturaObservaciones = {
  observaciones: ObservacionPrecio[]
  sinPrecio: FilaSinPrecio[]
  tarificaciones: { avant2: number; bot: number }
  excluidas: { sinPrima: number; fueraDeRango: number; incoherentes: number }
}

const RE_RECHAZO = /no contratable|no asegurable|no se puede contratar|veh[ií]culo no (permitido|disponible)|suscripci[oó]n|no admite|no acepta/i

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Compañía → clave estable. Con código DGS si el catálogo la resuelve; si no, `?:nombre` (compite pero no tiene ficha). */
function identidad(catalogo: readonly CompaniaCatalogo[], nombre: string | null): { codigo: string; nombre: string } | null {
  if (!nombre || normalizarCompania(nombre) === '') return null
  const r = resolverCompania(catalogo, nombre)
  if (r.estado === 'resuelta') return { codigo: r.codigoDgs, nombre: r.nombre }
  return { codigo: `?:${normalizarCompania(nombre)}`, nombre: nombre.trim() }
}

function coberturasDe(v: unknown): { nombre: string; incluida: boolean | null; texto: string | null }[] | null {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  if (!o || !Array.isArray(o.lista)) return null
  const lista: { nombre: string; incluida: boolean | null; texto: string | null }[] = []
  for (const c of o.lista) {
    const x = c && typeof c === 'object' && !Array.isArray(c) ? (c as Record<string, unknown>) : null
    if (!x || typeof x.nombre !== 'string' || x.nombre.trim() === '') continue
    lista.push({ nombre: x.nombre, incluida: typeof x.incluida === 'boolean' ? x.incluida : null, texto: typeof x.texto === 'string' ? x.texto : null })
  }
  return lista.length ? lista : null
}

function porClaveDe(v: unknown): Record<string, 'si' | 'no' | 'no_consta'> | null {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  const p = o?.porClave
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null
  const out: Record<string, 'si' | 'no' | 'no_consta'> = {}
  for (const [k, e] of Object.entries(p as Record<string, unknown>)) if (e === 'si' || e === 'no' || e === 'no_consta') out[k] = e
  return out
}

/** Nivel de una oferta; `null` = no se puede clasificar (no compite). Hogar sin nivel equivalente: por producto. */
function nivelDe(ramo: string, canal: 'avant2' | 'bot', p: PrecioLeido): string | null {
  const c = nivelDeOferta(ramo, {
    compania: p.compania ?? '', producto: p.producto ?? '', modalidad: p.modalidad, categoria: p.categoria,
    primaEur: p.primaEur, franquiciaEur: p.franquiciaEur, origen: canal,
    garantias: canal === 'avant2' ? porClaveDe(p.garantias) : null,
    coberturas: coberturasDe(p.coberturas),
  })
  if (c.nivel !== SIN_CLASIFICAR) return c.nivel
  if (ramo === 'hogar') {
    const prod = normalizarCompania(p.producto)
    return prod === '' ? null : `Producto ${prod}`
  }
  return null
}

/** Pasa las tarificaciones leídas a observaciones comparables. PURO. */
export function observacionesDeTarificaciones(tarificaciones: readonly TarificacionLeida[], catalogo: readonly CompaniaCatalogo[]): LecturaObservaciones {
  const observaciones: ObservacionPrecio[] = []
  const excluidas = { sinPrima: 0, fueraDeRango: 0, incoherentes: 0 }
  const cuenta = { avant2: 0, bot: 0 }
  const sinPrecio = new Map<string, FilaSinPrecio>()

  for (const t of tarificaciones) {
    const canal = t.canal === 'codeoscopic' ? 'avant2' : t.canal === 'rpa' ? 'bot' : null
    const ramo = (t.ramo ?? '').trim()
    if (!canal || ramo === '' || !/^\d{4}-\d{2}-\d{2}$/.test(t.fecha)) continue
    cuenta[canal]++
    const grupo = t.oportunidadId ? `op:${t.oportunidadId}` : `t:${t.id}`

    // Avant2: los precios que la propia comprobación de coherencia marca como no fiables no compiten.
    const malos = new Set<number>()
    if (canal === 'avant2') {
      const reparos = revisarCoherenciaCotizacion(t.precios.map((p) => ({
        id: p.idVendor ?? null, compania: p.compania, categoria: p.categoria, modalidad: p.modalidad, primaEur: p.primaEur, franquiciaEur: p.franquiciaEur,
      })))
      for (const r of reparos) if (r.tipo === 'prima_invalida' || r.tipo === 'franquicia_no_cuadra') r.indices.forEach((i) => malos.add(i))
    }

    const conPrecio = new Set<string>()
    t.precios.forEach((p, i) => {
      const prima = num(p.primaEur)
      if (prima === null || prima <= 0) { excluidas.sinPrima++; return }
      if (malos.has(i)) { excluidas.incoherentes++; return }
      const rango = RANGOS_PRIMA_POR_RAMO[ramo]
      if (rango && (prima < rango.min || prima > rango.max)) { excluidas.fueraDeRango++; return }
      const id = identidad(catalogo, p.compania)
      if (!id) return
      conPrecio.add(id.codigo)
      observaciones.push({
        fuente: canal, companiaCodigo: id.codigo, companiaNombre: id.nombre, ramo, nivel: nivelDe(ramo, canal, p),
        primaAnualCents: Math.round(prima * 100), fecha: t.fecha, grupoComparacion: grupo,
      })
    })

    // «Sin precio»: solo Avant2 y solo con el detalle de fallos guardado (NULL = no se sabe).
    const fallos = canal === 'avant2' ? fallosDe(t.fallos) : null
    if (fallos) {
      const anio = Number(t.fecha.slice(0, 4))
      const estado = new Map<string, { codigo: string; nombre: string; rechazo: boolean; error: boolean }>()
      for (const f of fallos) {
        if (f.tambienDioPrecio) continue
        const id = identidad(catalogo, f.compania)
        if (!id) continue
        const e = estado.get(id.codigo) ?? { codigo: id.codigo, nombre: id.nombre, rechazo: false, error: false }
        if (RE_RECHAZO.test(f.motivo ?? '')) e.rechazo = true
        else e.error = true
        estado.set(id.codigo, e)
      }
      const todas = new Set<string>([...conPrecio, ...estado.keys()])
      for (const codigo of todas) {
        const k = `${codigo}\u0000${ramo}\u0000${anio}`
        const fila = sinPrecio.get(k) ?? { companiaCodigo: codigo, ramo, anio, tarificaciones: 0, conPrecio: 0, rechazos: 0, errores: 0 }
        fila.tarificaciones++
        if (conPrecio.has(codigo)) fila.conPrecio++
        else if (estado.get(codigo)?.rechazo) fila.rechazos++
        else fila.errores++
        sinPrecio.set(k, fila)
      }
    }
  }
  return { observaciones, sinPrecio: [...sinPrecio.values()], tarificaciones: cuenta, excluidas }
}
