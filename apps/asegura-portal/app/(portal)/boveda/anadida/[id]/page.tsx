import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { prisma } from '@/lib/db'
import { eur } from '@/lib/dinero'
import { getIdentidad } from '@/lib/session'

import { BienDeclarada, IconoRamo, RAMO } from '../../PolizaVista'
import { EditarPoliza } from '../../EditarPoliza'
import { etiquetaProcedencia } from '@central/module-seguros-portal'

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

  const p = await prisma.portalPolizaDeclarada.findFirst({
    where: { id, identidadId: identidad.id },
  })
  if (!p) notFound()

  const ramo = p.ramo ? (RAMO[p.ramo] ?? p.ramo) : null
  const objeto =
    p.datosRamo && typeof p.datosRamo === 'object' && !Array.isArray(p.datosRamo)
      ? (p.datosRamo as Record<string, unknown>)
      : null

  return (
    <>
      <Link href="/boveda" className="volver">
        ‹ Mis seguros
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
        <span className="chip acento">Añadida por ti</span>
        <span className="chip">{etiquetaProcedencia(p.procedencia)}</span>
      </div>

      {/* 🚨 El aviso que justifica que esta ficha sea distinta de la de la
          cartera. Para el cliente las dos son «un seguro»; la diferencia real es
          que de esta la correduría no sabe nada, así que ni la revisa, ni avisa
          de su vencimiento, ni puede dar un parte por él. Decírselo aquí es lo
          que evita que cuente con algo que no tiene. */}
      <p className="hueco">
        <span className="pendiente">No la gestionamos</span>
        Esta póliza la has añadido tú: la guardamos para que la tengas a mano, pero no la lleva la
        correduría. No la revisamos, no te avisamos de su vencimiento y no podemos dar el parte por
        ti. Si quieres que pase a llevarla la correduría, dínoslo.
      </p>

      <section className="seccion" aria-labelledby="datos-titulo">
        <h2 id="datos-titulo">Lo que nos has dicho de ella</h2>

        <BienDeclarada
          ramo={p.ramo}
          matricula={p.matricula}
          referenciaCatastral={p.referenciaCatastral}
          datosRamo={objeto}
        />

        <div className="linea">
          {/* `Decimal` de Prisma → número ANTES de formatear. `null` es «no lo
              sabemos», jamás «0,00€»: un cero aquí sería una prima inventada. */}
          {p.primaAnual == null ? 'Prima anual: no la has indicado' : `Prima anual ${eur(Number(p.primaAnual))}`}
        </div>
      </section>

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
    </>
  )
}
