import { redirect } from 'next/navigation'

import {
  canalDeCompania,
  etiquetaProcedencia,
  plazoComunicacion,
  type FilaCompania,
} from '@central/module-seguros-portal'

import { companiasConCanal } from '@/lib/canales-compania'
import { carteraDeIdentidad, type PolizaPortal, type TitularPortal } from '@/lib/cartera-lectura'
import { prisma } from '@/lib/db'
import { eur } from '@/lib/dinero'
import {
  obligacionesDeIdentidad,
  polizasSinFechaDeVencimiento,
  sincronizarObligacionesDeIdentidad,
} from '@/lib/obligaciones'
import { partesDeIdentidad, type PartePortal } from '@/lib/partes-siniestro'
import { supresionesDelUsuario } from '@/lib/supresion'
import { getIdentidad } from '@/lib/session'

import Calendario from './Calendario'
import { FilaPoliza } from './FilaPoliza'
import { BienDeclarada, RAMO } from './PolizaVista'
import { vistaDeBoveda } from '@central/module-seguros-portal'

import { EditarPoliza } from './EditarPoliza'
import { ParteSiniestro, type ParteEnviado, type PolizaOpcionParte } from './ParteSiniestro'
import { SubirPoliza } from './SubirPoliza'
import { TusDatos } from './TusDatos'

export const dynamic = 'force-dynamic'

/** Las opciones del selector de ramo salen del MISMO mapa que las etiquetas de
 *  arriba (que son las de `RAMOS_POLIZA`), para que la lista de la pantalla y la
 *  que acepta el backend no se separen con el tiempo. Va como prop porque
 *  `EditarPoliza` y `SubirPoliza` (alta a mano) son componentes de cliente. */
const RAMOS_OPCIONES = Object.entries(RAMO).map(([valor, etiqueta]) => ({ valor, etiqueta }))

