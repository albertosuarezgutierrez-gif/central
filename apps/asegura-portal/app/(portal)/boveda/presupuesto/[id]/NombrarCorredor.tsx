'use client'
import { useState } from 'react'

/**
 * «Quédate con tu seguro, pero llévamelo yo» (salida B, PR 6): firmar la carta que nos nombra
 * corredores de la póliza actual. Mismas reglas que aceptar una opción:
 *  - la carta se enseña ENTERA antes de firmar y se firma esa (huella);
 *  - hace falta un código nuevo al correo: la sesión sola no firma;
 *  - la vista de corredor lee pero no firma (el servidor también lo niega);
 *  - un error NO se pinta como «firmada»: se dice que no se sabe.
 */
type Paso =
  | { paso: 'inicio' }
  | { paso: 'revisar'; carta: string; cartaHash: string; consentimiento: string }
  | { paso: 'codigo'; carta: string; cartaHash: string; consentimiento: string; email: string; minutos: number }
  | { paso: 'firmada'; enviada: boolean | null }

const NO_SE_SABE = 'No sabemos si se ha guardado. Recarga la página antes de volver a intentarlo, o llámanos.'

export function NombrarCorredor({ presupuestoId, corredor }: { presupuestoId: string; corredor: boolean }) {
  const [paso, setPaso] = useState<Paso>({ paso: 'inicio' })
  const [codigo, setCodigo] = useState('')
  const [nombre, setNombre] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  async function enviar(cuerpo: Record<string, unknown>): Promise<{ status: number; j: Record<string, unknown> } | null> {
    try {
      const r = await fetch('/api/presupuesto/carta', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ presupuestoId, ...cuerpo }),
      })
      return { status: r.status, j: ((await r.json().catch(() => null)) ?? {}) as Record<string, unknown> }
    } catch {
      return null
    }
  }

  async function preparar() {
    setOcupado(true)
    setAviso(null)
    const r = await enviar({ accion: 'preparar' })
    setOcupado(false)
    if (r?.status === 200 && r.j.estado === 'ok' && typeof r.j.carta === 'string' && typeof r.j.cartaHash === 'string') {
      setPaso({ paso: 'revisar', carta: r.j.carta, cartaHash: r.j.cartaHash, consentimiento: typeof r.j.consentimiento === 'string' ? r.j.consentimiento : '' })
      return
    }
    if (r?.j.estado === 'ya_firmada') {
      setPaso({ paso: 'firmada', enviada: r.j.enviada === true })
      return
    }
    setAviso(typeof r?.j.motivo === 'string' ? r.j.motivo : 'No hemos podido preparar la carta. Inténtalo en unos minutos o llámanos.')
  }

  async function pedirCodigo() {
    if (paso.paso !== 'revisar' && paso.paso !== 'codigo') return
    setOcupado(true)
    setAviso(null)
    const r = await enviar({ accion: 'codigo' })
    setOcupado(false)
    if (r?.status === 200 && r.j.estado === 'codigo_enviado' && typeof r.j.email === 'string' && typeof r.j.minutos === 'number') {
      setPaso({ ...paso, paso: 'codigo', email: r.j.email, minutos: r.j.minutos })
      return
    }
    if (r?.j.estado === 'espera' && typeof r.j.segundos === 'number') {
      setAviso(`Acabamos de mandarte un código: espera ${r.j.segundos} s para pedir otro.`)
      return
    }
    setAviso(typeof r?.j.motivo === 'string' ? r.j.motivo : 'No hemos podido mandarte el código. Inténtalo en unos minutos.')
  }

  async function firmar() {
    if (paso.paso !== 'codigo') return
    setOcupado(true)
    setAviso(null)
    const r = await enviar({ accion: 'firmar', codigo, nombre, cartaHash: paso.cartaHash })
    setOcupado(false)
    if (r?.status === 200 && r.j.estado === 'firmada') {
      setPaso({ paso: 'firmada', enviada: false })
      return
    }
    setAviso(typeof r?.j.motivo === 'string' ? r.j.motivo : NO_SE_SABE)
  }

  if (paso.paso === 'firmada') {
    return (
      <p className="confirmacion" style={{ margin: 0 }}>
        {paso.enviada
          ? 'Ya firmaste la carta y se la hemos enviado a tu compañía. Te avisamos cuando la acepte.'
          : 'Carta firmada. Se la mandamos a tu compañía; hasta que la acepte, seguimos sin ser tus corredores en esa póliza.'}
      </p>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {paso.paso === 'inicio' && (
        <button type="button" className="boton secundario" style={{ minHeight: 48 }} disabled={ocupado} onClick={preparar}>
          {ocupado ? 'Cargando…' : 'Nombrarte mi corredor'}
        </button>
      )}
      {(paso.paso === 'revisar' || paso.paso === 'codigo') && (
        <div
          style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.5, padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', overflowWrap: 'anywhere' }}
          aria-label="Carta que vas a firmar"
        >
          {paso.carta}
        </div>
      )}
      {paso.paso === 'revisar' && (corredor ? (
        <p className="suave" style={{ margin: 0, fontSize: 14 }}>Vista de corredor: la carta la firma el cliente con un código a su correo.</p>
      ) : (
        <button type="button" className="boton" style={{ minHeight: 48 }} disabled={ocupado} onClick={pedirCodigo}>
          {ocupado ? 'Enviando…' : 'Mandarme un código para firmar'}
        </button>
      ))}
      {paso.paso === 'codigo' && (
        <>
          <p className="suave" style={{ margin: 0, fontSize: 14 }}>Te hemos mandado un código a {paso.email}. Caduca en {paso.minutos} minutos.</p>
          <label style={{ display: 'grid', gap: 4, fontSize: 14 }}>
            Código
            <input className="campo" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
              value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))} />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 14 }}>
            Tu nombre y apellidos
            <input className="campo" autoComplete="name" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </label>
          {paso.consentimiento && <p className="suave" style={{ margin: 0, fontSize: 13 }}>{paso.consentimiento}</p>}
          <button type="button" className="boton" style={{ minHeight: 48 }}
            disabled={ocupado || codigo.length !== 6 || nombre.trim() === ''} onClick={firmar}>
            {ocupado ? 'Firmando…' : 'Firmar la carta'}
          </button>
          <button type="button" className="boton-tenue" disabled={ocupado} onClick={pedirCodigo}>Mandarme otro código</button>
        </>
      )}
      {aviso && <p className="error-linea" role="alert" style={{ margin: 0 }}>{aviso}</p>}
    </div>
  )
}
