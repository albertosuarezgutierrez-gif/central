// El LISTADO filtrable de la cartera, leído del puerto de asegura
// (`GET /api/operador/cartera`) y convertido en algo que la pantalla pueda
// pintar sin adivinar nada.
//
// ─── La regla que gobierna este fichero ─────────────────────────────────────
// Una respuesta que no se entiende degrada a `error`, JAMÁS a una lista vacía.
// «No he podido leer la cartera» y «ningún cliente cumple este filtro» se
// pintan igual de vacíos en pantalla, y solo uno de los dos autoriza a decirle
// a Alberto que ahí no hay nadie. Lo mismo, campo a campo:
//
//   · `tieneEmail: null`   = no se ha podido comprobar   (nunca «no tiene»)
//   · `prima: null`        = la póliza no informa prima  (nunca 0,00€)
//   · `polizas: null`      = el puerto no manda el bloque (nunca «sin pólizas»)
//   · `facetas: null`      = no vienen los recuentos      (nunca «0 de cada»)
//
// Y una fila sin `id` no es una fila que no exista: no hay ficha a la que ir,
// así que no se pinta — pero se CUENTA en `ilegibles` y la pantalla lo dice.
// Descartarla en silencio enseñaría una lista más corta de la que hay.
//
// Dos partes, como en `duplicados-asegura.ts`:
//   1. Lo PURO: `interpretarLista` y `construirCsv` (test en
//      `lib/cartera-lista-asegura.test.ts`), que importa el client component.
//   2. La RED: `pedirCartera()`, solo desde la ruta API de plataforma.

import { type MotivoPuerto, describirCausaAsegura } from './correduria-puerto.ts'

export type { MotivoPuerto }
export { describirCausaAsegura }

export type PolizaListada = {
  id: string
  tipo: string
  aseguradora: string
  numeroPoliza: string | null
  fechaVencimiento: string | null
  estado: string
  /** `null` = la póliza no informa prima. NUNCA 0 — «0,00€» es una afirmación. */
  prima: number | null
}

export type ClienteListado = {
  id: string
  nombre: string
  apellidos: string
  provincia: string | null
  ciudad: string | null
  /** `null` = NO se ha podido comprobar. No es «no tiene email». */
  tieneEmail: boolean | null
  tieneTelefono: boolean | null
  /** `null` = el puerto no lo informa. No es «no tiene ninguna viva». */
  polizasVivas: number | null
  /** `null` = no informado ≠ `[]` = se miró y no tiene ninguno. */
  ramosVivos: string[] | null
  polizas: PolizaListada[] | null
  /** Pólizas suyas que llegaron sin forma legible. Se cuentan, no se esconden. */
  polizasIlegibles: number
}

export type Faceta = { v: string; n: number }
export type Facetas = {
  ramos: Faceta[]
  companias: Faceta[]
  provincias: Faceta[]
  estados: Faceta[]
}

export type Descartado = { campo: string; valor: string }

export type ListaCartera =
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: MotivoPuerto; causa?: string }
  | {
      estado: 'ok'
      total: number
      pagina: number
      porPagina: number
      /** `false` = el texto tiene menos de 3 letras y NO ha filtrado. No es «no hay resultados». */
      buscable: boolean
      /** Valores del filtro que el puerto no entendió. Se DICEN: un filtro
       *  descartado en silencio enseña una lista más ancha de la pedida. */
      descartados: Descartado[]
      clientes: ClienteListado[]
      /** `null` = el puerto no manda recuentos (versión vieja): la barra ofrece
       *  las opciones sin número, en vez de pintar ceros que se leen como «no hay». */
      facetas: Facetas | null
      /** Filas que llegaron sin id o sin nombre: no se pueden pintar, pero existen. */
      ilegibles: number
    }

/** Mirror de `POR_PAGINA_DEFECTO` de `@central/module-seguros`. No se importa
 *  como valor para que este módulo siga siendo cargable por `node --test`
 *  (el runtime no despoja tipos dentro de `node_modules`). */
export const POR_PAGINA_UI = 50

const MOTIVOS = new Set<string>(['secreto_rechazado', 'asegura_error', 'respuesta_ilegible', 'red'])

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

function numero(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function entero(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null
}

/** Tri-estado de verdad: un campo ausente es `null`, jamás `false`. Con
 *  `=== true` a secas, un puerto que no manda el campo diría que NADIE tiene email. */
function booleano(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null
}

function textos(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null
  return v.map(cadena).filter((s): s is string => s !== null)
}

/** Una póliza, o `null` si no tiene forma. Sin `id` no hay póliza a la que ir. */
export function leerPolizaListada(v: unknown): PolizaListada | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const id = cadena(o.id)
  if (id === null) return null
  return {
    id,
    tipo: cadena(o.tipo) ?? 'sin_informar',
    aseguradora: cadena(o.aseguradora) ?? 'sin informar',
    numeroPoliza: cadena(o.numeroPoliza),
    fechaVencimiento: cadena(o.fechaVencimiento),
    estado: cadena(o.estado) ?? 'sin_informar',
    // `numero()` deja el 0 pasar (una prima de 0 es un dato que alguien
    // escribió) y devuelve null cuando falta o no es número.
    prima: numero(o.prima),
  }
}

