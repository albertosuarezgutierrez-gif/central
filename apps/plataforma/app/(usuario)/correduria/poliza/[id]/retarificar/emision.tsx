'use client'

// El panel de EMISIÓN REAL, construido el 11/09/2026 sobre el caso de Pilar
// Franco Ruz. Sustituye a la maqueta `preemision-mock.tsx` (borrada): esto SÍ
// llama a Codeoscopic, dos veces.
//
// 🚨 SIN SANDBOX y sin fixture del fabricante para las dos llamadas de aquí
// detrás (ReRate y Submit) — ver `apps/asegura/lib/codeoscopic/emitir.ts`.
// Por eso el paso 2 (los «campos adicionales») es un JSON en bruto y no un
// formulario bonito por compañía: los nombres de esos campos NO están
// confirmados contra el fabricante, y un formulario con etiquetas inventadas
// prometería un contrato que no existe. Lo que SÍ hace el paso 2 es mostrar,
// literalmente, la lista que el propio vendor dice que le falta (`faltan` +
// `campos`, servidos por `GET .../policy-application-fields`) para que se
// puedan rellenar con esos nombres exactos, no con una suposición.
//
// Dos pasos, cada uno con su propia confirmación — nunca uno solo que
// encadene las dos llamadas: el coste/compromiso de cada una es distinto y
// ninguna de las dos se puede deshacer sola.

import { useState } from 'react'
import { eur } from '@/lib/dinero'
import { pedirOferta, pedirEmision } from './acciones'
import type { CuentaConocida } from '@/lib/retarificar-asegura'

type EstadoPanel =
  | { paso: 'inicio' }
  | { paso: 'confirmando' }
  | {
      paso: 'oferta'
      offerId: string
      primaEur: number | null
      firmeza: string
      caducaEn: string | null
      avisos: string[]
      // El `projectId` que hace falta para el Submit lo devuelve `pedirOferta`.
      projectId: string
      // La cuenta de cargo que asegura YA conoce del cliente, enmascarada. Se
      // enseña ANTES de emitir y no viaja sin confirmarla (Alberto, 12/09/2026).
      cuenta: CuentaConocida | null
      cuentaIlegible: boolean
    }
  | { paso: 'emitiendo' }
  | {
      paso: 'faltan_campos'
      faltan: string[]
      campos: unknown
      projectId: string
      mensaje: string | null
      cuenta: CuentaConocida | null
      confirmar: boolean
    }
  /**
   * La compañía pide, al confirmar el precio, un dato que el proyecto no tiene y
   * la ficha tampoco (12/09/2026). No es un error: son huecos que se teclean
   * aquí y asegura escribe en el proyecto (gratis) antes de repetir el ReRate.
   */
  | {
      paso: 'faltan_vendor'
      faltan: { campo: string; motivo: string }[]
      sugeridos: Record<string, string>
      noReconocidos: string[]
      mensaje: string
    }
  | { paso: 'emitido'; referenciaVendor: string | null }
  | { paso: 'emitido_sin_acunar'; mensaje: string }
  | { paso: 'error'; mensaje: string }

function euroODash(n: number | null): string {
  return n === null || !Number.isFinite(n) ? '—' : eur(n)
}

/**
 * Cómo se llama cada hueco en castellano. Un campo que no esté aquí se pinta
 * con su nombre técnico: mejor feo que invisible. Los valores nunca se
 * suponen — se teclean, o vienen `sugeridos` de la ficha para comprobar.
 */
const ETIQUETAS_HUECO: Record<string, { etiqueta: string; tipo: string; pista?: string }> = {
  nombreVia: { etiqueta: 'Calle (nombre de la vía)', tipo: 'text', pista: 'Solo el nombre: «San Vicente», sin número ni piso' },
  cpResidencia: { etiqueta: 'Código postal de residencia', tipo: 'text' },
  municipioResidenciaId: { etiqueta: 'Municipio (id del catálogo)', tipo: 'text' },
  dni: { etiqueta: 'DNI/NIE', tipo: 'text' },
  nombre: { etiqueta: 'Nombre', tipo: 'text' },
  apellido1: { etiqueta: 'Primer apellido', tipo: 'text' },
  fechaNacimiento: { etiqueta: 'Fecha de nacimiento', tipo: 'date' },
  sexo: { etiqueta: 'Sexo (hombre/mujer)', tipo: 'text' },
  estadoCivil: { etiqueta: 'Estado civil (id del catálogo)', tipo: 'text' },
  telefono: { etiqueta: 'Teléfono móvil', tipo: 'tel' },
  fechaCarnet: { etiqueta: 'Fecha del carnet de conducir', tipo: 'date' },
}

