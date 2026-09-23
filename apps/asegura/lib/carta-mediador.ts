// La CARTA DE NOMBRAMIENTO DE MEDIADOR (presupuesto, «salida B», PR 6).
//
// Portal (por el puente `/api/portal/carta-mediador`): el cliente que se queda con su compañía firma
// la carta para su póliza actual — preparar → código al correo → firmar. Mismo patrón que la firma de
// la anulación (`anulacion-portal.ts`): solo el TOMADOR, código obligatorio, se firma el texto exacto.
// Operador (`/api/operador/carta-mediador`): Alberto la ve en la ficha de la póliza y marca a mano
// «enviada» (la manda él), «aceptada» o «rechazada». Nada sale solo hacia la compañía.
//
// El SQL crudo no prefija `seguros.`: la conexión ya trae `?schema=seguros`.

import { createHash, randomInt } from 'node:crypto'
import { FirmaPropia, TEXTO_CONSENTIMIENTO, nombreCoincide } from '@central/core-firma'
import {
  cartaNombramientoMediador, remitenteCorreo, sqlCarteraViva, transicionCartaMediador,
  type AccionCartaMediador, type EstadoCartaMediador,
} from '@central/module-seguros'
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'
import { anotarCambio } from './auditoria'
import { fichaPropiaDe } from './contacto-portal'
import { estadoEmailDeFicha } from './email-ficha'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const MINUTOS_CODIGO = 10
export const MAX_INTENTOS = 5
export const SEGUNDOS_ENTRE_CODIGOS = 60
export const MAX_CODIGOS_DIA = 5

const hashCodigo = (c: string) => createHash('sha256').update(c).digest('hex')
const huella = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex')
const hoyMadrid = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })

type Base = {
  presupuestoId: string; polizaId: string; clienteId: string; tomador: string
  numeroPoliza: string | null; compania: string | null; ramo: string | null; yaNuestra: boolean
}

type SinFicha = { estado: 'sin_ficha' } | { estado: 'varias_fichas' } | { estado: 'error'; causa: string }
type NoDisponible = { estado: 'no_disponible'; motivo: string } | { estado: 'otra_ficha' } | { estado: 'no_encontrado' }

/**
 * La póliza actual del presupuesto, si es del TOMADOR de la sesión. 🚨 Misma guarda que «datos para
 * emitir»: el portal deja ver un presupuesto por el canal, y firmar el nombramiento de la póliza de
 * otra persona sería firmar por ella.
 */
async function base(correduriaId: string, identidadId: string, presupuestoId: string): Promise<{ b: Base } | NoDisponible | SinFicha> {
  if (!UUID.test(presupuestoId)) return { estado: 'no_encontrado' }
  const f = await fichaPropiaDe(correduriaId, identidadId)
  if (f.estado !== 'ok') return f
  const [b] = await prismaAsegura().$queryRaw<(Base & { presClienteId: string })[]>`
    select pr.id::text as "presupuestoId", pol.id::text as "polizaId", pol.cliente_id::text as "clienteId",
           pr.cliente_id::text as "presClienteId",
           trim(concat(c.nombre, ' ', coalesce(c.apellidos, ''))) as tomador,
           pol.numero_poliza as "numeroPoliza", pol.aseguradora as compania, pol.tipo::text as ramo,
           ${Prisma.raw(sqlCarteraViva('pol'))} as "yaNuestra"
    from presupuesto pr
      join polizas pol on pol.id = pr.poliza_id and pol.correduria_id = pr.correduria_id and pol.merged_into_poliza_id is null
      join clientes c on c.id = pol.cliente_id
    where pr.id = ${presupuestoId}::uuid and pr.correduria_id = ${correduriaId}::uuid`
  if (!b) return { estado: 'no_disponible', motivo: 'Este presupuesto no va sobre una póliza tuya que conozcamos: escríbenos y lo hablamos.' }
  if (b.presClienteId !== f.clienteId || b.clienteId !== f.clienteId) return { estado: 'otra_ficha' }
  // Si CIMA ya la trae, ya somos su corredor: no hay nada que nombrar.
  if (b.yaNuestra) return { estado: 'no_disponible', motivo: 'Esta póliza ya la gestionamos nosotros.' }
  return { b }
}

