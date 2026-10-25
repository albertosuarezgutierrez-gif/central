import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { registrarUso } from '@/lib/autorizaciones'
import { accesoADeclarada } from '@/lib/declarada-ajena'
import { prisma } from '@/lib/db'
import { DECLARADA_NO_ELIMINADA } from '@/lib/declaradas-eliminadas'
import { eur } from '@/lib/dinero'
import { evolucionDePrimaDePoliza } from '@/lib/evolucion-prima'
import { clavePedida, estadoCaptacion, PREFIJO_CAPTACION } from '@/lib/captacion-declarada'
import { entradaDesdeFila, hayClaveIA, huellaRevision } from '@/lib/revision-poliza'
import { leerRevisionDeSesion } from '@/lib/revision-poliza-bd'
import { esRamoDeVivienda } from '@central/module-patrimonio'
import { avisosPolizasSinInmueble } from '@/lib/patrimonio/poliza-sin-inmueble-bd'
import { fechaEs } from '@/lib/fechas'
import { getIdentidad } from '@/lib/session'

import { AvisoPolizaSinInmueble } from '../../../patrimonio/AvisoPolizaSinInmueble'
import { BienDeclarada, IconoRamo, RAMO } from '../../PolizaVista'
import { CaptacionDeclarada } from '../../CaptacionDeclarada'
import { EvolucionPrima } from '../../EvolucionPrima'
import { EditarPoliza } from '../../EditarPoliza'
import { EliminarPoliza } from '../../EliminarPoliza'
import { RevisarPoliza } from './RevisarPoliza'
import { avisoPartesConservados, etiquetaProcedencia } from '@central/module-seguros-portal'

export const dynamic = 'force-dynamic'

const RAMOS_OPCIONES = Object.entries(RAMO).map(([valor, etiqueta]) => ({ valor, etiqueta }))

/**
 * La ficha de una póliza que ha AÑADIDO el cliente.
 *
 * Nace el 05/09/2026 de *«mis seguros y mis pólizas es lo mismo»*: al fundir la
 * pestaña «Mis pólizas» dentro de «Mis seguros», estas pólizas pasan a ser una
 * fila más de la lista, y una fila necesita una ficha donde entrar. Antes cada
 * una era una tarjeta con el formulario de edición desplegado dentro, en una
 * pestaña aparte; eso es justo lo que Alberto llamó «muy sucia la página»
 * cuando lo vio en la cartera.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🚨 EL ID DE LA URL NO ES UNA CLAVE DE CONSULTA POR SÍ SOLO.
 *
 * Aquí la regla se cumple distinto que en la ficha de la cartera. Estas filas
 * son de esta identidad y de nadie más, así que **la identidad va DENTRO del
 * `where`** junto al id: si el id no es suyo, la consulta no devuelve nada y
 * esto es un 404. Nunca un 403 — un 403 confirmaría que esa póliza existe.
 *
 * Lo que NO se puede hacer es leer por id y comprobar el dueño después: eso
 * compila, typechequea y funciona… hasta el día que alguien mueva la comprobación
 * de sitio o la envuelva en un `if`. La guarda tiene que estar en la consulta.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 📌 Y no se pinta ni un dato de la correduría: **esta póliza no la gestiona
 * nadie de la casa**. Por eso la pantalla lo dice en voz alta en vez de dejar
 * que se parezca a las otras.
 */
