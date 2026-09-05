import Link from 'next/link'
import { contactoEfectivo, etiquetaRol, type ContactoEfectivo, type EstadoClienteDerivado, type ResumenFicha } from '@central/module-seguros'
import { urlSubirPoliza, type Ficha, type IntervinienteFicha } from '@/lib/ficha-asegura'
import type { ContactosCliente } from '@/lib/cliente-edicion-asegura'
import { PageHeader, BtnLink } from '@/components/ui'
import AccionesContacto from '../../AccionesContacto'
import { fmt } from './piezas'

/**
 * La cabecera de la ficha: quién es, cómo se le llama y **qué exige una llamada
 * HOY**. Se pinta igual en las siete pestañas, y ese es justo el punto.
 *
 * 🚨 Por qué los contadores viven aquí y no dentro de una pestaña (03/09/2026):
 * el CRM anterior de Alberto necesita chapitas rojas en sus pestañas porque lo
 * que no está en la pestaña abierta no existe. Un recibo devuelto escondido
 * tras un clic es un recibo que no se reclama. Así que lo que dispara una
 * gestión —cobros, siniestros abiertos y la única fecha sobre la que aún se
 * puede actuar— se queda FUERA de las pestañas, siempre visible.
 *
 * Cada tile tiene tres estados y nunca dos: `—` = no se ha podido mirar ·
 * `0` = se miró y no hay · el número.
 */
export default function Cabecera({ ficha, resumen }: { ficha: Ficha; resumen: ResumenFicha }) {
  // Solo el cónyuge sube a la cabecera; el resto de vínculos vive en «Contactos».
  const conyuge = ficha.relaciones?.find(r => r.tipo === 'Cónyuge/Pareja de Hecho') ?? null
  return (
    <>
      <div>
        <Link href="/correduria" style={{ fontSize: 13, color: 'var(--muted)' }}>← Correduría</Link>
        <PageHeader
          titulo={ficha.nombre}
          sub={<span style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {/* El estado lo DERIVA asegura de los hechos (cliente · con presupuesto ·
                lead · ex-cliente) y lo trae con su motivo. Sin él (asegura viejo),
                la regla de siempre: CIMA engancha pólizas por DNI a una ficha que
                puede seguir `lead`, y con pólizas vivas ES cliente, diga lo que
                diga el enum. */}
            <EstadoCabecera estado={ficha.estado} cotizacionesVivas={ficha.cotizacionesVivas} cliente={ficha.tipo === 'cliente' || resumen.conteo.vivas > 0} />
            <Contacto nombre={ficha.nombre} c={ficha.contacto} intervinientes={ficha.intervinientes} piiClave={ficha.piiClave} contactos={ficha.contactos} polizas={ficha.polizas} />
            {conyuge && (
              <span title={`${conyuge.nombre} es cónyuge/pareja de hecho de ${ficha.nombre}`}>
                💍 <Link href={`/correduria/cliente/${conyuge.relacionadoId}`}>{conyuge.nombre}</Link>
              </span>
            )}
          </span>}
        />
      </div>

      <Acciones />

      <Titulares resumen={resumen} />
    </>
  )
}

// ── Titulares ───────────────────────────────────────────────────────────────
// Lo que hay que saber ANTES de descolgar el teléfono. Cada número lleva su
// estado: un contador que no distingue «cero» de «no informado» es justo el que
// hace decir «está todo al día» sobre lo que no se ha mirado.

