/**
 * Message Router for AniMate
 *
 * Central hub for all cross-context communication.
 * Handles messages between service worker, popup, dashboard, and content scripts.
 */

// Message types
export const MessageType = {
  QUERY: "QUERY",     // Read operations
  COMMAND: "COMMAND", // Write operations
  EVENT: "EVENT"      // Notifications/events
};

// Handler registry
const handlers = new Map();

/**
 * Register a message handler
 */
export function registerHandler(action, handler) {
  handlers.set(action, handler);
  console.log("[AniMate Router] Registered handler:", action);
}

/**
 * Unregister a message handler
 */
export function unregisterHandler(action) {
  handlers.delete(action);
}

/**
 * Initialize the message router
 * Call this in the service worker
 */
export function initializeRouter() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Validate message structure
    if (!message || !message.action) {
      sendResponse({ success: false, error: "Invalid message format" });
      return false;
    }

    const { type, action, payload, requestId } = message;
    const handler = handlers.get(action);

    if (!handler) {
      console.warn("[AniMate Router] No handler for:", action);
      sendResponse({
        success: false,
        error: `Unknown action: ${action}`,
        requestId
      });
      return false;
    }

    // Execute handler (may be async)
    const handleMessage = async () => {
      try {
        const result = await handler(payload, sender);
        sendResponse({
          success: true,
          data: result,
          requestId
        });
      } catch (error) {
        console.error("[AniMate Router] Handler error:", action, error);
        sendResponse({
          success: false,
          error: error.message,
          requestId
        });
      }
    };

    handleMessage();

    // Return true to indicate async response
    return true;
  });

  console.log("[AniMate Router] Initialized");
}

/**
 * Send a message to the service worker (from popup/dashboard/content scripts)
 */
export async function sendMessage(action, payload = {}, type = MessageType.QUERY) {
  const requestId = crypto.randomUUID();

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type, action, payload, requestId },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (!response) {
          reject(new Error("No response from service worker"));
          return;
        }

        if (response.success) {
          resolve(response.data);
        } else {
          reject(new Error(response.error || "Unknown error"));
        }
      }
    );
  });
}

/**
 * Send a message to a specific tab's content script
 */
export async function sendToTab(tabId, action, payload = {}) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(
      tabId,
      { type: MessageType.COMMAND, action, payload },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      }
    );
  });
}

/**
 * Broadcast a message to all tabs
 */
export async function broadcast(action, payload = {}) {
  const tabs = await chrome.tabs.query({});
  const results = [];

  for (const tab of tabs) {
    try {
      const result = await sendToTab(tab.id, action, payload);
      results.push({ tabId: tab.id, result });
    } catch (error) {
      // Ignore tabs that can't receive messages (e.g., chrome:// pages)
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════
// ACTION CONSTANTS (for type safety)
// ═══════════════════════════════════════════════════════════════════════

export const Actions = {
  // Browsing
  GET_BROWSING_STATS: "GET_BROWSING_STATS",
  GET_TODAYS_SESSIONS: "GET_TODAYS_SESSIONS",
  GET_DOMAIN_STATS: "GET_DOMAIN_STATS",

  // Clipboard
  CLIPBOARD_COPY: "CLIPBOARD_COPY",
  GET_CLIPBOARD_HISTORY: "GET_CLIPBOARD_HISTORY",
  SEARCH_CLIPBOARD: "SEARCH_CLIPBOARD",

  // Tabs
  GET_TAB_COUNT: "GET_TAB_COUNT",
  SAVE_TAB_SESSION: "SAVE_TAB_SESSION",
  GET_TAB_SESSIONS: "GET_TAB_SESSIONS",
  RESTORE_TAB_SESSION: "RESTORE_TAB_SESSION",

  // Network
  GET_NETWORK_LOG: "GET_NETWORK_LOG",

  // Settings
  GET_SETTINGS: "GET_SETTINGS",
  SET_SETTING: "SET_SETTING",

  // External APIs
  GET_CALENDAR_EVENTS: "GET_CALENDAR_EVENTS",
  GET_GMAIL_UNREAD: "GET_GMAIL_UNREAD",
  GET_GITHUB_REPOS: "GET_GITHUB_REPOS",
  GET_WEATHER: "GET_WEATHER",

  // AI
  CLASSIFY_DOMAIN: "CLASSIFY_DOMAIN",
  GET_DAILY_INSIGHTS: "GET_DAILY_INSIGHTS",

  // Export
  RUN_EXPORT: "RUN_EXPORT",
  GET_EXPORT_HISTORY: "GET_EXPORT_HISTORY"
};

// Export convenience object
export const router = {
  MessageType,
  Actions,
  registerHandler,
  unregisterHandler,
  initializeRouter,
  sendMessage,
  sendToTab,
  broadcast
};
