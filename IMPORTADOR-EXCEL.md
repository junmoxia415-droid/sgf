# 📥 SGF - Importador Masivo desde Excel

## 🎯 **Descripción**

Este módulo permite importar datos masivamente desde archivos Excel (.xlsx) a las tablas del sistema SGF. 

**Características principales:**
- ✅ Detección automática de la tabla destino (SGF_FACTURAS, SGF_SERVICIOS, etc.)
- ✅ Mapeo inteligente de columnas
- ✅ Adición automática de columnas faltantes (ALTER TABLE)
- ✅ Validación de datos antes de la importación
- ✅ Soporte para SQLite, Oracle y SQL Server
- ✅ Transacciones para garantizar integridad de datos
- ✅ Reportes detallados de importación

---

## 📁 **Estructura de Archivos**

```
SGF/server/src/
├── utils/
│   ├── excel-importer.ts      # Motor de importación principal
│   └── excel-mapper.ts        # Mapeo inteligente de columnas
├── routes/
│   └── import.routes.ts       # Endpoints API para importación
├── scripts/
│   └── test-importer.ts       # Script de prueba
```

---

## 🚀 **Cómo Usar**

### **Método 1: Usando la API REST**

#### **1. Analizar archivo Excel (sin importar)**

```bash
curl -X POST http://localhost:3000/api/import/analyze \
  -H "Authorization: Bearer TU_TOKEN" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @facturas.xlsx
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Análisis completado. Se encontraron 1 hojas.",
  "data": {
    "sheets": [{
      "name": "Hoja1",
      "headers": ["NO_FACTURA", "CLIENTE", "TOTAL"],
      "rowCount": 100,
      "columnCount": 3
    }],
    "suggestedTable": "SGF_FACTURAS",
    "mappingSuggestions": {
      "Hoja1": {
        "suggestedTable": "SGF_FACTURAS",
        "mapping": {
          "NO_FACTURA": "NO_FACTURA",
          "CLIENTE": "CLIENTE",
          "TOTAL": "TOTAL"
        }
      }
    }
  }
}
```

#### **2. Importar archivo Excel**

```bash
curl -X POST http://localhost:3000/api/import/excel \
  -H "Authorization: Bearer TU_TOKEN" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @facturas.xlsx
```

**Parámetros opcionales (query string):**
- `?table=SGF_FACTURAS` - Tabla destino (auto-detectada si no se especifica)
- `?sheetIndex=0` - Índice de la hoja a importar (default: 0)
- `?headerRow=0` - Fila de encabezados (default: 0)
- `?dataStartRow=1` - Fila donde empiezan los datos (default: 1)
- `?batchSize=100` - Tamaño de lote (default: 100)
- `?truncate=true` - Vaciar tabla antes de importar (default: false)

**Respuesta exitosa:**
```json
{
  "success": true,
  "message": "Importación exitosa: 100 filas importadas a SGF_FACTURAS.",
  "data": {
    "totalRows": 100,
    "importedRows": 100,
    "failedRows": 0,
    "newColumnsAdded": [],
    "table": "SGF_FACTURAS",
    "mapping": {
      "NO_FACTURA": "NO_FACTURA",
      "CLIENTE": "CLIENTE",
      "TOTAL": "TOTAL"
    },
    "errors": [],
    "warnings": [],
    "importId": "uuid",
    "durationMs": 150
  }
}
```

#### **3. Obtener tablas disponibles**

```bash
curl -X GET http://localhost:3000/api/import/tables \
  -H "Authorization: Bearer TU_TOKEN"
```

#### **4. Obtener estado de importaciones recientes**

```bash
curl -X GET http://localhost:3000/api/import/status \
  -H "Authorization: Bearer TU_TOKEN"
```

#### **5. Obtener sugerencias de mapeo**

```bash
curl -X POST http://localhost:3000/api/import/mapping-suggestions \
  -H "Authorization: Bearer TU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "columns": ["NRO_FACTURA", "NOMBRE_CLIENTE", "MONTO"],
    "table": "SGF_FACTURAS"
  }'
```

---

### **Método 2: Usando el Script de Prueba**

