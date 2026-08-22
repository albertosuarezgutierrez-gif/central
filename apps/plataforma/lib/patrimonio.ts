// Acceso a la base patrimonial (patrimonio_activos + patrimonio_valoraciones) y composición
// del resumen para /patrimonio. La lógica de titulares vive en lib/patrimonio-resumen.ts
// (pura, testeada); aquí solo se lee la BD y se compone con liquidez + bróker.
//
// Tablas: prisma/sql/2026-08-22_patrimonio.sql (raw SQL, no están en schema.prisma).
// Diseño: docs/superpowers/specs/2026-08-22-patrimonio-cfo-design.md.
import { prisma } from '@/lib/db'
import { getSaldoConsolidado } from '@/lib/banca'
import { getBrokerSaldos } from '@/lib/broker'
import {
  resumenPatrimonio, preguntasIntake, estadoActivo,
  type ActivoPatrimonio, type ResumenPatrimonio, type EstadoActivo, type ValoracionVigente,
} from '@/lib/patrimonio-resumen'

export type ActivoConEstado = ActivoPatrimonio & {
  direccion: string | null
  uso: string | null
  notas: string | null
  estadoValor: EstadoActivo
  /** Todas las valoraciones vigentes por enfoque (la dual vivienda/vut, si existe). */
  valoraciones: ValoracionVigente[]
}

const num = (v: unknown): number | null => (v == null ? null : Number(v))

type FilaActivo = {
  id: string; nombre: string; tipo: string; tenencia: string; uso: string | null
  direccion: string | null; ref_catastral: string | null; m2: unknown; notas: string | null
  pct_titular: unknown; pct_conyuge: unknown; valor_adquisicion: unknown
  hipoteca_capital_pendiente: unknown; hipoteca_cuota_mensual: unknown
  licencia_vut: boolean | null; licencia_vut_num: string | null
}

// Activos vivos de la cuenta con su valoración vigente por enfoque (DISTINCT ON fecha desc).
export async function getActivos(cuentaId: string): Promise<ActivoConEstado[]> {
  const filas = await prisma.$queryRaw<Array<FilaActivo>>`
    SELECT id, nombre, tipo, tenencia, uso, direccion, ref_catastral, m2, notas,
           pct_titular, pct_conyuge, valor_adquisicion,
           hipoteca_capital_pendiente, hipoteca_cuota_mensual, licencia_vut, licencia_vut_num
    FROM patrimonio_activos
    WHERE cuenta_id = ${cuentaId}::uuid AND estado = 'activo'
    ORDER BY tenencia, nombre
  `
  const vals = await prisma.$queryRaw<Array<{
    activo_id: string; enfoque: string; valor: unknown; fecha: Date
    fuente: string; metodo: string | null
  }>>`
    SELECT DISTINCT ON (pv.activo_id, pv.enfoque)
           pv.activo_id, pv.enfoque, pv.valor, pv.fecha, pv.fuente, pv.metodo
    FROM patrimonio_valoraciones pv
    JOIN patrimonio_activos a ON a.id = pv.activo_id
    WHERE a.cuenta_id = ${cuentaId}::uuid
    ORDER BY pv.activo_id, pv.enfoque, pv.fecha DESC, pv.created_at DESC
  `
  const porActivo = new Map<string, ValoracionVigente[]>()
  for (const v of vals) {
    const lista = porActivo.get(v.activo_id) ?? []
    lista.push({
      valor: Number(v.valor), enfoque: v.enfoque,
      fecha: v.fecha.toISOString().slice(0, 10), fuente: v.fuente, metodo: v.metodo,
    })
    porActivo.set(v.activo_id, lista)
  }

  return filas.map((f: FilaActivo) => {
    const valoraciones = porActivo.get(f.id) ?? []
    // La vigente «principal» para el neto: la más reciente entre enfoques (la dual completa
    // se pinta aparte). Con vivienda Y vut el neto usa la más fresca — conservador y declarado.
    const vigente = [...valoraciones].sort((a, b) => (a.fecha < b.fecha ? 1 : -1))[0] ?? null
    const activo: ActivoPatrimonio = {
      id: f.id, nombre: f.nombre, tipo: f.tipo, tenencia: f.tenencia, uso: f.uso,
      m2: num(f.m2), refCatastral: f.ref_catastral,
      pctTitular: num(f.pct_titular), pctConyuge: num(f.pct_conyuge),
      valorAdquisicion: num(f.valor_adquisicion),
      hipotecaCapitalPendiente: num(f.hipoteca_capital_pendiente),
      hipotecaCuotaMensual: num(f.hipoteca_cuota_mensual),
      licenciaVut: f.licencia_vut, licenciaVutNum: f.licencia_vut_num,
      valoracion: vigente,
    }
    return {
      ...activo,
      direccion: f.direccion, uso: f.uso, notas: f.notas,
      estadoValor: estadoActivo(activo), valoraciones,
    }
  })
}

export type Patrimonio = {
  activos: ActivoConEstado[]
  resumen: ResumenPatrimonio
  intake: string[]
}

// Foto completa: activos + neto mínimo declarado (liquidez + bróker + inmuebles − pasivos)
// + preguntas de intake pendientes para Alberto.
export async function getPatrimonio(cuentaId: string): Promise<Patrimonio> {
  const [activos, saldo, brokers] = await Promise.all([
    getActivos(cuentaId),
    getSaldoConsolidado(cuentaId),
    getBrokerSaldos(cuentaId),
  ])
  const broker = brokers.reduce((s, b) => s + b.saldo, 0)
  const resumen = resumenPatrimonio(activos, saldo.total, broker, { cuentasSinSaldo: saldo.sinSaldo })
  return { activos, resumen, intake: preguntasIntake(activos) }
}
