// Generación de avisos de UNA empresa (la usa el cron diario) y manejador del cron. Sin BD directa: `RepoContable` inyectado.
// 🚨 NO envía nada a nadie: los avisos solo se guardan en la app (campana). El canal externo es una interfaz NO conectada.
import {
  aFechaISO, canalNoConectado, evaluarAvisos, LIMITE_EFECTIVO_CENT, previsionTesoreria, serieTemporal, sumarDias, vencimientosEstimados,
  type CanalAviso,
} from '@central/module-contabilidad'
import type { RepoContable } from './repo.ts'
import { bearerValido } from './secretos.ts'

export type ResultadoAvisos = { evaluados: number; nuevos: number }

export async function generarAvisosEmpresa(repo: RepoContable, hoy: Date, canal: CanalAviso = canalNoConectado): Promise<ResultadoAvisos> {
  const emp = await repo.empresa()
  if (!emp || (emp.forma !== 'sociedad' && emp.forma !== 'autonomo')) return { evaluados: 0, nuevos: 0 }
  const hoyISO = aFechaISO(hoy)
  const sumas = await repo.sumasMensuales({ hasta: hoyISO })
  const mensual = sumas.length ? serieTemporal(sumas, 'mes', hoy, 6) : null
  const caja = mensual?.at(-1)?.caja ?? null
  const partidas = await repo.partidasPorDocumento(['43', '40', '41'], { hasta: hoyISO })
  const prevision = previsionTesoreria({ saldoCaja: caja, vencimientos: vencimientosEstimados(partidas), hoy })
  const hechos = await repo.contarHechos()
  const efectivo = await repo.cobrosEfectivoAltos({ desde: sumarDias(hoyISO, -30), umbral: LIMITE_EFECTIVO_CENT })
  const avisos = evaluarAvisos({
    hoy, forma: emp.forma, mensual, prevision, hechosRechazados: hechos.rechazados, hechosPendientes: hechos.pendientes, cobrosEfectivo: efectivo,
  })
  let nuevos = 0
  for (const a of avisos) {
    if (await repo.insertarAviso(a)) {
      nuevos += 1
      await canal.enviar({ empresaId: repo.empresaId }, a)
    }
  }
  return { evaluados: avisos.length, nuevos }
}

export const ENV_CRON = 'CRON_SECRET'
/** `Authorization: Bearer <CRON_SECRET>` en tiempo constante; sin la variable configurada NADIE pasa. */
export const cronAutorizado = (req: Request): boolean => bearerValido(req.headers.get('authorization'), ENV_CRON)

export type DepsCron = {
  autorizado(req: Request): boolean
  empresas(): Promise<string[]>
  procesar(empresaId: string): Promise<ResultadoAvisos>
}

const json = (o: unknown, status: number) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

/** GET /api/cron/avisos — 401 sin Bearer válido; una empresa que falla no frena a las demás. */
export function crearManejadorCronAvisos(deps: DepsCron) {
  return async function GET(req: Request): Promise<Response> {
    if (!deps.autorizado(req)) return json({ error: 'No autorizado' }, 401)
    let ids: string[]
    try {
      ids = await deps.empresas()
    } catch (e) {
      console.error('[contabilidad/cron-avisos] no se pudo listar las empresas', e instanceof Error ? e.message : e)
      return json({ error: 'avisos_no_disponibles' }, 500)
    }
    let nuevos = 0
    const fallidas: string[] = []
    for (const id of ids) {
      try {
        nuevos += (await deps.procesar(id)).nuevos
      } catch (e) {
        fallidas.push(id)
        console.error('[contabilidad/cron-avisos] empresa fallida', id, e instanceof Error ? e.message : e)
      }
    }
    return json({ empresas: ids.length, nuevos, fallidas: fallidas.length }, fallidas.length > 0 && fallidas.length === ids.length && ids.length > 0 ? 500 : 200)
  }
}
