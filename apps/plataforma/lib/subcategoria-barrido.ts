// apps/plataforma/lib/subcategoria-barrido.ts
// Barrido de subcategoría de GASTO PERSONAL: reparte los movimientos personales en categorías útiles
// (super/bares/vivienda…). Función ÚNICA compartida por el cron diario, la ruta `auto-tag` (botón) y
// —vía keywords— la ingesta. Sustituye a la antigua vía Anthropic de pago (`categoria-ia.ts`).
//
// Estrategia: keyword primero (instantáneo y gratis) → aprende regla → solo lo genuinamente ambiguo
// va a la IA (pasarela gratis @central/core-ai, cadena NIM→Groq→Gemini→Kimi) en lotes pequeños con
// presupuesto de tiempo (éxito parcial, nunca 504).
//
// DIFERENCIA CLAVE con el comportamiento antiguo: RESCATA los que quedaron en 'otros_gasto' sin
// clasificar de verdad — antes solo los NULL llegaban a la IA, así que un 'otros_gasto' ambiguo se
// quedaba en el cajón para siempre.
//
// KEYWORD AUTORITATIVO (07/07/2026): la IA GRATIS de la pasarela es poco fiable y llegó a meter
// gasolineras, súper y tributos dentro de 'seguro' con confianza alta. Como el diccionario de keywords
// es determinista y correcto, el PASO 1 ahora barre TODO el gasto personal (no solo NULL/otros_gasto) y
// SOBREESCRIBE la etiqueta cuando la keyword discrepa. Así el sistema se autocorrige y una etiqueta mala
// de la IA no se queda fija para siempre. La IA (PASO 2) solo ve lo que la keyword NO supo clasificar.
// Si Alberto recategoriza a mano algo que una keyword contradice, la vía correcta es AÑADIR/ajustar la
// keyword (no hay bandera de bloqueo manual).

import { aiComplete } from '@central/core-ai'
import { prisma } from './db'
import { SUBCATEGORIAS_GASTO, DESCRIPCION_GASTO, esSubcategoriaValida } from './categorias-personales'
import { clasificarPorKeywords } from './subcategoria-keywords'
import { normalizarContraparte } from './normalizar-contraparte'
import { comprobarAlertas } from './alertas-categoria'

// Lotes pequeños: una respuesta corta por lote no agota el timeout de la IA. Un lote que falla se
// salta (los demás siguen). Ver el razonamiento en el auto-tag original.
const CHUNK = 10
const IA_TIMEOUT_MS = 8_000
const PRESUPUESTO_MS = 38_000
// Umbral de confianza: por debajo se marca para revisión humana (no se tira a otros_gasto en silencio).
const UMBRAL_CONFIANZA = 0.85

const SYSTEM = `Eres el contable personal de Alberto (España). Para cada gasto bancario personal
asigna la subcategoría que mejor lo describe y tu confianza (0.0-1.0). Responde SOLO un array JSON
en el mismo orden: [{"i":0,"subcategoria":"supermercado","confianza":0.9}]

Subcategorías disponibles:
${SUBCATEGORIAS_GASTO.map(s => `- ${s}: ${DESCRIPCION_GASTO[s]}`).join('\n')}`

type Row = {
  id: string
  concepto: string | null
  concepto_normalizado: string | null
  contraparte: string | null
  importe: number
  cuenta_bancaria_id: string
  cuenta_id: string
  subcategoria: string | null
  es_null: boolean
}

export type ResultadoBarrido = { tagged: number; revisar: number; cuentasTocadas: Set<string>; subcategoriasTocadas: Set<string> }

