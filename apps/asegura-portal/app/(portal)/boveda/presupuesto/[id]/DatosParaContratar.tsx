import Link from 'next/link'

import { fraseDato, type DatosParaContratar as Datos } from '@/lib/datos-emision'
import { SubirDni } from './SubirDni'

/**
 * «Datos para contratar» (§4bis): lo que tenemos de ti y lo que falta para poder emitir. Solo lo
 * común a todas las compañías; si la que elijas pide algo más, se pide después, al elegir.
 */
export function DatosParaContratar({ datos, corredor }: { datos: Datos | null; corredor: boolean }) {
  if (datos === null) {
    return (
      <section className="seccion">
        <h2 style={{ marginTop: 0 }}>Datos para contratar</h2>
        <p className="pendiente" style={{ margin: 0 }}>
          Ahora mismo no podemos comprobar tus datos. No quiere decir que falte nada: vuelve a mirarlo en un rato.
        </p>
      </section>
    )
  }
  const faltaDni = datos.datos.some((d) => d.aporta === 'cliente_dni' && d.estado === 'falta')
  const faltaEnMisDatos = datos.datos.some((d) => d.aporta === 'cliente_datos' && d.estado === 'falta')
  return (
    <section className="seccion">
      <h2 style={{ marginTop: 0 }}>Datos para contratar</h2>
      <p style={{ marginTop: 0 }}>
        {datos.faltanCliente === 0
          ? 'Tenemos lo necesario para contratarlo contigo.'
          : `Para poder contratarlo nos ${datos.faltanCliente === 1 ? 'falta un dato tuyo' : `faltan ${datos.faltanCliente} datos tuyos`}. Si la compañía que elijas pide algo más, te lo pediremos entonces.`}
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
        {datos.datos.map((d) => (
          <li key={d.campo} style={{ display: 'grid', gap: 2, overflowWrap: 'anywhere' }}>
            <strong style={{ fontSize: 14 }}>{d.etiqueta}</strong>
            <span style={{ fontSize: 14, color: d.estado === 'falta' && d.aporta !== 'corredor' ? 'var(--negative, #b42318)' : 'inherit' }}>
              {fraseDato(d)}
            </span>
          </li>
        ))}
      </ul>
      {faltaEnMisDatos && (
        <p style={{ margin: '12px 0 0' }}>
          <Link href="/boveda?vista=datos" className="boton" style={{ display: 'inline-flex', minHeight: 44, alignItems: 'center' }}>
            Completar en Mis datos
          </Link>
        </p>
      )}
      {faltaDni && <SubirDni corredor={corredor} />}
    </section>
  )
}
