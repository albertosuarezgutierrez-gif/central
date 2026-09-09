/**
 * «Comprueba tus datos de contacto» — el portal pregunta a asegura qué tiene
 * (ENMASCARADO), el cliente confirma o corrige, y asegura lo escribe.
 *
 * ─── Por qué el portal NO lo escribe él mismo ────────────────────────────────
 * `clientes.direccion` va cifrada con `PII_ENCRYPTION_KEY` y el rol de esta app
 * (`prisma_asegura_portal`, sin BYPASSRLS) ni declara esa columna: su modelo
 * `Cliente` no la tiene. Se podría conceder el grant y traer la clave, y sería
 * el peor cambio posible — la app pública pasaría a poder descifrar la PII de
 * 32.600 fichas para que una persona pueda corregir su calle. Así que sale por
 * un puerto estrecho a `apps/asegura`, que ya tiene la clave.
 *
 * ─── Lo que SÍ se lee de vuelta, y por qué ahora sí (08/09/2026) ─────────────
 * Hasta hoy este módulo solo ESCRIBÍA. Dictado de Alberto: «tiene que ser
 * automático, un aviso en la intranet; yo no intervengo» — la cartera viene de
 * un volcado de jun/2026 y quien tiene que validar que el teléfono y la calle
 * siguen siendo los suyos es el propio cliente. Y **una confirmación exige
 * enseñar algo que confirmar**: «¿siguen igual tus datos?» sin decir cuáles es
 * pedirle que firme a ciegas.
 *
 * 🚨 Lo que llega es una lectura ENMASCARADA que fabrica asegura
 * (`GET /api/portal/contacto-estado`: «6•• ••• •12», «c••••@gmail.com», «Calle
 * S••••• 24, 41003»). El portal sigue SIN descifrar nada: no tiene la clave, no
 * recibe el dato en claro y no decide qué se tapa — eso lo decide asegura, que
 * es quien ve la ficha. Si un día esa máscara enseñara de más, el sitio donde
 * arreglarlo es el puerto, no esta app. Tampoco calcula si la confirmación
 * está vigente: `confirmacion` viene ya resuelta del puente (un «hoy» del
 * navegador y otro del servidor darían dos respuestas distintas).
 *
 * ─── Y los fallos NO se colapsan ─────────────────────────────────────────────
 * `sin_puente` («esto no está montado») ≠ `error` («no ha salido»). Es la misma
 * distinción que el portal ya hace entre `canal_no_disponible` y
 * `envio_fallido`: uno se arregla en Vercel y el otro reintentando. Y ninguno
 * de los dos se le enseña a la persona como «guardado» ni como «confirmado».
 */
import { PORTAL_PUENTE_TIEMPO_MS } from './puente-config'

export type ResultadoMisDatos =
  | { estado: 'ok'; campos: string[] }
  | { estado: 'sin_cambios' }
  /** Lo que escribió no pasa las reglas (una calle larguísima, un CP raro). */
  | { estado: 'invalido'; motivo: string; campo: string | null }
  /** El dato ya es el principal de OTRA ficha (hoy: el teléfono). Asegura no
   *  dice de quién, y aquí tampoco se pregunta: es «no guardado, lo revisa el
   *  corredor», nunca un guardado a medias. */
  | { estado: 'conflicto'; campo: string | null }
  /** Su acceso no está enlazado con ninguna ficha: no hay dónde guardarlo. */
  | { estado: 'sin_ficha' }
  /** Su acceso está enlazado con varias fichas: lo resuelve el corredor. */
  | { estado: 'varias_fichas' }
  /** El puente no está configurado en este despliegue. NO es «falló el envío». */
  | { estado: 'sin_puente' }
  | { estado: 'error'; causa: string }

/** Lo que asegura ya ha decidido sobre la vigencia; el portal no lo recalcula. */
export type Confirmacion = 'nunca' | 'vigente' | 'caducada'

/**
 * Un dato de contacto tal y como lo enseña asegura: si consta y, si consta, su
 * máscara. `tiene: true` con `mascara: null` es «consta pero no se puede
 * mostrar» — NO se colapsa con «no consta».
 */
export type DatoEnmascarado = { tiene: boolean; mascara: string | null }

export type ContactoEnmascarado = {
  direccion: DatoEnmascarado
  telefono: DatoEnmascarado
  /** El email es la llave de acceso: no se edita desde el portal, y si es el
   *  mismo con el que ha entrado ya está confirmado por el propio acceso. */
  email: DatoEnmascarado & { confirmadoPorAcceso: boolean }
}

