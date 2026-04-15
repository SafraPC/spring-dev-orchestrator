import { invoke } from "@tauri-apps/api/core";
import type { ContainerDto, JdkInfo, RuntimeSettingsDto, ServiceDto, StopResultDto, WorkspaceDto } from "./types";

type CoreJob<T> = () => Promise<T>;

let coreRequestTail: Promise<unknown> = Promise.resolve();
const CORE_REQUEST_TIMEOUT_MS = 45_000;

function enqueueCoreRequest<T>(job: CoreJob<T>): Promise<T> {
  const run = coreRequestTail.then(() => job());
  coreRequestTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function core<T>(method: string, params: unknown = {}): Promise<T> {
  return enqueueCoreRequest(async () => {
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    try {
      const result = await Promise.race([
        invoke<T>("core_request", { method, params }),
        new Promise<T>((_, reject) => {
          timeoutHandle = setTimeout(
            () => reject(new Error(`Timeout de ${CORE_REQUEST_TIMEOUT_MS / 1000}s aguardando resposta do core (${method}).`)),
            CORE_REQUEST_TIMEOUT_MS,
          );
        }),
      ]);
      return result;
    } catch (error) {
      if (error instanceof Error) throw error;
      throw new Error(typeof error === "string" ? error : `Falha no core: ${String(error)}`);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  });
}

export const api = {
  getWorkspace: () => core<WorkspaceDto>("getWorkspace"),
  importRootAndScan: (root: string) => core<ServiceDto[]>("importRootAndScan", { root }),
  importRootsAndScan: (roots: string[]) => core<ServiceDto[]>("importRootsAndScan", { roots }),
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
  selectJavaFolder: () => invoke<string | null>("select_java_folder"),
  selectJavaFile: () => invoke<string | null>("select_java_file"),
  getRuntimeSettings: () => invoke<RuntimeSettingsDto>("get_runtime_settings"),
  setJavaRuntimePath: (javaPath: string | null) => invoke<RuntimeSettingsDto>("set_java_runtime_path", { javaPath }),

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
  setServiceScript: (name: string, script: string) => core<ServiceDto[]>("setServiceScript", { name, script }),
  setServicePort: (name: string, port: number) => core<ServiceDto[]>("setServicePort", { name, port }),

  reorderServices: (order: string[]) => core<void>("reorderServices", { order }),
  reorderContainers: (order: string[]) => core<void>("reorderContainers", { order }),
};

