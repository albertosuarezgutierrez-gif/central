'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

import type { DatosCotizados } from '@/lib/presupuesto-firma'
import { ID_DATOS_CALCULO, TEXTOS_OFERTAS } from '@/lib/presupuesto-ofertas-vista'

/**
 * «Revisa tus datos» — lo PRIMERO de la pantalla del presupuesto (dictado de Alberto, 28/09/2026).
 *
 * Son los datos con los que se CALCULÓ el precio (la petición a la compañía). El cliente los revisa
 * antes de aceptar: si alguno está mal, el precio no vale y la póliza puede no cubrir. Reglas:
 *  - `null` o `sin_datos` = no se han podido leer → se dice, y la aceptación NO se ofrece
 *    (fail-closed: no se autoriza una emisión sobre unos datos que no ha visto). Se le manda llamar.
 *  - Lo que no consta no se pinta: no hay «—» ni «no» inventados.
 *  - El DNI llega ya enmascarado desde asegura; aquí no se toca.
 *  - «Hay un dato que no es correcto» avisa a la correduría; con eso ya no se emite nada.
 */
export function RevisaTusDatos({ presupuestoId, datos, corredor, telefono, origen = 'codeoscopic', supuestos = [] }: {
  presupuestoId: string
  datos: DatosCotizados | null
  corredor: boolean
  telefono: { tel: string; texto: string } | null
  /** `ofertas`: no hay petición a ninguna compañía de la que «se calculó el precio»; se revisa quién es el tomador. */
  origen?: 'codeoscopic' | 'ofertas'
  /** Los SUPUESTOS de las opciones, ya en lenguaje claro (`supuestosDeOpciones`). */
  supuestos?: string[]
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [enviado, setEnviado] = useState(datos?.enRevision === true)

  async function avisar() {
    setOcupado(true)
    setAviso(null)
    try {
      const r = await fetch('/api/presupuesto/datos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ presupuestoId, texto }),
      })
      const j = ((await r.json().catch(() => null)) ?? {}) as Record<string, unknown>
      if (r.status === 200 && j.estado === 'ok') {
        setEnviado(true)
        setAbierto(false)
        // Para que la aceptación de abajo pase a «te llamamos» sin recargar a mano.
        router.refresh()
        return
      }
      setAviso(typeof j.motivo === 'string' ? j.motivo : 'No hemos podido enviar tu aviso. Llámanos y lo vemos contigo.')
    } catch {
      setAviso('No hemos podido enviar tu aviso. Llámanos y lo vemos contigo.')
    } finally {
      setOcupado(false)
    }
  }

  const llamar = telefono ? <> Llámanos al <a href={`tel:${telefono.tel}`}>{telefono.texto}</a>.</> : null

  return (
    // PLEGADA por defecto (Alberto, 18/10/2026: arriba solo lo esencial). Un `<details>` a secas: es poco DOM, y así
    // «Avisar de un error» (AceptarOpcion) la abre por su `id`. 🚨 Con SUPUESTOS va ABIERTA: el precio depende de algo
    // que hemos supuesto y el cliente lo tiene que ver sin buscarlo (revisión 18/10/2026).
    // El `display:flex` del <summary> quita el marcador nativo: por eso lleva chevron PROPIO (`.revisa-chevron`, gira
    // con `[open]`) y un texto que dice que se abre; con `.plegable-suave` a secas parecía una nota al pie.
    <details className="seccion plegable-suave presu-plegable revisa-datos" id={ID_DATOS_CALCULO} open={supuestos.length > 0}>
      <summary id="revisa-datos-titulo" style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', minHeight: 44, display: 'flex', alignItems: 'center', gap: 8, width: 'auto' }}>
        <span className="revisa-chevron" aria-hidden="true">›</span>
        {/* «Calculado» solo si hubo cálculo: tarificación (Codeoscopic) o supuestos declarados por el bot. Una oferta en PDF de compañía no se calculó. */}
        <span>{origen !== 'ofertas' || supuestos.length > 0 ? 'Ver los datos con los que hemos calculado tu precio' : `Ver ${TEXTOS_OFERTAS.datosTitulo.charAt(0).toLowerCase()}${TEXTOS_OFERTAS.datosTitulo.slice(1)}`}</span>
      </summary>

      {datos === null || datos.estado === 'sin_datos' ? (
        <p className="pendiente" style={{ margin: 0 }}>
          {datos?.motivo ?? (origen === 'ofertas' ? TEXTOS_OFERTAS.sinDatos : 'No hemos podido leer los datos con los que se calculó tu precio. Llámanos y lo revisamos contigo: no se emite nada hasta entonces.')}
          {llamar}
        </p>
      ) : (
        <>
          <p style={{ margin: '0 0 12px' }}>
            {origen === 'ofertas' ? TEXTOS_OFERTAS.revisaIntro : (
              <>
                Estos son los datos con los que las compañías han calculado tu precio. Comprueba que son correctos:
                <strong> el precio y la póliza dependen de ellos</strong>. Si alguno no lo es, dínoslo antes de aceptar.
              </>
            )}
          </p>

          {origen === 'ofertas' && supuestos.length > 0 && <p className="suave" style={{ margin: '0 0 12px', fontSize: 14 }}>{TEXTOS_OFERTAS.revisaBot}</p>}
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'minmax(0, 1fr)' }}>
            {datos.grupos.map((g) => (
              <div key={g.titulo}>
                <h3 style={{ margin: '0 0 6px', fontSize: 15 }}>{g.titulo}</h3>
                <dl style={{ margin: 0, display: 'grid', gap: 4 }}>
                  {g.filas.map((f) => (
                    <div key={f.etiqueta} style={{ display: 'flex', flexWrap: 'wrap', gap: '0 8px', fontSize: 14 }}>
                      <dt className="suave" style={{ minWidth: 0 }}>{f.etiqueta}:</dt>
                      <dd style={{ margin: 0, overflowWrap: 'anywhere', fontWeight: 600 }}>{f.valor}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>

          {enviado ? (
            <p className="confirmacion" role="status" style={{ margin: '12px 0 0' }}>
              Te llamamos para corregirlo; no se emite nada hasta entonces.
            </p>
          ) : corredor ? (
            <p className="suave" style={{ margin: '12px 0 0', fontSize: 14 }}>
              Vista de corredor: el aviso de un dato incorrecto lo manda el cliente.
            </p>
          ) : abierto ? (
            <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
              <label style={{ display: 'grid', gap: 4, fontSize: 14 }}>
                ¿Qué dato no es correcto y cuál es el bueno?
                <textarea
                  className="campo" rows={3} maxLength={1000} value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="Por ejemplo: mi fecha de carnet es el 12/03/2005"
                />
              </label>
              <button type="button" className="boton" style={{ minHeight: 44 }} disabled={ocupado || texto.trim().length < 3} onClick={avisar}>
                {ocupado ? 'Enviando…' : 'Avisar a mi corredor'}
              </button>
              <button type="button" className="boton-tenue" style={{ minHeight: 44 }} disabled={ocupado} onClick={() => setAbierto(false)}>
                Cancelar
              </button>
            </div>
          ) : (
            <button type="button" className="boton-tenue" style={{ minHeight: 44, marginTop: 12 }} onClick={() => setAbierto(true)}>
              Hay un dato que no es correcto
            </button>
          )}
          {aviso && <p className="error-linea" role="alert" style={{ margin: '8px 0 0' }}>{aviso}</p>}
        </>
      )}
      {supuestos.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <h3 style={{ margin: '0 0 6px', fontSize: 15 }}>Lo que hemos supuesto</h3>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, display: 'grid', gap: 4 }}>
            {supuestos.map((s) => <li key={s} style={{ overflowWrap: 'anywhere' }}>{s}</li>)}
          </ul>
          <p className="suave" style={{ margin: '6px 0 0', fontSize: 13 }}>Si algo de esto no es así, avísanos antes de elegir: el precio puede cambiar al emitir.</p>
        </div>
      )}
    </details>
  )
}
