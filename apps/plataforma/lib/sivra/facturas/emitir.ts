// lib/sivra/facturas/emitir.ts — ✅ EMITIR y ENVIAR la factura al huésped (SERVIDOR).
//
// EMITIR (una transacción):
//   1) `SELECT … FOR UPDATE` de la factura → una segunda pulsación espera y luego la ve ya emitida (idempotente).
//   2) `SELECT … FOR UPDATE` de la serie del año en curso (Madrid) → dos facturas distintas a la vez se serializan.
//   3) `planEmision` (puro, testeado): FAIL-CLOSED si falta IVA o número inicial («falta configurar IVA/serie»).
//   4) UPDATE de la factura (número = siguiente de la serie, importes, PDF definitivo) y DESPUÉS UPDATE de la serie
//      (siguiente + 1, condicionado al valor leído). Si algo falla, rollback de los dos: no hay hueco ni duplicado.
//      El trigger de la BD vuelve a comprobar correlatividad e inmutabilidad.
// ENVIAR (fuera de la transacción): reclamo atómico (`envio_en_curso_at`) para que dos pulsaciones no manden dos
// correos; si el correo falla, la factura queda EMITIDA y NO enviada, con `envio_error`, y se reintenta con 🔁. Un
// reclamo colgado sin `envio_error` = «no se sabe si salió» (`dudoso`): nunca se reintenta solo.
//
// TODO(VeriFactu, fuera de v1): aquí, dentro de la transacción de emisión, iría la huella encadenada
// (`verifactu_huella`) y su envío a la AEAT. `calcularHuella` de core-fiscal fija TipoFactura=F2 (simplificada):
// estas son completas (F1), así que no se reutiliza tal cual.

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { createMailTransporter } from '@central/core-email'
import { EMISOR_FACTURAS_HUESPED, type Emisor } from './emisor'
import { fechaMadrid, planEmision, evaluarSerie, type SerieConfig } from './numeracion'
import { generarPdfFactura } from './pdf'
import { type Receptor } from './receptor'
import { mensajeVigente } from './telegram'
import { eur } from '@/lib/dinero'

export type ResultadoEmision =
  | { estado: 'emitida'; numeroCompleto: string }
  | { estado: 'ya_emitida'; numeroCompleto: string | null; enviada: boolean }
  | { estado: 'bloqueada'; motivo: string }
  | { estado: 'obsoleta' }
  | { estado: 'no_existe' }

type FilaFactura = {
  id: string; cuenta_id: string; estado: string; numero_completo: string | null; total: number
  concepto: string; emisor: unknown; receptor: unknown; desde: Date | null; hasta: Date | null; telegram_message_id: bigint | null
}
type FilaSerie = { id: string; prefijo: string; anio: number; siguiente_numero: number | null; tipo_iva: number | null; mencion_iva: string | null; activa: boolean }

/**
 * `mensajeId`: message_id del ✅ pulsado. Se compara con `telegram_message_id` BAJO el FOR UPDATE: si el borrador se
 * regeneró (datos nuevos → mensaje nuevo), el ✅ viejo no emite (`obsoleta`). Así se emite lo que Alberto VIO.
 */
