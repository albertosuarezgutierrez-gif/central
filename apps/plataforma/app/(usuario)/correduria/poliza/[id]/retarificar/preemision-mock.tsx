'use client'

// 🧪 MAQUETA de la pantalla de pre-emisión, para que Alberto la pruebe con el
// mismo look de `/correduria` — NO es una integración real.
//
// Contexto (visto en Avant2 el 08/09/2026): tras elegir presupuesto, cada
// compañía pide sus propios «datos adicionales del riesgo» antes de emitir.
// Eso NO lo inventa Avant2: es el paso `Preemisión` del flujo de Codeoscopic
// (`Quote → Preemisión → Submit → webhook`, ver `apps/asegura/CLAUDE.md`), que
// hoy sigue en sandbox y detrás de `CODEOSCOPIC_EMISION_ACTIVA` (apagado). Esta
// pantalla reproduce esos MISMOS campos por compañía —a mano, calcados de lo
// que enseña Avant2— para que Alberto vea el diseño encajado en plataforma
// antes de decidir si merece la pena cerrar la integración real. No manda nada
// a ninguna aseguradora ni gasta un céntimo: cuando el paso Submit exista de
// verdad, este componente es el candidato a sustituirse por el que lea el
// esquema que devuelva cada compañía en la respuesta de Codeoscopic.
//
// Los toggles Sí/No y los desplegables SÍ reaccionan (estado local) para que
// se pueda «jugar» con la pantalla, pero ese estado no sale de aquí.

import { useState } from 'react'
import { normalizarTexto } from './retarificador'

type CampoSelect = { clave: string; tipo: 'select'; etiqueta: string; opciones: string[]; valorInicial: string }
type CampoNumero = { clave: string; tipo: 'numero'; etiqueta: string; valorInicial: string }
type CampoSiNo = { clave: string; tipo: 'sino'; etiqueta: string; valorInicial: boolean }
type Campo = CampoSelect | CampoNumero | CampoSiNo

type Seccion = { titulo: string; campos: Campo[] }
type EsquemaCompania = { nombre: string; secciones: Seccion[] }

const SEG_MODALIDAD = 'Según configuración de la modalidad'

