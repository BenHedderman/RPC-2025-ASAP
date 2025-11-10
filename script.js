/**
 * Rock Paper Scissors Tournament Application
 * Professional JavaScript implementation with modular design
 */

/**
 * Configuration object containing all application constants
 * @typedef {Object} Config
 * @property {string[]} VALID_MOVES - Valid move abbreviations
 * @property {Object.<string, string>} MOVE_MAPPING - Mapping from full names to abbreviations
 * @property {Object.<string, string>} EMOJI_MAP - Mapping from moves to emoji HTML
 * @property {number} DEFAULT_SPEED_MULTIPLIER - Default animation speed multiplier
 * @property {number} MIN_ANIMATION_DURATION - Minimum animation duration in seconds
 * @property {string} MATRIX_CHARS - Characters used for matrix rain effect
 * @property {string} API_BASE_URL - Base URL for Google Sheets API
 * @property {number} ANIMATION_DELAY - Delay between rounds in milliseconds
 * @property {number} MATCH_DELAY - Delay between matches in milliseconds
 */
const CONFIG = {
  VALID_MOVES: ['r', 'p', 's'],
  MOVE_MAPPING: {
    'rock': 'r',
    'paper': 'p',
    'scissors': 's'
  },
  EMOJI_MAP: {
    r: '<img src="./img/rpc-png.img/rock100.png" alt="Rock" />',
    p: '<img src="./img/rpc-png.img/paper100.png" alt="Paper" />',
    s: '<img src="./img/rpc-png.img/scissors100.png" alt="Scissors" />'
  },
  DEFAULT_SPEED_MULTIPLIER: 1,
  MIN_ANIMATION_DURATION: 0.3,
  MATRIX_CHARS: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*()_+-=[]{}|;:,.<>?",
  API_BASE_URL: 'https://docs.google.com/spreadsheets/d/',
  ANIMATION_DELAY: 300,
  MATCH_DELAY: 200
};

/**
 * Player class representing a tournament participant
 */
class Player {
  constructor(name, moves) {
    this.name = name;
    this.moves = moves;
    this.stats = {
      wins: 0,
      losses: 0,
      ties: 0,
      roundWins: 0,
      roundLosses: 0,
      roundTies: 0,
      opponents: []
    };
  }

  /**
   * Records a match result against an opponent
   * @param {string} opponentName - Name of the opponent
   * @param {string} result - 'Win', 'Loss', or 'Tie'
   * @param {number} roundWins - Rounds won in this match
   * @param {number} roundLosses - Rounds lost in this match
   * @param {number} roundTies - Rounds tied in this match
   */
  recordMatch(opponentName, result, roundWins, roundLosses, roundTies) {
    this.stats.opponents.push({
      vs: opponentName,
      result,
      roundWins,
      roundLosses,
      roundTies
    });

    switch (result) {
      case 'Win':
        this.stats.wins++;
        break;
      case 'Loss':
        this.stats.losses++;
        break;
      case 'Tie':
        this.stats.ties++;
        break;
    }

    this.stats.roundWins += roundWins;
    this.stats.roundLosses += roundLosses;
    this.stats.roundTies += roundTies;
  }
}

/**
 * Tournament class managing the entire tournament logic
 */
class Tournament {
  constructor() {
    this.players = [];
    this.speedMultiplier = CONFIG.DEFAULT_SPEED_MULTIPLIER;
    this.isRunning = false;
  }

