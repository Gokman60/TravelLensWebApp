"use strict";

/*
  API documentation consulted:
  Open-Meteo Geocoding API: https://open-meteo.com/en/docs/geocoding-api
  Open-Meteo Forecast API: https://open-meteo.com/en/docs
  Frankfurter API: https://frankfurter.dev/
*/

const API = Object.freeze({
  geocoding: "https://geocoding-api.open-meteo.com/v1/search",
  forecast: "https://api.open-meteo.com/v1/forecast",
  currencies: "https://api.frankfurter.dev/v2/currencies",
  rate: "https://api.frankfurter.dev/v2/rate"
});

const elements = {
  form: document.querySelector("#travel-form"),
  city: document.querySelector("#city-search"),
  cityError: document.querySelector("#city-error"),
  searchButton: document.querySelector("#search-button"),
  locationField: document.querySelector("#location-field"),
  location: document.querySelector("#location-choice"),
  locationError: document.querySelector("#location-error"),
  budget: document.querySelector("#budget"),
  budgetError: document.querySelector("#budget-error"),
  baseCurrency: document.querySelector("#base-currency"),
  targetCurrency: document.querySelector("#target-currency"),
  currencyStatus: document.querySelector("#currency-status"),
  submitButton: document.querySelector("#submit-button"),
  appStatus: document.querySelector("#app-status"),
  results: document.querySelector("#results"),
  resultsTitle: document.querySelector("#results-title"),
  themeToggle: document.querySelector("#theme-toggle"),
  themeLabel: document.querySelector(".theme-label"),
  saveButton: document.querySelector("#save-button"),
  savedSection: document.querySelector("#saved-snapshot"),
  savedSummary: document.querySelector("#saved-summary"),
  removeSavedButton: document.querySelector("#remove-saved-button"),
  carousel: document.querySelector("#attraction-carousel"),
  slides: [...document.querySelectorAll(".carousel-slide")],
  previousSlide: document.querySelector("#previous-slide"),
  nextSlide: document.querySelector("#next-slide"),
  slideshowToggle: document.querySelector("#toggle-slideshow"),
  slidePosition: document.querySelector("#slide-position"),
  destinationTitle: document.querySelector("#destination-title"),
  destinationDetail: document.querySelector("#destination-detail"),
  timezone: document.querySelector("#timezone-value"),
  population: document.querySelector("#population-value"),
  weatherIcon: document.querySelector("#weather-icon"),
  weatherDescription: document.querySelector("#weather-description"),
  temperature: document.querySelector("#temperature-value"),
  feelsLike: document.querySelector("#feels-like-value"),
  humidity: document.querySelector("#humidity-value"),
  wind: document.querySelector("#wind-value"),
  converted: document.querySelector("#converted-value"),
  rateDetail: document.querySelector("#rate-detail"),
  guidance: document.querySelector("#guidance-list"),
  forecastGrid: document.querySelector("#forecast-grid"),
  timestamp: document.querySelector("#data-timestamp")
};

let locations = [];
let currentSnapshot = null;
let activeSlide = 0;
let slideshowTimer = null;
let slideshowPausedByUser = false;

const weatherCodes = new Map([
  [0, ["Clear sky", "☀"]],
  [1, ["Mainly clear", "🌤"]],
  [2, ["Partly cloudy", "⛅"]],
  [3, ["Overcast", "☁"]],
  [45, ["Fog", "🌫"]],
  [48, ["Rime fog", "🌫"]],
  [51, ["Light drizzle", "🌦"]],
  [53, ["Moderate drizzle", "🌦"]],
  [55, ["Dense drizzle", "🌧"]],
  [61, ["Slight rain", "🌦"]],
  [63, ["Moderate rain", "🌧"]],
  [65, ["Heavy rain", "🌧"]],
  [71, ["Slight snow", "🌨"]],
  [73, ["Moderate snow", "🌨"]],
  [75, ["Heavy snow", "❄"]],
  [80, ["Rain showers", "🌦"]],
  [81, ["Moderate showers", "🌧"]],
  [82, ["Violent showers", "⛈"]],
  [95, ["Thunderstorm", "⛈"]],
  [96, ["Thunderstorm with hail", "⛈"]],
  [99, ["Severe thunderstorm with hail", "⛈"]]
]);

