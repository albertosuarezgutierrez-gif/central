import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { esRamoInmueble } from '@central/module-seguros-portal'
import { carteraDeIdentidad, polizasParaParte, type PolizaPortal } from '@/lib/cartera-lectura'
import { eur } from '@/lib/dinero'
import { vigenciaRiesgo } from '@/lib/datos-poliza-cima'
import { documentosDePoliza } from '@/lib/documentos-poliza'
import { fechaEs } from '@/lib/fechas'
import { rolesLegibles } from '@/lib/intervinientes'
import { partesDeIdentidad } from '@/lib/partes-siniestro'
import { personasDePoliza } from '@/lib/personas-poliza'
import { seguimientosDePartes } from '@/lib/parte-seguimiento'
import { getIdentidad } from '@/lib/session'

import { SeguimientoDeParte } from '../../SeguimientoParte'
import { PersonasDeTuPoliza, TercerosDeTusSiniestros } from '../../PersonasPoliza'
import {
  AvisoReciboDevuelto,
  textoSustitucion,
  Coberturas,
  ESTADO,
  HistorialCompanias,
  HistorialSiniestros,
  IconoRamo,
  RAMO,
  RecibosDePoliza,
  tituloDePoliza,
  tituloEsBien,
} from '../../PolizaVista'

export const dynamic = 'force-dynamic'

/**
 * La ficha de UNA póliza de la cartera.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🚨 EL ID DE LA URL NO CONSULTA NADA. Esta es la línea entera de esta página.
 *
 * Una ruta `/boveda/poliza/[id]` es el sitio exacto donde se filtra una cartera:
 * un `findUnique` sobre el modelo Poliza con el id de la URL como clave compila,
 * typechequea, y devuelve **200 con la póliza de un desconocido** a quien cambie
 * el número en la barra de direcciones. No falla. Sale.
 *
 * (📌 Ese `findUnique` no se escribe aquí literalmente ni en un comentario: el
 * guardián `test/regression-portal-aislamiento.test.ts` busca el patrón por
 * texto plano y no quita los comentarios antes de mirar, así que el ejemplo
 * haría fallar el cepo desde el único fichero que lo respeta. Se vio morder.)
 *
 * Por eso aquí se lee PRIMERO todo lo que esta sesión tiene derecho a ver
 * (`carteraDeIdentidad`, que parte de `portal_vinculo` y de las autorizaciones
 * vigentes) y DESPUÉS se busca el id dentro de esa lista. El id de la URL no es
 * una clave de consulta: es un filtro sobre un conjunto ya autorizado. Si no
 * está, es un 404 — nunca un 403, que confirmaría que la póliza existe.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Y los campos que llegan `null` siguen significando **«no visible en tu
 * nivel»**, no «no hay»: los pinta la misma pieza que la lista
 * (`PolizaVista.tsx`), para que las dos pantallas no puedan divergir.
 */
