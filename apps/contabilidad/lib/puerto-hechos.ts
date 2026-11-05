// Manejador de `POST /api/hechos` (separado de la ruta para probarlo con dependencias inyectadas).
//
// Orden deliberado (nada del cuerpo se lee antes de autenticar):
//   1. `X-Origen-App` es una vertical conocida y `Authorization: Bearer` coincide con SU secreto → si no, 401 (mismo cuerpo siempre).
//   2. Cuerpo válido (`parsearEntradaHecho`) → si no, 400 con la lista de errores de forma.
//   3. Dentro de `conEmpresa(empresaId)`: la empresa autoriza a esa vertical (`origenes_autorizados`) → si no, 403. Empresa
//      inexistente responde IGUAL (403): el puerto no es un oráculo de qué empresas existen.
//   4. `recibirHecho` (idempotente): 201 asentado · 200 duplicado · 202 pendiente_de_regla · 422 rechazado · 409 conflicto.
import type { HechoContable } from '@central/module-contabilidad'
import { parsearEntradaHecho } from './hecho-entrada.ts'
import { bearerValido, envSecretoHechos, esAppOrigen } from './secretos.ts'
import type { RepoContable } from './repo.ts'
import type { ResultadoHecho } from './servicio.ts'

export type DepsPuerto = {
  /** Abre la transacción de la empresa (RLS) y entrega su repositorio. */
  conRepo<R>(empresaId: string, fn: (repo: RepoContable) => Promise<R>): Promise<R>
  recibir(repo: RepoContable, app: string, hecho: HechoContable): Promise<ResultadoHecho>
  /** Inyectable en tests; por defecto Bearer contra `CONTABILIDAD_HECHOS_SECRET_<APP>`. */
  autorizado?(req: Request, app: string): boolean
}

const json = (o: unknown, status: number) =>
  new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

export function autorizadoPorDefecto(req: Request, app: string): boolean {
  return esAppOrigen(app) && bearerValido(req.headers.get('authorization'), envSecretoHechos(app))
}

export function crearManejadorHechos(deps: DepsPuerto) {
  const autorizado = deps.autorizado ?? autorizadoPorDefecto
  return async function POST(req: Request): Promise<Response> {
    const app = (req.headers.get('x-origen-app') ?? '').trim().toLowerCase()
    if (!esAppOrigen(app) || !autorizado(req, app)) return json({ error: 'No autorizado' }, 401)
    const cuerpo = await req.json().catch(() => null)
    const p = parsearEntradaHecho(cuerpo)
    if (!p.ok) return json({ error: 'hecho_no_valido', errores: p.errores }, 400)
    const { empresaId, hecho } = p.valor
    const r = await deps.conRepo(empresaId, async (repo) => {
      if (!(await repo.origenAutorizado(app))) return null
      return deps.recibir(repo, app, hecho)
    })
    if (!r) return json({ error: 'origen_no_autorizado' }, 403)
    switch (r.resultado) {
      case 'asentado':
        return json(r, r.duplicado ? 200 : 201)
      case 'pendiente_de_regla':
        return json(r, r.duplicado ? 200 : 202)
      case 'rechazado':
        return json(r, 422)
      case 'conflicto':
        return json(r, 409)
    }
  }
}
