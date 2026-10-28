// Privacidad del meta del hilo de siniestros. `siniestro_mensajes.meta` es jsonb EN CLARO: la ficha del caso, el
// veredicto, el índice de la póliza, la ficha del perito y las citas pueden llevar datos personales. Todo eso va en UN
// sobre cifrado `meta.privado`; en claro solo queda lo necesario para listar/filtrar (semáforo, confianza, derivar,
// huellas, versiones, modelo, llamadas, contadores de citas). Puro: el cifrado se inyecta.
import { encajarMeta } from './siniestro-gabinete.ts'

/** Claves del meta que viajan SIEMPRE cifradas. `citas` (textos literales de la póliza) también; en claro, solo `citasConteo`. */
export const CLAVES_META_PRIVADAS = ['fichaCaso', 'veredicto', 'indicePoliza', 'fichaPerito', 'citas'] as const

/** Crecimiento del JSON al cifrarlo (AES-GCM + base64 + prefijo): ~1,4×. */
export const FACTOR_CIFRADO = 1.4

const esObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const bytes = (x: unknown): number => new TextEncoder().encode(JSON.stringify(x)).length
const SEMAFOROS = new Set(['defendible', 'no_defendible', 'faltan_datos'])
const CONFIANZAS = new Set(['alta', 'media', 'baja'])

/** ¿Lleva algo que cifrar? */
export const tienePrivado = (meta: Record<string, unknown> | null | undefined): boolean =>
  !!meta && CLAVES_META_PRIVADAS.some((k) => k in meta && meta[k] !== undefined)

/**
 * Separa el meta en parte pública (sin PII) y sobre cifrado. `maxBytes` = tope del meta final (ya cifrado): el contenido
 * privado se recorta con `encajarMeta` a lo que quepa antes de cifrar (÷ FACTOR_CIFRADO) y, si aun así el sobre no cabe, se
 * reduce el presupuesto y se repite. Sin claves privadas devuelve el meta tal cual.
 */
export function empaquetarMetaPrivado(
  meta: Record<string, unknown>,
  cifrar: (texto: string) => string,
  maxBytes: number,
): { meta: Record<string, unknown>; recortes: string[] } {
  if (!tienePrivado(meta)) return { meta, recortes: [] }
  const publico: Record<string, unknown> = {}
  const privado: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(meta)) {
    if ((CLAVES_META_PRIVADAS as readonly string[]).includes(k)) privado[k] = v
    else publico[k] = v
  }
  const ver = privado.veredicto
  if (esObj(ver)) {
    if (typeof ver.semaforo === 'string' && SEMAFOROS.has(ver.semaforo)) publico.semaforo = ver.semaforo
    if (typeof ver.confianza === 'string' && CONFIANZAS.has(ver.confianza)) publico.confianza = ver.confianza
    if (ver.derivar === null || ver.derivar === 'abogado' || ver.derivar === 'perito_externo') publico.derivar = ver.derivar
  }
  const c = privado.citas
  if (esObj(c)) {
    publico.citasConteo = {
      verificadas: Array.isArray(c.verificadas) ? c.verificadas.length : 0,
      noEncontradas: Array.isArray(c.noEncontradas) ? c.noEncontradas.length : 0,
    }
  }
  let presupuesto = Math.floor((maxBytes - bytes(publico) - 300) / FACTOR_CIFRADO)
  for (let intento = 0; intento < 6; intento++) {
    const enc = encajarMeta(privado, Math.max(presupuesto, 200))
    const sobre = cifrar(JSON.stringify(enc.meta))
    const salida: Record<string, unknown> = { ...publico, privado: sobre }
    if (enc.recortes.length) salida.recortesMeta = enc.recortes
    if (bytes(salida) <= maxBytes) return { meta: salida, recortes: enc.recortes }
    presupuesto = Math.floor(presupuesto * 0.8)
  }
  // Último recurso: sobre vacío (el texto del mensaje sigue siendo íntegro).
  return { meta: { ...publico, privado: cifrar('{}'), recortesMeta: ['privado_fuera'] }, recortes: ['privado_fuera'] }
}