export async function emitirFactura(facturaId: string, mensajeId: number | null, ahora: Date = new Date()): Promise<ResultadoEmision> {
  return prisma.$transaction(async (tx) => {
    const [f] = await tx.$queryRaw<FilaFactura[]>(Prisma.sql`
      SELECT id::text, cuenta_id::text, estado, numero_completo, total::float8 AS total, concepto, emisor, receptor,
             fecha_operacion_desde AS desde, fecha_operacion_hasta AS hasta, telegram_message_id
        FROM sivra_facturas_huesped WHERE id = ${facturaId}::uuid FOR UPDATE`)
    if (!f) return { estado: 'no_existe' } as const
    if (f.estado !== 'borrador') return { estado: 'ya_emitida', numeroCompleto: f.numero_completo, enviada: f.estado === 'enviada' } as const
    if (!mensajeVigente(f.telegram_message_id, mensajeId)) return { estado: 'obsoleta' } as const

    const { anio, iso } = fechaMadrid(ahora)
    const [s] = await tx.$queryRaw<FilaSerie[]>(Prisma.sql`
      SELECT id::text, prefijo, anio, siguiente_numero, tipo_iva::float8 AS tipo_iva, mencion_iva, activa
        FROM sivra_factura_series WHERE cuenta_id = ${f.cuenta_id}::uuid AND anio = ${anio} AND activa FOR UPDATE`)
    const serie: SerieConfig | null = s ? { id: s.id, prefijo: s.prefijo, anio: s.anio, siguienteNumero: s.siguiente_numero, tipoIva: s.tipo_iva, mencionIva: s.mencion_iva, activa: s.activa } : null
    const plan = planEmision({ estado: f.estado, numeroCompleto: f.numero_completo, total: f.total }, evaluarSerie(serie, anio))
    if (plan.accion === 'ya_emitida') return { estado: 'ya_emitida', numeroCompleto: plan.numeroCompleto, enviada: plan.estado === 'enviada' } as const
    if (plan.accion === 'bloqueada') return { estado: 'bloqueada', motivo: plan.motivo } as const

    const pdf = await generarPdfFactura({
      numeroCompleto: plan.numeroCompleto, fechaExpedicion: iso, emisor: f.emisor as Emisor, receptor: f.receptor as Receptor,
      concepto: f.concepto, estanciaDesde: f.desde?.toISOString().slice(0, 10) ?? null, estanciaHasta: f.hasta?.toISOString().slice(0, 10) ?? null,
      total: plan.importes.total, base: plan.importes.base, tipoIva: plan.importes.tipoIva, cuota: plan.importes.cuota, mencionIva: plan.mencionIva,
    }, { borrador: false })

    const n = await tx.$executeRaw(Prisma.sql`
      UPDATE sivra_facturas_huesped
         SET estado = 'emitida', serie_id = ${plan.serieId}::uuid, serie_prefijo = ${plan.prefijo}, anio = ${plan.anio},
             numero = ${plan.numero}, numero_completo = ${plan.numeroCompleto}, fecha_expedicion = ${iso}::date,
             base = ${plan.importes.base}, tipo_iva = ${plan.importes.tipoIva}, cuota = ${plan.importes.cuota},
             mencion_iva = ${plan.mencionIva}, pdf = ${Buffer.from(pdf)}, emitida_at = now()
       WHERE id = ${facturaId}::uuid AND estado = 'borrador'`)
    if (n !== 1) throw new Error('la factura dejó de ser borrador a mitad de la emisión')
    const m = await tx.$executeRaw(Prisma.sql`
      UPDATE sivra_factura_series SET siguiente_numero = ${plan.siguiente}
       WHERE id = ${plan.serieId}::uuid AND siguiente_numero = ${plan.numero}`)
    if (m !== 1) throw new Error('el contador de la serie cambió a mitad de la emisión')
    return { estado: 'emitida', numeroCompleto: plan.numeroCompleto } as const
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 20_000, maxWait: 10_000 })
}

export type ResultadoEnvio =
  | { estado: 'enviada'; email: string }
  | { estado: 'ya_enviada' }
  | { estado: 'en_curso' }
  /** Un envío empezó y no dejó ni éxito ni error (función cortada, o el correo salió y falló el UPDATE final): NO se
   *  sabe si el huésped lo recibió. No se reintenta solo; reenviar es decisión de Alberto (`forzar`). */
  | { estado: 'dudoso' }
  | { estado: 'no_emitida' }
  | { estado: 'fallida'; motivo: string }

/** Remitente: env explícita; si no, el de la app. Sin ninguno, el envío falla y la factura queda emitida sin enviar. */
function remitente(): string | null {
  const dir = process.env.FACTURAS_HUESPED_FROM || process.env.MAIL_FROM || process.env.GMAIL_USER || ''
  if (!dir) return null
  return /</.test(dir) ? dir : `"${EMISOR_FACTURAS_HUESPED.nombre}" <${dir}>`
}