function setStatus(message, state = "") {
  elements.appStatus.textContent = message;
  elements.appStatus.dataset.state = state;
}

function setBusy(button, busy, busyText, normalText) {
  button.disabled = busy;
  button.textContent = busy ? busyText : normalText;
}

async function fetchJSON(url, timeout = 12000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
    return await response.json();
  } finally {
    window.clearTimeout(timer);
  }
}

function showFieldError(input, errorElement, message) {
  input.setAttribute("aria-invalid", "true");
  errorElement.textContent = message;
}

function clearFieldError(input, errorElement) {
  input.removeAttribute("aria-invalid");
  errorElement.textContent = "";
}

async function loadCurrencies() {
  try {
    const data = await fetchJSON(API.currencies);
    const activeCurrencies = data
      .filter(currency => !currency.end_date || currency.end_date >= new Date().toISOString().slice(0, 10))
      .sort((a, b) => a.iso_code.localeCompare(b.iso_code));

    for (const select of [elements.baseCurrency, elements.targetCurrency]) {
      select.replaceChildren(new Option("Select a currency", ""));
      activeCurrencies.forEach(currency => {
        const label = `${currency.iso_code} — ${currency.name}`;
        select.add(new Option(label, currency.iso_code));
      });
    }

    elements.baseCurrency.value = "GBP";
    elements.targetCurrency.value = "EUR";
    elements.currencyStatus.textContent = `${activeCurrencies.length} current currencies are available.`;
  } catch (error) {
    elements.currencyStatus.textContent = "Currencies could not be loaded. Refresh the page to try again.";
    setStatus("The currency service is currently unavailable.", "error");
  }
}

async function searchLocations() {
  const query = elements.city.value.trim();
  clearFieldError(elements.city, elements.cityError);
  clearFieldError(elements.location, elements.locationError);

  if (query.length < 2) {
    showFieldError(elements.city, elements.cityError, "Enter at least two characters before searching.");
    elements.city.focus();
    return;
  }

  setBusy(elements.searchButton, true, "Searching…", "Find locations");
  setStatus(`Searching for places matching ${query}.`);

  const params = new URLSearchParams({ name: query, count: "8", language: "en", format: "json" });

  try {
    const data = await fetchJSON(`${API.geocoding}?${params}`);
    locations = data.results ?? [];
    elements.location.replaceChildren(new Option("Select a location", ""));

    locations.forEach((place, index) => {
      const details = [place.name, place.admin1, place.country].filter(Boolean).join(", ");
      elements.location.add(new Option(details, String(index)));
    });

    if (locations.length === 0) {
      elements.locationField.hidden = true;
      setStatus(`No locations were found for ${query}. Check the spelling and try again.`, "error");
      return;
    }

    elements.locationField.hidden = false;
    elements.location.focus();
    setStatus(`${locations.length} location options found. Choose the correct one.`, "success");
  } catch (error) {
    elements.locationField.hidden = true;
    setStatus(error.name === "AbortError" ? "The location search took too long. Please try again." : "Locations could not be retrieved. Check your connection and try again.", "error");
  } finally {
    setBusy(elements.searchButton, false, "Searching…", "Find locations");
  }
}

function getSelectedLocation() {
  if (elements.location.value === "") return null;
  const index = Number(elements.location.value);
  return Number.isInteger(index) ? locations[index] : null;
}

function weatherLabel(code) {
  return weatherCodes.get(code) ?? ["Mixed conditions", "🌡"];
}

function formatMoney(value, currency) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}