/**
 * Con cuenta conocida, emitir exige haberla confirmado O haber tecleado otra;
 * sin cuenta conocida no hay nada que confirmar (si la compañía la exige, su
 * 400 vuelve como hueco y entonces sí se teclea). PURO, para poder verlo fallar.
 */
function cuentaDecidida(cuenta: CuentaConocida | null, cuentaOk: boolean, iban: string): boolean {
  if (iban.trim() !== '') return true
  if (cuenta === null) return true
  return cuentaOk
}

/**
 * La cuenta de cargo del recibo. 🚨 «iban importante siempre confirmar»
 * (Alberto, 12/09/2026): la que la ficha ya conoce se pinta ENMASCARADA con su
 * origen y una casilla que el corredor marca a mano; la caja de texto es para
 * usar otra. Nada se preselecciona: un checkbox marcado por defecto no es una
 * confirmación, es la misma sorpresa con un clic menos.
 */
function CuentaCargo({
  cuenta,
  ilegible,
  obligatoria,
  cuentaOk,
  onCuentaOk,
  iban,
  onIban,
}: {
  cuenta: CuentaConocida | null
  ilegible: boolean
  obligatoria: boolean
  cuentaOk: boolean
  onCuentaOk: (v: boolean) => void
  iban: string
  onIban: (v: string) => void
}) {
  const otra = iban.trim() !== ''
  return (
    <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
      <span style={{ fontWeight: 600 }}>Cuenta de cargo del recibo</span>
      {cuenta ? (
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minHeight: 44, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={cuentaOk && !otra}
            disabled={otra}
            onChange={(e) => onCuentaOk(e.target.checked)}
            style={{ width: 22, height: 22, marginTop: 2, flex: '0 0 auto' }}
          />
          <span>
            Confirmo que el recibo se domicilie en <code style={{ fontSize: 14 }}>{cuenta.enmascarada}</code>
            {cuenta.descripcion && <span className="muted"> — {cuenta.descripcion}</span>}
            <br />
            <span className="muted" style={{ fontSize: 12 }}>
              Solo se enseñan país y últimos cuatro dígitos; asegura no manda esta cuenta sin esta casilla.
            </span>
          </span>
        </label>
      ) : ilegible ? (
        <p className="err" style={{ margin: 0, fontSize: 12 }}>
          La ficha TIENE una cuenta guardada pero central-asegura no la puede descifrar (clave PII): revisa la
          clave en Vercel, o tecléala aquí.
        </p>
      ) : (
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          {obligatoria
            ? 'Ni la póliza ni la ficha del cliente tienen cuenta: tecléala.'
            : 'Ni la póliza ni la ficha del cliente tienen cuenta. Si la compañía la exige para esta forma de pago, se pedirá aquí.'}
        </p>
      )}
      <label style={{ display: 'grid', gap: 4 }}>
        <span className="muted" style={{ fontSize: 12 }}>{cuenta ? 'O usar otra cuenta (IBAN):' : 'IBAN:'}</span>
        <input
          type="text"
          inputMode="text"
          autoComplete="off"
          placeholder="ES00 0000 0000 0000 0000 0000"
          value={iban}
          onChange={(e) => onIban(e.target.value)}
          style={{ width: '100%', minHeight: 44, boxSizing: 'border-box', fontFamily: 'monospace' }}
        />
        <span className="muted" style={{ fontSize: 12 }}>
          asegura comprueba los dígitos de control antes de mandarla; no se guarda en la ficha todavía.
        </span>
      </label>
    </div>
  )
}

