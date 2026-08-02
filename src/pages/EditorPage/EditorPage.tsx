import { Excalidraw } from "@excalidraw/excalidraw";
import { PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";
import { createTextElement } from "../../features/canvas";
import { generateQuestion } from "../../features/questions";
import type { QuestionGenStatus } from "../../features/questions";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChatbotPanel } from "../../widgets/ChatbotPanel";
import { ConfirmDialog } from "../../shared/components/ConfirmDialog";
import { JudgeReportDialog } from "../../features/judge";
import { NameDialog } from "../../shared/components/NameDialog";
import { QuestionDialog } from "../../features/questions";
import { RecordingDetail } from "../../features/recorder";
import { SettingsDialog } from "../../features/settings";
import { Sidebar } from "../../widgets/Sidebar";
import { Toolbar } from "../../widgets/Toolbar";
import { Button } from "../../shared/components/ui/button";
import {
  listRecordings,
  loadRecording,
} from "../../features/recorder";
import type { RecordingSession, RecordingSummary } from "../../features/recorder";
import { useSettings } from "../../app/providers/SettingsProvider";
import { useToast } from "../../app/providers/ToastProvider";
import type { ChatbotState } from "../../entities/chatbot";
import { useRecordingProcess } from "../../processes/recording";
import { useCanvasProcess } from "../../processes/canvas";
import { useChatbotProcess } from "../../processes/chatbot";
import type { ExcalidrawElementData } from "../../shared/types";

type ExcalidrawApi = {
  updateScene: (sceneData: Record<string, unknown>) => void;
  getSceneElements: () => readonly ExcalidrawElementData[];
};

const storageKey = "system-design-ai.sidebarCollapsed";

function initialCollapsed() {
  return localStorage.getItem(storageKey) === "true";
}

