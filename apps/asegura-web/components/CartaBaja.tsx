'use client'
// La carta de no renovación SIN registro de `/carta-baja-seguro`.
//
// 🚨 Todo ocurre en el navegador: no hay `fetch` ni formulario que se envíe, y
// la analítica solo recibe qué botón se pulsó, el ramo del desplegable y el
// estado del plazo — nunca un dato que haya escrito la persona. Lo vigila
// `lib/carta-baja.test.ts`, que lee este fuente.
//
// `hoy` se fija tras montar (como en `CalculadoraVencimientos`) para que el HTML
// del servidor no lleve una fecha que ya no es «hoy» cuando se sirve.
import { useEffect, useState } from 'react'

import {
  DATOS_VACIOS,
  HUECOS_CARTA,
  RAMOS_CARTA,
  componerCarta,
  fechaEnLetra,
  hrefCorreo,
  plazoCarta,
  type DatosCarta,
} from '@/lib/carta-baja'
import { PORTAL_URL } from '@/lib/sitio'
import { medir } from '@/lib/medir'
import EnlaceMedido from '@/components/EnlaceMedido'

const CAMPOS: { id: keyof DatosCarta; etiqueta: string; auto?: string; tipo?: string; max: number }[] = [
  { id: 'tomador', etiqueta: 'Nombre y apellidos del tomador', auto: 'name', max: 90 },
  { id: 'nif', etiqueta: 'NIF / NIE', auto: 'off', max: 12 },
  { id: 'compania', etiqueta: 'Compañía de seguros', auto: 'off', max: 80 },
  { id: 'numeroPoliza', etiqueta: 'Número de póliza', auto: 'off', max: 40 },
  { id: 'vence', etiqueta: 'Fecha de vencimiento', tipo: 'date', max: 10 },
  { id: 'lugar', etiqueta: 'Localidad desde la que escribes', auto: 'address-level2', max: 60 },
]

type Accion = 'copiar' | 'imprimir' | 'descargar' | 'correo'

