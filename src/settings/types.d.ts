export type Settings = {
    openRouterApiKey: string;
    geminiApiKey: string;
    audioModel: string;
    smartModel: string;
    fastModel: string;
    enableAudioRecording: boolean;
    enableJudge: boolean;
    enableQuestionGen: boolean;
    enableChatbot: boolean;
};
export declare const defaultSettings: Settings;
