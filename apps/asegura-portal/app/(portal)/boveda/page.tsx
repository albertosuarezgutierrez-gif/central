import { redirect } from 'next/navigation'

import {
  canalDeCompania,
  plazoComunicacion,
  type FilaCompania,
} from '@central/module-seguros-portal'

import { companiasConCanal } from '@/lib/canales-compania'
import { carteraDeIdentidad, type PolizaPortal, type TitularPortal } from '@/lib/cartera-lectura'
import { prisma } from '@/lib/db'
import {
  obligacionesDeIdentidad,
  polizasSinFechaDeVencimiento,
  sincronizarObligacionesDeIdentidad,
} from '@/lib/obligaciones'
import { hojasDeIdentidad, polizasElegibles } from '@/lib/hojas'
import { leerMisDatos } from '@/lib/mis-datos'
import { partesDeIdentidad, type PartePortal } from '@/lib/partes-siniestro'
import { supresionesDelUsuario } from '@/lib/supresion'
import { getIdentidad } from '@/lib/session'

import Calendario from './Calendario'
import { FilaDeclarada } from './FilaDeclarada'
import { FiltroVigencia } from './FiltroVigencia'
import { HojasQr } from './HojasQr'
import { FilaPoliza } from './FilaPoliza'
import { HistorialSiniestros, RAMO, RecibosDePoliza } from './PolizaVista'
import { ResumenTitular } from './ResumenTitular'
import { VistaPorPoliza } from './VistaPorPoliza'
import {
  agruparCartera,
  avisoPartesConservados,
  nombreDePila,
  saludoPorHora,
  vistaDeBoveda,
  type GrupoCartera,
  type VistaBoveda,
} from '@central/module-seguros-portal'

import { AvisoContacto } from './AvisoContacto'
import { ParteSiniestro, type ParteEnviado, type PolizaOpcionParte } from './ParteSiniestro'
import { SubirPoliza } from './SubirPoliza'
import { MisDatos } from './MisDatos'
import { TusDatos } from './TusDatos'

export const dynamic = 'force-dynamic'

/** Las opciones del selector de ramo salen del MISMO mapa que las etiquetas de
 *  arriba (que son las de `RAMOS_POLIZA`), para que la lista de la pantalla y la
 *  que acepta el backend no se separen con el tiempo. Va como prop porque
 *  `EditarPoliza` y `SubirPoliza` (alta a mano) son componentes de cliente. */
const RAMOS_OPCIONES = Object.entries(RAMO).map(([valor, etiqueta]) => ({ valor, etiqueta }))

/** La palabra en cursiva del h1, una por pestaña. Mismo criterio que
 *  `pestanasPortal()` (que da el texto de la nav), pero en singular con «Mis»
 *  delante en vez del texto exacto de la pestaña. */
