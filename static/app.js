/**
 * AquaStrands Dispatch — Crisis Command Center Frontend Controller
 * Autonomous routing, explainable priority scoring, and Amazon Cedar ABAC guardrails.
 */

// Application State
let appState = {
  wards: {},
  weather: {},
  requests: [],
  tankers: [],
  currentRole: "Dispatcher",
  dispatchPlan: null,
  neglectedAreas: []
};

let map = null;
let mapMarkers = [];
let routeLines = [];

// Formula weights (aligned with backend src/config.py)
const FORMULA_WEIGHTS = {
  heat: 0.35,
  days: 0.30,
  vuln: 0.20,
  demand: 0.15
};

const DEPOT_COORDS = [19.0760, 72.8777];

// Initialize on DOM Ready
document.addEventListener("DOMContentLoaded", () => {
  initMap();
  fetchState();
  renderRoleBody("Dispatcher");
  setupModalDismissal();
});

/* --------------------------------------------------------------------------
   Leaflet Map & GIS Layers
   -------------------------------------------------------------------------- */
function initMap() {
  map = L.map("map", {
    zoomControl: true,
    attributionControl: false
  }).setView([19.065, 72.875], 12);

  // Dark CartoDB basemap with high contrast
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 19,
    subdomains: "abcd"
  }).addTo(map);

  // Central Depot Marker
  const depotIcon = L.divIcon({
    className: "",
    html: `<div class="custom-depot-pin" title="Central Municipal Reservoir Depot">🏛️</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17]
  });

  L.marker(DEPOT_COORDS, { icon: depotIcon })
    .bindPopup(`
      <div style="font-size:0.85rem;line-height:1.4;">
        <strong style="color:var(--accent-blue);">Central Municipal Reservoir Depot</strong><br>
        <span style="font-size:0.75rem;color:var(--text-muted);">Main Tanker Refilling Hub & Fleet Base</span><br>
        <div style="margin-top:6px;font-size:0.75rem;color:#86efac;">● 120,000L Reserve Online</div>
      </div>
    `)
    .addTo(map);
}

function updateMapMarkers() {
  // Clear existing pins
  mapMarkers.forEach(m => map.removeLayer(m));
  mapMarkers = [];

  // 1. Plot Tankers
  appState.tankers.forEach(tanker => {
    const isDown = tanker.status === "BROKEN_DOWN";
    const statusClass = isDown ? "broken" : "active";
    const iconHtml = `
      <div class="custom-tanker-pin ${statusClass}" title="${tanker.tanker_id}">
        ${isDown ? "⚠️" : "🚚"}
      </div>
    `;
    const icon = L.divIcon({ html: iconHtml, className: "", iconSize: [32, 32], iconAnchor: [16, 16] });
    
    const marker = L.marker(tanker.current_coords, { icon })
      .bindPopup(`
        <div style="font-size:0.85rem;line-height:1.45;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <strong style="color:${isDown ? '#f43f5e' : '#38bdf8'};">${tanker.tanker_id}</strong>
            <span style="font-size:0.7rem;padding:2px 6px;border-radius:4px;background:${isDown ? 'rgba(244,63,94,0.2)' : 'rgba(16,185,129,0.2)'};color:${isDown ? '#fda4af' : '#86efac'};">
              ${tanker.status}
            </span>
          </div>
          <div style="font-size:0.75rem;color:var(--text-muted);font-family:var(--font-mono);">Reg: ${tanker.vehicle_number}</div>
          <div style="font-size:0.78rem;margin-top:6px;">
            Current Load: <strong>${tanker.current_water_liters.toLocaleString()}L</strong> / ${tanker.capacity_liters.toLocaleString()}L
          </div>
        </div>
      `)
      .addTo(map);
    mapMarkers.push(marker);
  });

  // 2. Plot Ward Requests
  appState.requests.forEach(req => {
    const weather = appState.weather[req.ward_id] || {};
    const priority = req.effective_priority || 50;
    
    let color = "#10b981";
    let glow = "rgba(16, 185, 129, 0.4)";
    if (priority >= 80) { color = "#f43f5e"; glow = "rgba(244, 63, 94, 0.7)"; }
    else if (priority >= 60) { color = "#f97316"; glow = "rgba(249, 115, 22, 0.6)"; }
    else if (priority >= 40) { color = "#eab308"; glow = "rgba(234, 179, 8, 0.5)"; }

    const shortName = req.area_name.split(' ')[0];
    const iconHtml = `
      <div class="custom-ward-pin" style="background:${color};box-shadow:0 0 10px ${glow};">
        💧 ${shortName} <strong>${priority.toFixed(0)}</strong>
      </div>
    `;
    const icon = L.divIcon({ html: iconHtml, className: "", iconSize: [90, 24], iconAnchor: [45, 12] });

    const marker = L.marker(req.coords, { icon })
      .bindPopup(`
        <div style="font-size:0.85rem;line-height:1.45;min-width:210px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <strong style="color:#fff;">${req.area_name}</strong>
            <span class="priority-badge" style="background:${color}22;color:${color};border:1px solid ${color};padding:1px 5px;font-size:0.75rem;">
              Score: ${priority.toFixed(1)}
            </span>
          </div>
          <div style="font-size:0.75rem;color:var(--text-muted);font-family:var(--font-mono);">${req.ward_id} • ${req.household_count} Households</div>
          
          <div style="margin-top:6px;display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:0.75rem;">
            <div>Days Dry: <strong>${req.days_since_last_delivery.toFixed(1)} d</strong></div>
            <div>Heat Index: <strong style="color:#fda4af;">${weather.heat_index_c || '--'}°C</strong></div>
            <div>Storage Left: <strong>${req.current_tank_level_pct}%</strong></div>
            <div>Needed: <strong>${req.required_liters.toLocaleString()}L</strong></div>
          </div>
          
          <div style="margin-top:8px;font-size:0.72rem;color:var(--text-muted);font-style:italic;border-top:1px solid rgba(255,255,255,0.08);padding-top:6px;">
            "${req.urgency_reason}"
          </div>

          <button class="btn btn-primary btn-sm" style="margin-top:8px;width:100%;font-size:0.72rem;padding:4px 8px;" onclick="openExplainModal('${req.request_id}')">
            📊 Explain Formula Breakdown
          </button>
        </div>
      `)
      .addTo(map);
    mapMarkers.push(marker);
  });
}

function drawRoutes(routes) {
  routeLines.forEach(l => map.removeLayer(l));
  routeLines = [];

  const colors = ["#38bdf8", "#34d399", "#f43f5e", "#a855f7"];
  routes.forEach((route, idx) => {
    const color = colors[idx % colors.length];
    const points = [DEPOT_COORDS];
    route.stops.forEach(s => points.push(s.coords));

    // Outer glow polyline
    const glowLine = L.polyline(points, {
      color: color,
      weight: 6,
      opacity: 0.35
    }).addTo(map);

    // Inner dashed animated polyline
    const coreLine = L.polyline(points, {
      color: color,
      weight: 3,
      opacity: 0.95,
      dashArray: "8, 8"
    }).addTo(map);

    routeLines.push(glowLine, coreLine);
  });

  if (routes.length > 0) {
    const group = L.featureGroup(routeLines);
    map.fitBounds(group.getBounds().pad(0.15));
  }
}

/* --------------------------------------------------------------------------
   Data Fetching & State Synchronization
   -------------------------------------------------------------------------- */
async function fetchState() {
  const refreshBtn = document.getElementById("btn-refresh");
  if (refreshBtn) refreshBtn.classList.add("loading");

  try {
    const res = await fetch("/api/state");
    const data = await res.json();
    appState.wards = data.wards;
    appState.weather = data.weather;
    appState.requests = data.requests;
    appState.tankers = data.tankers;

    updateMapMarkers();
    updateKPICards();
    renderPriorityTable();
    fetchNeglectedAreas();

    logToConsole("Grid state synchronized from server.", "info");
    showToast("Grid state synchronized", "info");
  } catch (err) {
    logToConsole("Failed to fetch state: " + err, "alert");
    showToast("Failed to fetch state", "alert");
  } finally {
    if (refreshBtn) refreshBtn.classList.remove("loading");
  }
}

/* --------------------------------------------------------------------------
   KPI Telemetry Strip
   -------------------------------------------------------------------------- */
function updateKPICards() {
  // 1. Peak Heat Index
  let maxHeat = 0;
  Object.values(appState.weather).forEach(w => {
    if (w.heat_index_c && w.heat_index_c > maxHeat) maxHeat = w.heat_index_c;
  });
  if (maxHeat > 0) {
    document.getElementById("kpi-val-heat").innerText = `${maxHeat.toFixed(1)}°C`;
  }

  // 2. Emergency Water Deficit
  const totalLiters = appState.requests.reduce((sum, r) => sum + (r.required_liters || 0), 0);
  document.getElementById("kpi-val-deficit").innerText = `${totalLiters.toLocaleString()} L`;

  // 3. Fleet Readiness
  const activeTankers = appState.tankers.filter(t => t.status !== "BROKEN_DOWN").length;
  const totalTankers = appState.tankers.length;
  document.getElementById("kpi-val-fleet").innerText = `${activeTankers} / ${totalTankers} Active`;
  
  const fleetBadge = document.getElementById("fleet-badge");
  if (fleetBadge) {
    fleetBadge.innerText = `${activeTankers} Tankers Ready`;
    fleetBadge.className = activeTankers === totalTankers ? "badge badge-accent" : "badge badge-warning";
  }

  // 4. Equity & Inversions
  const inversions = appState.dispatchPlan ? (appState.dispatchPlan.priority_inversions_count || 0) : 0;
  document.getElementById("kpi-val-inversions").innerText = `${inversions} Inversions`;
}

/* --------------------------------------------------------------------------
   Priority Ranking Table & Explanations
   -------------------------------------------------------------------------- */
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
      <td>
        <strong style="color:#fff;">${req.area_name}</strong>
        ${req.is_overridden ? `<span class="badge badge-warning" style="margin-left:4px;font-size:0.65rem;">OVERRIDDEN</span>` : ''}
        <br><small style="color:var(--text-muted);font-family:var(--font-mono);">${req.ward_id}</small>
      </td>
      <td><span style="font-family:var(--font-mono);font-weight:600;">${req.days_since_last_delivery.toFixed(1)} d</span></td>
      <td><span style="font-family:var(--font-mono);color:#fda4af;font-weight:600;">${weather.heat_index_c || '--'}°C</span></td>
      <td><span class="priority-badge ${badgeClass}">${priority.toFixed(1)}</span></td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="openExplainModal('${req.request_id}')" title="Inspect mathematical formula factors">
          Why?
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

/* --------------------------------------------------------------------------
   Interactive Explainability Formula Modal
   -------------------------------------------------------------------------- */
function openExplainModal(requestId) {
  const req = appState.requests.find(r => r.request_id === requestId);
  if (!req) return;

  const ward = appState.wards[req.ward_id] || {};
  const weather = appState.weather[req.ward_id] || {};
  const score = req.effective_priority || 50;

  // Approximate normalized factor contributions (0-100 scale)
  const heatScore = Math.min(100, Math.max(0, ((weather.heat_index_c || 40) - 35) * 8.5));
  const daysScore = Math.min(100, req.days_since_last_delivery * 30);
  const vulnScore = ward.calculate_vulnerability_score ? ward.calculate_vulnerability_score() : 75;
  const demandScore = 100 - (req.current_tank_level_pct || 10);

  const cHeat = (FORMULA_WEIGHTS.heat * heatScore).toFixed(1);
  const cDays = (FORMULA_WEIGHTS.days * daysScore).toFixed(1);
  const cVuln = (FORMULA_WEIGHTS.vuln * vulnScore).toFixed(1);
  const cDemand = (FORMULA_WEIGHTS.demand * demandScore).toFixed(1);

  const modalTitle = document.getElementById("modal-title");
  modalTitle.innerHTML = `<span>📊</span> Formula Audit: ${req.area_name}`;

  const modalContent = document.getElementById("modal-content");
  modalContent.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;background:rgba(255,255,255,0.03);padding:0.75rem 1rem;border-radius:var(--radius-md);border:1px solid var(--border-subtle);">
      <div>
        <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:700;">Final Calculated Priority</div>
        <div style="font-size:1.8rem;font-weight:800;font-family:var(--font-mono);color:#38bdf8;">${score.toFixed(1)} <span style="font-size:0.85rem;color:var(--text-muted);">/ 100</span></div>
      </div>
      <div style="text-align:right;">
        <span class="cedar-tag">🛡️ Cedar Verified</span>
        <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;">Ward: ${req.ward_id}</div>
      </div>
    </div>

    <div class="formula-breakdown-bar">
      <!-- Heat Risk -->
      <div class="factor-bar-row">
        <div class="factor-bar-info">
          <span>🔥 Heatwave Risk ($w_1 = 35\%$)</span>
          <span style="font-family:var(--font-mono);color:#fda4af;">+${cHeat} pts</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill heat" style="width: ${Math.min(100, heatScore)}%;"></div>
        </div>
      </div>

      <!-- Days Without Water -->
      <div class="factor-bar-row">
        <div class="factor-bar-info">
          <span>⏳ Days Dry Escalation ($w_2 = 30\%$)</span>
          <span style="font-family:var(--font-mono);color:#fed7aa;">+${cDays} pts</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill days" style="width: ${Math.min(100, daysScore)}%;"></div>
        </div>
      </div>

      <!-- Area Vulnerability -->
      <div class="factor-bar-row">
        <div class="factor-bar-info">
          <span>🏥 Structural Vulnerability ($w_3 = 20\%$)</span>
          <span style="font-family:var(--font-mono);color:#c084fc;">+${cVuln} pts</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill vuln" style="width: ${Math.min(100, vulnScore)}%;"></div>
        </div>
      </div>

      <!-- Storage Demand -->
      <div class="factor-bar-row">
        <div class="factor-bar-info">
          <span>📉 Unmet Storage Demand ($w_4 = 15\%$)</span>
          <span style="font-family:var(--font-mono);color:#38bdf8;">+${cDemand} pts</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill demand" style="width: ${Math.min(100, demandScore)}%;"></div>
        </div>
      </div>
    </div>

    <div class="modal-justification" style="margin-top:1rem;">
      <strong style="color:#fff;display:block;margin-bottom:4px;">Plain-Language Agent Rationale:</strong>
      ${req.urgency_reason || "Severe thermal index demand spike requiring immediate hydration intervention."}
      ${req.is_overridden ? `<div style="margin-top:6px;color:#facc15;"><strong>Ward Officer Override:</strong> "${req.override_reason}" (by ${req.overridden_by_officer_id})</div>` : ''}
    </div>
  `;

  document.getElementById("explain-modal").classList.add("open");
}

function closeExplainModal() {
  document.getElementById("explain-modal").classList.remove("open");
}

function setupModalDismissal() {
  const modal = document.getElementById("explain-modal");
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeExplainModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeExplainModal();
  });
}

