// Contrato, cobro, riesgos y beneficiarios de UNA póliza, tal como los manda el
// puerto `/api/operador/poliza` de asegura desde que la ingesta de CIMA los
// guarda (asegura#861/#864, 28/09/2026). Interpretación PURA — la ficha solo pinta.
//
// Reglas (las de `poliza-asegura.ts`):
//  - Asegura vieja que no manda el bloque → `null`, y la ficha lo omite: nunca
//    «sin cobro», «0» ni «no tiene riesgos».
//  - Forma rara → `null` campo a campo, nunca un valor inventado.
//  - 🔒 Nada cifrado llega al navegador: se lee por LISTA BLANCA (una clave
//    `iban` que mandara un asegura con un fallo no se copia) y cualquier texto
//    `v1:…` se descarta. De la cuenta solo se pintan los 4 últimos dígitos.
//  - 🚨 `primaAnualDudosa`: la prima del fichero es la del RECIBO (periodo), no
//    la anual. No se presenta como anual ni se multiplica por las fracciones.

import { etiquetaFormaPago, importeEiac } from '@central/module-seguros'
import { eur } from './dinero.ts'

export type RiesgoFicha = {
  id: string | null
  numeroOrden: string | null
  tipo: string | null
  descripcion: string | null
  inicio: string | null
  fin: string | null
  /** Ya descifrada en asegura (servidor), como la del riesgo principal. */
  direccion: string | null
  direccionIlegible: boolean
  localidad: string | null
  cp: string | null
  matricula: string | null
  marca: string | null
  modelo: string | null
}

export type BeneficiarioFicha = { orden: string | null; descripcion: string | null; prestamo: string | null }

export type ContratoFicha = {
  gestionCobro: string | null
  formaPago: string | null
  ibanUltimos4: string | null
  titularCuentaDistinto: boolean | null
  duracion: string | null
  clasePoliza: string | null
  mediador: { clase: string | null; codigoInterno: string | null; nombre: string | null } | null
  producto: { modalidad: string | null; descripcion: string | null; ramoEntidad: string | null; descripcionRamo: string | null } | null
  moneda: string | null
  regularizable: boolean | null
  riesgos: RiesgoFicha[]
  beneficiarios: BeneficiarioFicha[]
  primaAnualDudosa: boolean | null
  primaTotalFichero: string | null
}

export type FechasContratoFicha = { emision: string | null; efectoActual: string | null; situacion: string | null; solicitud: string | null }

/** Lo nuevo de cada recibo. Todo `null` si asegura no lo manda. */
export type ReciboExtraFicha = {
  idRemesa: string | null
  gestionCobro: string | null
  claseComision: string | null
  baseComision: number | null
  retencionIrpf: number | null
  /** Comisión bruta del recibo (CIMA): la que está en riesgo si se devuelve. `null` = no consta. */
  comisionBruta: number | null
}

type Obj = Record<string, unknown>
const esObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Texto pintable. Un `v1:` es un cifrado: nunca es texto, y no se copia. */
function txt(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' || t.startsWith('v1:') ? null : t
}
function bool(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null
}
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
const algo = (o: Obj) => Object.values(o).some((x) => x !== null && x !== false)

function leerRiesgo(o: Obj): RiesgoFicha | null {
  const r: RiesgoFicha = {
    id: txt(o.id), numeroOrden: txt(o.numeroOrden), tipo: txt(o.tipo), descripcion: txt(o.descripcion),
    inicio: txt(o.inicio), fin: txt(o.fin), direccion: txt(o.direccion), direccionIlegible: o.direccionIlegible === true,
    localidad: txt(o.localidad), cp: txt(o.cp), matricula: txt(o.matricula), marca: txt(o.marca), modelo: txt(o.modelo),
  }
  return algo(r) ? r : null
}