  /**
   * Initializes the tournament with data from Google Sheets
   * @param {string} sheetUrl - URL of the Google Sheet
   * @param {string} sheetName - Name of the sheet tab
   * @param {Date|null} filterDateTime - Date and time to filter players (on or after this time)
   * @returns {Promise<void>}
   */
  async initialize(sheetUrl, sheetName, filterDateTime = null) {
    if (this.isRunning) return;

    try {
      this.isRunning = true;
      const data = await this.fetchSheetData(sheetUrl, sheetName);
      const filteredData = filterDateTime ? this.filterRowsByDateTime(data, filterDateTime) : data;
      this.players = this.parsePlayers(filteredData);
      this.validatePlayers();

      UI.showLoading(false);
      UI.updateLeaderboard(this.getLeaderboard());

      await this.runTournament();
      this.announceWinner();
    } catch (error) {
      UI.showError(error.message);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Fetches data from Google Sheets
   * @param {string} sheetUrl - URL of the Google Sheet
   * @param {string} sheetName - Name of the sheet tab
   * @returns {Promise<Array>} Parsed sheet data
   */
  async fetchSheetData(sheetUrl, sheetName) {
    const sheetIdMatch = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!sheetIdMatch) {
      throw new Error("Invalid Google Sheet URL format");
    }

    const sheetId = sheetIdMatch[1];
    const fetchUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;

    const response = await fetch(fetchUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch sheet: ${response.status}`);
    }

    const text = await response.text();
    const json = JSON.parse(text.substr(47).slice(0, -2));

    const rows = json.table.rows.map(row =>
      row.c.map(cell => (cell?.v || "").toString().trim().toLowerCase())
    );

    if (rows.length <= 1) {
      throw new Error("No data found in the sheet");
    }

    return rows.slice(1); // Skip header row
  }

  /**
   * Filters rows by date and time
   * @param {Array} rows - Sheet data rows
   * @param {Date} filterDateTime - Date and time to filter (on or after this time)
   * @returns {Array} Filtered rows
   */
  filterRowsByDateTime(rows, filterDateTime) {
    return rows.filter(row => {
      const timestampStr = row[0]?.trim(); // Timestamp is in the first column (index 0)
      if (!timestampStr) return false;

      try {
        const rowDateTime = parseTimestamp(timestampStr);
        return rowDateTime >= filterDateTime;
      } catch (error) {
        console.warn(`Skipping row due to invalid timestamp: ${timestampStr}`, error);
        return false;
      }
    });
  }

  /**
   * Parses player data from sheet rows
   * @param {Array} rows - Sheet data rows
   * @returns {Array<Player>} Array of Player instances
   */
  parsePlayers(rows) {
    return rows
      .map(row => {
        const name = row[1]?.trim() || "";
        const moves = row.slice(2).map(move => {
          const trimmed = move.trim();
          return CONFIG.MOVE_MAPPING[trimmed] || trimmed;
        }).filter(move => move);

        return name ? new Player(name, moves) : null;
      })
      .filter(player => player && player.moves.length > 0);
  }

  /**
   * Validates that there are enough players
   * @throws {Error} If validation fails
   */
  validatePlayers() {
    if (this.players.length < 2) {
      throw new Error("At least 2 players with moves are required");
    }
  }

  /**
   * Runs the tournament by simulating all matches
   * @returns {Promise<void>}
   */
  async runTournament() {
    const totalMatches = (this.players.length * (this.players.length - 1)) / 2;
    let currentMatch = 0;

    for (let i = 0; i < this.players.length; i++) {
      for (let j = i + 1; j < this.players.length; j++) {
        await this.playMatch(this.players[i], this.players[j]);
        UI.updateLeaderboard(this.getLeaderboard());
        currentMatch++;
        UI.updateProgress((currentMatch / totalMatches) * 100);
      }
    }
  }

  /**
   * Simulates a match between two players
   * @param {Player} player1 - First player
   * @param {Player} player2 - Second player
   * @returns {Promise<void>}
   */
  async playMatch(player1, player2) {
    UI.showMatchAnimation(`${player1.name} vs ${player2.name}`);

    let p1Wins = 0, p2Wins = 0, ties = 0;
    const rounds = Math.min(player1.moves.length, player2.moves.length);

    for (let round = 0; round < rounds; round++) {
      const move1 = player1.moves[round];
      const move2 = player2.moves[round];

      if (!move1 || !move2) continue;

      const result = this.determineWinner(move1, move2);
      let winner = null;

      if (result === 1) {
        p1Wins++;
        winner = player1.name;
      } else if (result === 2) {
        p2Wins++;
        winner = player2.name;
      } else {
        ties++;
      }

      UI.showRoundAnimation(player1.name, player2.name, move1, move2, winner);
      await this.delay(CONFIG.ANIMATION_DELAY / this.speedMultiplier);
    }

    const matchResult = this.getMatchResult(p1Wins, p2Wins);
    player1.recordMatch(player2.name, matchResult.player1Result, p1Wins, p2Wins, ties);
    player2.recordMatch(player1.name, matchResult.player2Result, p2Wins, p1Wins, ties);

    await this.delay(CONFIG.MATCH_DELAY / this.speedMultiplier);
  }

  /**
   * Determines the winner of a round
   * @param {string} move1 - Move of player 1
   * @param {string} move2 - Move of player 2
   * @returns {number} 1 if player1 wins, 2 if player2 wins, 0 for tie
   */
  determineWinner(move1, move2) {
    if (!CONFIG.VALID_MOVES.includes(move1) || !CONFIG.VALID_MOVES.includes(move2)) return 0;
    if (move1 === move2) return 0;

    const winConditions = {
      r: 's',
      p: 'r',
      s: 'p'
    };

    return winConditions[move1] === move2 ? 1 : 2;
  }

  /**
   * Gets the result of a match
   * @param {number} p1Wins - Wins for player 1
   * @param {number} p2Wins - Wins for player 2
   * @returns {Object} Match result object
   */
  getMatchResult(p1Wins, p2Wins) {
    if (p1Wins > p2Wins) {
      return { player1Result: 'Win', player2Result: 'Loss' };
    } else if (p2Wins > p1Wins) {
      return { player1Result: 'Loss', player2Result: 'Win' };
    } else {
      return { player1Result: 'Tie', player2Result: 'Tie' };
    }
  }

  /**
   * Gets the sorted leaderboard
   * @returns {Array} Sorted array of player stats
   */
  getLeaderboard() {
    return this.players
      .map(player => ({ name: player.name, ...player.stats }))
      .sort((a, b) => b.wins - a.wins || a.losses - b.losses || b.roundWins - a.roundWins);
  }

  /**
   * Announces the tournament winner
   */
  announceWinner() {
    const winner = this.getLeaderboard()[0];
    UI.showResult(`🏆 Champion: ${winner.name} 🏆`);
  }

  /**
   * Updates the animation speed multiplier
   * @param {number} multiplier - New speed multiplier
   */
  updateSpeed(multiplier) {
    this.speedMultiplier = multiplier;
    UI.updateSpeedLabel(multiplier);
    this.updateMatrixSpeed(multiplier);
  }

  /**
   * Updates matrix animation speed (if matrix is active)
   * @param {number} multiplier - Speed multiplier
   */
  updateMatrixSpeed(multiplier) {
    const chars = document.querySelectorAll(".matrix-char");
    chars.forEach(char => {
      const baseDuration = parseFloat(char.style.animationDuration) || 1;
      const newDuration = Math.max(baseDuration / multiplier, CONFIG.MIN_ANIMATION_DURATION);
      char.style.animationDuration = `${newDuration}s`;
    });
  }

  /**
   * Utility delay function
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise<void>}
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * UI class handling all user interface operations
 */
class UI {
  static elements = {
    sheetUrl: () => document.getElementById("sheetUrl"),
    sheetName: () => document.getElementById("sheetName"),
    sheetDate: () => document.getElementById("sheetDate"),
    sheetTime: () => document.getElementById("sheetTime"),
    loading: () => document.getElementById("loading"),
    progressBar: () => document.getElementById("progress-bar"),
    sheetData: () => document.getElementById("sheetData"),
    result: () => document.getElementById("result"),
    animation: () => document.getElementById("animation"),
    speedLabel: () => document.getElementById("speedLabel")
  };

  /**
   * Shows or hides loading indicator
   * @param {boolean} show - Whether to show loading
   */
  static showLoading(show) {
    this.elements.loading().style.display = show ? "block" : "none";
  }

  /**
   * Updates progress bar
   * @param {number} percentage - Progress percentage
   */
  static updateProgress(percentage) {
    this.elements.progressBar().style.width = `${percentage}%`;
  }

  /**
   * Shows error message
   * @param {string} message - Error message
   */
  static showError(message) {
    this.showLoading(false);
    this.elements.sheetData().innerHTML = `<div class="error">${message}. Ensure your sheet is public and the name is correct.</div>`;
  }

  /**
   * Updates the leaderboard display
   * @param {Array} leaderboard - Sorted leaderboard data
   */
  static updateLeaderboard(leaderboard) {
    const html = `
      <h3 style="text-align:center;">Live Leaderboard</h3>
      <table>
        <thead><tr><th>Player</th><th>Wins</th><th>Losses</th><th>Ties</th></tr></thead>
        <tbody>
          ${leaderboard.map(player => `
            <tr class="${player.wins === leaderboard[0].wins ? "highlight" : ""}">
              <td class="expandable" onclick="toggleDetails('${player.name}')">${player.name}</td>
              <td>${player.wins}</td>
              <td>${player.losses}</td>
              <td>${player.ties}</td>
            </tr>
            <tr id="details-${player.name}" class="hidden-row">
              <td colspan="4">
                <table>
                  <thead><tr><th>Round Wins</th><th>Round Losses</th><th>Round Ties</th></tr></thead>
                  <tbody><tr>
                    <td>${player.roundWins}</td>
                    <td>${player.roundLosses}</td>
                    <td>${player.roundTies}</td>
                  </tr></tbody>
                </table>
                <h4>Matches Played:</h4>
                <table>
                  <thead><tr><th>Opponent</th><th>Result</th></tr></thead>
                  <tbody>
                    ${player.opponents.map((opponent, index) => `
                      <tr>
                        <td>${opponent.vs}</td>
                        <td>
                          <div class="dropdown">
                            <span class="underline" onclick="toggleDropdown('${player.name}-${index}')">${opponent.result}</span>
                            <div id="dropdown-${player.name}-${index}" class="dropdown-content">
                              <a>Round Wins: ${opponent.roundWins}</a>
                              <a>Round Losses: ${opponent.roundLosses}</a>
                              <a>Round Ties: ${opponent.roundTies}</a>
                            </div>
                          </div>
                        </td>
                      </tr>
                    `).join("")}
                  </tbody>
                </table>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
    this.elements.sheetData().innerHTML = html;
  }

  /**
   * Shows match animation
   * @param {string} matchText - Text to display for the match
   */
  static showMatchAnimation(matchText) {
    this.elements.animation().textContent = matchText;
  }

  /**
   * Shows round animation
   * @param {string} p1Name - Player 1 name
   * @param {string} p2Name - Player 2 name
   * @param {string} move1 - Player 1 move
   * @param {string} move2 - Player 2 move
   * @param {string|null} winner - Winner name or null for tie
   */
  static showRoundAnimation(p1Name, p2Name, move1, move2, winner) {
    const p1Display = winner === p1Name ? `<span class="underline">${p1Name}</span>` : p1Name;
    const p2Display = winner === p2Name ? `<span class="underline">${p2Name}</span>` : p2Name;

    this.elements.animation().innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;gap:20px;flex-wrap:wrap;">
        <div>${p1Display}</div>
        <div>${CONFIG.EMOJI_MAP[move1]}</div>
        <div style="font-size:1.5rem;">vs</div>
        <div>${CONFIG.EMOJI_MAP[move2]}</div>
        <div>${p2Display}</div>
      </div>
    `;
  }

  /**
   * Shows final result
   * @param {string} resultText - Result text to display
   */
  static showResult(resultText) {
    this.elements.result().innerHTML = `<h2>${resultText}</h2>`;
  }

  /**
   * Updates speed label
   * @param {number} multiplier - Speed multiplier
   */
  static updateSpeedLabel(multiplier) {
    this.elements.speedLabel().textContent = `${multiplier.toFixed(1)}×`;
  }
}

/**
 * Parses time input to 24-hour format (HH:MM)
 * Accepts both 12-hour (e.g., "12:00 PM") and 24-hour (e.g., "14:00") formats
 * @param {string} timeStr - Time string to parse
 * @returns {string} Time in 24-hour HH:MM format
 */
function parseTime(timeStr) {
  const trimmed = timeStr.trim();

  // Check if it's 12-hour format (contains AM/PM)
  const twelveHourRegex = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i;
  const match = trimmed.match(twelveHourRegex);

  if (match) {
    let [_, hours, minutes, period] = match;
    hours = parseInt(hours, 10);
    minutes = parseInt(minutes, 10);

    if (period.toUpperCase() === 'PM' && hours !== 12) {
      hours += 12;
    } else if (period.toUpperCase() === 'AM' && hours === 12) {
      hours = 0;
    }

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  // Assume it's already 24-hour format (HH:MM)
  const twentyFourHourRegex = /^(\d{1,2}):(\d{2})$/;
  const match24 = trimmed.match(twentyFourHourRegex);

  if (match24) {
    let [_, hours, minutes] = match24;
    hours = parseInt(hours, 10);
    minutes = parseInt(minutes, 10);

    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
  }

  // Invalid format
  throw new Error(`Invalid time format: ${timeStr}. Use HH:MM or H:MM AM/PM.`);
}

/**
 * Parses timestamp from sheet format "month/day/year hr:min:sec" to Date object
 * @param {string} timestampStr - Timestamp string in "month/day/year hr:min:sec" format
 * @returns {Date} Parsed Date object
 */
function parseTimestamp(timestampStr) {
  const trimmed = timestampStr.trim();
  const timestampRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/;
  const match = trimmed.match(timestampRegex);

  if (!match) {
    throw new Error(`Invalid timestamp format: ${timestampStr}. Expected "month/day/year hr:min:sec".`);
  }

  const [_, month, day, year, hours, minutes, seconds] = match;
  const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10), parseInt(hours, 10), parseInt(minutes, 10), parseInt(seconds, 10));

  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date in timestamp: ${timestampStr}`);
  }

  return date;
}

// Global functions for UI interactions
function toggleDetails(name) {
  const row = document.getElementById(`details-${name}`);
  row.style.display = row.style.display === "table-row" ? "none" : "table-row";
}

function toggleDropdown(id) {
  const dropdown = document.getElementById(`dropdown-${id}`);
  dropdown.classList.toggle("show-dropdown");
}

// Matrix background effect (commented out as per user request)
// function createMatrixRain() {
//   const matrixBg = document.getElementById("matrix-bg");
//   for (let i = 0; i < 200; i++) {
//     const char = document.createElement("div");
//     char.className = "matrix-char";
//     char.textContent = MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)];
//     char.style.left = Math.random() * 100 + "%";
//     char.style.animationDuration = Math.random() * 2 + 1 + "s";
//     char.style.animationDelay = Math.random() * 1 + "s";
//     matrixBg.appendChild(char);
//     setTimeout(() => {
//       char.remove();
//       const newChar = document.createElement("div");
//       newChar.className = "matrix-char";
//       newChar.textContent = MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)];
//       newChar.style.left = Math.random() * 100 + "%";
//       newChar.style.animationDuration = Math.random() * 2 + 1 + "s";
//       newChar.style.animationDelay = Math.random() * 1 + "s";
//       matrixBg.appendChild(newChar);
//     }, (Math.random() * 2 + 1) * 1000);
//   }
// }

// Initialize application
const tournament = new Tournament();

document.getElementById("speedSlider").addEventListener("input", (e) => {
  tournament.updateSpeed(parseFloat(e.target.value));
});

window.addEventListener("load", () => {
  const now = new Date();
  // UI.elements.sheetDate().value = now.toISOString().split("T")[0];
  // UI.elements.sheetTime().value = "12:00 PM";
  // createMatrixRain(); // Commented out
});

async function loadSheet() {
  const sheetUrl = document.getElementById("sheetUrl").value.trim();
  const sheetName = document.getElementById("sheetName").value.trim();
  const sheetDate = document.getElementById("sheetDate").value.trim();
  const sheetTime = document.getElementById("sheetTime").value.trim();

  if (!sheetUrl || !sheetName) {
    alert("Please enter both the Sheet Name and URL.");
    return;
  }

  let filterDateTime = null;
  if (sheetDate && sheetTime) {
    try {
      const dateStr = `${sheetDate} ${parseTime(sheetTime)}`;
      const [datePart, timePart] = dateStr.split(' ');
      const [year, month, day] = datePart.split('-').map(Number);
      const [hours, minutes] = timePart.split(':').map(Number);
      filterDateTime = new Date(year, month - 1, day, hours, minutes);
    } catch (error) {
      alert("Invalid date or time format. Please check your inputs.");
      return;
    }
  }

  document.getElementById("sheetData").innerHTML = "";
  document.getElementById("result").innerHTML = "";
  document.getElementById("animation").innerHTML = "";
  UI.updateProgress(0);
  UI.showLoading(true);

  await tournament.initialize(sheetUrl, sheetName, filterDateTime);
}