function componer(b: Base, hoy: string): string | null {
  return cartaNombramientoMediador({ tomador: b.tomador, compania: b.compania, numeroPoliza: b.numeroPoliza, ramo: b.ramo, fechaCarta: hoy })
}

async function abierta(polizaId: string): Promise<{ id: string; estado: EstadoCartaMediador; clienteId: string } | null> {
  const [a] = await prismaAsegura().$queryRaw<{ id: string; estado: EstadoCartaMediador; clienteId: string }[]>`
    select id::text as id, estado, cliente_id::text as "clienteId" from carta_mediador
    where poliza_id = ${polizaId}::uuid and estado in ('pendiente', 'firmada', 'enviada')`
  return a ?? null
}

export type ResultadoPreparar =
  | { estado: 'ok'; carta: string; cartaHash: string; consentimiento: string; compania: string; numeroPoliza: string }
  /** Ya la firmó (o ya se envió): no se ofrece firmar otra. */
  | { estado: 'ya_firmada'; enviada: boolean }
  | NoDisponible | SinFicha

/** La carta que firmaría, compuesta hoy. No escribe nada. */
export async function prepararCarta(correduriaId: string, identidadId: string, presupuestoId: string): Promise<ResultadoPreparar> {
  const r = await base(correduriaId, identidadId, presupuestoId)
  if (!('b' in r)) return r
  const a = await abierta(r.b.polizaId)
  if (a && a.estado !== 'pendiente') return { estado: 'ya_firmada', enviada: a.estado === 'enviada' }
  const carta = componer(r.b, hoyMadrid())
  if (!carta) return { estado: 'no_disponible', motivo: 'Nos falta el número o la compañía de tu póliza para la carta: escríbenos y la completamos.' }
  return { estado: 'ok', carta, cartaHash: huella(carta), consentimiento: TEXTO_CONSENTIMIENTO, compania: r.b.compania!, numeroPoliza: r.b.numeroPoliza! }
}

export type ResultadoCodigo =
  | { estado: 'codigo_enviado'; email: string; minutos: number }
  | { estado: 'espera'; segundos: number }
  | { estado: 'limite_codigos' }
  | { estado: 'ya_firmada'; enviada: boolean }
  | { estado: 'sin_email'; motivo: string }
  | { estado: 'sin_correo_configurado'; motivo: string }
  | { estado: 'fallo_envio' }
  | NoDisponible | SinFicha

const enmascarar = (email: string) => {
  const [u, d] = email.split('@')
  return d ? `${u.slice(0, 1)}***@${d}` : '***'
}

