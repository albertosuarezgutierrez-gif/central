// La CARTA DE NOMBRAMIENTO DE MEDIADOR (presupuesto, «salida B», PR 6).
//
// Portal (por el puente `/api/portal/carta-mediador`): el cliente que se queda con su compañía firma
// la carta para su póliza actual — preparar → código al correo → firmar. Mismo patrón que la firma de
// la anulación (`anulacion-portal.ts`): solo el TOMADOR, código obligatorio, se firma el texto exacto.
// Operador (`/api/operador/carta-mediador`): Alberto la ve en la ficha de la póliza y marca a mano
// «enviada», «aceptada» o «rechazada». La firmada sale a la compañía por la cola de aprobaciones
// (`aprobaciones.ts`, con su clic); también puede mandarla él por fuera y marcarla aquí.
// La carta lleva el DNI/NIF del tomador, así que `carta_texto` se guarda CIFRADO (como el resto de PII).
//
// El SQL crudo no prefija `seguros.`: la conexión ya trae `?schema=seguros`.

import { createHash, randomInt } from 'node:crypto'
import { FirmaPropia, TEXTO_CONSENTIMIENTO, nombreCoincide } from '@central/core-firma'
import {
  ESTADOS_ANULACION_ABIERTA, cartaNombramientoMediador, documentoParaCarta, sqlCarteraEnVigor, sqlCarteraViva, transicionCartaMediador,
  type AccionCartaMediador, type EstadoCartaMediador,
} from '@central/module-seguros'
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'
import { anotarCambio } from './auditoria'
import { campoIlegible, descifrarCampo } from './cartera-edicion'
import { encryptField } from '@central/module-seguros-pii'
import { fichaPropiaDe } from './contacto-portal'
import { estadoEmailDeFicha } from './email-ficha'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const MINUTOS_CODIGO = 10
export const MAX_INTENTOS = 5
export const SEGUNDOS_ENTRE_CODIGOS = 60
export const MAX_CODIGOS_DIA = 5

const hashCodigo = (c: string) => createHash('sha256').update(c).digest('hex')
const huella = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex')
const ANULACION_ABIERTA = [...ESTADOS_ANULACION_ABIERTA] as string[]
const hoyMadrid = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })

type Base = {
  presupuestoId: string; polizaId: string; clienteId: string; tomador: string
  /** DNI/NIF del tomador ya descifrado y validado (ver `base`); `null` = no hay uno válido. */
  documento: string | null
  /** El DNI está guardado pero la clave no lo abre: no es lo mismo que no tenerlo. */
  dniIlegible: boolean
  numeroPoliza: string | null; compania: string | null; ramo: string | null
  /** Lo que la póliza dice de sí misma: del volcado de 2013-2018 no es fiable, se enseña a Alberto, no se decide con ello. */
  estadoPoliza: string | null; vence: string | null
}

type Guardas = {
  dniCifrado: string | null
  presClienteId: string; yaNuestra: boolean; enVigor: boolean
  retirado: boolean; aceptado: boolean; emitido: boolean; enviado: boolean
  anulacionAbierta: boolean; cartaAceptada: boolean
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
  // 🚨 La compañía por su código DGS primero: el volcado escribe «(legacy)» en `aseguradora`, y lo que
  // quede de relleno lo rechaza `cartaNombramientoMediador` (nunca «A la atención de (legacy)»).
  const [b] = await prismaAsegura().$queryRaw<(Base & Guardas)[]>`
    select pr.id::text as "presupuestoId", pol.id::text as "polizaId", pol.cliente_id::text as "clienteId",
           pr.cliente_id::text as "presClienteId",
           trim(concat(c.nombre, ' ', coalesce(c.apellidos, ''))) as tomador, c.dni as "dniCifrado",
           pol.numero_poliza as "numeroPoliza", coalesce(cda.nombre_comun, pol.aseguradora) as compania, pol.tipo::text as ramo,
           pol.estado::text as "estadoPoliza", to_char(pol.fecha_vencimiento, 'YYYY-MM-DD') as vence,
           ${Prisma.raw(sqlCarteraViva('pol'))} as "yaNuestra",
           coalesce(${Prisma.raw(sqlCarteraEnVigor('pol'))}, false) as "enVigor",
           pr.retirado_at is not null as retirado, pr.aceptado_at is not null as aceptado,
           pr.emitido_at is not null as emitido, pr.enviado_at is not null as enviado,
           exists (select 1 from anulacion an where an.poliza_id = pol.id and an.estado = any(${ANULACION_ABIERTA}::text[])) as "anulacionAbierta",
           exists (select 1 from carta_mediador cm where cm.poliza_id = pol.id and cm.estado = 'aceptada') as "cartaAceptada"
    from presupuesto pr
      join polizas pol on pol.id = pr.poliza_id and pol.correduria_id = pr.correduria_id and pol.merged_into_poliza_id is null
      join clientes c on c.id = pol.cliente_id
      left join companias_dgs cda on cda.codigo_dgs = pol.codigo_entidad_dgs
    where pr.id = ${presupuestoId}::uuid and pr.correduria_id = ${correduriaId}::uuid`
  if (!b) return { estado: 'no_disponible', motivo: 'Este presupuesto no va sobre una póliza tuya que conozcamos: escríbenos y lo hablamos.' }
  if (b.presClienteId !== f.clienteId || b.clienteId !== f.clienteId) return { estado: 'otra_ficha' }
  // Las mismas guardas que el botón (`puedeNombrar`): el puente no se fía de que la UI lo haya escondido.
  if (b.retirado || !b.enviado) return { estado: 'no_disponible', motivo: 'Este presupuesto ya no está disponible. Recarga la página.' }
  // Aceptar una opción es la salida A (cambiar de compañía): firmar además el nombramiento sería contradecirse.
  if (b.aceptado || b.emitido || b.anulacionAbierta) {
    return { estado: 'no_disponible', motivo: 'Ya elegiste cambiar de compañía con este presupuesto: tu póliza actual se anula, no hace falta nombrarnos en ella.' }
  }
  if (b.cartaAceptada) return { estado: 'no_disponible', motivo: 'Tu compañía ya aceptó que seamos tus corredores en esta póliza: en unos días la verás aquí.' }
  // Si CIMA ya la trae, ya somos su corredor: no hay nada que nombrar.
  if (b.yaNuestra) {
    return { estado: 'no_disponible', motivo: b.enVigor ? 'Esta póliza ya la gestionamos nosotros.' : 'Esta póliza nos consta como no vigente: escríbenos y lo miramos.' }
  }
  // El DNI se lee aquí pero NO corta: a quien ya firmó hay que decirle «ya firmada», no «sube tu DNI».
  // La guarda vive en `motivoSinCarta`, detrás de mirar si hay una carta abierta.
  const dniIlegible = campoIlegible(b.dniCifrado)
  if (dniIlegible) console.error('[carta-mediador] el DNI de la ficha no se puede descifrar: revisa PII_ENCRYPTION_KEY')
  return { b: { ...b, dniIlegible, documento: dniIlegible ? null : documentoParaCarta(descifrarCampo(b.dniCifrado)) } }
}

