import Link from 'next/link'
import { redirect } from 'next/navigation'

import { TEXTO_SOLICITUD_MODULO } from '@central/module-seguros-portal'

import { fechaEs } from '@/lib/fechas'
import { tarjetasDeSesion } from '@/lib/modulos'

import { BotonSolicitarModulo } from './BotonSolicitarModulo'

export const dynamic = 'force-dynamic'

const ETIQUETA_DISPONIBILIDAD = {
  disponible: 'Disponible',
  bajo_solicitud: 'Bajo solicitud',
  proximamente: 'Próximamente',
} as const

/**
 * «Herramientas» (Fase 0, 22/10/2026): el catálogo de módulos gratis para clientes. Tarjeta por
 * módulo con lo que hace y un botón según su estado (Abrir / Solicitar / Apuntarme). Pedir deja una
 * fila `solicitado` y avisa al corredor; NADA se activa solo (RRHH lo da de alta el operador en el
 * Portal del Empleado, sin SSO). Reglas puras en `module-seguros-portal/src/modulos.ts`.
 */
export default async function HerramientasPage() {
  const tarjetas = await tarjetasDeSesion()
  if (tarjetas === null) redirect('/')

  return (
    <>
      <h1>Herramientas</h1>
      <p className="suave" style={{ marginTop: 0 }}>
        Herramientas gratis para nuestros clientes, pensadas alrededor de sus seguros.
      </p>

      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        {tarjetas.map((t) => (
          <li key={t.id}>
            <section className="seccion" aria-labelledby={`modulo-${t.id}`} style={{ margin: 0 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                <h2 id={`modulo-${t.id}`} style={{ margin: 0, overflowWrap: 'anywhere' }}>{t.nombre}</h2>
                {t.disponibilidad !== null && <span className="chip">{ETIQUETA_DISPONIBILIDAD[t.disponibilidad]}</span>}
              </div>
              <p style={{ marginBottom: 4 }}>{t.descripcion}</p>
              <p className="suave" style={{ marginTop: 0, fontSize: 14 }}>Relacionado con: {t.seguros}</p>

              {t.accion.tipo === 'abrir' && (
                <Link className="boton" href={t.accion.href}>Abrir</Link>
              )}
              {(t.accion.tipo === 'solicitar' || t.accion.tipo === 'apuntarse') && (
                <>
                  <p className="suave" style={{ fontSize: 14 }}>
                    {TEXTO_SOLICITUD_MODULO}
                    {t.id === 'rrhh' && ' El Portal del Empleado es otra aplicación: te enviaremos su acceso cuando lo activemos.'}
                  </p>
                  <BotonSolicitarModulo
                    modulo={t.id}
                    rotulo={t.accion.tipo === 'apuntarse' ? 'Apuntarme' : 'Solicitar'}
                  />
                </>
              )}
              {t.accion.tipo === 'solicitado' && (
                <p className="aviso-linea" role="status" style={{ marginBottom: 0 }}>
                  Lo pediste el {fechaEs(t.accion.desde)}. Tu corredor se pondrá en contacto contigo para activarlo.
                </p>
              )}
              {t.accion.tipo === 'activo' && (
                <p className="aviso-linea" role="status" style={{ marginBottom: 0 }}>{t.accion.texto}</p>
              )}
              {t.accion.tipo === 'sin_comprobar' && (
                <p className="aviso-linea" role="status" style={{ marginBottom: 0 }}>
                  Ahora mismo no hemos podido comprobar si ya lo tienes o lo has pedido. Vuelve a intentarlo en un rato.
                </p>
              )}
            </section>
          </li>
        ))}
      </ul>
    </>
  )
}
