# Asteroids

A browser-based recreation of the classic 1979 Atari arcade game. Vector graphics, momentum-based flight, asteroid splitting, UFOs, and synthesized arcade sound — all in vanilla HTML, CSS, and JavaScript.

**[Play online](https://mglass222.github.io/asteroids/)**

## Controls

| Key | Action |
|-----|--------|
| **W** | Thrust |
| **A** / **D** | Rotate left / right |
| **Space** | Fire |
| **H** | Hyperspace |

Press any key (or click the screen) to start.

## Features

- Faithful vector-style graphics on an HTML5 canvas
- Momentum-based ship movement with screen wrapping
- Asteroids split into smaller pieces when hit (large → medium → small)
- UFOs fly across the screen with distinct large/small behavior
- Web Audio API–synthesized sound effects (thrust, fire, explosions, UFO hum)
- Lives, scoring, extra lives every 10,000 points, and persistent high score
- Full-window responsive layout

## Run locally

No build step required. Open `index.html` in a browser, or serve the folder with any static file server:

```bash
npx serve .
```

Then visit `http://localhost:3000`.

## Tech

- `index.html` — page shell and overlay UI
- `style.css` — full-viewport layout
- `game.js` — game loop, physics, collision, rendering
- `sounds.js` — procedural arcade audio

## License

MIT