function Titulares({ resumen }: { resumen: ResumenFicha }) {
  const { conteo, recibos, siniestrosAbiertos: abiertos, proximo } = resumen
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
      <Kpi label="Pólizas vivas" valor={String(conteo.vivas)} sub={`${conteo.total} en total`} />
      <Kpi
        label="Recibos devueltos"
        valor={recibos.devueltos === null ? '—' : String(recibos.devueltos)}
        color={recibos.devueltos ? 'var(--negative)' : undefined}
        sub={
          recibos.devueltos === null
            ? 'asegura aún no manda recibos'
            : recibos.devueltos > 0 ? 'hay que reclamar el cobro' : 'ninguno devuelto'
        }
      />
      <Kpi
        label="Recibos al cobro"
        valor={recibos.pendientes === null ? '—' : String(recibos.pendientes)}
        color={recibos.pendientes ? 'var(--warning)' : undefined}
        sub={
          recibos.polizasSinRecibos > 0 ? `${recibos.polizasSinRecibos} póliza(s) sin recibos informados`
            : recibos.pendientes ? 'emitidos y aún sin cargar: no es deuda'
              : 'sobre los recibos informados'
        }
      />
      <Kpi
        label="Siniestros abiertos"
        valor={abiertos === null ? '—' : String(abiertos)}
        color={abiertos ? 'var(--warning)' : undefined}
        sub={abiertos === null ? 'no se han podido leer' : abiertos > 0 ? 'en tramitación' : 'ninguno abierto'}
      />
      <ProximoVencimiento proximo={proximo} vivas={conteo.vivas} sinFecha={resumen.vivasSinFechaVencimiento} />
    </div>
  )
}

/**
 * La única fecha de la ficha sobre la que se puede ACTUAR, y por eso sube aquí:
 * hasta ahora vivía dentro de una celda de la tabla de pólizas.
 *
 * 🚨 No es el vencimiento: es el **último día para oponerse a la prórroga**
 * (vencimiento − 30 días, LCS art. 22). Enseñar «vence el 15 de marzo» deja
 * creer que hay hasta el 15, cuando el plazo se cerró el 13 de febrero. El
 * vencimiento se dice debajo, para que no falte, pero el número grande es el
 * día que importa.
 */
function ProximoVencimiento({ proximo, vivas, sinFecha }: {
  proximo: ResumenFicha['proximo']; vivas: number; sinFecha: number
}) {
  if (proximo === null) {
    return (
      <Kpi
        label="Hay que avisar antes del"
        valor="—"
        sub={
          vivas === 0 ? 'ninguna póliza viva'
            // NULL en la fecha es «no se sabe cuándo vence», no «no vence».
            : sinFecha > 0 ? `${sinFecha} viva(s) sin fecha de vencimiento`
              : 'sin vencimientos por delante'
        }
      />
    )
  }
  const vencido = proximo.diasHastaVencimiento < 0
  return (
    <Kpi
      label="Hay que avisar antes del"
      valor={fmt(proximo.limiteAviso)}
      pequeno
      color={proximo.enPlazo && proximo.diasHastaLimiteAviso <= 30 ? 'var(--warning)' : !proximo.enPlazo ? 'var(--muted)' : undefined}
      sub={
        proximo.enPlazo
          ? `quedan ${proximo.diasHastaLimiteAviso} día(s) · vence el ${fmt(proximo.vencimiento)}`
          : vencido
            ? `venció el ${fmt(proximo.vencimiento)}`
            : `plazo pasado: renueva otro año · vence el ${fmt(proximo.vencimiento)}`
      }
    />
  )
}

function Kpi({ label, valor, sub, color, pequeno }: {
  label: string; valor: string; sub?: string; color?: string
  /** Para un valor que es una fecha: 22px se sale de la tarjeta en móvil. */
  pequeno?: boolean
}) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontSize: pequeno ? 17 : 22, fontWeight: 800, color: color ?? 'var(--text)' }}>{valor}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{sub}</div>}
    </div>
  )
}

// ── Estado de la cabecera ───────────────────────────────────────────────────
// El rótulo no es un acto de fe: el motivo va en el `title`. Y si hay
// presupuestos vivos sin ser cliente, se dice cuántos.

function EstadoCabecera({ estado, cotizacionesVivas, cliente }: {
  estado: EstadoClienteDerivado | null
  cotizacionesVivas: number | null
  /** La regla anterior, para una versión de asegura que no manda `estado`. */
  cliente: boolean
}) {
  const etiqueta = estado ? estado.etiqueta : cliente ? '✅ Cliente (CIMA)' : '🕐 Lead'
  const esCliente = estado ? estado.estado === 'cliente' : cliente
  const title = estado ? estado.motivo : cliente ? 'tiene póliza viva por CIMA o su ficha es de tipo cliente' : 'sin póliza viva por CIMA'
  return (
    <span title={title}>
      {etiqueta}
      {!esCliente && cotizacionesVivas !== null && cotizacionesVivas > 0 && (
        <span style={{ color: 'var(--muted)' }}> ({cotizacionesVivas} presupuesto{cotizacionesVivas === 1 ? '' : 's'})</span>
      )}
    </span>
  )
}

