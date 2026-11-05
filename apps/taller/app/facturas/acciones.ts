'use server'
// Acciones de facturación por <form action>. Cada una: sesión → conPermiso (rol re-leído en BD) → lib/facturas, en UNA transacción.
// Nada sale a la AEAT desde aquí (transporte desactivado): todo queda «no enviado».
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { conPermiso, mensajeDeAcceso } from '@/lib/contexto'
import { eurosACent } from '@/lib/ajustes'
import {
  anularFactura, emitirFactura, ErrorFacturacion, previsualizarFactura, rectificarFactura, registrarCobros, type CobroSolicitado, type TxFacturas,
} from '@/lib/facturas'

const Id = z.string().uuid()
const Codigo = z.string().trim().max(40)

function ir(ruta: string, msg: string | null): never {
  revalidatePath('/facturas')
  revalidatePath('/ordenes')
  redirect(msg ? `${ruta}?aviso=${encodeURIComponent(msg)}` : ruta)
}

/** Hasta dos cobros (medio + importe en euros). Medio vacío = no se cobra ahora. Importe vacío en el primero = el total. */
function cobrosDe(fd: FormData, totalSiVacio: boolean): CobroSolicitado[] | string {
  const out: CobroSolicitado[] = []
  for (const i of [1, 2]) {
    const medio = Codigo.safeParse(fd.get(`medio${i}`) ?? '')
    const imp = String(fd.get(`importe${i}`) ?? '').trim()
    if (!medio.success) return 'Medio de cobro inválido'
    if (!medio.data) continue
    if (!imp) {
      if (i === 1 && totalSiVacio) { out.push({ medioCodigo: medio.data, importeCent: -1 }); continue }
      return `Falta el importe del cobro ${i}`
    }
    const c = eurosACent(imp)
    if (c === null || c <= 0) return `Importe del cobro ${i} no válido`
    out.push({ medioCodigo: medio.data, importeCent: c })
  }
  return out
}

async function intentar(fn: () => Promise<{ ok: true } | { ok: false; motivo: string }>): Promise<string | null> {
  try {
    const r = await fn()
    return r.ok ? null : r.motivo
  } catch (e) {
    const m = mensajeDeAcceso(e)
    if (m) return m
    if (e instanceof ErrorFacturacion) return e.message
    console.error('[facturas]', e)
    return 'No se pudo completar. Inténtalo de nuevo'
  }
}

/** «Facturar» desde la OT (terminada y con la recepción firmada), con el cobro opcional (uno o dividido en dos). */
export async function facturarAccion(fd: FormData): Promise<void> {
  const otId = Id.safeParse(fd.get('otId'))
  if (!otId.success) return ir('/ordenes', 'Datos inválidos')
  const cobros = cobrosDe(fd, true)
  if (typeof cobros === 'string') return ir(`/ordenes/${otId.data}`, cobros)
  let facturaId = null as string | null
  const msg = await intentar(() =>
    conPermiso('facturar', async (tx, c) => {
      const t = tx as unknown as TxFacturas
      // «Importe vacío» en el primer cobro = el total: se resuelve con el total REAL que se va a facturar, no con el del navegador.
      let solicitados = cobros
      if (cobros.some((x) => x.importeCent === -1)) {
        const p = await previsualizarFactura(t, { tallerId: c.tallerId, otId: otId.data })
        if (!p.ok) return p
        const resto = cobros.filter((x) => x.importeCent !== -1).reduce((s, x) => s + x.importeCent, 0)
        solicitados = cobros.map((x) => (x.importeCent === -1 ? { ...x, importeCent: p.totales.totalCent - resto } : x))
      }
      const r = await emitirFactura(t, { tallerId: c.tallerId, otId: otId.data, usuarioId: c.usuarioId, ahora: new Date(), cobros: solicitados })
      if (r.ok) facturaId = r.facturaId
      return r
    }, { timeout: 30_000 }),
  )
  if (msg) return ir(`/ordenes/${otId.data}`, msg)
  return ir(facturaId ? `/facturas/${facturaId}` : `/ordenes/${otId.data}`, null)
}

export async function cobrarAccion(fd: FormData): Promise<void> {
  const id = Id.safeParse(fd.get('facturaId'))
  if (!id.success) return ir('/facturas', 'Datos inválidos')
  const cobros = cobrosDe(fd, false)
  if (typeof cobros === 'string') return ir(`/facturas/${id.data}`, cobros)
  if (cobros.length === 0) return ir(`/facturas/${id.data}`, 'Elige el medio y el importe del cobro')
  const msg = await intentar(() =>
    conPermiso('facturar', (tx, c) =>
      registrarCobros(tx as unknown as TxFacturas, { tallerId: c.tallerId, facturaId: id.data, usuarioId: c.usuarioId, ahora: new Date(), cobros })),
  )
  return ir(`/facturas/${id.data}`, msg)
}

/** Anular (registro de anulación VeriFactu). Solo el dueño, con motivo. */
export async function anularAccion(fd: FormData): Promise<void> {
  const id = Id.safeParse(fd.get('facturaId'))
  const motivo = z.string().trim().max(300).safeParse(fd.get('motivo') ?? '')
  if (!id.success || !motivo.success) return ir('/facturas', 'Datos inválidos')
  const msg = await intentar(() =>
    conPermiso('facturas_rectificar', (tx, c) =>
      anularFactura(tx as unknown as TxFacturas, { tallerId: c.tallerId, facturaId: id.data, motivo: motivo.data, ahora: new Date() })),
  )
  return ir(`/facturas/${id.data}`, msg)
}

/** Rectificativa por abono total (diferencias, todas las líneas en negativo). Solo el dueño, con motivo. */
export async function abonoTotalAccion(fd: FormData): Promise<void> {
  const id = Id.safeParse(fd.get('facturaId'))
  const motivo = z.string().trim().max(300).safeParse(fd.get('motivo') ?? '')
  if (!id.success || !motivo.success) return ir('/facturas', 'Datos inválidos')
  let nueva = null as string | null
  const msg = await intentar(() =>
    conPermiso('facturas_rectificar', async (tx, c) => {
      const r = await rectificarFactura(tx as unknown as TxFacturas, {
        tallerId: c.tallerId, facturaId: id.data, usuarioId: c.usuarioId, ahora: new Date(), motivo: motivo.data, modo: 'abono_total',
      })
      if (r.ok) nueva = r.facturaId
      return r
    }, { timeout: 30_000 }),
  )
  return ir(`/facturas/${nueva ?? id.data}`, msg)
}
