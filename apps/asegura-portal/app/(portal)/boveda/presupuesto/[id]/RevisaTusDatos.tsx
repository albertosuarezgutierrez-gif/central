'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

import type { DatosCotizados } from '@/lib/presupuesto-firma'
import { TEXTOS_OFERTAS } from '@/lib/presupuesto-ofertas-vista'

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
export function RevisaTusDatos({ presupuestoId, datos, corredor, telefono, origen = 'codeoscopic' }: {
  presupuestoId: string
  datos: DatosCotizados | null
  corredor: boolean
  telefono: { tel: string; texto: string } | null
  /** `ofertas`: no hay petición a ninguna compañía de la que «se calculó el precio»; se revisa quién es el tomador. */
  origen?: 'codeoscopic' | 'ofertas'
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
    <section className="seccion" aria-labelledby="revisa-datos-titulo">
      <h2 id="revisa-datos-titulo" style={{ marginTop: 0 }}>Revisa tus datos</h2>

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
    </section>
  )
}
