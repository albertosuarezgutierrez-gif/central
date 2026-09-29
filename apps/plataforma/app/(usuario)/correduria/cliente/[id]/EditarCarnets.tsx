'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus } from 'lucide-react'
import { TIPOS_CARNET, claveTipoCarnet } from '@central/module-seguros'
import { btnStyle } from '@/components/ui'
import type { CarnetFicha } from '@/lib/ficha-asegura'

/**
 * Añadir, corregir o quitar los carnés de la ficha (29/09/2026, Alberto: «añadir o modificar fecha
 * de carnet»). Hasta hoy solo los escribían CIMA (el B del conductor de un coche) y «Nueva persona»:
 * una ficha con «sin carné registrado» no tenía por dónde completarse, y Avant2 lo pide para tarificar.
 *
 * Uno por tipo (asegura contesta 409 si ya lo tiene) y la fecha es la de EXPEDICIÓN o última
 * renovación; la caducidad se calcula, no se teclea. Si la ficha no tiene ninguno pero su póliza trae
 * la fecha (CIMA, sin tipo), el alta sale ya rellena con ella como B, que es lo que CIMA sabe.
 */
export default function EditarCarnets({ clienteId, carnets, fechaPoliza }: { clienteId: string; carnets: CarnetFicha[]; fechaPoliza: string | null }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filas, setFilas] = useState(() => carnets.map((k) => ({ id: k.id, tipo: claveTipoCarnet(k.tipo), fecha: k.fechaExpedicion?.slice(0, 10) ?? '' })))
  const libre = TIPOS_CARNET.find((t) => !carnets.some((k) => claveTipoCarnet(k.tipo) === t)) ?? 'B'
  const [nuevo, setNuevo] = useState({ tipo: libre as string, fecha: carnets.length === 0 ? (fechaPoliza?.slice(0, 10) ?? '') : '' })

  async function enviar(method: 'POST' | 'PATCH' | 'DELETE', body: Record<string, unknown>) {
    setError(null)
    setOcupado(true)
    try {
      const res = await fetch('/api/correduria/cliente/carnets', {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clienteId, ...body }),
      })
      const j = (await res.json().catch(() => null)) as { estado?: string; motivo?: string } | null
      if (res.ok && j?.estado === 'ok') {
        setAbierto(false)
        router.refresh()
        return
      }
      setError(
        j?.estado === 'sin_configurar'
          ? 'No se ha guardado: el puerto de asegura no está conectado.'
          : `No se ha guardado${j?.motivo ? `: ${j.motivo}` : ` (HTTP ${res.status}).`}`,
      )
    } catch {
      setError('No se ha guardado: no se pudo llegar a asegura.')
    } finally {
      setOcupado(false)
    }
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => {
          setFilas(carnets.map((k) => ({ id: k.id, tipo: claveTipoCarnet(k.tipo), fecha: k.fechaExpedicion?.slice(0, 10) ?? '' })))
          setAbierto(true)
        }}
        style={{ ...btnStyle('sutil', 'sm'), minHeight: 44 }}
      >
        {carnets.length === 0 ? <Plus size={14} strokeWidth={1.75} aria-hidden /> : <Pencil size={14} strokeWidth={1.75} aria-hidden />}
        {carnets.length === 0 ? 'Añadir carné' : 'Editar carnés'}
      </button>
    )
  }

  const campo: React.CSSProperties = { minHeight: 44, fontSize: 16, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', minWidth: 0 }
  const fila: React.CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }
  const selTipo = (valor: string, cambiar: (t: string) => void, etiqueta: string) => (
    <select value={valor} onChange={(e) => cambiar(e.target.value)} aria-label={etiqueta} style={{ ...campo, width: 84 }}>
      {TIPOS_CARNET.map((t) => <option key={t} value={t}>{t}</option>)}
    </select>
  )

  return (
    <div style={{ flexBasis: '100%', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8, marginTop: 6, maxWidth: 560 }}>
      {filas.map((f, i) => (
        <form
          key={f.id}
          onSubmit={(e) => { e.preventDefault(); void enviar('PATCH', { id: f.id, tipo: f.tipo, fecha: f.fecha }) }}
          style={fila}
        >
          {selTipo(f.tipo, (t) => setFilas((xs) => xs.map((x, j) => (j === i ? { ...x, tipo: t } : x))), 'Tipo de carné')}
          <input
            type="date"
            value={f.fecha}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setFilas((xs) => xs.map((x, j) => (j === i ? { ...x, fecha: e.target.value } : x)))}
            aria-label={`Fecha de expedición del carné ${f.tipo}`}
            style={campo}
          />
          <button type="submit" disabled={ocupado} style={{ ...btnStyle('primario', 'sm'), minHeight: 44 }}>Guardar</button>
          <button
            type="button"
            disabled={ocupado}
            onClick={() => { if (window.confirm(`¿Quitar el carné ${f.tipo} de la ficha?`)) void enviar('DELETE', { id: f.id }) }}
            style={{ ...btnStyle('sutil', 'sm'), minHeight: 44 }}
          >
            Quitar
          </button>
        </form>
      ))}
      <form onSubmit={(e) => { e.preventDefault(); void enviar('POST', nuevo) }} style={fila}>
        {selTipo(nuevo.tipo, (t) => setNuevo((n) => ({ ...n, tipo: t })), 'Tipo del carné nuevo')}
        <input
          type="date"
          value={nuevo.fecha}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => setNuevo((n) => ({ ...n, fecha: e.target.value }))}
          aria-label="Fecha de expedición del carné nuevo"
          style={campo}
        />
        <button type="submit" disabled={ocupado || nuevo.fecha === ''} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>
          <Plus size={14} strokeWidth={1.75} aria-hidden /> Añadir
        </button>
        <button type="button" disabled={ocupado} onClick={() => { setAbierto(false); setError(null) }} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44 }}>
          Cerrar
        </button>
      </form>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>Fecha de expedición o última renovación. La caducidad se calcula sola.</div>
      {error && <div style={{ fontSize: 13, color: 'var(--negative)' }}>{error}</div>}
    </div>
  )
}
