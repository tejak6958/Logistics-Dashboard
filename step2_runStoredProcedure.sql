-- ============================================================
-- Retool Workflow Step 2: runStoredProcedure
-- Resource: mysql_logistics_db
-- Description: Calls sp_execute_warehouse_load, captures
--              OUT params for success/failure branching.
-- ============================================================

SET @batch_id      = {{ moment().unix() }};
SET @rows_migrated = 0;
SET @log_message   = '';

CALL sp_execute_warehouse_load(
  @batch_id,
  @rows_migrated,
  @log_message
);

SELECT
  @rows_migrated AS rows_migrated,
  @log_message   AS log_message;
