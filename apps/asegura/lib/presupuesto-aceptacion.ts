// El cliente ELIGE y FIRMA su presupuesto desde el portal (spec 2026-09-21 §2.4, PR 4).
//
// Mismo reparto que la firma de la anulación (2-d-2): el portal no escribe la cartera ni ve el correo
// en claro; llama al puente (`/api/portal/presupuesto`) con su identidad y aquí se resuelve la ficha
// por `portal_vinculo`. Solo el TOMADOR firma, y solo con un código nuevo al correo de su ficha.
//
// Si la opción elegida es de OTRA compañía (por código DGS, nunca por nombre), en el mismo acto firma
// la anulación de su póliza actual, a su vencimiento. Esa anulación nace `firmada` pero la cola de
// aprobaciones NO la propone hasta que el presupuesto conste EMITIDO (ver `lib/aprobaciones.ts`).
//
// 🚨 La firma no es la contratación: el documento lo dice, y el aviso a Alberto es inmediato (lo manda
// el portal por Telegram con el texto que devuelve `firmarAceptacion`).

import { createHash, randomInt, randomUUID } from 'node:crypto'
import { FirmaPropia, TEXTO_CONSENTIMIENTO, nombreCoincide } from '@central/core-firma'
import {
  MEDIADOR, VERSION_TEXTOS_LEGALES, admiteDecision, anulacionPorCambio, cartaAnulacion, documentoAceptacion, esCambioCompania,
  ESTADOS_ANULACION_ABIERTA, POLIZA_ESTADOS_VIGENTES, estadoPresupuesto, remitenteCorreo,
} from '@central/module-seguros'
import { prismaAsegura } from './asegura-db'
import { anotarCambio } from './auditoria'
import { fichaPropiaDe } from './contacto-portal'
import { ipidDeOpcion } from './ipid'
import { estadoEmailDeFicha } from './email-ficha'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const MINUTOS_CODIGO = 10
export const MAX_INTENTOS = 5
export const SEGUNDOS_ENTRE_CODIGOS = 60
export const MAX_CODIGOS_DIA = 5

const VIGENTES = [...POLIZA_ESTADOS_VIGENTES] as string[]
const ABIERTAS = [...ESTADOS_ANULACION_ABIERTA] as string[]
const hashCodigo = (c: string) => createHash('sha256').update(c).digest('hex')
const huella = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex')
const hoyMadrid = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })

type Fila = {
  id: string; clienteId: string; polizaId: string | null; ramo: string; tomador: string
  creadoAt: Date; venceEl: Date; enviadoAt: Date | null; vistoAt: Date | null; elegidoAt: Date | null
  aceptadoAt: Date | null; emitidoAt: Date | null; retiradoAt: Date | null; enlaceGeneradoAt: Date | null
  otpHash: string | null; otpExpira: Date | null
  necesidades: string | null
  opcionId: string; compania: string; producto: string | null; prima: string | null; franquicia: string | null; firmeza: string
  opcionDgs: string | null
  actualCompania: string | null; actualNumero: string | null; actualDgs: string | null; actualVence: string | null
  /** La póliza vinculada es de esta correduría, del MISMO cliente, no fusionada y en vigor. */
  polizaApta: boolean
  /** Ya hay un expediente de anulación abierto para esa póliza (el índice único no admite otro). */
  expedienteAbierto: boolean
  /** Opciones y compañías del presupuesto: lo que el cliente tuvo delante (no lo consultado). */
  nOpciones: number
  nCompanias: number
  /** Huella de la ficha IPID vigente de la opción (misma clave que el enlace del portal). */
  ipidHuella: string | null
}

