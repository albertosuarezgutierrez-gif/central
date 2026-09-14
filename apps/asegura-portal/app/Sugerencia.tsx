'use client'
import { useEffect, useId, useRef, useState } from 'react'

import { MAX_SUGERENCIA, MIN_SUGERENCIA } from '@central/module-seguros-portal'

/**
 * «¿Echas algo de menos?» — la sugerencia del cliente, que le llega a Alberto
 * por Telegram.
 *
 * 🚨 **Ningún desenlace que no haya salido puede decir «gracias, la tenemos».**
 * Para quien no tiene ficha, ese Telegram es el ÚNICO sitio donde su texto
 * existe: si no salió y la pantalla se lo agradece, ha escrito para nadie y se
 * queda tan tranquilo. Por eso los cinco casos tienen su frase y solo uno da las
 * gracias — es la misma regla que ya sostiene el parte de siniestro («enviado ≠
 * comunicado»), un piso más abajo.
 *
 * 📌 Vive en la BARRA de la cabecera (09/09/2026), como un desplegable al lado
 * de la campana. Alberto: «botón de sugerencia arriba del todo de la pantalla,
 * donde está la campanita, la luna y salir». Hasta hoy era la última sección
 * de «Mis seguros», y ahí solo lo encontraba quien bajara del todo. Sigue
 * plegado: un cuadro de texto abierto ocupando media pantalla en el móvil le
 * estorba a los 100 que no van a escribir nada para servir a 1 que sí.
 *
 * Se pinta solo con sesión (`SugerenciaBarra` lo decide verificando el token,
 * como la campana): sin sesión `/api/sugerencia` devuelve 401 y la persona
 * escribiría para nadie.
 */
export function Sugerencia() {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const raiz = useRef<HTMLDivElement>(null)
  const idPanel = useId()

  const suficiente = texto.trim().length >= MIN_SUGERENCIA

  // Cerrar al pulsar fuera o con Escape: un desplegable que solo se cierra con
  // su propio botón se queda tapando la póliza. Mismo gesto que la campana.
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierto(false)
    }
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false)
    }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', tecla)
    }
  }, [abierto])

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!suficiente) return
    setEnviando(true)
    setAviso(null)
    try {
      const res = await fetch('/api/sugerencia', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ texto, desde: 'cabecera' }),
      })
      const j = (await res.json().catch(() => null)) as { estado?: string } | null
      const r = desenlaceSugerencia(j?.estado)
      setAviso(r)
      if (r.ok) setTexto('')
    } catch {
      setAviso(desenlaceSugerencia('error'))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="sugerencia" ref={raiz}>
      <button
        type="button"
        className="sugerencia-boton"
        aria-label="Escribir una sugerencia"
        title="¿Echas algo de menos? Escríbelo y lo lee Alberto"
        aria-expanded={abierto}
        aria-controls={idPanel}
        onClick={() => setAbierto((v) => !v)}
      >
        {/* Bocadillo con un signo: «dinos algo». Trazo en `currentColor`, como
            la campana: sin librería y siguiendo el tema. */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4H6.5A2.5 2.5 0 0 1 4 13.5z" />
          <path d="M9.6 8.3a2.4 2.4 0 0 1 4.7.6c0 1.6-2.3 1.9-2.3 3.2" />
          <circle cx="12" cy="14.6" r="0.5" fill="currentColor" />
        </svg>
      </button>

      {abierto && (
        <section className="sugerencia-panel" id={idPanel} aria-labelledby="sugerencia-titulo">
          <h2 className="sugerencia-titulo" id="sugerencia-titulo">¿Echas algo de menos?</h2>
          <p className="sugerencia-intro">
            Esta pantalla la estamos haciendo nosotros. Si falta algo, si algo no se entiende o si se te
            ocurre cómo mejorarla, escríbelo aquí y lo lee Alberto.
          </p>
          <form onSubmit={enviar} className="sugerencia-form">
            <label className="mi-direccion-campo">
              <span>Tu sugerencia</span>
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                rows={4}
                maxLength={MAX_SUGERENCIA}
                placeholder="Por ejemplo: me gustaría poder descargarme el recibo."
                autoFocus
              />
            </label>
            <div className="sugerencia-acciones">
              <button type="submit" className="boton" disabled={enviando || !suficiente}>
                {enviando ? 'Enviando…' : 'Enviar'}
              </button>
              <button type="button" className="boton boton-tenue" onClick={() => { setAbierto(false); setAviso(null) }}>
                Cerrar
              </button>
            </div>
          </form>
          {aviso && (
            <p role="status" className={aviso.ok ? 'mi-direccion-ok' : 'mi-direccion-aviso'}>{aviso.texto}</p>
          )}
        </section>
      )}
    </div>
  )
}

/**
 * Qué se le dice a quien escribió. Puro y exportado para que el guardián pueda
 * comprobar lo único que no se puede equivocar: que `ok: true` sale de UN solo
 * caso.
 */
export function desenlaceSugerencia(estado: string | undefined): { ok: boolean; texto: string } {
  switch (estado) {
    case 'enviada':
      return { ok: true, texto: 'Gracias. Le ha llegado a Alberto y la tenemos anotada.' }
    case 'vacia':
      return { ok: false, texto: 'Escribe un poco más y te leemos.' }
    case 'demasiadas':
      return { ok: false, texto: 'Has mandado varias seguidas. Prueba dentro de un rato.' }
    // Las dos formas de «no ha salido». Se separan porque una se arregla sola
    // reintentando y la otra no: si no hay canal montado, reintentar es perder
    // el tiempo, y decirle que lo intente otra vez sería mandarle a la pared.
    case 'sin_canal':
      return {
        ok: false,
        texto: 'Ahora mismo no podemos recoger sugerencias. No se ha guardado nada: cuéntanoslo por teléfono o por correo.',
      }
    default:
      return {
        ok: false,
        texto: 'No hemos podido enviarla. No se ha guardado nada: vuelve a intentarlo en un momento.',
      }
  }
}
