// Auto-categorización IA de movimientos bancarios (Fase 2). Usa el núcleo gratis
// @central/core-ai (NVIDIA NIM); si no hay NVIDIA_API_KEY o falla, degrada limpio
// (los movimientos quedan sin categorizar, el import no se rompe).
//
// La IA SOLO decide la categoría y normaliza el concepto críptico. La cuenta del
// plan contable (PGC) se deriva en código desde la categoría (determinista, sin
// alucinación). Reanalizar es idempotente (marca analizado_at).

import { aiComplete, cleanJSON } from '@central/core-ai'
import { prisma } from './db'
import { clasificarPorKeywords } from './subcategoria-keywords'
import { CATEGORIAS, pgcDe, categorizarPorReglas, type Categoria } from './categoria-reglas'

// La taxonomía, etiquetas, mapa PGC y reglas deterministas viven en lib/categoria-reglas.ts
// (módulo PURO, testeable con `node --test`). Se reexportan para no romper imports existentes.
export { CATEGORIAS, CATEGORIA_LABEL, pgcDe, categorizarPorReglas, type Categoria } from './categoria-reglas'

export type MovParaCategorizar = { id: string; concepto: string | null; contraparte: string | null; importe: number }
export type Categorizacion = { id: string; categoria: Categoria; conceptoNormalizado: string; categoriaPgc: string; requiereRevision: boolean }

// Clasifica un lote en una sola llamada IA. Devuelve [] si no hay IA o falla.
export async function categorizarLote(movs: MovParaCategorizar[]): Promise<Categorizacion[]> {
  if (movs.length === 0) return []

  const lista = movs.map((m, i) =>
    `${i}. [${m.importe >= 0 ? 'ABONO' : 'CARGO'} ${Math.abs(m.importe).toFixed(2)}€] ${(m.concepto || m.contraparte || '').slice(0, 140)}`,
  ).join('\n')

  const system = `Eres un contable español. Clasificas movimientos bancarios.
Para cada uno devuelve su categoría (UNA de: ${CATEGORIAS.join(', ')}), un "concepto" legible
y breve (máx 60 chars, en español, sin códigos crípticos) y "revisar": true SOLO si NO estás
seguro de la categoría (caso dudoso o ambiguo). Un CARGO suele ser proveedor, nómina,
impuestos, suministros, alquiler, comisión, tarjeta, préstamo o seguro; un ABONO suele ser
cobro_cliente o transferencia. Responde SOLO un array JSON:
[{"i":0,"categoria":"...","concepto":"...","revisar":false}].`

  try {
    // Modelo pequeño y RÁPIDO: categorizar es tarea simple y el 70B por defecto generaba
    // 1400 tokens en >20s → abortaba siempre. El 8B responde en pocos segundos.
    const raw = await aiComplete(lista, { system, model: 'meta/llama-3.1-8b-instruct', maxTokens: 1400, temperature: 0.1, timeoutMs: 45_000 })
    const parsed = JSON.parse(cleanJSON(raw)) as Array<{ i: number; categoria: string; concepto: string; revisar?: boolean }>
    if (!Array.isArray(parsed)) return []
    const out: Categorizacion[] = []
    for (const p of parsed) {
      const mov = movs[p.i]
      if (!mov) continue
      const valida = (CATEGORIAS as readonly string[]).includes(p.categoria)
      const categoria = (valida ? p.categoria : 'otros') as Categoria
      // Pedir revisión cuando la IA lo marca, cuando devolvió algo fuera de la taxonomía,
      // o cuando cayó en 'otros' (cajón de "no lo tengo claro").
      const requiereRevision = p.revisar === true || !valida || categoria === 'otros'
      out.push({
        id: mov.id,
        categoria,
        conceptoNormalizado: (p.concepto || mov.concepto || '').slice(0, 80),
        categoriaPgc: pgcDe(categoria),
        requiereRevision,
      })
    }
    return out
  } catch (e) {
    // Log temporal de diagnóstico (sin secretos): por qué no categorizó.
    console.error('[categorizar] IA falló · hasKey=', !!process.env.NVIDIA_API_KEY, '· error=', e instanceof Error ? e.message : String(e))
    return []
  }
}

