import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireSession } from '@/lib/session'
import { correduriaUnica } from '@/lib/cartera'
import { origenRetarificacion } from '@/lib/cartera-ficha'
import { precalificarAuto, type Resueltos } from '@/lib/codeoscopic/desde-cartera'
import { resolverConfig } from '@/lib/codeoscopic/config'
import {
  estadosCiviles,
  tiposDeGaraje,
  municipiosPorCp,
  fechaMatriculacionDeMatricula,
  emparejar,
  type Opcion,
} from '@/lib/codeoscopic/catalogos'
import { estadoConsumo } from '@/lib/codeoscopic/cotizar'
import Retarificador from './retarificador'

export const dynamic = 'force-dynamic'

/**
 * Pantalla de retarificación de UNA póliza.
 *
 * Todo lo que se hace aquí, en el servidor, es GRATIS: leer la ficha, resolver
 * los catálogos y preguntar la fecha de matriculación por la matrícula. Lo que
 * cuesta 0,50€ es el botón, y por eso el botón está en un componente aparte y
 * llama a su propio puerto `POST`.
 *
 * El orden de la pantalla es el orden del razonamiento: primero qué se sabe,
 * luego qué se ha SUPUESTO (que es la letra pequeña del precio), luego qué
 * falta, y solo al final el botón.
 */
