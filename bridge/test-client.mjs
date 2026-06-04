// Quick bridge smoke test: connect to the WS bridge, print the first few frames.
const url = process.argv[2] || "ws://127.0.0.1:5301";
const ws = new WebSocket(url);
let n = 0;
const timer = setTimeout(() => { console.error("TIMEOUT: no frames received"); process.exit(2); }, 8000);
ws.onopen = () => console.log("connected to", url);
ws.onerror = (e) => { console.error("WS error:", e.message || e); process.exit(1); };
ws.onmessage = (ev) => {
  n++;
  const o = JSON.parse(ev.data);
  if (n === 1) console.log("first frame keys:", Object.keys(o).join(", "));
  console.log(`#${n} raceOn=${o.raceOn} rpm=${o.rpm.cur}/${o.rpm.max} gear=${o.gear} speed=${o.speed}m/s tireFL=${o.tires.fl.temp} drivetrain=${o.car.drivetrain}`);
  if (n >= 3) { clearTimeout(timer); ws.close(); process.exit(0); }
};
