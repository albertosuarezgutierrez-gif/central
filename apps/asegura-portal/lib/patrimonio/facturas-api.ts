// PATRIMONIO (22/10/2026, paso 7) — lógica PURA (puertos inyectados, sin prisma, sesión ni IA) de `POST/PATCH
// /api/patrimonio/facturas`. La BD real está en `facturas-bd.ts`; la lectura con IA en `extraer-factura.ts`.
//
// Dos pasos a propósito: SUBIR lee la factura y deja un gasto `propuesto` (origen `factura`, con la propuesta y sus
// motivos) SIN importe inventado; CONFIRMAR lo hace la persona con los campos que ella ha revisado. Nada llega a
// `confirmado` sin fecha, categoría y un total > 0 tecleados o aceptados explícitamente.
//
// 🚨 El `titular` y el `inmueble` del formulario son PETICIONES: el titular se busca DENTRO de los accesos resueltos por
// la cookie, con nivel de gestión; el inmueble, DENTRO de ese titular. Ajeno, inexistente o sin nivel: la MISMA 404
// `no_encontrado` (nunca 403). El tope diario se cuenta en BD (filas `origen='factura'` de la identidad), no en memoria,
// y se comprueba ANTES de llamar a la IA.
import { esCategoriaGasto, esFecha, puede, type CategoriaGasto } from '@central/module-patrimonio'

import { eurosACentimos, type AccesosMapa, type Respuesta } from './gastos-api.ts'
import type { FuenteFactura, PropuestaFactura } from './factura-propuesta.ts'

export const MAX_BYTES_FACTURA = 10 * 1024 * 1024
export const MAX_FACTURAS_DIA = 20
export const MIMES_FACTURA = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const

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
  totalCent: number
}

export interface PuertosFacturas {
  accesos(): Promise<AccesosMapa>
  /** ¿El inmueble es de ESE titular (y no está archivado)? Se busca dentro del titular, nunca suelto. */
  inmuebleDelTitular(clienteId: string, inmuebleId: string): Promise<boolean>
  /** Facturas subidas hoy por esta identidad: cuenta FILAS en BD. */
  contarFacturasHoy(): Promise<number>
  leer(f: FicheroFactura): Promise<ResultadoLectura>
  /** Crea el gasto `propuesto` (importes nulos si no se leyeron). `no_encontrado` si el titular/inmueble no encaja. */
  crearPropuesta(x: { clienteId: string; inmuebleId: string | null; lectura: ResultadoLectura }): Promise<{ ok: true; id: string } | { ok: false }>
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
  if (c.fichero.tamano > MAX_BYTES_FACTURA) return { status: 413, body: { error: 'fichero_grande' } }
  if (!(MIMES_FACTURA as readonly string[]).includes(c.fichero.mime)) return { status: 415, body: { error: 'formato_no_admitido' } }
  // Tope diario ANTES de gastar IA, contando filas en BD (el limitador en memoria de la ruta solo frena ráfagas).
  if ((await p.contarFacturasHoy()) >= MAX_FACTURAS_DIA) return { status: 429, body: { error: 'tope_diario' } }
  const lectura = await p.leer(c.fichero)
  const r = await p.crearPropuesta({ clienteId, inmuebleId, lectura })
  if (!r.ok) return NO_ENCONTRADO
  return { status: 201, body: { id: r.id, titular: clienteId, inmueble: inmuebleId, fuente: lectura.fuente, propuesta: lectura.propuesta, motivos: lectura.motivos } }
}

type V = { ok: true; datos: DatosConfirmacion } | { ok: false; campo: string }

/** Lo que la persona ha revisado. `total` obligatorio y > 0 (nunca un gasto de 0 €); `base` opcional. */
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
  if (base === 'invalido' || (base !== null && base > total)) return { ok: false, campo: 'base' }
  let concepto: string | null = null
  if (!vacio(b.concepto)) {
    if (typeof b.concepto !== 'string') return { ok: false, campo: 'concepto' }
    const t = b.concepto.trim().replace(/\s+/g, ' ')
    if (t.length < 1 || t.length > 200) return { ok: false, campo: 'concepto' }
    concepto = t
  }
  return { ok: true, datos: { inmuebleId, fecha: b.fecha, categoria: b.categoria, concepto, baseCent: base, totalCent: total } }
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
    if (!v.ok) return { status: 400, body: { error: 'datos_invalidos', campo: v.campo } }
    if (v.datos.inmuebleId && !(await p.inmuebleDelTitular(clienteId, v.datos.inmuebleId))) return NO_ENCONTRADO
    r = await p.confirmar({ clienteId, gastoId, datos: v.datos })
  } else {
    return { status: 400, body: { error: 'datos_invalidos', campo: 'accion' } }
  }
  if (r === 'no_encontrado') return NO_ENCONTRADO
  if (r === 'ya_resuelto') return { status: 409, body: { error: 'ya_resuelto' } }
  return { status: 200, body: { id: gastoId } }
}
