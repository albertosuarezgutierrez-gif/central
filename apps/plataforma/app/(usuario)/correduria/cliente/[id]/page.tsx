import Link from 'next/link'
import { clasificarPolizaFicha, personasDePolizas, resumenFicha, type ClasePolizaFicha } from '@central/module-seguros'
import Documentos from '../../Documentos'
import Historial from '../../Historial'
import Siniestros from '../../Siniestros'
import { NECESARIOS_EMISION_AUTO } from '@central/module-seguros'
import { fichaAsegura, type PolizaFicha } from '@/lib/ficha-asegura'
import Cabecera from './Cabecera'
import DescartarCliente from './DescartarCliente'
import FichaTabs, { tabDeParametro } from './FichaTabs'
import TabContactos from './TabContactos'
import TabPolizas from './TabPolizas'
import TabRecibos from './TabRecibos'
import TabResumen from './TabResumen'
import { Tarjeta, etiquetaPoliza, tarjeta } from './piezas'

export const dynamic = 'force-dynamic'

/**
 * La ficha del cliente de la correduría, DENTRO del cuadro de mando.
 *
 * Alberto usa una sola pantalla —esta— para todos sus negocios: la correduría
 * es uno más. `apps/asegura` es el back (tiene la BD de la cartera y el botón
 * que gasta 0,50€ al retarificar); aquí se ve todo y desde aquí se salta allí
 * solo para lo que cuesta dinero.
 *
 * ── Cabecera + pestañas (03/09/2026) ─────────────────────────────────────────
 * Nació sin pestañas a petición de Alberto («se pincha un nombre y está todo»).
 * Con la cartera cargada eran doce tarjetas apiladas y él mismo pidió el patrón
 * de su CRM anterior: los datos arriba y el resto en pestañas.
 *
 * 🚨 Con una salvaguarda que aquel CRM no tiene, y que es la razón de que
 * necesite chapitas rojas: lo que no está en la pestaña abierta no existe. Por
 * eso los contadores que disparan una gestión —recibos devueltos, siniestros
 * abiertos y el último día para no renovar— viven en la CABECERA, fuera de las
 * pestañas y visibles en las siete.
 *
 * Solo se renderiza la pestaña activa: abrir la ficha no monta el DOM de los
 * doce bloques. Lo que NO se ahorra es la llamada al puerto, que trae la ficha
 * entera y se repite en cada pestaña; trocearla es otro trabajo.
 */