const TITULO_VISTA: Record<VistaBoveda, string> = {
  seguros: 'seguros',
  hoja: 'QR',
  recibos: 'recibos',
  siniestro: 'siniestros',
  datos: 'datos',
}

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
  //
  // La séptima tampoco lee BD: es el puente a asegura (`lib/mis-datos.ts`) que
  // devuelve el contacto ya descifrado y si la confirmación está vigente. Va
  // en el mismo `Promise.all` porque tiene un tope de 8 s y en serie se lo
  // cargaría a la página entera; se lee UNA vez y la usan tanto el aviso
  // automático de «Mis seguros» (`AvisoContacto`) como la pestaña «Mis datos»
  // — el portal no calcula la vigencia (ver la cabecera de ese módulo).
  const [cartera, declaradas, partes, companias, hojas, elegibles, contacto] = await Promise.all([
    carteraDeIdentidad(identidad.id),
    prisma.portalPolizaDeclarada.findMany({
      where: { identidadId: identidad.id },
      orderBy: { creadaEn: 'desc' },
      take: 50,
    }),
    partesDeIdentidad(identidad.id),
    companiasConCanal(),
    hojasDeIdentidad(identidad.id),
    polizasElegibles(identidad.id),
    leerMisDatos(identidad.id),
  ])

  // Las obligaciones se derivan de la cartera que YA se ha leído arriba (no se
  // vuelve a leer) y se releen después: el `upsert` es idempotente, así que
  // recargar la bóveda no duplica nada.
  await sincronizarObligacionesDeIdentidad(identidad.id, cartera)
  const obligaciones = await obligacionesDeIdentidad(identidad.id)

  const propiasVacia = cartera.propias.every((t) => t.polizas.length === 0)
  const correduria = cartera.correduria ?? 'Grupo ASegura'

  // ── Los tres cajones (07/09/2026) ─────────────────────────────────────────
  //
  // Alberto: «llegará un momento en que un cliente tenga acceso a varios
  // clientes a su vez, sobre todo empresa… se tiene que diferenciar bien cuáles
  // son pólizas mías personales, cuáles de la empresa y a su vez de cada
  // autorizado».
  //
  // 🚨 `propias` es un ARRAY: una identidad puede estar vinculada a varias
  // fichas (tú y tu sociedad). Hasta hoy se pintaban todas en la misma lista
  // plana y SIN etiqueta —el chip de titular solo salía en las ajenas—, así que
  // las pólizas personales y las de la empresa eran indistinguibles.
  //
  // El reparto lo decide `agruparCartera`, que es puro y tiene su cepo: aquí no
  // se compara ningún `tipoPersona` a mano.
  const bloques = agruparCartera([
    ...cartera.propias.map((t) => ({ ...t, propia: true })),
    ...cartera.autorizadas.map((t) => ({ ...t, propia: false })),
  ])
  const bloqueMias = bloques.find((b) => b.grupo === 'mias') ?? null
  // «Tus seguros» ya tiene su sección propia abajo (con los estados vacíos, las
  // añadidas a mano y el alta), así que aquí quedan los OTROS cajones.
  const bloquesAparte = bloques.filter((b) => b.grupo !== 'mias')

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
  //
  // Solo se leen en la vista «Mis datos» (09/09/2026), que es donde se pintan:
  // leerlas para quien entra a mirar el coche es una consulta que no se usa.
  const supresiones = vista !== 'datos' ? [] : ((await supresionesDelUsuario()) ?? []).map((s) => ({
    id: s.id,
    recibidaEn: s.recibidaEn.toISOString(),
    estado: s.estado,
    plazo: s.plazo,
    fechaLimite: s.fechaLimite.toISOString(),
    resueltaEn: s.resueltaEn ? s.resueltaEn.toISOString() : null,
    respuesta: s.respuesta,
  }))

  const hoy = new Date()

  // ── El saludo de entrada (07/09/2026) ─────────────────────────────────────
  //
  // Alberto: «me gustaría que al entrar el cliente sea más ameno, no tan frío».
  //
  // 🚨 Se resuelve en el SERVIDOR y con la zona escrita: la página es
  // `force-dynamic`, así que el «ahora» del render es el mismo que el de las
  // demás cuentas de esta pantalla. Calcularlo en el navegador daría un texto
  // distinto en el primer pintado (aviso de hidratación) y, sin `Europe/Madrid`,
  // el servidor de Vercel —que corre en UTC— erraría de tramo una o dos horas
  // cada día sin que fallara nada.
  //
  // El nombre sale de la IDENTIDAD (quien ha entrado), no de la cartera: si la
  // persona está vinculada a varias fichas, la cartera no dice a cuál saludar, y
  // elegir una sería inventarse quién es. `nombreDePila` devuelve `null` en
  // cuanto duda —una empresa, una inicial, un formato «APELLIDOS, NOMBRE»— y
  // entonces se saluda SIN nombre: «Buenas tardes» a secas es cordial;
  // «Buenas tardes, cliente» delata que no sabemos quién ha entrado.
  const saludo = saludoPorHora(hoy, 'Europe/Madrid')
  const pila = nombreDePila(identidad.nombre)
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
      {/* Va ANTES del h1 y no dentro: el titular sigue diciendo en qué pantalla
          estás —que es lo que lee un lector de pantalla al saltar por
          encabezados—, y el saludo es lo de al lado, no el encabezado. */}
      <p className="saludo">
        {pila ? `${saludo}, ${pila}` : saludo} <span aria-hidden="true">👋</span>
      </p>
      {/* El h1 dice en qué pestaña estás. Antes decía siempre «Mis seguros»,
          también dentro de «Mis datos»: el titular contradecía a la nav justo
          debajo (09/09/2026, aviso de Alberto). */}
      <h1>
        Mis <em>{TITULO_VISTA[vista]}</em>
      </h1>

      {vista === 'seguros' && (
        <>
          {/* Antes que el calendario: es el aviso más urgente porque no lo
              genera ninguna póliza, lo genera que nadie haya vuelto a mirar la
              cartera desde el volcado. Reutiliza la MISMA lectura de arriba
              (`contacto`): sin ella, cada visita a «Mis seguros» pagaría una
              segunda llamada al puente. */}
          <AvisoContacto lectura={contacto} />
          <Calendario obligaciones={obligaciones} sinFecha={polizasSinFechaDeVencimiento(cartera)} />

      {/* 🚨 UNA sola sección para las dos cosas (05/09/2026). Alberto, mirando
          su portal: «mis seguros y mis pólizas es lo mismo… que venga de CIMA,
          que ya tenemos datos, o que alguna no la tengamos y el cliente la
          añada para controlar». Para quien mira es la lista de lo que tiene
          asegurado, y tenerla partida en dos pestañas con dos nombres que en
          castellano son sinónimos era pedirle que adivinara.

          Por eso el título ya NO dice «en {correduria}»: en esta lista hay
          ahora pólizas que la correduría no lleva. Lo que dice de dónde sale
          cada una es el cartel de su FILA, que va con ella cuando se hace
          scroll — un encabezado de sección no. */}
      <section className="seccion" aria-labelledby="cartera-titulo">
        {/* El rótulo sobre el titular, como en `grupoasegura.es`. Dice de dónde
            sale la lista, que es la pregunta que el título («Tus seguros») ya no
            responde desde que conviven las de la correduría y las añadidas. */}
        <p className="antetitulo">Tu cartera</p>
        <h2 id="cartera-titulo">Tus seguros</h2>
        {!cartera.vinculada ? (
          cartera.vinculo === 'ambiguo' ? (
            // 🚨 A este NO se le puede decir que no le hemos encontrado nada: sí
            // se ha encontrado, y es justo por eso por lo que no se le enseña
            // ninguna. Decirle lo contrario es mandarle a pensar que ha perdido
            // sus seguros.
            <p className="pendiente" style={{ margin: 0 }}>
              Tu email aparece en más de una ficha de {correduria}, así que todavía no podemos saber
              cuáles de las pólizas son tuyas. Lo está revisando el corredor y no has perdido nada:
              vuelve a entrar en unos días y aquí estarán.
            </p>
          ) : cartera.vinculo === 'sin_clave' || cartera.vinculo === 'error' ? (
            // Esto solo se decía en la pantalla de entrada, y quien vuelve con
            // la sesión viva (30 días) va directo aquí y no lo veía nunca: un
            // problema NUESTRO se le enseñaba como «no eres cliente».
            <p className="pendiente" style={{ margin: 0 }}>
              No hemos podido comprobar tu cartera ahora mismo. Es un problema nuestro, no tuyo: lo
              reintentamos la próxima vez que entres.
            </p>
          ) : (
            // Sin vínculo ≠ sin pólizas: no hay ficha con este email. No se
            // inventan teléfonos ni emails de la correduría: solo `nombre` es legible.
            <p className="suave" style={{ margin: 0 }}>
              No hemos encontrado ninguna póliza a nombre de este email. Si eres cliente con otro email,
              escríbenos por tu canal habitual con {correduria} y lo vinculamos.
            </p>
          )
        ) : propiasVacia ? (
          <p className="suave" style={{ margin: 0 }}>
            Tu ficha está en {correduria}, pero no tiene pólizas vivas ahora mismo.
          </p>
        ) : (
          (bloqueMias?.titulares ?? []).map((t) => (
            <Titular
              key={t.clienteId}
              titular={t}
              grupo="mias"
              conNombre={bloqueMias?.conNombre ?? false}
              hoy={hoy}
            />
          ))
        )}

        {/* Las que ha añadido la persona, en la MISMA lista y con el mismo
            aspecto. No llevan `<h3>` de titular porque no lo tienen: son suyas
            por definición. Lo que las distingue es el chip «Añadida por ti» de
            cada fila, y eso no es cosmético — ver `FilaDeclarada`. */}
        {declaradas.length > 0 && (
          <ul className="polizas">
            {declaradas.map((d) => (
              <FilaDeclarada
                key={d.id}
                p={{
                  id: d.id,
                  compania: d.compania,
                  ramo: d.ramo,
                  fechaVencimiento: d.fechaVencimiento,
                  deDocumento: d.documentoNombre !== null,
                }}
                avisoPartes={avisoPartesConservados(
                  partes.filter((x: PartePortal) => x.polizaDeclaradaId === d.id).length,
                )}
              />
            ))}
          </ul>
        )}

        {/* El alta va DEBAJO de la lista y dentro de la misma sección: es una
            acción sobre lo que se está mirando, no otra sección del portal. Las
            opciones de ramo son las MISMAS que ofrece `EditarPoliza`: un alta a
            mano y una corrección tienen que ofrecer la misma lista. */}
        <SubirPoliza ramos={RAMOS_OPCIONES} />
      </section>

      {/* Un bloque por cajón, y los vacíos no llegan hasta aquí (`agruparCartera`
          no los devuelve): una sección con título y nada debajo se lee como una
          avería, no como «aquí no hay nada». */}
      {bloquesAparte.map((b) => (
        <section key={b.grupo} className="seccion" aria-labelledby={`bloque-${b.grupo}-titulo`}>
          <p className="antetitulo">{b.grupo === 'empresas' ? 'Tus sociedades' : 'Te han dado acceso'}</p>
          <h2 id={`bloque-${b.grupo}-titulo`}>{b.titulo}</h2>
          {b.titulares.map((t) => (
            <Titular key={t.clienteId} titular={t} grupo={b.grupo} conNombre={b.conNombre} hoy={hoy} />
          ))}
        </section>
      ))}

        </>
      )}

      {/* ── Mi QR (09/09/2026) ─────────────────────────────────────────────
          Vivía embebida al final de «Mis seguros»: se crea a partir de la
          cartera, pero es una pieza para llevar encima (la nevera, la
          guantera), no una fila más de la lista de pólizas — y ahí abajo solo
          la encontraba quien bajara del todo. Pasa a su propia pestaña por la
          misma razón que ya sacó «Mis datos» de ese mismo sitio. */}
      {vista === 'hoja' && (
        <section className="seccion" aria-labelledby="hojas-titulo">
          <p className="antetitulo">Para llevar encima</p>
          <h2 id="hojas-titulo">Tu hoja para imprimir</h2>
          <HojasQr hojas={hojas} cartera={elegibles.cartera} declaradas={elegibles.declaradas} />
        </section>
      )}

      {/* ── Mis datos (09/09/2026) ─────────────────────────────────────────
          Alberto: «añadiría pestaña mis datos, donde el cliente puede ver sus
          datos de contacto (tlf, mail y dirección) pudiendo modificarlos». Lo
          que hasta hoy colgaba al final de «Mis seguros» —la dirección de
          contacto y el derecho de supresión— vive aquí, con su pestaña. Y la
          sugerencia («¿Echas algo de menos?») subió a la barra de la cabecera.

          La lectura de la ficha va por el puente de asegura, que es quien
          descifra: esta app sigue sin clave de PII. Si no se puede leer, la
          pantalla lo DICE (ver `MisDatos`), no deja un hueco. Reutiliza la
          MISMA `contacto` leída arriba, junto al aviso automático. */}
      {vista === 'datos' && (
        <>
          <MisDatos lectura={contacto} />
          <TusDatos inicial={supresiones} />
        </>
      )}

      {/* El parte tiene sección PROPIA, y sigue yendo antes que la bóveda de
          aportadas en la barra: quien entra con un siniestro recién ocurrido
          tiene prisa, y la bóveda es una tarea tranquila que puede esperar a
          mañana. Antes había que bajar por delante de toda la cartera para
          llegar aquí. */}
      {/* ── Recibos (07/09/2026) ───────────────────────────────────────────
          Los datos ya estaban, pero solo los encontraba quien entrase póliza a
          póliza. La lista conserva la separación por titular: los recibos de
          tu empresa no se mezclan con los tuyos.

          🚨 `incluye` omite las pólizas cuyo bloque no se ve en tu nivel
          (`recibos === null`, que es el caso de un tercero autorizado). Se
          omiten ENTERAS: un título con un «no visible» debajo le contaría que
          ahí hay algo que mirar. */}
      {vista === 'recibos' && (
        <VistaPorPoliza
          bloques={bloques}
          incluye={(p) => p.recibos !== null}
          bloque={(p) => <RecibosDePoliza p={p} />}
          vacio="Aquí verás los recibos de tus seguros cuando tu compañía nos los informe. Que no haya ninguno no significa que estés al corriente: significa que todavía no nos consta nada."
        />
      )}

      {/* ── Siniestros: el historial Y el parte, en la MISMA pestaña ────────
          Dos pestañas serían dos puertas para lo mismo (una diría «siniestro»
          y la otra «parte», que para un cliente son la misma palabra) — es
          exactamente lo que mató a «Mis pólizas» el 05/09. El historial va
          primero porque quien entra a mirar es mayoría; el formulario, debajo.

          ⚠️ Medido el 07/09/2026: solo 31 de los 80 titulares tienen algún
          siniestro, así que 6 de cada 10 verán el vacío. Por eso el vacío es
          una frase que dice lo que sabemos y lo que no. */}
      {vista === 'siniestro' && (
        <>
          <VistaPorPoliza
            bloques={bloques}
            incluye={(p) => p.siniestros !== null && p.siniestros.length > 0}
            bloque={(p) => <HistorialSiniestros p={p} />}
            vacio="No nos consta ningún siniestro en tus seguros. No significa que no hayas tenido ninguno: nos los informa tu compañía. Si acabas de tener uno, cuéntanoslo aquí abajo."
          />
          <ParteSiniestro polizas={polizasParte} partes={partesEnviados} />
        </>
      )}

    </>
  )
}

