-- ============================================================
-- Retool Workflow Step 1: insertToHub
-- Resource: mysql_logistics_db
-- Description: Bulk insert merged payload into warehouse hub.
--              ON DUPLICATE KEY UPDATE keeps data idempotent.
-- ============================================================

INSERT INTO warehouse_analytics_hub
  (cleaned_customer_id, extracted_tracking_number,
   carrier_name, freight_cost, mongo_incident_count)
VALUES
  {{ mergedLogisticsData.value.map(r =>
    `(${r.cleaned_customer_id},
      '${r.extracted_tracking_number}',
      '${r.carrier_name}',
      ${r.freight_cost},
      ${r.active_incidents})`
  ).join(',') }}
ON DUPLICATE KEY UPDATE
  mongo_incident_count = VALUES(mongo_incident_count),
  sync_timestamp = CURRENT_TIMESTAMP;
