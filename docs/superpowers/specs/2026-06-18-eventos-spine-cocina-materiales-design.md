# Diseño — `eventos` como columna vertebral: boda → cocina + material

> Decisión Alberto (18/06/2026): una boda entra UNA vez y de ahí cuelgan **cocina central**
> (qué se cocina) y **materiales/logística** (qué se monta: mesas, sillas, menaje). Anclaje
> elegido: la tabla **`eventos`** (CRM rico), NO `cocina_eventos`. Catering Joaquín Jaén.

## Principio: "junto pero separado por módulo"

El **evento es el tronco común**; cocina y materiales son **dos módulos independientes** que
leen/escriben contra el **mismo `eventos.id`** pero **no dependen entre sí**. Una boda puede tener
solo cocina, solo material, o ambos. Materiales sigue siendo portable (enlaza por destino
genérico, sin FK dura), igual que el motor puro `@central/module-materiales`.

```
                         ┌─ cocina_eventos.evento_id ─────► qué se cocina (recetas / APPCC)
   eventos (la boda) ────┤
                         └─ materiales_reservas / _asignacion / _movimientos
                              (parent_tipo|destino_tipo = 'evento', *_id = eventos.id) ─► qué se monta
```

## Estado de partida (18/06/2026)

Hoy hay **3 sistemas de evento desconectados**:

| Sistema | Tabla | Qué hace | Enlace a material |
|---|---|---|---|
| Cocina central | `cocina_eventos` (schema iarest) | recetas + APPCC; JJ lo usa en `/produccion` | ❌ ninguno |
| CRM/catering | `eventos` (schema iarest) | tipo boda/bautizo, presupuesto, espacio, fechas montaje/desmontaje, cliente fiscal, aforo | ✅ legacy `inventario_menaje_evento` |
| Almacén material | `materiales_asignacion` / `_reservas` / `_movimientos` | mesas/sillas/menaje; destino genérico | ⚠️ genérico (`destino_ref`/`parent_id`) |

`cocina_eventos` (columnas: `id, local_id, nombre, fecha_evento, pax, ubicacion, archivado`) está
**aislado**. `eventos` es mucho más rico (ver lista de columnas en `/api/owner/eventos/route.ts`).
El módulo materiales se construyó **deliberadamente independiente** (sin FK a `eventos`), por eso
ya soporta el enlace genérico que necesitamos.

## Cambios de modelo (mínimos)

1. **Puente cocina → evento:** `ALTER TABLE iarest.cocina_eventos ADD COLUMN evento_id uuid
   REFERENCES eventos(id)` (nullable). En `/produccion`, al crear/editar un evento de cocina se
   crea o enlaza la fila `eventos` (selector de tipo: boda/bautizo/comunión/corporativo). JJ sigue
   trabajando en `/produccion`; el dato maestro vive en el CRM. (Compat: eventos de cocina sin
   `evento_id` siguen funcionando sueltos.)
2. **Puente material → evento:** **no requiere DDL.** Ya existe:
   - `materiales_asignacion.destino_tipo='evento'` + `destino_ref=eventos.id` + `destino_nombre`.
   - `materiales_reservas.parent_tipo='evento'` + `parent_id=eventos.id`.
   - `materiales_movimientos.parent_tipo/parent_id` idem (ledger).
3. **Legacy:** `inventario_menaje_evento` queda **deprecado** a favor de `materiales`. Migración de
   datos = tarea aparte, no bloqueante (los datos vivos de menaje viejo son escasos/demo).

## Primer corte a construir (sesión siguiente)

Panel **"Material del evento"** en el detalle del evento (en `/produccion` para JJ y/o
`/owner/eventos`):

1. **Reservar:** elegir un **kit** (`materiales_kits` → `expandirKit`) o materiales sueltos →
   crea `materiales_reservas` con `parent_tipo='evento'`, `parent_id=eventos.id`, fechas =
   `eventos.fecha_montaje..fecha_desmontaje` (o `fecha_evento`).
2. **Avisar de conflictos:** usar `disponibilidadEnFecha(movimientos, reservas, fecha)` del motor
   puro para advertir si dos bodas del mismo finde piden el mismo stock.
3. **Sacar el día del montaje:** convertir reservas en `materiales_asignacion` (descuenta stock,
   va al montador por `/montaje`).
4. **Cerrar:** las roturas (`materiales_dano`) del evento aparecen en el dossier/cierre con su
   coste → línea hacia el resumen económico del evento (cliente fiscal ya está en `eventos`).

### Reutilizar (NO reinventar)
- Motor puro `packages/module-materiales/src/stock.ts`: `expandirKit`, `disponibilidadEnFecha`,
  `stockActualDesdeLedger`, `alertasVencimiento`, `ajusteInventario`.