// "Destino"/negocio del movimiento (a quién pertenece). La lógica PURA (y testeable) vive en
// lib/destino.ts; se reexporta aquí para no romper los imports existentes desde '@/lib/categorizar'.
export { clasificarDestino, DESTINO_LABEL, type Destino } from './destino'
import { clasificarDestinoDetalle, type Destino, type DestinoDetalle } from './destino'
import { claveReglaValida } from './correduria'
import { refAdeudoSepa, esAnulacionAdeudoSepa, casarDevolucionSepa } from './devoluciones-sepa'

// Detección determinista de deducciones de cuota IRPF (no de base, sino de cuota directa).
// mecenazgo: Ley 49/2002 (donaciones a fundaciones) — 80% primeros €150, 40% resto.
// guarderia: Art.81bis LIRPF (gastos en guarderías/centros de custodia de menores < 3 años).
// deportiva_and: D.A.1ª Ley 7/2021 Andalucía (cuotas deportivas) — 15% base máx. €100.
export function detectarDeduccionCuotaTipo(
  concepto: string | null,
  contraparte: string | null,
): string | null {
  const t = `${concepto ?? ''} ${contraparte ?? ''}`.toUpperCase()
  const has = (...ks: string[]) => ks.some(k => t.includes(k))
  // Mecenazgo: fundaciones y ONG conocidas.
  if (has('FUNDACION', 'FUNDACIÓ', 'FUNDACIÓ', 'DONACION', 'DONACIÓ', 'DONATIVO', 'DONATIU',
    'CRUZ ROJA', 'CARITAS', 'CÁRITAS', 'UNICEF', 'AMNISTIA', 'GREENPEACE', 'MEDICOS SIN FRONT',
    'BANCO ALIM', 'SAGRADOS CORAZONES')) return 'mecenazgo'
  // Guardería: escuelas infantiles y centros de custodia.
  if (has('ESCUELA INFANTIL', 'GUARDERIA', 'GUARDERÍA', 'JARDIN INFANCIA', 'JARDÍN INFANCIA',
    'JARDIN DE INFAN', 'ACPA', 'CUSTODIA MENOR', 'CENTRO INFANTIL')) return 'guarderia'
  // Deportiva Andalucía: cuotas de gimnasio / club deportivo.
  if (has('GYM DUO', 'GYM SOCIO', 'CUOTA GYM', 'CUOTA GIMNASIO', 'PISCINA MUNICIPAL',
    'CLUB DEPORTIVO', 'POLIDEPORTIVO', 'INSTALACION DEPORTIVA', 'CUOTA PADEL', 'CUOTA TENIS',
    'CUOTA NATACION', 'CUOTA NATACIÓN')) return 'deportiva_and'
  return null
}

// Analiza los movimientos sin categorizar de una cuenta (scoped por cuenta_id). Primero
// aplica REGLAS deterministas (instantáneo, sin IA) y solo manda a la IA lo que no encaja,
// en sub-lotes pequeños (así apenas toca el cupo gratuito de NIM). Idempotente (analizado_at).
const TAM_LOTE_IA = 25

async function guardarCategoria(
  cuentaId: string, id: string, c: Categorizacion, destino: Destino,
  subcategoria?: string, confirmado = false, deduccionCuotaTipo?: string | null,
): Promise<number> {
  const res = await prisma.$executeRaw`
    UPDATE movimientos_bancarios
    SET categoria = ${c.categoria}, concepto_normalizado = ${c.conceptoNormalizado},
        categoria_pgc = ${c.categoriaPgc}, requiere_revision = ${c.requiereRevision},
        destino = ${destino}, subcategoria = COALESCE(${subcategoria ?? null}, subcategoria),
        destino_confirmado = CASE WHEN ${confirmado} THEN true ELSE destino_confirmado END,
        deduccion_cuota_tipo = COALESCE(${deduccionCuotaTipo ?? null}, deduccion_cuota_tipo),
        analizado_at = now()
    WHERE id = ${id}::uuid
      AND cuenta_bancaria_id IN (SELECT id FROM cuentas_bancarias WHERE cuenta_id = ${cuentaId}::uuid)
  `
  return Number(res)
}

