const PROVIDER_ID = "magpie";
const PROVIDER_SECTION = `model_providers.${PROVIDER_ID}`;

function splitLines(source) {
  const lines = source.replace(/\r\n?/gu, "\n").split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

function joinLines(lines, lineEnding) {
  return lines.length ? `${lines.join(lineEnding)}${lineEnding}` : "";
}

function sectionName(line) {
  const arrayTable = line.match(/^\s*\[\[(.+?)\]\]\s*(?:#.*)?$/u);
  if (arrayTable) return arrayTable[1].trim();
  const table = line.match(/^\s*\[(.+?)\]\s*(?:#.*)?$/u);
  return table?.[1]?.trim() ?? null;
}

function isProviderSection(name) {
  return name === PROVIDER_SECTION || name?.startsWith(`${PROVIDER_SECTION}.`);
}

function isTopLevelKey(line, key) {
  return new RegExp(`^\\s*${key}\\s*=`, "u").test(line);
}

function replaceTopLevelValue(lines, key, replacement) {
  const firstSection = lines.findIndex(line => sectionName(line) !== null);
  const topLevelEnd = firstSection === -1 ? lines.length : firstSection;
  const existingIndex = lines.slice(0, topLevelEnd).findIndex(line => isTopLevelKey(line, key));
  if (existingIndex === -1) {
    lines.splice(topLevelEnd, 0, replacement);
    return;
  }
  lines[existingIndex] = replacement;
  for (let index = lines.length - 1; index > existingIndex; index -= 1) {
    if (index < topLevelEnd && isTopLevelKey(lines[index], key)) lines.splice(index, 1);
  }
}

function withoutProviderSections(lines) {
  const output = [];
  for (let index = 0; index < lines.length;) {
    const name = sectionName(lines[index]);
    if (!isProviderSection(name)) {
      output.push(lines[index]);
      index += 1;
      continue;
    }
    index += 1;
    while (index < lines.length && sectionName(lines[index]) === null) index += 1;
  }
  return output;
}

function tomlString(value) {
  return JSON.stringify(value);
}

function providerSectionLines(input, auth) {
  return [
    `[${PROVIDER_SECTION}]`,
    `name = ${tomlString("Magpie")}`,
    `base_url = ${tomlString(input.baseUrl)}`,
    `wire_api = "responses"`,
    `requires_openai_auth = false`,
    "",
    `[${PROVIDER_SECTION}.auth]`,
    `command = ${tomlString(auth.command)}`,
    `args = [${auth.args.map(tomlString).join(", ")}]`,
    "timeout_ms = 5000",
    "refresh_interval_ms = 0"
  ];
}

function topLevelEnd(lines) {
  const firstSection = lines.findIndex(line => sectionName(line) !== null);
  return firstSection === -1 ? lines.length : firstSection;
}

function hasInlineProviders(lines) {
  return lines
    .slice(0, topLevelEnd(lines))
    .some(line => /^\s*model_providers\s*=/u.test(line));
}

function withoutOwnedValues(lines) {
  const output = withoutProviderSections(lines);
  const end = topLevelEnd(output);
  for (let index = end - 1; index >= 0; index -= 1) {
    if (isTopLevelKey(output[index], "model") ||
        isTopLevelKey(output[index], "model_provider")) {
      output.splice(index, 1);
    }
  }
  return output;
}

function appendProviderSections(lines, sections) {
  if (!sections.length) return;
  if (lines.length && lines.at(-1) !== "") lines.push("");
  lines.push(...sections);
}

function captureProviderSections(lines) {
  const output = [];
  for (let index = 0; index < lines.length;) {
    const name = sectionName(lines[index]);
    if (!isProviderSection(name)) {
      index += 1;
      continue;
    }
    const start = index;
    index += 1;
    while (index < lines.length && sectionName(lines[index]) === null) index += 1;
    output.push(...lines.slice(start, index));
  }
  return output;
}

/**
 * Capture only the fields owned by this plugin. Other configuration and its
 * comments remain outside the snapshot and are never replaced on disconnect.
 */
export function captureOwnedConfig(source) {
  const lines = splitLines(source);
  const end = topLevelEnd(lines);
  const findValue = key => lines
    .slice(0, end)
    .find(line => isTopLevelKey(line, key)) ?? null;
  return {
    model: findValue("model"),
    modelProvider: findValue("model_provider"),
    providerSections: captureProviderSections(lines)
  };
}

/**
 * Replace only the top-level provider selector and Magpie-owned provider
 * fields. Comments, unrelated sections, and unknown user configuration remain
 * byte-for-byte intact apart from line-ending normalization.
 */
export function mergeRamboConfig(source, input, auth) {
  const lineEnding = source.includes("\r\n") ? "\r\n" : "\n";
  const originalLines = splitLines(source);
  if (hasInlineProviders(originalLines)) {
    throw new Error("inline model_providers is not supported");
  }
  const lines = withoutProviderSections(originalLines);
  replaceTopLevelValue(lines, "model", `model = ${tomlString(input.model)}`);
  replaceTopLevelValue(lines, "model_provider", `model_provider = ${tomlString(PROVIDER_ID)}`);
  appendProviderSections(lines, providerSectionLines(input, auth));
  return joinLines(lines, lineEnding);
}

/**
 * Restore only the values captured before the first Magpie write. Changes made
 * by Rambo or other plugins to unrelated fields survive a disconnect.
 */
export function restoreOwnedConfig(source, snapshot) {
  const lineEnding = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = withoutOwnedValues(splitLines(source));
  const ownedTopLevel = [snapshot.model, snapshot.modelProvider].filter(Boolean);
  if (ownedTopLevel.length) {
    lines.splice(topLevelEnd(lines), 0, ...ownedTopLevel);
  }
  appendProviderSections(lines, snapshot.providerSections ?? []);
  return joinLines(lines, lineEnding);
}
