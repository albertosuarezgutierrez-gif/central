// Ofertas de la oportunidad → presupuesto: las reglas PURAS (05/10/2026, F2). La BD vive en
// `oportunidad-ofertas.ts` y en `presupuesto.ts` (`prepararPresupuestoDeOfertas`). Test: `ofertas-reglas.test.ts`.
//
//   · Qué edición de una oferta se acepta (PATCH): campos, estado y recomendada, validados con zod.
//   · Qué ofertas se pueden consolidar: TODAS las que van tienen que estar REVISADAS (y la póliza actual,
//     si la hay y no está descartada: sus cifras entran en el estudio).
//   · Cómo se congela cada oferta como `presupuesto_opcion`: prima total, franquicia general, coberturas
//     en el mismo sobre que las de Codeoscopic (`{estado, lista, leidasAt}`), firmeza `condicionado`,
//     SIN ReRate ni referencia del vendor, y el papel `recomendada` si el corredor la marcó.

import { createHash } from 'node:crypto'
import { z } from 'zod'
import { garantiaCanonica, type OfertaNormalizada, type RamoOferta, type ValorGarantia } from '@central/module-seguros'
import { garantiasDeJson, importeBd } from './documentos/oferta-leida.ts'

export const ESTADOS_OFERTA = ['extraida', 'revisada', 'descartada'] as const
export type EstadoOferta = (typeof ESTADOS_OFERTA)[number]
export const ROLES_OFERTA = ['actual', 'oferta'] as const
export type RolOferta = (typeof ROLES_OFERTA)[number]

/** Una fila de `oportunidad_oferta` tal como la lee la BD. */
export type FilaOferta = {
  id: string
  oportunidadId: string
  documentoId: string | null
  rol: string
  compania: string | null
  producto: string | null
  primaNeta: unknown
  primaTotal: unknown
  garantias: unknown
  datosExtra: unknown
  estado: string
  recomendada: boolean
  revisadaAt: Date | null
  revisadaPor: string | null
  createdAt: Date
}

// ─── Edición (PATCH) ─────────────────────────────────────────────────────────

const importeEditable = z.union([z.number().finite().positive().max(100_000_000), z.null()])
const ESQUEMA_GARANTIA = z.object({
  estado: z.union([z.literal('incluida'), z.literal('excluida'), z.null()]),
  capital: importeEditable,
  limite: importeEditable,
  franquicia: z.union([z.number().finite().min(0).max(100_000_000), z.null()]),
  evidencia: z.union([
    z.object({ pagina: z.union([z.number().int().min(1).max(5000), z.null()]), texto: z.string().max(500) }),
    z.null(),
  ]).optional(),
}).strict()

export const ESQUEMA_EDICION_OFERTA = z.object({
  ofertaId: z.string().uuid(),
  compania: z.union([z.string().trim().min(1).max(120), z.null()]).optional(),
  producto: z.union([z.string().trim().min(1).max(120), z.null()]).optional(),
  primaNeta: importeEditable.optional(),
  primaTotal: importeEditable.optional(),
  /** Sustituye TODAS las garantías (la pantalla manda el cuadro entero). */
  garantias: z.record(z.string().trim().min(1).max(120), ESQUEMA_GARANTIA).optional(),
  franquiciaGeneral: z.union([z.number().finite().min(0).max(100_000_000), z.null()]).optional(),
  rol: z.enum(ROLES_OFERTA).optional(),
  estado: z.enum(ESTADOS_OFERTA).optional(),
  recomendada: z.boolean().optional(),
}).strict()

export type EdicionOferta = z.infer<typeof ESQUEMA_EDICION_OFERTA>

export type ResultadoEdicion =
  | { ok: true; edicion: EdicionOferta }
  | { ok: false; motivo: string }

/** Valida el cuerpo del PATCH (sin `actor`/`correduriaId`, que la ruta quita antes). */
export function validarEdicionOferta(cuerpo: unknown): ResultadoEdicion {
  const r = ESQUEMA_EDICION_OFERTA.safeParse(cuerpo)
  if (!r.success) {
    const i = r.error.issues[0]
    return { ok: false, motivo: `${i?.path.join('.') || 'cuerpo'}: ${i?.message ?? 'no válido'}` }
  }
  return { ok: true, edicion: r.data }
}

/**
 * Lo que la edición deja escrito, decidido sobre la fila actual. Reglas:
 *   · Editar un DATO (compañía, primas, garantías, rol) de una oferta revisada la devuelve a `extraida`:
 *     lo revisado era otra cosa. Marcar `estado: 'revisada'` en la misma petición la revisa con lo nuevo.
 *   · Revisar exige compañía legible (lo mismo que el CHECK de la BD).
 *   · Recomendar exige que sea una OFERTA no descartada; descartarla le quita la recomendación.
 */
