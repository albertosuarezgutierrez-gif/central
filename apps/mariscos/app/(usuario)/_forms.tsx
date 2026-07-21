'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const HOY = () => new Date().toISOString().slice(0, 10)

/* ── Recepción de una partida (datos del albarán) ─────────────────────────── */
export function NuevaPartidaForm() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const fd = new FormData(e.currentTarget)
    const body = Object.fromEntries(fd.entries())
    try {
      const res = await fetch('/api/partidas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError((j.errores && j.errores.join(' ')) || j.error || 'No se pudo guardar')
        return
      }
      e.currentTarget.reset()
      setOpen(false)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button className="primary" onClick={() => setOpen(true)}>
        + Recepcionar partida
      </button>
    )
  }

  return (
    <form onSubmit={onSubmit} className="card grid" style={{ gap: 12 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Recepción de partida</h2>
        <button type="button" className="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>

      <div className="form-grid">
        <div>
          <label>Producto *</label>
          <input name="producto" required placeholder="Gamba blanca" />
        </div>
        <div>
          <label>Nombre científico</label>
          <input name="nombreCientifico" placeholder="Parapenaeus longirostris" />
        </div>
        <div>
          <label>Calibre</label>
          <input name="calibre" placeholder="40/60" />
        </div>
        <div>
          <label>Lote de origen *</label>
          <input name="loteOrigen" required placeholder="L-2026-0042" />
        </div>
        <div>
          <label>Nº albarán</label>
          <input name="albaran" placeholder="ALB-778" />
        </div>
        <div>
          <label>Proveedor</label>
          <input name="proveedor" placeholder="Barcos del Sur SL" />
        </div>
        <div>
          <label>Marea</label>
          <input name="marea" placeholder="MAR-15" />
        </div>
        <div>
          <label>Barco</label>
          <input name="barco" placeholder="Nuevo Amanecer" />
        </div>
        <div>
          <label>Zona de captura (FAO)</label>
          <input name="zonaCaptura" placeholder="FAO 27" />
        </div>
        <div>
          <label>Arte de pesca</label>
          <input name="artePesca" placeholder="Arrastre" />
        </div>
        <div>
          <label>Método de producción</label>
          <select name="metodoProduccion" defaultValue="capturado">
            <option value="capturado">Capturado</option>
            <option value="capturado_agua_dulce">Capturado en agua dulce</option>
            <option value="criado">Criado (acuicultura)</option>
          </select>
        </div>
        <div>
          <label>Fecha de captura</label>
          <input name="fechaCaptura" type="date" />
        </div>
        <div>
          <label>Fecha de recepción</label>
          <input name="fechaRecepcion" type="date" defaultValue={HOY()} />
        </div>
        <div>
          <label>Caducidad</label>
          <input name="fechaCaducidad" type="date" />
        </div>
        <div>
          <label>Peso recibido (kg) *</label>
          <input name="pesoRecibidoKg" type="number" step="0.001" min="0" required placeholder="20" />
        </div>
        <div>
          <label>Precio compra (€/kg)</label>
          <input name="precioCompraKg" type="number" step="0.01" min="0" placeholder="12" />
        </div>
        <div>
          <label>Precio venta (€/kg)</label>
          <input name="precioVentaKg" type="number" step="0.01" min="0" placeholder="18" />
        </div>
      </div>

      <div>
        <label>Notas</label>
        <textarea name="notas" rows={2} />
      </div>

      {error && <div className="err">{error}</div>}
      <div>
        <button className="primary" disabled={loading}>
          {loading ? 'Guardando…' : 'Guardar recepción'}
        </button>
      </div>
    </form>
  )
}

/* ── Envasar una unidad de venta a partir de una partida ──────────────────── */
export function EnvasarForm({
  partidaId,
  precioVentaKg,
  restanteKg,
}: {
  partidaId: string
  precioVentaKg: number | null
  restanteKg: number
}) {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const fd = new FormData(e.currentTarget)
    const body = { partidaId, ...Object.fromEntries(fd.entries()) }
    try {
      const res = await fetch('/api/envasados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError((j.errores && j.errores.join(' ')) || j.error || 'No se pudo envasar')
        return
      }
      // Abre la etiqueta imprimible del envase recién creado.
      if (j.id) window.open(`/etiqueta/${j.id}`, '_blank')
      e.currentTarget.reset()
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid" style={{ gap: 12 }}>
      <div className="form-grid">
        <div>
          <label>Canal *</label>
          <select name="canal" defaultValue="mostrador">
            <option value="mostrador">Mostrador (ticket, sin lote)</option>
            <option value="catering">Catering / bares (con lote)</option>
            <option value="hotel">Hotel (con lote)</option>
          </select>
        </div>
        <div>
          <label>Peso (kg) * — quedan {restanteKg}</label>
          <input name="pesoKg" type="number" step="0.001" min="0" max={restanteKg} required />
        </div>
        <div>
          <label>Precio (€/kg) *</label>
          <input
            name="precioKg"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={precioVentaKg ?? undefined}
          />
        </div>
        <div>
          <label>Caducidad (opcional)</label>
          <input name="fechaCaducidad" type="date" />
        </div>
        <div>
          <label>Cliente (catering/hotel)</label>
          <input name="cliente" placeholder="Bar Manolo" />
        </div>
      </div>
      {error && <div className="err">{error}</div>}
      <div>
        <button className="primary" disabled={loading || restanteKg <= 0}>
          {loading ? 'Envasando…' : 'Envasar e imprimir etiqueta'}
        </button>
      </div>
    </form>
  )
}
