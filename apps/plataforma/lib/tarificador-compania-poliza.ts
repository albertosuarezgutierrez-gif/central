// Compañía anterior que el cliente ya tiene en la CARTERA (19/10/2026). PURO: sin red ni envs (`node --test`, y 'use client').
//
// Hueco: el riesgo/lead no trae «compañía anterior» pero el cliente tiene una póliza de coche EN VIGOR en la cartera (la compañía
// la sabemos por ella). Allianz y Mapfre bloqueaban el botón pidiéndola. Aquí se PROPONE sola si hay UNA compañía candidata; con
// varias distintas no se adivina (el bloqueo se mantiene y lo dice). «En vigor» = `esCarteraEnVigor` (nunca `clientes.tipo`),
// igual que `tienePolizaAllianzEnVigor`. Tres estados: `pendiente` (no se han leído las pólizas) · `sin_poliza` · dato.
import { esCarteraEnVigor } from '@central/module-seguros'

/** Lo mínimo de `PolizaFicha` que hace falta (columnas no personales). */
export type PolizaParaCompaniaPoliza = {
  tipo: string
  aseguradora: string | null | undefined
  estado: string | null | undefined
  /** Cartera VIVA (`esCarteraViva`). */
  viva: boolean
  /** CIMA la trajo: una emitida por nosotros y aún sin confirmar no cuenta. */
  confirmadaCima: boolean
  /** Otra póliza la sustituye: ya no está en vigor. */
  sustituida: boolean
  matricula?: string | null
}

export type CompaniaPorPolizas =
  | { estado: 'pendiente' }
  | { estado: 'sin_poliza' }
  | { estado: 'dato'; compania: string }
  | { estado: 'varias'; companias: string[] }

/** Valores de cajón que NO son una compañía (misma lista que `companiaAnteriorDeRiesgo`). */
const CAJON = new Set(['otro', 'otra', 'otros', 'n/a', 'na', 'ninguna', 'ninguno', 'desconocida', 'desconocido', 'no consta', 'sin datos', '-', '?'])
/** Tope del validador del formulario (`MAX_COMPANIA_ANTERIOR`): por encima el trabajo se tumba, así que no se propone. */
const MAX = 80
const PROHIBIDOS = /[<>{}\[\]\\`$]|[\u0000-\u001f]/

const norm = (m: string | null | undefined): string => (m ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

function nombreUtil(v: string | null | undefined): string | null {
  const t = (v ?? '').replace(/\s+/g, ' ').trim()
  return t === '' || t.length > MAX || CAJON.has(t.toLowerCase()) || PROHIBIDOS.test(t) ? null : t
}

/**
 * Compañía de la(s) póliza(s) de `tipo` en vigor del cliente. `polizas: null` = no se han podido leer → `pendiente` (nunca «no
 * tiene»). Con matrícula del riesgo, las pólizas con OTRA matrícula conocida no cuentan (son otro vehículo); las sin matrícula sí.
 * Una compañía (comparada sin mayúsculas ni espacios) → `dato`; varias distintas → `varias` (no se adivina). PURA.
 */
export function companiaAnteriorDePolizas(polizas: readonly PolizaParaCompaniaPoliza[] | null, opts: { tipo: string; matricula?: string | null }): CompaniaPorPolizas {
  if (polizas === null) return { estado: 'pendiente' }
  const mat = norm(opts.matricula)
  const porClave = new Map<string, string>()
  let enVigorSinNombre = 0
  for (const p of polizas) {
    if (p.tipo !== opts.tipo || !p.confirmadaCima) continue
    if (!esCarteraEnVigor({ importRef: p.viva ? null : 'volcado', eiacXmlHash: null, estado: p.estado, sustituidaAt: p.sustituida ? 'sustituida' : null })) continue
    const pm = norm(p.matricula)
    if (mat !== '' && pm !== '' && pm !== mat) continue
    const n = nombreUtil(p.aseguradora)
    if (n === null) { enVigorSinNombre++; continue }
    const k = n.toLowerCase().replace(/\s+/g, '')
    if (!porClave.has(k)) porClave.set(k, n)
  }
  const companias = [...porClave.values()]
  // Una póliza en vigor cuya compañía no se lee junto a otra que sí: no se sabe si coinciden → no se adivina.
  if (companias.length === 1 && enVigorSinNombre === 0) return { estado: 'dato', compania: companias[0]! }
  if (companias.length === 0 && enVigorSinNombre === 0) return { estado: 'sin_poliza' }
  return companias.length === 0 ? { estado: 'pendiente' } : { estado: 'varias', companias }
}

/** Compañías cuyo bot exige la compañía anterior (las de `necesitaCompaniaActual` en asegura). */
export const COMPANIAS_QUE_EXIGEN_COMPANIA_ANTERIOR = ['allianz', 'mapfre'] as const

/**
 * Qué compañía anterior usar: la del riesgo manda; si no hay, la de la cartera SOLO si hay una candidata. Años asegurado = 0 → nunca
 * (no hay seguro anterior que nombrar). `bloqueo` = mensaje para Allianz/Mapfre cuando hay varias candidatas distintas. PURA.
 */
export function resolverCompaniaAnterior(
  delRiesgo: string | null,
  aniosAsegurado: number | null | undefined,
  porPolizas: CompaniaPorPolizas,
): { compania: string | null; propuestaDePoliza: boolean; bloqueo: string | null } {
  if (aniosAsegurado === 0) return { compania: null, propuestaDePoliza: false, bloqueo: null }
  if (delRiesgo !== null) return { compania: delRiesgo, propuestaDePoliza: false, bloqueo: null }
  if (porPolizas.estado === 'dato') return { compania: porPolizas.compania, propuestaDePoliza: true, bloqueo: null }
  if (porPolizas.estado === 'varias') {
    return { compania: null, propuestaDePoliza: false, bloqueo: `El cliente tiene varias pólizas de coche en vigor en compañías distintas (${porPolizas.companias.join(', ')}): indica en «Compañía anterior» cuál es la de este vehículo.` }
  }
  return { compania: null, propuestaDePoliza: false, bloqueo: null }
}
