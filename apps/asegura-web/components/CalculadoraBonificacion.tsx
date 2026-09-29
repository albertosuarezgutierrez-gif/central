'use client'
// Calculadora de `/calculadora-bonificacion-hipoteca`. La cuenta vive en
// `lib/bonificacion-hipoteca.ts` (testeada); aquí solo se pinta. No guarda ni
// manda nada: calcula en el navegador sobre lo que teclea la persona.
import { useEffect, useRef, useState } from 'react'

import { calcularBonificacion, type EntradaBonificacion } from '@/lib/bonificacion-hipoteca'
import { eur } from '@/lib/panel-demo'
import { medir } from '@/lib/medir'

const CAMPOS: { id: keyof EntradaBonificacion; etiqueta: string; ayuda: string; ejemplo: string }[] = [
  { id: 'capital', etiqueta: 'Capital pendiente de la hipoteca (€)', ayuda: 'Lo que te queda por pagar. Sale en tu recibo o en la app del banco.', ejemplo: '40.000' },
  { id: 'puntos', etiqueta: 'Puntos que te bonifica ese seguro (%)', ayuda: 'Lo dice tu escritura o la oferta del banco. Por ejemplo, 0,50.', ejemplo: '0,50' },
  { id: 'prima', etiqueta: 'Lo que te cobra el banco por ese seguro al año (€)', ayuda: 'El recibo anual del seguro de vida, de hogar o el que te bonifique.', ejemplo: '500' },
]

export default function CalculadoraBonificacion() {
  const [datos, setDatos] = useState<EntradaBonificacion>({ capital: '', puntos: '', prima: '' })
  const r = calcularBonificacion(datos)

  // Un evento por visita: el primer resultado completo, no cada tecla.
  const medido = useRef(false)
  useEffect(() => {
    if (medido.current || !r) return
    medido.current = true
    medir('bonificacion_calculo', { compensa: r.compensa })
  }, [r])

  return (
    <div className="panel" aria-labelledby="bonif-t">
      <p className="antetitulo" style={{ display: 'block' }}>
        Sin registro
      </p>
      <h2 id="bonif-t" style={{ marginTop: 4 }}>
        Calcula el coste real
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 14 }}>
        {CAMPOS.map((c) => (
          <div key={c.id} style={{ display: 'grid', gap: 6 }}>
            <label className="f-lab" htmlFor={`bonif-${c.id}`}>
              {c.etiqueta}
            </label>
            <input
              id={`bonif-${c.id}`}
              className="f-in"
              inputMode="decimal"
              placeholder={c.ejemplo}
              value={datos[c.id]}
              maxLength={14}
              onChange={(e) => setDatos((d) => ({ ...d, [c.id]: e.target.value }))}
              style={{ minHeight: 44 }}
            />
            <span className="tenue" style={{ fontSize: 13 }}>
              {c.ayuda}
            </span>
          </div>
        ))}
      </div>

      <div aria-live="polite" style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
        {r ? (
          <>
            <p style={{ margin: '0 0 6px' }}>
              El banco te cobra <strong>{eur(r.prima)}</strong> y la
              bonificación vale unos <strong>{eur(r.bonificacion)}</strong> al año.
            </p>
            <p style={{ margin: 0, fontSize: 20 }}>
              Coste real del seguro del banco: <strong>{eur(r.costeReal)}</strong> al año
            </p>
            <p className="tenue" style={{ margin: '10px 0 0', fontSize: 14 }}>
              {r.compensa
                ? 'La bonificación vale más que el seguro: con estas cifras, quedártelo te sale a cuenta.'
                : `Si encuentras el mismo seguro por menos de ${eur(r.costeReal)} al año, te compensa cambiarlo aunque pierdas la bonificación.`}{' '}
              Es una cuenta del primer año: la bonificación baja a medida que amortizas.
            </p>
          </>
        ) : (
          <p className="tenue" style={{ margin: 0 }}>
            Rellena los tres datos y verás el coste real.
          </p>
        )}
      </div>
    </div>
  )
}