export default async function FichaPoliza({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const identidad = await getIdentidad()
  if (!identidad) redirect('/')

  const cartera = await carteraDeIdentidad(identidad.id)

  // Se busca en las dos listas ya autorizadas. `deOtro` sale de encontrarla en
  // las ajenas, no de un parámetro: quién es el titular lo decide la BD.
  let poliza: PolizaPortal | null = null
  let deOtro: string | null = null
  /** Papeles de esta identidad en la póliza, si la ve por FIGURAR en ella. `null` = no es el caso. */
  let figuraComo: string[] | null = null
  for (const t of cartera.propias) {
    const encontrada = t.polizas.find((p) => p.id === id)
    if (encontrada) poliza = encontrada
  }
  if (!poliza) {
    for (const t of cartera.autorizadas) {
      const encontrada = t.polizas.find((p) => p.id === id)
      if (encontrada) {
        poliza = encontrada
        deOtro = t.nombre
      }
    }
  }
  // Tercera lista ya autorizada: pólizas de otro tomador donde FIGURA (propietario,
  // conductor…). Igual que arriba, el id de la URL solo filtra lo que ya se ha leído.
  if (!poliza) {
    for (const t of cartera.intervinientes) {
      const encontrada = t.polizas.find((p) => p.id === id)
      if (encontrada) {
        poliza = encontrada
        deOtro = t.nombre
        figuraComo = t.interviniente?.rolesPorPoliza[encontrada.id] ?? []
      }
    }
  }
  if (!poliza) notFound()

  const p = poliza
  // Solo las propias: `documentosDePoliza` lo vuelve a comprobar contra la cartera, no se fía de `deOtro`.
  const documentos = deOtro ? null : await documentosDePoliza(identidad.id, p.id)
  // Partes de ESTA póliza con su estado. Se cruzan con la cartera ya leída arriba (sin lectura
  // nueva de siniestros); sin alcance de ver siniestros (`null`) no sale nada. Si los partes no se
  // pueden leer, la sección se calla: la ficha no se cae por esto y no se afirma nada.
  const partesPoliza = await partesDeIdentidad(identidad.id).then(
    (l) => l.filter((x) => x.polizaId === p.id),
    () => [],
  )
  // Personas de CIMA (asegura PR 880) por el puente: el id viaja, pero asegura vuelve a comprobar que la
  // póliza es de esta identidad (tomador propio o figura en ella). Sin puente o sin dato → `null` y se calla.
  // Una póliza vista por AUTORIZACIÓN no pide nada: sus personas no son de quien mira.
  const personas = deOtro && figuraComo === null ? null : await personasDePoliza(identidad.id, p.id)
  const seguimientos = seguimientosDePartes(partesPoliza, cartera)
  const partesConEstado = partesPoliza.flatMap((x) => {
    const seg = seguimientos.get(x.id) ?? null
    return seg ? [{ id: x.id, fecha: fechaEs(x.fechaHecho), seg }] : []
  })
  const vence = fechaEs(p.fechaVencimiento)
  const ramo = RAMO[p.ramo] ?? p.ramo
  // Lo que CIMA manda del contrato, ya filtrado por nivel y por lista blanca
  // (`lib/datos-poliza-cima.ts`): aquí no llega el `iban` cifrado, solo `•••• 1234`.
  const dc = p.datosCompania
  const emitida = fechaEs(p.fechaEmision)
  const efectoActual = fechaEs(p.fechaEfectoActual)
  const solicitada = fechaEs(p.fechaSolicitud)

  return (
    <>
      <p className="volver">
        <Link href="/boveda">‹ Mis seguros</Link>
      </p>

      <h1 className="ficha-titulo">
        <IconoRamo ramo={p.ramo} />
        {tituloDePoliza(p)}
      </h1>
      <p className="ficha-subtitulo">
        {tituloEsBien(p) ? `${p.compania} · ${ramo}` : ramo}
        {p.numeroPoliza && ` · Póliza ${p.numeroPoliza}`}
        {deOtro && ` · de ${deOtro}`}
      </p>
      {p.figuraTitular && (
        <p className="suave" style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
          {p.figuraTitular.roles.length > 0
            ? `${deOtro ?? 'Esta ficha'} figura en esta póliza como ${rolesLegibles(p.figuraTitular.roles)}.`
            : `${deOtro ?? 'Esta ficha'} figura en esta póliza.`}
          {p.figuraTitular.tomador && ` El tomador es ${p.figuraTitular.tomador}.`}
        </p>
      )}
      {(figuraComo !== null || (p.figura && p.figura.length > 0)) && (
        <p className="suave" style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
          {figuraComo !== null
            ? figuraComo.length > 0
              ? `Ves esta póliza porque figuras en ella como ${rolesLegibles(figuraComo)}.`
              : 'Ves esta póliza porque figuras en ella.'
            : `En esta póliza figuras como ${rolesLegibles(p.figura ?? [])}.`}
          {deOtro && ` El tomador es ${deOtro}.`}
        </p>
      )}

      <div className="chips" style={{ marginBottom: 20 }}>
        {p.renovacionSinConfirmar ? (
          <span className="chip aviso">Renovación sin confirmar</span>
        ) : (
          <span className={`chip${p.vigencia === 'vigente' ? ' ok' : ''}`}>{ESTADO[p.estado] ?? p.estado}</span>
        )}
        {!p.confirmadaCima && <span className="chip aviso">pendiente de confirmación por la compañía</span>}
        {/* `null` = tu nivel no llega a los siniestros de esta póliza; NO se
            pinta nada, porque un chip que dijera «no visible» le contaría a un
            tercero que hay algo que mirar. `[]` = no hay ninguno abierto. */}
        {(p.siniestrosAbiertos ?? []).map((s) => (
          <span key={s.id} className="chip aviso">
            siniestro {s.estado === 'en_tramitacion' ? 'en tramitación' : 'abierto'}
            {s.referencia ? ` ${s.referencia}` : ''}
          </span>
        ))}
      </div>

      {textoSustitucion(p) && <p className="hueco">{textoSustitucion(p)}.</p>}

      <AvisoReciboDevuelto p={p} />

      <section className="seccion" aria-labelledby="datos-titulo">
        <h2 id="datos-titulo">Tu póliza</h2>

        <dl className="ficha-datos">
          {p.bien.detalles.length > 0 && <Dato etiqueta="Detalles" valor={p.bien.detalles.join(' · ')} />}
          {/* 🏠 En un hogar la dirección hace de matrícula, y CIMA no la manda:
              si falta se DICE (regla «dato que no hay ≠ dato no mirado»), en
              vez de dejar la ficha titulada «Occident · Hogar» sin explicar.
              Solo en las tuyas: en una ajena `null` también puede ser tu nivel.
              Y nunca si la dirección EXISTE pero llega cifrada sin clave: eso
              sería afirmar una ausencia que no se ha comprobado. */}
          {!deOtro && p.bien.ubicacion === null && !p.bien.ubicacionCifrada && esRamoInmueble(p.ramo) && (
            <Dato etiqueta="Dirección del inmueble" valor="La compañía no nos la ha comunicado. Tu correduría puede anotarla." />
          )}
          <Dato etiqueta="Compañía" valor={p.compania} />
          <Dato etiqueta="Tipo de seguro" valor={ramo} />
          {dc.producto && <Dato etiqueta="Producto" valor={dc.producto} />}
          {p.numeroPoliza && <Dato etiqueta="Número de póliza" valor={p.numeroPoliza} />}
          {/* Fechas del EIAC: `null` = la compañía no la ha mandado, y no se pinta. */}
          {emitida && <Dato etiqueta="Fecha de emisión" valor={emitida} />}
          {efectoActual && <Dato etiqueta="Periodo actual desde" valor={efectoActual} />}
          {solicitada && <Dato etiqueta="Fecha de solicitud" valor={solicitada} />}
          {/* Sin vencimiento no hay calendario: se dice, porque el silencio
              aquí se lee como «ya te avisaremos» y no vamos a poder. */}
          <Dato
            etiqueta="Vencimiento"
            valor={
              (vence && p.renovacionSinConfirmar
                ? `Vencía el ${vence}. La compañía la sigue dando en vigor, pero aún no nos ha enviado la renovación. Si tienes dudas, pregúntanos`
                : vence) ??
              (p.vigencia === 'pendiente'
                ? 'No lo sabemos: no podemos avisarte ni confirmarte que siga en vigor'
                : 'No lo sabemos, así que no podemos avisarte')
            }
            ojo={vence === null || p.renovacionSinConfirmar}
          />
          {/* `prima === null` = el nivel no la enseña → se oculta. Lo que el
              cliente PAGA es la bruta; si no está, la neta y se dice que lo es.
              🚨 `dudosa`: la compañía manda lo de cada recibo y no la anual, y la
              lectura ya ha anulado las cifras. Se DICE, sin inventar un anual. */}
          {p.prima?.dudosa && p.prima.bruta === null && p.prima.anual === null && (
            <Dato
              etiqueta="Prima anual"
              valor={
                p.recibos !== null
                  ? 'La compañía no nos ha mandado la prima anual cerrada. Lo que pagas en cada recibo lo tienes abajo, en «Tus recibos de esta póliza».'
                  : 'La compañía no nos ha mandado la prima anual cerrada.'
              }
            />
          )}
          {p.prima !== null && (p.prima.bruta !== null || p.prima.anual !== null) && (
            <Dato
              etiqueta={p.prima.bruta !== null ? 'Prima anual' : 'Prima neta anual'}
              valor={`${eur((p.prima.bruta ?? p.prima.anual) as number)}${
                p.prima.bruta !== null ? ' (impuestos incluidos)' : ' (sin impuestos)'
              }${p.prima.fraccionamiento ? ` · ${p.prima.fraccionamiento}` : ''}`}
            />
          )}
          {/* Cobro: forma de pago y quién pasa los recibos (nivel `recibos`); la cuenta
              solo como `•••• 1234` (nivel `iban`). Un código que no sabemos leer ya
              llega a `null` y no se pinta. */}
          {dc.formaPago && <Dato etiqueta="Forma de pago" valor={dc.formaPago} />}
          {dc.cuentaCargo && <Dato etiqueta="Cuenta de cargo" valor={dc.cuentaCargo} />}
          {dc.gestionCobro && <Dato etiqueta="Quién te cobra" valor={dc.gestionCobro} />}
          {/* Riesgos que detalla la compañía (sin direcciones). `null` = no visible
              en tu nivel; `[]` = no los ha detallado: en los dos casos no se pinta. */}
          {dc.riesgos !== null && dc.riesgos.length > 0 && (
            <>
              <dt>{dc.riesgos.length === 1 ? 'Riesgo asegurado' : 'Riesgos asegurados'}</dt>
              <dd>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
                  {dc.riesgos.map((r, i) => {
                    const tipo = r.tipo ? (RAMO[r.tipo] ?? null) : null
                    const vig = vigenciaRiesgo(r)
                    return (
                      <li key={i} style={{ overflowWrap: 'anywhere' }}>
                        {[tipo, r.descripcion].filter(Boolean).join(' · ') || 'Riesgo'}
                        {vig && <span className="suave" style={{ display: 'block', fontSize: 13 }}>{vig}</span>}
                      </li>
                    )
                  })}
                </ul>
              </dd>
            </>
          )}
          {/* Beneficiarios (nivel `iban`: son datos de personas): orden, nombre y préstamo. Nunca DNI. */}
          {dc.beneficiarios !== null && dc.beneficiarios.length > 0 && (
            <>
              <dt>{dc.beneficiarios.length === 1 ? 'Beneficiario' : 'Beneficiarios'}</dt>
              <dd>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
                  {dc.beneficiarios.map((b, i) => (
                    <li key={i} style={{ overflowWrap: 'anywhere' }}>
                      {[b.nombre, b.prestamo && `préstamo ${b.prestamo.toLowerCase()}`].filter(Boolean).join(' · ')}
                    </li>
                  ))}
                </ul>
              </dd>
            </>
          )}
          {/* Suplementos (nivel `coberturas`): número, fecha y clase. El texto libre no se enseña. */}
          {dc.suplementos !== null && dc.suplementos.length > 0 && (
            <>
              <dt>{dc.suplementos.length === 1 ? 'Suplemento' : 'Suplementos'}</dt>
              <dd>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
                  {dc.suplementos.map((sp, i) => {
                    const f = sp.fecha ? fechaEs(new Date(`${sp.fecha}T00:00:00Z`)) : null
                    return (
                      <li key={i} style={{ overflowWrap: 'anywhere' }}>
                        {[sp.numero && `Nº ${sp.numero}`, f, sp.descripcion].filter(Boolean).join(' · ')}
                      </li>
                    )
                  })}
                </ul>
              </dd>
            </>
          )}
        </dl>

        <Coberturas p={p} />
      </section>

      {/* La documentación ORIGINAL de la compañía (el PDF de la póliza). `null` = no es tuya o tu nivel
          no la ve: no se pinta. `[]` = aún no nos la ha entregado, y se dice. */}
      {personas && <PersonasDeTuPoliza propias={personas.propias} otras={personas.otras} />}

      {documentos !== null && (
        <section className="seccion" aria-labelledby="documentos-titulo">
          <h2 id="documentos-titulo">Documentos de tu póliza</h2>
          {documentos.length === 0 ? (
            <p className="suave" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
              Aún no tenemos aquí la póliza original. En cuanto la compañía nos la entregue la verás en
              esta sección.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
              {documentos.map((d) => (
                <li key={d.id}>
                  <a className="boton auto" href={`/api/polizas/${p.id}/documentos/${d.id}`} style={{ minHeight: 44, overflowWrap: 'anywhere' }}>
                    Descargar {d.nombre}
                  </a>
                  <span className="suave" style={{ marginLeft: 8, fontSize: 13 }}>{fechaEs(d.creadoEn)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <HistorialCompanias p={p} />

      {/* Los recibos van justo detrás de los datos y ANTES del historial de
          siniestros: es el dinero, que es lo primero que un cliente comprueba.
          La sección entera no se pinta cuando el nivel no la permite, y la
          comprobación está DENTRO del componente para que no haya dos sitios
          donde acordarse. */}
      {p.recibos !== null && (
        <section className="seccion" aria-labelledby="recibos-titulo">
          <h2 id="recibos-titulo">Tus recibos de esta póliza</h2>
          <RecibosDePoliza p={p} />
        </section>
      )}

      {/* El historial va DESPUÉS de los datos de la póliza y ANTES del «si te ha
          pasado algo»: se lee «esto es lo que te ha pasado» y justo debajo «y
          esto es lo que haces si te pasa otra vez». No se pinta la sección
          entera cuando el nivel no la permite — la comprobación está dentro del
          componente, para que no haya dos sitios donde acordarse. */}
      {p.siniestros !== null && (
        <section className="seccion" aria-labelledby="siniestros-titulo">
          <h2 id="siniestros-titulo">Tus siniestros de esta póliza</h2>
          <HistorialSiniestros p={p} />
        </section>
      )}

      {/* Terceros de CIMA: solo dentro de la sección de siniestros que el nivel ya enseña, y solo de
          siniestros que están en la cartera AUTORIZADA (el id del puente filtra, no abre). */}
      {p.siniestros !== null && personas?.terceros && (
        <TercerosDeTusSiniestros siniestros={p.siniestros} terceros={personas.terceros} />
      )}

      {partesConEstado.length > 0 && (
        <section className="seccion" aria-labelledby="partes-titulo">
          <h2 id="partes-titulo">Partes que nos has dado de esta póliza</h2>
          <ul className="cartera">
            {partesConEstado.map((x) => (
              <li key={x.id} className="cartera-card">
                <h3>{x.fecha ? `Siniestro del ${x.fecha}` : 'Siniestro'}</h3>
                <SeguimientoDeParte s={x.seg} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="seccion" aria-labelledby="pasa-titulo">
        <h2 id="pasa-titulo">Si te ha pasado algo</h2>
        <p className="suave" style={{ margin: '0 0 12px', fontSize: 14, lineHeight: 1.5 }}>
          Lo que abre el siniestro es avisar a tu compañía. Nosotros nos enteramos igualmente y te
          hacemos el seguimiento.
        </p>
        {/* 🚨 Los teléfonos y el WhatsApp de la compañía NO se pintan aquí, y es
            una decisión, no un olvido. Ese bloque vive en `ParteSiniestro.tsx`
            con cuatro cepos encima (`test/regression-portal-canal-compania.test.ts`):
            que un `null` no se lea como «esta compañía no tiene teléfono», que
            nada diga «24 h», que un WhatsApp no lleve `href="tel:"` y que el
            cruce póliza→compañía sea por nombre EXACTO. Una segunda copia de esa
            interfaz aquí quedaría fuera de esos cepos el día que alguien toque
            una de las dos — y el fallo sería alguien marcando el número de
            urgencias de otra compañía a las tres de la mañana.
            Se enlaza, que además es donde se elige la póliza del parte — con
            esta YA preseleccionada (`?poliza=`): quien llega desde la ficha de
            un seguro concreto no debería tener que volver a encontrarlo en un
            desplegable con las demás. */}
        <p style={{ margin: 0 }}>
          {/* 03/10/2026: el enlace lleva SIEMPRE `?poliza=`, sea la póliza propia
              o ajena, con o sin alcance para dar partes. Antes, sin el alcance,
              iba a la pestaña general y salían las compañías de toda la cartera.
              Qué se puede hacer allí (parte o solo teléfono) lo decide la
              pantalla con `puedeParte`, y la ruta lo vuelve a comprobar (403). */}
          <Link className="boton auto" href={`/boveda?vista=siniestro&poliza=cartera:${p.id}`}>
            {polizasParaParte(cartera).has(p.id)
              ? `Ver los teléfonos de ${p.compania} y dar parte`
              : `Ver los teléfonos de ${p.compania}`}
          </Link>
        </p>
      </section>

    </>
  )
}

/** Una fila de la ficha. `ojo` para lo que cambia lo que el cliente puede esperar. */
function Dato({ etiqueta, valor, ojo }: { etiqueta: string; valor: string; ojo?: boolean }) {
  return (
    <>
      <dt>{etiqueta}</dt>
      <dd className={ojo ? 'ojo' : undefined}>{valor}</dd>
    </>
  )
}
