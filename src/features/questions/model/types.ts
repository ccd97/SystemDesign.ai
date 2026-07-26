export type QuestionGenStatus =
  | { state: "idle" }
  | { state: "generating" }
  | { state: "done"; question: string }
  | { state: "error"; error: string };