// Subcategoría de GASTO PERSONAL a fijar en la ingesta. Prioridad: la regla del dueño / vía Pilar
// (dSub) manda; si no, para gasto personal se intenta la keyword determinista (instantánea, gratis).
// Devuelve undefined si no hay nada seguro → el movimiento queda sin subcategoría y lo recoge el
// barrido diario con IA. Nunca pisa una subcategoría ya fijada (guardarCategoria hace COALESCE).
function subcategoriaIngesta(
  destino: Destino, importe: number, concepto: string | null, contraparte: string | null, dSub?: string,
): string | undefined {
  if (dSub) return dSub
  if (destino === 'personal' && importe < 0) return clasificarPorKeywords(concepto, contraparte) ?? undefined
  return undefined
}

type MovPend = { id: string; concepto: string | null; contraparte: string | null; importe: unknown; banco: string | null; destino: string | null; destino_confirmado: boolean | null; titular: string | null }

export async function analizarMovimientos(cuentaId: string, limite = 400): Promise<{ categorizados: number }> {
  const pendientes = await prisma.$queryRaw<MovPend[]>`
    SELECT mb.id, mb.concepto, mb.contraparte, mb.importe, cb.banco, mb.destino, mb.destino_confirmado, cb.titular
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid AND mb.analizado_at IS NULL
    ORDER BY mb.fecha_operacion DESC NULLS LAST
    LIMIT ${limite}
  `
  if (pendientes.length === 0) return { categorizados: 0 }

  // Reglas de destino APRENDIDAS por el dueño (clave → negocio). La clave puede ser un código de
  // referencia (M1454, DNI…) o un nombre de COMERCIO (PETROPRIX, IONOS, NETFLIX…). Se aplican por
  // SUBSTRING del concepto (concepto contiene la clave) y tienen PRIORIDAD sobre la detección
  // automática — así anulan también el invariante "seguros solo BBVA" para los comercios marcados
  // (p.ej. gasolina en Kutxa → correduría). Si casan varias, gana la más larga (más específica).
  const reglasRows = await prisma.$queryRaw<Array<{ clave: string; destino: string; deduccion_cuota_tipo: string | null }>>`
    SELECT clave, destino, deduccion_cuota_tipo FROM banca_destino_reglas WHERE cuenta_id = ${cuentaId}::uuid
  `
  const reglas = reglasRows
    .map(r => ({ clave: (r.clave || '').toUpperCase(), destino: r.destino as Destino, deduccionCuotaTipo: r.deduccion_cuota_tipo }))
    // Ignora reglas-trampa (claves genéricas tipo "TRANSF"/"TOTAL" que colisionan por substring con
    // casi cualquier concepto) aunque hayan quedado en BD de importaciones antiguas.
    .filter(r => claveReglaValida(r.clave))
    .sort((a, b) => b.clave.length - a.clave.length)
  // GUARDA: las reglas NO se aplican a cuentas del cónyuge (sus movimientos son actividad_pilar).
  const reglaPara = (concepto: string | null, titular: string | null): { destino: Destino; deduccionCuotaTipo: string | null } | null => {
    if (titular === 'conyuge') return null
    const txt = (concepto ?? '').toUpperCase()
    for (const r of reglas) if (txt.includes(r.clave)) return { destino: r.destino, deduccionCuotaTipo: r.deduccionCuotaTipo ?? null }
    return null
  }

  // El destino (negocio) se decide así, en orden:
  //  1) si el dueño YA confirmó el destino del movimiento → se respeta tal cual;
  //  2) regla aprendida (código de referencia o comercio) — confianza alta, sin revisar;
  //  3) detección automática, que puede marcar `revisar` (descarte) o `confirmado` (Bizum). Para
  //     cuentas de Pilar (conyuge) la detección va a actividad_pilar.
  const FALLBACK: DestinoDetalle = { destino: 'personal', revisar: false }
  const destinoDe = new Map<string, { det: DestinoDetalle; deduccionCuotaTipo: string | null }>(pendientes.map(p => {
    if (p.destino_confirmado && p.destino) return [p.id, { det: { destino: p.destino as Destino, revisar: false }, deduccionCuotaTipo: null }]
    const aprendido = reglaPara(p.concepto, p.titular)
    if (aprendido) return [p.id, { det: { destino: aprendido.destino, revisar: false }, deduccionCuotaTipo: aprendido.deduccionCuotaTipo }]
    const titular = p.titular === 'conyuge' ? 'conyuge' : 'titular'
    const det = clasificarDestinoDetalle(p.banco, p.concepto, p.contraparte, Number(p.importe), titular)
    // Detectar cuota deduction para movimientos personales (sin regla aprendida aún).
    const cuotaTipo = det.destino === 'personal' ? detectarDeduccionCuotaTipo(p.concepto, p.contraparte) : null
    return [p.id, { det, deduccionCuotaTipo: cuotaTipo }]
  }))
  let n = 0
  const paraIA: MovPend[] = []

  // 1) Reglas deterministas — sin IA, al instante.
  for (const p of pendientes) {
    const { det: d, deduccionCuotaTipo } = destinoDe.get(p.id) ?? { det: FALLBACK, deduccionCuotaTipo: null }
    const cat = categorizarPorReglas(p.concepto, p.contraparte, Number(p.importe))
    if (cat) {
      const sub = subcategoriaIngesta(d.destino, Number(p.importe), p.concepto, p.contraparte, d.subcategoria)
      n += await guardarCategoria(cuentaId, p.id, {
        id: p.id, categoria: cat,
        conceptoNormalizado: (p.concepto || p.contraparte || '').slice(0, 80),
        categoriaPgc: pgcDe(cat), requiereRevision: d.revisar,
      }, d.destino, sub, d.confirmado, deduccionCuotaTipo)
    } else {
      paraIA.push(p)
    }
  }

  // 2) IA solo para lo ambiguo, en sub-lotes, persistiendo lote a lote.
  const movById = new Map(paraIA.map(p => [p.id, p]))
  for (let i = 0; i < paraIA.length; i += TAM_LOTE_IA) {
    const trozo = paraIA.slice(i, i + TAM_LOTE_IA)
    const cats = await categorizarLote(
      trozo.map(p => ({ id: p.id, concepto: p.concepto, contraparte: p.contraparte, importe: Number(p.importe) })),
    )
    for (const c of cats) {
      const { det: d, deduccionCuotaTipo } = destinoDe.get(c.id) ?? { det: FALLBACK, deduccionCuotaTipo: null }
      const p = movById.get(c.id)
      const sub = subcategoriaIngesta(d.destino, p ? Number(p.importe) : 0, p?.concepto ?? null, p?.contraparte ?? null, d.subcategoria)
      n += await guardarCategoria(cuentaId, c.id, { ...c, requiereRevision: c.requiereRevision || d.revisar }, d.destino, sub, d.confirmado, deduccionCuotaTipo)
    }
  }
  // 3) Cuadra los recibos SEPA devueltos (cargo + su anulación con la misma referencia): así el par
  //    netea a 0 en el negocio correcto y sale de las bandejas «por revisar». Best-effort.
  await casarDevolucionesSepa(cuentaId).catch(() => ({ pareadas: 0 }))
  return { categorizados: n }
}

