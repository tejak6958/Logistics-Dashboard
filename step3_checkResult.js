// ============================================================
// Retool Workflow Step 3: checkResult
// Type: JavaScript step
// Description: Reads stored procedure OUT parameters.
//              Throws on failure (triggers rollback notification).
//              Returns structured result on success.
// ============================================================

const result = runStoredProcedure.data[0];

if (result.rows_migrated === -1) {
  throw new Error(`ETL failed: ${result.log_message}`);
}

return {
  success:      true,
  rows_written: result.rows_migrated,
  message:      result.log_message,
  timestamp:    new Date().toISOString()
};
