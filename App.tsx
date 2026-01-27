
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Difficulty, SentenceData, SessionState } from './types';
import { generateNewSentence, generateSpeech } from './services/geminiService';
import { ComparisonView } from './components/ComparisonView';

// Helper to tokenize sentence into words and punctuation
const tokenize = (text: string) => {
  // Regex to match words and punctuation as separate tokens
  return text.match(/[\w']+|[.,!?;:]/g) || [];
};

const App: React.FC = () => {
  const [difficulty, setDifficulty] = useState<Difficulty>(Difficulty.BEGINNER);
  const [state, setState] = useState<SessionState & { userWords: string[] }>({
    currentSentence: null,
    userDraft: '',
    userWords: [],
    isSubmitted: false,
    isLoading: false,
    audioBuffer: null,
  });
  const [error, setError] = useState<string | null>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const initAudio = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
  };

  const loadNewTask = useCallback(async (diff: Difficulty) => {
    setState(prev => ({ ...prev, isLoading: true, isSubmitted: false, userDraft: '', userWords: [], audioBuffer: null }));
    setError(null);
    try {
      const sentence = await generateNewSentence(diff);
      const audio = await generateSpeech(sentence.text);
      
      const tokens = tokenize(sentence.text);
      const wordCount = tokens.filter(t => /\w/.test(t)).length;

      setState(prev => ({
        ...prev,
        currentSentence: sentence,
        audioBuffer: audio,
        userWords: new Array(wordCount).fill(''),
        isLoading: false
      }));
    } catch (err) {
      console.error(err);
      setError("Failed to load content. Please try again.");
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  useEffect(() => {
    loadNewTask(difficulty);
  }, []);

  const playAudio = () => {
    if (!state.audioBuffer) return;
    initAudio();
    const ctx = audioContextRef.current!;
    const source = ctx.createBufferSource();
    source.buffer = state.audioBuffer;
    source.connect(ctx.destination);
    source.start(0);
  };

  const handleDifficultyChange = (newDiff: Difficulty) => {
    setDifficulty(newDiff);
    loadNewTask(newDiff);
  };

  const handleWordChange = (index: number, value: string) => {
    // If user types a space, move to next input
    if (value.endsWith(' ')) {
      const trimmed = value.trim();
      const nextInput = inputRefs.current[index + 1];
      if (nextInput) nextInput.focus();
      
      const newWords = [...state.userWords];
      newWords[index] = trimmed;
      setState(prev => ({ ...prev, userWords: newWords, userDraft: newWords.join(' ') }));
      return;
    }

    const newWords = [...state.userWords];
    newWords[index] = value;
    setState(prev => ({ ...prev, userWords: newWords, userDraft: newWords.join(' ') }));
  };

  const handleSubmit = () => {
    setState(prev => ({ ...prev, isSubmitted: true }));
  };

  // Render the input blanks mixed with punctuation
  const renderInputArea = () => {
    if (!state.currentSentence) return null;
    
    const tokens = tokenize(state.currentSentence.text);
    let wordIdx = 0;

    return (
      <div className="flex flex-wrap items-center gap-y-6 gap-x-2 p-6 bg-white rounded-2xl border-2 border-dashed border-slate-200 min-h-[120px]">
        {tokens.map((token, i) => {
          const isPunctuation = /^[.,!?;:]$/.test(token);
          
          if (isPunctuation) {
            // Changed self-end pb-1 to self-center and adjusted styling for better vertical balance
            return (
              <span 
                key={i} 
                className="text-2xl font-bold text-slate-400 self-center leading-none"
              >
                {token}
              </span>
            );
          }

          const currentWordIdx = wordIdx++;
          return (
            <input
              key={i}
              ref={el => { inputRefs.current[currentWordIdx] = el; }}
              type="text"
              value={state.userWords[currentWordIdx] || ''}
              onChange={(e) => handleWordChange(currentWordIdx, e.target.value)}
              disabled={state.isSubmitted || state.isLoading}
              className={`
                min-w-[60px] max-w-[150px] text-center text-xl font-medium border-b-2 outline-none transition-all py-1
                ${state.isSubmitted ? 'border-transparent bg-transparent' : 'border-slate-300 focus:border-indigo-500 bg-slate-50/50'}
                ${!state.userWords[currentWordIdx] && !state.isSubmitted ? 'placeholder-slate-300' : ''}
              `}
              placeholder="__"
              style={{ width: `${Math.max(token.length * 1.2, 3)}ch` }}
            />
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen pb-20">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <h1 className="text-xl font-bold text-indigo-600 flex items-center gap-2">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
            EchoMaster
          </h1>
          <div className="flex bg-slate-100 p-1 rounded-lg">
            {Object.values(Difficulty).map(d => (
              <button
                key={d}
                onClick={() => handleDifficultyChange(d)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  difficulty === d ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 mt-8 space-y-8">
        <section className="bg-indigo-50 rounded-2xl p-8 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-indigo-200">
            <div className={`h-full bg-indigo-500 transition-all duration-500 ${state.isLoading ? 'w-1/2 animate-pulse' : 'w-full'}`} />
          </div>
          <h2 className="text-slate-600 font-medium mb-4 uppercase tracking-wider text-xs">Listening Phase</h2>
          <div className="flex flex-col items-center gap-6">
            <button
              onClick={playAudio}
              disabled={state.isLoading || !state.audioBuffer}
              className="w-24 h-24 bg-indigo-600 text-white rounded-full flex items-center justify-center hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50 shadow-xl shadow-indigo-200 group"
            >
              <svg className="w-12 h-12 ml-1 group-hover:scale-110 transition-transform" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd"></path></svg>
            </button>
            <p className="text-slate-500 text-sm font-medium">Click to play audio • Listen closely</p>
          </div>
        </section>

        <section className="space-y-6">
          <div className="flex justify-between items-center">
            <label className="text-sm font-bold text-slate-700 uppercase tracking-wide">Dictation Area:</label>
            <span className="text-xs text-slate-400 font-medium">{state.userWords.filter(w => w).length} / {state.userWords.length} words entered</span>
          </div>
          
          {renderInputArea()}

          {state.isSubmitted && state.currentSentence && (
             <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Accuracy Comparison:</h3>
                <ComparisonView target={state.currentSentence.text} attempt={state.userDraft} />
             </div>
          )}

          {!state.isSubmitted ? (
            <button
              onClick={handleSubmit}
              disabled={state.userWords.some(w => !w) || state.isLoading}
              className="w-full bg-slate-800 text-white py-4 rounded-2xl font-bold hover:bg-slate-900 transition-all disabled:opacity-50 shadow-lg"
            >
              Check My Answer
            </button>
          ) : (
            <button
              onClick={() => loadNewTask(difficulty)}
              className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
            >
              Next Sentence
            </button>
          )}
        </section>

        {state.isSubmitted && state.currentSentence && (
          <section className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-500">
            <div className="text-center md:text-left">
              <h3 className="text-3xl font-extrabold text-slate-900 mb-2">{state.currentSentence.text}</h3>
              <p className="text-2xl text-indigo-600 font-semibold">{state.currentSentence.translation}</p>
            </div>

            <div className="h-px bg-slate-100 w-full" />

            <div className="grid lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                <div>
                  <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2 uppercase tracking-wide text-sm">
                    <span className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">?</span>
                    Analysis & Usage
                  </h4>
                  <p className="text-slate-600 leading-relaxed text-lg">{state.currentSentence.explanation}</p>
                </div>

                <div>
                  <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2 uppercase tracking-wide text-sm">
                    <span className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">G</span>
                    Grammar Insights
                  </h4>
                  <div className="grid gap-3">
                    {state.currentSentence.grammarPoints.map((point, i) => (
                      <div key={i} className="bg-slate-50 p-4 rounded-xl text-slate-700 border-l-4 border-indigo-500 shadow-sm">
                        {point}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2 uppercase tracking-wide text-sm">
                  <span className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">V</span>
                  Vocabulary
                </h4>
                <div className="space-y-3">
                  {state.currentSentence.vocabulary.map((item, i) => (
                    <div key={i} className="p-4 bg-slate-50 rounded-2xl flex flex-col gap-1 border border-slate-100">
                      <span className="font-bold text-indigo-700 text-lg">{item.word}</span>
                      <span className="text-slate-500 text-sm font-medium">{item.meaning}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {error && (
          <div className="bg-red-50 text-red-600 p-6 rounded-2xl text-center font-bold border border-red-100 animate-bounce">
            {error}
          </div>
        )}
      </main>

      <footer className="mt-12 text-center text-slate-400 text-sm pb-8 font-medium">
        Designed for Clarity • Powered by Gemini AI
      </footer>
    </div>
  );
};

export default App;