// ── Acciones ────────────────────────────────────────────────────────────────
// Lo que se puede HACER desde la ficha, además de mirar. Subir un documento es
// gratis (el agente lo lee; el precio se pide aparte) y vive en asegura porque
// comparte pantalla con la cotización que sale de lo leído.

function Acciones() {
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
      <BtnLink href={urlSubirPoliza()} variante="secundario" nuevaPestana>
        📄 Subir póliza o documento ↗
      </BtnLink>
      <span style={{ color: 'var(--muted)' }} title="Hoy el agente lee pólizas de AUTO (PDF o foto): vehículo, antigüedad, siniestralidad. El fichero NO se guarda todavía: falta decidir dónde y cuánto tiempo conservar documentos con DNI y matrícula dentro.">
        el agente la lee y enseña lo que ha encontrado · hoy solo auto · el fichero no se guarda aún
      </span>
    </div>
  )
}

// ── Contacto ────────────────────────────────────────────────────────────────
// 🚨 «Sin teléfono» en la ficha del TOMADOR no es «no hay a quién llamar».
// Esquiansa (empresa) no tiene teléfono; su conductor habitual —dueño del
// coche— sí, en su propia ficha enlazada por CIMA. `contactoEfectivo` mira
// primero al tomador y luego a los intervinientes, y dice DE QUIÉN es el número.

// «cifrado» a secas no dice dónde tocar. asegura manda por qué no abre la clave
// (02/09/2026: Alberto copió variables en Vercel tres veces a ciegas porque
// «sin clave», «mal pegada» y «clave distinta» se veían idénticas).
const CAUSA_PII: Record<string, string> = {
  sin_clave: 'central-asegura no tiene PII_ENCRYPTION_KEY, o no se ha redesplegado tras añadirla',
  mal_formada: 'PII_ENCRYPTION_KEY en central-asegura no son 64 caracteres hexadecimales: se pegó mal',
  no_abre: 'PII_ENCRYPTION_KEY en central-asegura no es la misma que la del proyecto asegura',
  sin_muestra: 'no hay ningún dato cifrado con el que probar la clave',
}

