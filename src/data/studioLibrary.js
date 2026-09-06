/*
  studioLibrary.js — the curated content pack behind the Video Studio.

  Everything the studio can generate without anyone pasting a move is in this
  file. There is deliberately no AI in the loop: a wrong knight square in a
  lesson for eight-year-olds is worse than a missing lesson, so the chess here
  is hand-written and checked, and `npm run studio:check` (scripts/check_studio_library.py)
  replays every line through python-chess before it can ship.

  ── The spec format ────────────────────────────────────────────────────────

  A studio job carries a `spec`, and a spec is a list of segments:

    { title, tagline, introSpeech, outroStamp, segments: [ … ] }

  Each segment is one board, played forward:

    {
      heading:       "Control the centre",   // section card; "" for none
      headingSpeech: "First principle…",     // spoken over that card
      startFen:      null,                   // null = the standard start
      frames: [ … ]
    }

  Each frame is one held picture of that board:

    san   the move to play, in SAN. Omit it to hold the current position.
    say   the narration. This is the whole contract with the renderer — the
          worker speaks this string and never writes one of its own, so what
          the admin reads in the browser is exactly what the video says.
    sq    squares to tint, e.g. ["d4","e4","d5","e5"]. Teaching squares that
          no move touches — the centre, a rook's file, a knight's eight jumps.
    ar    arrows, [["d4","d8"], ["d4","h4"]].
    cap   caption override. Defaults to the move number and SAN.
    hold  seconds. Only used when the frame has no narration, or as a floor.

  Openings and mate patterns use `moves` instead of `frames` — a plain SAN
  string the studio expands into one frame per move, narrating each one with
  the same rules the Python engine uses. That keeps the common case short.
*/

/* ────────────────────────────────────────────────────────────────────────
   1. MODULE TEMPLATES
   Keyed by the chapter they belong to. The admin picks a module, gets these
   segments pre-filled, edits any line of narration, and renders.
   ──────────────────────────────────────────────────────────────────────── */

