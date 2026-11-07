import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { test } from "node:test";
import { inflateSync } from "node:zlib";
import { agent, connect } from "../agents/rambo-macos.mjs";
import { agent as windowsAgent } from "../agents/rambo-windows.mjs";
import { agent as linuxAgent } from "../agents/rambo-linux.mjs";
import {
  _internal,
  parseBridge,
  pathsFor,
  syncOnce
} from "../src/config-sync.mjs";
import {
  captureOwnedConfig,
  mergeRamboConfig,
  restoreOwnedConfig
} from "../src/toml.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const agentIcon = "https://raw.githubusercontent.com/jiawei666/magpie-agent-rambo/v0.1.7/assets/rambo.png";
const bridgeValue = {
  managedBy: "magpie",
  baseURL: "http://127.0.0.1:4312/v1",
  apiKey: "magpie-test-key",
  model: "provider/model"
};
const auth = {
  command: "/bin/cat",
  args: ["/tmp/magpie-token"]
};

function readPngAlpha(png) {
  const chunks = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IDAT") chunks.push(data);
    offset += length + 12;
  }
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  assert.equal(png[24], 8);
  assert.equal(png[25], 6);
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const raw = inflateSync(Buffer.concat(chunks));
  const pixels = Array.from({ length: height }, () => Buffer.alloc(stride));
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const source = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x += 1) {
      const left = x >= bytesPerPixel ? pixels[y][x - bytesPerPixel] : 0;
      const above = y ? pixels[y - 1][x] : 0;
      const upperLeft = y && x >= bytesPerPixel ? pixels[y - 1][x - bytesPerPixel] : 0;
      let predictor;
      if (filter === 0) predictor = 0;
      else if (filter === 1) predictor = left;
      else if (filter === 2) predictor = above;
      else if (filter === 3) predictor = Math.floor((left + above) / 2);
      else {
        const estimate = left + above - upperLeft;
        const leftDistance = Math.abs(estimate - left);
        const aboveDistance = Math.abs(estimate - above);
        const upperLeftDistance = Math.abs(estimate - upperLeft);
        predictor = leftDistance <= aboveDistance && leftDistance <= upperLeftDistance
          ? left
          : aboveDistance <= upperLeftDistance ? above : upperLeft;
      }
      pixels[y][x] = (source[x] + predictor) & 0xff;
    }
  }
  return (x, y) => pixels[y][x * bytesPerPixel + 3];
}

function svgIcon(pkg) {
  assert.match(pkg.magpie.icon, /^data:image\/svg\+xml;base64,/u);
  return Buffer.from(pkg.magpie.icon.split(",", 2)[1], "base64").toString("utf8");
}

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "magpie-agent-rambo-"));
  const stateDirectory = join(directory, "state");
  mkdirSync(stateDirectory, { recursive: true });
  return {
    directory,
    paths: {
      bridgePath: join(stateDirectory, "bridge.json"),
      statePath: join(stateDirectory, "owned-config.json"),
      tokenPath: join(stateDirectory, "token"),
      stateDirectory,
      targetPath: join(directory, "Rambo", "codex-home", "config.toml"),
      platform: "darwin"
    }
  };
}

