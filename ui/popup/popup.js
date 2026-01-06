/**
 * AniMate Popup Script - Compact Version
 */

import { router, Actions } from "../../src/background/message-router.js";

// ═══════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", async () => {
  // Load all data in parallel
  await Promise.all([
    loadWeatherMini(),
    loadGitHubMini(),
    loadCalendarMini(),
    loadGmailMini(),
    loadFocusStats(),
    loadTopSites()
  ]);

  setupEventListeners();
});

// ═══════════════════════════════════════════════════════════════════════
// WEATHER & GITHUB (TOP WIDGETS)
// ═══════════════════════════════════════════════════════════════════════

async function loadWeatherMini() {
  const container = document.getElementById("popupWeather");

  try {
    const weather = await router.sendMessage(Actions.GET_WEATHER, {});
    const current = weather.current;

    container.innerHTML = `
      <img src="${current.iconUrl}" alt="${current.condition}" class="weather-mini-icon">
      <div class="weather-mini-info">
        <span class="weather-mini-temp">${current.temp}°F</span>
        <span class="weather-mini-loc">${weather.location}</span>
      </div>
    `;
  } catch (error) {
    container.innerHTML = `<span class="text-xs text-tertiary">No weather</span>`;
  }
}

async function loadGitHubMini() {
  const container = document.getElementById("popupGithub");

  try {
    const data = await router.sendMessage(Actions.GET_GITHUB_REPOS, {});
    const notifs = data.notifications?.length || 0;

    container.innerHTML = `
      <img src="${data.user.avatarUrl}" alt="" class="github-mini-avatar">
      <div class="github-mini-info">
        <span class="github-mini-user">@${data.user.login}</span>
        <span class="github-mini-stats">${data.user.publicRepos} repos${notifs > 0 ? ` · ${notifs} notif` : ""}</span>
      </div>
    `;
  } catch (error) {
    container.innerHTML = `<span class="text-xs text-tertiary">No GitHub</span>`;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// CALENDAR & GMAIL (SECOND ROW)
// ═══════════════════════════════════════════════════════════════════════

async function loadCalendarMini() {
  const container = document.getElementById("popupCalendar");

  try {
    const data = await router.sendMessage(Actions.GET_CALENDAR_EVENTS, {});

    if (!data.authenticated) {
      container.innerHTML = `
        <button class="google-signin-btn" id="googleSignIn">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" stroke-width="2"></line>
            <line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" stroke-width="2"></line>
            <line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" stroke-width="2"></line>
          </svg>
          Sign in
        </button>
      `;
      return;
    }

    const events = data.events || [];
    const upcoming = events.filter(e => new Date(e.start) > new Date()).slice(0, 1);
    const current = events.find(e => {
      const start = new Date(e.start);
      const end = new Date(e.end);
      const now = new Date();
      return now >= start && now <= end;
    });

    if (current) {
      container.innerHTML = `
        <svg class="cal-mini-icon now" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
        </svg>
        <div class="cal-mini-info">
          <span class="cal-mini-title now">${truncate(current.title, 14)}</span>
          <span class="cal-mini-time">Now</span>
        </div>
      `;
    } else if (upcoming.length > 0) {
      const next = upcoming[0];
      const time = formatEventTime(next.start);
      container.innerHTML = `
        <svg class="cal-mini-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
        </svg>
        <div class="cal-mini-info">
          <span class="cal-mini-title">${truncate(next.title, 14)}</span>
          <span class="cal-mini-time">${time}</span>
        </div>
      `;
    } else {
      container.innerHTML = `
        <svg class="cal-mini-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
        </svg>
        <div class="cal-mini-info">
          <span class="cal-mini-title text-tertiary">No events</span>
          <span class="cal-mini-time">today</span>
        </div>
      `;
    }
  } catch (error) {
    container.innerHTML = `<span class="text-xs text-tertiary">Calendar error</span>`;
  }
}

async function loadGmailMini() {
  const container = document.getElementById("popupGmail");

  try {
    const data = await router.sendMessage(Actions.GET_GMAIL_UNREAD, {});

    if (!data.authenticated) {
      container.innerHTML = `
        <svg class="gmail-mini-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="4" width="20" height="16" rx="2" ry="2"></rect>
          <polyline points="22,6 12,13 2,6"></polyline>
        </svg>
        <span class="text-xs text-tertiary">Not signed in</span>
      `;
      return;
    }

    const { totalUnread, vipCount } = data;

    container.innerHTML = `
      <svg class="gmail-mini-icon ${totalUnread > 0 ? 'has-mail' : ''}" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="2" y="4" width="20" height="16" rx="2" ry="2"></rect>
        <polyline points="22,6 12,13 2,6"></polyline>
      </svg>
      <div class="gmail-mini-info">
        <span class="gmail-mini-count ${totalUnread > 0 ? 'has-mail' : ''}">${totalUnread}</span>
        <span class="gmail-mini-label">unread${vipCount > 0 ? ` · ${vipCount} VIP` : ''}</span>
      </div>
    `;
  } catch (error) {
    container.innerHTML = `<span class="text-xs text-tertiary">Gmail error</span>`;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// FOCUS & STATS
// ═══════════════════════════════════════════════════════════════════════

async function loadFocusStats() {
  try {
    const [stats, tabCount, clipboard] = await Promise.all([
      router.sendMessage(Actions.GET_BROWSING_STATS, {}),
      router.sendMessage(Actions.GET_TAB_COUNT, {}),
      router.sendMessage(Actions.GET_CLIPBOARD_HISTORY, { limit: 100 })
    ]);

    const productiveMs = stats.productiveTime || 0;
    const distractionMs = stats.distractionTime || 0;
    const goalMs = 4 * 60 * 60 * 1000;
    const progress = Math.min((productiveMs / goalMs) * 100, 100);

    // Focus
    document.getElementById("focusTime").textContent = formatDuration(productiveMs);
    document.getElementById("focusProgress").style.width = `${progress}%`;

    // Stats
    document.getElementById("productiveTime").textContent = formatShort(productiveMs);
    document.getElementById("distractionTime").textContent = formatShort(distractionMs);
    document.getElementById("tabCount").textContent = tabCount;
    document.getElementById("clipboardCount").textContent = clipboard.length;
  } catch (error) {
    console.error("[Popup] Stats error:", error);
  }
}

async function loadTopSites() {
  const container = document.getElementById("topSites");

  try {
    const stats = await router.sendMessage(Actions.GET_BROWSING_STATS, {});
    const sites = stats.topDomains || [];

    if (sites.length === 0) {
      container.innerHTML = `<span class="text-xs text-tertiary">No browsing data yet</span>`;
      return;
    }

    container.innerHTML = sites.slice(0, 3).map(site => `
      <div class="site-row">
        <img class="site-favicon" src="https://www.google.com/s2/favicons?domain=${site.domain}&sz=16" alt="">
        <span class="site-domain">${site.domain}</span>
        <span class="site-time">${formatShort(site.duration)}</span>
        <span class="site-dot ${site.classification || 'neutral'}"></span>
      </div>
    `).join("");
  } catch (error) {
    container.innerHTML = `<span class="text-xs text-tertiary">Error loading</span>`;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════════════════════════════════

function setupEventListeners() {
  // Dashboard
  document.getElementById("openDashboard").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("ui/dashboard/dashboard.html") });
    window.close();
  });

  // Settings
  document.getElementById("openSettings").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  // Save Tabs
  document.getElementById("saveTabSession").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const original = btn.innerHTML;
    btn.innerHTML = "Saving...";
    btn.disabled = true;

    try {
      const session = await router.sendMessage(Actions.SAVE_TAB_SESSION, {});
      btn.innerHTML = `Saved ${session.tabCount} tabs!`;
      setTimeout(() => { btn.innerHTML = original; btn.disabled = false; }, 1500);
    } catch (error) {
      btn.innerHTML = "Error";
      setTimeout(() => { btn.innerHTML = original; btn.disabled = false; }, 1500);
    }
  });

  // Clipboard
  document.getElementById("viewClipboard").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("ui/dashboard/dashboard.html#clipboard") });
    window.close();
  });

  // Google Sign In (if button exists)
  document.addEventListener("click", async (e) => {
    if (e.target.id === "googleSignIn" || e.target.closest("#googleSignIn")) {
      const btn = e.target.closest("#googleSignIn") || e.target;
      btn.disabled = true;
      btn.innerHTML = "Signing in...";

      try {
        await router.sendMessage("GOOGLE_SIGN_IN", {});
        // Reload calendar and gmail after sign in
        await Promise.all([loadCalendarMini(), loadGmailMini()]);
      } catch (error) {
        console.error("[Popup] Google sign-in error:", error);
        btn.innerHTML = "Sign in failed";
        btn.disabled = false;
      }
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // QUICK LAUNCH BUTTONS (Task Initiation Support)
  // ═══════════════════════════════════════════════════════════════════════

  document.getElementById("launchGmail").addEventListener("click", () => {
    chrome.tabs.create({ url: "https://mail.google.com" });
    window.close();
  });

  document.getElementById("launchCalendar").addEventListener("click", () => {
    chrome.tabs.create({ url: "https://calendar.google.com" });
    window.close();
  });

  document.getElementById("launchGitHub").addEventListener("click", () => {
    chrome.tabs.create({ url: "https://github.com" });
    window.close();
  });

  document.getElementById("launchNotion").addEventListener("click", () => {
    chrome.tabs.create({ url: "https://notion.so" });
    window.close();
  });
}

// ═══════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════

function formatDuration(ms) {
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}:${m.toString().padStart(2, "0")}`;
}

function formatShort(ms) {
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "<1m";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h${m}m`;
}

function truncate(str, len) {
  if (!str) return "";
  return str.length > len ? str.slice(0, len) + "…" : str;
}

function formatEventTime(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });
}