export const MODULE_TEMPLATES = [
  {
    id: "basics",
    chapter: "Basics",
    title: "The Basics",
    tagline: "The board, the pieces, and how each one moves",
    introSpeech:
      "In this lesson we will learn the chess board, and how every piece moves.",
    outroStamp: "KEEP PRACTISING",
    segments: [
      {
        heading: "The board",
        headingSpeech: "First, the board itself.",
        startFen: null,
        frames: [
          {
            say: "The chess board has sixty four squares. Eight columns, called files, and eight rows, called ranks.",
            hold: 4,
          },
          {
            sq: ["d4", "e4", "d5", "e5"],
            say: "These four squares in the middle are the centre. Almost every good plan begins with them.",
            hold: 4,
          },
        ],
      },
      {
        heading: "The pawn",
        headingSpeech: "The pawn.",
        startFen: "4k3/4p3/8/8/8/8/3P4/4K3 w - - 0 1",
        frames: [
          {
            ar: [["d2", "d3"], ["d2", "d4"]],
            say: "A pawn walks straight forward, one square at a time. On its very first move it may take two.",
            hold: 4,
          },
          { san: "d4", say: "Two squares forward, on the first move." },
          { san: "e5", say: "Black answers with the same idea." },
          {
            ar: [["d4", "e5"]],
            say: "But a pawn does not capture straight ahead. It captures one square diagonally.",
            hold: 4,
          },
          { san: "dxe5", say: "Pawn takes E five." },
        ],
      },
      {
        heading: "The rook",
        headingSpeech: "The rook.",
        startFen: "4k3/8/8/8/3R4/8/8/4K3 w - - 0 1",
        frames: [
          {
            sq: ["d1", "d2", "d3", "d5", "d6", "d7", "d8",
                 "a4", "b4", "c4", "e4", "f4", "g4", "h4"],
            say: "The rook moves in straight lines. Up and down its file, left and right along its rank, as far as it likes.",
            hold: 5,
          },
          { san: "Rd7", say: "Rook to D seven." },
          { san: "Kf8", say: "The king steps aside." },
          { san: "Rh7", say: "And the rook slides all the way across the seventh rank." },
        ],
      },
      {
        heading: "The bishop",
        headingSpeech: "The bishop.",
        startFen: "4k3/8/8/8/3B4/8/8/4K3 w - - 0 1",
        frames: [
          {
            sq: ["c3", "b2", "a1", "e5", "f6", "g7", "h8",
                 "c5", "b6", "a7", "e3", "f2", "g1"],
            say: "The bishop moves diagonally. Notice something important. It starts on a dark square, and it can never leave the dark squares.",
            hold: 5,
          },
          { san: "Bg7", say: "Bishop to G seven." },
          { san: "Kd7", say: "The king walks over." },
          { san: "Ba1", say: "And back down the long diagonal, corner to corner." },
        ],
      },
      {
        heading: "The knight",
        headingSpeech: "The knight.",
        startFen: "4k3/8/8/8/3N4/8/8/4K3 w - - 0 1",
        frames: [
          {
            sq: ["b3", "b5", "c2", "c6", "e2", "e6", "f3", "f5"],
            say: "The knight moves in an L shape. Two squares one way, then one square across. From the middle it has eight choices.",
            hold: 5,
          },
          {
            say: "The knight is the only piece that jumps. Nothing blocks it, not even your own pieces.",
            hold: 4,
          },
          { san: "Nc6", say: "Knight to C six." },
          { san: "Kf7", say: "The king moves." },
          { san: "Ne5+", say: "Knight to E five, check." },
        ],
      },
      {
        heading: "The queen",
        headingSpeech: "The queen.",
        startFen: "4k3/8/8/8/3Q4/8/8/4K3 w - - 0 1",
        frames: [
          {
            sq: ["d1", "d5", "d8", "a4", "h4", "a1", "h8", "a7", "g1"],
            say: "The queen is the rook and the bishop together. Straight lines and diagonals, as far as she likes. She is the strongest piece on the board.",
            hold: 5,
          },
          { san: "Qh4", say: "Queen slides across the fourth rank." },
          { san: "Kd7", say: "The king steps out." },
          { san: "Qd8+", say: "And back along the diagonal, check." },
        ],
      },
      {
        heading: "The king and castling",
        headingSpeech: "The king, and castling.",
        startFen: "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1",
        frames: [
          {
            say: "The king moves one square in any direction. He is slow, but if he is lost, the game is lost.",
            hold: 4,
          },
          {
            say: "Once in the game, the king may make a special move with a rook. It is called castling.",
            hold: 4,
          },
          { san: "O-O", say: "King castles kingside. The king hides in the corner, and the rook comes to the middle." },
          { san: "O-O-O", say: "Black castles queenside, on the other wing." },
        ],
      },
      {
        heading: "Check and checkmate",
        headingSpeech: "Check, and checkmate.",
        startFen: "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1",
        frames: [
          {
            say: "When a king is attacked, that is check. He must get out of it immediately.",
            hold: 4,
          },
          {
            sq: ["f8", "h8", "f7", "g7", "h7"],
            say: "Look at the black king. His own pawns block every escape in front of him.",
            hold: 4,
          },
          { san: "Ra8#", say: "Rook to A eight. Checkmate. The king is attacked, and there is nowhere to go. That is the end of the game." },
        ],
      },
    ],
  },

  {
    id: "opening-principles",
    chapter: "Opening Principles",
    title: "Opening Principles",
    tagline: "The first ten moves, and the rules behind them",
    introSpeech:
      "In this lesson we will learn the opening principles. The handful of rules that decide the first ten moves.",
    outroStamp: "NOW GO PLAY",
    segments: [
      {
        heading: "Control the centre",
        headingSpeech: "First principle. Control the centre.",
        startFen: null,
        frames: [
          {
            sq: ["d4", "e4", "d5", "e5"],
            say: "A piece in the centre reaches more squares than a piece on the edge. So the first fight is always for these four squares.",
            hold: 5,
          },
          { san: "e4", say: "Pawn to E four. It takes the centre, and it opens lines for the bishop and the queen." },
          { san: "e5", say: "Black claims his share of the centre." },
        ],
      },
      {
        heading: "Develop your pieces",
        headingSpeech: "Second principle. Bring your pieces out.",
        startFen: null,
        frames: [
          { san: "e4", say: "Pawn to E four." },
          { san: "e5", say: "Pawn to E five." },
          { san: "Nf3", say: "Knight to F three. Knights before bishops, because a knight on F three is almost always right." },
          { san: "Nc6", say: "Knight to C six, defending the pawn." },
          { san: "Bc4", say: "Bishop to C four, pointing at the weakest square in Black's camp." },
          {
            san: "Bc5",
            sq: ["f3", "c4", "c6", "c5"],
            say: "Bishop to C five. Four pieces are out. Nobody has moved the same piece twice.",
          },
        ],
      },
      {
        heading: "Castle early",
        headingSpeech: "Third principle. Castle early.",
        startFen: "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1",
        frames: [
          {
            say: "The king is still sitting in the middle, where every open line will eventually point at him.",
            hold: 4,
          },
          { san: "O-O", say: "Castles. The king is tucked away, and the rook joins the game. Do this in the first ten moves, almost every game." },
          { san: "Nf6", say: "Black develops and prepares to castle too." },
        ],
      },
      {
        heading: "Do not move one piece twice",
        headingSpeech: "Fourth principle. Do not move the same piece twice in the opening.",
        startFen: null,
        frames: [
          { san: "e4", say: "Pawn to E four." },
          { san: "e5", say: "Pawn to E five." },
          { san: "Nf3", say: "Knight to F three, attacking the pawn." },
          { san: "Nc6", say: "Defended." },
          { san: "Ng5", say: "Now watch a mistake. The knight moves a second time, chasing nothing." },
          {
            san: "Nf6",
            say: "Black brings out a new piece instead. He has two pieces developed. White has one, that has moved twice. That is a whole move given away.",
          },
        ],
      },
      {
        heading: "Do not bring the queen out early",
        headingSpeech: "Fifth principle. Keep the queen at home for now.",
        startFen: null,
        frames: [
          { san: "e4", say: "Pawn to E four." },
          { san: "e5", say: "Pawn to E five." },
          { san: "Bc4", say: "Bishop to C four." },
          { san: "Nc6", say: "Knight to C six." },
          { san: "Qh5", say: "Queen to H five. This threatens checkmate, and against a beginner it sometimes works." },
          { san: "Nf6", say: "But Black defends with a developing move, and now the queen is the one in trouble." },
          {
            say: "Every time Black attacks her, she must run, and every time she runs, Black brings out another piece. Develop first. The queen comes later.",
            hold: 5,
          },
        ],
      },
      {
        heading: "Connect your rooks",
        headingSpeech: "And finally. Connect the rooks.",
        startFen: "r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/2NPBN2/PPPQ1PPP/R4RK1 w - - 0 1",
        frames: [
          {
            sq: ["b1", "c1", "d1", "e1"],
            ar: [["a1", "f1"]],
            say: "Both bishops are out, both knights are out, the king has castled and the queen has stepped off the back rank. Now the two rooks can see each other.",
            hold: 6,
          },
          {
            say: "That is the signal that the opening is finished. Every piece is doing something, nothing is hanging, and now you can start making a plan.",
            hold: 5,
          },
        ],
      },
    ],
  },

  {
    id: "positional-play",
    chapter: "Positional Play",
    title: "Positional Play",
    tagline: "Files, squares and pawns — the quiet part of chess",
    introSpeech:
      "In this lesson we will learn positional play. Not tactics, but the slow advantages that win games.",
    outroStamp: "THINK IN PLANS",
    segments: [
      {
        heading: "Rooks belong on open files",
        headingSpeech: "Rooks belong on open files.",
        startFen: "3r2k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1",
        frames: [
          {
            sq: ["d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8"],
            ar: [["d1", "d8"]],
            say: "No pawn stands on the D file. That makes it an open file, and an open file is a road for a rook.",
            hold: 5,
          },
          { san: "Rd7", say: "Rook to the seventh rank, where it attacks pawns from behind. This is the square rooks dream about." },
        ],
      },
      {
        heading: "The outpost",
        headingSpeech: "The outpost.",
        startFen: "4k3/pp3ppp/8/4N3/3P4/8/PP3PPP/4K3 w - - 0 1",
        frames: [
          {
            sq: ["e5", "d4"],
            say: "The knight sits on E five, defended by its own pawn. Look for a black pawn that could chase it away. There is no D pawn and no F pawn. There never will be.",
            hold: 6,
          },
          {
            sq: ["d6", "d7", "f6", "f7", "c6", "g6"],
            say: "A piece that cannot be chased off a strong square is called an outpost. Put a knight on one and it is worth more than a bishop.",
            hold: 5,
          },
        ],
      },
      {
        heading: "Pawn structure",
        headingSpeech: "Pawn structure. Three shapes worth knowing.",
        startFen: "4k3/pp3ppp/8/3P4/8/8/PP3PPP/4K3 w - - 0 1",
        frames: [
          {
            sq: ["c4", "c5", "c6", "e4", "e5", "e6"],
            say: "This pawn on D five has no friend on either side. It is an isolated pawn. It can never be defended by another pawn, so a piece must babysit it forever.",
            hold: 6,
          },
        ],
      },
      {
        heading: "Doubled pawns",
        headingSpeech: "Doubled pawns.",
        startFen: "4k3/pppp1ppp/8/8/8/5P2/PPPP1P1P/4K3 w - - 0 1",
        frames: [
          {
            sq: ["f2", "f3"],
            say: "Two pawns on the same file are doubled. They cannot defend each other, and together they cover fewer squares than two pawns side by side would.",
            hold: 6,
          },
        ],
      },
      {
        heading: "The passed pawn",
        headingSpeech: "And the one you want. The passed pawn.",
        startFen: "4k3/8/8/3P4/8/8/8/4K3 w - - 0 1",
        frames: [
          {
            sq: ["d6", "d7", "d8", "c6", "c7", "e6", "e7"],
            ar: [["d5", "d8"]],
            say: "No black pawn can stop this one, and none can capture it on the way. It is a passed pawn, and in the endgame it decides the game.",
            hold: 6,
          },
          { san: "d6", say: "Every step forward, the defender has one more problem." },
        ],
      },
      {
        heading: "Good bishop, bad bishop",
        headingSpeech: "Good bishop, and bad bishop.",
        startFen: "4k3/8/8/3p4/2P1P3/3B4/8/4K3 w - - 0 1",
        frames: [
          {
            sq: ["c4", "e4", "d3"],
            say: "The bishop travels on light squares. Its own pawns are standing on light squares too, right in its way. That is a bad bishop.",
            hold: 6,
          },
          {
            say: "Keep your pawns on the opposite colour to your bishop, and the same bishop becomes a good one. Same piece, different structure.",
            hold: 5,
          },
        ],
      },
    ],
  },

  {
    id: "calculation",
    chapter: "Calculation and Visualization",
    title: "Calculation and Visualization",
    tagline: "How to look before you leap",
    introSpeech:
      "In this lesson we will learn how to calculate. How to see a move before you play it.",
    outroStamp: "LOOK FIRST",
    segments: [
      {
        heading: "Checks, captures, threats",
        headingSpeech: "The order to look in. Checks, captures, threats.",
        startFen: "2q3k1/5ppp/8/3N4/8/8/5PPP/6K1 w - - 0 1",
        frames: [
          {
            say: "Before anything else, look at every check, every capture, and every threat. In that order. Most missed wins are checks nobody looked at.",
            hold: 6,
          },
          {
            sq: ["e7", "c7", "b6", "b4", "c3", "e3", "f4", "f6"],
            say: "Where can this knight give check? Only one square. E seven.",
            hold: 5,
          },
          { san: "Ne7+", say: "Knight to E seven, check. And look what else it attacks." },
          {
            sq: ["c8", "g8"],
            say: "The king, and the queen, at the same time. That is a fork. The king must move, and the queen is lost.",
            hold: 5,
          },
          { san: "Kh8", say: "The king steps into the corner." },
          { san: "Nxc8", say: "Knight takes the queen. All from one check." },
        ],
      },
      {
        heading: "Count before you capture",
        headingSpeech: "Count before you capture.",
        startFen: "4k3/8/8/8/8/4n3/8/4R1K1 w - - 0 1",
        frames: [
          {
            sq: ["e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8"],
            ar: [["e1", "e8"]],
            say: "The rook and the black king are on the same file, with only the knight in between. The knight cannot move at all. Moving it would leave its own king in check.",
            hold: 6,
          },
          {
            say: "That is a pin. A pinned piece is not really defending anything, so before you calculate, always ask which pieces are actually free to move.",
            hold: 6,
          },
        ],
      },
      {
        heading: "Visualise one move further",
        headingSpeech: "Visualise one move further than feels comfortable.",
        startFen: "7r/6k1/8/8/8/8/8/2B3K1 w - - 0 1",
        frames: [
          {
            say: "White is a rook down. Find the move. Look for checks first.",
            hold: 5,
          },
          { san: "Bb2+", say: "Bishop to B two, check. Now hold the picture in your head. Where can the king go, and what happens after that?" },
          { san: "Kf7", say: "The king must step off the diagonal, whichever way he goes." },
          {
            san: "Bxh8",
            say: "And the rook behind him falls. Lining up two pieces and hitting the front one is called a skewer. Seeing it needs only one more move of imagination.",
          },
        ],
      },
      {
        heading: "Stop only when it is quiet",
        headingSpeech: "And a warning. Stop calculating only when the position is quiet.",
        startFen: null,
        frames: [
          {
            say: "Never stop in the middle of an exchange. Calculate until nothing is hanging, nobody is in check, and nothing is attacked. Only then can you judge who is better.",
            hold: 7,
          },
        ],
      },
    ],
  },
];

