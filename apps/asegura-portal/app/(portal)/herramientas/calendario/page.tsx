import Link from 'next/link'
import { redirect } from 'next/navigation'

import {
  TOPE_VER_MAS_CALENDARIO,
  avisosDeFechaIncompletos,
  componerCalendario,
  precargasDeRecordatorio,
  type Avisos,
  type OrigenCalendario,
} from '@central/module-seguros-portal'

import { GET as leerAvisos } from '@/app/api/avisos/route'
import { carnetsDeIdentidad } from '@/lib/carnets'
import { carteraALaVista, carteraDeIdentidad, cuentaComoEnVigor, type PolizaPortal, type TitularPortal } from '@/lib/cartera-lectura'
import {
  avisosConFecha,
  fechasDePatrimonio,
  fechasDeRecordatorios,
  recibosPendientes,
  vencimientosDeSeguros,
  type TitularParaCalendario,
} from '@/lib/calendario-portal'
import { prisma } from '@/lib/db'
import { DECLARADA_NO_ELIMINADA } from '@/lib/declaradas-eliminadas'
import { calendarioDeIdentidad } from '@/lib/patrimonio/calendario-bd'
import { fechaMadrid } from '@/lib/patrimonio/dia-madrid'
import { recordatoriosDeIdentidad } from '@/lib/recordatorios'
import { puertaDeSesion } from '@/lib/puertas-portal'
import { getIdentidad } from '@/lib/session'

import { PaginaPortal } from '../../../PaginaPortal'
import { TarjetaPortal } from '../../../TarjetaPortal'
import { RAMO, tituloDePoliza } from '../../boveda/PolizaVista'
import { ListaCalendario } from './ListaCalendario'
import { Recordatorios } from './Recordatorios'

export const dynamic = 'force-dynamic'

const DE_DONDE: Record<OrigenCalendario, string> = {
  seguro: 'los vencimientos de tus seguros',
  recibo: 'tus recibos',
  patrimonio: 'las fechas de tu patrimonio',
  recordatorio: 'tus recordatorios',
  aviso: 'los avisos',
}

