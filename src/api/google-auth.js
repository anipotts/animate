/**
 * Google OAuth Authentication for AniMate
 *
 * Uses chrome.identity API for seamless OAuth flow.
 * Works with Calendar and Gmail APIs.
 */

// Cached token
let cachedToken = null;

/**
 * Get OAuth token for Google APIs
 * Uses chrome.identity.getAuthToken for Chrome extension OAuth
 */
export async function getAuthToken(interactive = false) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        console.error("[AniMate Google Auth] Error:", chrome.runtime.lastError.message);
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (!token) {
        reject(new Error("No token received"));
        return;
      }

      cachedToken = token;
      console.log("[AniMate Google Auth] Token obtained");
      resolve(token);
    });
  });
}

/**
 * Remove cached token (for re-auth or logout)
 */
export async function removeCachedToken() {
  if (!cachedToken) return;

  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token: cachedToken }, () => {
      cachedToken = null;
      console.log("[AniMate Google Auth] Token removed");
      resolve();
    });
  });
}

/**
 * Make authenticated request to Google API
 */
export async function googleFetch(url, options = {}) {
  // Try with cached token first, then interactive if needed
  let token = cachedToken;

  if (!token) {
    try {
      token = await getAuthToken(false); // Non-interactive first
    } catch {
      // Will need interactive auth
      token = null;
    }
  }

  if (!token) {
    throw new Error("Not authenticated. Please sign in to Google.");
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      "Authorization": `Bearer ${token}`
    }
  });

  // Handle token expiration
  if (response.status === 401) {
    await removeCachedToken();
    // Try once more with fresh token
    token = await getAuthToken(false);

    const retryResponse = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        "Authorization": `Bearer ${token}`
      }
    });

    if (!retryResponse.ok) {
      throw new Error(`Google API error: ${retryResponse.status}`);
    }

    return retryResponse.json();
  }

  if (!response.ok) {
    throw new Error(`Google API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Check if user is authenticated (has valid token)
 */
export async function isAuthenticated() {
  try {
    await getAuthToken(false);
    return true;
  } catch {
    return false;
  }
}

/**
 * Trigger interactive sign-in
 */
export async function signIn() {
  return getAuthToken(true);
}

/**
 * Sign out and clear token
 */
export async function signOut() {
  await removeCachedToken();
}

export const googleAuth = {
  getAuthToken,
  removeCachedToken,
  googleFetch,
  isAuthenticated,
  signIn,
  signOut
};
