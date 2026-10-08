import { Building2, Waves } from 'lucide-react'
import { fechaPintable, rotuloAnulacionCima, type DatosCompaniaCima } from '@central/module-seguros'
import { ConIcono } from '@/app/(usuario)/correduria/iconos'
import { rotuloClave, type RotuloClave } from '@/lib/recibo-etiquetas'
import { bloquesContratoCima, type ContratoFicha } from '@/lib/poliza-contrato'

/**
 * Lo que la compañía dice de esta póliza por CIMA y no es el objeto asegurado
 * (24/09/2026): anulación, póliza a la que sustituye, suplementos, la ficha
 * del inmueble o de la embarcación y sus «otros datos». Los códigos EIAC con
 * tabla oficial (`claves-eiac.ts`: clase de inmueble, uso, zona, comunidad) se
 * traducen; los que no la tienen se enseñan crudos DICIENDO que son «código de
 * la compañía». Donde manda texto, se pinta el texto.
 *
 * `null` no se pinta como «la compañía no manda nada»: se dice que no consta,
 * porque las pólizas ingeridas antes del 24/09/2026 no lo tienen leído.
 */
export default function CimaPoliza({ d, vigente, contrato = null }: { d: DatosCompaniaCima | null; vigente: boolean; contrato?: ContratoFicha | null }) {
  // Desglose de prima, comisiones, origen… del contrato (solo operador). Sin datos, ningún bloque.
  const bloques = bloquesContratoCima(contrato)
  if (d === null && bloques.length === 0) {
    return <p style={muted}>No consta nada más de la compañía por CIMA para esta póliza.</p>
  }
  if (d === null) {
    return (
      <section style={{ display: 'grid', gap: 8 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}><ConIcono i={Building2}>Lo que dice la compañía (CIMA)</ConIcono></h2>
        <BloquesContrato bloques={bloques} />
      </section>
    )
  }
  const inm = d.inmueble
  const filasInmueble: Array<[string, string]> = inm
    ? ([
        ['Clase de inmueble', clave('claseInmueble', inm.claseInmueble)],
        ['Uso', clave('usoInmueble', inm.usoInmueble)],
        ['Zona', clave('zona', inm.zona)],
        ['Clase de comunidad', clave('claseComunidad', inm.claseComunidad)],
        ['Año / antigüedad', inm.antiguedad],
        ['Actividad', inm.actividad],
      ].filter((f): f is [string, string] => f[1] !== null) as Array<[string, string]>)
    : []
  const emb = d.embarcacion
  const filasEmb: Array<[string, string]> = emb
    ? ([
        ['Nombre', emb.nombre], ['Matrícula', emb.matricula], ['Marca', emb.marca], ['Modelo', emb.modelo],
        ['Eslora', emb.eslora], ['Potencia (unidad según la compañía)', emb.potencia], ['Plazas', emb.plazas], ['Puerto base', emb.puertoBase],
        ['Año', emb.anio],
      ].filter((f): f is [string, string] => f[1] !== null) as Array<[string, string]>)
    : []

  return (
    <section style={{ display: 'grid', gap: 8 }}>
      <h2 style={{ fontSize: 16, margin: 0 }}><ConIcono i={Building2}>Lo que dice la compañía (CIMA)</ConIcono></h2>

      <BloquesContrato bloques={bloques} />

      {d.anulacion && <p style={{ margin: 0, fontSize: 14 }}>{rotuloAnulacionCima(d.anulacion, vigente)}</p>}

      {d.polizaReemplazada && (
        <p style={{ margin: 0, fontSize: 14 }}>
          Sustituye a la póliza nº <strong>{d.polizaReemplazada.numero}</strong>
          {d.polizaReemplazada.descripcionRamo ? ` (${d.polizaReemplazada.descripcionRamo})` : ''}
          {d.polizaReemplazada.codigoDgs ? ` · compañía ${d.polizaReemplazada.codigoDgs}` : ''}.
        </p>
      )}

      {filasInmueble.length > 0 && <Filas filas={filasInmueble} />}
      {inm && inm.medidasProteccion.length > 0 && (
        <p style={{ margin: 0, fontSize: 13 }}>
          <strong>Protecciones:</strong>{' '}
          {inm.medidasProteccion.map((m) => [m.medida, m.valor].filter(Boolean).join(': ')).join(' · ')}
        </p>
      )}

      {filasEmb.length > 0 && (
        <>
          <strong style={{ fontSize: 14 }}><ConIcono i={Waves}>Embarcación</ConIcono></strong>
          <Filas filas={filasEmb} />
        </>
      )}

      {d.suplementos.length > 0 && (
        <details>
          <summary style={resumen}>Suplementos ({d.suplementos.length})</summary>
          <ol style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'grid', gap: 6 }}>
            {d.suplementos.map((s, i) => (
              <li key={`${s.id ?? ''}-${i}`} style={item}>
                <strong>{s.detalle ?? s.descripcionClase ?? `Suplemento ${s.id ?? ''}`}</strong>
                <span style={muted}>
                  {[fechaPintable(s.fechaEfecto) && `efecto ${fechaPintable(s.fechaEfecto)}`, fechaPintable(s.fechaEmision) && `emitido ${fechaPintable(s.fechaEmision)}`, s.descripcionClase && s.detalle ? s.descripcionClase : null]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}

      {d.otrosDatos.length > 0 && (
        <details>
          <summary style={resumen}>Otros datos de la compañía ({d.otrosDatos.length})</summary>
          <Filas filas={d.otrosDatos.map((o) => [o.descripcion ?? o.id ?? '—', o.valor ?? '—'])} />
        </details>
      )}
    </section>
  )
}

/** Traducción oficial; fuera de tabla, el código crudo con «(código de la compañía)». `null` = no consta. */
function clave(tabla: Parameters<typeof rotuloClave>[0], codigo: string | null): string | null {
  const r: RotuloClave | null = rotuloClave(tabla, codigo)
  return r === null ? null : r.desconocido ? `${r.texto} (código de la compañía)` : r.texto
}

function BloquesContrato({ bloques }: { bloques: ReturnType<typeof bloquesContratoCima> }) {
  if (bloques.length === 0) return null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
      {bloques.map((b) => (
        <div key={b.titulo} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 4 }}>
          <strong style={{ fontSize: 14 }}>{b.titulo}</strong>
          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'minmax(0, max-content) minmax(0, 1fr)', gap: '4px 12px', fontSize: 13 }}>
            {b.filas.map((f, i) => (
              <div key={`${f.etiqueta}-${i}`} style={{ display: 'contents' }}>
                <dt style={{ color: 'var(--muted)' }}>{f.etiqueta}</dt>
                <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>
                  {f.valor}
                  {f.nota && <span style={{ color: 'var(--muted)' }}> · {f.nota}</span>}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  )
}

function Filas({ filas }: { filas: Array<[string, string]> }) {
  return (
    <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'minmax(0, max-content) minmax(0, 1fr)', gap: '4px 12px', fontSize: 13 }}>
      {filas.map(([k, v], i) => (
        <div key={`${k}-${i}`} style={{ display: 'contents' }}>
          <dt style={{ color: 'var(--muted)' }}>{k}</dt>
          <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

const muted = { margin: 0, fontSize: 13, color: 'var(--muted)' } as const
const resumen = { cursor: 'pointer', fontSize: 14, minHeight: 44, display: 'flex', alignItems: 'center' } as const
const item = {
  display: 'flex', flexWrap: 'wrap', gap: '4px 12px', alignItems: 'baseline', padding: '8px 10px',
  border: '1px solid var(--border)', borderRadius: 8,
} as const
