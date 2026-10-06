// «Resumen de tus opciones» y «Comparar dos opciones con la IA»: la parte con BD y con IA.
// Lo puro (prompt, cifras, validación, tope) vive en `comparativa-ia.ts` y tiene sus cepos.
//
// Se llama SOLO desde el puente del portal (`/api/portal/presupuesto`): el portal no llama a la IA
// directamente. La ficha sale de `portal_vinculo` (`fichaPropiaDeRecurso`: la dueña del presupuesto, si está
// vinculada con nivel de operar), nunca de un id que mande nadie.
//
// Dónde se guarda (sin migración, a propósito): en `presupuesto_evento`, que ya es append-only.
//   · `resumen_ia`        → el resumen, generado UNA vez por presupuesto (la caché es el evento).
//   · `resumen_ia_fallo`  → la IA falló o su salida se descartó; frena reintentos 30 min.
//   · `pregunta_ia`       → cada pregunta (sin su texto: puede llevar datos que el cliente teclee).
//   · `pide_llamada`      → «Prefiero que me llaméis».

import { prismaAsegura } from './asegura-db'
import { anotarCambio } from './auditoria'
import { fichaPropiaDeRecurso } from './contacto-portal'
import { iaTexto } from './ia'
import { URL_PLATAFORMA_DEFECTO, enlaceFichaCliente, escaparHtml } from './datos-cotizados'
import { coberturasDeSobre } from './codeoscopic/coberturas-presupuesto'
import {
  AVISO_IA, MAX_PREGUNTAS_DIA, SISTEMA_IA, decidirPregunta, promptPregunta, promptResumen, validarSalidaIA, type OpcionIA,
} from './comparativa-ia'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const TIPO_RESUMEN = 'resumen_ia'
export const TIPO_RESUMEN_FALLO = 'resumen_ia_fallo'
export const TIPO_PREGUNTA = 'pregunta_ia'
export const TIPO_PIDE_LLAMADA = 'pide_llamada'
const MAX_LLAMADAS_DIA = 3
const TIMEOUT_IA_MS = 20_000

export type SinFicha = { estado: 'sin_ficha' } | { estado: 'varias_fichas' } | { estado: 'sin_permiso' } | { estado: 'error'; causa: string }
type Propio = { clienteId: string; ramo: string; tomador: string; retirado: boolean }

export async function propio(correduriaId: string, identidadId: string, presupuestoId: string): Promise<Propio | { estado: 'no_encontrado' } | SinFicha> {
  if (!UUID.test(presupuestoId)) return { estado: 'no_encontrado' }
  const ficha = await fichaPropiaDeRecurso(correduriaId, identidadId, 'presupuesto', presupuestoId)
  if (ficha.estado === 'ajena') return { estado: 'no_encontrado' }
  if (ficha.estado !== 'ok') return ficha
  const [f] = await prismaAsegura().$queryRaw<Omit<Propio, 'clienteId'>[]>`
    select p.ramo, trim(concat(c.nombre, ' ', coalesce(c.apellidos, ''))) as tomador, (p.retirado_at is not null) as retirado
    from presupuesto p join clientes c on c.id = p.cliente_id
    where p.id = ${presupuestoId}::uuid and p.correduria_id = ${correduriaId}::uuid and p.cliente_id = ${ficha.clienteId}::uuid`
  return f ? { ...f, clienteId: ficha.clienteId } : { estado: 'no_encontrado' }
}

/**
 * Las opciones congeladas, en la forma que ve la IA: SOLO datos de producto. Nunca las ocultas.
 * `soloPortada`: el resumen habla de las RECOMENDADAS — desde que se congelan todas (29/09/2026)
 * serían decenas, y un resumen de 30 opciones ni cabe en 400 tokens ni ayuda a nadie a decidir.
 */
async function opcionesIA(presupuestoId: string, soloPortada = false): Promise<OpcionIA[]> {
  const filas = await prismaAsegura().presupuestoOpcion.findMany({
    where: { presupuestoId, ocultaAt: null, ...(soloPortada ? { NOT: { papeles: { isEmpty: true } } } : {}) },
    orderBy: { orden: 'asc' },
    select: { id: true, compania: true, producto: true, modalidad: true, primaEur: true, franquiciaEur: true, coberturas: true },
  })
  return filas.map((f) => ({
    id: f.id,
    compania: f.compania,
    producto: f.producto,
    modalidad: f.modalidad,
    primaEur: Number(f.primaEur.toString()),
    franquiciaEur: f.franquiciaEur === null ? null : Number(f.franquiciaEur.toString()),
    coberturas: coberturasDeSobre(f.coberturas).lista,
  }))
}