/** Un cliente, o `null` cuando la fila es ILEGIBLE (sin id o sin nombre).
 *  Quien llama la cuenta; aquí no se descarta en silencio. */
export function leerClienteListado(v: unknown): ClienteListado | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const id = cadena(o.id)
  const nombre = typeof o.nombre === 'string' ? o.nombre : null
  if (id === null || nombre === null) return null

  let polizas: PolizaListada[] | null = null
  let polizasIlegibles = 0
  if (Array.isArray(o.polizas)) {
    polizas = []
    for (const p of o.polizas) {
      const leida = leerPolizaListada(p)
      if (leida === null) polizasIlegibles += 1
      else polizas.push(leida)
    }
  }

  return {
    id,
    nombre,
    apellidos: typeof o.apellidos === 'string' ? o.apellidos : '',
    provincia: cadena(o.provincia),
    ciudad: cadena(o.ciudad),
    tieneEmail: booleano(o.tieneEmail),
    tieneTelefono: booleano(o.tieneTelefono),
    polizasVivas: entero(o.polizasVivas),
    ramosVivos: textos(o.ramosVivos),
    polizas,
    polizasIlegibles,
  }
}

function faceta(v: unknown): Faceta[] | null {
  if (!Array.isArray(v)) return null
  const out: Faceta[] = []
  for (const f of v) {
    if (typeof f !== 'object' || f === null) continue
    const o = f as Record<string, unknown>
    const valor = cadena(o.v)
    const n = entero(o.n)
    // Una faceta sin recuento no se pinta como «0»: se salta.
    if (valor === null || n === null) continue
    out.push({ v: valor, n })
  }
  return out
}

/** `null` si NINGÚN eje llega legible: mejor ofrecer los filtros sin número
 *  que pintar cuatro listas vacías, que se leen como «no hay de nada». */
export function leerFacetas(v: unknown): Facetas | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const ramos = faceta(o.ramos)
  const companias = faceta(o.companias)
  const provincias = faceta(o.provincias)
  const estados = faceta(o.estados)
  if (ramos === null && companias === null && provincias === null && estados === null) return null
  return {
    ramos: ramos ?? [],
    companias: companias ?? [],
    provincias: provincias ?? [],
    estados: estados ?? [],
  }
}

function descartados(v: unknown): Descartado[] {
  if (!Array.isArray(v)) return []
  const out: Descartado[] = []
  for (const d of v) {
    if (typeof d !== 'object' || d === null) continue
    const o = d as Record<string, unknown>
    const campo = cadena(o.campo)
    const valor = cadena(o.valor)
    if (campo === null || valor === null) continue
    out.push({ campo, valor })
  }
  return out
}

/**
 * Interpretación PURA de la respuesta del puerto. Cualquier forma inesperada
 * degrada a `error` con su motivo — nunca a `{clientes: []}`.
 */
export function interpretarLista(status: number, json: unknown): ListaCartera {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  if (typeof json !== 'object' || json === null) {
    return { estado: 'error', motivo: status === 200 ? 'respuesta_ilegible' : 'red' }
  }
  const r = json as Record<string, unknown>
  const causa = cadena(r.causa) ?? undefined

  if (r.estado === 'sin_configurar' || status === 503) return { estado: 'sin_configurar' }
  if (r.estado === 'error') {
    // El motivo que ya venga (lo pone el proxy cuando ni siquiera se llegó a
    // asegura) manda sobre el genérico: «no se llegó» y «asegura no pudo leer
    // su BD» se arreglan en sitios distintos.
    const motivo = MOTIVOS.has(String(r.motivo)) ? (r.motivo as MotivoPuerto) : 'asegura_error'
    return causa ? { estado: 'error', motivo, causa } : { estado: 'error', motivo }
  }
  if (status !== 200 || r.estado !== 'ok' || !Array.isArray(r.clientes)) {
    return causa
      ? { estado: 'error', motivo: 'respuesta_ilegible', causa }
      : { estado: 'error', motivo: 'respuesta_ilegible' }
  }

  // 🚨 El total NO se inventa. Un listado cuyo total no se puede leer es un
  // listado ilegible: pintar «0 clientes» sería la afirmación tranquilizadora
  // que esta pantalla no puede hacer.
  const total = entero(r.total)
  if (total === null) return { estado: 'error', motivo: 'respuesta_ilegible' }

  const clientes: ClienteListado[] = []
  let ilegibles = 0
  for (const c of r.clientes) {
    const leido = leerClienteListado(c)
    if (leido === null) ilegibles += 1
    else clientes.push(leido)
  }

  return {
    estado: 'ok',
    total,
    pagina: entero(r.pagina) ?? 1,
    porPagina: entero(r.porPagina) ?? POR_PAGINA_UI,
    // Solo un `true` explícito significa «el texto ha filtrado». Ante la duda,
    // la pantalla avisa de que quizá no filtró: es el lado conservador.
    buscable: r.buscable !== false,
    descartados: descartados(r.descartados),
    clientes,
    facetas: leerFacetas(r.facetas),
    ilegibles,
  }
}

