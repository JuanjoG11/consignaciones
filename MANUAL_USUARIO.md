# 📘 Manual de Usuario - ConsigControl

Bienvenido al sistema de control de consignaciones. Este manual detalla el flujo de trabajo para cada rol dentro de la plataforma.

---

## 🏗️ 1. Conceptos Generales
**ConsigControl** es una aplicación diseñada para centralizar la legalización de consignaciones bancarias, gastos y retenciones.
*   **Auxiliares:** Registran la evidencia desde el campo (móvil).
*   **Cajeras:** Auditan y validan en tiempo real (PC).
*   **Administradores:** Supervisan la operación y descargan respaldos consolidados.

---

## 📱 2. Rol: Auxiliar (Optimizado para Móvil)
El objetivo del auxiliar es registrar el comprobante de forma rápida y ligera.

### Pasos para registrar una consignación:
1.  **Selección de Banco:** Toca el banco correspondiente. Si es **Alpina**, selecciona la cuenta específica (Agrario, Davivienda, etc.).
2.  **Ingreso de Datos:**
    *   Ingresa el **valor exacto** que aparece en el comprobante.
    *   Escribe el **número de comprobante** (referencia).
3.  **Captura de Evidencia:**
    *   Toca el botón de cámara. El sistema **comprimirá automáticamente la imagen** para que no gaste tus datos y sea ultra-ligera (máx. 200KB).
4.  **Envío:** Presiona "Guardar Consignación". Recibirás una notificación de éxito.

### Historial:
En la parte inferior puedes ver tus últimos registros y su estado:
*   🟡 **Pendiente:** Aún no ha sido revisado.
*   🟢 **Validado:** Ya fue aceptado por caja.
*   🔴 **Rechazado:** Debes revisar el motivo y volver a subirlo si es necesario.

---

## 👩‍💼 3. Rol: Cajera (Optimizado para PC)
La cajera utiliza una vista de "Pantalla Dividida" para una validación masiva y rápida.

### Panel de Validación:
1.  **Lista de Pendientes (Izquierda):** Verás todas las consignaciones por revisar.
2.  **Detalle (Derecha):** Al tocar un registro, verás la foto ampliada a la derecha. No necesitas abrir ventanas nuevas.
3.  **Acciones:**
    *   **Botón Verde (Validar):** Aprueba la transacción.
    *   **Botón Rojo (Rechazar):** Abre un cuadro para escribir por qué se rechaza (ej: "Foto borrosa" o "Valor no coincide").
4.  **Filtros Profesionales:** Usa el botón de **Filtros** para buscar por rango de fechas o por un banco específico.

---

## 🛡️ 4. Rol: Administrador (Dashboard y Auditoría)
El administrador tiene visión total de la operación financiera.

### Métricas en Tiempo Real:
*   **KPIs:** Visualiza el total validado, cantidad de pendientes y rechazados del día o periodo seleccionado.
*   **Búsqueda Avanzada:** Puedes buscar por el **Nombre del Auxiliar** para ver qué ha subido una persona específica.

### Respaldo de Seguridad (Backups):
Esta es la función más importante para la contabilidad:
1.  Aplica los filtros de fecha que desees (ej: Todo el mes de Abril).
2.  Presiona **"Descargar Respaldo Completo (ZIP)"**.
3.  El sistema generará un archivo ZIP que contiene:
    *   Un archivo **Excel** con todos los datos.
    *   **Carpetas organizadas por día** con todas las fotos de los comprobantes dentro.
    *   Las fotos tienen nombres claros: `Auxiliar_Banco_Comprobante.jpg`.

---

## ⚙️ 5. Notas Técnicas
*   **Conectividad:** La app funciona con Supabase en tiempo real. Si una cajera valida, el auxiliar lo ve en segundos.
*   **Imágenes:** Todas las imágenes se guardan de forma segura en el Storage de Supabase.
*   **Acceso:** Se recomienda usar Google Chrome para una mejor experiencia en la descarga de respaldos ZIP.

---
*ConsigControl v2.0 - "Eficiencia en cada depósito"*
