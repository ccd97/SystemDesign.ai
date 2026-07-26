import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatbotState } from "../../entities/chatbot";
import type { JudgeReport } from "../../features/judge";
import { runJudge, type JudgeStatus } from "../../features/judge";
import { Recorder } from "../../features/recorder";
import {
  loadRecording,
  saveAudioBlob,
  saveRecording,
} from "../../features/recorder";
import type { RecordingSession } from "../../features/recorder";
import type { TranscriptionStatus } from "../../features/recorder";
import { runTranscription } from "../../features/recorder";
import { persistTranscription } from "../../features/recorder";
import type { ExcalidrawElementData } from "../../shared/types";

type SceneState = {
  elements: readonly ExcalidrawElementData[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
};

type RecordingProcessOptions = {
  openRouterApiKey: string;
  smartModel: string;
  geminiApiKey: string;
  audioModel: string;
  enableAudioRecording: boolean;
  chatbotStateRef: React.MutableRefObject<ChatbotState>;
  refreshRecordings: (canvasId?: string) => Promise<unknown>;
  setSelectedRecording: (session: RecordingSession | undefined | ((prev: RecordingSession | undefined) => RecordingSession | undefined)) => void;
};

export function useRecordingProcess(options: RecordingProcessOptions) {
  const {
    openRouterApiKey,
    smartModel,
    geminiApiKey,
    audioModel,
    enableAudioRecording,
    chatbotStateRef,
    refreshRecordings,
    setSelectedRecording,
  } = options;

  const recorderRef = useRef(new Recorder());
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const [startedAtMs, setStartedAtMs] = useState<number>();
  const [lastSession, setLastSession] = useState<RecordingSession>();
  const [transcriptionStatus, setTranscriptionStatus] = useState<TranscriptionStatus>({ state: "idle" });
  const [judgeStatus, setJudgeStatus] = useState<JudgeStatus>({ state: "idle" });
  const [judgeReport, setJudgeReport] = useState<JudgeReport>();
  const [showJudgeReport, setShowJudgeReport] = useState(false);

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

  const startRecording = useCallback(
    async (canvasId: string, canvasName: string, scene: SceneState) => {
      await recorderRef.current.start(
        canvasId,
        canvasName,
        scene,
        enableAudioRecording,
        chatbotStateRef.current.interviewQuestionFull || undefined,
      );
      setIsRecording(true);
      setIsPaused(false);
      setDurationMs(0);
      setStartedAtMs(recorderRef.current.startedAtMs);
      setLastSession(undefined);
    },
    [enableAudioRecording, chatbotStateRef],
  );

  const pauseRecording = useCallback(() => {
    recorderRef.current.pause();
    setIsPaused(true);
  }, []);

  const resumeRecording = useCallback(() => {
    recorderRef.current.resume();
    setIsPaused(false);
  }, []);

  const stopRecording = useCallback(
    async (scene: SceneState) => {
      const session = await recorderRef.current.stop(scene);
      setIsRecording(false);
      setIsPaused(false);
      setDurationMs(0);
      setStartedAtMs(undefined);
      if (session) {
        if (chatbotStateRef.current.messages.length > 0) {
          session.chatHistory = chatbotStateRef.current.messages;
          await saveRecording(session.canvasId, session);
        }
        setLastSession(session);
        if (session.audioBlob) {
          await saveAudioBlob(session.canvasId, session.sessionId, session.audioBlob);
        }
        if (session.audioBlob && geminiApiKey) {
          runTranscription(
            geminiApiKey,
            audioModel,
            session.audioBlob,
            session.sessionId,
            setTranscriptionStatus,
            session.audioChunks,
          )
            .then(async (segments) => {
              await persistTranscription(session.canvasId, session.sessionId, segments);
              await refreshRecordings(session.canvasId);
              const updated = await loadRecording(session.canvasId, session.sessionId);
              setLastSession((prev) =>
                prev?.sessionId === session.sessionId ? updated : prev,
              );
              setSelectedRecording((prev) =>
                prev?.sessionId === session.sessionId ? updated : prev,
              );
            })
            .catch((err) => {
              console.error("Transcription failed:", err);
            });
        }
        await refreshRecordings(session.canvasId);
      }
      return session;
    },
    [chatbotStateRef, geminiApiKey, audioModel, refreshRecordings, setSelectedRecording],
  );

  const runJudgeEvaluation = useCallback(
    async (session: RecordingSession) => {
      if (!openRouterApiKey) return;
      try {
        const report = await runJudge(
          openRouterApiKey,
          smartModel,
          session,
          setJudgeStatus,
        );
        await window.recordingAPI.saveJudge(session.canvasId, session.sessionId, report);
        setJudgeReport(report);
        setShowJudgeReport(true);
      } catch {
        // error status already set by runJudge
      }
    },
    [openRouterApiKey, smartModel],
  );

  const recordChange = useCallback((scene: SceneState) => {
    recorderRef.current.recordChange(scene);
  }, []);

  const setBaseline = useCallback((scene: SceneState) => {
    recorderRef.current.setBaseline(scene);
  }, []);

  const recordCustomEvent = useCallback((action: Parameters<Recorder["recordCustomEvent"]>[0], summary: string) => {
    recorderRef.current.recordCustomEvent(action, summary);
  }, []);

  return {
    isRecording,
    isPaused,
    durationMs,
    startedAtMs,
    lastSession,
    setLastSession,
    transcriptionStatus,
    judgeStatus,
    judgeReport,
    setJudgeReport,
    showJudgeReport,
    setShowJudgeReport,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    runJudgeEvaluation,
    recordChange,
    setBaseline,
    recordCustomEvent,
  };
}
