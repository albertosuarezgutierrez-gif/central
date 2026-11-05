// PATCH /api/operador/contabilidad — el OPERADOR fija la empresa de contabilidad del taller (0010). El dueño no puede: si la editara,
// podría volcar la facturación de su taller en OTRA empresa. Cuerpo { tallerId, contabilidadEmpresaId (uuid | null) }.
import { z } from 'zod'

const Entrada = z.object({ tallerId: z.string().uuid(), contabilidadEmpresaId: z.string().uuid().nullable() }).strict()
const json = (o: unknown, status: number) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

export function crearManejadorVinculoContabilidad(deps: { autorizado(req: Request): boolean; fijar(tallerId: string, empresaId: string | null): Promise<boolean> }) {
  return async function PATCH(req: Request): Promise<Response> {
    if (!deps.autorizado(req)) return json({ error: 'No autorizado' }, 401)
    const b = Entrada.safeParse(await req.json().catch(() => null))
    if (!b.success) return json({ error: 'Faltan tallerId (uuid) y contabilidadEmpresaId (uuid o null)' }, 400)
    const empresa = b.data.contabilidadEmpresaId ? b.data.contabilidadEmpresaId.toLowerCase() : null
    if (!(await deps.fijar(b.data.tallerId, empresa))) return json({ error: 'Taller no encontrado' }, 404)
    return json({ tallerId: b.data.tallerId, contabilidadEmpresaId: empresa }, 200)
  }
}