export function EditorPage() {
  const { settings, updateSettings } = useSettings();
  const { addToast } = useToast();
  const excalidrawApiRef = useRef<ExcalidrawApi>();
  const chatbotStateRef = useRef<ChatbotState>({
    isOpen: false,
    interviewQuestion: "",
    interviewQuestionFull: "",
    messages: [],
    isThinking: false,
    isListening: false,
    isTranscribing: false,
    voiceTranscript: "",
  });

  const [recordings, setRecordings] = useState<RecordingSummary[]>([]);
  const [selectedRecording, setSelectedRecording] = useState<RecordingSession>();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(initialCollapsed);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [questionGenStatus, setQuestionGenStatus] = useState<QuestionGenStatus>({ state: "idle" });
  const [questionDialogOpen, setQuestionDialogOpen] = useState(false);

  const refreshRecordings = useCallback(async (canvasId?: string) => {
    const targetCanvasId = canvasId ?? canvas.activeCanvasIdRef.current;
    if (!targetCanvasId) {
      setRecordings([]);
      return [];
    }
    const nextRecordings = await listRecordings(targetCanvasId);
    setRecordings(nextRecordings);
    return nextRecordings;
  }, []);

  const recording = useRecordingProcess({
    openRouterApiKey: settings.openRouterApiKey,
    smartModel: settings.smartModel,
    geminiApiKey: settings.geminiApiKey,
    audioModel: settings.audioModel,
    enableAudioRecording: settings.enableAudioRecording,
    chatbotStateRef,
    refreshRecordings,
    setSelectedRecording,
  });

  const canvas = useCanvasProcess({
    isRecording: recording.isRecording,
    stopRecording: recording.stopRecording,
  });

  const chatbot = useChatbotProcess({
    settings,
    chatbotStateRef,
    startedAtMs: recording.startedAtMs,
    onRecordCustomEvent: (action, summary) => {
      if (recording.isRecording) {
        recording.recordCustomEvent(action, summary);
      }
    },
  });

  useEffect(() => {
    localStorage.setItem(storageKey, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    document.documentElement.dataset.theme = canvas.activeTheme;
  }, [canvas.activeTheme]);

  useEffect(() => {
    if (canvas.activeCanvasId) {
      void refreshRecordings(canvas.activeCanvasId);
    }
  }, [canvas.activeCanvasId, refreshRecordings]);

  useEffect(() => {
    function handleError(event: ErrorEvent) {
      event.preventDefault();
      const message = event.message || "An unexpected error occurred";
      addToast({ title: "Error", message, variant: "error" });
    }

    function handleUnhandledRejection(event: PromiseRejectionEvent) {
      event.preventDefault();
      const reason = event.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === "string"
            ? reason
            : "An unhandled error occurred";
      addToast({ title: "Error", message, variant: "error" });
    }

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, [addToast]);

  const handleSceneChange = useCallback(
    (elements: readonly ExcalidrawElementData[], appState: Record<string, unknown>, files: Record<string, unknown>) => {
      canvas.handleSceneChange(elements, appState, files);
      recording.recordChange(canvas.sceneRef.current);
    },
    [canvas.handleSceneChange, recording.recordChange],
  );

  const handleThemeChange = useCallback(
    (theme: "dark" | "light") => {
      canvas.handleThemeChange(theme);
      excalidrawApiRef.current?.updateScene({ appState: { theme } });
    },
    [canvas.handleThemeChange],
  );

  async function handleOpenRecording(recordingSummary: RecordingSummary) {
    const session = await loadRecording(recordingSummary.canvasId, recordingSummary.sessionId);
    setSelectedRecording(session);
    const loadedReport = await window.recordingAPI.loadJudge(recordingSummary.canvasId, recordingSummary.sessionId);
    recording.setJudgeReport(loadedReport ?? undefined);
  }

  async function handleJudge() {
    if (!recording.lastSession) return;
    await recording.runJudgeEvaluation(recording.lastSession);
  }

  async function handleConfirmGenerate(domain: string | null, context: string) {
    if (!settings.openRouterApiKey || !canvas.activeCanvasId) return;

    setQuestionGenStatus({ state: "generating" });
    try {
      const { title, full } = await generateQuestion(
        settings.openRouterApiKey,
        settings.fastModel,
        { domain, context },
      );

      const textElement = createTextElement({ text: full, x: 100, y: 60, fontSize: 28, theme: canvas.activeTheme });
      const currentElements = excalidrawApiRef.current?.getSceneElements() ?? [];
      excalidrawApiRef.current?.updateScene({
        elements: [...currentElements, textElement],
      });

      if (recording.isRecording) {
        recording.recordCustomEvent(
          "question_generated",
          `Interview question: ${title}`,
        );
      }

      setQuestionGenStatus({ state: "done", question: title });
      chatbot.setQuestion(full, title);
      setQuestionDialogOpen(false);
      setTimeout(() => setQuestionGenStatus({ state: "idle" }), 2000);
    } catch (e) {
      setQuestionGenStatus({
        state: "error",
        error: e instanceof Error ? e.message : "Failed to generate question",
      });
    }
  }

  const handleExcalidrawApi = useCallback((api: ExcalidrawApi) => {
    excalidrawApiRef.current = api;
  }, []);

  const handleExcalidrawChange = useCallback(
    (elements: unknown, appState: unknown, files: unknown) =>
      handleSceneChange(
        elements as readonly ExcalidrawElementData[],
        appState as Record<string, unknown>,
        files as Record<string, unknown>,
      ),
    [handleSceneChange],
  );

  const showCanvas = canvas.activeCanvasId && canvas.initialData;

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
                <h1>SystemDesign.ai</h1>
              </div>
              <p>{canvas.activeCanvas?.name ?? "No canvas selected"}</p>
            </div>
          </div>
        <Toolbar
          isRecording={recording.isRecording}
          isPaused={recording.isPaused}
          durationMs={recording.durationMs}
          theme={canvas.activeTheme}
          hasRecording={Boolean(recording.lastSession)}
          onThemeChange={handleThemeChange}
          onStart={() => {
            if (canvas.activeCanvas) {
              void recording.startRecording(canvas.activeCanvas.id, canvas.activeCanvas.name, canvas.sceneRef.current);
            }
          }}
          onPause={recording.pauseRecording}
          onResume={recording.resumeRecording}
          onStop={() => void recording.stopRecording(canvas.sceneRef.current)}
          onJudge={() => void handleJudge()}
          judgeStatus={recording.judgeStatus}
          enableJudge={settings.enableJudge}
          onGenerateQuestion={() => {
            setQuestionGenStatus({ state: "idle" });
            setQuestionDialogOpen(true);
          }}
          questionGenStatus={questionGenStatus}
          enableQuestionGen={settings.enableQuestionGen}
        />
      </header>

      <main className={`workspace ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        <Sidebar
          canvases={canvas.canvases}
          activeCanvasId={canvas.activeCanvasId}
          isRecording={recording.isRecording}
          recordings={recordings}
          onCreateCanvas={() => canvas.setNameDialog({ mode: "create" })}
          onRenameCanvas={(c) => canvas.setNameDialog({ mode: "rename", canvas: c })}
          onDeleteCanvas={(c) => void canvas.handleDeleteCanvas(c)}
          onSelectCanvas={canvas.requestCanvasSwitch}
          onOpenRecording={(recordingSummary) => void handleOpenRecording(recordingSummary)}
        />

        <section className="canvas-host">
          {canvas.loading ? <div className="center-state">Loading...</div> : null}
          {!canvas.loading && !showCanvas ? (
            <div className="center-state">Create a canvas to start drawing.</div>
          ) : null}
          {showCanvas ? (
            <Excalidraw
              key={canvas.activeCanvasId}
              initialData={canvas.initialData as never}
              theme={canvas.activeTheme}
              excalidrawAPI={handleExcalidrawApi}
              onChange={handleExcalidrawChange}
            />
          ) : null}

          {settings.enableChatbot && (
            <ChatbotPanel
              state={chatbot.chatbotState}
              onSend={(text) => void chatbot.handleSend(text, "text")}
              onStartListening={chatbot.handleStartListening}
              onStopListening={() => void chatbot.handleStopListening()}
              onToggle={chatbot.toggleOpen}
              onClear={chatbot.clearMessages}
            />
          )}
        </section>
      </main>

      {canvas.nameDialog?.mode === "create" ? (
        <NameDialog
          title="Create Canvas"
          actionLabel="Create"
          onCancel={canvas.nameDialog.forced ? undefined : () => canvas.setNameDialog(undefined)}
          onSubmit={(name) => void canvas.handleCreateCanvas(name)}
        />
      ) : null}

      {canvas.nameDialog?.mode === "rename" ? (
        <NameDialog
          title="Rename Canvas"
          actionLabel="Save"
          initialName={canvas.nameDialog.canvas.name}
          onCancel={() => canvas.setNameDialog(undefined)}
          onSubmit={(name) => void canvas.handleRenameCanvas(name)}
        />
      ) : null}

      {canvas.pendingSwitch ? (
        <ConfirmDialog
          title="Switch Canvas?"
          message={
            recording.isRecording
              ? "Switching canvases will stop and save the active recording before loading the next canvas."
              : "Switching canvases will save the current canvas before loading the next one."
          }
          confirmLabel="Switch"
          onCancel={() => canvas.setPendingSwitch(undefined)}
          onConfirm={() => void canvas.confirmSwitch()}
        />
      ) : null}

      {selectedRecording ? (
        <RecordingDetail
          session={selectedRecording}
          onClose={() => setSelectedRecording(undefined)}
          onDeleted={(deletedSession) => {
            setSelectedRecording(undefined);
            recording.setLastSession((current) =>
              current?.sessionId === deletedSession.sessionId ? undefined : current,
            );
            setRecordings((current) =>
              current.filter((r) => r.sessionId !== deletedSession.sessionId),
            );
            void refreshRecordings();
          }}
          onJudge={(session) => {
            recording.setLastSession(session);
            void handleJudge();
          }}
          onViewReport={() => recording.setShowJudgeReport(true)}
          onRetryTranscription={(session) => recording.retryTranscription(session)}
          judgeReport={recording.judgeReport}
          judgeStatus={recording.judgeStatus}
          enableJudge={settings.enableJudge}
          transcriptionStatus={recording.transcriptionStatus}
        />
      ) : null}

        <SettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          settings={settings}
          onUpdateSettings={updateSettings}
        />

        <QuestionDialog
          open={questionDialogOpen}
          onOpenChange={setQuestionDialogOpen}
          isGenerating={questionGenStatus.state === "generating"}
          error={questionGenStatus.state === "error" ? questionGenStatus.error : undefined}
          onGenerate={handleConfirmGenerate}
        />

        {recording.showJudgeReport && recording.judgeReport && selectedRecording && (
          <JudgeReportDialog
            report={recording.judgeReport}
            canvasName={selectedRecording.canvasName}
            durationMs={selectedRecording.durationMs}
            question={selectedRecording.question}
            onClose={() => recording.setShowJudgeReport(false)}
          />
        )}
      </div>
  );
}
