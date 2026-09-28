import { Shield, Briefcase, Bell, ClipboardList, Users, Paperclip, Mail, FileText, Clock } from 'lucide-react'
import { TiraAccesos, type Acceso } from '../../Accesos'
import { TABS_FICHA, type DetalleAcceso, type TabFicha } from './tabs'
import { Ico } from '../iconos'

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

const ACCESOS: Record<TabFicha, { icono: React.ReactNode; titulo: string }> = {
  resumen: { icono: <Ico i={Shield} />, titulo: 'Sus seguros' },
  oportunidades: { icono: <Ico i={Briefcase} />, titulo: 'Oportunidades' },
  pendiente: { icono: <Ico i={Bell} />, titulo: 'Pendiente' },
  polizas: { icono: <Ico i={ClipboardList} />, titulo: 'Todas las pólizas' },
  contactos: { icono: <Ico i={Users} />, titulo: 'Contactos' },
  documentos: { icono: <Ico i={Paperclip} />, titulo: 'Documentos' },
  correos: { icono: <Ico i={Mail} />, titulo: 'Correos' },
  notas: { icono: <Ico i={FileText} />, titulo: 'Notas' },
  historial: { icono: <Ico i={Clock} />, titulo: 'Historial' },
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
