'use client'
import { useState } from 'react'

const MENSAJE: Record<string, string> = {
  documento_cambiado: 'El documento ha cambiado desde que lo abriste: vuelve a leerlo (recarga la página).',
  nombre_no_coincide: 'El nombre no coincide con el del firmante del contrato.',
  titulo_distinto: 'El cargo no es el que figura en el contrato. Si es otro, pide a Grupo ASegura que lo reemita.',
  falta_consentimiento: 'Marca la casilla de conformidad.',
  version_no_firmable: 'Este contrato ya no se puede firmar (caducado, anulado o ya firmado).',
  solo_firma_el_dueno: 'Solo firma el titular de la empresa.',
  incorrecto: 'Código incorrecto.', caducado: 'El código ha caducado. Pide otro.', ya_usado: 'Ese código ya se usó. Pide otro.',
  bloqueado: 'Demasiados intentos. Pide otro código.', sin_codigo: 'Primero pide el código.', datos_invalidos: 'El código son 6 cifras.',
  demasiadas_peticiones: 'Demasiadas peticiones. Espera un rato.', canal_no_disponible: 'El envío de códigos no está disponible. Avisa a Grupo ASegura.',
  envio_fallido: 'No hemos podido enviar el correo. Inténtalo en unos minutos.', ya_firmado: 'Ya estaba firmado.',
}

/** Confirmar cargo · teclear nombre · conformidad · código NUEVO al correo · Firmar. */
export function FirmarCliente(p: { versionId: string; sha256: string; firmante: string; titulo: string; tituloTexto: string; consentimiento: string }) {
  const [cargo, setCargo] = useState(false)
  const [nombre, setNombre] = useState('')
  const [consiento, setConsiento] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [pedido, setPedido] = useState(false)
  const [aviso, setAviso] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [hecho, setHecho] = useState(false)

  async function pedir() {
    setEnviando(true); setError('')
    const r = await fetch('/api/firma/codigo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ versionId: p.versionId }) })
    const j = await r.json().catch(() => ({}))
    setEnviando(false)
    if (!r.ok) { setError(MENSAJE[j.error] ?? 'No se pudo pedir el código.'); return }
    setPedido(true)
    setAviso(j.enviado ? 'Te hemos enviado un código de 6 cifras a tu correo (válido 10 minutos).' : 'El envío por correo no está conectado: avisa a Grupo ASegura.')
  }

  async function firmar(ev: React.FormEvent) {
    ev.preventDefault()
    setEnviando(true); setError('')
    const r = await fetch('/api/firma', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ versionId: p.versionId, sha256: p.sha256, nombre, titulo: cargo ? p.titulo : null, consiento, codigo }) })
    const j = await r.json().catch(() => ({}))
    setEnviando(false)
    if (!r.ok) { setError(MENSAJE[j.error] ?? 'No se pudo firmar.'); return }
    setHecho(true)
  }

  if (hecho) return <div className="banner-contrato" role="status"><p><strong>Contrato firmado.</strong> Las herramientas ya están activas.</p><a className="btn" href="/">Ir a Mi empresa</a></div>

  const listo = cargo && nombre.trim().length > 2 && consiento
  return (
    <form onSubmit={firmar} className="seccion" style={{ display: 'grid', gap: 12, marginTop: 16, padding: 16 }}>
      <h2 style={{ margin: 0 }}>Firmar</h2>
      <label className="casilla"><input type="checkbox" checked={cargo} onChange={(e) => setCargo(e.target.checked)} style={{ width: 22, height: 22 }} />
        <span>Firmo como <strong>{p.tituloTexto}</strong> de la empresa, con facultades suficientes.</span></label>
      <label className="campo">Escribe tu nombre completo, como figura en el contrato ({p.firmante})
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" required /></label>
      <label className="casilla"><input type="checkbox" checked={consiento} onChange={(e) => setConsiento(e.target.checked)} style={{ width: 22, height: 22 }} />
        <span>{p.consentimiento}</span></label>
      {!pedido
        ? <button type="button" className="btn" disabled={!listo || enviando} onClick={pedir}>{enviando ? 'Pidiendo…' : 'Pedir código para firmar'}</button>
        : <>
            {aviso && <p className="tenue" role="status">{aviso}</p>}
            <label className="campo">Código de 6 cifras
              <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} className="pin-grande" required /></label>
            <button type="submit" className="btn" disabled={!listo || codigo.length !== 6 || enviando}>{enviando ? 'Firmando…' : 'Firmar el contrato'}</button>
            <button type="button" className="btn btn-sec" onClick={pedir} disabled={enviando}>Pedir otro código</button>
          </>}
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  )
}
