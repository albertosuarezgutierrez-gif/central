import { NextResponse } from 'next/server'
import { sendWebPush } from '@central/core-push'
import {
  DIAS_ANTELACION_MAX,
  debeAvisarPush,
  motivoSinPush,
  resolverPreferenciasAvisos,
  textoPushObligacion,
  type PreferenciasAvisosEfectivas,
} from '@central/module-seguros-portal'
import { POLIZA_ESTADOS_VIGENTES, WHERE_CARTERA_VIVA } from '@central/module-seguros'

import { isCronAuthorized } from '@/lib/cron-auth'
import { anulacionesPendientes } from '@/lib/anulacion-firma'
import { mapConConcurrencia } from '@/lib/concurrencia'
import { TAM_PAGINA_PUSH, reunirAvisables } from '@/lib/criba-avisos-push'
import { prisma } from '@/lib/db'
import { PREFIJO_PEDIDA } from '@/lib/captacion-declarada'
import { obligacionesDebidasDeIdentidad, sinVencimientoAportadaDuplicado } from '@/lib/obligaciones-debidas'
import { OPCIONES_AVISO, cargarVapid, topicAviso } from '@/lib/push-vapid'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MS_DIA = 86_400_000
/** Consultas simultáneas al puente de asegura (anulaciones pendientes) por pasada del cron. */
const CONCURRENCIA_PUENTE = 5

