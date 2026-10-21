// El ESTUDIO del presupuesto para la página del CLIENTE, por el puerto del portal (21/10/2026). Mismo aislamiento que
// `presupuesto-pdf-portal.ts`: la ficha sale de `portal_vinculo` (`fichaPropiaDeRecurso`), NUNCA del cuerpo, y el
// presupuesto se busca por id + correduría + ESA ficha (con BYPASSRLS un id ajeno no falla: da los datos de otro).
// Solo lo que ya salió hacia el cliente (`enviado_at`), no retirado. Ambos orígenes (Avant2 y ofertas): la vista no
// lleva DNI ni nada interno (`estudio-cliente.ts`, lista blanca). Sin estudio guardado → `sin_estudio` (no es error).

import { prismaAsegura } from './asegura-db'
import { fichaPropiaDeRecurso } from './contacto-portal'
import { origenPresupuesto } from './presupuesto-origen'
import { leerEstudio } from './presupuesto-pdf-cuadro'
import { vistaEstudioCliente, type VistaEstudioCliente } from './estudio-cliente'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ResultadoEstudioPortal =
  | { estado: 'ok'; vista: VistaEstudioCliente }
  | { estado: 'sin_estudio' }
  | { estado: 'no_encontrado' }
  | { estado: 'no_disponible' }
  | { estado: 'sin_ficha' } | { estado: 'varias_fichas' } | { estado: 'sin_permiso' } | { estado: 'error'; causa: string }

export async function estudioParaPortal(correduriaId: string, identidadId: string, presupuestoId: string): Promise<ResultadoEstudioPortal> {
  if (!UUID.test(presupuestoId)) return { estado: 'no_encontrado' }
  const ficha = await fichaPropiaDeRecurso(correduriaId, identidadId, 'presupuesto', presupuestoId)
  if (ficha.estado === 'ajena') return { estado: 'no_encontrado' }
  if (ficha.estado !== 'ok') return ficha
  const p = await prismaAsegura().presupuesto.findFirst({
    where: { id: presupuestoId, correduriaId, clienteId: ficha.clienteId },
    select: {
      origen: true, enviadoAt: true, retiradoAt: true, estudio: true,
      opciones: { where: { ocultaAt: null }, select: { id: true, precioId: true, ofertaId: true, papeles: true } },
    },
  })
  if (!p) return { estado: 'no_encontrado' }
  if (origenPresupuesto(p.origen) === null || p.enviadoAt === null || p.retiradoAt !== null) return { estado: 'no_disponible' }
  const e = leerEstudio(p.estudio)
  if (!e) return { estado: 'sin_estudio' }
  const vista = vistaEstudioCliente(e, p.opciones.map((o) => ({ id: o.id, precioId: o.precioId ?? null, ofertaId: o.ofertaId ?? null, papeles: o.papeles })))
  return vista ? { estado: 'ok', vista } : { estado: 'sin_estudio' }
}
