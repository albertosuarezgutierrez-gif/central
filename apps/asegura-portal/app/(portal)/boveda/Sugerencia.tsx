'use client'
import { useState } from 'react'

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
 * 📌 Va plegado y al final. Quien entra viene a mirar sus pólizas; un cuadro de
 * texto abierto ocupando media pantalla en el móvil le estorba a los 100 que no
 * van a escribir nada para servir a 1 que sí.
 */
export function Sugerencia() {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)

  const suficiente = texto.trim().length >= MIN_SUGERENCIA

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!suficiente) return
    setEnviando(true)
    setAviso(null)
    try {
      const res = await fetch('/api/sugerencia', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ texto, desde: 'boveda' }),
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
    <section className="tus-datos" aria-labelledby="sugerencia-titulo">
      <h2 className="lista-titulo" id="sugerencia-titulo">¿Echas algo de menos?</h2>
      <p className="supresion-intro">
        Esta pantalla la estamos haciendo nosotros. Si falta algo, si algo no se entiende o si se te
        ocurre cómo mejorarla, escríbelo aquí y lo lee Alberto.
      </p>

      {!abierto ? (
        <button type="button" className="boton boton-secundario" onClick={() => setAbierto(true)}>
          Escribir una sugerencia
        </button>
      ) : (
        <form onSubmit={enviar} className="sugerencia-form">
          <label className="mi-direccion-campo">
            <span>Tu sugerencia</span>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={4}
              maxLength={MAX_SUGERENCIA}
              placeholder="Por ejemplo: me gustaría poder descargarme el recibo."
            />
          </label>
          <div className="sugerencia-acciones">
            <button type="submit" className="boton" disabled={enviando || !suficiente}>
              {enviando ? 'Enviando…' : 'Enviar'}
            </button>
            <button type="button" className="boton boton-tenue" onClick={() => { setAbierto(false); setAviso(null) }}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {aviso && (
        <p role="status" className={aviso.ok ? 'mi-direccion-ok' : 'mi-direccion-aviso'}>{aviso.texto}</p>
      )}
    </section>
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