/* ────────────────────────────────────────────────────────────────────────
   2. TOPIC LIBRARY
   What "type a name and get a video" resolves against. Openings and mates
   give a `moves` string and let the studio narrate move by move; lessons
   that teach a shape give explicit frames instead.
   ──────────────────────────────────────────────────────────────────────── */

/** Openings. `moves` is the main line; the studio narrates each move and the
 *  `idea` becomes the closing line of the video. */
export const OPENINGS = [
  { id: "italian-game",      name: "Italian Game",           eco: "C50", moves: "1. e4 e5 2. Nf3 Nc6 3. Bc4",
    idea: "The bishop aims at F seven, the weakest square in Black's position, and White is ready to castle." },
  { id: "ruy-lopez",         name: "Ruy Lopez",              eco: "C60", moves: "1. e4 e5 2. Nf3 Nc6 3. Bb5",
    idea: "White pressures the knight that defends E five. It is the oldest opening still played at the top level." },
  { id: "scotch-game",       name: "Scotch Game",            eco: "C45", moves: "1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4",
    idea: "White opens the centre immediately instead of building slowly. Sharp, and easy to learn." },
  { id: "four-knights",      name: "Four Knights Game",      eco: "C47", moves: "1. e4 e5 2. Nf3 Nc6 3. Nc3 Nf6",
    idea: "Both sides develop naturally and symmetrically. A very safe way to reach a playable middlegame." },
  { id: "vienna-game",       name: "Vienna Game",            eco: "C25", moves: "1. e4 e5 2. Nc3 Nf6 3. f4",
    idea: "White develops first and then strikes with the F pawn. A club player's weapon." },
  { id: "petrov-defence",    name: "Petrov Defence",         eco: "C42", moves: "1. e4 e5 2. Nf3 Nf6",
    idea: "Black does not defend the pawn, he copies. A solid choice for players who like quiet positions." },
  { id: "kings-gambit",      name: "King's Gambit",          eco: "C30", moves: "1. e4 e5 2. f4 exf4 3. Nf3",
    idea: "White gives a pawn for the centre and a fast attack. Romantic chess, and still dangerous." },
  { id: "sicilian-defence",  name: "Sicilian Defence",       eco: "B20", moves: "1. e4 c5",
    idea: "Black answers on the wing instead of in the centre. The most popular reply to E four in the world." },
  { id: "sicilian-najdorf",  name: "Sicilian Najdorf",       eco: "B90", moves: "1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6",
    idea: "A six controls B five before Black decides where everything else goes. The sharpest opening in chess." },
  { id: "sicilian-dragon",   name: "Sicilian Dragon",        eco: "B70", moves: "1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 g6 6. Be3 Bg7",
    idea: "The bishop on G seven breathes fire down the long diagonal. Both sides attack the enemy king at once." },
  { id: "french-defence",    name: "French Defence",         eco: "C00", moves: "1. e4 e6 2. d4 d5",
    idea: "Black builds a wall and strikes at the centre. Solid, but the light squared bishop needs a plan." },
  { id: "caro-kann",         name: "Caro-Kann Defence",      eco: "B10", moves: "1. e4 c6 2. d4 d5",
    idea: "Like the French, but the bishop gets out before the pawn chain closes. Very hard to break down." },
  { id: "scandinavian",      name: "Scandinavian Defence",   eco: "B01", moves: "1. e4 d5 2. exd5 Qxd5 3. Nc3 Qa5",
    idea: "Black trades the centre pawn immediately. Easy to learn, and it avoids all of White's preparation." },
  { id: "pirc-defence",      name: "Pirc Defence",           eco: "B07", moves: "1. e4 d6 2. d4 Nf6 3. Nc3 g6 4. Nf3 Bg7",
    idea: "Black lets White build a big centre, then attacks it from a distance." },
  { id: "alekhine-defence",  name: "Alekhine Defence",       eco: "B02", moves: "1. e4 Nf6 2. e5 Nd5 3. d4 d6",
    idea: "Black invites the pawns forward so they become targets. Provocative, and great fun." },
  { id: "queens-gambit",     name: "Queen's Gambit",         eco: "D06", moves: "1. d4 d5 2. c4",
    idea: "White offers a pawn to pull Black's D pawn away from the centre. It is not really a gambit — the pawn comes back." },
  { id: "qgd",               name: "Queen's Gambit Declined", eco: "D30", moves: "1. d4 d5 2. c4 e6 3. Nc3 Nf6",
    idea: "Black keeps the centre and accepts a slightly passive bishop. The most respected defence to D four." },
  { id: "slav-defence",      name: "Slav Defence",           eco: "D10", moves: "1. d4 d5 2. c4 c6 3. Nf3 Nf6",
    idea: "Black supports D five with the C pawn, so the light squared bishop stays free." },
  { id: "london-system",     name: "London System",          eco: "D02", moves: "1. d4 d5 2. Nf3 Nf6 3. Bf4 e6 4. e3 c5 5. c3",
    idea: "The same setup against almost anything. Perfect if you would rather learn plans than variations." },
  { id: "kings-indian",      name: "King's Indian Defence",  eco: "E60", moves: "1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6",
    idea: "Black gives up the centre, castles, and then throws the kingside pawns at White's king." },
  { id: "nimzo-indian",      name: "Nimzo-Indian Defence",   eco: "E20", moves: "1. d4 Nf6 2. c4 e6 3. Nc3 Bb4",
    idea: "The bishop pins the knight and fights for E four without a single pawn in the centre." },
  { id: "grunfeld",          name: "Grünfeld Defence",       eco: "D80", moves: "1. d4 Nf6 2. c4 g6 3. Nc3 d5",
    idea: "Black strikes at the centre on move three and plays against White's big pawns from move one." },
  { id: "english-opening",   name: "English Opening",        eco: "A10", moves: "1. c4 e5 2. Nc3 Nf6 3. g3",
    idea: "A Sicilian with colours reversed, and an extra move. Flexible, and it avoids sharp theory." },
];

