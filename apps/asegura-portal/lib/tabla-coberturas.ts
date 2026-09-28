// La tabla «Resumen de tus opciones»: filas = coberturas, columnas = opciones.
// PURO (sin BD ni React) para que el cepo la pueda probar sin levantar nada.
//
// 🚨 CUATRO estados por celda, y ninguno se colapsa con otro:
//   · `si`        → la compañía dice que la incluye.
//   · `no`        → la compañía dice que NO la incluye.
//   · `ver_texto` → la compañía no dice sí ni no: manda un texto (o nada). Se abre el literal.
//                   Pintarlo «No» sería afirmar una exclusión que nadie ha dicho.
//   · `no_consta` → esa cobertura no aparece en la lista de esa compañía, o sus coberturas no se
//                   han podido leer. Tampoco es «No».

export type EstadoCelda = 'si' | 'no' | 'ver_texto' | 'no_consta'
export type Celda = { estado: EstadoCelda; texto: string | null }
export type CoberturaGuardada = { nombre: string; incluida: boolean | null; texto: string | null }

/** Lo que el portal sabe de las coberturas de UNA opción. `lista: null` = no constan. */
export type CoberturasOpcion = {
  estado: 'leidas' | 'vacias' | 'fallo' | 'sin_oferta' | 'no_intentado'
  lista: CoberturaGuardada[] | null
}

export type ColumnaTabla = { id: string; compania: string; producto: string; coberturas: CoberturasOpcion }
export type FilaTabla = { clave: string; nombre: string; celdas: Celda[] }
export type Tabla = {
  columnas: { id: string; compania: string; producto: string }[]
  filas: FilaTabla[]
  /** Compañías cuyas coberturas NO se han podido leer (o no se intentó). Se dice en pantalla. */
  sinLeer: string[]
}

/** Clave de alineación: sin tildes, sin mayúsculas, sin signos, espacios simples. */
export function claveCobertura(nombre: string): string {
  return nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim()
}

export function celdaDe(c: CoberturaGuardada | undefined): Celda {
  if (!c) return { estado: 'no_consta', texto: null }
  if (c.incluida === true) return { estado: 'si', texto: c.texto }
  if (c.incluida === false) return { estado: 'no', texto: c.texto }
  return { estado: 'ver_texto', texto: c.texto }
}

export const TEXTO_CELDA: Record<EstadoCelda, string> = {
  si: 'Sí',
  no: 'No',
  ver_texto: 'ver texto',
  no_consta: 'no consta',
}

/** Lee el jsonb `presupuesto_opcion.coberturas` sin fiarse de su forma. `[]` desnudo = no se intentó. */
export function coberturasDeOpcion(v: unknown): CoberturasOpcion {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { estado: 'no_intentado', lista: null }
  const s = v as Record<string, unknown>
  if (s.estado === 'leidas' || s.estado === 'vacias') {
    const lista = (Array.isArray(s.lista) ? s.lista : []).flatMap((x): CoberturaGuardada[] => {
      const o = x && typeof x === 'object' ? (x as Record<string, unknown>) : {}
      const nombre = typeof o.nombre === 'string' ? o.nombre.trim() : ''
      if (!nombre) return []
      return [{
        nombre,
        incluida: typeof o.incluida === 'boolean' ? o.incluida : null,
        texto: typeof o.texto === 'string' && o.texto.trim() ? o.texto.trim() : null,
      }]
    })
    return { estado: s.estado, lista }
  }
  if (s.estado === 'fallo' || s.estado === 'sin_oferta') return { estado: s.estado, lista: null }
  return { estado: 'no_intentado', lista: null }
}

/**
 * «En qué se diferencian» A y B, calculado por el código (no por la IA): las filas cuya celda
 * cambia de una a otra. Una fila donde las dos «no constan» no es una diferencia: es no saber.
 */
export function diferenciasTabla(t: Tabla, a: number, b: number): { nombre: string; a: Celda; b: Celda }[] {
  return t.filas.flatMap((f) => {
    const ca = f.celdas[a], cb = f.celdas[b]
    if (!ca || !cb) return []
    if (ca.estado === cb.estado && (ca.estado !== 'ver_texto' || (ca.texto ?? '') === (cb.texto ?? ''))) return []
    return [{ nombre: f.nombre, a: ca, b: cb }]
  })
}

/** Preguntas sugeridas: salen de las diferencias reales, no de una lista fija que no cuadre. */
export function preguntasSugeridas(dif: readonly { nombre: string }[]): string[] {
  const base = dif.slice(0, 2).map((d) => `¿Qué diferencia hay en ${d.nombre.toLowerCase()}?`)
  return [...base, '¿Cuál tiene franquicia y de cuánto?', '¿Qué cubre una que no cubra la otra?'].slice(0, 4)
}

export function montarTabla(columnas: readonly ColumnaTabla[]): Tabla {
  const orden: string[] = []
  const nombres = new Map<string, string>()
  const porColumna = columnas.map((c) => {
    const m = new Map<string, CoberturaGuardada>()
    for (const cob of c.coberturas.lista ?? []) {
      const k = claveCobertura(cob.nombre)
      if (!k || m.has(k)) continue
      m.set(k, cob)
      if (!nombres.has(k)) { nombres.set(k, cob.nombre); orden.push(k) }
    }
    return m
  })
  return {
    columnas: columnas.map((c) => ({ id: c.id, compania: c.compania, producto: c.producto })),
    filas: orden.map((k) => ({ clave: k, nombre: nombres.get(k)!, celdas: porColumna.map((m) => celdaDe(m.get(k))) })),
    sinLeer: columnas.filter((c) => c.coberturas.lista === null).map((c) => c.compania),
  }
}
