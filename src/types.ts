export type SceneStatus = "pending" | "generating" | "completed" | "failed";
export type Scene = {
 id: string; title: string; prompt: string; imagePrompt: string; voiceover: string;
 duration: number; status: SceneStatus; image?: string; video?: string; error?: string;
};
export type Character = { name: string; prompt: string; description: string; voice: string; referenceImages: string[]; thumbnail?: string; };
export type Workspace = { name: string; topic: string; project: string; profile: string; engine: "gflow" | "sdk"; outputDir: string; ratio: "9:16" | "16:9"; imageModel: string; videoModel: string; prepareImages: boolean; character: Character; scenes: Scene[]; };
export type UserSettings = { provider: "openai" | "gemini"; model: string; hasKey: boolean; keyStored: boolean; };
export type StudioEvent = { kind: "log" | "scene" | "run" | "character"; message?: string; sceneId?: string; status?: SceneStatus; image?: string; video?: string; error?: string; running?: boolean; character?: string; };
export type StudioApi = { invoke: <T=unknown>(command: string, payload?: unknown) => Promise<T>; subscribe: (callback: (event: StudioEvent) => void) => () => void; };
declare global { interface Window { studio: StudioApi; } }
