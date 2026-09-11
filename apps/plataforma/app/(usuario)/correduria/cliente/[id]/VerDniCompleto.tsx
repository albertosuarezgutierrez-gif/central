'use client'
import { useState } from 'react'
import { btnStyle } from '@/components/ui'

/**
 * «Ver DNI completo» — el ÚNICO camino para destapar el DNI entero de un
 * cliente. El resto de la ficha lo enseña enmascarado a propósito
 * (`*****678Z`, puerto de asegura); esto existe para el caso real de Alberto:
 * copiarlo a la intranet de una compañía.
 *
 * Dos pasos, cada uno su propia llamada:
 * 1. Pide un código → llega SOLO al Telegram de Alberto (nunca a esta pantalla).
 * 2. Lo teclea aquí (5 min de margen) → si coincide, asegura lo descifra y
 *    queda visible EN MEMORIA — no se guarda en ningún sitio del navegador— con
 *    un botón «Copiar» y se oculta solo al cerrar/recargar la página.
 *
 * Cada revelación deja fila en `historial_interno` de la ficha (la escribe el
 * puerto de asegura, no aquí): quien mira el histórico ve que se pidió, cuándo
 * y quién estaba en sesión.
 */
export default function VerDniCompleto({ clienteId }: { clienteId: string }) {
  const [paso, setPaso] = useState<'cerrado' | 'pidiendo' | 'esperando_codigo' | 'revelado'>('cerrado')
  const [codigo, setCodigo] = useState('')
  const [dni, setDni] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)

  async function pedirCodigo() {
    setError(null)
    setPaso('pidiendo')
    try {
      const res = await fetch(`/api/correduria/cliente/${clienteId}/dni-codigo`, { method: 'POST' })
      if (!res.ok) throw new Error()
      setPaso('esperando_codigo')
    } catch {
      setError('No se ha podido pedir el código. Reinténtalo.')
      setPaso('cerrado')
    }
  }

  async function revelar() {
    setError(null)
    try {
      const res = await fetch(`/api/correduria/cliente/${clienteId}/dni-revelar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ codigo }),
      })
      const j = (await res.json().catch(() => null)) as Record<string, unknown> | null
      if (!res.ok || j?.estado !== 'ok' || typeof j.dni !== 'string') {
        setError(
          j?.estado === 'invalido' ? 'Código incorrecto o caducado. Pide uno nuevo.'
            : j?.estado === 'ilegible' ? 'El DNI está guardado pero cifrado con una clave que no abre.'
              : j?.estado === 'sin_dni' ? 'No consta DNI en la ficha.'
                : 'No se ha podido revelar el DNI.',
        )
        return
      }
      setDni(j.dni)
      setPaso('revelado')
    } catch {
      setError('No se ha podido comprobar el código. Reinténtalo.')
    }
  }

  async function copiar() {
    if (!dni) return
    try {
      await navigator.clipboard.writeText(dni)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Sin acceso al portapapeles (http, permiso denegado…): el DNI sigue
      // visible en pantalla para copiarlo a mano.
    }
  }

  if (paso === 'revelado' && dni) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontWeight: 800 }}>{dni}</span>
        <button type="button" onClick={copiar} style={btnStyle('secundario', 'sm')}>
          {copiado ? '✓ Copiado' : '📋 Copiar'}
        </button>
      </span>
    )
  }

  if (paso === 'esperando_codigo') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <input
          type="text"
          inputMode="numeric"
          placeholder="Código de Telegram"
          value={codigo}
          onChange={e => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
          style={{ width: 130, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14 }}
        />
        <button type="button" onClick={revelar} disabled={codigo.length !== 6} style={btnStyle('primario', 'sm')}>
          Ver
        </button>
        {error && <span style={{ fontSize: 11, color: 'var(--negative)' }}>{error}</span>}
      </span>
    )
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <button type="button" onClick={pedirCodigo} disabled={paso === 'pidiendo'} style={btnStyle('secundario', 'sm')} title="Pide un código de un solo uso a tu Telegram para ver el DNI completo">
        {paso === 'pidiendo' ? 'Pidiendo código…' : '🔓 Ver DNI completo'}
      </button>
      {error && <span style={{ fontSize: 11, color: 'var(--negative)' }}>{error}</span>}
    </span>
  )
}