export default async function FichaAnadida({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const identidad = await getIdentidad()
  if (!identidad) redirect('/')

  // 🔒 De quién es la fila (12/10/2026): la propia, o la de un titular que le ha
  // abierto su ficha ENTERA (`accesoADeclarada`, fail-closed). Sin acceso → 404,
  // igual que si no existiera. Y la identidad resuelta va DENTRO del `where`.
  const acceso = await accesoADeclarada(identidad.id, id, 'ver')
  if (acceso === null) notFound()
  const duenaId = acceso.identidadId
  // Consulta y Gestión miran; solo «Total» (o la propia) corrige y quita.
  const deOtro = !acceso.propia
  const puedeEditar = acceso.propia || acceso.capacidades?.editarDeclaradas === true
  const puedeQuitar = acceso.propia || acceso.capacidades?.quitarDeclaradas === true

  const p = await prisma.portalPolizaDeclarada.findFirst({
    where: { id, identidadId: duenaId, ...DECLARADA_NO_ELIMINADA },
  })
  if (!p) notFound()

  // Mirar la póliza de otro es USO de su autorización: se anota (lo ve el titular).
  if (deOtro) await registrarUso(identidad.id, acceso.autorizacionIds)

  // Cuántos partes cuelgan de esta póliza. Se cuenta AQUÍ, al pintar, para poder
  // decírselo antes de que confirme: el servidor lo vuelve a mirar al borrar
  // (y con los estados), así que esto informa, no autoriza. Todos los partes de
  // la póliza, también los que dio quien tiene acceso.
  const partes = await prisma.portalParteSiniestro.count({
    where: { polizaDeclaradaId: p.id },
  })

  // La tarjeta «¿Quieres verla siempre al día?»: solo en las PROPIAS (no las de un titular que dio
  // acceso) y vivas; lo decide `estadoCaptacion` con las marcas de ESTA identidad.
  const marcasCaptacion = acceso.propia
    ? await prisma.portalAvisoLeido.findMany({
        where: { identidadId: identidad.id, clave: { startsWith: PREFIJO_CAPTACION } },
        select: { clave: true, creadoEn: true },
      })
    : []
  const captacion = estadoCaptacion({
    propia: acceso.propia,
    eliminada: false,
    polizaId: p.id,
    marcas: marcasCaptacion,
    ahora: new Date(),
  })

  // «Revisar mi póliza»: solo en las PROPIAS. Si ya hay una revisión cacheada de lo leído (misma huella)
  // se enseña sin llamar a la IA; si la caché no se puede leer (`null`), no se ofrece nada (ni se afirma).
  const revisionCache = acceso.propia ? await leerRevisionDeSesion(p.id, huellaRevision(entradaDesdeFila(p))) : null
  const revisionDisponible = hayClaveIA(process.env) || Array.isArray(revisionCache)
  const revisionPedida = captacion === 'ya_pedida' || marcasCaptacion.some((m) => m.clave === clavePedida(p.id))

  // «Evolución de la prima»: solo las PROPIAS (el cron observa solo las aportadas de cada identidad).
  const evolucionPrima = await evolucionDePrimaDePoliza('aportada', p.id, acceso.propia)

  // Hogar/comunidad que no cuelga de ningún inmueble del patrimonio. Solo las PROPIAS (el aviso lista las declaradas de
  // esta identidad); si la lectura falla, la ficha no se cae y no afirma nada.
  const avisoSinInmueble = acceso.propia && esRamoDeVivienda(p.ramo)
    ? await avisosPolizasSinInmueble(identidad.id, { conPeticiones: true }).then(
        (l) => l.find((a) => a.tipo === 'declarada' && a.id === p.id) ?? null,
        () => null,
      )
    : null

  const ramo = p.ramo ? (RAMO[p.ramo] ?? p.ramo) : null
  const objeto =
    p.datosRamo && typeof p.datosRamo === 'object' && !Array.isArray(p.datosRamo)
      ? (p.datosRamo as Record<string, unknown>)
      : null

  return (
    <>
      <Link href="/boveda" className="volver">
        ‹ {deOtro ? 'Volver' : 'Mis seguros'}
      </Link>

      <h1 className="ficha-titulo">
        <IconoRamo ramo={p.ramo} />
        {p.compania ?? 'Póliza sin compañía identificada'}
      </h1>
      <p className="ficha-subtitulo">
        {ramo ?? 'Tipo de seguro sin indicar'}
        {p.numeroPoliza && ` · Póliza ${p.numeroPoliza}`}
      </p>

      <div className="chips" style={{ marginBottom: 20 }}>
        <span className="chip acento">{deOtro ? 'Añadida por su titular' : 'Añadida por ti'}</span>
        {deOtro && <span className="chip">{puedeEditar ? 'Puedes corregirla' : 'Solo lectura'}</span>}
        <span className="chip">{etiquetaProcedencia(p.procedencia)}</span>
      </div>

      {avisoSinInmueble && (
        <AvisoPolizaSinInmueble
          aviso={{
            tipo: avisoSinInmueble.tipo, id: avisoSinInmueble.id, ubicacion: avisoSinInmueble.ubicacion,
            referenciaCatastral: avisoSinInmueble.referenciaCatastral, propuesta: avisoSinInmueble.propuesta,
            peticion: avisoSinInmueble.peticion, titularClienteId: avisoSinInmueble.titularClienteId,
          }}
        />
      )}

      {/* 🚨 El aviso que justifica que esta ficha sea distinta de la de la
          cartera. Para el cliente las dos son «un seguro»; la diferencia real es
          que de esta la correduría no sabe nada, así que ni la revisa, ni avisa
          de su vencimiento, ni puede dar un parte por él. Decírselo aquí es lo
          que evita que cuente con algo que no tiene. */}
      <p className="hueco">
        <span className="pendiente">No la gestionamos</span>
        {deOtro
          ? 'Esta póliza la ha añadido su titular en su portal: no la lleva la correduría. Avisamos de su vencimiento, pero sus recibos y siniestros no se actualizan solos: los datos son los que su titular nos dio, y no podemos dar el parte por él.'
          : 'Esta póliza la has añadido tú: la guardamos para que la tengas a mano, pero no la lleva la correduría. Te avisamos de su vencimiento, pero sus recibos y siniestros no se actualizan solos: los datos son los que nos diste. No podemos dar el parte por ti. Si quieres que pase a llevarla la correduría, dínoslo.'}
      </p>

      {captacion !== 'oculta' && <CaptacionDeclarada polizaId={p.id} estado={captacion} />}

      <EvolucionPrima
        evolucion={evolucionPrima}
        hrefRevisar={null}
        textoSinEnlace={captacion !== 'oculta' ? 'Puedes pedirlo en la tarjeta de más arriba.' : 'Escríbenos o llámanos y la revisamos.'}
      />

      {acceso.propia && revisionCache !== null && (
        <RevisarPoliza
          polizaId={p.id}
          disponible={revisionDisponible}
          inicial={Array.isArray(revisionCache) ? revisionCache : null}
          pedidaInicial={revisionPedida}
        />
      )}

      <section className="seccion" aria-labelledby="datos-titulo">
        <h2 id="datos-titulo">{deOtro ? 'Lo que consta de ella' : 'Lo que nos has dicho de ella'}</h2>

        <BienDeclarada
          ramo={p.ramo}
          matricula={p.matricula}
          referenciaCatastral={p.referenciaCatastral}
          datosRamo={objeto}
        />

        <div className="linea">
          {/* `Decimal` de Prisma → número ANTES de formatear. `null` es «no lo
              sabemos», jamás «0,00€»: un cero aquí sería una prima inventada. */}
          {p.primaAnual == null
            ? deOtro
              ? 'Prima anual: no consta'
              : 'Prima anual: no la has indicado'
            : `Prima anual ${eur(Number(p.primaAnual))}`}
        </div>
      </section>

      {!puedeEditar && (
        <section className="seccion" aria-labelledby="venc-titulo">
          <h2 id="venc-titulo">Vencimiento</h2>
          <div className="linea">
            {p.fechaVencimiento ? `Vence el ${fechaEs(p.fechaVencimiento)}` : 'No sabemos cuándo vence'}
          </div>
        </section>
      )}

      {puedeEditar && (
      <section className="seccion" aria-labelledby="editar-titulo">
        <h2 id="editar-titulo">Corregir o completar</h2>
        {/* El vencimiento NO se pinta arriba: lo lleva entero `EditarPoliza`,
            que es quien puede decir «no sabemos cuándo vence» CON la acción al
            lado y quien refleja al instante lo que se acaba de guardar. */}
        <EditarPoliza
          ramos={RAMOS_OPCIONES}
          poliza={{
            id: p.id,
            compania: p.compania,
            numeroPoliza: p.numeroPoliza,
            ramo: p.ramo,
            primaAnual: p.primaAnual == null ? null : Number(p.primaAnual),
            periodicidadPago: p.periodicidadPago,
            referenciaCatastral: p.referenciaCatastral ?? null,
            // Un jsonb puede traer cualquier cosa; si no es un objeto plano se
            // degrada a `null` en vez de reventar el render. Un origen ilegible
            // es «no sabemos de dónde vino», no una excusa para dejar de pintar.
            datosRamoOrigen:
              p.datosRamoOrigen && typeof p.datosRamoOrigen === 'object' && !Array.isArray(p.datosRamoOrigen)
                ? (Object.fromEntries(
                    Object.entries(p.datosRamoOrigen as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
                  ) as Record<string, string>)
                : null,
            // Columna `date`: llega como medianoche UTC, así que el ISO
            // recortado es exactamente el día, sin desfase de zona.
            fechaVencimiento: p.fechaVencimiento ? p.fechaVencimiento.toISOString().slice(0, 10) : null,
            datosRamo:
              p.datosRamo && typeof p.datosRamo === 'object' && !Array.isArray(p.datosRamo)
                ? (p.datosRamo as Record<string, string | number | boolean>)
                : null,
            matricula: p.matricula,
            bastidor: p.bastidor,
            fechaMatriculacion: p.fechaMatriculacion
              ? p.fechaMatriculacion.toISOString().slice(0, 10)
              : null,
            deDocumento: p.documentoNombre !== null,
          }}
        />
      </section>
      )}

      {/* 🚨 Quitarla SOLO existe aquí, en la ficha de una póliza APORTADA. La
          ficha de una póliza de la cartera no tiene esta sección: lo que entra
          por CIMA es el registro de la correduría y el cliente no lo borra.
          Esta es suya —la subió él— y dejarla ahí cuando ya no vale ensucia la
          única lista donde mira qué tiene asegurado. */}
      {/* La carta de NO RENOVACIÓN (19/09/2026): solo existe en la ficha de
          una póliza APORTADA, por lo mismo que «quitarla» — una de la cartera
          la media la correduría y ahí se habla con Alberto, no se manda una
          carta sola. La carta se compone y se enseña; no se envía desde aquí. */}
      {!deOtro && (
      <section className="seccion" aria-labelledby="carta-titulo">
        <h2 id="carta-titulo">Si no quieres renovarla</h2>
        <p className="linea">
          Para que una póliza no se renueve hay que decírselo a la compañía por escrito con un mes de
          antelación al vencimiento. Te preparamos la carta con los datos de esta póliza y te decimos
          hasta qué día puedes enviarla.
        </p>
        <Link href={`/boveda/carta/${p.id}`} className="boton boton-secundario auto">
          Preparar la carta de no renovación
        </Link>
      </section>
      )}

      {puedeQuitar && (
      <section className="seccion" aria-labelledby="quitar-titulo">
        <h2 id="quitar-titulo">{deOtro ? 'Quitarla de su bóveda' : 'Quitarla de tu bóveda'}</h2>
        <p className="linea">
          Si la subiste por error o ya no tienes este seguro, puedes quitarla. Solo desaparece de tu
          bóveda: no cancela nada con la compañía, y lo que nos hayas contado de un siniestro se
          conserva.
        </p>
        <EliminarPoliza
          id={p.id}
          titulo={p.compania ?? 'esta póliza'}
          avisoPartes={avisoPartesConservados(partes)}
        />
      </section>
      )}
    </>
  )
}
