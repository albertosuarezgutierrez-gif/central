'use client'
// «¿Cuándo tienes que decidir?» — el widget SIN registro de `/gestor-de-seguros`.
//
// No guarda nada, no manda nada: es la cuenta vencimiento − 30 días hecha
// delante de la persona sobre lo que ella teclea (`lib/calculadora-vencimientos.ts`,
// que es lo que se testea). El gancho final NO es una comparativa ni un ahorro
// —eso sería asesoramiento y además no existe—: es «crea tu área y esta fecha
// la tienes siempre a la vista».
//
// `hoy` se fija en el cliente tras montar (como en `PanelDemo`) para que el
// HTML del servidor no lleve una fecha que ya no es «hoy» cuando se sirve.
import { useEffect, useRef, useState } from 'react'

import { fechaCorta, resumirLineas, type LineaVencimiento } from '@/lib/calculadora-vencimientos'
import { PORTAL_URL } from '@/lib/sitio'
import { medir } from '@/lib/medir'
import EnlaceMedido from '@/components/EnlaceMedido'

const INICIALES: LineaVencimiento[] = [
  { etiqueta: 'Coche', vence: '' },
  { etiqueta: 'Casa', vence: '' },
  { etiqueta: 'Salud', vence: '' },
]

const ESTADO: Record<string, { texto: string; color: string }> = {
  sin_fecha: { texto: 'Pon el vencimiento', color: 'var(--muted)' },
  pasado: { texto: 'Plazo pasado: se renueva', color: 'var(--muted)' },
  urgente: { texto: 'Decide ya', color: 'var(--brand)' },
  proximo: { texto: 'Decide pronto', color: 'var(--text)' },
  lejos: { texto: 'Con tiempo', color: 'var(--muted)' },
}

export default function CalculadoraVencimientos() {
  const [lineas, setLineas] = useState<LineaVencimiento[]>(INICIALES)
  const [hoy, setHoy] = useState<Date | null>(null)
  useEffect(() => setHoy(new Date()), [])

  const resumen = hoy ? resumirLineas(lineas, hoy) : null

  // La calculadora no tiene botón «calcular»: calcula al escribir. El evento
  // del embudo es la PRIMERA vez que hay un resultado (una fecha válida), y
  // solo una por visita: cada tecla no es un cálculo nuevo.
  const medido = useRef(false)
  const conFecha = resumen?.conFecha ?? 0
  useEffect(() => {
    if (medido.current || conFecha === 0) return
    medido.current = true
    medir('calculadora_calculo', { con_fecha: true, seguros: conFecha })
  }, [conFecha])

  function cambiar(i: number, campo: keyof LineaVencimiento, valor: string) {
    setLineas((prev) => prev.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)))
  }

  return (
    <div className="panel" aria-labelledby="calc-t">
      <p className="antetitulo" style={{ display: 'block' }}>
        Sin registro
      </p>
      <h3 id="calc-t" style={{ marginTop: 4 }}>
        ¿Hasta cuándo puedes decidir cada uno?
      </h3>
      <p className="tenue" style={{ fontSize: 14, marginTop: 0 }}>
        Escribe cuándo vence cada seguro. Te decimos el último día para avisar a la compañía si no quieres
        renovar: un mes antes.
      </p>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
        {lineas.map((l, i) => {
          const r = resumen?.resultados[i]
          const est = r ? ESTADO[r.estado] : ESTADO.sin_fecha
          return (
            <li
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr)',
                gap: 8,
                padding: '10px 0',
                borderTop: i === 0 ? 'none' : '1px solid var(--border)',
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8 }}>
                <input
                  className="f-in"
                  aria-label={`Nombre del seguro ${i + 1}`}
                  value={l.etiqueta}
                  maxLength={40}
                  onChange={(e) => cambiar(i, 'etiqueta', e.target.value)}
                />
                <input
                  className="f-in"
                  type="date"
                  aria-label={`Vencimiento de ${l.etiqueta || `seguro ${i + 1}`}`}
                  value={l.vence}
                  onChange={(e) => cambiar(i, 'vence', e.target.value)}
                />
              </div>
              <div style={{ fontSize: 14, color: est.color, minHeight: 20 }} aria-live="polite">
                {r?.limite ? (
                  <>
                    <strong>{est.texto}</strong> · hasta el {fechaCorta(r.limite)}
                    {r.dias !== null && r.dias >= 0 && ` (${r.dias} días)`}
                  </>
                ) : (
                  est.texto
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <button
        type="button"
        className="btn btn-outline"
        style={{ marginTop: 8, minHeight: 44 }}
        onClick={() => setLineas((prev) => [...prev, { etiqueta: '', vence: '' }])}
        disabled={lineas.length >= 8}
      >
        + Otro seguro
      </button>

      {resumen && resumen.conFecha > 0 && (
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <p style={{ margin: '0 0 10px', fontSize: 15 }}>
            {resumen.proximas > 0 ? (
              <>
                Tienes <strong>{resumen.proximas}</strong> {resumen.proximas === 1 ? 'seguro' : 'seguros'} con la fecha de
                decisión en los próximos 90 días
                {resumen.urgentes > 0 && <> ({resumen.urgentes} este mes)</>}.
              </>
            ) : resumen.pasadas === resumen.conFecha ? (
              <>Los plazos de este año ya pasaron: la fecha buena es la del vencimiento siguiente.</>
            ) : (
              <>Ninguno con la fecha de decisión cerca. Justo por eso se olvidan.</>
            )}{' '}
            Aquí esta cuenta se borra al cerrar la página; en tu área la tienes siempre, con la póliza al lado.
          </p>
          <EnlaceMedido href={PORTAL_URL} origen="calculadora" className="btn btn-brand" style={{ minHeight: 44 }}>
            Crear mi área con mi correo
          </EnlaceMedido>
        </div>
      )}
    </div>
  )
}
