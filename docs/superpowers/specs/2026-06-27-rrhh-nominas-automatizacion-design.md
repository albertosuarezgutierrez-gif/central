# Diseño: Automatización de Nóminas en iarrhh

## Contexto

`apps/rrhh` ya almacena nóminas como documentos en la carpeta `nominas` del expediente del empleado, pero no las genera ni calcula. Este módulo añade el motor de cálculo, el flujo de borrador→confirmación→firma, y la generación de PDF con firma digital del empleado (eIDAS).

El motor de cálculo se extrae como paquete puro `@central/module-nominas` para que sea reutilizable y vendible independientemente.

---

## Arquitectura

```
packages/module-nominas          ← motor puro (sin BD, sin fetch)
  ├── tipos.ts                   ← tipos TS exportados
  ├── tablas-2026.ts             ← tablas SS/IRPF del año
  ├── at-ep.ts                   ← tipos AT/EP por CNAE (estática)
  ├── calcular.ts                ← calcularNomina()
  └── index.ts                   ← re-exports

apps/rrhh (consumidor)
  ├── DB: 3 tablas nuevas + 2 columnas en empresas
  ├── lib/contratos.ts           ← CRUD contratos_laborales
  ├── lib/nominas.ts             ← CRUD nóminas + generación borradores
  ├── lib/nomina-pdf.tsx         ← generación PDF (@react-pdf/renderer)
  ├── lib/at-ep-agente.ts        ← resolver tipo AT/EP por CNAE
  ├── /admin/nominas             ← panel de nóminas del responsable
  ├── /admin/empleados/[id]/contrato  ← gestión contrato laboral
  └── /api/cron/nominas          ← Vercel Cron día 25 8:00
```

---

## Base de datos (schema `rrhh`)

### Nuevas columnas en `empresas`
```sql
cnae_codigo  TEXT           -- código CNAE de la actividad (ej. "5610")
at_ep_tipo   NUMERIC(6,4)   -- tipo AT/EP resuelto para esa empresa
```

### `rrhh.contratos_laborales`
| campo | tipo | notas |
|---|---|---|
| id | UUID PK | |
| empresa_id | UUID FK empresas | |
| empleado_id | UUID FK empleados | |
| salario_base | NUMERIC(10,2) | bruto mensual jornada completa |
| grupo_cotizacion | SMALLINT 1–11 | grupo SS |
| tipo_contrato | TEXT | indefinido / temporal / parcial |
| jornada_pct | NUMERIC(5,2) | 100 = completa |
| irpf_retencion_pct | NUMERIC(5,2) | % Modelo 145 acordado |
| categoria_convenio | TEXT? | categoría en el convenio |
| conceptos_fijos | JSONB | array `{nombre, importe}[]` |
| vigente_desde | DATE | |
| activo | BOOLEAN | solo uno activo por empleado |

### `rrhh.nominas`
| campo | tipo | notas |
|---|---|---|
| id | UUID PK | |
| empresa_id | UUID FK | |
| empleado_id | UUID FK | |
| periodo | TEXT | "2026-06" |
| estado | TEXT | borrador / confirmada / enviada |
| datos_calculo | JSONB | `NominaDesglose` completo |
| pdf_path | TEXT? | ruta en rrhh-documentos |
| generada_at | TIMESTAMPTZ | cuando se creó el borrador |
| confirmada_at | TIMESTAMPTZ? | |
| enviada_at | TIMESTAMPTZ? | cuando el empleado firmó |
| UNIQUE (empresa_id, empleado_id, periodo) | | |

### `rrhh.incidencias_mes`
| campo | tipo | notas |
|---|---|---|
| id | UUID PK | |
| empresa_id | UUID | |
| nomina_id | UUID FK nominas CASCADE | |
| tipo | TEXT | horas_extra / ausencia_injustificada / plus_puntual / descuento / baja_it / vacaciones |
| concepto | TEXT | descripción libre |
| importe | NUMERIC(10,2)? | euros |
| horas | NUMERIC(6,2)? | horas extra |
| dias | INTEGER? | días de baja/ausencia |

---

