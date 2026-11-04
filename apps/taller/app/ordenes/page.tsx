import { Cabecera } from '../_marca'

export default function Pagina() {
  return (
    <>
      <Cabecera conSalir />
      <main className="contenido">
        <h1>Órdenes</h1>
        <p className="tenue">Próximamente (F1).</p>
        <a href="/" className="btn btn-sec">Volver</a>
      </main>
    </>
  )
}