```bash
cd SGF/server
npm run tsx src/scripts/test-importer.ts
```

---

### **Método 3: Usando el Módulo Directamente**

```typescript
import { importExcelToSGF, analyzeExcelFile } from './utils/excel-importer.js';
import { readFileSync } from 'node:fs';

// Leer archivo
const fileBuffer = readFileSync('facturas.xlsx');

// Analizar
const analysis = await analyzeExcelFile(fileBuffer);
console.log('Tabla sugerida:', analysis.suggestedTable);

// Importar
const result = await importExcelToSGF(fileBuffer, {
  table: 'SGF_FACTURAS', // Opcional: si no se especifica, se detecta automáticamente
  userId: 'user-uuid',
  truncateBeforeImport: false,
});

console.log('Filas importadas:', result.data.importedRows);
```

---

## 📊 **Tablas Soportadas**

| Tabla | Descripción | Columnas Principales |
|-------|-------------|---------------------|
| `SGF_FACTURAS` | Facturas de clientes | ID, NO_FACTURA, CLIENTE, FECHA_EMISION, TOTAL, ESTADO |
| `SGF_SERVICIOS` | Servicios de facturas | ID, FACTURA_ID, NUMERO_SERVICIO, CUOTA, CONSUMO, IMPORTE |
| `SGF_USUARIOS` | Usuarios del sistema | ID, USERNAME, NAME, ROLE, PASSWORD_HASH, ACTIVE |
| `SGF_LOGS` | Registros de auditoría | ID, USER_ID, ACCION, ENTIDAD, LEVEL, DETALLES |
| `SGF_SESIONES` | Sesiones de usuarios | ID, USER_ID, SESSION_TOKEN, MACHINE_ID, IP_ADDRESS |

---

## 🎯 **Mapeo de Columnas**

El importador intenta mapear automáticamente las columnas del Excel a las tablas SGF usando:

1. **Coincidencia exacta** (ej: "NO_FACTURA" → "NO_FACTURA")
2. **Patrones conocidos** (ej: "Nro Factura" → "NO_FACTURA")
3. **Similitud de nombres** (ej: "NRO_FACT" → "NO_FACTURA")
4. **Mapeo personalizado** (se puede especificar manualmente)

### **Columnas Comunes y sus Alias**

| Columna SGF | Alias Reconocidos |
|-------------|-------------------|
| NO_FACTURA | no_factura, nro_factura, factura, invoice |
| CLIENTE | cliente, nombre_cliente, razon_social, customer |
| FECHA_EMISION | fecha_emision, fecha_factura, emission_date |
| TOTAL | total, total_factura, amount |
| NUMERO_SERVICIO | numero_servicio, no_servicio, servicio, phone_number |
| USERNAME | username, usuario, login, user |
| NAME | name, nombre, nombre_completo, full_name |

---

## ⚙️ **Columnas Adicionales**

Si tu archivo Excel tiene columnas que **no existen en las tablas SGF**, el importador:

1. **Detectará automáticamente** que la columna no existe
2. **Inferirá el tipo de dato** (VARCHAR, INTEGER, DECIMAL, TIMESTAMP)
3. **Agregará la columna** con `ALTER TABLE`
4. **Importará los datos** en la nueva columna

**Ejemplo:**
```
Excel tiene: NO_FACTURA, CLIENTE, NUEVA_COLUMNA_X

El sistema:
1. Detecta que NUEVA_COLUMNA_X no existe en SGF_FACTURAS
2. Infiere el tipo (ej: VARCHAR(255))
3. Ejecuta: ALTER TABLE SGF_FACTURAS ADD NUEVA_COLUMNA_X VARCHAR2(255)
4. Importa todos los datos incluyendo NUEVA_COLUMNA_X
```

---

## 📝 **Formato de Archivo Excel**

### **Requisitos:**
- Formato: **XLSX** (Excel 2007+)
- Tamaño máximo: **10MB** (configurable)
- Primera fila: **Encabezados de columnas**
- Datos: **A partir de la segunda fila**

### **Ejemplo de Estructura:**

