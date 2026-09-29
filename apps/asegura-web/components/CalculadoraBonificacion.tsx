'use client'
// Calculadora de `/calculadora-bonificacion-hipoteca`, con el diseño aprobado
// por Alberto el 29/09/2026 (maqueta «Calculadora de bonificación hipotecaria»):
// datos a la izquierda; a la derecha las dos cifras y el bloque oscuro con el
// coste real. En móvil se apila. La cuenta vive en `lib/bonificacion-hipoteca.ts`
// (testeada); aquí solo se pinta. No guarda ni manda nada.
//
// Arranca con el ejemplo de la maqueta rellenado (40.000 / 0,50 / 500) para que
// se entienda de un vistazo; el evento del embudo solo se emite cuando la
// persona toca un dato, no por el ejemplo.
import { useEffect, useRef, useState, type CSSProperties } from 'react'

import { calcularBonificacion, type EntradaBonificacion } from '@/lib/bonificacion-hipoteca'
import { eur } from '@/lib/panel-demo'
import { medir } from '@/lib/medir'

const CAMPOS: { id: keyof EntradaBonificacion; etiqueta: string; ayuda?: string }[] = [
  { id: 'capital', etiqueta: 'Capital pendiente de la hipoteca (€)' },
  { id: 'puntos', etiqueta: 'Puntos que te bonifica el seguro (%)', ayuda: 'Lo dice tu escritura o la oferta del banco. Ejemplo: 0,50.' },
  { id: 'prima', etiqueta: 'Lo que te cobra el banco por esos seguros al año (€)', ayuda: 'Hogar, vida y, si te los pide, auto o moto.' },
]

const EJEMPLO: EntradaBonificacion = { capital: '40.000', puntos: '0,50', prima: '500' }

const cifra: CSSProperties = { fontFamily: 'var(--display)', fontWeight: 700, fontSize: 'clamp(24px, 4vw, 30px)', lineHeight: 1.1 }

export default function CalculadoraBonificacion() {
  const [datos, setDatos] = useState<EntradaBonificacion>(EJEMPLO)
  const [tocado, setTocado] = useState(false)
  const r = calcularBonificacion(datos)

  const medido = useRef(false)
  useEffect(() => {
    if (!tocado || medido.current || !r) return
    medido.current = true
    medir('bonificacion_calculo', { compensa: r.compensa })
  }, [tocado, r])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 'clamp(16px, 3vw, 32px)', alignItems: 'start' }}>
      <div className="panel" style={{ display: 'grid', gap: 20 }}>
        {CAMPOS.map((c) => (
          <div key={c.id}>
            <label className="f-lab" htmlFor={`bonif-${c.id}`} style={{ fontSize: 15, fontWeight: 700 }}>
              {c.etiqueta}
            </label>
            <input
              id={`bonif-${c.id}`}
              className="f-in"
              inputMode="decimal"
              value={datos[c.id]}
              maxLength={14}
              onChange={(e) => {
                setTocado(true)
                setDatos((d) => ({ ...d, [c.id]: e.target.value }))
              }}
              style={{ minHeight: 52, fontSize: 18 }}
            />
            {c.ayuda && (
              <div className="tenue" style={{ fontSize: 13, marginTop: 6 }}>
                {c.ayuda}
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gap: 16 }} aria-live="polite">
        <div
          style={{
            background: 'var(--bg2)',
            borderRadius: 'var(--r-xl)',
            padding: 'clamp(18px, 3vw, 28px)',
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 16,
          }}
        >
          <div>
            <div className="tenue" style={{ fontSize: 14 }}>El banco te cobra</div>
            <div style={cifra}>{r ? eur(r.prima) : '—'}</div>
          </div>
          <div>
            <div className="tenue" style={{ fontSize: 14 }}>La bonificación vale</div>
            <div style={cifra}>{r ? `− ${eur(r.bonificacion)}` : '—'}</div>
          </div>
        </div>

        <div
          style={{
            background: 'var(--brand-ink)',
            color: 'var(--bg)',
            borderRadius: 'var(--r-xl)',
            padding: 'clamp(22px, 3.5vw, 32px)',
            display: 'grid',
            gap: 10,
          }}
        >
          <div style={{ fontSize: 15, opacity: 0.85 }}>Coste real del seguro del banco</div>
          {r ? (
            <>
              <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 'clamp(36px, 6vw, 52px)', lineHeight: 1 }}>
                {eur(r.costeReal)} <span style={{ fontSize: 'clamp(16px, 2.4vw, 22px)' }}>al año</span>
              </div>
              <p style={{ margin: '6px 0 0', fontSize: 17, lineHeight: 1.55, opacity: 0.92 }}>
                {r.compensa ? (
                  <>La bonificación vale más que el seguro: con estas cifras, quedártelo te sale a cuenta.</>
                ) : (
                  <>
                    Si encuentras el mismo seguro por menos de <strong>{eur(r.costeReal)}</strong> al año, te sale mejor
                    fuera del banco aunque pierdas la bonificación.
                  </>
                )}
              </p>
            </>
          ) : (
            <p style={{ margin: 0, fontSize: 17 }}>Rellena los tres datos y verás el coste real.</p>
          )}
        </div>

        <a href="#contacto" className="btn btn-brand" style={{ justifySelf: 'start', minHeight: 48 }}>
          ¿Te lo miramos?
        </a>
        <div className="tenue" style={{ fontSize: 13, lineHeight: 1.5 }}>
          Cálculo orientativo con tus datos de hoy. No incluye cambios futuros del capital ni de las primas.
        </div>
      </div>
    </div>
  )
}
