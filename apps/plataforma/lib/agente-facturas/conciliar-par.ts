// Cierra una factura CON su cargo, atómicamente: un cargo solo puede cerrar UNA factura.
// 1) marca el movimiento (`conciliado IS NOT TRUE` → true, `factura_ref = 'fp:<factura>'`); si no afecta filas, otro lo usó: la factura NO se cierra.
// 2) cierra la factura; si ya no estaba abierta, se deshace el movimiento. Todo en una transacción.
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { tgEditMessage } from '@/lib/telegram'

/** Quita los botones del 🧾 viejo reescribiendo su texto. Telegram no es crítico. */
export async function actualizarMensajeTg(msgId: number | null, texto: string): Promise<void> {
  if (!msgId) return
  try {
    await tgEditMessage(msgId, texto)
  } catch { /* Telegram no crítico */ }
}

export interface ParConciliar { factura_id: string; movimiento_id: string }

class SinCambio extends Error {}

export async function cerrarFacturaConCargo(cuentaId: string, par: ParConciliar, estadosAbiertos: readonly string[]): Promise<boolean> {
  try {
    await prisma.$transaction(async (tx) => {
      const mov = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        UPDATE movimientos_bancarios SET conciliado = true, factura_ref = ${'fp:' + par.factura_id}
        WHERE id = ${par.movimiento_id}::uuid AND conciliado IS NOT TRUE
        RETURNING id::text`)
      if (mov.length === 0) throw new SinCambio()
      const fac = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        UPDATE facturas_proveedor f SET estado = 'pagada', pago_confirmado_at = NOW()
        WHERE f.cuenta_id = ${cuentaId}::uuid AND f.id = ${par.factura_id}::uuid AND f.estado = ANY(${[...estadosAbiertos]})
        RETURNING f.id::text`)
      if (fac.length === 0) throw new SinCambio()
    })
    return true
  } catch (e) {
    if (e instanceof SinCambio) return false
    throw e
  }
}
