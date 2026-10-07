// El seguro anterior que una póliza de la cartera ya sabe de sí misma (07/10/2026).
// Al abrir el riesgo de una póliza para retarificarla, la pantalla de precio no debe pedir a mano su
// compañía, nº ni periodo. Puro y sin E/S. Tres estados: dato que la póliza no tiene = `null`/ausente;
// nunca se inventa una fecha, ni siniestros/bonus (eso solo lo da el documento o el declarado).
import { esCarteraEnVigor, seguroAnteriorDe, type SeguroAnterior } from '@central/module-seguros'

export type PolizaParaAnterior = {
  aseguradora: string | null
  numeroPoliza: string | null
  codigoDgs: string | null
  /** aaaa-mm-dd o null. */
  fechaVencimiento: string | null
  /** Solo auto/moto: la matrícula de ESA póliza. */
  matricula: string | null
  /** Para decidir si está viva (`esCarteraEnVigor`): una anulada/cancelada/sustituida NO es seguro anterior. */
  importRef: string | null
  eiacXmlHash: string | null
  estado: string | null
  sustituidaAt?: unknown
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
 * Efecto del periodo vigente = vencimiento − 1 año (mismo día/mes; 29-feb → 28-feb). La fecha de alta de la póliza
 * NO sirve: es el alta original, no el efecto del periodo (haría descartar la prima por «posible plurianual»).
 */
function efectoDeVencimiento(v: string | null): string | null {
  const m = typeof v === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(v) : null
  if (!m) return null
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const d = new Date(Date.UTC(anio, mes - 1, dia))
  if (d.getUTCFullYear() !== anio || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null
  const dd = mes === 2 && dia === 29 ? 28 : dia
  return `${String(anio - 1).padStart(4, '0')}-${m[2]}-${String(dd).padStart(2, '0')}`
}

/**
 * Lo que va en `oportunidades.poliza_competencia` (clave `aseguradora` + `seguroAnterior`) y en
 * `numero_poliza`. `null` = la póliza no aporta nada utilizable (no se escribe nada).
 */
export function competenciaDePoliza(p: PolizaParaAnterior): { poliza: PolizaCompetencia; numeroPoliza: string | null } | null {
  // Criterio del corredor (07/10/2026): la bonificación es del tomador y una póliza ANULADA (p. ej. por
  // siniestralidad) no se propone como seguro anterior; se elige en el desplegable. Solo se precarga si está viva.
  if (!esCarteraEnVigor({ importRef: p.importRef, eiacXmlHash: p.eiacXmlHash, estado: p.estado, sustituidaAt: p.sustituidaAt })) return null
  const aseguradora = limpio(p.aseguradora)
  const numeroPoliza = limpio(p.numeroPoliza)
  const sa = seguroAnteriorDe({
    codigoDgs: p.codigoDgs,
    fechaEfecto: efectoDeVencimiento(p.fechaVencimiento),
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
