const { contextBridge, ipcRenderer } = require("electron");
const commands = ["workspace:get", "workspace:save", "settings:get", "settings:save", "story:generate", "flow:doctor", "flow:chromeStatus", "flow:auth", "dialog:pickChrome", "flow:character:create", "flow:character:list", "flow:media:list", "flow:scene:list", "flow:agent:run", "flow:agent:instruction", "flow:agent:list", "flow:tool:create", "flow:tool:list", "flow:batch", "dialog:pickYaml", "flow:extend", "flow:run", "flow:stop", "flow:sdkDoctor", "flow:sdkProjects", "flow:sdkCreateProject", "dialog:pickImages", "shell:openPath", "shell:openFlow", "workspace:chooseOutput"];
contextBridge.exposeInMainWorld("studio", {
  invoke: (command, payload) => {
    if (!commands.includes(command)) throw new Error("Unsupported IPC action: " + command);
    return ipcRenderer.invoke(command, payload);
  },
  subscribe: (callback) => {
    const handler = (_event, message) => callback(message);
    ipcRenderer.on("studio:event", handler);
    return () => ipcRenderer.removeListener("studio:event", handler);
  }
});
