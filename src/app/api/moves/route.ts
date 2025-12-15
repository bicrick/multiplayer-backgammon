import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

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

// Helper: Roll two dice
function rollDice(): number[] {
  const d1 = Math.floor(Math.random() * 6) + 1;
  const d2 = Math.floor(Math.random() * 6) + 1;
  return [d1, d2];
}

// Helper: Get available moves from dice (doubles give 4 moves)
function getMovesFromDice(dice: number[]): number[] {
  if (dice[0] === dice[1]) {
    return [dice[0], dice[0], dice[0], dice[0]];
  }
  return [...dice];
}

// Helper: Check if player can bear off (all checkers in home board)
function canBearOff(board: number[], bar: { player1: number; player2: number }, player: 1 | 2): boolean {
  const barCount = player === 1 ? bar.player1 : bar.player2;
  if (barCount > 0) return false;
  
  if (player === 1) {
    // Player 1's home board is points 19-24 (indices 18-23)
    for (let i = 0; i < 18; i++) {
      if (board[i] > 0) return false;
    }
    return true;
  } else {
    // Player 2's home board is points 1-6 (indices 0-5)
    for (let i = 6; i < 24; i++) {
      if (board[i] < 0) return false;
    }
    return true;
  }
}

// Helper: Get furthest checker from bearing off point
function getFurthestChecker(board: number[], player: 1 | 2): number {
  if (player === 1) {
    // Player 1 bears off from high to low, so furthest is lowest index with checker
    for (let i = 0; i < 24; i++) {
      if (board[i] > 0) return i;
    }
  } else {
    // Player 2 bears off from low to high, so furthest is highest index with checker
    for (let i = 23; i >= 0; i--) {
      if (board[i] < 0) return i;
    }
  }
  return -1;
}

// Helper: Check if a move is valid
function isValidMove(
  board: number[],
  bar: { player1: number; player2: number },
  borneOff: { player1: number; player2: number },
  from: number | 'bar',
  to: number | 'off',
  dieValue: number,
  player: 1 | 2
): boolean {
  const playerSign = player === 1 ? 1 : -1;
  const barCount = player === 1 ? bar.player1 : bar.player2;
  
  // If player has checkers on bar, must enter them first
  if (barCount > 0 && from !== 'bar') {
    return false;
  }
  
  // Moving from bar
  if (from === 'bar') {
    if (barCount === 0) return false;
    
    // Player 1 enters opponent's home (indices 0-5), Player 2 enters opponent's home (indices 18-23)
    const entryPoint = player === 1 ? dieValue - 1 : 24 - dieValue;
    
    // Check if entry point is blocked (2+ opponent checkers)
    if (board[entryPoint] * playerSign < -1) {
      return false;
    }
    return to === entryPoint;
  }
  
  // Verify 'from' has player's checker
  if (typeof from === 'number' && board[from] * playerSign <= 0) {
    return false;
  }
  
  // Calculate destination
  let dest: number;
  if (player === 1) {
    dest = from as number + dieValue; // Player 1 moves towards higher indices
  } else {
    dest = from as number - dieValue; // Player 2 moves towards lower indices
  }
  
  // Bearing off
  if (to === 'off') {
    if (!canBearOff(board, bar, player)) {
      return false;
    }
    
    if (player === 1) {
      // Player 1 bears off when moving past index 23
      if (dest === 24) return true; // Exact roll
      if (dest > 24) {
        // Can only bear off with higher roll if no checkers further back
        const furthest = getFurthestChecker(board, player);
        return furthest >= (from as number);
      }
      return false;
    } else {
      // Player 2 bears off when moving past index 0 (to negative)
      if (dest === -1) return true; // Exact roll
      if (dest < -1) {
        // Can only bear off with higher roll if no checkers further back
        const furthest = getFurthestChecker(board, player);
        return furthest <= (from as number);
      }
      return false;
    }
  }
  
  // Normal move - check destination is valid
  if (dest < 0 || dest > 23) {
    return false;
  }
  
  // Check destination isn't blocked by opponent (2+ opponent checkers)
  if (board[dest] * playerSign < -1) {
    return false;
  }
  
  return to === dest;
}

// Helper: Execute a move
function executeMove(
  board: number[],
  bar: { player1: number; player2: number },
  borneOff: { player1: number; player2: number },
  from: number | 'bar',
  to: number | 'off',
  player: 1 | 2
): { board: number[]; bar: typeof bar; borneOff: typeof borneOff } {
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
      // Hit! Send opponent to bar
      newBoard[to] = 0;
      if (player === 1) newBar.player2++;
      else newBar.player1++;
    }
    newBoard[to] += playerSign;
  }
  
  return { board: newBoard, bar: newBar, borneOff: newBorneOff };
}

