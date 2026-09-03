import Link from 'next/link'
import { redirect } from 'next/navigation'

import { ETIQUETA_RAMO, etiquetaProcedencia, plazoComunicacion } from '@central/module-seguros-portal'

import { carteraDeIdentidad, type PolizaPortal, type TitularPortal } from '@/lib/cartera-lectura'
import { prisma } from '@/lib/db'
import { eur } from '@/lib/dinero'
import { fechaEs } from '@/lib/fechas'
import {
  obligacionesDeIdentidad,
  polizasSinFechaDeVencimiento,
  sincronizarObligacionesDeIdentidad,
} from '@/lib/obligaciones'
import { partesDeIdentidad, type PartePortal } from '@/lib/partes-siniestro'
import { getIdentidad } from '@/lib/session'

import Calendario from './Calendario'
import { EditarPoliza } from './EditarPoliza'
import { ParteSiniestro, type ParteEnviado, type PolizaOpcionParte } from './ParteSiniestro'
import { SubirPoliza } from './SubirPoliza'

export const dynamic = 'force-dynamic'

// La MISMA tabla que usa el calendario (`lib/obligaciones.ts`) y el módulo: un
// mapa local aquí es como se llegó a pintar «Responsabilidad civil» en la
// tarjeta y `responsabilidad_civil` en el calendario de la misma pantalla.
const RAMO: Record<string, string> = ETIQUETA_RAMO

/** Las opciones del selector de ramo salen del MISMO mapa que las etiquetas de
 *  arriba (que son las de `RAMOS_POLIZA`), para que la lista de la pantalla y la
 *  que acepta el backend no se separen con el tiempo. Va como prop porque
 *  `EditarPoliza` y `SubirPoliza` (alta a mano) son componentes de cliente. */
const RAMOS_OPCIONES = Object.entries(RAMO).map(([valor, etiqueta]) => ({ valor, etiqueta }))

const ESTADO: Record<string, string> = {
  activa: 'En vigor',
  en_vigor: 'En vigor',
  en_renovacion: 'En renovación',
  recibo_devuelto: 'Recibo devuelto',
  cambio_clave: 'En vigor',
  vencida: 'Vencida',
  cancelada: 'Cancelada',
  fin_riesgo: 'Fin de riesgo',
  anula_al_vencimiento: 'Se anula al vencimiento',
  competencia: 'En otra correduría',
}