export async function pedirCodigoCarta(correduriaId: string, identidadId: string, presupuestoId: string): Promise<ResultadoCodigo> {
  const r = await base(correduriaId, identidadId, presupuestoId)
  if (!('b' in r)) return r
  if (!componer(r.b, hoyMadrid())) return { estado: 'no_disponible', motivo: 'Nos falta el número o la compañía de tu póliza para la carta.' }
  const ficha = await estadoEmailDeFicha(correduriaId, r.b.clienteId)
  if (ficha.estado === 'ilegible') return { estado: 'sin_correo_configurado', motivo: 'no se puede leer el correo de tu ficha' }
  if (ficha.estado !== 'ok') return { estado: 'sin_email', motivo: ficha.estado === 'baja_de_correo' ? 'te diste de baja del correo' : 'no tenemos tu correo' }
  const { createMailTransporter } = await import('@central/core-email')
  const transporter = createMailTransporter()
  if (!transporter || !process.env.ASEGURA_MAIL_FROM?.trim()) return { estado: 'sin_correo_configurado', motivo: 'el correo de la correduría no está configurado' }

  const db = prismaAsegura()
  // La fila `pendiente` nace aquí (una abierta por póliza, la protege el índice parcial).
  await db.$executeRaw`
    insert into carta_mediador (correduria_id, cliente_id, poliza_id, presupuesto_id)
    values (${correduriaId}::uuid, ${r.b.clienteId}::uuid, ${r.b.polizaId}::uuid, ${presupuestoId}::uuid)
    on conflict (poliza_id) where estado in ('pendiente', 'firmada', 'enviada') do nothing`
  const a = await abierta(r.b.polizaId)
  if (!a || a.clienteId !== r.b.clienteId) return { estado: 'no_encontrado' }
  if (a.estado !== 'pendiente') return { estado: 'ya_firmada', enviada: a.estado === 'enviada' }

  const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0')
  // Guardado ANTES de mandar y en UNA sentencia con los dos frenos (60 s y tope diario).
  const n = await db.$executeRaw`
    update carta_mediador set firma_otp_hash = ${hashCodigo(codigo)}, firma_otp_intentos = 0,
           firma_otp_expira = now() + make_interval(mins => ${MINUTOS_CODIGO}::int),
           firma_otp_envios = case when firma_otp_envios_dia = current_date then firma_otp_envios + 1 else 1 end,
           firma_otp_envios_dia = current_date, updated_at = now()
    where id = ${a.id}::uuid and estado = 'pendiente'
      and (firma_otp_expira is null
           or firma_otp_expira <= now() + make_interval(secs => ${MINUTOS_CODIGO * 60 - SEGUNDOS_ENTRE_CODIGOS}::int))
      and (firma_otp_envios_dia is distinct from current_date or firma_otp_envios < ${MAX_CODIGOS_DIA}::int)`
  if (n === 0) {
    const [e] = await db.$queryRaw<{ agotado: boolean; faltan: number | null }[]>`
      select (firma_otp_envios_dia = current_date and firma_otp_envios >= ${MAX_CODIGOS_DIA}::int) as agotado,
             ceil(extract(epoch from (firma_otp_expira - now())) - ${MINUTOS_CODIGO * 60 - SEGUNDOS_ENTRE_CODIGOS})::int as faltan
      from carta_mediador where id = ${a.id}::uuid`
    if (e?.agotado) return { estado: 'limite_codigos' }
    return { estado: 'espera', segundos: Math.max(1, e?.faltan ?? SEGUNDOS_ENTRE_CODIGOS) }
  }
  try {
    await transporter.sendMail({
      from: remitenteCorreo(process.env.ASEGURA_MAIL_FROM),
      to: ficha.email,
      subject: 'Tu código para firmar el nombramiento de corredor',
      text: `Hola:\n\nTu código para firmar en el portal la carta que nos nombra corredores de tu póliza es: ${codigo}\n\n` +
        `Caduca en ${MINUTOS_CODIGO} minutos. Si no lo has pedido tú, no hagas nada: sin el código no se firma nada.\n\nGrupo ASegura`,
    })
  } catch (e) {
    console.error('[carta-mediador] no salió el código:', e instanceof Error ? e.message : e)
    return { estado: 'fallo_envio' }
  }
  return { estado: 'codigo_enviado', email: enmascarar(ficha.email), minutos: MINUTOS_CODIGO }
}

export type ResultadoFirma =
  | { estado: 'firmada'; firmadaEl: string; aviso: string }
  | { estado: 'sin_codigo' } | { estado: 'codigo_caducado' } | { estado: 'demasiados_intentos' }
  | { estado: 'codigo_incorrecto'; quedan: number }
  | { estado: 'nombre_no_coincide' }
  | { estado: 'carta_cambiada' }
  | { estado: 'ya_firmada'; enviada: boolean }
  | NoDisponible | SinFicha

