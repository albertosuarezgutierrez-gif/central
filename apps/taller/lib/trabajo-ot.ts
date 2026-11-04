/* eslint-disable @typescript-eslint/no-explicit-any -- delegados Prisma tipados de forma estructural (fake en tests) */
// El mecánico en SU orden: notas (con dictado confirmado por la persona), fotos y propuestas de ampliación (sin precios).
// Recepción/dueño las completan con precio y las mandan al cliente por /p/[token] (`enviarPropuesta`). Dentro de `conTaller`.
import {
  calcularPresupuesto, transicionarOt, type ConfigTaller, type EstadoOt, type LineaSolicitada,
} from '@central/module-taller'
import type { AlmacenArchivos } from './almacen.ts'
import { generarEnlace, type TxPresupuestos } from './presupuestos.ts'

type Delegado = {
  findMany(a?: any): Promise<any[]>
  findFirst(a?: any): Promise<any>
  create(a: any): Promise<any>
  update(a: any): Promise<any>
}
export type TxTrabajo = TxPresupuestos & {
  otNota: Delegado
  otFoto: Delegado
  otPropuesta: Delegado
  otPropuestaLinea: Delegado
  ampliacionFoto: Delegado
  presupuestoLinea: Delegado
}

export class ErrorTrabajo extends Error {}

/** Estados en los que se anota/propone sobre el coche (los mismos que ve el mecánico). */
export const ESTADOS_ABIERTOS: readonly EstadoOt[] = ['aceptado', 'en_curso', 'ampliacion_pendiente']

const MAX_NOTA = 2000

async function otAbierta(tx: Pick<TxTrabajo, 'ordenTrabajo'>, tallerId: string, otId: string) {
  const ot = await tx.ordenTrabajo.findFirst({ where: { tallerId, id: otId } })
  if (!ot) throw new ErrorTrabajo('orden no encontrada')
  if (!ESTADOS_ABIERTOS.includes(ot.estado)) throw new ErrorTrabajo(`la orden está «${ot.estado}»: ya no admite notas ni propuestas`)
  return ot
}

/** La nota la ha CONFIRMADA la persona (el dictado solo rellena el cuadro de texto; aquí llega lo que pulsó «Guardar»). */
export async function anadirNota(tx: TxTrabajo, o: { tallerId: string; usuarioId: string; otId: string; texto: string }) {
  const texto = o.texto.trim()
  if (!texto) throw new ErrorTrabajo('la nota está vacía')
  if (texto.length > MAX_NOTA) throw new ErrorTrabajo('la nota es demasiado larga')
  await otAbierta(tx, o.tallerId, o.otId)
  return (await tx.otNota.create({ data: { tallerId: o.tallerId, otId: o.otId, autorId: o.usuarioId, texto } })).id as string
}

export type FotoSubida = { mime: string; nombre: string; bytes: Uint8Array; nota?: string | null; capturadaEn: Date }

export async function anadirFotos(
  tx: TxTrabajo, almacen: AlmacenArchivos,
  o: { tallerId: string; usuarioId: string; otId: string; propuestaId?: string | null; fotos: FotoSubida[] },
): Promise<number> {
  if (o.fotos.length === 0) throw new ErrorTrabajo('no hay fotos')
  await otAbierta(tx, o.tallerId, o.otId)
  if (o.propuestaId) {
    const p = await tx.otPropuesta.findFirst({ where: { tallerId: o.tallerId, id: o.propuestaId, otId: o.otId } })
    if (!p) throw new ErrorTrabajo('propuesta no encontrada')
    if (p.estado !== 'pendiente_envio') throw new ErrorTrabajo('la propuesta ya se envió: no admite más fotos')
  }
  for (const f of o.fotos) {
    // Carpeta = la OT: ruta `<taller>/<otId>/…`.
    const r = await almacen.guardar({ tallerId: o.tallerId, carpeta: `ot/${o.otId}`, nombre: f.nombre, mime: f.mime, bytes: f.bytes })
    await tx.otFoto.create({
      data: {
        tallerId: o.tallerId, otId: o.otId, propuestaId: o.propuestaId ?? null, autorId: o.usuarioId, ruta: r.ruta,
        huellaSha256: r.huellaSha256, nota: f.nota?.trim() || null, capturadaEn: f.capturadaEn,
      },
    })
  }
  return o.fotos.length
}

