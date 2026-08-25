'use client'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

// 🔄 Botón «Actualizar» del Laboratorio (petición de Alberto, 23/08/2026): la pasada del agente es
// diaria y a mitad de sesión de bolsa el panel enseñaba la película de ayer. El refresco re-ejecuta
// la página en el servidor (force-dynamic), que relee la BD Y los precios públicos en vivo
// (lib/trading/precio-vivo.ts). Lo que solo trae la pasada diaria (ideas, radar, foto IBKR) no
// cambia con el botón — y la página lo declara, no lo disimula.
export default function ActualizarConsulta({ consultaDe }: { consultaDe: string }) {
  const router = useRouter()
  const [pendiente, arrancar] = useTransition()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
      <button
        onClick={() => arrancar(() => router.refresh())}
        disabled={pendiente}
        title="Relee ahora mismo la base de datos y el precio público en vivo de cada posición. Las ideas del agente, el radar y la foto de IBKR los trae su pasada diaria — eso no cambia con este botón."
        style={{
          minHeight: 44, padding: '8px 16px', fontSize: 14, fontWeight: 600, cursor: pendiente ? 'wait' : 'pointer',
          background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', opacity: pendiente ? 0.6 : 1,
        }}
      >
        {pendiente ? '⏳ Actualizando…' : '🔄 Actualizar'}
      </button>
      <span style={{ color: 'var(--muted)', fontSize: 12 }}>
        consulta de las {consultaDe} · relee precios públicos en vivo; las ideas, la foto de IBKR y la fecha de «Última pasada» las trae la pasada nocturna del agente
      </span>
    </div>
  )
}