/** Tactical motifs. These teach a shape, so they carry explicit frames. */
export const TACTICS = [
  {
    id: "fork",
    name: "The Fork",
    tagline: "One piece, two targets",
    startFen: "2q3k1/5ppp/8/3N4/8/8/5PPP/6K1 w - - 0 1",
    frames: [
      { say: "A fork is one piece attacking two things at once. The knight is the best forker on the board, because nothing can block it.", hold: 6 },
      { sq: ["c8", "g8"], say: "Black's king and queen are both on the eighth rank. Find the square that hits them both.", hold: 5 },
      { san: "Ne7+", sq: ["c8", "g8"], say: "Knight to E seven, check. It attacks the king and the queen together." },
      { san: "Kh8", say: "Check must be answered first, so the king moves and the queen is left behind." },
      { san: "Nxc8", say: "Knight takes the queen. That is a fork." },
    ],
  },
  {
    id: "pin",
    name: "The Pin",
    tagline: "The piece that cannot move",
    startFen: "4k3/8/8/8/8/4n3/8/4R1K1 w - - 0 1",
    frames: [
      { sq: ["e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8"], ar: [["e1", "e8"]],
        say: "The rook, the knight, and the black king are all on the E file. If the knight moves, the king is in check.", hold: 6 },
      { say: "So the knight cannot move at all. That is an absolute pin, and it is the strictest rule in chess — not a suggestion, an illegality.", hold: 6 },
      { say: "A pinned piece defends nothing. Remember that before you count an exchange.", hold: 5 },
    ],
  },
  {
    id: "skewer",
    name: "The Skewer",
    tagline: "The pin, backwards",
    startFen: "7r/6k1/8/8/8/8/8/2B3K1 w - - 0 1",
    frames: [
      { say: "A skewer is a pin turned around. The valuable piece is in front, and when it moves, something is behind it.", hold: 6 },
      { san: "Bb2+", ar: [["b2", "h8"]], say: "Bishop to B two, check. Now the king and the rook are on the same diagonal." },
      { san: "Kf7", say: "The king must move out of check." },
      { san: "Bxh8", say: "And the bishop takes the rook. Whenever two pieces line up, look for the skewer." },
    ],
  },
  {
    id: "back-rank",
    name: "Back Rank Mate",
    tagline: "Trapped by your own pawns",
    startFen: "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1",
    frames: [
      { sq: ["f7", "g7", "h7"], say: "The black king has castled and never moved a pawn. Those three pawns are a wall — and the wall is on his own side.", hold: 6 },
      { sq: ["a8", "b8", "c8", "d8", "e8", "f8", "h8"], say: "The whole eighth rank is empty. A rook arriving there attacks the king, and there is no square to run to.", hold: 5 },
      { san: "Ra8#", say: "Rook to A eight. Checkmate. This is why strong players make a little escape square for the king." },
    ],
  },
  {
    id: "discovered-attack",
    name: "Discovered Attack",
    tagline: "Move one piece, attack with another",
    startFen: "4k3/8/8/8/8/4B3/8/4R1K1 w - - 0 1",
    frames: [
      { sq: ["e1", "e3", "e8"], ar: [["e1", "e8"]], say: "The rook is aiming at the black king, but its own bishop is standing in the way.", hold: 5 },
      { san: "Bb6", ar: [["e1", "e8"]], say: "Bishop steps aside, and the rook's check appears from nowhere. The bishop is free to go anywhere it likes while it does it." },
      { say: "That is a discovered attack. The piece that moves and the piece that attacks are two different pieces, which is exactly what makes it hard to see.", hold: 6 },
    ],
  },
];