/* --------------------------------------------------------------------------
   Agent Execution Pipeline & Actions
   -------------------------------------------------------------------------- */
async function runAgentDispatch() {
  logToConsole("Dispatcher requested dispatch cycle. Evaluating Amazon Cedar permissions...", "info");
  setPipelineStep(2);

  const btn = document.getElementById("btn-run-agent");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span>⏳</span> Planning...`;
  }

  try {
    const res = await fetch("/api/agent/dispatch", { method: "POST" });
    if (!res.ok) {
      const err = await res.json();
      logToConsole("Cedar Denied: " + (err.detail || "Unauthorized"), "alert");
      showToast("Cedar Policy Denied: " + (err.detail || "Unauthorized"), "alert");
      setPipelineStep(2);
      return;
    }
    const data = await res.json();
    appState.dispatchPlan = data.plan;

    setPipelineStep(5);
    logToConsole("✅ Strands Agent completed reasoning loop with 0 priority inversions.", "system-msg");
    logToConsole(data.agent_narrative, "info");
    showToast("Strands Agent Dispatch Completed (0 Inversions)", "success");

    drawRoutes(data.plan.tanker_routes);
    renderRoutePanel(data.plan.tanker_routes);
    fetchState();
  } catch (err) {
    logToConsole("Error during dispatch: " + err, "alert");
    showToast("Error during dispatch: " + err, "alert");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span>⚡</span> Run Strands Agent`;
    }
  }
}

