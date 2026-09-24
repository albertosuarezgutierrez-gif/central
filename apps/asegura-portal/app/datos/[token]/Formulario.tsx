'use client'
import { useState } from 'react'
import type { CampoSolicitud } from '@central/module-seguros'

type Estado = { tipo: 'editando' } | { tipo: 'enviando' } | { tipo: 'hecho' } | { tipo: 'fallo'; texto: string }

/** El formulario del enlace de datos. Pinta los campos que manda asegura y nada más. */
export default function Formulario({ token, campos }: { token: string; campos: CampoSolicitud[] }) {
  const [valores, setValores] = useState<Record<string, string | boolean>>({})
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [estado, setEstado] = useState<Estado>({ tipo: 'editando' })

  if (estado.tipo === 'hecho') {
    return <p><strong>¡Gracias!</strong> Ya tenemos tus datos. Te escribimos en cuanto tengamos el precio.</p>
  }

  const poner = (clave: string, v: string | boolean) => setValores((p) => ({ ...p, [clave]: v }))
  const visible = (c: CampoSolicitud) => !c.siMarcado || valores[c.siMarcado] === true

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setEstado({ tipo: 'enviando' })
    setErrores({})
    let status = 0
    let json: Record<string, unknown> | null = null
    try {
      const res = await fetch('/api/datos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, respuestas: valores }),
      })
      status = res.status
      json = (await res.json().catch(() => null)) as Record<string, unknown> | null
    } catch {
      /* sin conexión */
    }
    if (status === 200) return setEstado({ tipo: 'hecho' })
    if (status === 422 && json?.errores && typeof json.errores === 'object') {
      setErrores(json.errores as Record<string, string>)
      return setEstado({ tipo: 'fallo', texto: 'Revisa los campos marcados.' })
    }
    if (status === 410) return setEstado({ tipo: 'fallo', texto: 'Este enlace ya no sirve (caducado o ya usado). Escríbenos y te mandamos uno nuevo.' })
    if (status === 429) return setEstado({ tipo: 'fallo', texto: 'Demasiados intentos. Espera unos minutos.' })
    setEstado({ tipo: 'fallo', texto: 'No se ha podido enviar. Vuelve a probar en un momento.' })
  }

  return (
    <form onSubmit={enviar} noValidate style={{ display: 'grid', gap: 14 }}>
      {campos.filter(visible).map((c) => {
        const id = `c-${c.clave}`
        const err = errores[c.clave]
        return (
          <div key={c.clave} className="editor-campo">
            <label htmlFor={id}>
              {c.etiqueta}
              {!c.obligatorio && <span className="suave"> (opcional)</span>}
            </label>
            {c.tipo === 'opcion' && (
              <select id={id} className="campo" value={String(valores[c.clave] ?? '')} onChange={(e) => poner(c.clave, e.target.value)}>
                <option value="">Elige…</option>
                {c.opciones?.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
              </select>
            )}
            {c.tipo === 'si_no' && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {[true, false].map((v) => (
                  <button
                    key={String(v)}
                    type="button"
                    className={valores[c.clave] === v ? 'boton' : 'boton-tenue'}
                    style={{ minHeight: 44, minWidth: 88 }}
                    aria-pressed={valores[c.clave] === v}
                    onClick={() => poner(c.clave, v)}
                  >
                    {v ? 'Sí' : 'No'}
                  </button>
                ))}
              </div>
            )}
            {c.tipo === 'texto_largo' && (
              <textarea id={id} className="campo" rows={3} maxLength={1000} value={String(valores[c.clave] ?? '')} onChange={(e) => poner(c.clave, e.target.value)} />
            )}
            {(c.tipo === 'texto' || c.tipo === 'fecha' || c.tipo === 'numero') && (
              <input
                id={id}
                className="campo"
                type={c.tipo === 'fecha' ? 'date' : 'text'}
                inputMode={c.tipo === 'numero' ? 'numeric' : undefined}
                autoCapitalize={c.clave === 'matricula' || c.clave === 'dni' ? 'characters' : undefined}
                value={String(valores[c.clave] ?? '')}
                onChange={(e) => poner(c.clave, e.target.value)}
              />
            )}
            {c.ayuda && <span className="editor-ayuda">{c.ayuda}</span>}
            {err && <span className="editor-error" role="alert">{err}</span>}
          </div>
        )
      })}
      {estado.tipo === 'fallo' && <p className="editor-error" role="alert">{estado.texto}</p>}
      <p className="suave" style={{ margin: 0, fontSize: 13 }}>
        Usamos estos datos solo para prepararte el presupuesto (Grupo ASegura, correduría de seguros).
      </p>
      <button type="submit" className="boton" style={{ minHeight: 48 }} disabled={estado.tipo === 'enviando'}>
        {estado.tipo === 'enviando' ? 'Enviando…' : 'Enviar mis datos'}
      </button>
    </form>
  )
}