export function aplicarEdicion(
  actual: Pick<FilaOferta, 'rol' | 'compania' | 'estado' | 'recomendada'>,
  e: EdicionOferta,
): { ok: true; cambios: { compania?: string | null; producto?: string | null; primaNeta?: number | null; primaTotal?: number | null; garantias?: Record<string, ValorGarantia>; franquiciaGeneral?: number | null; rol?: RolOferta; estado: EstadoOferta; recomendada: boolean; revisar: boolean } } | { ok: false; motivo: string } {
  const tocaDato = e.compania !== undefined || e.producto !== undefined || e.primaNeta !== undefined || e.primaTotal !== undefined ||
    e.garantias !== undefined || e.franquiciaGeneral !== undefined || e.rol !== undefined
  const estadoPrevio = (ESTADOS_OFERTA as readonly string[]).includes(actual.estado) ? (actual.estado as EstadoOferta) : 'extraida'
  const estado: EstadoOferta = e.estado ?? (tocaDato && estadoPrevio === 'revisada' ? 'extraida' : estadoPrevio)
  const compania = e.compania !== undefined ? e.compania : actual.compania
  const rol = e.rol ?? (actual.rol === 'actual' ? 'actual' : 'oferta')
  if (estado === 'revisada' && !compania) return { ok: false, motivo: 'Para darla por revisada, escribe la compañía.' }
  let recomendada = e.recomendada ?? actual.recomendada
  if (estado === 'descartada' || rol === 'actual') {
    if (e.recomendada === true) {
      return { ok: false, motivo: rol === 'actual' ? 'La póliza actual no se recomienda: se recomienda una oferta.' : 'Una oferta descartada no se puede recomendar.' }
    }
    recomendada = false
  }
  const garantias = e.garantias !== undefined
    ? Object.fromEntries(Object.entries(e.garantias).map(([k, v]) => [k, { ...v, evidencia: v.evidencia ?? null }]))
    : undefined
  return {
    ok: true,
    cambios: {
      ...(e.compania !== undefined ? { compania: e.compania } : {}),
      ...(e.producto !== undefined ? { producto: e.producto } : {}),
      ...(e.primaNeta !== undefined ? { primaNeta: e.primaNeta } : {}),
      ...(e.primaTotal !== undefined ? { primaTotal: e.primaTotal } : {}),
      ...(garantias !== undefined ? { garantias } : {}),
      ...(e.franquiciaGeneral !== undefined ? { franquiciaGeneral: e.franquiciaGeneral } : {}),
      ...(e.rol !== undefined ? { rol: e.rol } : {}),
      estado,
      recomendada,
      revisar: estado === 'revisada' && (estadoPrevio !== 'revisada' || tocaDato),
    },
  }
}

// ─── Consolidar ──────────────────────────────────────────────────────────────

export type SeleccionConsolidar =
  | { ok: true; ofertas: FilaOferta[]; actual: FilaOferta | null; recomendada: FilaOferta | null }
  | { ok: false; motivo: 'sin_ofertas' | 'sin_revisar' | 'sin_prima' | 'no_encontrada'; detalle: string }

/**
 * Qué ofertas van al presupuesto. `ids` = las que eligió el corredor (`null` = todas las ofertas no
 * descartadas). Todas las que van tienen que estar REVISADAS y con prima total; la póliza actual (si
 * hay una viva) también revisada, porque sus cifras entran en el estudio.
 */
export function seleccionarParaConsolidar(filas: readonly FilaOferta[], ids: readonly string[] | null): SeleccionConsolidar {
  const vivas = filas.filter((f) => f.estado !== 'descartada')
  const ofertasVivas = vivas.filter((f) => f.rol === 'oferta')
  let elegidas: FilaOferta[]
  if (ids === null) {
    elegidas = ofertasVivas
  } else {
    const faltan = ids.filter((id) => !ofertasVivas.some((f) => f.id === id))
    if (faltan.length > 0) {
      return { ok: false, motivo: 'no_encontrada', detalle: `${faltan.length === 1 ? 'Una oferta elegida no existe' : `${faltan.length} ofertas elegidas no existen`} en esta oportunidad, es la póliza actual o está descartada.` }
    }
    elegidas = ofertasVivas.filter((f) => ids.includes(f.id))
  }
  if (elegidas.length === 0) return { ok: false, motivo: 'sin_ofertas', detalle: 'No hay ninguna oferta que consolidar: sube al menos una y revísala.' }
  const actual = vivas.find((f) => f.rol === 'actual') ?? null
  const sinRevisar = [...elegidas, ...(actual ? [actual] : [])].filter((f) => f.estado !== 'revisada')
  if (sinRevisar.length > 0) {
    return {
      ok: false,
      motivo: 'sin_revisar',
      detalle: `Falta revisar ${sinRevisar.map((f) => f.compania ?? 'una oferta sin compañía').join(', ')}: lo que no has revisado no va a un presupuesto (o descártalo).`,
    }
  }
  const sinPrima = elegidas.filter((f) => importeBd(f.primaTotal) === null)
  if (sinPrima.length > 0) {
    return { ok: false, motivo: 'sin_prima', detalle: `${sinPrima.map((f) => f.compania ?? 'Una oferta').join(', ')} no tiene prima total: sin precio no hay opción que enseñar.` }
  }
  const recomendada = elegidas.find((f) => f.recomendada) ?? null
  return { ok: true, ofertas: elegidas, actual, recomendada }
}