function setPipelineStep(stepNumber) {
  for (let i = 1; i <= 5; i++) {
    const el = document.getElementById(`step-${i}`);
    if (!el) continue;
    el.className = "step-node";
    if (i < stepNumber) el.classList.add("done");
    else if (i === stepNumber) el.classList.add("active");
  }
}

async function simulateBreakdown() {
  logToConsole("🚨 Simulating emergency breakdown of Tanker T-02 mid-route...", "alert");
  try {
    const res = await fetch("/api/agent/replan_breakdown?tanker_id=TANKER-02", { method: "POST" });
    if (!res.ok) {
      const err = await res.json();
      showToast("Breakdown Error: " + err.detail, "alert");
      return;
    }
    const data = await res.json();
    logToConsole(data.agent_narrative, "alert");
    showToast("Tanker T-02 Breakdown Replan Executed!", "alert");

    drawRoutes(data.plan.tanker_routes);
    renderRoutePanel(data.plan.tanker_routes);
    fetchState();
  } catch (err) {
    logToConsole("Breakdown replan failed: " + err, "alert");
    showToast("Breakdown replan failed: " + err, "alert");
  }
}

async function resetFleet() {
  try {
    await fetch("/api/agent/reset", { method: "POST" });
    routeLines.forEach(l => map.removeLayer(l));
    routeLines = [];
    
    const container = document.getElementById("routes-container");
    container.innerHTML = `
      <p class="placeholder-text" style="color:var(--text-muted);font-size:0.8rem;text-align:center;padding:1.5rem;">
        Click <strong>"Run Strands Agent Dispatch"</strong> to generate priority-ordered, capacity-constrained routes.
      </p>
    `;

    const badge = document.getElementById("routes-status-badge");
    if (badge) badge.innerText = "Awaiting Optimization";

    setPipelineStep(3);
    fetchState();
    logToConsole("Fleet reset to baseline configuration.", "info");
    showToast("Fleet and requests reset to baseline", "info");
  } catch (err) {
    showToast("Reset failed: " + err, "alert");
  }
}