// ─── Derivados para pintar y para exportar ──────────────────────────────────

export function nombreCompleto(c: ClienteListado): string {
  return `${c.nombre} ${c.apellidos}`.replace(/\s+/g, ' ').trim()
}

/** Las compañías de sus pólizas. `null` = no se ha podido mirar. */
export function companiasDe(c: ClienteListado): string[] | null {
  if (c.polizas === null) return null
  return [...new Set(c.polizas.map((p) => p.aseguradora))]
}

/** El vencimiento más próximo de sus pólizas. `null` = ninguna trae fecha, o
 *  no se han podido mirar; los dos casos los distingue `c.polizas === null`. */
export function proximoVencimiento(c: ClienteListado): string | null {
  if (c.polizas === null) return null
  const fechas = c.polizas.map((p) => p.fechaVencimiento).filter((f): f is string => f !== null)
  if (fechas.length === 0) return null
  return fechas.sort()[0]
}

// ─── CSV ────────────────────────────────────────────────────────────────────
//
// Separador `;` (y no `,`) porque los importes y los decimales van en español:
// con coma, Excel parte «1.234,50€» en dos columnas. La primera línea es la
// DESCRIPCIÓN del filtro — un CSV sin decir de qué es se convierte en «la
// lista de clientes» en cuanto sale del navegador, y ahí ya nadie sabe qué se
// filtró ni de cuándo es.

export const COLUMNAS_CSV = [
  'Cliente', 'Provincia', 'Ciudad', 'Email', 'Teléfono',
  'Pólizas vivas', 'Ramos', 'Compañías', 'Próximo vencimiento',
] as const

function celda(v: string): string {
  return /[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

/** Los tres estados de un booleano, en palabras. `null` NUNCA es «No». */
function siNo(v: boolean | null): string {
  return v === null ? 'sin comprobar' : v ? 'sí' : 'no'
}

export function filaCsv(c: ClienteListado): string[] {
  const companias = companiasDe(c)
  const vence = proximoVencimiento(c)
  return [
    nombreCompleto(c),
    c.provincia ?? 'sin dato',
    c.ciudad ?? 'sin dato',
    siNo(c.tieneEmail),
    siNo(c.tieneTelefono),
    c.polizasVivas === null ? 'sin dato' : String(c.polizasVivas),
    c.ramosVivos === null ? 'sin comprobar' : c.ramosVivos.join(' ') || 'ninguno',
    companias === null ? 'sin comprobar' : companias.join(' ') || 'ninguna',
    c.polizas === null ? 'sin comprobar' : vence ?? 'sin fecha',
  ]
}

/**
 * El CSV completo del conjunto FILTRADO (no de la página).
 *
 * `truncado` no es un detalle de implementación: si se alcanzó el tope, quien
 * abra el fichero tiene que verlo DENTRO del propio fichero — fuera del
 * navegador no queda ningún otro sitio donde decirlo.
 */
export function construirCsv(
  descripcion: string,
  clientes: readonly ClienteListado[],
  opciones?: { total?: number | null; truncado?: boolean; tope?: number },
): string {
  const lineas: string[] = []
  lineas.push(celda(`Cartera de Grupo Asegura — ${descripcion}`))
  const total = opciones?.total
  lineas.push(
    celda(
      `${clientes.length} cliente(s) exportado(s)` +
        (typeof total === 'number' ? ` de ${total} que cumplen el filtro` : '') +
        ` · generado el ${new Date().toISOString().slice(0, 10)}`,
    ),
  )
  if (opciones?.truncado) {
    lineas.push(
      celda(
        `AVISO: la exportación se ha cortado en el tope de ${opciones.tope ?? clientes.length} filas.` +
          ' Esta lista NO está completa: afina el filtro y vuelve a descargar.',
      ),
    )
  }
  lineas.push(COLUMNAS_CSV.join(';'))
  for (const c of clientes) lineas.push(filaCsv(c).map(celda).join(';'))
  return lineas.join('\r\n')
}

// ─── Red (solo desde la ruta API de plataforma) ─────────────────────────────

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

export type Reenvio = { status: number; json: unknown }

/** `GET /api/operador/cartera` con los parámetros de filtro TAL CUAL. */
export async function pedirCartera(query: string): Promise<Reenvio> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return { status: 503, json: { estado: 'sin_configurar' } }
  try {
    const res = await fetch(`${urlAsegura()}/api/operador/cartera${query ? `?${query}` : ''}`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch {
    return { status: 502, json: { estado: 'error', motivo: 'red' } }
  }
}
