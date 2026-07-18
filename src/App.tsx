import { Excalidraw } from "@excalidraw/excalidraw";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createCanvas,
  deleteCanvas,
  loadCanvas,
  listCanvases,
  renameCanvas,
  saveCanvas,
  serializeCanvas,
  type CanvasMeta,
  type CanvasTheme,
  type ExcalidrawFile,
  normalizeCanvasTheme,
} from "./canvas/CanvasStore";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { NameDialog } from "./components/NameDialog";
import { RecordingDetail } from "./components/RecordingDetail";
import { Sidebar } from "./components/Sidebar";
import { Toolbar } from "./components/Toolbar";
import { Button } from "./components/ui/button";
import {
  listRecordings,
  loadRecording,
  recordingFilename,
  sessionToJson,
} from "./recorder/RecordingStore";
import { Recorder } from "./recorder/Recorder";
import type { RecordingSession, RecordingSummary } from "./recorder/types";

type SceneState = {
  elements: readonly unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
};

type ExcalidrawThemeApi = {
  updateScene: (sceneData: { appState?: { theme: CanvasTheme } }) => void;
};

type NameDialogState =
  | { mode: "create"; forced?: boolean }
  | { mode: "rename"; canvas: CanvasMeta };

const blankScene: SceneState = {
  elements: [],
  appState: { theme: "dark", viewBackgroundColor: "#ffffff" },
  files: {},
};

const storageKey = "excalidraw-recorder.sidebarCollapsed";

function initialCollapsed() {
  return localStorage.getItem(storageKey) === "true";
}

