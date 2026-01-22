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

// Requires <script src="common.js">

let providerSelect = null;
let providerUrl = null;
let providerMetricsBox = null;
let providerTestBtn = null;
let providerTestStatus = null;
let providerTestTable = null;

function buildProviderSelect() {
  for (const id of PROVIDER_ORDER) {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = PROVIDERS[id].name;
    providerSelect.appendChild(opt);
  }
}

const OPTIONS_EXPORTS = {
  buildProviderSelect,
  buildMetricCheckboxes,
  updateProviderUI,
  getSelectedMetrics,
  setSelectedMetrics,
  renderProviderTest,
  runProviderTest,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = OPTIONS_EXPORTS;
}
if (typeof globalThis !== "undefined") {
  Object.assign(globalThis, OPTIONS_EXPORTS);
}

function buildMetricCheckboxes() {
  for (const key of METRIC_ORDER) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset.metric = key;
    label.appendChild(input);
    label.appendChild(document.createTextNode(METRIC_LABELS[key] || key));
    providerMetricsBox.appendChild(label);
  }
}

function updateProviderUI(providerId) {
  const provider = PROVIDERS[providerId];
  providerUrl.textContent = provider ? provider.url : "";
  const supported = new Set(providerMetricsFor(providerId));
  for (const input of providerMetricsBox.querySelectorAll("input[type=\"checkbox\"]")) {
    const key = input.dataset.metric;
    if (!supported.has(key)) {
      input.checked = false;
      input.disabled = true;
    } else {
      input.disabled = false;
    }
  }
}

function getSelectedMetrics() {
  const metrics = [];
  for (const input of providerMetricsBox.querySelectorAll("input[type=\"checkbox\"]")) {
    if (input.checked && !input.disabled) {
      metrics.push(input.dataset.metric);
    }
  }
  return metrics;
}

function setSelectedMetrics(selection) {
  const selected = new Set(parseMetricSelection(selection));
  for (const input of providerMetricsBox.querySelectorAll("input[type=\"checkbox\"]")) {
    if (input.disabled) {
      input.checked = false;
    } else {
      input.checked = selected.has(input.dataset.metric);
    }
  }
}

function renderProviderTest(result) {
  removeChildren(providerTestTable);
  if (!result) {
    providerTestStatus.textContent = "No result";
    providerTestStatus.style.color = "#800000";
    return;
  }
  if (result.error) {
    providerTestStatus.textContent = `Error: ${result.error}`;
    providerTestStatus.style.color = "#800000";
    return;
  }
  providerTestStatus.textContent = `OK: ${result.providerName}`;
  providerTestStatus.style.color = "#008000";
  const order = providerMetricsFor(result.providerId);
  const rows = formatProviderRows(result.metrics, order);
  for (const [label, value] of rows) {
    const tr = document.createElement("tr");
    const tdLabel = document.createElement("td");
    const tdValue = document.createElement("td");
    tdLabel.textContent = label;
    tdValue.textContent = value;
    tr.appendChild(tdLabel);
    tr.appendChild(tdValue);
    providerTestTable.appendChild(tr);
  }
}

async function runProviderTest() {
  const providerId = providerSelect.value;
  providerTestStatus.textContent = "Testing...";
  providerTestStatus.style.color = "#444";
  const result = await fetchProviderInfo(providerId);
  renderProviderTest(result);
}

window.onload = async () => {
  await spriteImgReady;

  providerSelect = document.getElementById("provider_select");
  providerUrl = document.getElementById("provider_url");
  providerMetricsBox = document.getElementById("provider_metric_choices");
  providerTestBtn = document.getElementById("provider_test_btn");
  providerTestStatus = document.getElementById("provider_test_status");
  providerTestTable = document.getElementById("provider_test_table");

  buildProviderSelect();
  buildMetricCheckboxes();
  providerSelect.onchange = function() {
    updateProviderUI(providerSelect.value);
    document.optionsForm.onchange();
  };
  providerMetricsBox.addEventListener("change", function() {
    document.optionsForm.onchange();
  });

  for (const option of Object.keys(DEFAULT_OPTIONS)) {
    if (!option.endsWith("ColorScheme")) continue;
    for (const color of ["darkfg", "lightfg"]) {
      const canvas = document.getElementById(`${option}:${color}`);
      const ctx = canvas.getContext("2d");
      const imageData = buildIcon("646", 16, color);
      ctx.putImageData(imageData, 0, 0);
    }
  }

  const ipv4pages = document.getElementById("ipv4pages");
  for (const domain of IPV4_ONLY_DOMAINS.keys()) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = `https://${domain}`;
    a.target = "_blank";
    a.textContent = domain;
    li.appendChild(a);
    ipv4pages.appendChild(li);
  }

  watchOptions(function(optionsChanged) {
    for (const option of optionsChanged) {
      if (DEFAULT_OPTIONS.hasOwnProperty(option)) {
        if (option == "providerId") {
          providerSelect.value = options[option];
          updateProviderUI(options[option]);
        } else if (option == "providerMetrics") {
          setSelectedMetrics(options[option]);
        } else {
          const radio = document.optionsForm[option];
          radio.value = options[option];
        }
      } else if (option == NAT64_KEY) {
        const table = document.getElementById("nat64");
        removeChildren(table);
        for (const packed96 of Array.from(options[NAT64_KEY]).sort()) {
          const tr = document.createElement("tr");
          const td = document.createElement("td");
          td.appendChild(document.createTextNode(formatIPv6(packed96) + "/96"));
          tr.appendChild(td);
          table.appendChild(tr);
        }
      }
    }
  });

  document.optionsForm.onchange = function(evt) {
    const newOptions = {};
    for (const option of Object.keys(DEFAULT_OPTIONS)) {
      if (option == "providerId") {
        newOptions[option] = providerSelect.value;
      } else if (option == "providerMetrics") {
        newOptions[option] = getSelectedMetrics().join(",");
      } else {
        newOptions[option] = document.optionsForm[option].value;
      }
    }
    setOptions(newOptions);
  };

  providerTestBtn.onclick = function() {
    runProviderTest();
  };

  document.getElementById("revert_btn").onclick = function() {
    revertNAT64();
    setOptions(DEFAULT_OPTIONS);
  };

  document.getElementById("dismiss_btn").onclick = function() {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.close();
    }
  };

  // Workaround for https://bugzilla.mozilla.org/show_bug.cgi?id=1946972
  if (typeof browser != "undefined") {
    document.body.addEventListener("click", function(e) {
      if (e.target.tagName == "A" && (e.ctrlKey || e.metaKey || e.shiftKey)) {
        window.open(e.target.href);
        e.preventDefault();
      }
    });
    document.body.addEventListener("auxclick", function(e) {
      if (e.target.tagName == "A" && e.button == 1) {
        window.open(e.target.href);
        e.preventDefault();
      }
    });
  }
}
