/**
 * ¿Apagó la persona «avisarme de la caducidad de mi carné»? — para el correo de la intranet (21/10/2026).
 *
 * El interruptor vive en el PORTAL (`seguros.portal_aviso_silenciado`, tipo `vencimiento_carnet`; sin fila =
 * encendido) y es de una IDENTIDAD. El carné, en cambio, cuelga de una FICHA. El puente es el de siempre
 * (`portal_vinculo`, sin el vínculo temporal del CORREDOR; ver `avisos-vencimiento-canal.ts`).
 *
 * 🚨 Reglas:
 *  - Solo cuenta la identidad TITULAR de la ficha (vínculo `gestionar`). Quien la `administrar` (ve y toca el
 *    carné de otra persona en el portal) o tiene `tarjeta`/`completo` NO puede callar el correo de esa persona:
 *    ante la duda, se envía (decisión 21/10/2026).
 *  - Basta UNA identidad titular con el aviso apagado: es una petición expresa de no recibirlo.
 *  - Sin identidad vinculada, o sin fila, se manda (encendido por defecto).
 *  - Lectura fallida → `null` y quien llama MANDA (fail-open): repetir un aviso es mejor que esconder uno.
 *
 * La tabla no tiene GRANT propio para este rol: `prisma_seguros` la lee por los privilegios por defecto del
 * schema (medido para `portal_preferencias_avisos`, mismo caso). Solo se LEE aquí.
 */
import { TIPO_AVISO_VENCIMIENTO_CARNET } from '@central/module-seguros-portal'

import { prismaAsegura } from './asegura-db'
import { registrarErrorCartera } from './error-cartera'
import { fichasConCarnetSilenciado } from './avisos-carnet-silencio-reglas'

const ORIGEN_VINCULO_CORREDOR = 'corredor'

/** `null` = la lectura falló (se manda y se registra). */
export async function leerFichasConCarnetSilenciado(
  db: ReturnType<typeof prismaAsegura>,
  fichaIds: string[],
  contexto = 'avisos-intranet',
): Promise<Set<string> | null> {
  if (fichaIds.length === 0) return new Set()
  try {
    const vinculos = await db.portalVinculo.findMany({
      where: { clienteId: { in: fichaIds }, origen: { not: ORIGEN_VINCULO_CORREDOR } },
      select: { identidadId: true, clienteId: true, nivel: true },
    })
    const identidadIds = [...new Set(vinculos.map((v) => v.identidadId))]
    if (identidadIds.length === 0) return new Set()
    const filas = await db.portalAvisoSilenciado.findMany({
      where: { identidadId: { in: identidadIds }, tipo: TIPO_AVISO_VENCIMIENTO_CARNET },
      select: { identidadId: true },
    })
    return fichasConCarnetSilenciado({ vinculos, silenciadas: new Set(filas.map((f) => f.identidadId)) })
  } catch (e) {
    registrarErrorCartera(`${contexto}/aviso-carnet-silenciado`, e)
    return null
  }
}
