'use client'
// Botón para reabrir el diálogo de consentimiento.
//
// Existe porque el art. 7.3 RGPD exige que retirar el consentimiento sea tan
// fácil como darlo. Sin esto, la única forma de cambiar de opinión sería borrar
// las cookies del navegador a mano, que no es «tan fácil».
import type { CSSProperties } from 'react'
import { renovarConsentimiento } from '@/components/Analitica'

const boton: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 44,
  padding: '0 16px',
  background: 'var(--brand)',
  color: '#fff',
  fontSize: 15,
  fontWeight: 700,
  border: 0,
  borderRadius: 12,
  cursor: 'pointer',
}

export default function BotonCookies() {
  return (
    <button type="button" style={boton} onClick={renovarConsentimiento}>
      Cambiar mis preferencias de cookies
    </button>
  )
}
