// lib/sivra/facturas/telegram-acciones.ts — lo que hace cada botón `fhu_*` (SERVIDOR). La autorización (solo la
// persona de TELEGRAM_CHAT_ID) ya la decidió `decidirBotonFactura`; aquí solo se ejecuta y se redacta la línea.

import { escapeHtml, type Boton } from '@central/core-telegram'
import { prisma } from '@/lib/db'
import { emitirFactura, enviarFactura, type ResultadoEnvio } from './emitir'
import { urlFormulario, URL_PLATAFORMA_FACTURAS } from './enlace'
import { botonesPropuesta, botonReintento, type DecisionBotonFactura } from './telegram'

type Salida = { linea: string; botones?: Boton[][] }

function lineaEnvio(numero: string | null, r: ResultadoEnvio, facturaId: string): Salida {
  const n = escapeHtml(numero ?? '')
  switch (r.estado) {
    case 'enviada': return { linea: `✅ <b>Emitida ${n}</b> y enviada a ${escapeHtml(r.email)}.` }
    case 'ya_enviada': return { linea: `ℹ️ La factura ${n} ya estaba emitida y enviada. No se ha hecho nada.` }
    case 'en_curso': return { linea: `⏳ La factura ${n} está emitida y su envío está en curso. Mira /sivra/facturas antes de repetir.` }
    case 'no_emitida': return { linea: '⚠️ La factura no está emitida: no se envía nada.' }
    case 'fallida': return { linea: `⚠️ <b>Emitida ${n}</b> pero el correo NO ha salido: ${escapeHtml(r.motivo)}. Queda pendiente de envío.`, botones: botonReintento(facturaId) }
  }
}

export async function resolverBotonFactura(d: Extract<DecisionBotonFactura, { ok: true }>): Promise<Salida> {
  if (d.accion === 'cor') {
    const f = await prisma.sivraFacturaHuesped.findUnique({ where: { id: d.facturaId }, select: { estado: true, solicitud: { select: { token: true } } } })
    if (!f) return { linea: '⚠️ Factura no encontrada.' }
    if (f.estado !== 'borrador') return { linea: 'ℹ️ Ya está emitida: una corrección será una rectificativa (aún no disponible).' }
    const base = (process.env.NEXT_PUBLIC_APP_URL || URL_PLATAFORMA_FACTURAS).replace(/\/+$/, '')
    const partes = [`✏️ Sigue en BORRADOR (sin número). Corrige los datos en ${base}/sivra/facturas?f=${d.facturaId}`]
    if (f.solicitud?.token) partes.push(`o reenvía al huésped su formulario: ${urlFormulario(f.solicitud.token)}`)
    partes.push('Al guardar te llegará un borrador nuevo.')
    return { linea: escapeHtml(partes.join(' ')) }
  }
  if (d.accion === 'env') {
    const f = await prisma.sivraFacturaHuesped.findUnique({ where: { id: d.facturaId }, select: { numeroCompleto: true } })
    return lineaEnvio(f?.numeroCompleto ?? null, await enviarFactura(d.facturaId), d.facturaId)
  }
  // ✅ emitir (idempotente) y enviar.
  const r = await emitirFactura(d.facturaId)
  if (r.estado === 'no_existe') return { linea: '⚠️ Factura no encontrada.' }
  if (r.estado === 'bloqueada') return { linea: `⛔ <b>No emitida</b>: ${escapeHtml(r.motivo)}. Configúralo y vuelve a pulsar ✅.`, botones: botonesPropuesta(d.facturaId) }
  if (r.estado === 'ya_emitida' && r.enviada) return { linea: `ℹ️ La factura ${escapeHtml(r.numeroCompleto ?? '')} ya estaba emitida y enviada. No se ha hecho nada.` }
  return lineaEnvio(r.numeroCompleto, await enviarFactura(d.facturaId), d.facturaId)
}