export function Emision({
  tarificacionId,
  compania,
  categoria,
  primaEur,
  onCerrar,
}: {
  tarificacionId: string
  compania: string
  categoria: string
  primaEur: number | null
  onCerrar: () => void
}) {
  const [estado, setEstado] = useState<EstadoPanel>({ paso: 'inicio' })
  const [camposJson, setCamposJson] = useState('{}')
  // Lo que el corredor teclea para los huecos de `faltan_vendor` (campo → valor).
  const [correcciones, setCorrecciones] = useState<Record<string, string>>({})
  // La cuenta bancaria del Submit (12/09/2026): la compañía la exige según forma
  // de pago. Si la ficha ya la tiene, se enseña enmascarada y el corredor la
  // CONFIRMA (`cuentaOk`) o teclea otra (`iban`); asegura la pone en
  // `payment.bankAccount.iban`. Nunca se inventa ni viaja sin confirmar.
  const [iban, setIban] = useState('')
  const [cuentaOk, setCuentaOk] = useState(false)

  async function confirmarPrecio(conCorrecciones?: Record<string, string>) {
    setEstado({ paso: 'confirmando' })
    const limpias = Object.fromEntries(
      Object.entries(conCorrecciones ?? {}).filter(([, v]) => typeof v === 'string' && v.trim() !== ''),
    )
    const r = await pedirOferta({
      tarificacionId,
      compania,
      categoria,
      ...(Object.keys(limpias).length > 0 ? { correcciones: limpias } : {}),
    })
    if (r.estado === 'ok') {
      setEstado({
        paso: 'oferta',
        offerId: r.offerId,
        primaEur: r.primaEur,
        firmeza: r.firmeza,
        caducaEn: r.caducaEn,
        avisos: r.avisos,
        projectId: r.projectId,
        cuenta: r.cuenta,
        cuentaIlegible: r.cuentaIlegible,
      })
      // Una oferta nueva puede traer otra cuenta: la confirmación anterior no vale.
      setCuentaOk(false)
      return
    }
    if (r.estado === 'faltan_vendor') {
      // Se prerrellena con lo que asegura sacó de la ficha, sin pisar lo que el
      // corredor ya hubiera tecleado en una vuelta anterior.
      setCorrecciones((prev) => ({ ...r.sugeridos, ...prev }))
      setEstado({
        paso: 'faltan_vendor',
        faltan: r.faltan,
        sugeridos: r.sugeridos,
        noReconocidos: r.noReconocidos,
        mensaje: r.mensaje,
      })
      return
    }
    if (r.estado === 'patch_no_aplicado') {
      setEstado({
        paso: 'error',
        mensaje:
          `${r.mensaje} Cierra este panel y usa «Descartar y pedir precio de cero» — es la única vía ` +
          'cuando el proyecto no admite el dato.',
      })
      return
    }
    setEstado({ paso: 'error', mensaje: r.mensaje })
  }

  async function emitir(projectId: string, cuenta: CuentaConocida | null) {
    let campos: Record<string, unknown>
    try {
      campos = JSON.parse(camposJson || '{}')
    } catch {
      setEstado({ paso: 'error', mensaje: 'Los campos adicionales no son un JSON válido.' })
      return
    }
    const otraCuenta = iban.trim() !== ''
    if (otraCuenta) campos = { ...campos, iban: iban.trim() }
    // La máscara que el corredor ha visto y marcado: es lo ÚNICO que autoriza a
    // asegura a mandar la cuenta de la ficha. Un IBAN tecleado la sustituye.
    const cuentaConfirmada = !otraCuenta && cuentaOk && cuenta ? cuenta.enmascarada : null
    setEstado({ paso: 'emitiendo' })
    const r = await pedirEmision({ projectId, campos, primaAnual: primaEur, cuentaConfirmada })
    if (r.estado === 'faltan_campos') {
      setEstado({
        paso: 'faltan_campos',
        faltan: r.faltan,
        campos: r.campos,
        projectId,
        mensaje: r.mensaje,
        cuenta: r.cuenta,
        confirmar: r.confirmar,
      })
      return
    }
    if (r.estado === 'ok') {
      setEstado({ paso: 'emitido', referenciaVendor: r.referenciaVendor })
      return
    }
    if (r.estado === 'emitido_sin_acunar') {
      setEstado({ paso: 'emitido_sin_acunar', mensaje: r.mensaje })
      return
    }
    if (r.estado === 'en_vuelo') {
      setEstado({ paso: 'error', mensaje: r.mensaje })
      return
    }
    setEstado({ paso: 'error', mensaje: r.mensaje })
  }

  return (
    <div className="card" style={{ marginTop: 12, borderColor: 'var(--brand)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0 }}>Emisión · {compania || '—'}</h2>
          {categoria && (
            <p className="muted" style={{ margin: '2px 0 0' }}>
              {categoria}
            </p>
          )}
        </div>
        <button type="button" className="ghost" onClick={onCerrar}>
          Cerrar
        </button>
      </div>

      <div
        style={{
          marginTop: 10,
          border: '2px solid var(--warn)',
          background: 'rgba(217, 119, 6, 0.1)',
          borderRadius: 10,
          padding: 12,
        }}
      >
        <p style={{ margin: 0, fontWeight: 800, color: 'var(--warn)' }}>
          🚨 Esto llama de verdad a Codeoscopic — sin sandbox
        </p>
        <p style={{ margin: '4px 0 0' }}>
          Un solo intento por paso. Si algo sale raro, el mensaje de la compañía se enseña tal cual:
          no se reintenta solo.
        </p>
      </div>

      {estado.paso === 'inicio' && (
        <div style={{ marginTop: 14 }}>
          <p className="muted">
            Precio en pantalla: <strong>{euroODash(primaEur)}</strong>. El primer paso lo confirma con
            la compañía (puede cambiar de «estimado» a un precio firme).
          </p>
          <button type="button" className="primary" onClick={() => confirmarPrecio()} style={{ marginTop: 8 }}>
            Confirmar precio con la compañía
          </button>
        </div>
      )}

      {estado.paso === 'confirmando' && <p style={{ marginTop: 14 }}>Confirmando con la compañía…</p>}

      {estado.paso === 'faltan_vendor' && (
        <div style={{ marginTop: 14 }}>
          <p className="err" style={{ margin: 0 }}>
            La compañía pide {estado.faltan.length === 1 ? 'un dato' : `${estado.faltan.length} datos`} para
            confirmar el precio. No se ha gastado nada.
          </p>
          <p className="muted" style={{ margin: '4px 0 10px', fontSize: 12 }}>
            Lo que venga relleno lo ha sacado asegura de la ficha del cliente: compruébalo. Lo vacío no está en
            ningún sitio — se teclea aquí y se escribe en el proyecto (gratis) antes de volver a confirmar.
          </p>
          <div style={{ display: 'grid', gap: 10 }}>
            {estado.faltan.filter((f) => ETIQUETAS_HUECO[f.campo]).map((f) => {
              const meta = ETIQUETAS_HUECO[f.campo]!
              const valor = correcciones[f.campo] ?? ''
              const deFicha = estado.sugeridos[f.campo] !== undefined && valor === estado.sugeridos[f.campo]
              return (
                <label key={f.campo} style={{ display: 'grid', gap: 4 }}>
                  <span style={{ fontWeight: 600 }}>
                    {meta.etiqueta}
                    {deFicha && <span className="badge warn" style={{ marginLeft: 8 }}>de la ficha · comprobar</span>}
                  </span>
                  <input
                    type={meta.tipo}
                    value={valor}
                    onChange={(e) => setCorrecciones((prev) => ({ ...prev, [f.campo]: e.target.value }))}
                    style={{ width: '100%', minHeight: 44, boxSizing: 'border-box' }}
                    autoComplete="off"
                  />
                  <span className="muted" style={{ fontSize: 12 }}>
                    {meta.pista ? `${meta.pista} · ` : ''}
                    {f.motivo}
                  </span>
                </label>
              )
            })}
          </div>
          {/* Lo que la compañía pide y NO es un dato de la persona (p. ej. la fecha de
              efecto, que el proyecto no deja cambiar): aquí no hay input que valga. */}
          {estado.faltan.some((f) => !ETIQUETAS_HUECO[f.campo]) && (
            <div style={{ marginTop: 10 }}>
              <p className="err" style={{ margin: 0, fontSize: 13 }}>
                Esto no se puede corregir sobre el proyecto ya creado — hay que «Descartar y pedir precio de cero»:
              </p>
              <ul style={{ margin: '4px 0 0' }}>
                {estado.faltan
                  .filter((f) => !ETIQUETAS_HUECO[f.campo])
                  .map((f) => (
                    <li key={f.campo}>
                      <code>{f.campo}</code> — {f.motivo}
                    </li>
                  ))}
              </ul>
            </div>
          )}
          {estado.noReconocidos.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <p className="err" style={{ margin: 0, fontSize: 13 }}>
                Y esto lo dice la compañía pero asegura no sabe a qué campo corresponde (hay que mapearlo):
              </p>
              <ul style={{ margin: '4px 0 0' }}>
                {estado.noReconocidos.map((t, i) => (
                  <li key={i}>
                    <code>{t}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <details style={{ marginTop: 8 }}>
            <summary className="muted" style={{ cursor: 'pointer', fontSize: 12 }}>
              Mensaje completo de la compañía
            </summary>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, margin: '4px 0 0' }}>{estado.mensaje}</pre>
          </details>
          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              className="primary"
              style={{ minHeight: 44 }}
              disabled={
                estado.faltan.some((f) => !ETIQUETAS_HUECO[f.campo]) ||
                estado.faltan.some((f) => !(correcciones[f.campo] ?? '').trim())
              }
              onClick={() => confirmarPrecio(correcciones)}
            >
              Completar y volver a confirmar el precio
            </button>
          </div>
        </div>
      )}

      {estado.paso === 'oferta' && (
        <div style={{ marginTop: 14 }}>
          <p>
            Precio confirmado: <strong>{euroODash(estado.primaEur)}</strong>{' '}
            <span className={`badge ${estado.firmeza === 'firme' ? 'ok' : 'warn'}`}>{estado.firmeza}</span>
          </p>
          {estado.caducaEn && <p className="muted">Caduca: {estado.caducaEn}</p>}
          {estado.avisos.length > 0 && (
            <ul>
              {estado.avisos.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          )}
          <CuentaCargo
            cuenta={estado.cuenta}
            ilegible={estado.cuentaIlegible}
            obligatoria={false}
            cuentaOk={cuentaOk}
            onCuentaOk={setCuentaOk}
            iban={iban}
            onIban={setIban}
          />
          <details style={{ marginTop: 8 }}>
            <summary className="muted" style={{ cursor: 'pointer' }}>
              Campos adicionales (avanzado, opcional)
            </summary>
            <p className="muted" style={{ fontSize: 12 }}>
              JSON con lo que pida la compañía. Si falta algo, la respuesta dirá exactamente qué
              claves espera — no hay que adivinarlas.
            </p>
            <p className="err" style={{ fontSize: 12, margin: '4px 0 8px' }}>
              ⚠️ Si la compañía pide una fecha de efecto, tiene que ser <strong>HOY</strong> (o más
              tarde) — nunca una fecha pasada de esta cotización. Las compañías no admiten pólizas
              retroactivas.
            </p>
            <textarea
              value={camposJson}
              onChange={(e) => setCamposJson(e.target.value)}
              rows={4}
              style={{ width: '100%', fontFamily: 'monospace' }}
            />
          </details>
          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              className="primary"
              style={{ minHeight: 44 }}
              disabled={!cuentaDecidida(estado.cuenta, cuentaOk, iban)}
              onClick={() => emitir(estado.projectId, estado.cuenta)}
            >
              Emitir la póliza
            </button>
            {estado.cuenta && !cuentaDecidida(estado.cuenta, cuentaOk, iban) && (
              <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
                Confirma la cuenta de cargo o teclea otra antes de emitir.
              </p>
            )}
          </div>
        </div>
      )}

      {estado.paso === 'emitiendo' && <p style={{ marginTop: 14 }}>Enviando la emisión…</p>}

      {estado.paso === 'faltan_campos' && (
        <div style={{ marginTop: 14 }}>
          <p className="err" style={{ margin: 0 }}>
            La compañía pide {estado.faltan.length === 1 ? 'un dato' : 'estos datos'} antes de emitir. No se ha
            emitido nada.
          </p>
          {estado.mensaje && (
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
              {estado.mensaje}
            </p>
          )}
          {estado.faltan.includes('iban') && (
            <CuentaCargo
              cuenta={estado.cuenta}
              ilegible={false}
              obligatoria
              cuentaOk={cuentaOk}
              onCuentaOk={setCuentaOk}
              iban={iban}
              onIban={setIban}
            />
          )}
          {estado.faltan.some((f) => f !== 'iban') && (
            <div style={{ marginTop: 10 }}>
              <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                Y estas claves, en el JSON (con esos nombres exactos):
              </p>
              <ul style={{ margin: '4px 0' }}>
                {estado.faltan
                  .filter((f) => f !== 'iban')
                  .map((f) => (
                    <li key={f}>
                      <code>{f}</code>
                    </li>
                  ))}
              </ul>
              <textarea
                value={camposJson}
                onChange={(e) => setCamposJson(e.target.value)}
                rows={4}
                style={{ width: '100%', fontFamily: 'monospace' }}
              />
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              className="primary"
              style={{ minHeight: 44 }}
              disabled={
                estado.faltan.includes('iban') &&
                !(iban.trim() !== '' || (estado.cuenta !== null && cuentaOk))
              }
              onClick={() => emitir(estado.projectId, estado.cuenta)}
            >
              Reintentar la emisión
            </button>
          </div>
        </div>
      )}

      {estado.paso === 'emitido' && (
        <div className="ok" style={{ marginTop: 14 }}>
          ✅ Emitida. {estado.referenciaVendor && <>Referencia de la compañía: {estado.referenciaVendor}. </>}
          Queda como «pendiente de confirmación por CIMA» en la ficha de la póliza.
        </div>
      )}

      {estado.paso === 'emitido_sin_acunar' && (
        <div className="err" style={{ marginTop: 14 }}>
          ⚠️ {estado.mensaje}
        </div>
      )}

      {estado.paso === 'error' && (
        <div className="err" style={{ marginTop: 14 }}>
          {estado.mensaje}
        </div>
      )}
    </div>
  )
}
