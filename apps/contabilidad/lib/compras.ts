// Compras: alta de factura recibida (manual hoy; Gmail/OCR después por el puerto `FuenteFacturasRecibidas`) y pagos a proveedores.
// Sin BD directa: `RepoContable` inyectado (tests con fake). Todo pasa por el puerto de hechos (`recibirHecho`), así que el asiento sale de
// las reglas de la empresa y es idempotente.
//
//   · NIF del proveedor validado con `@central/core-fiscal` (algoritmo oficial NIF/NIE/CIF).
//   · DUPLICADO = mismo (NIF, nº de factura normalizado): se rechaza ANTES de asentar y la BD lo vuelve a exigir (UNIQUE).
//   · Si el hecho no llega a «asentado» (cuenta inexistente, ejercicio cerrado…) la operación NO se guarda: el llamador revierte la transacción.
//   · El adjunto es solo una REFERENCIA de texto; no se sube nada a ningún almacenamiento.
import {
  aFechaISO, antiguedadSaldos, hechoDeFacturaRecibida, normalizarNifProveedor, normalizarNumeroFactura, totalesFactura, validarFormaFacturaRecibida,
  esMedioPago, MEDIOS_PAGO, type EntradaFacturaRecibida, type HechoPago, type MedioPago, type ProveedorRecordado,
} from '@central/module-contabilidad'
import { validarNifCif } from '@central/core-fiscal/validacion'
import type { RepoContable } from './repo.ts'
import { reglasEfectivas, recibirHecho } from './servicio.ts'
import { huella } from './huella.ts'

export const APP_INTERNA = 'contabilidad'
type Meta = { usuarioId: string | null; hoy: Date }

export type ResultadoCompra =
  | { ok: true; facturaId: string; asientoId: string; base: number; cuota: number; retencion: number; total: number; aPagar: number }
  | { ok: false; motivo: 'datos' | 'duplicado' | 'no_asentada'; errores: string[] }

export function problemasDeNif(nif: string): string[] {
  const n = normalizarNifProveedor(nif)
  if (!/^[A-Z0-9]{8,12}$/.test(n)) return ['el NIF del proveedor no tiene un formato válido']
  const v = validarNifCif(n)
  return v.ok ? [] : [v.motivo ?? 'el NIF del proveedor no es válido']
}

export async function registrarFacturaRecibida(repo: RepoContable, entrada: EntradaFacturaRecibida, meta: Meta): Promise<ResultadoCompra> {
  const hoyISO = aFechaISO(meta.hoy)
  const problemas = [...validarFormaFacturaRecibida(entrada, hoyISO), ...(entrada.proveedor?.nif ? problemasDeNif(entrada.proveedor.nif) : [])]
  if (problemas.length) return { ok: false, motivo: 'datos', errores: problemas }

  const nif = normalizarNifProveedor(entrada.proveedor.nif)
  const numeroNorm = normalizarNumeroFactura(entrada.numero)
  const previa = await repo.facturaRecibidaPorClave(nif, numeroNorm)
  if (previa) {
    return { ok: false, motivo: 'duplicado', errores: [`ya está registrada la factura ${previa.numero} de ${previa.proveedorNombre} (NIF ${nif}), de fecha ${previa.fecha.split('-').reverse().join('/')}`] }
  }

  const empresa = await repo.empresa()
  const reglas = reglasEfectivas(await repo.reglasVigentes(), empresa?.sector)
  const f: EntradaFacturaRecibida = { ...entrada, proveedor: { ...entrada.proveedor, nif, nombre: entrada.proveedor.nombre.trim() } }
  const t = totalesFactura(f.lineas, f.retencionPct ?? 0)
  const r = await recibirHecho(repo, APP_INTERNA, hechoDeFacturaRecibida(f, reglas))
  if (r.resultado !== 'asentado') {
    return { ok: false, motivo: 'no_asentada', errores: [r.resultado === 'conflicto' ? 'ya existía un hecho con esa referencia y otro contenido' : `no se pudo asentar: ${r.motivo}`] }
  }
  if (r.duplicado) return { ok: false, motivo: 'duplicado', errores: ['esa factura ya se había asentado antes'] }

  const id = await repo.insertarFacturaRecibida({
    proveedorNif: nif, proveedorNombre: f.proveedor.nombre, numero: f.numero.trim(), numeroNorm, fecha: f.fecha, fechaContable: f.fechaContable ?? f.fecha,
    base: t.base, cuota: t.cuota, retencion: t.retencion, total: t.total, lineas: { lineas: f.lineas, retencionPct: f.retencionPct ?? 0 },
    origen: f.origen ?? 'manual', adjuntoRef: f.adjuntoRef?.trim() || null, hechoId: r.hechoId, asientoId: r.asientoId, creadaPor: meta.usuarioId,
  })
  if (!id) return { ok: false, motivo: 'duplicado', errores: ['otra petición registró esa misma factura a la vez'] }

  // Recordar al proveedor: categoría de la línea de mayor base y retención habitual (sugerencia de la próxima vez, editable).
  const mayor = [...f.lineas].sort((a, b) => b.base - a.base)[0]
  const antes = await repo.proveedor(nif)
  await repo.guardarProveedor({
    nif, nombre: f.proveedor.nombre, tipo: f.proveedor.tipo === 'acreedor' || t.retencion > 0 ? 'acreedor' : (antes?.tipo ?? 'proveedor'),
    categoria: mayor?.categoria ?? antes?.categoria ?? null, retencionPct: f.retencionPct !== undefined && f.retencionPct > 0 ? Math.round(f.retencionPct) : (antes?.retencionPct ?? null),
  })
  await repo.auditar({ actor: 'usuario', usuarioId: meta.usuarioId, accion: 'registrar_factura_recibida', entidad: 'facturas_recibidas', entidadId: id, detalle: { nif, numero: f.numero.trim(), total: t.total } })
  return { ok: true, facturaId: id, asientoId: r.asientoId, base: t.base, cuota: t.cuota, retencion: t.retencion, total: t.total, aPagar: t.aPagar }
}