/**
 * Inversa: descifra `meta.privado` y devuelve el meta con los MISMOS campos de antes (`veredicto`, `fichaCaso`,
 * `indicePoliza`, `fichaPerito`, `citas`). Un meta antiguo (campos en claro, sin `privado`) pasa tal cual. Si el sobre no se
 * descifra o no es JSON → `privadoIlegible: true` (nunca «vacío» en silencio).
 */
export function desempaquetarMetaPrivado(
  meta: Record<string, unknown> | null,
  descifrar: (sobre: string) => string,
): Record<string, unknown> | null {
  if (!meta || !('privado' in meta)) return meta
  const { privado, ...resto } = meta
  if (typeof privado !== 'string') return { ...resto, privadoIlegible: true }
  try {
    const p: unknown = JSON.parse(descifrar(privado))
    if (!esObj(p)) return { ...resto, privadoIlegible: true }
    return { ...resto, ...p }
  } catch {
    return { ...resto, privadoIlegible: true }
  }
}

/** ¿Algún campo de PII del gabinete va en claro en este meta? (cepo de datos ya escritos) */
export const metaConPrivadoEnClaro = (meta: Record<string, unknown> | null | undefined): string[] =>
  !meta ? [] : CLAVES_META_PRIVADAS.filter((k) => k in meta && meta[k] != null)

// ─── Pre-rehúse ──────────────────────────────────────────────────────────────

const RE_PRE_REHUSE = /rehus|rehús|modifiqu\w* (?:su |el )?informe|no (?:est[aá]|queda) cubiert|sin cobertura|exclusi[oó]n|exclusiones/i

/** ¿El texto de la compañía/corredor anuncia (o apunta a) un rehúse? Aviso temprano, no veredicto. */
export const detectarPreRehuse = (texto: string): boolean => RE_PRE_REHUSE.test(texto)

// ─── Valoración de un análisis ───────────────────────────────────────────────

export type ValoracionAnalisis = { mensajeId: string; voto: 'bien' | 'mal'; motivo: string | null }

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const MAX_MOTIVO_VALORACION = 2_000

export function validarValoracion(raw: unknown): { ok: true; valoracion: ValoracionAnalisis; texto: string } | { ok: false; motivo: string } {
  if (!esObj(raw)) return { ok: false, motivo: 'valoracion tiene que ser un objeto' }
  const mensajeId = typeof raw.mensajeId === 'string' ? raw.mensajeId.trim() : ''
  if (!RE_UUID.test(mensajeId)) return { ok: false, motivo: 'valoracion.mensajeId no es un id de mensaje válido' }
  if (raw.voto !== 'bien' && raw.voto !== 'mal') return { ok: false, motivo: "valoracion.voto tiene que ser 'bien' o 'mal'" }
  let motivo: string | null = null
  if (raw.motivo !== undefined && raw.motivo !== null) {
    if (typeof raw.motivo !== 'string') return { ok: false, motivo: 'valoracion.motivo tiene que ser texto' }
    const m = raw.motivo.trim()
    if (m.length > MAX_MOTIVO_VALORACION) return { ok: false, motivo: `valoracion.motivo supera ${MAX_MOTIVO_VALORACION} caracteres` }
    motivo = m === '' ? null : m
  }
  return { ok: true, valoracion: { mensajeId, voto: raw.voto, motivo }, texto: motivo ?? (raw.voto === 'bien' ? '👍' : '👎') }
}

type MensajeValorable = { autor: string; tipo: string; texto: string | null; meta?: Record<string, unknown> | null }

/** ¿Es un mensaje de valoración (no hecho del caso)? */
export const esValoracion = (m: { meta?: Record<string, unknown> | null }): boolean => !!m.meta && esObj(m.meta.valoracion)

/** Correcciones del corredor a análisis anteriores de ESTE siniestro: votos «mal» con motivo escrito. Más recientes al final. */
export function correccionesDeValoraciones(mensajes: readonly MensajeValorable[], max = 8): string[] {
  const r: string[] = []
  for (const m of mensajes) {
    if (m.autor !== 'interna' || !esObj(m.meta?.valoracion) || m.meta.valoracion.voto !== 'mal') continue
    const t = (m.texto ?? '').trim()
    if (t === '' || t === '👎') continue
    r.push(t.slice(0, 800))
  }
  return r.slice(-max)
}
