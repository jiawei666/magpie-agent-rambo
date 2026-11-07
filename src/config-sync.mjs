import { randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, win32 } from "node:path";
import { captureOwnedConfig, mergeRamboConfig, restoreOwnedConfig } from "./toml.mjs";

const STATE_SCHEMA = "magpie-agent-rambo.owned-config.v2";
const POLL_INTERVAL_MS = 750;
const MAX_BRIDGE_BYTES = 16 * 1024;

function optionalText(value, label, maxLength) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > maxLength || /[\r\n]/u.test(text)) {
    throw new Error(`${label} is invalid`);
  }
  return text;
}

function normalizeGateway(value) {
  const raw = optionalText(value, "gateway URL", 2_000);
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("gateway URL is invalid");
  }
  const localHttp = url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname.toLocaleLowerCase());
  if (
    (url.protocol !== "https:" && !localHttp) ||
    url.username || url.password || url.search || url.hash ||
    !["", "/", "/v1", "/v1/"].includes(url.pathname)
  ) {
    throw new Error("gateway URL must use HTTPS or loopback HTTP and end at /v1");
  }
  const normalized = url.toString().replace(/\/$/u, "");
  return normalized.endsWith("/v1") ? normalized : `${normalized}/v1`;
}

export function parseBridge(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value;
  if (input.managedBy !== "magpie") return null;
  return {
    baseUrl: normalizeGateway(input.baseURL),
    apiKey: optionalText(input.apiKey, "gateway key", 8_192),
    model: optionalText(input.model, "model", 500)
  };
}

export function pathsFor(options = {}) {
  const platform = options.platform ?? process.platform;
  const home = options.home ?? homedir();
  const environment = options.environment ?? process.env;
  const pathJoin = platform === "win32" ? win32.join : join;
  const configHome = platform === "win32"
    ? environment.APPDATA?.trim() || pathJoin(home, "AppData", "Roaming")
    : environment.XDG_CONFIG_HOME?.trim() || pathJoin(home, ".config");
  const stateDirectory = pathJoin(configHome, "magpie", "agent-state", "rambo");
  const ramboDirectory = platform === "darwin"
    ? pathJoin(home, "Library", "Application Support", "Rambo")
    : platform === "win32"
      ? pathJoin(environment.APPDATA?.trim() || pathJoin(home, "AppData", "Roaming"), "Rambo")
      : pathJoin(configHome, "Rambo");
  return {
    bridgePath: pathJoin(stateDirectory, "bridge.json"),
    statePath: pathJoin(stateDirectory, "owned-config.json"),
    tokenPath: pathJoin(stateDirectory, "token"),
    stateDirectory,
    targetPath: pathJoin(ramboDirectory, "codex-home", "config.toml"),
    platform
  };
}

