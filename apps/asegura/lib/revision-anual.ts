/**
 * La revisión anual del portal — el ENVÍO (20/09/2026).
 *
 * Una vez al año, a quien marcó la casilla comercial del portal, un correo con
 * los seguros suyos que vencen en los próximos meses. QUIÉN lo recibe lo decide
 * `tocaRevisionAnual()` de `@central/module-seguros-portal` (puro y probado);
 * aquí solo se lee la BD, se manda y se sella.
 *
 * Mismas reglas que `avisos-vencimiento.ts`, y por los mismos motivos:
 *   1. **Vive aquí y no en el portal**: el portal guarda hashes del canal, no
 *      tiene a dónde escribir. El email sale de la ficha de cartera, descifrado
 *      con `destinatarioDeCliente()`.
 *   2. **Modo cuenta por defecto.** Sin `ASEGURA_REVISION_ANUAL_ACTIVA === '1'`
 *      no sale ni un correo: se cuenta y se informa. Alberto ve el ensayo
 *      (`enviaria`) y decide cuándo encender.
 *   3. El destinatario sale de la identidad → su vínculo → su ficha. Nunca de
 *      la petición.
 *   4. `revision_anual_enviada_en` se sella INMEDIATAMENTE tras el envío
 *      aceptado: es lo que impide que un reintento mande dos.
 *
 * 🚨 Solo la CARTERA VIVA y EN VIGOR (`WHERE_CARTERA_VIVA` + estados vigentes +
 * ficha activa): el volcado histórico no recibe nada. Y sin consentimiento
 * comercial vigente para la versión ACTUAL del texto no se evalúa nada más.
 */
import { createMailTransporter } from '@central/core-email'
import { POLIZA_ESTADOS_VIGENTES, WHERE_CARTERA_VIVA, remitenteCorreo } from '@central/module-seguros'
import { VERSION_TEXTO_COMERCIAL, consentimientoVigente, tocaRevisionAnual, type MotivoNoRevision } from '@central/module-seguros-portal'

import { aseguraConfigurada, prismaAsegura } from './asegura-db'
import { destinatarioDeCliente } from './avisos-vencimiento'
import { textoRevisionAnual, type PolizaEnRevision } from './texto-revision-anual'

export type ResumenRevision = {
  /** Identidades con consentimiento comercial afirmativo y vigente. */
  conConsentimiento: number
  /** De esas, a cuántas les toca hoy (según el módulo puro). */
  candidatas: number
  /** Por qué NO tocaba, por motivo. Se cuenta para que un cero no sea mudo. */
  descartadas: Record<MotivoNoRevision, number>
  enviados: number
  /** Candidatas sin ficha de cartera vinculada o sin email legible / con baja. */
  sinCanal: number
  fallidos: number
  soloContar: boolean
}

export function revisionAnualActiva(env: string | undefined = process.env.ASEGURA_REVISION_ANUAL_ACTIVA): boolean {
  return env === '1'
}

