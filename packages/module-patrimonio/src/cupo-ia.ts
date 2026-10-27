// PATRIMONIO (27/10/2026) — CUPO MENSUAL de lectura de facturas con IA, por titular, según lo que vale el cliente para la
// correduría (decisión de Alberto). PURO: sin BD, sin red, sin reloj.
//
// 🔧 LAS CIFRAS QUE ALBERTO CAMBIA ESTÁN AQUÍ Y SOLO AQUÍ (las tres primeras constantes y los dos umbrales).
//
// Tramos:
//   · basico    — sin pólizas en vigor (cliente que solo usa la herramienta).
//   · amplio    — con pólizas en vigor. TAMBIÉN es el tramo cuando NO SE SABE (regla del repo: «dato que no hay ≠ 0»).
//   · alto_valor — comisión anual en vigor ≥ umbral, o (si no consta la comisión) nº de pólizas ≥ umbral. Casi sin límite.
//
// De dónde sale el valor HOY: del nº de pólizas en vigor del grupo (titular + quienes ella autoriza), con `esCarteraEnVigor()`.
// La comisión anual en vigor es el criterio que prefiere la regla, pero el rol del portal NO tiene GRANT sobre las columnas de
// comisión de `poliza_recibos` y anualizar recibos (fraccionados, NP/CA, importes en TEXT) no es fiable: el llamador pasa
// `comisionAnualCent: null` y decide el nº de pólizas. Si algún día se calcula bien, basta con rellenar ese campo.

/** Facturas leídas con IA al mes, por titular. */
export const CUPO_IA_BASICO = 10
export const CUPO_IA_AMPLIO = 60
export const CUPO_IA_ALTO_VALOR = 500

/** Comisión anual en vigor del grupo (céntimos) a partir de la cual el cliente es de alto valor: 1.500,00 €. */
export const UMBRAL_ALTO_VALOR_COMISION_CENT = 150_000
/** Sin comisión conocida: nº de pólizas en vigor del grupo a partir del cual es de alto valor. */
export const UMBRAL_ALTO_VALOR_POLIZAS = 10

export type TramoCupoIa = 'basico' | 'amplio' | 'alto_valor'

export type ValorCliente = {
  /** Comisión anual en vigor del grupo, en céntimos. `null` = NO SE SABE (no es 0). */
  comisionAnualCent: number | null
  /** Pólizas en vigor del grupo (`esCarteraEnVigor`). `null` = NO SE SABE (no es 0); 0 = revisado y no hay. */
  polizasEnVigor: number | null
}

export type CupoIa = { tramo: TramoCupoIa; max: number; fuente: 'comision' | 'polizas' | 'desconocido' }

const MAX_DE: Record<TramoCupoIa, number> = { basico: CUPO_IA_BASICO, amplio: CUPO_IA_AMPLIO, alto_valor: CUPO_IA_ALTO_VALOR }
const cupo = (tramo: TramoCupoIa, fuente: CupoIa['fuente']): CupoIa => ({ tramo, max: MAX_DE[tramo], fuente })
const dato = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0

export function cupoMensualIa(v: ValorCliente): CupoIa {
  if (dato(v.comisionAnualCent) && v.comisionAnualCent >= UMBRAL_ALTO_VALOR_COMISION_CENT) return cupo('alto_valor', 'comision')
  if (dato(v.polizasEnVigor)) {
    if (v.polizasEnVigor >= UMBRAL_ALTO_VALOR_POLIZAS) return cupo('alto_valor', 'polizas')
    return cupo(v.polizasEnVigor > 0 ? 'amplio' : 'basico', 'polizas')
  }
  // No se sabe cuántas pólizas tiene: el conservador intermedio (ni el básico por error ni el ilimitado).
  return cupo('amplio', 'desconocido')
}

/** ¿Quedan lecturas este mes? `usadas` = facturas ya subidas por el titular en el mes (todas, leídas o no). */
export function quedaCupoIa(usadas: number, max: number): boolean {
  return usadas < max
}

export const MENSAJE_CUPO_IA_AGOTADO =
  'Has llegado al límite de este mes de lectura automática de facturas; con tus seguros en Grupo ASegura tienes más. Puedes seguir subiendo la factura y rellenar los datos a mano.'
