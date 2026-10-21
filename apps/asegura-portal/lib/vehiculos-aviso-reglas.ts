/**
 * Los vehículos que alimentan el aviso AUTOMÁTICO de ITV de la campana (21/10/2026): la parte PURA de
 * `vehiculos-aviso.ts` (sin Prisma, para poder probarla).
 *
 * 🚨 Reglas:
 *  - Solo pólizas PROPIAS en vigor (`cuentaComoEnVigor`) y declaradas sin vencimiento pasado: quien vendió el
 *    coche no quiere un aviso de su ITV. Una declarada sin vencimiento (no se sabe) SÍ entra.
 *  - La matriculación es la de la compañía o la que declaró la persona; la estimada por la matrícula NO cuenta
 *    (el aviso es más serio que una sugerencia editable). Sin ella no hay aviso.
 *  - Un vehículo con recordatorio propio de ITV ya tiene su aviso: no se duplica.
 */
import { vehiculoCubiertoPorRecordatorio, type RecordatorioParaDedup, type VehiculoParaAviso } from '@central/module-seguros-portal'

export type PolizaPropiaParaVehiculo = {
  id: string
  ramo: string
  /** `cuentaComoEnVigor(p)`, ya calculado por quien llama. */
  enVigor: boolean
  bien: { cosa: string | null; matricula: string | null; fechaMatriculacion?: string | null }
}

export type DeclaradaParaVehiculo = {
  id: string
  ramo: string | null
  matricula: string | null
  /** `YYYY-MM-DD` o `null`. */
  fechaMatriculacion: string | null
  /** `YYYY-MM-DD` o `null` (= no se sabe). */
  fechaVencimiento: string | null
}

export function vehiculosParaAviso(x: {
  propias: readonly PolizaPropiaParaVehiculo[]
  declaradas: readonly DeclaradaParaVehiculo[]
  recordatorios: readonly RecordatorioParaDedup[]
  /** `YYYY-MM-DD` de hoy (Madrid). */
  hoy: string
}): VehiculoParaAviso[] {
  const out: VehiculoParaAviso[] = []
  for (const p of x.propias) {
    if (!p.enVigor) continue
    out.push({ id: `cartera:${p.id}`, ramo: p.ramo, matricula: p.bien.matricula, cosa: p.bien.cosa, fechaMatriculacion: p.bien.fechaMatriculacion ?? null })
  }
  for (const d of x.declaradas) {
    if (d.fechaVencimiento !== null && d.fechaVencimiento < x.hoy) continue
    out.push({ id: `declarada:${d.id}`, ramo: d.ramo, matricula: d.matricula, cosa: null, fechaMatriculacion: d.fechaMatriculacion })
  }
  return out.filter((v) => !vehiculoCubiertoPorRecordatorio(v, x.recordatorios))
}