- Tipos con `parent`/`ParentRef` ya modelan el enlace (`packages/module-materiales/src/types.ts`).
- Rutas existentes: `/api/materiales/kits/instanciar`, `/reservas`, `/asignacion`, `/movimientos`.
- Patrón IA de `/api/cocina/menu-sugerido` (reusar para "material sugerido", idea #1).

## Backlog de ideas (priorizado)

1. **Material IA por aforo:** dado aforo + tipo de evento, proponer el kit (mesas/sillas/vajilla/
   cristalería/mantelería) con cantidades por PAX. Espejo de `menu-sugerido` (`callAI`).
2. **Escandallo de material por PAX** (espejo de `cocina_receta_ingredientes`): "por comensal:
   1 plato llano, 1 hondo, 2 copas, 0.25 mesa…".
3. **Cronograma unificado del evento:** una línea de tiempo que cruza cocina (`min_por_pax` →
   cuándo empezar) + logística (cargar furgón / montar / desmontar con `fecha_montaje/desmontaje`).
4. **Hoja de carga/picking del furgón** + temperatura de transporte; check salida/retorno.
5. **Alerta de solapes entre bodas** (`disponibilidadEnFecha`) + sugerir alquiler externo.
6. **Liquidación de roturas al cliente:** roturas del evento → línea en presupuesto/factura.
7. **Reposición automática de material** (espejo del cron `reposicion-stock`): stock < `stock_minimo`
   → sugerir pedido a `materiales_proveedores` usando `plazo_entrega_dias`.
8. **QR por unidad serializada** (`materiales_unidades.codigo_qr`): check-in/out de activos caros +
   su historial de eventos/mantenimiento.
9. **Plantillas de evento:** "Boda 150 pax" preconfigura menú + kit de material en un clic.
10. **Rentabilidad por evento en plataforma:** coste comida + coste/rotura material + ingreso
    presupuesto → cuadro de mando consolidado.
11. **Torre de control del evento (semáforo):** Cocina (% APPCC) · Material (% montado/devuelto) ·
    Sala/Personal, en verde/ámbar/rojo.
12. **Conteo de devolución por visión IA:** foto de las cajas al volver → IA aproxima faltas/roturas
    (reutiliza `callAIVision`, como la foto-recepción de cocina).
13. **Coste/margen del evento en vivo:** recetas + kits + personal → margen estimado antes de
    confirmar; alerta si sale a pérdidas.
14. **Mantenimiento por uso:** cada X eventos, un activo auto-genera tarea en `materiales_mantenimiento`.
15. **Alquiler externo trazado al evento:** material de tercero = entrada temporal imputada al coste.
16. **Foto de "montaje correcto":** el montador sube foto del salón montado → prueba al cliente +
    plantilla visual para la próxima boda igual.
17. **Calendario logístico unificado:** agenda diaria cocina + montajes/desmontajes + mantenimientos.

## Estado de implementación (18/06/2026)
**1er corte CONSTRUIDO** (rama `claude/jj-logistica-materiales-k5eko3`), con una **desviación
consciente del anclaje**: se ancló en **`cocina_eventos`** (no en la tabla CRM `eventos`) porque JJ
trabaja exclusivamente en `/produccion` y no usa aún el módulo CRM de eventos → así es usable y
testeable HOY sin construir gestión de eventos CRM. Enlace genérico
(`materiales_asignacion.destino_tipo='evento'`, `destino_ref=cocina_eventos.id`), por lo que migrar
al spine `eventos` luego = repuntar `destino_ref`/`parent_id` (sin reescribir).
- API: `apps/ia-rest/src/app/api/cocina/eventos/[id]/material/route.ts` (GET/POST/DELETE).
- UI: panel "📦 Material" por evento en `apps/ia-rest/src/app/produccion/page.tsx` (kits + suelto,
  descuento de stock, valor en riesgo, quitar).
- **Sigue pendiente del spine completo:** `cocina_eventos.evento_id` + creación/enlace de la fila
  `eventos` (CRM) cuando catering empiece a usar presupuestos/espacios/fechas de montaje; reservas por
  fecha (`materiales_reservas` + `disponibilidadEnFecha`); roturas en el cierre económico del evento.

## Fuera de alcance
- Construir la integración (esto es solo el diseño).
- Migrar datos `inventario_menaje_evento` → `materiales`.
- Previsión IA por temporada/temperatura, código de barras/báscula, multi-almacén con reparto.

## Estado de las tablas de materiales (verificado 18/06/2026)
Las 16 tablas `materiales_*` existen en `iarest` de la BD compartida (`wswbehlcuxqxyinousql`),
0 en `public`, RLS 16/16. El código de Fase B ya desplegado dejó de fallar. Migraciones fuente:
`apps/ia-rest/supabase/migrations/2026-06-12_materiales{,_v2,_categorias,_ledger,_fase_b}.sql`.
