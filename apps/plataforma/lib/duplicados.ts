// Lógica PURA de detección de cargos duplicados (sin BD, testeable en aislamiento). banca.ts
// hace el SQL y delega aquí la clasificación/agrupación. Un "par" es dos movimientos que
// comparten importe + contraparte en ±4 días; varios pares del mismo importe/contraparte se
// consolidan en un "grupo" que el dueño resuelve de una vez.

export type DupMovimiento = { id: string; fecha: string | null; concepto: string; importe: number; conciliado: boolean; origen?: string; cuentaLabel?: string }
export type DupGrupo = {
  clave: string
  confianza: 'alta' | 'baja'
  importe: number
  superaUmbral: boolean
  movimientos: DupMovimiento[]
}

// Par crudo (a,b) tal como lo devuelve el SQL de detección.
export type DupPar = {
  id: string; otroId: string
  concepto: string; otroConcepto: string
  importe: number
  fecha: string | null; otroFecha: string | null
  conciliado: boolean; otroConciliado: boolean
  contraparteKey: string
  ocurrenciasContraparte?: number   // F3: nº de cargos de esa contraparte en la ventana
  origenA?: string; origenB?: string
  cuentaLabelA?: string; cuentaLabelB?: string  // para pares cross-cuenta
  conceptoRaw?: string; otroConceptoRaw?: string  // concepto SIN normalizar (para leer nº recibo/expediente)
}

// Códigos identificadores de documento dentro del concepto: nº de recibo/expediente/factura o una
// tirada larga de dígitos. Dos cargos del mismo importe con códigos DISTINTOS son documentos
// distintos (p.ej. 2 recibos de IBI del mismo inmueble: RECIBO…173193 vs …173194), NO un cobro doble.
export function codigosDocumento(concepto: string): string[] {
  const s = (concepto || '').toUpperCase()
  // Tras la keyword, el código DEBE llevar un dígito (si no, capturaría la palabra siguiente, p.ej.
  // "RECIBO EXCMO"→EXCMO). También pilla tiradas de ≥6 dígitos sueltas (nº de recibo sin keyword).
  const re = /(?:RECIBO|EXPTE|EXPEDIENTE|FACTURA|FRA|REF|N[ºO.])\s*[:.]?\s*([A-Z0-9-]*\d[A-Z0-9-]*)|(\d{6,})/g
  const out = new Set<string>()
  for (const m of s.matchAll(re)) {
    const c = (m[1] || m[2] || '').replace(/[^A-Z0-9]/g, '')
    if (c.length >= 5) out.add(c)
  }
  return [...out]
}

// True si AMBOS conceptos llevan códigos de documento y NO comparten ninguno → son documentos
// distintos, así que el par NO es un cobro doble (evita el falso positivo de los 2 recibos de IBI).
// Si a alguno le falta código, no se puede afirmar → devuelve false (sigue el criterio de importe/fecha).
export function codigosDocContradicen(a: string, b: string): boolean {
  const ca = codigosDocumento(a), cb = codigosDocumento(b)
  if (ca.length === 0 || cb.length === 0) return false
  return !ca.some(x => cb.includes(x))
}

// Palabras que delatan un cargo "de sistema" (recibo/transferencia/domiciliación): si dos caen
// el MISMO día con el mismo importe y contraparte, la sospecha de cobro doble es ALTA. Una
// compra en comercio físico repetida en días distintos es ruido normal → BAJA.
const DUP_PALABRAS_ALTA = /RECIBO|TRANSFERENCIA|ADEUDO|DOMICIL|PAGO|CUOTA|LETRA/i

export function clasificarConfianza(concepto: string, mismaFecha: boolean): 'alta' | 'baja' {
  return mismaFecha && DUP_PALABRAS_ALTA.test(concepto || '') ? 'alta' : 'baja'
}

// El banner solo grita por lo que merece la pena: cualquier sospecha ALTA, o las de BAJA cuyo
// importe supera el umbral (env DUP_UMBRAL_BANNER, por defecto 5 €). Así los micro-gastos
// recurrentes (el pan de 3 €) no disparan el aviso, pero siguen visibles en la página.
export function superaUmbralBanner(importe: number, confianza: 'alta' | 'baja', umbral: number): boolean {
  return confianza === 'alta' || Math.abs(importe) >= umbral
}

// Una contraparte es "recurrente conocida" si aparece de forma sostenida (≥2 cargos/mes). Sus
// pares duplicados se degradan a confianza baja para que no molesten en el banner (F3).
export function esRecurrente(ocurrencias: number, dias: number): boolean {
  const meses = Math.max(dias / 30, 1)
  return ocurrencias / meses >= 2
}

export const DUP_UMBRAL_BANNER = Number(process.env.DUP_UMBRAL_BANNER ?? 5)

// Consolida los pares crudos en grupos por (importe|contraparte), deduplicando movimientos, y
// clasifica confianza + umbral. Si la contraparte es recurrente, fuerza confianza baja.
export function agruparDuplicados(pares: DupPar[], umbral = DUP_UMBRAL_BANNER): DupGrupo[] {
  type Acc = { clave: string; importe: number; concepto: string; mismaFecha: boolean; recurrente: boolean; movs: Map<string, DupMovimiento> }
  const grupos = new Map<string, Acc>()
  for (const p of pares) {
    // Descarta el par si los dos conceptos llevan códigos de documento DISTINTOS (2 recibos reales
    // del mismo importe, no un cobro doble). Usa el concepto sin normalizar si está disponible.
    if (codigosDocContradicen(p.conceptoRaw ?? p.concepto, p.otroConceptoRaw ?? p.otroConcepto)) continue
    const clave = `${p.importe}|${(p.contraparteKey || '').trim().toUpperCase()}`
    const g: Acc = grupos.get(clave) ?? { clave, importe: p.importe, concepto: p.concepto || p.contraparteKey || 'Movimiento', mismaFecha: false, recurrente: false, movs: new Map() }
    if (p.fecha && p.fecha === p.otroFecha) g.mismaFecha = true
    if (p.ocurrenciasContraparte != null && esRecurrente(p.ocurrenciasContraparte, 60)) g.recurrente = true
    g.movs.set(p.id, { id: p.id, fecha: p.fecha, concepto: p.concepto || g.concepto, importe: p.importe, conciliado: p.conciliado, origen: p.origenA, cuentaLabel: p.cuentaLabelA })
    g.movs.set(p.otroId, { id: p.otroId, fecha: p.otroFecha, concepto: p.otroConcepto || g.concepto, importe: p.importe, conciliado: p.otroConciliado, origen: p.origenB, cuentaLabel: p.cuentaLabelB })
    grupos.set(clave, g)
  }
  return [...grupos.values()].map(g => {
    const confianza = g.recurrente ? 'baja' : clasificarConfianza(g.concepto, g.mismaFecha)
    return {
      clave: g.clave,
      confianza,
      importe: g.importe,
      superaUmbral: superaUmbralBanner(g.importe, confianza, umbral),
      movimientos: [...g.movs.values()].sort((x, y) => (y.fecha || '').localeCompare(x.fecha || '')),
    }
  }).sort((a, b) => (a.confianza === b.confianza ? Math.abs(b.importe) - Math.abs(a.importe) : a.confianza === 'alta' ? -1 : 1))
}
