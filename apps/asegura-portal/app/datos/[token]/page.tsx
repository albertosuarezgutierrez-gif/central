import { tituloSolicitud } from '@central/module-seguros'
import { leerSolicitud } from '@/lib/solicitud-datos'
import Formulario from './Formulario'
import FormularioRegularizacion from './FormularioRegularizacion'

export const dynamic = 'force-dynamic'

/**
 * «Completa tus datos para el presupuesto» (24/09/2026). PÚBLICA y sin código, por
 * decisión de Alberto: el cliente suele haber escrito por WhatsApp y puede no tener
 * correo. Por eso aquí NO se enseña nada suyo —ni nombre, ni DNI, ni dirección—:
 * solo se piden los datos que faltan. Lo que mande vale para presupuestar y se
 * verifica al emitir. Enlace inexistente, anulado o caducado → la misma página.
 * El mismo enlace sirve para la REGULARIZACIÓN de RC (03/11/2026): pide la facturación del periodo. Tampoco enseña nada
 * del cliente: solo el periodo y la compañía.
 */
export default async function DatosPresupuesto({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const s = await leerSolicitud(token)
  return (
    <main className="caratula caratula-datos">
      <div className="seccion">
        {/* El logotipo completo, como la entrada del portal (no el monograma suelto): en azul de marca. */}
        <span className="entrada-marca">
          <span className="marca-palabra marca-palabra-grande" aria-hidden="true" />
          <span className="sr-marca">Grupo ASegura</span>
        </span>
        {s.estado === 'ok' && (
          <>
            {s.tercero ? (
              <>
                <h1 className="caratula-titulo">{tituloSolicitud(s.ramo, true)}</h1>
                <p className="suave" style={{ marginTop: 0 }}>
                  Son para preparar el presupuesto. Los puede rellenar esa persona, o tú con su permiso; lo que no sepas, déjalo en blanco si no es obligatorio.
                </p>
              </>
            ) : (
              <>
                <h1 className="caratula-titulo">{tituloSolicitud(s.ramo, false)}</h1>
                <p className="suave" style={{ marginTop: 0 }}>
                  Con esto te preparamos el precio. Te lleva dos minutos; lo que no sepas, déjalo en blanco si no es obligatorio.
                </p>
              </>
            )}
            <Formulario token={token} campos={s.campos} ramo={s.ramo} tercero={s.tercero} borrador={s.borrador} />
          </>
        )}
        {s.estado === 'regularizacion' && (
          <>
            <h1 className="caratula-titulo">Regularización de tu seguro de Responsabilidad Civil</h1>
            <p className="suave" style={{ marginTop: 0 }}>
              {s.compania === 'tu aseguradora' ? 'Tu aseguradora' : s.compania} nos pide la facturación real de tu actividad en el periodo para ajustar la prima. Te lleva un minuto.
            </p>
            <FormularioRegularizacion token={token} periodo={s.periodo} documentoYaSubido={s.documento} />
          </>
        )}
        {s.estado === 'completada' && (
          <>
            <h1 className="caratula-titulo">¡Recibido!</h1>
            <p className="suave" style={{ marginTop: 0 }}>
              {s.motivo === 'regularizacion_rc'
                ? 'Ya tenemos la facturación del periodo. La revisamos y te contamos.'
                : 'Ya tenemos tus datos. Te escribimos en cuanto tengamos el precio.'}
            </p>
          </>
        )}
        {s.estado === 'muerta' && (
          <>
            <h1 className="caratula-titulo">Este enlace ya no sirve</h1>
            <p className="suave" style={{ marginTop: 0 }}>Ha caducado o ya no es válido. Escríbenos y te mandamos uno nuevo.</p>
          </>
        )}
        {s.estado === 'error' && (
          <>
            <h1 className="caratula-titulo">No hemos podido abrir el formulario</h1>
            <p className="suave" style={{ marginTop: 0 }}>Es un fallo nuestro. Vuelve a probar en un rato.</p>
          </>
        )}
      </div>
    </main>
  )
}