export function App() {
  const recorderRef = useRef(new Recorder());
  const sceneRef = useRef<SceneState>(blankScene);
  const saveTimerRef = useRef<number>();
  const activeCanvasIdRef = useRef<string>();
  const excalidrawApiRef = useRef<ExcalidrawThemeApi>();

  const [canvases, setCanvases] = useState<CanvasMeta[]>([]);
  const [activeCanvasId, setActiveCanvasId] = useState<string>();
  const [initialData, setInitialData] = useState<ExcalidrawFile>();
  const [activeTheme, setActiveTheme] = useState<CanvasTheme>("dark");
  const [recordings, setRecordings] = useState<RecordingSummary[]>([]);
  const [selectedRecording, setSelectedRecording] = useState<RecordingSession>();
  const [lastSession, setLastSession] = useState<RecordingSession>();
  const [nameDialog, setNameDialog] = useState<NameDialogState>();
  const [pendingSwitch, setPendingSwitch] = useState<CanvasMeta>();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(initialCollapsed);
  const [isRecording, setIsRecording] = useState(false);
  const [eventCount, setEventCount] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [loading, setLoading] = useState(true);

  const activeCanvas = useMemo(
    () => canvases.find((canvas) => canvas.id === activeCanvasId),
    [activeCanvasId, canvases],
  );

  const refreshCanvases = useCallback(async () => {
    const index = await listCanvases();
    setCanvases(index.canvases);
    return index;
  }, []);

  const refreshRecordings = useCallback(async (canvasId?: string) => {
    const targetCanvasId = canvasId ?? activeCanvasIdRef.current;
    if (!targetCanvasId) {
      setRecordings([]);
      return [];
    }
    const nextRecordings = await listRecordings(targetCanvasId);
    setRecordings(nextRecordings);
    return nextRecordings;
  }, []);

  const flushSave = useCallback(async () => {
    const canvasId = activeCanvasIdRef.current;
    if (!canvasId) {
      return;
    }
    window.clearTimeout(saveTimerRef.current);
    const data = serializeCanvas(
      sceneRef.current.elements,
      sceneRef.current.appState,
      sceneRef.current.files,
    );
    await saveCanvas(canvasId, data);
    void refreshCanvases();
  }, [refreshCanvases]);

  const openCanvas = useCallback(
    async (canvasId: string) => {
      const data = await loadCanvas(canvasId);
      setActiveCanvasId(canvasId);
      activeCanvasIdRef.current = canvasId;
      sceneRef.current = {
        elements: data.elements ?? [],
        appState: {
          ...(data.appState ?? blankScene.appState),
          theme: normalizeCanvasTheme(data.appState?.theme),
        },
        files: data.files ?? {},
      };
      setActiveTheme(normalizeCanvasTheme(sceneRef.current.appState.theme));
      recorderRef.current.setBaseline(sceneRef.current);
      setInitialData({
        ...data,
        appState: sceneRef.current.appState,
      });
      await refreshRecordings(canvasId);
      await refreshCanvases();
    },
    [refreshCanvases, refreshRecordings],
  );

  useEffect(() => {
    async function boot() {
      const index = await refreshCanvases();
      const nextActiveId =
        index.lastActiveId && index.canvases.some((canvas) => canvas.id === index.lastActiveId)
          ? index.lastActiveId
          : index.canvases[0]?.id;

      if (nextActiveId) {
        await openCanvas(nextActiveId);
      } else {
        setNameDialog({ mode: "create", forced: true });
      }
      setLoading(false);
    }

    void boot();
  }, [openCanvas, refreshCanvases]);

  useEffect(() => {
    localStorage.setItem(storageKey, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    document.documentElement.dataset.theme = activeTheme;
  }, [activeTheme]);

  useEffect(() => {
    if (!isRecording) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      const startedAtMs = recorderRef.current.startedAtMs;
      if (startedAtMs) {
        setDurationMs(Date.now() - startedAtMs);
      }
    }, 250);

    return () => window.clearInterval(interval);
  }, [isRecording]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      void flushSave();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [flushSave]);

  function scheduleSave() {
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void flushSave();
    }, 500);
  }

  function handleSceneChange(
    elements: readonly unknown[],
    appState: Record<string, unknown>,
    files: Record<string, unknown>,
  ) {
    const theme = normalizeCanvasTheme(appState.theme);
    setActiveTheme((current) => (current === theme ? current : theme));
    sceneRef.current = {
      elements,
      appState: {
        ...appState,
        theme,
      },
      files,
    };
    const events = recorderRef.current.recordChange(sceneRef.current);
    if (recorderRef.current.isRecording) {
      setEventCount(events.length);
    }
    scheduleSave();
  }

  function handleThemeChange(theme: CanvasTheme) {
    const nextTheme = normalizeCanvasTheme(theme);
    setActiveTheme((current) => (current === nextTheme ? current : nextTheme));
    sceneRef.current = {
      ...sceneRef.current,
      appState: {
        ...sceneRef.current.appState,
        theme: nextTheme,
      },
    };
    excalidrawApiRef.current?.updateScene({ appState: { theme: nextTheme } });
    scheduleSave();
  }

  function handleStartRecording() {
    if (!activeCanvas) {
      return;
    }
    recorderRef.current.start(activeCanvas.id, activeCanvas.name, sceneRef.current);
    setIsRecording(true);
    setEventCount(0);
    setDurationMs(0);
    setLastSession(undefined);
  }

  async function stopRecording() {
    const session = await recorderRef.current.stop(sceneRef.current);
    setIsRecording(false);
    setEventCount(0);
    setDurationMs(0);
    if (session) {
      setLastSession(session);
      await refreshRecordings(session.canvasId);
    }
    return session;
  }

  async function handleCreateCanvas(name: string) {
    const canvas = await createCanvas(name);
    await flushSave();
    setNameDialog(undefined);
    await openCanvas(canvas.id);
  }

  async function handleRenameCanvas(name: string) {
    if (!nameDialog || nameDialog.mode !== "rename") {
      return;
    }
    await renameCanvas(nameDialog.canvas.id, name);
    setNameDialog(undefined);
    await refreshCanvases();
  }

  async function handleDeleteCanvas(canvas: CanvasMeta) {
    const message =
      canvas.id === activeCanvasId && isRecording
        ? "Delete this canvas? The active recording will be stopped first."
        : "Delete this canvas and all of its recordings?";
    if (!window.confirm(message)) {
      return;
    }

    if (canvas.id === activeCanvasId && isRecording) {
      await stopRecording();
    }
    if (canvas.id === activeCanvasId) {
      await flushSave();
    }
    const index = await deleteCanvas(canvas.id);
    setCanvases(index.canvases);
    setSelectedRecording(undefined);

    const nextActiveId =
      index.lastActiveId && index.canvases.some((item) => item.id === index.lastActiveId)
        ? index.lastActiveId
        : index.canvases[0]?.id;
    if (nextActiveId) {
      await openCanvas(nextActiveId);
    } else {
      setActiveCanvasId(undefined);
      activeCanvasIdRef.current = undefined;
      setInitialData(undefined);
      setRecordings([]);
      setNameDialog({ mode: "create", forced: true });
    }
  }

  function requestCanvasSwitch(canvas: CanvasMeta) {
    if (canvas.id === activeCanvasId) {
      return;
    }
    setPendingSwitch(canvas);
  }

  async function confirmSwitch() {
    if (!pendingSwitch) {
      return;
    }
    if (isRecording) {
      await stopRecording();
    }
    await flushSave();
    await openCanvas(pendingSwitch.id);
    setPendingSwitch(undefined);
  }

  async function handleOpenRecording(recording: RecordingSummary) {
    const session = await loadRecording(recording.canvasId, recording.sessionId);
    setSelectedRecording(session);
  }

  async function copyLastSession() {
    if (!lastSession) {
      return;
    }
    await navigator.clipboard.writeText(sessionToJson(lastSession));
  }

  async function downloadLastSession() {
    if (!lastSession) {
      return;
    }
    await window.recorderAPI.export(recordingFilename(lastSession), sessionToJson(lastSession));
  }

  const showCanvas = activeCanvasId && initialData;

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="brand">
          <Button
            type="button"
            className="collapse-button"
            variant="outline"
            size="icon"
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen aria-hidden="true" size={16} />
            ) : (
              <PanelLeftClose aria-hidden="true" size={16} />
            )}
          </Button>
          <div>
            <div className="title-line">
              <h1>Cyprien&apos;s Excalidraw</h1>
            </div>
            <p>{activeCanvas?.name ?? "No canvas selected"}</p>
          </div>
        </div>
        <Toolbar
          isRecording={isRecording}
          eventCount={eventCount}
          durationMs={durationMs}
          theme={activeTheme}
          hasRecording={Boolean(lastSession)}
          onThemeChange={handleThemeChange}
          onStart={handleStartRecording}
          onStop={() => void stopRecording()}
          onCopy={() => void copyLastSession()}
          onDownload={() => void downloadLastSession()}
        />
      </header>

      <main className={`workspace ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        <Sidebar
          canvases={canvases}
          activeCanvasId={activeCanvasId}
          isRecording={isRecording}
          recordings={recordings}
          onCreateCanvas={() => setNameDialog({ mode: "create" })}
          onRenameCanvas={(canvas) => setNameDialog({ mode: "rename", canvas })}
          onDeleteCanvas={(canvas) => void handleDeleteCanvas(canvas)}
          onSelectCanvas={requestCanvasSwitch}
          onOpenRecording={(recording) => void handleOpenRecording(recording)}
        />

        <section className="canvas-host">
          {loading ? <div className="center-state">Loading...</div> : null}
          {!loading && !showCanvas ? (
            <div className="center-state">Create a canvas to start drawing.</div>
          ) : null}
          {showCanvas ? (
            <Excalidraw
              key={activeCanvasId}
              initialData={initialData as never}
              theme={activeTheme}
              excalidrawAPI={(api) => {
                excalidrawApiRef.current = api;
              }}
              onChange={(elements, appState, files) =>
                handleSceneChange(
                  elements as readonly unknown[],
                  appState as unknown as Record<string, unknown>,
                  files as Record<string, unknown>,
                )
              }
            />
          ) : null}
        </section>
      </main>

      {nameDialog?.mode === "create" ? (
        <NameDialog
          title="Create Canvas"
          actionLabel="Create"
          onCancel={nameDialog.forced ? undefined : () => setNameDialog(undefined)}
          onSubmit={(name) => void handleCreateCanvas(name)}
        />
      ) : null}

      {nameDialog?.mode === "rename" ? (
        <NameDialog
          title="Rename Canvas"
          actionLabel="Save"
          initialName={nameDialog.canvas.name}
          onCancel={() => setNameDialog(undefined)}
          onSubmit={(name) => void handleRenameCanvas(name)}
        />
      ) : null}

      {pendingSwitch ? (
        <ConfirmDialog
          title="Switch Canvas?"
          message={
            isRecording
              ? "Switching canvases will stop and save the active recording before loading the next canvas."
              : "Switching canvases will save the current canvas before loading the next one."
          }
          confirmLabel="Switch"
          onCancel={() => setPendingSwitch(undefined)}
          onConfirm={() => void confirmSwitch()}
        />
      ) : null}

      {selectedRecording ? (
        <RecordingDetail
          session={selectedRecording}
          onClose={() => setSelectedRecording(undefined)}
          onDeleted={(deletedSession) => {
            setSelectedRecording(undefined);
            setLastSession((current) =>
              current?.sessionId === deletedSession.sessionId ? undefined : current,
            );
            setRecordings((current) =>
              current.filter((recording) => recording.sessionId !== deletedSession.sessionId),
            );
            void refreshRecordings();
          }}
        />
      ) : null}
    </div>
  );
}
