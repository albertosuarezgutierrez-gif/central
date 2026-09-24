import { MarcaAsegura } from '../../MarcaAsegura'
import { leerSolicitud } from '@/lib/solicitud-datos'
import Formulario from './Formulario'

export const dynamic = 'force-dynamic'

/**
 * «Completa tus datos para el presupuesto» (24/09/2026). PÚBLICA y sin código, por
 * decisión de Alberto: el cliente suele haber escrito por WhatsApp y puede no tener
 * correo. Por eso aquí NO se enseña nada suyo —ni nombre, ni DNI, ni dirección—:
 * solo se piden los datos que faltan. Lo que mande vale para presupuestar y se
 * verifica al emitir. Enlace inexistente, anulado o caducado → la misma página.
 */
export default async function DatosPresupuesto({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const s = await leerSolicitud(token)
  return (
    <main className="caratula">
      <div className="seccion">
        <span className="entrada-marca">
          <MarcaAsegura alto={34} />
        </span>
        {s.estado === 'ok' && (
          <>
            <h1 style={{ fontSize: '1.5rem', marginTop: 0 }}>Datos para tu presupuesto de {s.ramo === 'moto' ? 'moto' : 'coche'}</h1>
            <p className="suave" style={{ marginTop: 0 }}>
              Con esto te preparamos el precio. Te lleva dos minutos; lo que no sepas, déjalo en blanco si no es obligatorio.
            </p>
            <Formulario token={token} campos={s.campos} />
          </>
        )}
        {s.estado === 'completada' && (
          <>
            <h1 style={{ fontSize: '1.5rem', marginTop: 0 }}>¡Recibido!</h1>
            <p className="suave" style={{ marginTop: 0 }}>Ya tenemos tus datos. Te escribimos en cuanto tengamos el precio.</p>
          </>
        )}
        {s.estado === 'muerta' && (
          <>
            <h1 style={{ fontSize: '1.5rem', marginTop: 0 }}>Este enlace ya no sirve</h1>
            <p className="suave" style={{ marginTop: 0 }}>Ha caducado o ya no es válido. Escríbenos y te mandamos uno nuevo.</p>
          </>
        )}
        {s.estado === 'error' && (
          <>
            <h1 style={{ fontSize: '1.5rem', marginTop: 0 }}>No hemos podido abrir el formulario</h1>
            <p className="suave" style={{ marginTop: 0 }}>Es un fallo nuestro. Vuelve a probar en un rato.</p>
          </>
        )}
      </div>
    </main>
  )
}