/** `null` = asegura no manda el contrato (versión vieja) o no trae nada legible. */
export function leerContrato(v: unknown): ContratoFicha | null {
  if (!esObj(v)) return null
  const med = esObj(v.mediador) ? { clase: txt(v.mediador.clase), codigoInterno: txt(v.mediador.codigoInterno), nombre: txt(v.mediador.nombre) } : null
  const prod = esObj(v.producto)
    ? { modalidad: txt(v.producto.modalidad), descripcion: txt(v.producto.descripcion), ramoEntidad: txt(v.producto.ramoEntidad), descripcionRamo: txt(v.producto.descripcionRamo) }
    : null
  const u4 = txt(v.ibanUltimos4)
  const c: ContratoFicha = {
    gestionCobro: txt(v.gestionCobro),
    formaPago: txt(v.formaPago),
    ibanUltimos4: u4 !== null && /^\d{4}$/.test(u4) ? u4 : null,
    titularCuentaDistinto: bool(v.titularCuentaDistinto),
    duracion: txt(v.duracion),
    clasePoliza: txt(v.clasePoliza),
    mediador: med && algo(med) ? med : null,
    producto: prod && algo(prod) ? prod : null,
    moneda: txt(v.moneda),
    regularizable: bool(v.regularizable),
    riesgos: Array.isArray(v.riesgos) ? v.riesgos.filter(esObj).map(leerRiesgo).filter((x): x is RiesgoFicha => x !== null) : [],
    beneficiarios: Array.isArray(v.beneficiarios)
      ? v.beneficiarios.filter(esObj).map((b) => ({ orden: txt(b.orden), descripcion: txt(b.descripcion), prestamo: txt(b.prestamo) })).filter((b) => algo(b))
      : [],
    primaAnualDudosa: bool(v.primaAnualDudosa),
    primaTotalFichero: txt(v.primaTotalFichero),
  }
  const vacio = Object.values(c).every((x) => x === null || (Array.isArray(x) && x.length === 0))
  return vacio ? null : c
}

/** `null` = asegura no manda las fechas o no trae ninguna. */
export function leerFechasContrato(v: unknown): FechasContratoFicha | null {
  if (!esObj(v)) return null
  const f = { emision: txt(v.emision), efectoActual: txt(v.efectoActual), situacion: txt(v.situacion), solicitud: txt(v.solicitud) }
  return algo(f) ? f : null
}

export function leerReciboExtra(o: Obj): ReciboExtraFicha {
  return {
    idRemesa: txt(o.idRemesa), gestionCobro: txt(o.gestionCobro), claseComision: txt(o.claseComision),
    baseComision: num(o.baseComision), retencionIrpf: num(o.retencionIrpf), comisionBruta: num(o.comisionBruta),
  }
}

/* ─── Lo que se pinta ──────────────────────────────────────────────────── */

const GESTION_COBRO: Record<string, string> = {
  CO: 'cobra la compañía',
  ME: 'cobra la correduría',
}

/** Código EIAC de gestión del cobro. Uno que no se conoce se enseña tal cual, con su código. */
export function etiquetaGestionCobro(codigo: string | null): string | null {
  if (codigo === null) return null
  return GESTION_COBRO[codigo.toUpperCase()] ?? `código CIMA ${codigo}`
}

/** «•••• 1234» o `null`. Nunca más de 4 dígitos. */
export function cuentaEnmascarada(ultimos4: string | null): string | null {
  return ultimos4 !== null && /^\d{4}$/.test(ultimos4) ? `•••• ${ultimos4}` : null
}

export type Fila = { etiqueta: string; valor: string; nota?: string }

function fecha(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : iso
}

/** Filas del bloque «Contrato». `[]` = no hay nada que pintar → el bloque se omite. */
export function filasContrato(c: ContratoFicha | null, f: FechasContratoFicha | null): Fila[] {
  const out: Fila[] = []
  if (f?.emision) out.push({ etiqueta: 'Emisión', valor: fecha(f.emision) })
  if (f?.efectoActual) out.push({ etiqueta: 'Efecto actual', valor: fecha(f.efectoActual) })
  if (f?.situacion) out.push({ etiqueta: 'Fecha de situación', valor: fecha(f.situacion) })
  if (f?.solicitud) out.push({ etiqueta: 'Solicitud', valor: fecha(f.solicitud) })
  if (c?.producto) {
    const p = c.producto
    const valor = p.descripcion ?? p.modalidad ?? p.descripcionRamo ?? p.ramoEntidad
    if (valor) {
      const nota = [p.descripcion && p.modalidad ? `modalidad ${p.modalidad}` : null, p.descripcionRamo && p.descripcionRamo !== valor ? p.descripcionRamo : null]
        .filter(Boolean).join(' · ')
      out.push({ etiqueta: 'Producto', valor, ...(nota ? { nota } : {}) })
    }
  }
  // Duración y clase son códigos EIAC sin tabla oficial en el repo: tal cual.
  if (c?.duracion) out.push({ etiqueta: 'Duración', valor: c.duracion, nota: 'código CIMA' })
  if (c?.clasePoliza) out.push({ etiqueta: 'Clase de póliza', valor: c.clasePoliza, nota: 'código CIMA' })
  if (c?.mediador) {
    const m = c.mediador
    const valor = m.nombre ?? m.codigoInterno ?? m.clase
    if (valor) out.push({ etiqueta: 'Mediador', valor, ...(m.nombre && m.codigoInterno ? { nota: `código ${m.codigoInterno}` } : {}) })
  }
  if (c?.regularizable === true) out.push({ etiqueta: 'Regularizable', valor: 'sí' })
  if (c?.moneda) out.push({ etiqueta: 'Moneda', valor: c.moneda, nota: 'no es euro: los importes no se pueden leer como euros' })
  return out
}

