/* eslint-disable @typescript-eslint/no-explicit-any -- delegados Prisma tipados de forma estructural (fake en tests) */
// Servicio de RECEPCIÓN (spec 4.1): matrícula → vehículo/cliente → recepción con fotos, firma y casillas → OT.
// Siempre dentro de `conTaller`. El servicio NO depende de las casillas de consentimiento (RGPD art. 7.4).
import { cambioVencimientoSeguro, normalizarMatricula, validarMovilCliente, validarVencimientoSeguro, type ConfigTaller } from '@central/module-taller'
import type { AlmacenArchivos } from './almacen.ts'
import { evaluarLeadSeguros, registrarConsentimientos, type CasillasMarcadas, type TxConsent } from './consentimientos.ts'
import type { Notificador } from './notificador.ts'

type Delegado = {
  findMany(a?: any): Promise<any[]>
  findFirst(a?: any): Promise<any>
  create(a: any): Promise<any>
  update(a: any): Promise<any>
}
export type TxRecepcion = TxConsent & {
  $executeRaw(s: TemplateStringsArray, ...v: unknown[]): Promise<unknown>
  cliente: Delegado
  vehiculo: Delegado
  recepcion: Delegado
  recepcionFoto: Delegado
  ordenTrabajo: Delegado
}

export class ErrorRecepcion extends Error {}

