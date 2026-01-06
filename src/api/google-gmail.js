/**
 * Google Gmail API for AniMate
 *
 * Fetches unread emails with VIP sender highlighting.
 */

import { googleFetch } from "./google-auth.js";
import { db } from "../storage/db.js";
import { config } from "../utils/config.js";

const GMAIL_API = "https://www.googleapis.com/gmail/v1";
const CACHE_KEY = "google_gmail";
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

/**
 * Get unread email count and VIP emails
 */
export async function getUnreadEmails() {
  // Check cache first
  const cached = await db.get("external_cache", CACHE_KEY);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.data;
  }

  try {
    // Get unread count from INBOX
    const profileUrl = `${GMAIL_API}/users/me/profile`;
    const profile = await googleFetch(profileUrl);

    // Get list of unread messages (limited)
    const listUrl = `${GMAIL_API}/users/me/messages?` + new URLSearchParams({
      q: "is:unread in:inbox",
      maxResults: "20"
    });

    const listResponse = await googleFetch(listUrl);
    const messageIds = listResponse.messages || [];

    // Fetch message details (batch for efficiency)
    const emails = [];
    const vipSenders = await config.get("vipEmailSenders") || [];

    // Fetch up to 10 message details
    for (const msg of messageIds.slice(0, 10)) {
      try {
        const msgUrl = `${GMAIL_API}/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`;
        const msgData = await googleFetch(msgUrl);

        const headers = msgData.payload?.headers || [];
        const getHeader = (name) => headers.find(h => h.name === name)?.value || "";

        const fromHeader = getHeader("From");
        const fromMatch = fromHeader.match(/(?:"?([^"<]+)"?\s*)?<?([^>]+@[^>]+)>?/);
        const fromName = fromMatch?.[1]?.trim() || fromMatch?.[2] || fromHeader;
        const fromEmail = fromMatch?.[2] || fromHeader;

        const isVIP = vipSenders.some(vip =>
          fromEmail.toLowerCase().includes(vip.toLowerCase()) ||
          fromName.toLowerCase().includes(vip.toLowerCase())
        );

        emails.push({
          id: msg.id,
          threadId: msg.threadId,
          subject: getHeader("Subject") || "(No subject)",
          from: fromName,
          fromEmail: fromEmail,
          date: getHeader("Date"),
          snippet: msgData.snippet || "",
          isVIP,
          labelIds: msgData.labelIds || []
        });
      } catch (err) {
        console.warn("[AniMate Gmail] Failed to fetch message:", msg.id, err);
      }
    }

    const result = {
      totalUnread: listResponse.resultSizeEstimate || messageIds.length,
      emails: emails,
      vipCount: emails.filter(e => e.isVIP).length
    };

    // Cache the result
    await db.put("external_cache", {
      key: CACHE_KEY,
      data: result,
      fetchedAt: Date.now()
    });

    console.log("[AniMate Gmail]", result.totalUnread, "unread,", result.vipCount, "VIP");
    return result;

  } catch (error) {
    console.error("[AniMate Gmail] Fetch error:", error);

    // Return cached data if available (even if stale)
    if (cached) {
      return cached.data;
    }

    throw error;
  }
}

/**
 * Get only VIP unread emails
 */
export async function getVIPEmails() {
  const result = await getUnreadEmails();
  return result.emails.filter(e => e.isVIP);
}

/**
 * Format email date for display
 */
export function formatEmailDate(dateStr) {
  if (!dateStr) return "";

  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
}

/**
 * Open Gmail inbox in new tab
 */
export function openGmail() {
  chrome.tabs.create({ url: "https://mail.google.com" });
}

/**
 * Open specific email thread
 */
export function openEmail(threadId) {
  chrome.tabs.create({ url: `https://mail.google.com/mail/u/0/#inbox/${threadId}` });
}

/**
 * Clear Gmail cache
 */
export async function clearCache() {
  await db.delete("external_cache", CACHE_KEY);
}

export const gmail = {
  getUnreadEmails,
  getVIPEmails,
  formatEmailDate,
  openGmail,
  openEmail,
  clearCache
};
