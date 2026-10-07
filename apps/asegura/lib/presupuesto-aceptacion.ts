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
  ESTADOS_ANULACION_ABIERTA, POLIZA_ESTADOS_VIGENTES, claveProducto, estadoPresupuesto,
} from '@central/module-seguros'
import { prismaAsegura } from './asegura-db'
import { anotarCambio } from './auditoria'
import { fichaPropiaDeRecurso } from './contacto-portal'
import { ipidDeOpcion } from './ipid'
import { encryptField } from '@central/module-seguros-pii'
import { cuentaDeFicha, type CuentaFicha } from './codeoscopic/cuenta-ficha'
import {
  lineaCuentaAviso, lineaCuentaDocumento, lineaCuentaHistorial, mascaraCuenta, resolverCuentaFirma, textoAutorizacionDe, textoAutorizacionOfertas, type CuentaElegida,
} from './presupuesto-cuenta'
import { estadoEmailDeFicha } from './email-ficha'
import {
  MAX_TEXTO_REPORTE, TEXTO_CONFIRMACION_DATOS, URL_PLATAFORMA_DEFECTO, anexoDatosFirmados, avisoAceptacion, avisoDatosIncorrectos,
  enlaceFichaCliente, escaparHtml, leerDatosCotizados, type DatosCotizados, type GrupoDatos,
} from './datos-cotizados'
import { origenPresupuesto } from './presupuesto-origen'
import { datosAceptacionOfertas, gruposAceptacionOfertas, gruposRevisionOfertas, lineaEmitirEnCompania } from './ofertas-reglas'

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
  /** `codeoscopic` | `ofertas` (sin petición a Avant2: se emite en la compañía). Otro valor = no se firma. */
  origen: string
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
  /** Las fichas IPID que el portal enseñaba en CADA opción del presupuesto (null = esa no tenía). */
  ipidsMostrados: { opcionId: string; compania: string; producto: string | null; huella: string | null }[]
  /** La petición que viajó a Codeoscopic: de ella salen los datos que el cliente confirma. */
  peticion: unknown
  /** El cliente dijo que un dato no es correcto: no se acepta desde el portal hasta retarificar. */
  datosEnRevision: boolean
}

async function leer(correduriaId: string, clienteId: string, presupuestoId: string, opcionId: string): Promise<Fila | null> {
  const [f] = await prismaAsegura().$queryRaw<Omit<Fila, 'ipidHuella' | 'ipidsMostrados'>[]>`
    select p.id::text as id, p.cliente_id::text as "clienteId", p.poliza_id::text as "polizaId", p.ramo, p.origen,
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
           (select count(*)::int from presupuesto_opcion x where x.presupuesto_id = p.id and x.oculta_at is null) as "nOpciones",
           (select count(distinct lower(trim(x.compania)))::int from presupuesto_opcion x where x.presupuesto_id = p.id and x.oculta_at is null) as "nCompanias",
           (select t.peticion from tarificaciones t where t.id = p.tarificacion_id and t.correduria_id = p.correduria_id) as peticion,
           exists (select 1 from presupuesto_evento ev where ev.presupuesto_id = p.id and ev.tipo = ${TIPO_DATOS_INCORRECTOS}) as "datosEnRevision"
    from presupuesto p
      join clientes c on c.id = p.cliente_id
      join presupuesto_opcion o on o.presupuesto_id = p.id and o.id = ${opcionId}::uuid and o.oculta_at is null
      left join polizas pol on pol.id = p.poliza_id
      left join companias_dgs cda on cda.codigo_dgs = pol.codigo_entidad_dgs
    where p.id = ${presupuestoId}::uuid and p.correduria_id = ${correduriaId}::uuid and p.cliente_id = ${clienteId}::uuid`
  if (!f) return null
  // Misma clave (compañía + producto) que usa el portal para pintar el enlace de cada tarjeta.
  const opciones = await prismaAsegura().$queryRaw<{ id: string; compania: string; producto: string | null }[]>`
    select id::text as id, compania, producto from presupuesto_opcion
    where presupuesto_id = ${presupuestoId}::uuid and oculta_at is null order by id`
  // Desde que se congelan TODAS (29/09/2026) hay decenas de opciones y muchas comparten producto: el
  // IPID se busca UNA vez por compañía+producto, no una por opción.
  const huellas = new Map<string, Promise<string | null>>()
  const huellaDe = (compania: string, producto: string | null) => {
    const k = claveProducto(compania, producto) ?? `sin-clave|${compania}|${producto ?? ''}`
    if (!huellas.has(k)) huellas.set(k, ipidDeOpcion(correduriaId, compania, producto).then((i) => i?.sha256 ?? null))
    return huellas.get(k)!
  }
  const ipidsMostrados = await Promise.all(opciones.map(async (o) => ({
    opcionId: o.id, compania: o.compania, producto: o.producto,
    huella: await huellaDe(o.compania, o.producto),
  })))
  const ipid = await ipidDeOpcion(correduriaId, f.compania, f.producto)
  return { ...f, ipidHuella: ipid?.sha256 ?? null, ipidsMostrados }
}