function buildGuidance(snapshot) {
  const items = [];
  const { current } = snapshot.weather;
  const priorities = snapshot.priorities;

  if (priorities.includes("packing")) {
    if (current.precipitation > 0 || [51, 53, 55, 61, 63, 65, 80, 81, 82].includes(current.weather_code)) {
      items.push("Pack a waterproof outer layer because precipitation is currently reported.");
    } else {
      items.push("No current rain is reported, but check the forecast again before travelling.");
    }
    if (current.apparent_temperature < 10) items.push("Consider warm layers because the temperature feels below 10 degrees.");
  }

  if (priorities.includes("outdoors")) {
    if (current.wind_speed_10m > 35) items.push("Strong wind may affect exposed outdoor activities.");
    else items.push("Wind is not currently above the app's 35 km/h outdoor caution threshold.");
  }

  if (priorities.includes("budget")) {
    items.push(`${formatMoney(snapshot.budget, snapshot.baseCurrency)} converts to approximately ${formatMoney(snapshot.convertedAmount, snapshot.targetCurrency)} at the displayed reference rate.`);
  }

  if (items.length === 0) items.push("Select one or more priorities next time to receive more personalised guidance.");
  return items;
}

function renderSnapshot(snapshot) {
  const place = snapshot.place;
  const weather = snapshot.weather;
  const units = weather.current_units;
  const [description, icon] = weatherLabel(weather.current.weather_code);

  elements.destinationTitle.textContent = place.name;
  elements.destinationDetail.textContent = [place.admin1, place.country].filter(Boolean).join(", ");
  elements.timezone.textContent = place.timezone || weather.timezone || "Not supplied";
  elements.population.textContent = place.population ? new Intl.NumberFormat("en-GB").format(place.population) : "Not supplied";
  elements.weatherIcon.textContent = icon;
  elements.weatherDescription.textContent = description;
  elements.temperature.textContent = `${weather.current.temperature_2m}${units.temperature_2m}`;
  elements.feelsLike.textContent = `${weather.current.apparent_temperature}${units.apparent_temperature}`;
  elements.humidity.textContent = `${weather.current.relative_humidity_2m}${units.relative_humidity_2m}`;
  elements.wind.textContent = `${weather.current.wind_speed_10m} ${units.wind_speed_10m}`;
  elements.converted.textContent = formatMoney(snapshot.convertedAmount, snapshot.targetCurrency);
  elements.rateDetail.textContent = `1 ${snapshot.baseCurrency} = ${snapshot.rate.toFixed(4)} ${snapshot.targetCurrency} (${snapshot.rateDate}).`;

  elements.guidance.replaceChildren();
  buildGuidance(snapshot).forEach(text => {
    const item = document.createElement("li");
    item.textContent = text;
    elements.guidance.append(item);
  });

  elements.forecastGrid.replaceChildren();
  weather.daily.time.slice(0, 5).forEach((date, index) => {
    const day = document.createElement("article");
    day.className = "forecast-day";
    const [dayDescription, dayIcon] = weatherLabel(weather.daily.weather_code[index]);
    const dayName = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric" }).format(new Date(`${date}T12:00:00`));

    const heading = document.createElement("strong");
    heading.textContent = dayName;
    const iconElement = document.createElement("span");
    iconElement.className = "forecast-icon";
    iconElement.setAttribute("aria-hidden", "true");
    iconElement.textContent = dayIcon;
    const descriptionElement = document.createElement("span");
    descriptionElement.textContent = dayDescription;
    const temperatures = document.createElement("span");
    temperatures.textContent = `${Math.round(weather.daily.temperature_2m_max[index])} / ${Math.round(weather.daily.temperature_2m_min[index])}${weather.daily_units.temperature_2m_max}`;
    day.append(heading, iconElement, descriptionElement, temperatures);
    elements.forecastGrid.append(day);
  });

  const retrieved = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date());
  elements.timestamp.textContent = `Live data retrieved ${retrieved}. Weather is modelled data and exchange rates may be delayed.`;
  elements.results.hidden = false;
  elements.resultsTitle.textContent = `${place.name} travel snapshot`;
  elements.resultsTitle.focus();
}

