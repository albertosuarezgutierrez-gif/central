// Campaña «app en el aviso de vencimiento» (`aviso_venc_app`, 31/10/2026): la parte con BD. Lo puro
// (texto, cuándo se muestra, cuándo se registra) vive en `correo-avisos-intranet.ts`.
//
// Por qué aquí y no en el cron de vencimientos: `avisos-vencimiento.ts` solo recorre `portal_obligacion`,
// que nace al abrir la bóveda (quien ya usa la app). El aviso de vencimiento del cliente que NUNCA ha
// entrado sale por `avisos-intranet.ts` (vencimiento derivado de la póliza en vigor, 27/09/2026).
//
// Reglas:
//  - `null` en cualquier lectura = «no se sabe» → NO se muestra el bloque (estado conservador).
//  - El ref se genera aquí, pero la fila de `campana_envio` SOLO se escribe tras el envío aceptado
//    (`registrarPresentacionEnviada`), nunca en el ensayo, y nunca toca `portal_aviso_enviado` ni los sellos.
//  - Si la persona ya tiene fila en esta campaña (por ficha o por correo), el enlace va SIN `?r=`:
//    el ref no se guarda en claro y no se inventa atribución.
//
// 🔒 Sin `seguros.` en el SQL: `prismaAsegura()` ya conecta con `?schema=seguros`.
import { generarRef, hashRef } from '@central/module-seguros/presentacion-app-ref'
import { computeEmailLookupHash } from '@central/module-seguros-pii'
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'
import { CAMPANA_AVISO_VENC_APP, debePresentarApp, enlacePresentarApp } from './correo-avisos-intranet'
import { estadoPortalDeFicha } from './invitacion-portal'
import { campanaMigrada, loteDeHoy } from './presentacion-app'

export const ACTOR_AVISO_VENC_APP = 'cron-avisos-intranet'

export type PresentacionPreparada = {
  enlace: string
  /** `null` = la persona ya estaba en la campaña: enlace sin `?r=`, nada que registrar. */
  ref: string | null
  emailHash: string | null
}

/**
 * Decide si este correo lleva el bloque y con qué enlace. NO escribe nada. `null` = sin bloque.
 * Solo se llama con envío real por delante (quien llama ya ha salido en modo cuenta).
 */
export async function prepararPresentacionApp(p: {
  correduriaId: string
  clienteId: string
  destino: string
  portal: string
  tiposNuevos: readonly string[]
}): Promise<PresentacionPreparada | null> {
  // Barato primero: sin vencimiento entre los nuevos no se mira nada más.
  if (!p.tiposNuevos.includes('obligacion_en_ventana')) return null
  try {
    const ficha = await estadoPortalDeFicha(p.correduriaId, p.clienteId)
    if (!debePresentarApp(p.tiposNuevos, ficha)) return null
    if (!(await campanaMigrada())) return null
    let emailHash: string | null
    try {
      emailHash = computeEmailLookupHash(p.destino)
    } catch {
      emailHash = null
    }
    const ya = await prismaAsegura().$queryRaw<{ n: bigint }[]>(Prisma.sql`
      select count(*)::bigint as n from campana_envio k
      where k.correduria_id = ${p.correduriaId}::uuid and k.campana = ${CAMPANA_AVISO_VENC_APP}
        and (k.cliente_id = ${p.clienteId}::uuid or (${emailHash}::text is not null and k.email_lookup_hash = ${emailHash}))`)
    const n = ya[0]?.n
    if (n === undefined) return null
    if (Number(n) > 0) return { enlace: enlacePresentarApp(null, p.portal), ref: null, emailHash }
    const ref = generarRef()
    return { enlace: enlacePresentarApp(ref, p.portal), ref, emailHash }
  } catch (e) {
    // «No he podido mirar» no autoriza a presentar la app: sin bloque, el aviso sale igual.
    console.error('[asegura/aviso-venc-app] sin bloque de la app (lectura fallida):', e instanceof Error ? e.message : e)
    return null
  }
}

/**
 * La fila de `campana_envio` del correo YA aceptado. No lanza: un fallo aquí no puede afectar al aviso
 * ni a su sello (solo se pierde la atribución de ese enlace, y se dice en el log).
 * `on conflict do nothing`: si otra pasada la escribió entre medias, su ref es el que atribuye.
 */
export async function registrarPresentacionEnviada(
  correduriaId: string,
  clienteId: string,
  prep: PresentacionPreparada,
): Promise<void> {
  if (prep.ref === null) return
  try {
    const { lote, fecha } = await loteDeHoy(correduriaId, CAMPANA_AVISO_VENC_APP)
    const n = await prismaAsegura().$executeRaw(Prisma.sql`
      insert into campana_envio (correduria_id, cliente_id, campana, email_lookup_hash, ref_hash, lote, lote_fecha, variante, estado, creado_por)
      values (${correduriaId}::uuid, ${clienteId}::uuid, ${CAMPANA_AVISO_VENC_APP}, ${prep.emailHash}, ${hashRef(prep.ref)},
              ${lote}::int, ${fecha}::date, 'A', 'enviado', ${ACTOR_AVISO_VENC_APP})
      on conflict do nothing`)
    if (n !== 1) console.warn('[asegura/aviso-venc-app] fila de campaña ya existente: este enlace no atribuirá')
  } catch (e) {
    console.error('[asegura/aviso-venc-app] ENVIADO SIN FILA DE CAMPAÑA (el ?r= no atribuirá):', e instanceof Error ? e.message : e)
  }
}