const ESQUEMAS: Record<string, EsquemaCompania> = {
  occident: {
    nombre: 'Occident',
    secciones: [
      {
        titulo: 'Descuentos',
        campos: [
          { clave: 'descuento_comercial', tipo: 'numero', etiqueta: 'Descuento comercial %', valorInicial: '30' },
          {
            clave: 'colectivo',
            tipo: 'select',
            etiqueta: 'Colectivo',
            opciones: ['Ninguno', 'Empleados', 'Autónomos', 'Asociación'],
            valorInicial: 'Ninguno',
          },
        ],
      },
      {
        titulo: 'Datos adicionales del riesgo',
        campos: [
          {
            clave: 'tipo_adquisicion',
            tipo: 'select',
            etiqueta: 'Tipo de adquisición del vehículo',
            opciones: ['Seleccione un tipo', 'Contado', 'Financiado', 'Renting', 'Leasing'],
            valorInicial: 'Seleccione un tipo',
          },
          { clave: 'nematriculado', tipo: 'sino', etiqueta: '¿Vehículo nematriculado?', valorInicial: false },
          {
            clave: 'leasing_renting',
            tipo: 'sino',
            etiqueta: '¿El vehículo se encuentra en situación de leasing o renting?',
            valorInicial: false,
          },
          {
            clave: 'menores_25_familia',
            tipo: 'sino',
            etiqueta: '¿Existen conductores menores de 25 años en la familia?',
            valorInicial: false,
          },
          { clave: 'antirrobo', tipo: 'sino', etiqueta: '¿Dispone de dispositivo antirrobo?', valorInicial: false },
          {
            clave: 'reciente_circulacion',
            tipo: 'select',
            etiqueta: 'Reciente de circulación',
            opciones: ['Sin reciente', 'Con reciente'],
            valorInicial: 'Sin reciente',
          },
          {
            clave: 'num_vehiculos_familia',
            tipo: 'select',
            etiqueta: 'Número de vehículos de la familia',
            opciones: ['1', '2', '3', '4 o más'],
            valorInicial: '1',
          },
        ],
      },
      {
        titulo: 'Uso del vehículo',
        campos: [
          {
            clave: 'uso_vehiculo',
            tipo: 'select',
            etiqueta: 'Uso del vehículo',
            opciones: ['Particular', 'Profesional', 'Autoescuela', 'Alquiler'],
            valorInicial: 'Particular',
          },
        ],
      },
      {
        titulo: 'Coberturas',
        campos: [
          'Incendio y robo',
          'Incluir pérdida total en modalidades Comb',
          'Servicio de gestoría',
          'Accidentes ocupantes',
          'Vehículo de sustitución',
          'Asistencia en viaje',
          'Recuperación de puntos',
          'Servicio de alerta de multas de tráfico',
        ].map((etiqueta) => ({
          clave: normalizarTexto(etiqueta).replace(/\s+/g, '_'),
          tipo: 'select' as const,
          etiqueta,
          opciones: [SEG_MODALIDAD, 'Sí', 'No'],
          valorInicial: SEG_MODALIDAD,
        })),
      },
    ],
  },
  reale: {
    nombre: 'Reale',
    secciones: [
      {
        titulo: 'Descuentos',
        campos: [
          {
            clave: 'campana_comercial',
            tipo: 'select',
            etiqueta: 'Campaña comercial',
            opciones: ['-campañas no disponibles-'],
            valorInicial: '-campañas no disponibles-',
          },
        ],
      },
      {
        titulo: 'Datos adicionales del riesgo',
        campos: [
          {
            clave: 'puntos_carnet',
            tipo: 'numero',
            etiqueta: 'Puntos carnet conductor habitual',
            valorInicial: '12',
          },
          { clave: 'alarma', tipo: 'sino', etiqueta: '¿El vehículo dispone de alarma?', valorInicial: false },
          {
            clave: 'detector',
            tipo: 'select',
            etiqueta: 'Detector',
            opciones: ['Detector no instalado', 'Detector instalado homologado', 'Detector instalado no homologado'],
            valorInicial: 'Detector no instalado',
          },
          {
            clave: 'uso_vehiculo',
            tipo: 'select',
            etiqueta: 'Uso del vehículo',
            opciones: ['Calcular automáticamente', 'Particular', 'Profesional'],
            valorInicial: 'Calcular automáticamente',
          },
        ],
      },
      {
        titulo: 'Coberturas',
        campos: [
          {
            clave: 'asistencia_viaje',
            tipo: 'select',
            etiqueta: 'Asistencia en viaje',
            opciones: ['SIN vehículo de sustitución', 'CON vehículo de sustitución'],
            valorInicial: 'SIN vehículo de sustitución',
          },
          {
            clave: 'reclamacion_multas',
            tipo: 'select',
            etiqueta: 'Reclamación de multas',
            opciones: ['Excluida', 'Incluida'],
            valorInicial: 'Excluida',
          },
          {
            clave: 'retirada_carnet',
            tipo: 'select',
            etiqueta: 'Retirada de carnet',
            opciones: ['Excluida - 0 €', 'Incluida'],
            valorInicial: 'Excluida - 0 €',
          },
          { clave: 'capital_accidentes', tipo: 'numero', etiqueta: 'Capital de Accidentes', valorInicial: '18.000' },
          { clave: 'limpieza', tipo: 'sino', etiqueta: 'Limpieza (300 €)', valorInicial: false },
          { clave: 'equipaje', tipo: 'sino', etiqueta: 'Equipaje', valorInicial: false },
          {
            clave: 'agrupacion_coberturas',
            tipo: 'select',
            etiqueta: 'Agrupación de coberturas',
            opciones: ['Global', 'Individual'],
            valorInicial: 'Global',
          },
          { clave: 'colision_animal', tipo: 'sino', etiqueta: 'Daños por colisión animal', valorInicial: false },
        ],
      },
    ],
  },
  mapfre: {
    nombre: 'Mapfre',
    secciones: [
      {
        titulo: 'Datos adicionales del riesgo',
        campos: [
          { clave: 'km0', tipo: 'sino', etiqueta: 'Vehículo Km 0', valorInicial: false },
          {
            clave: 'tipo_uso',
            tipo: 'select',
            etiqueta: 'Tipo de uso',
            opciones: ['Particular', 'Profesional'],
            valorInicial: 'Particular',
          },
          {
            clave: 'familiar_mapfre',
            tipo: 'sino',
            etiqueta: '¿El tomador tiene un familiar con otro vehículo asegurado en Mapfre?',
            valorInicial: false,
          },
        ],
      },
    ],
  },
  allianz: {
    nombre: 'Allianz',
    secciones: [
      {
        titulo: 'Descuentos',
        campos: [
          {
            clave: 'descuento_cap',
            tipo: 'numero',
            etiqueta: 'Descuento comercial % (CAP)',
            valorInicial: '25',
          },
          {
            clave: 'descuento_venta_cruzada',
            tipo: 'numero',
            etiqueta: 'Descuento comercial % (venta cruzada)',
            valorInicial: '25',
          },
          {
            clave: 'tipo_comision',
            tipo: 'select',
            etiqueta: 'Tipo de comisión sobre la prima',
            opciones: ['A', 'B', 'C'],
            valorInicial: 'A',
          },
        ],
      },
      {
        titulo: 'Datos adicionales del riesgo',
        campos: [
          {
            clave: 'fecha_vencimiento',
            tipo: 'select',
            etiqueta: 'Fecha de vencimiento',
            opciones: ['Día 1 del mes actual', 'Fecha de efecto'],
            valorInicial: 'Día 1 del mes actual',
          },
          {
            clave: 'autorizacion_menores_25',
            tipo: 'sino',
            etiqueta: 'Autorización expresa para menores de 25 años',
            valorInicial: false,
          },
        ],
      },
      {
        titulo: 'Coberturas',
        campos: [
          {
            clave: 'accidentes_conductor',
            tipo: 'select',
            etiqueta: 'Accidentes conductor',
            opciones: ['30.000', '12.000', '60.000'],
            valorInicial: '30.000',
          },
          {
            clave: 'asistencia_viaje',
            tipo: 'select',
            etiqueta: 'Asistencia en Viaje',
            opciones: ['Estándar', 'Premium'],
            valorInicial: 'Estándar',
          },
          { clave: 'vehiculo_sustitucion', tipo: 'sino', etiqueta: 'Vehículo de sustitución', valorInicial: false },
          {
            clave: 'aviso_multas',
            tipo: 'sino',
            etiqueta: 'Aviso y gestión de multas de tráfico',
            valorInicial: false,
          },
          {
            clave: 'compra_reciente',
            tipo: 'select',
            etiqueta: '¿Acaban de comprar el vehículo?',
            opciones: ['No, ya lo tenía y quiero cambiar de seguro', 'Sí, lo acabo de comprar'],
            valorInicial: 'No, ya lo tenía y quiero cambiar de seguro',
          },
          {
            clave: 'usos_vehiculo',
            tipo: 'select',
            etiqueta: '¿Qué usos hace del vehículo?',
            opciones: ['Ocasional (fines de semana, vacaciones, etc.)', 'Diario', 'Profesional'],
            valorInicial: 'Ocasional (fines de semana, vacaciones, etc.)',
          },
        ],
      },
    ],
  },
}

