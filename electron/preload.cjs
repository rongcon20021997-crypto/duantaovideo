const { contextBridge, ipcRenderer } = require("electron");
const commands = ["workspace:get", "workspace:save", "settings:get", "settings:save", "story:generate", "flow:doctor", "flow:auth", "flow:character:create", "flow:character:list", "flow:media:list", "flow:extend", "flow:run", "flow:stop", "flow:sdkDoctor", "flow:sdkProjects", "dialog:pickImages", "shell:openPath", "shell:openFlow", "workspace:chooseOutput"];
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
