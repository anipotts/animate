/**
 * AniMate Options Page Script
 *
 * Settings management UI
 */

import { router, Actions } from "../src/background/message-router.js";

// ═══════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", async () => {
  console.log("[AniMate Options] Initializing...");

  await loadSettings();
  setupEventListeners();

  console.log("[AniMate Options] Ready");
});

// ═══════════════════════════════════════════════════════════════════════
// LOAD SETTINGS
// ═══════════════════════════════════════════════════════════════════════

async function loadSettings() {
  try {
    const settings = await router.sendMessage(Actions.GET_SETTINGS, {});

    // Focus & Productivity
    setSelectValue("dailyFocusGoalMinutes", settings.dailyFocusGoalMinutes);
    setSelectValue("distractionAlertMinutes", settings.distractionAlertMinutes);
    setCheckbox("enableDistractionAlerts", settings.enableDistractionAlerts);

    // Tab Management
    setSelectValue("tabWarningThreshold", settings.tabWarningThreshold);
    setCheckbox("enableTabWarnings", settings.enableTabWarnings);

    // AI Configuration
    setInputValue("anthropicApiKey", settings.anthropicApiKey || "");
    setCheckbox("aiEnabled", settings.aiEnabled);

    // External Services
    setInputValue("githubPat", settings.githubPat || "");
    setInputValue("weatherApiKey", settings.weatherApiKey || "");

    // Data Management
    setSelectValue("retentionDays", settings.retentionDays);
    setCheckbox("autoExport", settings.autoExport);

  } catch (error) {
    console.error("[AniMate Options] Error loading settings:", error);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════════════════════════════════

function setupEventListeners() {
  // Auto-save on change for all inputs
  const settingsMap = {
    "dailyFocusGoalMinutes": { type: "number" },
    "distractionAlertMinutes": { type: "number" },
    "enableDistractionAlerts": { type: "boolean" },
    "tabWarningThreshold": { type: "number" },
    "enableTabWarnings": { type: "boolean" },
    "anthropicApiKey": { type: "string" },
    "aiEnabled": { type: "boolean" },
    "githubPat": { type: "string" },
    "weatherApiKey": { type: "string" },
    "retentionDays": { type: "number" },
    "autoExport": { type: "boolean" }
  };

  for (const [id, config] of Object.entries(settingsMap)) {
    const element = document.getElementById(id);
    if (!element) continue;

    const eventType = element.type === "checkbox" ? "change" : "change";

    element.addEventListener(eventType, async () => {
      let value;

      if (element.type === "checkbox") {
        value = element.checked;
      } else if (config.type === "number") {
        value = parseInt(element.value, 10);
      } else {
        value = element.value;
      }

      await saveSetting(id, value);
    });

    // Debounce text inputs
    if (element.type === "text" || element.type === "password") {
      let timeout;
      element.addEventListener("input", () => {
        clearTimeout(timeout);
        timeout = setTimeout(async () => {
          await saveSetting(id, element.value);
        }, 500);
      });
    }
  }

  // Connect Google
  document.getElementById("connectGoogle").addEventListener("click", async () => {
    // TODO: Implement Google OAuth flow
    alert("Google integration coming in Phase 4!");
  });

  // Export Now
  document.getElementById("exportNow").addEventListener("click", async () => {
    const btn = document.getElementById("exportNow");
    btn.textContent = "Exporting...";
    btn.disabled = true;

    try {
      // TODO: Implement export
      await new Promise(r => setTimeout(r, 1000)); // Placeholder
      btn.textContent = "Exported!";
      setTimeout(() => {
        btn.textContent = "Export";
        btn.disabled = false;
      }, 2000);
    } catch (error) {
      btn.textContent = "Error";
      btn.disabled = false;
    }
  });

  // Reset Data
  document.getElementById("resetData").addEventListener("click", async () => {
    const confirmed = confirm(
      "Are you sure you want to delete ALL AniMate data?\n\n" +
      "This includes:\n" +
      "• Browsing history\n" +
      "• Clipboard history\n" +
      "• Saved tab sessions\n" +
      "• Network logs\n" +
      "• All settings\n\n" +
      "This action cannot be undone!"
    );

    if (!confirmed) return;

    const btn = document.getElementById("resetData");
    btn.textContent = "Resetting...";
    btn.disabled = true;

    try {
      // Clear all IndexedDB data
      const request = indexedDB.deleteDatabase("animate_db");
      request.onsuccess = () => {
        alert("All data has been deleted. Extension will reload.");
        chrome.runtime.reload();
      };
      request.onerror = () => {
        alert("Error deleting data. Please try again.");
        btn.textContent = "Reset Data";
        btn.disabled = false;
      };
    } catch (error) {
      alert("Error: " + error.message);
      btn.textContent = "Reset Data";
      btn.disabled = false;
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════

async function saveSetting(key, value) {
  try {
    await router.sendMessage(Actions.SET_SETTING, { key, value });
    console.log(`[AniMate Options] Saved: ${key} = ${value}`);
    showSaveIndicator();
  } catch (error) {
    console.error(`[AniMate Options] Error saving ${key}:`, error);
  }
}

function setSelectValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function setInputValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function setCheckbox(id, value) {
  const el = document.getElementById(id);
  if (el) el.checked = value;
}

let saveTimeout;
function showSaveIndicator() {
  // Could add a "Saved" toast here
  clearTimeout(saveTimeout);
  // Show some indicator
  saveTimeout = setTimeout(() => {
    // Hide indicator
  }, 1500);
}
