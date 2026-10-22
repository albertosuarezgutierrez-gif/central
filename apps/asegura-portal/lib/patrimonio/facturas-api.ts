// PATRIMONIO (22/10/2026, paso 7) — lógica PURA (puertos inyectados, sin prisma, sesión ni IA) de `POST/PATCH
// /api/patrimonio/facturas`. La BD real está en `facturas-bd.ts`; la lectura con IA en `extraer-factura.ts`.
//
// Dos pasos a propósito: SUBIR lee la factura y deja un gasto `propuesto` (origen `factura`, con la propuesta y sus
// motivos) SIN importe inventado; CONFIRMAR lo hace la persona con los campos que ella ha revisado. Nada llega a
// `confirmado` sin fecha, categoría y un total > 0 tecleados o aceptados explícitamente.
//
// 🚨 El `titular` y el `inmueble` del formulario son PETICIONES: el titular se busca DENTRO de los accesos resueltos por
// la cookie, con nivel de gestión; el inmueble, DENTRO de ese titular. Ajeno, inexistente o sin nivel: la MISMA 404
// `no_encontrado` (nunca 403). El tope diario se cuenta en BD (filas `origen='factura'` de la identidad, día de Madrid),
// no en memoria. Contar e insertar es UN solo paso atómico (`reservarPropuesta`: bloqueo por identidad + recuento + fila
// `propuesto` vacía) y va ANTES de la IA: subidas simultáneas no pueden pasar el tope. La lectura rellena después esa fila
// (`completarPropuesta`). El tipo del fichero lo deciden sus BYTES (`tipo-fichero.ts`), no el MIME del navegador.
import { esCategoriaGasto, esFecha, puede, type CategoriaGasto } from '@central/module-patrimonio'

import { eurosACentimos, type AccesosMapa, type Respuesta } from './gastos-api.ts'
import { cuadre, PROPUESTA_VACIA, TOLERANCIA_CENT, type FuenteFactura, type PropuestaFactura } from './factura-propuesta.ts'
import { tipoRealFactura, type TipoFactura } from './tipo-fichero.ts'
import { nombreSeguro } from './documentos-api.ts'

export const MAX_BYTES_FACTURA = 10 * 1024 * 1024
export const MAX_FACTURAS_DIA = 20

const NO_ENCONTRADO: Respuesta = { status: 404, body: { error: 'no_encontrado' } }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const obj = (c: unknown) => (c && typeof c === 'object' ? c : {}) as Record<string, unknown>
const vacio = (v: unknown) => v === undefined || v === null || v === ''

export type FicheroFactura = { nombre: string; mime: string; tamano: number; contenido: Buffer }
export type ResultadoLectura = { propuesta: PropuestaFactura; motivos: string[]; fuente: FuenteFactura }

export type DatosConfirmacion = {
  inmuebleId: string | null
  fecha: string
  categoria: CategoriaGasto
  concepto: string | null
  baseCent: number | null
  /** Solo se guardan en `propuesta` (jsonb): el gasto confirmado no tiene columna de IVA ni de retención. */
  ivaCent: number | null
  retencionCent: number | null
  totalCent: number
}

