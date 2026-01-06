/**
 * AniMate Service Worker
 *
 * Central orchestrator for all extension functionality.
 * Coordinates collectors, handles messages, and manages alarms.
 */

import { db } from "../storage/db.js";
import { config, initializeSettings } from "../utils/config.js";
import { router, Actions } from "./message-router.js";
import { github } from "../api/github.js";
import { weather } from "../api/weather.js";
import { anthropic } from "../api/anthropic.js";
import { networkCollector } from "../collectors/network-collector.js";
import { exporter } from "../utils/export.js";
import { googleAuth } from "../api/google-auth.js";
import { calendar } from "../api/google-calendar.js";
import { gmail } from "../api/google-gmail.js";

// ═══════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Initialize the extension on install or browser start
 */
async function initialize() {
  console.log("[AniMate] Initializing service worker...");

  try {
    // Open database
    await db.openDB();
    console.log("[AniMate] Database ready");

    // Initialize settings with defaults
    await initializeSettings();
    console.log("[AniMate] Settings initialized");

    // Initialize message router
    router.initializeRouter();
    registerHandlers();
    console.log("[AniMate] Message router ready");

    // Set up alarms for periodic tasks
    setupAlarms();
    console.log("[AniMate] Alarms configured");

    // Initialize network collector
    networkCollector.init();
    console.log("[AniMate] Network collector ready");

    console.log("[AniMate] Service worker initialized successfully");
  } catch (error) {
    console.error("[AniMate] Initialization failed:", error);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// MESSAGE HANDLERS
// ═══════════════════════════════════════════════════════════════════════

function registerHandlers() {
  // Settings
  router.registerHandler(Actions.GET_SETTINGS, async () => {
    return await config.getAll();
  });

  router.registerHandler(Actions.SET_SETTING, async ({ key, value }) => {
    return await config.set(key, value);
  });

  // Browsing stats (placeholder - will be implemented in browsing-collector.js)
  router.registerHandler(Actions.GET_BROWSING_STATS, async ({ date }) => {
    const targetDate = date || new Date().toISOString().slice(0, 10);
    const stats = await db.get("daily_stats", targetDate);
    return stats || {
      date: targetDate,
      totalTime: 0,
      productiveTime: 0,
      distractionTime: 0,
      neutralTime: 0,
      topDomains: [],
      goalProgress: 0
    };
  });

  router.registerHandler(Actions.GET_TODAYS_SESSIONS, async () => {
    const today = new Date().toISOString().slice(0, 10);
    return await db.getAllFromIndex("browsing_sessions", "by_date", today);
  });

  // Clipboard history
  router.registerHandler(Actions.GET_CLIPBOARD_HISTORY, async ({ limit }) => {
    const entries = await db.getAll("clipboard_entries", limit || 50);
    return entries.sort((a, b) => b.timestamp - a.timestamp);
  });

  // Tab sessions
  router.registerHandler(Actions.GET_TAB_COUNT, async () => {
    const tabs = await chrome.tabs.query({});
    return tabs.length;
  });

  router.registerHandler(Actions.SAVE_TAB_SESSION, async ({ name }) => {
    const tabs = await chrome.tabs.query({});
    const session = {
      name: name || `Session ${new Date().toLocaleString()}`,
      tabs: tabs.map(t => ({
        url: t.url,
        title: t.title,
        favIconUrl: t.favIconUrl,
        pinned: t.pinned,
        groupId: t.groupId
      })),
      tabCount: tabs.length,
      createdAt: Date.now(),
      expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000)
    };
    const id = await db.put("tab_sessions", session);
    return { id, ...session };
  });

  router.registerHandler(Actions.GET_TAB_SESSIONS, async ({ limit }) => {
    const sessions = await db.getAll("tab_sessions", limit || 20);
    return sessions.sort((a, b) => b.createdAt - a.createdAt);
  });

  router.registerHandler(Actions.RESTORE_TAB_SESSION, async ({ sessionId }) => {
    const session = await db.get("tab_sessions", sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    for (const tab of session.tabs) {
      await chrome.tabs.create({ url: tab.url, pinned: tab.pinned });
    }

    return { restored: session.tabs.length };
  });

  // Network log
  router.registerHandler(Actions.GET_NETWORK_LOG, async ({ limit, domain }) => {
    let requests;
    if (domain) {
      requests = await db.getAllFromIndex("network_requests", "by_domain", domain, limit || 100);
    } else {
      requests = await db.getAll("network_requests", limit || 100);
    }
    return requests.sort((a, b) => b.timestamp - a.timestamp);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // EXTERNAL API HANDLERS
  // ═══════════════════════════════════════════════════════════════════════

  // GitHub
  router.registerHandler(Actions.GET_GITHUB_REPOS, async () => {
    const cacheKey = "github_dashboard";
    const cached = await db.get("external_cache", cacheKey);

    // Return cached if fresh (5 minute TTL)
    if (cached && Date.now() - cached.fetchedAt < 5 * 60 * 1000) {
      return cached.data;
    }

    try {
      const data = await github.getDashboardData();

      // Cache the result
      await db.put("external_cache", {
        key: cacheKey,
        data,
        fetchedAt: Date.now(),
        expiresAt: Date.now() + (24 * 60 * 60 * 1000)
      });

      return data;
    } catch (error) {
      // Return stale cache on error
      if (cached) {
        return { ...cached.data, stale: true };
      }
      throw error;
    }
  });

  // Weather
  router.registerHandler(Actions.GET_WEATHER, async () => {
    const cacheKey = "weather_dashboard";
    const cached = await db.get("external_cache", cacheKey);

    // Return cached if fresh (15 minute TTL for weather)
    if (cached && Date.now() - cached.fetchedAt < 15 * 60 * 1000) {
      return cached.data;
    }

    try {
      const data = await weather.getDashboardWeather();

      // Cache the result
      await db.put("external_cache", {
        key: cacheKey,
        data,
        fetchedAt: Date.now(),
        expiresAt: Date.now() + (24 * 60 * 60 * 1000)
      });

      return data;
    } catch (error) {
      // Return stale cache on error
      if (cached) {
        return { ...cached.data, stale: true };
      }
      throw error;
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // GOOGLE API HANDLERS
  // ═══════════════════════════════════════════════════════════════════════

  // Google Auth - check status
  router.registerHandler("GOOGLE_AUTH_STATUS", async () => {
    return { authenticated: await googleAuth.isAuthenticated() };
  });

  // Google Auth - sign in (interactive)
  router.registerHandler("GOOGLE_SIGN_IN", async () => {
    await googleAuth.signIn();
    return { success: true };
  });

  // Google Auth - sign out
  router.registerHandler("GOOGLE_SIGN_OUT", async () => {
    await googleAuth.signOut();
    await calendar.clearCache();
    await gmail.clearCache();
    return { success: true };
  });

  // Google Calendar - today's events
  router.registerHandler(Actions.GET_CALENDAR_EVENTS, async () => {
    try {
      const events = await calendar.getTodaysEvents();
      return { events, authenticated: true };
    } catch (error) {
      if (error.message.includes("Not authenticated")) {
        return { events: [], authenticated: false };
      }
      throw error;
    }
  });

  // Google Gmail - unread emails
  router.registerHandler(Actions.GET_GMAIL_UNREAD, async () => {
    try {
      const data = await gmail.getUnreadEmails();
      return { ...data, authenticated: true };
    } catch (error) {
      if (error.message.includes("Not authenticated")) {
        return { totalUnread: 0, emails: [], vipCount: 0, authenticated: false };
      }
      throw error;
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // AI HANDLERS
  // ═══════════════════════════════════════════════════════════════════════

  // Classify domain(s)
  router.registerHandler(Actions.CLASSIFY_DOMAIN, async ({ domains }) => {
    if (!domains || domains.length === 0) {
      return [];
    }

    // Check cache first
    const uncached = [];
    const results = [];

    for (const domain of domains) {
      const cached = await db.get("domain_classifications", domain);
      if (cached) {
        results.push(cached);
      } else {
        uncached.push(domain);
      }
    }

    // Classify uncached domains
    if (uncached.length > 0) {
      const enabled = await anthropic.isAIEnabled();
      if (enabled) {
        try {
          const classified = await anthropic.classifyDomains(uncached);

          // Cache results
          for (const item of classified.classifications) {
            const record = {
              domain: item.domain,
              classification: item.classification,
              confidence: item.confidence,
              reason: item.reason,
              classifiedAt: Date.now(),
              source: "ai"
            };
            await db.put("domain_classifications", record);
            results.push(record);
          }
        } catch (error) {
          console.error("[AniMate] AI classification failed:", error);
          // Fall back to neutral for uncached
          for (const domain of uncached) {
            results.push({
              domain,
              classification: "neutral",
              confidence: 0,
              source: "fallback"
            });
          }
        }
      }
    }

    return results;
  });

  // Daily insights
  router.registerHandler(Actions.GET_DAILY_INSIGHTS, async () => {
    const today = new Date().toISOString().slice(0, 10);
    const stats = await db.get("daily_stats", today);

    if (!stats || stats.totalTime === 0) {
      return { insight: "Start browsing to get insights!", generatedAt: Date.now() };
    }

    const enabled = await anthropic.isAIEnabled();
    if (!enabled) {
      return {
        insight: "Enable AI in settings to get personalized insights.",
        generatedAt: Date.now()
      };
    }

    try {
      return await anthropic.generateDailyInsights(stats);
    } catch (error) {
      console.error("[AniMate] Insights generation failed:", error);
      return {
        insight: "Unable to generate insights right now.",
        error: error.message,
        generatedAt: Date.now()
      };
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // CLIPBOARD EVENT HANDLER
  // ═══════════════════════════════════════════════════════════════════════

  router.registerHandler(Actions.CLIPBOARD_COPY, async (payload) => {
    const entry = {
      ...payload,
      id: crypto.randomUUID(),
      expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000)
    };

    await db.put("clipboard_entries", entry);
    console.log("[AniMate] Clipboard entry saved:", entry.text.slice(0, 50));
    return { saved: true };
  });

  // ═══════════════════════════════════════════════════════════════════════
  // EXPORT HANDLERS
  // ═══════════════════════════════════════════════════════════════════════

  router.registerHandler(Actions.RUN_EXPORT, async ({ startDate, endDate }) => {
    const filename = await exporter.manualExport(startDate, endDate);
    return { success: true, filename };
  });

  router.registerHandler(Actions.GET_EXPORT_HISTORY, async () => {
    return await exporter.getExportHistory();
  });
}

// ═══════════════════════════════════════════════════════════════════════
// ALARMS (Periodic Tasks)
// ═══════════════════════════════════════════════════════════════════════

function setupAlarms() {
  // Heartbeat - persist active session every 30 seconds
  chrome.alarms.create("heartbeat", { periodInMinutes: 0.5 });

  // Cleanup - delete expired records daily
  chrome.alarms.create("cleanup", { periodInMinutes: 1440 });

  // Export - weekly data export
  chrome.alarms.create("export", { periodInMinutes: 10080 });

  // Batch classification - process unclassified domains
  chrome.alarms.create("classify", { periodInMinutes: 5 });

  // ═══════════════════════════════════════════════════════════════════════
  // EXECUTIVE FUNCTION ALARMS
  // ═══════════════════════════════════════════════════════════════════════

  // Morning briefing - check every minute, trigger at configured time
  chrome.alarms.create("morning_briefing", { periodInMinutes: 1 });

  // Ready to start nudge - check every minute, trigger if no productive activity
  chrome.alarms.create("ready_check", { periodInMinutes: 1 });

  // End of day summary - check every minute, trigger at configured time
  chrome.alarms.create("end_of_day", { periodInMinutes: 1 });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  console.log("[AniMate] Alarm fired:", alarm.name);

  switch (alarm.name) {
    case "heartbeat":
      await persistActiveSession();
      await aggregateDailyStats();
      await checkProgressMilestones();
      await checkDistractionAlert();
      await checkMeetingAwareness();
      break;

    case "cleanup":
      await runCleanup();
      break;

    case "export":
      await exporter.runWeeklyExport();
      break;

    case "classify":
      await batchClassifyDomains();
      break;

    // ═══════════════════════════════════════════════════════════════════════
    // EXECUTIVE FUNCTION ALARMS
    // ═══════════════════════════════════════════════════════════════════════

    case "morning_briefing":
      await checkMorningBriefing();
      break;

    case "ready_check":
      await checkReadyToStart();
      break;

    case "end_of_day":
      await checkEndOfDay();
      break;
  }
});

/**
 * Persist current active session (heartbeat)
 */
async function persistActiveSession() {
  if (!activeTabState) return;

  const now = Date.now();
  const duration = now - activeTabState.startTime;

  // Only persist if meaningful duration
  if (duration > 5000) {
    const session = {
      ...activeTabState,
      endTime: now,
      duration
    };
    await db.put("browsing_sessions", session);

    // Reset start time for next heartbeat
    activeTabState.startTime = now;
  }
}

/**
 * Aggregate daily browsing stats
 */
async function aggregateDailyStats() {
  const today = new Date().toISOString().slice(0, 10);
  const sessions = await db.getAllFromIndex("browsing_sessions", "by_date", today);

  // Aggregate by domain
  const domainMap = new Map();
  let totalTime = 0;
  let productiveTime = 0;
  let distractionTime = 0;
  let neutralTime = 0;

  for (const session of sessions) {
    const duration = session.duration || 0;
    totalTime += duration;

    // Get classification
    let classification = session.classification || "unclassified";
    if (classification === "unclassified") {
      const cached = await db.get("domain_classifications", session.domain);
      if (cached) {
        classification = cached.classification;
      }
    }

    // Aggregate by classification
    switch (classification) {
      case "productive":
        productiveTime += duration;
        break;
      case "distraction":
        distractionTime += duration;
        break;
      default:
        neutralTime += duration;
    }

    // Aggregate by domain
    const existing = domainMap.get(session.domain) || { duration: 0, classification };
    existing.duration += duration;
    domainMap.set(session.domain, existing);
  }

  // Sort domains by time
  const topDomains = Array.from(domainMap.entries())
    .map(([domain, data]) => ({ domain, ...data }))
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 20);

  // Calculate goal progress
  const goalMinutes = await config.get("focusGoalMinutes") || 240;
  const goalProgress = Math.min(Math.round((productiveTime / (goalMinutes * 60000)) * 100), 100);

  const stats = {
    date: today,
    totalTime,
    productiveTime,
    distractionTime,
    neutralTime,
    topDomains,
    goalProgress,
    sessionCount: sessions.length,
    updatedAt: Date.now()
  };

  await db.put("daily_stats", stats);
}

/**
 * Batch classify unclassified domains
 */
async function batchClassifyDomains() {
  const enabled = await anthropic.isAIEnabled();
  if (!enabled) return;

  // Find sessions with unclassified domains
  const today = new Date().toISOString().slice(0, 10);
  const sessions = await db.getAllFromIndex("browsing_sessions", "by_date", today);

  const uncached = new Set();
  for (const session of sessions) {
    if (session.classification === "unclassified") {
      const cached = await db.get("domain_classifications", session.domain);
      if (!cached) {
        uncached.add(session.domain);
      }
    }
  }

  if (uncached.size === 0) return;

  // Classify up to 20 domains at a time
  const domainsToClassify = Array.from(uncached).slice(0, 20);
  console.log("[AniMate] Batch classifying domains:", domainsToClassify.length);

  try {
    const result = await anthropic.classifyDomains(domainsToClassify);

    for (const item of result.classifications) {
      await db.put("domain_classifications", {
        domain: item.domain,
        classification: item.classification,
        confidence: item.confidence,
        reason: item.reason,
        classifiedAt: Date.now(),
        source: "ai"
      });
    }

    // Re-aggregate stats with new classifications
    await aggregateDailyStats();
  } catch (error) {
    console.error("[AniMate] Batch classification failed:", error);
  }
}

/**
 * Delete expired records from all stores
 */
async function runCleanup() {
  console.log("[AniMate] Running cleanup...");

  const stores = [
    "browsing_sessions",
    "clipboard_entries",
    "tab_sessions",
    "network_requests",
    "external_cache"
  ];

  let totalDeleted = 0;
  for (const store of stores) {
    try {
      const deleted = await db.deleteExpired(store);
      totalDeleted += deleted;
    } catch (error) {
      console.error(`[AniMate] Cleanup error in ${store}:`, error);
    }
  }

  console.log(`[AniMate] Cleanup complete. Deleted ${totalDeleted} records.`);
}

// ═══════════════════════════════════════════════════════════════════════
// EXECUTIVE FUNCTION: TASK INITIATION SUPPORT
// ═══════════════════════════════════════════════════════════════════════

/**
 * Morning Briefing - Push notification at configured time (default 9 AM)
 * Helps with task initiation by providing external prompt to start the day
 */
async function checkMorningBriefing() {
  resetDailyStateIfNeeded();
  if (dailyState.morningBriefingSent) return;

  const enabled = await config.get("enableMorningBriefing");
  if (enabled === false) return;

  const briefingHour = await config.get("morningBriefingHour") || 9;
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  // Trigger at the configured hour (within first 2 minutes)
  if (currentHour === briefingHour && currentMinute < 2) {
    dailyState.morningBriefingSent = true;

    // Gather briefing data
    const [weatherData, calendarData, yesterdayStats] = await Promise.all([
      safeCall(() => weather.getDashboardWeather()),
      safeCall(() => calendar.getTodaysEvents()),
      safeCall(() => getYesterdayStats())
    ]);

    // Build briefing message
    let message = "Good morning! Here's your day:\n";

    // First meeting
    if (calendarData?.length > 0) {
      const first = calendarData[0];
      const time = new Date(first.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      message += `📅 First: ${first.title} at ${time}\n`;
    }

    // Yesterday's focus
    if (yesterdayStats) {
      const hours = Math.floor(yesterdayStats.productiveTime / 3600000);
      const mins = Math.floor((yesterdayStats.productiveTime % 3600000) / 60000);
      message += `⏱️ Yesterday: ${hours}h ${mins}m focused\n`;
    }

    // Weather
    if (weatherData?.current) {
      message += `🌤️ ${weatherData.current.temp}°F, ${weatherData.current.condition}`;
    }

    chrome.notifications.create("morning_briefing", {
      type: "basic",
      iconUrl: chrome.runtime.getURL("assets/icon-128.png"),
      title: "AniMate: Good Morning!",
      message,
      priority: 2,
      requireInteraction: true
    });

    console.log("[AniMate] Morning briefing sent");
  }
}

/**
 * Ready to Start Nudge - Gentle prompt if no productive activity by 10 AM
 * Addresses task initiation difficulty with external prompt
 */
async function checkReadyToStart() {
  resetDailyStateIfNeeded();
  if (dailyState.readyNudgeSent || dailyState.firstProductiveCelebrated) return;

  const enabled = await config.get("enableStartNudges");
  if (enabled === false) return;

  const nudgeHour = await config.get("readyCheckHour") || 10;
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  // Trigger at configured hour (within first 2 minutes)
  if (currentHour === nudgeHour && currentMinute < 2) {
    // Check if there's been any productive activity today
    const today = new Date().toISOString().slice(0, 10);
    const stats = await db.get("daily_stats", today);

    if (!stats || stats.productiveTime < 60000) { // Less than 1 minute productive
      dailyState.readyNudgeSent = true;

      // Get first meeting for context
      const calendarData = await safeCall(() => calendar.getTodaysEvents());
      let message = "Ready to start your day?";

      if (calendarData?.length > 0) {
        const first = calendarData[0];
        const time = new Date(first.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
        message = `Ready to start? Your first meeting is at ${time}.`;
      }

      chrome.notifications.create("ready_nudge", {
        type: "basic",
        iconUrl: chrome.runtime.getURL("assets/icon-128.png"),
        title: "AniMate: Hey!",
        message,
        priority: 1
      });

      console.log("[AniMate] Ready to start nudge sent");
    }
  }
}

/**
 * End of Day Summary - Reflective summary at configured time (default 6 PM)
 */
async function checkEndOfDay() {
  const enabled = await config.get("enableEndOfDaySummary");
  if (enabled === false) return;

  const summaryHour = await config.get("endOfDayHour") || 18;
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  // Check if we've already sent today's summary
  const summaryKey = `eod_${now.toISOString().slice(0, 10)}`;
  const alreadySent = await db.get("settings", summaryKey);
  if (alreadySent) return;

  if (currentHour === summaryHour && currentMinute < 2) {
    await db.put("settings", { key: summaryKey, value: true });

    const today = now.toISOString().slice(0, 10);
    const stats = await db.get("daily_stats", today);

    if (stats && stats.productiveTime > 0) {
      const hours = Math.floor(stats.productiveTime / 3600000);
      const mins = Math.floor((stats.productiveTime % 3600000) / 60000);
      const goalMinutes = await config.get("dailyFocusGoalMinutes") || 240;
      const goalPercent = Math.round((stats.productiveTime / (goalMinutes * 60000)) * 100);

      const message = `Today: ${hours}h ${mins}m focused (${goalPercent}% of goal)\nTop site: ${stats.topDomains?.[0]?.domain || "N/A"}`;

      chrome.notifications.create("end_of_day", {
        type: "basic",
        iconUrl: chrome.runtime.getURL("assets/icon-128.png"),
        title: "AniMate: Day Summary",
        message,
        priority: 1
      });

      console.log("[AniMate] End of day summary sent");
    }
  }
}

/**
 * Check and celebrate progress milestones
 * Positive reinforcement for hitting 1hr, daily goal, or personal best
 */
async function checkProgressMilestones() {
  resetDailyStateIfNeeded();

  const today = new Date().toISOString().slice(0, 10);
  const stats = await db.get("daily_stats", today);
  if (!stats) return;

  const productiveMs = stats.productiveTime || 0;
  const goalMinutes = await config.get("dailyFocusGoalMinutes") || 240;
  const goalMs = goalMinutes * 60 * 1000;

  // Celebrate 1 hour milestone
  if (!dailyState.oneHourCelebrated && productiveMs >= 3600000) {
    dailyState.oneHourCelebrated = true;
    chrome.notifications.create("milestone_1hr", {
      type: "basic",
      iconUrl: chrome.runtime.getURL("assets/icon-128.png"),
      title: "AniMate: Nice Progress!",
      message: "1 hour focused! Keep it up! 🚀",
      priority: 1
    });
    console.log("[AniMate] 1-hour milestone celebrated");
  }

  // Celebrate daily goal
  if (!dailyState.goalCelebrated && productiveMs >= goalMs) {
    dailyState.goalCelebrated = true;
    chrome.notifications.create("milestone_goal", {
      type: "basic",
      iconUrl: chrome.runtime.getURL("assets/icon-128.png"),
      title: "AniMate: Goal Reached!",
      message: `🎉 You hit your ${goalMinutes / 60}-hour goal! Amazing work!`,
      priority: 2
    });
    console.log("[AniMate] Daily goal celebrated");
  }
}

/**
 * Check and send gentle distraction alert
 * Supportive, not judgmental - helps with impulse control
 */
async function checkDistractionAlert() {
  resetDailyStateIfNeeded();

  const enabled = await config.get("enableDistractionAlerts");
  if (enabled === false) return;

  const now = Date.now();
  const cooldown = 30 * 60 * 1000; // 30 minutes between alerts

  if (now - dailyState.lastDistractionAlert < cooldown) return;

  const today = new Date().toISOString().slice(0, 10);
  const stats = await db.get("daily_stats", today);
  if (!stats) return;

  const distractionMs = stats.distractionTime || 0;
  const thresholdMinutes = await config.get("distractionAlertMinutes") || 60;
  const thresholdMs = thresholdMinutes * 60 * 1000;

  if (distractionMs >= thresholdMs) {
    dailyState.lastDistractionAlert = now;

    // Gentle, supportive message
    const mins = Math.floor(distractionMs / 60000);
    const message = `You've been browsing for ${mins} minutes. Ready to get back to it?`;

    chrome.notifications.create("distraction_alert", {
      type: "basic",
      iconUrl: chrome.runtime.getURL("assets/icon-128.png"),
      title: "AniMate: Gentle Nudge",
      message,
      priority: 1
    });
    console.log("[AniMate] Distraction alert sent");
  }
}

/**
 * Meeting Awareness - Gentle heads-up before meetings
 * Helps with time blindness and transition preparation
 */
async function checkMeetingAwareness() {
  const enabled = await config.get("enableMeetingAwareness");
  if (enabled === false) return;

  // Get today's events
  const events = await safeCall(() => calendar.getTodaysEvents());
  if (!events || events.length === 0) return;

  const now = Date.now();
  const warningMinutes = await config.get("meetingWarningMinutes") || 5;
  const warningWindowMs = warningMinutes * 60 * 1000;
  const bufferMs = 60 * 1000; // 1 minute buffer for heartbeat timing

  for (const event of events) {
    // Skip if already notified
    if (notifiedMeetings.has(event.id)) continue;

    const startTime = new Date(event.start).getTime();
    const timeUntilStart = startTime - now;

    // Notify if meeting starts in 4-7 minutes (gives buffer for heartbeat timing)
    if (timeUntilStart > (warningWindowMs - bufferMs) && timeUntilStart <= (warningWindowMs + 2 * bufferMs)) {
      notifiedMeetings.add(event.id);

      const minsUntil = Math.round(timeUntilStart / 60000);
      const timeStr = new Date(event.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

      chrome.notifications.create(`meeting_${event.id}`, {
        type: "basic",
        iconUrl: chrome.runtime.getURL("assets/icon-128.png"),
        title: "AniMate: Heads up!",
        message: `📅 "${event.title}" starts in ~${minsUntil} min (${timeStr})`,
        priority: 2,
        requireInteraction: false
      });

      console.log("[AniMate] Meeting awareness sent for:", event.title);
    }
  }

  // Clean up old notified meetings (keep Set from growing indefinitely)
  // Remove events that are more than 1 hour in the past
  for (const eventId of notifiedMeetings) {
    const event = events.find(e => e.id === eventId);
    if (event) {
      const startTime = new Date(event.start).getTime();
      if (now - startTime > 60 * 60 * 1000) {
        notifiedMeetings.delete(eventId);
      }
    }
  }
}

/**
 * Helper: Safely call async function, return null on error
 */
async function safeCall(fn) {
  try {
    return await fn();
  } catch {
    return null;
  }
}

/**
 * Helper: Get yesterday's stats
 */
async function getYesterdayStats() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().slice(0, 10);
  return await db.get("daily_stats", dateStr);
}

// ═══════════════════════════════════════════════════════════════════════
// LIFECYCLE EVENTS
// ═══════════════════════════════════════════════════════════════════════

chrome.runtime.onInstalled.addListener((details) => {
  console.log("[AniMate] Installed:", details.reason);
  initialize();
});

chrome.runtime.onStartup.addListener(() => {
  console.log("[AniMate] Browser started");
  initialize();
});

// Initialize immediately (service worker may wake up without install/startup)
initialize();

// ═══════════════════════════════════════════════════════════════════════
// TAB EVENTS (Browsing Intelligence)
// ═══════════════════════════════════════════════════════════════════════

// Track active tab state
let activeTabState = null;

// ═══════════════════════════════════════════════════════════════════════
// EXECUTIVE FUNCTION STATE
// ═══════════════════════════════════════════════════════════════════════

// Daily state (resets each day)
let dailyState = {
  date: null,
  morningBriefingSent: false,
  readyNudgeSent: false,
  firstProductiveCelebrated: false,
  lastDistractionAlert: 0,
  oneHourCelebrated: false,
  goalCelebrated: false
};

// Track which meetings we've already notified about (by event ID)
const notifiedMeetings = new Set();

function resetDailyStateIfNeeded() {
  const today = new Date().toISOString().slice(0, 10);
  if (dailyState.date !== today) {
    dailyState = {
      date: today,
      morningBriefingSent: false,
      readyNudgeSent: false,
      firstProductiveCelebrated: false,
      lastDistractionAlert: 0,
      oneHourCelebrated: false,
      goalCelebrated: false
    };
  }
}

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    handleTabChange(tab);
  } catch (error) {
    console.error("[AniMate] Tab activation error:", error);
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.active) {
    handleTabChange(tab);
  }
});

async function handleTabChange(tab) {
  const now = Date.now();

  // End previous session if exists
  if (activeTabState) {
    const duration = now - activeTabState.startTime;
    if (duration > 1000) { // Only save if > 1 second
      const session = {
        ...activeTabState,
        endTime: now,
        duration
      };
      await db.put("browsing_sessions", session);
    }
  }

  // Skip tracking for excluded URLs
  if (shouldExclude(tab.url)) {
    activeTabState = null;
    return;
  }

  // Start new session
  const domain = extractDomain(tab.url);
  const date = new Date().toISOString().slice(0, 10);

  activeTabState = {
    url: tab.url,
    domain,
    title: tab.title,
    startTime: now,
    date,
    classification: "unclassified",
    expiresAt: now + (30 * 24 * 60 * 60 * 1000)
  };

  // ═══════════════════════════════════════════════════════════════════════
  // FIRST PRODUCTIVE ACTION CELEBRATION
  // ═══════════════════════════════════════════════════════════════════════
  await celebrateFirstProductiveAction(domain);
}

/**
 * Celebrate first productive site visit of the day
 * Positive reinforcement for task initiation - no judgment on timing
 */
async function celebrateFirstProductiveAction(domain) {
  resetDailyStateIfNeeded();
  if (dailyState.firstProductiveCelebrated) return;

  // Check if this domain is productive
  const isProductive = await checkIfProductive(domain);
  if (!isProductive) return;

  dailyState.firstProductiveCelebrated = true;

  // Record start time for pattern analysis
  const startTimeRecord = {
    key: `work_start_${new Date().toISOString().slice(0, 10)}`,
    value: Date.now()
  };
  await db.put("settings", startTimeRecord);

  chrome.notifications.create("first_productive", {
    type: "basic",
    iconUrl: chrome.runtime.getURL("assets/icon-128.png"),
    title: "AniMate: Great Start!",
    message: "Nice! You're off to a productive start. 🚀",
    priority: 1
  });
  console.log("[AniMate] First productive action celebrated:", domain);
}

/**
 * Check if a domain is considered productive
 */
async function checkIfProductive(domain) {
  // Check known productive domains first (from config)
  const knownProductive = config.KNOWN_PRODUCTIVE;
  if (knownProductive && knownProductive.has(domain)) {
    return true;
  }

  // Check AI classification cache
  const cached = await db.get("domain_classifications", domain);
  if (cached && cached.classification === "productive") {
    return true;
  }

  return false;
}

function shouldExclude(url) {
  if (!url) return true;

  // Exclude chrome:// and extension pages
  if (url.startsWith("chrome://") || url.startsWith("chrome-extension://")) {
    return true;
  }

  // Exclude about: pages
  if (url.startsWith("about:")) {
    return true;
  }

  // Check for auth/SSO patterns
  const authPatterns = [
    "accounts.google.com",
    "login.microsoftonline.com",
    "auth0.com",
    "/login",
    "/signin",
    "/auth",
    "/oauth",
    "/sso"
  ];

  const urlLower = url.toLowerCase();
  return authPatterns.some(pattern => urlLower.includes(pattern));
}

function extractDomain(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return "unknown";
  }
}

// ═══════════════════════════════════════════════════════════════════════
// TAB COUNT WARNING
// ═══════════════════════════════════════════════════════════════════════

chrome.tabs.onCreated.addListener(async () => {
  const tabs = await chrome.tabs.query({});
  const threshold = await config.get("tabWarningThreshold") || 20;
  const enabled = await config.get("enableTabWarnings");

  if (enabled && tabs.length >= threshold) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: chrome.runtime.getURL("assets/icon-128.png"),
      title: "AniMate: Tab Alert",
      message: `You have ${tabs.length} tabs open. Consider closing some!`,
      priority: 1
    });
  }
});

console.log("[AniMate] Service worker loaded");