/** How each piece moves — the "how does the rook move" request, answered. */
export const PIECE_LESSONS = [
  {
    id: "how-the-rook-moves", name: "How the Rook Moves", tagline: "Straight lines, any distance",
    startFen: "4k3/8/8/8/3R4/8/8/4K3 w - - 0 1",
    frames: [
      { sq: ["d1", "d2", "d3", "d5", "d6", "d7", "d8", "a4", "b4", "c4", "e4", "f4", "g4", "h4"],
        say: "The rook moves in straight lines. Along its file, and along its rank, as far as it likes — but it can never jump over anything.", hold: 6 },
      { san: "Rd7", say: "Rook to D seven." },
      { san: "Kf8", say: "The king steps aside." },
      { san: "Rh7", say: "And all the way across. Two rooks working together on an open file are one of the strongest things in chess." },
    ],
  },
  {
    id: "how-the-bishop-moves", name: "How the Bishop Moves", tagline: "One colour, forever",
    startFen: "4k3/8/8/8/3B4/8/8/4K3 w - - 0 1",
    frames: [
      { sq: ["c3", "b2", "a1", "e5", "f6", "g7", "h8", "c5", "b6", "a7", "e3", "f2", "g1"],
        say: "The bishop moves diagonally, as far as it likes. Look carefully at the squares it can reach. They are all the same colour.", hold: 6 },
      { say: "A bishop that starts on a dark square will be on a dark square for the entire game. That is why the two bishops together are worth more than twice one.", hold: 6 },
      { san: "Bg7", say: "Bishop to G seven." },
      { san: "Kd7", say: "The king walks over." },
      { san: "Ba1", say: "And back to the corner along the long diagonal." },
    ],
  },
  {
    id: "how-the-knight-moves", name: "How the Knight Moves", tagline: "The only piece that jumps",
    startFen: "4k3/8/8/8/3N4/8/8/4K3 w - - 0 1",
    frames: [
      { sq: ["b3", "b5", "c2", "c6", "e2", "e6", "f3", "f5"],
        say: "The knight moves in an L. Two squares in a straight line, then one square to the side. From the middle of the board it has eight choices.", hold: 6 },
      { say: "And the knight jumps. Pieces in the way do not matter, which is why a knight is the piece that escapes from a crowded position.", hold: 5 },
      { say: "One more thing worth knowing. A knight on the edge of the board loses half its squares. Knights belong in the centre.", hold: 5 },
      { san: "Nc6", say: "Knight to C six." },
      { san: "Kf7", say: "The king moves." },
      { san: "Ne5+", say: "Knight to E five, check." },
    ],
  },
  {
    id: "how-the-queen-moves", name: "How the Queen Moves", tagline: "Rook and bishop in one",
    startFen: "4k3/8/8/8/3Q4/8/8/4K3 w - - 0 1",
    frames: [
      { sq: ["d1", "d8", "a4", "h4", "a1", "h8", "a7", "g1"],
        say: "The queen is a rook and a bishop together. Straight lines and diagonals, as far as she likes. From the centre she touches twenty seven squares.", hold: 6 },
      { say: "She is worth about nine pawns, which is why bringing her out too early is a mistake. Everything attacks her, and she has to keep running.", hold: 6 },
      { san: "Qh4", say: "Queen slides across the rank." },
      { san: "Kd7", say: "The king steps out." },
      { san: "Qd8+", say: "And back along the diagonal, check." },
    ],
  },
  {
    id: "how-the-pawn-moves", name: "How the Pawn Moves", tagline: "Forward to move, diagonally to take",
    startFen: "4k3/4p3/8/8/8/8/3P4/4K3 w - - 0 1",
    frames: [
      { ar: [["d2", "d3"], ["d2", "d4"]],
        say: "A pawn moves straight forward, one square. On its very first move only, it may go two. And a pawn can never move backwards.", hold: 6 },
      { san: "d4", say: "Two squares, on the first move." },
      { san: "e5", say: "Black does the same." },
      { ar: [["d4", "e5"]], say: "Now the important part. A pawn does not capture the way it moves. It captures one square diagonally forward.", hold: 5 },
      { san: "dxe5", say: "Pawn takes E five." },
      { say: "And if a pawn ever reaches the far end of the board, it becomes any piece you choose. Almost always a queen.", hold: 5 },
    ],
  },
  {
    id: "castling", name: "Castling", tagline: "Two pieces, one move",
    startFen: "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1",
    frames: [
      { say: "Castling is the only move where two pieces move at once. The king goes two squares towards a rook, and the rook jumps over to the other side of him.", hold: 6 },
      { san: "O-O", say: "King castles kingside. Short castling." },
      { san: "O-O-O", say: "And Black castles queenside. Long castling." },
      { say: "Four rules. Neither piece may have moved before. The squares between them must be empty. You cannot castle out of check, and the king cannot pass through an attacked square.", hold: 8 },
    ],
  },
];

