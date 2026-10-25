// IMPORTAR PATRIMONIO DESDE EXCEL/CSV (P18, 26/10/2026) — lógica PURA (puertos inyectados, sin prisma ni sesión) de
// `POST/GET/PATCH /api/patrimonio/importaciones[/id]`, `.../confirmar` y `.../descartar`. La BD real está en
// `importacion-bd.ts`; la lectura del fichero, en `importacion-lectura.ts`; las reglas de las celdas, en
// `@central/module-patrimonio` (`importacion.ts`).
//
// 🚨 Aislamiento: el `titular` del cuerpo y el `id` de la URL son PETICIONES. El titular se busca DENTRO de los accesos de la
// cookie y exige nivel Total (`alta_baja`); la importación se busca DENTRO de las del titular autorizado Y de esta identidad
// (`leer`). Todo lo demás es la MISMA 404 `no_encontrado` (nunca 403: no confirma que exista).
// 🚨 Hasta CONFIRMAR no se crea nada: la propuesta vive en tablas de importación que ninguna lectura de rentabilidad,
// calendario o avisos toca. Confirmar crea solo las filas «nueva» (sin problema, sin duplicar) en UNA transacción.
import {
  CAMPOS_IMPORTACION,
  MAX_IMPORTACIONES_DIA,
  aplicarMapeo,
  camposQueFaltan,
  detectarTipo,
  esTipoImportacion,
  evaluarFilas,
  proponerMapeo,
  puede,
  resumirEvaluacion,
  validarMapeo,
  type Celda,
  type FilaEvaluada,
  type FilaPropuesta,
  type InmuebleRef,
  type Mapeo,
  type NivelPatrimonio,
  type ResumenEvaluacion,
  type TipoImportacion,
} from '@central/module-patrimonio'

import { leerFichero, type MotivoLectura } from './importacion-lectura.ts'

export type AccesosMapa = ReadonlyMap<string, NivelPatrimonio>
export type Respuesta = { status: number; body: Record<string, unknown> }

const NO_ENCONTRADO: Respuesta = { status: 404, body: { error: 'no_encontrado' } }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Filas de muestra que se enseñan para elegir las columnas. */
const MUESTRA = 3

export type MapeoGuardado = { cabeceras: string[]; columnas: Record<string, number | null>; usoPorDefecto: string | null }
export type FilaGuardada = { n: number; crudo: Celda[] | null; problema: string | null; creadoId: string | null }
export type ImportacionLeida = {
  id: string
  /** Ficha del titular (clave de `accesos`). */
  clienteId: string
  estado: 'propuesta' | 'revisada' | 'confirmada' | 'descartada'
  tipo: TipoImportacion
  nombre: string | null
  mapeo: MapeoGuardado
  filas: FilaGuardada[]
  resultado: Record<string, unknown> | null
  confirmadaEn: string | null
}
export type ContextoImportacion = { inmuebles: InmuebleRef[]; existentes: Set<string> }

export interface PuertosImportacion {
  accesos(): Promise<AccesosMapa>
  /** Importaciones que esta identidad ha creado en las últimas 24 h (se cuenta en BD). */
  creadasHoy(): Promise<number>
  /** Solo con un `clienteId` autorizado y de nivel Total. Si el mismo fichero ya está abierto, devuelve esa (`nueva: false`). */
  crear(x: {
    clienteId: string
    tipo: TipoImportacion
    hash: string
    nombre: string | null
    mapeo: MapeoGuardado
    filas: { n: number; crudo: Celda[]; problema: string | null }[]
  }): Promise<{ ok: true; id: string; nueva: boolean } | { ok: false }>
  /** SOLO una importación de ESTA identidad cuyo titular está en `accesos()`; si no, `null`. */
  leer(id: string): Promise<ImportacionLeida | null>
  contexto(clienteId: string, tipo: TipoImportacion): Promise<ContextoImportacion>
  /** Reescribe tipo, mapeo y problemas de las filas (mismas `n`) y pasa a `revisada`. `false` = ya cerrada. */
  guardarMapeo(id: string, x: { tipo: TipoImportacion; mapeo: MapeoGuardado; filas: { n: number; problema: string | null }[] }): Promise<boolean>
  /**
   * UNA transacción: cierra la importación (guarda `estado = 'confirmada'` solo si seguía abierta), vuelve a evaluar contra lo
   * que haya EN ESE MOMENTO (`evaluar`), crea las «nueva» y sella `creado_id`. `cerrada` = otra petición ya la confirmó.
   */
  confirmar(
    id: string,
    evaluar: (ctx: ContextoImportacion) => FilaEvaluada[],
  ): Promise<{ ok: true; evaluadas: FilaEvaluada[]; creadas: number } | { ok: false; motivo: 'cerrada' }>
  descartar(id: string): Promise<boolean>
}

// ─── Utilidades ───────────────────────────────────────────────────────────────────────────────────────────

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})

function mapeoDe(g: MapeoGuardado): Mapeo {
  return { columnas: g.columnas, usoPorDefecto: (g.usoPorDefecto as Mapeo['usoPorDefecto']) ?? null }
}

