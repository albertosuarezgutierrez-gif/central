import { TiraAccesos, type Acceso } from '../../Accesos'
import { TABS_FICHA, type DetalleAcceso, type TabFicha } from './tabs'

export { tabDeParametro, type TabFicha } from './tabs'

/**
 * Los ACCESOS directos de la ficha del cliente (24/09/2026; antes, una barra de
 * pestañas). Alberto: «tiene que ser todo accesos directos». Cada baldosa carga
 * su sección por `?tab=` en el servidor: solo se renderiza la abierta.
 *
 * No se prefetchean (`TiraAccesos` lleva `prefetch={false}`): cada sección
 * repite la llamada al puerto de asegura, y prefetchear nueve serían nueve
 * consultas a la cartera por pasar el ratón por encima.
 *
 * El texto de cada baldosa sale de `detallesAccesos` (puro, en `tabs.ts`):
 * lo que no se ha podido leer no se pinta, y un cero leído se dice.
 */

const ACCESOS: Record<TabFicha, { icono: string; titulo: string }> = {
  resumen: { icono: '🛡️', titulo: 'Sus seguros' },
  oportunidades: { icono: '💼', titulo: 'Oportunidades' },
  pendiente: { icono: '🔔', titulo: 'Pendiente' },
  polizas: { icono: '📋', titulo: 'Todas las pólizas' },
  contactos: { icono: '👥', titulo: 'Contactos' },
  documentos: { icono: '📎', titulo: 'Documentos' },
  correos: { icono: '✉️', titulo: 'Correos' },
  notas: { icono: '📝', titulo: 'Notas' },
  historial: { icono: '🕘', titulo: 'Historial' },
}

export default function FichaTabs({ clienteId, activa, detalles }: {
  clienteId: string
  activa: TabFicha
  detalles: Partial<Record<TabFicha, DetalleAcceso>>
}) {
  const accesos: (Acceso & { href: string })[] = TABS_FICHA.map(k => {
    const d = detalles[k]
    return {
      id: k,
      ...ACCESOS[k],
      detalle: d?.texto ?? null,
      tono: d?.tono,
      href: k === 'resumen' ? `/correduria/cliente/${clienteId}` : `/correduria/cliente/${clienteId}?tab=${k}`,
    }
  })
  return <TiraAccesos accesos={accesos} activo={activa} />
}
