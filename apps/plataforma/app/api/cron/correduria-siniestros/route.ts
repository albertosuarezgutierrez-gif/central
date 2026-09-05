// ────────────────────────────────────────────────────────────────────────────
// Vigía de los SINIESTROS NUEVOS de la correduría (Grupo ASegura).
//
// Existe por un dictado de Alberto (05/09/2026):
//
//   «Los siniestros, mejor intentar que llamen a la compañía. Nosotros nos
//    enteraremos por CIMA, me avisas y llamo para ver cómo va y hacerle
//    seguimiento.»
//
// La cadena hasta hoy se cortaba en el penúltimo eslabón: el cliente llama a su
// aseguradora, la compañía nos manda el siniestro por CIMA, entra en
// `seguros.siniestros`… y ahí se quedaba. Nadie avisaba a Alberto, así que el
// seguimiento —lo único que la correduría aporta cuando ya hay un siniestro
// abierto— dependía de que abriera la ficha del cliente por casualidad.
//
// La regla dura del sitio, y el motivo de casi todo lo raro de este fichero:
// **la marca de agua NO avanza si el aviso no ha salido.** Avanzarla siempre es
// cómo un siniestro se pierde para siempre sin que nada falle — el mismo fallo
// que `correduria-ingesta` documenta con la fecha del último aviso.
//
// La regla pura (qué es nuevo, qué se dice y qué NO se puede decir) vive en
// `@central/module-seguros` (`siniestro-nuevo.ts`), con sus cepos.
// ────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { tgSend } from '@/lib/telegram'
import { avisoPermitido, avisoEnviado } from '@/lib/telegram/avisos'
import { prisma } from '@/lib/db'
import { isCronAuthorized } from '@/lib/cron-auth'
import { registrarLatido } from '@/lib/monitoring/latido-escribir'
import {
  decidirSiniestrosNuevos,
  detalleSiniestros,
  leerMarca,
  serializarMarca,
  textoAvisoSiniestros,
  type MarcaSiniestros,
  type SiniestroEntrante,
} from '@central/module-seguros'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const AGENTE = 'correduria_siniestros'

/**
 * Cuántas filas se piden al puerto por pasada.
 *
 * Holgado a propósito: el corte del MENSAJE lo hace la regla pura
 * (`TOPE_AVISO_SINIESTROS`), y aquí lo que importa es no dejarse ninguna sin
 * VER — si el puerto trunca, el máximo que se calcula para la marca de agua
 * sería el de una lista incompleta y las que quedan fuera se perderían.
 * Cuando trunca, se dice y no se ancla (ver abajo).
 */
const LIMITE_LECTURA = 500

type Lectura =
  | { estado: 'ok'; siniestros: SiniestroEntrante[]; total: number }
  | { estado: 'sin_datos'; causa: string }

function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

/**
 * Una fila del puerto → `SiniestroEntrante`, o `null` si no tiene forma.
 *
 * `id` y `entradoEn` son obligatorios porque son el eje de la marca de agua:
 * sin ellos la fila no se puede ni deduplicar ni anclar. Todo lo demás puede
 * faltar y se queda en `null` — el aviso lo declara («compañía no informada»)
 * en vez de rellenarlo con un genérico.
 */
function leerFila(v: unknown): SiniestroEntrante | null {
  if (typeof v !== 'object' || v === null) return null
  const s = v as Record<string, unknown>
  const id = texto(s.id)
  const entradoEn = texto(s.entradoEn)
  if (id === null || entradoEn === null || Number.isNaN(new Date(entradoEn).getTime())) return null
  return {
    id,
    entradoEn,
    ocurridoEn: texto(s.ocurridoEn),
    cliente: texto(s.cliente),
    clienteId: texto(s.clienteId),
    compania: texto(s.compania),
    poliza: texto(s.poliza),
    referencia: texto(s.referencia),
  }
}

