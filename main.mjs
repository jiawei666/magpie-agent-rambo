import { _internal as configSyncInternals, startConfigSync } from "./src/config-sync.mjs";

let stopSync = null;

export default async function RamboAgentPlugin() {
  stopSync ??= startConfigSync();
  return {};
}

export const _internal = configSyncInternals;
