'use server'

// El lado Avant2 de la «Parrilla de precios» (13/10/2026). **Gratis**: solo LEE la última tarificación ya pagada de esta
// oportunidad (`seguros.tarificaciones` + `seguros.tarificacion_precios`, por el puerto de asegura). Nunca tarifica: cada
// tarificación de Avant2 cuesta 0,50€ y la parrilla no ofrece recotizar.
//
// 🚨 Nunca otra en su lugar: si asegura devolviera una tarificación que no es la última variante del riesgo, no se compara
// (sería la prima de otro riesgo o de otro día). Un fallo de lectura es `sin_leer`, nunca «ninguna».

import { exigirCorreduria } from '@/lib/correduria-acceso'
import { interpretarRiesgo } from '@/lib/riesgo-asegura'
import { riesgoAsegura } from '@/lib/seguimiento-asegura'
import { tarificacionGuardadaAsegura, tarificacionNuevaGuardadaAsegura, type Precio } from '@/lib/retarificar-asegura'
import { esRamoAvant2, ultimaVariante, type LadoAvant2, type PrecioAvant2 } from './parrilla-precios'

const aPrecio = (p: Precio): PrecioAvant2 => ({
  compania: p.compania ?? null,
  producto: p.producto ?? null,
  modalidad: p.modalidad ?? null,
  primaEur: typeof p.primaEur === 'number' ? p.primaEur : null,
  meses: typeof p.meses === 'number' ? p.meses : null,
  franquiciaEur: typeof p.franquiciaEur === 'number' ? p.franquiciaEur : null,
})

export async function leerAvant2DeOportunidad(entrada: { oportunidadId: string }): Promise<LadoAvant2> {
  // Una acción de servidor es un POST público: sin sesión de la correduría no se lee nada.
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return { estado: 'sin_leer', motivo: 'No tienes acceso a la correduría.' }
  const r = await riesgoAsegura(entrada.oportunidadId).catch(() => null)
  const l = r ? interpretarRiesgo(r.status, r.json) : null
  if (!l || l.estado !== 'ok') return { estado: 'sin_leer', motivo: 'No se ha podido leer el riesgo.' }
  const ramo = l.riesgo.oportunidad.ramo
  if (!esRamoAvant2(ramo)) return { estado: 'no_aplica' }
  const v = ultimaVariante(l.riesgo.variantes)
  if (!v) return { estado: 'ninguna' }

  let res
  if (v.polizaId) res = await tarificacionGuardadaAsegura(v.polizaId).catch(() => null)
  else if (v.tomador.clienteId) {
    res = await tarificacionNuevaGuardadaAsegura(v.tomador.clienteId, ramo, { oportunidadId: entrada.oportunidadId, tarificacionId: v.id }).catch(() => null)
  } else return { estado: 'sin_leer', motivo: `La variante ${v.referencia} no tiene tomador: no se sabe de quién leer la tarificación.` }

  if (!res) return { estado: 'sin_leer', motivo: 'No se ha podido hablar con central-asegura.' }
  // La variante existe en el riesgo: si asegura no encuentra su tarificación, NO es «no se ha pedido».
  if (res.estado === 'ninguna') return { estado: 'sin_leer', motivo: `No se encuentra la tarificación guardada de ${v.referencia}.` }
  if (res.estado !== 'ok') return { estado: 'sin_leer', motivo: res.mensaje }
  const g = res.guardada
  if (g.cotizacionId !== v.id) return { estado: 'sin_leer', motivo: `Lo leído no es la última variante (${v.referencia}): no se compara.` }
  return {
    estado: 'ok',
    referencia: v.referencia,
    creadaEn: g.creadaEn || null,
    caducada: g.caducada,
    simulado: v.simulado,
    precios: g.precios.map(aPrecio),
  }
}
