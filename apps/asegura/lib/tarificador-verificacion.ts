// Aviso de verificación humana — la parte con BD (08/10/2026). Reglas puras en `tarificador-verificacion-reglas.ts`.
// Plataforma (cron) lee `pendientesVerificacion` y, SOLO si el Telegram salió, llama a `marcarAvisadosVerificacion`.
// Todo por `correduria_id`. Sin SQL nuevo: la marca vive en el jsonb `error`.
import { prisma } from './tenant'
import { avisosPendientes, type AvisoVerificacion, type FilaVerificacion } from './tarificador-verificacion-reglas'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Solo los de los últimos días: un trabajo antiguo ya lo vio alguien o no importa. */
const VENTANA_DIAS = 3
const MAX = 20

export async function pendientesVerificacion(correduriaId: string): Promise<AvisoVerificacion[]> {
  const filas = await prisma.$queryRaw<FilaVerificacion[]>`
    select id::text as id, compania, ramo, estado, error, terminado_at
    from seguros.tarificacion_trabajos
    where correduria_id = ${correduriaId}::uuid and estado = 'requiere_humano'
      and coalesce(terminado_at, updated_at) > now() - make_interval(days => ${VENTANA_DIAS}::int)
      and (error ->> 'avisadoHumanoEn') is null
      and (error ->> 'mensaje') like '%requiere_verificacion_humana:%'
    order by coalesce(terminado_at, updated_at) desc
    limit ${MAX}`
  return avisosPendientes(filas)
}

/** Marca (idempotente) los trabajos avisados. Devuelve cuántos se marcaron ahora; los ya marcados no cuentan. */
export async function marcarAvisadosVerificacion(correduriaId: string, ids: readonly string[]): Promise<number> {
  const limpios = [...new Set(ids.filter((i) => UUID.test(i)))].slice(0, MAX)
  if (limpios.length === 0) return 0
  const r = await prisma.$queryRaw<{ id: string }[]>`
    update seguros.tarificacion_trabajos
    set error = error || jsonb_build_object('avisadoHumanoEn', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
    where correduria_id = ${correduriaId}::uuid and id = any(${limpios}::uuid[]) and estado = 'requiere_humano'
      and (error ->> 'avisadoHumanoEn') is null
    returning id::text as id`
  return r.length
}