/**
 * Hasta cuándo valen las ofertas elegidas (`datos_extra.validezHasta`, si la compañía la escribió):
 * `expira` = el FINAL del primer día de validez que acabe (lo que manda en `vence_el`); `caducadas` =
 * las que ya han vencido hoy (Madrid). `null` = ninguna dice su validez (no es «no caduca»: manda la de la casa).
 */
export function caducidadOfertas(ofertas: readonly FilaOferta[], hoy: string): { expira: Date | null; caducadas: string[] } {
  let expira: Date | null = null
  const caducadas: string[] = []
  for (const f of ofertas) {
    const extra = f.datosExtra && typeof f.datosExtra === 'object' && !Array.isArray(f.datosExtra) ? (f.datosExtra as Record<string, unknown>) : {}
    const v = typeof extra.validezHasta === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(extra.validezHasta) ? extra.validezHasta : null
    if (!v) continue
    if (v < hoy) caducadas.push(f.compania ?? 'una oferta')
    const fin = new Date(`${v}T23:59:59Z`)
    if (expira === null || fin < expira) expira = fin
  }
  return { expira, caducadas }
}

/** El aviso que viaja con cada opción de ofertas (se enseña SIEMPRE, como los de la compañía). */
export const AVISO_OPCION_OFERTA =
  'Datos facilitados por la compañía en su oferta y revisados por tu corredor; no sustituyen a la póliza ni a su condicionado. ' +
  'La compañía confirma el precio al emitir.'

/** `datos_extra.franquiciaGeneral` (o `null`: no la declara, JAMÁS «sin franquicia»). */
export function franquiciaGeneral(datosExtra: unknown): number | null {
  if (!datosExtra || typeof datosExtra !== 'object' || Array.isArray(datosExtra)) return null
  const v = (datosExtra as Record<string, unknown>).franquiciaGeneral
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null
}