// Helper: Check if any valid moves exist
function hasValidMoves(
  board: number[],
  bar: { player1: number; player2: number },
  borneOff: { player1: number; player2: number },
  movesLeft: number[],
  player: 1 | 2
): boolean {
  if (movesLeft.length === 0) return false;
  
  const playerSign = player === 1 ? 1 : -1;
  const barCount = player === 1 ? bar.player1 : bar.player2;
  
  for (const die of movesLeft) {
    // If on bar, check bar entry
    if (barCount > 0) {
      // Player 1 enters opponent's home (indices 0-5), Player 2 enters opponent's home (indices 18-23)
      const entryPoint = player === 1 ? die - 1 : 24 - die;
      if (board[entryPoint] * playerSign >= -1) {
        return true;
      }
    } else {
      // Check all points for valid moves
      for (let i = 0; i < 24; i++) {
        if (board[i] * playerSign > 0) {
          // Check normal move
          const dest = player === 1 ? i + die : i - die;
          if (dest >= 0 && dest <= 23 && board[dest] * playerSign >= -1) {
            return true;
          }
          
          // Check bearing off
          if (canBearOff(board, bar, player)) {
            if (player === 1 && i >= 18 && i + die >= 24) {
              if (i + die === 24 || getFurthestChecker(board, player) >= i) {
                return true;
              }
            }
            if (player === 2 && i <= 5 && i - die <= -1) {
              if (i - die === -1 || getFurthestChecker(board, player) <= i) {
                return true;
              }
            }
          }
        }
      }
    }
  }
  
  return false;
}

// Helper: Check for winner
function checkWinner(borneOff: { player1: number; player2: number }): number | null {
  if (borneOff.player1 === 15) return 1;
  if (borneOff.player2 === 15) return 2;
  return null;
}

export async function POST(request: Request) {
  const { roomCode, action, player, from, to, dieValue } = await request.json();

  const { data: game, error } = await supabase
    .from('backgammon_games')
    .select('*')
    .eq('room_code', roomCode)
    .single();

  if (error || !game) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  }

  const gameState = game as GameState;

  if (gameState.current_turn !== player) {
    return NextResponse.json({ error: 'Not your turn' }, { status: 400 });
  }

  if (gameState.winner !== null) {
    return NextResponse.json({ error: 'Game is over' }, { status: 400 });
  }

  // Handle dice roll
  if (action === 'roll') {
    if (gameState.dice !== null && gameState.moves_left && gameState.moves_left.length > 0) {
      return NextResponse.json({ error: 'Already rolled - make your moves' }, { status: 400 });
    }

    const dice = rollDice();
    const movesLeft = getMovesFromDice(dice);

    // Check if player can make any moves
    const canMove = hasValidMoves(gameState.board, gameState.bar, gameState.borne_off, movesLeft, player);

    let updateData: Partial<GameState>;
    
    if (!canMove) {
      // No valid moves - pass turn to opponent
      updateData = {
        dice: dice,
        moves_left: [],
        current_turn: player === 1 ? 2 : 1,
      };
    } else {
      updateData = {
        dice: dice,
        moves_left: movesLeft,
      };
    }

    const { data: updated, error: updateError } = await supabase
      .from('backgammon_games')
      .update(updateData)
      .eq('room_code', roomCode)
      .select();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ game: updated[0], noMoves: !canMove });
  }

  // Handle move
  if (action === 'move') {
    if (!gameState.dice || !gameState.moves_left || gameState.moves_left.length === 0) {
      return NextResponse.json({ error: 'Roll dice first' }, { status: 400 });
    }

    // Validate move
    if (!isValidMove(gameState.board, gameState.bar, gameState.borne_off, from, to, dieValue, player)) {
      return NextResponse.json({ error: 'Invalid move' }, { status: 400 });
    }

    // Check if the die value is available
    const dieIndex = gameState.moves_left.indexOf(dieValue);
    if (dieIndex === -1) {
      return NextResponse.json({ error: 'Die value not available' }, { status: 400 });
    }

    // Execute move
    const { board: newBoard, bar: newBar, borneOff: newBorneOff } = executeMove(
      gameState.board,
      gameState.bar,
      gameState.borne_off,
      from,
      to,
      player
    );

    // Remove used die
    const newMovesLeft = [...gameState.moves_left];
    newMovesLeft.splice(dieIndex, 1);

    // Check for winner
    const winner = checkWinner(newBorneOff);

    // Keep moves_left as-is - player must manually end turn
    const updateData: Partial<GameState> = {
      board: newBoard,
      bar: newBar,
      borne_off: newBorneOff,
      moves_left: newMovesLeft,
      winner: winner,
    };

    const { data: updated, error: updateError } = await supabase
      .from('backgammon_games')
      .update(updateData)
      .eq('room_code', roomCode)
      .select();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ game: updated[0] });
  }

  // Handle end turn (forfeit remaining moves)
  if (action === 'endTurn') {
    const updateData: Partial<GameState> = {
      current_turn: player === 1 ? 2 : 1,
      dice: null,
      moves_left: [],
    };

    const { data: updated, error: updateError } = await supabase
      .from('backgammon_games')
      .update(updateData)
      .eq('room_code', roomCode)
      .select();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ game: updated[0] });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