type Compuesto = {
  documento: string
  /** El texto de la casilla: con «información previa» solo si había IPID de la opción elegida. */
  confirmacionDatos: string
  /** La cuenta que se firma, enmascarada. Nunca el IBAN. */
  cuenta: Pick<CuentaElegida, 'origen' | 'mascara'>
  /** Los datos cotizados que el cliente confirma; van DENTRO del documento y de su huella. */
  datos: Extract<DatosCotizados, { estado: 'ok' }>
  documentoHash: string
  /** La anulación que se firmaría con ella. `null` = no se anula nada en este acto. */
  anulacion: { compania: string; numeroPoliza: string; fechaEfecto: string; carta: string; advertencia: string | null } | null
  /** Por qué NO va la anulación cuando podría hacer falta (se enseña al cliente y a Alberto). */
  sinAnulacion: string | null
}

function componer(f: Fila, hoy: string, datos: Extract<DatosCotizados, { estado: 'ok' }>, cuenta: CuentaElegida): Compuesto | null {
  const prima = f.prima === null ? null : Number(f.prima)
  if (prima === null || !Number.isFinite(prima)) return null
  // La casilla y el documento dependen del origen (puerta CERRADA): desconocido → no se compone nada.
  const via = origenPresupuesto(f.origen)
  const confirmacion = textoAutorizacionDe({ origen: f.origen, conIpid: !!f.ipidHuella, mediador: MEDIADOR.marca, compania: f.compania })
  if (via === null || confirmacion === null) return null
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
    ...(via === 'ofertas' ? { via } : {}),
  }) + '\n\n' + lineaCuentaDocumento(cuenta) + '\n\n' + anexoDatosFirmados(datos, confirmacion, via)
  // La huella cubre las DOS cartas: si cambia cualquiera, no se firma lo que no se leyó.
  // Los datos cotizados van DENTRO de `documento`, así que también los cubre.
  return {
    documento, documentoHash: huella(documento + '\n\n' + (anulacion?.carta ?? '')), anulacion, sinAnulacion, datos,
    confirmacionDatos: confirmacion, cuenta: { origen: cuenta.origen, mascara: cuenta.mascara },
  }
}

type SinFicha = { estado: 'sin_ficha' } | { estado: 'varias_fichas' } | { estado: 'sin_permiso' } | { estado: 'error'; causa: string }
type Base = { f: Fila; clienteId: string } | { estado: 'no_encontrado' } | { estado: 'no_admite'; motivo: string } | SinFicha

async function base(correduriaId: string, identidadId: string, presupuestoId: string, opcionId: string): Promise<Base> {
  if (!UUID.test(presupuestoId) || !UUID.test(opcionId)) return { estado: 'no_encontrado' }
  // La ficha es la DUEÑA del presupuesto si está vinculada con nivel de operar; con varias no se elige.
  const ficha = await fichaPropiaDeRecurso(correduriaId, identidadId, 'presupuesto', presupuestoId)
  if (ficha.estado === 'ajena') return { estado: 'no_encontrado' }
  if (ficha.estado !== 'ok') return ficha
  const f = await leer(correduriaId, ficha.clienteId, presupuestoId, opcionId)
  if (!f) return { estado: 'no_encontrado' }
  const estado = estadoPresupuesto(f, new Date())
  if (!admiteDecision(estado)) {
    return { estado: 'no_admite', motivo: estado === 'caducado' ? 'Este presupuesto ha caducado: pide uno actualizado a tu corredor.' : 'Este presupuesto ya no admite cambios.' }
  }
  return { f, clienteId: ficha.clienteId }
}

