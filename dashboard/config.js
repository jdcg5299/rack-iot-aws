// Configuración del dashboard. Es lo único que cambia entre entornos.
window.CONFIG = {
  // Reemplaza este valor por el Invoke URL de tu API Gateway antes de desplegar.
  API_URL: "https://TU-API-ID.execute-api.us-east-1.amazonaws.com",
  DEVICE_ID: "rack01",
  POLL_MS: 5000,      // cada cuánto se consulta la API
  LIMIT: 60,          // cuántas lecturas se grafican
  TEMP_MAX: 27,       // °C: por encima se activa la alerta
  HUM_MIN: 20,        // % humedad mínima aceptable
  HUM_MAX: 80         // % humedad máxima aceptable
};