export async function firmarCarta(
  correduriaId: string,
  identidadId: string,
  presupuestoId: string,
  datos: { codigo: string; nombre: string; cartaHash: string; ip: string | null; userAgent: string | null },
): Promise<ResultadoFirma> {
  const r = await base(correduriaId, identidadId, presupuestoId)
  if (!('b' in r)) return r
  const b = r.b
  const db = prismaAsegura()
  const [a] = await db.$queryRaw<{ id: string; estado: EstadoCartaMediador; otpHash: string | null; otpExpira: Date | null }[]>`
    select id::text as id, estado, firma_otp_hash as "otpHash", firma_otp_expira as "otpExpira" from carta_mediador
    where poliza_id = ${b.polizaId}::uuid and cliente_id = ${b.clienteId}::uuid and estado in ('pendiente', 'firmada', 'enviada')`
  if (!a) return { estado: 'sin_codigo' }
  if (a.estado !== 'pendiente') return { estado: 'ya_firmada', enviada: a.estado === 'enviada' }
  // Control exclusivo: sin código no hay firma, aunque la sesión esté abierta.
  if (!a.otpHash || !a.otpExpira) return { estado: 'sin_codigo' }
  // El intento se gasta ANTES de comparar y en una sola sentencia.
  const [gastado] = await db.$queryRaw<{ hash: string; intentos: number }[]>`
    update carta_mediador set firma_otp_intentos = firma_otp_intentos + 1
    where id = ${a.id}::uuid and estado = 'pendiente'
      and firma_otp_hash is not null and firma_otp_expira > now() and firma_otp_intentos < ${MAX_INTENTOS}::int
    returning firma_otp_hash as hash, firma_otp_intentos as intentos`
  if (!gastado) return a.otpExpira.getTime() < Date.now() ? { estado: 'codigo_caducado' } : { estado: 'demasiados_intentos' }
  if (hashCodigo(datos.codigo.trim()) !== gastado.hash) return { estado: 'codigo_incorrecto', quedan: Math.max(0, MAX_INTENTOS - gastado.intentos) }
  if (!nombreCoincide(datos.nombre, b.tomador)) return { estado: 'nombre_no_coincide' }

  const hoy = hoyMadrid()
  const texto = componer(b, hoy)
  if (!texto) return { estado: 'no_disponible', motivo: 'Nos falta el número o la compañía de tu póliza para la carta.' }
  // Se firma lo que se leyó.
  if (huella(texto) !== datos.cartaHash) return { estado: 'carta_cambiada' }
  const ficha = await estadoEmailDeFicha(correduriaId, b.clienteId)
  const contexto = { fecha: new Date().toISOString(), ip: datos.ip, user_agent: datos.userAgent }
  const evidencia = await new FirmaPropia().firmar({
    firmante: { id: b.clienteId, nombre: b.tomador, email: ficha.estado === 'ok' ? ficha.email : null },
    documento_id: a.id,
    bytes: new TextEncoder().encode(texto),
    contexto,
    metodo: 'otp_email',
    nombre_confirmado: datos.nombre,
  })
  const firmada = await db.$transaction(async (tx) => {
    const [fila] = await tx.$queryRaw<{ id: string }[]>`
      insert into firma (correduria_id, documento_tipo, documento_id, cliente_id, identidad_id, doc_hash, algoritmo, metodo,
                         firmante_nombre, firmante_email, ip, user_agent, sello_tiempo, evidencia)
      values (${correduriaId}::uuid, 'carta_mediador', ${a.id}::uuid, ${b.clienteId}::uuid, ${identidadId}::uuid,
              ${evidencia.doc_hash}, ${evidencia.algoritmo}, ${evidencia.metodo}, ${b.tomador}, ${evidencia.firmante.email ?? null},
              ${datos.ip}, ${datos.userAgent}, ${contexto.fecha}::timestamptz, ${JSON.stringify(evidencia)}::jsonb)
      on conflict (documento_tipo, documento_id) do nothing
      returning id::text as id`
    if (!fila) return false
    const n = await tx.$executeRaw`
      update carta_mediador set estado = 'firmada', firmada_at = now(), firma_id = ${fila.id}::uuid, carta_texto = ${texto},
             firma_otp_hash = null, firma_otp_expira = null, updated_at = now()
      where id = ${a.id}::uuid and estado = 'pendiente'`
    if (n === 0) throw new Error('la carta cambió mientras se firmaba')
    await tx.$executeRaw`
      insert into presupuesto_evento (presupuesto_id, tipo, origen, detalle)
      values (${presupuestoId}::uuid, 'carta_mediador', 'cliente', ${JSON.stringify({ cartaId: a.id })}::jsonb)`
    return true
  })
  if (!firmada) return { estado: 'ya_firmada', enviada: false }

  anotarCambio({ entidad: 'carta_mediador', id: a.id, campo: 'estado', antes: 'pendiente', despues: 'firmada' })
  try {
    await db.$executeRaw`
      insert into historial_interno (correduria_id, cliente_id, poliza_id, tipo, texto)
      values (${correduriaId}::uuid, ${b.clienteId}::uuid, ${b.polizaId}::uuid, cast('gestion' as tipo_historial_interno),
              ${`El cliente firmó en el portal la carta de nombramiento de mediador de su póliza de ${b.compania ?? 'su compañía'}.`})`
  } catch (e) {
    console.error('[carta-mediador] historial no anotado:', e instanceof Error ? e.message : e)
  }
  const aviso = `🤝 ${b.tomador} ha FIRMADO la carta de nombramiento de mediador de su póliza de ${b.compania} (nº ${b.numeroPoliza}). ` +
    'Mándala a la compañía desde la ficha de la póliza y márcala como enviada: la póliza no es nuestra hasta que la acepten.'
  return { estado: 'firmada', firmadaEl: hoy, aviso }
}