async function leer(correduriaId: string, clienteId: string, presupuestoId: string, opcionId: string): Promise<Fila | null> {
  const [f] = await prismaAsegura().$queryRaw<Omit<Fila, 'ipidHuella'>[]>`
    select p.id::text as id, p.cliente_id::text as "clienteId", p.poliza_id::text as "polizaId", p.ramo,
           trim(concat(c.nombre, ' ', coalesce(c.apellidos, ''))) as tomador,
           p.creado_at as "creadoAt", p.vence_el as "venceEl", p.enviado_at as "enviadoAt", p.visto_at as "vistoAt",
           p.elegido_at as "elegidoAt", p.aceptado_at as "aceptadoAt", p.emitido_at as "emitidoAt",
           p.retirado_at as "retiradoAt", p.enlace_generado_at as "enlaceGeneradoAt",
           p.firma_otp_hash as "otpHash", p.firma_otp_expira as "otpExpira", p.necesidades,
           o.id::text as "opcionId", o.compania, o.producto, o.prima_eur::text as prima, o.franquicia_eur::text as franquicia, o.firmeza,
           (select cd.codigo_dgs from companias_dgs cd where lower(cd.nombre_comun) = lower(o.compania) limit 1) as "opcionDgs",
           coalesce(cda.nombre_comun, pol.aseguradora) as "actualCompania", pol.numero_poliza as "actualNumero",
           pol.codigo_entidad_dgs as "actualDgs", to_char(pol.fecha_vencimiento, 'YYYY-MM-DD') as "actualVence",
           coalesce(pol.correduria_id = p.correduria_id and pol.cliente_id = p.cliente_id and pol.merged_into_poliza_id is null
                    and pol.estado::text = any(${VIGENTES}::text[]), false) as "polizaApta",
           exists (select 1 from anulacion an where an.poliza_id = p.poliza_id
                     and an.estado = any(${ABIERTAS}::text[])) as "expedienteAbierto",
           (select count(*)::int from presupuesto_opcion x where x.presupuesto_id = p.id) as "nOpciones",
           (select count(distinct lower(trim(x.compania)))::int from presupuesto_opcion x where x.presupuesto_id = p.id) as "nCompanias"
    from presupuesto p
      join clientes c on c.id = p.cliente_id
      join presupuesto_opcion o on o.presupuesto_id = p.id and o.id = ${opcionId}::uuid
      left join polizas pol on pol.id = p.poliza_id
      left join companias_dgs cda on cda.codigo_dgs = pol.codigo_entidad_dgs
    where p.id = ${presupuestoId}::uuid and p.correduria_id = ${correduriaId}::uuid and p.cliente_id = ${clienteId}::uuid`
  if (!f) return null
  const ipid = await ipidDeOpcion(correduriaId, f.compania, f.producto)
  return { ...f, ipidHuella: ipid?.sha256 ?? null }
}

type Compuesto = {
  documento: string
  documentoHash: string
  /** La anulación que se firmaría con ella. `null` = no se anula nada en este acto. */
  anulacion: { compania: string; numeroPoliza: string; fechaEfecto: string; carta: string; advertencia: string | null } | null
  /** Por qué NO va la anulación cuando podría hacer falta (se enseña al cliente y a Alberto). */
  sinAnulacion: string | null
}

