import { Pagina } from '@/components/ui'
import MesaClient from './MesaClient'

export const dynamic = 'force-dynamic'

/**
 * «Mi mesa» (13/10/2026): lo que Alberto trae entre manos en TODOS los clientes, en cinco bloques fijos.
 * Los datos llegan por `/api/correduria/expedientes` (puerto de asegura); las acciones reutilizan
 * `/api/correduria/oportunidad`, la misma que la ficha del cliente.
 */
export default function MesaPage() {
  return <Pagina ancho="tabla"><MesaClient /></Pagina>
}
