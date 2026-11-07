// Portal de la GESTORÍA · bandeja de pendientes por empresa. PURO (la fuente de datos se inyecta).
//
// 🚨 AISLAMIENTO: un gestor ve SOLO las empresas con vínculo ACTIVO de rol `gestor` (la tabla de asignación es `usuario_empresas`). `bandejaGestor`
// consulta la fuente ÚNICAMENTE con ids de esas empresas — nunca con un id recibido de fuera — y descarta cualquier vínculo de rol `dueno` (una persona
// puede ser dueña de una empresa y gestora de otras: la bandeja de la gestoría no mezcla las suyas). Cada empresa se consulta aparte (en la app, en su
// propia transacción RLS): no existe consulta cruzada. Guardián: apps/contabilidad/test/gestoria.test.ts.
//
// null ≠ 0: un contador que no se pudo leer (tabla sin aplicar, fallo de BD) es `null` («no se sabe»), nunca 0; el total solo suma lo conocido y la
// empresa queda marcada `incompleto`.

export type VinculoUsuario = { empresaId: string; razonSocial: string; rol: 'dueno' | 'gestor' }
export type ContadoresPendientes = {
  /** Asientos del ejercicio abierto sin revisar por la gestoría. */
  asientosSinRevisar: number | null
  /** Facturas recibidas con origen automático (correo, OCR, vertical) sin confirmar por una persona. */
  facturasAConfirmar: number | null
  avisosSinLeer: number | null
  /** Declaraciones en borrador (sin revisar). */
  declaracionesBorrador: number | null
}
export const CONTADORES_DESCONOCIDOS: ContadoresPendientes = { asientosSinRevisar: null, facturasAConfirmar: null, avisosSinLeer: null, declaracionesBorrador: null }
export type FuentePendientes = (empresaId: string) => Promise<ContadoresPendientes>

export type PendientesEmpresa = ContadoresPendientes & {
  empresaId: string
  razonSocial: string
  /** Suma de los contadores CONOCIDOS. */
  total: number
  /** Algún contador es desconocido (el total puede ser mayor). */
  incompleto: boolean
}

const claves = ['asientosSinRevisar', 'facturasAConfirmar', 'avisosSinLeer', 'declaracionesBorrador'] as const
const valido = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0

/** Empresas que el usuario gestiona: vínculos de rol `gestor`, sin duplicados (el primero gana). */
export function empresasGestionadas(vinculos: readonly VinculoUsuario[]): VinculoUsuario[] {
  const vistas = new Set<string>()
  const r: VinculoUsuario[] = []
  for (const v of vinculos) {
    if (v.rol !== 'gestor') continue
    const id = v.empresaId.toLowerCase()
    if (vistas.has(id)) continue
    vistas.add(id)
    r.push({ ...v, empresaId: id })
  }
  return r
}

/** ¿Gestiona este usuario esa empresa? (la pantalla de detalle lo comprueba antes de abrir nada). */
export const gestionaEmpresa = (vinculos: readonly VinculoUsuario[], empresaId: string): boolean =>
  empresasGestionadas(vinculos).some((v) => v.empresaId === String(empresaId).toLowerCase())

export function resumirEmpresa(v: { empresaId: string; razonSocial: string }, c: ContadoresPendientes): PendientesEmpresa {
  const limpio = Object.fromEntries(claves.map((k) => [k, valido(c[k]) ? c[k] : null])) as ContadoresPendientes
  const conocidos = claves.map((k) => limpio[k]).filter(valido)
  return { empresaId: v.empresaId, razonSocial: v.razonSocial, ...limpio, total: conocidos.reduce((s, n) => s + n, 0), incompleto: conocidos.length < claves.length }
}

export type BandejaGestor = { empresas: PendientesEmpresa[]; totalGeneral: number; sinAsignaciones: boolean; incompleta: boolean }

export async function bandejaGestor(vinculos: readonly VinculoUsuario[], fuente: FuentePendientes): Promise<BandejaGestor> {
  const mias = empresasGestionadas(vinculos)
  const empresas: PendientesEmpresa[] = []
  for (const v of mias) {
    let c: ContadoresPendientes
    try { c = await fuente(v.empresaId) } catch { c = CONTADORES_DESCONOCIDOS }
    empresas.push(resumirEmpresa(v, c))
  }
  // Más trabajo primero; a igual trabajo, las que tienen datos incompletos antes (no se esconden), y por nombre.
  empresas.sort((a, b) => b.total - a.total || Number(b.incompleto) - Number(a.incompleto) || a.razonSocial.localeCompare(b.razonSocial, 'es'))
  return { empresas, totalGeneral: empresas.reduce((s, e) => s + e.total, 0), sinAsignaciones: mias.length === 0, incompleta: empresas.some((e) => e.incompleto) }
}
