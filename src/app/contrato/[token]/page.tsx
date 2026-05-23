'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

type Contrato = {
  id: string; numero_contrato: string; estado: string
  fecha_evento: string | null; aforo: number | null
  precio_total: number | null; senial_importe: number | null
  senial_fecha_limite: string | null; condiciones_texto: string | null
  firmado_nombre: string | null; firmado_at: string | null
  firma_token: string
  eventos: {
    cliente_nombre: string; tipo: string
    restaurantes: { nombre: string; nif: string | null; direccion: string | null; ciudad: string | null; telefono: string | null }
  }
}

const fmtEur = (n: number | null) => n ? `${n.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €` : '—'
const fmtFecha = (d: string | null) => {
  if (!d) return '—'
  const dt = new Date(d + 'T00:00:00')
  return `${dt.getDate()} de ${MESES[dt.getMonth()]} de ${dt.getFullYear()}`
}

const C = {
  bg: '#FAFAF8', paper: '#FFFFFF', ink: '#1A1714', ink2: '#3A332C', ink3: '#6B5F52',
  red: '#D9442B', green: '#3F7D44', amber: '#E8A33B', rule: '#E5E0D8', bone: '#F6F1E7',
}

export default function ContratoFirmaPage() {
  const params = useParams()
  const token = params?.token as string
  const [contrato, setContrato] = useState<Contrato | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [nombre, setNombre] = useState('')
  const [dni, setDni] = useState('')
  const [aceptado, setAceptado] = useState(false)
  const [firmando, setFirmando] = useState(false)
  const [firmado, setFirmado] = useState(false)

  useEffect(() => {
    if (!token) return
    fetch(`/api/contrato/publico?token=${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error)
        else {
          setContrato(d.contrato)
          if (d.contrato?.firmado_at) setFirmado(true)
        }
        setLoading(false)
      })
      .catch(() => { setError('Error de conexión'); setLoading(false) })
  }, [token])

  const firmar = async () => {
    if (!nombre || !dni || !aceptado) return
    setFirmando(true)
    const res = await fetch('/api/contrato/firmar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, nombre, dni }),
    })
    const data = await res.json()
    if (res.ok) setFirmado(true)
    else setError(data.error ?? 'Error al firmar')
    setFirmando(false)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontFamily: 'Inter, sans-serif', color: C.ink3 }}>Cargando contrato...</div>
    </div>
  )

  if (error || !contrato) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>❌</div>
        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 16, color: C.ink }}>{error || 'Contrato no encontrado'}</div>
      </div>
    </div>
  )

  const rest = contrato.eventos.restaurantes
  const ev = contrato.eventos

  if (firmado || contrato.firmado_at) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ textAlign: 'center', maxWidth: 400, background: C.paper, borderRadius: 16, padding: 32, border: `1px solid ${C.rule}` }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: 24, fontWeight: 600, fontStyle: 'italic', color: C.ink, marginBottom: 8 }}>
          Contrato firmado
        </div>
        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, color: C.ink3, lineHeight: 1.6 }}>
          {contrato.numero_contrato} · {ev.cliente_nombre}<br />
          {fmtFecha(contrato.fecha_evento)}<br /><br />
          Firmado por <strong>{contrato.firmado_nombre}</strong><br />
          {contrato.firmado_at ? new Date(contrato.firmado_at).toLocaleString('es-ES') : ''}
        </div>
        <div style={{ marginTop: 16, fontFamily: 'Inter, sans-serif', fontSize: 12, color: C.ink3 }}>
          {rest.nombre} · {rest.ciudad}
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: C.bg, padding: '20px 16px 60px' }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', padding: '24px 0 20px' }}>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: 13, color: C.red, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 6 }}>
            Contrato de servicios
          </div>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: 28, fontWeight: 600, fontStyle: 'italic', color: C.ink }}>
            {ev.cliente_nombre}
          </div>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: C.ink3, marginTop: 4 }}>
            {contrato.numero_contrato} · {rest.nombre}
          </div>
        </div>

        {/* Resumen del evento */}
        <div style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: 16, fontWeight: 600, fontStyle: 'italic', color: C.ink, marginBottom: 12 }}>Resumen del evento</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { label: 'Fecha', value: fmtFecha(contrato.fecha_evento) },
              { label: 'Aforo', value: contrato.aforo ? `${contrato.aforo} personas` : '—' },
              { label: 'Precio total', value: fmtEur(contrato.precio_total) },
              { label: 'Señal', value: fmtEur(contrato.senial_importe) },
              { label: 'Fecha límite señal', value: fmtFecha(contrato.senial_fecha_limite) },
              { label: 'Espacio', value: rest.ciudad ?? '—' },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, color: C.ink3, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 2 }}>{label}</div>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: 15, fontWeight: 600, fontStyle: 'italic', color: C.ink }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Condiciones */}
        {contrato.condiciones_texto && (
          <div style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: 16, fontWeight: 600, fontStyle: 'italic', color: C.ink, marginBottom: 12 }}>Condiciones del contrato</div>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: C.ink2, lineHeight: 1.7, whiteSpace: 'pre-line' }}>
              {contrato.condiciones_texto}
            </div>
          </div>
        )}

        {/* Formulario de firma */}
        <div style={{ background: C.paper, border: `2px solid ${C.ink}`, borderRadius: 12, padding: 20 }}>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: 16, fontWeight: 600, fontStyle: 'italic', color: C.ink, marginBottom: 16 }}>✍️ Firma digital</div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: C.ink3, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.08em' }}>Nombre completo *</div>
            <input type="text" placeholder="María García López" value={nombre} onChange={e => setNombre(e.target.value)}
              style={{ width: '100%', background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 6, padding: '10px 12px', fontFamily: 'Inter, sans-serif', fontSize: 14, color: C.ink, boxSizing: 'border-box' as const }} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: C.ink3, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.08em' }}>DNI / NIE *</div>
            <input type="text" placeholder="12345678A" value={dni} onChange={e => setDni(e.target.value)}
              style={{ width: '100%', background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 6, padding: '10px 12px', fontFamily: 'Inter, sans-serif', fontSize: 14, color: C.ink, boxSizing: 'border-box' as const }} />
          </div>

          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 20, cursor: 'pointer' }}>
            <input type="checkbox" checked={aceptado} onChange={e => setAceptado(e.target.checked)}
              style={{ marginTop: 3, flexShrink: 0 }} />
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: C.ink2, lineHeight: 1.5 }}>
              He leído y acepto las condiciones del contrato {contrato.numero_contrato} con {rest.nombre}.
              Entiendo que esta firma digital tiene la misma validez que una firma manuscrita.
            </span>
          </label>

          <button onClick={firmar} disabled={!nombre || !dni || !aceptado || firmando}
            style={{ width: '100%', padding: '14px', borderRadius: 8, border: 'none', background: (!nombre || !dni || !aceptado || firmando) ? C.rule : C.ink, color: (!nombre || !dni || !aceptado || firmando) ? C.ink3 : C.bone, fontFamily: 'Inter, sans-serif', fontSize: 15, fontWeight: 600, cursor: (!nombre || !dni || !aceptado || firmando) ? 'not-allowed' : 'pointer' }}>
            {firmando ? 'Firmando...' : '✍️ Firmar contrato'}
          </button>

          {error && <div style={{ marginTop: 10, color: C.red, fontFamily: 'Inter, sans-serif', fontSize: 13 }}>{error}</div>}
        </div>

        <div style={{ textAlign: 'center', padding: '20px 0 0', fontFamily: 'Inter, sans-serif', fontSize: 11, color: C.rule }}>
          Firmado digitalmente · Gestionado con ia.rest
        </div>
      </div>
    </div>
  )
}
