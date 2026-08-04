// ────────────────────────────────────────────────────────────────────────────
// Tesorería del depósito — capa de app: saca de la BD los compromisos y el
// saldo real, y delega el cálculo en el módulo puro (`planTesoreria`).
//
// POR QUÉ: pujar exige consignar el 5% ANTES, y el dinero queda bloqueado hasta
// después del cierre. De nada sirve detectar la ganga si el día de la subasta
// no hay saldo para el depósito — y ese aviso hay que darlo con semanas, no la
// víspera.
// ────────────────────────────────────────────────────────────────────────────
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { deposito, planTesoreria, type CompromisoDeposito, type PlanTesoreria } from '@central/module-subastas'

/** Estados de seguimiento en los que se piensa pujar de verdad. */
const ESTADOS_ACTIVOS = ['interesado', 'analizando', 'pujando']
/** Un saldo más viejo que esto ya no describe la cuenta: se avisa. */
const DIAS_SALDO_FRESCO = 7

export interface SaldoDisponible {
  /** Suma de los saldos de las cuentas CORRIENTES con saldo conocido. */
  total: number
  /** Cuántas cuentas lo componen. */
  cuentas: number
  /** Saldo más antiguo de los sumados (ISO). `null` si no hay ninguno. */
  masAntiguo: string | null
  /** El saldo más antiguo pasa de `DIAS_SALDO_FRESCO`. */
  desactualizado: boolean
}

/**
 * Dinero realmente disponible para consignar depósitos.
 *
 * Solo cuentas CORRIENTES: las tarjetas no sirven para consignar, y una cuenta
 * sin `saldo_actual` no se cuenta como cero — simplemente no suma (mejor
 * quedarse corto que prometer liquidez que no se ha visto).
 */
export async function saldoDisponible(cuentaId: string, hoy = new Date()): Promise<SaldoDisponible> {
  const filas = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT saldo_actual, saldo_fecha
    FROM cuentas_bancarias
    WHERE cuenta_id = ${cuentaId}::uuid
      AND tipo = 'corriente'
      AND saldo_actual IS NOT NULL
  `)
  let total = 0
  let masAntiguo: string | null = null
  for (const f of filas) {
    total += Number(f.saldo_actual)
    const d = f.saldo_fecha ? new Date(f.saldo_fecha).toISOString().slice(0, 10) : null
    if (d && (masAntiguo == null || d < masAntiguo)) masAntiguo = d
  }
  const limite = new Date(hoy.getTime() - DIAS_SALDO_FRESCO * 86_400_000).toISOString().slice(0, 10)
  return {
    total: Math.round(total * 100) / 100,
    cuentas: filas.length,
    masAntiguo,
    desactualizado: masAntiguo != null && masAntiguo < limite,
  }
}

/**
 * Fila del CORPUS VIVO, no del snapshot.
 *
 * El `subasta` jsonb de `subastas_radar`/`subastas_seguidas` es la foto del día
 * en que se detectó, y esa foto se toma antes de que el enriquecimiento traiga
 * el depósito real de la ficha del BOE. Para dinero manda el corpus de hoy.
 */
function compromisoDe(f: any): CompromisoDeposito {
  // El depósito publicado por el Portal manda; si falta, el 5% legal (art. 647 LEC).
  const pub = f.deposito == null ? null : Number(f.deposito)
  const dep = pub != null && pub > 0 ? pub : deposito(f.valor_subasta == null ? null : Number(f.valor_subasta))
  return {
    dedupeKey: f.dedupe_key,
    etiqueta: f.municipio ?? f.identificador ?? f.dedupe_key,
    deposito: dep ?? 0,
    fechaInicio: f.fecha_inicio ? new Date(f.fecha_inicio).toISOString() : null,
    fechaFin: f.fecha_fin ? new Date(f.fecha_fin).toISOString() : null,
  }
}

const CAMPOS_CORPUS = Prisma.sql`s.dedupe_key, s.identificador, s.municipio, s.deposito, s.valor_subasta, s.fecha_inicio, s.fecha_fin`

/** Compromisos por seguimiento explícito (lo que Alberto ha dicho que le interesa). */
export async function compromisosSeguidas(cuentaId: string): Promise<CompromisoDeposito[]> {
  const filas = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT ${CAMPOS_CORPUS}
    FROM subastas_seguidas ss
    JOIN subastas s ON s.dedupe_key = ss.dedupe_key
    WHERE ss.cuenta_id = ${cuentaId}::uuid
      AND ss.estado = ANY(${ESTADOS_ACTIVOS}::text[])
      AND (s.fecha_fin IS NULL OR s.fecha_fin >= now())
  `)
  return filas.map(compromisoDe)
}

/** Compromisos HIPOTÉTICOS: todo lo que el radar ha detectado y no se ha descartado. */
export async function compromisosRadar(cuentaId: string): Promise<CompromisoDeposito[]> {
  const filas = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT ${CAMPOS_CORPUS}
    FROM subastas_radar r
    JOIN subastas s ON s.dedupe_key = r.dedupe_key
    WHERE r.cuenta_id = ${cuentaId}::uuid
      AND r.descartado = false
      AND (s.fecha_fin IS NULL OR s.fecha_fin >= now())
  `)
  return filas.map(compromisoDe)
}

export interface TesoreriaSubastas {
  /** `seguidas` = compromisos reales; `radar` = simulación de «si pujara en todo». */
  origen: 'seguidas' | 'radar'
  plan: PlanTesoreria
  saldo: SaldoDisponible
}

/**
 * Plan de tesorería de una cuenta.
 *
 * Si no hay nada en seguimiento cae a las del radar y lo marca como tal: la
 * cifra sigue siendo útil («si pujaras en las 4 que han casado necesitarías X»)
 * pero NO se presenta como un compromiso adquirido.
 */
export async function tesoreriaSubastas(cuentaId: string, hoy = new Date()): Promise<TesoreriaSubastas> {
  const [seguidas, saldo] = await Promise.all([compromisosSeguidas(cuentaId), saldoDisponible(cuentaId, hoy)])
  const origen: 'seguidas' | 'radar' = seguidas.length ? 'seguidas' : 'radar'
  const compromisos = seguidas.length ? seguidas : await compromisosRadar(cuentaId)
  const plan = planTesoreria(compromisos, hoy.toISOString().slice(0, 10), saldo.cuentas ? saldo.total : null)
  return { origen, plan, saldo }
}
