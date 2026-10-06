'use client'

// «Falta por completar» de una figura (06/10/2026): lo que el aviso «Falta en su ficha: …» dice que falta y
// se escribe con un campo simple (sexo, móvil) va JUNTO y con UN solo Guardar, sin salir de la pantalla.
// Escribe en lo que lee el aviso: sexo → PATCH de la ficha (`sexo`: 'hombre'|'mujer' → `clientes.saludo`);
// móvil → alta de teléfono principal (se espeja en `clientes.telefono`). Cada campo se guarda solo si se ha
// rellenado; sin opción por defecto. Lo demás (DNI, nombre, apellido, nacimiento, carné) tiene su formulario
// debajo, con sus reglas de documento/motivo. Al guardar, `router.refresh()` y el aviso se actualiza.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { normalizarTelefono } from '@central/module-seguros'
import { btnStyle } from '@/components/ui'
import { interpretarEscritura } from '@/lib/cliente-edicion-asegura'

type Sexo = '' | 'hombre' | 'mujer'
const input = { minWidth: 0, minHeight: 44, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 16 } as const

export default function FaltaPorCompletar({ clienteId, faltaSexo, faltaMovil, tambien, onGuardado }: {
  clienteId: string
  faltaSexo: boolean
  faltaMovil: boolean
  /** Otros datos que faltan y se corrigen en los formularios de debajo (rótulos). */
  tambien: string[]
  onGuardado: () => void
}) {
  const router = useRouter()
  const [sexo, setSexo] = useState<Sexo>('')
  const [movil, setMovil] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [errores, setErrores] = useState<string[]>([])

  const hayAlgo = (faltaSexo && sexo !== '') || (faltaMovil && movil.trim() !== '')

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    const fallos: string[] = []
    let telefono: string | null = null
    if (faltaMovil && movil.trim() !== '') {
      const n = normalizarTelefono(movil)
      if (!n.ok) return setErrores([`Móvil: ${n.motivo}`])
      telefono = n.valor
    }
    setErrores([])
    setOcupado(true)
    let algoGuardado = false
    try {
      if (faltaSexo && sexo !== '') {
        try {
          const res = await fetch('/api/correduria/cliente', {
            method: 'PATCH', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: clienteId, sexo }),
          })
          const r = interpretarEscritura(res.status, await res.json().catch(() => null))
          if (r.estado === 'ok') { algoGuardado = true; setSexo('') } else fallos.push(r.estado === 'invalido' ? `Sexo: ${r.motivo}` : 'Sexo: no se ha podido guardar.')
        } catch { fallos.push('Sexo: no se ha podido guardar (sin conexión).') }
      }
      if (telefono !== null) {
        try {
          const res = await fetch('/api/correduria/cliente/contactos', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ clienteId, tipo: 'telefono', valor: telefono, etiqueta: null, principal: true }),
          })
          const r = interpretarEscritura(res.status, await res.json().catch(() => null))
          if (r.estado === 'ok') { algoGuardado = true; setMovil('') }
          else if (r.estado === 'conflicto') fallos.push('Móvil: ya está en otra ficha. Corrígelo o añádelo desde la ficha de la persona.')
          else fallos.push(r.estado === 'invalido' ? `Móvil: ${r.motivo}` : 'Móvil: no se ha podido guardar.')
        } catch { fallos.push('Móvil: no se ha podido guardar (sin conexión).') }
      }
      setErrores(fallos)
      if (algoGuardado) { onGuardado(); router.refresh() }
    } finally {
      setOcupado(false)
    }
  }

  return (
    <form onSubmit={guardar} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8, border: '1px solid var(--warning)', borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>Falta por completar</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {faltaSexo && (
          <label style={{ display: 'grid', gap: 4, flex: '1 1 180px', minWidth: 0, fontSize: 13 }}>
            Sexo
            <select value={sexo} onChange={(e) => setSexo(e.target.value as Sexo)} disabled={ocupado} style={input}>
              <option value="">Elige…</option>
              <option value="hombre">Hombre</option>
              <option value="mujer">Mujer</option>
            </select>
          </label>
        )}
        {faltaMovil && (
          <label style={{ display: 'grid', gap: 4, flex: '1 1 180px', minWidth: 0, fontSize: 13 }}>
            Móvil
            <input type="tel" inputMode="tel" autoComplete="off" placeholder="600 000 000" value={movil}
              onChange={(e) => setMovil(e.target.value)} disabled={ocupado} style={input} />
          </label>
        )}
      </div>
      <div>
        <button type="submit" disabled={ocupado || !hayAlgo} style={{ ...btnStyle('primario', 'sm'), minHeight: 44 }}>
          {ocupado ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
      {tambien.length > 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>También falta: {tambien.join(', ')} (en los formularios de abajo).</div>}
      {errores.map((m) => <div key={m} role="alert" style={{ fontSize: 12, color: 'var(--negative)' }}>{m}</div>)}
    </form>
  )
}