export type FotoEntrada = { posicion: string | null; mime: string; nombre: string; bytes: Uint8Array; capturadaEn: Date }
export type EntradaRecepcion = {
  tallerId: string
  usuarioId: string
  matricula: string
  clienteId: string | null
  cliente: { nombre: string; movil: string; correo: string }
  /** Dirección del cliente ya VALIDADA (CP → … → número) o null si no se dio. Nunca a medias. */
  direccion: { cp: string; provincia: string; municipio: string; via: string; numero: string } | null
  km: number | null
  combustible: string | null
  objetos: string
  motivo: string
  danos: { nota: string } | null
  /** `vence` (AAAA-MM-DD) es también el VENCIMIENTO DEL SEGURO del vehículo (`vehiculos.seguro_hasta`, con traza). Vacío = no se toca. */
  seguro: { vigente: boolean | null; aseguradora: string; vence: string | null } | null
  fotos: FotoEntrada[]
  /** PNG de la firma. Sin firma, la recepción se guarda igual pero NO queda firmada (la OT no se factura). */
  firma: { mime: string; bytes: Uint8Array } | null
  casillas: CasillasMarcadas
  ip: string | null
  userAgent: string | null
  ahora: Date
}

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Siguiente número de OT del taller (sin huecos ni repeticiones: candado de transacción por taller). */
export async function siguienteNumeroOt(tx: Pick<TxRecepcion, '$executeRaw' | 'ordenTrabajo'>, tallerId: string): Promise<number> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'ot:' + tallerId}))`
  const u = await tx.ordenTrabajo.findFirst({ where: { tallerId }, orderBy: { numero: 'desc' }, select: { numero: true } })
  return (u?.numero ?? 0) + 1
}

export async function crearRecepcion(
  tx: TxRecepcion,
  e: EntradaRecepcion,
  deps: { config: ConfigTaller; almacen: AlmacenArchivos; notificador: Notificador; textoTaller: { version: string; texto: string } },
) {
  const norm = normalizarMatricula(e.matricula)
  if (!norm) throw new ErrorRecepcion('falta la matrícula')
  const nombre = e.cliente.nombre.trim()
  if (!nombre) throw new ErrorRecepcion('falta el nombre del cliente')
  const correo = e.cliente.correo.trim()
  if (correo && !CORREO.test(correo)) throw new ErrorRecepcion('correo inválido')
  // Móvil OBLIGATORIO también para un cliente antiguo que no lo tenía: al tocar su ficha se pide (el correo sigue opcional).
  const movil = validarMovilCliente(e.cliente.movil)
  if (!movil.ok) throw new ErrorRecepcion(movil.motivo)
  const vence = validarVencimientoSeguro(e.seguro?.vence ?? null, e.ahora)
  if (!vence.ok) throw new ErrorRecepcion(vence.motivo)
  if (e.km !== null && (!Number.isSafeInteger(e.km) || e.km < 0)) throw new ErrorRecepcion('kilómetros inválidos')
  const t = e.tallerId

  // Cliente: el que cargó la matrícula (se actualizan sus datos de contacto) o uno nuevo. Vacío = null (no «sin dato»).
  const datosCliente = { nombre, movil: movil.movil, correo: correo || null, ...(e.direccion ?? {}) }
  let clienteId: string
  if (e.clienteId) {
    const c = await tx.cliente.findFirst({ where: { tallerId: t, id: e.clienteId } })
    if (!c) throw new ErrorRecepcion('cliente no encontrado')
    await tx.cliente.update({ where: { id: c.id }, data: datosCliente })
    clienteId = c.id
  } else {
    clienteId = (await tx.cliente.create({ data: { tallerId: t, ...datosCliente } })).id
  }

  // Vehículo: la matrícula normalizada es la clave del taller.
  // Vencimiento del seguro: solo si se tecleó y cambia (queda quién, cuándo y «recepcion»); nunca se borra uno conocido.
  let veh = await tx.vehiculo.findFirst({ where: { tallerId: t, matriculaNormalizada: norm } })
  const seguro = cambioVencimientoSeguro(veh?.seguroHasta ?? null, vence.fecha, { usuarioId: e.usuarioId, origen: 'recepcion', ahora: e.ahora })
  if (veh) {
    await tx.vehiculo.update({
      where: { id: veh.id },
      data: { clienteId, ...(e.km !== null ? { kmActuales: e.km } : {}), ...(seguro ?? {}) },
    })
  } else {
    veh = await tx.vehiculo.create({
      data: { tallerId: t, matricula: e.matricula.trim().toUpperCase(), clienteId, kmActuales: e.km, ...(seguro ?? {}) },
    })
  }

  const rec = await tx.recepcion.create({
    data: {
      tallerId: t, vehiculoId: veh.id, clienteId, usuarioId: e.usuarioId, kmEntrada: e.km,
      nivelCombustible: e.combustible, objetos: e.objetos.trim() || null, motivo: e.motivo.trim() || null,
      danos: e.danos && e.danos.nota.trim() ? { nota: e.danos.nota.trim() } : undefined,
      seguroDeclarado: e.seguro ?? undefined, recibidoEn: e.ahora,
    },
  })

  let firmaRuta: string | null = null
  if (e.firma) {
    const f = await deps.almacen.guardar({ tallerId: t, carpeta: rec.id, nombre: 'firma.png', mime: e.firma.mime, bytes: e.firma.bytes })
    firmaRuta = f.ruta
    await tx.recepcion.update({ where: { id: rec.id }, data: { firmaRuta: f.ruta, firmadoEn: e.ahora } })
  }
  for (const [i, foto] of e.fotos.entries()) {
    const f = await deps.almacen.guardar({ tallerId: t, carpeta: rec.id, nombre: foto.nombre, mime: foto.mime, bytes: foto.bytes })
    await tx.recepcionFoto.create({
      data: { tallerId: t, recepcionId: rec.id, orden: i + 1, posicion: foto.posicion, ruta: f.ruta, huellaSha256: f.huellaSha256, capturadaEn: foto.capturadaEn },
    })
  }

  // Consentimientos: solo lo que la persona marcó. Sin marcar → ninguna fila, y todo lo demás sigue igual.
  const consent = await registrarConsentimientos(tx, {
    tallerId: t, clienteId, canal: 'recepcion', marcadas: e.casillas, textoTaller: deps.textoTaller,
    firmaRuta, ip: e.ip, userAgent: e.userAgent, ahora: e.ahora,
  })

  const numero = await siguienteNumeroOt(tx, t)
  const ot = await tx.ordenTrabajo.create({
    data: { tallerId: t, numero, recepcionId: rec.id, vehiculoId: veh.id, estado: 'recepcion' },
  })

  if (correo) {
    await deps.notificador.enviar({
      tallerId: t, tipo: 'resguardo', a: correo, asunto: `Resguardo de depósito ${veh.matricula ?? e.matricula} · OT ${numero}`,
      texto: deps.config.textos.pieResguardo, referencia: rec.id,
    })
  }

  // Puente a `seguros` (F3): aquí SOLO se decide; no hay transporte. Sin consentimiento → permitido:false. El vencimiento del
  // seguro y el contacto se quedan en el taller: no se adjuntan a nada que salga (no existe envío de leads todavía).
  const lead = await evaluarLeadSeguros(tx, { tallerId: t, clienteId, hoy: e.ahora })

  return { recepcionId: rec.id as string, otId: ot.id as string, otNumero: numero, clienteId, vehiculoId: veh.id as string, firmada: firmaRuta !== null, consentimientos: consent, lead }
}

/** Datos para precargar la pantalla al teclear una matrícula: vehículo, cliente e historial (últimas 5 visitas). */
export async function buscarPorMatricula(tx: Pick<TxRecepcion, 'vehiculo' | 'cliente' | 'recepcion'>, tallerId: string, matricula: string) {
  const norm = normalizarMatricula(matricula)
  if (!norm) return null
  const v = await tx.vehiculo.findFirst({ where: { tallerId, matriculaNormalizada: norm } })
  if (!v) return null
  const c = v.clienteId ? await tx.cliente.findFirst({ where: { tallerId, id: v.clienteId } }) : null
  const hist = await tx.recepcion.findMany({ where: { tallerId, vehiculoId: v.id }, orderBy: { recibidoEn: 'desc' }, take: 5 })
  return { vehiculo: v, cliente: c, historial: hist }
}
