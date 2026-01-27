
export enum Difficulty {
  BEGINNER = 'Beginner',
  INTERMEDIATE = 'Intermediate',
  ADVANCED = 'Advanced'
}

export interface SentenceData {
  text: string;
  translation: string;
  explanation: string;
  grammarPoints: string[];
  vocabulary: { word: string; meaning: string }[];
}

export interface AttemptResult {
  isCorrect: boolean;
  accuracy: number;
  diff: { text: string; status: 'correct' | 'incorrect' | 'missing' }[];
}

export interface SessionState {
  currentSentence: SentenceData | null;
  userDraft: string;
  isSubmitted: boolean;
  isLoading: boolean;
  audioBuffer: AudioBuffer | null;
}
