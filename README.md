# Asteroids

A browser-based recreation of the classic 1979 Atari arcade game. Vector graphics, momentum-based flight, asteroid splitting, UFOs, score rollover, initials, saucers, and synthesized arcade sound - all in vanilla HTML, CSS, and JavaScript.

**[Play online](https://mglass222.github.io/asteroids/)**

## Controls

| Key | Action |
|-----|--------|
| **Up** / **W** | Thrust |
| **Left** / **Right** or **A** / **D** | Rotate left / right |
| **Space** | Fire |
| **H** | Hyperspace |

Press any key (or click the screen) to start.
Touch controls appear automatically on phones and tablets.

## Features

- Faithful vector-style graphics on an HTML5 canvas
- Momentum-based ship movement with screen wrapping
- Asteroids split into smaller pieces when hit (large -> medium -> small)
- UFOs fly across the screen with distinct large/small behavior and score-based aim
- Web Audio API-synthesized sound effects, including the accelerating heartbeat
- Lives, score rollover at 100,000, extra lives every 10,000 points, and initials-based high scores
- Centered 4:3 vector-monitor layout
- Full-height mobile layout with touch controls

## Run locally

No build step required. Open `index.html` in a browser, or serve the folder with any static file server:

```bash
npx serve .
```

Then visit `http://localhost:3000`.

## Tech

- `index.html` - page shell and overlay UI
- `style.css` - 4:3 cabinet layout
- `game.js` - game loop, physics, collision, rendering
- `sounds.js` - procedural arcade audio

## License

MIT