// Barre los gastos personales sin clasificar (NULL) o mal clasificados ('otros_gasto') y les asigna
// subcategoría. Si `cuentaId` viene, se limita a esa cuenta; si no, barre TODAS (uso del cron).
export async function barrerSubcategoriasPersonal(
  cuentaId?: string,
  opts: { presupuestoMs?: number; limite?: number } = {},
): Promise<ResultadoBarrido> {
  const started = Date.now()
  const presupuesto = opts.presupuestoMs ?? PRESUPUESTO_MS
  const limite = opts.limite ?? 1000

  // Se barre TODO el gasto personal (no solo NULL/otros_gasto): el PASO 1 keyword es autoritativo y
  // corrige etiquetas malas de la IA. El PASO 2 (IA) sigue viendo solo lo que la keyword no clasifica.
  const scopeCuenta = cuentaId
    ? prisma.$queryRaw<Row[]>`
        SELECT mb.id, mb.concepto, mb.concepto_normalizado, mb.contraparte, mb.importe::float8 AS importe,
               mb.cuenta_bancaria_id, cb.cuenta_id, mb.subcategoria, (mb.subcategoria IS NULL) AS es_null
        FROM movimientos_bancarios mb
        JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
        WHERE cb.cuenta_id = ${cuentaId}::uuid
          AND COALESCE(mb.destino, 'personal') = 'personal'
          AND mb.importe < 0
          AND COALESCE(mb.duplicado_estado, '') <> 'ignorado'
        ORDER BY mb.fecha_operacion DESC
        LIMIT ${limite}`
    : prisma.$queryRaw<Row[]>`
        SELECT mb.id, mb.concepto, mb.concepto_normalizado, mb.contraparte, mb.importe::float8 AS importe,
               mb.cuenta_bancaria_id, cb.cuenta_id, mb.subcategoria, (mb.subcategoria IS NULL) AS es_null
        FROM movimientos_bancarios mb
        JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
        WHERE COALESCE(mb.destino, 'personal') = 'personal'
          AND mb.importe < 0
          AND COALESCE(mb.duplicado_estado, '') <> 'ignorado'
        ORDER BY mb.fecha_operacion DESC
        LIMIT ${limite}`

  const rows = await scopeCuenta
  const out: ResultadoBarrido = { tagged: 0, revisar: 0, cuentasTocadas: new Set(), subcategoriasTocadas: new Set() }
  if (rows.length === 0) return out

  // Pares (cuenta_id|subcategoria) tocados → para avisar del presupuesto solo de lo que ha cambiado.
  const pares = new Set<string>()
  const marcar = (r: Row, sub: string) => {
    out.tagged++
    out.cuentasTocadas.add(r.cuenta_id)
    out.subcategoriasTocadas.add(sub)
    pares.add(`${r.cuenta_id}|${sub}`)
  }

  // PASO 1 — keyword (determinista, gratis) y AUTORITATIVO: escribe/CORRIGE la subcategoría con
  // confianza alta (subcategoria_revisar=false), sobreescribiendo etiquetas malas de la IA. Aprende
  // regla solo en descubrimientos NULL. No reescribe no-ops ni degrada una etiqueta real a otros_gasto.
  const pendientes: Row[] = [] // filas que la keyword no supo clasificar → candidatas a IA
  for (const r of rows) {
    const sub = clasificarPorKeywords(r.concepto_normalizado || r.concepto, r.contraparte)
    if (!sub) {
      // Solo lo NO clasificado de verdad (NULL/otros_gasto) va a la IA; lo ya etiquetado se respeta.
      if (r.es_null || r.subcategoria === 'otros_gasto') pendientes.push(r)
      continue
    }
    if (sub === r.subcategoria) continue // ya tiene la etiqueta correcta → no-op
    if (sub === 'otros_gasto' && !r.es_null) continue // no degradar una etiqueta real a otros_gasto
    if (Date.now() - started > presupuesto) break
    await prisma.$executeRaw`
      UPDATE movimientos_bancarios SET subcategoria = ${sub}, subcategoria_revisar = false WHERE id = ${r.id}::uuid`
    marcar(r, sub)
    if (r.es_null) {
      const clave = normalizarContraparte(r.contraparte)
      if (clave) {
        await prisma.$executeRaw`
          INSERT INTO banca_destino_reglas (cuenta_id, clave, destino, subcategoria)
          VALUES (${r.cuenta_id}::uuid, ${clave}, 'personal', ${sub})
          ON CONFLICT (cuenta_id, clave) DO UPDATE SET subcategoria = EXCLUDED.subcategoria`
      }
    }
  }

  if (pendientes.length === 0) return out

  // PASO 2 — IA (solo lo ambiguo, incluidos los 'otros_gasto' sin match). Lotes con presupuesto.
  for (let off = 0; off < pendientes.length; off += CHUNK) {
    if (Date.now() - started > presupuesto) break
    const chunk = pendientes.slice(off, off + CHUNK)
    const prompt = chunk.map((r, i) => {
      const desc = (r.concepto_normalizado || r.concepto || r.contraparte || '').slice(0, 120)
      return `${i}. [${Math.abs(Number(r.importe)).toFixed(2)}€] ${desc}`
    }).join('\n')

    let parsed: Array<{ i: number; subcategoria: string; confianza?: number }>
    try {
      const raw = await aiComplete(prompt, { system: SYSTEM, maxTokens: 800, timeoutMs: IA_TIMEOUT_MS })
      const match = raw.match(/\[[\s\S]*\]/)
      parsed = JSON.parse(match ? match[0] : raw.replace(/```json|```/g, '').trim())
      if (!Array.isArray(parsed)) throw new Error('respuesta no es array')
    } catch (e) {
      console.error('[barrido] lote falló ·', e instanceof Error ? e.message : String(e))
      continue
    }

    for (const p of parsed) {
      const row = chunk[p.i]
      if (!row) continue
      const valida = esSubcategoriaValida(p.subcategoria)
      const sub = valida ? p.subcategoria : 'otros_gasto'
      const confianza = typeof p.confianza === 'number' ? p.confianza : 0.5
      // Baja confianza o cajón de sastre → se marca para revisión humana (no muere en silencio).
      const revisar = !valida || sub === 'otros_gasto' || confianza < UMBRAL_CONFIANZA
      await prisma.$executeRaw`
        UPDATE movimientos_bancarios SET subcategoria = ${sub}, subcategoria_revisar = ${revisar} WHERE id = ${row.id}::uuid`
      marcar(row, sub)
      if (revisar) out.revisar++
      // Aprende regla solo con alta confianza en descubrimientos NULL (evita fijar errores).
      if (row.es_null && !revisar) {
        const clave = normalizarContraparte(row.contraparte)
        if (clave) {
          await prisma.$executeRaw`
            INSERT INTO banca_destino_reglas (cuenta_id, clave, destino, subcategoria)
            VALUES (${row.cuenta_id}::uuid, ${clave}, 'personal', ${sub})
            ON CONFLICT (cuenta_id, clave) DO UPDATE SET subcategoria = EXCLUDED.subcategoria`
        }
      }
    }
  }

  // Aviso de presupuesto (D): solo de los pares (cuenta, categoría) que han cambiado. No rompe el
  // barrido si Telegram falla.
  for (const par of pares) {
    const [cta, sub] = par.split('|')
    await comprobarAlertas(cta, sub).catch(() => {})
  }

  return out
}