## Motor de cálculo `@central/module-nominas`

### `calcularNomina(contrato, incidencias, tablas, periodo)` → `NominaDesglose`

1. **Devengos** (haber):
   - salario_base × (jornada_pct / 100)
   - + conceptos_fijos
   - + horas_extra (€/hora = salario_base / 160h)
   - + plus_puntual
   - − descuentos por ausencia_injustificada y baja_it (proporcional a días laborables del mes)

2. **Base de cotización SS**:
   - ≈ total devengado
   - Clamp: [bases[grupo].min, bases[grupo].max]

3. **Deducciones trabajador**:
   - Contingencias comunes: base × 4,70%
   - Desempleo: base × 1,55% (indefinido) o 1,60% (temporal)
   - FP: base × 0,10%
   - IRPF: total_devengado × irpfRetencionPct

4. **Neto** = devengos.total − deducciones.total

5. **Cuota patronal** (informativa, para P&L de plataforma):
   - Contingencias: base × 23,60%
   - Desempleo: base × 5,50% (indef.) o 6,70% (temp.)
   - FOGASA: base × 0,20%
   - FP: base × 0,60%
   - AT/EP: base × at_ep_tipo

### Tablas SS 2026 (actualizables anualmente)

Bases mensuales (grupos 1–7) y diarias (grupos 8–11). Tipos fijos por ley. AT/EP por CNAE (tabla estática, ~100 CNAEs más comunes).

---

## Flujo borrador → confirmación → firma

```
Día 25 (Vercel Cron 08:00)
  → /api/cron/nominas (protected by CRON_SECRET)
  → para cada empresa activa:
      - busca empleados activos con contrato activo
      - importa solicitudes aprobadas del mes como incidencias automáticas
      - inserta nomina estado='borrador'
  → notifica al responsable (push + email)

Responsable en /admin/nominas/2026-06
  → tabla de borradores (empleado | neto | estado)
  → puede añadir/editar incidencias (horas extra, plus, bajas...)
  → "Confirmar nómina" por empleado:
      1. recalcular con incidencias finales
      2. generar PDF (@react-pdf/renderer)
      3. subir a rrhh-documentos: {empresaId}/nominas/{empleadoId}/{periodo}.pdf
      4. insertar en rrhh.documentos (carpeta=nominas, estado_firma=pendiente)
      5. solicitar firma OTP al empleado (lib/firma.ts existente)
      6. notificar empleado por push + email
      7. nomina.estado → 'confirmada'

Empleado en /e (portal ya existente)
  → ve notificación
  → va a su carpeta nominas → firma con OTP
  → nomina.estado → 'enviada', documento.estado_firma → 'firmada'
```

---

## AT/EP por sector (CNAE)

- `at-ep.ts` en el módulo: tabla estática con los CNAEs más comunes de hostelería y limpieza
- `lib/at-ep-agente.ts` en rrhh: si no está en la tabla, usa `core-ai` para buscarlo (patrón de `convenio-agente.ts`)
- Se ejecuta cuando el responsable configura el CNAE de su empresa en `/admin/cuenta`
- Resultado: `rrhh.empresas.at_ep_tipo` (sobrescribible manualmente)

---

## PDF de nómina

Generado con `@react-pdf/renderer`. Secciones:
1. Cabecera: logo empresa, nombre/DNI/NSS empleado, período, tipo contrato
2. Tabla devengos (haber)
3. Tabla deducciones (debe)
4. Líquido a percibir (neto)
5. Bases de cotización SS
6. Cuota patronal (informativa)

---

## Dependencias nuevas

- `packages/module-nominas` (nuevo, sin deps externas)
- `@react-pdf/renderer` ^4.x en `apps/rrhh`
- Registro en `package.json` y `transpilePackages` de `next.config.ts`

---

## Tests

- `packages/module-nominas/src/calcular.test.ts`: casos de jornada parcial, horas extra, baja IT, grupos SS distintos, IRPF
- `apps/rrhh/lib/contratos.test.ts`: CRUD
- `apps/rrhh/lib/nominas.test.ts`: generación borrador, incidencias, confirmación
