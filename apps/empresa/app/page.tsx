import { exigirContexto } from '@/lib/contexto'
import { Cabecera } from './_cabecera'
import { ElegirEmpresa } from './ElegirEmpresa'
import { urlApp, saltoDisponible } from '@/lib/destinos'
import { MEDIADOR } from '@central/legal-templates/encargado'
import { CATALOGO, herramientasVisibles, estadoEfectivo, diasDesde, puede } from '@central/core-herramientas'

export const dynamic = 'force-dynamic'

// Portada F1: banner de contrato pendiente + tarjetas SOLO de lo contratado (activa / pendiente de firma). Lo no contratado
// se oculta. Ningún dato de negocio (contadores = F3).
export default async function Portada() {
  const ctx = await exigirContexto()
  const c = ctx.cuenta
  if (!c) {
    return (
      <>
        <Cabecera cuentas={ctx.cuentas} actual={null} />
        <main className="contenido">
          <h1>Elige empresa</h1>
          <ElegirEmpresa opciones={ctx.cuentas.map((x) => ({ id: x.id, nombre: x.razonSocial }))} />
        </main>
      </>
    )
  }
  const ahora = new Date()
  const tarjetas = herramientasVisibles(c.herramientas, { rol: c.rol, concedidas: c.concedidas })
  const pendiente = c.pendiente && estadoEfectivo({ estado: 'enviado', caducaEn: c.pendiente.caducaEn }, ahora) === 'enviado' ? c.pendiente : null
  const firmo = puede(c.rol, 'firmar')
  return (
    <>
      <Cabecera cuentas={ctx.cuentas} actual={c} />
      <main className="contenido">
        <h1>{c.razonSocial}</h1>
        {pendiente && (
          <div className="banner-contrato" role="status">
            <p><strong>Contrato pendiente de firma</strong> · enviado hace {diasDesde(pendiente.emitidaEn, ahora)} días.{' '}
              {firmo ? 'Hasta que lo firmes, las herramientas nuevas no se pueden abrir.' : 'Lo firma el titular de la empresa; tú puedes leerlo.'}</p>
            <a className="btn" href={`/contrato/${pendiente.versionId}`}>{firmo ? 'Leer y firmar' : 'Leer el contrato'}</a>
          </div>
        )}
        {tarjetas.length === 0 && <p className="tenue">Aún no tienes ninguna herramienta abierta en esta empresa. Si la esperabas, pídesela al titular o a Grupo ASegura.</p>}
        <div className="rejilla">
          {tarjetas.map((t) => {
            const h = CATALOGO[t.herramienta]
            const salto = t.abrible && saltoDisponible(t.herramienta)
            const url = urlApp(t.herramienta)
            return (
              <section key={t.herramienta} className={`tarjeta${t.estado === 'pendiente_firma' ? ' tarjeta-pendiente' : ''}`}>
                <div className="tarjeta-texto">
                  <strong>{h.nombre}</strong>
                  <span className="tenue">{h.descripcion}</span>
                  {t.estado === 'pendiente_firma'
                    ? <span className="estado estado-aviso">{firmo ? 'Pendiente de tu firma' : 'Pendiente de firma del titular'}</span>
                    : <span className="estado estado-ok">Activa</span>}
                  <div className="tarjeta-acciones">
                    {salto && (
                      <form method="post" action="/api/traspaso">
                        <input type="hidden" name="herramienta" value={t.herramienta} />
                        <button type="submit" className="btn">Abrir</button>
                      </form>
                    )}
                    {t.abrible && !salto && url && <a className="btn btn-sec" href={url} rel="noopener">Entrar con tu correo</a>}
                    {t.abrible && !salto && !url && <span className="tenue">Enlace directo pendiente de conectar.</span>}
                  </div>
                </div>
              </section>
            )
          })}
        </div>
        <p className="tenue" style={{ marginTop: 24 }}>Al abrir una herramienta, esa herramienta vuelve a comprobar tu acceso. Si te dice que no lo tienes, pídeselo al titular.</p>
      </main>
      <footer className="pie-panel">
        Más herramientas de {MEDIADOR.marca}: escríbenos a {MEDIADOR.identidad.email} · Tus seguros, aparte, en {MEDIADOR.identidad.portal.replace('https://', '')}
      </footer>
    </>
  )
}