export function cuerpoCorreo(numero: string, total: number, piso: string): { asunto: string; texto: string } {
  return {
    asunto: `Factura ${numero} · ${piso} / Invoice ${numero}`,
    texto: [
      'Hola,', '', `Te adjunto la factura ${numero} de tu estancia en ${piso} (total ${eur(total)}).`,
      'Si ves algún dato que corregir, responde a este correo.', '', 'Un saludo,', EMISOR_FACTURAS_HUESPED.nombre, '', '—', '',
      'Hello,', '', `Please find attached invoice ${numero} for your stay at ${piso} (total ${eur(total)}).`,
      'If any detail needs correcting, just reply to this email.', '', 'Best regards,', EMISOR_FACTURAS_HUESPED.nombre,
    ].join('\n'),
  }
}

export async function enviarFactura(facturaId: string, opts: { forzar?: boolean } = {}): Promise<ResultadoEnvio> {
  // Reclamo atómico: solo una pulsación envía. Un reclamo que quedó colgado (sin éxito ni `envio_error`) NO se vuelve
  // a reclamar solo: el correo pudo salir y fallar el UPDATE final → reenviar duplicaría. Solo con `forzar` (Alberto,
  // avisado) y si lleva >10 min colgado.
  const [r] = await prisma.$queryRaw<Array<{ numero_completo: string; total: number; receptor: Receptor; pdf: Buffer; property_id: string }>>(Prisma.sql`
    UPDATE sivra_facturas_huesped
       SET envio_en_curso_at = now(), envio_intentos = envio_intentos + 1
     WHERE id = ${facturaId}::uuid AND estado = 'emitida'
       AND (envio_en_curso_at IS NULL
            OR (${opts.forzar === true} AND envio_en_curso_at < now() - interval '10 minutes'))
     RETURNING numero_completo, total::float8 AS total, receptor, pdf, property_id`)
  if (!r) {
    const f = await prisma.sivraFacturaHuesped.findUnique({ where: { id: facturaId }, select: { estado: true, envioEnCursoAt: true } })
    if (!f || f.estado === 'borrador') return { estado: 'no_emitida' }
    if (f.estado === 'enviada') return { estado: 'ya_enviada' }
    return f.envioEnCursoAt && f.envioEnCursoAt.getTime() < Date.now() - 10 * 60_000 ? { estado: 'dudoso' } : { estado: 'en_curso' }
  }
  const fallo = async (motivo: string): Promise<ResultadoEnvio> => {
    await prisma.$executeRaw(Prisma.sql`UPDATE sivra_facturas_huesped SET envio_en_curso_at = NULL, envio_error = ${motivo.slice(0, 500)} WHERE id = ${facturaId}::uuid AND estado = 'emitida'`)
    return { estado: 'fallida', motivo }
  }
  const de = remitente()
  const transporte = createMailTransporter()
  if (!de || !transporte) return fallo(!de ? 'sin remitente configurado (FACTURAS_HUESPED_FROM)' : 'sin proveedor de correo configurado')
  const piso = (await prisma.$queryRaw<Array<{ name: string }>>(Prisma.sql`SELECT name FROM properties WHERE id = ${r.property_id}`))[0]?.name ?? 'el apartamento'
  const { asunto, texto } = cuerpoCorreo(r.numero_completo, r.total, piso)
  try {
    await transporte.sendMail({
      from: de, to: r.receptor.email, subject: asunto, text: texto,
      ...(process.env.FACTURAS_HUESPED_REPLY_TO ? { replyTo: process.env.FACTURAS_HUESPED_REPLY_TO } : {}),
      attachments: [{ filename: `factura-${r.numero_completo}.pdf`, content: Buffer.from(r.pdf), contentType: 'application/pdf' }],
    })
  } catch (e) {
    return fallo(e instanceof Error ? e.message : 'fallo de envío')
  }
  await prisma.$executeRaw(Prisma.sql`
    UPDATE sivra_facturas_huesped SET estado = 'enviada', enviada_at = now(), envio_en_curso_at = NULL, envio_error = NULL
     WHERE id = ${facturaId}::uuid AND estado = 'emitida'`)
  return { estado: 'enviada', email: r.receptor.email }
}
