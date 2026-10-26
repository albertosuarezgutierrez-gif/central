// PATRIMONIO (24/10/2026, P13) — el PUSH de los vencimientos del calendario, para el cron `avisos-push`.
//
// ⚠️ EXENTO a propósito de `lib/session` (ver los EXENTOS y CARTERA_SIN_SESION de `test/regression-portal-aislamiento`):
// lo ejecuta el cron autenticado por `CRON_SECRET`, no una persona, así que NO hay cookie y `accesosPatrimonio()` no
// sirve. Por eso este adaptador es MÁS ESTRECHO que la pantalla (fail-closed):
//   · solo avisa del patrimonio de las fichas PROPIAS de la identidad: sus vínculos que OPERAN (`puedeAutorizar`), sin
//     los de la vista de corredor (`origen='corredor'`) y solo fichas vivas — las mismas reglas 1, 2 y 4 de `accesos.ts`;
//   · NO avisa por push de lo que ve como autorizado ni como Dueño (esos los ve en la campana y en la pantalla): lo
//     dudoso cae FUERA. Mandar un push a un tercero sobre el inmueble de otro es peor que no mandarlo.
// Cada consulta parte de `portal_vinculo` de ESA identidad (`identidadId` en el `where`); el texto del push no lleva
// alias ni dirección (`textoPushPatrimonio`). El sello de lo ya enviado es `portal_aviso_leido` con prefijo propio, y
// solo se escribe si al menos un envío se aceptó. El portal NO manda correo por esto.
import { sendWebPush } from '@central/core-push'
import {
  motivoSinPush,
  puedeAutorizar,
  resolverPreferenciasAvisos,
  textoPushPatrimonio,
  NIVELES,
  type Nivel,
} from '@central/module-seguros-portal'

import { mapConConcurrencia } from '../concurrencia'
import { prisma } from '../db'
import { OPCIONES_AVISO, topicAviso, type VapidCargada } from '../push-vapid'
import { MAX_PAGINAS_PUSH, TAM_PAGINA_PUSH } from '../criba-avisos-push'
import { avisosDePatrimonio } from './calendario'
import { calendarioDeClientes } from './calendario-bd'

/** Prefijo del sello en `portal_aviso_leido`. Cambiarlo reenvía todo lo que esté en ventana. */
export const PREFIJO_PUSH_PATRIMONIO = 'patrimonio-push-'
const CONCURRENCIA = 5

export type ResultadoPushPatrimonio = { identidades: number; candidatas: number; avisadas: number; sinExito: number; fallidas: number; omitidasPorPreferencia: number }

/** El sello de un aviso: la clave del vencimiento y su estado (distinto aviso «se acerca» que «venció»). */
export const selloPushPatrimonio = (clave: string, estado: string) => `${PREFIJO_PUSH_PATRIMONIO}${clave}#${estado}`.slice(0, 280)

const nivelDe = (v: string): Nivel => ((NIVELES as readonly string[]).includes(v) ? (v as Nivel) : 'tarjeta')

export async function avisarPatrimonioPush(vapid: VapidCargada, hoy: Date): Promise<ResultadoPushPatrimonio> {
  const r: ResultadoPushPatrimonio = { identidades: 0, candidatas: 0, avisadas: 0, sinExito: 0, fallidas: 0, omitidasPorPreferencia: 0 }
  // Se pagina por cursor (id) todas las suscripciones: leer siempre las mismas primeras dejaba fuera a las demás identidades.
  const subs: Awaited<ReturnType<typeof prisma.portalPushSuscripcion.findMany>> = []
  let cursorId: string | null = null
  for (let pagina = 0; pagina < MAX_PAGINAS_PUSH * 10; pagina += 1) {
    const filas: typeof subs = await prisma.portalPushSuscripcion.findMany({
      orderBy: [{ identidadId: 'asc' }, { id: 'asc' }],
      take: TAM_PAGINA_PUSH,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    })
    subs.push(...filas)
    if (filas.length < TAM_PAGINA_PUSH) break
    cursorId = filas[filas.length - 1]!.id
  }
  const porIdentidad = new Map<string, typeof subs>()
  for (const s of subs) porIdentidad.set(s.identidadId, [...(porIdentidad.get(s.identidadId) ?? []), s])
  const lotes = [...porIdentidad.entries()]
  r.identidades = lotes.length

  await mapConConcurrencia(lotes, CONCURRENCIA, async ([identidadId, suscripciones]) => {
    try {
      const vinculos = await prisma.portalVinculo.findMany({ where: { identidadId }, select: { clienteId: true, nivel: true, origen: true } })
      const propias = [...new Set(vinculos.filter((v) => v.origen !== 'corredor' && puedeAutorizar(nivelDe(v.nivel))).map((v) => v.clienteId))]
      if (propias.length === 0) return
      const vivas = await prisma.cliente.findMany({ where: { id: { in: propias }, mergedIntoClienteId: null, activo: true }, select: { id: true } })
      if (vivas.length === 0) return

      const cal = await calendarioDeClientes(vivas.map((f) => f.id))
      const avisos = avisosDePatrimonio(cal.vencimientos)
      if (avisos.length === 0) return

      // Preferencias de «Configuración»: «solo correo» o franja de «no molestar» → hoy no (y no se sella).
      const guardada = await prisma.portalPreferenciasAvisos.findUnique({
        where: { identidadId },
        select: { canal: true, diasAntelacion: true, noMolestarDesde: true, noMolestarHasta: true },
      })
      if (motivoSinPush(resolverPreferenciasAvisos(guardada), hoy) !== null) {
        r.omitidasPorPreferencia += 1
        return
      }

      const yaEnviados = new Set(
        (await prisma.portalAvisoLeido.findMany({ where: { identidadId, clave: { startsWith: PREFIJO_PUSH_PATRIMONIO } }, select: { clave: true } })).map((x) => x.clave),
      )
      const pendientes = avisos.filter((a) => !yaEnviados.has(selloPushPatrimonio(a.clave, a.estado)))
      r.candidatas += pendientes.length

      for (const a of pendientes) {
        const { title, body } = textoPushPatrimonio(a)
        const payload = { title, body, icon: '/icono-app', data: { url: '/herramientas/calendario' } }
        let algunaOk = false
        for (const s of suscripciones) {
          const res = await sendWebPush(vapid, { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.authKey } }, payload, {
            ...OPCIONES_AVISO,
            topic: topicAviso(`patrimonio:${a.clave}:${a.estado}`),
          })
          if (res.ok) algunaOk = true
          if (res.gone) await prisma.portalPushSuscripcion.deleteMany({ where: { id: s.id, identidadId } }).catch(() => {})
        }
        // Se sella SOLO si algún envío se aceptó: si todos fallaron se reintenta en la pasada siguiente.
        if (algunaOk) {
          await prisma.portalAvisoLeido.createMany({ data: [{ identidadId, clave: selloPushPatrimonio(a.clave, a.estado) }], skipDuplicates: true })
          r.avisadas += 1
        } else {
          r.sinExito += 1
        }
      }
    } catch (e) {
      r.fallidas += 1
      console.error('[avisos-push/patrimonio] fallo en una identidad; se sigue con las demás:', e instanceof Error ? e.message : e)
    }
  })
  return r
}
