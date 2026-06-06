# 🚚 Enterprise Logistics Pipeline Dashboard

> **Turning raw shipment data into clear, actionable insights — built with Retool, MySQL, and MongoDB.**

---

## 📽️ Demo

[![Logistics Dashboard Demo](https://img.shields.io/badge/▶_Watch_Demo-FF0000?style=for-the-badge&logo=youtube&logoColor=white)](https://youtu.be/GvS8Yh_XygU)

---

## 🧩 What This Project Does

Most dashboards look complex but don't explain much.  
This one is different — it simplifies multi-source logistics data so you can see **what's happening and what to do next**, instantly.

| Layer | Tool | What it does |
|---|---|---|
| 📦 Shipment data | MySQL (Railway cloud) | Stores carrier, route, cost, tracking codes |
| 🚨 Incident tracking | MongoDB (Atlas cloud) | Stores unstructured incident logs per shipment |
| 🔧 Pipeline orchestration | Retool Workflows | Cleans, merges, and writes to analytics hub |
| 📊 Reporting | Power BI | Live dashboard fed from the warehouse table |

---

## 🏗️ Architecture Overview

```
Raw MySQL Data                     MongoDB Incidents
(raw_shipments table)              (operational_incidents collection)
        │                                    │
        ▼                                    ▼
┌─────────────────────────────────────────────────────┐
│         v_clean_premium_logistics (MySQL View)       │
│  • REGEX 1: Extracts customer ID from metadata      │
│  • REGEX 2: Strips tracking code to clean key       │
│  • Filter:  ERR-TRK format + freight > $2,000       │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│              Retool Dashboard                        │
│  Query 1: getCleanLogistics  (MySQL view → 18 rows) │
│  Query 2: getMongoIncidents  ($in lookup by key)    │
│  Transformer: mergedLogisticsData (JS merge + rank) │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│         warehouse_analytics_hub (MySQL)              │
│  Written via Retool Workflow +                       │
│  sp_execute_warehouse_load (Stored Procedure)        │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
               Power BI Dashboard
          (incremental refresh on sync_timestamp)
```

---

## 📁 Project Structure

```
logistics-dashboard/
│
├── sql/
│   └── enterprise_logistics_infrastructure.sql   # Full schema, view, stored procedure, seed data
│
├── mongodb/
│   └── mongodb_unstructured_incidents.json        # 25 incident documents for import
│
├── retool/
│   ├── queries/
│   │   ├── getCleanLogistics.sql                  # Retool MySQL query
│   │   ├── getMongoIncidents.json                 # Retool MongoDB $in filter
│   │   └── transformer_mergedLogisticsData.js     # JS transformer — merge + active incident count
│   └── workflow/
│       ├── step1_insertToHub.sql                  # Bulk insert into warehouse hub
│       ├── step2_runStoredProcedure.sql            # CALL sp_execute_warehouse_load
│       └── step3_checkResult.js                   # Read OUT params, branch on success/failure
│
└── README.md
```

---

## ⚙️ SQL — Key Components

### The View: `v_clean_premium_logistics`

The view does all the data cleaning in one place using MySQL regex:

```sql
CREATE OR REPLACE VIEW v_clean_premium_logistics AS
SELECT
    s.shipment_id,
    s.freight_cost,
    c.carrier_name,

    -- REGEX 1: Extract numeric customer ID from messy metadata string
    CAST(
      REGEXP_REPLACE(REGEXP_SUBSTR(s.metadata_string, 'ID:\\s*[0-9]+'), 'ID:\\s*', '')
    AS UNSIGNED) AS cleaned_customer_id,

    -- REGEX 2: Extract tracking number, strip the # prefix
    REGEXP_REPLACE(REGEXP_SUBSTR(s.raw_tracking_code, '#[0-9]+-[A-Z]+'), '#', '')
    AS extracted_tracking_number

FROM raw_shipments s
JOIN carrier_manifests c ON s.carrier_id = c.carrier_id

-- Only valid ERR-TRK format AND premium cost threshold
WHERE s.raw_tracking_code REGEXP '^ERR-TRK#[0-9]+-[A-Z]+$'
  AND s.freight_cost > 2000.00;
```

**Regex patterns explained:**

| Pattern | Purpose | Example match |
|---|---|---|
| `ID:\s*[0-9]+` | Handles any spacing after colon | `ID: 5001` or `ID:5001` |
| `#[0-9]+-[A-Z]+` | Grabs tracking suffix | `#98234-XYZ` |
| `^ERR-TRK#[0-9]+-[A-Z]+$` | Rejects malformed codes | Blocks `INVALID-TRK#123` |

---

### The Stored Procedure: `sp_execute_warehouse_load`

Transactional ETL write with full rollback on error and OUT parameter logging:

```sql
CALL sp_execute_warehouse_load(
    @batch_id,       -- IN:  Unix timestamp batch ID
    @rows_migrated,  -- OUT: Row count (-1 = failed)
    @log_message     -- OUT: Status message
);
```

---

## 🍃 MongoDB — Incident Documents

Each document in `operational_incidents` links to a shipment via `extracted_tracking_number`:

```json
{
  "extracted_tracking_number": "98234-XYZ",
  "incident_logs": [
    { "type": "Customs Delay", "severity": "High", "resolved": false },
    { "type": "Weather Exception", "severity": "Medium", "resolved": true }
  ]
}
```

**Import command:**
```bash
mongoimport \
  --db logistics_db \
  --collection operational_incidents \
  --file mongodb_unstructured_incidents.json \
  --jsonArray
```

> For **MongoDB Atlas**: paste the JSON array directly into Browse Collections → Insert Document.

---

## 🔧 Retool — Query Code

### Query 1: MySQL View Pull

```sql
-- Resource: mysql_logistics_db
-- Name: getCleanLogistics
-- Run on page load: ON

SELECT
  shipment_id,
  cleaned_customer_id,
  extracted_tracking_number,
  carrier_name,
  freight_cost
FROM v_clean_premium_logistics
ORDER BY freight_cost DESC;
```

### Query 2: MongoDB Dynamic `$in` Lookup

```json
// Resource: mongo_incidents_db
// Collection: operational_incidents
// Trigger: runs after getCleanLogistics

{
  "extracted_tracking_number": {
    "$in": {{ getCleanLogistics.data.map(r => r.extracted_tracking_number) }}
  }
}
```

### Transformer: Merge + Active Incident Count

```js
// Name: mergedLogisticsData
// Type: Transformer (no resource needed)

const incidentMap = new Map(
  getMongoIncidents.data.map(doc => [
    doc.extracted_tracking_number,
    doc.incident_logs || []
  ])
);

const merged = getCleanLogistics.data.map(row => {
  const logs = incidentMap.get(row.extracted_tracking_number) || [];
  const activeIncidentCount = logs.filter(log => log.resolved === false).length;
  const totalIncidentCount  = logs.length;

  const severityRank = { "High": 3, "Medium": 2, "Low": 1 };
  const maxSeverity = logs.reduce((max, log) => {
    return (severityRank[log.severity] || 0) > (severityRank[max] || 0)
      ? log.severity : max;
  }, "");

  return {
    ...row,
    incident_logs:      logs,
    total_incidents:    totalIncidentCount,
    active_incidents:   activeIncidentCount,
    resolved_incidents: totalIncidentCount - activeIncidentCount,
    max_severity:       maxSeverity || "None",
    has_active_issue:   activeIncidentCount > 0,
  };
});

return merged.sort((a, b) => b.active_incidents - a.active_incidents);
```

---

## 📤 Retool Workflow — Pipeline ETL Steps

### Step 1: Insert to warehouse hub

```sql
INSERT INTO warehouse_analytics_hub
  (cleaned_customer_id, extracted_tracking_number,
   carrier_name, freight_cost, mongo_incident_count)
VALUES {{ mergedLogisticsData.value.map(r =>
  `(${r.cleaned_customer_id},'${r.extracted_tracking_number}',
    '${r.carrier_name}',${r.freight_cost},${r.active_incidents})`
).join(',') }}
ON DUPLICATE KEY UPDATE
  mongo_incident_count = VALUES(mongo_incident_count),
  sync_timestamp = CURRENT_TIMESTAMP;
```

### Step 2: Execute stored procedure

```sql
SET @batch_id     = {{ moment().unix() }};
SET @rows_migrated = 0;
SET @log_message   = '';

CALL sp_execute_warehouse_load(@batch_id, @rows_migrated, @log_message);

SELECT @rows_migrated AS rows_migrated,
       @log_message   AS log_message;
```

### Step 3: Check result

```js
const result = runStoredProcedure.data[0];

if (result.rows_migrated === -1) {
  throw new Error(`ETL failed: ${result.log_message}`);
}

return {
  success:      true,
  rows_written: result.rows_migrated,
  message:      result.log_message
};
```

---

## 🚀 Setup Guide

### Prerequisites

- MySQL 8.0+ (local or Railway cloud)
- MongoDB Atlas account (free) or local MongoDB
- Retool account (free at retool.com)
- Power BI Desktop (optional, for reporting layer)

### 1 — MySQL Setup

```bash
# Create the database
mysql -u root -p -e "CREATE DATABASE logistics_db;"

# Import the full schema (tables + view + procedure + seed data)
mysql -u root -p logistics_db < sql/enterprise_logistics_infrastructure.sql
```

### 2 — MongoDB Setup

```bash
# Import incident documents
mongoimport \
  --db logistics_db \
  --collection operational_incidents \
  --file mongodb/mongodb_unstructured_incidents.json \
  --jsonArray
```

### 3 — Retool Setup

1. Go to **retool.com** → Create free account
2. **Resources → + New → MySQL** → name it `mysql_logistics_db`
3. **Resources → + New → MongoDB** → name it `mongo_incidents_db`
4. Create a new App → add the 3 queries from `retool/queries/`
5. Create a new Workflow → add the 3 steps from `retool/workflow/`

> For local databases: use ngrok (`ngrok tcp 3306` and `ngrok tcp 27017`) to expose them to Retool cloud.

---

## 🛠️ Tech Stack

![MySQL](https://img.shields.io/badge/MySQL_8.0-4479A1?style=flat-square&logo=mysql&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB_Atlas-47A248?style=flat-square&logo=mongodb&logoColor=white)
![Retool](https://img.shields.io/badge/Retool-3D3D3D?style=flat-square&logo=retool&logoColor=white)
![Power BI](https://img.shields.io/badge/Power_BI-F2C811?style=flat-square&logo=powerbi&logoColor=black)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)

---

## 👤 About

I help turn raw data into clear, simple insights that are easy to understand and actually useful for decision-making.

**What I work with:**
- Retool — internal tools & dashboards
- Power BI — reports & business insights
- Excel — data cleaning, analysis, quick dashboards
- MySQL & MongoDB — cloud databases on Railway & Atlas

**Connect:** [LinkedIn](www.linkedin.com/in/k-teja) 

---

<p align="center">Built with clarity in mind · Data should explain itself</p>
