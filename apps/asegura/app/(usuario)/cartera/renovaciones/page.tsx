import Link from 'next/link'
import { requireSession } from '@/lib/session'
import { correduriaUnica, vencimientosProximos } from '@/lib/cartera'
import { cabenEnTanda } from '@/lib/codeoscopic/contador'
import { estadoConsumo } from '@/lib/codeoscopic/cotizar'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { eur } from '@/lib/dinero'
import type { UrgenciaRenovacion } from '@central/module-seguros'

export const dynamic = 'force-dynamic'

/**
 * La lista de trabajo de renovaciones: qué cartera hay que defender, en orden
 * de urgencia REAL (la fecha, no la etiqueta del estado), y cuánto costaría
 * pedir precio de todas.
 *
 * ─── Por qué esta pantalla, y por qué ahora ─────────────────────────────────
 * Defender un cliente es más barato que captar uno. La cartera viva son ~80
 * pólizas de auto: pedir precio de calle para TODAS cuesta unos 40€, una vez.
 * Lo que faltaba no era el dinero, era saber a cuáles y con qué prisa.
 *
 * ─── Lo que NO hace, y es honesto decirlo ───────────────────────────────────
 * No hay botón de «retarificar todas». No es una omisión: las 80 pólizas vivas
 * traen matrícula y nada más (medido 01/09/2026), así que cada una necesita que
 * alguien elija la versión del vehículo del catálogo. Una tanda automática será
 * posible el día que se contraten los créditos de `GET /vehicles` o que se suba
 * el PDF de la póliza, que sí trae marca y modelo.
 *
 * Mientras tanto esto es lo que de verdad hace falta: la lista, el orden y el
 * coste — con un enlace por póliza al botón que ya existe.
 */
