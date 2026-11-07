export const agent = {
  id: "rambo",
  name: "Rambo",
  icon: new URL("../assets/rambo.png", import.meta.url).href,
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
