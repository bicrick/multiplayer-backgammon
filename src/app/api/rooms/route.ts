import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Initial backgammon board setup
// Positive numbers = Player 1 (white), Negative = Player 2 (brown)
// Index 0-23 are the 24 points
// Standard backgammon starting position:
// Player 1 (white) moves from point 24 -> 1 (bearoff at 0)
// Player 2 (brown) moves from point 1 -> 24 (bearoff at 25)
function getInitialBoard(): number[] {
  const board = Array(24).fill(0);
  
  // Player 1 (positive/white) starting positions
  board[0] = 2;   // Point 1: 2 white checkers
  board[11] = 5;  // Point 12: 5 white checkers
  board[16] = 3;  // Point 17: 3 white checkers
  board[18] = 5;  // Point 19: 5 white checkers
  
  // Player 2 (negative/brown) starting positions
  board[23] = -2;  // Point 24: 2 brown checkers
  board[12] = -5;  // Point 13: 5 brown checkers
  board[7] = -3;   // Point 8: 3 brown checkers
  board[5] = -5;   // Point 6: 5 brown checkers
  
  return board;
}

export async function POST(request: Request) {
  const { action, username, roomCode, nextStarter } = await request.json();

  if (action === 'create') {
    const roomCodeGenerated = uuidv4().slice(0, 6).toUpperCase();
    const initialBoard = getInitialBoard();
    
    const { data, error } = await supabase
      .from('backgammon_games')
      .insert([{
        room_code: roomCodeGenerated,
        player1_username: username,
        board: initialBoard,
        bar: { player1: 0, player2: 0 },
        borne_off: { player1: 0, player2: 0 },
        dice: null,
        moves_left: null,
        current_turn: 1,
        winner: null
      }])
      .select();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ roomCode: roomCodeGenerated, game: data[0] });
  }

  if (action === 'join') {
    const { data, error } = await supabase
      .from('backgammon_games')
      .select('*')
      .eq('room_code', roomCode)
      .single();

    if (error || !data) return NextResponse.json({ error: 'Room not found' }, { status: 404 });

    if (data.player2_username) return NextResponse.json({ error: 'Room full' }, { status: 400 });

    const { data: updated, error: updateError } = await supabase
      .from('backgammon_games')
      .update({ player2_username: username })
      .eq('room_code', roomCode)
      .select();

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    return NextResponse.json({ game: updated[0] });
  }

  if (action === 'reset') {
    const { data, error } = await supabase
      .from('backgammon_games')
      .select('*')
      .eq('room_code', roomCode)
      .single();

    if (error || !data) return NextResponse.json({ error: 'Room not found' }, { status: 404 });

    const initialBoard = getInitialBoard();
    const newStartingPlayer = nextStarter || 1;
    
    const { data: updated, error: updateError } = await supabase
      .from('backgammon_games')
      .update({ 
        board: initialBoard,
        bar: { player1: 0, player2: 0 },
        borne_off: { player1: 0, player2: 0 },
        dice: null,
        moves_left: null,
        current_turn: newStartingPlayer,
        winner: null
      })
      .eq('room_code', roomCode)
      .select();

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    return NextResponse.json({ game: updated[0] });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