export type BloqueCobro = { filas: Fila[]; avisoTitular: string | null }

/** Bloque «Cobro». `null` = nada que pintar. El IBAN entero no existe aquí. */
export function bloqueCobro(c: ContratoFicha | null): BloqueCobro | null {
  if (c === null) return null
  const filas: Fila[] = []
  const g = etiquetaGestionCobro(c.gestionCobro)
  if (g) filas.push({ etiqueta: 'Gestión del cobro', valor: g })
  const fp = etiquetaFormaPago(c.formaPago)
  if (fp) filas.push({ etiqueta: 'Forma de pago', valor: fp })
  const cuenta = cuentaEnmascarada(c.ibanUltimos4)
  if (cuenta) filas.push({ etiqueta: 'Cuenta', valor: cuenta })
  // Solo `true` avisa: `null` es «no se pudo comparar», no «es del tomador».
  const avisoTitular = c.titularCuentaDistinto === true ? 'La cuenta es de otra persona, no del tomador.' : null
  if (filas.length === 0 && avisoTitular === null) return null
  return { filas, avisoTitular }
}

export type PrimaPintada = { etiqueta: string; valor: string | null; nota?: string }

/**
 * La tarjeta «Prima» de la cabecera. Con `primaAnualDudosa` NO se presenta como
 * anual: se dice que es la del recibo y por qué, aunque haya otra cifra a mano
 * (una prima anual guardada antes de saber que era dudosa no es de fiar).
 */
export function primaParaPintar(
  p: { prima: number | null; primaAnual: number | null; primaBruta: number | null },
  c: ContratoFicha | null,
): PrimaPintada {
  if (c?.primaAnualDudosa === true) {
    const recibo = importeEiac(c.primaTotalFichero)
    return {
      etiqueta: 'Prima del recibo',
      valor: recibo !== null && recibo > 0 ? eur(recibo) : null,
      nota: 'no anual: la compañía no manda la anualizada',
    }
  }
  return {
    etiqueta: 'Prima',
    valor: p.prima !== null ? eur(p.prima) : null,
    ...(p.primaAnual !== null && p.primaBruta !== null && p.primaAnual !== p.primaBruta
      ? { nota: `neta ${eur(p.primaAnual)} · bruta ${eur(p.primaBruta)}` }
      : {}),
  }
}

/** «01/01/2026 → 01/01/2027», o `null` si no hay ninguna de las dos. */
export function vigenciaRiesgo(r: RiesgoFicha): string | null {
  if (!r.inicio && !r.fin) return null
  return `${r.inicio ? fecha(r.inicio) : '?'} → ${r.fin ? fecha(r.fin) : '?'}`
}

/** Dónde está / qué es el bien del riesgo, sin nada cifrado. `null` = no consta. */
export function lugarRiesgo(r: RiesgoFicha): string | null {
  const vehiculo = [r.matricula, [r.marca, r.modelo].filter(Boolean).join(' ') || null].filter(Boolean).join(' · ')
  const sitio = [r.direccion, [r.cp, r.localidad].filter(Boolean).join(' ') || null].filter(Boolean).join(', ')
  return [vehiculo || null, sitio || null].filter(Boolean).join(' · ') || null
}