export default async function RetarificarPage({
  params,
}: {
  params: Promise<{ polizaId: string }>
}) {
  await requireSession()
  const { polizaId } = await params

  const correduria = await correduriaUnica().catch(() => null)
  if (!correduria) {
    return (
      <div className="card">
        <h2>⚠️ No se ha podido resolver la correduría</h2>
        <p>Sin ese dato no se consulta la cartera ni se cotiza.</p>
      </div>
    )
  }

  const origen = await origenRetarificacion(correduria.id, polizaId)
  if (!origen) notFound()

  // ── Catálogos y matrícula: todo gratis, y con el interruptor apagado ───────
  const r = resolverConfig(process.env, { ignorarInterruptor: true })
  let civiles: Opcion[] = []
  let garajes: Opcion[] = []
  let municipios: Opcion[] = []
  let fechaMatriculacion: string | null = null
  let notaMatricula: string | null = null
  let fallaCatalogo: string | null = null

  if (r.estado === 'lista') {
    const cp = origen.cliente.codigoPostal
    const [c, g, m, f] = await Promise.all([
      estadosCiviles(r.config).catch((e: unknown) => errar(e)),
      tiposDeGaraje(r.config).catch((e: unknown) => errar(e)),
      cp ? municipiosPorCp(r.config, cp).catch((e: unknown) => errar(e)) : Promise.resolve([]),
      origen.poliza.matricula
        ? fechaMatriculacionDeMatricula(r.config, origen.poliza.matricula)
        : Promise.resolve({ estado: 'error' as const, detalle: 'la póliza no tiene matrícula' }),
    ])
    civiles = c
    garajes = g
    municipios = m
    if (civiles.length === 0 && garajes.length === 0) {
      fallaCatalogo =
        'No se han podido leer los catálogos de Codeoscopic. Sin ellos no hay ids válidos que ' +
        'mandar, así que no se puede cotizar todavía. Esto no es un problema de la ficha.'
    }
    if (f.estado === 'ok') {
      fechaMatriculacion = f.fecha
      notaMatricula =
        'La ha devuelto Codeoscopic desde la matrícula. El propio fabricante avisa de que es ' +
        'APROXIMADA: orienta para el precio, no vale para emitir.'
    } else if (f.estado === 'no-encontrada') {
      notaMatricula =
        'Codeoscopic no ha encontrado la fecha de esta matrícula. Eso es «no la he encontrado», ' +
        'no «el coche no tiene fecha»: hay que ponerla a mano.'
    } else {
      notaMatricula = `No se ha podido preguntar la fecha de matriculación (${f.detalle}). Tampoco es una ausencia: no se sabe.`
    }
  } else {
    fallaCatalogo =
      'Codeoscopic no está configurado en este entorno, así que no hay catálogos ni se puede cotizar.'
  }

  const estadoCivilAuto = emparejar(civiles, origen.cliente.estadoCivil)

  const resueltos: Resueltos = {
    municipioId: municipios.length === 1 ? Number(municipios[0].id) : null,
    estadoCivilId: estadoCivilAuto?.id ?? null,
    fechaMatriculacion,
    codigoVehiculo: null, // lo elige el corredor: es el único que no se deduce
    garaje: null,
  }

  const pre = precalificarAuto(origen.cliente, origen.poliza, resueltos, hoyIso())
  const consumo = await estadoConsumo(correduria.id)

  return (
    <div className="grid">
      <div>
        <p className="muted">
          <Link href="/cartera">← Cartera</Link>
        </p>
        <h1>Retarificar</h1>
        <p className="muted">
          {origen.etiqueta} · matrícula {origen.poliza.matricula ?? '—'}
        </p>
      </div>

      {fallaCatalogo && <div className="card err">{fallaCatalogo}</div>}

      <div className="card">
        <h2>Lo que se manda desde la ficha</h2>
        <p className="muted">
          Se pide precio como si se cambiara de compañía: la póliza actual pasa a ser la
          «anterior», que es lo que da la antigüedad y el bonus.
        </p>
        <div className="table-wrap">
          <table>
            <tbody>
              <Fila etiqueta="Compañía actual (código DGS)" valor={origen.poliza.codigoEntidadDgs} />
              <Fila etiqueta="Póliza anterior" valor={origen.poliza.numeroPoliza} />
              <Fila etiqueta="Asegurado desde" valor={origen.poliza.fechaEfectoInicial} />
              <Fila etiqueta="Vencimiento actual" valor={origen.poliza.fechaVencimiento} />
              <Fila
                etiqueta="Siniestros anotados"
                valor={String(origen.poliza.siniestrosRegistrados)}
              />
              <Fila etiqueta="Fecha de matriculación" valor={fechaMatriculacion} nota={notaMatricula} />
            </tbody>
          </table>
        </div>
      </div>

      {pre.supuestos.length > 0 && (
        <div className="card">
          <h2>⚠️ Lo que se ha supuesto</h2>
          <p className="muted">
            Ninguno de estos datos está en la ficha. El precio sale con ellos, así que forman parte
            de la letra pequeña: si alguno no es cierto, la prima real cambia.
          </p>
          <ul>
            {pre.supuestos.map((s) => (
              <li key={`${s.campo}-${String(s.valor)}`}>
                <strong>{s.campo}</strong>: <code>{String(s.valor)}</code> — {s.porque}
                {s.optimista && (
                  <>
                    {' '}
                    <span className="badge warn">puede abaratar el precio</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Retarificador
        polizaId={polizaId}
        faltanInicial={pre.faltan}
        garajes={garajes}
        civiles={civiles}
        municipios={municipios}
        estadoCivilAuto={estadoCivilAuto}
        fechaMatriculacion={fechaMatriculacion}
        consumo={'error' in consumo ? { error: consumo.error } : consumo}
        deshabilitado={fallaCatalogo !== null}
      />
    </div>
  )
}

function Fila({
  etiqueta,
  valor,
  nota,
}: {
  etiqueta: string
  valor: string | null
  nota?: string | null
}) {
  return (
    <tr>
      <th style={{ textAlign: 'left', width: '40%' }}>{etiqueta}</th>
      <td>
        {/* Un hueco se dice, no se pinta como 0 ni como vacío. */}
        {valor ?? <span className="muted">no consta</span>}
        {nota && (
          <>
            <br />
            <span className="muted" style={{ fontSize: 12 }}>
              {nota}
            </span>
          </>
        )}
      </td>
    </tr>
  )
}

function errar(_e: unknown): Opcion[] {
  // El catálogo vacío se detecta arriba y se dice; aquí solo se evita que un
  // fallo tumbe la página entera.
  return []
}

function hoyIso(): string {
  return new Date().toISOString().slice(0, 10)
}