/** El cliente dijo que un dato no es correcto (evento append-only de `presupuesto_evento`). */
export const TIPO_DATOS_INCORRECTOS = 'datos_incorrectos'
const MOTIVO_EN_REVISION = 'Nos has dicho que un dato no es correcto. Te llamamos para corregirlo; no se emite nada hasta entonces.'

/** Los dos cierres fail-closed de los datos: ilegibles o avisados como incorrectos. */
type BloqueoDatos = { estado: 'sin_datos'; motivo: string } | { estado: 'datos_en_revision'; motivo: string }

function datosDe(f: Fila): Extract<DatosCotizados, { estado: 'ok' }> | BloqueoDatos {
  if (f.datosEnRevision) return { estado: 'datos_en_revision', motivo: MOTIVO_EN_REVISION }
  const origen = origenPresupuesto(f.origen)
  // Ofertas de compañías (PDF): no hay petición a Avant2 de la que leer «con qué datos se calculó». El
  // cliente confirma quién es el tomador y QUÉ oferta elige, y que la emisión la tramita el corredor
  // con la compañía. 🚨 Sin `tarificaciones`: este camino nunca lee la petición ni toca Codeoscopic.
  if (origen === 'ofertas') {
    return datosAceptacionOfertas(gruposAceptacionOfertas({ tomador: f.tomador, compania: f.compania, producto: f.producto }))
  }
  // Un origen que no se reconoce no se firma (fail-closed): no se sabe qué se estaría autorizando.
  if (origen !== 'codeoscopic') return { estado: 'sin_datos', motivo: 'No sabemos de dónde salen los precios de este presupuesto. Llámanos y lo revisamos contigo: no se emite nada hasta entonces.' }
  const d = leerDatosCotizados(f.peticion, f.ramo)
  return d.estado === 'ok' ? d : { estado: 'sin_datos', motivo: d.motivo }
}

/** Lo que el portal puede saber de la cuenta de la ficha: la MÁSCARA, nunca el IBAN. */
export type CuentaFichaPortal = { mascara: string | null; aviso: CuentaFicha['aviso'] }

/** La entrada del cliente: `eleccion` 'ficha' | 'otra' y, con 'otra', el IBAN tecleado. No se fía de nada. */
export type EntradaCuenta = { eleccion: unknown; iban: unknown }

type FalloCuenta = { estado: 'sin_cuenta' | 'iban_invalido'; motivo: string; cuentaFicha: CuentaFichaPortal }

/** La cuenta de la ficha; la de la póliza solo si es SUYA y está en vigor (si no, ni su máscara se enseña). */
async function cuentaDe(correduriaId: string, clienteId: string, f: Fila): Promise<{ ficha: CuentaFicha; portal: CuentaFichaPortal }> {
  const ficha = await cuentaDeFicha(correduriaId, f.polizaApta ? f.polizaId : null, clienteId)
  return { ficha, portal: { mascara: mascaraCuenta(ficha.iban), aviso: ficha.aviso } }
}

export type ResultadoPreparar =
  | ({ estado: 'ok'; consentimiento: string; cuentaFicha: CuentaFichaPortal } & Omit<Compuesto, 'datos'> & { datos: GrupoDatos[] })
  /** Todavía no ha elegido cuenta: se le enseña la de su ficha (enmascarada) o se le pide una. */
  | { estado: 'elegir_cuenta'; cuentaFicha: CuentaFichaPortal }
  | FalloCuenta
  | { estado: 'sin_precio' }
  | BloqueoDatos
  | Exclude<Base, { f: Fila }>

