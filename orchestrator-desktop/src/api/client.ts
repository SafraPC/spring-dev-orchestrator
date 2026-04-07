import { invoke } from "@tauri-apps/api/core";
import type { ContainerDto, JdkInfo, ServiceDto, StopResultDto, WorkspaceDto } from "./types";

async function core<T>(method: string, params: unknown = {}): Promise<T> {
  try {
    return await invoke<T>("core_request", { method, params });
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error(typeof error === "string" ? error : `Falha no core: ${String(error)}`);
  }
}

export const api = {
  getWorkspace: () => core<WorkspaceDto>("getWorkspace"),
  importRootAndScan: (root: string) => core<ServiceDto[]>("importRootAndScan", { root }),
  scanRoots: () => core<ServiceDto[]>("scanRoots"),
  listServices: () => core<ServiceDto[]>("listServices"),

  start: (name: string) => core<ServiceDto>("startService", { name }),
  stop: (name: string) => core<StopResultDto>("stopService", { name }),
  restart: (name: string) => core<ServiceDto>("restartService", { name }),
  startAll: () => core<ServiceDto[]>("startAll"),
  stopAll: () => core<StopResultDto[]>("stopAll"),
  removeService: (name: string) => core<ServiceDto[]>("removeService", { name }),

  subscribeLogs: (name: string, tail = 200) => core<{ subId: string }>("subscribeLogs", { name, tail }),
  unsubscribeLogs: (subId: string) => core<{ ok: boolean }>("unsubscribeLogs", { subId }),
  selectFolder: () => invoke<string | null>("select_folder"),

  createContainer: (name: string, description?: string) => core<ContainerDto>("createContainer", { name, description }),
  deleteContainer: (id: string) => core<ContainerDto>("deleteContainer", { id }),
  listContainers: () => core<ContainerDto[]>("listContainers"),
  addServiceToContainer: (serviceName: string, containerId: string) => core<ServiceDto[]>("addServiceToContainer", { name: serviceName, containerId }),
  removeServiceFromContainer: (serviceName: string, containerId: string) => core<ServiceDto[]>("removeServiceFromContainer", { name: serviceName, containerId }),
  startContainer: (containerId: string) => core<ServiceDto[]>("startContainer", { containerId }),
  stopContainer: (containerId: string) => core<StopResultDto[]>("stopContainer", { containerId }),

  openServiceFolder: (name: string) => core<{ ok: boolean; message: string }>("openServiceFolder", { name }),
  openServiceTerminal: (name: string) => core<{ ok: boolean; message: string }>("openServiceTerminal", { name }),
  openServiceInEditor: (name: string) => core<{ ok: boolean; message: string }>("openServiceInEditor", { name }),

  listJdks: () => core<JdkInfo[]>("listJdks"),
  setServiceJavaVersion: (name: string, javaVersion: string | null) => core<ServiceDto[]>("setServiceJavaVersion", { name, javaVersion }),
};