/**
 * GET /api/cron/avisos-push — un push por obligación a punto de dejar de ser accionable, al
 * dispositivo (o dispositivos) que la identidad tenga suscritos.
 *
 * Hermano del `GET /api/cron/avisos-vencimiento` de `apps/asegura`, con el que NO comparte sello:
 * ese vive allí porque necesita el email en claro (el portal solo guarda hashes); este vive aquí
 * porque la suscripción push SÍ es suya — no hay dato personal que descifrar.
 *
 * Sin `CRON_SECRET` no se autoriza a nadie (`lib/cron-auth.ts`) y sin las claves VAPID el endpoint
 * responde 503: mandar sin ellas no es posible, así que fingir un `{avisadas:0}` sería la misma
 * mentira que un catch que devuelve `[]`.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const cargada = await cargarVapid()
  if (!cargada.ok) {
    return NextResponse.json({ estado: 'error', causa: 'sin_vapid' }, { status: 503 })
  }
  const vapid = cargada.vapid

  const hoy = new Date()
  // El rango en SQL es una CRIBA (para no traer decenas de miles de filas de golpe); quien
  // decide de verdad es `debeAvisarPush()`, más abajo — mismo patrón que
  // `apps/asegura/lib/avisos-vencimiento.ts`.
  // La criba llega hasta la MAYOR antelación que se puede elegir (30 días, «Configuración»); el orden
  // ascendente deja primero las más cercanas, así que el tope no recorta a quien tiene los 7 de siempre.
  const ventana = { avisadaPushAt: null, fechaAccionable: { gte: hoy, lte: new Date(hoy.getTime() + DIAS_ANTELACION_MAX * MS_DIA) } }
  // Las identidades que se saltan a propósito («solo correo», «no molestar») NO pueden llenar el lote:
  // se pagina por cursor (con tope de páginas) y el filtro de preferencias se aplica a cada página.
  let prefsFallo = false
  let enVentana: Array<{ id: string; identidadId: string; polizaId: string | null; polizaDeclaradaId: string | null; tipo: string; titulo: string; fechaAccionable: Date }>
  // Preferencias de «Configuración» (13/10/2026): antelación, canal y «no molestar» de cada identidad.
  // Sin fila = lo de siempre (`resolverPreferenciasAvisos(null)`: 7 días, push, sin franja). Si no se
  // pueden leer NO se manda con valores supuestos (podría saltarse un «no molestar»): 500 y se
  // reintenta en la pasada siguiente — nada queda sellado.
  let omitidasPorPreferencia = 0
  try {
    const r = await reunirAvisables({
      leerPagina: (cursorId) =>
        prisma.portalObligacion.findMany({
          where: ventana,
          select: { id: true, identidadId: true, polizaId: true, polizaDeclaradaId: true, tipo: true, titulo: true, fechaAccionable: true },
          orderBy: [{ fechaAccionable: 'asc' }, { id: 'asc' }],
          take: TAM_PAGINA_PUSH,
          ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
        }),
      filtrar: async (filas) => {
        const idsCandidatas = [...new Set(filas.map((o) => o.identidadId))]
        let prefsPorIdentidad: Map<string, PreferenciasAvisosEfectivas>
        try {
          const guardadas = await prisma.portalPreferenciasAvisos.findMany({
            where: { identidadId: { in: idsCandidatas } },
            select: { identidadId: true, canal: true, diasAntelacion: true, noMolestarDesde: true, noMolestarHasta: true },
          })
          prefsPorIdentidad = new Map(guardadas.map((g) => [g.identidadId, resolverPreferenciasAvisos(g)]))
        } catch (e) {
          prefsFallo = true
          console.error('[avisos-push] no se han podido leer las preferencias:', e instanceof Error ? e.message : e)
          throw e
        }
        const prefsDe = (identidadId: string) => prefsPorIdentidad.get(identidadId) ?? resolverPreferenciasAvisos(null)
        // «Solo por correo» o dentro de su franja de «no molestar» (hora de Madrid): esa identidad no recibe
        // push en esta pasada y NO se sella — se reintenta en la siguiente.
        return filas.filter((o) => {
          const p = prefsDe(o.identidadId)
          if (!debeAvisarPush({ fechaAccionable: o.fechaAccionable, avisadaPushAt: null }, hoy, p.diasAntelacion)) return false
          if (motivoSinPush(p, hoy) !== null) {
            omitidasPorPreferencia += 1
            return false
          }
          return true
        })
      },
    })
    enVentana = r.filas
  } catch (e) {
    if (!prefsFallo) throw e
    return NextResponse.json({ estado: 'error', causa: 'preferencias_no_leidas' }, { status: 500 })
  }

  // 🚨 Re-comprobar que la póliza SIGUE viva Y sigue siendo DE ESA IDENTIDAD: una obligación se
  // deriva cuando el cliente entra en su bóveda (`sincronizarObligacionesDeIdentidad`) y puede no
  // volver a entrar nunca — si CIMA cancela la póliza después, o el vínculo se revoca, la fila de
  // obligación se queda huérfana y este cron mandaría un push diciéndole a alguien que decida
  // sobre un seguro que ya no es suyo. La comprobación pasa por `portal_vinculo` (la única costura
  // identidad↔cliente, igual que `lib/cartera-lectura.ts`), no solo por el estado de la póliza:
  // un `polizaId` correcto pero de un cliente que esta identidad ya no tiene vinculado no cuenta.
  // Una obligación SIN póliza (declarada por la persona) no pasa por aquí: sigue siendo candidata igual.
  const identidadIds = [...new Set(enVentana.map((o) => o.identidadId))]
  const vinculos = identidadIds.length
    ? await prisma.portalVinculo.findMany({
        where: { identidadId: { in: identidadIds } },
        select: { identidadId: true, clienteId: true },
      })
    : []
  const clientesPorIdentidad = new Map<string, Set<string>>()
  for (const v of vinculos) {
    const set = clientesPorIdentidad.get(v.identidadId) ?? new Set<string>()
    set.add(v.clienteId)
    clientesPorIdentidad.set(v.identidadId, set)
  }

  const polizaIds = [...new Set(enVentana.map((o) => o.polizaId).filter((id): id is string => id !== null))]
  const polizasVivas = polizaIds.length
    ? await prisma.poliza.findMany({
        where: { id: { in: polizaIds }, ...WHERE_CARTERA_VIVA, mergedIntoPolizaId: null, sustituidaAt: null, estado: { in: [...POLIZA_ESTADOS_VIGENTES] } },
        select: { id: true, clienteId: true },
      })
    : []
  const clientePorPoliza = new Map(polizasVivas.map((p) => [p.id, p.clienteId]))

  // Por identidad: la decisión de qué es «debido» vive en `obligacionesDebidasDeIdentidad` (puro, con cepos);
  // aquí solo se orquesta. Si el puente de anulaciones falla, las obligaciones de póliza de esa identidad se RETIENEN (ni push ni
  // sello: se reintentan en la siguiente pasada; `saltadas` cuenta esas identidades) y sus recordatorios propios siguen y un fallo de BD en una identidad no aborta al resto.
  const porIdentidad = new Map<string, typeof enVentana>()
  for (const o of enVentana) porIdentidad.set(o.identidadId, [...(porIdentidad.get(o.identidadId) ?? []), o])

  let candidatas = 0
  let avisadas = 0
  let sinSuscripcion = 0
  let sinExito = 0
  let saltadas = 0
  let fallidas = 0

  // En paralelo con tope (CONCURRENCIA_PUENTE): en serie, N identidades = N viajes seguidos al puente.
  const lotes = [...porIdentidad.entries()]
  await mapConConcurrencia(lotes, CONCURRENCIA_PUENTE, async ([identidadId, obligaciones]) => {
    try {
      // El vencimiento de una APORTADA ya lo avisa `avisos-cima` (`vencimiento_aportada`): uno solo por fecha.
      const [silenciados, pedidas] = obligaciones.some((o) => o.tipo === 'poliza' && o.polizaDeclaradaId !== null)
        ? await Promise.all([
            prisma.portalAvisoSilenciado.findMany({ where: { identidadId }, select: { tipo: true } }),
            prisma.portalAvisoLeido.findMany({ where: { identidadId, clave: { startsWith: PREFIJO_PEDIDA } }, select: { clave: true } }),
          ])
        : [[], []]
      const sinDuplicado = sinVencimientoAportadaDuplicado(obligaciones, {
        silenciados: new Set(silenciados.map((s) => s.tipo)),
        captacionPedida: new Set(pedidas.map((p) => p.clave.slice(PREFIJO_PEDIDA.length))),
      })
      const r = await obligacionesDebidasDeIdentidad({
        obligaciones: sinDuplicado,
        clientesVinculados: clientesPorIdentidad.get(identidadId) ?? new Set<string>(),
        clientePorPoliza,
        leerFirmas: () => anulacionesPendientes(identidadId).catch(() => null),
      })
      // Puente caído: las de póliza quedan retenidas (sin push ni sello, reintento en la próxima pasada); los
      // recordatorios propios siguen su curso.
      if (r.retenidas > 0) saltadas += 1
      candidatas += r.debidas.length
      if (r.debidas.length === 0) return

      const subs = await prisma.portalPushSuscripcion.findMany({ where: { identidadId } })
      if (subs.length === 0) {
        sinSuscripcion += r.debidas.length
        return
      }

      for (const o of r.debidas) {
        // 🚨 El texto lo decide el TIPO, en el módulo puro: aquí entran también los
        // recordatorios propios (ITV, caldera, extintores…), y el texto de
        // renovación de póliza sobre una ITV le dice a alguien que se queda sin
        // cobertura cuando no es verdad.
        const { title, body } = textoPushObligacion({ tipo: o.tipo, titulo: o.titulo })
        const payload = { title, body, icon: '/icono-app', data: { url: '/boveda' } }

        let algunaOk = false
        for (const s of subs) {
          const res = await sendWebPush(vapid, { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.authKey } }, payload, {
            ...OPCIONES_AVISO,
            topic: topicAviso(`obligacion:${o.id}`),
          })
          if (res.ok) algunaOk = true
          // Suscripción muerta (404/410): se borra para no seguir intentando en cada pasada.
          if (res.gone) {
            await prisma.portalPushSuscripcion.deleteMany({ where: { id: s.id, identidadId } }).catch(() => {})
          }
        }

        // Se sella SOLO si al menos un envío se aceptó (mismo criterio que `avisada_at` del correo):
        // si todos fallaron se reintenta en la siguiente pasada, no se finge un envío que no salió.
        if (algunaOk) {
          await prisma.portalObligacion.update({ where: { id: o.id }, data: { avisadaPushAt: new Date() } })
          avisadas += 1
        } else {
          sinExito += 1
        }
      }
    } catch (e) {
      fallidas += 1
      console.error('[avisos-push] fallo en una identidad; se sigue con las demás:', e instanceof Error ? e.message : e)
    }
  })

  return NextResponse.json({ estado: 'ok', candidatas, avisadas, sinSuscripcion, sinExito, saltadas, fallidas, omitidasPorPreferencia })
}
