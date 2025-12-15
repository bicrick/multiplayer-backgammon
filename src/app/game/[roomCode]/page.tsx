'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import LoadingScreen from '@/components/LoadingScreen';

declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface GameState {
  board: number[];
  bar: { player1: number; player2: number };
  borne_off: { player1: number; player2: number };
  dice: number[] | null;
  moves_left: number[] | null;
  current_turn: 1 | 2;
  winner: number | null;
  player1_username: string;
  player2_username: string | null;
  room_code: string;
}

export default function Game() {
  const { roomCode } = useParams();
  const router = useRouter();
  const [game, setGame] = useState<GameState | null>(null);
  const [playerNumber, setPlayerNumber] = useState<1 | 2 | null>(null);
  const [error, setError] = useState('');
  const [showJoinPrompt, setShowJoinPrompt] = useState(false);
  const [joinUsername, setJoinUsername] = useState('');
  const [selectedPoint, setSelectedPoint] = useState<number | 'bar' | null>(null);
  const [validMoves, setValidMoves] = useState<(number | 'off')[]>([]);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [sessionScore, setSessionScore] = useState<{player1Wins: number, player2Wins: number}>({player1Wins: 0, player2Wins: 0});
  const [isRolling, setIsRolling] = useState(false);
  const lastProcessedWinner = useRef<string | null>(null);
  const soundFunctionsRef = useRef<{
    playMoveSound: () => void;
    playWinSound: () => void;
    playLoseSound: () => void;
    playDiceSound: () => void;
    playHitSound: () => void;
  } | null>(null);

  // Initialize audio context
  useEffect(() => {
    const initAudio = () => {
      if (typeof window !== 'undefined' && !audioContext) {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        setAudioContext(ctx);
      }
    };
    initAudio();
  }, [audioContext]);

  // Sound effects
  const playSound = useCallback((frequency: number, duration: number, type: OscillatorType = 'sine', volume: number = 0.1) => {
    if (!audioContext) return;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    oscillator.type = type;
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(volume, audioContext.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration);
  }, [audioContext]);

  const playMoveSound = useCallback(() => {
    playSound(300, 0.15, 'sine', 0.12);
    setTimeout(() => playSound(250, 0.1, 'sine', 0.08), 50);
  }, [playSound]);

  const playDiceSound = useCallback(() => {
    if (!audioContext) return;
    
    // Create a more realistic dice rolling sound with deeper tones
    const rollCount = 8;
    for (let i = 0; i < rollCount; i++) {
      setTimeout(() => {
        // Deep thud sound for each dice bounce
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        const filter = audioContext.createBiquadFilter();
        
        oscillator.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // Low frequency for a deeper sound
        oscillator.frequency.setValueAtTime(80 + Math.random() * 60, audioContext.currentTime);
        oscillator.type = 'triangle';
        
        // Low-pass filter for warmth
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(400, audioContext.currentTime);
        
        // Quick attack and decay for each "hit"
        const volume = 0.15 - (i * 0.015); // Fade out over bounces
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(volume, audioContext.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.08);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.1);
      }, i * 60 + Math.random() * 20);
    }
  }, [audioContext]);

  const playHitSound = useCallback(() => {
    playSound(150, 0.2, 'sawtooth', 0.1);
    setTimeout(() => playSound(100, 0.15, 'sawtooth', 0.08), 100);
  }, [playSound]);

  const playWinSound = useCallback(() => {
    const notes = [523, 659, 784, 1047];
    notes.forEach((note, i) => {
      setTimeout(() => playSound(note, 0.4, 'triangle', 0.12), i * 100);
    });
  }, [playSound]);

  const playLoseSound = useCallback(() => {
    const notes = [400, 350, 300, 250];
    notes.forEach((note, i) => {
      setTimeout(() => playSound(note, 0.3, 'triangle', 0.08), i * 150);
    });
  }, [playSound]);

  useEffect(() => {
    soundFunctionsRef.current = { playMoveSound, playWinSound, playLoseSound, playDiceSound, playHitSound };
  }, [playMoveSound, playWinSound, playLoseSound, playDiceSound, playHitSound]);

  const playResetSound = useCallback(() => {
    const notes = [300, 400, 500];
    notes.forEach((note, i) => {
      setTimeout(() => playSound(note, 0.2, 'triangle', 0.1), i * 80);
    });
  }, [playSound]);

  // Calculate valid moves for selected piece
  const calculateValidMoves = useCallback((
    from: number | 'bar',
    board: number[],
    bar: { player1: number; player2: number },
    borneOff: { player1: number; player2: number },
    movesLeft: number[],
    player: 1 | 2
  ): (number | 'off')[] => {
    const valid: (number | 'off')[] = [];
    const playerSign = player === 1 ? 1 : -1;
    const barCount = player === 1 ? bar.player1 : bar.player2;

    // Must move from bar first
    if (barCount > 0 && from !== 'bar') return [];

    for (const die of [...new Set(movesLeft)]) {
      if (from === 'bar') {
        const entryPoint = player === 1 ? 24 - die : die - 1;
        if (entryPoint >= 0 && entryPoint <= 23 && board[entryPoint] * playerSign >= -1) {
          if (!valid.includes(entryPoint)) valid.push(entryPoint);
        }
      } else {
        const dest = player === 1 ? from + die : from - die;
        
        // Normal move
        if (dest >= 0 && dest <= 23 && board[dest] * playerSign >= -1) {
          if (!valid.includes(dest)) valid.push(dest);
        }
        
        // Bearing off
        const canBearOff = (() => {
          if (barCount > 0) return false;
          if (player === 1) {
            for (let i = 0; i < 18; i++) if (board[i] > 0) return false;
            return true;
          } else {
            for (let i = 6; i < 24; i++) if (board[i] < 0) return false;
            return true;
          }
        })();
        
        if (canBearOff) {
          if (player === 1 && from >= 18) {
            if (dest >= 24) {
              const furthest = (() => { for (let i = 0; i < 24; i++) if (board[i] > 0) return i; return -1; })();
              if (dest === 24 || furthest >= from) {
                if (!valid.includes('off')) valid.push('off');
              }
            }
          }
          if (player === 2 && from <= 5) {
            if (dest <= -1) {
              const furthest = (() => { for (let i = 23; i >= 0; i--) if (board[i] < 0) return i; return -1; })();
              if (dest === -1 || furthest <= from) {
                if (!valid.includes('off')) valid.push('off');
              }
            }
          }
        }
      }
    }
    return valid;
  }, []);

  const handleAutoJoin = useCallback(async (username: string) => {
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'join', username, roomCode }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setGame(data.game as GameState);
      setPlayerNumber(2);
      localStorage.setItem('playerNumber', '2');
      setShowJoinPrompt(false);
    } catch (err) {
      console.error('Auto join error:', err);
      setError((err as Error).message);
    }
  }, [roomCode]);

  useEffect(() => {
    const storedUsername = localStorage.getItem('username') || '';
    const storedScore = localStorage.getItem(`sessionScore_${roomCode}`);
    if (storedScore) {
      try { setSessionScore(JSON.parse(storedScore)); } catch { /* ignore */ }
    }
    if (!localStorage.getItem(`lastStarter_${roomCode}`)) {
      localStorage.setItem(`lastStarter_${roomCode}`, '1');
    }

    const fetchGame = async () => {
      try {
        const { data, error } = await supabase
          .from('backgammon_games')
          .select('*')
          .eq('room_code', roomCode)
          .single();

        if (error) { setError(`Database error: ${error.message}`); return; }
        if (!data) { setError('Game not found'); return; }

        setGame(data as GameState);

        if (data.player1_username === storedUsername) {
          setPlayerNumber(1);
          localStorage.setItem('playerNumber', '1');
        } else if (data.player2_username === storedUsername) {
          setPlayerNumber(2);
          localStorage.setItem('playerNumber', '2');
        } else {
          if (!data.player2_username && storedUsername) {
            handleAutoJoin(storedUsername);
          } else if (!data.player2_username) {
            setShowJoinPrompt(true);
          } else {
            setError('This game room is full');
          }
        }
      } catch (err) {
        setError(`Failed to load game: ${(err as Error).message}`);
      }
    };

    fetchGame();

    const subscription = supabase
      .channel(`backgammon-${roomCode}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'backgammon_games', filter: `room_code=eq.${roomCode}` },
        (payload) => {
          const newGame = payload.new as GameState;
          setGame((currentGame) => {
            if (newGame.winner !== null && currentGame?.winner === null) {
              const gameIdentifier = `${roomCode}_${Date.now()}_${newGame.winner}`;
              if (lastProcessedWinner.current !== gameIdentifier) {
                lastProcessedWinner.current = gameIdentifier;
                setSessionScore(prevScore => {
                  const newScore = { ...prevScore };
                  if (newGame.winner === 1) newScore.player1Wins += 1;
                  else if (newGame.winner === 2) newScore.player2Wins += 1;
                  localStorage.setItem(`sessionScore_${roomCode}`, JSON.stringify(newScore));
                  return newScore;
                });
                setTimeout(() => {
                  const currentPlayerNumber = localStorage.getItem('playerNumber');
                  if (currentPlayerNumber && parseInt(currentPlayerNumber) === newGame.winner) {
                    soundFunctionsRef.current?.playWinSound();
                  } else {
                    soundFunctionsRef.current?.playLoseSound();
                  }
                }, 300);
              }
            }
            return newGame;
          });
          setSelectedPoint(null);
          setValidMoves([]);
        }
      )
      .subscribe();

    return () => { subscription.unsubscribe(); };
  }, [roomCode, handleAutoJoin]);

  const handleManualJoin = async () => {
    if (!joinUsername.trim()) { setError('Please enter a username'); return; }
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'join', username: joinUsername, roomCode }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      localStorage.setItem('username', joinUsername);
      setGame(data.game as GameState);
      setPlayerNumber(2);
      localStorage.setItem('playerNumber', '2');
      setShowJoinPrompt(false);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleResetGame = async () => {
    try {
      playResetSound();
      const lastStarter = localStorage.getItem(`lastStarter_${roomCode}`) || '1';
      const nextStarter = lastStarter === '1' ? '2' : '1';
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset', roomCode, nextStarter: parseInt(nextStarter) }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      localStorage.setItem(`lastStarter_${roomCode}`, nextStarter);
      lastProcessedWinner.current = null;
      setSelectedPoint(null);
      setValidMoves([]);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleRollDice = async () => {
    if (!game || game.current_turn !== playerNumber || game.winner !== null) return;
    if (game.dice && game.moves_left && game.moves_left.length > 0) return;

    setIsRolling(true);
    soundFunctionsRef.current?.playDiceSound();

    try {
      const res = await fetch('/api/moves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode, action: 'roll', player: playerNumber }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setTimeout(() => setIsRolling(false), 500);
    } catch (err) {
      setError((err as Error).message);
      setIsRolling(false);
    }
  };

  const handlePointClick = (pointIndex: number | 'bar') => {
    if (!game || game.winner !== null || game.current_turn !== playerNumber) return;
    if (!game.dice || !game.moves_left || game.moves_left.length === 0) return;

    const playerSign = playerNumber === 1 ? 1 : -1;
    const barCount = playerNumber === 1 ? game.bar.player1 : game.bar.player2;

    // Clicking on valid move destination
    if (selectedPoint !== null && validMoves.includes(pointIndex as number)) {
      handleMove(selectedPoint, pointIndex as number);
      return;
    }

    // Selecting a piece
    if (pointIndex === 'bar') {
      if (barCount > 0) {
        setSelectedPoint('bar');
        setValidMoves(calculateValidMoves('bar', game.board, game.bar, game.borne_off, game.moves_left, playerNumber!));
      }
    } else if (typeof pointIndex === 'number') {
      const checkerCount = game.board[pointIndex];
      if (checkerCount * playerSign > 0 && barCount === 0) {
        setSelectedPoint(pointIndex);
        setValidMoves(calculateValidMoves(pointIndex, game.board, game.bar, game.borne_off, game.moves_left, playerNumber!));
      } else {
        setSelectedPoint(null);
        setValidMoves([]);
      }
    }
  };

  const handleBearOffClick = () => {
    if (selectedPoint !== null && validMoves.includes('off')) {
      handleMove(selectedPoint, 'off');
    }
  };

  const handleMove = async (from: number | 'bar', to: number | 'off') => {
    if (!game || !game.moves_left) return;

    // Determine which die value to use
    let dieValue: number | null = null;
    const playerSign = playerNumber === 1 ? 1 : -1;

    if (from === 'bar') {
      const entryPoint = to as number;
      dieValue = playerNumber === 1 ? 24 - entryPoint : entryPoint + 1;
    } else if (to === 'off') {
      // Bearing off - find the matching die
      for (const die of game.moves_left) {
        const dest = playerNumber === 1 ? (from as number) + die : (from as number) - die;
        if (playerNumber === 1 && dest >= 24) { dieValue = die; break; }
        if (playerNumber === 2 && dest <= -1) { dieValue = die; break; }
      }
    } else {
      dieValue = playerNumber === 1 ? (to as number) - (from as number) : (from as number) - (to as number);
    }

    if (!dieValue || !game.moves_left.includes(dieValue)) {
      // Try to find any valid die
      for (const die of game.moves_left) {
        if (from === 'bar') {
          const entryPoint = playerNumber === 1 ? 24 - die : die - 1;
          if (entryPoint === to) { dieValue = die; break; }
        } else if (to === 'off') {
          const dest = playerNumber === 1 ? (from as number) + die : (from as number) - die;
          if ((playerNumber === 1 && dest >= 24) || (playerNumber === 2 && dest <= -1)) {
            dieValue = die;
            break;
          }
        } else {
          const dest = playerNumber === 1 ? (from as number) + die : (from as number) - die;
          if (dest === to) { dieValue = die; break; }
        }
      }
    }

    if (!dieValue) return;

    // Check if this is a hit
    const isHit = to !== 'off' && typeof to === 'number' && game.board[to] * playerSign === -1;

    try {
      const res = await fetch('/api/moves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode, action: 'move', player: playerNumber, from, to, dieValue }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      if (isHit) {
        soundFunctionsRef.current?.playHitSound();
      } else {
        soundFunctionsRef.current?.playMoveSound();
      }
      
      setSelectedPoint(null);
      setValidMoves([]);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const copyGameUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = window.location.href;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      } catch { /* ignore */ }
      document.body.removeChild(textArea);
    }
  };

  // Render dice
  const renderDice = (value: number, index: number) => {
    const dots = [];
    const dotPositions: Record<number, string[]> = {
      1: ['center'],
      2: ['top-right', 'bottom-left'],
      3: ['top-right', 'center', 'bottom-left'],
      4: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
      5: ['top-left', 'top-right', 'center', 'bottom-left', 'bottom-right'],
      6: ['top-left', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-right'],
    };

    const positions = dotPositions[value] || [];
    const positionClasses: Record<string, string> = {
      'top-left': 'top-1 left-1',
      'top-right': 'top-1 right-1',
      'center': 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
      'middle-left': 'top-1/2 left-1 -translate-y-1/2',
      'middle-right': 'top-1/2 right-1 -translate-y-1/2',
      'bottom-left': 'bottom-1 left-1',
      'bottom-right': 'bottom-1 right-1',
    };

    for (const pos of positions) {
      dots.push(
        <div
          key={pos}
          className={`absolute w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-gray-900 ${positionClasses[pos]}`}
        />
      );
    }

    return (
      <div
        key={index}
        className={`dice relative w-10 h-10 sm:w-12 sm:h-12 ${isRolling ? 'dice-rolling' : ''}`}
      >
        {dots}
      </div>
    );
  };

  // Render checker
  const renderChecker = (player: 1 | 2, count: number, isStacked: boolean = false, stackIndex: number = 0) => {
    const baseClass = player === 1 ? 'checker checker-white' : 'checker checker-brown';
    const size = 'w-6 h-6 sm:w-8 sm:h-8';
    
    return (
      <div
        className={`${baseClass} ${size} rounded-full flex-shrink-0`}
        style={isStacked ? { marginTop: stackIndex > 0 ? '-12px' : '0' } : {}}
      >
        {count > 1 && stackIndex === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-xs font-bold" style={{ color: player === 1 ? '#4a2c1a' : '#f5f0e6' }}>
            {count}
          </div>
        )}
      </div>
    );
  };

  // Render point (triangle)
  const renderPoint = (index: number, isTop: boolean) => {
    const checkerCount = game?.board[index] || 0;
    const player = checkerCount > 0 ? 1 : checkerCount < 0 ? 2 : null;
    const absCount = Math.abs(checkerCount);
    const isSelected = selectedPoint === index;
    const isValidTarget = validMoves.includes(index);
    
    // Point colors alternate
    const pointColor = index % 2 === 0 ? '#8b4513' : '#daa520';
    
    const maxVisible = 5;
    const visibleCount = Math.min(absCount, maxVisible);
    
    return (
      <div
        key={index}
        className={`relative flex flex-col items-center cursor-pointer transition-all ${isTop ? 'justify-start' : 'justify-end'} ${isSelected ? 'ring-2 ring-green-500' : ''} ${isValidTarget ? 'valid-move ring-2 ring-green-400' : ''}`}
        style={{ width: '100%', height: '100%' }}
        onClick={() => handlePointClick(index)}
      >
        {/* Triangle */}
        <div
          className={`absolute ${isTop ? 'top-0 point-triangle' : 'bottom-0 point-triangle-flipped'}`}
          style={{
            width: '100%',
            height: '85%',
            backgroundColor: pointColor,
          }}
        />
        
        {/* Checkers */}
        <div className={`relative z-10 flex flex-col items-center ${isTop ? 'pt-1' : 'pb-1'}`}>
          {player && Array.from({ length: visibleCount }).map((_, i) => (
            <div key={i} style={{ marginTop: i > 0 ? '-8px' : '0' }}>
              {renderChecker(player, absCount > maxVisible && i === 0 ? absCount : 1, true, i)}
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (error) return (
    <div className="flex flex-col items-center justify-center min-h-screen p-3 sm:p-4" style={{ background: 'linear-gradient(135deg, #1a1612 0%, #2d1810 50%, #1a1612 100%)' }}>
      <div className="rounded-lg p-4 sm:p-6 text-center max-w-sm sm:max-w-md w-full" style={{ background: '#2d1810', border: '2px solid #5c3d2e' }}>
        <div className="text-lg sm:text-xl mb-4" style={{ color: '#fca5a5' }}>{error}</div>
        <button onClick={() => router.push('/')} className="font-bold py-2 sm:py-3 px-4 sm:px-6 rounded transition-colors text-sm sm:text-base" style={{ background: '#5c3d2e', color: '#d4a574' }}>
          Back to Home
        </button>
      </div>
    </div>
  );

  if (!game) return <LoadingScreen message="Loading game..." />;

  if (showJoinPrompt) {
    return (
      <div className="min-h-screen flex items-center justify-center p-3 sm:p-4" style={{ background: 'linear-gradient(135deg, #1a1612 0%, #2d1810 50%, #1a1612 100%)' }}>
        <div className="w-full max-w-sm sm:max-w-md">
          <div className="text-center mb-6 sm:mb-8">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-2 tracking-wide font-serif" style={{ color: '#d4a574' }}>BACKGAMMON</h1>
            <div className="rounded-lg p-3 sm:p-4 mb-4" style={{ background: '#2d1810', border: '2px solid #5c3d2e' }}>
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
                <div className="text-center sm:text-left">
                  <p className="text-base sm:text-lg font-semibold" style={{ color: '#f5e6d3' }}>Room: {roomCode}</p>
                  <p className="text-sm" style={{ color: '#8b7355' }}>{game.player1_username} is waiting for you!</p>
                </div>
                <button onClick={copyGameUrl} className="px-2 sm:px-3 py-1 sm:py-2 rounded-md font-mono text-xs transition-all duration-200 whitespace-nowrap" style={{ background: copySuccess ? '#16a34a' : '#0891b2', color: 'white' }}>
                  {copySuccess ? 'Copied!' : 'Copy Link'}
                </button>
              </div>
            </div>
          </div>
          <div className="rounded-lg p-4 sm:p-6" style={{ background: 'linear-gradient(145deg, #3d2817, #2d1810)', border: '2px solid #5c3d2e' }}>
            <div className="mb-4">
              <label className="block text-xs font-bold mb-2 uppercase" style={{ color: '#c4956a' }}>Player Name</label>
              <input
                type="text"
                placeholder="Enter your name"
                value={joinUsername}
                onChange={(e) => setJoinUsername(e.target.value)}
                className="w-full p-2 sm:p-3 rounded text-white placeholder-gray-500 focus:outline-none text-sm sm:text-base"
                style={{ background: '#1a1612', border: '2px solid #5c3d2e' }}
                onKeyPress={(e) => e.key === 'Enter' && handleManualJoin()}
                autoFocus
              />
            </div>
            <button onClick={handleManualJoin} className="w-full font-bold py-2 sm:py-3 px-4 rounded mb-4 text-sm sm:text-base" style={{ background: 'linear-gradient(145deg, #d4a574, #c4956a)', color: '#1a1612' }}>
              Join Game
            </button>
            <button onClick={() => router.push('/')} className="w-full font-bold px-4 py-2 sm:py-3 rounded text-sm sm:text-base" style={{ background: '#5c3d2e', color: '#d4a574' }}>
              Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { board, bar, borne_off, dice, moves_left, current_turn, winner, player1_username, player2_username } = game;
  const isMyTurn = current_turn === playerNumber && winner === null;
  const needsToRoll = isMyTurn && (!dice || !moves_left || moves_left.length === 0);
  const canMove = isMyTurn && dice && moves_left && moves_left.length > 0;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-2 sm:p-4" style={{ background: 'linear-gradient(135deg, #1a1612 0%, #2d1810 50%, #1a1612 100%)' }}>
      {/* Header */}
      <div className="text-center mb-2 sm:mb-4">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-1 font-serif tracking-wider" style={{ color: '#d4a574' }}>BACKGAMMON</h1>
        <div className="rounded px-3 py-2 inline-block" style={{ background: '#2d1810', border: '1px solid #5c3d2e' }}>
          <div className="flex items-center gap-2 sm:gap-4">
            <span className="font-mono text-xs sm:text-sm" style={{ color: '#f5e6d3' }}>Room: {roomCode}</span>
            <button onClick={copyGameUrl} className="px-2 py-1 rounded text-xs" style={{ background: copySuccess ? '#16a34a' : '#0891b2', color: 'white' }}>
              {copySuccess ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      </div>

      {/* Player Info */}
      <div className="w-full max-w-4xl mb-2 sm:mb-4 px-2">
        {winner !== null ? (
          <div className="text-center">
            <div className="font-bold text-lg sm:text-xl md:text-2xl py-3 sm:py-4 rounded mb-4" style={{ background: '#d4a574', color: '#1a1612' }}>
              {winner === 1 ? player1_username : player2_username} WINS!
            </div>
            <button onClick={handleResetGame} className="font-mono font-bold py-2 sm:py-3 px-4 sm:px-6 rounded text-sm sm:text-base" style={{ background: '#5c3d2e', color: '#d4a574' }}>
              PLAY AGAIN
            </button>
          </div>
        ) : (
          <div className="flex justify-between items-center rounded p-2 sm:p-3 gap-2" style={{ background: '#2d1810', border: '1px solid #5c3d2e' }}>
            {/* Player 1 */}
            <div className={`flex items-center gap-2 p-2 rounded transition-all ${current_turn === 1 ? 'ring-2 ring-amber-500' : 'opacity-60'}`}>
              <div className="checker checker-white w-6 h-6 sm:w-8 sm:h-8 rounded-full" />
              <div>
                <p className="font-bold text-sm sm:text-base" style={{ color: '#f5e6d3' }}>{player1_username}</p>
                <p className="text-xs" style={{ color: '#8b7355' }}>Off: {borne_off.player1}</p>
              </div>
              {(sessionScore.player1Wins > 0 || sessionScore.player2Wins > 0) && (
                <span className="px-1.5 py-0.5 rounded text-xs font-bold" style={{ background: 'rgba(212,165,116,0.3)', color: '#d4a574' }}>{sessionScore.player1Wins}</span>
              )}
              {current_turn === 1 && <span className="animate-pulse ml-1">▶</span>}
            </div>

            {/* Dice */}
            <div className="flex flex-col items-center gap-1">
              {dice && dice.length > 0 ? (
                <div className="flex gap-2">
                  {dice.map((d, i) => renderDice(d, i))}
                </div>
              ) : needsToRoll ? (
                <button onClick={handleRollDice} disabled={isRolling} className="font-bold py-2 px-4 rounded text-sm transition-all hover:scale-105" style={{ background: 'linear-gradient(145deg, #d4a574, #c4956a)', color: '#1a1612' }}>
                  {isRolling ? 'Rolling...' : 'Roll Dice'}
                </button>
              ) : (
                <div className="text-xs" style={{ color: '#8b7355' }}>Waiting...</div>
              )}
              {moves_left && moves_left.length > 0 && (
                <div className="text-xs" style={{ color: '#8b7355' }}>
                  Moves: {moves_left.join(', ')}
                </div>
              )}
            </div>

            {/* Player 2 */}
            <div className={`flex items-center gap-2 p-2 rounded transition-all ${current_turn === 2 ? 'ring-2 ring-amber-500' : 'opacity-60'}`}>
              {current_turn === 2 && <span className="animate-pulse mr-1">◀</span>}
              {(sessionScore.player1Wins > 0 || sessionScore.player2Wins > 0) && (
                <span className="px-1.5 py-0.5 rounded text-xs font-bold" style={{ background: 'rgba(74,44,26,0.5)', color: '#c4956a' }}>{sessionScore.player2Wins}</span>
              )}
              <div className="text-right">
                <p className="font-bold text-sm sm:text-base" style={{ color: '#f5e6d3' }}>{player2_username || 'Waiting...'}</p>
                <p className="text-xs" style={{ color: '#8b7355' }}>Off: {borne_off.player2}</p>
              </div>
              <div className="checker checker-brown w-6 h-6 sm:w-8 sm:h-8 rounded-full" />
            </div>
          </div>
        )}
      </div>

      {/* Game Board */}
      <div className="w-full max-w-4xl mx-auto px-2">
        <div className="relative rounded-lg p-2 sm:p-4" style={{ 
          background: 'linear-gradient(145deg, #5c3d2e, #4a2c1a)',
          border: '4px solid #8b4513',
          boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5), 0 8px 32px rgba(0,0,0,0.5)'
        }}>
          {/* Board inner area */}
          <div className="rounded" style={{ background: '#2d5016', border: '2px solid #1a3009' }}>
            {/* Top row (points 13-24 for player 1 view) */}
            <div className="flex" style={{ height: '120px', minHeight: '100px' }}>
              {/* Points 13-18 */}
              <div className="flex flex-1 gap-0.5 px-1">
                {[12, 13, 14, 15, 16, 17].map(i => (
                  <div key={i} className="flex-1">{renderPoint(i, true)}</div>
                ))}
              </div>
              
              {/* Bar */}
              <div 
                className={`w-10 sm:w-14 flex flex-col items-center justify-start pt-2 cursor-pointer ${selectedPoint === 'bar' ? 'ring-2 ring-green-500' : ''}`}
                style={{ background: '#4a2c1a' }}
                onClick={() => handlePointClick('bar')}
              >
                {bar.player2 > 0 && (
                  <div className="relative">
                    {renderChecker(2, bar.player2)}
                  </div>
                )}
              </div>
              
              {/* Points 19-24 */}
              <div className="flex flex-1 gap-0.5 px-1">
                {[18, 19, 20, 21, 22, 23].map(i => (
                  <div key={i} className="flex-1">{renderPoint(i, true)}</div>
                ))}
              </div>
              
              {/* Bear off area - Player 1 */}
              <div 
                className={`w-8 sm:w-12 flex flex-col items-center justify-start pt-2 cursor-pointer rounded-r ${validMoves.includes('off') && playerNumber === 1 ? 'ring-2 ring-green-400 valid-move' : ''}`}
                style={{ background: '#3d2817' }}
                onClick={handleBearOffClick}
              >
                {borne_off.player1 > 0 && (
                  <div className="text-xs font-bold" style={{ color: '#f5f0e6' }}>
                    {borne_off.player1}
                  </div>
                )}
              </div>
            </div>

            {/* Middle divider (the bar) */}
            <div className="h-3 flex" style={{ background: '#1a3009' }}>
              <div className="flex-1" />
              <div className="w-10 sm:w-14" style={{ background: '#4a2c1a' }} />
              <div className="flex-1" />
              <div className="w-8 sm:w-12" style={{ background: '#3d2817' }} />
            </div>

            {/* Bottom row (points 1-12 for player 1 view) */}
            <div className="flex" style={{ height: '120px', minHeight: '100px' }}>
              {/* Points 7-12 */}
              <div className="flex flex-1 gap-0.5 px-1">
                {[11, 10, 9, 8, 7, 6].map(i => (
                  <div key={i} className="flex-1">{renderPoint(i, false)}</div>
                ))}
              </div>
              
              {/* Bar */}
              <div 
                className={`w-10 sm:w-14 flex flex-col items-center justify-end pb-2 cursor-pointer ${selectedPoint === 'bar' ? 'ring-2 ring-green-500' : ''}`}
                style={{ background: '#4a2c1a' }}
                onClick={() => handlePointClick('bar')}
              >
                {bar.player1 > 0 && (
                  <div className="relative">
                    {renderChecker(1, bar.player1)}
                  </div>
                )}
              </div>
              
              {/* Points 1-6 */}
              <div className="flex flex-1 gap-0.5 px-1">
                {[5, 4, 3, 2, 1, 0].map(i => (
                  <div key={i} className="flex-1">{renderPoint(i, false)}</div>
                ))}
              </div>
              
              {/* Bear off area - Player 2 */}
              <div 
                className={`w-8 sm:w-12 flex flex-col items-center justify-end pb-2 cursor-pointer rounded-r ${validMoves.includes('off') && playerNumber === 2 ? 'ring-2 ring-green-400 valid-move' : ''}`}
                style={{ background: '#3d2817' }}
                onClick={handleBearOffClick}
              >
                {borne_off.player2 > 0 && (
                  <div className="text-xs font-bold" style={{ color: '#4a2c1a' }}>
                    {borne_off.player2}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Instructions */}
      {canMove && (
        <div className="mt-2 text-center text-xs sm:text-sm" style={{ color: '#8b7355' }}>
          {selectedPoint !== null ? 'Click a highlighted point to move' : 'Click a checker to select, then click destination'}
        </div>
      )}

      {/* Back Button */}
      <button onClick={() => router.push('/')} className="mt-4 font-mono font-bold py-2 px-4 rounded text-sm" style={{ background: '#5c3d2e', color: '#d4a574', border: '1px solid #8b4513' }}>
        ← BACK TO HOME
      </button>
    </div>
  );
}

