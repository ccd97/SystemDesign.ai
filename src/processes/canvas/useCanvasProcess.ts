import { useCallback, useEffect, useRef, useState } from "react";
import type { CanvasMeta, CanvasTheme, ExcalidrawFile } from "../../entities/canvas";
import { normalizeCanvasTheme } from "../../entities/canvas";
import {
  createCanvas,
  deleteCanvas,
  loadCanvas,
  listCanvases,
  renameCanvas,
  saveCanvas,
  serializeCanvas,
} from "../../features/canvas";
import type { RecordingSession } from "../../entities/recording";
import type { ExcalidrawElementData } from "../../shared/types";

export type SceneState = {
  elements: readonly ExcalidrawElementData[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
};

export type NameDialogState =
  | { mode: "create"; forced?: boolean }
  | { mode: "rename"; canvas: CanvasMeta };

type CanvasProcessOptions = {
  isRecording?: boolean;
  stopRecording?: (scene: SceneState) => Promise<RecordingSession | undefined>;
};

export function useCanvasProcess(options?: CanvasProcessOptions) {
  const { isRecording = false, stopRecording } = options ?? {};

  const [canvases, setCanvases] = useState<CanvasMeta[]>([]);
  const [activeCanvasId, setActiveCanvasId] = useState<string>();
  const [initialData, setInitialData] = useState<ExcalidrawFile>();
  const [activeTheme, setActiveTheme] = useState<CanvasTheme>("dark");
  const [nameDialog, setNameDialog] = useState<NameDialogState>();
  const [pendingSwitch, setPendingSwitch] = useState<CanvasMeta>();
  const [loading, setLoading] = useState(true);

  const sceneRef = useRef<SceneState>({
    elements: [],
    appState: { theme: "dark", viewBackgroundColor: "#ffffff" },
    files: {},
  });
  const saveTimerRef = useRef<number>();
  const activeCanvasIdRef = useRef<string>();

  const refreshCanvases = useCallback(async () => {
    const index = await listCanvases();
    setCanvases(index.canvases);
    return index;
  }, []);

  const flushSave = useCallback(async () => {
    const canvasId = activeCanvasIdRef.current;
    if (!canvasId) return;
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
          ...(data.appState ?? {}),
          theme: normalizeCanvasTheme(data.appState?.theme),
        },
        files: data.files ?? {},
      };
      setActiveTheme(normalizeCanvasTheme(sceneRef.current.appState.theme));
      setInitialData({
        ...data,
        appState: sceneRef.current.appState,
      });
      await refreshCanvases();
    },
    [refreshCanvases],
  );

  const scheduleSave = useCallback(() => {
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void flushSave();
    }, 500);
  }, [flushSave]);

  const handleSceneChange = useCallback(
    (elements: readonly ExcalidrawElementData[], appState: Record<string, unknown>, files: Record<string, unknown>) => {
      const theme = normalizeCanvasTheme(appState.theme);
      setActiveTheme((current) => (current === theme ? current : theme));
      sceneRef.current = {
        elements,
        appState: { ...appState, theme },
        files,
      };
      scheduleSave();
    },
    [scheduleSave],
  );

  const handleThemeChange = useCallback(
    (theme: CanvasTheme) => {
      const nextTheme = normalizeCanvasTheme(theme);
      setActiveTheme((current) => (current === nextTheme ? current : nextTheme));
      sceneRef.current = {
        ...sceneRef.current,
        appState: { ...sceneRef.current.appState, theme: nextTheme },
      };
      scheduleSave();
    },
    [scheduleSave],
  );

  const handleCreateCanvas = useCallback(
    async (name: string) => {
      try {
        const canvas = await createCanvas(name);
        await flushSave();
        await openCanvas(canvas.id);
      } finally {
        setNameDialog(undefined);
      }
    },
    [flushSave, openCanvas],
  );

  const handleRenameCanvas = useCallback(
    async (name: string) => {
      if (!nameDialog || nameDialog.mode !== "rename") return;
      try {
        await renameCanvas(nameDialog.canvas.id, name);
        await refreshCanvases();
      } finally {
        setNameDialog(undefined);
      }
    },
    [nameDialog, refreshCanvases],
  );

  const handleDeleteCanvas = useCallback(
    async (canvas: CanvasMeta) => {
      const message =
        canvas.id === activeCanvasId && isRecording
          ? "Delete this canvas? The active recording will be stopped first."
          : "Delete this canvas and all of its recordings?";
      if (!window.confirm(message)) return;

      if (canvas.id === activeCanvasId && isRecording && stopRecording) {
        await stopRecording(sceneRef.current);
      }
      if (canvas.id === activeCanvasId) {
        await flushSave();
      }
      const index = await deleteCanvas(canvas.id);
      setCanvases(index.canvases);

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
        setNameDialog({ mode: "create", forced: true });
      }
    },
    [activeCanvasId, isRecording, flushSave, openCanvas, stopRecording],
  );

  const requestCanvasSwitch = useCallback(
    (canvas: CanvasMeta) => {
      if (canvas.id === activeCanvasId) return;
      setPendingSwitch(canvas);
    },
    [activeCanvasId],
  );

  const confirmSwitch = useCallback(async () => {
    if (!pendingSwitch) return;
    try {
      if (isRecording && stopRecording) {
        await stopRecording(sceneRef.current);
      }
      await flushSave();
      await openCanvas(pendingSwitch.id);
    } finally {
      setPendingSwitch(undefined);
    }
  }, [pendingSwitch, isRecording, flushSave, openCanvas, stopRecording]);

  const boot = useCallback(async () => {
    setLoading(true);
    try {
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
    } catch {
      // Error handled by caller via toast
    } finally {
      setLoading(false);
    }
  }, [refreshCanvases, openCanvas]);

  useEffect(() => {
    void boot();
  }, [boot]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      void flushSave();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [flushSave]);

  const activeCanvas = canvases.find((canvas) => canvas.id === activeCanvasId);

  return {
    canvases,
    activeCanvasId,
    activeCanvasIdRef,
    activeCanvas,
    initialData,
    activeTheme,
    nameDialog,
    setNameDialog,
    pendingSwitch,
    setPendingSwitch,
    loading,
    sceneRef,
    refreshCanvases,
    openCanvas,
    handleSceneChange,
    handleThemeChange,
    handleCreateCanvas,
    handleRenameCanvas,
    handleDeleteCanvas,
    requestCanvasSwitch,
    confirmSwitch,
    flushSave,
    boot,
  };
}
