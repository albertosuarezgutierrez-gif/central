import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { auditado } from '@/lib/auditoria'
import { correduriaUnica } from '@/lib/cartera'
import { prismaAsegura } from '@/lib/asegura-db'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { sincronizarEmisionExterna } from '@/lib/emision-externa'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Vigilancia de las emisiones RETENIDAS por la compañía (30/09/2026). «Retenida» no es un estado
 * propio: es un proyecto `riesgo_condicionado` SIN póliza (derivada). Cada uno se relee con
 * `GET /insurances/{id}` —gratis— y, si la compañía ya lo liberó con nº de póliza, se acuña.
 *
 * `POST` (sin cuerpo). Tope 15 por pasada, los de más tiempo sin mirar primero. Secuencial: un error
 * de un proyecto no para el resto.
 */

const TOPE = 15

type Retenida = { project_id: string; cliente_id: string; updated_at: Date; nombre: string | null; apellidos: string | null }

export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const correduria = await correduriaUnica().catch(() => null)
    if (!correduria) return NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })

    const filas = await prismaAsegura().$queryRaw<Retenida[]>`
      select p.project_id_codeoscopic as project_id, p.cliente_id::text as cliente_id, p.updated_at, c.nombre, c.apellidos
      from codeoscopic_projects p
      left join clientes c on c.id = p.cliente_id and c.correduria_id = p.correduria_id
      where p.correduria_id = ${correduria.id}::uuid and p.estado = 'riesgo_condicionado' and p.poliza_id is null and p.cliente_id is not null
      order by p.updated_at asc
      limit ${TOPE}`

    const cambios: { projectId: string; clienteId: string; cliente: string; compania: string | null; antes: string | null; despues: string | null; numeroPoliza: string | null; polizaId: string | null; descripcion: string }[] = []
    const siguen: { projectId: string; clienteId: string; cliente: string; compania: string | null; desde: string }[] = []
    const errores: { projectId: string; mensaje: string }[] = []

    for (const f of filas) {
      const cliente = [f.nombre, f.apellidos].filter(Boolean).join(' ').trim()
      try {
        const r = await sincronizarEmisionExterna(correduria.id, { projectId: f.project_id, clienteId: f.cliente_id, actor: 'vigilancia-retenidas', escribir: true })
        if (!r.ok) {
          errores.push({ projectId: f.project_id, mensaje: r.mensaje })
        } else if (r.tipo === 'escrito' && r.antes !== r.despues) {
          cambios.push({ projectId: f.project_id, clienteId: f.cliente_id, cliente, compania: r.compania, antes: r.antes, despues: r.despues, numeroPoliza: r.numeroPoliza, polizaId: r.polizaId, descripcion: r.mensaje ? `${r.descripcion} — ${r.mensaje}` : r.descripcion })
        } else if (r.tipo === 'escrito' && r.estado === 'emitido_sin_acunar') {
          // Aprobada con nº pero sin acuñar: NO «sigue retenida». Se cuenta como cambio a mirar.
          cambios.push({ projectId: f.project_id, clienteId: f.cliente_id, cliente, compania: r.compania, antes: r.antes, despues: r.despues, numeroPoliza: r.numeroPoliza, polizaId: null, descripcion: `${r.descripcion}${r.mensaje ? ` — ${r.mensaje}` : ''}` })
        } else {
          siguen.push({ projectId: f.project_id, clienteId: f.cliente_id, cliente, compania: r.tipo === 'escrito' ? r.compania : null, desde: f.updated_at.toISOString() })
        }
      } catch (e) {
        errores.push({ projectId: f.project_id, mensaje: registrarErrorCartera('operador/codeoscopic/retenidas', e) })
      }
    }
    return NextResponse.json({ estado: 'ok', revisadas: filas.length, cambios, siguen, errores })
  } catch (e) {
    return NextResponse.json({ estado: 'error', mensaje: registrarErrorCartera('operador/codeoscopic/retenidas', e) }, { status: 500 })
  }
})
