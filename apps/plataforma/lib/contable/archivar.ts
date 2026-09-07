// apps/plataforma/lib/contable/archivar.ts
// Archiva en Drive e imputa al libro de gastos una factura SUBIDA A MANO (chat web, 📎 de Telegram
// o el botón 📸 de la cabecera). NO implementa nada nuevo: reutiliza la maquinaria CANÓNICA del
// agente de correo (`subir` de agente-facturas/drive + `procesarFactura`), que ya sabe deduplicar
// por huella, aplicar las reglas aprendidas, descartar presupuestos y facturas de terceros, y dejar
// en bandeja lo que no está claro. Una segunda implementación divergiría y contaría dos veces.
//
// 🚨 MULTI-TENANT. La tabla `gastos` NO tiene `cuenta_id`: es el libro de UNA cuenta (la misma que
// resuelve `facturas-scan` para el buzón). Imputar ahí lo que sube otro tenant metería su gasto en
// el libro de Alberto. Por eso, si la sesión no es la dueña del libro, NO se sube ni se imputa nada
// y se devuelve `decision: null` — que la UI cuenta como «no se ha intentado», no como «no hay».
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { subir } from '@/lib/agente-facturas/drive'
import { clasificarDocumento, procesarFactura } from '@/lib/agente-facturas/procesar'
import { cargarTitulares } from '@/lib/agente-facturas/titulares'
import { resolverCuentaBuzon } from '@/lib/agente-facturas/cuenta-buzon'
import type { FacturaExtraida } from '@/lib/agente-facturas/extraer'
import { nombreArchivoFactura, type ArchivoFactura, type FacturaDoc } from './documentos-tipos'

const NO_INTENTADO: ArchivoFactura = { carpeta: null, url: null, driveError: false, decision: null }

// ¿Es esta cuenta la dueña del libro de gastos? Misma resolución que `facturas-scan` y `titulares`
// (env FACTURAS_CUENTA_ID → cuenta cuyo email == GMAIL_USER → la única real). Ante la duda, false:
// mejor no archivar que archivar en el libro de otro.
async function esCuentaDelLibro(cuentaId: string): Promise<boolean> {
  try {
    const cuentas = await prisma.$queryRaw<{ id: string; email: string | null; nombre: string }[]>(
      Prisma.sql`SELECT id, email, nombre FROM cuentas`,
    )
    const duena = resolverCuentaBuzon(
      cuentas.map(c => ({ id: c.id, email: c.email, esDemo: /\[seed-demo\]/i.test(c.nombre) })),
      { facturaCuentaId: process.env.FACTURAS_CUENTA_ID, gmailUser: process.env.GMAIL_USER },
    )
    return !!duena && duena === cuentaId
  } catch {
    return false
  }
}

/**
 * Sube el justificante a Drive (carpeta año/mes según la FECHA DE LA FACTURA, no la de hoy) e
 * imputa el gasto. Nunca lanza: un fallo de Drive no puede tumbar la respuesta del agente, pero
 * tampoco se traga — vuelve como `driveError` para que se DIGA.
 */
export async function archivarEImputar(
  cuentaId: string,
  buffer: Buffer,
  mimeType: string,
  fileName: string,
  data: FacturaExtraida,
  texto: string,
  doc: FacturaDoc,
): Promise<ArchivoFactura> {
  if (!(await esCuentaDelLibro(cuentaId))) return NO_INTENTADO

  // Misma clasificación que el correo: un presupuesto no se archiva ni se imputa, y una factura de
  // Booking lleva huella por establecimiento.
  const clas = clasificarDocumento(data, texto, fileName)
  const factura: FacturaExtraida = { ...clas.factura, fecha: clas.factura.fecha || doc.fecha }

  let drive: { url: string; carpeta: string; nombre: string } | null = null
  let driveError = false
  if (clas.archivar) {
    try {
      const d = await subir(buffer, nombreArchivoFactura(doc, fileName), mimeType, factura.fecha || doc.fecha)
      drive = { url: d.url, carpeta: d.carpeta, nombre: d.nombre }
    } catch (e) {
      driveError = true
      console.error('[archivar] subida a Drive falló (subida manual):', e)
    }
  }

  try {
    const r = await procesarFactura(factura, {
      fuente: 'subida-manual',
      drive: drive ? { url: drive.url, carpeta: drive.carpeta, nombre: drive.nombre } : undefined,
      esPresupuesto: clas.esPresupuesto,
      fingerprintOverride: clas.fingerprintOverride,
      esBooking: clas.esBooking,
      titulares: await cargarTitulares(),
    })
    return {
      carpeta: drive?.carpeta ?? null,
      url: drive?.url ?? null,
      driveError,
      decision: r.decision,
      motivo: r.motivo ?? null,
      receptor: r.receptor ?? null,
    }
  } catch (e) {
    console.error('[archivar] procesarFactura falló (subida manual):', e)
    return {
      carpeta: drive?.carpeta ?? null,
      url: drive?.url ?? null,
      driveError,
      decision: 'error',
      motivo: String((e as Error)?.message || e).slice(0, 140),
    }
  }
}