export type EstadoMisDatos =
  | { estado: 'ok'; confirmadoEn: string | null; confirmacion: Confirmacion; contacto: ContactoEnmascarado }
  | { estado: 'sin_ficha' }
  | { estado: 'varias_fichas' }
  | { estado: 'sin_puente' }
  | { estado: 'error'; causa: string }

export type ResultadoConfirmar =
  | { estado: 'ok'; confirmadoEn: string }
  | { estado: 'sin_ficha' }
  | { estado: 'varias_fichas' }
  | { estado: 'sin_puente' }
  | { estado: 'error'; causa: string }

type Libre = { direccion?: string | null; codigoPostal?: string | null; ciudad?: string | null; provincia?: string | null }

// ─── La llamada al puente, una sola vez ──────────────────────────────────────

type Respuesta =
  | { tipo: 'sin_puente' }
  | { tipo: 'fallo'; causa: 'timeout' | 'red' }
  | { tipo: 'respuesta'; status: number; ok: boolean; j: Record<string, unknown> | null; estado: string | null }

async function llamarPuente(
  ruta: string,
  init: { method: 'GET' } | { method: 'POST'; cuerpo: Record<string, unknown> },
  etiqueta: string,
): Promise<Respuesta> {
  const base = process.env.ASEGURA_PUENTE_URL
  const secret = process.env.ASEGURA_PORTAL_PUENTE_SECRET
  // Cerrado por defecto y DICHO: sin las dos envs no se inventa un destino ni
  // se cae a un «guardado» o un «confirmado» optimista.
  if (!base || !secret) return { tipo: 'sin_puente' }

  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), PORTAL_PUENTE_TIEMPO_MS)
  try {
    const res = await fetch(`${base.replace(/\/+$/, '')}${ruta}`, {
      method: init.method,
      headers: {
        ...(init.method === 'POST' ? { 'content-type': 'application/json' } : {}),
        authorization: `Bearer ${secret}`,
      },
      body: init.method === 'POST' ? JSON.stringify(init.cuerpo) : undefined,
      cache: 'no-store',
      signal: control.signal,
    })
    const j = (await res.json().catch(() => null)) as Record<string, unknown> | null
    const estado = typeof j?.estado === 'string' ? j.estado : null
    return { tipo: 'respuesta', status: res.status, ok: res.ok, j, estado }
  } catch (e) {
    const abortado = e instanceof Error && e.name === 'AbortError'
    console.error(`[portal/mis-datos] el puente no respondió (${etiqueta}):`, abortado ? 'timeout' : e instanceof Error ? e.message : e)
    return { tipo: 'fallo', causa: abortado ? 'timeout' : 'red' }
  } finally {
    clearTimeout(reloj)
  }
}

/** 🚨 Cualquier otra cosa —incluido un 401 por un secreto mal puesto— es un
 *  fallo, no un guardado. El motivo va al log del servidor y a la persona se
 *  le dice que no se ha guardado, que es lo único cierto. */
function inesperada(r: Extract<Respuesta, { tipo: 'respuesta' }>, etiqueta: string): { estado: 'error'; causa: string } {
  console.error(`[portal/mis-datos] respuesta inesperada del puente (${etiqueta}): ${r.status} ${r.estado ?? 'sin estado'}`)
  return { estado: 'error', causa: `puente_${r.status}` }
}

// ─── Escribir ────────────────────────────────────────────────────────────────

export async function guardarMiDireccion(identidadId: string, libre: Libre, telefono?: string): Promise<ResultadoMisDatos> {
  // `telefono` va al lado de `libre`, no dentro: es el contrato del puerto
  // (`POST /api/portal/contacto`). Solo viaja si hay algo escrito — un hueco no
  // es un borrado, igual que con los campos de la dirección.
  const cuerpo: Record<string, unknown> = { identidadId, libre }
  if (typeof telefono === 'string' && telefono.trim() !== '') cuerpo.telefono = telefono.trim()

  const r = await llamarPuente('/api/portal/contacto', { method: 'POST', cuerpo }, 'contacto')
  if (r.tipo === 'sin_puente') return { estado: 'sin_puente' }
  if (r.tipo === 'fallo') return { estado: 'error', causa: r.causa }

  const { j, estado } = r
  if (r.ok && estado === 'ok') {
    const campos = Array.isArray(j?.campos) ? j!.campos.filter((c): c is string => typeof c === 'string') : []
    return { estado: 'ok', campos }
  }
  if (estado === 'sin_cambios') return { estado: 'sin_cambios' }
  if (estado === 'invalido') {
    return {
      estado: 'invalido',
      motivo: typeof j?.motivo === 'string' ? j.motivo : 'dato no válido',
      campo: typeof j?.campo === 'string' ? j.campo : null,
    }
  }
  if (estado === 'conflicto') return { estado: 'conflicto', campo: typeof j?.campo === 'string' ? j.campo : null }
  if (estado === 'sin_ficha') return { estado: 'sin_ficha' }
  if (estado === 'varias_fichas') return { estado: 'varias_fichas' }
  if (estado === 'sin_configurar') return { estado: 'sin_puente' }
  return inesperada(r, 'contacto')
}

