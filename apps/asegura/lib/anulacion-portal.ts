// La firma del cliente de su anulación, desde el portal (ASegura OS, pieza 2-d-2).
//
// El portal NO escribe la cartera: llama al puente estrecho (`/api/portal/anulacion`) con la
// identidad, y aquí se resuelve la ficha por `portal_vinculo` (nunca llega un `clienteId`).
//
// Tres pasos, todos del TOMADOR de la póliza y de nadie más:
//   1. `anulacionesParaFirmar` — las que tiene pendientes, con la carta compuesta.
//   2. `pedirCodigoFirma`      — código de 6 dígitos al correo de la ficha (10 min, 5 intentos).
//   3. `firmarAnulacion`       — valida código y nombre, firma (eIDAS art. 26, `FirmaPropia`) sobre
//                                el texto EXACTO de la carta, lo guarda y pasa el expediente a firmada.
//
// 🚨 La sesión del portal dura 30 días: NO basta para firmar una anulación. Sin código no hay firma.
// El SQL crudo no prefija `seguros.`: la conexión ya trae `?schema=seguros`.

import { createHash, randomInt } from 'node:crypto'
import { FirmaPropia, TEXTO_CONSENTIMIENTO, nombreCoincide } from '@central/core-firma'
import { MEDIADOR, cartaAnulacion, type TipoAnulacion } from '@central/module-seguros'
import { prismaAsegura } from './asegura-db'
import { anotarCambio } from './auditoria'
import { fichaPropiaDe } from './contacto-portal'
import { estadoEmailDeFicha } from './email-ficha'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const MINUTOS_CODIGO = 10
export const MAX_INTENTOS = 5
/** Entre dos códigos, como poco: cada código es un correo al cliente y reinicia los intentos. */
export const SEGUNDOS_ENTRE_CODIGOS = 60
/** Tope de códigos por anulación y día: cada código reinicia los intentos, así que sin tope no hay límite. */
export const MAX_CODIGOS_DIA = 5

const hashCodigo = (c: string) => createHash('sha256').update(c).digest('hex')

function hoyMadrid(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
}

export type AnulacionParaFirmar = {
  id: string
  numeroPoliza: string | null
  compania: string | null
  ramo: string | null
  tipo: TipoAnulacion
  fechaEfecto: string
  /** `null` = falta un dato que la carta necesita (compañía, número): no se puede firmar y se dice. */
  carta: string | null
  /** Huella de la carta que se enseña: al firmar vuelve, y si la carta ya no es esa, no se firma. */
  cartaHash: string | null
}

const huella = (texto: string) => createHash('sha256').update(texto, 'utf8').digest('hex')

type Pendiente = {
  id: string; clienteId: string; polizaId: string; tomador: string; numeroPoliza: string | null; compania: string | null
  ramo: string | null; tipo: TipoAnulacion; fechaEfecto: string
  otpHash: string | null; otpExpira: Date | null; otpIntentos: number
}

async function pendientesDe(correduriaId: string, clienteId: string, anulacionId?: string): Promise<Pendiente[]> {
  const filtroId = anulacionId ?? null
  return prismaAsegura().$queryRaw<Pendiente[]>`
    select a.id::text as id, a.cliente_id::text as "clienteId", a.poliza_id::text as "polizaId",
           trim(concat(c.nombre, ' ', coalesce(c.apellidos, ''))) as tomador,
           p.numero_poliza as "numeroPoliza", p.aseguradora as compania, p.tipo::text as ramo, a.tipo,
           to_char(a.fecha_efecto, 'YYYY-MM-DD') as "fechaEfecto",
           a.firma_otp_hash as "otpHash", a.firma_otp_expira as "otpExpira", a.firma_otp_intentos as "otpIntentos"
    from anulacion a join polizas p on p.id = a.poliza_id join clientes c on c.id = a.cliente_id
    where a.correduria_id = ${correduriaId}::uuid and a.cliente_id = ${clienteId}::uuid
      and a.estado = 'solicitada' and (${filtroId}::uuid is null or a.id = ${filtroId}::uuid)
    order by a.fecha_efecto`
}

