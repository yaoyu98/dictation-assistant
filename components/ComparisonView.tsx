
import React from 'react';

interface ComparisonViewProps {
  target: string;
  attempt: string;
}

export const ComparisonView: React.FC<ComparisonViewProps> = ({ target, attempt }) => {
  const targetWords = target.replace(/[.,!?;:]/g, "").toLowerCase().split(/\s+/);
  const attemptWords = attempt.replace(/[.,!?;:]/g, "").toLowerCase().split(/\s+/);

  // Simple word-by-word comparison for visual feedback
  return (
    <div className="flex flex-wrap gap-2 p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
      {target.split(/\s+/).map((word, idx) => {
        const cleanedTarget = word.replace(/[.,!?;:]/g, "").toLowerCase();
        const userWord = attemptWords[idx];
        const isMatch = userWord === cleanedTarget;

        return (
          <span
            key={idx}
            className={`text-lg font-medium px-1 rounded transition-colors ${
              !attempt ? 'text-slate-300' : 
              isMatch ? 'text-green-600 bg-green-50' : 'text-red-500 bg-red-50'
            }`}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};
