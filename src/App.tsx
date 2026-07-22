import { Excalidraw } from "@excalidraw/excalidraw";
import { PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";
import { createTextElement } from "./features/canvas/addTextElement";
import { generateQuestion } from "./ai/prompts/generateQuestion";
import type { QuestionGenStatus } from "./features/questions/types";
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
} from "./features/canvas/CanvasStore";
import { ChatbotPanel } from "./components/ChatbotPanel";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { JudgeReport } from "./components/JudgeReport";
import { NameDialog } from "./components/NameDialog";
import { QuestionDialog } from "./components/QuestionDialog";
import { RecordingDetail } from "./components/RecordingDetail";
import { SettingsDialog } from "./components/SettingsDialog";
import { Sidebar } from "./components/Sidebar";
import { Toolbar } from "./components/Toolbar";
import { Button } from "./components/ui/button";
import type { JudgeReport as JudgeReportData } from "./features/judge/types";
import { runJudge } from "./features/judge/runJudge";
import type { JudgeStatus } from "./features/judge/runJudge";
import {
  listRecordings,
  loadRecording,
  recordingFilename,
  saveAudioBlob,
  saveRecording,
  sessionToJson,
} from "./features/recorder/RecordingStore";
import { Recorder } from "./features/recorder/Recorder";
import type { RecordingSession, RecordingSummary } from "./features/recorder/types";
import type { TranscriptionStatus } from "./features/recorder/TranscriptionJob";
import { runTranscription } from "./features/recorder/TranscriptionJob";
import { persistTranscription } from "./features/recorder/mergeTranscription";
import { SettingsProvider, useSettings } from "./context/SettingsContext";
import type { ChatbotMessage, ChatbotState } from "./features/chatbot/types";
import { askChatbot } from "./features/chatbot/runChatbot";
import { VoiceInput } from "./features/chatbot/VoiceInput";

type SceneState = {
  elements: readonly unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
};

type ExcalidrawApi = {
  updateScene: (sceneData: Record<string, unknown>) => void;
  getSceneElements: () => readonly unknown[];
};

type NameDialogState =
  | { mode: "create"; forced?: boolean }
  | { mode: "rename"; canvas: CanvasMeta };

const blankScene: SceneState = {
  elements: [],
  appState: { theme: "dark", viewBackgroundColor: "#ffffff" },
  files: {},
};

const storageKey = "system-design-ai.sidebarCollapsed";

function initialCollapsed() {
  return localStorage.getItem(storageKey) === "true";
}

export function App() {
  return (
    <SettingsProvider>
      <AppContent />
    </SettingsProvider>
  );
}

