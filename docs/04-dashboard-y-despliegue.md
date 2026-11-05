# 04 — Dashboard y despliegue en S3

## Requisitos del dashboard (de la actividad)
1. Mostrar temperatura y humedad (valor actual + gráfica de las últimas lecturas).
2. Controlar un actuador remoto (botón ON/OFF → `POST /command`).
3. Descargar los datos en CSV (enlace a `GET /csv`).
4. Diseño claro y estético: tarjetas con valores, color de alerta si temperatura > 27 °C, modo oscuro tipo "centro de datos".

## Diseño propuesto (una sola página)
- Cabecera: "Rack 01 — Monitoreo ambiental" + indicador de conexión (última lectura hace X s).
- Dos tarjetas grandes: 🌡️ temperatura y 💧 humedad (verde/ámbar/rojo según umbral).
- Gráfica de línea (Chart.js por CDN) con 60 lecturas, refresco cada 5 s con `fetch`.
- Panel de control: botón "Ventilador" (ON/OFF) y botón "Descargar CSV".
- Configuración: archivo `config.js` con `API_URL` (así el HTML no cambia entre entornos).

Archivos:
```
dashboard/
├── index.html
├── style.css
├── app.js
└── config.js        # const API_URL = "https://xxxx.execute-api.us-east-1.amazonaws.com";
```

## Paso 9 — Bucket S3 con hosting estático
*S3 puede servir archivos por HTTP; hay que permitir lectura pública solo de este bucket.*

1. **S3 → Create bucket** → nombre único global: `rack-iot-dashboard-<tus-iniciales>-<numero>` → misma región.
2. **Block Public Access:** desmarca *Block all public access* y confirma el aviso. (*Por qué:* sin esto, la policy pública es rechazada.)
3. Create bucket → pestaña **Properties → Static website hosting → Enable** → Index document: `index.html` → Save.
4. Pestaña **Permissions → Bucket policy** (reemplaza el nombre):
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PublicRead",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::NOMBRE-DEL-BUCKET/*"
  }]
}
```
5. **Objects → Upload** → sube el contenido de `dashboard/`.
6. Properties → Static website hosting → copia el **Bucket website endpoint** (`http://...s3-website-<REGION>.amazonaws.com`).

**Verificación:** abre la URL en el navegador: se ve el dashboard, la gráfica carga datos, el CSV baja y el botón enciende el LED/comando.

> Nota: la URL es HTTP (no HTTPS) porque es endpoint de website. El API es HTTPS; eso funciona (HTTP → HTTPS permitido). Si algún día pones el sitio en HTTPS, el API ya está listo.

## Si el lab no deja quitar el Block Public Access
Alternativa: servir con **CloudFront** y OAC (más pasos). Dilo y lo armamos.
