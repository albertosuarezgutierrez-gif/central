import { redirect } from 'next/navigation'

import { etiquetaProcedencia } from '@central/module-seguros-portal'

import { carteraDeIdentidad, type PolizaPortal, type TitularPortal } from '@/lib/cartera-lectura'
import { prisma } from '@/lib/db'
import { eur } from '@/lib/dinero'
import { fechaEs } from '@/lib/fechas'
import {
  obligacionesDeIdentidad,
  polizasSinFechaDeVencimiento,
  sincronizarObligacionesDeIdentidad,
} from '@/lib/obligaciones'
import { getIdentidad } from '@/lib/session'

import Calendario from './Calendario'
import { EditarPoliza } from './EditarPoliza'
import { SubirPoliza } from './SubirPoliza'

export const dynamic = 'force-dynamic'

const RAMO: Record<string, string> = {
  auto: 'Auto',
  moto: 'Moto',
  hogar: 'Hogar',
  vida: 'Vida',
  salud: 'Salud',
  decesos: 'Decesos',
  responsabilidad_civil: 'Responsabilidad civil',
  comercio: 'Comercio',
  comunidades: 'Comunidades',
  otros: 'Otros',
}

/** Las opciones del selector de ramo salen del MISMO mapa que las etiquetas de
 *  arriba (que son las de `RAMOS_POLIZA`), para que la lista de la pantalla y la
 *  que acepta el backend no se separen con el tiempo. Va como prop porque
 *  `EditarPoliza` es un componente de cliente. */
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

  // Las dos lecturas parten de la misma sesión: la cartera por `portal_vinculo`
  // de esta identidad, y la bóveda de declaradas por `identidadId`. Ninguna
  // acepta un id que venga de fuera.
  const [cartera, declaradas] = await Promise.all([
    carteraDeIdentidad(identidad.id),
    prisma.portalPolizaDeclarada.findMany({
      where: { identidadId: identidad.id },
      orderBy: { creadaEn: 'desc' },
      take: 50,
    }),
  ])

  // Las obligaciones se derivan de la cartera que YA se ha leído arriba (no se
  // vuelve a leer) y se releen después: el `upsert` es idempotente, así que
  // recargar la bóveda no duplica nada.
  await sincronizarObligacionesDeIdentidad(identidad.id, cartera)
  const obligaciones = await obligacionesDeIdentidad(identidad.id)

  const propiasVacia = cartera.propias.every((t) => t.polizas.length === 0)
  const correduria = cartera.correduria ?? 'Grupo Asegura'

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1rem' }}>
      <h1 style={{ fontSize: '1.5rem', marginTop: 0 }}>Mis seguros</h1>

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
                    deDocumento: p.documentoNombre !== null,
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <SubirPoliza />
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

function Card({ p }: { p: PolizaPortal }) {
  const vence = fechaEs(p.fechaVencimiento)
  return (
    <li className="cartera-card">
      <h3>
        {p.compania} <span className="tenue">· {RAMO[p.ramo] ?? p.ramo}</span>
      </h3>
      <div className="linea">
        {p.numeroPoliza === null ? 'Nº de póliza no visible en tu nivel' : `Póliza ${p.numeroPoliza}`}
        {' · '}
        {vence ? `Vence el ${vence}` : 'Sin fecha de vencimiento informada'}
      </div>
      <div className="linea">
        {/* `prima: null` = el nivel no la enseña; `anual: null` = la compañía no la ha informado. Nunca 0. */}
        {p.prima === null
          ? 'Prima no visible en tu nivel'
          : p.prima.anual === null
            ? 'Prima anual —'
            : `Prima anual ${eur(p.prima.anual)}${p.prima.fraccionamiento ? ` (${p.prima.fraccionamiento})` : ''}`}
      </div>
      <Recibos p={p} />
      {p.coberturas !== null && p.coberturas.total > 0 && (
        <div className="linea">
          {p.coberturas.lista.join(' · ')}
          {p.coberturas.total > p.coberturas.lista.length && ` y ${p.coberturas.total - p.coberturas.lista.length} más`}
        </div>
      )}
      <div className="chips">
        <span className={`chip${p.vigencia === 'vigente' ? ' ok' : ''}`}>{ESTADO[p.estado] ?? p.estado}</span>
        {p.vigencia === 'pendiente' && <span className="chip aviso">vigencia sin confirmar: falta el vencimiento</span>}
        {!p.confirmadaCima && <span className="chip aviso">pendiente de confirmación por la compañía</span>}
        {p.siniestrosAbiertos.map((s) => (
          <span key={s.id} className="chip aviso">
            siniestro {s.estado === 'en_tramitacion' ? 'en tramitación' : 'abierto'}
            {s.referencia ? ` ${s.referencia}` : ''}
            {s.tramitadorTelefono ? ` · tramitador ${s.tramitadorTelefono}` : ''}
          </span>
        ))}
      </div>
    </li>
  )
}

function Recibos({ p }: { p: PolizaPortal }) {
  if (p.recibos === null) return <div className="nivel">Recibos no visibles en tu nivel</div>
  const r = p.recibos
  // `total: 0` es «la compañía no ha mandado recibos», NO «al corriente».
  if (r.total === 0) return <div className="nivel">Sin recibos informados por la compañía</div>
  return (
    <div className="linea">
      {r.devueltos > 0 && <span style={{ color: 'var(--peligro)' }}>{r.devueltos} recibo(s) devuelto(s) · </span>}
      {r.proximoAlCobro
        ? `Próximo recibo ${r.proximoAlCobro.importe === null ? '—' : eur(r.proximoAlCobro.importe)}${
            r.proximoAlCobro.fechaVencimiento ? ` el ${fechaEs(r.proximoAlCobro.fechaVencimiento)}` : ''
          }`
        : 'Ningún recibo al cobro'}
      {r.ultimoCobrado &&
        ` · Último cobrado ${r.ultimoCobrado.importe === null ? '—' : eur(r.ultimoCobrado.importe)}${
          r.ultimoCobrado.fechaEmision ? ` (${fechaEs(r.ultimoCobrado.fechaEmision)})` : ''
        }`}
    </div>
  )
}