/** Lo que el cliente va a firmar con esa opción. No escribe nada. */
export async function prepararAceptacion(
  correduriaId: string, identidadId: string, presupuestoId: string, opcionId: string, entrada: EntradaCuenta | null = null,
): Promise<ResultadoPreparar> {
  const b = await base(correduriaId, identidadId, presupuestoId, opcionId)
  if (!('f' in b)) return b
  const d = datosDe(b.f)
  if (d.estado !== 'ok') return d
  const { ficha, portal } = await cuentaDe(correduriaId, b.clienteId, b.f)
  if (!entrada) return { estado: 'elegir_cuenta', cuentaFicha: portal }
  const rc = resolverCuentaFirma({ fichaIban: ficha.iban, eleccion: entrada.eleccion, ibanNuevo: entrada.iban })
  if (!rc.ok) return { estado: rc.estado, motivo: rc.motivo, cuentaFicha: portal }
  const c = componer(b.f, hoyMadrid(), d, rc.cuenta)
  if (!c) return { estado: 'sin_precio' }
  return { estado: 'ok', consentimiento: TEXTO_CONSENTIMIENTO, cuentaFicha: portal, ...c, datos: c.datos.grupos }
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
  // Provider disponible: Resend (punto único de envío) o, si no, el SMTP de siempre.
  const { createMailTransporter } = await import('@central/core-email')
  const hayProveedor = !!process.env.RESEND_API_KEY?.trim() || !!createMailTransporter()
  if (!hayProveedor || !process.env.ASEGURA_MAIL_FROM?.trim()) return { estado: 'sin_correo_configurado', motivo: 'el correo de la correduría no está configurado' }

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
  const { enviarCorreoSeguido } = await import('./correo-envio')
  const r = await enviarCorreoSeguido({
    correduriaId, clienteId: b.clienteId, tipo: 'presupuesto_codigo', to: ficha.email,
    asunto: 'Tu código para aceptar el presupuesto',
    texto: `Hola:\n\nTu código para aceptar el presupuesto en el portal es: ${codigo}\n\n` +
      `Caduca en ${MINUTOS_CODIGO} minutos. Si no lo has pedido tú, no hagas nada: sin el código no se firma nada.\n\nGrupo ASegura`,
  })
  if (r.resultado !== 'enviado') {
    console.error('[presupuesto-aceptacion] no salió el código:', r.motivo)
    return { estado: 'fallo_envio' }
  }
  return { estado: 'codigo_enviado', email: enmascarar(ficha.email), minutos: MINUTOS_CODIGO }
}

export type ResultadoFirma =
  /** `aviso`: el texto para Telegram; lo manda el portal, que es quien tiene el bot. */
  | { estado: 'aceptado'; aceptadoEl: string; conAnulacion: boolean; aviso: string; /** La baja firmada con él (para su justificante); no viaja al portal. */ anulacionId: string | null }
  | { estado: 'sin_codigo' } | { estado: 'codigo_caducado' } | { estado: 'demasiados_intentos' }
  | { estado: 'codigo_incorrecto'; quedan: number }
  | { estado: 'nombre_no_coincide' }
  | { estado: 'documento_cambiado' }
  | { estado: 'sin_precio' }
  /** Sin la casilla «He revisado mis datos…» marcada no se firma: lo decide el SERVIDOR, no la pantalla. */
  | { estado: 'sin_confirmar_datos' }
  /** Sin cuenta válida no se firma (la compañía no emite sin ella). */
  | Omit<FalloCuenta, 'cuentaFicha'>
  /** La clave PII no está: el IBAN no se guarda en claro, y sin guardarlo no se firma. */
  | { estado: 'sin_cifrado' }
  | BloqueoDatos
  | Exclude<Base, { f: Fila }>

