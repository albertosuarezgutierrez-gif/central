// El embudo de las FELICITACIONES de cumpleaños como campaña (07/11/2026): la felicitación es la SONDA del email de
// la cartera (como el goteo de «presentación de la app»): quien la recibe tiene un email que vale; quien rebota, no.
// PURO (lo lee `node --test`). La BD, en `campana-felicitacion.ts`.
//
// Pasos: felicitados → entregado → abierto → clic → ENTRÓ AL PORTAL en los 7 días siguientes.
// 🚨 «Entró al portal» NO implica clic (a diferencia de la visita con `?r=` de la campaña de leads, que llega POR el
// enlace): puede haber entrado por su cuenta. Por eso se cuenta APARTE y no empuja hacia arriba entregados, abiertos
// ni clics. Su % se da sobre los felicitados, no sobre los clics.
import { embudoCampana, type EmbudoCampana, type FilaEmbudo } from '@central/module-seguros'

export const CAMPANA_FELICITACION = 'felicitacion'
export const DIAS_PORTAL_TRAS_FELICITAR = 7

/** Grupo de la felicitación: `felicitacion.variante` NULL = la del cron de clientes en vigor. */
export function grupoFelicitacion(variante: string | null): string {
  if (variante === 'ex_cliente') return 'Ex-clientes'
  if (variante === 'posible_cliente') return 'Posibles clientes'
  return 'Clientes en vigor'
}

export type FilaFelicitacion = FilaEmbudo & { portal: boolean }

/**
 * Embudo de felicitaciones: el de siempre (`embudoCampana`) SIN visita ni registro, y `visitas` = cuántos de los
 * que salieron entraron al portal en la ventana. `registrados` no aplica: 0 de verdad (no hay alta por enlace).
 */
export function embudoFelicitacion(filas: readonly FilaFelicitacion[]): EmbudoCampana {
  const sinPortal = filas.map((f) => ({ ...f, visita: false, registrado: false }))
  return {
    ...embudoCampana(sinPortal),
    visitas: filas.filter((f) => f.enviado && f.portal).length,
    registrados: 0,
  }
}

/** Embudo por grupo (ex-clientes, clientes en vigor…) o por año, ordenado por la clave. */
export function embudoFelicitacionPorGrupo<T extends FilaFelicitacion>(filas: readonly T[], clave: (f: T) => string): { grupo: string; embudo: EmbudoCampana }[] {
  const grupos = new Map<string, T[]>()
  for (const f of filas) {
    const k = clave(f)
    grupos.set(k, [...(grupos.get(k) ?? []), f])
  }
  return [...grupos.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'es', { numeric: true }))
    .map(([grupo, fs]) => ({ grupo, embudo: embudoFelicitacion(fs) }))
}