export interface PuertosFacturas {
  accesos(): Promise<AccesosMapa>
  /** ¿El inmueble es de ESE titular (y no está archivado)? Se busca dentro del titular, nunca suelto. */
  inmuebleDelTitular(clienteId: string, inmuebleId: string): Promise<boolean>
  /**
   * ATÓMICO: cuenta las filas `origen='factura'` de esta identidad en el día de Madrid y, si hay hueco, inserta la fila
   * `propuesto` vacía (sin importes). Dos subidas simultáneas no pueden pasar el tope. `tope` = ya hay MAX_FACTURAS_DIA;
   * `no_encontrado` = el titular/inmueble no encaja.
   */
  reservarPropuesta(x: {
    clienteId: string
    inmuebleId: string | null
    /**
     * El fichero ya validado por sus bytes. Si hay inmueble, se guarda como DOCUMENTO del inmueble (carpeta facturas) en la
     * MISMA transacción que la reserva (todo o nada) y el gasto lleva su `documentoId`. Sin inmueble no hay owner al que
     * colgarlo: no se guarda (`documentoId: null`) y la lectura sigue igual.
     */
    fichero: { nombre: string; mime: TipoFactura; contenido: Buffer }
  }): Promise<{ ok: true; id: string; documentoId?: string | null } | { ok: false; motivo: 'tope' | 'no_encontrado' }>
  leer(f: FicheroFactura): Promise<ResultadoLectura>
  /** Rellena la fila reservada con lo leído (importes nulos si no se leyeron). Solo toca una fila `propuesto` de ESE titular. */
  completarPropuesta(x: { clienteId: string; gastoId: string; lectura: ResultadoLectura }): Promise<void>
  /** Solo actúa sobre un gasto `origen='factura'` `propuesto` DE ese titular. */
  confirmar(x: { clienteId: string; gastoId: string; datos: DatosConfirmacion }): Promise<'ok' | 'no_encontrado' | 'ya_resuelto'>
  descartar(x: { clienteId: string; gastoId: string }): Promise<'ok' | 'no_encontrado' | 'ya_resuelto'>
}

function titularGestion(accesos: AccesosMapa, pedido: unknown): string | null {
  if (typeof pedido !== 'string' || !accesos.has(pedido)) return null
  return puede(accesos.get(pedido), 'gestionar_gastos_documentos') ? pedido : null
}

export type CamposSubida = { titular: unknown; inmueble: unknown; fichero: FicheroFactura | null }

export async function responderSubidaFactura(p: PuertosFacturas, c: CamposSubida): Promise<Respuesta> {
  const accesos = await p.accesos()
  const clienteId = titularGestion(accesos, c.titular)
  if (clienteId === null) return NO_ENCONTRADO
  let inmuebleId: string | null = null
  if (!vacio(c.inmueble)) {
    if (typeof c.inmueble !== 'string' || !UUID.test(c.inmueble)) return NO_ENCONTRADO
    if (!(await p.inmuebleDelTitular(clienteId, c.inmueble))) return NO_ENCONTRADO
    inmuebleId = c.inmueble
  }
  if (!c.fichero) return { status: 400, body: { error: 'fichero_requerido' } }
  if (Math.max(c.fichero.tamano, c.fichero.contenido.length) > MAX_BYTES_FACTURA) return { status: 413, body: { error: 'fichero_grande' } }
  // Los bytes mandan: el MIME del navegador (o de quien monte la petición a mano) no prueba nada.
  const mime = tipoRealFactura(c.fichero.contenido)
  if (mime === null) return { status: 415, body: { error: 'formato_no_admitido' } }
  // Tope diario ANTES de gastar IA, contado en BD y reservado en el mismo paso (el limitador en memoria de la ruta solo frena ráfagas).
  const reserva = await p.reservarPropuesta({ clienteId, inmuebleId, fichero: { nombre: nombreSeguro(c.fichero.nombre) || 'factura', mime, contenido: c.fichero.contenido } })
  if (!reserva.ok) return reserva.motivo === 'tope' ? { status: 429, body: { error: 'tope_diario' } } : NO_ENCONTRADO
  let lectura: ResultadoLectura
  try {
    lectura = await p.leer({ ...c.fichero, mime })
  } catch {
    lectura = { propuesta: PROPUESTA_VACIA, motivos: ['La lectura automática ha fallado. Rellena los datos a mano.'], fuente: 'none' }
  }
  await p.completarPropuesta({ clienteId, gastoId: reserva.id, lectura })
  return { status: 201, body: { id: reserva.id, titular: clienteId, inmueble: inmuebleId, documento: reserva.documentoId ?? null, fuente: lectura.fuente, propuesta: lectura.propuesta, motivos: lectura.motivos } }
}

type V = { ok: true; datos: DatosConfirmacion } | { ok: false; campo: string; motivo?: 'no_cuadra' }

/** Importe opcional: vacío o 0 = «no hay» (`null`); inválido o negativo = `'invalido'`. */
function importeOpcional(v: unknown): number | null | 'invalido' {
  const c = eurosACentimos(v)
  if (c === 'invalido' && /^\s*0+([.,]0+)?\s*€?\s*$/.test(String(v))) return null
  return c
}

