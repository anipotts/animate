/**
 * Weather API Client for AniMate
 *
 * Fetches current weather and forecast using OpenWeatherMap API.
 * Supports geolocation or configured location.
 */

import { config } from "../utils/config.js";

const OPENWEATHER_API = "https://api.openweathermap.org/data/2.5";

/**
 * Get current weather
 */
export async function getCurrentWeather(coords) {
  const apiKey = await config.get("weatherApiKey");

  if (!apiKey) {
    throw new Error("Weather API key not configured");
  }

  const { lat, lon } = coords;
  const url = `${OPENWEATHER_API}/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=imperial`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Weather API error: ${response.status}`);
  }

  const data = await response.json();

  return {
    location: data.name,
    temp: Math.round(data.main.temp),
    feelsLike: Math.round(data.main.feels_like),
    humidity: data.main.humidity,
    condition: data.weather[0].main,
    description: data.weather[0].description,
    icon: data.weather[0].icon,
    iconUrl: `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`,
    wind: {
      speed: Math.round(data.wind.speed),
      direction: data.wind.deg
    },
    visibility: data.visibility,
    sunrise: data.sys.sunrise * 1000,
    sunset: data.sys.sunset * 1000,
    fetchedAt: Date.now()
  };
}

/**
 * Get weather forecast (next 24 hours in 3-hour intervals)
 */
export async function getForecast(coords) {
  const apiKey = await config.get("weatherApiKey");

  if (!apiKey) {
    throw new Error("Weather API key not configured");
  }

  const { lat, lon } = coords;
  const url = `${OPENWEATHER_API}/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=imperial&cnt=8`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Weather API error: ${response.status}`);
  }

  const data = await response.json();

  return {
    location: data.city.name,
    forecast: data.list.map(item => ({
      time: item.dt * 1000,
      temp: Math.round(item.main.temp),
      feelsLike: Math.round(item.main.feels_like),
      condition: item.weather[0].main,
      description: item.weather[0].description,
      icon: item.weather[0].icon,
      iconUrl: `https://openweathermap.org/img/wn/${item.weather[0].icon}.png`,
      humidity: item.main.humidity,
      wind: Math.round(item.wind.speed),
      pop: Math.round((item.pop || 0) * 100) // Probability of precipitation %
    })),
    fetchedAt: Date.now()
  };
}

/**
 * Get location via browser geolocation API
 */
export function getGeolocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lon: position.coords.longitude
        });
      },
      (error) => {
        reject(new Error(`Geolocation error: ${error.message}`));
      },
      {
        timeout: 10000,
        maximumAge: 300000 // Cache for 5 minutes
      }
    );
  });
}

/**
 * Get weather data for dashboard (current + forecast)
 */
export async function getDashboardWeather() {
  // Check for configured location first
  let coords = await config.get("weatherLocation");

  // Fall back to geolocation
  if (!coords) {
    try {
      coords = await getGeolocation();
    } catch (error) {
      // Default to Manhattan (WSP area) if geolocation fails
      coords = { lat: 40.7308, lon: -73.9975 };
    }
  }

  const [current, forecast] = await Promise.all([
    getCurrentWeather(coords),
    getForecast(coords)
  ]);

  return {
    current,
    forecast: forecast.forecast,
    location: current.location,
    coords,
    fetchedAt: Date.now()
  };
}

/**
 * Get weather icon emoji for condition
 */
export function getWeatherEmoji(condition) {
  const map = {
    "Clear": "☀️",
    "Clouds": "☁️",
    "Rain": "🌧️",
    "Drizzle": "🌦️",
    "Thunderstorm": "⛈️",
    "Snow": "❄️",
    "Mist": "🌫️",
    "Fog": "🌫️",
    "Haze": "🌫️",
    "Smoke": "🌫️",
    "Dust": "🌫️",
    "Sand": "🌫️",
    "Ash": "🌫️",
    "Squall": "💨",
    "Tornado": "🌪️"
  };
  return map[condition] || "🌡️";
}

// Export API object
export const weather = {
  getCurrentWeather,
  getForecast,
  getGeolocation,
  getDashboardWeather,
  getWeatherEmoji
};