/**
 * Por qué no hay carta que firmar. 🚨 La compañía identifica al tomador por su DNI/NIF: sin uno válido
 * no hay carta. Un cifrado que no abre NO es «no lo tienes»: subirlo otra vez no lo arregla.
 */
function motivoSinCarta(b: Base): string {
  if (b.dniIlegible) return 'Ahora mismo no podemos leer tu DNI de tu ficha: escríbenos y lo resolvemos.'
  if (!b.documento) return 'La carta tiene que llevar tu DNI y no lo tenemos en tu ficha. Súbelo en «Lo que falta para emitir»; en cuanto lo revisemos podrás firmarla.'
  return 'Nos falta el número o la compañía de tu póliza para la carta: escríbenos y la completamos.'
}

function componer(b: Base, hoy: string): string | null {
  return cartaNombramientoMediador({ tomador: b.tomador, documento: b.documento, compania: b.compania, numeroPoliza: b.numeroPoliza, ramo: b.ramo, fechaCarta: hoy })
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
  if (!carta) return { estado: 'no_disponible', motivo: motivoSinCarta(r.b) }
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
  const previa = await abierta(r.b.polizaId)
  if (previa && previa.estado !== 'pendiente') return { estado: 'ya_firmada', enviada: previa.estado === 'enviada' }
  if (!componer(r.b, hoyMadrid())) return { estado: 'no_disponible', motivo: motivoSinCarta(r.b) }
  const ficha = await estadoEmailDeFicha(correduriaId, r.b.clienteId)
  if (ficha.estado === 'ilegible') return { estado: 'sin_correo_configurado', motivo: 'no se puede leer el correo de tu ficha' }
  if (ficha.estado !== 'ok') return { estado: 'sin_email', motivo: ficha.estado === 'baja_de_correo' ? 'te diste de baja del correo' : 'no tenemos tu correo' }
  const { createMailTransporter } = await import('@central/core-email')
  // Proveedor = Resend por API o SMTP, como decide `correo-envio.ts`.
  const hayProveedor = !!process.env.RESEND_API_KEY?.trim() || !!createMailTransporter()
  if (!hayProveedor || !process.env.ASEGURA_MAIL_FROM?.trim()) return { estado: 'sin_correo_configurado', motivo: 'el correo de la correduría no está configurado' }

  const db = prismaAsegura()
  // La fila `pendiente` nace aquí (una abierta por póliza, la protege el índice parcial).
  await db.$executeRaw`
    insert into carta_mediador (correduria_id, cliente_id, poliza_id, presupuesto_id)
    values (${correduriaId}::uuid, ${r.b.clienteId}::uuid, ${r.b.polizaId}::uuid, ${presupuestoId}::uuid)
    on conflict (poliza_id) where estado in ('pendiente', 'firmada', 'enviada') do nothing`
  const a = await abierta(r.b.polizaId)
  if (!a) return { estado: 'no_encontrado' }
  // La póliza cambió de ficha (fusión, reasignación) con una carta abierta: lo resuelve Alberto.
  if (a.clienteId !== r.b.clienteId) return { estado: 'no_disponible', motivo: 'Ya hay una carta en trámite sobre esta póliza: escríbenos y lo miramos contigo.' }
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
  // Sale por el punto único con seguimiento: queda en `correo_envio` y sus eventos en la ficha.
  const { enviarCorreoSeguido } = await import('./correo-envio')
  const envio = await enviarCorreoSeguido({
    correduriaId, clienteId: r.b.clienteId, tipo: 'carta_mediador_codigo', to: ficha.email,
    asunto: 'Tu código para firmar el nombramiento de corredor',
    texto: `Hola:\n\nTu código para firmar en el portal la carta que nos nombra corredores de tu póliza es: ${codigo}\n\n` +
      `Caduca en ${MINUTOS_CODIGO} minutos. Si no lo has pedido tú, no hagas nada: sin el código no se firma nada.\n\nGrupo ASegura`,
  })
  if (envio.resultado !== 'enviado') {
    console.error('[carta-mediador] no salió el código:', envio.motivo ?? envio.codigo ?? 'sin_detalle')
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
  if (!texto) return { estado: 'no_disponible', motivo: motivoSinCarta(b) }
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
      update carta_mediador set estado = 'firmada', firmada_at = now(), firma_id = ${fila.id}::uuid, carta_texto = ${encryptField(texto)},
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
  const situacion = b.estadoPoliza || b.vence
    ? ` En la ficha consta${b.estadoPoliza ? ` «${b.estadoPoliza}»` : ''}${b.vence ? `, vencimiento ${b.vence.split('-').reverse().join('/')}` : ''}: si es del volcado antiguo, confírmalo con la compañía antes.`
    : ''
  const aviso = `🤝 ${b.tomador} ha FIRMADO la carta de nombramiento de mediador de su póliza de ${b.compania} (nº ${b.numeroPoliza}).${situacion} ` +
    'Tienes el correo a la compañía en Hoy · «Esperan tu OK»: la póliza no es nuestra hasta que la acepten.'
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
    const filas = await prismaAsegura().$queryRaw<CartaEnLista[]>`
      select id::text as id, estado, created_at as "creadaAt", firmada_at as "firmadaAt", enviada_at as "enviadaAt",
             aceptada_at as "aceptadaAt", rechazada_at as "rechazadaAt", rechazo_motivo as "rechazoMotivo", carta_texto as "cartaTexto"
      from carta_mediador where correduria_id = ${correduriaId}::uuid and poliza_id = ${polizaId}::uuid
      order by created_at desc limit 10`
    // Descifrada solo para la pantalla de Alberto; un cifrado que no abre se enseña como tal, no como «sin carta».
    return filas.map((f) => ({ ...f, cartaTexto: campoIlegible(f.cartaTexto) ? '(no se puede descifrar la carta: revisa PII_ENCRYPTION_KEY)' : descifrarCampo(f.cartaTexto) }))
  } catch (e) {
    console.error('[carta-mediador] no se pudo leer:', e instanceof Error ? e.message : e)
    return null
  }
}

