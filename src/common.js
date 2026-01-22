/*
Copyright (C) 2017  Paul Marks  http://www.pmarks.net/

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

"use strict";

// Requires <script src="iputil.js">

const MANIFEST_VERSION = chrome.runtime.getManifest().manifest_version;
const USE_CALLBACKS = MANIFEST_VERSION === 2;

function chromeAsync(fn, ...args) {
  if (!USE_CALLBACKS) {
    return fn(...args);
  }
  return new Promise((resolve, reject) => {
    fn(...args, (result) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
}

let optionsStorage = chrome.storage.sync;

// Flags are bitwise-OR'd across all connections to a domain.
const FLAG_SSL = 0x1;
const FLAG_NOSSL = 0x2;
const FLAG_UNCACHED = 0x4;
const FLAG_CONNECTED = 0x8;
const FLAG_WEBSOCKET = 0x10;
const FLAG_NOTWORKER = 0x20;  // from a tab, not a service worker

const IPV4_ONLY_DOMAINS = new Set(["ipv4.google.com", "ipv4.icanhazip.com", "ipv4.whatismyip.akamai.com"]);

// Returns an Object with no default properties.
function newMap() {
  return Object.create(null);
}

function clearMap(m) {
  for (const k of Object.keys(m)) {
    delete m[k];
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function removeChildren(n) {
  while (n.hasChildNodes()) {
    n.removeChild(n.lastChild);
  }
  return n;
}

const spriteImg = {ready: false};
const spriteImgReady = (async function() {
  for (const size of [16, 32]) {
    const url = chrome.runtime.getURL(`sprites${size}.png`);
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      spriteImg[size] = await createImageBitmap(blob);
    } catch (err) {
      // Why does this sometimes fail?  My best guess is that running
      // the unpacked extension from a ChromeOS Linux container exposes
      // it to filesystem reliability issues. If this happens in the wild,
      // maybe consider base64-inlining the PNGs?
      console.error(`failed to fetch ${url}: ${err}`);
      spriteImg[size] = redFailImg();
    }
  }
  spriteImg.ready = true;
})();

function redFailImg() {
  const size = 100;
  const c = new OffscreenCanvas(size, size);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "darkred";
  ctx.fillRect(0, 0, size, size);
  return c;
}

// Get a <canvas> element of the given size.
const _canvasElements = newMap();
function _getCanvasContext(size) {
  let c = _canvasElements[size];
  if (!c) {
    if (typeof document !== 'undefined') {
      c = document.createElement("canvas");
      c.width = c.height = size;
    } else {
      c = new OffscreenCanvas(size, size);
    }
    _canvasElements[size] = c;
  }
  return c.getContext("2d", {willReadFrequently: true});
}

// Images from spritesXX.png: [x, y, w, h]
const spriteBig = {
  "4": {16: [1, 1, 9, 14],
        32: [1, 1, 21, 28]},
  "6": {16: [11, 1, 9, 14],
        32: [23, 1, 21, 28]},
  "?": {16: [21, 1, 9, 14],
        32: [45, 1, 21, 28]},
};
const spriteSmall = {
  "4": {16: [31, 1, 6, 6],
        32: [67, 1, 10, 10]},
  "6": {16: [31, 8, 6, 6],
        32: [67, 12, 10, 10]},
};

// Destination coordinates: [x, y]
const targetBig = {
  16: [0, 1],
  32: [0, 2],
};
const targetSmall1 = {
  16: [10, 1],
  32: [22, 2],
};
const targetSmall2 = {
  16: [10, 8],
  32: [22, 14],
};

// pattern is 0..3 characters, each '4', '6', or '?'.
// size is 16 or 32.
// color is "lightfg" or "darkfg".
function buildIcon(pattern, size, color) {
  if (!spriteImg.ready) throw "must await spriteImgReady!";
  const ctx = _getCanvasContext(size);
  ctx.clearRect(0, 0, size, size);
  if (pattern.length >= 1) {
    drawSprite(ctx, size, targetBig, spriteBig[pattern.charAt(0)]);
  }
  if (pattern.length >= 2) {
    drawSprite(ctx, size, targetSmall1, spriteSmall[pattern.charAt(1)]);
  }
  if (pattern.length >= 3) {
    drawSprite(ctx, size, targetSmall2, spriteSmall[pattern.charAt(2)]);
  }
  const imageData = ctx.getImageData(0, 0, size, size);
  if (color == "lightfg") {
    // Apply the light foreground color.
    const px = imageData.data;
    const floor = 128;
    for (var i = 0; i < px.length; i += 4) {
      px[i+0] += floor;
      px[i+1] += floor;
      px[i+2] += floor;
    }
  }
  return imageData;
}

function drawSprite(ctx, size, targets, sources) {
  const source = sources[size];
  const target = targets[size];
  // (image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight)
  ctx.drawImage(spriteImg[size],
                source[0], source[1], source[2], source[3],
                target[0], target[1], source[2], source[3]);
}

const DEFAULT_OPTIONS = {
  regularColorScheme: "auto",
  incognitoColorScheme: "lightfg",
  providerId: "ipify",
  providerMetrics: "",
};

const NAT64_KEY = "nat64/";
const NAT64_VALIDATE = /^nat64\/[0-9a-f]{24}$/;
const NAT64_DEFAULTS = new Set([
  parseIP("::ffff:0:0").slice(0, 96/4),  // For stupid AAAA records
  parseIP("64:ff9b::").slice(0, 96/4),   // RFC 6052
  parseIP("64:ff9b:1::").slice(0, 96/4), // RFC 8215
]);

const METRIC_LABELS = {
  ip: "Public IP",
  country: "Country",
  country_code: "Country Code",
  region: "Region",
  city: "City",
  org: "Organization",
  asn: "ASN",
  isp: "ISP",
  timezone: "Timezone",
  latitude: "Latitude",
  longitude: "Longitude",
  continent: "Continent",
  postal_code: "Postal Code",
};

const METRIC_ORDER = Object.keys(METRIC_LABELS);

function extractIP(text) {
  if (!text) return null;
  const parts = text.match(/[0-9A-Fa-f:.]+/g) || [];
  for (const part of parts) {
    try {
      parseIP(part);
      return part;
    } catch {
      // keep searching
    }
  }
  return null;
}

const PROVIDERS = {
  ipify: {
    name: "ipify",
    url: "https://api.ipify.org?format=json",
    response: "json",
    metrics: ["ip"],
    parse: (data) => ({ip: data?.ip}),
  },
  iplocate: {
    name: "IPLocate",
    url: "https://api.iplocate.io/json",
    response: "json",
    metrics: [
      "ip",
      "country",
      "country_code",
      "region",
      "city",
      "org",
      "asn",
      "isp",
      "timezone",
      "latitude",
      "longitude",
      "continent",
      "postal_code",
    ],
    parse: (data) => ({
      ip: data?.ip,
      country: data?.country,
      country_code: data?.country_code,
      region: data?.region || data?.state || data?.subdivision,
      city: data?.city,
      org: data?.org || data?.organization,
      asn: data?.asn,
      isp: data?.isp,
      timezone: data?.timezone,
      latitude: data?.latitude,
      longitude: data?.longitude,
      continent: data?.continent,
      postal_code: data?.postal_code || data?.postal,
    }),
  },
  iplocation: {
    name: "iplocation.net (IPv4)",
    url: "https://ipv4.iplocation.net",
    response: "text",
    metrics: ["ip"],
    parse: (text) => ({ip: extractIP(text)}),
  },
  ip4only: {
    name: "ip4only.me",
    url: "https://ip4only.me/api/",
    response: "text",
    metrics: ["ip"],
    parse: (text) => ({ip: extractIP(text)}),
  },
  opendns: {
    name: "OpenDNS",
    url: "https://myip.dnsomatic.com/",
    response: "text",
    metrics: ["ip"],
    parse: (text) => ({ip: extractIP(text)}),
  },
};

const PROVIDER_ORDER = Object.keys(PROVIDERS);

function normalizeMetricSelection(value) {
  if (Array.isArray(value)) {
    return value.join(",");
  }
  if (typeof value == "string") {
    return value;
  }
  return "";
}

function parseMetricSelection(value) {
  if (!value) return [];
  return value.split(",").map((v) => v.trim()).filter(Boolean);
}

function providerMetricsFor(providerId) {
  return PROVIDERS[providerId]?.metrics || ["ip"];
}

function normalizeMetrics(metrics) {
  const out = {};
  for (const [key, value] of Object.entries(metrics || {})) {
    if (value === null || value === undefined) continue;
    const text = (typeof value == "string") ? value.trim() : String(value);
    if (text === "") continue;
    out[key] = text;
  }
  return out;
}

async function fetchProviderInfo(providerId) {
  const providerKey = PROVIDERS[providerId] ? providerId : DEFAULT_OPTIONS.providerId;
  const provider = PROVIDERS[providerKey];
  if (!provider) {
    return {providerId: providerId, providerName: "Unknown", error: "Unknown provider"};
  }
  let response = null;
  let text = "";
  try {
    response = await fetch(provider.url, {cache: "no-store"});
    text = await response.text();
  } catch (err) {
    return {providerId: providerKey, providerName: provider.name, error: String(err)};
  }
  if (!response.ok) {
    return {
      providerId: providerKey,
      providerName: provider.name,
      error: `HTTP ${response.status}`,
    };
  }
  let data = text;
  if (provider.response == "json") {
    try {
      data = JSON.parse(text);
    } catch (err) {
      return {providerId: providerKey, providerName: provider.name, error: "Bad JSON"};
    }
  }
  let metrics = {};
  try {
    metrics = provider.parse(data);
  } catch (err) {
    return {providerId: providerKey, providerName: provider.name, error: "Parse error"};
  }
  metrics = normalizeMetrics(metrics);
  return {providerId: providerKey, providerName: provider.name, metrics: metrics};
}

function formatProviderRows(metrics, metricOrder) {
  const rows = [];
  for (const key of metricOrder) {
    if (!metrics || !Object.prototype.hasOwnProperty.call(metrics, key)) {
      continue;
    }
    rows.push([METRIC_LABELS[key] || key, metrics[key]]);
  }
  return rows;
}

let _watchOptionsFunc = null;
const options = {ready: false, [NAT64_KEY]: new Set(NAT64_DEFAULTS)};
const optionsDirty = {};  // {option: number of writes in flight}
const optionsReady = (async function() {
  for (const [option, value] of Object.entries(DEFAULT_OPTIONS)) {
    options[option] = value;
    optionsDirty[option] = 0;
  }
  let items = null;
  try {
    items = await chromeAsync(chrome.storage.sync.get.bind(chrome.storage.sync));
  } catch (err) {
    console.warn("storage.sync unavailable; falling back to storage.local", err);
    optionsStorage = chrome.storage.local;
    items = await chromeAsync(optionsStorage.get.bind(optionsStorage));
  }
  for (const [option, value] of Object.entries(items)) {
    if (DEFAULT_OPTIONS.hasOwnProperty(option)) {
      if (option == "providerMetrics") {
        options[option] = normalizeMetricSelection(value);
      } else {
        options[option] = value;
      }
    } else if (NAT64_VALIDATE.test(option)) {
      options[NAT64_KEY].add(option.slice(NAT64_KEY.length));
    }
  }
  options.ready = true;
  _watchOptionsFunc?.(Object.keys(options));

  optionsStorage.onChanged.addListener(handleOptionsChanged);
})();

function handleOptionsChanged(changes) {
  // changes = {option: {oldValue: x, newValue: y}}
  if (!options.ready) return;
  const optionsChanged = [];
  for (const [option, {oldValue, newValue}] of Object.entries(changes)) {
    if (DEFAULT_OPTIONS.hasOwnProperty(option)) {
      let value = newValue || DEFAULT_OPTIONS[option];
      if (option == "providerMetrics") {
        value = normalizeMetricSelection(value);
      }
      if (options[option] != value) {
        if (optionsDirty[option] > 1) {
          // Forget local changes that occurred mid-write.
          optionsDirty[option] = 1;
        }
        options[option] = value;
        optionsChanged.push(option);
      }
    } else if (NAT64_VALIDATE.test(option)) {
      const packed96 = option.slice(NAT64_KEY.length);
      if (newValue && !options[NAT64_KEY].has(packed96)) {
        options[NAT64_KEY].add(packed96);
      } else if (!newValue && options[NAT64_KEY].has(packed96)) {
        options[NAT64_KEY].delete(packed96);
      } else {
        continue;  // no change
      }
      if (!optionsChanged.includes(NAT64_KEY)) {
        optionsChanged.push(NAT64_KEY);
      }
    }
  }
  if (optionsChanged.length) {
    _watchOptionsFunc?.(optionsChanged);
  }
}

function watchOptions(f) {
  if (_watchOptionsFunc) throw "redundant watchOptions!";
  _watchOptionsFunc = f;
  if (options.ready) {
    _watchOptionsFunc(Object.keys(options));
  }
}

function setOptions(newOptions) {
  const toSet = {};
  const optionsChanged = [];
  for (const option of Object.keys(DEFAULT_OPTIONS)) {
    let value = newOptions[option];
    if (option == "providerMetrics") {
      value = normalizeMetricSelection(value);
    }
    if (options[option] != value) {
      options[option] = value;
      optionsChanged.push(option);
      if (++optionsDirty[option] == 1) {
        toSet[option] = value;
      } else {
        // dirty > 1; the value is buffered and written later.
        console.log("setOptions buffered", option);
      }
    }
  }
  const doSet = async () => {
    if (Object.keys(toSet).length == 0) {
      return;  // no change
    }
    try {
      await chromeAsync(optionsStorage.set.bind(optionsStorage), toSet);
    } catch (err) {
      console.warn("setOptions failed", err);
      return;
    }
    for (const [option, value] of Object.entries(toSet)) {
      const dirty = optionsDirty[option];
      if (dirty > 1 && value != options[option]) {
        // user changed the value mid-write; push the latest value.
        toSet[option] = options[option];
        optionsDirty[option] = 1;
      } else {
        delete toSet[option];
        optionsDirty[option] = 0;
      }
    }
    return doSet();
  };
  void doSet();
  if (optionsChanged.length) {
    _watchOptionsFunc?.(optionsChanged);
  }
}

// Users can manually call this function to add a NAT64 prefix from the console.
function addNAT64(ip) {
  if (ip.endsWith("/96")) {
    ip = ip.slice(0, ip.length-3);
  }
  const packed96 = parseIP(ip).slice(0, 96/4);
  addPackedNAT64(packed96);
  return `Added NAT64 prefix ${formatIPv6(packed96)}/96`;
}

function addPackedNAT64(packed96) {
  if (options[NAT64_KEY].has(packed96)) {
    return;
  }
  const key = NAT64_KEY + packed96;
  if (!NAT64_VALIDATE.test(key)) throw "invalid packed96"
  options[NAT64_KEY].add(packed96);
  chromeAsync(optionsStorage.set.bind(optionsStorage), {[key]: 1}).catch((err) => {
    console.warn("failed to persist NAT64 prefix", err);
  });
  // NAT64 changes are reported synchronously.  When onChanged fires,
  // our local Set is used for deduplication.
  _watchOptionsFunc?.([NAT64_KEY]);
}

function revertNAT64() {
  let toRemove = [];
  for (const prefix96 of options[NAT64_KEY].keys()) {
    if (!NAT64_DEFAULTS.has(prefix96)) {
      toRemove.push(NAT64_KEY + prefix96);
    }
  }
  options[NAT64_KEY] = new Set(NAT64_DEFAULTS);
  if (toRemove.length) {
    chromeAsync(optionsStorage.remove.bind(optionsStorage), toRemove).catch((err) => {
      console.warn("failed to remove NAT64 prefixes", err);
    });
    // NAT64 changes are reported synchronously.  When onChanged fires,
    // our local Set is used for deduplication.
    _watchOptionsFunc?.([NAT64_KEY]);
  }
}

if (chrome.runtime.getManifest().background.service_worker &&
    typeof window !== 'undefined' && window.matchMedia) {
  // We are running in Chrome, and the Options or Popup UI is visible.
  // Send darkMode updates to the service_worker.
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  chrome.runtime.sendMessage({darkModeInteractive: query.matches});
  query.addEventListener("change", (event) => {
    chrome.runtime.sendMessage({darkModeInteractive: event.matches});
  });
}

function getOptionsStorage() {
  return optionsStorage;
}

const COMMON_EXPORTS = {
  MANIFEST_VERSION,
  USE_CALLBACKS,
  chromeAsync,
  FLAG_SSL,
  FLAG_NOSSL,
  FLAG_UNCACHED,
  FLAG_CONNECTED,
  FLAG_WEBSOCKET,
  FLAG_NOTWORKER,
  IPV4_ONLY_DOMAINS,
  newMap,
  clearMap,
  sleep,
  removeChildren,
  spriteImgReady,
  buildIcon,
  extractIP,
  METRIC_LABELS,
  METRIC_ORDER,
  PROVIDERS,
  PROVIDER_ORDER,
  normalizeMetricSelection,
  parseMetricSelection,
  providerMetricsFor,
  normalizeMetrics,
  fetchProviderInfo,
  formatProviderRows,
  DEFAULT_OPTIONS,
  NAT64_KEY,
  NAT64_DEFAULTS,
  options,
  optionsDirty,
  optionsReady,
  handleOptionsChanged,
  watchOptions,
  setOptions,
  addNAT64,
  addPackedNAT64,
  revertNAT64,
  getOptionsStorage,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = COMMON_EXPORTS;
}
if (typeof globalThis !== "undefined") {
  Object.assign(globalThis, COMMON_EXPORTS);
}
