import { TiraAccesos, type Acceso, type Tono } from '../../Accesos'
import { TABS_FICHA, type TabFicha } from './tabs'

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
 * El contador `null` NO se pinta: «no se ha podido leer» no es «0».
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

export type ContadoresTabs = Partial<Record<TabFicha, { n: number | null; tono?: Tono; texto?: (n: number) => string }>>

export default function FichaTabs({ clienteId, activa, contadores }: {
  clienteId: string
  activa: TabFicha
  contadores: ContadoresTabs
}) {
  const accesos: (Acceso & { href: string })[] = TABS_FICHA.map(k => {
    const c = contadores[k]
    return {
      id: k,
      ...ACCESOS[k],
      detalle: c && c.n !== null && c.n > 0 ? (c.texto ? c.texto(c.n) : String(c.n)) : null,
      tono: c?.tono,
      href: k === 'resumen' ? `/correduria/cliente/${clienteId}` : `/correduria/cliente/${clienteId}?tab=${k}`,
    }
  })
  return <TiraAccesos accesos={accesos} activo={activa} />
}
