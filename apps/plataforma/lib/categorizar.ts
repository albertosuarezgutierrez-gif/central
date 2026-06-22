// Auto-categorización IA de movimientos bancarios (Fase 2). Usa el núcleo gratis
// @central/core-ai (NVIDIA NIM); si no hay NVIDIA_API_KEY o falla, degrada limpio
// (los movimientos quedan sin categorizar, el import no se rompe).
//
// La IA SOLO decide la categoría y normaliza el concepto críptico. La cuenta del
// plan contable (PGC) se deriva en código desde la categoría (determinista, sin
// alucinación). Reanalizar es idempotente (marca analizado_at).

import { aiComplete, cleanJSON } from '@central/core-ai'
import { prisma } from './db'

// Taxonomía cerrada de categorías (la IA debe elegir una de estas).
export const CATEGORIAS = [
  'nomina', 'proveedor', 'impuestos', 'suministros', 'alquiler',
  'comision_bancaria', 'cobro_cliente', 'transferencia', 'tarjeta',
  'prestamo', 'seguro', 'otros',
] as const
export type Categoria = typeof CATEGORIAS[number]

// Etiqueta visible (con emoji) por categoría. Compartida por /banca y el dashboard.
export const CATEGORIA_LABEL: Record<Categoria, string> = {
  nomina: '👤 Nómina', proveedor: '📦 Proveedor', impuestos: '🏛️ Impuestos',
  suministros: '💡 Suministros', alquiler: '🏠 Alquiler', comision_bancaria: '🏦 Comisión',
  cobro_cliente: '💰 Cobro cliente', transferencia: '🔁 Transferencia', tarjeta: '💳 Tarjeta',
  prestamo: '📉 Préstamo', seguro: '🛡️ Seguro', otros: '• Otros',
}

// Mapa categoría → cuenta PGC orientativa (Plan General Contable español).
const PGC: Record<Categoria, string> = {
  nomina: '640', proveedor: '600', impuestos: '475', suministros: '628',
  alquiler: '621', comision_bancaria: '626', cobro_cliente: '700',
  transferencia: '572', tarjeta: '572', prestamo: '170', seguro: '625', otros: '629',
}

function pgcDe(cat: string): string {
  return (CATEGORIAS as readonly string[]).includes(cat) ? PGC[cat as Categoria] : PGC.otros
}

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
import { clasificarDestino, type Destino } from './destino'
import { claveReferencia } from './correduria'

// Reglas deterministas: categoriza por palabras clave del concepto/contraparte SIN IA.
// Cubre la mayoría de movimientos al instante (y sin gastar el cupo gratuito de NIM). Lo
// que no encaje devuelve null → va a la IA. Orden: de lo más específico a lo más genérico.
function categorizarPorReglas(concepto: string | null, contraparte: string | null, importe: number): Categoria | null {
  const t = `${concepto ?? ''} ${contraparte ?? ''}`.toUpperCase()
  const has = (...ks: string[]) => ks.some(k => t.includes(k))

  if (has('SEGURO', 'GENERALI', 'MAPFRE', ' AXA', 'ALLIANZ', 'MUTUA', 'ZURICH', 'REALE', 'CASER', 'LINEA DIRECTA', 'PELAYO')) return 'seguro'
  if (has('NOMINA', 'NÓMINA', 'PAGA EXTRA', 'SALARIO', 'PAGO DE NOMINA')) return 'nomina'
  if (has('AEAT', 'AGENCIA TRIBUTARIA', 'HACIENDA', 'IMPUEST', 'IRPF', 'TRIBUTARI', 'RECAUDACION', 'RECAUDACIÓN', 'AYUNTAMIEN', ' IBI ', 'CONTRIBUCION', 'PLUSVALIA', 'TGSS', 'SEGURIDAD SOCIAL', 'TESOR. GRAL', 'TESORERIA GENERAL', 'MODELO 3', 'TASA ')) return 'impuestos'
  if (has('PRESTAMO', 'PRÉSTAMO', 'AMORTIZAC', 'CUOTA PREST', 'HIPOTECA', 'FINANCIAC', 'LEASING')) return 'prestamo'
  if (has('COMISION', 'COMISIÓN', 'COMIS.', 'MANTENIMIENTO CUENTA', 'CUOTA TARJETA', 'GASTOS ADMIN')) return 'comision_bancaria'
  if (has('ALQUILER', 'ARRENDAMIENT', 'RENTA MENSUAL')) return 'alquiler'
  if (has('ENDESA', 'IBERDROLA', 'NATURGY', 'REPSOL', 'MOVISTAR', 'VODAFONE', 'ORANGE', 'FINETWORK', 'TELEFONICA', 'JAZZTEL', 'MASMOVIL', 'EMASESA', 'CANAL ISABEL', 'GAS NATURAL', 'SUMINISTRO', 'ELECTRIC', 'FACTURA DE AGUA', 'FACTURA LUZ', 'FACTURA GAS')) return 'suministros'
  if (has('BIZUM')) return importe >= 0 ? 'cobro_cliente' : 'transferencia'
  if (has('TRANSFERENCIA', 'TRASPASO', 'ABONO POR TRANSF', 'TRANSF ')) return importe >= 0 ? 'cobro_cliente' : 'transferencia'
  if (has('PAGO RECIBO 466', 'TARJ.CRDTO', 'TARJ CRDTO')) return 'transferencia'   // liquidación de tarjeta
  if (has('TARJETA', 'TARJ.', 'COMPRA EN', 'PAGO EN ', 'PAGO TARJETA', 'COMERCIO')) return 'tarjeta'
  if (has('RECIBO', 'ADEUDO', 'SEPA', 'DOMICILIAC', 'CUOTA ')) return 'proveedor'
  return null
}