/**
 * Las pólizas de un titular, como LISTA.
 *
 * 🚨 Dos marcas distintas, que dicen cosas distintas:
 *
 *  - La **cabecera pegajosa** (`titular-cabecera`) dice DE QUIÉN es este tramo
 *    de la lista, y se queda a la vista mientras se recorre. Un título normal
 *    no vale: se sale de la vista al hacer scroll y entonces no se sabe dónde
 *    acaba un titular y empieza el siguiente.
 *  - El **chip de la fila** dice algo más fuerte y más caro de equivocar: que
 *    esa póliza **no es tuya**. Por eso va SOLO en las autorizadas, viaja con
 *    la fila y sobrevive a leerla suelta. Quien cree que la del coche de su
 *    padre es suya no llama a la compañía cuando hay que llamar.
 *
 * ⚠️ Y por eso el chip NO se pone en las propias ni en las de tus empresas,
 * aunque lleven cabecera: ahí el nombre ya lo da ella, repetirlo en cada fila
 * es ruido —el nombre de una sociedad ocupa dos líneas— y además diría «de»
 * sobre algo que sí es tuyo.
 *
 * `conNombre` lo decide `agruparCartera`, no esta función: con una sola ficha
 * propia el nombre es ruido (la persona ya sabe cómo se llama), y en cuanto hay
 * dos —o son de una empresa o de un tercero— es la información que separa una
 * póliza de otra.
 */
