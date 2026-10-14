// Instancia real de `esquema-opcional.ts` contra la BD (schema `seguros`). Ver ese fichero.
import { prisma } from './tenant.ts'
import { crearEsquemaOpcional, type ElementoEsquema } from './esquema-opcional.ts'

async function consultar(e: ElementoEsquema): Promise<boolean> {
  if (e.tipo === 'tabla') {
    const f = await prisma.$queryRaw<{ ok: boolean }[]>`select to_regclass(${'seguros.' + e.tabla}) is not null as ok`
    return f[0]?.ok === true
  }
  const f = await prisma.$queryRaw<{ ok: boolean }[]>`
    select exists (select 1 from information_schema.columns
                    where table_schema = 'seguros' and table_name = ${e.tabla} and column_name = ${e.columna}) as ok`
  return f[0]?.ok === true
}

export const esquema = crearEsquemaOpcional({ consultar })

export const hayBotVersion = () => esquema.existeColumna('tarificacion_trabajos', 'bot_version')
export const hayPasos = () => esquema.existeTabla('tarificacion_trabajo_pasos')
// Emisión asistida (SQL 2026-10-10_tarificador_emision): sin él, la emisión responde 503 y la firma no guarda ipid_huella.
export const hayEmision = () => esquema.existeTabla('tarificacion_emision_autorizacion')
export const hayIpidHuella = () => esquema.existeColumna('presupuesto', 'ipid_huella')
// Explorador IA (SQL 2026-10-13_tarificador_explorador): sin él, `/api/tarificador/explorador/*` responde 503.
export const hayExplorador = () => esquema.existeTabla('tarificador_exploracion_pasos')
// F2 del plan de robustez (SQL 2026-10-14e_tarificador_robustez_f2): sin él, lo aprendido sigue sin confianza, no hay corte
// por compañía/ramo y un atasco cae a `error_definitivo` como antes.
export const hayConfianzaAprendido = () => esquema.existeColumna('tarificador_conocimiento', 'descartado_at')
export const hayPausas = () => esquema.existeTabla('tarificador_pausas')
export const hayAtascos = () => esquema.existeTabla('tarificador_atascos')
