/**
 * Regularización de RC (03/11/2026): pedir al cliente la facturación real del periodo. Flujo:
 *   1. `crearRegularizacion` (puerto `POST /api/operador/regularizacion-rc` accion `crear`; lo llamará la fase 1 del agente
 *      de correo con `peticionRegularizacionDesdeEvento`): póliza VIVA + periodo → fila `borrador` con el correo propuesto
 *      (SIN token) → Telegram a Alberto con ✅ Enviar / ✏️ Modificar / ❌ Descartar.
 *   2. ✅ (`decidirRegularizacion`): se reclama la fila (borrador → enviando, con el token NUEVO) y sale el correo con el
 *      enlace `/datos/<token>`. Sin proveedor → vuelve a borrador, 503 `canal_no_disponible`; rechazado → borrador, 502
 *      `envio_fallido`. Nunca dos correos por un doble clic (la reclamación es una sentencia condicionada).
 *   3. El cliente contesta en el portal (`regularizacion-rc-portal.ts`, por el puente) → cifrada en la fila (póliza +
 *      periodo), historial y aviso a Alberto por Telegram. NO se responde a la compañía (fase 3).
 *
 * 🚨 Nada sale al cliente sin el ✅ de Alberto para ESE envío. El SQL crudo NO prefija `seguros.` (la conexión ya lo trae)
 * y toda sentencia filtra `correduria_id` (cepo `test/regression-asegura-aislamiento.test.ts`).
 */
import { randomBytes } from 'node:crypto'
import { tgSend, tgSendButtons } from '@central/core-telegram'
import { MEDIADOR, esCarteraViva } from '@central/module-seguros'
import {
  DIAS_SOLICITUD_REGULARIZACION,
  borradorCorreoRegularizacion,
  borradorEditadoRegularizacion,
  normalizarNumeroPoliza,
  normalizarPeriodoRegularizacion,
  textoConEnlace,
  type PeriodoRegularizacion,
} from '@central/module-seguros/regularizacion-rc'
import { decryptField, encryptField } from '@central/module-seguros-pii'
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'
import { destinatarioDeCliente } from './avisos-vencimiento-reglas'
import { guardarDocumento } from './cartera-documentos'
import { enlaceFichaCliente, URL_PLATAFORMA_DEFECTO } from './datos-cotizados'
import { esTablaAusente } from './pg-error'
import { urlPortalSolicitud } from './solicitud-datos'
import {
  hashTokenRegularizacion,
  leerRespuestaCifrada,
  responderRegularizacionConRepo,
  regularizacionPorToken,
  RE_TOKEN_REGULARIZACION,
  vistaPublica,
  type FilaRegularizacionToken,
  type RepoRegularizacionToken,
  type VistaPublicaRegularizacion,
} from './regularizacion-rc-portal'
import { botonesRegularizacion, textoAvisoRespuestaRegularizacion, textoPropuestaRegularizacion } from './regularizacion-rc-telegram'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** `tipo` en `correo_envio` (etiqueta en Resend y en la ficha). */
export const TIPO_CORREO_REGULARIZACION = 'regularizacion_rc'

const firmante = () => `${MEDIADOR.identidad.nombre.split(/\s+/).slice(0, 2).join(' ')} — ${MEDIADOR.marca}`

/** Sin la tabla (SQL 2026-11-03b sin aplicar) → `sin_migracion` en vez de un 500 opaco. */
async function conMigracion<T>(f: () => Promise<T>): Promise<T | { estado: 'sin_migracion' }> {
  try {
    return await f()
  } catch (e) {
    if (esTablaAusente(e)) return { estado: 'sin_migracion' }
    throw e
  }
}

type FichaCliente = {
  id: string; nombre: string; apellidos: string; tipoPersona: string | null
  email: string | null; emailOptOutAt: Date | null; emails: { email: string; esPrincipal: boolean; createdAt: Date }[]
}

async function fichaDe(correduriaId: string, clienteId: string): Promise<FichaCliente | null> {
  return (await prismaAsegura().cliente.findFirst({
    where: { id: clienteId, correduriaId },
    select: { id: true, nombre: true, apellidos: true, tipoPersona: true, email: true, emailOptOutAt: true, emails: { select: { email: true, esPrincipal: true, createdAt: true } } },
  })) as FichaCliente | null
}

