/**
 * IndexedDB Schema Definitions for AniMate
 *
 * All stores use 30-day retention via expiresAt field.
 * Cleanup runs daily via alarm-manager.js
 */

export const DB_NAME = "animate_db";
export const DB_VERSION = 1;

export const STORES = {
  // ═══════════════════════════════════════════════════════════════════════
  // BROWSING INTELLIGENCE
  // ═══════════════════════════════════════════════════════════════════════
  browsing_sessions: {
    keyPath: "id",
    autoIncrement: true,
    indexes: [
      { name: "by_domain", keyPath: "domain" },
      { name: "by_date", keyPath: "date" },
      { name: "by_timestamp", keyPath: "startTime" },
      { name: "by_classification", keyPath: "classification" },
      { name: "by_expires", keyPath: "expiresAt" }
    ]
    // Shape:
    // {
    //   id: number (auto),
    //   url: string,
    //   domain: string,
    //   title: string,
    //   startTime: number (timestamp),
    //   endTime: number (timestamp),
    //   duration: number (ms),
    //   date: string (YYYY-MM-DD),
    //   classification: "productive" | "distraction" | "neutral" | "unclassified",
    //   expiresAt: number
    // }
  },

  domain_classifications: {
    keyPath: "domain",
    autoIncrement: false,
    indexes: [
      { name: "by_classification", keyPath: "classification" },
      { name: "by_updated", keyPath: "updatedAt" }
    ]
    // Shape: (cache AI classifications to reduce API calls)
    // {
    //   domain: string (primary key),
    //   classification: "productive" | "distraction" | "neutral",
    //   confidence: number (0-1),
    //   reason: string,
    //   updatedAt: number,
    //   manualOverride: boolean
    // }
  },

  daily_stats: {
    keyPath: "date",
    autoIncrement: false,
    indexes: []
    // Shape: (pre-aggregated for fast dashboard loading)
    // {
    //   date: string (YYYY-MM-DD),
    //   totalTime: number (ms),
    //   productiveTime: number (ms),
    //   distractionTime: number (ms),
    //   neutralTime: number (ms),
    //   topDomains: [{ domain, duration, classification }],
    //   goalProgress: number (0-100)
    // }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // CLIPBOARD VAULT
  // ═══════════════════════════════════════════════════════════════════════
  clipboard_entries: {
    keyPath: "id",
    autoIncrement: true,
    indexes: [
      { name: "by_timestamp", keyPath: "timestamp" },
      { name: "by_domain", keyPath: "domain" },
      { name: "by_isCode", keyPath: "isCode" },
      { name: "by_expires", keyPath: "expiresAt" },
      { name: "by_hash", keyPath: "contentHash" }
    ]
    // Shape:
    // {
    //   id: number (auto),
    //   text: string,
    //   contentHash: string (for dedupe),
    //   contextBefore: string (up to 500 chars),
    //   contextAfter: string (up to 500 chars),
    //   url: string,
    //   domain: string,
    //   title: string,
    //   isCode: boolean,
    //   language: string | null,
    //   timestamp: number,
    //   expiresAt: number
    // }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // TAB COMMANDER
  // ═══════════════════════════════════════════════════════════════════════
  tab_sessions: {
    keyPath: "id",
    autoIncrement: true,
    indexes: [
      { name: "by_timestamp", keyPath: "createdAt" },
      { name: "by_name", keyPath: "name" },
      { name: "by_expires", keyPath: "expiresAt" }
    ]
    // Shape:
    // {
    //   id: number (auto),
    //   name: string,
    //   tabs: [{ url, title, favIconUrl, pinned, groupId }],
    //   tabCount: number,
    //   createdAt: number,
    //   expiresAt: number
    // }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // NETWORK SNIFFER
  // ═══════════════════════════════════════════════════════════════════════
  network_requests: {
    keyPath: "id",
    autoIncrement: true,
    indexes: [
      { name: "by_timestamp", keyPath: "timestamp" },
      { name: "by_domain", keyPath: "domain" },
      { name: "by_method", keyPath: "method" },
      { name: "by_status", keyPath: "statusCode" },
      { name: "by_expires", keyPath: "expiresAt" }
    ]
    // Shape:
    // {
    //   id: number (auto),
    //   url: string,
    //   domain: string,
    //   method: string,
    //   statusCode: number,
    //   requestHeaders: object,
    //   responseHeaders: object,
    //   duration: number (ms),
    //   tabId: number,
    //   tabUrl: string,
    //   timestamp: number,
    //   expiresAt: number
    // }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // LIFE DASHBOARD CACHE
  // ═══════════════════════════════════════════════════════════════════════
  external_cache: {
    keyPath: "key",
    autoIncrement: false,
    indexes: [
      { name: "by_expires", keyPath: "expiresAt" }
    ]
    // Shape:
    // {
    //   key: string (e.g., "calendar", "gmail", "github", "weather"),
    //   data: any,
    //   fetchedAt: number,
    //   expiresAt: number
    // }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // USER SETTINGS
  // ═══════════════════════════════════════════════════════════════════════
  settings: {
    keyPath: "key",
    autoIncrement: false,
    indexes: []
    // Shape:
    // {
    //   key: string,
    //   value: any
    // }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // EXPORT HISTORY
  // ═══════════════════════════════════════════════════════════════════════
  export_history: {
    keyPath: "id",
    autoIncrement: true,
    indexes: [
      { name: "by_timestamp", keyPath: "timestamp" }
    ]
    // Shape:
    // {
    //   id: number (auto),
    //   filename: string,
    //   timestamp: number,
    //   recordCount: number,
    //   sizeBytes: number,
    //   success: boolean,
    //   error: string | null
    // }
  }
};

// Retention period in milliseconds (30 days)
export const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

// Helper to calculate expiry timestamp
export const getExpiresAt = () => Date.now() + RETENTION_MS;
