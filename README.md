# Rock Paper Scissors (Multiplayer)

A real-time, multiplayer Rock Paper Scissors game built with Node.js, HTML, CSS, and Vanilla JavaScript. This project features a custom backend server that handles matchmaking, game state, and scorekeeping without using any external frameworks or databases.

![Project Preview](https://img.shields.io/badge/Status-Playable-success)
![Node Version](https://img.shields.io/badge/Node.js-v14%2B-green)

## Features

- **Real-time Multiplayer:** Play against other users in real-time.
- **Matchmaking System:** Automatic pairing of players in the lobby.
- **Live Scoreboard:** Tracks wins for both players.
- **Disconnect Handling:** Gracefully handles players leaving the match or closing the browser.
- **Responsive Design:** Works on desktop and mobile devices.
- **Zero Dependencies:** The server is built using only native Node.js modules (`http`, `fs`, `path`, `crypto`).

## Prerequisites

Before running this project, ensure you have [Node.js](https://nodejs.org/) installed (v14 or higher recommended).

## Installation & Usage

1.  **Clone the repository or download the files:**
    Ensure all files (`server.js`, `script.js`, `style.css`, `RockPaperScissor.html`) are in the same folder.

2.  **Start the Server:**
    Open your terminal in the project directory and run:
    ```bash
    node server.js