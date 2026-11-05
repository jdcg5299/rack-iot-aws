const C = window.CONFIG;
const $ = (id) => document.getElementById(id);

$("tempMax").textContent = C.TEMP_MAX;
$("humRange").textContent = C.HUM_MIN + "–" + C.HUM_MAX;
$("csvBtn").href = `${C.API_URL}/csv?deviceId=${C.DEVICE_ID}`;

let fanOn = false;
let lastTs = 0;

// ---------- Gráfica ----------
const chart = new Chart($("chart"), {
  type: "line",
  data: {
    labels: [],
    datasets: [
      { label: "Temperatura (°C)", data: [], borderColor: "#ff8a5c", backgroundColor: "rgba(255,138,92,.15)",
        tension: .3, pointRadius: 0, fill: true, yAxisID: "yT" },
      { label: "Humedad (%)", data: [], borderColor: "#4da3ff", tension: .3, pointRadius: 0, yAxisID: "yH" },
      { label: "Umbral", data: [], borderColor: "#ff5c6c", borderDash: [6, 6], pointRadius: 0, yAxisID: "yT" }
    ]
  },
  options: {
    responsive: true, maintainAspectRatio: false, animation: false,
    interaction: { mode: "index", intersect: false },
    plugins: { legend: { labels: { color: "#8fa0ba" } } },
    scales: {
      x:  { ticks: { color: "#8fa0ba", maxTicksLimit: 8 }, grid: { color: "#223049" } },
      yT: { position: "left",  title: { display: true, text: "°C", color: "#8fa0ba" },
            ticks: { color: "#8fa0ba" }, grid: { color: "#223049" }, suggestedMin: 15, suggestedMax: 40 },
      yH: { position: "right", title: { display: true, text: "%", color: "#8fa0ba" },
            ticks: { color: "#8fa0ba" }, grid: { drawOnChartArea: false }, min: 0, max: 100 }
    }
  }
});

// ---------- Estado visual ----------
function setConn(ok, text) {
  $("conn").className = "conn " + (ok ? "ok" : "bad");
  $("connText").textContent = text;
}

function levelTemp(t) {
  if (t > C.TEMP_MAX) return "bad";
  if (t > C.TEMP_MAX - 2) return "warn";
  return "ok";
}

function render(items) {
  if (!items.length) { setConn(false, "Sin datos en la tabla"); return; }
  const last = items[items.length - 1];
  lastTs = Number(last.ts);

  $("tempVal").textContent = Number(last.temperature).toFixed(1);
  $("humVal").textContent = Number(last.humidity).toFixed(1);
  $("lastTime").textContent = new Date(lastTs).toLocaleTimeString();

  const lt = levelTemp(last.temperature);
  const hOut = last.humidity < C.HUM_MIN || last.humidity > C.HUM_MAX;
  $("cardTemp").className = "card " + lt;
  $("cardHum").className = "card " + (hOut ? "bad" : "ok");

  const msgs = [];
  if (lt === "bad") msgs.push(`Temperatura alta: ${Number(last.temperature).toFixed(1)} °C supera ${C.TEMP_MAX} °C.`);
  if (hOut) msgs.push(`Humedad fuera de rango: ${Number(last.humidity).toFixed(1)} %.`);
  $("alert").hidden = !msgs.length;
  $("alert").textContent = msgs.join(" ");

  chart.data.labels = items.map(i => new Date(Number(i.ts)).toLocaleTimeString());
  chart.data.datasets[0].data = items.map(i => Number(i.temperature));
  chart.data.datasets[1].data = items.map(i => Number(i.humidity));
  chart.data.datasets[2].data = items.map(() => C.TEMP_MAX);
  chart.update();
}

function tickAge() {
  if (!lastTs) return;
  const s = Math.round((Date.now() - lastTs) / 1000);
  $("lastAge").textContent = `hace ${s} s`;
  if (s > 30) setConn(false, "Sin lecturas recientes (dispositivo desconectado)");
}

// ---------- Datos ----------
async function load() {
  try {
    const r = await fetch(`${C.API_URL}/telemetry?deviceId=${C.DEVICE_ID}&limit=${C.LIMIT}`);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const data = await r.json();
    render(data.items);
    if (data.items.length && (Date.now() - Number(data.items[data.items.length - 1].ts)) / 1000 <= 30) {
      setConn(true, "Recibiendo datos");
    }
  } catch (e) {
    setConn(false, "Error de conexión con la API");
    console.error(e);
  }
}

// ---------- Actuador ----------
async function sendFan(next) {
  const btn = $("fanBtn");
  btn.disabled = true;
  $("msg").textContent = "Enviando comando…";
  try {
    const r = await fetch(`${C.API_URL}/command?deviceId=${C.DEVICE_ID}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state: next ? "ON" : "OFF" })
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    fanOn = next;
    $("fanState").textContent = fanOn ? "ENCENDIDO" : "APAGADO";
    btn.textContent = fanOn ? "Apagar ventilador" : "Encender ventilador";
    btn.classList.toggle("on", fanOn);
    $("msg").textContent = "Comando enviado " + new Date().toLocaleTimeString() + ".";
  } catch (e) {
    $("msg").textContent = "No se pudo enviar el comando. Revisa la API y el CORS.";
    console.error(e);
  } finally {
    btn.disabled = false;
  }
}
$("fanBtn").addEventListener("click", () => sendFan(!fanOn));

load();
setInterval(load, C.POLL_MS);
setInterval(tickAge, 1000);
