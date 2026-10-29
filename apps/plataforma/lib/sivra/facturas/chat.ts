// lib/sivra/facturas/chat.ts — rellena la solicitud de factura con lo que el HUÉSPED escribió en el chat (SERVIDOR).
//
// 1) La IA propone un JSON con los datos (temperatura 0). 2) `validarExtraccion` (puro, testeado) lo contrasta con el
// texto del huésped: lo que no esté literal o no valide se queda en NULL (pendiente). 3) Calle confirmada con el
// Catastro si hay UNA coincidencia exacta (best-effort; si el Catastro no responde, la calle queda como la escribió).
// 4) UPDATE con COALESCE: NUNCA pisa un dato ya puesto (formulario del huésped o Alberto) y solo toca solicitudes
// `pendiente`. Lo usan el orquestador del agente (cada mensaje del hilo de factura) y el cron de salida.
//
// Privacidad: los textos van al mismo proveedor que ya redacta la respuesta al huésped; aquí no se registran ni los
// textos ni los datos (solo contadores).

import { Prisma } from '@prisma/client'
import { aiComplete } from '@central/core-ai'
import { municipiosPorCp } from '@central/core-direccion/servidor'
import { prisma } from '@/lib/db'
import { textosDesdePeticion, type EstadoFacturaChat } from '@/lib/sivra/agente-huesped/factura'
import { confirmarViaCatastro, entradaReceptor, faltasDe, parcheSolicitud, parsearPropuesta, validarExtraccion, TEXTO_FALTA, type FilaSolicitud } from './extraer'
import { validarReceptor } from './receptor'
import { buscarViasCatastro } from './vias-catastro'
import { leerReserva } from './servicio'
import { fechaMadrid } from './numeracion'
import { urlFormulario } from './enlace'

const SISTEMA = `Extraes los DATOS DE FACTURACIÓN que un huésped ha escrito en sus mensajes. Devuelve SOLO un objeto JSON:
{"tipo":"empresa"|"particular"|null,"nombre":string|null,"nif":string|null,"pais":"ISO-3166 alfa-2"|null,"email":string|null,"cc":string[],
 "direccion":{"via":string|null,"numero":string|null,"resto":string|null,"cp":string|null,"municipio":string|null,"lineas":string|null,"ciudad":string|null}}
Reglas: copia cada valor EXACTAMENTE como lo escribió el huésped; si no lo dijo, null. No completes, no corrijas, no traduzcas, no inventes.
"nombre" = razón social (empresa) o nombre completo (particular) A NOMBRE DE QUIEN va la factura. "email" = a donde enviar la factura;
"cc" = los correos que pide en copia. España: "via" = tipo y nombre de la calle SIN el número, "numero" = número del portal,
"resto" = piso/puerta, "cp" = 5 cifras, "municipio" = la ciudad. Fuera de España: "lineas" = calle y número, "ciudad", "cp".`

type FilaBd = FilaSolicitud & { id: string; reservationId: string }

async function leer(solicitudId: string): Promise<FilaBd | null> {
  // `to_jsonb(s)->'receptor_cc'`: si la migración del CC aún no está aplicada, sale NULL en vez de reventar.
  const [f] = await prisma.$queryRaw<Array<{ id: string; estado: string; reservation_id: string; t: string | null; n: string | null; nif: string | null; p: string | null; e: string | null; d: unknown; cc: unknown }>>(Prisma.sql`
    SELECT s.id::text, s.estado, s.reservation_id, s.receptor_tipo AS t, s.receptor_nombre AS n, s.receptor_nif AS nif, s.receptor_pais AS p,
           s.receptor_email AS e, s.receptor_direccion AS d, to_jsonb(s) -> 'receptor_cc' AS cc
      FROM sivra_factura_solicitudes s WHERE s.id = ${solicitudId}::uuid`)
  if (!f) return null
  return {
    id: f.id, estado: f.estado, reservationId: f.reservation_id, receptorTipo: f.t, receptorNombre: f.n, receptorNif: f.nif, receptorPais: f.p,
    receptorEmail: f.e, receptorDireccion: f.d, receptorCc: Array.isArray(f.cc) ? f.cc.filter((x): x is string => typeof x === 'string') : null,
  }
}

