import { NextResponse } from 'next/server'
import { sendWebPush } from '@central/core-push'
import { planificarAvisos, textoPushCima, type PolizaParaAviso } from '@central/module-seguros-portal'

import { registrarUso } from '@/lib/autorizaciones'
import { carteraALaVista, carteraDeIdentidad, type TitularPortal } from '@/lib/cartera-lectura'
import { polizasNuevasDeIdentidad } from '@/lib/polizas-nuevas'
import { isCronAuthorized } from '@/lib/cron-auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/** Tope por pasada: cada identidad es una lectura de cartera entera. */
const MAX_IDENTIDADES = 300
/** Se deja de empezar identidades a los 50 s: cortar a mitad dejaría la pasada sin su recuento. */
const PRESUPUESTO_MS = 50_000

/**
 * GET /api/cron/avisos-cima — push de lo que ha traído CIMA: recibo nuevo al cobro, recibo
 * devuelto y movimientos de un siniestro. Corre después de la segunda ingesta del día.
 *
 * 🔒 Los permisos NO se recalculan aquí: se lee `carteraDeIdentidad`, la MISMA lectura que pinta la
 * bóveda, con sus vínculos, autorizaciones y campos capados. Lo que una identidad no puede ver en
 * pantalla no puede llegarle en una notificación. Es una lectura de sistema, no un acceso de la
 * persona. Pero un aviso sobre la póliza de OTRO sí es un dato servido: por eso las ajenas solo se
 * avisan con «Acceso total» (el permiso que ya deja actuar en su nombre) y, cuando sale el aviso, se
 * anota como uso de esa autorización — el otorgante ve quién supo qué y cuándo.
 *
 * Entrega «al menos una vez»: si el sello falla después de un envío aceptado, la pasada siguiente
 * repite el aviso. Se prefiere a perderlo.
 *
 * Qué es novedad, la semilla silenciosa y el texto (sin importes: sale en la pantalla de bloqueo)
 * se deciden en `@central/module-seguros-portal/avisos-cima`.
 *
 * Sin `CRON_SECRET` → 401; sin claves VAPID → 503, igual que `avisos-push`.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
  const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || ''
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return NextResponse.json({ estado: 'error', causa: 'sin_vapid' }, { status: 503 })
  }
  const vapid = { publicKey: VAPID_PUBLIC, privateKey: VAPID_PRIVATE, subject: 'mailto:hola@grupoasegura.es' }

  // Solo quien tiene un dispositivo suscrito: sin suscripción no hay a quién avisar. Su primera
  // pasada tras suscribirse es la semilla (se sella todo, no se envía nada).
  // `groupBy` y no `findMany({ distinct })`: en Prisma 5 el `distinct` se aplica en memoria DESPUÉS
  // del `take`, y el tope contaría suscripciones, no personas. Orden estable por id.
  const conSub = await prisma.portalPushSuscripcion.groupBy({
    by: ['identidadId'],
    orderBy: { identidadId: 'asc' },
    take: MAX_IDENTIDADES,
  })
  const inicio = Date.now()
  let cortado = false

  let avisadas = 0
  let sembradas = 0
  let sinNovedad = 0
  let sinExito = 0
  let fallos = 0

  for (const { identidadId } of conSub) {
    if (Date.now() - inicio > PRESUPUESTO_MS) {
      cortado = true
      break
    }
    try {
      const cartera = carteraALaVista(await carteraDeIdentidad(identidadId))
      const polizas: PolizaParaAviso[] = [
        ...aPolizas(cartera.propias, false),
        ...aPolizas(cartera.autorizadas.filter(conAccesoTotal), true),
      ]
      // Pólizas nuevas del tomador (26/09/2026): «tienes una póliza nueva», con el cambio de compañía si lo es.
      const nuevas = await polizasNuevasDeIdentidad(identidadId)
      if (polizas.length === 0 && nuevas.length === 0) {
        sinNovedad += 1
        continue
      }

      const [selladas, silenciados] = await Promise.all([
        prisma.portalAvisoCima.findMany({ where: { identidadId }, select: { clave: true } }),
        prisma.portalAvisoSilenciado.findMany({ where: { identidadId }, select: { tipo: true } }),
      ])
      const plan = planificarAvisos(
        polizas,
        new Set(selladas.map((s) => s.clave)),
        new Set(silenciados.map((s) => s.tipo)),
        new Date(),
        nuevas,
      )

      if (plan.sellarSiempre.length > 0) {
        await prisma.portalAvisoCima.createMany({
          data: plan.sellarSiempre.map((s) => ({ identidadId, clave: s.clave, tipo: s.tipo })),
          skipDuplicates: true,
        })
        if (plan.enviar.length === 0) sembradas += 1
      }

      const texto = textoPushCima(plan.enviar)
      if (!texto) {
        if (plan.sellarSiempre.length === 0) sinNovedad += 1
        continue
      }

      const subs = await prisma.portalPushSuscripcion.findMany({ where: { identidadId } })
      let algunaOk = false
      for (const s of subs) {
        const res = await sendWebPush(
          vapid,
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.authKey } },
          { ...texto, icon: '/icono-app', data: { url: '/boveda' } },
        )
        if (res.ok) algunaOk = true
        if (res.gone) {
          await prisma.portalPushSuscripcion.deleteMany({ where: { id: s.id, identidadId } }).catch(() => {})
        }
      }

      // Se sella SOLO si algún envío se aceptó: si fallan todos, se reintenta la pasada siguiente
      // en vez de dar por avisado algo que no salió.
      if (algunaOk) {
        await prisma.portalAvisoCima.createMany({
          data: plan.enviar.map((e) => ({ identidadId, clave: e.clave, tipo: e.tipo, enviado: true })),
          skipDuplicates: true,
        })
        avisadas += 1
        // El aviso sobre la póliza de otro es un acceso a su dato: se anota como tal.
        const ajenas = new Set(plan.enviar.map((e) => e.polizaId))
        const usadas = cartera.autorizadas
          .filter((t) => conAccesoTotal(t) && t.polizas.some((p) => ajenas.has(p.id)))
          .flatMap((t) => t.autorizacion?.ids ?? [])
        if (usadas.length > 0) await registrarUso(identidadId, usadas)
      } else {
        sinExito += 1
      }
    } catch (e) {
      // Una identidad rota no tumba la pasada de las demás, pero se CUENTA: un `fallos` > 0 no es
      // «todo en orden».
      console.error('[portal/avisos-cima] identidad', identidadId, e instanceof Error ? e.message : e)
      fallos += 1
    }
  }

  return NextResponse.json({
    estado: fallos > 0 || cortado ? 'parcial' : 'ok',
    identidades: conSub.length,
    tope: conSub.length === MAX_IDENTIDADES,
    cortado,
    avisadas,
    sembradas,
    sinNovedad,
    sinExito,
    fallos,
  })
}

/** Solo «Acceso total»: con «Solo ver» el tercero mira, no gestiona, y el aviso le serviría el dato. */
function conAccesoTotal(t: TitularPortal): boolean {
  return t.autorizacion?.alcances.includes('total') ?? false
}

function aPolizas(titulares: TitularPortal[], ajena: boolean): PolizaParaAviso[] {
  return titulares.flatMap((t) =>
    t.polizas.map((p) => ({
      id: p.id,
      ramo: p.ramo,
      compania: p.compania,
      ajena,
      recibos: p.recibos?.historial ?? null,
      siniestros: p.siniestros?.map((x) => ({ id: x.id, estado: x.estado, fechaHora: x.fechaHora, tramitacion: x.tramitacion })) ?? null,
    })),
  )
}
