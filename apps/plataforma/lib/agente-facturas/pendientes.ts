// Bandeja de revisión de facturas: listar, confirmar y descartar.
//
// 🚨 Por qué existe este módulo (29/08/2026). El aviso de Telegram enlazaba a
// `/expenses/pendientes` desde el día uno y esa ruta NUNCA se construyó: era un 404. La única
// pantalla de gastos (`/sivra/expenses`) las esconde a propósito (`NOT (revisado = false AND
// origen IS NOT NULL)`). Resultado: 32 facturas y 35.938,20 € atascados, y el motivo de 19 de
// ellas era «Proveedor nuevo, sin regla aprendida» — porque la regla SOLO nace al confirmar, y no
// había dónde confirmar. Un círculo cerrado por una pantalla que faltaba.
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { sugerirDesdeHistorico, type Sugerencia } from './sugerencia-pendiente'
import { fingerprint, huellasDe } from './fingerprint'
import { proveedorParaHuella } from './huella-rescate'
import { reforzarRegla } from './imputar'

/** Cuántas facturas del histórico del proveedor se miran para proponer. */
const HISTORICO_MAX = 12

export interface Pendiente {
  id: string
  fecha: string
  proveedor: string | null
  nif_proveedor: string | null
  numero_factura: string | null
  concepto: string | null
  categoria: string | null
  propiedad: string | null
  base_imponible: number | null
  iva: number | null
  iva_porcentaje: number | null
  total: number
  drive_url: string | null
  origen: string | null
  motivo_revision: string | null
  fingerprint: string | null
  /** Propuesta determinista a partir del histórico del proveedor. Nunca inventa. */
  sugerencia: Sugerencia
  /** Nº de facturas ya revisadas de este mismo proveedor. 0 = de verdad es nuevo. */
  historico: number
  /** Cuántas facturas PENDIENTES hay de este mismo proveedor, esta incluida (mínimo 1). */
  pendientesProveedor: number
}

/**
 * Las facturas que el agente dejó sin imputar, más caras primero.
 *
 * El criterio de «pendiente» es el MISMO que usan `/api/sivra/expenses`, el resumen mensual y las
 * anomalías: `revisado = false AND origen IS NOT NULL`. El `origen IS NOT NULL` distingue lo que
 * metió un agente de lo que se cargó a mano.
 */
export async function listarPendientes(limite = 200): Promise<Pendiente[]> {
  const filas = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id::text, fecha::text, proveedor, nif_proveedor, numero_factura, concepto,
           categoria, propiedad, base_imponible, iva, iva_porcentaje, total,
           drive_url, origen, motivo_revision, fingerprint
    FROM gastos
    WHERE revisado = false AND origen IS NOT NULL
    ORDER BY total DESC NULLS LAST, fecha DESC
    LIMIT ${limite}
  `)
  if (filas.length === 0) return []

  // Histórico YA REVISADO de los proveedores implicados, en UNA consulta (no N+1).
  //
  // 🚨 Se pregunta por TODAS las huellas del proveedor, no solo por la que lleva escrita la fila.
  // El mismo proveedor queda registrado bajo su NIF o bajo su nombre según lo que trajera cada
  // PDF (ver `huellasDe`), así que mirar una sola hacía que la bandeja dijese «sin histórico»
  // sobre proveedores con facturas ya aprobadas — el «Anthropic, PBC» de Alberto (29/08/2026).
  const huellasFila = new Map<string, string[]>()
  for (const f of filas) {
    const hs = [...new Set([
      ...(f.fingerprint ? [f.fingerprint as string] : []),
      ...huellasDe({ nif_proveedor: f.nif_proveedor, proveedor: f.proveedor, concepto: f.concepto }),
    ])]
    huellasFila.set(f.id, hs)
  }
  const huellas = [...new Set([...huellasFila.values()].flat())]
  const historico = huellas.length
    ? await prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT fingerprint, propiedad, categoria
        FROM (
          SELECT fingerprint, propiedad, categoria,
                 row_number() OVER (PARTITION BY fingerprint ORDER BY fecha DESC) AS rn
          FROM gastos
          WHERE revisado = true AND fingerprint IN (${Prisma.join(huellas)})
        ) t WHERE rn <= ${HISTORICO_MAX}
      `)
    : []

  const porHuella = new Map<string, Array<{ propiedad: string | null; categoria: string | null }>>()
  for (const h of historico) {
    const arr = porHuella.get(h.fingerprint) ?? []
    arr.push({ propiedad: h.propiedad, categoria: h.categoria })
    porHuella.set(h.fingerprint, arr)
  }

  // Cuántas pendientes hay por proveedor: es lo que permite ofrecer «confirma las N de golpe».
  // Se cuenta sobre las filas ya traídas (mismo criterio de pendiente, sin otra consulta).
  const pendientesPorHuella = new Map<string, number>()
  for (const f of filas) {
    for (const h of huellasFila.get(f.id) ?? []) {
      pendientesPorHuella.set(h, (pendientesPorHuella.get(h) ?? 0) + 1)
    }
  }

  return filas.map((f) => {
    // Se juntan los históricos de todas las huellas de ese proveedor.
    const hist = (huellasFila.get(f.id) ?? []).flatMap((h) => porHuella.get(h) ?? [])
    return {
      ...f,
      base_imponible: f.base_imponible == null ? null : Number(f.base_imponible),
      iva: f.iva == null ? null : Number(f.iva),
      iva_porcentaje: f.iva_porcentaje == null ? null : Number(f.iva_porcentaje),
      total: Number(f.total ?? 0),
      sugerencia: sugerirDesdeHistorico({ categoria: f.categoria }, hist),
      historico: hist.length,
      // Máximo entre sus huellas: dos filas del mismo proveedor pueden llevar huellas distintas
      // y solo comparten una de ellas.
      pendientesProveedor: Math.max(1, ...(huellasFila.get(f.id) ?? []).map((h) => pendientesPorHuella.get(h) ?? 0)),
    } as Pendiente
  })
}

