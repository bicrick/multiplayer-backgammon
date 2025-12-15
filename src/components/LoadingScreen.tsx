'use client';

interface LoadingScreenProps {
  message?: string;
  fullScreen?: boolean;
}

export default function LoadingScreen({ 
  message = "Loading...", 
  fullScreen = true 
}: LoadingScreenProps) {
  const containerClass = fullScreen 
    ? "fixed inset-0 flex items-center justify-center z-50"
    : "flex items-center justify-center p-8";

  return (
    <div className={containerClass} style={{ background: fullScreen ? 'linear-gradient(135deg, #f5efe6 0%, #e8dfd0 50%, #f5efe6 100%)' : 'transparent' }}>
      <div className="text-center">
        {/* Backgammon inspired loading animation - dice rolling */}
        <div className="flex justify-center gap-4 mb-6">
          <div 
            className="dice w-12 h-12 flex items-center justify-center"
            style={{ animation: 'dice-roll 1s ease-in-out infinite' }}
          >
            <div className="grid grid-cols-2 gap-1 p-2">
              <div className="dice-dot w-2 h-2"></div>
              <div className="dice-dot w-2 h-2"></div>
              <div className="dice-dot w-2 h-2"></div>
              <div className="dice-dot w-2 h-2"></div>
            </div>
          </div>
          <div 
            className="dice w-12 h-12 flex items-center justify-center"
            style={{ animation: 'dice-roll 1s ease-in-out 0.2s infinite' }}
          >
            <div className="flex flex-col items-center justify-center gap-1 p-2">
              <div className="flex gap-1">
                <div className="dice-dot w-2 h-2"></div>
                <div className="dice-dot w-2 h-2"></div>
              </div>
              <div className="dice-dot w-2 h-2"></div>
              <div className="flex gap-1">
                <div className="dice-dot w-2 h-2"></div>
                <div className="dice-dot w-2 h-2"></div>
              </div>
            </div>
          </div>
        </div>

        {/* Loading text */}
        <div className="text-xl font-semibold font-mono" style={{ color: '#2e6b8a' }}>
          {message}
        </div>
      </div>

      <style jsx>{`
        @keyframes dice-roll {
          0% { transform: rotate(0deg) scale(1); }
          25% { transform: rotate(90deg) scale(1.1); }
          50% { transform: rotate(180deg) scale(1); }
          75% { transform: rotate(270deg) scale(1.1); }
          100% { transform: rotate(360deg) scale(1); }
        }
      `}</style>
    </div>
  );
}