| NO_FACTURA | CLIENTE | FECHA_EMISION | FECHA_VENCIMIENTO | TOTAL | ESTADO |
|------------|---------|---------------|-------------------|-------|--------|
| FACT-001 | Cliente A | 2024-01-01 | 2024-02-01 | 100.50 | procesado |
| FACT-002 | Cliente B | 2024-01-02 | 2024-02-02 | 200.75 | pendiente |

### **Para SGF_SERVICIOS:**

| FACTURA_ID | NUMERO_SERVICIO | CUOTA | CONSUMO | COMISION | IMPUESTO | IMPORTE |
|------------|------------------|-------|---------|----------|----------|---------|
| fact-001 | 12345678 | 50.00 | 100.00 | 5.00 | 10.00 | 165.00 |

---

## 🔧 **Configuración**

### **Variables de Entorno**

No se requieren variables de entorno específicas para el importador. 
El sistema usa la misma configuración de base de datos que el resto de SGF.

### **Límites**

- `MAX_FILE_SIZE`: 10MB (modificable en `import.routes.ts`)
- `batchSize`: 100 filas por lote (modificable en opciones)

---

## 🛠️ **Personalización**

### **Agregar Nuevas Tablas**

Para soportar nuevas tablas, edita `excel-importer.ts` y agrega la definición en `TABLE_SCHEMAS`:

```typescript
const TABLE_SCHEMAS: Record<SGFTable, {...}> = {
  ...existingTables,
  MI_NUEVA_TABLA: {
    description: 'Descripción de la tabla',
    primaryKey: 'ID',
    columns: {
      ID: { type: 'VARCHAR', maxLength: 36, nullable: false },
      NOMBRE: { type: 'VARCHAR', maxLength: 100, nullable: false },
      // ... más columnas
    },
  },
};
```

### **Agregar Nuevos Alias de Columnas**

Edita `excel-mapper.ts` y agrega nuevos patrones en `COLUMN_PATTERNS`:

```typescript
const COLUMN_PATTERNS: Record<string, RegExp[]> = {
  ...existingPatterns,
  MI_NUEVA_COLUMNA: [
    /mi[._\s]?nueva[._\s]?columna/i,
    /nuevo[._\s]?campo/i,
  ],
};
```

---

## 📞 **Solución de Problemas**

### **Problema: "No se pudo detectar la tabla destino"**

**Solución:** Especifica la tabla manualmente usando el parámetro `?table=SGF_FACTURAS`

### **Problema: "Columna obligatoria X está vacía"**

**Solución:** 
1. Asegúrate de que el Excel tenga datos en esa columna
2. O usa `truncate=false` y actualiza manualmente los datos

### **Problema: "Error de tipo de dato en columna X"**

**Solución:** Verifica que los datos en esa columna sean del tipo correcto (números para DECIMAL, fechas para TIMESTAMP, etc.)

### **Problema: "Archivo demasiado grande"**

**Solución:** 
1. Divide el archivo en partes más pequeñas
2. O aumenta `MAX_FILE_SIZE` en `import.routes.ts`

---

## 📚 **Ejemplo Práctico**

### **Caso: Importar facturas desde Excel**

1. **Prepara tu archivo Excel** con columnas como:
   - NO_FACTURA
   - CLIENTE
   - FECHA_EMISION
   - TOTAL
   - ESTADO

2. **Sube el archivo:**
   ```bash
   curl -X POST http://localhost:3000/api/import/excel \
     -H "Authorization: Bearer TU_TOKEN" \
     -H "Content-Type: application/octet-stream" \
     --data-binary @facturas_enero.xlsx
   ```

3. **Verifica el resultado:**
   ```bash
   curl -X GET http://localhost:3000/api/facturas \
     -H "Authorization: Bearer TU_TOKEN"
   ```

4. **Si necesitas agregar más columnas:**
   - El importador las agregará automáticamente si no existen

---

## 🎉 **¡Listo!**

El importador está completamente integrado con tu sistema SGF. 
Puedes empezar a importar datos desde Excel de inmediato.

**¿Necesitas ayuda?** Revisa los logs del servidor para más detalles sobre cualquier error.
