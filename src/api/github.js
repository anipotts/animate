/**
 * GitHub API Client for AniMate
 *
 * Fetches user repos, starred repos, and activity.
 * Uses Personal Access Token for authentication.
 */

import { config } from "../utils/config.js";

const GITHUB_API = "https://api.github.com";

/**
 * Make an authenticated request to the GitHub API
 */
async function githubRequest(endpoint, options = {}) {
  const pat = await config.get("githubPat");

  if (!pat) {
    throw new Error("GitHub PAT not configured");
  }

  const response = await fetch(`${GITHUB_API}${endpoint}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${pat}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...options.headers
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`GitHub API error: ${response.status} - ${error.message || response.statusText}`);
  }

  return response.json();
}

/**
 * Get authenticated user info
 */
export async function getUser() {
  return githubRequest("/user");
}

/**
 * Get all repositories for the authenticated user
 * Includes owned repos and repos where user is a collaborator
 */
export async function getUserRepos(options = {}) {
  const { sort = "updated", perPage = 100 } = options;

  const repos = await githubRequest(`/user/repos?per_page=${perPage}&sort=${sort}`);

  return repos.map(repo => ({
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    description: repo.description,
    url: repo.html_url,
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    openIssues: repo.open_issues_count,
    language: repo.language,
    isPrivate: repo.private,
    isFork: repo.fork,
    updatedAt: repo.updated_at,
    pushedAt: repo.pushed_at
  }));
}

/**
 * Get starred repositories
 */
export async function getStarredRepos(options = {}) {
  const { sort = "updated", perPage = 100 } = options;

  const repos = await githubRequest(`/user/starred?per_page=${perPage}&sort=${sort}`);

  return repos.map(repo => ({
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    description: repo.description,
    url: repo.html_url,
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    openIssues: repo.open_issues_count,
    language: repo.language,
    owner: {
      login: repo.owner.login,
      avatarUrl: repo.owner.avatar_url
    },
    updatedAt: repo.updated_at
  }));
}

/**
 * Get recent events for the authenticated user
 */
export async function getUserEvents(options = {}) {
  const { perPage = 30 } = options;

  const user = await getUser();
  const events = await githubRequest(`/users/${user.login}/events?per_page=${perPage}`);

  return events.map(event => ({
    id: event.id,
    type: event.type,
    repo: event.repo.name,
    repoUrl: `https://github.com/${event.repo.name}`,
    createdAt: event.created_at,
    payload: summarizeEventPayload(event)
  }));
}

/**
 * Get repository stats (stars, forks, issues over time)
 */
export async function getRepoStats(owner, repo) {
  const [repoData, contributors] = await Promise.all([
    githubRequest(`/repos/${owner}/${repo}`),
    githubRequest(`/repos/${owner}/${repo}/contributors?per_page=5`).catch(() => [])
  ]);

  return {
    name: repoData.name,
    fullName: repoData.full_name,
    description: repoData.description,
    stars: repoData.stargazers_count,
    forks: repoData.forks_count,
    openIssues: repoData.open_issues_count,
    watchers: repoData.watchers_count,
    language: repoData.language,
    topics: repoData.topics || [],
    license: repoData.license?.name,
    createdAt: repoData.created_at,
    updatedAt: repoData.updated_at,
    pushedAt: repoData.pushed_at,
    topContributors: contributors.slice(0, 5).map(c => ({
      login: c.login,
      avatarUrl: c.avatar_url,
      contributions: c.contributions
    }))
  };
}

/**
 * Get notifications (unread)
 */
export async function getNotifications() {
  const notifications = await githubRequest("/notifications");

  return notifications.map(n => ({
    id: n.id,
    reason: n.reason,
    unread: n.unread,
    title: n.subject.title,
    type: n.subject.type,
    url: n.subject.url,
    repo: n.repository.full_name,
    updatedAt: n.updated_at
  }));
}

/**
 * Summarize event payload for display
 */
function summarizeEventPayload(event) {
  switch (event.type) {
    case "PushEvent":
      const commits = event.payload.commits || [];
      return {
        action: "pushed",
        detail: `${commits.length} commit${commits.length !== 1 ? "s" : ""}`,
        commits: commits.slice(0, 3).map(c => ({
          sha: c.sha.slice(0, 7),
          message: c.message.split("\n")[0]
        }))
      };

    case "CreateEvent":
      return {
        action: "created",
        detail: `${event.payload.ref_type}${event.payload.ref ? `: ${event.payload.ref}` : ""}`
      };

    case "DeleteEvent":
      return {
        action: "deleted",
        detail: `${event.payload.ref_type}: ${event.payload.ref}`
      };

    case "IssuesEvent":
      return {
        action: event.payload.action,
        detail: `#${event.payload.issue.number}: ${event.payload.issue.title}`
      };

    case "PullRequestEvent":
      return {
        action: event.payload.action,
        detail: `#${event.payload.pull_request.number}: ${event.payload.pull_request.title}`
      };

    case "WatchEvent":
      return {
        action: "starred",
        detail: ""
      };

    case "ForkEvent":
      return {
        action: "forked",
        detail: `to ${event.payload.forkee.full_name}`
      };

    case "IssueCommentEvent":
      return {
        action: "commented",
        detail: `on #${event.payload.issue.number}`
      };

    default:
      return {
        action: event.type.replace("Event", "").toLowerCase(),
        detail: ""
      };
  }
}

/**
 * Get all GitHub data for dashboard (combined call)
 */
export async function getDashboardData() {
  const [user, repos, starred, events, notifications] = await Promise.all([
    getUser(),
    getUserRepos({ perPage: 20 }),
    getStarredRepos({ perPage: 20 }),
    getUserEvents({ perPage: 15 }),
    getNotifications().catch(() => [])
  ]);

  return {
    user: {
      login: user.login,
      name: user.name,
      avatarUrl: user.avatar_url,
      publicRepos: user.public_repos,
      followers: user.followers,
      following: user.following
    },
    repos: repos.slice(0, 10),
    starred: starred.slice(0, 10),
    recentActivity: events.slice(0, 10),
    notifications: notifications.slice(0, 5),
    fetchedAt: Date.now()
  };
}

// Export API object
export const github = {
  getUser,
  getUserRepos,
  getStarredRepos,
  getUserEvents,
  getRepoStats,
  getNotifications,
  getDashboardData
};
