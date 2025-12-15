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
  const [animatedPoints, setAnimatedPoints] = useState<Set<number | 'bar'>>(new Set());
  
  // Preview/ghost move state
  const [previewBoard, setPreviewBoard] = useState<number[] | null>(null);
  const [previewBar, setPreviewBar] = useState<{ player1: number; player2: number } | null>(null);
  const [previewBorneOff, setPreviewBorneOff] = useState<{ player1: number; player2: number } | null>(null);
  const [previewMovesLeft, setPreviewMovesLeft] = useState<number[] | null>(null);
  const [pendingMoves, setPendingMoves] = useState<Array<{ from: number | 'bar'; to: number | 'off'; dieValue: number }>>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const previousBoardRef = useRef<number[] | null>(null);
  const previousBarRef = useRef<{ player1: number; player2: number } | null>(null);
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

  // Check if any valid moves exist for the current state
  const hasAnyValidMoves = useCallback((
    board: number[],
    bar: { player1: number; player2: number },
    borneOff: { player1: number; player2: number },
    movesLeft: number[],
    player: 1 | 2
  ): boolean => {
    if (movesLeft.length === 0) return false;
    
    const playerSign = player === 1 ? 1 : -1;
    const barCount = player === 1 ? bar.player1 : bar.player2;
    
    // Check bar first if pieces are on it
    if (barCount > 0) {
      for (const die of movesLeft) {
        const entryPoint = player === 1 ? die - 1 : 24 - die;
        if (entryPoint >= 0 && entryPoint <= 23 && board[entryPoint] * playerSign >= -1) {
          return true;
        }
      }
      return false; // Can't enter from bar
    }
    
    // Check all points for valid moves
    for (let i = 0; i < 24; i++) {
      if (board[i] * playerSign > 0) {
        for (const die of movesLeft) {
          const dest = player === 1 ? i + die : i - die;
          
          // Normal move
          if (dest >= 0 && dest <= 23 && board[dest] * playerSign >= -1) {
            return true;
          }
          
          // Bearing off
          const canBearOff = (() => {
            if (player === 1) {
              for (let j = 0; j < 18; j++) if (board[j] > 0) return false;
              return true;
            } else {
              for (let j = 6; j < 24; j++) if (board[j] < 0) return false;
              return true;
            }
          })();
          
          if (canBearOff) {
            if (player === 1 && i >= 18 && i + die >= 24) {
              const furthest = (() => { for (let j = 0; j < 24; j++) if (board[j] > 0) return j; return -1; })();
              if (i + die === 24 || furthest >= i) return true;
            }
            if (player === 2 && i <= 5 && i - die <= -1) {
              const furthest = (() => { for (let j = 23; j >= 0; j--) if (board[j] < 0) return j; return -1; })();
              if (i - die === -1 || furthest <= i) return true;
            }
          }
        }
      }
    }
    
    return false;
  }, []);

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
        // Player 1 enters opponent's home (indices 0-5), Player 2 enters opponent's home (indices 18-23)
        const entryPoint = player === 1 ? die - 1 : 24 - die;
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
          
          // Detect board changes for animation (only when opponent moves)
          const currentPlayerNum = localStorage.getItem('playerNumber');
          const isOpponentMove = currentPlayerNum && parseInt(currentPlayerNum) !== newGame.current_turn;
          
          if (previousBoardRef.current && isOpponentMove) {
            const changedPoints = new Set<number | 'bar'>();
            
            // Check board positions for pieces that arrived (increased count)
            for (let i = 0; i < 24; i++) {
              const oldCount = Math.abs(previousBoardRef.current[i]);
              const newCount = Math.abs(newGame.board[i]);
              if (newCount > oldCount) {
                changedPoints.add(i);
              }
            }
            
            // Check bar for pieces that arrived
            if (previousBarRef.current) {
              if (newGame.bar.player1 > previousBarRef.current.player1 || 
                  newGame.bar.player2 > previousBarRef.current.player2) {
                changedPoints.add('bar');
              }
            }
            
            if (changedPoints.size > 0) {
              setAnimatedPoints(changedPoints);
              // Clear animation after it completes
              setTimeout(() => setAnimatedPoints(new Set()), 400);
            }
          }
          
          // Store current state for next comparison
          previousBoardRef.current = [...newGame.board];
          previousBarRef.current = { ...newGame.bar };
          
          // Clear preview state if it's no longer our turn (game moved to next turn)
          const myPlayerNum = localStorage.getItem('playerNumber');
          if (myPlayerNum && parseInt(myPlayerNum) !== newGame.current_turn) {
            setPreviewBoard(null);
            setPreviewBar(null);
            setPreviewBorneOff(null);
            setPreviewMovesLeft(null);
            setPendingMoves([]);
          }
          
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
      // Clear preview state
      setPreviewBoard(null);
      setPreviewBar(null);
      setPreviewBorneOff(null);
      setPreviewMovesLeft(null);
      setPendingMoves([]);
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
      
      // Initialize preview state for local move preview
      const rolledGame = data.game as GameState;
      setPreviewBoard([...rolledGame.board]);
      setPreviewBar({ ...rolledGame.bar });
      setPreviewBorneOff({ ...rolledGame.borne_off });
      setPreviewMovesLeft(rolledGame.moves_left ? [...rolledGame.moves_left] : []);
      setPendingMoves([]);
      
      setTimeout(() => setIsRolling(false), 500);
    } catch (err) {
      setError((err as Error).message);
      setIsRolling(false);
    }
  };

  const handleEndTurn = async () => {
    if (!game || game.current_turn !== playerNumber || game.winner !== null) return;
    if (!game.dice) return; // Must have rolled first

    setIsSubmitting(true);
    
    try {
      // Send all pending moves to the server
      for (const move of pendingMoves) {
        const res = await fetch('/api/moves', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            roomCode, 
            action: 'move', 
            player: playerNumber, 
            from: move.from, 
            to: move.to, 
            dieValue: move.dieValue 
          }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
      }
      
      // Now end the turn
      const res = await fetch('/api/moves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode, action: 'endTurn', player: playerNumber }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      // Clear preview state
      setPreviewBoard(null);
      setPreviewBar(null);
      setPreviewBorneOff(null);
      setPreviewMovesLeft(null);
      setPendingMoves([]);
      setSelectedPoint(null);
      setValidMoves([]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Undo the last preview move
  const handleUndo = () => {
    if (!game || pendingMoves.length === 0) return;
    
    // Reset to original game state and replay all moves except the last one
    const movesToReplay = pendingMoves.slice(0, -1);
    
    // Start from original game state
    let board = [...game.board];
    let bar = { ...game.bar };
    let borneOff = { ...game.borne_off };
    let movesLeft = game.moves_left ? [...game.moves_left] : [];
    
    // Replay all moves except the last one
    for (const move of movesToReplay) {
      const result = applyLocalMove(board, bar, borneOff, movesLeft, move.from, move.to, move.dieValue, playerNumber!);
      board = result.board;
      bar = result.bar;
      borneOff = result.borneOff;
      movesLeft = result.movesLeft;
    }
    
    setPreviewBoard(board);
    setPreviewBar(bar);
    setPreviewBorneOff(borneOff);
    setPreviewMovesLeft(movesLeft);
    setPendingMoves(movesToReplay);
    setSelectedPoint(null);
    setValidMoves([]);
    
    soundFunctionsRef.current?.playMoveSound();
  };
  
  // Apply a move locally (for preview)
  const applyLocalMove = (
    board: number[],
    bar: { player1: number; player2: number },
    borneOff: { player1: number; player2: number },
    movesLeft: number[],
    from: number | 'bar',
    to: number | 'off',
    dieValue: number,
    player: 1 | 2
  ) => {
    const newBoard = [...board];
    const newBar = { ...bar };
    const newBorneOff = { ...borneOff };
    const playerSign = player === 1 ? 1 : -1;
    
    // Remove checker from source
    if (from === 'bar') {
      if (player === 1) newBar.player1--;
      else newBar.player2--;
    } else {
      newBoard[from] -= playerSign;
    }
    
    // Add checker to destination
    if (to === 'off') {
      if (player === 1) newBorneOff.player1++;
      else newBorneOff.player2++;
    } else {
      // Check for hit (single opponent checker)
      if (newBoard[to] * playerSign === -1) {
        newBoard[to] = 0;
        if (player === 1) newBar.player2++;
        else newBar.player1++;
      }
      newBoard[to] += playerSign;
    }
    
    // Remove used die
    const newMovesLeft = [...movesLeft];
    const dieIndex = newMovesLeft.indexOf(dieValue);
    if (dieIndex !== -1) {
      newMovesLeft.splice(dieIndex, 1);
    }
    
    return { board: newBoard, bar: newBar, borneOff: newBorneOff, movesLeft: newMovesLeft };
  };

  const handlePointClick = (pointIndex: number | 'bar') => {
    if (!game || game.winner !== null || game.current_turn !== playerNumber) return;
    if (!game.dice) return;
    
    // Use preview state if available, otherwise use game state
    const currentBoard = previewBoard || game.board;
    const currentBar = previewBar || game.bar;
    const currentBorneOff = previewBorneOff || game.borne_off;
    const currentMovesLeft = previewMovesLeft || game.moves_left || [];
    
    if (currentMovesLeft.length === 0) return;

    const playerSign = playerNumber === 1 ? 1 : -1;
    const barCount = playerNumber === 1 ? currentBar.player1 : currentBar.player2;

    // Clicking on valid move destination
    if (selectedPoint !== null && validMoves.includes(pointIndex as number)) {
      handleMove(selectedPoint, pointIndex as number);
      return;
    }

    // Selecting a piece
    if (pointIndex === 'bar') {
      if (barCount > 0) {
        setSelectedPoint('bar');
        setValidMoves(calculateValidMoves('bar', currentBoard, currentBar, currentBorneOff, currentMovesLeft, playerNumber!));
      }
    } else if (typeof pointIndex === 'number') {
      const checkerCount = currentBoard[pointIndex];
      if (checkerCount * playerSign > 0 && barCount === 0) {
        setSelectedPoint(pointIndex);
        setValidMoves(calculateValidMoves(pointIndex, currentBoard, currentBar, currentBorneOff, currentMovesLeft, playerNumber!));
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

  const handleMove = (from: number | 'bar', to: number | 'off') => {
    if (!game || !playerNumber) return;
    
    // Use preview state if available, otherwise use game state
    const currentBoard = previewBoard || game.board;
    const currentBar = previewBar || game.bar;
    const currentBorneOff = previewBorneOff || game.borne_off;
    const currentMovesLeft = previewMovesLeft || game.moves_left || [];
    
    if (currentMovesLeft.length === 0) return;

    // Determine which die value to use
    let dieValue: number | null = null;
    const playerSign = playerNumber === 1 ? 1 : -1;

    if (from === 'bar') {
      const entryPoint = to as number;
      // Player 1 enters at die-1, so die = entryPoint+1; Player 2 enters at 24-die, so die = 24-entryPoint
      dieValue = playerNumber === 1 ? entryPoint + 1 : 24 - entryPoint;
    } else if (to === 'off') {
      // Bearing off - find the matching die
      for (const die of currentMovesLeft) {
        const dest = playerNumber === 1 ? (from as number) + die : (from as number) - die;
        if (playerNumber === 1 && dest >= 24) { dieValue = die; break; }
        if (playerNumber === 2 && dest <= -1) { dieValue = die; break; }
      }
    } else {
      dieValue = playerNumber === 1 ? (to as number) - (from as number) : (from as number) - (to as number);
    }

    if (!dieValue || !currentMovesLeft.includes(dieValue)) {
      // Try to find any valid die
      for (const die of currentMovesLeft) {
        if (from === 'bar') {
          // Player 1 enters at die-1, Player 2 enters at 24-die
          const entryPoint = playerNumber === 1 ? die - 1 : 24 - die;
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
    const isHit = to !== 'off' && typeof to === 'number' && currentBoard[to] * playerSign === -1;

    // Apply move locally (preview mode)
    const result = applyLocalMove(currentBoard, currentBar, currentBorneOff, currentMovesLeft, from, to, dieValue, playerNumber);
    
    setPreviewBoard(result.board);
    setPreviewBar(result.bar);
    setPreviewBorneOff(result.borneOff);
    setPreviewMovesLeft(result.movesLeft);
    setPendingMoves([...pendingMoves, { from, to, dieValue }]);
    
    if (isHit) {
      soundFunctionsRef.current?.playHitSound();
    } else {
      soundFunctionsRef.current?.playMoveSound();
    }
    
    setSelectedPoint(null);
    setValidMoves([]);
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

    // Alternate animation for second die
    const animationClass = isRolling 
      ? (index === 0 ? 'dice-rolling' : 'dice-rolling-alt') 
      : '';

    return (
      <div
        key={index}
        className={`dice relative w-10 h-10 sm:w-12 sm:h-12 ${animationClass}`}
      >
        {dots}
      </div>
    );
  };

  // Render checker
  const renderChecker = (player: 1 | 2, count: number, isStacked: boolean = false, stackIndex: number = 0, isAnimated: boolean = false) => {
    const baseClass = player === 1 ? 'checker checker-white' : 'checker checker-black';
    const size = 'w-6 h-6 sm:w-8 sm:h-8';
    const animClass = isAnimated ? 'checker-arrive' : '';
    
    return (
      <div
        className={`${baseClass} ${size} ${animClass} rounded-full flex-shrink-0`}
        style={isStacked ? { marginTop: stackIndex > 0 ? '-12px' : '0' } : {}}
      >
        {count > 1 && stackIndex === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-xs font-bold" style={{ color: player === 1 ? '#1a1a1a' : '#faf8f5' }}>
            {count}
          </div>
        )}
      </div>
    );
  };

  // Render point (triangle)
  const renderPoint = (index: number, isTop: boolean) => {
    // Use preview board if available, otherwise use game board
    const currentBoard = previewBoard || game?.board;
    const checkerCount = currentBoard?.[index] || 0;
    const player = checkerCount > 0 ? 1 : checkerCount < 0 ? 2 : null;
    const absCount = Math.abs(checkerCount);
    const isSelected = selectedPoint === index;
    const isValidTarget = validMoves.includes(index);
    const isAnimated = animatedPoints.has(index);
    
    // Point colors alternate - terracotta and Aegean blue
    const pointColor = index % 2 === 0 ? '#b85a3a' : '#2e6b8a';
    
    const maxVisible = 5;
    const visibleCount = Math.min(absCount, maxVisible);
    
    return (
      <div
        key={index}
        className={`relative flex flex-col items-center cursor-pointer transition-all ${isTop ? 'justify-start' : 'justify-end'} ${isSelected ? 'ring-2 ring-amber-400' : ''} ${isValidTarget ? 'valid-move ring-2 ring-amber-300' : ''}`}
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
              {renderChecker(player, absCount > maxVisible && i === 0 ? absCount : 1, true, i, isAnimated && i === 0)}
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (error) return (
    <div className="flex flex-col items-center justify-center min-h-screen p-3 sm:p-4" style={{ background: 'linear-gradient(145deg, #1a1f2e 0%, #252b3d 50%, #1a1f2e 100%)' }}>
      <div className="rounded-lg p-4 sm:p-6 text-center max-w-sm sm:max-w-md w-full" style={{ background: '#252b3d', border: '2px solid #c45c3e', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
        <div className="text-lg sm:text-xl mb-4" style={{ color: '#e8836b' }}>{error}</div>
        <button onClick={() => router.push('/')} className="font-bold py-2 sm:py-3 px-4 sm:px-6 rounded transition-colors text-sm sm:text-base hover:opacity-90" style={{ background: '#2e6b8a', color: '#fff' }}>
          Back to Home
        </button>
      </div>
    </div>
  );

  if (!game) return <LoadingScreen message="Loading game..." />;

  if (showJoinPrompt) {
    return (
      <div className="min-h-screen flex items-center justify-center p-3 sm:p-4" style={{ background: 'linear-gradient(145deg, #1a1f2e 0%, #252b3d 50%, #1a1f2e 100%)' }}>
        <div className="w-full max-w-sm sm:max-w-md">
          <div className="text-center mb-6 sm:mb-8">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-2 tracking-wide font-serif" style={{ color: '#d4a46a' }}>BACKGAMMON</h1>
            <div className="rounded-lg p-3 sm:p-4 mb-4" style={{ background: '#252b3d', border: '2px solid #8b4513', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
                <div className="text-center sm:text-left">
                  <p className="text-base sm:text-lg font-semibold" style={{ color: '#e8e4dc' }}>Room: {roomCode}</p>
                  <p className="text-sm" style={{ color: '#9ca3af' }}>{game.player1_username} is waiting for you!</p>
                </div>
                <button onClick={copyGameUrl} className="px-2 sm:px-3 py-1 sm:py-2 rounded-md font-mono text-xs transition-all duration-200 whitespace-nowrap hover:opacity-90" style={{ background: copySuccess ? '#16a34a' : '#2e6b8a', color: 'white' }}>
                  {copySuccess ? 'Copied!' : 'Copy Link'}
                </button>
              </div>
            </div>
          </div>
          <div className="rounded-lg p-4 sm:p-6" style={{ background: '#252b3d', border: '2px solid #8b4513', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
            <div className="mb-4">
              <label className="block text-xs font-bold mb-2 uppercase tracking-wider" style={{ color: '#d4a46a' }}>Player Name</label>
              <input
                type="text"
                placeholder="Enter your name"
                value={joinUsername}
                onChange={(e) => setJoinUsername(e.target.value)}
                className="w-full p-2 sm:p-3 rounded placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-sm sm:text-base"
                style={{ background: '#1a1f2e', border: '2px solid #3d4556', color: '#e8e4dc' }}
                onKeyPress={(e) => e.key === 'Enter' && handleManualJoin()}
                autoFocus
              />
            </div>
            <button onClick={handleManualJoin} className="w-full font-bold py-2 sm:py-3 px-4 rounded mb-4 text-sm sm:text-base hover:opacity-90 transition-opacity" style={{ background: '#2e6b8a', color: '#fff' }}>
              Join Game
            </button>
            <button onClick={() => router.push('/')} className="w-full font-bold px-4 py-2 sm:py-3 rounded text-sm sm:text-base hover:opacity-90 transition-opacity" style={{ background: '#8b4513', color: '#fff' }}>
              Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { dice, current_turn, winner, player1_username, player2_username } = game;
  
  // Use preview state when available (during local move preview), otherwise use server state
  const board = previewBoard || game.board;
  const bar = previewBar || game.bar;
  const borne_off = previewBorneOff || game.borne_off;
  const moves_left = previewMovesLeft ?? game.moves_left;
  
  const isMyTurn = current_turn === playerNumber && winner === null;
  const needsToRoll = isMyTurn && (!dice || !game.moves_left || game.moves_left.length === 0);
  const canMove = isMyTurn && dice && moves_left && moves_left.length > 0;
  const isInPreviewMode = previewBoard !== null;
  const hasPendingMoves = pendingMoves.length > 0;
  
  // Check if there are any valid moves available with current state
  const hasValidMovesAvailable = isMyTurn && playerNumber && moves_left && moves_left.length > 0
    ? hasAnyValidMoves(board, bar, borne_off, moves_left, playerNumber)
    : false;
  
  // Can only end turn if: no moves left, OR no valid moves available (blocked)
  const canEndTurn = isMyTurn && dice && (moves_left?.length === 0 || !hasValidMovesAvailable);
  const isBlocked = isMyTurn && dice && moves_left && moves_left.length > 0 && !hasValidMovesAvailable;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-2 sm:p-4" style={{ background: 'linear-gradient(145deg, #1a1f2e 0%, #252b3d 50%, #1a1f2e 100%)' }}>
      {/* Header */}
      <div className="text-center mb-3 sm:mb-5">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2 font-serif tracking-widest" style={{ color: '#d4a46a', textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>BACKGAMMON</h1>
        <div className="rounded-lg px-4 py-2 inline-flex items-center gap-3" style={{ background: '#252b3d', border: '1px solid #3d4556', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
          <span className="font-mono text-xs sm:text-sm font-medium" style={{ color: '#9ca3af' }}>Room:</span>
          <span className="font-mono text-xs sm:text-sm font-bold tracking-wider" style={{ color: '#d4a46a' }}>{roomCode}</span>
          <button onClick={copyGameUrl} className="px-2.5 py-1 rounded text-xs font-semibold transition-all hover:opacity-90" style={{ background: copySuccess ? '#16a34a' : '#2e6b8a', color: 'white' }}>
            {copySuccess ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Player Info */}
      <div className="w-full max-w-4xl mb-2 sm:mb-4 px-2">
        {winner !== null ? (
          <div className="text-center">
            <div className="font-bold text-lg sm:text-xl md:text-2xl py-3 sm:py-4 rounded-lg mb-4" style={{ background: 'linear-gradient(135deg, #d4a46a, #c49358)', color: '#1a1f2e', boxShadow: '0 4px 16px rgba(212,164,106,0.4)' }}>
              {winner === 1 ? player1_username : player2_username} WINS!
            </div>
            <button onClick={handleResetGame} className="font-mono font-bold py-2 sm:py-3 px-4 sm:px-6 rounded-lg text-sm sm:text-base hover:opacity-90 transition-opacity" style={{ background: '#2e6b8a', color: '#fff' }}>
              PLAY AGAIN
            </button>
          </div>
        ) : (
          <div className="flex justify-between items-stretch gap-3 sm:gap-4">
            {/* Player 1 Card */}
            <div 
              className={`flex-1 flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-xl transition-all ${current_turn === 1 ? 'ring-2 ring-amber-500' : 'opacity-60'}`} 
              style={{ 
                background: current_turn === 1 ? 'linear-gradient(135deg, rgba(212,164,106,0.15), rgba(212,164,106,0.05))' : '#252b3d',
                border: '1px solid',
                borderColor: current_turn === 1 ? '#d4a46a' : '#3d4556',
                boxShadow: current_turn === 1 ? '0 4px 20px rgba(212,164,106,0.2)' : '0 2px 8px rgba(0,0,0,0.2)'
              }}
            >
              <div className="checker checker-white w-8 h-8 sm:w-10 sm:h-10 rounded-full flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-sm sm:text-base truncate" style={{ color: '#e8e4dc' }}>{player1_username}</p>
                  {(sessionScore.player1Wins > 0 || sessionScore.player2Wins > 0) && (
                    <span className="px-1.5 py-0.5 rounded text-xs font-bold flex-shrink-0" style={{ background: 'rgba(212,164,106,0.25)', color: '#d4a46a' }}>{sessionScore.player1Wins}</span>
                  )}
                </div>
                <p className="text-xs" style={{ color: '#9ca3af' }}>Off: {borne_off.player1}</p>
              </div>
              {current_turn === 1 && <span className="animate-pulse text-lg" style={{ color: '#d4a46a' }}>▶</span>}
            </div>

            {/* Dice Area */}
            <div 
              className="flex flex-col items-center justify-center px-3 sm:px-6 py-2 rounded-xl min-w-[120px] sm:min-w-[160px]"
              style={{ 
                background: '#252b3d',
                border: '1px solid #3d4556',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
              }}
            >
              {dice && dice.length > 0 ? (
                <>
                  <div className="flex gap-2 sm:gap-3">
                    {dice.map((d, i) => renderDice(d, i))}
                  </div>
                  {moves_left && moves_left.length > 0 && (
                    <div className="text-xs mt-1" style={{ color: '#9ca3af' }}>
                      {moves_left.join(', ')}
                    </div>
                  )}
                </>
              ) : needsToRoll ? (
                <button 
                  onClick={handleRollDice} 
                  disabled={isRolling} 
                  className={`group relative p-3 sm:p-4 rounded-xl transition-all hover:scale-110 active:scale-95 ${isRolling ? 'dice-shake' : ''}`}
                  style={{ 
                    background: 'linear-gradient(145deg, #3a7ca5, #2e6b8a)',
                    boxShadow: '0 4px 12px rgba(46,107,138,0.4), inset 0 1px 0 rgba(255,255,255,0.1)'
                  }}
                  title="Roll Dice"
                >
                  {/* Dice icon */}
                  <svg viewBox="0 0 24 24" className="w-6 h-6 sm:w-8 sm:h-8" fill="none" stroke="white" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="3" />
                    <circle cx="8" cy="8" r="1.5" fill="white" stroke="none" />
                    <circle cx="16" cy="8" r="1.5" fill="white" stroke="none" />
                    <circle cx="8" cy="16" r="1.5" fill="white" stroke="none" />
                    <circle cx="16" cy="16" r="1.5" fill="white" stroke="none" />
                    <circle cx="12" cy="12" r="1.5" fill="white" stroke="none" />
                  </svg>
                </button>
              ) : (
                <div className="flex gap-2 opacity-40">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg" style={{ background: '#3d4556' }} />
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg" style={{ background: '#3d4556' }} />
                </div>
              )}
              
              {/* No valid moves warning */}
              {isBlocked && (
                <div className="text-xs font-semibold mt-2" style={{ color: '#e8836b' }}>
                  No valid moves!
                </div>
              )}
              
              {/* Action buttons */}
              {isMyTurn && dice && dice.length > 0 && (
                <div className="flex gap-2 mt-2">
                  {hasPendingMoves && (
                    <button 
                      onClick={handleUndo}
                      disabled={isSubmitting}
                      className="p-1.5 rounded-lg transition-all hover:scale-110 active:scale-95"
                      style={{ background: '#6b7280' }}
                      title="Undo"
                    >
                      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="white" strokeWidth="2.5">
                        <path d="M3 10h10a5 5 0 0 1 5 5v2M3 10l5-5M3 10l5 5" />
                      </svg>
                    </button>
                  )}
                  {hasPendingMoves && (
                    <button 
                      onClick={handleEndTurn}
                      disabled={isSubmitting}
                      className="p-1.5 rounded-lg transition-all hover:scale-110 active:scale-95"
                      style={{ background: '#16a34a' }}
                      title="Confirm Moves"
                    >
                      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="white" strokeWidth="3">
                        <path d="M5 12l5 5L20 7" />
                      </svg>
                    </button>
                  )}
                  {!hasPendingMoves && canEndTurn && (
                    <button 
                      onClick={handleEndTurn}
                      disabled={isSubmitting}
                      className="p-1.5 rounded-lg transition-all hover:scale-110 active:scale-95"
                      style={{ background: '#d4a46a' }}
                      title="End Turn"
                    >
                      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="#1a1f2e" strokeWidth="3">
                        <path d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Player 2 Card */}
            <div 
              className={`flex-1 flex items-center justify-end gap-2 sm:gap-3 p-2 sm:p-3 rounded-xl transition-all ${current_turn === 2 ? 'ring-2 ring-amber-500' : 'opacity-60'}`} 
              style={{ 
                background: current_turn === 2 ? 'linear-gradient(135deg, rgba(212,164,106,0.15), rgba(212,164,106,0.05))' : '#252b3d',
                border: '1px solid',
                borderColor: current_turn === 2 ? '#d4a46a' : '#3d4556',
                boxShadow: current_turn === 2 ? '0 4px 20px rgba(212,164,106,0.2)' : '0 2px 8px rgba(0,0,0,0.2)'
              }}
            >
              {current_turn === 2 && <span className="animate-pulse text-lg" style={{ color: '#d4a46a' }}>◀</span>}
              <div className="flex-1 min-w-0 text-right">
                <div className="flex items-center justify-end gap-2">
                  {(sessionScore.player1Wins > 0 || sessionScore.player2Wins > 0) && (
                    <span className="px-1.5 py-0.5 rounded text-xs font-bold flex-shrink-0" style={{ background: 'rgba(46,107,138,0.25)', color: '#5a9ab8' }}>{sessionScore.player2Wins}</span>
                  )}
                  <p className="font-bold text-sm sm:text-base truncate" style={{ color: '#e8e4dc' }}>{player2_username || 'Waiting...'}</p>
                </div>
                <p className="text-xs" style={{ color: '#9ca3af' }}>Off: {borne_off.player2}</p>
              </div>
              <div className="checker checker-black w-8 h-8 sm:w-10 sm:h-10 rounded-full flex-shrink-0" />
            </div>
          </div>
        )}
      </div>

      {/* Game Board */}
      <div className="w-full max-w-4xl mx-auto px-2">
        <div className="relative rounded-lg p-2 sm:p-4" style={{ 
          background: 'linear-gradient(145deg, #c45c3e, #a04830)',
          border: '4px solid #d4a46a',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
        }}>
          {/* Direction arrows in the frame/border */}
          {playerNumber && (
            <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-lg">
              {playerNumber === 1 ? (
                /* Player 1 (white): bottom LEFT, top RIGHT to home */
                <>
                  {/* Bottom border - arrows pointing left */}
                  <div className="absolute bottom-0.5 left-6 right-20 h-3 flex items-center justify-around">
                    <span className="text-white/80 text-xs">◄</span>
                    <span className="text-white/80 text-xs">◄</span>
                    <span className="text-white/80 text-xs">◄</span>
                    <span className="text-white/80 text-xs">◄</span>
                    <span className="text-white/80 text-xs">◄</span>
                  </div>
                  {/* Top border - arrows pointing right */}
                  <div className="absolute top-0.5 left-6 right-20 h-3 flex items-center justify-around">
                    <span className="text-white/80 text-xs">►</span>
                    <span className="text-white/80 text-xs">►</span>
                    <span className="text-white/80 text-xs">►</span>
                    <span className="text-white/80 text-xs">►</span>
                    <span className="text-white/80 text-xs">►</span>
                  </div>
                  {/* Left border - arrow pointing up */}
                  <div className="absolute left-0.5 top-6 bottom-6 w-3 flex flex-col items-center justify-around">
                    <span className="text-white/80 text-xs">▲</span>
                    <span className="text-white/80 text-xs">▲</span>
                  </div>
                </>
              ) : (
                /* Player 2 (black): top LEFT, bottom RIGHT to home */
                <>
                  {/* Top border - arrows pointing left */}
                  <div className="absolute top-0.5 left-6 right-20 h-3 flex items-center justify-around">
                    <span className="text-white/80 text-xs">◄</span>
                    <span className="text-white/80 text-xs">◄</span>
                    <span className="text-white/80 text-xs">◄</span>
                    <span className="text-white/80 text-xs">◄</span>
                    <span className="text-white/80 text-xs">◄</span>
                  </div>
                  {/* Bottom border - arrows pointing right */}
                  <div className="absolute bottom-0.5 left-6 right-20 h-3 flex items-center justify-around">
                    <span className="text-white/80 text-xs">►</span>
                    <span className="text-white/80 text-xs">►</span>
                    <span className="text-white/80 text-xs">►</span>
                    <span className="text-white/80 text-xs">►</span>
                    <span className="text-white/80 text-xs">►</span>
                  </div>
                  {/* Left border - arrow pointing down */}
                  <div className="absolute left-0.5 top-6 bottom-6 w-3 flex flex-col items-center justify-around">
                    <span className="text-white/80 text-xs">▼</span>
                    <span className="text-white/80 text-xs">▼</span>
                  </div>
                </>
              )}
            </div>
          )}
          
          {/* Board inner area */}
          <div className="rounded relative" style={{ background: '#faf6f0', border: '2px solid #e8dfd0' }}>
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
                className={`w-10 sm:w-14 flex flex-col items-center justify-start pt-2 cursor-pointer ${selectedPoint === 'bar' ? 'ring-2 ring-amber-400' : ''}`}
                style={{ background: '#a04830' }}
                onClick={() => handlePointClick('bar')}
              >
                {bar.player2 > 0 && (
                  <div className="relative">
                    {renderChecker(2, bar.player2, false, 0, animatedPoints.has('bar'))}
                  </div>
                )}
              </div>
              
              {/* Points 19-24 */}
              <div className="flex flex-1 gap-0.5 px-1">
                {[18, 19, 20, 21, 22, 23].map(i => (
                  <div key={i} className="flex-1">{renderPoint(i, true)}</div>
                ))}
              </div>
              
              {/* Bear off area - Player 1 with home indicator */}
              <div 
                className={`w-8 sm:w-12 flex flex-col items-center justify-start pt-2 cursor-pointer rounded-r ${validMoves.includes('off') && playerNumber === 1 ? 'ring-2 ring-amber-300 valid-move' : ''}`}
                style={{ background: '#8b6f47' }}
                onClick={handleBearOffClick}
              >
                {playerNumber === 1 && (
                  <svg className="w-5 h-5 mb-1" viewBox="0 0 24 24" fill="#faf8f5" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}>
                    <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
                  </svg>
                )}
                {borne_off.player1 > 0 && (
                  <div className="text-xs font-bold" style={{ color: '#faf8f5' }}>
                    {borne_off.player1}
                  </div>
                )}
              </div>
            </div>

            {/* Middle divider (the bar) */}
            <div className="h-3 flex" style={{ background: '#e8dfd0' }}>
              <div className="flex-1" />
              <div className="w-10 sm:w-14" style={{ background: '#a04830' }} />
              <div className="flex-1" />
              <div className="w-8 sm:w-12" style={{ background: '#8b6f47' }} />
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
                className={`w-10 sm:w-14 flex flex-col items-center justify-end pb-2 cursor-pointer ${selectedPoint === 'bar' ? 'ring-2 ring-amber-400' : ''}`}
                style={{ background: '#a04830' }}
                onClick={() => handlePointClick('bar')}
              >
                {bar.player1 > 0 && (
                  <div className="relative">
                    {renderChecker(1, bar.player1, false, 0, animatedPoints.has('bar'))}
                  </div>
                )}
              </div>
              
              {/* Points 1-6 */}
              <div className="flex flex-1 gap-0.5 px-1">
                {[5, 4, 3, 2, 1, 0].map(i => (
                  <div key={i} className="flex-1">{renderPoint(i, false)}</div>
                ))}
              </div>
              
              {/* Bear off area - Player 2 with home indicator */}
              <div 
                className={`w-8 sm:w-12 flex flex-col items-center justify-end pb-2 cursor-pointer rounded-r ${validMoves.includes('off') && playerNumber === 2 ? 'ring-2 ring-amber-300 valid-move' : ''}`}
                style={{ background: '#8b6f47' }}
                onClick={handleBearOffClick}
              >
                {borne_off.player2 > 0 && (
                  <div className="text-xs font-bold" style={{ color: '#faf8f5' }}>
                    {borne_off.player2}
                  </div>
                )}
                {playerNumber === 2 && (
                  <svg className="w-5 h-5 mt-1" viewBox="0 0 24 24" fill="#faf8f5" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }}>
                    <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
                  </svg>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Instructions */}
      {isMyTurn && dice && (
        <div className="mt-3 text-center text-xs sm:text-sm" style={{ color: '#9ca3af' }}>
          {isBlocked && !hasPendingMoves
            ? 'All moves are blocked - click End Turn to pass'
            : selectedPoint !== null 
              ? 'Click a highlighted point to move' 
              : hasPendingMoves 
                ? hasValidMovesAvailable
                  ? 'Make more moves, Undo to go back, or Confirm to finalize'
                  : 'No more valid moves - Undo or Confirm to finalize'
                : hasValidMovesAvailable
                  ? 'Click a checker to select, then click destination'
                  : 'No valid moves available'}
        </div>
      )}
      {isMyTurn && hasPendingMoves && (
        <div className="mt-1 text-center text-xs" style={{ color: '#d4a46a' }}>
          {pendingMoves.length} move{pendingMoves.length !== 1 ? 's' : ''} pending - click Confirm Moves to submit
        </div>
      )}

      {/* Back Button */}
      <button onClick={() => router.push('/')} className="mt-4 font-mono font-bold py-2 px-4 rounded-lg text-sm hover:opacity-90 transition-opacity" style={{ background: '#8b4513', color: '#e8e4dc' }}>
        ← BACK TO HOME
      </button>
    </div>
  );
}