export default async function RenovacionesPage() {
  await requireSession()

  if (!aseguraConfigurada()) {
    return (
      <div className="card">
        <h2>⏳ Conexión con la cartera pendiente de configurar</h2>
        <p>
          Falta <code>ASEGURA_DATABASE_URL</code>. Esto <strong>no</strong> significa que no haya
          renovaciones: significa que aún no se pueden leer.
        </p>
      </div>
    )
  }

  const correduria = await correduriaUnica().catch(() => null)
  if (!correduria) {
    return (
      <div className="card">
        <h2>⚠️ No se ha podido resolver la correduría</h2>
        <p>Sin ese dato no se consulta la cartera. No lo leas como «no hay renovaciones».</p>
      </div>
    )
  }

  const proximas = await vencimientosProximos(correduria.id)
  // «Defendible» = de auto Y con el vehículo identificado. Si el objeto está
  // `no_informado` o `cifrado` no se puede cotizar todavía, y contarla en la
  // tanda daría un coste que no se corresponde con lo que se puede hacer.
  const defendibles = proximas.filter((p) => p.tipo === 'auto' && p.objeto.estado === 'conocido')

  // El coste de la tanda solo se puede calcular si el libro se puede leer. Si
  // no, se dice — no se pinta un «0,00€» que parecería que sale gratis.
  // El consumo REAL, no uno reconstruido: partir de cero haría parecer el tope
  // más vacío de lo que está, y la pantalla diría que caben más de las que caben.
  const consumo = await estadoConsumo(correduria.id)
  const tanda =
    'error' in consumo ? null : cabenEnTanda(defendibles.length, consumo.consumo, consumo.topes)

  return (
    <div className="grid">
      <div>
        <p className="muted">
          <Link href="/cartera">← Cartera</Link>
        </p>
        <h1>Renovaciones</h1>
        <p className="muted">
          Lo que vence en los próximos 90 días, por urgencia real. Defender un cliente cuesta menos
          que captar uno.
        </p>
      </div>

      {proximas.length === 0 ? (
        <div className="card">
          <h2>Nada vence en los próximos 90 días</h2>
          <p className="muted">
            Ojo: las pólizas <strong>sin fecha de vencimiento</strong> no salen aquí, y eso no
            significa que no venzan — significa que no se sabe cuándo. El resumen las cuenta aparte.
          </p>
        </div>
      ) : (
        <>
          <div className="card">
            <h2>Coste de pedir precio de todas</h2>
            {tanda === null ? (
              <p className="err">
                No se puede calcular: {'error' in consumo ? consumo.error : 'motivo desconocido'}. No
                lo leas como que sale gratis.
              </p>
            ) : (
              <>
                <p>
                  <strong>{defendibles.length}</strong> póliza(s) de auto defendible(s) ·{' '}
                  {tanda.recortada ? (
                    <>
                      hoy caben <strong>{tanda.caben}</strong> por el tope, y costarían{' '}
                      <strong>{tanda.coste}</strong>
                    </>
                  ) : (
                    <>
                      caben todas y costarían <strong>{tanda.coste}</strong>
                    </>
                  )}
                </p>
                {tanda.recortada && (
                  <p className="muted">
                    El resto no se pierde: el tope se renueva mañana. No se redondea hacia arriba
                    «porque casi cabían».
                  </p>
                )}
              </>
            )}
            <p className="muted">
              Todavía no hay un botón de «retarificar todas»: cada póliza necesita que elijas la
              versión del vehículo, porque la compañía manda la matrícula y nada más. Se podrá
              cuando se suba el PDF de la póliza o se contraten los créditos de búsqueda por
              matrícula.
            </p>
          </div>

          <div className="card">
            <h2>Qué vence</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Ramo</th>
                    <th>Objeto</th>
                    <th>Compañía</th>
                    <th>Vence</th>
                    <th>Plazo</th>
                    <th>Prima</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {proximas.map((p) => (
                    <tr key={p.id}>
                      <td>{p.cliente}</td>
                      <td>{p.tipo}</td>
                      <td title={p.objeto.nota ?? undefined}>
                        {p.objeto.titulo ?? <span className="muted">sin identificar</span>}
                        {p.objeto.detalle && (
                          <>
                            <br />
                            <span className="muted" style={{ fontSize: 12 }}>
                              {p.objeto.detalle}
                            </span>
                          </>
                        )}
                      </td>
                      <td>{p.aseguradora}</td>
                      <td>
                        {p.fechaVencimiento}
                        <br />
                        <span className="muted" style={{ fontSize: 12 }}>
                          {p.dias} día(s)
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${claseUrgencia(p.urgencia)}`}>
                          {ETIQUETA_URGENCIA[p.urgencia]}
                        </span>
                      </td>
                      <td>
                        {/* NULL = la compañía no informó la prima (pasa con Allianz
                            por EIAC). No es 0€. */}
                        {p.prima === null ? (
                          <span className="muted" title="La compañía no ha informado la prima">
                            —
                          </span>
                        ) : (
                          eur(p.prima)
                        )}
                      </td>
                      <td>
                        {p.tipo === 'auto' ? (
                          <Link href={`/cartera/poliza/${p.id}`}>Retarificar →</Link>
                        ) : (
                          <span className="muted" title="Hoy solo se retarifica auto">
                            —
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h2>Lo que dice la ley, y por qué importa aquí</h2>
            <p>
              <strong>Una subida de prima NO es una prórroga: es una modificación del contrato</strong>{' '}
              (LCS art. 22, criterio de la DGSFP). La compañía tiene que comunicarla con{' '}
              <strong>dos meses</strong>. Si no lo hizo en plazo, <strong>no puede imponerla</strong>:
              el contrato se prorroga en los términos anteriores.
            </p>
            <p className="muted">
              Por eso «última llamada» son los dos meses: es la ventana en la que todavía se puede
              discutir la subida además de buscar alternativa. Dentro del último mes ya solo cabe
              buscar alternativa.
            </p>
          </div>
        </>
      )}
    </div>
  )
}

const ETIQUETA_URGENCIA: Record<UrgenciaRenovacion, string> = {
  vencida: 'Vencida — recuperar',
  prorroga_inevitable: 'Prórroga inevitable',
  ultima_llamada: 'Última llamada',
  a_tiempo: 'A tiempo',
}

function claseUrgencia(u: UrgenciaRenovacion): string {
  if (u === 'vencida' || u === 'prorroga_inevitable') return 'danger'
  if (u === 'ultima_llamada') return 'warn'
  return 'ok'
}