// Analiza los movimientos sin categorizar de una cuenta (scoped por cuenta_id). Primero
// aplica REGLAS deterministas (instantáneo, sin IA) y solo manda a la IA lo que no encaja,
// en sub-lotes pequeños (así apenas toca el cupo gratuito de NIM). Idempotente (analizado_at).
const TAM_LOTE_IA = 25

async function guardarCategoria(cuentaId: string, id: string, c: Categorizacion, destino: Destino): Promise<number> {
  const res = await prisma.$executeRaw`
    UPDATE movimientos_bancarios
    SET categoria = ${c.categoria}, concepto_normalizado = ${c.conceptoNormalizado},
        categoria_pgc = ${c.categoriaPgc}, requiere_revision = ${c.requiereRevision},
        destino = ${destino}, analizado_at = now()
    WHERE id = ${id}::uuid
      AND cuenta_bancaria_id IN (SELECT id FROM cuentas_bancarias WHERE cuenta_id = ${cuentaId}::uuid)
  `
  return Number(res)
}

type MovPend = { id: string; concepto: string | null; contraparte: string | null; importe: unknown; banco: string | null }

export async function analizarMovimientos(cuentaId: string, limite = 400): Promise<{ categorizados: number }> {
  const pendientes = await prisma.$queryRaw<MovPend[]>`
    SELECT mb.id, mb.concepto, mb.contraparte, mb.importe, cb.banco
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid AND mb.analizado_at IS NULL
    ORDER BY mb.fecha_operacion DESC NULLS LAST
    LIMIT ${limite}
  `
  if (pendientes.length === 0) return { categorizados: 0 }

  // Reglas de destino APRENDIDAS por el dueño (clave de referencia → negocio). Tienen prioridad
  // sobre la detección automática: así p.ej. la pensión que llega con el DNI como referencia va
  // sola a 'personal' en vez de colarse en 'seguros'. El código vive en BD, no en el repo.
  const reglasRows = await prisma.$queryRaw<Array<{ clave: string; destino: string }>>`
    SELECT clave, destino FROM banca_destino_reglas WHERE cuenta_id = ${cuentaId}::uuid
  `
  const reglas = new Map(reglasRows.map(r => [r.clave, r.destino as Destino]))

  // El destino (negocio) se decide por reglas aprendidas y, si no, por la detección automática.
  const destinoDe = new Map(pendientes.map(p => {
    const aprendido = reglas.get(claveReferencia(p.concepto) ?? '')
    return [p.id, aprendido ?? clasificarDestino(p.banco, p.concepto, p.contraparte, Number(p.importe))]
  }))
  let n = 0
  const paraIA: MovPend[] = []

  // 1) Reglas deterministas — sin IA, al instante.
  for (const p of pendientes) {
    const cat = categorizarPorReglas(p.concepto, p.contraparte, Number(p.importe))
    if (cat) {
      n += await guardarCategoria(cuentaId, p.id, {
        id: p.id, categoria: cat,
        conceptoNormalizado: (p.concepto || p.contraparte || '').slice(0, 80),
        categoriaPgc: pgcDe(cat), requiereRevision: false,
      }, destinoDe.get(p.id) ?? 'personal')
    } else {
      paraIA.push(p)
    }
  }

  // 2) IA solo para lo ambiguo, en sub-lotes, persistiendo lote a lote.
  for (let i = 0; i < paraIA.length; i += TAM_LOTE_IA) {
    const trozo = paraIA.slice(i, i + TAM_LOTE_IA)
    const cats = await categorizarLote(
      trozo.map(p => ({ id: p.id, concepto: p.concepto, contraparte: p.contraparte, importe: Number(p.importe) })),
    )
    for (const c of cats) n += await guardarCategoria(cuentaId, c.id, c, destinoDe.get(c.id) ?? 'personal')
  }
  return { categorizados: n }
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
