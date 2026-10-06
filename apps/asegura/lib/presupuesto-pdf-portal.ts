// El estudio comparativo en PDF para el CLIENTE, por el puerto del portal (05/10/2026, F4).
//
// 🚨 Aislamiento: la ficha sale de `portal_vinculo` (`fichaPropiaDeRecurso`: la dueña del presupuesto si está vinculada
// con nivel de operar), NUNCA del cuerpo, y el presupuesto
// se busca por id + correduría + ESA ficha. Con BYPASSRLS un id ajeno no falla: da los datos de otro.
// Solo sale lo que ya salió hacia el cliente (`enviado_at`) y solo el de origen `ofertas`: el PDF del
// presupuesto de Avant2 lleva el DNI entero y se descarga por el puerto del operador, no por aquí.

import { prismaAsegura } from './asegura-db'
import { fichaPropiaDeRecurso } from './contacto-portal'
import { leerPdfPresupuesto } from './presupuesto-pdf-lectura'
import { nombreFicheroOfertas, pdfEstudioOfertas } from './presupuesto-pdf-ofertas'
import { origenPresupuesto } from './presupuesto-origen'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ResultadoPdfPortal =
  | { estado: 'ok'; bytes: Uint8Array; nombre: string }
  | { estado: 'no_encontrado' }
  /** Existe pero no es de los que se descargan desde el portal (otro origen, sin enviar o estudio ilegible). */
  | { estado: 'no_disponible' }
  | { estado: 'sin_ficha' } | { estado: 'varias_fichas' } | { estado: 'sin_permiso' } | { estado: 'error'; causa: string }

export async function pdfEstudioParaPortal(correduriaId: string, identidadId: string, presupuestoId: string): Promise<ResultadoPdfPortal> {
  if (!UUID.test(presupuestoId)) return { estado: 'no_encontrado' }
  const ficha = await fichaPropiaDeRecurso(correduriaId, identidadId, 'presupuesto', presupuestoId)
  if (ficha.estado === 'ajena') return { estado: 'no_encontrado' }
  if (ficha.estado !== 'ok') return ficha
  const p = await prismaAsegura().presupuesto.findFirst({
    where: { id: presupuestoId, correduriaId, clienteId: ficha.clienteId },
    select: { origen: true, enviadoAt: true, retiradoAt: true },
  })
  if (!p) return { estado: 'no_encontrado' }
  // Retirado por el corredor = esos precios ya no se le ofrecen: tampoco se descargan.
  if (origenPresupuesto(p.origen) !== 'ofertas' || p.enviadoAt === null || p.retiradoAt !== null) return { estado: 'no_disponible' }
  const l = await leerPdfPresupuesto(correduriaId, presupuestoId)
  if (l.estado === 'no_encontrado') return { estado: 'no_encontrado' }
  if (l.estado !== 'ok' || l.origen !== 'ofertas') return { estado: 'no_disponible' }
  return { estado: 'ok', bytes: await pdfEstudioOfertas(l.datos), nombre: nombreFicheroOfertas(l.datos) }
}