export default function CartaBaja() {
  const [datos, setDatos] = useState<DatosCarta>(DATOS_VACIOS)
  const [hoy, setHoy] = useState<Date | null>(null)
  const [copiada, setCopiada] = useState(false)
  useEffect(() => setHoy(new Date()), [])

  const carta = hoy ? componerCarta(datos, hoy) : null
  const plazo = hoy ? plazoCarta(datos.vence, hoy) : null

  function cambiar(id: keyof DatosCarta, valor: string) {
    setCopiada(false)
    setDatos((prev) => ({ ...prev, [id]: valor }))
  }

  function registrar(accion: Accion) {
    medir('carta_accion', { accion, ramo: datos.ramo || null, plazo: plazo?.estado ?? null, huecos: carta?.huecos.length ?? 0 })
  }

  async function copiar() {
    if (!carta) return
    registrar('copiar')
    try {
      await navigator.clipboard.writeText(carta.cuerpo)
      setCopiada(true)
    } catch {
      setCopiada(false)
    }
  }

  function descargar() {
    if (!carta) return
    registrar('descargar')
    const blob = new Blob([carta.cuerpo], { type: 'text/plain;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'carta-no-renovacion-seguro.txt'
    a.click()
    // Revocar en el mismo tic cancela la descarga en Firefox.
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  function imprimir() {
    if (!carta) return
    registrar('imprimir')
    const w = window.open('', '_blank')
    if (!w) return
    const pre = w.document.createElement('pre')
    pre.textContent = carta.cuerpo
    pre.style.cssText = 'font: 12pt/1.5 Georgia, serif; white-space: pre-wrap; margin: 2.5cm;'
    w.document.title = carta.asunto
    w.document.body.appendChild(pre)
    w.print()
  }

  return (
    <div className="panel" aria-labelledby="carta-t">
      <p className="antetitulo" style={{ display: 'block' }}>
        Gratis · sin registro · no sale de tu navegador
      </p>
      <h2 id="carta-t" style={{ marginTop: 4 }}>
        Rellena tus datos y te preparamos la carta
      </h2>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
          gap: 12,
        }}
      >
        {CAMPOS.map((c) => (
          <div key={c.id}>
            <label className="f-lab" htmlFor={`carta-${c.id}`}>
              {c.etiqueta}
            </label>
            <input
              id={`carta-${c.id}`}
              className="f-in"
              type={c.tipo ?? 'text'}
              autoComplete={c.auto}
              maxLength={c.max}
              value={datos[c.id]}
              onChange={(e) => cambiar(c.id, e.target.value)}
            />
          </div>
        ))}
        <div>
          <label className="f-lab" htmlFor="carta-ramo">
            Tipo de seguro
          </label>
          <select id="carta-ramo" className="f-in" value={datos.ramo} onChange={(e) => cambiar('ramo', e.target.value)}>
            {RAMOS_CARTA.map((r) => (
              <option key={r.valor} value={r.valor}>
                {r.texto}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div aria-live="polite" style={{ margin: '16px 0 0', fontSize: 15 }}>
        {plazo?.estado === 'en_plazo' && plazo.limite && (
          <p style={{ margin: 0 }}>
            <strong>Estás a tiempo.</strong> El último día para que la compañía la reciba es el{' '}
            <strong>{fechaEnLetra(plazo.limite)}</strong>
            {plazo.dias !== null && ` (quedan ${plazo.dias} días)`}. Envíala antes y guarda el justificante.
          </p>
        )}
        {plazo?.estado === 'fuera_de_plazo' && plazo.limite && (
          <p style={{ margin: 0 }}>
            <strong>El plazo de este año pasó el {fechaEnLetra(plazo.limite)}.</strong> La póliza se renovará una vez
            más al vencer; la carta te sirve para el vencimiento siguiente. Pon esa fecha y te decimos el nuevo límite.
          </p>
        )}
        {plazo?.estado === 'vencida' && (
          <p style={{ margin: 0 }}>
            <strong>Esa fecha ya ha pasado.</strong> Si la póliza se renovó, su vencimiento ahora es un año después:
            míralo en el último recibo y ponlo aquí.
          </p>
        )}
      </div>

      <label className="f-lab" htmlFor="carta-texto" style={{ marginTop: 16, display: 'block' }}>
        Tu carta
      </label>
      <textarea
        id="carta-texto"
        className="f-in"
        readOnly
        value={carta?.cuerpo ?? ''}
        rows={16}
        style={{ width: '100%', fontFamily: 'Georgia, serif', fontSize: 14, lineHeight: 1.5, resize: 'vertical' }}
      />

      {carta && carta.huecos.length > 0 && (
        <p className="tenue" style={{ fontSize: 14, margin: '8px 0 0' }}>
          Faltan datos: la carta lleva {carta.huecos.map((h) => HUECOS_CARTA[h]).join(', ')}. Rellénalos arriba o
          cámbialos a mano antes de enviarla.
        </p>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
        <button type="button" className="btn btn-brand" style={{ minHeight: 44 }} onClick={copiar} disabled={!carta}>
          {copiada ? 'Copiada' : 'Copiar la carta'}
        </button>
        <a
          className="btn btn-outline"
          style={{ minHeight: 44 }}
          href={carta ? hrefCorreo(carta.asunto, carta.cuerpo) : undefined}
          onClick={() => registrar('correo')}
        >
          Abrir en mi correo
        </a>
        <button type="button" className="btn btn-outline" style={{ minHeight: 44 }} onClick={imprimir} disabled={!carta}>
          Imprimir
        </button>
        <button type="button" className="btn btn-outline" style={{ minHeight: 44 }} onClick={descargar} disabled={!carta}>
          Descargar
        </button>
      </div>

      <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
        <p style={{ margin: '0 0 10px', fontSize: 15 }}>
          El año que viene esta fecha vuelve a llegar sin avisar. Guarda tus pólizas en tu área privada y tendrás
          siempre a la vista hasta qué día puedes decidir cada una. Gratis y sin ser cliente.
        </p>
        <EnlaceMedido href={PORTAL_URL} origen="carta_baja" className="btn btn-brand" style={{ minHeight: 44 }}>
          Guardar mis pólizas
        </EnlaceMedido>
      </div>
    </div>
  )
}