// Empareja las DEVOLUCIONES de adeudos SEPA (recibos domiciliados devueltos) con su cargo original
// por la referencia común "N <ref>": copia al abono de anulación el destino del cargo y da AMBOS por
// confirmados (requiere_revision=false), para que se anulen en el P&L y salgan de «por revisar».
// Idempotente (solo toca abonos sin confirmar) y scoped por cuenta. No aplica a cuentas del cónyuge.
export async function casarDevolucionesSepa(cuentaId: string): Promise<{ pareadas: number }> {
  const abonos = await prisma.$queryRaw<Array<{ id: string; concepto: string | null; importe: unknown }>>`
    SELECT mb.id, mb.concepto, mb.importe
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND cb.titular IS DISTINCT FROM 'conyuge'
      AND mb.importe > 0
      AND COALESCE(mb.destino_confirmado, false) = false
      AND COALESCE(mb.duplicado_estado, '') <> 'ignorado'
      AND mb.concepto ILIKE '%ANULACION%ADEUDO%'
  `
  let pareadas = 0
  for (const a of abonos) {
    const ref = refAdeudoSepa(a.concepto)
    if (!ref || !esAnulacionAdeudoSepa(a.concepto)) continue
    const cargos = await prisma.$queryRaw<Array<{ id: string; concepto: string | null; importe: unknown; destino: string | null }>>`
      SELECT mb.id, mb.concepto, mb.importe, mb.destino
      FROM movimientos_bancarios mb
      JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
      WHERE cb.cuenta_id = ${cuentaId}::uuid
        AND mb.importe < 0
        AND mb.destino IS NOT NULL
        AND COALESCE(mb.duplicado_estado, '') <> 'ignorado'
        AND mb.concepto ILIKE ${`%N ${ref}%`}
    `
    const cand = cargos.map(c => ({ id: c.id, importe: Number(c.importe), ref: refAdeudoSepa(c.concepto), destino: c.destino }))
    const match = casarDevolucionSepa({ importe: Number(a.importe), ref }, cand)
    if (!match) continue
    // El abono de anulación hereda el destino del cargo y se confirma (se anulan). El cargo también
    // se confirma: la devolución lo cuadra → deja de ser «por revisar».
    await prisma.$executeRaw`
      UPDATE movimientos_bancarios SET destino = ${match.destino}, destino_confirmado = true, requiere_revision = false
      WHERE id = ${a.id}::uuid`
    await prisma.$executeRaw`
      UPDATE movimientos_bancarios SET destino_confirmado = true, requiere_revision = false
      WHERE id = ${match.id}::uuid`
    pareadas++
  }
  return { pareadas }
}