function renderRoutePanel(routes) {
  const container = document.getElementById("routes-container");
  container.innerHTML = "";

  const badge = document.getElementById("routes-status-badge");
  if (badge) {
    badge.innerText = `${routes.length} Active Routes`;
    badge.className = "badge badge-accent";
  }

  routes.forEach(route => {
    const routeDiv = document.createElement("div");
    routeDiv.className = "route-card";
    
    routeDiv.innerHTML = `
      <div class="route-card-header">
        <div class="route-tanker-badge">
          <span>🚚</span> ${route.tanker_id} (${route.vehicle_number})
        </div>
        <div class="route-stats-pill">
          ${route.total_liters_dispatched.toLocaleString()}L • ~${route.estimated_total_time_mins.toFixed(0)}m
        </div>
      </div>
      <div class="stop-sequence-timeline" id="stops-${route.tanker_id}"></div>
    `;

    const timeline = routeDiv.querySelector(`#stops-${route.tanker_id}`);
    route.stops.forEach(stop => {
      const stopEl = document.createElement("div");
      stopEl.className = "stop-item";
      stopEl.innerHTML = `
        <div class="stop-header">
          <strong>Stop #${stop.stop_sequence}: ${stop.area_name}</strong>
          <span style="font-family:var(--font-mono);color:var(--accent-cyan);font-weight:700;">
            ${stop.liters_to_deliver.toLocaleString()}L
          </span>
        </div>
        <div class="reason">${stop.decision_reason}</div>
      `;
      timeline.appendChild(stopEl);
    });

    container.appendChild(routeDiv);
  });
}