function motivo(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * «Calendario» (26/10/2026, Alberto: «un solo Calendario»): LA vista de fechas del portal, en Herramientas. Junta lo que
 * antes estaba en tres sitios —la pestaña «Recordatorios» de la bóveda, la tarjeta de Inicio y `/patrimonio/calendario`—:
 * vencimientos de los seguros, recibos que piden algo, los avisos con fecha de la campana, las fechas del patrimonio
 * y los recordatorios propios (con su editor, que se mudó aquí). Las rutas viejas redirigen.
 *
 * 🚨 No lee nada que esta sesión no vea ya en otra pantalla: la cartera sale de `carteraDeIdentidad` (vínculo + autorización,
 * con su nivel), el patrimonio de `accesosPatrimonio` (dentro de `calendarioDeIdentidad`), los recordatorios y los avisos
 * de `identidadId`. Tres estados: una fuente que falla NO se pinta como «nada» (`sinComprobar`, y el calendario no se da
 * por vacío); una fecha que no se sabe se dice. La composición es pura (`componerCalendario`) y tiene su test.
 */
export default async function CalendarioPage() {
  const identidad = await getIdentidad()
  if (!identidad) redirect('/')
  // La misma regla que oculta «Calendario» en el menú (autorizado puro: no es suyo). Modo `lectura`: una lectura caída
  // ABRE, como el enlace — esta página solo enseña lo que la identidad ya ve en otras pantallas.
  if (!(await puertaDeSesion('calendario', 'lectura'))) redirect('/inicio')

  const [carteraR, declaradasR, recordatoriosR, carnetsR, patrimonioR, avisosR] = await Promise.allSettled([
    carteraDeIdentidad(identidad.id).then(carteraALaVista),
    prisma.portalPolizaDeclarada.findMany({
      where: { identidadId: identidad.id, ...DECLARADA_NO_ELIMINADA },
      orderBy: { creadaEn: 'desc' },
      take: 50,
      select: { id: true, ramo: true, compania: true, matricula: true, numeroPoliza: true, fechaMatriculacion: true },
    }),
    recordatoriosDeIdentidad(identidad.id),
    // 🚨 `carnetsDeIdentidad` LANZA cuando no se ha podido mirar (puente caído, varias fichas, fecha ilegible). Una
    // precarga no puede tumbar la pantalla: se captura, se registra y se pasa `null` («no hemos podido comprobarlo»).
    carnetsDeIdentidad(identidad.id).catch((e: unknown) => {
      console.error('[herramientas/calendario] carnés ilegibles para precargar:', motivo(e))
      return null
    }),
    calendarioDeIdentidad(identidad.id),
    // La MISMA lectura que la campana (`/api/avisos`): el calendario no tiene una segunda lista de avisos.
    leerAvisos().then(async (r) => {
      if (!r.ok) throw new Error(`avisos ${r.status}`)
      return (await r.json()) as Avisos
    }),
  ])
  for (const [que, r] of [
    ['cartera', carteraR],
    ['recordatorios', recordatoriosR],
    ['patrimonio', patrimonioR],
    ['avisos', avisosR],
  ] as const) {
    if (r.status === 'rejected') console.error(`[herramientas/calendario] ${que} sin comprobar:`, motivo(r.reason))
  }

  const cartera = carteraR.status === 'fulfilled' ? carteraR.value : null
  const titulares: TitularParaCalendario<PolizaPortal>[] | null =
    cartera === null
      ? null
      : [
          ...cartera.propias.map((t: TitularPortal) => ({ nombre: t.nombre, ajeno: false, nivel: t.nivel, polizas: t.polizas })),
          ...cartera.autorizadas.map((t: TitularPortal) => ({ nombre: t.nombre, ajeno: true, polizas: t.polizas })),
        ]
  const titulo = (p: PolizaPortal) => tituloDePoliza(p)

  const avisos = avisosR.status === 'fulfilled' ? avisosR.value : null
  const recordatorios = recordatoriosR.status === 'fulfilled' ? recordatoriosR.value : null
  const patrimonio = patrimonioR.status === 'fulfilled' ? patrimonioR.value : null

  const calendario = componerCalendario({
    hoy: fechaMadrid(new Date()),
    fuentes: {
      seguro: titulares === null ? null : vencimientosDeSeguros(titulares, titulo),
      recibo: titulares === null ? null : recibosPendientes(titulares, titulo),
      // `null` de la lectura = esta sesión no tiene patrimonio a la vista: se miró y no hay (≠ lectura caída).
      patrimonio: patrimonioR.status === 'rejected' ? null : patrimonio === null ? [] : fechasDePatrimonio(patrimonio.vencimientos),
      recordatorio: recordatorios === null ? null : fechasDeRecordatorios(recordatorios),
      aviso: avisos === null ? null : avisosConFecha(avisos.avisos),
    },
    incompletas: avisos !== null && avisosDeFechaIncompletos(avisos.fuentesIlegibles) ? ['aviso'] : [],
  })

  // Lo del editor de recordatorios (antes en la bóveda): las pólizas a las que se puede colgar uno y lo que ya sabemos.
  const declaradas = declaradasR.status === 'fulfilled' ? declaradasR.value : []
  const polizasDelEditor = [
    ...(cartera?.propias ?? []).flatMap((t) => t.polizas.map((p) => ({ p, de: null as string | null }))),
    ...(cartera?.autorizadas ?? []).flatMap((t) => t.polizas.map((p) => ({ p, de: t.nombre }))),
  ].map(({ p, de }) => ({
    valor: `cartera:${p.id}`,
    etiqueta: [p.compania, RAMO[p.ramo] ?? p.ramo, p.bien.cosa ?? p.bien.ubicacion ?? (p.numeroPoliza ? `nº ${p.numeroPoliza}` : null), de ? `de ${de}` : null]
      .filter(Boolean)
      .join(' · '),
  }))
  const opcionesDeclaradas = declaradas.map((p) => ({
    valor: `declarada:${p.id}`,
    etiqueta: [p.compania ?? 'Compañía sin identificar', p.ramo ? (RAMO[p.ramo] ?? p.ramo) : null, p.matricula ?? (p.numeroPoliza ? `nº ${p.numeroPoliza}` : null), 'la añadiste tú']
      .filter(Boolean)
      .join(' · '),
  }))
  const carnets = carnetsR.status === 'fulfilled' ? carnetsR.value : null
  const { precargas, carnetsIlegibles } = precargasDeRecordatorio({
    carnets,
    polizas: [
      ...(cartera === null
        ? []
        : [...cartera.propias, ...cartera.autorizadas].flatMap((t) =>
            t.polizas.filter((p) => cuentaComoEnVigor(p)).map((p) => ({ valor: `cartera:${p.id}`, ramo: p.ramo, matricula: p.bien.matricula })),
          )),
      ...declaradas.map((p) => ({
        valor: `declarada:${p.id}`,
        ramo: p.ramo,
        matricula: p.matricula,
        fechaMatriculacion: p.fechaMatriculacion ? p.fechaMatriculacion.toISOString().slice(0, 10) : null,
      })),
    ],
    hoy: new Date(),
  })

  return (
    <PaginaPortal antetitulo="Herramientas" titulo="Mi" acento="calendario">
      <p className="suave" style={{ marginTop: 0 }}>
        Todas tus fechas en un sitio: lo que vence, los recibos, los avisos y tus recordatorios. Lo que ya está hecho no aparece.
      </p>

      {calendario.sinComprobar.length > 0 && (
        <TarjetaPortal id="cal-sin-comprobar" tono="aviso" titulo="No hemos podido comprobar todo">
          <p role="status" style={{ marginTop: 0, marginBottom: 0 }}>
            No hemos podido comprobar {calendario.sinComprobar.map((o) => DE_DONDE[o]).join(', ')}. Vuelve a intentarlo en un rato; que no
            salga aquí no significa que no tengas nada.
          </p>
        </TarjetaPortal>
      )}

      {calendario.vacio && (
        <TarjetaPortal id="cal-vacio" titulo="Todavía no hay nada en el calendario">
          <p style={{ marginTop: 0, marginBottom: 0 }}>
            Cuando tus seguros tengan fecha de vencimiento, haya recibos por cobrar o añadas un recordatorio, lo verás aquí.
          </p>
        </TarjetaPortal>
      )}

      {calendario.avisos.length > 0 && (
        <TarjetaPortal id="cal-avisos" antetitulo="Para que no se te pase" titulo="Avisos">
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)' }}>
            {calendario.avisos.map((a) => (
              <li key={a.clave} style={{ minWidth: 0 }}>
                <strong style={{ overflowWrap: 'anywhere' }}>{a.titulo}</strong>
                {a.detalle && <div style={{ fontSize: 14, overflowWrap: 'anywhere' }}>{a.detalle}</div>}
                <Link href={a.href} style={{ display: 'inline-block', minHeight: 44, paddingBlock: 10 }}>Abrir</Link>
              </li>
            ))}
          </ul>
        </TarjetaPortal>
      )}

      {calendario.entradas.length > 0 && (
        <TarjetaPortal id="cal-fechas" antetitulo="Por orden de fecha" titulo="Próximas fechas">
          <ListaCalendario entradas={calendario.entradas} tope={TOPE_VER_MAS_CALENDARIO} />
        </TarjetaPortal>
      )}

      <Recordatorios
        recordatorios={recordatorios}
        polizas={[...polizasDelEditor, ...opcionesDeclaradas]}
        precargas={precargas}
        carnetsIlegibles={carnetsIlegibles}
      />
    </PaginaPortal>
  )
}