export type PendientePago = { cuenta: string; documento: string; desde: string; dias: number; pendiente: number }

/** Partidas de proveedores/acreedores con saldo pendiente (40x/41x). Fuente de verdad: el libro, no una tabla aparte. */
export async function pendientesDePago(repo: RepoContable, hoy: Date): Promise<PendientePago[]> {
  const a = antiguedadSaldos(await repo.partidasPorDocumento(['40', '41'], { hasta: aFechaISO(hoy) }), 'proveedores', hoy)
  return (a?.filas ?? []).filter((f) => f.documento !== null).map((f) => ({ cuenta: f.cuenta, documento: f.documento as string, desde: f.desde, dias: f.dias, pendiente: f.importe }))
}

export type EntradaPago = { documento: string; cuenta?: string; importe: number; fecha: string; medio: MedioPago }
export type ResultadoPago =
  | { ok: true; asientoId: string; duplicado: boolean; pendienteTras: number }
  | { ok: false; errores: string[] }

/** Pago (total o parcial) de una factura recibida pendiente: hecho `pago` con su medio (efectivo → 570; resto → 572). */
export async function registrarPago(repo: RepoContable, entrada: EntradaPago, meta: Meta): Promise<ResultadoPago> {
  const errores: string[] = []
  if (typeof entrada.documento !== 'string' || !entrada.documento.trim()) errores.push('falta la factura a pagar')
  if (!Number.isSafeInteger(entrada.importe) || entrada.importe <= 0) errores.push('el importe debe ser mayor que cero')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entrada.fecha ?? '') || Number.isNaN(Date.parse(entrada.fecha))) errores.push('la fecha del pago no es válida')
  else if (entrada.fecha > aFechaISO(meta.hoy)) errores.push('la fecha del pago es futura')
  if (!esMedioPago(entrada.medio)) errores.push(`medio de pago no válido (${MEDIOS_PAGO.join(', ')})`)
  if (errores.length) return { ok: false, errores }

  const pendientes = (await pendientesDePago(repo, meta.hoy)).filter((p) => p.documento === entrada.documento && (!entrada.cuenta || p.cuenta === entrada.cuenta))
  if (pendientes.length === 0) return { ok: false, errores: ['esa factura no tiene nada pendiente de pago'] }
  if (pendientes.length > 1) return { ok: false, errores: ['esa factura está en varias cuentas: indica la cuenta'] }
  const p = pendientes[0]
  if (entrada.importe > p.pendiente) return { ok: false, errores: ['el pago supera lo pendiente de esa factura'] }

  const hecho: HechoPago = {
    tipo: 'pago', fecha: entrada.fecha, ref: `pago:${huella({ d: entrada.documento, c: p.cuenta, f: entrada.fecha, i: entrada.importe, m: entrada.medio }).slice(0, 40)}`,
    concepto: `Pago ${entrada.documento}`.slice(0, 300), documento: entrada.documento, cuentaTercero: p.cuenta, importe: entrada.importe, medio: entrada.medio,
  }
  const r = await recibirHecho(repo, APP_INTERNA, hecho)
  if (r.resultado !== 'asentado') return { ok: false, errores: [r.resultado === 'conflicto' ? 'ya existía un pago con esa referencia y otro contenido' : `no se pudo asentar el pago: ${r.motivo}`] }
  await repo.auditar({ actor: 'usuario', usuarioId: meta.usuarioId, accion: 'registrar_pago', entidad: 'hechos_contables', entidadId: r.hechoId, detalle: { documento: entrada.documento, importe: entrada.importe, medio: entrada.medio, duplicado: r.duplicado } })
  return { ok: true, asientoId: r.asientoId, duplicado: r.duplicado, pendienteTras: r.duplicado ? p.pendiente : p.pendiente - entrada.importe }
}

/** Sugerencia al escribir un NIF: lo recordado del proveedor (o null: no se sabe, se pregunta). */
export async function sugerirProveedor(repo: RepoContable, nif: string): Promise<ProveedorRecordado | null> {
  const n = normalizarNifProveedor(nif)
  return /^[A-Z0-9]{8,12}$/.test(n) ? repo.proveedor(n) : null
}