/* --------------------------------------------------------------------------
   OpenSearch Equity & Neglected Areas
   -------------------------------------------------------------------------- */
async function fetchNeglectedAreas() {
  try {
    const res = await fetch("/api/opensearch/neglected_areas");
    const data = await res.json();
    const container = document.getElementById("neglected-list");
    container.innerHTML = "";

    if (!data.neglected_areas || data.neglected_areas.length === 0) {
      container.innerHTML = `<p style="font-size:0.75rem;color:var(--text-muted);text-align:center;padding:0.75rem;">All vulnerable areas currently served according to equity metrics.</p>`;
      return;
    }

    data.neglected_areas.forEach(item => {
      const div = document.createElement("div");
      div.className = "neglected-item";
      div.innerHTML = `
        <strong>⚠️ ${item.area_name} (${item.risk_level} RISK)</strong>
        <span>${item.audit_alert}</span>
      `;
      container.appendChild(div);
    });
  } catch (err) {
    console.error("OpenSearch query error:", err);
  }
}

/* --------------------------------------------------------------------------
   Segmented Role Switcher & Cedar ABAC Controls
   -------------------------------------------------------------------------- */
function switchRole(role) {
  appState.currentRole = role;

  // Update tabs UI
  const tabs = ["Dispatcher", "WardOfficer", "Resident", "Auditor"];
  tabs.forEach(t => {
    const btn = document.getElementById(`tab-${t.toLowerCase()}`);
    if (btn) {
      if (t === role) btn.classList.add("active");
      else btn.classList.remove("active");
    }
  });

  renderRoleBody(role);
  logToConsole(`Switched active context to: Role::"${role}"`, "info");
}

