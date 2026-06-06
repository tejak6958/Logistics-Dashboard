// ============================================================
// Retool Transformer: mergedLogisticsData
// Type: Transformer (no resource — runs in browser)
// Description: Joins SQL rows with MongoDB incident logs,
//              calculates active incident count, ranks by risk.
// ============================================================

// Build a O(n) lookup map: trackingNumber → incident_logs array
const incidentMap = new Map(
  getMongoIncidents.data.map(doc => [
    doc.extracted_tracking_number,
    doc.incident_logs || []
  ])
);

// Merge each SQL row with its MongoDB incident logs
const merged = getCleanLogistics.data.map(row => {
  const logs = incidentMap.get(row.extracted_tracking_number) || [];

  // Active incidents = unresolved logs only
  const activeIncidentCount = logs.filter(log => log.resolved === false).length;
  const totalIncidentCount  = logs.length;

  // Highest severity across all logs for this shipment
  const severityRank = { "High": 3, "Medium": 2, "Low": 1 };
  const maxSeverity = logs.reduce((max, log) => {
    return (severityRank[log.severity] || 0) > (severityRank[max] || 0)
      ? log.severity : max;
  }, "");

  return {
    ...row,
    incident_logs:      logs,
    total_incidents:    totalIncidentCount,
    active_incidents:   activeIncidentCount,      // key field — drives alerting
    resolved_incidents: totalIncidentCount - activeIncidentCount,
    max_severity:       maxSeverity || "None",
    has_active_issue:   activeIncidentCount > 0,
  };
});

// Sort: highest active incident count at top (most critical first)
return merged.sort((a, b) => b.active_incidents - a.active_incidents);
