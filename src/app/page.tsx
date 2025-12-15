'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const [username, setUsername] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleCreate = async () => {
    if (!username.trim()) {
      setError('Please enter a username');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', username: username.trim() }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      localStorage.setItem('username', username.trim());
      router.push(`/game/${data.roomCode}`);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!username.trim() || !roomCode.trim()) {
      setError('Please enter username and room code');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'join', username: username.trim(), roomCode: roomCode.trim() }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      localStorage.setItem('username', username.trim());
      router.push(`/game/${roomCode}`);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-3 sm:p-4" style={{ background: 'linear-gradient(135deg, #1a1612 0%, #2d1810 50%, #1a1612 100%)' }}>
      <div className="w-full max-w-sm sm:max-w-md">
        {/* Header with wooden aesthetic */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="mb-4">
            {/* Decorative dice */}
            <div className="flex justify-center gap-3 mb-4">
              <div className="dice w-10 h-10 flex items-center justify-center">
                <div className="grid grid-cols-2 gap-1 p-1">
                  <div className="dice-dot w-2 h-2"></div>
                  <div className="dice-dot w-2 h-2"></div>
                  <div className="dice-dot w-2 h-2"></div>
                  <div className="dice-dot w-2 h-2"></div>
                </div>
              </div>
              <div className="dice w-10 h-10 flex items-center justify-center">
                <div className="grid grid-cols-3 gap-0.5 p-1">
                  <div className="dice-dot w-1.5 h-1.5"></div>
                  <div className="w-1.5 h-1.5"></div>
                  <div className="dice-dot w-1.5 h-1.5"></div>
                  <div className="w-1.5 h-1.5"></div>
                  <div className="dice-dot w-1.5 h-1.5"></div>
                  <div className="w-1.5 h-1.5"></div>
                  <div className="dice-dot w-1.5 h-1.5"></div>
                  <div className="w-1.5 h-1.5"></div>
                  <div className="dice-dot w-1.5 h-1.5"></div>
                </div>
              </div>
            </div>
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-2 tracking-wide font-serif" style={{ color: '#d4a574', textShadow: '2px 2px 4px rgba(0,0,0,0.5)' }}>
            BACKGAMMON
          </h1>
          <p className="text-xs sm:text-sm uppercase tracking-wider" style={{ color: '#8b7355' }}>
            Multiplayer
          </p>
        </div>

        {/* Panel with wood texture feel */}
        <div className="rounded-lg p-4 sm:p-6 border-2" style={{ 
          background: 'linear-gradient(145deg, #3d2817, #2d1810)',
          borderColor: '#5c3d2e',
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3), 0 4px 12px rgba(0,0,0,0.5)'
        }}>
          {/* Username Input */}
          <div className="mb-4">
            <label className="block text-xs font-bold mb-2 uppercase" style={{ color: '#c4956a' }}>
              Player Name
            </label>
            <input
              type="text"
              placeholder="Enter name"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full p-2 sm:p-3 rounded text-white placeholder-gray-500 focus:outline-none transition-colors text-sm sm:text-base"
              style={{ 
                background: '#1a1612',
                border: '2px solid #5c3d2e'
              }}
              disabled={loading}
            />
          </div>

          {/* Create Game Button */}
          <button
            onClick={handleCreate}
            disabled={loading}
            className="w-full font-bold py-2 sm:py-3 px-4 rounded transition-all disabled:opacity-50 mb-4 text-sm sm:text-base"
            style={{
              background: 'linear-gradient(145deg, #d4a574, #c4956a)',
              color: '#1a1612',
              boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
            }}
          >
            {loading ? (
              <div className="flex items-center justify-center">
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2"></div>
                Creating...
              </div>
            ) : (
              'Create Game'
            )}
          </button>

          {/* Divider */}
          <div className="flex items-center mb-4">
            <div className="flex-1 border-t" style={{ borderColor: '#5c3d2e' }}></div>
            <span className="px-3 text-xs uppercase" style={{ color: '#8b7355' }}>or</span>
            <div className="flex-1 border-t" style={{ borderColor: '#5c3d2e' }}></div>
          </div>

          {/* Join Game Section */}
          <div className="mb-4">
            <label className="block text-xs font-bold mb-2 uppercase" style={{ color: '#c4956a' }}>
              Room Code
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="ABC123"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                className="flex-1 p-2 sm:p-3 rounded text-white placeholder-gray-500 focus:outline-none transition-colors font-mono text-sm sm:text-base"
                style={{ 
                  background: '#1a1612',
                  border: '2px solid #5c3d2e'
                }}
                disabled={loading}
                maxLength={6}
              />
              <button
                onClick={handleJoin}
                disabled={loading}
                className="font-bold px-3 sm:px-4 py-2 sm:py-3 rounded transition-all disabled:opacity-50 text-sm sm:text-base"
                style={{
                  background: '#5c3d2e',
                  color: '#d4a574'
                }}
              >
                Join
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="px-3 py-2 rounded text-sm" style={{
              background: 'rgba(185, 28, 28, 0.3)',
              border: '1px solid #991b1b',
              color: '#fca5a5'
            }}>
              {error}
            </div>
          )}
        </div>

        {/* How to play hint */}
        <div className="text-center mt-4 text-xs" style={{ color: '#8b7355' }}>
          Roll dice, move checkers, bear off first to win!
        </div>
      </div>
    </div>
  );
}

