'use client'

// «Historial» del riesgo (10/10/2026): seguro anterior, años asegurado, años sin siniestros, siniestros en los
// últimos 5 años y carné. SOLO LECTURA: lo que hay se lee del papel de la póliza de hoy y de la ficha del conductor;
// se corrige en la ficha o al pedir precio (la pantalla de precio lo declara). Va entre «Datos del vehículo»/figuras y
// «Pedir precio» para verlo antes de tarificar.
//
// Tres estados por fila (lógica en `lib/historial-riesgo.ts`): «Sin dato» (borde discontinuo) = no se sabe, nunca un 0;
// 0 = revisado (se pinta el valor); con valor = el dato.

import { Pendiente, cardStyle } from '@/components/ui'
import { filasHistorial } from '@/lib/historial-riesgo'
import type { Riesgo } from '@/lib/riesgo-asegura'

const REJILLA: React.CSSProperties = { display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))' }

/** `hoy` (aaaa-mm-dd, Madrid) lo calcula el SERVIDOR (page.tsx) y baja por prop: calcularlo aquí daba un desajuste de hidratación. */
export default function HistorialRiesgo({ riesgo, hoy }: { riesgo: Riesgo; hoy: string }) {
  const op = riesgo.oportunidad
  const r = filasHistorial(riesgo.historial, { compania: op.aseguradoraActual === true ? op.aseguradora : null, hoy })

  return (
    <section id="historial-riesgo" aria-labelledby="historial-riesgo-titulo" style={{ ...cardStyle, display: 'grid', gap: 12, minWidth: 0 }}>
      <div>
        <div id="historial-riesgo-titulo" style={{ fontSize: 14, fontWeight: 600 }}>Historial</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
          Lo que se sabe del seguro de hoy y del conductor, tal como consta. «Sin dato» es que no se sabe, no que sea cero: al pedir precio se declara.
        </div>
      </div>

      {r.estado === 'sin_leer' ? (
        <p role="status" style={{ margin: 0, fontSize: 13, color: 'var(--warning)' }}>
          No se ha podido leer el historial de este riesgo ahora. No es que no tenga: recarga la página.
        </p>
      ) : (
        <dl style={{ ...REJILLA, margin: 0 }}>
          {r.filas.map((f) => (
            <div key={f.clave} style={{ display: 'grid', gap: 2, minWidth: 0, alignContent: 'start' }}>
              <dt style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{f.etiqueta}</dt>
              <dd style={{ margin: 0, minWidth: 0, overflowWrap: 'anywhere' }}>
                {f.estado === 'pendiente' ? (
                  <Pendiente texto="Sin dato" />
                ) : (
                  <span style={{ fontWeight: 600, color: f.tono === 'aviso' ? 'var(--warning)' : 'var(--text)' }}>{f.texto}</span>
                )}
                {f.nota && <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{f.nota}</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}
