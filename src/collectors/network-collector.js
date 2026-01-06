/**
 * Network Collector for AniMate
 *
 * Logs API requests made by web pages for debugging and analysis.
 * Filters for interesting requests (APIs, not static assets).
 */

import { db } from "../storage/db.js";

// Patterns to capture (API-like requests)
const CAPTURE_PATTERNS = [
  /\/api\//i,
  /\/graphql/i,
  /\/v[0-9]+\//i,
  /\.json$/i,
  /\/rest\//i,
  /\/rpc\//i
];

// Patterns to ignore (static assets)
const IGNORE_PATTERNS = [
  /\.(css|js|woff|woff2|ttf|eot|ico|png|jpg|jpeg|gif|svg|webp)(\?|$)/i,
  /fonts\.googleapis/i,
  /google-analytics/i,
  /googletagmanager/i,
  /facebook\.com\/tr/i,
  /analytics/i,
  /tracking/i,
  /pixel/i,
  /beacon/i
];

// Track pending requests
const pendingRequests = new Map();

/**
 * Initialize network collector
 */
export function initNetworkCollector() {
  // Listen for request starts
  chrome.webRequest.onBeforeRequest.addListener(
    handleRequestStart,
    { urls: ["<all_urls>"] },
    []
  );

  // Listen for request completions
  chrome.webRequest.onCompleted.addListener(
    handleRequestComplete,
    { urls: ["<all_urls>"] },
    ["responseHeaders"]
  );

  // Listen for request errors
  chrome.webRequest.onErrorOccurred.addListener(
    handleRequestError,
    { urls: ["<all_urls>"] }
  );

  console.log("[AniMate] Network collector initialized");
}

/**
 * Check if URL should be captured
 */
function shouldCapture(url) {
  // Skip if matches ignore patterns
  for (const pattern of IGNORE_PATTERNS) {
    if (pattern.test(url)) return false;
  }

  // Capture if matches capture patterns
  for (const pattern of CAPTURE_PATTERNS) {
    if (pattern.test(url)) return true;
  }

  // Also capture XHR/fetch requests (detected by type)
  return false;
}

/**
 * Handle request start
 */
function handleRequestStart(details) {
  // Only track main_frame, xmlhttprequest, and fetch
  if (!["xmlhttprequest", "fetch", "other"].includes(details.type)) {
    return;
  }

  if (!shouldCapture(details.url)) {
    return;
  }

  // Store pending request
  pendingRequests.set(details.requestId, {
    url: details.url,
    method: details.method,
    type: details.type,
    tabId: details.tabId,
    startTime: details.timeStamp,
    initiator: details.initiator
  });
}

/**
 * Handle request completion
 */
async function handleRequestComplete(details) {
  const pending = pendingRequests.get(details.requestId);
  if (!pending) return;

  pendingRequests.delete(details.requestId);

  try {
    const domain = extractDomain(pending.url);
    const duration = details.timeStamp - pending.startTime;

    // Get content type from headers
    let contentType = null;
    if (details.responseHeaders) {
      const ctHeader = details.responseHeaders.find(
        h => h.name.toLowerCase() === "content-type"
      );
      if (ctHeader) {
        contentType = ctHeader.value.split(";")[0].trim();
      }
    }

    const record = {
      url: pending.url,
      domain,
      method: pending.method,
      statusCode: details.statusCode,
      contentType,
      duration,
      type: pending.type,
      tabId: pending.tabId,
      initiator: pending.initiator,
      timestamp: Date.now(),
      expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days retention
    };

    await db.put("network_requests", record);
  } catch (error) {
    console.error("[AniMate] Network log error:", error);
  }
}

/**
 * Handle request error
 */
async function handleRequestError(details) {
  const pending = pendingRequests.get(details.requestId);
  if (!pending) return;

  pendingRequests.delete(details.requestId);

  try {
    const domain = extractDomain(pending.url);
    const duration = details.timeStamp - pending.startTime;

    const record = {
      url: pending.url,
      domain,
      method: pending.method,
      statusCode: 0,
      error: details.error,
      duration,
      type: pending.type,
      tabId: pending.tabId,
      initiator: pending.initiator,
      timestamp: Date.now(),
      expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000)
    };

    await db.put("network_requests", record);
  } catch (error) {
    console.error("[AniMate] Network log error:", error);
  }
}

/**
 * Extract domain from URL
 */
function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "unknown";
  }
}

/**
 * Get network stats for a domain
 */
export async function getNetworkStats(domain) {
  const requests = await db.getAllFromIndex("network_requests", "by_domain", domain);

  const stats = {
    totalRequests: requests.length,
    successfulRequests: requests.filter(r => r.statusCode >= 200 && r.statusCode < 400).length,
    failedRequests: requests.filter(r => r.statusCode >= 400 || r.statusCode === 0).length,
    avgDuration: 0,
    byMethod: {},
    byStatus: {}
  };

  if (requests.length > 0) {
    stats.avgDuration = Math.round(
      requests.reduce((sum, r) => sum + (r.duration || 0), 0) / requests.length
    );
  }

  for (const req of requests) {
    stats.byMethod[req.method] = (stats.byMethod[req.method] || 0) + 1;
    stats.byStatus[req.statusCode] = (stats.byStatus[req.statusCode] || 0) + 1;
  }

  return stats;
}

export const networkCollector = {
  init: initNetworkCollector,
  getStats: getNetworkStats
};