/**
 * Lo que la persona ha revisado. `total` obligatorio y > 0 (nunca un gasto de 0 €); `base`, `iva` y `retencion` opcionales.
 * El cuadre es total = base + IVA − retención (±2 céntimos): una factura con retención de IRPF tiene base > total, y una
 * exenta con retención no trae IVA. Sin IVA no se puede exigir igualdad (puede ser exenta o no constar): el total solo
 * puede ser MENOR que base − retención si algo no cuadra.
 */
export function validarConfirmacion(cuerpo: unknown): V {
  const b = obj(cuerpo)
  let inmuebleId: string | null = null
  if (!vacio(b.inmueble)) {
    if (typeof b.inmueble !== 'string' || !UUID.test(b.inmueble)) return { ok: false, campo: 'inmueble' }
    inmuebleId = b.inmueble
  }
  if (!esFecha(b.fecha)) return { ok: false, campo: 'fecha' }
  if (!esCategoriaGasto(b.categoria)) return { ok: false, campo: 'categoria' }
  const total = eurosACentimos(b.total)
  if (total === null || total === 'invalido') return { ok: false, campo: 'total' }
  const base = eurosACentimos(b.base)
  if (base === 'invalido') return { ok: false, campo: 'base' }
  const iva = importeOpcional(b.iva)
  if (iva === 'invalido') return { ok: false, campo: 'iva' }
  const retencion = importeOpcional(b.retencion)
  if (retencion === 'invalido') return { ok: false, campo: 'retencion' }
  // Una retención sin base no se puede comprobar contra nada: se pide la base.
  if (retencion !== null && (base === null || retencion > base)) return { ok: false, campo: 'retencion' }
  if (base !== null) {
    if (iva !== null) {
      if (Math.abs(cuadre(base, iva, retencion) - total) > TOLERANCIA_CENT) return { ok: false, campo: 'total', motivo: 'no_cuadra' }
    } else if (total < cuadre(base, null, retencion)) {
      return { ok: false, campo: 'base', motivo: 'no_cuadra' }
    }
  }
  let concepto: string | null = null
  if (!vacio(b.concepto)) {
    if (typeof b.concepto !== 'string') return { ok: false, campo: 'concepto' }
    const t = b.concepto.trim().replace(/\s+/g, ' ')
    if (t.length < 1 || t.length > 200) return { ok: false, campo: 'concepto' }
    concepto = t
  }
  return { ok: true, datos: { inmuebleId, fecha: b.fecha, categoria: b.categoria, concepto, baseCent: base, ivaCent: iva, retencionCent: retencion, totalCent: total } }
}

export async function responderResolverFactura(p: PuertosFacturas, cuerpo: unknown): Promise<Respuesta> {
  const accesos = await p.accesos()
  const b = obj(cuerpo)
  const clienteId = titularGestion(accesos, b.titular)
  if (clienteId === null) return NO_ENCONTRADO
  if (typeof b.gasto !== 'string' || !UUID.test(b.gasto)) return NO_ENCONTRADO
  const gastoId = b.gasto
  let r: 'ok' | 'no_encontrado' | 'ya_resuelto'
  if (b.accion === 'descartar') {
    r = await p.descartar({ clienteId, gastoId })
  } else if (b.accion === 'confirmar') {
    const v = validarConfirmacion(b)
    if (!v.ok) return { status: 400, body: { error: 'datos_invalidos', campo: v.campo, ...(v.motivo ? { motivo: v.motivo } : {}) } }
    if (v.datos.inmuebleId && !(await p.inmuebleDelTitular(clienteId, v.datos.inmuebleId))) return NO_ENCONTRADO
    r = await p.confirmar({ clienteId, gastoId, datos: v.datos })
  } else {
    return { status: 400, body: { error: 'datos_invalidos', campo: 'accion' } }
  }
  if (r === 'no_encontrado') return NO_ENCONTRADO
  if (r === 'ya_resuelto') return { status: 409, body: { error: 'ya_resuelto' } }
  return { status: 200, body: { id: gastoId } }
}
