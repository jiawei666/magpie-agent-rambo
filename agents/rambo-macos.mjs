export const agent = {
  id: "rambo",
  name: "Rambo",
  icon: "https://raw.githubusercontent.com/jiawei666/magpie-agent-rambo/v0.1.7/assets/rambo.png",
  dir: "/Applications/Rambo.app",
  config: "~/.config/magpie/agent-state/rambo/bridge.json",
  model: "model",
  notice: "The Rambo plugin writes Rambo's Codex config. Restart Rambo after changing or disconnecting the model.",
};

export function connect({ gateway }) {
  return {
    baseURL: gateway.v1,
    apiKey: gateway.key,
    managedBy: "magpie",
  };
}
