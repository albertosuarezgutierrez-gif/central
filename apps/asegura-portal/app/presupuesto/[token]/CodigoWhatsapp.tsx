'use client'
import { useId, useState } from 'react'

/**
 * «Tengo el código del WhatsApp» (07/10/2026): el código de acceso que Alberto manda EN el mismo
 * WhatsApp que el enlace. Abre ESTE presupuesto sin pedir nada al correo (puede que no tenga).
 *
 * El token es el de la URL que ya tiene abierta: no es un dato nuevo que se le dé. Lo comprueba el
 * servidor (`/api/presupuesto/whatsapp` → asegura); aquí no se decide nada. Si vale, se recarga la
 * carátula, que con la cookie de acceso lleva dentro.
 */
const TEXTOS: Record<string, string> = {
  bloqueado: 'Has probado demasiadas veces. Escríbeme y te mando un enlace nuevo, o entra con tu correo.',
  caducado: 'Este código ya ha caducado. Escríbeme y te preparo el presupuesto de nuevo, o entra con tu correo.',
  sin_codigo: 'Este enlace no lleva código de WhatsApp: entra con tu correo, aquí debajo.',
  no_encontrado: 'Este enlace ya no sirve: puede que te haya mandado uno más nuevo. Usa el último que tengas.',
  demasiados_intentos: 'Demasiados intentos desde aquí. Espera unos minutos y vuelve a probar.',
  invalido: 'El código son 6 cifras.',
  canal_no_disponible: 'Ahora mismo no puedo comprobar el código. Inténtalo en un rato o entra con tu correo.',
}

export function CodigoWhatsapp({ token }: { token: string }) {
  const uid = useId()
  const [codigo, setCodigo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function entrar() {
    setEnviando(true)
    setError(null)
    try {
      const r = await fetch('/api/presupuesto/whatsapp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, codigo }),
      })
      if (r.ok) {
        window.location.reload()
        return
      }
      const j = (await r.json().catch(() => null)) as { estado?: unknown; quedan?: unknown } | null
      const estado = typeof j?.estado === 'string' ? j.estado : ''
      if (estado === 'incorrecto') {
        const quedan = typeof j?.quedan === 'number' ? j.quedan : null
        setError(quedan === null ? 'Ese código no es.' : quedan === 0 ? TEXTOS.bloqueado! : `Ese código no es. Te quedan ${quedan} intento${quedan === 1 ? '' : 's'}.`)
      } else {
        setError(TEXTOS[estado] ?? 'No he podido comprobar el código. Vuelve a probar en un momento.')
      }
    } catch {
      setError('No he podido comprobar el código: comprueba tu conexión e inténtalo otra vez.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="editor" style={{ marginTop: 12 }}>
      <label htmlFor={`${uid}-wa`} style={{ fontSize: 13, fontWeight: 600 }}>
        El código de acceso del WhatsApp
      </label>
      <input
        id={`${uid}-wa`}
        inputMode="numeric"
        autoComplete="one-time-code"
        className="campo"
        maxLength={6}
        value={codigo}
        onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
        placeholder="123456"
        disabled={enviando}
      />
      <button type="button" className="boton" style={{ minHeight: 48 }} onClick={() => void entrar()} disabled={enviando || codigo.length !== 6}>
        {enviando ? 'Entrando…' : 'Entrar con el código'}
      </button>
      {error && (
        <p className="editor-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
