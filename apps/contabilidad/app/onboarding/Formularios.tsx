'use client'
import { useState } from 'react'
import { enviar } from '../_enviar'

type Msg = { ok: boolean; texto: string[] } | null

/** Un formulario de importación CSV: pega el texto o elige el fichero (se lee en el navegador). Todo o nada: si hay errores se listan por línea. */
function FormCsv({ accion, titulo, ayuda, ejemplo, conFecha = false, boton }: { accion: 'plan' | 'saldos' | 'terceros'; titulo: string; ayuda: string; ejemplo: string; conFecha?: boolean; boton: string }) {
  const [csv, setCsv] = useState('')
  const [fecha, setFecha] = useState(`${new Date().getFullYear()}-01-01`)
  const [msg, setMsg] = useState<Msg>(null)
  const [enviando, setEnviando] = useState(false)
  async function leer(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0]
    if (f) setCsv(await f.text())
  }
  async function importar(ev: React.FormEvent) {
    ev.preventDefault()
    setEnviando(true); setMsg(null)
    const r = await enviar('/api/onboarding', { accion, csv, ...(conFecha ? { fecha } : {}) })
    setEnviando(false)
    if (!r.ok) { setMsg({ ok: false, texto: r.errores.slice(0, 30) }); return }
    setMsg({ ok: true, texto: ['Importado correctamente.'] })
    setTimeout(() => window.location.reload(), 900)
  }
  return (
    <form className="formulario" onSubmit={importar}>
      <fieldset>
        <legend>{titulo}</legend>
        <p className="tenue">{ayuda}</p>
        {conFecha && <label className="campo">Fecha del asiento de apertura<input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required /></label>}
        <label className="campo">Fichero CSV<input type="file" accept=".csv,text/csv,text/plain" onChange={leer} /></label>
        <label className="campo">…o pega el contenido<textarea rows={6} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={ejemplo} style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace' }} /></label>
        <button type="submit" className="btn" disabled={enviando || !csv.trim()}>{enviando ? 'Importando…' : boton}</button>
        {msg && (msg.ok
          ? <p className="ok" role="status">{msg.texto[0]}</p>
          : <div className="error" role="alert"><p style={{ margin: 0 }}><strong>No se ha importado nada.</strong> Corrige el fichero y vuelve a subirlo:</p><ul>{msg.texto.map((t, i) => <li key={i}>{t}</li>)}</ul></div>)}
      </fieldset>
    </form>
  )
}

export function FormPlan() {
  return <FormCsv accion="plan" titulo="1 · Plan de cuentas" boton="Importar plan" ejemplo={'codigo;nombre;naturaleza\n4300001;Cliente Uno;D'}
    ayuda="Columnas: codigo, nombre y, si no cuelga de una cuenta que ya existe, naturaleza (D o A). Solo AÑADE cuentas: las existentes no se tocan." />
}
export function FormSaldos() {
  return <FormCsv accion="saldos" conFecha titulo="2 · Saldos iniciales" boton="Crear asiento de apertura" ejemplo={'cuenta;debe;haber\n572;10.000,00;\n100;;10.000,00'}
    ayuda="Columnas: cuenta, debe y haber (o cuenta y saldo: + deudor, − acreedor). El balance debe CUADRAR al céntimo; si no, no se crea el asiento y se te dice la diferencia." />
}
export function FormTerceros() {
  return <FormCsv accion="terceros" titulo="3 · Clientes y proveedores" boton="Importar terceros" ejemplo={'nif;nombre;tipo;email\nB12345674;Proveedor SL;proveedor;compras@proveedor.test'}
    ayuda="Columnas: nif, nombre, tipo (cliente, proveedor o acreedor) y opcionalmente email y telefono. El NIF/CIF/NIE se valida; una sola fila inválida detiene la importación." />
}