// Asignación MANUAL de categoría por el dueño (resuelve un "por revisar"). Valida la
// categoría, deriva la cuenta PGC y quita la marca de revisión. Scoped por cuenta_id.
export async function asignarCategoria(cuentaId: string, movimientoId: string, categoria: string): Promise<boolean> {
  if (!(CATEGORIAS as readonly string[]).includes(categoria)) return false
  const res = await prisma.$executeRaw`
    UPDATE movimientos_bancarios
    SET categoria = ${categoria}, categoria_pgc = ${pgcDe(categoria)},
        requiere_revision = false, analizado_at = now()
    WHERE id = ${movimientoId}::uuid
      AND cuenta_bancaria_id IN (SELECT id FROM cuentas_bancarias WHERE cuenta_id = ${cuentaId}::uuid)
  `
  return Number(res) > 0
}

// Categoriza los movimientos pendientes de TODAS las cuentas que tengan alguno sin analizar
// (lo usa el cron diario tras sincronizar los bancos). Devuelve el total categorizado.
export async function categorizarPendientesTodas(): Promise<{ cuentas: number; categorizados: number }> {
  const cuentas = await prisma.$queryRaw<Array<{ cuenta_id: string }>>`
    SELECT DISTINCT cb.cuenta_id
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE mb.analizado_at IS NULL
  `
  let categorizados = 0
  for (const c of cuentas) {
    const r = await analizarMovimientos(c.cuenta_id, 300).catch(() => ({ categorizados: 0 }))
    categorizados += r.categorizados
  }
  return { cuentas: cuentas.length, categorizados }
}
