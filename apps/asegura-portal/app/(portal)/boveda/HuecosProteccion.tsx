'use client'
import { useState } from 'react'

import { RAMOS_BASICOS, TEXTO_HUECOS, type EstadoHuecos, type RamoBasico } from '@/lib/huecos-proteccion'

/**
 * «Lo que no tienes asegurado»: tarjeta discreta de la bóveda (13/10/2026). El servidor decide si sale y
 * qué huecos (`huecosDeProteccion`/`estadoHuecos`); aquí solo se pinta y se pulsa. Sin importes ni presión,
 * cerrable. «Ya lo hemos recibido» solo cuando el servidor lo confirma.
 */
export function HuecosProteccion({ huecos, estado }: { huecos: RamoBasico[]; estado: Exclude<EstadoHuecos, 'oculta'> }) {
  const [vista, setVista] = useState<'mostrar' | 'pedido' | 'cerrada'>(estado === 'ya_pedido' ? 'pedido' : 'mostrar')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function enviar(accion: 'pedir' | 'cerrar') {
    setEnviando(true)
    setError(null)
    try {
      const r = await fetch('/api/huecos-proteccion', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(accion === 'pedir' ? { accion, ramos: huecos } : { accion }),
      })
      const j = (await r.json().catch(() => null)) as { estado?: string } | null
      if (r.ok && (j?.estado === 'pedida' || j?.estado === 'ya_pedido')) setVista('pedido')
      else if (r.ok && j?.estado === 'cerrada') setVista('cerrada')
      else setError(TEXTO_HUECOS.errorEnvio)
    } catch {
      setError(TEXTO_HUECOS.errorEnvio)
    } finally {
      setEnviando(false)
    }
  }

  if (vista === 'cerrada') return null

  return (
    <section className="aviso-linea" aria-labelledby="huecos-titulo" style={{ marginBottom: 20, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <strong id="huecos-titulo">{TEXTO_HUECOS.titulo}</strong>
        <button
          type="button"
          className="boton-tenue"
          onClick={() => void enviar('cerrar')}
          disabled={enviando}
          aria-label={`${TEXTO_HUECOS.cerrar}: ${TEXTO_HUECOS.titulo}`}
          style={{ minHeight: 44, minWidth: 44 }}
        >
          {TEXTO_HUECOS.cerrar}
        </button>
      </div>
      {vista === 'pedido' ? (
        <p className="linea" role="status" style={{ margin: '6px 0 0' }}>
          {TEXTO_HUECOS.yaPedido}
        </p>
      ) : (
        <>
          <p className="linea" style={{ margin: '6px 0 0' }}>
            {TEXTO_HUECOS.intro}
          </p>
          <ul className="linea" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {huecos.map((h) => (
              <li key={h}>{RAMOS_BASICOS.find((b) => b.ramo === h)?.frase ?? h}</li>
            ))}
          </ul>
          {error && (
            <p className="editor-error" role="alert">
              {error}
            </p>
          )}
          <div className="editor-acciones" style={{ marginTop: 10 }}>
            <button type="button" className="boton" onClick={() => void enviar('pedir')} disabled={enviando}>
              {enviando ? 'Enviando…' : TEXTO_HUECOS.boton}
            </button>
          </div>
        </>
      )}
    </section>
  )
}