export default async function Boveda() {
  const identidad = await getIdentidad()
  if (!identidad) redirect('/')

  // Las tres lecturas parten de la misma sesión: la cartera por `portal_vinculo`
  // de esta identidad, y la bóveda de declaradas y los partes por `identidadId`.
  // Ninguna acepta un id que venga de fuera.
  const [cartera, declaradas, partes] = await Promise.all([
    carteraDeIdentidad(identidad.id),
    prisma.portalPolizaDeclarada.findMany({
      where: { identidadId: identidad.id },
      orderBy: { creadaEn: 'desc' },
      take: 50,
    }),
    partesDeIdentidad(identidad.id),
  ])

  // Las obligaciones se derivan de la cartera que YA se ha leído arriba (no se
  // vuelve a leer) y se releen después: el `upsert` es idempotente, así que
  // recargar la bóveda no duplica nada.
  await sincronizarObligacionesDeIdentidad(identidad.id, cartera)
  const obligaciones = await obligacionesDeIdentidad(identidad.id)

  const propiasVacia = cartera.propias.every((t) => t.polizas.length === 0)
  const correduria = cartera.correduria ?? 'Grupo Asegura'

  // Lo que se le ofrece elegir al dar un parte. Incluye las AUTORIZADAS a
  // propósito: la ruta acepta lo mismo (`carteraDeIdentidad` propias +
  // autorizadas), y ofrecer menos de lo que el backend admite deja fuera al
  // conductor que sí puede declarar el golpe del coche de su padre. La lista
  // sale SIEMPRE de la cartera ya leída para esta identidad: ningún id de
  // póliza entra desde la request.
  const polizasParte: PolizaOpcionParte[] = [
    ...cartera.propias.flatMap((t) => t.polizas.map((p) => opcionCartera(p))),
    ...cartera.autorizadas.flatMap((t) =>
      t.polizas.map((p) => opcionCartera(p, t.nombre)),
    ),
    ...declaradas.map((p) => ({
      valor: `declarada:${p.id}`,
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
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1rem' }}>
      <h1 style={{ fontSize: '1.5rem', marginTop: 0 }}>Mis seguros</h1>

      {/* La pantalla del consentimiento. Va arriba y no escondida al final: quien
          quiere saber quién le está mirando los seguros —o quitárselo a alguien—
          no debería tener que recorrer toda la bóveda para encontrarlo. */}
      <p style={{ margin: '0 0 16px', fontSize: 14 }}>
        <Link href="/autorizaciones">Quién puede ver mis seguros</Link>
      </p>

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

      {/* El parte va ANTES de la bóveda de aportadas: quien entra con un
          siniestro recién ocurrido tiene prisa, y la bóveda es una tarea
          tranquila que puede esperar a mañana. */}
      <ParteSiniestro polizas={polizasParte} partes={partesEnviados} />

      <section className="seccion" aria-labelledby="boveda-titulo">
        <h2 id="boveda-titulo">Pólizas que has añadido tú</h2>
        {declaradas.length === 0 ? (
          // «Todavía no has añadido ninguna» — no «no tienes seguros»: los de
          // la correduría van arriba, esto es lo que aporta la persona.
          <p className="suave" style={{ margin: 0 }}>Todavía no has añadido ninguna póliza.</p>
        ) : (
          <ul className="cartera">
            {declaradas.map((p) => (
              <li key={p.id} className="cartera-card">
                <h3>
                  {p.compania ?? 'Compañía sin identificar'}
                  {/* La MISMA etiqueta que ofrece el selector de `EditarPoliza`:
                      si la tarjeta dice «responsabilidad_civil» y el desplegable
                      «Responsabilidad civil», parecen dos cosas distintas. */}
                  {p.ramo && <span className="tenue"> · {RAMO[p.ramo] ?? p.ramo}</span>}
                </h3>
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
                    // Columna `date`: llega como medianoche UTC, así que el ISO
                    // recortado es exactamente el día, sin desfase de zona.
                    fechaVencimiento: p.fechaVencimiento
                      ? p.fechaVencimiento.toISOString().slice(0, 10)
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
    </main>
  )
}

function Titular({ titular, propia }: { titular: TitularPortal; propia: boolean }) {
  return (
    <div style={{ marginBottom: 12 }}>
      {!propia && (
        <p className="suave" style={{ margin: '0 0 6px', fontSize: 14 }}>
          Titular: <strong>{titular.nombre}</strong>
        </p>
      )}
      {titular.polizas.length === 0 ? (
        <p className="tenue" style={{ margin: 0, fontSize: 14 }}>
          {propia ? `${titular.nombre}: sin pólizas vivas.` : 'Sin pólizas vivas.'}
        </p>
      ) : (
        <ul className="cartera">
          {titular.polizas.map((p) => (
            <Card key={p.id} p={p} />
          ))}
        </ul>
      )}
    </div>
  )
}

/** Buzón único de la correduría. No hay ninguna ruta de API para esto todavía:
 *  el aviso sale por el mismo canal que ya usa el correo del código
 *  (`PORTAL_MAIL_REPLY_TO`), y no se inventa un endpoint que no existe. */
const CORREO_CORREDURIA = 'hola@grupoasegura.es'

/**
 * Una póliza de la CARTERA.
 *
 * Regla de visibilidad del 03/09/2026 (ver `CLAUDE.md` de la app): lo que no
 * cambia una decisión del cliente **no se pinta vacío, se quita**; lo que sí la
 * cambia se dice con una frase entera. Por eso aquí no queda ni un «—», ni un
 * «no visible en tu nivel», ni un «pendiente»: un campo a `null` por nivel es
 * un dato que esta persona no tiene derecho a ver, y anunciarlo solo genera una
 * pregunta que Alberto tiene que contestar.
 */
function Card({ p }: { p: PolizaPortal }) {
  const vence = fechaEs(p.fechaVencimiento)
  // `numeroPoliza === null` = la compañía no lo informó (el nivel `tarjeta` ya
  // lo enseña): se oculta, la cabecera ya identifica la póliza.
  const cabecera = [p.numeroPoliza && `Póliza ${p.numeroPoliza}`, vence && `Vence el ${vence}`].filter(Boolean)

  return (
    <li className="cartera-card">
      <h3>
        {p.compania} <span className="tenue">· {RAMO[p.ramo] ?? p.ramo}</span>
      </h3>

      {/* ARRIBA DEL TODO y antes que ningún dato: un recibo devuelto es lo
          único de esta tarjeta que puede costarle la cobertura. */}
      <AvisoReciboDevuelto p={p} />

      {cabecera.length > 0 && <div className="linea">{cabecera.join(' · ')}</div>}

      {/* Sin vencimiento no hay calendario: se dice, porque el silencio aquí se
          lee como «ya te avisaremos» y no vamos a poder. */}
      {p.fechaVencimiento === null && (
        <div className="linea dicho ojo">
          No sabemos cuándo vence
          {p.vigencia === 'pendiente'
            ? ': no podemos avisarte ni confirmarte que siga en vigor.'
            : ', así que no podemos avisarte.'}
        </div>
      )}

      {/* `prima === null` = el nivel no la enseña → se oculta.
          `prima.anual === null` = la compañía no la ha informado → tampoco
          cambia nada que el cliente pueda hacer, así que se oculta también.
          Lo que NUNCA sale es un `0,00€` en lugar de un hueco. */}
      {/* Lo que el cliente PAGA es la bruta (neta + impuestos y recargos = el
          recibo). Con solo la neta al lado de «tu próximo recibo: 73,39€» la
          pantalla parecía no saber sumar (captura de Alberto, 03/09/2026). Si la
          bruta no está, se enseña la neta y se dice que lo es. */}
      {p.prima !== null && (p.prima.bruta !== null || p.prima.anual !== null) && (
        <div className="linea">
          {p.prima.bruta !== null ? (
            <>
              Prima anual <strong>{eur(p.prima.bruta)}</strong>
              <span className="tenue"> (impuestos incluidos)</span>
            </>
          ) : (
            <>
              Prima neta anual <strong>{eur(p.prima.anual as number)}</strong>
              <span className="tenue"> (sin impuestos)</span>
            </>
          )}
          {p.prima.fraccionamiento ? ` · ${p.prima.fraccionamiento}` : ''}
        </div>
      )}

      <Recibos p={p} />
      <Coberturas p={p} />

      <div className="chips">
        <span className={`chip${p.vigencia === 'vigente' ? ' ok' : ''}`}>{ESTADO[p.estado] ?? p.estado}</span>
        {!p.confirmadaCima && <span className="chip aviso">pendiente de confirmación por la compañía</span>}
        {/* Sin tramitador ni teléfono de gestión: el punto de contacto es la
            correduría (regla de visibilidad, `CLAUDE.md` de la app). */}
        {p.siniestrosAbiertos.map((s) => (
          <span key={s.id} className="chip aviso">
            siniestro {s.estado === 'en_tramitacion' ? 'en tramitación' : 'abierto'}
            {s.referencia ? ` ${s.referencia}` : ''}
          </span>
        ))}
      </div>
    </li>
  )
}

/**
 * 🚨 EL aviso de la pantalla: `devueltos > 0` significa que la compañía intentó
 * cobrar y NO pudo. Es lo único que puede dejar a esta persona sin cobertura
 * sin que ella se entere, así que va arriba y con una acción al lado.
 *
 * 🚨 Y la línea que no se puede cruzar: un recibo **devuelto** no es un recibo
 * **pendiente/al cobro**. El pendiente está emitido y aún sin cargar — es
 * información neutra («tu próximo recibo») y vive en `<Recibos>`, jamás aquí.
 * Pintar un pendiente como impago acusa de moroso a quien está al día; es
 * exactamente el fallo que se corrigió en `/correduria` (PR #2179).
 *
 * No se pinta ningún importe: `RecibosPortal` da el NÚMERO de devueltos, no su
 * cuantía, y el importe del próximo al cobro es de otro recibo. Poner ahí una
 * cifra que no es la del devuelto sería inventarla.
 */
function AvisoReciboDevuelto({ p }: { p: PolizaPortal }) {
  const devueltos = p.recibos?.devueltos ?? 0
  if (devueltos === 0) return null

  const identifica = p.numeroPoliza ? `póliza ${p.numeroPoliza}` : `póliza de ${p.compania} (${RAMO[p.ramo] ?? p.ramo})`
  const asunto = `Recibo devuelto · ${identifica}`
  const cuerpo = [
    'Hola:',
    '',
    `En el portal me aparece ${devueltos === 1 ? 'un recibo devuelto' : `${devueltos} recibos devueltos`} de mi ${identifica} con ${p.compania}.`,
    'Quiero regularizarlo. ¿Me decís cómo?',
    '',
    'Gracias.',
  ].join('\n')
  const mailto = `mailto:${CORREO_CORREDURIA}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`

  return (
    <div className="aviso-linea">
      <strong>
        {devueltos === 1 ? 'Tienes un recibo devuelto' : `Tienes ${devueltos} recibos devueltos`}
      </strong>{' '}
      — el cobro se intentó y no salió. Mientras no se regularice, la compañía puede dejar de cubrirte.
      <a className="boton" href={mailto}>
        Avisar a la correduría
      </a>
    </div>
  )
}

/**
 * Recibos, en voz NEUTRA. Lo que alarma vive en `<AvisoReciboDevuelto>`.
 *
 * - `recibos === null` → el nivel de esta persona no enseña recibos. No es una
 *   ausencia del dato: se oculta y no se menciona.
 * - `total === 0` → **la compañía no ha informado recibos**, que NO es «estás al
 *   corriente». Esa frase se dice entera porque el silencio sí se leería así.
 */
function Recibos({ p }: { p: PolizaPortal }) {
  if (p.recibos === null) return null
  const r = p.recibos
  if (r.total === 0) {
    return <div className="linea dicho">Tu compañía no nos ha informado de ningún recibo.</div>
  }

  const partes: string[] = []
  if (r.proximoAlCobro) {
    // `importe: null` = el EIAC no traía un importe legible. No es 0€, así que
    // se cuenta lo que se sabe (la fecha) y se calla lo que no.
    const cuando = fechaEs(r.proximoAlCobro.fechaVencimiento)
    const importe = r.proximoAlCobro.importe
    if (importe !== null) partes.push(`Tu próximo recibo: ${eur(importe)}${cuando ? ` el ${cuando}` : ''}`)
    else if (cuando) partes.push(`Tu próximo recibo vence el ${cuando}`)
  }
  if (r.ultimoCobrado) {
    const cuando = fechaEs(r.ultimoCobrado.fechaEmision)
    const importe = r.ultimoCobrado.importe
    if (importe !== null) partes.push(`último cobrado ${eur(importe)}${cuando ? ` (${cuando})` : ''}`)
    else if (cuando) partes.push(`último cobrado el ${cuando}`)
  }
  // Ni un solo dato que enseñar (recibos sin importe ni fecha): no se pinta una
  // línea vacía, y tampoco «ningún recibo al cobro», que se leería como «nada
  // que pagar» sin que nadie lo haya comprobado.
  if (partes.length === 0) return null
  return <div className="linea">{partes.join(' · ')}</div>
}

/**
 * Coberturas. `null` = el nivel no las enseña (se oculta); `total === 0` = **no
 * nos consta el detalle**, que NO es «no tienes coberturas»: decirle eso a
 * alguien que sí las tiene es empujarle a contratar lo que ya paga.
 */
function Coberturas({ p }: { p: PolizaPortal }) {
  if (p.coberturas === null) return null
  const c = p.coberturas
  if (c.total === 0) return <div className="linea dicho">No nos consta el detalle de coberturas.</div>
  // `total > 0` con la lista vacía = las coberturas vienen sin descripción ni
  // código. Se dice cuántas hay, que es lo único cierto.
  if (c.lista.length === 0) {
    return <div className="linea">{c.total === 1 ? '1 cobertura informada' : `${c.total} coberturas informadas`}</div>
  }
  return (
    <div className="linea">
      {c.lista.join(' · ')}
      {c.total > c.lista.length && ` y ${c.total - c.lista.length} más`}
    </div>
  )
}

/**
 * La etiqueta de una póliza de la CARTERA en el desplegable del parte.
 *
 * Con `titular` cuando la póliza es de otra persona que ha autorizado a esta:
 * sin el nombre, dos pólizas de auto de la misma compañía son indistinguibles y
 * el parte acaba colgado de la del padre en vez de la del hijo.
 */
function opcionCartera(p: PolizaPortal, titular?: string): PolizaOpcionParte {
  return {
    valor: `cartera:${p.id}`,
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