function carta(p: Pendiente, fechaCarta: string): string | null {
  return cartaAnulacion({
    tomador: p.tomador, compania: p.compania, numeroPoliza: p.numeroPoliza, ramo: p.ramo,
    tipo: p.tipo, fechaEfecto: p.fechaEfecto, fechaCarta, mediador: MEDIADOR.marca,
  })
}

type Ficha = Awaited<ReturnType<typeof fichaPropiaDe>>
type SinFicha = { estado: 'sin_ficha' } | { estado: 'varias_fichas' } | { estado: 'error'; causa: string }

function sinFicha(f: Ficha): SinFicha | null {
  return f.estado === 'ok' ? null : f
}

/** `consentimiento` es el texto EXACTO que queda en la evidencia: el portal enseña este, no una copia. */
export type LecturaParaFirmar = { estado: 'ok'; anulaciones: AnulacionParaFirmar[]; consentimiento: string } | SinFicha

export async function anulacionesParaFirmar(correduriaId: string, identidadId: string): Promise<LecturaParaFirmar> {
  const f = await fichaPropiaDe(correduriaId, identidadId)
  if (f.estado !== 'ok') return sinFicha(f)!
  const hoy = hoyMadrid()
  const filas = await pendientesDe(correduriaId, f.clienteId)
  return {
    estado: 'ok',
    consentimiento: TEXTO_CONSENTIMIENTO,
    anulaciones: filas.map((p) => {
      const texto = carta(p, hoy)
      return {
        id: p.id, numeroPoliza: p.numeroPoliza, compania: p.compania, ramo: p.ramo, tipo: p.tipo,
        fechaEfecto: p.fechaEfecto, carta: texto, cartaHash: texto ? huella(texto) : null,
      }
    }),
  }
}

export type ResultadoCodigo =
  | { estado: 'codigo_enviado'; email: string; minutos: number }
  | { estado: 'no_encontrada' }
  /** Sin compañía o número la carta no identifica la póliza: no se firma, se avisa al corredor. */
  | { estado: 'carta_incompleta' }
  | { estado: 'sin_email'; motivo: string }
  | { estado: 'sin_correo_configurado'; motivo: string }
  | { estado: 'fallo_envio' }
  /** Acaba de pedir uno: el anterior sigue valiendo. */
  | { estado: 'espera'; segundos: number }
  /** Ya se han pedido los códigos de hoy para esta anulación: mañana, o que llame. */
  | { estado: 'limite_codigos' }
  | SinFicha

function enmascarar(email: string): string {
  const [u, d] = email.split('@')
  return d ? `${u.slice(0, 1)}***@${d}` : '***'
}

