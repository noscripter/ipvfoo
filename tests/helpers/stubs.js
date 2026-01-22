const { EventEmitter } = require("events");

function makeStorageArea(initial = {}) {
  let store = { ...initial };
  const emitter = new EventEmitter();

  function notify(changes) {
    if (Object.keys(changes).length) {
      emitter.emit("change", changes);
    }
  }

  function buildResult(keys) {
    if (!keys) return { ...store };
    if (typeof keys === "string") {
      return { [keys]: store[keys] };
    }
    if (Array.isArray(keys)) {
      const out = {};
      for (const key of keys) out[key] = store[key];
      return out;
    }
    if (typeof keys === "object") {
      const out = {};
      for (const [key, def] of Object.entries(keys)) {
        out[key] = store.hasOwnProperty(key) ? store[key] : def;
      }
      return out;
    }
    return { ...store };
  }

  return {
    get: async (keys) => buildResult(keys),
    set: async (items) => {
      const changes = {};
      for (const [key, value] of Object.entries(items)) {
        changes[key] = { oldValue: store[key], newValue: value };
        store[key] = value;
      }
      notify(changes);
    },
    remove: async (keys) => {
      const list = Array.isArray(keys) ? keys : [keys];
      const changes = {};
      for (const key of list) {
        if (store.hasOwnProperty(key)) {
          changes[key] = { oldValue: store[key], newValue: undefined };
          delete store[key];
        }
      }
      notify(changes);
    },
    clear: async () => {
      const changes = {};
      for (const key of Object.keys(store)) {
        changes[key] = { oldValue: store[key], newValue: undefined };
      }
      store = {};
      notify(changes);
    },
    onChanged: {
      addListener: (fn) => emitter.on("change", fn),
    },
    _dump: () => ({ ...store }),
  };
}

function makeChromeStub(manifest) {
  const sync = makeStorageArea();
  const local = makeStorageArea();
  const session = makeStorageArea();

  return {
    runtime: {
      getManifest: () =>
        manifest || { manifest_version: 3, background: { service_worker: "background.js" } },
      onMessage: { addListener: () => {} },
      onConnect: { addListener: () => {} },
      sendMessage: () => {},
      connect: () => ({
        name: "0",
        onMessage: { addListener: () => {} },
        onDisconnect: { addListener: () => {} },
        postMessage: () => {},
      }),
    },
    storage: {
      sync,
      local,
      session,
    },
    permissions: {
      getAll: async () => ({ origins: ["<all_urls>"] }),
      request: async () => true,
    },
    tabs: {
      query: async () => [],
    },
    offscreen: {
      createDocument: async () => {},
      closeDocument: async () => {},
    },
    pageAction: {},
    action: {},
  };
}

function installFetchStub({ failPng = false } = {}) {
  const pngResponse = {
    ok: true,
    status: 200,
    text: async () => "",
    blob: async () => new Blob([new Uint8Array([0])]),
  };
  const mocks = new Map();

  const fetchStub = async (url) => {
    const href = typeof url === "string" ? url : String(url);
    if (href.endsWith(".png")) {
      if (failPng) {
        throw new Error("png fetch failed");
      }
      return pngResponse;
    }
    if (mocks.has(href)) {
      const mock = mocks.get(href);
      return {
        ok: mock.ok !== undefined ? mock.ok : true,
        status: mock.status !== undefined ? mock.status : 200,
        text: async () => mock.text || "",
        blob: async () => new Blob([new Uint8Array([0])]),
      };
    }
    return { ok: false, status: 404, text: async () => "" };
  };

  return {
    fetchStub,
    setMock: (url, text, status = 200) => {
      mocks.set(url, { text, status });
    },
    clear: () => mocks.clear(),
  };
}

function installCanvasStub(globalObj) {
  function makeContext(width, height) {
    return {
      fillStyle: "",
      fillRect: () => {},
      clearRect: () => {},
      drawImage: () => {},
      getImageData: () => ({ data: new Uint8ClampedArray(width * height * 4) }),
      putImageData: () => {},
    };
  }

  class FakeCanvas {
    constructor(width, height) {
      this.width = width;
      this.height = height;
    }

    getContext() {
      return makeContext(this.width, this.height);
    }
  }

  globalObj.OffscreenCanvas = FakeCanvas;
}

module.exports = {
  makeStorageArea,
  makeChromeStub,
  installFetchStub,
  installCanvasStub,
};