export async function ejecutarRevisionAnual(opts: { hoy?: Date; forzarContar?: boolean } = {}): Promise<ResumenRevision> {
  if (!aseguraConfigurada()) throw new Error('cartera_sin_conexion')
  const hoy = opts.hoy ?? new Date()
  const soloContar = opts.forzarContar === true || !revisionAnualActiva()
  const db = prismaAsegura()

  const resumen: ResumenRevision = {
    conConsentimiento: 0,
    candidatas: 0,
    descartadas: { sin_consentimiento: 0, reciente: 0, sin_vencimiento_proximo: 0 },
    enviados: 0,
    sinCanal: 0,
    fallidos: 0,
    soloContar,
  }

  // 1. Quién ha marcado la casilla. Se leen TODAS las filas `comercial` y el
  //    módulo decide cuál es la última por identidad: la tabla es append-only.
  const filasConsent = await db.portalConsentimiento.findMany({
    where: { tipo: 'comercial' },
    select: { identidadId: true, tipo: true, otorgado: true, versionTexto: true, creadoEn: true },
  })
  const porIdentidad = new Map<string, typeof filasConsent>()
  for (const f of filasConsent) porIdentidad.set(f.identidadId, [...(porIdentidad.get(f.identidadId) ?? []), f])
  const conConsentimiento = [...porIdentidad.entries()]
    .filter(([, filas]) => consentimientoVigente(filas, 'comercial', VERSION_TEXTO_COMERCIAL) === true)
    .map(([id]) => id)
  resumen.conConsentimiento = conConsentimiento.length
  resumen.descartadas.sin_consentimiento = porIdentidad.size - conConsentimiento.length
  if (conConsentimiento.length === 0) return resumen

  // 2. Su última revisión, sus vínculos y sus pólizas (cartera + declaradas).
  const [identidades, vinculos, declaradas] = await Promise.all([
    db.portalIdentidad.findMany({
      where: { id: { in: conConsentimiento } },
      select: { id: true, nombre: true, revisionAnualEnviadaEn: true },
    }),
    db.portalVinculo.findMany({
      where: { identidadId: { in: conConsentimiento } },
      select: { identidadId: true, clienteId: true, correduriaId: true },
    }),
    db.portalPolizaDeclarada.findMany({
      where: { identidadId: { in: conConsentimiento }, fechaVencimiento: { not: null } },
      select: { identidadId: true, ramo: true, compania: true, fechaVencimiento: true },
    }),
  ])
  const clienteIds = [...new Set(vinculos.map((v) => v.clienteId))]
  const polizasCartera = clienteIds.length
    ? await db.poliza.findMany({
        where: {
          clienteId: { in: clienteIds },
          ...WHERE_CARTERA_VIVA,
          mergedIntoPolizaId: null,
          estado: { in: [...POLIZA_ESTADOS_VIGENTES] },
          fechaVencimiento: { not: null },
          cliente: { activo: true },
        },
        select: { clienteId: true, tipo: true, aseguradora: true, fechaVencimiento: true },
      })
    : []
  const carteraPorCliente = new Map<string, typeof polizasCartera>()
  for (const p of polizasCartera) carteraPorCliente.set(p.clienteId, [...(carteraPorCliente.get(p.clienteId) ?? []), p])
  const declaradasPorIdentidad = new Map<string, typeof declaradas>()
  for (const d of declaradas) declaradasPorIdentidad.set(d.identidadId, [...(declaradasPorIdentidad.get(d.identidadId) ?? []), d])
  const vinculosPorIdentidad = new Map<string, typeof vinculos>()
  for (const v of vinculos) vinculosPorIdentidad.set(v.identidadId, [...(vinculosPorIdentidad.get(v.identidadId) ?? []), v])

  // 3. A quién le toca, y con qué pólizas.
  type Candidata = { identidad: (typeof identidades)[number]; polizas: PolizaEnRevision[]; clienteIds: string[] }
  const candidatas: Candidata[] = []
  for (const identidad of identidades) {
    const suyos = vinculosPorIdentidad.get(identidad.id) ?? []
    const polizas: PolizaEnRevision[] = [
      ...suyos.flatMap((v) =>
        (carteraPorCliente.get(v.clienteId) ?? []).map((p) => ({
          tipo: String(p.tipo),
          compania: p.aseguradora,
          fechaVencimiento: p.fechaVencimiento!,
          declarada: false,
        })),
      ),
      ...(declaradasPorIdentidad.get(identidad.id) ?? []).map((d) => ({
        tipo: d.ramo,
        compania: d.compania,
        fechaVencimiento: d.fechaVencimiento!,
        declarada: true,
      })),
    ]
    const decision = tocaRevisionAnual(
      {
        consentimientoComercial: true,
        ultimaRevisionEn: identidad.revisionAnualEnviadaEn,
        vencimientos: polizas.map((p) => p.fechaVencimiento),
      },
      hoy,
    )
    if (!decision.toca) {
      resumen.descartadas[decision.motivo] += 1
      continue
    }
    const enHorizonte = new Set(decision.proximos.map((d) => d.getTime()))
    candidatas.push({
      identidad,
      // Solo las que caen en el horizonte: el correo habla de lo que vence
      // pronto, no de la póliza de dentro de once meses.
      polizas: polizas.filter((p) => enHorizonte.has(Date.UTC(p.fechaVencimiento.getUTCFullYear(), p.fechaVencimiento.getUTCMonth(), p.fechaVencimiento.getUTCDate()))),
      clienteIds: suyos.map((v) => v.clienteId),
    })
  }
  resumen.candidatas = candidatas.length
  if (candidatas.length === 0) return resumen

  // 4. El destinatario: de la ficha de cartera vinculada. Sin vínculo no hay
  //    email (el portal solo guarda hashes): `sinCanal`, que es la verdad.
  const clientes = await db.cliente.findMany({
    where: { id: { in: [...new Set(candidatas.flatMap((c) => c.clienteIds))] }, activo: true },
    select: {
      id: true,
      emailOptOutAt: true,
      email: true,
      emails: { select: { email: true, esPrincipal: true, createdAt: true } },
    },
  })
  const clientePorId = new Map(clientes.map((c) => [c.id, c]))

  let envio: { transporter: NonNullable<ReturnType<typeof createMailTransporter>>; from: string } | null = null
  if (!soloContar) {
    const transporter = createMailTransporter()
    if (!transporter) throw new Error('sin_proveedor_email')
    envio = { transporter, from: remitenteCorreo(process.env.ASEGURA_MAIL_FROM) }
  }

  for (const c of candidatas) {
    let destino: string | null = null
    for (const cid of c.clienteIds) {
      const ficha = clientePorId.get(cid)
      if (!ficha) continue
      destino = destinatarioDeCliente(ficha)
      if (destino) break
    }
    if (!destino) {
      resumen.sinCanal += 1
      continue
    }
    if (soloContar || !envio) continue

    const { asunto, texto, html } = textoRevisionAnual({ nombre: c.identidad.nombre, polizas: c.polizas })
    try {
      await envio.transporter.sendMail({ from: envio.from, to: destino, subject: asunto, text: texto, html })
    } catch (e) {
      resumen.fallidos += 1
      console.error(`[revision-anual] fallo enviando a la identidad ${c.identidad.id}:`, e instanceof Error ? e.message : e)
      continue
    }
    resumen.enviados += 1
    try {
      await db.portalIdentidad.update({ where: { id: c.identidad.id }, data: { revisionAnualEnviadaEn: new Date() } })
    } catch (e) {
      console.error(`[revision-anual] ENVIADO PERO NO SELLADO — identidad ${c.identidad.id} puede repetir:`, e instanceof Error ? e.message : e)
    }
  }

  return resumen
}
