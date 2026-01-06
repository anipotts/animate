/**
 * Google Calendar API for AniMate
 *
 * Fetches today's calendar events.
 */

import { googleFetch } from "./google-auth.js";
import { db } from "../storage/db.js";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const CACHE_KEY = "google_calendar";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get today's calendar events
 */
export async function getTodaysEvents() {
  // Check cache first
  const cached = await db.get("external_cache", CACHE_KEY);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.data;
  }

  // Calculate today's time range
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  const timeMin = startOfDay.toISOString();
  const timeMax = endOfDay.toISOString();

  try {
    // Fetch from primary calendar
    const url = `${CALENDAR_API}/calendars/primary/events?` + new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "20"
    });

    const response = await googleFetch(url);

    const events = (response.items || []).map(event => ({
      id: event.id,
      title: event.summary || "(No title)",
      description: event.description || "",
      location: event.location || "",
      start: event.start?.dateTime || event.start?.date,
      end: event.end?.dateTime || event.end?.date,
      isAllDay: !event.start?.dateTime,
      status: event.status,
      htmlLink: event.htmlLink,
      hangoutLink: event.hangoutLink,
      attendees: (event.attendees || []).length
    }));

    // Cache the result
    await db.put("external_cache", {
      key: CACHE_KEY,
      data: events,
      fetchedAt: Date.now()
    });

    console.log("[AniMate Calendar] Fetched", events.length, "events");
    return events;

  } catch (error) {
    console.error("[AniMate Calendar] Fetch error:", error);

    // Return cached data if available (even if stale)
    if (cached) {
      return cached.data;
    }

    throw error;
  }
}

/**
 * Get upcoming events (next N hours)
 */
export async function getUpcomingEvents(hours = 4) {
  const events = await getTodaysEvents();
  const now = new Date();
  const cutoff = new Date(now.getTime() + hours * 60 * 60 * 1000);

  return events.filter(event => {
    const start = new Date(event.start);
    return start >= now && start <= cutoff;
  });
}

/**
 * Get current/active event
 */
export async function getCurrentEvent() {
  const events = await getTodaysEvents();
  const now = new Date();

  return events.find(event => {
    const start = new Date(event.start);
    const end = new Date(event.end);
    return now >= start && now <= end;
  });
}

/**
 * Format event time for display
 */
export function formatEventTime(event) {
  if (event.isAllDay) {
    return "All day";
  }

  const start = new Date(event.start);
  const end = new Date(event.end);

  const formatTime = (date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    });
  };

  return `${formatTime(start)} - ${formatTime(end)}`;
}

/**
 * Clear calendar cache
 */
export async function clearCache() {
  await db.delete("external_cache", CACHE_KEY);
}

export const calendar = {
  getTodaysEvents,
  getUpcomingEvents,
  getCurrentEvent,
  formatEventTime,
  clearCache
};