export interface CambiosPendiente {
  categoria?: string | null
  propiedad?: string | null
}

/**
 * Confirma una factura: la da por contabilizada y APRENDE la regla.
 *
 * El refuerzo de la regla es la mitad del trabajo: es lo que hace que la próxima factura del mismo
 * proveedor se impute sola. `reforzarRegla` sube `vistas` en cada confirmación y desde el
 * 29/08/2026 `evaluar()` exige `vistas >= 1`, así que ESTA confirmación ya abre la puerta.
 *
 * Devuelve `false` si la fila no existía o ya estaba revisada (no se re-refuerza la regla: contar
 * dos veces la misma confirmación falsearía el historial que decide la auto-imputación).
 */
export async function confirmarPendiente(id: string, cambios: CambiosPendiente = {}): Promise<boolean> {
  const [fila] = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id::text, fecha::text, proveedor, nif_proveedor, categoria, propiedad, concepto,
           iva_porcentaje, irpf_porcentaje, total, fingerprint
    FROM gastos
    WHERE id = ${id}::uuid AND revisado = false AND origen IS NOT NULL
    LIMIT 1
  `)
  if (!fila) return false

  // `undefined` = «no lo toques»; `null` = «déjalo vacío a propósito» (correduría, sin piso).
  const categoria = cambios.categoria === undefined ? fila.categoria : (cambios.categoria || null)
  const propiedad = cambios.propiedad === undefined ? fila.propiedad : (cambios.propiedad || null)

  await prisma.$executeRaw(Prisma.sql`
    UPDATE gastos
    SET revisado = true, motivo_revision = NULL, categoria = ${categoria}, propiedad = ${propiedad}
    WHERE id = ${id}::uuid
  `)

  // 🚨 Si la fila no trae huella, se CALCULA aquí en vez de renunciar a aprender.
  //
  // Hasta el 29/08/2026 esto era `if (fila.fingerprint)` a secas, y en `gastos` había 47 filas ya
  // revisadas sin huella (13.267,14 €) entre las que estaban las cinco facturas de Lavandería El
  // Giraldillo que Alberto había aprobado: cinco confirmaciones suyas que no enseñaron nada, y una
  // bandeja que seguía diciéndole «sin histórico». `proveedorParaHuella` devuelve `null` cuando el
  // proveedor es un centinela ('Importado') y no hay forma fiable de sacarlo del concepto — ahí sí
  // se renuncia, porque una huella inventada AGRUPA proveedores distintos y propaga su regla.
  const proveedorHuella = proveedorParaHuella({ proveedor: fila.proveedor, concepto: fila.concepto })
  const fp = fila.fingerprint || (proveedorHuella
    ? fingerprint({ nif_proveedor: fila.nif_proveedor, proveedor: proveedorHuella, concepto: fila.concepto })
    : null)

  if (fp) {
    if (!fila.fingerprint) {
      // Se persiste para que la fila deje de ser invisible al histórico y al dedup.
      await prisma.$executeRaw(Prisma.sql`UPDATE gastos SET fingerprint = ${fp} WHERE id = ${id}::uuid`)
    }
    await reforzarRegla({
      fecha: fila.fecha,
      proveedor: fila.proveedor,
      nif_proveedor: fila.nif_proveedor,
      categoria: categoria ?? 'OTRO',
      propiedad,
      iva_porcentaje: fila.iva_porcentaje == null ? null : Number(fila.iva_porcentaje),
      irpf_porcentaje: fila.irpf_porcentaje == null ? null : Number(fila.irpf_porcentaje),
      total: Number(fila.total ?? 0),
      fingerprint: fp,
    }).catch(() => {})
  }
  return true
}

/**
 * Confirma TODAS las pendientes del mismo proveedor con la misma clasificación.
 *
 * Petición de Alberto (29/08/2026): «cuando es el mismo proveedor, en el momento que resuelvo uno
 * todo es igual». Es cierto para los proveedores recurrentes que llenan la bandeja —la limpieza
 * mensual de Si que Brilla, la lavandería, el hosting—: doce facturas idénticas salvo el mes.
 * Confirmarlas de una en una es el trabajo que esta pantalla existe para quitar.
 *
 * 🚨 Sigue siendo una acción EXPLÍCITA, con su propio botón y el número delante. No se aplica
 * sola al confirmar una: hay proveedores cuyas facturas NO son equivalentes (una reparación es de
 * UN piso concreto, no de todos), y una cascada silenciosa metería ese error en varias filas a la
 * vez y encima lo dejaría dentro de la regla aprendida.
 *
 * Devuelve los ids confirmados. Si la factura de partida no existe o ya estaba revisada,
 * devuelve `null` (nada que confirmar), igual que `confirmarPendiente`.
 */
export async function confirmarProveedor(id: string, cambios: CambiosPendiente = {}): Promise<string[] | null> {
  const [origen] = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id::text, fingerprint
    FROM gastos
    WHERE id = ${id}::uuid AND revisado = false AND origen IS NOT NULL
    LIMIT 1
  `)
  if (!origen) return null

  // Sin huella no hay «mismo proveedor» que valga: se confirma solo la de partida. Agrupar por
  // nombre sería adivinar (el mismo proveedor se escribe de tres formas distintas en el corpus).
  const hermanas: string[] = origen.fingerprint
    ? (await prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT id::text FROM gastos
        WHERE revisado = false AND origen IS NOT NULL AND fingerprint = ${origen.fingerprint}
        ORDER BY fecha ASC
      `)).map((r) => r.id)
    : [origen.id]

  const hechas: string[] = []
  for (const hid of hermanas) {
    // Se reutiliza `confirmarPendiente` a propósito: es quien mantiene el invariante de refuerzo
    // de la regla y el «no re-reforzar lo ya revisado». Duplicar ese UPDATE aquí sería la forma
    // habitual de que las dos ramas se separen con el tiempo.
    if (await confirmarPendiente(hid, cambios)) hechas.push(hid)
  }
  return hechas
}

/**
 * Descarta una factura que no es un gasto nuestro (ajena, duplicada, un contrato leído como
 * factura…). Se BORRA en vez de marcarse revisada: dejarla revisada la contaría como gasto.
 */
export async function descartarPendiente(id: string): Promise<boolean> {
  const n = await prisma.$executeRaw(Prisma.sql`
    DELETE FROM gastos WHERE id = ${id}::uuid AND revisado = false AND origen IS NOT NULL
  `)
  return n > 0
}