export async function firmarAceptacion(
  correduriaId: string,
  identidadId: string,
  presupuestoId: string,
  opcionId: string,
  datos: {
    codigo: string; nombre: string; documentoHash: string; ip: string | null; userAgent: string | null; datosConfirmados: boolean
    cuenta: EntradaCuenta | null
  },
): Promise<ResultadoFirma> {
  // La casilla va lo PRIMERO: antes de tocar la BD y antes de gastar un intento del código.
  if (datos.datosConfirmados !== true) return { estado: 'sin_confirmar_datos' }
  const b = await base(correduriaId, identidadId, presupuestoId, opcionId)
  if (!('f' in b)) return b
  const { f, clienteId } = b
  // Fail-closed: con los datos ilegibles o avisados como incorrectos, no se autoriza la emisión.
  const dc = datosDe(f)
  if (dc.estado !== 'ok') return dc
  // Fail-closed, y ANTES de gastar un intento del código: sin cuenta válida no se firma.
  const { ficha: cuentaFichaActual } = await cuentaDe(correduriaId, clienteId, f)
  const rc = datos.cuenta
    ? resolverCuentaFirma({ fichaIban: cuentaFichaActual.iban, eleccion: datos.cuenta.eleccion, ibanNuevo: datos.cuenta.iban })
    : resolverCuentaFirma({ fichaIban: null, eleccion: null, ibanNuevo: null })
  if (!rc.ok) return { estado: rc.estado, motivo: rc.motivo }
  const cuenta = rc.cuenta
  // La nueva se guarda CIFRADA. `encryptField` sin clave devuelve el texto tal cual: eso no se escribe.
  let cuentaCifrada: string | null = null
  if (cuenta.origen === 'nueva') {
    try {
      cuentaCifrada = encryptField(cuenta.iban)
    } catch {
      cuentaCifrada = null
    }
    if (!cuentaCifrada || !cuentaCifrada.startsWith('v1:')) return { estado: 'sin_cifrado' }
  }
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
  const c = componer(f, hoy, dc, cuenta)
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
        values (${presupuestoId}::uuid, 'aceptado', 'cliente', ${JSON.stringify({
          opcionId, conAnulacion: !!c.anulacion,
          // Lo que confirmó con la casilla, y la huella de los datos que tenía delante.
          datosConfirmados: true, datosHuella: c.datos.huella, confirmacion: c.confirmacionDatos,
          // Solo la máscara: el IBAN vive cifrado en la ficha, no en el registro de eventos.
          cuenta: c.cuenta,
          // Información previa (RDL 3/2020): qué fichas IPID enseñaba el portal, y la de la elegida.
          ipidElegida: f.ipidHuella, ipidsMostrados: f.ipidsMostrados,
        })}::jsonb)`
      if (cuentaCifrada) {
        const n = await tx.$executeRaw`
          update clientes set cuenta_bancaria = ${cuentaCifrada}
          where id = ${clienteId}::uuid and correduria_id = ${correduriaId}::uuid`
        if (n === 0) throw new Error('la ficha del cliente no se pudo actualizar con la cuenta')
      }
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
  if (cuentaCifrada) {
    anotarCambio({
      entidad: 'cliente', id: clienteId, campo: 'cuenta_bancaria',
      antes: cuentaFichaActual.origen === 'cliente' ? mascaraCuenta(cuentaFichaActual.iban) : null, despues: cuenta.mascara,
    })
  }
  try {
    await db.$executeRaw`
      insert into historial_interno (correduria_id, cliente_id, poliza_id, tipo, texto)
      values (${correduriaId}::uuid, ${clienteId}::uuid, ${f.polizaId}::uuid, cast('gestion' as tipo_historial_interno),
              ${`El cliente aceptó en el portal el presupuesto de ${f.compania}${c.anulacion ? ' y firmó la anulación de su póliza actual' : ''}. ` +
                (f.origen === 'ofertas' ? `Presupuesto de OFERTAS (PDF): se emite en ${f.compania}, no por Avant2. ` : '') +
                (f.origen === 'ofertas'
                  ? `Confirmó con la casilla sus datos y la oferta elegida, y autorizó a ${MEDIADOR.marca} a gestionar la contratación con ${f.compania} en sus condiciones (huella ${c.datos.huella.slice(0, 12)}). `
                  : `Confirmó con la casilla los datos con los que se calculó el precio y autorizó la emisión (huella ${c.datos.huella.slice(0, 12)}). `) +
                `${lineaCuentaHistorial(c.cuenta)} ` +
                (f.ipidHuella ? 'Tenía en el portal la ficha IPID de la opción.' : 'No había ficha IPID de la opción en el portal: hay que mandársela antes de emitir.')})`
  } catch (e) {
    console.error('[presupuesto-aceptacion] historial no anotado:', e instanceof Error ? e.message : e)
  }
  // Ofertas: el corredor emite EN LA COMPAÑÍA (no hay emisión por API). Se dice lo primero del aviso.
  const avisoOfertas = f.origen === 'ofertas' ? `${escaparHtml(lineaEmitirEnCompania(f.compania))}\n` : ''
  const aviso = avisoOfertas + avisoAceptacion({
    tomador: f.tomador, ramo: f.ramo, compania: f.compania, producto: f.producto,
    primaEur: f.prima === null ? null : Number(f.prima), franquiciaEur: f.franquicia === null ? null : Number(f.franquicia),
    datos: c.datos, anulacionCompania: c.anulacion?.compania ?? null, sinAnulacion: c.sinAnulacion,
    enlaceFicha: enlaceFichaCliente(clienteId, urlPlataforma()),
    confirmacion: c.confirmacionDatos, cuenta: lineaCuentaAviso(c.cuenta), ipidMostrado: !!f.ipidHuella,
  })
  return { estado: 'aceptado', aceptadoEl: hoy, conAnulacion: !!c.anulacion, aviso, anulacionId: c.anulacion ? anulacionId : null }
}

const urlPlataforma = () => process.env.PLATAFORMA_URL?.trim() || URL_PLATAFORMA_DEFECTO

// ─── «Revisa tus datos» fuera de la firma: leerlos y avisar de uno que no es correcto ──────────

type Propio = {
  clienteId: string; ramo: string; origen: string; tomador: string; peticion: unknown
  datosEnRevision: boolean; retirado: boolean; emitido: boolean
}

/** El presupuesto, solo si es de la ficha de esta identidad. Mismo reparto que `base`, sin opción. */
async function propio(correduriaId: string, identidadId: string, presupuestoId: string): Promise<Propio | { estado: 'no_encontrado' } | SinFicha> {
  if (!UUID.test(presupuestoId)) return { estado: 'no_encontrado' }
  // La ficha es la DUEÑA del presupuesto si está vinculada con nivel de operar; con varias no se elige.
  const ficha = await fichaPropiaDeRecurso(correduriaId, identidadId, 'presupuesto', presupuestoId)
  if (ficha.estado === 'ajena') return { estado: 'no_encontrado' }
  if (ficha.estado !== 'ok') return ficha
  const [f] = await prismaAsegura().$queryRaw<Omit<Propio, 'clienteId'>[]>`
    select p.ramo, p.origen, trim(concat(c.nombre, ' ', coalesce(c.apellidos, ''))) as tomador,
           (select t.peticion from tarificaciones t where t.id = p.tarificacion_id and t.correduria_id = p.correduria_id) as peticion,
           exists (select 1 from presupuesto_evento ev where ev.presupuesto_id = p.id and ev.tipo = ${TIPO_DATOS_INCORRECTOS}) as "datosEnRevision",
           (p.retirado_at is not null) as retirado, (p.emitido_at is not null) as emitido
    from presupuesto p join clientes c on c.id = p.cliente_id
    where p.id = ${presupuestoId}::uuid and p.correduria_id = ${correduriaId}::uuid and p.cliente_id = ${ficha.clienteId}::uuid`
  return f ? { ...f, clienteId: ficha.clienteId } : { estado: 'no_encontrado' }
}

export type ResultadoDatos =
  | { estado: 'ok'; datos: GrupoDatos[]; confirmacionDatos: string; enRevision: boolean }
  | { estado: 'sin_datos'; motivo: string; enRevision: boolean }
  | { estado: 'no_encontrado' } | SinFicha

/** Los datos con los que se calculó el precio, para el bloque «Revisa tus datos». No escribe nada. */
export async function datosCotizadosDelPresupuesto(correduriaId: string, identidadId: string, presupuestoId: string): Promise<ResultadoDatos> {
  const p = await propio(correduriaId, identidadId, presupuestoId)
  if ('estado' in p) return p
  // Ofertas: no hay petición a Avant2; se enseña quién es el tomador y quién emite (sin tarificaciones).
  if (p.origen === 'ofertas') {
    return { estado: 'ok', datos: gruposRevisionOfertas(p.tomador), confirmacionDatos: textoAutorizacionOfertas(MEDIADOR.marca, 'la compañía que elija', false), enRevision: p.datosEnRevision }
  }
  // Puerta cerrada: solo un `codeoscopic` tiene petición de la que leer «con qué se calculó».
  if (origenPresupuesto(p.origen) !== 'codeoscopic') {
    return { estado: 'sin_datos', motivo: 'No sabemos de dónde salen los precios de este presupuesto. Llámanos y lo revisamos contigo: no se emite nada hasta entonces.', enRevision: p.datosEnRevision }
  }
  const d = leerDatosCotizados(p.peticion, p.ramo)
  if (d.estado !== 'ok') return { estado: 'sin_datos', motivo: d.motivo, enRevision: p.datosEnRevision }
  return { estado: 'ok', datos: d.grupos, confirmacionDatos: TEXTO_CONFIRMACION_DATOS, enRevision: p.datosEnRevision }
}

export const MAX_REPORTES_DIA = 3

export type ResultadoReporte =
  /** `aviso`: el Telegram para Alberto; lo manda el portal, que es quien tiene el bot. */
  | { estado: 'ok'; aviso: string }
  | { estado: 'invalido' } | { estado: 'limite' } | { estado: 'no_admite'; motivo: string }
  | { estado: 'no_encontrado' } | SinFicha

/**
 * «Hay un dato que no es correcto»: queda en `presupuesto_evento` (append-only; con él la firma
 * desde el portal queda cerrada, ver `datosDe`) y en el historial interno de la ficha. El aviso a
 * Alberto lo manda el portal por Telegram con el texto que devuelve esto.
 */
export async function reportarDatosIncorrectos(
  correduriaId: string, identidadId: string, presupuestoId: string, textoCrudo: string,
): Promise<ResultadoReporte> {
  const texto = textoCrudo.trim().slice(0, MAX_TEXTO_REPORTE)
  if (texto.length < 3) return { estado: 'invalido' }
  const p = await propio(correduriaId, identidadId, presupuestoId)
  if ('estado' in p) return p
  if (p.retirado || p.emitido) return { estado: 'no_admite', motivo: 'Este presupuesto ya no admite cambios: escríbenos o llámanos.' }
  const db = prismaAsegura()
  const [n] = await db.$queryRaw<{ n: number }[]>`
    select count(*)::int as n from presupuesto_evento
    where presupuesto_id = ${presupuestoId}::uuid and tipo = ${TIPO_DATOS_INCORRECTOS} and ocurrido_at > now() - interval '1 day'`
  if ((n?.n ?? 0) >= MAX_REPORTES_DIA) return { estado: 'limite' }
  await db.$executeRaw`
    insert into presupuesto_evento (presupuesto_id, tipo, origen, detalle)
    values (${presupuestoId}::uuid, ${TIPO_DATOS_INCORRECTOS}, 'cliente', ${JSON.stringify({ texto })}::jsonb)`
  anotarCambio({ entidad: 'presupuesto', id: presupuestoId, campo: 'datos_incorrectos', antes: null, despues: 'avisado' })
  try {
    await db.$executeRaw`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${p.clienteId}::uuid, cast('incidencia' as tipo_historial_interno),
              ${`El cliente dice en el portal que un dato del presupuesto de ${p.ramo} no es correcto: «${texto}». ` +
                'No puede aceptarlo desde el portal hasta retarificar con el dato bueno.'})`
  } catch (e) {
    console.error('[presupuesto-aceptacion] historial del dato incorrecto no anotado:', e instanceof Error ? e.message : e)
  }
  return {
    estado: 'ok',
    aviso: avisoDatosIncorrectos({ tomador: p.tomador, ramo: p.ramo, texto, enlaceFicha: enlaceFichaCliente(p.clienteId, urlPlataforma()) }),
  }
}
