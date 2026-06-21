// Consolidado de descuadres de caja POR EMPLEADO de ia-rest, leído por el PUERTO
// HTTP del operador (Bearer OPERADOR_SHARED_SECRET). ia-rest vive en su BD propia,
// así que NO se consulta su Postgres: mismo patrón que lib/financiero.ts y el adapter.

export interface ResumenEmpleadoIaRest {
  camarero_id: string | null
  camarero_nombre: string | null
  num_cierres: number
  descuadre_total: number
  descuadre_medio: number
  peor_descuadre: number
  racha_negativa: number
  patron_recurrente: boolean
}
export interface NegocioDescuadres {
  local_id: string
  descuadre_total: number
  peor_descuadre: number
  resumen: ResumenEmpleadoIaRest[]
}

export async function getDescuadresIaRest(
  desde?: string, hasta?: string,
): Promise<{ negocios: NegocioDescuadres[]; error?: string }> {
  const base = process.env.IAREST_URL?.replace(/\/$/, '')
  const secret = process.env.OPERADOR_SHARED_SECRET
  if (!base || !secret) return { negocios: [], error: 'IAREST_URL/OPERADOR_SHARED_SECRET sin configurar' }

  const qs = new URLSearchParams()
  if (desde) qs.set('desde', desde)
  if (hasta) qs.set('hasta', hasta)
  try {
    const res = await fetch(`${base}/api/operador/descuadres-empleado?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return { negocios: [], error: `HTTP ${res.status}` }
    const json = await res.json()
    return { negocios: (json.negocios ?? []) as NegocioDescuadres[] }
  } catch (e: unknown) {
    return { negocios: [], error: e instanceof Error ? e.message : 'error' }
  }
}
