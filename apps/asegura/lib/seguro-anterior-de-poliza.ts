// El seguro anterior que una póliza de la cartera ya sabe de sí misma (07/10/2026).
// Al abrir el riesgo de una póliza para retarificarla, la pantalla de precio no debe pedir a mano su
// compañía, nº ni periodo. Puro y sin E/S. Tres estados: dato que la póliza no tiene = `null`/ausente;
// nunca se inventa una fecha, ni siniestros/bonus (eso solo lo da el documento o el declarado).
import { seguroAnteriorDe, type SeguroAnterior } from '@central/module-seguros'

export type PolizaParaAnterior = {
  aseguradora: string | null
  numeroPoliza: string | null
  codigoDgs: string | null
  /** aaaa-mm-dd o null. */
  fechaInicio: string | null
  fechaVencimiento: string | null
  /** Solo auto/moto: la matrícula de ESA póliza. */
  matricula: string | null
}

export type PolizaCompetencia = {
  aseguradora?: string
  numeroPoliza?: string
  seguroAnterior?: SeguroAnterior
}

function limpio(s: string | null): string | null {
  const t = typeof s === 'string' ? s.trim() : ''
  return t === '' ? null : t
}

/**
 * Lo que va en `oportunidades.poliza_competencia` (clave `aseguradora` + `seguroAnterior`) y en
 * `numero_poliza`. `null` = la póliza no aporta nada utilizable (no se escribe nada).
 */
export function competenciaDePoliza(p: PolizaParaAnterior): { poliza: PolizaCompetencia; numeroPoliza: string | null } | null {
  const aseguradora = limpio(p.aseguradora)
  const numeroPoliza = limpio(p.numeroPoliza)
  const sa = seguroAnteriorDe({
    codigoDgs: p.codigoDgs,
    fechaEfecto: p.fechaInicio,
    fechaVencimiento: p.fechaVencimiento,
    numeroPoliza,
    matricula: p.matricula,
    // aniosSinSiniestros / siniestrosUltimos5: la póliza no los dice → no se mandan (null).
  })
  if (!aseguradora && !numeroPoliza && !sa) return null
  return {
    poliza: {
      ...(aseguradora ? { aseguradora } : {}),
      ...(numeroPoliza ? { numeroPoliza } : {}),
      ...(sa ? { seguroAnterior: sa } : {}),
    },
    numeroPoliza,
  }
}