/** Busca el esquema por coincidencia parcial: «Allianz Seguros y Reaseguros»
 *  tiene que casar con la clave `allianz`, igual que hace ya el emparejador de
 *  catálogos de `apps/asegura/lib/codeoscopic/opciones.ts`. */
function buscarEsquema(compania: string | null): EsquemaCompania | null {
  if (!compania) return null
  const norm = normalizarTexto(compania)
  const entrada = Object.entries(ESQUEMAS).find(([clave]) => norm.includes(clave))
  return entrada ? entrada[1] : null
}

export function PreemisionMock({
  compania,
  producto,
  onCerrar,
}: {
  compania: string | null
  producto: string | null
  onCerrar: () => void
}) {
  const esquema = buscarEsquema(compania)

  return (
    <div className="card" style={{ marginTop: 12, borderColor: 'var(--brand)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0 }}>Pre-emisión · {compania ?? '—'}</h2>
          {producto && (
            <p className="muted" style={{ margin: '2px 0 0' }}>
              {producto}
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
        <p style={{ margin: 0, fontWeight: 800, color: 'var(--warn)' }}>🧪 MAQUETA — sin conectar</p>
        <p style={{ margin: '4px 0 0' }}>
          Boceto de la pantalla de pre-emisión con los campos que hoy pide esta compañía en Avant2. No
          se manda nada a ninguna aseguradora ni se gasta un céntimo: el envío real (paso Preemisión →
          Submit de Codeoscopic) sigue en sandbox y detrás de un interruptor apagado.
        </p>
      </div>

      {esquema ? (
        <div style={{ marginTop: 14, display: 'grid', gap: 16 }}>
          {esquema.secciones.map((seccion) => (
            <SeccionCampos key={seccion.titulo} seccion={seccion} />
          ))}
        </div>
      ) : (
        <p className="muted" style={{ marginTop: 12 }}>
          Todavía no hay maqueta de pre-emisión para «{compania ?? 'esta compañía'}»: se añade calcando
          la pantalla real de Avant2 cuando Alberto la vea.
        </p>
      )}

      <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" className="primary" disabled title="Maqueta: todavía no envía nada">
          Continuar a emisión (aún no disponible)
        </button>
      </div>
    </div>
  )
}

function SeccionCampos({ seccion }: { seccion: Seccion }) {
  return (
    <div>
      <h3>{seccion.titulo}</h3>
      <div className="form-grid">
        {seccion.campos.map((campo) => (
          <CampoControl key={campo.clave} campo={campo} />
        ))}
      </div>
    </div>
  )
}

function CampoControl({ campo }: { campo: Campo }) {
  const [valor, setValor] = useState<string | boolean>(campo.valorInicial)

  if (campo.tipo === 'sino') {
    const activo = valor === true
    return (
      <div>
        <label>{campo.etiqueta}</label>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            className={`toggle-sino${activo ? ' activo' : ''}`}
            onClick={() => setValor(true)}
          >
            Sí
          </button>
          <button
            type="button"
            className={`toggle-sino${!activo ? ' activo' : ''}`}
            onClick={() => setValor(false)}
          >
            No
          </button>
        </div>
      </div>
    )
  }

  if (campo.tipo === 'select') {
    return (
      <div>
        <label>{campo.etiqueta}</label>
        <select value={valor as string} onChange={(e) => setValor(e.target.value)}>
          {campo.opciones.map((opcion) => (
            <option key={opcion} value={opcion}>
              {opcion}
            </option>
          ))}
        </select>
      </div>
    )
  }

  return (
    <div>
      <label>{campo.etiqueta}</label>
      <input value={valor as string} onChange={(e) => setValor(e.target.value)} inputMode="decimal" />
    </div>
  )
}
