export type JudgeDimension = {
  name: string;
  score: number;
  observations: string[];
};

export type JudgeReport = {
  sessionId: string;
  model: string;
  judgedAt: string;
  dimensions: JudgeDimension[];
  overallScore: number;
  strengths: string[];
  improvements: string[];
};
