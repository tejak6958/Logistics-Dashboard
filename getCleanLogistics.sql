-- ============================================================
-- Retool Query: getCleanLogistics
-- Resource:     mysql_logistics_db
-- Run on load:  ON
-- Description:  Pulls regex-cleaned rows from the view.
--               18 records pass both format + cost filters.
-- ============================================================

SELECT
  shipment_id,
  cleaned_customer_id,
  extracted_tracking_number,
  carrier_name,
  freight_cost
FROM v_clean_premium_logistics
ORDER BY freight_cost DESC;