/** Persona jurídica → su razón social; física → nombre de pila. Para el saludo y el Telegram (sin apellidos enteros). */
function quienEs(f: FichaCliente | null): { pila: string | null; quien: string } {
  if (!f) return { pila: null, quien: 'ficha sin leer' }
  if (f.tipoPersona === 'juridica') return { pila: null, quien: `${f.nombre} ${f.apellidos}`.trim() || 'empresa sin nombre' }
  const pila = f.nombre.trim().split(/\s+/)[0] || null
  const ini = f.apellidos.trim().split(/\s+/).filter(Boolean).map((w) => `${w[0].toUpperCase()}.`).join(' ')
  return { pila, quien: [pila ?? 'Sin nombre', ini].filter(Boolean).join(' ') }
}

// ─── 1. Crear (lo dispara la fase 1 o Alberto por el puerto) ─────────────────

export type ResultadoCrear =
  | { estado: 'creada'; id: string; telegram: boolean }
  | { estado: 'ya_existe'; id: string; estadoSolicitud: string }
  | { estado: 'invalida'; motivo: string }
  | { estado: 'no_encontrada' | 'ambigua' | 'no_viva'; motivo: string }
  | { estado: 'sin_migracion' }

export async function crearRegularizacion(
  correduriaId: string,
  e: { polizaId?: unknown; numeroPoliza?: unknown; periodoDesde?: unknown; periodoHasta?: unknown; compania?: unknown; actor: string },
): Promise<ResultadoCrear> {
  const periodo = normalizarPeriodoRegularizacion(e.periodoDesde, e.periodoHasta)
  if (!periodo) return { estado: 'invalida', motivo: 'Periodo no válido (YYYY-MM o YYYY-MM-DD, desde ≤ hasta).' }
  const polizaId = typeof e.polizaId === 'string' && UUID.test(e.polizaId) ? e.polizaId : null
  const numero = polizaId ? null : normalizarNumeroPoliza(e.numeroPoliza)
  if (!polizaId && !numero) return { estado: 'invalida', motivo: 'Falta la póliza (polizaId o numeroPoliza).' }

  const r = await conMigracion(async (): Promise<ResultadoCrear> => {
    const db = prismaAsegura()
    const candidatas = await db.$queryRaw<{ id: string; clienteId: string; aseguradora: string; numero: string | null; importRef: string | null; eiacXmlHash: string | null }[]>(Prisma.sql`
      select id::text as id, cliente_id::text as "clienteId", aseguradora, numero_poliza as numero, import_ref as "importRef", eiac_xml_hash as "eiacXmlHash"
      from polizas
      where correduria_id = ${correduriaId}::uuid and merged_into_poliza_id is null
        and ${polizaId ? Prisma.sql`id = ${polizaId}::uuid` : Prisma.sql`upper(regexp_replace(coalesce(numero_poliza, ''), '[[:space:]./-]', '', 'g')) = ${numero}`}
      limit 5`)
    if (candidatas.length === 0) return { estado: 'no_encontrada', motivo: 'No hay ninguna póliza con ese número en la cartera.' }
    const vivas = candidatas.filter((p) => esCarteraViva(p))
    if (vivas.length === 0) return { estado: 'no_viva', motivo: 'La póliza es del volcado histórico (no es cartera viva): pídelo a mano.' }
    // Varias vivas con el mismo número: no se elige una a ciegas (escribiríamos al cliente equivocado).
    if (vivas.length > 1) return { estado: 'ambigua', motivo: `Hay ${vivas.length} pólizas vivas con ese número: dale el polizaId.` }
    const p = vivas[0]
    const compania = typeof e.compania === 'string' && e.compania.trim() ? e.compania.trim().slice(0, 60) : p.aseguradora
    const ficha = await fichaDe(correduriaId, p.clienteId)
    const { pila } = quienEs(ficha)
    const b = borradorCorreoRegularizacion({ pila, compania, periodo, firmante: firmante() })

    const fila = await db.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`select pg_advisory_xact_lock(hashtext(${`regularizacion:${p.id}:${periodo.desde}:${periodo.hasta}`}))`)
      // Una pendiente CADUCADA deja sitio (el cliente no contestó en 30 días: se vuelve a proponer).
      await tx.$executeRaw(Prisma.sql`
        update solicitud_regularizacion set estado = 'anulada'
        where correduria_id = ${correduriaId}::uuid and poliza_id = ${p.id}::uuid
          and periodo_desde = ${periodo.desde} and periodo_hasta = ${periodo.hasta}
          and estado = 'pendiente' and caduca_at <= now()`)
      const [ya] = await tx.$queryRaw<{ id: string; estado: string }[]>(Prisma.sql`
        select id::text as id, estado from solicitud_regularizacion
        where correduria_id = ${correduriaId}::uuid and poliza_id = ${p.id}::uuid
          and periodo_desde = ${periodo.desde} and periodo_hasta = ${periodo.hasta} and estado <> 'anulada'`)
      if (ya) return { nueva: false as const, ...ya }
      const [n] = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        insert into solicitud_regularizacion (correduria_id, poliza_id, cliente_id, compania, periodo_desde, periodo_hasta, borrador_asunto, borrador_texto, creada_por)
        values (${correduriaId}::uuid, ${p.id}::uuid, ${p.clienteId}::uuid, ${compania}, ${periodo.desde}, ${periodo.hasta}, ${b.asunto}, ${b.texto}, ${e.actor.slice(0, 200)})
        returning id::text as id`)
      return { nueva: true as const, id: n.id, estado: 'borrador' }
    })
    if (!fila.nueva) return { estado: 'ya_existe', id: fila.id, estadoSolicitud: fila.estado }
    const telegram = await proponerEnTelegram(correduriaId, fila.id)
    return { estado: 'creada', id: fila.id, telegram }
  })
  return r
}

type FilaBorrador = { id: string; clienteId: string; polizaId: string; compania: string; numero: string | null; periodoDesde: string; periodoHasta: string; estado: string; version: number; asunto: string | null; texto: string | null }

async function leerFila(correduriaId: string, id: string): Promise<FilaBorrador | null> {
  const [f] = await prismaAsegura().$queryRaw<FilaBorrador[]>(Prisma.sql`
    select s.id::text as id, s.cliente_id::text as "clienteId", s.poliza_id::text as "polizaId", s.compania, p.numero_poliza as numero,
           s.periodo_desde as "periodoDesde", s.periodo_hasta as "periodoHasta", s.estado, s.version,
           s.borrador_asunto as asunto, s.borrador_texto as texto
    from solicitud_regularizacion s join polizas p on p.id = s.poliza_id and p.correduria_id = s.correduria_id
    where s.id = ${id}::uuid and s.correduria_id = ${correduriaId}::uuid`)
  return f ?? null
}

/** Manda (o vuelve a mandar tras ✏️) la propuesta con sus botones. `false` = Telegram no la recibió (sigue en borrador). */
export async function proponerEnTelegram(correduriaId: string, id: string, editado = false): Promise<boolean> {
  const f = await leerFila(correduriaId, id)
  if (!f || f.estado !== 'borrador' || !f.asunto || !f.texto) return false
  const periodo = normalizarPeriodoRegularizacion(f.periodoDesde, f.periodoHasta) as PeriodoRegularizacion
  const ficha = await fichaDe(correduriaId, f.clienteId)
  const texto = textoPropuestaRegularizacion({
    quien: quienEs(ficha).quien, compania: f.compania, numeroPoliza: f.numero, periodo,
    hayEmail: ficha ? destinatarioDeCliente(ficha) !== null : false, asunto: f.asunto, texto: f.texto, editado,
  })
  const msg = await tgSendButtons(texto, botonesRegularizacion(f.id, f.version)).catch(() => null)
  return msg !== null
}

// ─── 2. Los botones (los reenvía el webhook de plataforma) ───────────────────

export type ResultadoDecision =
  | { estado: 'enviada' | 'descartada' | 'sin_cambios' | 'obsoleta' | 'sin_destino' | 'no_encontrada' | 'sin_migracion' }
  | { estado: 'canal_no_disponible' | 'envio_fallido' }

export async function decidirRegularizacion(correduriaId: string, d: { accion: 'env' | 'no'; id: string; version: number }): Promise<ResultadoDecision> {
  return conMigracion(async (): Promise<ResultadoDecision> => {
    const db = prismaAsegura()
    const f = await leerFila(correduriaId, d.id)
    if (!f) return { estado: 'no_encontrada' }
    if (f.estado !== 'borrador') return { estado: 'sin_cambios' }
    if (f.version !== d.version) return { estado: 'obsoleta' }
    if (d.accion === 'no') {
      const n = await db.$executeRaw(Prisma.sql`
        update solicitud_regularizacion set estado = 'anulada'
        where id = ${f.id}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'borrador' and version = ${d.version}`)
      return { estado: n === 1 ? 'descartada' : 'sin_cambios' }
    }
    const ficha = await fichaDe(correduriaId, f.clienteId)
    const destino = ficha ? destinatarioDeCliente(ficha) : null
    if (!destino) return { estado: 'sin_destino' }

    // Reclamar ANTES de mandar, con el token nuevo: un doble ✅ encuentra la fila ya en `enviando` y no manda otro.
    const token = randomBytes(32).toString('base64url')
    const hash = hashTokenRegularizacion(token)
    const n = await db.$executeRaw(Prisma.sql`
      update solicitud_regularizacion
      set estado = 'enviando', token_hash = ${hash}, caduca_at = now() + make_interval(days => ${DIAS_SOLICITUD_REGULARIZACION}::int)
      where id = ${f.id}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'borrador' and version = ${d.version}`)
    if (n !== 1) return { estado: 'sin_cambios' }
    const volverABorrador = () => db.$executeRaw(Prisma.sql`
      update solicitud_regularizacion set estado = 'borrador', token_hash = null, caduca_at = null
      where id = ${f.id}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'enviando'`)

    let texto: string
    try {
      texto = textoConEnlace(f.texto ?? '', urlPortalSolicitud(token))
    } catch {
      await volverABorrador()
      return { estado: 'envio_fallido' }
    }
    const { enviarCorreoCliente } = await import('./correo-envio')
    const res = await enviarCorreoCliente({
      correduriaId, clienteId: f.clienteId, polizaId: f.polizaId, tipo: TIPO_CORREO_REGULARIZACION, to: destino,
      asunto: f.asunto ?? 'Regularización de tu seguro de Responsabilidad Civil', texto,
      // Por TOKEN (no por versión): un reintento tras un fallo lleva enlace nuevo y no puede devolver el correo viejo.
      idempotencia: `regularizacion-rc:${f.id}:${hash.slice(0, 16)}`,
    })
    if (res === 'sin_proveedor') { await volverABorrador(); return { estado: 'canal_no_disponible' } }
    if (res !== 'enviado') { await volverABorrador(); return { estado: 'envio_fallido' } }
    await db.$executeRaw(Prisma.sql`
      update solicitud_regularizacion set estado = 'pendiente', enviada_at = now()
      where id = ${f.id}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'enviando'`)
    await anotarHistorial(correduriaId, f.clienteId, f.polizaId,
      `Regularización de RC (${f.compania}, periodo ${f.periodoDesde} a ${f.periodoHasta}): pedida la facturación al cliente por correo con enlace.`)
    return { estado: 'enviada' }
  })
}

/** ✏️: texto nuevo → versión nueva → propuesta nueva con botones nuevos (el ✅ viejo deja de valer). */
export async function editarRegularizacion(correduriaId: string, id: string, textoNuevo: unknown): Promise<{ estado: 'editada'; telegram: boolean } | { estado: 'invalida' | 'sin_cambios' | 'sin_migracion' }> {
  const texto = borradorEditadoRegularizacion(typeof textoNuevo === 'string' ? textoNuevo : null)
  if (!texto) return { estado: 'invalida' }
  return conMigracion(async () => {
    const n = await prismaAsegura().$executeRaw(Prisma.sql`
      update solicitud_regularizacion set borrador_texto = ${texto}, version = version + 1
      where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'borrador'`)
    if (n !== 1) return { estado: 'sin_cambios' as const }
    return { estado: 'editada' as const, telegram: await proponerEnTelegram(correduriaId, id, true) }
  })
}

async function anotarHistorial(correduriaId: string, clienteId: string, polizaId: string, texto: string): Promise<void> {
  try {
    await prismaAsegura().$executeRaw(Prisma.sql`
      insert into historial_interno (correduria_id, cliente_id, poliza_id, tipo, texto)
      values (${correduriaId}::uuid, ${clienteId}::uuid, ${polizaId}::uuid, cast('gestion' as tipo_historial_interno), ${texto})`)
  } catch (e) {
    console.error('[regularizacion-rc] historial no anotado:', e instanceof Error ? e.message : e)
  }
}

// ─── 3. El lado del token (puente del portal) ────────────────────────────────

/** Implementación Prisma del repo del token. Toda escritura, condicionada por id + correduría + hash + estado vivo. */
function repoPrisma(): RepoRegularizacionToken {
  const db = prismaAsegura()
  return {
    async porTokenHash(hash) {
      const [f] = await db.$queryRaw<FilaRegularizacionToken[]>(Prisma.sql`
        select id::text as id, correduria_id::text as "correduriaId", poliza_id::text as "polizaId", cliente_id::text as "clienteId",
               compania, periodo_desde as "periodoDesde", periodo_hasta as "periodoHasta", estado, caduca_at as caduca,
               documento_id::text as "documentoId"
        from solicitud_regularizacion where token_hash = ${hash}`)
      return f ?? null
    },
    async completar(x) {
      return db.$executeRaw(Prisma.sql`
        update solicitud_regularizacion set estado = 'completada', respuesta = ${x.respuestaCifrada}, completada_at = now()
        where id = ${x.id}::uuid and correduria_id = ${x.correduriaId}::uuid and token_hash = ${x.tokenHash}
          and estado = 'pendiente' and caduca_at > now()`)
    },
    async fijarDocumento(x) {
      return db.$executeRaw(Prisma.sql`
        update solicitud_regularizacion set documento_id = ${x.documentoId}::uuid
        where id = ${x.id}::uuid and correduria_id = ${x.correduriaId}::uuid and token_hash = ${x.tokenHash}
          and estado = 'pendiente' and caduca_at > now() and documento_id is null`)
    },
  }
}

/** GET del puente. `null` = el token no es de una regularización (o falta la tabla): el puente sigue con presupuesto. */
export async function regularizacionPublica(token: string): Promise<VistaPublicaRegularizacion | null> {
  try {
    return await regularizacionPorToken(repoPrisma(), token)
  } catch (e) {
    if (esTablaAusente(e)) return null
    throw e
  }
}

export async function responderRegularizacion(token: string, entrada: unknown) {
  const r = await responderRegularizacionConRepo(repoPrisma(), token, entrada, encryptField)
  if (!r.ok) return r
  const f = r.fila
  await anotarHistorial(f.correduriaId, f.clienteId, f.polizaId,
    `Regularización de RC (${f.compania}, periodo ${f.periodoDesde} a ${f.periodoHasta}): el cliente ha declarado la facturación por el enlace.`)
  await avisarRespuesta(f.correduriaId, f.id).catch((e) => console.error('[regularizacion-rc] aviso no enviado:', e instanceof Error ? e.message : e))
  return { ok: true as const }
}

/** Telegram a Alberto con la cifra. Sello `aviso_respuesta_at` solo si salió (un fallo se ve en la ficha, no se pierde el dato). */
async function avisarRespuesta(correduriaId: string, id: string): Promise<void> {
  const db = prismaAsegura()
  const [f] = await db.$queryRaw<{ clienteId: string; compania: string; numero: string | null; periodoDesde: string; periodoHasta: string; respuesta: string | null; documentoId: string | null }[]>(Prisma.sql`
    select s.cliente_id::text as "clienteId", s.compania, p.numero_poliza as numero, s.periodo_desde as "periodoDesde", s.periodo_hasta as "periodoHasta",
           s.respuesta, s.documento_id::text as "documentoId"
    from solicitud_regularizacion s join polizas p on p.id = s.poliza_id and p.correduria_id = s.correduria_id
    where s.id = ${id}::uuid and s.correduria_id = ${correduriaId}::uuid and s.estado = 'completada' and s.aviso_respuesta_at is null`)
  if (!f) return
  const respuesta = leerRespuestaCifrada(f.respuesta, decryptField)
  const periodo = normalizarPeriodoRegularizacion(f.periodoDesde, f.periodoHasta)
  const ficha = await fichaDe(correduriaId, f.clienteId)
  const url = enlaceFichaCliente(f.clienteId, process.env.PLATAFORMA_URL?.trim() || URL_PLATAFORMA_DEFECTO)
  const texto = respuesta && periodo
    ? textoAvisoRespuestaRegularizacion({ quien: quienEs(ficha).quien, compania: f.compania, numeroPoliza: f.numero, periodo, respuesta, conDocumento: f.documentoId !== null, urlFicha: url })
    : `📥 Regularización de RC contestada, pero no he podido leer la cifra (clave PII). Mírala en la ficha.\n${url}`
  const msg = await tgSend(texto, { html: true }).catch(() => null)
  if (msg === null) return
  await db.$executeRaw(Prisma.sql`
    update solicitud_regularizacion set aviso_respuesta_at = now()
    where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid and aviso_respuesta_at is null`)
}

export type ResultadoDocRegularizacion = { ok: true } | { ok: false; estado: 'muerta' | 'completada' | 'tope' | 'invalido' | 'error'; motivo?: string }

/** El adjunto opcional (modelo 390, cuentas): se archiva en la ficha, colgado de la póliza. Uno por solicitud. */
export async function subirDocumentoRegularizacion(token: string, fichero: { nombre: string; mime: string; contenido: Buffer }): Promise<ResultadoDocRegularizacion> {
  if (!RE_TOKEN_REGULARIZACION.test(token)) return { ok: false, estado: 'muerta' }
  const repo = repoPrisma()
  const hash = hashTokenRegularizacion(token)
  const f = await repo.porTokenHash(hash)
  const v = vistaPublica(f)
  if (!f || v.estado === 'muerta') return { ok: false, estado: 'muerta' }
  if (v.estado === 'completada') return { ok: false, estado: 'completada' }
  if (f.documentoId !== null) return { ok: false, estado: 'tope', motivo: 'Ya nos has enviado un documento. Si falta algo, contesta al correo.' }
  const g = await guardarDocumento(f.correduriaId, {
    clienteId: f.clienteId, polizaId: f.polizaId, tipo: 'otro', nombre: fichero.nombre, mime: fichero.mime, contenido: fichero.contenido,
    notas: `Regularización de RC (periodo ${f.periodoDesde} a ${f.periodoHasta}) · subido por el cliente en el enlace`, subidoPor: 'cliente',
  })
  if (!g.ok) return { ok: false, estado: g.status === 415 ? 'invalido' : 'error', motivo: g.motivo }
  const n = await repo.fijarDocumento({ id: f.id, correduriaId: f.correduriaId, tokenHash: hash, documentoId: g.documento.id })
  // Carrera (otra subida o ya completada entre medias): el fichero queda en su ficha igualmente; se dice la verdad.
  if (n !== 1) return { ok: false, estado: 'tope', motivo: 'Ya nos has enviado un documento. Si falta algo, contesta al correo.' }
  return { ok: true }
}

// ─── Lectura para el corredor (fase 3 la usará para responder a la compañía) ─

export async function regularizacionesDePoliza(correduriaId: string, polizaId: string) {
  if (!UUID.test(polizaId)) return []
  const r = await conMigracion(async () => {
    const filas = await prismaAsegura().$queryRaw<{ id: string; compania: string; periodoDesde: string; periodoHasta: string; estado: string; caduca: Date | null; enviada: Date | null; completada: Date | null; respuesta: string | null; documentoId: string | null }[]>(Prisma.sql`
      select id::text as id, compania, periodo_desde as "periodoDesde", periodo_hasta as "periodoHasta", estado, caduca_at as caduca,
             enviada_at as enviada, completada_at as completada, respuesta, documento_id::text as "documentoId"
      from solicitud_regularizacion where correduria_id = ${correduriaId}::uuid and poliza_id = ${polizaId}::uuid
      order by created_at desc limit 20`)
    return filas.map(({ respuesta, ...x }) => ({
      ...x,
      // `null` con estado completada = ilegible (no «sin dato»); sin completar = aún no contestó.
      respuesta: x.estado === 'completada' ? leerRespuestaCifrada(respuesta, decryptField) : null,
      ilegible: x.estado === 'completada' && leerRespuestaCifrada(respuesta, decryptField) === null,
    }))
  })
  return r
}