function componer(f: Fila, hoy: string): Compuesto | null {
  const prima = f.prima === null ? null : Number(f.prima)
  if (prima === null || !Number.isFinite(prima)) return null
  const firmeza = f.firmeza === 'firme' || f.firmeza === 'condicionado' ? f.firmeza : 'estimado'
  let anulacion: Compuesto['anulacion'] = null
  let sinAnulacion: string | null = null
  if (f.polizaId) {
    const cambio = esCambioCompania(f.actualDgs, f.opcionDgs)
    if (cambio === null) {
      sinAnulacion = 'No podemos confirmar si la opción es de otra compañía que tu póliza actual; tu corredor se encarga de la anulación si hace falta.'
    } else if (cambio && !f.polizaApta) {
      // Las mismas guardas que `crearAnulacion`: no se firma la baja de una póliza que no es suya o ya no está en vigor.
      sinAnulacion = 'Tu póliza actual no nos consta en vigor a tu nombre; tu corredor revisa si hay que anularla.'
    } else if (cambio && f.expedienteAbierto) {
      sinAnulacion = 'Ya hay una anulación de tu póliza actual en trámite con tu corredor; no hace falta firmar otra.'
    } else if (cambio) {
      const a = anulacionPorCambio({ compania: f.actualCompania, numeroPoliza: f.actualNumero, vencimiento: f.actualVence }, new Date())
      if (!a.ok) sinAnulacion = `${a.motivo} Tu corredor se encarga de la anulación de tu póliza actual.`
      else {
        const carta = cartaAnulacion({
          tomador: f.tomador, compania: f.actualCompania, numeroPoliza: f.actualNumero, ramo: f.ramo,
          tipo: a.tipo, fechaEfecto: a.fechaEfecto, fechaCarta: hoy, mediador: MEDIADOR.marca,
        })
        if (!carta) sinAnulacion = 'A tu póliza actual le falta un dato para la carta; tu corredor se encarga de la anulación.'
        else anulacion = { compania: f.actualCompania!, numeroPoliza: f.actualNumero!, fechaEfecto: a.fechaEfecto, carta, advertencia: a.advertencia }
      }
    }
  }
  const documento = documentoAceptacion({
    tomador: f.tomador, mediador: MEDIADOR.marca, claveDgsfp: MEDIADOR.identidad.claveDgsfp, ramo: f.ramo,
    opcion: { compania: f.compania, producto: f.producto, primaEur: prima, franquiciaEur: f.franquicia === null ? null : Number(f.franquicia), firmeza },
    calculadoEl: f.creadoAt.toISOString().slice(0, 10), venceEl: f.venceEl.toISOString().slice(0, 10), fechaFirma: hoy,
    anula: anulacion ? { compania: anulacion.compania, numeroPoliza: anulacion.numeroPoliza, fechaEfecto: anulacion.fechaEfecto } : null,
    vistoAntes: {
      opciones: f.nOpciones, companias: f.nCompanias,
      informacionMediador: `${MEDIADOR.identidad.portal}/legal/mediador`, versionTextos: VERSION_TEXTOS_LEGALES,
    },
    necesidades: f.necesidades,
    ipid: f.ipidHuella ? { huella: f.ipidHuella } : null,
  })
  // La huella cubre las DOS cartas: si cambia cualquiera, no se firma lo que no se leyó.
  return { documento, documentoHash: huella(documento + '\n\n' + (anulacion?.carta ?? '')), anulacion, sinAnulacion }
}

type SinFicha = { estado: 'sin_ficha' } | { estado: 'varias_fichas' } | { estado: 'error'; causa: string }
type Base = { f: Fila; clienteId: string } | { estado: 'no_encontrado' } | { estado: 'no_admite'; motivo: string } | SinFicha

async function base(correduriaId: string, identidadId: string, presupuestoId: string, opcionId: string): Promise<Base> {
  if (!UUID.test(presupuestoId) || !UUID.test(opcionId)) return { estado: 'no_encontrado' }
  const ficha = await fichaPropiaDe(correduriaId, identidadId)
  if (ficha.estado !== 'ok') return ficha
  const f = await leer(correduriaId, ficha.clienteId, presupuestoId, opcionId)
  if (!f) return { estado: 'no_encontrado' }
  const estado = estadoPresupuesto(f, new Date())
  if (!admiteDecision(estado)) {
    return { estado: 'no_admite', motivo: estado === 'caducado' ? 'Este presupuesto ha caducado: pide uno actualizado a tu corredor.' : 'Este presupuesto ya no admite cambios.' }
  }
  return { f, clienteId: ficha.clienteId }
}

export type ResultadoPreparar =
  | ({ estado: 'ok'; consentimiento: string } & Compuesto)
  | { estado: 'sin_precio' }
  | Exclude<Base, { f: Fila }>

/** Lo que el cliente va a firmar con esa opción. No escribe nada. */
export async function prepararAceptacion(correduriaId: string, identidadId: string, presupuestoId: string, opcionId: string): Promise<ResultadoPreparar> {
  const b = await base(correduriaId, identidadId, presupuestoId, opcionId)
  if (!('f' in b)) return b
  const c = componer(b.f, hoyMadrid())
  if (!c) return { estado: 'sin_precio' }
  return { estado: 'ok', consentimiento: TEXTO_CONSENTIMIENTO, ...c }
}

export type ResultadoCodigo =
  | { estado: 'codigo_enviado'; email: string; minutos: number }
  | { estado: 'espera'; segundos: number }
  | { estado: 'limite_codigos' }
  | { estado: 'sin_email'; motivo: string }
  | { estado: 'sin_correo_configurado'; motivo: string }
  | { estado: 'fallo_envio' }
  | Exclude<Base, { f: Fila }>

