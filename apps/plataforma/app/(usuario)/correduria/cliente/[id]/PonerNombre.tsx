'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { revisarEdicion } from '@central/module-seguros'
import { btnStyle } from '@/components/ui'
import { interpretarEscritura, textoMotivo } from '@/lib/cliente-edicion-asegura'

/**
 * ✏️ junto al título de una ficha SIN NOMBRE (28/09/2026, Alberto: «¿cómo puedo
 * editar un nombre?»). El único sitio para editar el nombre era «Editar
 * identidad», al fondo de Contactos, y además bloqueado sin un DNI recibido:
 * en un lead que solo tiene email, eso era no poder ponerle nombre nunca.
 *
 * Solo aparece cuando la ficha no tiene nombre, y solo rellena nombre y
 * apellidos: corregir un nombre que YA existe sigue pidiendo el DNI. La
 * excepción la vuelve a decidir asegura con lo que hay en la BD, así que esta
 * pantalla no puede saltarse la regla aunque quisiera.
 */
export default function PonerNombre({ clienteId, apellidos }: { clienteId: string; apellidos: string }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState('')
  const [ape, setApe] = useState(apellidos)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    const identidad = { nombre, ...(ape.trim() !== apellidos.trim() ? { apellidos: ape.trim() === '' ? null : ape } : {}) }
    const rev = revisarEdicion({ identidad }, { fichaSinNombre: true })
    if (!rev.ok) return setError(textoMotivo(rev.motivo))
    setError(null)
    setOcupado(true)
    try {
      const res = await fetch('/api/correduria/cliente', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: clienteId, identidad }),
      })
      const r = interpretarEscritura(res.status, await res.json().catch(() => null))
      if (r.estado === 'ok') {
        setAbierto(false)
        router.refresh()
      } else {
        setError(r.estado === 'no_encontrado' ? 'Esa ficha ya no está en la cartera.' : 'motivo' in r ? `No se ha guardado: ${textoMotivo(r.motivo)}` : 'No se ha guardado.')
      }
    } catch {
      setError('No se ha guardado: no se pudo llegar a asegura.')
    } finally {
      setOcupado(false)
    }
  }

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }} aria-label="Poner nombre">
        <Pencil size={16} strokeWidth={1.75} aria-hidden /> Poner nombre
      </button>
    )
  }

  const campo: React.CSSProperties = { minHeight: 44, fontSize: 16, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', minWidth: 0 }
  return (
    <form onSubmit={guardar} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8, marginTop: 8, maxWidth: 520 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
        <input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" aria-label="Nombre" style={campo} />
        <input value={ape} onChange={(e) => setApe(e.target.value)} placeholder="Apellidos" aria-label="Apellidos" style={campo} />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="submit" disabled={ocupado} style={{ ...btnStyle('primario'), minHeight: 44 }}>{ocupado ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" disabled={ocupado} onClick={() => { setAbierto(false); setError(null) }} style={{ ...btnStyle('sutil'), minHeight: 44 }}>Cancelar</button>
      </div>
      {error && <div style={{ fontSize: 13, color: 'var(--negative)' }}>{error}</div>}
    </form>
  )
}
