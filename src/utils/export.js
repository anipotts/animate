/**
 * Export Utility for AniMate
 *
 * Handles weekly JSON exports of browsing data to Downloads folder.
 */

import { db } from "../storage/db.js";
import { config } from "./config.js";

/**
 * Generate export data for a date range
 */
export async function generateExportData(startDate, endDate) {
  const data = {
    exportedAt: new Date().toISOString(),
    dateRange: { start: startDate, end: endDate },
    version: "1.0.0",
    browsingSessions: [],
    dailyStats: [],
    clipboardEntries: [],
    domainClassifications: [],
    networkStats: {}
  };

  // Get browsing sessions
  const sessions = await db.getAll("browsing_sessions", 10000);
  data.browsingSessions = sessions.filter(s => {
    return s.date >= startDate && s.date <= endDate;
  }).map(s => ({
    domain: s.domain,
    title: s.title,
    duration: s.duration,
    date: s.date,
    classification: s.classification
  }));

  // Get daily stats
  const allStats = await db.getAll("daily_stats", 100);
  data.dailyStats = allStats.filter(s => s.date >= startDate && s.date <= endDate);

  // Get clipboard entries (anonymized - no actual content)
  const clipboard = await db.getAll("clipboard_entries", 1000);
  data.clipboardEntries = clipboard.filter(c => {
    const date = new Date(c.timestamp).toISOString().slice(0, 10);
    return date >= startDate && date <= endDate;
  }).map(c => ({
    domain: c.domain,
    isCode: c.isCode,
    language: c.language,
    length: c.text?.length || 0,
    timestamp: c.timestamp
  }));

  // Get domain classifications
  data.domainClassifications = await db.getAll("domain_classifications", 500);

  // Aggregate network stats
  const networkRequests = await db.getAll("network_requests", 5000);
  const relevantRequests = networkRequests.filter(r => {
    const date = new Date(r.timestamp).toISOString().slice(0, 10);
    return date >= startDate && date <= endDate;
  });

  const domainStats = {};
  for (const req of relevantRequests) {
    if (!domainStats[req.domain]) {
      domainStats[req.domain] = { total: 0, success: 0, failed: 0 };
    }
    domainStats[req.domain].total++;
    if (req.statusCode >= 200 && req.statusCode < 400) {
      domainStats[req.domain].success++;
    } else {
      domainStats[req.domain].failed++;
    }
  }
  data.networkStats = domainStats;

  return data;
}

/**
 * Export data to JSON file and download
 */
export async function exportToFile(data, filename) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  try {
    await chrome.downloads.download({
      url,
      filename: `animate-exports/${filename}`,
      saveAs: false
    });

    // Log export
    await db.put("export_history", {
      filename,
      exportedAt: Date.now(),
      recordCount: data.browsingSessions.length + data.clipboardEntries.length,
      dateRange: data.dateRange
    });

    return true;
  } catch (error) {
    console.error("[AniMate Export] Download error:", error);
    throw error;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Run weekly export
 */
export async function runWeeklyExport() {
  const enabled = await config.get("autoExport");
  if (!enabled) {
    console.log("[AniMate Export] Auto-export disabled");
    return;
  }

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const startDate = weekAgo.toISOString().slice(0, 10);
  const endDate = now.toISOString().slice(0, 10);

  const filename = `animate-export-${startDate}-to-${endDate}.json`;

  console.log("[AniMate Export] Running weekly export:", filename);

  try {
    const data = await generateExportData(startDate, endDate);
    await exportToFile(data, filename);
    console.log("[AniMate Export] Export complete");
  } catch (error) {
    console.error("[AniMate Export] Export failed:", error);
  }
}

/**
 * Manual export for custom date range
 */
export async function manualExport(startDate, endDate) {
  const filename = `animate-export-${startDate}-to-${endDate}.json`;
  const data = await generateExportData(startDate, endDate);
  await exportToFile(data, filename);
  return filename;
}

/**
 * Get export history
 */
export async function getExportHistory() {
  const history = await db.getAll("export_history", 50);
  return history.sort((a, b) => b.exportedAt - a.exportedAt);
}

export const exporter = {
  generateExportData,
  exportToFile,
  runWeeklyExport,
  manualExport,
  getExportHistory
};