// ─── Leer (enmascarado) ──────────────────────────────────────────────────────

const CONFIRMACIONES: readonly Confirmacion[] = ['nunca', 'vigente', 'caducada']

function leerDato(x: unknown): DatoEnmascarado | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  if (typeof o.tiene !== 'boolean') return null
  if (o.mascara !== null && typeof o.mascara !== 'string') return null
  return { tiene: o.tiene, mascara: o.mascara as string | null }
}

/**
 * La forma exacta del contrato, o `null`. Un puente que devuelva un `ok` con
 * un `contacto` a medias NO se pinta a medias: se trata como error, porque
 * «teléfono: no consta» sobre un campo que sencillamente no vino es afirmar
 * una ausencia que nadie ha mirado.
 */
function leerContacto(x: unknown): ContactoEnmascarado | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  const direccion = leerDato(o.direccion)
  const telefono = leerDato(o.telefono)
  const email = leerDato(o.email)
  if (!direccion || !telefono || !email) return null
  const e = o.email as Record<string, unknown>
  if (typeof e.confirmadoPorAcceso !== 'boolean') return null
  return { direccion, telefono, email: { ...email, confirmadoPorAcceso: e.confirmadoPorAcceso } }
}

export async function estadoMisDatos(identidadId: string): Promise<EstadoMisDatos> {
  const r = await llamarPuente(
    `/api/portal/contacto-estado?identidadId=${encodeURIComponent(identidadId)}`,
    { method: 'GET' },
    'contacto-estado',
  )
  if (r.tipo === 'sin_puente') return { estado: 'sin_puente' }
  if (r.tipo === 'fallo') return { estado: 'error', causa: r.causa }

  const { j, estado } = r
  if (r.ok && estado === 'ok') {
    const confirmacion = CONFIRMACIONES.find((c) => c === j?.confirmacion) ?? null
    const contacto = leerContacto(j?.contacto)
    const confirmadoEn = typeof j?.confirmadoEn === 'string' ? j.confirmadoEn : null
    if (!confirmacion || !contacto) {
      console.error('[portal/mis-datos] contacto-estado con forma inesperada: se trata como error, no se pinta a medias')
      return { estado: 'error', causa: 'puente_forma' }
    }
    return { estado: 'ok', confirmadoEn, confirmacion, contacto }
  }
  if (estado === 'sin_ficha') return { estado: 'sin_ficha' }
  if (estado === 'varias_fichas') return { estado: 'varias_fichas' }
  if (estado === 'sin_configurar') return { estado: 'sin_puente' }
  return inesperada(r, 'contacto-estado')
}

// ─── Confirmar («siguen igual») ──────────────────────────────────────────────

export async function confirmarMisDatos(identidadId: string): Promise<ResultadoConfirmar> {
  const r = await llamarPuente('/api/portal/contacto-confirmar', { method: 'POST', cuerpo: { identidadId } }, 'contacto-confirmar')
  if (r.tipo === 'sin_puente') return { estado: 'sin_puente' }
  if (r.tipo === 'fallo') return { estado: 'error', causa: r.causa }

  const { j, estado } = r
  if (r.ok && estado === 'ok') {
    // Sin la fecha no hay sello que enseñar: un «ok» sin `confirmadoEn` no es
    // el contrato, y pintarlo como confirmado con la fecha de hoy puesta aquí
    // sería inventarse el sello que asegura no ha dicho que puso.
    if (typeof j?.confirmadoEn !== 'string') {
      console.error('[portal/mis-datos] contacto-confirmar ok sin confirmadoEn: se trata como error')
      return { estado: 'error', causa: 'puente_forma' }
    }
    return { estado: 'ok', confirmadoEn: j.confirmadoEn }
  }
  if (estado === 'sin_ficha') return { estado: 'sin_ficha' }
  if (estado === 'varias_fichas') return { estado: 'varias_fichas' }
  if (estado === 'sin_configurar') return { estado: 'sin_puente' }
  return inesperada(r, 'contacto-confirmar')
}
