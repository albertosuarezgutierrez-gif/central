# Avant2 Sales Manager (ASM) — resumen del manual `manual_asm.pdf`

Fuente: Drive `AVANT2/manual_asm.pdf` (34 págs., «Quick Guide», versión 050718, Codeoscopic). Es una guía de **usuario productor**: NO documenta la administración. Citas = página del PDF. Texto extraído en scratchpad (`asm/m.txt`).

## Aviso previo (lo que el manual NO cubre)
No hay capítulo de afiliación de compañías, claves/códigos de mediador, comisiones, campañas, organizaciones, roles ni créditos. Eso vive en otra herramienta (Workspace/administración) o en el contrato con Codeoscopic. Lo único que roza la configuración está en p.18, p.24-25 y p.32 (abajo). Pregunta a Codeoscopic: comercial@codeoscopic.com (p.34).

## 1. Afiliación / alta de compañía
- Sin información. Solo se dice que el producto muestra «todos los productos que la correduría tiene habilitados» (p.18): la habilitación de productos/compañías es algo previo, decidido fuera de ASM.
- La cabecera del PDF lista el ecosistema «Workspace»: avant2, tesis, versus, bcover (pp.24, 28): ASM es el CRM + multitarificador; la administración probablemente está en otro módulo.
- Pendiente: pedir a Codeoscopic el manual de administración/alta de compañías y quién solicita la afiliación (correduría, Codeoscopic o compañía).

## 2. Configuración por producto/compañía (lo que se ve en el flujo)
- Paso «Productos» (4.º paso, tras Vehículo/Personas/Seguro; pp.19-20, 23-24): «previo a la pantalla de precios, podrá seleccionar las condiciones especiales de las diferentes compañías» y modificar el presupuesto.
- Imagen p.24 (bloque de una compañía, ej. AXA, modalidad Terceros): campos por compañía **Fraccionamiento** (ej. Anual), **Forma de pago** (ej. Compañía), **Descuento comercial % (FDC)** («No dispone de FDC porque trabaja con descuento dirigido»), «Datos adicionales del riesgo», y panel «Excluidos de la pre-emisión» con interruptores por compañía.
- Preemisión «puede ajustar coberturas, descuentos y forma de pago» (glosario p.33).
- «Rating» = valoración propia de la correduría sobre cada compañía, usable para ordenar (p.27): es un dato de configuración de la correduría.
- NO se menciona: comisión de compañía/correduría, campañas, valores por defecto, franquicias por defecto (las franquicias salen como modalidades, p.26), ni cómo fijar nada como predeterminado.

## 3. Flujo de cotización (pp.18-30)
1. Producción > elegir producto (o entrar desde Cliente > Oportunidad > «+» cotización, que reutiliza riesgo y tomador sin reteclear; pp.17-18).
2. Riesgo (Autos): Vehículo (marca, modelo, combustible, versión, matrícula, 1.ª matriculación, fecha compra, CP, garaje, km anuales, remolque ligero; asterisco rojo = obligatorio; p.21) > Personas (por defecto conductor = tomador = propietario; conductor ocasional opcional; pp.21-22) > Seguro (fecha de efecto y seguro anterior; p.20) > Productos (condiciones por compañía; p.20).
3. Precios (p.24-27): filtros (precio máximo, solo precios confirmados por la compañía, todas las compañías compatibles o elegidas por el usuario, ver/ocultar errores); modalidad (Todos, Terceros, Terceros ampliado, TR franquicia alta/baja/sin franquicia, Otros); orden por precio, compañía, modalidad, rating; por oferta: comparar, preemitir, imprimir, PDF de condiciones generales de la compañía.
4. Preemisión (p.27-28): al pulsar «Preemitir» sobre una compañía, pantalla resumen con «Datos de fases anteriores» + «Datos de pre-emisión» (pasos Vehículo, Personas, Seguro) para rectificar. Los campos extra que pide cada compañía no están listados (solo capturas sin texto).
5. Emisión (p.30): último paso tras validar datos. Glosario p.33: Proyecto = agrupación de cotizaciones de un cliente; Tarificación = llamada de precio para un riesgo; Cotización = sinónimo.
- ¿«Obtener precios» crea presupuesto nuevo cada vez? El manual no lo dice. Sí dice que las oportunidades «pueden contener presupuestos», varias cotizaciones por oportunidad (pp.7, 16-17), y que se buscan por ID o avanzada: producto, estado, tomador (DNI/CIF), fechas (pp.30-32); resultado: Id, fecha, estado, compañía, organización, usuario, tomador, resumen de riesgo.
- Estados de oportunidad: Abierta, Analizando, Negociando, Pendiente de emisión, Cerrada (p.17).

## 4. Organizaciones, usuarios y permisos
- Solo indicios: cada usuario ve **sus propias** oportunidades (pp.5, 15); la búsqueda de presupuestos muestra «Organización» y «Usuario» (p.32, valor visto «Sales Manager»). No hay jerarquía, roles ni relación usuario-compañías descritos. Sesión: menú de usuario arriba a la derecha (p.7).

## 5. Límites, costes, créditos
- Nada. Ni créditos por tarificación ni límites de llamadas. Verificar con Codeoscopic (contrato/tarifa API).

## Cosas que podemos automatizar vs. solo panel
Probablemente automatizable (API, ver `Manual de usuario_API_V2 junio26.docx` en Drive, no leído aquí): crear cliente/oportunidad, tarificar (filtros y compañías), preemitir/emitir, buscar presupuestos por ID/tomador/estado, historial/notas.
Solo panel (según este manual, no hay API descrita): habilitar productos/compañías, claves de mediador, condiciones especiales/FDC/forma de pago por defecto, rating, usuarios/organizaciones, comisiones.
Dudas a resolver antes de diseñar: qué campos extra exige cada compañía en preemisión, si tarificar crea presupuesto cada vez, y si la configuración por compañía es editable por API.