export async function anotarEvento(presupuestoId: string, tipo: string, detalle: Record<string, unknown>): Promise<void> {
  await prismaAsegura().presupuestoEvento.create({ data: { presupuestoId, tipo, origen: 'cliente', detalle: detalle as object } })
}

export async function contarDesde(presupuestoId: string, tipo: string, desde: Date): Promise<number> {
  return prismaAsegura().presupuestoEvento.count({ where: { presupuestoId, tipo, ocurridoAt: { gte: desde } } })
}

// ─── Resumen ─────────────────────────────────────────────────────────────────

export type ResultadoResumen =
  | { estado: 'ok'; texto: string; aviso: string }
  /** La IA no está o su salida no pasó la validación. La tabla sigue: esto no es un error de la página. */
  | { estado: 'no_disponible'; aviso: string }
  | { estado: 'no_encontrado' } | SinFicha

export async function resumenIA(correduriaId: string, identidadId: string, presupuestoId: string): Promise<ResultadoResumen> {
  const p = await propio(correduriaId, identidadId, presupuestoId)
  if ('estado' in p) return p
  const db = prismaAsegura()

  // Caché: el resumen se genera UNA vez por presupuesto.
  const hecho = await db.presupuestoEvento.findFirst({
    where: { presupuestoId, tipo: TIPO_RESUMEN },
    orderBy: { ocurridoAt: 'desc' },
    select: { detalle: true },
  })
  const cacheado = (hecho?.detalle as { texto?: unknown } | undefined)?.texto
  if (typeof cacheado === 'string' && cacheado.trim()) return { estado: 'ok', texto: cacheado, aviso: AVISO_IA }

  // Un fallo reciente no se reintenta en cada recarga: cada intento cuesta.
  if ((await contarDesde(presupuestoId, TIPO_RESUMEN_FALLO, new Date(Date.now() - 30 * 60_000))) > 0) {
    return { estado: 'no_disponible', aviso: AVISO_IA }
  }

  const opciones = await opcionesIA(presupuestoId, true)
  if (opciones.length === 0) return { estado: 'no_disponible', aviso: AVISO_IA }

  let texto: string
  try {
    texto = await iaTexto(promptResumen(opciones), { system: SISTEMA_IA, maxTokens: 400, timeoutMs: TIMEOUT_IA_MS, privado: true })
  } catch (e) {
    console.warn('[comparativa-ia] el resumen no se pudo generar:', e instanceof Error ? e.message : e)
    await anotarEvento(presupuestoId, TIPO_RESUMEN_FALLO, { motivo: 'ia' }).catch(() => {})
    return { estado: 'no_disponible', aviso: AVISO_IA }
  }
  const v = validarSalidaIA(texto, opciones)
  if (!v.ok) {
    console.warn(`[comparativa-ia] resumen descartado por el validador: ${v.motivo}`)
    await anotarEvento(presupuestoId, TIPO_RESUMEN_FALLO, { motivo: v.motivo }).catch(() => {})
    return { estado: 'no_disponible', aviso: AVISO_IA }
  }
  await anotarEvento(presupuestoId, TIPO_RESUMEN, { texto: v.texto, opciones: opciones.length })
  return { estado: 'ok', texto: v.texto, aviso: AVISO_IA }
}

// ─── Pregunta sobre dos opciones ─────────────────────────────────────────────

export type ResultadoPregunta =
  | { estado: 'ok'; texto: string; restantes: number; aviso: string }
  | { estado: 'no_disponible'; restantes: number; aviso: string }
  | { estado: 'limite' } | { estado: 'invalido' } | { estado: 'no_admite' }
  | { estado: 'no_encontrado' } | SinFicha