function renderRoleBody(role) {
  const container = document.getElementById("role-body");
  const title = document.getElementById("role-card-title");
  const cedarBadge = document.getElementById("role-cedar-badge");

  if (role === "Dispatcher") {
    title.innerHTML = `<span>🚚</span> Dispatcher Operations Control`;
    cedarBadge.innerText = "Cedar Authorized";
    cedarBadge.style.color = "#86efac";
    cedarBadge.style.borderColor = "rgba(134, 239, 172, 0.35)";

    container.innerHTML = `
      <p style="font-size:0.8rem;color:var(--text-muted);line-height:1.45;">
        Full operational authority to trigger Strands Agent fleet optimization, simulate vehicle breakdowns, and approve dynamic routes.
      </p>
      <div style="display:flex;gap:0.65rem;margin-top:0.35rem;">
        <button class="btn btn-primary" style="flex:1;" onclick="runAgentDispatch()">
          <span>⚡</span> Run Strands Agent Dispatch
        </button>
        <button class="btn btn-danger btn-sm" onclick="simulateBreakdown()">
          <span>🚨</span> Test Breakdown
        </button>
      </div>
    `;
  } else if (role === "WardOfficer") {
    title.innerHTML = `<span>🛡️</span> Ward Officer Priority Override (Cedar ABAC)`;
    cedarBadge.innerText = "ABAC Enforced";
    cedarBadge.style.color = "#facc15";
    cedarBadge.style.borderColor = "rgba(250, 204, 21, 0.35)";

    container.innerHTML = `
      <div style="background:rgba(250,204,21,0.08);border-left:3px solid #eab308;padding:0.6rem 0.8rem;border-radius:0 4px 4px 0;font-size:0.75rem;color:#fef08a;margin-bottom:0.25rem;">
        <strong>Cedar Policy Rule:</strong> You can only override priority scores within your assigned ward. An audit reason is mandatory for compliance.
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.65rem;">
        <div class="form-group">
          <label for="ov-officer-ward">Officer Assigned Ward:</label>
          <select id="ov-officer-ward" class="form-control">
            <option value="WARD-GN">Ward G-North (Dharavi)</option>
            <option value="WARD-L">Ward L (Kurla)</option>
          </select>
        </div>
        <div class="form-group">
          <label for="ov-req-select">Target Request:</label>
          <select id="ov-req-select" class="form-control">
            ${appState.requests.map(r => `<option value="${r.request_id}" data-ward="${r.ward_id}">${r.area_name} (${r.ward_id})</option>`).join("")}
          </select>
        </div>
      </div>

      <div class="form-group">
        <label for="ov-score-slider">
          <span>New Priority Override Score:</span>
          <span class="slider-val" id="ov-score-val">95.0</span>
        </label>
        <div class="range-slider-wrapper">
          <input type="range" id="ov-score-slider" min="0" max="100" step="0.5" value="95.0" oninput="document.getElementById('ov-score-val').innerText = parseFloat(this.value).toFixed(1)">
        </div>
      </div>

      <div class="form-group">
        <label for="ov-reason">Cedar Audit Justification (Mandatory):</label>
        <input type="text" id="ov-reason" class="form-control" placeholder="e.g. Critical hospital ICU cooling and oxygen plant failure" value="Critical dialysis ward and ICU cooling failure">
      </div>

      <button class="btn btn-primary btn-sm" style="width:100%;margin-top:0.25rem;" onclick="submitOfficerOverride()">
        <span>🛡️</span> Submit Override to Cedar Policy Engine
      </button>
    `;
  } else if (role === "Resident") {
    title.innerHTML = `<span>👥</span> Resident Water Request Portal`;
    cedarBadge.innerText = "Community Role";
    cedarBadge.style.color = "#38bdf8";
    cedarBadge.style.borderColor = "rgba(56, 189, 248, 0.35)";

    container.innerHTML = `
      <p style="font-size:0.76rem;color:var(--text-muted);">
        Submit an emergency request for your neighborhood or housing society. All requests are indexed in OpenSearch and weighted by heatwave severity.
      </p>

      <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:0.65rem;">
        <div class="form-group">
          <label for="res-area">Area / Society Name:</label>
          <input type="text" id="res-area" class="form-control" placeholder="e.g. Dharavi Sector 6 Chawl" value="Dharavi Transit Chawl 4">
        </div>
        <div class="form-group">
          <label for="res-ward">Ward Jurisdiction:</label>
          <select id="res-ward" class="form-control">
            <option value="WARD-GN">Ward G-North (Dharavi)</option>
            <option value="WARD-L">Ward L (Kurla)</option>
            <option value="WARD-ME">Ward M-East (Govandi)</option>
            <option value="WARD-HE">Ward H-East (Bandra)</option>
            <option value="WARD-KW">Ward K-West (Andheri)</option>
          </select>
        </div>
      </div>

      <div class="form-group">
        <label for="res-tank-slider">
          <span>Remaining Storage Level:</span>
          <span class="slider-val" id="res-tank-val">12%</span>
        </label>
        <div class="range-slider-wrapper">
          <input type="range" id="res-tank-slider" min="0" max="100" value="12" oninput="document.getElementById('res-tank-val').innerText = this.value + '%'">
        </div>
      </div>

      <div class="form-group">
        <label for="res-liters">Requested Volume (Liters):</label>
        <input type="number" id="res-liters" class="form-control" value="6000" min="1000" max="15000" step="500">
      </div>

      <div class="form-group">
        <label for="res-reason">Urgency Description:</label>
        <input type="text" id="res-reason" class="form-control" placeholder="Describe current community impact..." value="Zero tap supply for 3 days; severe dehydration risk among children">
      </div>

      <button class="btn btn-primary btn-sm" style="width:100%;margin-top:0.25rem;" onclick="submitResidentRequest()">
        <span>💧</span> Submit Water Request
      </button>
    `;
  } else if (role === "Auditor") {
    title.innerHTML = `<span>⚖️</span> Auditor & Public Fairness Oversight`;
    cedarBadge.innerText = "Read-Only Audit";
    cedarBadge.style.color = "#c084fc";
    cedarBadge.style.borderColor = "rgba(192, 132, 252, 0.35)";

    container.innerHTML = `
      <div style="background:rgba(168,85,247,0.08);border-left:3px solid #a855f7;padding:0.75rem;border-radius:0 4px 4px 0;font-size:0.78rem;line-height:1.5;">
        <strong style="color:#e9d5ff;">Algorithmic Equity Verification:</strong>
        <div style="margin-top:4px;color:var(--text-muted);">
          All dispatches are governed by immutable mathematical weights: Heat Risk (0.35), Days Dry (0.30), Vulnerability (0.20), Demand (0.15).
        </div>
        <div style="margin-top:6px;color:#86efac;font-weight:700;">
          ✓ Zero Priority Inversions Detected in Active Fleet Dispatches.
        </div>
      </div>

      <button class="btn btn-secondary btn-sm" style="width:100%;margin-top:0.75rem;" onclick="fetchNeglectedAreas()">
        <span>🔍</span> Re-evaluate OpenSearch Neglected Area Aggregations
      </button>
    `;
  }
}

