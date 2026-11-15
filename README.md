# 🎲 Matrices Snakes & Ladders (Computing Mathematics Edition)

A web-based Snake and Ladders game where the player answers AI-generated Computing Mathematics (Matrices) questions to move. Built with **Vite + Phaser 3** for the game board, standard **HTML5/CSS3** for the rich interactive UI, and a **Node.js + Express** backend integrating Google Gemini and MySQL.

---

## 🌟 Key Features

1. **Phaser 3 Game Board**:
   - 10×10 boustrophedon (zig-zag) grid with tile 1 at bottom-left and tile 100 at top-left.
   - Snakes and ladders drawn cleanly with Phaser Graphics with distinct visual styles (amber/bronze ladders with rungs and drop shadows; serpentine crimson snakes with tapered bodies, eyes, and tongues).
   - Animated player token with bouncing hop tweens along tiles, ladder climb tweens, and snake drop animations.
   - Animated 2D/isometric dice tumbling and landing in Phaser.
   - Responsive canvas scaling with `Phaser.Scale.FIT` for seamless laptop and mobile gameplay.

2. **AI Question Generation with Gemini (No Question Bank)**:
   - Every question is generated **live** via the Google Gemini Developer API on the backend.
   - Strict course syllabus mapping for *CMATHS Topic 2: Matrices* (Topics 1–10).
   - Strict exclusion of out-of-syllabus topics (vectors, dot products, eigenvalues, Gaussian elimination, Cramer's rule, decompositions, matrices > 3×3).
   - Automatic topic rotation so the same topic never appears twice consecutively.
   - Pre-fetching the next question in the background during dice roll and token animation to hide network latency.
   - Automatic retry up to 2 times on API failure with friendly error state and "Retry Question" button.

3. **Independent Math Verification Guard (`mathVerify.js`)**:
   - AI arithmetic is never trusted blindly.
   - Recomputes exact answers using custom exact fraction arithmetic (`Fraction` class) for additions, subtractions, scalar multiples ($k A$, $2D - 3C$, $2I + C$), matrix multiplications ($A \times B$), transposes ($A^T$), determinants (2×2 and 3×3 cofactor expansion), inverses ($A^{-1} = \frac{1}{\det A} \text{adj} A$), and linear systems ($X = A^{-1} b$).
   - Rejects flawed AI responses and regenerates automatically.
   - Shuffles option order on the server so the correct answer is randomized.

4. **Biased Dice Mechanics**:
   - **Easy Mode**: 1 die.
   - **Hard Mode**: 2 dice (movement is the sum of both dice).
   - **Correct Answer**: 70% chance to roll in $\{4, 5, 6\}$ (30% chance for $\{1, 2, 3\}$).
   - **Wrong Answer**: 70% chance to roll in $\{1, 2, 3\}$ (30% chance for $\{4, 5, 6\}$).
   - **Bounce-Back Rule**: Exactly landing on 100 is required to win. Any overshoot bounces back by the excess (e.g. at 98 rolling 4 lands on $100 - 2 = 98$).

5. **MySQL Leaderboard**:
   - Stores game victories: `name`, `turns_taken`, `correct_answers`, `wrong_answers`, and `time_taken` (TIME).
   - Parameterized queries with server-side validation and sanitization.
   - Top 10 leaderboard ordered by fastest time first (`time_taken ASC`), then fewest turns (`turns_taken ASC`).

---

## 📁 Project Structure

```text
├── server/
│   ├── routes/
│   │   ├── questions.js       # Express routes for Gemini live question generation
│   │   └── leaderboard.js     # Express routes for leaderboard GET and POST
│   ├── scripts/
│   │   └── initDb.js          # CLI script to create cmathgames schema and matrices_snl table
│   ├── services/
│   │   ├── db.js              # MySQL connection pool and parameterized query helpers
│   │   ├── gemini.js          # Gemini API client, syllabus prompt, and option shuffler
│   │   └── mathVerify.js      # Exact fraction and matrix arithmetic verification engine
│   └── server.js              # Express server and production static server
├── src/
│   ├── game/
│   │   ├── boardLogic.js      # 10x10 coordinates, bounce-back, snakes/ladders lookups
│   │   ├── diceLogic.js       # Biased probability dice rolling function
│   │   ├── events.js          # Decoupled EventBus connecting Phaser and HTML UI
│   │   └── gameState.js       # Turn counters, timer, score, and state tracking
│   ├── phaser/
│   │   ├── BoardScene.js      # Phaser Scene orchestrating board, token, and dice
│   │   ├── boardDrawer.js     # Phaser Graphics rendering tiles, snakes, and ladders
│   │   ├── dice.js            # Animated dice roller component
│   │   ├── gameConfig.js      # Phaser.Game configuration with Phaser.Scale.FIT
│   │   └── token.js           # Animated player pawn with hop and climb/drop tweens
│   ├── styles/
│   │   └── main.css           # Modern dark UI, bracketed matrices, fractions, modals
│   ├── ui/
│   │   ├── htmlUI.js          # Start screen, question cards, HUD, and modals controller
│   │   └── matrixRenderer.js  # Bracketed matrix and stacked fraction HTML renderer
│   └── main.js                # App entrypoint initializing Phaser and HTML UI
├── test/
│   ├── db.test.js             # Unit tests for time formatting and database helpers
│   ├── gameLogic.test.js      # Unit tests for board layout, bounce-back, and biased dice
│   ├── geminiShuffler.test.js # Unit tests for option shuffler and answer integrity
│   └── mathVerify.test.js     # Unit tests for fractions, matrices, determinants, inverses
├── index.html                 # Main web page layout
├── vite.config.js             # Vite configuration with /api proxy and Terser code splitting
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

---

## 🛠️ Prerequisites

- **Node.js**: v20.0.0 LTS or newer (tested on Node v26).
- **npm**: v9 or newer.
- **MySQL Server**: MySQL 8.0+ running on `localhost:3306` (or configured host).
- **Gemini API Key**: From Google AI Studio.

---

## 🚀 Quick Start Guide

### 1. Clone & Install Dependencies

```bash
git clone <repo-url>
cd "Matrices SNL"
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` and fill in your Gemini API key and MySQL credentials:

```ini
# Gemini API Settings (Backend only - NEVER prefix with VITE_)
GEMINI_API_KEY=your_actual_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash

# Backend Server Port
PORT=3000

# MySQL Database Settings (Backend only - NEVER prefix with VITE_)
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=cmathgames
```

> ⚠️ **Security Note**: Never prefix `GEMINI_API_KEY` or database credentials with `VITE_`. Variables with `VITE_` are bundled into browser code by Vite. In this application, secrets are read exclusively on the Node.js backend.

### 3. Initialize the Database

Run the database initialization script to create the `cmathgames` schema and `matrices_snl` table:

```bash
npm run init-db
```

### 4. Run Unit Tests

Execute the 30 built-in unit tests verifying arithmetic accuracy, board logic, bounce-back mechanics, and dice probabilities:

```bash
npm test
```

### 5. Start Development Server

Run both Vite and the Express backend simultaneously using `concurrently`:

```bash
npm run dev
```

Open your browser at **`http://localhost:5173`**.
- Vite serves the frontend at `http://localhost:5173`.
- Calls to `/api/*` are automatically proxied to the Express backend at `http://localhost:3000`.

---

## 📦 Production Build & Deployment

To build minified production assets and serve them with Express:

```bash
# 1. Build optimized bundle with Terser (splits Phaser into its own chunk)
npm run build

# 2. Start the Express production server (serves the dist/ folder)
npm start
```

Open your browser at **`http://localhost:3000`**.

---

## 🎲 Game Rules & Board Reference

- **Board Size**: 100 tiles ($10 \times 10$). Tile 1 is at the bottom-left; Tile 100 is at the top-left.
- **Ladders (Go Up)**:
  - $4 \to 25$
  - $13 \to 46$
  - $27 \to 57$
  - $33 \to 49$
  - $42 \to 63$
  - $50 \to 69$
  - $62 \to 81$
  - $74 \to 92$
- **Snakes (Go Down)**:
  - $99 \to 41$
  - $95 \to 75$
  - $89 \to 53$
  - $70 \to 34$
  - $64 \to 60$
  - $56 \to 19$
  - $47 \to 26$
  - $16 \to 6$
- **Winning & Bounce-Back**:
  - Landing on exactly tile 100 wins the game.
  - If a roll exceeds 100, the token bounces back by the excess. For example, at tile 98, rolling a 4 moves 2 steps to 100 and bounces back 2 steps to 98.
- **Timer**:
  - Starts automatically when the first question is presented.
  - Stops when tile 100 is reached.
  - Stored in MySQL as `TIME` (`HH:MM:SS`) and displayed on the leaderboard as `MM:SS`.

---

## 🧪 Verification & Unit Testing

The test suite covers:
- **Exact Fraction Arithmetic**: Addition, subtraction, multiplication, division, zero-division guards, simplification via GCD.
- **Matrix Calculations**: $2 \times 2$ and $3 \times 3$ matrix multiplication, transposes, determinants, cofactors, adjugates, inverses, and solving $AX = b$.
- **Verification Guard**: Independent verification of answers, rejection of incorrect AI answers, rejection of out-of-syllabus topics (e.g. eigenvalues, Cramer's rule, dot products), and verification of 4 distinct choices.
- **Board Mechanics**: 0-based coordinate mapping, boustrophedon layout, bounce-back overshoots, and snake/ladder resolution.
- **Dice Probabilities**: Empirical validation of 70% bias toward $\{4, 5, 6\}$ for correct answers and 70% bias toward $\{1, 2, 3\}$ for incorrect answers.
