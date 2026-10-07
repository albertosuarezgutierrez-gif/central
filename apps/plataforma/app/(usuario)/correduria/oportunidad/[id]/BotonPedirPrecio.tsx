'use client'

// «Pedir precio →» dentro del bloque de datos del riesgo (07/10/2026), igual que en `DatosVehiculo`: un enlace a la
// pantalla de precio del ramo (`rutaVariante`), nunca una cotización por sí mismo (cuesta 0,50€ y se confirma allí).
// Comunidades no tiene pantalla de precio sino el formulario de los bots de la propia oportunidad: `ancla` lleva a él
// (`#presupuestos`) en vez de a otra ruta. Deshabilitado con su motivo mientras se edita o se guarda. ≥44 px, sin
// desbordar a 320 px.

import Link from 'next/link'
import { btnStyle } from '@/components/ui'

export default function BotonPedirPrecio({ href, ancla, motivo, nota }: { href?: string | null; ancla?: string | null; motivo: string | null; nota?: string }) {
  const estilo: React.CSSProperties = { ...btnStyle('primario', 'sm'), minHeight: 44, width: 'fit-content', maxWidth: '100%' }
  const enlace: React.CSSProperties = { ...estilo, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }
  return (
    <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
      {motivo === null && ancla ? (
        <a href={ancla} style={enlace}>Pedir precio →</a>
      ) : motivo === null && href ? (
        <Link href={href} style={enlace}>Pedir precio →</Link>
      ) : (
        <button type="button" disabled aria-disabled="true" style={{ ...estilo, opacity: 0.5, cursor: 'not-allowed' }}>
          Pedir precio →
        </button>
      )}
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>
        {motivo ?? nota ?? 'Abre la pantalla de precio con estos datos precargados; allí se confirma y pedir precio cuesta 0,50€.'}
      </span>
    </div>
  )
}