export type LineaPropuesta = { descripcion: string; referencia?: string | null; cantidad: number }

/** El mecánico propone piezas/ampliación. SIN precios. Queda «pendiente de envío» hasta que recepción/dueño la manda. */
export async function proponerAmpliacion(
  tx: TxTrabajo, almacen: AlmacenArchivos,
  o: { tallerId: string; usuarioId: string; otId: string; explicacion: string; lineas: LineaPropuesta[]; fotos: FotoSubida[] },
): Promise<string> {
  const lineas = o.lineas.map((l) => ({ descripcion: l.descripcion.trim(), referencia: l.referencia?.trim() || null, cantidad: l.cantidad }))
  if (lineas.length === 0) throw new ErrorTrabajo('añade al menos una pieza o trabajo')
  for (const l of lineas) {
    if (!l.descripcion) throw new ErrorTrabajo('una línea no tiene descripción')
    if (!Number.isSafeInteger(l.cantidad) || l.cantidad <= 0) throw new ErrorTrabajo('cantidad inválida')
  }
  await otAbierta(tx, o.tallerId, o.otId)
  const p = await tx.otPropuesta.create({
    data: { tallerId: o.tallerId, otId: o.otId, autorId: o.usuarioId, explicacion: o.explicacion.trim().slice(0, MAX_NOTA), estado: 'pendiente_envio' },
  })
  for (const [i, l] of lineas.entries()) {
    await tx.otPropuestaLinea.create({ data: { tallerId: o.tallerId, propuestaId: p.id, orden: i + 1, ...l } })
  }
  if (o.fotos.length > 0) await anadirFotos(tx, almacen, { tallerId: o.tallerId, usuarioId: o.usuarioId, otId: o.otId, propuestaId: p.id, fotos: o.fotos })
  return p.id as string
}

export type PrecioLinea = { orden: number; precioUnitarioCent: number }

export type ResultadoEnvio = { ok: true; presupuestoId: string; token: string } | { ok: false; errores: string[] }

/**
 * Recepción/dueño pone precio a cada línea de la propuesta y la manda: crea el presupuesto origen «ampliacion» (hijo del de la
 * OT, calculado con la configuración vigente), copia las fotos, genera el enlace y pone la OT en «ampliacion_pendiente».
 * Sin esto, la línea NO llega a la OT: solo entra cuando el cliente acepta por /p/[token].
 */
