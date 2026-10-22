'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

const ERRORES: Record<string, string> = {
  no_encontrado: 'No tienes permiso para dar de alta contratos en este inmueble.',
  demasiadas_peticiones: 'Demasiados intentos seguidos. Prueba más tarde.',
  sin_sesion: 'Tu sesión ha caducado. Vuelve a entrar.',
}
const CAMPOS: Record<string, string> = {
  inicio: 'fecha de inicio', fin: 'fecha de fin', renta: 'renta mensual', clausula: 'actualización', indice: 'índice',
  indiceDescripcion: 'descripción del índice', fianza: 'fianza', fianzaDepositadaEn: 'fecha de depósito de la fianza',
  fianzaOrganismo: 'organismo de la fianza', seguroInquilinoExigido: 'seguro del inquilino', seguroInquilinoVence: 'vencimiento del seguro',
}
const etiqueta: React.CSSProperties = { display: 'grid', gap: 4, fontSize: 13, fontWeight: 600, minWidth: 0 }

/** Alta de un contrato de larga estancia (solo nivel Total; lo filtra el servidor). Vacío = «no consta», nunca 0. */
export function NuevoContrato({ inmuebleId }: { inmuebleId: string }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [inicio, setInicio] = useState('')
  const [fin, setFin] = useState('')
  const [renta, setRenta] = useState('')
  const [clausula, setClausula] = useState<'ninguna' | 'IPC' | 'IRAV' | 'otro'>('ninguna')
  const [descripcion, setDescripcion] = useState('')
  const [fianza, setFianza] = useState('')
  const [depositada, setDepositada] = useState('')
  const [organismo, setOrganismo] = useState('')
  // Tri-estado: '' = no lo sé (null), nunca «no» por defecto.
  const [seguro, setSeguro] = useState<'' | 'si' | 'no'>('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!abierto) {
    return <button type="button" className="boton" style={{ minHeight: 44 }} onClick={() => setAbierto(true)}>Añadir contrato</button>
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setError(null)
    try {
      const res = await fetch('/api/patrimonio/contratos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inmueble: inmuebleId,
          inicio,
          fin: fin || null,
          renta,
          clausula: clausula === 'ninguna' ? 'ninguna' : 'indice',
          indice: clausula === 'ninguna' ? null : clausula,
          indiceDescripcion: clausula === 'otro' ? descripcion : null,
          fianza: fianza || null,
          fianzaDepositadaEn: depositada || null,
          fianzaOrganismo: organismo || null,
          seguroInquilinoExigido: seguro === '' ? null : seguro === 'si',
        }),
      })
      const j = (await res.json().catch(() => ({}))) as { id?: string; error?: string; campo?: string }
      if (res.ok && j.id) {
        router.push(`/patrimonio/contrato/${j.id}`)
        router.refresh()
        return
      }
      setError(j.error === 'datos_invalidos' ? `Revisa el campo «${CAMPOS[j.campo ?? ''] ?? j.campo ?? ''}».` : (ERRORES[j.error ?? ''] ?? 'No hemos podido guardarlo. Inténtalo de nuevo.'))
    } catch {
      setError('No hemos podido conectar. Vuelve a intentarlo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <h3 style={{ margin: 0, fontSize: 15 }}>Añadir contrato de alquiler (larga estancia)</h3>
      <label style={etiqueta}>Inicio
        <input className="campo" type="date" value={inicio} required disabled={enviando} onChange={(e) => setInicio(e.target.value)} />
      </label>
      <label style={etiqueta}>Fin pactado (opcional)
        <input className="campo" type="date" value={fin} disabled={enviando} onChange={(e) => setFin(e.target.value)} />
      </label>
      <label style={etiqueta}>Renta mensual (€)
        <input className="campo" inputMode="decimal" value={renta} required placeholder="850,00" disabled={enviando} onChange={(e) => setRenta(e.target.value)} />
      </label>
      <label style={etiqueta}>¿El contrato pacta actualizar la renta?
        <select className="campo" value={clausula} disabled={enviando} onChange={(e) => setClausula(e.target.value as typeof clausula)}>
          <option value="ninguna">No (la renta no se actualiza)</option>
          <option value="IPC">Sí, por el IPC</option>
          <option value="IRAV">Sí, por el IRAV (índice de alquiler de vivienda)</option>
          <option value="otro">Sí, por otro índice</option>
        </select>
      </label>
      {clausula === 'otro' && (
        <label style={etiqueta}>¿Qué índice?
          <input className="campo" value={descripcion} maxLength={200} required disabled={enviando} onChange={(e) => setDescripcion(e.target.value)} />
        </label>
      )}
      <label style={etiqueta}>Fianza (€, opcional)
        <input className="campo" inputMode="decimal" value={fianza} disabled={enviando} onChange={(e) => setFianza(e.target.value)} />
      </label>
      <label style={etiqueta}>Fecha de depósito de la fianza (opcional)
        <input className="campo" type="date" value={depositada} disabled={enviando} onChange={(e) => setDepositada(e.target.value)} />
      </label>
      <label style={etiqueta}>Organismo donde se depositó (opcional)
        <input className="campo" value={organismo} maxLength={200} disabled={enviando} onChange={(e) => setOrganismo(e.target.value)} />
      </label>
      <label style={etiqueta}>¿Exige al inquilino un seguro?
        <select className="campo" value={seguro} disabled={enviando} onChange={(e) => setSeguro(e.target.value as typeof seguro)}>
          <option value="">No lo sé</option>
          <option value="si">Sí</option>
          <option value="no">No</option>
        </select>
      </label>
      {error && <p className="error-linea" role="alert" style={{ margin: 0 }}>{error}</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="submit" className="boton" style={{ minHeight: 44 }} disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar contrato'}</button>
        <button type="button" className="boton boton-secundario" style={{ minHeight: 44 }} disabled={enviando} onClick={() => setAbierto(false)}>Cancelar</button>
      </div>
    </form>
  )
}