export default async function FichaCorreduriaPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string | string[] }>
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const r = await fichaAsegura(id)

  if (r.estado !== 'ok') return <NoSePudo estado={r} />

  const { ficha } = r
  const tab = tabDeParametro(sp.tab)

  // La clasificación es PURA y vive en `@central/module-seguros` con test: qué
  // cuenta como viva decide el titular de la cabecera, el contador de la
  // pestaña y qué tabla la pinta, y las tres tienen que decir lo mismo.
  const porClase: Record<ClasePolizaFicha, PolizaFicha[]> = { viva: [], pendiente_cima: [], cancelada: [], historica: [] }
  for (const p of ficha.polizas) porClase[clasificarPolizaFicha(p)].push(p)

  // Pólizas de CARTERA VIVA de la ficha (`esCarteraViva` en asegura). Es la
  // guarda del descarte: con una sola viva, la persona es un cliente de hoy.
  const vivas = ficha.polizas.filter(p => p.viva).length

  const resumen = resumenFicha({
    polizas: ficha.polizas,
    siniestros: ficha.siniestros,
    documentos: ficha.documentos,
  })

  // Se calculan UNA vez y las usan tres cosas: el contador de la pestaña, la
  // tarjeta 👤 y la 👪 —que ofrece declarar el vínculo de quien sale sin él
  // (Antonio Sevico en la ficha de José Suárez Salas, 03/09/2026)—.
  // `null` = no se pudo leer quién interviene; el contador no se pinta (y no se
  // pinta 0, que diría «no hay nadie»).
  const personas = personasDePolizas(
    ficha.intervinientes,
    ficha.polizas.map(p => ({ id: p.id, etiqueta: etiquetaPoliza(p) })),
    ficha.relaciones,
  )

  // `minmax(0, 1fr)` NO es decorativo: sin él, la pista implícita de este grid se dimensiona con
  // el contenido más ancho —la tabla de pólizas, que declara `minWidth: 880`— y arrastra la página
  // entera a 910 px en un móvil de 390. El `overflowX: 'auto'` de la tabla queda anulado, porque
  // para cuando actúa su contenedor ya ha crecido. Y el desbordamiento NO se ve en `body`: como
  // `LayoutShell` declara `overflowY: 'auto'`, CSS le activa también el eje X y es él quien
  // scrollea. Medido en Chromium el 02/09/2026: 910 → 390 px solo con esta línea.
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 16 }}>
      {/* Si la ficha está DESCARTADA se dice arriba del todo, antes que nada:
          está fuera del buscador y de la cartera, y nadie más la ve. `activo`
          a `null` (asegura sin el campo) no pinta nada — no se afirma. */}
      <DescartarCliente zona="aviso" clienteId={ficha.id} nombre={ficha.nombre} activo={ficha.activo} polizasVivas={vivas} />

      <Cabecera ficha={ficha} resumen={resumen} />

      <FichaTabs
        clienteId={ficha.id}
        activa={tab}
        contadores={{
          polizas: { n: porClase.viva.length, title: 'pólizas vivas confirmadas por CIMA' },
          recibos: { n: resumen.recibos.devueltos, tono: 'malo', title: 'recibos devueltos' },
          siniestros: { n: resumen.siniestrosAbiertos, tono: 'aviso', title: 'siniestros abiertos' },
          contactos: { n: personas === null ? null : personas.length, title: 'personas en sus pólizas' },
          documentos: { n: resumen.documentosPendientes, tono: 'aviso', title: 'documentos pedidos y aún sin recibir' },
        }}
      />

      {tab === 'resumen' && (
        <TabResumen resumen={resumen} porClase={porClase} intervinientes={ficha.intervinientes} clienteId={ficha.id} />
      )}

      {tab === 'polizas' && <TabPolizas porClase={porClase} intervinientes={ficha.intervinientes} />}

      {tab === 'recibos' && <TabRecibos polizas={ficha.polizas} />}

      {/* Siniestros: ver, abrir sobre una póliza viva de CIMA, seguimiento, estado y parte.
          `null` = no se han podido leer, y se dice; los documentos del parte salen de los de la ficha. */}
      {tab === 'siniestros' && (
        <Siniestros
          lista={ficha.siniestros}
          polizas={ficha.polizas.map(p => ({ id: p.id, numeroPoliza: p.numeroPoliza, aseguradora: p.aseguradora, tipo: p.tipo, viva: p.viva, confirmadaCima: p.confirmadaCima }))}
          documentos={ficha.documentos}
        />
      )}

      {tab === 'contactos' && <TabContactos ficha={ficha} personas={personas} />}

      {/* Documentos: los del cliente y los de sus pólizas/siniestros, con «pedido» */}
      {tab === 'documentos' && (
        <Tarjeta titulo="📎 Documentos">
          <Documentos clienteId={ficha.id} inicial={ficha.documentos} sugeridos={NECESARIOS_EMISION_AUTO} />
        </Tarjeta>
      )}

      {/* `null` ≠ «sin anotaciones»: lo dice el propio componente. */}
      {tab === 'historial' && <Historial historial={ficha.historial} />}

      {/* Zona de peligro, al final y discreta: descartar la ficha (borrado
          suave y reversible). Se pinta en todas las pestañas a propósito — es
          una acción sobre la FICHA, no sobre lo que se esté mirando. */}
      <DescartarCliente clienteId={ficha.id} nombre={ficha.nombre} activo={ficha.activo} polizasVivas={vivas} />
    </div>
  )
}

// ── Fallos ──────────────────────────────────────────────────────────────────

const MOTIVOS: Record<string, string> = {
  secreto_rechazado: 'asegura rechaza el secreto (ASEGURA_OPERADOR_SECRET no coincide entre los dos proyectos).',
  asegura_error: 'asegura respondió, pero no pudo leer su base de datos.',
  respuesta_ilegible: 'la respuesta no tenía la forma esperada.',
  red: 'no se pudo llegar a asegura (timeout, DNS o TLS).',
}

function NoSePudo({ estado }: { estado: { estado: 'sin_configurar' } | { estado: 'error'; motivo: string } | { estado: 'no_encontrado' } }) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Link href="/correduria" style={{ fontSize: 13, color: 'var(--muted)' }}>← Correduría</Link>
      <div style={tarjeta}>
        {estado.estado === 'no_encontrado' ? (
          <>
            <h2 style={{ marginTop: 0, fontSize: 16 }}>Esa ficha no está en la cartera</h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
              Se ha consultado y no existe (o está fusionada con otra). Esto sí es una ausencia
              comprobada, no un fallo de conexión.
            </p>
          </>
        ) : estado.estado === 'sin_configurar' ? (
          <>
            <h2 style={{ marginTop: 0, fontSize: 16 }}>⏳ El puerto con asegura no está conectado</h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
              Falta <code>ASEGURA_OPERADOR_SECRET</code> en este proyecto. No significa que el
              cliente no exista: significa que desde aquí no se puede mirar.
            </p>
          </>
        ) : (
          <>
            <h2 style={{ marginTop: 0, fontSize: 16 }}>⚠️ No se ha podido leer la ficha</h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
              {MOTIVOS[estado.motivo] ?? 'motivo desconocido.'} No lo leas como «este cliente no
              tiene nada».
            </p>
          </>
        )}
      </div>
    </div>
  )
}
