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
    <div className="min-h-screen flex flex-col items-center justify-center p-3 sm:p-4" style={{ background: 'linear-gradient(145deg, #1a1f2e 0%, #252b3d 50%, #1a1f2e 100%)' }}>
      <div className="w-full max-w-sm sm:max-w-md flex flex-col items-center">
        {/* Header */}
        <div className="text-center mb-8 w-full">
          {/* Dice */}
          <div className="flex justify-center gap-2 mb-5">
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none" className="drop-shadow-md">
              <rect x="2" y="2" width="32" height="32" rx="4" fill="white" stroke="#e5e5e5" strokeWidth="1"/>
              <circle cx="12" cy="12" r="3" fill="#1f2937"/>
              <circle cx="24" cy="12" r="3" fill="#1f2937"/>
              <circle cx="12" cy="24" r="3" fill="#1f2937"/>
              <circle cx="24" cy="24" r="3" fill="#1f2937"/>
            </svg>
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none" className="drop-shadow-md">
              <rect x="2" y="2" width="32" height="32" rx="4" fill="white" stroke="#e5e5e5" strokeWidth="1"/>
              <circle cx="10" cy="10" r="2.5" fill="#1f2937"/>
              <circle cx="26" cy="10" r="2.5" fill="#1f2937"/>
              <circle cx="18" cy="18" r="2.5" fill="#1f2937"/>
              <circle cx="10" cy="26" r="2.5" fill="#1f2937"/>
              <circle cx="26" cy="26" r="2.5" fill="#1f2937"/>
            </svg>
          </div>
          {/* Title */}
          <h1 className="text-4xl sm:text-5xl font-bold tracking-wide text-white mb-1" style={{ fontFamily: 'var(--font-cinzel)' }}>
            BACKGAMMON
          </h1>
          <p className="text-sm uppercase tracking-widest text-gray-400">
            Multiplayer
          </p>
        </div>

        {/* Panel */}
        <div className="w-full rounded-lg p-4 sm:p-6 border-2" style={{ 
          background: '#252b3d',
          borderColor: '#8b4513',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
        }}>
          {/* Username Input */}
          <div className="mb-4">
            <label className="block text-xs font-bold mb-2 uppercase tracking-wider" style={{ color: '#d4a46a' }}>
              Player Name
            </label>
            <input
              type="text"
              placeholder="Enter name"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full p-2 sm:p-3 rounded placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-colors text-sm sm:text-base"
              style={{ 
                background: '#1a1f2e',
                border: '2px solid #3d4556',
                color: '#e8e4dc'
              }}
              disabled={loading}
            />
          </div>

          {/* Create Game Button */}
          <button
            onClick={handleCreate}
            disabled={loading}
            className="w-full font-bold py-2 sm:py-3 px-4 rounded-lg transition-all disabled:opacity-50 mb-4 text-sm sm:text-base hover:opacity-90"
            style={{
              background: '#2e6b8a',
              color: '#fff',
              boxShadow: '0 4px 12px rgba(46,107,138,0.3)'
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
            <div className="flex-1 border-t" style={{ borderColor: '#3d4556' }}></div>
            <span className="px-3 text-xs uppercase" style={{ color: '#6b7280' }}>or</span>
            <div className="flex-1 border-t" style={{ borderColor: '#3d4556' }}></div>
          </div>

          {/* Join Game Section */}
          <div className="mb-4">
            <label className="block text-xs font-bold mb-2 uppercase tracking-wider" style={{ color: '#d4a46a' }}>
              Room Code
            </label>
            <div className="flex gap-2 items-stretch">
              <input
                type="text"
                placeholder="ABC123"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                className="flex-1 p-2 sm:p-3 rounded placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-colors font-mono text-sm sm:text-base"
                style={{ 
                  background: '#1a1f2e',
                  border: '2px solid #3d4556',
                  color: '#e8e4dc'
                }}
                disabled={loading}
                maxLength={6}
              />
              <button
                onClick={handleJoin}
                disabled={loading}
                className="font-bold px-4 sm:px-5 rounded transition-all disabled:opacity-50 text-sm sm:text-base hover:opacity-90"
                style={{
                  background: '#8b4513',
                  color: '#fff'
                }}
              >
                Join
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="px-3 py-2 rounded text-sm" style={{
              background: 'rgba(232, 131, 107, 0.15)',
              border: '1px solid #e8836b',
              color: '#e8836b'
            }}>
              {error}
            </div>
          )}
        </div>

        {/* How to play hint */}
        <p className="text-center mt-4 text-xs w-full" style={{ color: '#6b7280' }}>
          Roll dice, move checkers, bear off first to win!
        </p>
      </div>
    </div>
  );
}
