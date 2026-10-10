'use client'
import { useState } from 'react'
import GoogleContactosConexion from '../GoogleContactosConexion'
import GoogleContactosSimulacion from '../GoogleContactosSimulacion'
import GoogleContactosRevision from '../GoogleContactosRevision'
import GoogleContactosOrdenar from '../GoogleContactosOrdenar'

/**
 * Todo Google Contactos en una vista (05/10/2026, Alberto: entrada «Google Contactos» del menú «…»
 * de `/correduria`): conexión → simular/activar → cola de revisión → «Ordenar agenda» (solo lectura). Al conectar/desconectar se
 * remonta la simulación (`key`) para que lea el estado nuevo.
 */
export default function GoogleContactosVista() {
  const [version, setVersion] = useState(0)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', minWidth: 0 }}>
      <GoogleContactosConexion onCambio={() => setVersion((v) => v + 1)} />
      <GoogleContactosSimulacion key={version} />
      <div id="revision-google"><GoogleContactosRevision /></div>
      <GoogleContactosOrdenar />
    </div>
  )
}
