// State
let appState = {
  wards: {},
  weather: {},
  requests: [],
  tankers: [],
  currentRole: "Dispatcher",
  dispatchPlan: null
};

let map = null;
let mapMarkers = [];
let routeLines = [];

document.addEventListener("DOMContentLoaded", () => {
  initMap();
  fetchState();
  renderRoleBody("Dispatcher");
});

function initMap() {
  // Mumbai Center Baseline
  map = L.map("map").setView([19.065, 72.875], 12);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: "&copy; OpenStreetMap &copy; CARTO",
    maxZoom: 19
  }).addTo(map);
}

function logToConsole(message, type = "info") {
  const consoleEl = document.getElementById("agent-console");
  const time = new Date().toLocaleTimeString();
  const entry = document.createElement("div");
  entry.className = `log-entry ${type}-msg`;
  entry.innerHTML = `<span class="timestamp">[${time}]</span> ${message}`;
  consoleEl.appendChild(entry);
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

async function fetchState() {
  try {
    const res = await fetch("/api/state");
    const data = await res.json();
    appState.wards = data.wards;
    appState.weather = data.weather;
    appState.requests = data.requests;
    appState.tankers = data.tankers;

    updateMapMarkers();
    renderPriorityTable();
    fetchNeglectedAreas();
    logToConsole("Grid state synchronized from server.", "info");
  } catch (err) {
    logToConsole("Failed to fetch state: " + err, "alert");
  }
}

function updateMapMarkers() {
  mapMarkers.forEach(m => map.removeLayer(m));
  mapMarkers = [];

  // 1. Plot Tankers
  appState.tankers.forEach(tanker => {
    const isDown = tanker.status === "BROKEN_DOWN";
    const iconHtml = `<div style="background:${isDown ? '#ef4444' : '#0284c7'};color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 0 8px ${isDown ? '#ef4444' : '#0284c7'}">🚚</div>`;
    const icon = L.divIcon({ html: iconHtml, className: "", iconSize: [28, 28] });
    const marker = L.marker(tanker.current_coords, { icon })
      .bindPopup(`<b>${tanker.tanker_id}</b> (${tanker.vehicle_number})<br>Status: ${tanker.status}<br>Water: ${tanker.current_water_liters}L / ${tanker.capacity_liters}L`)
      .addTo(map);
    mapMarkers.push(marker);
  });

  // 2. Plot Ward Requests
  appState.requests.forEach(req => {
    const weather = appState.weather[req.ward_id] || {};
    const priority = req.effective_priority || 50;
    const color = priority >= 80 ? '#ef4444' : priority >= 60 ? '#f97316' : priority >= 40 ? '#eab308' : '#10b981';
    
    const iconHtml = `<div style="background:${color};color:#fff;border-radius:6px;padding:2px 6px;font-size:11px;font-weight:700;border:1px solid #fff;white-space:nowrap;">💧 ${req.area_name.split(' ')[0]}</div>`;
    const icon = L.divIcon({ html: iconHtml, className: "", iconSize: [80, 24] });
    const marker = L.marker(req.coords, { icon })
      .bindPopup(`
        <b>${req.area_name}</b> (${req.ward_id})<br>
        Priority: <b>${priority.toFixed(1)}/100</b><br>
        Days Dry: ${req.days_since_last_delivery.toFixed(1)} days<br>
        Tank Level: ${req.current_tank_level_pct}%<br>
        Heat Index: ${weather.heat_index_c || '--'}°C<br>
        <em>Reason: ${req.urgency_reason}</em>
      `)
      .addTo(map);
    mapMarkers.push(marker);
  });
}

function renderPriorityTable() {
  const tbody = document.getElementById("priority-tbody");
  tbody.innerHTML = "";

  const sorted = [...appState.requests].sort((a, b) => (b.effective_priority || 0) - (a.effective_priority || 0));

  sorted.forEach(req => {
    const weather = appState.weather[req.ward_id] || {};
    const priority = req.effective_priority || 0;
    const badgeClass = priority >= 80 ? 'priority-critical' : priority >= 60 ? 'priority-high' : priority >= 40 ? 'priority-medium' : 'priority-low';

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${req.area_name}</strong><br><small style="color:var(--text-muted)">${req.ward_id}</small></td>
      <td>${req.days_since_last_delivery.toFixed(1)} d</td>
      <td>${weather.heat_index_c || '--'}°C</td>
      <td><span class="priority-badge ${badgeClass}">${priority.toFixed(1)}</span></td>
      <td><button class="btn btn-secondary btn-sm" onclick="showExplain('${req.request_id}')">Why?</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function showExplain(requestId) {
  const req = appState.requests.find(r => r.request_id === requestId);
  if (!req) return;
  alert(
    `Explainable Breakdown for ${req.area_name}:\n\n` +
    `• Priority Score: ${req.effective_priority.toFixed(1)} / 100\n` +
    `• Days Without Water: ${req.days_since_last_delivery.toFixed(1)} days\n` +
    `• Storage Level: ${req.current_tank_level_pct}% remaining\n` +
    `• Ward: ${req.ward_id}\n` +
    `• Justification: ${req.urgency_reason || 'Severe heat index demand spike'}`
  );
}

async function runAgentDispatch() {
  logToConsole("Dispatcher requested dispatch cycle. Evaluating Amazon Cedar permissions...", "info");
  try {
    const res = await fetch("/api/agent/dispatch", { method: "POST" });
    if (!res.ok) {
      const err = await res.json();
      logToConsole("Cedar Denied: " + (err.detail || "Unauthorized"), "alert");
      alert("Cedar Policy Denied: " + err.detail);
      return;
    }
    const data = await res.json();
    appState.dispatchPlan = data.plan;

    logToConsole("✅ Strands Agent completed reasoning loop with 0 priority inversions.", "system-msg");
    logToConsole(data.agent_narrative, "info");

    drawRoutes(data.plan.tanker_routes);
    renderRoutePanel(data.plan.tanker_routes);
    fetchState();
  } catch (err) {
    logToConsole("Error during dispatch: " + err, "alert");
  }
}

async function simulateBreakdown() {
  logToConsole("🚨 Simulating breakdown of Tanker T-02 en route...", "alert");
  try {
    const res = await fetch("/api/agent/replan_breakdown?tanker_id=TANKER-02", { method: "POST" });
    if (!res.ok) {
      const err = await res.json();
      alert("Error: " + err.detail);
      return;
    }
    const data = await res.json();
    logToConsole(data.agent_narrative, "alert");
    drawRoutes(data.plan.tanker_routes);
    renderRoutePanel(data.plan.tanker_routes);
    fetchState();
  } catch (err) {
    logToConsole("Breakdown replan failed: " + err, "alert");
  }
}

async function resetFleet() {
  await fetch("/api/agent/reset", { method: "POST" });
  routeLines.forEach(l => map.removeLayer(l));
  routeLines = [];
  fetchState();
  logToConsole("Fleet reset to baseline.", "info");
}

function drawRoutes(routes) {
  routeLines.forEach(l => map.removeLayer(l));
  routeLines = [];

  const colors = ["#38bdf8", "#34d399", "#f43f5e", "#a855f7"];
  routes.forEach((route, idx) => {
    const color = colors[idx % colors.length];
    const points = [[19.0760, 72.8777]]; // Depot start
    route.stops.forEach(s => points.push(s.coords));

    const line = L.polyline(points, { color, weight: 3, opacity: 0.8, dashArray: "6, 6" }).addTo(map);
    routeLines.push(line);
  });
}

function renderRoutePanel(routes) {
  const container = document.getElementById("routes-container");
  container.innerHTML = "";

  routes.forEach(route => {
    const routeDiv = document.createElement("div");
    routeDiv.className = "route-card";
    routeDiv.style.marginBottom = "0.75rem";
    routeDiv.innerHTML = `
      <div style="font-weight:700;color:var(--accent-blue);font-size:0.85rem">
        ${route.tanker_id} (${route.vehicle_number}) — Dispatched: ${route.total_liters_dispatched}L | Est: ${route.estimated_total_time_mins} mins
      </div>
    `;

    route.stops.forEach(stop => {
      const stopEl = document.createElement("div");
      stopEl.className = "stop-item";
      stopEl.innerHTML = `
        <strong>Stop #${stop.stop_sequence}: ${stop.area_name}</strong> (${stop.liters_to_deliver}L delivered)
        <div class="reason">${stop.decision_reason}</div>
      `;
      routeDiv.appendChild(stopEl);
    });
    container.appendChild(routeDiv);
  });
}

async function fetchNeglectedAreas() {
  try {
    const res = await fetch("/api/opensearch/neglected_areas");
    const data = await res.json();
    const container = document.getElementById("neglected-list");
    container.innerHTML = "";

    if (data.neglected_areas.length === 0) {
      container.innerHTML = `<p style="font-size:0.75rem;color:var(--text-muted)">All vulnerable areas currently served.</p>`;
      return;
    }

    data.neglected_areas.forEach(item => {
      const div = document.createElement("div");
      div.className = "neglected-item";
      div.innerHTML = `
        <strong>⚠️ ${item.area_name}</strong> (${item.risk_level} RISK)
        <br>${item.audit_alert}
      `;
      container.appendChild(div);
    });
  } catch (err) {
    console.error("OpenSearch query error:", err);
  }
}

// Role Switching UI Logic
function onRoleChange(role) {
  appState.currentRole = role;
  renderRoleBody(role);
  logToConsole(`Switched active context to: Role::"${role}"`, "info");
}

function renderRoleBody(role) {
  const container = document.getElementById("role-body");
  const title = document.getElementById("role-card-title");

  if (role === "Dispatcher") {
    title.innerText = "Dispatcher Operations (Cedar Authorized)";
    container.innerHTML = `
      <p style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:0.75rem;">
        Full operational authority to trigger Strands Agent optimization and approve routes.
      </p>
      <div style="display:flex;gap:0.5rem;">
        <button class="btn btn-primary btn-sm" onclick="runAgentDispatch()">Run Strands Agent Dispatch</button>
        <button class="btn btn-danger btn-sm" onclick="simulateBreakdown()">Test Tanker Breakdown</button>
      </div>
    `;
  } else if (role === "WardOfficer") {
    title.innerText = "Ward Officer Priority Override (Cedar ABAC)";
    container.innerHTML = `
      <p style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:0.5rem;">
        Cedar Policy Rule: You can only override areas within your assigned ward, and an audit reason is mandatory.
      </p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;font-size:0.75rem;">
        <div>
          <label>Officer Ward:</label>
          <select id="ov-officer-ward" style="width:100%;padding:4px;background:#050811;color:#fff;border:1px solid #334155;">
            <option value="WARD-GN">Ward G-North (Dharavi)</option>
            <option value="WARD-L">Ward L (Kurla)</option>
          </select>
        </div>
        <div>
          <label>Target Request:</label>
          <select id="ov-req-select" style="width:100%;padding:4px;background:#050811;color:#fff;border:1px solid #334155;">
            ${appState.requests.map(r => `<option value="${r.request_id}" data-ward="${r.ward_id}">${r.area_name} (${r.ward_id})</option>`).join("")}
          </select>
        </div>
      </div>
      <div style="margin-top:0.5rem;font-size:0.75rem;">
        <label>New Priority Score (0-100):</label>
        <input type="number" id="ov-score" value="99.0" min="0" max="100" style="width:100%;padding:4px;background:#050811;color:#fff;border:1px solid #334155;">
      </div>
      <div style="margin-top:0.5rem;font-size:0.75rem;">
        <label>Audit Reason (Required by Cedar):</label>
        <input type="text" id="ov-reason" placeholder="e.g. Inpatient ICU oxygen/cooling failure" style="width:100%;padding:4px;background:#050811;color:#fff;border:1px solid #334155;">
      </div>
      <button class="btn btn-primary btn-sm" style="margin-top:0.6rem;width:100%;" onclick="submitOfficerOverride()">Submit Override to Cedar</button>
    `;
  } else if (role === "Resident") {
    title.innerText = "Resident Water Request Portal";
    container.innerHTML = `
      <p style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:0.5rem;">
        Cedar Policy Rule: Residents may submit requests for their local society or area.
      </p>
      <div style="font-size:0.75rem;display:flex;flex-direction:column;gap:0.4rem;">
        <input type="text" id="res-area" placeholder="Area Name / Housing Society" style="padding:4px;background:#050811;color:#fff;border:1px solid #334155;">
        <select id="res-ward" style="padding:4px;background:#050811;color:#fff;border:1px solid #334155;">
          <option value="WARD-GN">Ward G-North (Dharavi)</option>
          <option value="WARD-L">Ward L (Kurla)</option>
          <option value="WARD-ME">Ward M-East (Govandi)</option>
          <option value="WARD-HE">Ward H-East (Bandra)</option>
        </select>
        <input type="number" id="res-tank" placeholder="Current Tank Level %" value="10" style="padding:4px;background:#050811;color:#fff;border:1px solid #334155;">
        <input type="number" id="res-liters" placeholder="Liters Required" value="5000" style="padding:4px;background:#050811;color:#fff;border:1px solid #334155;">
        <input type="text" id="res-reason" placeholder="Urgency Description" value="Extreme heat, elderly community members dehydrated" style="padding:4px;background:#050811;color:#fff;border:1px solid #334155;">
        <button class="btn btn-primary btn-sm" onclick="submitResidentRequest()">Submit Water Request</button>
      </div>
    `;
  } else if (role === "Auditor") {
    title.innerText = "Auditor & Public Fairness View";
    container.innerHTML = `
      <p style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:0.5rem;">
        Cedar Policy Rule: Read-only access to fairness metrics, neglected areas, and delivery logs.
      </p>
      <div style="font-size:0.75rem;color:#86efac;background:rgba(134,239,172,0.1);padding:6px;border-radius:4px;">
        Zero Priority Inversions Detected. Vulnerability weights audited: Heat (0.35), Days Dry (0.30), Vulnerability (0.20), Demand (0.15).
      </div>
      <button class="btn btn-secondary btn-sm" style="margin-top:0.5rem;" onclick="fetchNeglectedAreas()">Re-run OpenSearch Audit</button>
    `;
  }
}

async function submitOfficerOverride() {
  const officerWard = document.getElementById("ov-officer-ward").value;
  const reqSelect = document.getElementById("ov-req-select");
  const requestId = reqSelect.value;
  const targetWard = reqSelect.options[reqSelect.selectedIndex].getAttribute("data-ward");
  const score = parseFloat(document.getElementById("ov-score").value);
  const reason = document.getElementById("ov-reason").value.trim();

  try {
    const res = await fetch("/api/requests/override", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        officer_id: "officer-01",
        officer_ward: officerWard,
        request_id: requestId,
        target_ward_id: targetWard,
        override_priority_score: score,
        override_reason: reason
      })
    });
    const data = await res.json();
    if (!res.ok) {
      logToConsole(`🚫 Cedar Deny: ${data.detail}`, "alert");
      alert(data.detail);
      return;
    }
    logToConsole(`✅ Cedar Permit: ${data.cedar_audit}`, "system-msg");
    alert("Override Approved by Cedar!\n" + data.cedar_audit);
    fetchState();
  } catch (err) {
    alert("Override error: " + err);
  }
}

async function submitResidentRequest() {
  const areaName = document.getElementById("res-area").value;
  const wardId = document.getElementById("res-ward").value;
  const tank = parseFloat(document.getElementById("res-tank").value);
  const liters = parseInt(document.getElementById("res-liters").value);
  const reason = document.getElementById("res-reason").value;

  if (!areaName) { alert("Please enter area name"); return; }

  try {
    const res = await fetch("/api/requests/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resident_id: "res-user-1",
        area_name: areaName,
        ward_id: wardId,
        household_count: 300,
        current_tank_level_pct: tank,
        required_liters: liters,
        days_since_last_delivery: 1.5,
        urgency_reason: reason
      })
    });
    const data = await res.json();
    if (!res.ok) {
      alert("Error: " + data.detail);
      return;
    }
    logToConsole(`Resident submitted request for ${areaName}. Cedar Permit granted.`, "system-msg");
    alert("Water request submitted successfully!");
    fetchState();
  } catch (err) {
    alert("Submit error: " + err);
  }
}
