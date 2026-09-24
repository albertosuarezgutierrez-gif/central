import Link from 'next/link'
import type { InmuebleCatastro } from '@central/core-catastro'

const input: React.CSSProperties = {
  padding: '10px 12px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 14,
  minHeight: 44,
  background: 'var(--surface)',
  color: 'var(--text)',
}
const rejilla: React.CSSProperties = { display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }

/**
 * Para una póliza de hogar que no trae m², año ni CP: se busca el piso en el
 * Catastro (gratis) y la referencia de 20 viaja a asegura, que es quien
 * consulta los datos. GET puro, sin JS, igual que el de hogar-nuevo.
 */
export function BuscadorCatastro({
  polizaId,
  direccion,
  municipio,
  provincia,
  deCliente,
}: {
  polizaId: string
  direccion: string
  municipio: string
  provincia: string
  /** La dirección viene precargada de la ficha del cliente: puede no ser la del riesgo. */
  deCliente: boolean
}) {
  const accion = `/correduria/poliza/${polizaId}/retarificar`
  return (
    <>
      <div className="card">
        <h2>Buscar la vivienda en el Catastro</h2>
        <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
          El Catastro da m², año de construcción y CP, gratis y sin preguntar al cliente.
          {deCliente && ' La dirección de abajo es la del CLIENTE: si la vivienda asegurada es otra (segunda residencia, alquiler), cámbiala.'}
        </p>
        <form method="get" action={accion} style={rejilla}>
          <input style={{ ...input, gridColumn: '1 / -1' }} name="direccion" placeholder="Calle San Vicente 40, 2º 14" defaultValue={direccion} />
          <input style={input} name="municipio" placeholder="Municipio" defaultValue={municipio} />
          <input style={input} name="provincia" placeholder="Provincia" defaultValue={provincia} />
          <button type="submit" className="primary" style={{ gridColumn: '1 / -1', minHeight: 44 }}>
            Consultar Catastro
          </button>
        </form>
      </div>
      <div className="card">
        <h2>O por referencia catastral</h2>
        <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
          Los 20 caracteres del recibo del IBI (la de 14 es la del edificio: no trae m² ni año).
        </p>
        <form method="get" action={accion} style={rejilla}>
          <input style={{ ...input, gridColumn: '1 / -1' }} name="referencia" placeholder="Referencia catastral de 20 caracteres" />
          <button type="submit" className="primary" style={{ gridColumn: '1 / -1', minHeight: 44 }}>
            Usar esta referencia
          </button>
        </form>
      </div>
    </>
  )
}

/** El portal tiene varios pisos: elige una persona, nunca el código. */
export function ElegirPiso({ polizaId, via, inmuebles }: { polizaId: string; via: string; inmuebles: InmuebleCatastro[] }) {
  return (
    <div className="card">
      <h2>
        {inmuebles.length} inmuebles en {via}: ¿cuál es?
      </h2>
      <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
        El Catastro lista todos los pisos del portal. Con dos o más no se elige a ciegas.
      </p>
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
        {inmuebles.map((i) => (
          <Link
            key={i.refCompleta}
            href={`/correduria/poliza/${polizaId}/retarificar?referencia=${encodeURIComponent(i.refCompleta)}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 44,
              border: '1px solid var(--border)',
              borderRadius: 8,
              textDecoration: 'none',
            }}
          >
            Pl. {i.planta ?? '?'} · Pta. {i.puerta ?? '?'}
          </Link>
        ))}
      </div>
    </div>
  )
}