export async function enviarPropuesta(
  tx: TxTrabajo, o: { tallerId: string; propuestaId: string; precios: PrecioLinea[]; config: ConfigTaller; ahora: Date },
): Promise<ResultadoEnvio> {
  const prop = await tx.otPropuesta.findFirst({ where: { tallerId: o.tallerId, id: o.propuestaId } })
  if (!prop) return { ok: false, errores: ['propuesta no encontrada'] }
  if (prop.estado !== 'pendiente_envio') return { ok: false, errores: [`la propuesta ya está «${prop.estado}»`] }
  const ot = await tx.ordenTrabajo.findFirst({ where: { tallerId: o.tallerId, id: prop.otId } })
  if (!ot) return { ok: false, errores: ['orden no encontrada'] }
  if (!ot.presupuestoId) return { ok: false, errores: ['la orden no tiene presupuesto aceptado del que colgar la ampliación'] }
  if (!['en_curso', 'ampliacion_pendiente'].includes(ot.estado)) return { ok: false, errores: [`la orden está «${ot.estado}»`] }
  const lineasProp = await tx.otPropuestaLinea.findMany({ where: { tallerId: o.tallerId, propuestaId: prop.id }, orderBy: { orden: 'asc' } })
  const lineas: LineaSolicitada[] = []
  for (const l of lineasProp) {
    const pr = o.precios.find((x) => x.orden === l.orden)
    if (!pr || !Number.isSafeInteger(pr.precioUnitarioCent) || pr.precioUnitarioCent < 0) return { ok: false, errores: [`falta el precio de «${l.descripcion}»`] }
    lineas.push({ tipo: 'pieza', descripcion: l.descripcion, ...(l.referencia ? { referencia: l.referencia } : {}), cantidad: l.cantidad, precioUnitarioCent: pr.precioUnitarioCent })
  }
  const padre = await tx.presupuesto.findFirst({ where: { tallerId: o.tallerId, id: ot.presupuestoId } })
  if (!padre) return { ok: false, errores: ['presupuesto de la orden no encontrado'] }
  const c = calcularPresupuesto(o.config, { tipoVehiculo: padre.tipoVehiculoCodigo ?? null, lineas })
  if (!c.ok) return { ok: false, errores: c.errores }
  const p = c.presupuesto

  const pres = await tx.presupuesto.create({
    data: {
      tallerId: o.tallerId, vehiculoId: padre.vehiculoId, clienteId: padre.clienteId, origen: 'ampliacion', estado: 'borrador',
      presupuestoPadreId: padre.id, tipoVehiculoCodigo: padre.tipoVehiculoCodigo ?? null, precioHoraCent: BigInt(o.config.precioHoraCent),
      baseCent: BigInt(p.baseCent), cuotaIvaCent: BigInt(p.cuotaIvaCent), totalCent: BigInt(p.totalCent),
      caducaEn: new Date(o.ahora.getTime() + o.config.validezPresupuestoDias * 86_400_000),
    },
  })
  for (const [i, l] of p.lineas.entries()) {
    await tx.presupuestoLinea.create({
      data: {
        tallerId: o.tallerId, presupuestoId: pres.id, orden: i + 1, tipo: l.tipo, descripcion: l.descripcion, paqueteCodigo: l.paqueteCodigo,
        referencia: l.referencia ?? null, cantidad: l.cantidad, unidad: l.unidad, baremoMinutos: l.baremoMinutos, precioCerrado: l.precioCerrado,
        baseCent: BigInt(l.baseCent), ivaCodigo: l.ivaCodigo, ivaPuntosBasicos: l.ivaPuntosBasicos, cuotaIvaCent: BigInt(l.cuotaIvaCent),
        totalCent: BigInt(l.totalCent),
      },
    })
  }
  const fotos = await tx.otFoto.findMany({ where: { tallerId: o.tallerId, propuestaId: prop.id } })
  for (const f of fotos) {
    await tx.ampliacionFoto.create({ data: { tallerId: o.tallerId, presupuestoId: pres.id, ruta: f.ruta, huellaSha256: f.huellaSha256, nota: f.nota ?? null } })
  }
  const enlace = await generarEnlace(tx, { tallerId: o.tallerId, presupuestoId: pres.id, ahora: o.ahora, config: o.config })
  if (!enlace.ok) return { ok: false, errores: [enlace.motivo] }
  await tx.otPropuesta.update({ where: { id: prop.id }, data: { estado: 'enviada', presupuestoId: pres.id } })
  if (ot.estado === 'en_curso') {
    const t = transicionarOt('en_curso', 'ampliacion_pendiente')
    if (t.ok) await tx.ordenTrabajo.update({ where: { id: ot.id }, data: { estado: t.estado } })
  }
  return { ok: true, presupuestoId: pres.id, token: enlace.token }
}

export async function descartarPropuesta(tx: TxTrabajo, o: { tallerId: string; propuestaId: string }): Promise<void> {
  const p = await tx.otPropuesta.findFirst({ where: { tallerId: o.tallerId, id: o.propuestaId } })
  if (!p) throw new ErrorTrabajo('propuesta no encontrada')
  if (p.estado !== 'pendiente_envio') throw new ErrorTrabajo(`la propuesta ya está «${p.estado}»`)
  await tx.otPropuesta.update({ where: { id: p.id }, data: { estado: 'descartada' } })
}
