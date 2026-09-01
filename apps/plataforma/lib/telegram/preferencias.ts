// lib/telegram/preferencias.ts — el interruptor de cada aviso (tabla `telegram_avisos_pref`)
// y la bitácora de lo que se manda/omite (`telegram_avisos_log`), que es lo que permite al panel
// decir CUÁNTOS avisos llegan de verdad en vez de la cadencia teórica del cron.
//
// 🚨 Fail-open a propósito: si la BD no responde, el aviso SALE. Un fallo de red no puede
// convertirse en «silencio» — sería exactamente el modo de fallo que describe CLAUDE.md (un
// canal que se calla sin que nadie lo note). Solo se silencia lo que Alberto ha silenciado.
import { prisma } from '@/lib/db'
import { esCritico } from './catalogo'

type Cache = { valores: Map<string, boolean>; expira: number }

// Caché por instancia serverless. 60 s: suficiente para que una pasada de cron no repita la
// consulta por cada aviso, y lo bastante corto para que el interruptor se note casi al momento.
const TTL_MS = 60_000
let cache: Cache | null = null

/** Invalida la caché de esta instancia (tras guardar una preferencia). */
export function olvidarCache(): void {
  cache = null
}

async function preferencias(): Promise<Map<string, boolean> | null> {
  if (cache && cache.expira > Date.now()) return cache.valores
  try {
    const filas = await prisma.$queryRaw<{ aviso_id: string; activo: boolean }[]>`
      SELECT aviso_id, activo FROM telegram_avisos_pref
    `
    const valores = new Map(filas.map(f => [f.aviso_id, f.activo]))
    cache = { valores, expira: Date.now() + TTL_MS }
    return valores
  } catch (e) {
    // Sin tabla (migración sin aplicar) o BD caída: no se sabe nada de preferencias.
    console.warn('[telegram-avisos] no se pudieron leer las preferencias:', e)
    return null
  }
}

/**
 * ¿Sale este aviso? `true` en todos los casos salvo que exista una fila que diga lo contrario.
 * Los avisos críticos no se pueden silenciar ni aunque haya fila (defensa en profundidad: el
 * panel tampoco los ofrece).
 */
export async function avisoActivo(id: string): Promise<boolean> {
  if (esCritico(id)) return true
  const prefs = await preferencias()
  if (!prefs) return true // fail-open
  return prefs.get(id) ?? true
}

export async function guardarPreferencia(id: string, activo: boolean): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO telegram_avisos_pref (aviso_id, activo, actualizado_at)
    VALUES (${id}, ${activo}, now())
    ON CONFLICT (aviso_id) DO UPDATE SET activo = EXCLUDED.activo, actualizado_at = now()
  `
  olvidarCache()
}

/** Bitácora. Best-effort: no puede impedir que el aviso salga. */
export async function registrarEnvio(id: string, estado: 'enviado' | 'omitido'): Promise<void> {
  try {
    await prisma.$executeRaw`
      INSERT INTO telegram_avisos_log (aviso_id, estado) VALUES (${id}, ${estado})
    `
  } catch { /* la bitácora es un lujo; el aviso ya ha salido */ }
}

export interface ConteoAviso {
  avisoId: string
  enviados: number
  omitidos: number
  ultimo: Date | null
}

export interface ResumenAvisos {
  /**
   * Fecha de la entrada más antigua de la bitácora. `null` = todavía no se ha registrado NADA,
   * y entonces un 0 no significa «no llega ninguno» sino «aún no se ha medido». La pantalla
   * tiene que decir esas dos cosas distinto (regla del `NULL` de CLAUDE.md).
   */
  registroDesde: Date | null
  dias: number
  conteos: Map<string, ConteoAviso>
}

/** Cuántas veces ha salido (y se ha omitido) cada aviso en los últimos `dias` días. */
export async function resumenAvisos(dias = 30): Promise<ResumenAvisos | null> {
  try {
    const [desde] = await prisma.$queryRaw<{ min: Date | null }[]>`
      SELECT min(enviado_at) AS min FROM telegram_avisos_log
    `
    const filas = await prisma.$queryRaw<{ aviso_id: string; estado: string; n: bigint; ultimo: Date }[]>`
      SELECT aviso_id, estado, count(*) AS n, max(enviado_at) AS ultimo
      FROM telegram_avisos_log
      WHERE enviado_at > now() - make_interval(days => ${dias})
      GROUP BY aviso_id, estado
    `
    const conteos = new Map<string, ConteoAviso>()
    for (const f of filas) {
      const c = conteos.get(f.aviso_id) ?? { avisoId: f.aviso_id, enviados: 0, omitidos: 0, ultimo: null }
      if (f.estado === 'omitido') c.omitidos += Number(f.n)
      else c.enviados += Number(f.n)
      if (!c.ultimo || f.ultimo > c.ultimo) c.ultimo = f.ultimo
      conteos.set(f.aviso_id, c)
    }
    return { registroDesde: desde?.min ?? null, dias, conteos }
  } catch (e) {
    // Sin bitácora no se puede afirmar nada sobre frecuencias: se devuelve null y la pantalla
    // lo dice, en vez de pintar ceros que parecerían «no llega ninguno».
    console.warn('[telegram-avisos] bitácora no disponible:', e)
    return null
  }
}

/**
 * Purga la bitácora a `dias` (90 por defecto). La llama el cron diario `agentes-latido`: el panel
 * mira 30 días, así que guardar más no aporta y la tabla crece ~50 filas/día. Best-effort.
 */
export async function purgarBitacora(dias = 90): Promise<number> {
  try {
    return await prisma.$executeRaw`
      DELETE FROM telegram_avisos_log WHERE enviado_at < now() - make_interval(days => ${dias})
    `
  } catch { return 0 }
}
