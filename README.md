# Heatwave-Aware Water Tanker Routing Agent 💧🚚

> **One-line pitch:** *When a heatwave hits, tanker supply doesn't scale with demand. This system ranks neighborhoods by how urgently they need water right now and plans tanker routes accordingly, with a transparent reason for every decision.*

---

## 🎯 The Problem

During extreme urban heatwaves (temperatures exceeding 43–45°C), municipal water tanker dispatch typically devolves into first-come-first-served queues or political pressure. Critical informal settlements (slums with zero piped connections), dialysis wards, and elderly-heavy neighborhoods run out of water first. Furthermore, dispatch decisions lack transparency: citizens and ward officers have no visibility into *why* one area received water while another was skipped.

This project delivers an **AI Agentic dispatching and routing platform** powered by:
1. **Explainable Priority Scoring Formula**
2. **AWS Strands Agent** with multi-tool reasoning and edge-case resolution
3. **Amazon Cedar Policies** for role-based and attribute-based security guardrails
4. **Capacitated Route Optimization** minimizing travel time while eliminating priority inversions
5. **OpenSearch Integration** for geo-clustering queries and neglected area alerts

---

## 🏗️ Architecture & Core Components

```
d:\AWS\Environment_Track\
├── policies/
│   └── tanker_policies.cedar          # Amazon Cedar security policies (RBAC & ABAC)
├── src/
│   ├── config.py                      # Operational parameters & formula weights
│   ├── models/
│   │   ├── ward.py                    # Vulnerability profiles & heat index models
│   │   ├── request.py                 # Resident/society requests & override tracking
│   │   ├── fleet.py                   # Tanker capacities, telemetry & driver info
│   │   └── route.py                   # Dispatch plans, stops & explainable justifications
│   ├── core/
│   │   ├── priority_engine.py         # w1*heat + w2*days + w3*vuln + w4*demand
│   │   ├── cedar_auth.py              # Cedar policy evaluation engine (cedarpy)
│   │   ├── route_planner.py           # Priority-first capacity routing heuristic
│   │   ├── opensearch_client.py       # Geo queries & neglected areas aggregations
│   │   └── mock_data.py               # Realistic metropolis heatwave scenario data
│   ├── agent/
│   │   ├── tools.py                   # Strands agent tools (@tool decorated)
│   │   └── strands_agent.py           # AWS Strands agent orchestrator & 'what-if' replan
│   └── api/
│       └── app.py                     # FastAPI REST API & static dashboard server
├── static/
│   ├── index.html                     # Responsive glassmorphism operations dashboard
│   ├── style.css                      # Modern dark-mode styling with heat alerts
│   └── app.js                         # Interactive map, Cedar role switcher & agent controls
├── tests/
│   └── test_system.py                 # Comprehensive unit & integration test suite
├── requirements.txt                   # Pinned dependency requirements
└── run.py                             # Single-command launcher
```

---

## 🧮 1. Explainable Priority Score Formula

$$\text{Priority} = w_1 \cdot \text{heat\_risk} + w_2 \cdot \text{days\_without\_water} + w_3 \cdot \text{vulnerability} + w_4 \cdot \text{unmet\_demand}$$

- **Heat Risk ($w_1 = 0.35$):** Real-time temperature & heat index. An informal settlement at 44.5°C jumps in priority compared to normal days.
- **Days Dry ($w_2 = 0.30$):** Escalating curve past 2 days without water.
- **Area Vulnerability ($w_3 = 0.20$):** Deficit in municipal piped supply (0 hrs piped adds maximum penalty), elderly/children percentage, presence of healthcare clinics.
- **Unmet Demand ($w_4 = 0.15$):** Storage remaining percentage (10% storage remaining vs 80%).

Every calculated score outputs a **plain-language audit justification** explaining the factors that drove the decision.

---

## 🤖 2. AWS Strands Agent & Edge-Case Reasoning

Built using the **`strands-agents`** framework:
- **Registered Tools:** `get_forecast`, `get_requests`, `get_fleet`, `compute_priority`, `plan_routes`, `replan_breakdown`.
- **Ethical Edge-Case Reasoning:**
  - *Scenario:* Hospital zone requests water while a slum cluster has gone 3.2 days without water in 44.5°C heat.
  - *Agent Resolution:* Concurrently dispatches Tanker T-02 (12,000L) to the slum cluster for emergency hydration while dispatching Tanker T-01 (10,000L) to Kurla Hospital ICU, eliminating priority inversion.
- **"What-If" Breakdown Replanning:**
  - If Tanker T-02 suffers an engine failure mid-route, the agent recalculates available fleet volume and reassigns urgent pending stops to active tankers within seconds.

---

## 🛡️ 3. Amazon Cedar Security Policies

Fine-grained authorization specified in [`policies/tanker_policies.cedar`](file:///d:/AWS/Environment_Track/policies/tanker_policies.cedar) and evaluated via `cedarpy`:

1. **Residents:** Can submit and view their own water requests. Cannot access fleet routing or trigger dispatch.
2. **Dispatchers:** Can view all requests, trigger Strands Agent planning, and reassign tankers.
3. **Ward Officers (ABAC):** Can override priority scores **only within their designated ward**, and the override **must carry an audit explanation**. Cross-ward override attempts or blank reasons are strictly denied by Cedar.
4. **Auditor / Public View:** Read-only access to fairness metrics, neglected areas, and delivery logs.

---

## 🔍 4. OpenSearch Integration

- **Geospatial Proximity Queries:** Finds demand clusters within a specified radius of tankers.
- **Weekly Delivery Aggregations:** Analyzes delivered volumes per neighborhood.
- **Neglected Areas Detector:** Automated audit query that flags areas with vulnerability scores $> 45$ that have received zero or inadequate deliveries during the heatwave.

---

## 🚀 Getting Started

### 1. Run the Application
Launch the server and launch the interactive web dashboard:
```bash
python run.py
```
Open [http://127.0.0.1:8000](http://127.0.0.1:8000) in your browser.

### 2. Run the Automated Tests
Verify formula accuracy, Cedar security policies, route planning, and agent replanning:
```bash
python tests/test_system.py
```
All tests should pass with code `0`.