/** Vuelve a aplicar el mapeo a las filas guardadas (cada una conserva su número de hoja). */
export function reaplicar(tipo: TipoImportacion, filas: readonly { n: number; crudo: Celda[] | null }[], mapeo: Mapeo): FilaPropuesta[] {
  return filas.flatMap((f) => (f.crudo === null ? [] : aplicarMapeo(tipo, [f.crudo], mapeo, f.n)))
}

const MOTIVO_LECTURA: Record<MotivoLectura, { status: number; error: string }> = {
  vacio: { status: 400, error: 'fichero_vacio' },
  demasiado_grande: { status: 413, error: 'fichero_demasiado_grande' },
  formato: { status: 400, error: 'formato_no_admitido' },
  ilegible: { status: 400, error: 'fichero_ilegible' },
  sin_filas: { status: 400, error: 'sin_filas' },
  demasiadas_filas: { status: 400, error: 'demasiadas_filas' },
  demasiadas_columnas: { status: 400, error: 'demasiadas_columnas' },
  sin_cabeceras: { status: 400, error: 'sin_cabeceras' },
}

// ─── Vista (lo que ve la persona) ─────────────────────────────────────────────────────────────────────────

export type VistaFila = {
  n: number
  estado: FilaEvaluada['estado']
  motivo: string | null
  avisos: string[]
  datos: Record<string, unknown>
  creada: boolean
}

async function vista(p: PuertosImportacion, imp: ImportacionLeida): Promise<Record<string, unknown>> {
  const abierta = imp.estado === 'propuesta' || imp.estado === 'revisada'
  const base = {
    id: imp.id,
    estado: imp.estado,
    tipo: imp.tipo,
    nombre: imp.nombre,
    titular: imp.clienteId,
    cabeceras: imp.mapeo.cabeceras,
    mapeo: { columnas: imp.mapeo.columnas, usoPorDefecto: imp.mapeo.usoPorDefecto },
    campos: CAMPOS_IMPORTACION[imp.tipo].map((c) => ({ campo: c.campo, etiqueta: c.etiqueta })),
    resultado: imp.resultado,
    confirmadaEn: imp.confirmadaEn,
  }
  if (!abierta) {
    // Cerrada: los datos de las filas ya no existen (la BD los vació). Solo queda qué se creó y qué no.
    return { ...base, faltan: [], muestra: [], filas: imp.filas.map((f) => ({ n: f.n, problema: f.problema, creada: f.creadoId !== null })), resumen: null }
  }
  const mapeo = mapeoDe(imp.mapeo)
  const faltan = camposQueFaltan(imp.tipo, mapeo)
  const propuestas = reaplicar(imp.tipo, imp.filas, mapeo)
  const ctx = await p.contexto(imp.clienteId, imp.tipo)
  const evaluadas = evaluarFilas(propuestas, ctx)
  const filas: VistaFila[] = evaluadas.map((e) => ({ n: e.n, estado: e.estado, motivo: e.motivo, avisos: e.avisos, datos: e.datos, creada: false }))
  const resumen: ResumenEvaluacion = resumirEvaluacion(evaluadas)
  return {
    ...base,
    faltan,
    muestra: imp.filas.slice(0, MUESTRA).map((f) => f.crudo ?? []),
    filas,
    resumen,
  }
}

// ─── Subir ────────────────────────────────────────────────────────────────────────────────────────────────

export type EntradaSubida = { titular: unknown; tipo: unknown; nombre: string | null; bytes: Uint8Array | null }

export async function responderSubir(p: PuertosImportacion, x: EntradaSubida): Promise<Respuesta> {
  const accesos = await p.accesos()
  if (typeof x.titular !== 'string' || !accesos.has(x.titular)) return NO_ENCONTRADO
  if (!puede(accesos.get(x.titular), 'alta_baja')) return NO_ENCONTRADO

  if (x.bytes === null) return { status: 400, body: { error: 'falta_fichero' } }
  let tipoPedido: TipoImportacion | null = null
  if (x.tipo !== undefined && x.tipo !== null && x.tipo !== '' && x.tipo !== 'auto') {
    if (!esTipoImportacion(x.tipo)) return { status: 400, body: { error: 'datos_invalidos', campo: 'tipo' } }
    tipoPedido = x.tipo
  }
  // Tope real (BD) por identidad y día: antes de abrir el fichero.
  if ((await p.creadasHoy()) >= MAX_IMPORTACIONES_DIA) return { status: 429, body: { error: 'limite_diario' } }

  const lectura = leerFichero(x.bytes)
  if (!lectura.ok) {
    const m = MOTIVO_LECTURA[lectura.motivo]
    return { status: m.status, body: { error: m.error } }
  }
  const { hoja, hash } = lectura
  const muestra = hoja.filas.slice(0, 20)
  const tipo = tipoPedido ?? detectarTipo(hoja.cabeceras, muestra)
  // No se adivina: si el fichero no se parece a nada conocido, la persona elige el tipo.
  if (tipo === null) return { status: 422, body: { error: 'tipo_no_reconocido', cabeceras: hoja.cabeceras } }

  const propuesta = proponerMapeo(hoja.cabeceras, muestra, tipo)
  const filas = aplicarMapeo(tipo, hoja.filas, propuesta.mapeo)
  // Para guardar: la fila cruda (con las sensibles ya vaciadas) y su problema; `n` es el de la hoja.
  const crudas = new Map(hoja.filas.map((f, i) => [2 + i, f]))
  const guardables = filas.map((f) => ({ n: f.n, crudo: crudas.get(f.n)!, problema: f.problema }))
  if (guardables.length === 0) return { status: 400, body: { error: 'sin_filas' } }

  const nombre = x.nombre ? x.nombre.replace(/[\r\n]+/g, ' ').trim().slice(0, 120) || null : null
  const r = await p.crear({
    clienteId: x.titular,
    tipo,
    hash,
    nombre,
    mapeo: { cabeceras: hoja.cabeceras, columnas: propuesta.mapeo.columnas, usoPorDefecto: null },
    filas: guardables,
  })
  if (!r.ok) return NO_ENCONTRADO
  return { status: r.nueva ? 201 : 200, body: { id: r.id, nueva: r.nueva, descartadas: hoja.descartadas } }
}

