/**
 * Anthropic API Client for AniMate
 *
 * Uses Claude Haiku for cost-efficient site classification
 * and daily insights generation.
 */

import { config } from "../utils/config.js";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-3-haiku-20240307";

/**
 * Make a request to the Anthropic API
 */
async function anthropicRequest(messages, options = {}) {
  const apiKey = await config.get("anthropicApiKey");

  if (!apiKey) {
    throw new Error("Anthropic API key not configured");
  }

  const { maxTokens = 1024, system } = options;

  const body = {
    model: MODEL,
    max_tokens: maxTokens,
    messages
  };

  if (system) {
    body.system = system;
  }

  const response = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Anthropic API error: ${response.status} - ${error.error?.message || response.statusText}`);
  }

  const data = await response.json();

  return {
    content: data.content[0].text,
    usage: {
      inputTokens: data.usage.input_tokens,
      outputTokens: data.usage.output_tokens
    }
  };
}

/**
 * Classify domains as productive, distraction, or neutral
 * Batches up to 20 domains per request for efficiency
 */
export async function classifyDomains(domains) {
  if (!domains || domains.length === 0) {
    return [];
  }

  // Limit to 20 domains per batch
  const batch = domains.slice(0, 20);

  const prompt = `Classify each domain as "productive", "distraction", or "neutral" for someone doing knowledge work (programming, design, research, writing).

Domains to classify:
${batch.map((d, i) => `${i + 1}. ${d}`).join("\n")}

Respond with ONLY valid JSON in this exact format:
{
  "classifications": [
    {"domain": "example.com", "classification": "productive", "confidence": 0.9, "reason": "brief reason"}
  ]
}

Guidelines:
- productive: work tools, documentation, code repos, professional resources
- distraction: social media, entertainment, news (unless work-related), games
- neutral: search engines, email, communication tools, unclear purpose`;

  try {
    const response = await anthropicRequest([
      { role: "user", content: prompt }
    ], {
      maxTokens: 1024,
      system: "You are a productivity classification assistant. Respond only with valid JSON, no markdown or explanation."
    });

    // Parse the JSON response
    const result = JSON.parse(response.content);

    return {
      classifications: result.classifications,
      usage: response.usage
    };
  } catch (error) {
    console.error("[AniMate AI] Classification error:", error);
    throw error;
  }
}

/**
 * Generate daily productivity insights
 */
export async function generateDailyInsights(stats) {
  const {
    totalTime,
    productiveTime,
    distractionTime,
    topDomains,
    goalMinutes
  } = stats;

  const productiveHours = (productiveTime / 3600000).toFixed(1);
  const distractionHours = (distractionTime / 3600000).toFixed(1);
  const goalProgress = Math.round((productiveTime / (goalMinutes * 60000)) * 100);

  const prompt = `Analyze this daily productivity data and provide brief, actionable insights:

Productive time: ${productiveHours} hours
Distraction time: ${distractionHours} hours
Goal progress: ${goalProgress}% of ${goalMinutes / 60} hour goal

Top sites today:
${topDomains.slice(0, 5).map(d =>
  `- ${d.domain}: ${Math.round(d.duration / 60000)}min (${d.classification})`
).join("\n")}

Provide:
1. A 1-sentence summary of the day
2. One specific pattern or observation
3. One actionable suggestion for tomorrow

Keep the total response under 100 words. Be direct and specific, not generic.`;

  try {
    const response = await anthropicRequest([
      { role: "user", content: prompt }
    ], {
      maxTokens: 256,
      system: "You are a productivity coach. Be concise, specific, and actionable. No fluff."
    });

    return {
      insight: response.content,
      usage: response.usage,
      generatedAt: Date.now()
    };
  } catch (error) {
    console.error("[AniMate AI] Insights error:", error);
    throw error;
  }
}

/**
 * Generate a smart alert message when distraction threshold is hit
 */
export async function generateDistractionAlert(stats) {
  const { distractionTime, topDistractions, threshold } = stats;

  const distractionMins = Math.round(distractionTime / 60000);
  const topSite = topDistractions[0]?.domain || "various sites";

  const prompt = `Write a brief, friendly but firm productivity nudge (under 30 words).

Context: User has spent ${distractionMins} minutes on distracting sites today, hitting their ${threshold} minute threshold. Most time on: ${topSite}.

Be specific, not generic. Mention the actual site if relevant.`;

  try {
    const response = await anthropicRequest([
      { role: "user", content: prompt }
    ], {
      maxTokens: 64,
      system: "You are a friendly productivity assistant. Be encouraging but direct."
    });

    return {
      message: response.content.trim(),
      usage: response.usage
    };
  } catch (error) {
    // Fall back to generic message
    return {
      message: `You've spent ${distractionMins} minutes on distracting sites. Time to refocus?`,
      usage: null
    };
  }
}

/**
 * Check if AI is enabled and configured
 */
export async function isAIEnabled() {
  const enabled = await config.get("aiEnabled");
  const apiKey = await config.get("anthropicApiKey");
  return enabled && !!apiKey;
}

/**
 * Estimate cost of a request (in USD)
 * Haiku: $0.25/M input, $1.25/M output
 */
export function estimateCost(usage) {
  if (!usage) return 0;
  const inputCost = (usage.inputTokens / 1000000) * 0.25;
  const outputCost = (usage.outputTokens / 1000000) * 1.25;
  return inputCost + outputCost;
}

// Export API object
export const anthropic = {
  classifyDomains,
  generateDailyInsights,
  generateDistractionAlert,
  isAIEnabled,
  estimateCost
};