function Titular({
  titular,
  grupo,
  conNombre,
  hoy,
}: {
  titular: TitularPortal
  grupo: GrupoCartera
  conNombre: boolean
  /** Resuelto en el servidor (la página es `force-dynamic`). */
  hoy: Date
}) {
  if (titular.polizas.length === 0) {
    return (
      <p className="tenue" style={{ margin: '0 0 12px', fontSize: 14 }}>
        {titular.nombre}: sin pólizas vivas.
      </p>
    )
  }
  return (
    <>
      {conNombre && <h3 className="titular-cabecera">{titular.nombre}</h3>}
      {/* 🚨 En «autorizadas» NO van: lo que gasta al año quien te dio acceso no
          es tuyo, y una baldosa «Al año» sobre sus pólizas lo pintaría como si
          lo fuera. Lo que sí necesita quien mira ahí es la fila, que ya lleva su
          chip de póliza ajena. */}
      {grupo !== 'autorizadas' && <ResumenTitular polizas={titular.polizas} hoy={hoy} />}
      {/* Por defecto solo las EN VIGOR, con el filtro y el contador de las
          escondidas por titular (09/09/2026; Alberto: «ocultar las canceladas
          porque da confusión… un filtro por cada panel»). `pendiente` (sin
          fecha, no se sabe) se enseña: lo que no se sabe no se esconde. */}
      <FiltroVigencia
        filas={titular.polizas.map((p) => ({
          key: p.id,
          enVigor: p.vigencia !== 'no_vigente',
          nodo: <FilaPoliza key={p.id} p={p} deOtro={grupo === 'autorizadas' ? titular.nombre : null} />,
        }))}
      />
    </>
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
