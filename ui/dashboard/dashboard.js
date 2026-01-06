/**
 * AniMate Dashboard Script
 *
 * Main dashboard logic and view management
 */

import { router, Actions } from "../../src/background/message-router.js";

// ═══════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", async () => {
  console.log("[AniMate Dashboard] Initializing...");

  // Set date
  document.getElementById("overviewDate").textContent = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  // Setup navigation
  setupNavigation();

  // Load initial view
  await loadOverviewData();

  // Handle hash navigation
  handleHashChange();
  window.addEventListener("hashchange", handleHashChange);

  console.log("[AniMate Dashboard] Ready");
});

// ═══════════════════════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════════════════════

function setupNavigation() {
  const navItems = document.querySelectorAll(".nav-item[data-view]");

  navItems.forEach(item => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const view = item.dataset.view;
      switchView(view);
      window.location.hash = view;
    });
  });

  // Settings link
  document.getElementById("openSettings").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  // Save session button
  document.getElementById("saveSession")?.addEventListener("click", saveCurrentSession);
}

function handleHashChange() {
  const hash = window.location.hash.slice(1) || "overview";
  switchView(hash);
}

function switchView(viewName) {
  // Update nav
  document.querySelectorAll(".nav-item[data-view]").forEach(item => {
    item.classList.toggle("active", item.dataset.view === viewName);
  });

  // Update views
  document.querySelectorAll(".view").forEach(view => {
    view.classList.toggle("active", view.id === `view-${viewName}`);
  });

  // Load view data
  switch (viewName) {
    case "overview":
      loadOverviewData();
      break;
    case "browsing":
      loadBrowsingData();
      break;
    case "clipboard":
      loadClipboardData();
      break;
    case "tabs":
      loadTabsData();
      break;
    case "network":
      loadNetworkData();
      break;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// OVERVIEW VIEW
// ═══════════════════════════════════════════════════════════════════════

async function loadOverviewData() {
  try {
    // Load stats
    const stats = await router.sendMessage(Actions.GET_BROWSING_STATS, {});
    const tabCount = await router.sendMessage(Actions.GET_TAB_COUNT, {});
    const clipboardHistory = await router.sendMessage(Actions.GET_CLIPBOARD_HISTORY, { limit: 50 });

    // Update focus time
    const productiveMs = stats.productiveTime || 0;
    const distractionMs = stats.distractionTime || 0;
    const goalMs = 4 * 60 * 60 * 1000;
    const progress = Math.min((productiveMs / goalMs) * 100, 100);

    document.getElementById("dashFocusTime").textContent = formatDuration(productiveMs);
    document.getElementById("dashFocusProgress").style.width = `${progress}%`;
    document.getElementById("dashProductiveTime").textContent = formatDurationShort(productiveMs);
    document.getElementById("dashDistractionTime").textContent = formatDurationShort(distractionMs);
    document.getElementById("dashTabCount").textContent = tabCount;
    document.getElementById("dashClipboardCount").textContent = clipboardHistory.length;

    // Top sites
    const topSitesEl = document.getElementById("dashTopSites");
    const topDomains = stats.topDomains || [];

    if (topDomains.length === 0) {
      topSitesEl.innerHTML = '<p class="text-tertiary text-sm">No browsing data yet today</p>';
    } else {
      topSitesEl.innerHTML = topDomains.slice(0, 5).map(site => `
        <div class="site-item">
          <img class="site-favicon" src="https://www.google.com/s2/favicons?domain=${site.domain}&sz=32" alt="">
          <span class="site-domain">${site.domain}</span>
          <span class="site-time">${formatDurationShort(site.duration)}</span>
          <span class="site-badge ${site.classification || 'neutral'}"></span>
        </div>
      `).join("");
    }

    // Load external data (non-blocking)
    loadWeatherWidget();
    loadGitHubWidget();
  } catch (error) {
    console.error("[AniMate Dashboard] Error loading overview:", error);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// WEATHER WIDGET
// ═══════════════════════════════════════════════════════════════════════

async function loadWeatherWidget() {
  const contentEl = document.getElementById("weatherContent");
  const locationEl = document.getElementById("weatherLocation");

  try {
    const weather = await router.sendMessage(Actions.GET_WEATHER, {});

    locationEl.textContent = weather.location || "Unknown";

    const current = weather.current;
    contentEl.innerHTML = `
      <div class="weather-current">
        <div class="weather-main">
          <img src="${current.iconUrl}" alt="${current.condition}" class="weather-icon">
          <span class="weather-temp">${current.temp}°F</span>
        </div>
        <div class="weather-details">
          <span class="weather-condition">${current.condition}</span>
          <span class="weather-feels">Feels like ${current.feelsLike}°F</span>
        </div>
      </div>
      <div class="weather-forecast">
        ${weather.forecast.slice(0, 4).map(f => `
          <div class="forecast-item">
            <span class="forecast-time">${formatForecastTime(f.time)}</span>
            <img src="${f.iconUrl}" alt="${f.condition}" class="forecast-icon">
            <span class="forecast-temp">${f.temp}°</span>
          </div>
        `).join("")}
      </div>
      ${weather.stale ? '<span class="badge badge-warning">Cached</span>' : ''}
    `;
  } catch (error) {
    console.error("[AniMate Dashboard] Weather error:", error);
    contentEl.innerHTML = `
      <p class="text-tertiary text-sm">
        ${error.message.includes("API key") ? "Add OpenWeather API key in Settings" : "Unable to load weather"}
      </p>
    `;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// GITHUB WIDGET
// ═══════════════════════════════════════════════════════════════════════

async function loadGitHubWidget() {
  const contentEl = document.getElementById("githubContent");
  const userEl = document.getElementById("githubUser");

  try {
    const data = await router.sendMessage(Actions.GET_GITHUB_REPOS, {});

    userEl.textContent = `@${data.user.login}`;

    const recentActivity = data.recentActivity || [];
    const notifications = data.notifications || [];

    contentEl.innerHTML = `
      <div class="github-stats">
        <div class="github-stat">
          <span class="github-stat-value">${data.user.publicRepos}</span>
          <span class="github-stat-label">Repos</span>
        </div>
        <div class="github-stat">
          <span class="github-stat-value">${data.user.followers}</span>
          <span class="github-stat-label">Followers</span>
        </div>
        <div class="github-stat">
          <span class="github-stat-value">${notifications.length}</span>
          <span class="github-stat-label">Notifications</span>
        </div>
      </div>

      ${recentActivity.length > 0 ? `
        <div class="github-activity">
          <span class="text-sm text-tertiary">Recent Activity</span>
          <div class="activity-list">
            ${recentActivity.slice(0, 5).map(event => `
              <div class="activity-item">
                <span class="activity-action">${event.payload.action}</span>
                <a href="${event.repoUrl}" target="_blank" class="activity-repo">${event.repo}</a>
                <span class="activity-time">${formatTimestamp(new Date(event.createdAt).getTime())}</span>
              </div>
            `).join("")}
          </div>
        </div>
      ` : ""}

      ${data.stale ? '<span class="badge badge-warning">Cached</span>' : ''}
    `;
  } catch (error) {
    console.error("[AniMate Dashboard] GitHub error:", error);
    contentEl.innerHTML = `
      <p class="text-tertiary text-sm">
        ${error.message.includes("PAT") ? "Add GitHub PAT in Settings" : "Unable to load GitHub data"}
      </p>
    `;
  }
}

function formatForecastTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString("en-US", { hour: "numeric" });
}

// ═══════════════════════════════════════════════════════════════════════
// BROWSING VIEW
// ═══════════════════════════════════════════════════════════════════════

async function loadBrowsingData() {
  // Placeholder - will be implemented in Phase 3
}

// ═══════════════════════════════════════════════════════════════════════
// CLIPBOARD VIEW
// ═══════════════════════════════════════════════════════════════════════

async function loadClipboardData() {
  const container = document.getElementById("clipboardList");

  try {
    const history = await router.sendMessage(Actions.GET_CLIPBOARD_HISTORY, { limit: 50 });

    if (history.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>No clipboard items yet</p>
          <p class="text-sm mt-2">Copy text on any webpage to start building your clipboard history</p>
        </div>
      `;
      return;
    }

    container.innerHTML = history.map(item => `
      <div class="clipboard-item">
        <div class="clipboard-text">${escapeHtml(item.text.slice(0, 200))}${item.text.length > 200 ? '...' : ''}</div>
        <div class="clipboard-meta">
          <span>${item.domain || 'Unknown'}</span>
          <span>•</span>
          <span>${formatTimestamp(item.timestamp)}</span>
          ${item.isCode ? '<span class="badge">Code</span>' : ''}
        </div>
      </div>
    `).join("");
  } catch (error) {
    console.error("[AniMate Dashboard] Error loading clipboard:", error);
    container.innerHTML = '<p class="text-error">Error loading clipboard history</p>';
  }
}

// ═══════════════════════════════════════════════════════════════════════
// TABS VIEW
// ═══════════════════════════════════════════════════════════════════════

async function loadTabsData() {
  try {
    const tabCount = await router.sendMessage(Actions.GET_TAB_COUNT, {});
    const sessions = await router.sendMessage(Actions.GET_TAB_SESSIONS, { limit: 20 });

    document.getElementById("tabsCurrentCount").textContent = tabCount;

    const sessionsEl = document.getElementById("sessionsList");

    if (sessions.length === 0) {
      sessionsEl.innerHTML = `
        <div class="empty-state">
          <p>No saved sessions yet</p>
          <p class="text-sm mt-2">Click "Save Current Session" to save your tabs</p>
        </div>
      `;
      return;
    }

    sessionsEl.innerHTML = sessions.map(session => `
      <div class="session-item">
        <div class="session-info">
          <span class="session-name">${escapeHtml(session.name)}</span>
          <span class="session-meta">${session.tabCount} tabs • ${formatTimestamp(session.createdAt)}</span>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-sm btn-secondary" data-restore="${session.id}">Restore</button>
        </div>
      </div>
    `).join("");

    // Add restore handlers
    sessionsEl.querySelectorAll("[data-restore]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const sessionId = parseInt(btn.dataset.restore);
        try {
          await router.sendMessage(Actions.RESTORE_TAB_SESSION, { sessionId });
          btn.textContent = "Restored!";
          btn.disabled = true;
        } catch (error) {
          console.error("Error restoring session:", error);
          btn.textContent = "Error";
        }
      });
    });
  } catch (error) {
    console.error("[AniMate Dashboard] Error loading tabs:", error);
  }
}

async function saveCurrentSession() {
  const btn = document.getElementById("saveSession");
  const originalHtml = btn.innerHTML;

  btn.innerHTML = "Saving...";
  btn.disabled = true;

  try {
    const session = await router.sendMessage(Actions.SAVE_TAB_SESSION, { name: null });
    btn.innerHTML = `Saved! (${session.tabCount} tabs)`;
    await loadTabsData(); // Refresh list
    setTimeout(() => {
      btn.innerHTML = originalHtml;
      btn.disabled = false;
    }, 2000);
  } catch (error) {
    console.error("Error saving session:", error);
    btn.innerHTML = "Error saving";
    btn.disabled = false;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// NETWORK VIEW
// ═══════════════════════════════════════════════════════════════════════

async function loadNetworkData() {
  const container = document.getElementById("networkLog");

  try {
    const requests = await router.sendMessage(Actions.GET_NETWORK_LOG, { limit: 100 });

    if (requests.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>No network requests logged yet</p>
          <p class="text-sm mt-2">Browse the web to see API requests</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <table class="network-table">
        <thead>
          <tr>
            <th>Method</th>
            <th>URL</th>
            <th>Status</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          ${requests.slice(0, 50).map(req => `
            <tr>
              <td><span class="method-badge method-${req.method}">${req.method}</span></td>
              <td class="truncate" style="max-width: 400px;" title="${escapeHtml(req.url)}">${escapeHtml(req.url)}</td>
              <td>${req.statusCode || '-'}</td>
              <td class="text-tertiary">${formatTimestamp(req.timestamp)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  } catch (error) {
    console.error("[AniMate Dashboard] Error loading network log:", error);
    container.innerHTML = '<p class="text-error">Error loading network log</p>';
  }
}

// ═══════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════

function formatDuration(ms) {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${minutes.toString().padStart(2, "0")}`;
}

function formatDurationShort(ms) {
  const totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes < 1) return "<1m";
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

function formatTimestamp(ts) {
  const date = new Date(ts);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