function AppContent() {
  const { settings } = useSettings();
  const recorderRef = useRef(new Recorder());
  const sceneRef = useRef<SceneState>(blankScene);
  const saveTimerRef = useRef<number>();
  const activeCanvasIdRef = useRef<string>();
  const excalidrawApiRef = useRef<ExcalidrawApi>();

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
  const [isPaused, setIsPaused] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [transcriptionStatus, setTranscriptionStatus] = useState<TranscriptionStatus>({ state: "idle" });
  const [judgeStatus, setJudgeStatus] = useState<JudgeStatus>({ state: "idle" });
  const [judgeReport, setJudgeReport] = useState<JudgeReportData>();
  const [showJudgeReport, setShowJudgeReport] = useState(false);
  const [questionGenStatus, setQuestionGenStatus] = useState<QuestionGenStatus>({ state: "idle" });
  const [questionDialogOpen, setQuestionDialogOpen] = useState(false);
  const [chatbotState, setChatbotState] = useState<ChatbotState>({
    isOpen: false,
    interviewQuestion: "",
    interviewQuestionFull: "",
    messages: [],
    isThinking: false,
    isListening: false,
    isTranscribing: false,
    voiceTranscript: "",
  });

  const chatbotStateRef = useRef(chatbotState);
  chatbotStateRef.current = chatbotState;

  const voiceInputRef = useRef<VoiceInput>();

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
        index.lastActiveId && index.canvases.some((canvas: CanvasMeta) => canvas.id === index.lastActiveId)
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
        setDurationMs(Date.now() - startedAtMs - recorderRef.current.totalPausedMs);
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
    recorderRef.current.recordChange(sceneRef.current);
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

  async function handleStartRecording() {
    if (!activeCanvas) {
      return;
    }
    await recorderRef.current.start(activeCanvas.id, activeCanvas.name, sceneRef.current, settings.enableAudioRecording, chatbotState.interviewQuestionFull || undefined);
    setIsRecording(true);
    setIsPaused(false);
    setDurationMs(0);
    setLastSession(undefined);
  }

  function handlePause() {
    recorderRef.current.pause();
    setIsPaused(true);
  }

  function handleResume() {
    recorderRef.current.resume();
    setIsPaused(false);
  }

  async function stopRecording() {
    const session = await recorderRef.current.stop(sceneRef.current);
    setIsRecording(false);
    setIsPaused(false);
    setDurationMs(0);
    if (session) {
      if (chatbotState.messages.length > 0) {
        session.chatHistory = chatbotState.messages;
        await saveRecording(session.canvasId, session);
      }
      setLastSession(session);
      if (session.audioBlob) {
        await saveAudioBlob(session.canvasId, session.sessionId, session.audioBlob);
      }
      if (session.audioBlob && settings.geminiApiKey) {
        runTranscription(
          settings.geminiApiKey,
          settings.audioModel,
          session.audioBlob,
          session.sessionId,
          setTranscriptionStatus,
          session.audioChunks,
        ).then(async (segments) => {
          await persistTranscription(session.canvasId, session.sessionId, segments);
          await refreshRecordings(session.canvasId);
          const updated = await loadRecording(session.canvasId, session.sessionId);
          setLastSession((prev) =>
            prev?.sessionId === session.sessionId ? updated : prev,
          );
          setSelectedRecording((prev) =>
            prev?.sessionId === session.sessionId ? updated : prev,
          );
        }).catch(() => {});
      }
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
      index.lastActiveId && index.canvases.some((item: CanvasMeta) => item.id === index.lastActiveId)
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
    const loadedReport = await window.recordingAPI.loadJudge(recording.canvasId, recording.sessionId);
    setJudgeReport(loadedReport ?? undefined);
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

  async function handleJudge() {
    if (!lastSession || !settings.openRouterApiKey) return;
    try {
      const report = await runJudge(
        settings.openRouterApiKey,
        settings.smartModel,
        lastSession,
        setJudgeStatus,
      );
      await window.recordingAPI.saveJudge(lastSession.canvasId, lastSession.sessionId, report);
      setJudgeReport(report);
      setShowJudgeReport(true);
    } catch {
      // error status already set by runJudge
    }
  }

  async function handleGenerateQuestion() {
    setQuestionDialogOpen(true);
  }

  async function handleConfirmGenerate(domain: string | null, context: string) {
    if (!settings.openRouterApiKey || !activeCanvasId) return;

    setQuestionGenStatus({ state: "generating" });
    try {
      const { title, full } = await generateQuestion(
        settings.openRouterApiKey,
        settings.fastModel,
        { domain, context },
      );

      const textElement = createTextElement({ text: full, x: 100, y: 60, fontSize: 28, theme: activeTheme });
      const currentElements = excalidrawApiRef.current?.getSceneElements() ?? [];
      excalidrawApiRef.current?.updateScene({
        elements: [...currentElements, textElement],
      });

      if (recorderRef.current.isRecording) {
        recorderRef.current.recordCustomEvent(
          "question_generated",
          `Interview question: ${title}`,
        );
      }

      setQuestionGenStatus({ state: "done", question: title });
      setChatbotState(prev => ({ ...prev, interviewQuestion: title, interviewQuestionFull: full }));
      setQuestionDialogOpen(false);
      setTimeout(() => setQuestionGenStatus({ state: "idle" }), 2000);
    } catch (e) {
      setQuestionGenStatus({
        state: "error",
        error: e instanceof Error ? e.message : "Failed to generate question",
      });
    }
  }

  async function handleChatbotSend(question: string, source: "text" | "voice") {
    const userMsg: ChatbotMessage = {
      role: "user",
      text: question,
      timestamp: new Date().toISOString(),
      elapsedMs: recorderRef.current.startedAtMs
        ? Date.now() - recorderRef.current.startedAtMs
        : 0,
      source,
    };

    setChatbotState(prev => ({
      ...prev,
      messages: [...prev.messages, userMsg],
      isThinking: true,
      error: undefined,
    }));

    if (recorderRef.current.isRecording) {
      recorderRef.current.recordCustomEvent("candidate_question", `[${source}] ${question}`);
    }

    try {
      const response = await askChatbot(
        settings.openRouterApiKey,
        settings.fastModel,
        chatbotStateRef.current.interviewQuestionFull || chatbotStateRef.current.interviewQuestion,
        [...chatbotStateRef.current.messages, userMsg],
        question,
      );

      const assistantMsg: ChatbotMessage = {
        role: "assistant",
        text: response,
        timestamp: new Date().toISOString(),
        elapsedMs: recorderRef.current.startedAtMs
          ? Date.now() - recorderRef.current.startedAtMs
          : 0,
        source: "text",
      };

      setChatbotState(prev => ({
        ...prev,
        messages: [...prev.messages, assistantMsg],
        isThinking: false,
      }));

      if (recorderRef.current.isRecording) {
        recorderRef.current.recordCustomEvent("interviewer_response", response);
      }
    } catch (e) {
      setChatbotState(prev => ({
        ...prev,
        isThinking: false,
        error: e instanceof Error ? e.message : "Failed to get response",
      }));
    }
  }

  function handleStartListening() {
    if (!voiceInputRef.current) {
      voiceInputRef.current = new VoiceInput(settings.geminiApiKey, settings.audioModel);
    } else {
      voiceInputRef.current.updateModel(settings.audioModel);
    }
    voiceInputRef.current.setOnPartialTranscript((text) => {
      setChatbotState(prev => ({ ...prev, voiceTranscript: text }));
    });
    voiceInputRef.current.startListening();
    setChatbotState(prev => ({ ...prev, isListening: true, voiceTranscript: "" }));
  }

  async function handleStopListening() {
    if (!voiceInputRef.current) return;
    setChatbotState(prev => ({ ...prev, isListening: false, isTranscribing: true, voiceTranscript: "" }));
    try {
      const text = await voiceInputRef.current.stopAndTranscribe();
      if (text.trim()) {
        await handleChatbotSend(text.trim(), "voice");
      }
    } catch (err) {
      setChatbotState(prev => ({
        ...prev,
        isTranscribing: false,
        error: err instanceof Error ? err.message : "Voice transcription failed",
      }));
    } finally {
      setChatbotState(prev => ({ ...prev, isTranscribing: false }));
    }
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
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setSettingsOpen(true)}
              aria-label="Settings"
            >
              <Settings aria-hidden="true" size={16} />
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
          isPaused={isPaused}
          durationMs={durationMs}
          theme={activeTheme}
          hasRecording={Boolean(lastSession)}
          onThemeChange={handleThemeChange}
          onStart={handleStartRecording}
          onPause={handlePause}
          onResume={handleResume}
          onStop={() => void stopRecording()}
          onJudge={() => void handleJudge()}
          judgeStatus={judgeStatus}
          enableJudge={settings.enableJudge}
          onGenerateQuestion={() => void handleGenerateQuestion()}
          questionGenStatus={questionGenStatus}
          enableQuestionGen={settings.enableQuestionGen}
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

          {settings.enableChatbot && (
            <ChatbotPanel
              state={chatbotState}
              onSend={(text) => void handleChatbotSend(text, "text")}
              onStartListening={handleStartListening}
              onStopListening={() => void handleStopListening()}
              onToggle={() => setChatbotState(prev => ({ ...prev, isOpen: !prev.isOpen }))}
            />
          )}
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
          onJudge={(session) => {
            setLastSession(session);
            void handleJudge();
          }}
          onViewReport={() => setShowJudgeReport(true)}
          judgeReport={judgeReport}
          judgeStatus={judgeStatus}
          enableJudge={settings.enableJudge}
          transcriptionStatus={transcriptionStatus}
        />
      ) : null}

        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

        <QuestionDialog
          open={questionDialogOpen}
          onOpenChange={setQuestionDialogOpen}
          isGenerating={questionGenStatus.state === "generating"}
          onGenerate={handleConfirmGenerate}
        />

        {showJudgeReport && judgeReport && selectedRecording && (
          <JudgeReport
            report={judgeReport}
            canvasName={selectedRecording.canvasName}
            durationMs={selectedRecording.durationMs}
            question={selectedRecording.question}
            onClose={() => setShowJudgeReport(false)}
          />
        )}
      </div>
  );
}