/** Checkmate patterns. Same PGNs the original generate_mate_videos.py shipped
 *  with, so anything rendered here matches what was already published. */
export const MATE_PATTERNS = [
  { id: "scholars-mate",  name: "Scholar's Mate",  tagline: "The four move trap every beginner meets",
    moves: "1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#",
    idea: "Defend with knight to F six, and the queen has nothing left to do." },
  { id: "fools-mate",     name: "Fool's Mate",     tagline: "The shortest checkmate in chess",
    moves: "1. f3 e5 2. g4 Qh4#",
    idea: "Two moves. This is what happens when you open the squares in front of your own king." },
  { id: "smothered-mate", name: "Smothered Mate",  tagline: "Mated by his own pieces",
    moves: "1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4 4. Nxe5 Qg5 5. Nxf7 Qxg2 6. Rf1 Qxe4+ 7. Be2 Nf3#",
    idea: "The king is boxed in entirely by his own men, and only a knight can reach him." },
  { id: "back-rank-mate", name: "Back Rank Mate",  tagline: "The Opera Game, Paris 1858",
    moves: "1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8#",
    idea: "Morphy against the Duke of Brunswick. Every piece Morphy owns is attacking, and he gives away all of them." },
  { id: "legals-mate",    name: "Legal's Mate",    tagline: "The queen sacrifice from 1750",
    moves: "1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5#",
    idea: "Three minor pieces deliver mate while the queen sits captured on D one." },
];

/** One flat list for the topic search box. */
export const TOPIC_INDEX = [
  ...PIECE_LESSONS.map((t) => ({ ...t, group: "Piece moves" })),
  ...TACTICS.map((t) => ({ ...t, group: "Tactics" })),
  ...MATE_PATTERNS.map((t) => ({ ...t, group: "Checkmate patterns" })),
  ...OPENINGS.map((t) => ({ ...t, group: "Openings", tagline: t.eco ? `${t.eco} · opening` : "Opening" })),
];

/** Chapter names the studio offers by default when a category has none yet. */
export const SUGGESTED_CHAPTERS = [
  "Basics",
  "Opening Principles",
  "Positional Play",
  "Calculation and Visualization",
  "Tactics",
  "Endgames",
  "Famous Games",
];