export default async function Boveda({
  searchParams,
}: {
  // Next 15 entrega los parámetros como promesa. La vista NO da acceso a nada:
  // lo que decide qué datos se leen es la sesión de abajo, así que un valor
  // raro aquí solo elige otra pestaña, nunca otros datos.
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const vista = vistaDeBoveda((await searchParams).vista)
  const identidad = await getIdentidad()
  if (!identidad) redirect('/')

  // Las tres primeras lecturas parten de la misma sesión: la cartera por
  // `portal_vinculo` de esta identidad, y la bóveda de declaradas y los partes
  // por `identidadId`. Ninguna acepta un id que venga de fuera.
  //
  // La cuarta es de otra naturaleza y por eso no lleva identidad: `companias_dgs`
  // es un catálogo público (códigos DGS y teléfonos que publican las propias
  // compañías), no la cartera de nadie. Ver `lib/canales-compania.ts`.
  const [cartera, declaradas, partes, companias] = await Promise.all([
    carteraDeIdentidad(identidad.id),
    prisma.portalPolizaDeclarada.findMany({
      where: { identidadId: identidad.id },
      orderBy: { creadaEn: 'desc' },
      take: 50,
    }),
    partesDeIdentidad(identidad.id),
    companiasConCanal(),
  ])

  // Las obligaciones se derivan de la cartera que YA se ha leído arriba (no se
  // vuelve a leer) y se releen después: el `upsert` es idempotente, así que
  // recargar la bóveda no duplica nada.
  await sincronizarObligacionesDeIdentidad(identidad.id, cartera)
  const obligaciones = await obligacionesDeIdentidad(identidad.id)

  const propiasVacia = cartera.propias.every((t) => t.polizas.length === 0)
  const correduria = cartera.correduria ?? 'Grupo ASegura'

  // Lo que se le ofrece elegir al dar un parte. Incluye las AUTORIZADAS a
  // propósito: la ruta acepta lo mismo (`carteraDeIdentidad` propias +
  // autorizadas), y ofrecer menos de lo que el backend admite deja fuera al
  // conductor que sí puede declarar el golpe del coche de su padre. La lista
  // sale SIEMPRE de la cartera ya leída para esta identidad: ningún id de
  // póliza entra desde la request.
  const polizasParte: PolizaOpcionParte[] = [
    ...cartera.propias.flatMap((t) => t.polizas.map((p) => opcionCartera(p, companias))),
    ...cartera.autorizadas.flatMap((t) =>
      t.polizas.map((p) => opcionCartera(p, companias, t.nombre)),
    ),
    ...declaradas.map((p) => ({
      valor: `declarada:${p.id}`,
      // 🚨 El cruce es por nombre EXACTO y aquí es donde más falla, a propósito:
      // el nombre de una póliza aportada lo leyó una IA de un PDF («MAPFRE
      // ESPAÑA S.A.»), así que muchas caerán en «pídenoslo». Es el degradado
      // correcto: una coincidencia aproximada acertaría casi siempre y alguna
      // vez daría el teléfono de urgencias de OTRA compañía.
      canal: canalDeCompania(p.compania, companias),
      etiqueta: [
        p.compania ?? 'Compañía sin identificar',
        p.ramo ? RAMO[p.ramo] ?? p.ramo : null,
        p.numeroPoliza ? `nº ${p.numeroPoliza}` : null,
        // Se dice de dónde sale para que no parezca otra póliza de la
        // correduría: esta la aportó la propia persona y puede que nosotros no
        // la tengamos contratada.
        'la añadiste tú',
      ]
        .filter(Boolean)
        .join(' · '),
    })),
  ]

  // El plazo del art. 16 LCS se calcula AQUÍ, en el servidor, y no en el
  // componente de cliente: `plazoComunicacion` necesita un «hoy», y un «hoy»
  // calculado en el navegador daría un número distinto al del servidor en el
  // primer render (aviso de hidratación) y otro más en cada zona horaria. La
  // página es `force-dynamic`, así que se recalcula en cada visita.
  // Sus solicitudes del art. 17, con la identidad resuelta por la cookie
  // (`lib/session`), no por el `identidad.id` que ya hay arriba: la puerta única
  // es la puerta única también aquí.
  //
  // Sin `try/catch`: si la consulta falla, que suba. Una lista vacía haría pasar
  // un fallo de BD por «no has pedido nada» en la pantalla donde decide si
  // vuelve a pedirlo — y aquí lo que corre por debajo es un plazo legal. El
  // `?? []` solo cubre el «no hay sesión», que en esta página es inalcanzable:
  // más arriba ya se redirigió a `/` si no la había.
  const supresiones = ((await supresionesDelUsuario()) ?? []).map((s) => ({
    id: s.id,
    recibidaEn: s.recibidaEn.toISOString(),
    estado: s.estado,
    plazo: s.plazo,
    fechaLimite: s.fechaLimite.toISOString(),
    resueltaEn: s.resueltaEn ? s.resueltaEn.toISOString() : null,
    respuesta: s.respuesta,
  }))

  const hoy = new Date()
  const partesEnviados: ParteEnviado[] = partes.map((p: PartePortal) => ({
    id: p.id,
    // Columna `date`: llega como medianoche UTC, así que el ISO recortado es
    // exactamente el día que declaró la persona, sin desfase de zona.
    fechaHecho: p.fechaHecho.toISOString().slice(0, 10),
    descripcion: p.descripcion,
    // 🚨 De `comunicado` (que sale de `comunicadoACompania()`), NUNCA de un
    // `estado !== 'enviado'`: `recibido` es «lo hemos leído nosotros», que es
    // justo el estado que se confunde con estar comunicado a la compañía.
    comunicado: p.comunicado,
    estado: p.estado,
    plazo: plazoComunicacion({ fechaHecho: p.fechaHecho, hoy }),
    // 🚨 El `null` se PROPAGA tal cual: significa «no se han podido consultar»,
    // y la pantalla lo dice. Colapsarlo aquí con un `?? []` lo convertiría en
    // «no adjuntaste nada», que es afirmar algo que nadie ha mirado — y hace
    // que quien sí mandó la foto del atestado no la vuelva a mandar.
    // Del adjunto solo bajan id, nombre y tamaño: el mime y el tipo son para
    // decidir qué se sirve, y eso se decide en el servidor al descargarlo.
    adjuntos:
      p.adjuntos === null ? null : p.adjuntos.map((a) => ({ id: a.id, nombre: a.nombre, bytes: a.bytes })),
  }))

  return (
    <>
      {/* El `<main>`, el ancho y la navegación los pone el armazón del grupo
          (`app/(portal)/layout.tsx`). La pantalla del consentimiento sigue
          estando a un toque, como una sección más de la navegación: quien
          quiere saber quién le está mirando los seguros —o quitárselo a
          alguien— no debería tener que recorrer nada para encontrarlo. */}
      <h1>Mis seguros</h1>

      {vista === 'seguros' && (
        <>
          <Calendario obligaciones={obligaciones} sinFecha={polizasSinFechaDeVencimiento(cartera)} />

      <section className="seccion" aria-labelledby="cartera-titulo">
        <h2 id="cartera-titulo">Tus seguros en {correduria}</h2>
        {!cartera.vinculada ? (
          // Sin vínculo ≠ sin pólizas: no hay ficha con este email. No se
          // inventan teléfonos ni emails de la correduría: solo `nombre` es legible.
          <p className="suave" style={{ margin: 0 }}>
            No hemos encontrado ninguna póliza a nombre de este email. Si eres cliente con otro email,
            escríbenos por tu canal habitual con {correduria} y lo vinculamos.
          </p>
        ) : propiasVacia ? (
          <p className="suave" style={{ margin: 0 }}>
            Tu ficha está en {correduria}, pero no tiene pólizas vivas ahora mismo.
          </p>
        ) : (
          cartera.propias.map((t) => <Titular key={t.clienteId} titular={t} propia />)
        )}
      </section>

      {cartera.autorizadas.length > 0 && (
        <section className="seccion" aria-labelledby="autorizadas-titulo">
          <h2 id="autorizadas-titulo">Seguros que te han autorizado a ver</h2>
          {cartera.autorizadas.map((t) => (
            <Titular key={t.clienteId} titular={t} propia={false} />
          ))}
        </section>
      )}

      {/* El derecho de supresión (art. 17). Va aquí, dentro de la vista que la
          persona abre por defecto y con el nombre que la política de privacidad
          le da («Mis seguros → Tus datos»), y NO como una pestaña quinta: la
          barra son cuatro por decisión de diseño. Y va en la pantalla, no solo
          enlazado desde un texto legal: un derecho que solo se ejerce
          escribiendo un correo es un derecho con peaje. */}
      <TusDatos inicial={supresiones} />
        </>
      )}

      {/* El parte tiene sección PROPIA, y sigue yendo antes que la bóveda de
          aportadas en la barra: quien entra con un siniestro recién ocurrido
          tiene prisa, y la bóveda es una tarea tranquila que puede esperar a
          mañana. Antes había que bajar por delante de toda la cartera para
          llegar aquí. */}
      {vista === 'siniestro' && (
        <ParteSiniestro polizas={polizasParte} partes={partesEnviados} />
      )}

      {vista === 'polizas' && (
        <>
      <section className="seccion" aria-labelledby="boveda-titulo">
        <h2 id="boveda-titulo">Pólizas que has añadido tú</h2>
        {declaradas.length === 0 ? (
          // «Todavía no has añadido ninguna» — no «no tienes seguros»: los de
          // la correduría van arriba, esto es lo que aporta la persona.
          <p className="suave" style={{ margin: 0 }}>Todavía no has añadido ninguna póliza.</p>
        ) : (
          <ul className="cartera columna">
            {declaradas.map((p) => (
              <li key={p.id} className="cartera-card">
                <h3>
                  {p.compania ?? 'Compañía sin identificar'}
                  {/* La MISMA etiqueta que ofrece el selector de `EditarPoliza`:
                      si la tarjeta dice «responsabilidad_civil» y el desplegable
                      «Responsabilidad civil», parecen dos cosas distintas. */}
                  {p.ramo && <span className="tenue"> · {RAMO[p.ramo] ?? p.ramo}</span>}
                </h3>
                {/* QUÉ está asegurado, con las MISMAS reglas que las de
                    la cartera (`describirBien`): la matrícula sale de su
                    columna y el resto del `datos_ramo` que la persona rellenó.
                    Aquí no hay niveles que aplicar —estas pólizas son suyas—,
                    pero sí la misma regla de callar lo que no se sabe. */}
                <BienDeclarada
                  ramo={p.ramo}
                  matricula={p.matricula}
                  referenciaCatastral={p.referenciaCatastral}
                  datosRamo={
                    p.datosRamo && typeof p.datosRamo === 'object' && !Array.isArray(p.datosRamo)
                      ? (p.datosRamo as Record<string, unknown>)
                      : null
                  }
                />
                <div className="linea">
                  {p.numeroPoliza ? `Póliza ${p.numeroPoliza} · ` : ''}
                  {/* `Decimal` de Prisma: se convierte a número ANTES de formatear.
                      `null` sale como «—», jamás como «0,00€». */}
                  {p.primaAnual == null ? 'Prima —' : `Prima ${eur(Number(p.primaAnual))}`}
                </div>
                <div className="nivel" style={{ marginTop: 4 }}>
                  {etiquetaProcedencia(p.procedencia)}
                </div>
                {/* El vencimiento NO se pinta aquí: lo lleva entero `EditarPoliza`,
                    que es quien puede decir «no sabemos cuándo vence» CON la acción
                    al lado y quien refleja al instante lo que se acaba de guardar. */}
                <EditarPoliza
                  ramos={RAMOS_OPCIONES}
                  poliza={{
                    id: p.id,
                    compania: p.compania,
                    numeroPoliza: p.numeroPoliza,
                    ramo: p.ramo,
                    // `Decimal | null` → `number | null`. `null` NO es 0: es «no lo sabemos».
                    primaAnual: p.primaAnual == null ? null : Number(p.primaAnual),
                    referenciaCatastral: p.referenciaCatastral ?? null,
                    // Un jsonb puede traer cualquier cosa; si no es un objeto plano
                    // se degrada a `null` en vez de reventar el render. Un origen
                    // ilegible es «no sabemos de dónde vino», no una excusa para
                    // dejar de pintar la póliza entera.
                    datosRamoOrigen:
                      p.datosRamoOrigen && typeof p.datosRamoOrigen === 'object' && !Array.isArray(p.datosRamoOrigen)
                        ? (Object.fromEntries(
                            Object.entries(p.datosRamoOrigen as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
                          ) as Record<string, string>)
                        : null,
                    // Columna `date`: llega como medianoche UTC, así que el ISO
                    // recortado es exactamente el día, sin desfase de zona.
                    fechaVencimiento: p.fechaVencimiento
                      ? p.fechaVencimiento.toISOString().slice(0, 10)
                      : null,
                    // `datos_ramo` es `jsonb`: Prisma lo entrega como `JsonValue`,
                    // que incluye arrays y escalares. La pantalla solo sabe pintar
                    // un objeto de campos, así que lo que no lo sea entra como
                    // `null` («no hay nada declarado») en vez de reventar el
                    // render con una fila corrupta.
                    datosRamo:
                      p.datosRamo && typeof p.datosRamo === 'object' && !Array.isArray(p.datosRamo)
                        ? (p.datosRamo as Record<string, string | number | boolean>)
                        : null,
                    matricula: p.matricula,
                    bastidor: p.bastidor,
                    // Columna `date`, igual que el vencimiento: medianoche UTC,
                    // así que el ISO recortado es el día exacto y no se corre
                    // uno según la zona del navegador.
                    fechaMatriculacion: p.fechaMatriculacion
                      ? p.fechaMatriculacion.toISOString().slice(0, 10)
                      : null,
                    deDocumento: p.documentoNombre !== null,
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Las opciones de ramo son las MISMAS que las de `EditarPoliza`: un alta a mano
          y una corrección ofrecen la misma lista. */}
      <SubirPoliza ramos={RAMOS_OPCIONES} />
        </>
      )}
    </>
  )
}

/**
 * Las pólizas de un titular, como LISTA.
 *
 * 🚨 El nombre del titular baja hasta cada FILA cuando la póliza no es de esta
 * persona, en vez de quedarse en un párrafo encima de la lista: ese párrafo se
 * sale de la vista al hacer scroll y una póliza ajena pasa a verse idéntica a
 * una propia. Quien cree que la del coche de su padre es suya no llama a la
 * compañía cuando hay que llamar.
 */
function Titular({ titular, propia }: { titular: TitularPortal; propia: boolean }) {
  if (titular.polizas.length === 0) {
    return (
      <p className="tenue" style={{ margin: '0 0 12px', fontSize: 14 }}>
        {titular.nombre}: sin pólizas vivas.
      </p>
    )
  }
  return (
    <ul className="polizas">
      {titular.polizas.map((p) => (
        <FilaPoliza key={p.id} p={p} deOtro={propia ? null : titular.nombre} />
      ))}
    </ul>
  )
}

/**
 * La etiqueta de una póliza de la CARTERA en el desplegable del parte.
 *
 * Con `titular` cuando la póliza es de otra persona que ha autorizado a esta:
 * sin el nombre, dos pólizas de auto de la misma compañía son indistinguibles y
 * el parte acaba colgado de la del padre en vez de la del hijo.
 */
function opcionCartera(p: PolizaPortal, companias: readonly FilaCompania[], titular?: string): PolizaOpcionParte {
  return {
    valor: `cartera:${p.id}`,
    // A quién acude el asegurado de ESA compañía. Viaja pegado a la opción para
    // que la pantalla pueda cambiarlo al cambiar de póliza sin volver al
    // servidor: el momento en el que alguien abre esto es justo el peor para
    // esperar a una petición.
    canal: canalDeCompania(p.compania, companias),
    etiqueta: [
      p.compania,
      RAMO[p.ramo] ?? p.ramo,
      p.numeroPoliza ? `nº ${p.numeroPoliza}` : null,
      titular ? `de ${titular}` : null,
    ]
      .filter(Boolean)
      .join(' · '),
  }
}
