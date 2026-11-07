export const agent = {
  id: "rambo",
  name: "Rambo",
  icon: "https://raw.githubusercontent.com/jiawei666/magpie-agent-rambo/v0.1.5/assets/rambo.png",
  dir: "~/.config/Rambo",
  config: "~/.config/Rambo/magpie.json",
  model: "model",
  notice: "Rambo reads Magpie settings when it starts. Restart Rambo after changing or disconnecting the model.",
};

export function connect({ gateway }) {
  return {
    baseURL: gateway.v1,
    apiKey: gateway.key,
    managedBy: "magpie",
  };
}
