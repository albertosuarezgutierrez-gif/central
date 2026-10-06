import Link from 'next/link'
import { Bot } from 'lucide-react'
import { PageHeader, Pagina } from '@/components/ui'
import PanelTarificador from './PanelTarificador'

export const dynamic = 'force-dynamic'

/**
 * Panel del tarificador RPA (bot de Allianz ePAC, comunidades) — 07/10/2026.
 *
 * Aparte de `/correduria` a propósito: no es trabajo del día, es la salud del bot (cuánto acierta, dónde
 * se para, cuánto cuesta la IA que le ayuda), las renovaciones de comunidades que el bot cotiza solo
 * (apagado por defecto y con tope diario: Allianz no está avisada del acceso automatizado) y las
 * alertas de cambio de tarifa (mismo riesgo, otra prima anual). Los datos llegan por
 * `/api/correduria/tarificador/panel` → puerto de operador de asegura. Nada de aquí envía ni emite.
 */
export default function TarificadorPage() {
  return (
    <Pagina ancho="tabla">
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <div>
          <Link href="/correduria" style={{ fontSize: 13, color: 'var(--muted)' }}>← Correduría</Link>
          <PageHeader
            titulo="Tarificador (bot de Allianz)"
            icono={<Bot size={20} strokeWidth={1.75} />}
            sub={<>
              Cómo le va al bot que pide precio de comunidades en el portal de Allianz, qué renovaciones ha
              cotizado solo y dónde ha cambiado la tarifa. Solo pide precios: nunca contrata ni manda nada.
            </>}
          />
        </div>
        <PanelTarificador />
      </div>
    </Pagina>
  )
}