function enmascarar(email: string): string {
  const [u, d] = email.split('@')
  return d ? `${u.slice(0, 1)}***@${d}` : '***'
}

export async function pedirCodigoAceptacion(correduriaId: string, identidadId: string, presupuestoId: string, opcionId: string): Promise<ResultadoCodigo> {
  const b = await base(correduriaId, identidadId, presupuestoId, opcionId)
  if (!('f' in b)) return b
  const ficha = await estadoEmailDeFicha(correduriaId, b.clienteId)
  if (ficha.estado === 'ilegible') return { estado: 'sin_correo_configurado', motivo: 'no se puede leer el correo de tu ficha' }
  if (ficha.estado !== 'ok') return { estado: 'sin_email', motivo: ficha.estado === 'baja_de_correo' ? 'te diste de baja del correo' : 'no tenemos tu correo' }
  const { createMailTransporter } = await import('@central/core-email')
  const transporter = createMailTransporter()
  if (!transporter || !process.env.ASEGURA_MAIL_FROM?.trim()) return { estado: 'sin_correo_configurado', motivo: 'el correo de la correduría no está configurado' }

  const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0')
  // Guardado ANTES de mandar y en una sola sentencia con sus frenos (60 s y tope diario).
  const n = await prismaAsegura().$executeRaw`
    update presupuesto set firma_otp_hash = ${hashCodigo(codigo)}, firma_otp_intentos = 0,
           firma_otp_expira = now() + make_interval(mins => ${MINUTOS_CODIGO}::int),
           firma_otp_envios = case when firma_otp_envios_dia = current_date then firma_otp_envios + 1 else 1 end,
           firma_otp_envios_dia = current_date
    where id = ${presupuestoId}::uuid and correduria_id = ${correduriaId}::uuid and aceptado_at is null and retirado_at is null
      and (firma_otp_expira is null
           or firma_otp_expira <= now() + make_interval(secs => ${MINUTOS_CODIGO * 60 - SEGUNDOS_ENTRE_CODIGOS}::int))
      and (firma_otp_envios_dia is distinct from current_date or firma_otp_envios < ${MAX_CODIGOS_DIA}::int)`
  if (n === 0) {
    const [e] = await prismaAsegura().$queryRaw<{ agotado: boolean; faltan: number | null }[]>`
      select (firma_otp_envios_dia = current_date and firma_otp_envios >= ${MAX_CODIGOS_DIA}::int) as agotado,
             ceil(extract(epoch from (firma_otp_expira - now())) - ${MINUTOS_CODIGO * 60 - SEGUNDOS_ENTRE_CODIGOS})::int as faltan
      from presupuesto where id = ${presupuestoId}::uuid`
    if (!e) return { estado: 'no_encontrado' }
    if (e.agotado) return { estado: 'limite_codigos' }
    return { estado: 'espera', segundos: Math.max(1, e.faltan ?? SEGUNDOS_ENTRE_CODIGOS) }
  }
  try {
    await transporter.sendMail({
      from: remitenteCorreo(process.env.ASEGURA_MAIL_FROM),
      to: ficha.email,
      subject: 'Tu código para aceptar el presupuesto',
      text: `Hola:\n\nTu código para aceptar el presupuesto en el portal es: ${codigo}\n\n` +
        `Caduca en ${MINUTOS_CODIGO} minutos. Si no lo has pedido tú, no hagas nada: sin el código no se firma nada.\n\nGrupo ASegura`,
    })
  } catch (e) {
    console.error('[presupuesto-aceptacion] no salió el código:', e instanceof Error ? e.message : e)
    return { estado: 'fallo_envio' }
  }
  return { estado: 'codigo_enviado', email: enmascarar(ficha.email), minutos: MINUTOS_CODIGO }
}

export type ResultadoFirma =
  /** `aviso`: el texto para Telegram; lo manda el portal, que es quien tiene el bot. */
  | { estado: 'aceptado'; aceptadoEl: string; conAnulacion: boolean; aviso: string }
  | { estado: 'sin_codigo' } | { estado: 'codigo_caducado' } | { estado: 'demasiados_intentos' }
  | { estado: 'codigo_incorrecto'; quedan: number }
  | { estado: 'nombre_no_coincide' }
  | { estado: 'documento_cambiado' }
  | { estado: 'sin_precio' }
  | Exclude<Base, { f: Fila }>

