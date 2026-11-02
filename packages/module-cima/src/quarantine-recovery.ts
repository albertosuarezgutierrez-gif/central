/**
 * LOO-781 — Helper PURO (sin BD/red) para etiquetar un fichero EIAC en cuarentena
 * según su recuperabilidad. Da la semántica de UI del panel de salud CIMA
 * (`/salud-cima`) y del endpoint `/api/internal/cima/quarantine`.
 *
 * Reusa los criterios del modo RECONCILE definidos en `pull-deps.ts`
 * (`computeReconcileExclusions`): un fichero SIN/REC/POL en `review`/`review_salud`
 * con `confirmado_at IS NULL` sigue en la cola perpetua de TIREA → un re-pull en
 * modo reconcile lo re-entrega y lo re-matchea (SIN/REC) o re-clasifica (POL,
 * LOO-807: el review puede ser gap del clasificador, p.ej. `RiesgoComercios` de
 * Occident C0468) contra el código/cartera ACTUAL. Esto es lo que aquí llamamos
 * "recuperable".
 *
 * El resto de casos NO los re-saca el reconcile y por tanto requieren otra acción:
 *  - Ya `confirmado_at != null` = dequeuado de TIREA (irrecuperable por re-pull).
 *  - SIN/REC sin póliza en cartera = fichero de una entidad/póliza que no
 *    gestionamos (out-of-cartera) → no hay nada que matchear. POL nunca es
 *    out_of_cartera (el POL ES la póliza) → requiere acción humana.
 *
 * CARVE-OUT (LOO-807 review) — la etiqueta se DESACOPLA del drain para POL en
 * `review_salud`: el drain sí los re-entrega (mixtos salud+comercio recuperan su
 * parte no-salud), pero un POL 100% salud es estructuralmente irrecuperable
 * (mapEiacPol siempre lo devuelve a review_salud → bucle perpetuo) y es Art.9 →
 * la etiqueta es `requiere_accion` para no silenciar el panel ni la alerta diaria.
 */

import { computeReconcileExclusions } from "./reconcile-dedup.ts";

/** Tipos de objeto EIAC que cuelgan de una póliza (FK) y son re-matcheables.
 * OJO (LOO-807): este set local se mantiene SIN/REC A PROPÓSITO — solo alimenta
 * la rama `out_of_cartera` de abajo, y un POL nunca es out_of_cartera (el POL ES
 * la póliza). El criterio "recuperable" delega en el RECONCILE_TIPOS de
 * `pull-deps.ts`, que sí incluye POL. */
const RECONCILE_TIPOS = new Set<string>(["SIN", "REC"]);

/** Etiqueta de recuperabilidad de un fichero en cuarentena (review/review_salud).
 *  - `recuperable`      → re-pull reconcile lo re-entrega: re-matchea (SIN/REC) o
 *                         re-clasifica (POL en `review`, LOO-807), siempre sin confirmar.
 *  - `requiere_accion`  → revisión humana: ya confirmado/dequeuado (cualquier tipo)
 *                         o POL en `review_salud` (Art.9 — el drain lo re-entrega
 *                         pero el reconcile nunca lo resuelve solo; carve-out LOO-807).
 *  - `out_of_cartera`   → no hay póliza/entidad gestionada que matchear (solo SIN/REC). */
export type RecuperabilidadCuarentena =
  | "recuperable"
  | "requiere_accion"
  | "out_of_cartera";

/** Fila mínima que el cálculo de recuperabilidad necesita (subconjunto de
 * `cimaFicheros`). `tienePoliza` = `poliza_id != null` (ya matcheado a cartera). */
export interface FicheroCuarentenaRow {
  nombreFichero: string;
  xmlHash: string | null;
  estado: string;
  tipoObjeto: string;
  confirmadoAt: Date | null;
  /** `poliza_id != null`: el fichero ya quedó vinculado a una póliza de cartera. */
  tienePoliza: boolean;
}

/** Etiqueta presentacional para `RecuperabilidadCuarentena` (es-ES). */
export const RECUPERABILIDAD_LABEL: Record<RecuperabilidadCuarentena, string> = {
  recuperable: "Recuperable",
  requiere_accion: "Requiere acción",
  out_of_cartera: "Fuera de cartera",
};

/**
 * PURO — clasifica un fichero en cuarentena por su recuperabilidad.
 *
 * Delega el criterio "lo re-saca el reconcile" a `computeReconcileExclusions`
 * (única fuente de verdad del modo reconcile) en lugar de duplicar la regla:
 * si el nombre del fichero entra en las exclusiones del reconcile → `recuperable`
 * — SALVO el carve-out POL/`review_salud` (ver abajo), que se etiqueta
 * `requiere_accion` aunque el drain lo re-entregue.
 *
 * Si NO es recuperable por reconcile (LOO-807: solo queda el ya-confirmado):
 *  - tipo SIN/REC sin póliza vinculada → `out_of_cartera` (no hay nada que matchear).
 *  - resto (POL, o SIN/REC ya confirmado / con póliza) → `requiere_accion`.
 */
export function esRecuperablePorReconcile(
  row: FicheroCuarentenaRow,
): RecuperabilidadCuarentena {
  // LOO-807 review — DESACOPLE etiqueta vs drain, carve-out conservador: un POL
  // en `review_salud` es Art.9 y el reconcile NUNCA lo resuelve solo — mapEiacPol
  // devuelve `review_salud` para todo RiesgoSalud, así que un POL 100% salud entra
  // en bucle perpetuo (cada drain lo re-entrega y vuelve a review_salud con 0
  // persistidas). Exige decisión humana/DPO SIEMPRE → la etiqueta (badge verde de
  // /salud-cima + conteo `requiere_accion` que vigila cima-health-alert, LOO-826 B1)
  // NO debe silenciarlo. El DRAIN sí lo sigue re-entregando (computeReconcileExclusions
  // intacto): un fichero MIXTO salud+comercio recupera su parte no-salud — fallo en
  // dirección segura (sobre-alerta en mixtos vs silencio en puros).
  if (row.tipoObjeto === "POL" && row.estado === "review_salud") {
    return "requiere_accion";
  }

  const { nombres } = computeReconcileExclusions([
    {
      nombreFichero: row.nombreFichero,
      xmlHash: row.xmlHash,
      estado: row.estado,
      tipoObjeto: row.tipoObjeto,
      confirmadoAt: row.confirmadoAt,
    },
  ]);
  if (nombres.has(row.nombreFichero)) return "recuperable";

  // No recuperable por reconcile: SIN/REC sin póliza vinculada = fuera de cartera
  // (no hay póliza que matchear); el resto requiere acción humana (ya confirmado/
  // dequeuado — un POL confirmado nunca cae a out_of_cartera, ver RECONCILE_TIPOS).
  if (RECONCILE_TIPOS.has(row.tipoObjeto) && !row.tienePoliza) {
    return "out_of_cartera";
  }
  return "requiere_accion";
}

/** Tono semántico del `StatusBadge` para cada etiqueta de recuperabilidad. */
export function recuperabilidadTone(
  r: RecuperabilidadCuarentena,
): "success" | "warning" | "neutral" {
  switch (r) {
    case "recuperable":
      return "success";
    case "requiere_accion":
      return "warning";
    case "out_of_cartera":
      return "neutral";
  }
}