export async function pedirCodigoFirma(correduriaId: string, identidadId: string, anulacionId: string): Promise<ResultadoCodigo> {
  if (!UUID.test(anulacionId)) return { estado: 'no_encontrada' }
  const f = await fichaPropiaDe(correduriaId, identidadId)
  if (f.estado !== 'ok') return sinFicha(f)!
  const [p] = await pendientesDe(correduriaId, f.clienteId, anulacionId)
  if (!p) return { estado: 'no_encontrada' }
  if (!carta(p, hoyMadrid())) return { estado: 'carta_incompleta' }
  const ficha = await estadoEmailDeFicha(correduriaId, f.clienteId)
  if (ficha.estado === 'ilegible') return { estado: 'sin_correo_configurado', motivo: 'no se puede leer el correo de tu ficha' }
  if (ficha.estado !== 'ok') return { estado: 'sin_email', motivo: ficha.estado === 'baja_de_correo' ? 'te diste de baja del correo' : 'no tenemos tu correo' }

  // Provider disponible: Resend (punto único de envío) o, si no, el SMTP de siempre.
  const { createMailTransporter } = await import('@central/core-email')
  const hayProveedor = !!process.env.RESEND_API_KEY?.trim() || !!createMailTransporter()
  if (!hayProveedor || !process.env.ASEGURA_MAIL_FROM?.trim()) return { estado: 'sin_correo_configurado', motivo: 'el correo de la correduría no está configurado' }

  const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0')
  // Se guarda ANTES de mandar (si el envío falla, el código viejo queda sustituido y no vale), y en
  // UNA sentencia con sus dos frenos: 60 s desde el anterior y tope diario. Leer y luego escribir
  // dejaría pasar dos peticiones a la vez, y cada una es un correo al cliente.
  const n = await prismaAsegura().$executeRaw`
    update anulacion set firma_otp_hash = ${hashCodigo(codigo)}, firma_otp_intentos = 0,
           firma_otp_expira = now() + make_interval(mins => ${MINUTOS_CODIGO}::int),
           firma_otp_envios = case when firma_otp_envios_dia = current_date then firma_otp_envios + 1 else 1 end,
           firma_otp_envios_dia = current_date, updated_at = now()
    where id = ${anulacionId}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'solicitada'
      and (firma_otp_expira is null
           or firma_otp_expira <= now() + make_interval(secs => ${MINUTOS_CODIGO * 60 - SEGUNDOS_ENTRE_CODIGOS}::int))
      and (firma_otp_envios_dia is distinct from current_date or firma_otp_envios < ${MAX_CODIGOS_DIA}::int)`
  if (n === 0) {
    const [e] = await prismaAsegura().$queryRaw<{ agotado: boolean; faltan: number | null }[]>`
      select (firma_otp_envios_dia = current_date and firma_otp_envios >= ${MAX_CODIGOS_DIA}::int) as agotado,
             ceil(extract(epoch from (firma_otp_expira - now())) - ${MINUTOS_CODIGO * 60 - SEGUNDOS_ENTRE_CODIGOS})::int as faltan
      from anulacion where id = ${anulacionId}::uuid and estado = 'solicitada'`
    if (!e) return { estado: 'no_encontrada' }
    if (e.agotado) return { estado: 'limite_codigos' }
    return { estado: 'espera', segundos: Math.max(1, e.faltan ?? SEGUNDOS_ENTRE_CODIGOS) }
  }
  const { enviarCorreoSeguido } = await import('./correo-envio')
  const r = await enviarCorreoSeguido({
    correduriaId, clienteId: f.clienteId, tipo: 'anulacion_codigo', to: ficha.email,
    asunto: 'Tu código para firmar la anulación',
    texto: `Hola:\n\nTu código para firmar la anulación de tu póliza en el portal es: ${codigo}\n\n` +
      `Caduca en ${MINUTOS_CODIGO} minutos. Si no lo has pedido tú, no hagas nada: sin el código no se firma nada.\n\nGrupo ASegura`,
  })
  if (r.resultado !== 'enviado') {
    console.error('[anulacion-portal] no salió el código:', r.motivo)
    return { estado: 'fallo_envio' }
  }
  return { estado: 'codigo_enviado', email: enmascarar(ficha.email), minutos: MINUTOS_CODIGO }
}

export type ResultadoFirma =
  | { estado: 'firmada'; firmadaEl: string }
  | { estado: 'no_encontrada' }
  | { estado: 'carta_incompleta' }
  | { estado: 'sin_codigo' }
  | { estado: 'codigo_caducado' }
  | { estado: 'demasiados_intentos' }
  | { estado: 'codigo_incorrecto'; quedan: number }
  | { estado: 'nombre_no_coincide' }
  /** La carta ya no es la que se enseñó (cambió la fecha o un dato de la póliza): que recargue. */
  | { estado: 'carta_cambiada' }
  | SinFicha

