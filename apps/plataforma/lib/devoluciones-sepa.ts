// Emparejado PURO de una DEVOLUCIÓN de adeudo directo SEPA (recibo domiciliado devuelto) con su
// cargo original en la MISMA cuenta corriente. Cuando un recibo se devuelve, el banco genera dos
// apuntes con la MISMA referencia "N <número>": el cargo ("ADEUDO A SU CARGO // ... SEPA // N <ref>
// <acreedor>") y el abono de anulación ("ANULACION ADEUDOS DIRECTOS // OTROS // N <ref>"). Netean a
// 0 → no son gasto/ingreso real. Emparejarlos permite copiarle al abono el destino del cargo (se
// anulan dentro del mismo negocio) y sacar ambos de las bandejas «por revisar».
//
// Distinto de devoluciones-tarjeta.ts (que casa por comercio+importe en extractos de TARJETA): aquí
// la clave es la REFERENCIA común del adeudo, que el banco repite en ambos apuntes. Sin BD ni '@/':
// la parte de BD vive en lib/categorizar.ts::casarDevolucionesSepa. Testeable con `node --test`.

export interface CargoSepa {
  id: string
  importe: number        // negativo (el cargo del recibo)
  ref: string | null     // referencia "N <número>" extraída del concepto
  destino: string | null // negocio ya clasificado del cargo (lo que se copia al abono)
}

// Extrae la referencia del adeudo SEPA del concepto ("... N 2026198000644355 ...") → los dígitos,
// o null si no la trae. Exige al menos 10 dígitos para no confundir con importes/fechas sueltas.
export function refAdeudoSepa(concepto: string | null): string | null {
  if (!concepto) return null
  const m = concepto.toUpperCase().match(/\bN\s+(\d{10,})\b/)
  return m ? m[1] : null
}

// ¿El concepto es una anulación/devolución de un adeudo directo SEPA? (el abono que revierte el
// cargo). NO casa "ANUL. RECIBO GENERALI" (devolución de una póliza propia, otra cosa).
export function esAnulacionAdeudoSepa(concepto: string | null): boolean {
  if (!concepto) return false
  return /ANULACI[OÓ]N\s+(DE\s+)?ADEUDOS?\s+DIRECTOS?|DEVOLUCI[OÓ]N\s+(DE\s+)?ADEUDOS?\s+DIRECTOS?/i.test(concepto)
}

// Dado un abono de anulación (importe>0 con su referencia) y los cargos candidatos de la misma
// cuenta, encuentra el cargo con la MISMA referencia e importe opuesto que YA tenga destino, para
// copiárselo. Devuelve { id, destino } del cargo, o null si no hay match fiable.
export function casarDevolucionSepa(
  abono: { importe: number; ref: string | null },
  cargos: CargoSepa[],
): { id: string; destino: string } | null {
  if (!abono.ref) return null
  const m = cargos.find(c =>
    c.ref === abono.ref &&
    !!c.destino &&
    Math.abs(Math.abs(c.importe) - Math.abs(abono.importe)) < 0.005,
  )
  return m && m.destino ? { id: m.id, destino: m.destino } : null
}