// ─── Operador (Alberto, desde plataforma) ─────────────────────────────────────

export type CartaEnLista = {
  id: string; estado: EstadoCartaMediador; creadaAt: Date; firmadaAt: Date | null; enviadaAt: Date | null
  aceptadaAt: Date | null; rechazadaAt: Date | null; rechazoMotivo: string | null; cartaTexto: string | null
}

/** Las cartas de una póliza (la más reciente primero). `null` = no se pudo leer. */
export async function cartasDePoliza(correduriaId: string, polizaId: string): Promise<CartaEnLista[] | null> {
  if (!UUID.test(polizaId)) return []
  try {
    return await prismaAsegura().$queryRaw<CartaEnLista[]>`
      select id::text as id, estado, created_at as "creadaAt", firmada_at as "firmadaAt", enviada_at as "enviadaAt",
             aceptada_at as "aceptadaAt", rechazada_at as "rechazadaAt", rechazo_motivo as "rechazoMotivo", carta_texto as "cartaTexto"
      from carta_mediador where correduria_id = ${correduriaId}::uuid and poliza_id = ${polizaId}::uuid
      order by created_at desc limit 10`
  } catch (e) {
    console.error('[carta-mediador] no se pudo leer:', e instanceof Error ? e.message : e)
    return null
  }
}

export type ResultadoAccion =
  | { estado: 'ok'; nuevo: EstadoCartaMediador }
  | { estado: 'no_encontrada' }
  | { estado: 'no_permitida'; motivo: string }
  | { estado: 'invalida'; motivo: string }

export async function accionCarta(
  correduriaId: string, cartaId: string, accion: AccionCartaMediador, motivo: string | null, actor: string,
): Promise<ResultadoAccion> {
  if (!UUID.test(cartaId)) return { estado: 'no_encontrada' }
  const db = prismaAsegura()
  const [c] = await db.$queryRaw<{ estado: EstadoCartaMediador; clienteId: string; polizaId: string }[]>`
    select estado, cliente_id::text as "clienteId", poliza_id::text as "polizaId"
    from carta_mediador where id = ${cartaId}::uuid and correduria_id = ${correduriaId}::uuid`
  if (!c) return { estado: 'no_encontrada' }
  const nuevo = transicionCartaMediador(c.estado, accion)
  if (!nuevo) return { estado: 'no_permitida', motivo: `No se puede pasar de «${c.estado}» a «${accion}».` }
  const texto = motivo?.trim() ?? ''
  if (accion === 'rechazada' && !texto) return { estado: 'invalida', motivo: 'Di por qué la ha rechazado la compañía.' }
  const n = await db.$executeRaw`
    update carta_mediador set estado = ${nuevo},
           enviada_at   = case when ${nuevo} = 'enviada'   then now() else enviada_at end,
           aceptada_at  = case when ${nuevo} = 'aceptada'  then now() else aceptada_at end,
           rechazada_at = case when ${nuevo} = 'rechazada' then now() else rechazada_at end,
           rechazo_motivo = case when ${nuevo} = 'rechazada' then ${texto.slice(0, 500)} else rechazo_motivo end,
           desistida_at = case when ${nuevo} = 'desistida' then now() else desistida_at end,
           firma_otp_hash = null, firma_otp_expira = null, updated_at = now()
    where id = ${cartaId}::uuid and correduria_id = ${correduriaId}::uuid and estado = ${c.estado}`
  if (n === 0) return { estado: 'no_permitida', motivo: 'Ha cambiado a la vez: recarga.' }
  anotarCambio({ entidad: 'carta_mediador', id: cartaId, campo: 'estado', antes: c.estado, despues: nuevo })
  try {
    await db.$executeRaw`
      insert into historial_interno (correduria_id, cliente_id, poliza_id, tipo, texto)
      values (${correduriaId}::uuid, ${c.clienteId}::uuid, ${c.polizaId}::uuid, cast('gestion' as tipo_historial_interno),
              ${`Carta de nombramiento de mediador: ${nuevo} (${actor.slice(0, 100)}).`})`
  } catch (e) {
    console.error('[carta-mediador] historial no anotado:', e instanceof Error ? e.message : e)
  }
  return { estado: 'ok', nuevo }
}