async function generateSnapshot(event) {
  event.preventDefault();
  clearFieldError(elements.location, elements.locationError);
  clearFieldError(elements.budget, elements.budgetError);

  if (!elements.form.checkValidity()) {
    elements.form.reportValidity();
    setStatus("Review the highlighted required fields before continuing.", "error");
    return;
  }

  const place = getSelectedLocation();
  if (!place) {
    showFieldError(elements.location, elements.locationError, "Search for and select a location first.");
    elements.location.focus();
    return;
  }

  const budget = Number(elements.budget.value);
  if (!Number.isFinite(budget) || budget < 1 || budget > 1000000) {
    showFieldError(elements.budget, elements.budgetError, "Enter a budget between 1 and 1,000,000.");
    elements.budget.focus();
    return;
  }

  const formData = new FormData(elements.form);
  const temperatureUnit = formData.get("temperatureUnit");
  const baseCurrency = elements.baseCurrency.value;
  const targetCurrency = elements.targetCurrency.value;
  const priorities = formData.getAll("priorities");

  const weatherParams = new URLSearchParams({
    latitude: place.latitude,
    longitude: place.longitude,
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m",
    daily: "weather_code,temperature_2m_max,temperature_2m_min",
    temperature_unit: temperatureUnit,
    wind_speed_unit: "kmh",
    timezone: "auto",
    forecast_days: "5"
  });

  setBusy(elements.submitButton, true, "Building snapshot…", "Generate snapshot");
  setStatus("Retrieving weather and currency data.");
  elements.results.hidden = true;

  try {
    const ratePromise = baseCurrency === targetCurrency
      ? Promise.resolve({ date: new Date().toISOString().slice(0, 10), rate: 1 })
      : fetchJSON(`${API.rate}/${encodeURIComponent(baseCurrency)}/${encodeURIComponent(targetCurrency)}`);

    const [weather, rateData] = await Promise.all([
      fetchJSON(`${API.forecast}?${weatherParams}`),
      ratePromise
    ]);

    currentSnapshot = {
      place,
      weather,
      budget,
      baseCurrency,
      targetCurrency,
      priorities,
      rate: rateData.rate,
      rateDate: rateData.date,
      convertedAmount: budget * rateData.rate
    };

    renderSnapshot(currentSnapshot);
    setStatus(`Your snapshot for ${place.name} is ready.`, "success");
  } catch (error) {
    setStatus(error.name === "AbortError" ? "The live services took too long to respond. Please try again." : "The snapshot could not be completed. One of the live services may be unavailable.", "error");
  } finally {
    setBusy(elements.submitButton, false, "Building snapshot…", "Generate snapshot");
  }
}

function saveSnapshot() {
  if (!currentSnapshot) return;
  const summary = {
    place: currentSnapshot.place.name,
    country: currentSnapshot.place.country,
    converted: formatMoney(currentSnapshot.convertedAmount, currentSnapshot.targetCurrency),
    weather: weatherLabel(currentSnapshot.weather.current.weather_code)[0],
    savedAt: new Date().toISOString()
  };
  localStorage.setItem("travelLensSnapshot", JSON.stringify(summary));
  showSavedSnapshot(summary);
  setStatus("The snapshot has been saved on this device.", "success");
}

function showSavedSnapshot(summary) {
  elements.savedSummary.textContent = `${summary.place}, ${summary.country}: ${summary.weather}; converted budget ${summary.converted}.`;
  elements.savedSection.hidden = false;
}

function loadSavedSnapshot() {
  try {
    const saved = JSON.parse(localStorage.getItem("travelLensSnapshot"));
    if (saved?.place && saved?.converted) showSavedSnapshot(saved);
  } catch (error) {
    localStorage.removeItem("travelLensSnapshot");
  }
}

function toggleTheme() {
  const isDark = document.documentElement.dataset.theme === "dark";
  const nextTheme = isDark ? "light" : "dark";
  document.documentElement.dataset.theme = nextTheme;
  elements.themeToggle.setAttribute("aria-pressed", String(!isDark));
  elements.themeLabel.textContent = isDark ? "Dark theme" : "Light theme";
  localStorage.setItem("travelLensTheme", nextTheme);
}