function Contacto({ nombre, c, intervinientes, piiClave, contactos, polizas }: {
  /** Para el `aria-label` de los iconos: «Llamar a Jose Suárez». */
  nombre: string
  c: { telefono: string | null; email: string | null; telefonoIlegible: boolean; emailIlegible: boolean; ciudad: string | null; provincia: string | null }
  intervinientes: IntervinienteFicha[] | null
  piiClave: string | null
  /** Todos los teléfonos/emails; `null` = asegura no manda el bloque (no se afirma «solo uno»). */
  contactos: ContactosCliente | null
  /** Para decir de QUÉ póliza sale el número prestado (la matrícula, si es auto). */
  polizas: { id: string; matricula: string | null; numeroPoliza: string | null }[]
}) {
  // «(+N)» = hay más aparte del principal. Desde el 05/09/2026 se LEEN en la
  // pestaña Contactos, arriba del todo, sin abrir nada; editarlos sigue siendo
  // cosa del formulario plegado de esa misma pestaña.
  const masTel = contactos && contactos.telefonos.length > 1 ? contactos.telefonos.length - 1 : 0
  const masEmail = contactos && contactos.emails.length > 1 ? contactos.emails.length - 1 : 0
  const mas = (n: number) => n > 0 ? <span style={{ fontSize: 11, color: 'var(--muted)' }} title={`${n} más, en la pestaña Contactos`}> (+{n})</span> : null
  const causaPii = piiClave === null ? 'la clave no abre este dato (asegura no dice por qué: versión anterior)' : CAUSA_PII[piiClave] ?? `estado de clave desconocido: ${piiClave}`
  const sitio = [c.ciudad, c.provincia].filter(Boolean).join(', ')
  const ef = contactoEfectivo({ telefono: c.telefono, email: c.email }, intervinientes)
  // 🚨 De QUÉ póliza sale. GLOBAL 2 tiene tres furgonetas con TRES conductores
  // habituales distintos: sin esto la ficha pinta el número de uno de ellos como
  // si fuera «el teléfono de la empresa» (Alberto, 02/09/2026).
  const suya = ef.quien ? polizas.find(x => x.id === ef.quien!.polizaId) ?? null : null
  const deQue = suya?.matricula ? ` del ${suya.matricula}` : suya?.numeroPoliza ? ` de la nº ${suya.numeroPoliza}` : ''
  const quien = ef.quien
    ? `${ef.quien.nombre ?? 'sin nombre legible'}, ${etiquetaRol(ef.quien.rol)}${deQue}`
    : null
  // 🚨 `tomador_en_poliza` NO es «de otro»: es SUYO, pero guardado en la póliza y
  // no en su ficha. Se dice, porque el aviso de vencimiento lee la ficha y hoy no
  // le llega — se arregla copiándolo aquí, no llamando a nadie (04/09/2026).
  const deOtro = (via: ContactoEfectivo['viaTelefono']) =>
    via === 'tomador_en_poliza' ? (
      <span style={{ fontSize: 11, color: 'var(--warning)' }} title="Está en un interviniente de su póliza, no en su ficha: el aviso de vencimiento lee la ficha, así que hoy no le sale. Cópialo a su ficha.">
        {' '}(📇 en su póliza, no en su ficha)
      </span>
    ) : via === 'interviniente' && quien ? (
      <span style={{ fontSize: 11 }}>
        {' '}({ef.quien?.fichaId ? <Link href={`/correduria/cliente/${ef.quien.fichaId}`}>{quien}</Link> : quien})
      </span>
    ) : null
  // Sin intervinientes que mirar, «sin teléfono» solo habla del tomador.
  const coletilla = ef.intervinientesSinMirar ? ' · intervinientes sin comprobar' : ''
  return (
    <>
      {/* Los tres iconos van juntos y al principio: es lo que se TOCA. Detrás
          sigue el número y de quién es, que es lo que se LEE. El WhatsApp lo
          pinta ahí dentro `BotonWhatsapp`, y solo si el número es un móvil
          (ver `lib/telefono-wa.ts`): no se repite suelto al lado del número. */}
      <AccionesContacto telefono={ef.telefono} email={ef.email} quien={nombre} />
      {ef.telefono ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          <a href={`tel:${ef.telefono.replace(/\s/g, '')}`}>📞 {ef.telefono}</a>
          {deOtro(ef.viaTelefono)}
          {mas(masTel)}
        </span>
      ) : (
        // Cifrado-que-no-abre y sin-teléfono son cosas distintas y se arreglan
        // en sitios distintos (la clave PII vs. pedírselo al cliente).
        <span title={c.telefonoIlegible ? `Está guardado pero no se puede descifrar: ${causaPii}` : `No consta teléfono en su ficha${ef.intervinientesSinMirar ? '' : ' ni en la de ninguno de sus intervinientes'}`}>
          📞 {c.telefonoIlegible ? `cifrado · ${causaPii}` : `sin teléfono${coletilla}`}
        </span>
      )}
      {ef.email ? (
        <span>
          <a href={`mailto:${ef.email}`}>✉️ {ef.email}</a>
          {deOtro(ef.viaEmail)}
          {mas(masEmail)}
        </span>
      ) : (
        <span title={c.emailIlegible ? `Está guardado pero no se puede descifrar: ${causaPii}` : 'No consta email'}>
          ✉️ {c.emailIlegible ? `cifrado · ${causaPii}` : 'sin email'}
        </span>
      )}
      {sitio && <span>📍 {sitio}</span>}
    </>
  )
}