function literal(datosExtra: unknown, clave: string): string | null {
  if (!datosExtra || typeof datosExtra !== 'object' || Array.isArray(datosExtra)) return null
  const l = (datosExtra as Record<string, unknown>).literales
  if (!l || typeof l !== 'object') return null
  const v = (l as Record<string, unknown>)[clave]
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

const eurEs = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' }) + '€'

/**
 * Las coberturas de la opción, en el MISMO sobre que las de Codeoscopic (`presupuesto_opcion.coberturas`)
 * para que el PDF y el portal las pinten igual. Solo lo que CONSTA: una garantía sin estado ni cifra no
 * se lista (no figura ≠ no cubre). `incluida: false` solo si el documento la EXCLUYE.
 */
export function sobreCoberturasDeOferta(ramo: RamoOferta, garantias: Record<string, ValorGarantia>, datosExtra: unknown, ahora: Date) {
  const lista: { nombre: string; incluida: boolean | null; texto: string | null }[] = []
  for (const [clave, v] of Object.entries(garantias)) {
    const hayCifra = v.capital !== null || v.limite !== null || v.franquicia !== null
    if (v.estado === null && !hayCifra) continue
    const nombre = literal(datosExtra, clave) ?? garantiaCanonica(ramo, clave)?.etiqueta ?? clave
    const detalle = [
      v.capital !== null ? `Capital ${eurEs(v.capital)}` : null,
      v.limite !== null ? `Límite ${eurEs(v.limite)}` : null,
      v.franquicia !== null ? `Franquicia ${eurEs(v.franquicia)}` : null,
    ].filter(Boolean).join(' · ')
    lista.push({
      nombre,
      incluida: v.estado === 'excluida' ? false : v.estado === 'incluida' || hayCifra ? true : null,
      texto: detalle || null,
    })
  }
  return { estado: lista.length > 0 ? 'leidas' : 'vacias', lista, leidasAt: ahora.toISOString() } as const
}

export type OpcionDeOfertaPreparada = {
  orden: number
  ofertaId: string
  compania: string
  producto: string
  primaEur: number
  franquiciaEur: number | null
  /** El precio lo ha dado la compañía por escrito, pero la emisión depende de que lo confirme. */
  firmeza: 'condicionado'
  /** 🚨 Jamás: un presupuesto de ofertas no se re-tarifica por Avant2. */
  requiereRerate: false
  papeles: ('recomendada')[]
  coberturas: ReturnType<typeof sobreCoberturasDeOferta>
  garantias: { origen: 'ofertas'; ramo: RamoOferta; valores: Record<string, ValorGarantia> }
}

/**
 * Las opciones congeladas, en orden: la recomendada primero (portada), después el resto de menor a
 * mayor prima total. Exige `seleccionarParaConsolidar` antes (revisadas y con prima).
 */
export function opcionesDeOfertas(ramo: RamoOferta, ofertas: readonly FilaOferta[], ahora: Date): OpcionDeOfertaPreparada[] {
  const conPrima = ofertas
    .map((f) => ({ f, prima: importeBd(f.primaTotal) }))
    .filter((x): x is { f: FilaOferta; prima: number } => x.prima !== null)
  conPrima.sort((a, b) => Number(b.f.recomendada) - Number(a.f.recomendada) || a.prima - b.prima || a.f.createdAt.getTime() - b.f.createdAt.getTime())
  return conPrima.map(({ f, prima }, i) => {
    const garantias = garantiasDeJson(f.garantias)
    return {
      orden: i + 1,
      ofertaId: f.id,
      compania: f.compania ?? 'Sin compañía',
      producto: f.producto ?? 'Sin producto',
      primaEur: prima,
      franquiciaEur: franquiciaGeneral(f.datosExtra),
      firmeza: 'condicionado',
      requiereRerate: false,
      papeles: f.recomendada ? ['recomendada'] : [],
      coberturas: sobreCoberturasDeOferta(ramo, garantias, f.datosExtra, ahora),
      garantias: { origen: 'ofertas', ramo, valores: garantias },
    }
  })
}

/** La oferta como la compara `compararOfertas` (re-export para que la ruta no importe dos módulos). */
export type { OfertaNormalizada }

// ─── Aceptación en el portal ─────────────────────────────────────────────────

/**
 * Lo que el cliente confirma al aceptar un presupuesto de OFERTAS (no hay petición a Codeoscopic de la
 * que sacar «los datos con los que se calculó el precio»). Mismo formato que `leerDatosCotizados` para
 * que la firma y su huella no cambien de forma: tomador y la oferta elegida, y quién emite.
 */
export function gruposAceptacionOfertas(e: { tomador: string; compania: string; producto: string | null }) {
  return [
    { titulo: 'Tomador', filas: [{ etiqueta: 'Nombre', valor: e.tomador }] },
    {
      titulo: 'Oferta elegida',
      filas: [
        { etiqueta: 'Compañía', valor: e.compania },
        ...(e.producto ? [{ etiqueta: 'Producto', valor: e.producto }] : []),
        { etiqueta: 'Emisión', valor: `La tramita tu corredor directamente con ${e.compania}, que puede pedir datos o confirmar el precio antes de emitir.` },
      ],
    },
  ]
}

type GrupoDatos = { titulo: string; filas: { etiqueta: string; valor: string }[] }

/** Lo que el cliente revisa en el portal ANTES de elegir (sin opción todavía): quién es el tomador y quién emite. */
export function gruposRevisionOfertas(tomador: string): GrupoDatos[] {
  return [
    { titulo: 'Tomador', filas: [{ etiqueta: 'Nombre', valor: tomador }] },
    { titulo: 'Emisión', filas: [{ etiqueta: 'Quién emite', valor: 'Tu corredor, directamente con la compañía que elijas. Puede pedirte algún dato más antes de emitir.' }] },
  ]
}

/**
 * La forma `DatosCotizados` ('ok') de un presupuesto de ofertas: los grupos, su texto (que entra en el
 * documento firmado) y su huella. Determinista: misma entrada, mismo texto, misma huella.
 */
export function datosAceptacionOfertas(grupos: GrupoDatos[]): { estado: 'ok'; grupos: GrupoDatos[]; texto: string; huella: string } {
  const lineas = ['DATOS DE LA OFERTA ELEGIDA']
  for (const g of grupos) {
    lineas.push('', g.titulo)
    for (const f of g.filas) lineas.push(`- ${f.etiqueta}: ${f.valor}`)
  }
  const texto = lineas.join('\n')
  return { estado: 'ok', grupos, texto, huella: createHash('sha256').update(texto, 'utf8').digest('hex') }
}

/** La línea del aviso al corredor: qué hacer con una aceptación de ofertas. */
export function lineaEmitirEnCompania(compania: string): string {
  return `📌 Presupuesto de OFERTAS (PDF): NO se emite por Avant2. Emítelo en ${compania} (su portal o tu gestor) y márcalo emitido.`
}