export type CartaPorTramitar = {
  id: string; estado: 'firmada' | 'enviada'; polizaId: string; cliente: string | null
  compania: string | null; numeroPoliza: string | null; firmadaAt: Date; enviadaAt: Date | null
  /** Hay un correo a la compañía esperando el OK (o saliendo). `false` en una firmada = hay que mandarla a mano. */
  enCola: boolean
}

/**
 * Las cartas que esperan a Alberto (firmadas sin mandar) o a la compañía (enviadas sin respuesta), para
 * «Hoy». Sin esta lista una carta firmada solo se veía entrando en la ficha de esa póliza. `null` = no se pudo leer.
 */
export async function cartasPorTramitar(correduriaId: string): Promise<CartaPorTramitar[] | null> {
  try {
    return await prismaAsegura().$queryRaw<CartaPorTramitar[]>`
      select cm.id::text as id, cm.estado, cm.poliza_id::text as "polizaId",
             nullif(trim(concat(c.nombre, ' ', coalesce(c.apellidos, ''))), '') as cliente,
             coalesce(cda.nombre_comun, pol.aseguradora) as compania, pol.numero_poliza as "numeroPoliza",
             cm.firmada_at as "firmadaAt", cm.enviada_at as "enviadaAt",
             exists (select 1 from aprobacion x where x.carta_mediador_id = cm.id and x.estado in ('pendiente', 'enviando')) as "enCola"
      from carta_mediador cm
        join polizas pol on pol.id = cm.poliza_id
        left join clientes c on c.id = cm.cliente_id
        left join companias_dgs cda on cda.codigo_dgs = pol.codigo_entidad_dgs
      where cm.correduria_id = ${correduriaId}::uuid and cm.estado in ('firmada', 'enviada')
      order by (cm.estado = 'firmada') desc, cm.firmada_at
      limit 50`
  } catch (e) {
    console.error('[carta-mediador] no se pudo leer la lista:', e instanceof Error ? e.message : e)
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