async function readOptional(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function fileMode(path) {
  try {
    return (await lstat(path)).mode & 0o777;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function writeAtomic(path, content, mode = 0o600) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  let backup = null;
  let preserveBackup = false;
  try {
    await writeFile(temporary, content, { mode, flag: "wx" });
    try {
      await rename(temporary, path);
    } catch (error) {
      if (!["EEXIST", "EPERM", "EACCES"].includes(error?.code)) throw error;
      const current = await readOptional(path);
      if (current !== null) {
        backup = `${path}.${process.pid}.${randomUUID()}.bak`;
        await rename(path, backup);
      }
      try {
        await rename(temporary, path);
      } catch (replacementError) {
        if (backup !== null) {
          try {
            await rename(backup, path);
            backup = null;
          } catch {
            preserveBackup = true;
          }
        }
        throw replacementError;
      }
    }
    await chmod(path, mode);
  } finally {
    await rm(temporary, { force: true });
    if (backup !== null && !preserveBackup) await rm(backup, { force: true });
  }
}

async function readBridge(path) {
  const source = await readOptional(path);
  if (source === null || Buffer.byteLength(source, "utf8") > MAX_BRIDGE_BYTES) return null;
  try {
    return parseBridge(JSON.parse(source));
  } catch {
    return null;
  }
}

async function readSnapshot(path) {
  const source = await readOptional(path);
  if (source === null) return null;
  let value;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error("original Rambo config snapshot is not valid JSON");
  }
  if (
    value?.schema !== STATE_SCHEMA ||
    typeof value.targetExisted !== "boolean" ||
    (value.mode !== null && (!Number.isInteger(value.mode) || value.mode < 0 || value.mode > 0o777)) ||
    !value.owned ||
    (value.owned.model !== null && typeof value.owned.model !== "string") ||
    (value.owned.modelProvider !== null && typeof value.owned.modelProvider !== "string") ||
    !Array.isArray(value.owned.providerSections) ||
    !value.owned.providerSections.every(line => typeof line === "string")
  ) {
    throw new Error("Rambo-owned configuration snapshot is invalid");
  }
  return value;
}

async function takeSnapshot(targetPath, statePath) {
  const content = await readOptional(targetPath);
  const snapshot = {
    schema: STATE_SCHEMA,
    targetExisted: content !== null,
    mode: content === null ? null : await fileMode(targetPath),
    owned: captureOwnedConfig(content ?? "")
  };
  await writeAtomic(statePath, `${JSON.stringify(snapshot, null, 2)}\n`);
  return snapshot;
}

function sameSnapshot(left, right) {
  return left.schema === right.schema &&
    left.targetExisted === right.targetExisted &&
    left.mode === right.mode &&
    JSON.stringify(left.owned) === JSON.stringify(right.owned);
}

function credentialCommand(paths) {
  if (paths.platform === "win32") {
    return {
      command: "cmd.exe",
      args: ["/d", "/c", "type", paths.tokenPath]
    };
  }
  return {
    command: "/bin/cat",
    args: [paths.tokenPath]
  };
}

/**
 * Apply the Magpie-owned fields to Rambo's standard Codex config while the
 * Magpie-owned bridge is active. When the bridge becomes inactive, restore
 * only those owned fields and preserve unrelated changes.
 */
export async function syncOnce(paths) {
  const bridge = await readBridge(paths.bridgePath);
  let snapshot = await readSnapshot(paths.statePath);
  if (bridge) {
    const current = await readOptional(paths.targetPath);
    if (snapshot === null) {
      snapshot = await takeSnapshot(paths.targetPath, paths.statePath);
    }
    await writeAtomic(paths.tokenPath, bridge.apiKey);
    const next = mergeRamboConfig(current ?? "", bridge, credentialCommand(paths));
    if (next !== current) await writeAtomic(paths.targetPath, next);
    return "connected";
  }
  if (snapshot === null) return "idle";
  const current = await readOptional(paths.targetPath);
  const restored = restoreOwnedConfig(current ?? "", snapshot.owned);
  if (!snapshot.targetExisted && current === null) {
    // Nothing was added by the plugin and there is no target to clean up.
  } else if (!snapshot.targetExisted && restored.trim() === "") {
    await rm(paths.targetPath, { force: true });
  } else {
    await writeAtomic(paths.targetPath, restored, snapshot.mode ?? 0o600);
  }
  await rm(paths.tokenPath, { force: true });
  await rm(paths.statePath, { force: true });
  return "restored";
}

export function startConfigSync(paths = pathsFor(), logger = console) {
  let stopped = false;
  let running = false;
  const run = async () => {
    if (stopped || running) return;
    running = true;
    try {
      await mkdir(paths.stateDirectory, { recursive: true, mode: 0o700 });
      await syncOnce(paths);
    } catch (error) {
      logger.error(
        "[magpie-agent-rambo] configuration sync failed:",
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      running = false;
    }
  };
  void run();
  const timer = setInterval(() => void run(), POLL_INTERVAL_MS);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

export const _internal = {
  MAX_BRIDGE_BYTES,
  POLL_INTERVAL_MS,
  STATE_SCHEMA,
  credentialCommand,
  fileMode,
  readOptional,
  sameSnapshot,
  takeSnapshot,
  writeAtomic
};
