/**
 * Configuration & Settings Management for AniMate
 *
 * All user preferences stored in IndexedDB "settings" store.
 * Provides defaults and type-safe access.
 */

import { db } from "../storage/db.js";

// Default configuration values
export const DEFAULT_CONFIG = {
  // ═══════════════════════════════════════════════════════════════════════
  // DATA RETENTION
  // ═══════════════════════════════════════════════════════════════════════
  retentionDays: 30,
  autoExport: true,
  exportFrequency: "weekly", // "daily" | "weekly"

  // ═══════════════════════════════════════════════════════════════════════
  // TRACKING EXCLUSIONS
  // ═══════════════════════════════════════════════════════════════════════
  excludedDomains: [
    // Auth/SSO pages (user preference)
    "accounts.google.com",
    "login.microsoftonline.com",
    "auth0.com",
    "okta.com",
    "login.okta.com"
  ],

  // Auth path patterns to exclude
  excludedPaths: [
    "/login",
    "/signin",
    "/auth",
    "/oauth",
    "/saml",
    "/sso",
    "/callback",
    "/2fa",
    "/mfa"
  ],

  // ═══════════════════════════════════════════════════════════════════════
  // FOCUS & PRODUCTIVITY
  // ═══════════════════════════════════════════════════════════════════════
  dailyFocusGoalMinutes: 240, // 4 hours
  distractionAlertMinutes: 60, // 1 hour cumulative
  enableDistractionAlerts: true,

  // ═══════════════════════════════════════════════════════════════════════
  // TAB MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════
  tabWarningThreshold: 20,
  enableTabWarnings: true,
  autoSnapshotMinutes: 60, // Snapshot tabs every hour

  // ═══════════════════════════════════════════════════════════════════════
  // CLIPBOARD
  // ═══════════════════════════════════════════════════════════════════════
  clipboardContextChars: 500, // Chars before/after selection
  detectCodeSnippets: true,

  // ═══════════════════════════════════════════════════════════════════════
  // AI CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════
  aiProvider: "anthropic", // "anthropic" | "openai" | "none"
  aiModel: "claude-3-haiku-20240307",
  aiEnabled: true,
  monthlyAiBudgetCents: 1000, // $10
  batchClassificationIntervalMinutes: 5,

  // ═══════════════════════════════════════════════════════════════════════
  // EXTERNAL SERVICES
  // ═══════════════════════════════════════════════════════════════════════
  // API keys stored separately (not in defaults for security)
  // anthropicApiKey: stored in settings
  // githubPat: stored in settings
  // weatherApiKey: stored in settings
  // googleAccessToken: stored in settings

  // VIP email senders to highlight
  vipEmailSenders: [],

  // Weather location (null = use geolocation)
  weatherLocation: null,

  // ═══════════════════════════════════════════════════════════════════════
  // EXECUTIVE FUNCTION SUPPORT
  // ═══════════════════════════════════════════════════════════════════════

  // Morning Briefing
  enableMorningBriefing: true,
  morningBriefingHour: 9, // 9 AM

  // Ready to Start Nudge
  enableStartNudges: true,
  readyCheckHour: 10, // 10 AM

  // End of Day Summary
  enableEndOfDaySummary: true,
  endOfDayHour: 18, // 6 PM

  // Meeting Awareness
  enableMeetingAwareness: true,
  meetingWarningMinutes: 5, // Minutes before meeting to notify

  // ═══════════════════════════════════════════════════════════════════════
  // UI PREFERENCES
  // ═══════════════════════════════════════════════════════════════════════
  theme: "dark", // Always dark for now
  popupWidth: 400,
  popupHeight: 500
};

// Known productive domains (built-in, no AI needed)
export const KNOWN_PRODUCTIVE = new Set([
  "github.com",
  "gitlab.com",
  "bitbucket.org",
  "stackoverflow.com",
  "developer.mozilla.org",
  "docs.google.com",
  "notion.so",
  "linear.app",
  "jira.atlassian.com",
  "trello.com",
  "asana.com",
  "figma.com",
  "vercel.com",
  "netlify.com",
  "aws.amazon.com",
  "console.cloud.google.com",
  "portal.azure.com",
  "claude.ai",
  "chat.openai.com",
  "localhost"
]);

// Known distracting domains (built-in, no AI needed)
export const KNOWN_DISTRACTIONS = new Set([
  "twitter.com",
  "x.com",
  "facebook.com",
  "instagram.com",
  "reddit.com",
  "youtube.com",
  "tiktok.com",
  "netflix.com",
  "twitch.tv",
  "discord.com",
  "hulu.com",
  "disneyplus.com",
  "primevideo.com",
  "9gag.com",
  "buzzfeed.com"
]);

/**
 * Get a setting value, with fallback to default
 */
export async function getSetting(key) {
  try {
    const record = await db.get("settings", key);
    if (record !== undefined) {
      return record.value;
    }
    // Return default if exists
    if (key in DEFAULT_CONFIG) {
      return DEFAULT_CONFIG[key];
    }
    return undefined;
  } catch (error) {
    console.error("[AniMate Config] Error getting setting:", key, error);
    return DEFAULT_CONFIG[key];
  }
}

/**
 * Set a setting value
 */
export async function setSetting(key, value) {
  try {
    await db.put("settings", { key, value });
    console.log("[AniMate Config] Set:", key);
    return true;
  } catch (error) {
    console.error("[AniMate Config] Error setting:", key, error);
    return false;
  }
}

/**
 * Get all settings as an object
 */
export async function getAllSettings() {
  try {
    const records = await db.getAll("settings");
    const settings = { ...DEFAULT_CONFIG };

    for (const record of records) {
      settings[record.key] = record.value;
    }

    return settings;
  } catch (error) {
    console.error("[AniMate Config] Error getting all settings:", error);
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Reset all settings to defaults
 */
export async function resetSettings() {
  try {
    await db.clear("settings");
    console.log("[AniMate Config] Reset to defaults");
    return true;
  } catch (error) {
    console.error("[AniMate Config] Error resetting:", error);
    return false;
  }
}

/**
 * Initialize settings with defaults (only sets missing values)
 */
export async function initializeSettings() {
  try {
    for (const [key, value] of Object.entries(DEFAULT_CONFIG)) {
      const existing = await db.get("settings", key);
      if (existing === undefined) {
        await db.put("settings", { key, value });
      }
    }
    console.log("[AniMate Config] Initialized");
    return true;
  } catch (error) {
    console.error("[AniMate Config] Error initializing:", error);
    return false;
  }
}

// Export convenience object
export const config = {
  get: getSetting,
  set: setSetting,
  getAll: getAllSettings,
  reset: resetSettings,
  initialize: initializeSettings,
  defaults: DEFAULT_CONFIG,
  KNOWN_PRODUCTIVE,
  KNOWN_DISTRACTIONS
};
