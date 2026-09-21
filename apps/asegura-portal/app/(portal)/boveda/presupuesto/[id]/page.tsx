import Link from 'next/link'
import { redirect } from 'next/navigation'

import { presupuestoDeSesion } from '@/lib/presupuesto'
import { TEXTO_AJENO, TEXTO_VINCULO_AMBIGUO, textoCaducidad } from '@/lib/presupuesto-vista'

import { Actual, Garantias, Mediador, Salidas, SinEquivalenteAviso, Tarjeta, fecha } from './Comparativa'
import { Plegable } from './RestoDeOpciones'

export const dynamic = 'force-dynamic'

/**
 * El presupuesto, ya con sesión. **Solo lectura**: en este PR no se elige, no se
 * firma y no sale nada hacia ninguna compañía (eso es el PR 4).
 *
 * Quién lo puede ver lo decide `presupuestoDeSesion()` y **solo** él: la
 * autorización no se reparte entre la página y la consulta. Aquí se pinta lo
 * que venga y se traducen sus cinco desenlaces, que NO se colapsan porque se
 * arreglan de formas distintas:
 *
 *   · `ajeno`           → 403 con texto NEUTRO. No se dice de quién es: sería un
 *                         oráculo de la cartera. Queda anotado para Alberto.
 *   · `vinculo_ambiguo` → su correo está en dos fichas. NO es «no eres tú».
 *   · `no_encontrado`   → no existe, o el id no tiene ni forma de uuid.
 *   · `error`           → falló la BD. Un fallo de lectura no se pinta como
 *                         «no tienes ningún presupuesto».
 *   · `sin_sesion`      → a la puerta.
 *
 * 📌 Un presupuesto CADUCADO se sigue enseñando: es información suya, y tachar
 * la página sería peor. Lo que cambia es que los precios van marcados como
 * caducados y no se ofrece elegir nada.
 */
export default async function PresupuestoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = await presupuestoDeSesion(id)

  if (r.estado === 'sin_sesion') redirect('/')

  if (r.estado === 'ajeno') {
    return (
      <Marco titulo="Este presupuesto no es de esta cuenta">
        <p style={{ marginTop: 0 }}>{TEXTO_AJENO}</p>
        <p style={{ margin: '12px 0 0', fontSize: 14 }}>
          <Link href="/boveda">Ir a mis seguros</Link>
        </p>
      </Marco>
    )
  }

  if (r.estado === 'vinculo_ambiguo') {
    return (
      <Marco titulo="Lo está revisando el corredor">
        <p className="pendiente" style={{ marginTop: 0 }}>
          {TEXTO_VINCULO_AMBIGUO}
        </p>
      </Marco>
    )
  }

  if (r.estado === 'no_encontrado') {
    return (
      <Marco titulo="No encuentro ese presupuesto">
        <p style={{ marginTop: 0 }}>
          Puede que el enlace esté incompleto o que se haya retirado. Escríbeme y te preparo otro.
        </p>
      </Marco>
    )
  }

  if (r.estado === 'error') {
    // 🚨 Un fallo de lectura NO se pinta como «no hay nada»: eso convertiría una
    // avería nuestra en una afirmación sobre su presupuesto.
    return (
      <Marco titulo="No he podido cargar tu presupuesto">
        <p className="pendiente" style={{ marginTop: 0 }}>
          Ha fallado la lectura, así que no te enseño nada en vez de enseñarte algo a medias. Vuelve
          a intentarlo en un momento.
        </p>
      </Marco>
    )
  }

  const p = r.presupuesto
  const portada = p.opciones.filter((o) => o.esPortada)
  const resto = p.opciones.filter((o) => !o.esPortada)
  const companias = new Set(portada.map((o) => o.compania)).size

  return (
    <>
      <p className="antetitulo">Tu presupuesto</p>
      <h1 className="ficha-titulo">
        {p.actual === null ? 'Lo que te ofrecen las compañías' : `Alternativas a tu seguro de ${p.actual.ramo}`}
      </h1>

      {/* 🚨 Nunca «válido hasta el X» a secas: sonaría a compromiso de la
          compañía, y la compañía no ha comprometido nada. */}
      <p className={p.caducado ? 'pendiente' : 'suave'} style={{ marginTop: 0 }}>
        {textoCaducidad(fecha(p.creadoAt), fecha(p.venceEl), p.caducado)}
      </p>

      {p.retirado && (
        <p className="pendiente">
          Este presupuesto está retirado: lo que ves es lo que te enseñé, pero ya no lo doy por bueno.
        </p>
      )}

      {p.vistaDeCorredor && (
        // No sella `visto_at` (lo corta `presupuestoDeSesion`), y se dice: si no,
        // Alberto no sabría que lo que está viendo no cuenta como visto.
        <p className="pendiente">
          Estás viendo esta pantalla como la ve el cliente. Abrirla así no cuenta como que él la haya
          abierto.
        </p>
      )}

      <Actual actual={p.actual} />

      <section className="seccion">
        <h2 style={{ marginTop: 0 }}>Lo que he encontrado</h2>
        <SinEquivalenteAviso motivo={p.motivoSinEquivalente} />

        {portada.length === 0 ? (
          <p className="pendiente">
            Este presupuesto no tiene ninguna opción guardada. Escríbeme y lo reviso.
          </p>
        ) : (
          <div className="presu-tarjetas">
            {portada.map((o) => (
              <Tarjeta key={o.id} o={o} caducado={p.caducado} />
            ))}
          </div>
        )}
      </section>

      {portada.map((o) => (
        <section className="seccion" key={`g-${o.id}`}>
          <Garantias o={o} actual={p.actual} />
        </section>
      ))}

      {/* Cerrado por defecto y con montaje perezoso (regla de rendimiento).
          ⚠️ Hoy `resto` está SIEMPRE vacío: el preparador congela solo las
          opciones de portada y la lista larga se quedó en la tarificación, que
          el portal no puede leer (§5.1: el cliente ve el snapshot y nada más).
          Cuando se congelen todas, esto las pinta sin tocar nada. */}
      {resto.length > 0 && (
        <section className="seccion">
          <Plegable titulo={`Ver el resto de opciones (${resto.length})`}>
            <div className="presu-tarjetas">
              {resto.map((o) => (
                <Tarjeta key={o.id} o={o} caducado={p.caducado} />
              ))}
            </div>
          </Plegable>
        </section>
      )}

      <Salidas caducado={p.caducado} hayPolizaActual={p.actual !== null} />
      <Mediador companiasEnPortada={companias} />

      <p className="volver">
        <Link href="/boveda">← Volver a mis seguros</Link>
      </p>
    </>
  )
}

function Marco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <>
      <h1 className="ficha-titulo">{titulo}</h1>
      <div className="seccion">{children}</div>
    </>
  )
}