export async function preguntaIA(
  correduriaId: string, identidadId: string, presupuestoId: string,
  e: { opcionA: string; opcionB: string; pregunta: unknown },
): Promise<ResultadoPregunta> {
  const p = await propio(correduriaId, identidadId, presupuestoId)
  if ('estado' in p) return p
  if (p.retirado) return { estado: 'no_admite' }
  if (!UUID.test(e.opcionA) || !UUID.test(e.opcionB) || e.opcionA === e.opcionB) return { estado: 'invalido' }

  // 🚨 El tope se decide AQUÍ, en el servidor, antes de gastar nada (cepo en comparativa-ia.test.ts).
  const hechasHoy = await contarDesde(presupuestoId, TIPO_PREGUNTA, new Date(Date.now() - 24 * 3_600_000))
  const d = decidirPregunta({ hechasHoy, pregunta: e.pregunta })
  if (d.estado === 'limite') return { estado: 'limite' }
  if (d.estado === 'invalida') return { estado: 'invalido' }

  const opciones = await opcionesIA(presupuestoId)
  const a = opciones.find((o) => o.id === e.opcionA)
  const b = opciones.find((o) => o.id === e.opcionB)
  if (!a || !b) return { estado: 'invalido' }

  // Se cuenta ANTES de llamar: una pregunta que hace fallar a la IA también consume cupo, o un bucle
  // de errores sería una puerta sin tope. Sin el texto: lo que el cliente teclee no se guarda.
  await anotarEvento(presupuestoId, TIPO_PREGUNTA, { longitud: d.pregunta.length, opciones: [a.id, b.id] })
  const restantes = Math.max(0, MAX_PREGUNTAS_DIA - hechasHoy - 1)

  let texto: string
  try {
    texto = await iaTexto(promptPregunta(a, b, d.pregunta, [p.tomador]), { system: SISTEMA_IA, maxTokens: 300, timeoutMs: TIMEOUT_IA_MS, privado: true })
  } catch (err) {
    console.warn('[comparativa-ia] la pregunta no se pudo responder:', err instanceof Error ? err.message : err)
    return { estado: 'no_disponible', restantes, aviso: AVISO_IA }
  }
  const v = validarSalidaIA(texto, [a, b])
  if (!v.ok) {
    console.warn(`[comparativa-ia] respuesta descartada por el validador: ${v.motivo}`)
    return { estado: 'no_disponible', restantes, aviso: AVISO_IA }
  }
  return { estado: 'ok', texto: v.texto, restantes, aviso: AVISO_IA }
}

// ─── «Prefiero que me llaméis» ───────────────────────────────────────────────

export type ResultadoLlamada =
  /** `aviso`: el Telegram para Alberto; lo manda el portal, que es quien tiene el bot. */
  | { estado: 'ok'; aviso: string }
  | { estado: 'limite' } | { estado: 'no_encontrado' } | SinFicha

export async function pideLlamada(correduriaId: string, identidadId: string, presupuestoId: string): Promise<ResultadoLlamada> {
  const p = await propio(correduriaId, identidadId, presupuestoId)
  if ('estado' in p) return p
  if ((await contarDesde(presupuestoId, TIPO_PIDE_LLAMADA, new Date(Date.now() - 24 * 3_600_000))) >= MAX_LLAMADAS_DIA) {
    return { estado: 'limite' }
  }
  await anotarEvento(presupuestoId, TIPO_PIDE_LLAMADA, {})
  anotarCambio({ entidad: 'presupuesto', id: presupuestoId, campo: 'pide_llamada', antes: null, despues: 'avisado' })
  try {
    await prismaAsegura().$executeRaw`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${p.clienteId}::uuid, cast('gestion' as tipo_historial_interno),
              ${`El cliente pide en el portal que le llamemos por su presupuesto de ${p.ramo} (desde la comparativa).`})`
  } catch (e) {
    console.error('[comparativa-ia] historial de «llamadme» no anotado:', e instanceof Error ? e.message : e)
  }
  const enlace = enlaceFichaCliente(p.clienteId, process.env.PLATAFORMA_URL?.trim() || URL_PLATAFORMA_DEFECTO)
  return {
    estado: 'ok',
    aviso: [
      `📞 <b>${escaparHtml(p.tomador)}</b> prefiere que le llaméis por su presupuesto de ${escaparHtml(p.ramo)}.`,
      'Lo ha pedido desde la comparativa del portal.',
      `<a href="${escaparHtml(enlace)}">Abrir la ficha del cliente</a>`,
    ].join('\n'),
  }
}
