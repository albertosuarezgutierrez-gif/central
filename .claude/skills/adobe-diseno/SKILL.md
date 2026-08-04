---
name: adobe-diseno
description: >
  Usar cuando haya que crear o mejorar activos visuales: logos, banners, iconos, mockups de UI,
  imágenes para portales, material de marca corporativa, presentaciones visuales, o cualquier
  petición de diseño gráfico. Activa el MCP de Adobe Creative Cloud para generar y procesar imágenes
  con Firefly, vectorizar, ajustar, recortar, quitar fondo y exportar. Se invoca ANTES de producir
  cualquier activo visual nuevo.
---

# Adobe Diseño — guía de uso del MCP Adobe CC

> Usa las herramientas `mcp__Adobe_for_creativity__*` para todas las tareas de diseño visual.
> SIEMPRE llama primero a `mcp__Adobe_for_creativity__adobe_mandatory_init` antes de cualquier otra herramienta Adobe.

## Cuándo usar esta skill

- Logo nuevo o actualizado para una empresa/producto
- Banner o cabecera para portal (empleado, cliente, app)
- Imagen de marca corporativa (colores, iconos, identidad visual)
- Mockup visual de una pantalla o flujo nuevo
- Ajuste de imagen existente (fondo, recorte, tono, vectorización)
- Material para presentaciones o documentos de cliente
- Cualquier petición del tipo "genera", "diseña", "crea una imagen de..."

## Flujo estándar

1. **Init obligatorio**: `adobe_mandatory_init` (siempre, sin excepción)
2. **Genera con Firefly** si hay que crear desde cero: usa `image_generate` o las herramientas de edición según el caso
3. **Vectoriza** logos/iconos con `image_vectorize` para que queden en SVG escalable
4. **Quita fondo** con `image_remove_background` si el activo irá sobre fondo de marca
5. **Ajusta** brillo/contraste/color si hace falta antes de entregar
6. **Sube al storage** (`rrhh-documentos` o bucket correspondiente) con `subirObjeto()` y guarda el path en BD

## Herramientas clave

| Tarea | Herramienta |
|---|---|
| Generar imagen con IA | `animate_design` / Firefly vía `image_fill_area`, `image_generative_expand` |
| Quitar fondo | `image_remove_background` |
| Vectorizar logo/icono | `image_vectorize` |
| Ajustar exposición/color | `image_adjust_exposure`, `image_adjust_hsl`, `image_adjust_color_temperature` |
| Recortar/redimensionar | `image_crop_and_resize` |
| Buscar plantillas Express | `search_design` |
| Exportar a Adobe Express | `export_html_to_express` (después de `html_export_readiness_skill`) |
| Subir asset a Adobe CC | `asset_add_file` (flujo: `asset_initialize_file_upload` → `asset_add_file_submit` → `asset_finalize_file_upload`) |

## Logos de empresa en iarrhh

El path de almacenamiento es `branding/<empresa_id>/logo-<ts>.<ext>` en el bucket `rrhh-documentos`.
Tras subir al storage, actualizar `logo_path` con `actualizarBranding()` de `lib/empresa.ts`.

## Notas

- El MCP requiere autenticación Adobe CC activa en la sesión — si falla con 401, informar al usuario.
- Preferir SVG para logos (escalable, sin pérdida); WEBP/PNG para imágenes rasterizadas.
- Respetar colores corporativos de la empresa (`color_primario` en hex desde `rrhh.empresas`).