test("package publishes both rounded icon entry points and v0.1.7 metadata", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const logo = readFileSync(join(root, "assets/rambo.png"));
  const svg = svgIcon(pkg);
  assert.ok(pkg.keywords.includes("magpie-plugin"));
  assert.ok(pkg.keywords.includes("magpie-agent"));
  assert.equal(pkg.version, "0.1.7");
  assert.equal(pkg.main, "./main.mjs");
  assert.equal(pkg.magpie.agent, "./agents/rambo-macos.mjs");
  assert.match(svg, /viewBox="0 0 24 24"/u);
  assert.match(svg, /<rect[^>]*width="24"[^>]*height="24"[^>]*rx="7\.636"/u);
  assert.match(svg, /clip-path="url\(#r\)"/u);
  assert.match(svg, /href="data:image\/png;base64,/u);
  assert.doesNotMatch(svg, /https?:\/\/(?!www\.w3\.org\/2000\/svg(?=["'\s]))/u);
  assert.ok(existsSync(join(root, pkg.magpie.agent)));
  assert.ok(existsSync(join(root, pkg.main)));
  assert.deepEqual([...logo.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(logo.readUInt32BE(16) >= 112);
  assert.equal(logo.readUInt32BE(16), logo.readUInt32BE(20));
  assert.equal(logo[24], 8);
  assert.ok([2, 6].includes(logo[25]));
  const alpha = readPngAlpha(logo);
  assert.equal(alpha(0, 0), 0);
  assert.equal(alpha(logo.readUInt32BE(16) - 1, 0), 0);
  assert.equal(alpha(0, logo.readUInt32BE(20) - 1), 0);
  assert.equal(alpha(logo.readUInt32BE(16) - 1, logo.readUInt32BE(20) - 1), 0);
  assert.equal(alpha(logo.readUInt32BE(16) / 2, logo.readUInt32BE(20) / 2), 255);
});

test("Agent descriptors use Magpie private state and keep Rambo free of bridge files", () => {
  assert.equal(agent.id, "rambo");
  assert.equal(agent.icon, agentIcon);
  assert.equal(agent.dir, "/Applications/Rambo.app");
  assert.equal(agent.config, "~/.config/magpie/agent-state/rambo/bridge.json");
  assert.equal(agent.model, "model");
  assert.equal("library" in agent, false);
  assert.equal(windowsAgent.dir, "$LOCALAPPDATA/Programs/Rambo");
  assert.equal(windowsAgent.config, "$APPDATA/magpie/agent-state/rambo/bridge.json");
  assert.equal(linuxAgent.dir, "~/.config/Rambo");
  assert.equal(linuxAgent.config, "~/.config/magpie/agent-state/rambo/bridge.json");
});

test("Agent files load in Magpie's script engine and return only the bridge payload", () => {
  for (const file of ["rambo-macos.mjs", "rambo-windows.mjs", "rambo-linux.mjs"]) {
    const source = readFileSync(join(root, "agents", file), "utf8");
    assert.doesNotMatch(source, /\b(?:URL|import\.meta|process|Buffer|require)\b/u);
    const sandbox = vm.createContext({});
    new vm.Script(
      source
        .replaceAll("export const agent = ", "agent = ")
        .replaceAll("export function connect(", "connect = function (")
    ).runInContext(sandbox);
    assert.equal(sandbox.agent.id, "rambo");
    assert.equal(sandbox.agent.icon, agentIcon);
    assert.deepEqual(JSON.parse(JSON.stringify(sandbox.connect({ gateway: {
      v1: "http://127.0.0.1:4312/v1",
      key: "magpie-test-key"
    } }))), {
      baseURL: "http://127.0.0.1:4312/v1",
      apiKey: "magpie-test-key",
      managedBy: "magpie"
    });
  }
  assert.deepEqual(connect({ gateway: {
    v1: "http://127.0.0.1:4312/v1",
    key: "magpie-test-key"
  } }), {
    baseURL: "http://127.0.0.1:4312/v1",
    apiKey: "magpie-test-key",
    managedBy: "magpie"
  });
});

test("platform paths and auth commands keep the key outside Rambo TOML", () => {
  const mac = pathsFor({
    platform: "darwin",
    home: "/Users/ada",
    environment: {}
  });
  assert.equal(mac.bridgePath, "/Users/ada/.config/magpie/agent-state/rambo/bridge.json");
  assert.equal(
    mac.targetPath,
    "/Users/ada/Library/Application Support/Rambo/codex-home/config.toml"
  );
  const windows = pathsFor({
    platform: "win32",
    home: "C:\\Users\\Ada",
    environment: { APPDATA: "C:\\Users\\Ada\\AppData\\Roaming" }
  });
  assert.equal(
    windows.targetPath,
    "C:\\Users\\Ada\\AppData\\Roaming\\Rambo\\codex-home\\config.toml"
  );
  assert.deepEqual(_internal.credentialCommand(windows), {
    command: "cmd.exe",
    args: [
      "/d",
      "/c",
      "type",
      "C:\\Users\\Ada\\AppData\\Roaming\\magpie\\agent-state\\rambo\\token"
    ]
  });
});

test("bridge parsing accepts loopback HTTP and rejects unsafe URLs or values", () => {
  assert.deepEqual(parseBridge(bridgeValue), {
    baseUrl: "http://127.0.0.1:4312/v1",
    apiKey: "magpie-test-key",
    model: "provider/model"
  });
  for (const baseURL of [
    "http://gateway.example/v1",
    "https://user:pass@gateway.example/v1",
    "https://gateway.example/v1?token=secret",
    "https://gateway.example/private"
  ]) {
    assert.throws(() => parseBridge({ ...bridgeValue, baseURL }));
  }
  assert.throws(() => parseBridge({ ...bridgeValue, apiKey: "secret\nforged" }));
  assert.equal(parseBridge({ ...bridgeValue, managedBy: "other" }), null);
});

test("TOML merge owns model, provider, and auth fields while preserving unrelated config", () => {
  const original = `# keep this comment
model = "old-model" # keep trailing comment
model_provider = "openai"
approval_policy = "read-only"

[model_providers.magpie]
name = "Old Magpie"
experimental_bearer_token = "old-secret"

[model_providers.magpie.auth]
command = "/old/helper"

[other]
enabled = true
`;
  const merged = mergeRamboConfig(original, {
    model: "new-model",
    baseUrl: "https://magpie.example/v1"
  }, auth);
  assert.match(merged, /^# keep this comment\nmodel = "new-model"\nmodel_provider = "magpie"/u);
  assert.match(merged, /approval_policy = "read-only"/u);
  assert.match(merged, /\[model_providers\.magpie\]/u);
  assert.match(merged, /base_url = "https:\/\/magpie\.example\/v1"/u);
  assert.match(merged, /\[model_providers\.magpie\.auth\]\ncommand = "\/bin\/cat"/u);
  assert.match(merged, /args = \["\/tmp\/magpie-token"\]/u);
  assert.match(merged, /\[other\]\nenabled = true/u);
  assert.equal(merged.includes("old-secret"), false);
  assert.equal(merged.includes("old-model"), false);

  const snapshot = captureOwnedConfig(original);
  const current = merged.replace('approval_policy = "read-only"', 'approval_policy = "never"');
  const restored = restoreOwnedConfig(current, snapshot);
  assert.match(restored, /model = "old-model" # keep trailing comment/u);
  assert.match(restored, /model_provider = "openai"/u);
  assert.match(restored, /approval_policy = "never"/u);
  assert.match(restored, /\[model_providers\.magpie\]\nname = "Old Magpie"/u);
  assert.equal(restored.includes("new-model"), false);
});

test("sync writes command auth, preserves unrelated edits, and restores owned fields", async () => {
  const { directory, paths } = fixture();
  try {
    mkdirSync(dirname(paths.targetPath), { recursive: true });
    writeFileSync(paths.targetPath, `model = "native-model"
model_provider = "openai"
approval_policy = "read-only"

[other]
value = "keep"
`, { mode: 0o640 });
    writeFileSync(paths.bridgePath, JSON.stringify(bridgeValue));

    assert.equal(await syncOnce(paths), "connected");
    const connected = readFileSync(paths.targetPath, "utf8");
    assert.match(connected, /model = "provider\/model"/u);
    assert.match(connected, /model_provider = "magpie"/u);
    assert.match(connected, /\[model_providers\.magpie\.auth\]/u);
    assert.ok(connected.includes(`args = ["${paths.tokenPath}"]`));
    assert.equal(connected.includes(bridgeValue.apiKey), false);
    assert.equal(readFileSync(paths.tokenPath, "utf8"), bridgeValue.apiKey);
    assert.equal(statSync(paths.tokenPath).mode & 0o777, 0o600);

    writeFileSync(paths.targetPath, connected.replace(
      'approval_policy = "read-only"',
      'approval_policy = "never"'
    ));
    chmodSync(paths.targetPath, 0o640);
    assert.equal(await syncOnce(paths), "connected");
    rmSync(paths.bridgePath);
    assert.equal(await syncOnce(paths), "restored");

    const restored = readFileSync(paths.targetPath, "utf8");
    assert.match(restored, /model = "native-model"/u);
    assert.match(restored, /model_provider = "openai"/u);
    assert.match(restored, /approval_policy = "never"/u);
    assert.match(restored, /\[other\]\nvalue = "keep"/u);
    assert.doesNotMatch(restored, /\[model_providers\.magpie/u);
    assert.equal(statSync(paths.targetPath).mode & 0o777, 0o640);
    assert.equal(existsSync(paths.tokenPath), false);
    assert.equal(existsSync(paths.statePath), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("sync removes a generated config when no original file existed", async () => {
  const { directory, paths } = fixture();
  try {
    writeFileSync(paths.bridgePath, JSON.stringify(bridgeValue));
    assert.equal(await syncOnce(paths), "connected");
    assert.ok(existsSync(paths.targetPath));
    assert.ok(existsSync(paths.tokenPath));
    rmSync(paths.bridgePath);
    assert.equal(await syncOnce(paths), "restored");
    assert.equal(existsSync(paths.targetPath), false);
    assert.equal(existsSync(paths.tokenPath), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
