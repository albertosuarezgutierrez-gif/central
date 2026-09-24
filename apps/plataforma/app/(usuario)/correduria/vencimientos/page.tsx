import VencimientosClient from './VencimientosClient'

export const dynamic = 'force-dynamic'

/**
 * Vencimientos: la pantalla de VENDER (pieza 1-3 de ASegura OS, maqueta
 * aprobada por Alberto el 23/09/2026). Dos carriles —clientes que renuevan y
 * leads con su seguro en otra compañía— y desde cada lead, su seguimiento.
 * Los datos llegan por el puerto de asegura; esta página no toca la cartera.
 */
export default function VencimientosPage() {
  return <VencimientosClient />
}