// ─── Ver / mapear / confirmar / descartar ─────────────────────────────────────────────────────────────────

async function dentro(p: PuertosImportacion, id: string): Promise<ImportacionLeida | null> {
  if (!UUID.test(id)) return null
  const accesos = await p.accesos()
  if (accesos.size === 0) return null
  const imp = await p.leer(id)
  // Doble llave: el titular sigue autorizado Y con nivel Total (un acceso retirado cierra la puerta).
  if (!imp || !accesos.has(imp.clienteId) || !puede(accesos.get(imp.clienteId), 'alta_baja')) return null
  return imp
}

export async function responderVer(p: PuertosImportacion, id: string): Promise<Respuesta> {
  const imp = await dentro(p, id)
  if (!imp) return NO_ENCONTRADO
  return { status: 200, body: await vista(p, imp) }
}

export async function responderMapear(p: PuertosImportacion, id: string, cuerpo: unknown): Promise<Respuesta> {
  const imp = await dentro(p, id)
  if (!imp) return NO_ENCONTRADO
  if (imp.estado !== 'propuesta' && imp.estado !== 'revisada') return { status: 409, body: { error: 'cerrada' } }
  const b = obj(cuerpo)
  let tipo = imp.tipo
  if (b.tipo !== undefined && b.tipo !== imp.tipo) {
    if (!esTipoImportacion(b.tipo)) return { status: 400, body: { error: 'datos_invalidos', campo: 'tipo' } }
    tipo = b.tipo
  }
  const v = validarMapeo(tipo, cuerpo, imp.mapeo.cabeceras)
  if (!v.ok) return { status: 400, body: { error: 'datos_invalidos', campo: v.campo } }
  const filas = reaplicar(tipo, imp.filas, v.mapeo)
  const guardado: MapeoGuardado = { cabeceras: imp.mapeo.cabeceras, columnas: v.mapeo.columnas, usoPorDefecto: v.mapeo.usoPorDefecto ?? null }
  const ok = await p.guardarMapeo(id, { tipo, mapeo: guardado, filas: filas.map((f) => ({ n: f.n, problema: f.problema })) })
  if (!ok) return { status: 409, body: { error: 'cerrada' } }
  const nueva = await p.leer(id)
  if (!nueva) return NO_ENCONTRADO
  return { status: 200, body: await vista(p, nueva) }
}

export async function responderConfirmar(p: PuertosImportacion, id: string): Promise<Respuesta> {
  const imp = await dentro(p, id)
  if (!imp) return NO_ENCONTRADO
  if (imp.estado !== 'propuesta' && imp.estado !== 'revisada') return { status: 409, body: { error: 'cerrada', resultado: imp.resultado } }
  const mapeo = mapeoDe(imp.mapeo)
  const faltan = camposQueFaltan(imp.tipo, mapeo)
  if (faltan.length > 0) return { status: 409, body: { error: 'mapeo_incompleto', faltan } }
  const propuestas = reaplicar(imp.tipo, imp.filas, mapeo)
  const r = await p.confirmar(id, (ctx) => evaluarFilas(propuestas, ctx))
  if (!r.ok) return { status: 409, body: { error: 'cerrada' } }
  return { status: 200, body: { resultado: { creadas: r.creadas, ...resumirEvaluacion(r.evaluadas) } } }
}

export async function responderDescartar(p: PuertosImportacion, id: string): Promise<Respuesta> {
  const imp = await dentro(p, id)
  if (!imp) return NO_ENCONTRADO
  if (imp.estado !== 'propuesta' && imp.estado !== 'revisada') return { status: 409, body: { error: 'cerrada' } }
  const ok = await p.descartar(id)
  return ok ? { status: 200, body: { ok: true } } : { status: 409, body: { error: 'cerrada' } }
}
