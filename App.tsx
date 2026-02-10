
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SentenceData, SessionState } from './types';
import { generateNewSentence, generateSpeech } from './services/geminiService';
import { ComparisonView } from './components/ComparisonView';

const tokenize = (text: string) => {
  return text.match(/[\w']+|[^\s\w]/g) || [];
};

const isWordToken = (token: string) => /\w/.test(token);

const App: React.FC = () => {
  const [restored, setRestored] = useState(false);
  const [state, setState] = useState<SessionState & { userWords: string[], showLevelUp: boolean }>(() => {
    const savedLevel = localStorage.getItem('echomaster_level');
    const savedXP = localStorage.getItem('echomaster_xp');
    
    return {
      currentSentence: null,
      userDraft: '',
      userWords: [],
      isSubmitted: false,
      isLoading: false,
      audioBuffer: null,
      level: savedLevel ? parseInt(savedLevel, 10) : 1, 
      xp: savedXP ? parseInt(savedXP, 10) : 0,
      showLevelUp: false
    };
  });

  const [error, setError] = useState<{ message: string; code?: number } | null>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    localStorage.setItem('echomaster_level', state.level.toString());
    localStorage.setItem('echomaster_xp', state.xp.toString());
    
    if (state.level > 1 && !restored) {
      setRestored(true);
      const timer = setTimeout(() => setRestored(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [state.level, state.xp]);

  const initAudio = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
  };

  const loadNewTask = useCallback(async (level: number) => {
    setState(prev => ({ 
      ...prev, 
      isLoading: true, 
      isSubmitted: false, 
      userDraft: '', 
      userWords: [], 
      audioBuffer: null, 
      showLevelUp: false 
    }));
    setError(null);
    try {
      const sentence = await generateNewSentence(level);
      const audio = await generateSpeech(sentence.text);
      
      const tokens = tokenize(sentence.text);
      const wordCount = tokens.filter(isWordToken).length;

      setState(prev => ({
        ...prev,
        currentSentence: sentence,
        audioBuffer: audio,
        userWords: new Array(wordCount).fill(''),
        isLoading: false
      }));
    } catch (err: any) {
      console.error(err);
      let errMsg = "Something went wrong. Please try again.";
      let errCode = 0;

      if (err.message?.includes("quota") || err.message?.includes("429")) {
        errMsg = "Daily API limit reached. You can try switching to your own paid API key to continue.";
        errCode = 429;
      }

      setError({ message: errMsg, code: errCode });
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  useEffect(() => {
    loadNewTask(state.level);
  }, []);

  const handleSwitchKey = async () => {
    if ((window as any).aistudio?.openSelectKey) {
      await (window as any).aistudio.openSelectKey();
      // Proceed immediately as per race condition mitigation guidelines
      loadNewTask(state.level);
    }
  };

  const playAudio = () => {
    if (!state.audioBuffer) return;
    initAudio();
    const ctx = audioContextRef.current!;
    const source = ctx.createBufferSource();
    source.buffer = state.audioBuffer;
    source.connect(ctx.destination);
    source.start(0);
  };

  const handleWordChange = (index: number, value: string) => {
    const trimmed = value.trim();
    if (value.endsWith(' ') && trimmed.length > 0) {
      const nextInput = inputRefs.current[index + 1];
      if (nextInput) nextInput.focus();
    }
    const newWords = [...state.userWords];
    newWords[index] = trimmed;
    setState(prev => ({ ...prev, userWords: newWords, userDraft: newWords.join(' ') }));
  };

  const calculateAccuracy = () => {
    if (!state.currentSentence) return 0;
    const targetWords = state.currentSentence.text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
    const userWords = state.userWords.map(w => w.toLowerCase());
    let matches = 0;
    targetWords.forEach((tw, i) => {
      if (userWords[i] === tw) matches++;
    });
    return matches / Math.max(targetWords.length, 1);
  };

  const handleSubmit = () => {
    const accuracy = calculateAccuracy();
    
    let xpGain = 0;
    if (accuracy >= 0.95) xpGain = 40;
    else if (accuracy >= 0.8) xpGain = 20;
    else if (accuracy >= 0.6) xpGain = 10;
    else if (accuracy >= 0.4) xpGain = 5;

    let nextXp = state.xp + xpGain;
    let nextLevel = state.level;
    let leveledUp = false;

    if (nextXp >= 100) {
      nextLevel += 1;
      nextXp -= 100;
      leveledUp = true;
    }

    setState(prev => ({ 
      ...prev, 
      isSubmitted: true,
      xp: nextXp,
      level: nextLevel,
      showLevelUp: leveledUp
    }));
  };

  const resetProgress = () => {
    if (window.confirm("Warning: This will clear all your progress. Restart from Level 1?")) {
      localStorage.removeItem('echomaster_level');
      localStorage.removeItem('echomaster_xp');
      window.location.reload();
    }
  };

  const renderInputArea = () => {
    if (!state.currentSentence) return null;
    const tokens = tokenize(state.currentSentence.text);
    let wordIdx = 0;

    return (
      <div className="flex flex-wrap items-baseline gap-y-6 gap-x-1.5 p-8 bg-white rounded-2xl border-2 border-dashed border-slate-200 min-h-[160px] shadow-inner relative group">
        {tokens.map((token, i) => {
          const isWord = isWordToken(token);
          if (!isWord) {
            return (
              <span key={i} className="text-2xl font-bold text-slate-400 select-none px-0.5" style={{ verticalAlign: 'baseline' }}>
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
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
              value={state.userWords[currentWordIdx] || ''}
              onChange={(e) => handleWordChange(currentWordIdx, e.target.value)}
              disabled={state.isSubmitted || state.isLoading}
              className={`
                min-w-[44px] text-center text-xl font-bold border-b-2 outline-none transition-all py-1 px-1
                ${state.isSubmitted 
                  ? 'border-transparent bg-transparent text-indigo-700' 
                  : 'border-slate-300 text-slate-900 focus:border-indigo-500 focus:bg-indigo-50/50 bg-slate-50/30'}
                ${!state.userWords[currentWordIdx] && !state.isSubmitted ? 'placeholder-slate-300' : ''}
              `}
              placeholder="..."
              style={{ width: `${Math.max(token.length + 0.5, 3.5)}ch` }}
            />
          );
        })}
      </div>
    );
  };

  const isAllFilled = state.userWords.length > 0 && state.userWords.every(w => w.trim().length > 0);

  return (
    <div className="min-h-screen pb-24 bg-slate-50/50 selection:bg-indigo-100">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm backdrop-blur-md bg-white/90">
        <div className="max-w-5xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-indigo-600 w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-100 rotate-3">
               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 leading-none tracking-tight">EchoMaster</h1>
              {restored ? (
                 <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest animate-pulse">Session Restored</span>
              ) : (
                 <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">Adaptive IELTS Path</span>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-8">
             <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-3">
                   <div className="flex flex-col items-end">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Level {state.level}</span>
                      <span className="text-[9px] font-bold text-indigo-500 tabular-nums">{state.xp}% Progress</span>
                   </div>
                   <div className="w-36 h-3.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200 p-0.5 shadow-inner">
                      <div 
                        className="h-full bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-400 rounded-full transition-all duration-1000 ease-out" 
                        style={{ width: `${state.xp}%` }}
                      />
                   </div>
                </div>
                <button onClick={resetProgress} className="text-[9px] font-bold text-slate-300 hover:text-red-500 uppercase transition-colors tracking-tighter">Reset All Progress</button>
             </div>
             
             <div className="hidden lg:flex flex-col items-center bg-slate-50 px-4 py-2 rounded-xl border border-slate-100">
                <div className="text-[10px] font-black text-indigo-500 uppercase">Current Goal</div>
                <div className="text-sm font-black text-slate-900 leading-none">IELTS 6.5</div>
             </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 mt-12 space-y-12">
        {state.showLevelUp && (
          <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 text-white p-10 rounded-[2.5rem] text-center animate-bounce shadow-2xl shadow-indigo-200 border-4 border-white">
            <h3 className="text-4xl font-black italic mb-2 tracking-tighter">LEVEL UP! 🎉</h3>
            <p className="font-bold text-indigo-100 text-lg">Bravo! You've unlocked Level {state.level}.</p>
            <p className="text-sm opacity-80 mt-1">Complexity increased to match your growing skill.</p>
          </div>
        )}

        {/* Audio Training Card */}
        <section className="bg-white rounded-[2.5rem] p-12 text-center relative overflow-hidden shadow-sm border border-slate-200 group hover:shadow-md transition-shadow">
          <div className="absolute top-0 left-0 w-full h-2 bg-slate-100/50">
            <div className={`h-full bg-indigo-500 transition-all duration-700 ${state.isLoading ? 'w-1/3 animate-pulse' : 'w-full'}`} />
          </div>
          <div className="space-y-10">
            <div className="inline-flex items-center gap-3 px-5 py-2 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black uppercase tracking-[0.25em]">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-ping" />
              Level {state.level} Auditory Challenge
            </div>
            <div className="flex flex-col items-center gap-6">
              <button
                onClick={playAudio}
                disabled={state.isLoading || !state.audioBuffer}
                className="w-36 h-36 bg-indigo-600 text-white rounded-full flex items-center justify-center hover:bg-indigo-700 hover:scale-105 transition-all active:scale-95 disabled:opacity-30 shadow-2xl shadow-indigo-200 group relative"
              >
                <div className="absolute inset-0 rounded-full bg-indigo-400 animate-ping opacity-10 group-hover:hidden" />
                <svg className="w-20 h-20 ml-2 group-hover:rotate-6 transition-transform" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd"></path></svg>
              </button>
              <div className="space-y-1">
                <p className="text-slate-800 text-lg font-black tracking-tight">Native Speaker Audio</p>
                <p className="text-slate-400 text-sm font-bold uppercase tracking-widest">Listen as many times as you need</p>
              </div>
            </div>
          </div>
        </section>

        {/* Transcribe Area */}
        <section className="space-y-8">
          <div className="flex justify-between items-end px-2">
            <div>
              <h2 className="text-3xl font-black text-slate-900 tracking-tight">Your Transcription</h2>
              <p className="text-slate-400 text-sm font-semibold">Every punctuation and word matters</p>
            </div>
            <div className="bg-white px-4 py-2 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
               <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
               <span className={`text-[11px] font-black uppercase tracking-widest ${isAllFilled ? 'text-indigo-600' : 'text-slate-400'}`}>
                {state.userWords.filter(w => w.trim()).length} / {state.userWords.length} Words Captured
               </span>
            </div>
          </div>
          
          <div className="relative">
            {renderInputArea()}
            {state.isLoading && (
              <div className="absolute inset-0 bg-white/70 backdrop-blur-[3px] rounded-2xl flex items-center justify-center z-20">
                <div className="flex flex-col items-center gap-5">
                   <div className="flex gap-2.5">
                    <div className="w-4 h-4 bg-indigo-600 rounded-full animate-bounce delay-75" />
                    <div className="w-4 h-4 bg-indigo-600 rounded-full animate-bounce delay-150" />
                    <div className="w-4 h-4 bg-indigo-600 rounded-full animate-bounce delay-300" />
                  </div>
                  <span className="text-[10px] font-black text-indigo-600 tracking-[0.3em] uppercase animate-pulse">Building Level {state.level} Scenario...</span>
                </div>
              </div>
            )}
          </div>

          {state.isSubmitted && state.currentSentence && (
             <div className="space-y-4 animate-in fade-in slide-in-from-top-6 duration-500">
                <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.4em] px-2">Visual Scorecard</h3>
                <ComparisonView target={state.currentSentence.text} attempt={state.userDraft} />
             </div>
          )}

          <div className="pt-6 px-2">
            {!state.isSubmitted ? (
              <button
                onClick={handleSubmit}
                disabled={!isAllFilled || state.isLoading}
                className={`w-full py-7 rounded-[2.2rem] font-black text-xl transition-all shadow-2xl flex items-center justify-center gap-4 tracking-wider ${
                  isAllFilled 
                    ? 'bg-slate-900 text-white hover:bg-black hover:-translate-y-1 active:translate-y-0 shadow-slate-200' 
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed grayscale'
                }`}
              >
                {isAllFilled ? 'VERIFY TRANSCRIPTION' : 'CAPTURE ALL WORDS TO CHECK'}
              </button>
            ) : (
              <button
                onClick={() => loadNewTask(state.level)}
                className="w-full bg-indigo-600 text-white py-7 rounded-[2.2rem] font-black text-xl hover:bg-indigo-700 hover:-translate-y-1 active:translate-y-0 transition-all shadow-2xl shadow-indigo-100 flex items-center justify-center gap-4 tracking-wider"
              >
                CONTINUE TO NEXT TASK
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
              </button>
            )}
          </div>
        </section>

        {/* Learning Hub */}
        {state.isSubmitted && state.currentSentence && (
          <section className="bg-white rounded-[3rem] border border-slate-200 p-12 shadow-sm space-y-16 animate-in fade-in slide-in-from-bottom-10 duration-700">
            <div className="text-center md:text-left space-y-6">
              <div className="inline-block bg-emerald-100 text-emerald-700 px-5 py-1.5 rounded-full text-xs font-black uppercase tracking-widest">Master Script</div>
              <h3 className="text-5xl font-black text-slate-900 tracking-tight leading-[1.05]">{state.currentSentence.text}</h3>
              <p className="text-3xl text-indigo-600 font-black italic opacity-90">{state.currentSentence.translation}</p>
            </div>

            <div className="h-px bg-slate-100" />

            <div className="grid lg:grid-cols-3 gap-16">
              <div className="lg:col-span-2 space-y-12">
                <div>
                  <h4 className="font-black text-slate-900 mb-6 flex items-center gap-4 uppercase tracking-[0.2em] text-xs">
                    <span className="w-2.5 h-8 bg-indigo-600 rounded-full" />
                    Strategic Insight
                  </h4>
                  <p className="text-slate-600 leading-relaxed text-2xl font-medium tracking-tight">{state.currentSentence.explanation}</p>
                </div>

                <div>
                  <h4 className="font-black text-slate-900 mb-8 flex items-center gap-4 uppercase tracking-[0.2em] text-xs">
                    <span className="w-2.5 h-8 bg-indigo-600 rounded-full" />
                    Grammar Essentials
                  </h4>
                  <div className="space-y-5">
                    {state.currentSentence.grammarPoints.map((point, i) => (
                      <div key={i} className="bg-slate-50 p-8 rounded-[2rem] text-slate-700 border border-slate-100 hover:border-indigo-200 transition-all shadow-sm font-bold text-xl leading-snug">{point}</div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-10">
                <h4 className="font-black text-slate-900 mb-8 flex items-center gap-4 uppercase tracking-[0.2em] text-xs">
                  <span className="w-2.5 h-8 bg-indigo-600 rounded-full" />
                  Key Vocabulary
                </h4>
                <div className="grid gap-5">
                  {state.currentSentence.vocabulary.map((item, i) => (
                    <div key={i} className="p-8 bg-indigo-50/40 rounded-[2.5rem] border border-indigo-50/50 hover:border-indigo-300 hover:bg-white transition-all group shadow-sm">
                      <span className="font-black text-indigo-700 text-2xl group-hover:text-indigo-800 tracking-tight">{item.word}</span>
                      <p className="text-slate-500 text-base font-bold mt-2 leading-relaxed">{item.meaning}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {error && (
          <div className="bg-red-50 text-red-600 p-10 rounded-[2.5rem] text-center font-black border-2 border-red-100 animate-shake">
            <div className="flex flex-col gap-4 items-center">
              <div className="bg-red-600 text-white p-3 rounded-full shadow-lg">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
              </div>
              <div className="max-w-md">
                <h4 className="text-lg font-bold">API Connection Error</h4>
                <p className="text-sm opacity-90 mt-1">{error.message}</p>
              </div>
              <div className="flex flex-wrap gap-3 mt-4">
                <button 
                  onClick={() => loadNewTask(state.level)}
                  className="bg-red-600 text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-red-700 transition-colors"
                >
                  Retry Now
                </button>
                {(window as any).aistudio?.openSelectKey && (
                  <button 
                    onClick={handleSwitchKey}
                    className="bg-white text-red-600 border border-red-200 px-6 py-2 rounded-xl text-sm font-bold hover:bg-red-50 transition-colors"
                  >
                    Switch to My Paid API Key
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="mt-32 text-center text-slate-300 text-[10px] pb-20 font-black uppercase tracking-[0.6em] opacity-60">
        IELTS MASTERY • PERSISTENCE ENGINE ACTIVE • LV.{state.level}
      </footer>
    </div>
  );
};

export default App;