/** Propuesta de la IA para estos textos (o `null` si falla: «no se sabe», nunca un objeto vacío inventado). */
async function proponer(textos: string[]): Promise<ReturnType<typeof parsearPropuesta>> {
  try {
    const salida = await aiComplete([{ role: 'user' as const, content: textos.map((t, i) => `Mensaje ${i + 1}:\n${t}`).join('\n\n') }], { system: SISTEMA, maxTokens: 400, temperature: 0, timeoutMs: 25_000 })
    return parsearPropuesta(salida)
  } catch (e) {
    console.warn('[facturas-chat] la IA no respondió:', e instanceof Error ? e.message.slice(0, 120) : 'error')
    return null
  }
}

/**
 * Lee lo que dijo el huésped (desde su primera petición de factura), rellena lo que falte y devuelve cómo queda la
 * solicitud. `null` = solicitud inexistente. Si no hay petición de factura en sus mensajes no se extrae nada.
 */
export async function rellenarDesdeChat(solicitudId: string, textosHuesped: ReadonlyArray<string | null | undefined>, ahora: Date = new Date()): Promise<EstadoFacturaChat | null> {
  const fila = await leer(solicitudId)
  if (!fila) return null
  const textos = textosDesdePeticion(textosHuesped).slice(-12)
  if (fila.estado === 'pendiente' && textos.length) {
    const x = validarExtraccion(await proponer(textos), textos, municipiosPorCp)
    if (x.direccion && 'via' in x.direccion) {
      const d = x.direccion
      const r = await buscarViasCatastro(d.provincia, d.municipio, d.via).catch(() => null)
      const via = r && r.status === 200 ? confirmarViaCatastro(d.via, r.vias) : null
      if (via) x.direccion = { ...d, via, viaCatastro: true }
    }
    const p = parcheSolicitud(fila, x)
    if (Object.keys(p).length) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE sivra_factura_solicitudes SET
          receptor_tipo = COALESCE(receptor_tipo, ${p.receptorTipo ?? null}::text),
          receptor_nombre = COALESCE(receptor_nombre, ${p.receptorNombre ?? null}::text),
          receptor_nif = COALESCE(receptor_nif, ${p.receptorNif ?? null}::text),
          receptor_pais = COALESCE(receptor_pais, ${p.receptorPais ?? null}::text),
          receptor_email = COALESCE(receptor_email, ${p.receptorEmail ?? null}::text),
          receptor_direccion = COALESCE(receptor_direccion, ${p.receptorDireccion ? JSON.stringify(p.receptorDireccion) : null}::jsonb),
          ${p.receptorCc ? Prisma.sql`receptor_cc = CASE WHEN COALESCE(cardinality(receptor_cc), 0) = 0 THEN ${p.receptorCc}::text[] ELSE receptor_cc END,` : Prisma.empty}
          datos_chat_at = now(), updated_at = now()
         WHERE id = ${solicitudId}::uuid AND estado = 'pendiente'`)
      console.info(`[facturas-chat] solicitud ${solicitudId}: ${Object.keys(p).length} campo(s) rellenado(s) desde el chat`)
    }
  }
  return estadoSolicitud(solicitudId, ahora)
}

/** ¿Está completa y válida? Si sí, a dónde irá; si no, qué falta (en palabras para el huésped). */
export async function estadoSolicitud(solicitudId: string, ahora: Date = new Date()): Promise<EstadoFacturaChat | null> {
  const f = await leer(solicitudId)
  if (!f || f.estado === 'cancelada') return null
  const v = validarReceptor(entradaReceptor(f))
  if (!v.ok) return { completa: false, faltan: faltasDe(v.errores).map((k) => TEXTO_FALTA[k]) }
  const reserva = await leerReserva(f.reservationId).catch(() => null)
  const hoy = fechaMadrid(ahora).iso
  return { completa: true, email: v.receptor.email, cc: (f.receptorCc ?? []).filter((e) => e !== v.receptor.email), yaSalio: !!reserva?.hasta && reserva.hasta < hoy }
}

/** Solicitud viva de la reserva, sin crearla (para los mensajes que SIGUEN a una petición de factura). */
export async function solicitudVivaDe(reservationId: string): Promise<{ id: string; url: string } | null> {
  const s = await prisma.sivraFacturaSolicitud.findFirst({ where: { reservationId, estado: { not: 'cancelada' } }, select: { id: true, token: true } })
  return s ? { id: s.id, url: urlFormulario(s.token) } : null
}