export async function firmarAceptacion(
  correduriaId: string,
  identidadId: string,
  presupuestoId: string,
  opcionId: string,
  datos: { codigo: string; nombre: string; documentoHash: string; ip: string | null; userAgent: string | null },
): Promise<ResultadoFirma> {
  const b = await base(correduriaId, identidadId, presupuestoId, opcionId)
  if (!('f' in b)) return b
  const { f, clienteId } = b
  // Control exclusivo: sin código no hay firma, aunque la sesión esté abierta.
  if (!f.otpHash || !f.otpExpira) return { estado: 'sin_codigo' }
  // El intento se gasta ANTES de comparar y en una sola sentencia.
  const [gastado] = await prismaAsegura().$queryRaw<{ hash: string; intentos: number }[]>`
    update presupuesto set firma_otp_intentos = firma_otp_intentos + 1
    where id = ${presupuestoId}::uuid and correduria_id = ${correduriaId}::uuid and aceptado_at is null
      and firma_otp_hash is not null and firma_otp_expira > now() and firma_otp_intentos < ${MAX_INTENTOS}::int
    returning firma_otp_hash as hash, firma_otp_intentos as intentos`
  if (!gastado) return f.otpExpira.getTime() < Date.now() ? { estado: 'codigo_caducado' } : { estado: 'demasiados_intentos' }
  if (hashCodigo(datos.codigo.trim()) !== gastado.hash) return { estado: 'codigo_incorrecto', quedan: Math.max(0, MAX_INTENTOS - gastado.intentos) }
  if (!nombreCoincide(datos.nombre, f.tomador)) return { estado: 'nombre_no_coincide' }

  const hoy = hoyMadrid()
  const c = componer(f, hoy)
  if (!c) return { estado: 'sin_precio' }
  // Se firma lo que se leyó: si el documento (o la carta de anulación) ya no es el enseñado, no.
  if (c.documentoHash !== datos.documentoHash) return { estado: 'documento_cambiado' }

  const ficha = await estadoEmailDeFicha(correduriaId, clienteId)
  const email = ficha.estado === 'ok' ? ficha.email : null
  const contexto = { fecha: new Date().toISOString(), ip: datos.ip, user_agent: datos.userAgent }
  const firmar = (documentoId: string, texto: string) => new FirmaPropia().firmar({
    firmante: { id: clienteId, nombre: f.tomador, email },
    documento_id: documentoId,
    bytes: new TextEncoder().encode(texto),
    contexto,
    metodo: 'otp_email',
    nombre_confirmado: datos.nombre,
  })
  const evidencia = await firmar(presupuestoId, c.documento)
  const anulacionId = c.anulacion ? randomUUID() : null
  const evidenciaAnulacion = c.anulacion && anulacionId ? await firmar(anulacionId, c.anulacion.carta) : null

  const db = prismaAsegura()
  const insertarFirma = async (tx: typeof db, tipo: string, docId: string, ev: typeof evidencia) => {
    const [fila] = await tx.$queryRaw<{ id: string }[]>`
      insert into firma (correduria_id, documento_tipo, documento_id, cliente_id, identidad_id, doc_hash, algoritmo, metodo,
                         firmante_nombre, firmante_email, ip, user_agent, sello_tiempo, evidencia)
      values (${correduriaId}::uuid, ${tipo}, ${docId}::uuid, ${clienteId}::uuid, ${identidadId}::uuid,
              ${ev.doc_hash}, ${ev.algoritmo}, ${ev.metodo}, ${f.tomador}, ${ev.firmante.email ?? null},
              ${datos.ip}, ${datos.userAgent}, ${contexto.fecha}::timestamptz, ${JSON.stringify(ev)}::jsonb)
      on conflict (documento_tipo, documento_id) do nothing
      returning id::text as id`
    return fila?.id ?? null
  }
  let ok: boolean
  try {
    ok = await db.$transaction(async (tx) => {
      const firmaId = await insertarFirma(tx as typeof db, 'presupuesto', presupuestoId, evidencia)
      if (!firmaId) return false
      const n = await tx.$executeRaw`
        update presupuesto set aceptado_at = now(), elegido_at = coalesce(elegido_at, now()), opcion_elegida_id = ${opcionId}::uuid,
               documento_texto = ${c.documento}, firma_id = ${firmaId}::uuid, firma_otp_hash = null, firma_otp_expira = null,
               salida = ${c.anulacion ? 'cambio_compania' : null}
        where id = ${presupuestoId}::uuid and correduria_id = ${correduriaId}::uuid and aceptado_at is null and retirado_at is null`
      if (n === 0) throw new Error('el presupuesto cambió mientras se firmaba')
      await tx.$executeRaw`update presupuesto_opcion set elegida_at = now() where id = ${opcionId}::uuid and presupuesto_id = ${presupuestoId}::uuid`
      await tx.$executeRaw`
        insert into presupuesto_evento (presupuesto_id, tipo, origen, detalle)
        values (${presupuestoId}::uuid, 'aceptado', 'cliente', ${JSON.stringify({ opcionId, conAnulacion: !!c.anulacion })}::jsonb)`
      if (c.anulacion && anulacionId && evidenciaAnulacion && f.polizaId) {
        // La anulación nace firmada, pero la cola no la propone hasta que el presupuesto esté emitido.
        await tx.$executeRaw`
          insert into anulacion (id, correduria_id, poliza_id, cliente_id, tipo, solicitada_por, motivo, motivo_texto,
                                 fecha_efecto, estado, creada_por, firmada_at, carta_texto, firma_nota, presupuesto_id)
          values (${anulacionId}::uuid, ${correduriaId}::uuid, ${f.polizaId}::uuid, ${clienteId}::uuid, 'sustitucion', 'cliente', 'otro',
                  'Cambio de compañía: presupuesto aceptado en el portal', ${c.anulacion.fechaEfecto}::date, 'firmada', 'portal',
                  now(), ${c.anulacion.carta}, 'Firmada por el cliente en el portal junto con la aceptación del presupuesto',
                  ${presupuestoId}::uuid)`
        const firmaAnul = await insertarFirma(tx as typeof db, 'anulacion', anulacionId, evidenciaAnulacion)
        if (!firmaAnul) throw new Error('la firma de la anulación ya existía')
        await tx.$executeRaw`update anulacion set firma_id = ${firmaAnul}::uuid where id = ${anulacionId}::uuid`
      }
      return true
    })
  } catch (e) {
    // Carrera: Alberto abrió un expediente de esa póliza entre leer y firmar. Lo que se leyó ya no vale:
    // al recargar, el documento sale sin anulación y se firma de nuevo.
    if (e instanceof Error && /uq_anulacion_abierta_por_poliza/.test(e.message)) return { estado: 'documento_cambiado' }
    throw e
  }
  if (!ok) return { estado: 'no_admite', motivo: 'Este presupuesto ya estaba aceptado.' }

  anotarCambio({ entidad: 'presupuesto', id: presupuestoId, campo: 'aceptado', antes: null, despues: opcionId })
  if (anulacionId) anotarCambio({ entidad: 'anulacion', id: anulacionId, campo: 'estado', antes: null, despues: 'firmada' })
  try {
    await db.$executeRaw`
      insert into historial_interno (correduria_id, cliente_id, poliza_id, tipo, texto)
      values (${correduriaId}::uuid, ${clienteId}::uuid, ${f.polizaId}::uuid, cast('gestion' as tipo_historial_interno),
              ${`El cliente aceptó en el portal el presupuesto de ${f.compania}${c.anulacion ? ' y firmó la anulación de su póliza actual' : ''}.`})`
  } catch (e) {
    console.error('[presupuesto-aceptacion] historial no anotado:', e instanceof Error ? e.message : e)
  }
  const aviso = `✍️ ${f.tomador} ha ACEPTADO el presupuesto de ${f.ramo} (${f.compania}). Emítelo: no hay cobertura hasta entonces.` +
    (c.anulacion ? ` Firmó también la anulación de su póliza de ${c.anulacion.compania}, que saldrá a tu OK cuando la nueva conste emitida.` : '') +
    (c.sinAnulacion ? ` ⚠️ ${c.sinAnulacion}` : '')
  return { estado: 'aceptado', aceptadoEl: hoy, conAnulacion: !!c.anulacion, aviso }
}