/**
 * Lee el puerto de `central-asegura`.
 *
 * 🚨 CUALQUIER duda acaba en `sin_datos`, nunca en una lista vacía. «Hoy no ha
 * entrado ningún siniestro» y «hoy no se ha podido comprobar» son cosas
 * distintas, y aquí el silencio significa que un cliente se queda sin su
 * llamada. Una respuesta con forma rara tampoco se degrada a `[]`: si la mitad
 * de las filas fueran ilegibles, un `[]` diría «no hay» sobre algo que sí hay.
 *
 * La llamada va aquí y no en un `lib/*-asegura.ts` porque es el único
 * consumidor de este endpoint; si aparece un segundo, se extrae.
 */
async function leerPuerto(desde: string | null, limite: number): Promise<Lectura> {
  const secreto = process.env.ASEGURA_OPERADOR_SECRET
  if (!secreto) return { estado: 'sin_datos', causa: 'puerto sin configurar (falta ASEGURA_OPERADOR_SECRET)' }
  const base = (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
  const q = new URLSearchParams({ limite: String(limite) })
  if (desde !== null) q.set('desde', desde)

  let status: number
  let json: unknown
  try {
    const res = await fetch(`${base}/api/operador/siniestros-nuevos?${q}`, {
      headers: { Authorization: `Bearer ${secreto}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
    status = res.status
    json = await res.json().catch(() => null)
  } catch {
    return { estado: 'sin_datos', causa: 'no se pudo llegar a asegura (timeout, DNS o TLS)' }
  }

  if (status === 401 || status === 403) return { estado: 'sin_datos', causa: 'asegura rechaza el secreto' }
  const o = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  if (o.estado === 'sin_configurar' || status === 503) return { estado: 'sin_datos', causa: 'asegura sin base de datos configurada' }
  if (status !== 200 || o.estado !== 'ok' || !Array.isArray(o.siniestros)) {
    // La causa del clasificador de asegura si viene; si no, el status pelado.
    const causa = texto(o.causa) ?? texto(o.motivo) ?? `HTTP ${status}`
    return { estado: 'sin_datos', causa }
  }
  const siniestros: SiniestroEntrante[] = []
  for (const fila of o.siniestros) {
    const s = leerFila(fila)
    if (s === null) return { estado: 'sin_datos', causa: 'asegura devolvió una fila sin id ni fecha de entrada' }
    siniestros.push(s)
  }
  const total = typeof o.total === 'number' && Number.isFinite(o.total) ? o.total : siniestros.length
  return { estado: 'ok', siniestros, total }
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Dónde se quedó la última pasada QUE AVISÓ. Vive en la cabecera del `detalle`
  // del latido, igual que en `correduria-ingesta`: no hace falta tabla nueva.
  let detalleAnterior: string | null = null
  try {
    const filas = await prisma.$queryRaw<Array<{ detalle: string | null }>>(Prisma.sql`
      SELECT detalle FROM agente_latidos WHERE agente = ${AGENTE}`)
    detalleAnterior = filas[0]?.detalle ?? null
  } catch {
    // No poder leer la marca NO autoriza a inventarse una: con `null` se
    // trataría como primera pasada y se ANCLARÍA sobre la cartera de hoy,
    // enterrando en silencio los siniestros que quedaran por avisar.
    await registrarLatido(AGENTE, false, detalleSiniestros({
      avisar: false, motivo: 'sin_datos', causa: 'no se pudo leer la marca de agua del latido',
    }))
    return NextResponse.json({ ok: false, motivo: 'marca_ilegible' }, { status: 500 })
  }

  const marca = leerMarca(detalleAnterior)
  const lectura = await leerPuerto(marca?.instante ?? null, LIMITE_LECTURA)

  if (lectura.estado === 'sin_datos') {
    // Se conserva la cabecera con la marca ANTERIOR: perderla convertiría la
    // pasada siguiente en una «primera vez» que anclaría sin avisar de nada.
    const detalle = detalleSiniestros({ avisar: false, motivo: 'sin_datos', causa: lectura.causa })
    await registrarLatido(AGENTE, false, marca ? serializarMarca(marca, detalle) : detalle)
    return NextResponse.json({ ok: false, estado: 'sin_datos', causa: lectura.causa })
  }

  // El puerto se quedó corto: el máximo de una lista incompleta NO sirve de
  // ancla. Se avisa como «no se ha podido mirar del todo» y se deja la marca
  // donde estaba, que es lo único que garantiza que nada se pierde.
  if (lectura.total > lectura.siniestros.length && marca === null) {
    const causa = `hay ${lectura.total} siniestros y el puerto solo devuelve ${lectura.siniestros.length}: no se puede anclar la marca sin arriesgarse a saltarse alguno`
    const detalle = detalleSiniestros({ avisar: false, motivo: 'sin_datos', causa })
    await registrarLatido(AGENTE, false, detalle)
    return NextResponse.json({ ok: false, estado: 'sin_datos', causa })
  }

  const decision = decidirSiniestrosNuevos({
    marca,
    siniestros: lectura.siniestros,
    hoy: new Date(),
  })

  // ── No hay que avisar ──────────────────────────────────────────────────────
  if (decision.avisar === false) {
    const detalle = detalleSiniestros(decision)
    // En la primera pasada la marca SÍ se guarda sin haber avisado: es
    // exactamente lo que se quiere (anclar y no mandar el histórico), y el
    // latido dice cuántos se dejan atrás para que no se lea como «no hay».
    const marcaGuardada: MarcaSiniestros | null = decision.motivo === 'primera_vez' ? decision.marca : marca
    await registrarLatido(AGENTE, true, marcaGuardada ? serializarMarca(marcaGuardada, detalle) : detalle)
    return NextResponse.json({
      ok: true,
      estado: decision.motivo,
      anteriores: decision.motivo === 'primera_vez' ? decision.anteriores : undefined,
      avisados: 0,
      detalle,
    })
  }

  // ── Hay que avisar ─────────────────────────────────────────────────────────
  //
  // Los que el puerto no llegó a traer se suman a los que la regla dejó para la
  // próxima tanda: el mensaje promete que ninguno se pierde y esa promesa tiene
  // que incluirlos a todos.
  const restantes = decision.restantes + Math.max(0, lectura.total - lectura.siniestros.length)

  // Silencio DELIBERADO (Alberto apagó el interruptor en /telegram) ≠ envío
  // fallido. Lo primero no es una avería: la marca avanza y el latido lo dice;
  // lo segundo tiene que reintentarse mañana con los MISMOS siniestros.
  //
  // ⚠️ El id va LITERAL en las dos llamadas, no por constante: el guardián
  // `lib/telegram/catalogo.test.ts` lee el FUENTE con una regex y una constante
  // le dejaría creer que este interruptor no apaga nada.
  const permitido = await avisoPermitido('correduria.siniestro-nuevo')
  let salio = false
  if (permitido) {
    // `tgSend` se traga sus fallos y devuelve `null`; ese `null` es justo la
    // señal que impide que la marca avance.
    const messageId = await tgSend(textoAvisoSiniestros(decision.nuevos, restantes)).catch(() => null)
    salio = messageId !== null
    if (salio) await avisoEnviado('correduria.siniestro-nuevo')
  }

  const avanza = salio || !permitido
  const detalle = avanza
    ? detalleSiniestros(decision) + (permitido ? '' : ' · aviso silenciado en /telegram')
    : `siniestros nuevos: ${decision.nuevos.length} SIN avisar (el Telegram no salió) — se reintentan en la próxima pasada`
  // `marca ?? decision.marca` es inalcanzable (sin marca previa la decisión
  // habría sido `primera_vez`, que no avisa), pero evita un cast: la marca que
  // se guarda al NO avanzar tiene que ser la de antes, exactamente.
  const marcaFinal: MarcaSiniestros = avanza ? decision.marca : (marca ?? decision.marca)
  await registrarLatido(AGENTE, avanza, serializarMarca(marcaFinal, detalle))

  return NextResponse.json({
    ok: avanza,
    estado: 'avisado',
    avisados: avanza ? decision.nuevos.length : 0,
    silenciado: !permitido,
    restantes,
    detalle,
  })
}