function initialiseTheme() {
  const saved = localStorage.getItem("travelLensTheme");
  const preferred = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  const theme = saved || preferred;
  document.documentElement.dataset.theme = theme;
  elements.themeToggle.setAttribute("aria-pressed", String(theme === "dark"));
  elements.themeLabel.textContent = theme === "dark" ? "Light theme" : "Dark theme";
}

function showSlide(index, announce = false) {
  activeSlide = (index + elements.slides.length) % elements.slides.length;

  elements.slides.forEach((slide, slideIndex) => {
    const isActive = slideIndex === activeSlide;
    slide.classList.toggle("is-active", isActive);
    slide.setAttribute("aria-hidden", String(!isActive));
  });

  const position = `Image ${activeSlide + 1} of ${elements.slides.length}`;
  elements.slidePosition.textContent = position;
  if (!announce) elements.slidePosition.setAttribute("aria-live", "off");
  else elements.slidePosition.setAttribute("aria-live", "polite");
}

function stopSlideshow() {
  window.clearInterval(slideshowTimer);
  slideshowTimer = null;
}

function startSlideshow() {
  stopSlideshow();
  if (slideshowPausedByUser || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  slideshowTimer = window.setInterval(() => showSlide(activeSlide + 1), 7000);
}

function updateSlideshowButton() {
  elements.slideshowToggle.setAttribute("aria-pressed", String(slideshowPausedByUser));
  elements.slideshowToggle.textContent = slideshowPausedByUser ? "Play slideshow" : "Pause slideshow";
}

function initialiseCarousel() {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  slideshowPausedByUser = reduceMotion;
  showSlide(0);
  updateSlideshowButton();
  startSlideshow();
}

elements.searchButton.addEventListener("click", searchLocations);
elements.city.addEventListener("input", () => {
  clearFieldError(elements.city, elements.cityError);
  elements.locationField.hidden = true;
  locations = [];
});
elements.city.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    searchLocations();
  }
});
elements.location.addEventListener("change", () => clearFieldError(elements.location, elements.locationError));
elements.budget.addEventListener("input", () => clearFieldError(elements.budget, elements.budgetError));
elements.form.addEventListener("submit", generateSnapshot);
elements.form.addEventListener("reset", () => {
  window.setTimeout(() => {
    locations = [];
    currentSnapshot = null;
    elements.locationField.hidden = true;
    elements.results.hidden = true;
    clearFieldError(elements.city, elements.cityError);
    clearFieldError(elements.location, elements.locationError);
    clearFieldError(elements.budget, elements.budgetError);
    setStatus("Form cleared.", "success");
  });
});
elements.themeToggle.addEventListener("click", toggleTheme);
elements.previousSlide.addEventListener("click", () => {
  showSlide(activeSlide - 1, true);
  startSlideshow();
});
elements.nextSlide.addEventListener("click", () => {
  showSlide(activeSlide + 1, true);
  startSlideshow();
});
elements.slideshowToggle.addEventListener("click", () => {
  slideshowPausedByUser = !slideshowPausedByUser;
  updateSlideshowButton();
  if (slideshowPausedByUser) stopSlideshow();
  else startSlideshow();
});
elements.carousel.addEventListener("mouseenter", stopSlideshow);
elements.carousel.addEventListener("mouseleave", startSlideshow);
elements.carousel.addEventListener("focusin", stopSlideshow);
elements.carousel.addEventListener("focusout", event => {
  if (!elements.carousel.contains(event.relatedTarget)) startSlideshow();
});
elements.saveButton.addEventListener("click", saveSnapshot);
elements.removeSavedButton.addEventListener("click", () => {
  localStorage.removeItem("travelLensSnapshot");
  elements.savedSection.hidden = true;
  setStatus("The saved snapshot has been removed.", "success");
});

initialiseTheme();
initialiseCarousel();
loadSavedSnapshot();
loadCurrencies();
