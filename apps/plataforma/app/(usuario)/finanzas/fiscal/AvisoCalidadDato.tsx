// 7. Calidad del dato: feeds parados y facturas que faltan. Si hay avisos, las cifras de arriba son «Provisional».
import { AlertTriangle, CircleCheck } from 'lucide-react'
import type { AvisosDatos } from '@/lib/base-fiscal-devengo'
import { contarAvisos, hayAvisos } from '@/lib/fiscal-panel'
import { fechaEs, tarjeta } from './estilosPanel'

const mesCorto = (m: string) => ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][Number(m.slice(5, 7)) - 1]

export default function AvisoCalidadDato({ avisos, provisionalPorEstimacion }: { avisos: AvisosDatos; provisionalPorEstimacion: boolean }) {
  const hay = hayAvisos(avisos)
  if (!hay && !provisionalPorEstimacion) {
    return (
      <section id="calidad-dato" style={{ ...tarjeta, display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: 'var(--positive)' }}>
        <CircleCheck size={16} aria-hidden /> Calidad del dato: cuentas al día y facturas de limpieza y suministros presentes.
      </section>
    )
  }
  return (
    <details id="calidad-dato" style={{ ...tarjeta, background: 'var(--warning-bg)', color: 'var(--warning)' }} open={hay}>
      <summary style={{ minHeight: 44, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
        <AlertTriangle size={16} aria-hidden /> Calidad del dato{hay ? `: ${contarAvisos(avisos)} aviso${contarAvisos(avisos) === 1 ? '' : 's'}` : ': estimación con conceptos sin dato'} · cifras provisionales
      </summary>
      <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 4 }}>
        {avisos.cuentasSinActualizar.map(c => (
          <div key={c.nombre}>• Cuenta {c.nombre} sin actualizar: {c.ultimoMovimiento ? `último movimiento ${fechaEs(c.ultimoMovimiento)} (hace ${c.dias} días)` : 'sin movimientos'}. El cierre puede estar subestimado. <a href="/banca" style={{ color: 'inherit' }}>Ir a banca</a></div>
        ))}
        {avisos.mesesSinLimpieza.length > 0 && <div>• Faltan facturas de limpieza: {avisos.mesesSinLimpieza.map(mesCorto).join(', ')}.</div>}
        {avisos.mesesSinSuministros.length > 0 && <div>• Faltan facturas de suministros (Socorro): {avisos.mesesSinSuministros.map(mesCorto).join(', ')}.</div>}
        {provisionalPorEstimacion && <div>• La estimación de cierre cuenta conceptos «sin dato» como 0: es una cota optimista (detalle abajo, en «Detalle»).</div>}
      </div>
    </details>
  )
}