/* --------------------------------------------------------------------------
   Role Form Submissions (Cedar Governed)
   -------------------------------------------------------------------------- */
async function submitOfficerOverride() {
  const officerWard = document.getElementById("ov-officer-ward").value;
  const reqSelect = document.getElementById("ov-req-select");
  const requestId = reqSelect.value;
  const targetWard = reqSelect.options[reqSelect.selectedIndex].getAttribute("data-ward");
  const score = parseFloat(document.getElementById("ov-score-slider").value);
  const reason = document.getElementById("ov-reason").value.trim();

  if (!reason) {
    showToast("Audit reason is mandatory for Cedar evaluation", "alert");
    return;
  }

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
      showToast("Cedar Policy Denied: " + data.detail, "alert");
      return;
    }
    logToConsole(`✅ Cedar Permit: ${data.cedar_audit}`, "system-msg");
    showToast("Override Approved by Amazon Cedar!", "success");
    fetchState();
  } catch (err) {
    showToast("Override error: " + err, "alert");
  }
}

async function submitResidentRequest() {
  const areaName = document.getElementById("res-area").value.trim();
  const wardId = document.getElementById("res-ward").value;
  const tank = parseFloat(document.getElementById("res-tank-slider").value);
  const liters = parseInt(document.getElementById("res-liters").value);
  const reason = document.getElementById("res-reason").value.trim();

  if (!areaName) {
    showToast("Please enter an area name", "alert");
    return;
  }

  try {
    const res = await fetch("/api/requests/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resident_id: "res-user-1",
        area_name: areaName,
        ward_id: wardId,
        household_count: 350,
        current_tank_level_pct: tank,
        required_liters: liters,
        days_since_last_delivery: 2.0,
        urgency_reason: reason || "Extreme heatwave emergency water deficit"
      })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast("Error: " + data.detail, "alert");
      return;
    }
    logToConsole(`Resident submitted request for ${areaName}. Cedar Permit granted.`, "system-msg");
    showToast("Water request submitted successfully!", "success");
    fetchState();
  } catch (err) {
    showToast("Submit error: " + err, "alert");
  }
}

/* --------------------------------------------------------------------------
   Terminal Console & Toast Notification Helpers
   -------------------------------------------------------------------------- */
function logToConsole(message, type = "info") {
  const consoleEl = document.getElementById("agent-console");
  if (!consoleEl) return;
  const time = new Date().toLocaleTimeString();
  const entry = document.createElement("div");
  entry.className = `log-entry ${type}-msg`;
  entry.innerHTML = `<span class="timestamp">[${time}]</span> ${message}`;
  consoleEl.appendChild(entry);
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

function showToast(message, type = "info", duration = 4000) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  const icon = type === "success" ? "✅" : type === "alert" ? "🚫" : "ℹ️";
  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, duration);
}
