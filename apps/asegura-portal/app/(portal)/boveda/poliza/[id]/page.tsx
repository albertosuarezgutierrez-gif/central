import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { carteraDeIdentidad, type PolizaPortal } from '@/lib/cartera-lectura'
import { eur } from '@/lib/dinero'
import { fechaEs } from '@/lib/fechas'
import { getIdentidad } from '@/lib/session'

import {
  AvisoReciboDevuelto,
  Coberturas,
  ESTADO,
  HistorialSiniestros,
  IconoRamo,
  RAMO,
  Recibos,
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
  if (!poliza) notFound()

  const p = poliza
  const vence = fechaEs(p.fechaVencimiento)
  const ramo = RAMO[p.ramo] ?? p.ramo

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

      <div className="chips" style={{ marginBottom: 20 }}>
        <span className={`chip${p.vigencia === 'vigente' ? ' ok' : ''}`}>{ESTADO[p.estado] ?? p.estado}</span>
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

      <AvisoReciboDevuelto p={p} />

      <section className="seccion" aria-labelledby="datos-titulo">
        <h2 id="datos-titulo">Tu póliza</h2>

        <dl className="ficha-datos">
          {p.bien.detalles.length > 0 && <Dato etiqueta="Detalles" valor={p.bien.detalles.join(' · ')} />}
          <Dato etiqueta="Compañía" valor={p.compania} />
          <Dato etiqueta="Tipo de seguro" valor={ramo} />
          {p.numeroPoliza && <Dato etiqueta="Número de póliza" valor={p.numeroPoliza} />}
          {/* Sin vencimiento no hay calendario: se dice, porque el silencio
              aquí se lee como «ya te avisaremos» y no vamos a poder. */}
          <Dato
            etiqueta="Vencimiento"
            valor={
              vence ??
              (p.vigencia === 'pendiente'
                ? 'No lo sabemos: no podemos avisarte ni confirmarte que siga en vigor'
                : 'No lo sabemos, así que no podemos avisarte')
            }
            ojo={vence === null}
          />
          {/* `prima === null` = el nivel no la enseña → se oculta. Lo que el
              cliente PAGA es la bruta; si no está, la neta y se dice que lo es. */}
          {p.prima !== null && (p.prima.bruta !== null || p.prima.anual !== null) && (
            <Dato
              etiqueta={p.prima.bruta !== null ? 'Prima anual' : 'Prima neta anual'}
              valor={`${eur((p.prima.bruta ?? p.prima.anual) as number)}${
                p.prima.bruta !== null ? ' (impuestos incluidos)' : ' (sin impuestos)'
              }${p.prima.fraccionamiento ? ` · ${p.prima.fraccionamiento}` : ''}`}
            />
          )}
        </dl>

        <Recibos p={p} />
        <Coberturas p={p} />
      </section>

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
            Se enlaza, que además es donde se elige la póliza del parte. */}
        <p style={{ margin: 0 }}>
          <Link className="boton auto" href="/boveda?vista=siniestro">
            Ver los teléfonos de {p.compania} y dar parte
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