export async function firmarAnulacion(
  correduriaId: string,
  identidadId: string,
  anulacionId: string,
  datos: { codigo: string; nombre: string; cartaHash: string; ip: string | null; userAgent: string | null },
): Promise<ResultadoFirma> {
  if (!UUID.test(anulacionId)) return { estado: 'no_encontrada' }
  const f = await fichaPropiaDe(correduriaId, identidadId)
  if (f.estado !== 'ok') return sinFicha(f)!
  const [p] = await pendientesDe(correduriaId, f.clienteId, anulacionId)
  if (!p) return { estado: 'no_encontrada' }

  // Control exclusivo: el código es OBLIGATORIO (la sesión sola no firma una anulación).
  if (!p.otpHash || !p.otpExpira) return { estado: 'sin_codigo' }
  // El intento se GASTA antes de comparar y en una sola sentencia: leer el contador y sumar después
  // dejaría que cien peticiones a la vez leyeran todas «0 intentos».
  const [gastado] = await prismaAsegura().$queryRaw<{ hash: string; intentos: number }[]>`
    update anulacion set firma_otp_intentos = firma_otp_intentos + 1
    where id = ${anulacionId}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'solicitada'
      and firma_otp_hash is not null and firma_otp_expira > now() and firma_otp_intentos < ${MAX_INTENTOS}::int
    returning firma_otp_hash as hash, firma_otp_intentos as intentos`
  if (!gastado) return p.otpExpira.getTime() < Date.now() ? { estado: 'codigo_caducado' } : { estado: 'demasiados_intentos' }
  if (hashCodigo(datos.codigo.trim()) !== gastado.hash) {
    return { estado: 'codigo_incorrecto', quedan: Math.max(0, MAX_INTENTOS - gastado.intentos) }
  }
  if (!nombreCoincide(datos.nombre, p.tomador)) return { estado: 'nombre_no_coincide' }

  const hoy = hoyMadrid()
  const texto = carta(p, hoy)
  if (!texto) return { estado: 'carta_incompleta' }
  // Se firma lo que se leyó: si la carta de ahora no es la enseñada, no se firma otra en su lugar.
  if (huella(texto) !== datos.cartaHash) return { estado: 'carta_cambiada' }
  const ficha = await estadoEmailDeFicha(correduriaId, f.clienteId)
  const contexto = { fecha: new Date().toISOString(), ip: datos.ip, user_agent: datos.userAgent }
  // Lo que se hashea es EXACTAMENTE el texto que se guarda en `carta_texto` y que se mandará.
  const evidencia = await new FirmaPropia().firmar({
    firmante: { id: f.clienteId, nombre: p.tomador, email: ficha.estado === 'ok' ? ficha.email : null },
    documento_id: anulacionId,
    bytes: new TextEncoder().encode(texto),
    contexto,
    metodo: 'otp_email',
    nombre_confirmado: datos.nombre,
  })

  const db = prismaAsegura()
  const firmada = await db.$transaction(async (tx) => {
    const [fila] = await tx.$queryRaw<{ id: string }[]>`
      insert into firma (correduria_id, documento_tipo, documento_id, cliente_id, identidad_id, doc_hash, algoritmo, metodo,
                         firmante_nombre, firmante_email, ip, user_agent, sello_tiempo, evidencia)
      values (${correduriaId}::uuid, 'anulacion', ${anulacionId}::uuid, ${f.clienteId}::uuid, ${identidadId}::uuid,
              ${evidencia.doc_hash}, ${evidencia.algoritmo}, ${evidencia.metodo}, ${p.tomador}, ${evidencia.firmante.email ?? null},
              ${datos.ip}, ${datos.userAgent}, ${contexto.fecha}::timestamptz, ${JSON.stringify(evidencia)}::jsonb)
      on conflict (documento_tipo, documento_id) do nothing
      returning id::text as id`
    if (!fila) return false
    const n = await tx.$executeRaw`
      update anulacion set estado = 'firmada', firmada_at = now(), firma_id = ${fila.id}::uuid, carta_texto = ${texto},
             firma_nota = 'Firmada por el cliente en el portal (código al correo)',
             firma_otp_hash = null, firma_otp_expira = null, updated_at = now()
      where id = ${anulacionId}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'solicitada'`
    if (n === 0) throw new Error('el expediente cambió mientras se firmaba')
    return true
  })
  if (!firmada) return { estado: 'no_encontrada' }

  anotarCambio({ entidad: 'anulacion', id: anulacionId, campo: 'estado', antes: 'solicitada', despues: 'firmada' })
  try {
    await db.$executeRaw`
      insert into historial_interno (correduria_id, cliente_id, poliza_id, tipo, texto)
      values (${correduriaId}::uuid, ${f.clienteId}::uuid, ${p.polizaId}::uuid, cast('gestion' as tipo_historial_interno),
              ${`El cliente firmó en el portal la anulación (efecto ${p.fechaEfecto}).`})`
  } catch (e) {
    console.error('[anulacion-portal] historial no anotado:', e instanceof Error ? e.message : e)
  }
  return { estado: 'firmada', firmadaEl: hoy }
}
