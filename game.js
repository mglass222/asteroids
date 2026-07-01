(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const overlay = document.getElementById("overlay");

  let W = 800;
  let H = 600;
  let ship = null;
  const TAU = Math.PI * 2;

  function resizeCanvas() {
    const cabinet = canvas.parentElement;
    W = Math.max(cabinet.clientWidth, 320);
    H = Math.max(cabinet.clientHeight, 240);
    canvas.width = W;
    canvas.height = H;
    if (ship) {
      ship.x = Math.min(Math.max(ship.x, 40), W - 40);
      ship.y = Math.min(Math.max(ship.y, 40), H - 40);
    }
  }

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  // --- Original-style tuning ---
  const ROT_SPEED = 0.078;       // ~4.5°/frame @ 60fps
  const THRUST = 0.15;
  const MAX_SPEED = 8;
  const FRICTION = 0;            // space: no drag
  const BULLET_SPEED = 12;
  const BULLET_LIFE = 42;        // ~0.7s
  const MAX_BULLETS = 4;
  const FIRE_COOLDOWN = 6;
  const HYPER_COOLDOWN = 180;
  const RESPAWN_INVULN = 180;    // 3s blink
  const EXTRA_LIFE_SCORE = 10000;

  const ASTEROID_SPEED = [1.0, 1.6, 2.4]; // large, medium, small
  const ASTEROID_RADII = [50, 28, 14];
  const ASTEROID_VERTS = [12, 10, 8];
  const ASTEROID_SCORE = [20, 50, 100];
  const ASTEROID_JAG = 0.45;     // vertex radius variation

  const SHIP_VERTS = [
    [12, 0],
    [-8, 8],
    [-5, 0],
    [-8, -8],
  ];
  const SHIP_HIT_PAD = 1.5;

  const UFO_LARGE_SPEED = 1.2;
  const UFO_SMALL_SPEED = 3.5;
  const UFO_SPAWN_DELAY = 1200;  // 20s @ 60fps
  const UFO_FIRE_LARGE = 120;
  const UFO_FIRE_SMALL = 45;

  const keys = {};
  let gameState = "title"; // title | playing | dead | gameover
  let paused = false;
  let muted = false;
  let score = 0;
  let highScore = parseInt(localStorage.getItem("asteroids-hi") || "0", 10);
  let lives = 3;
  let wave = 0;
  let nextExtraLife = EXTRA_LIFE_SCORE;
  let frame = 0;
  let ufoTimer = 0;
  let deathTimer = 0;

  let bullets = [];
  let asteroids = [];
  let ufos = [];
  let particles = [];

  ship = createShip();

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function randInt(min, max) {
    return Math.floor(rand(min, max + 1));
  }

  function wrap(x, y) {
    let wx = x;
    let wy = y;
    while (wx < 0) wx += W;
    while (wx >= W) wx -= W;
    while (wy < 0) wy += H;
    while (wy >= H) wy -= H;
    return [wx, wy];
  }

  function dist(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.hypot(dx, dy);
  }

  function normalizeAngle(a) {
    while (a < 0) a += TAU;
    while (a >= TAU) a -= TAU;
    return a;
  }

  function createShip() {
    return {
      x: W / 2,
      y: H / 2,
      vx: 0,
      vy: 0,
      angle: -Math.PI / 2,
      thrusting: false,
      dead: false,
      invuln: 0,
      fireCooldown: 0,
      hyperCooldown: 0,
      exploding: false,
      explodeTimer: 0,
    };
  }

  function resetShip(center = true) {
    if (center) {
      ship.x = W / 2;
      ship.y = H / 2;
    }
    ship.vx = 0;
    ship.vy = 0;
    ship.angle = -Math.PI / 2;
    ship.thrusting = false;
    ship.dead = false;
    ship.invuln = RESPAWN_INVULN;
    ship.fireCooldown = 0;
    ship.exploding = false;
    ship.explodeTimer = 0;
  }

  function makeAsteroidShape(size) {
    const count = ASTEROID_VERTS[size];
    const base = ASTEROID_RADII[size];
    const verts = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU;
      const r = base * (1 - ASTEROID_JAG + Math.random() * ASTEROID_JAG * 2);
      verts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return verts;
  }

  function spawnAsteroid(x, y, size, vx, vy) {
    if (vx === undefined) {
      const speed = ASTEROID_SPEED[size] * rand(0.7, 1.3);
      const angle = rand(0, TAU);
      vx = Math.cos(angle) * speed;
      vy = Math.sin(angle) * speed;
    }
    const verts = makeAsteroidShape(size);
    let maxR = 0;
    for (const [lx, ly] of verts) {
      const r = Math.hypot(lx, ly);
      if (r > maxR) maxR = r;
    }
    asteroids.push({
      x,
      y,
      vx,
      vy,
      size,
      verts,
      maxR,
      rot: rand(-0.02, 0.02),
      angle: 0,
    });
  }

  function spawnAsteroidOffscreen(size) {
    const edge = randInt(0, 3);
    let x, y;
    const pad = ASTEROID_RADII[size] + 20;
    switch (edge) {
      case 0: x = rand(0, W); y = -pad; break;
      case 1: x = W + pad; y = rand(0, H); break;
      case 2: x = rand(0, W); y = H + pad; break;
      default: x = -pad; y = rand(0, H); break;
    }
    spawnAsteroid(x, y, size);
  }

  function spawnAsteroidSafe(size) {
    let attempts = 0;
    while (attempts++ < 50) {
      const x = rand(80, W - 80);
      const y = rand(80, H - 80);
      if (dist(x, y, ship.x, ship.y) > 120 + ASTEROID_RADII[size]) {
        spawnAsteroid(x, y, size);
        return;
      }
    }
    spawnAsteroidOffscreen(size);
  }

  function startWave() {
    wave++;
    // Note: a saucer already on screen is allowed to fly out on its own rather
    // than vanishing the instant the last asteroid is destroyed.
    asteroids = [];
    ufoTimer = UFO_SPAWN_DELAY;
    const count = 3 + wave; // wave 1: 4 large asteroids (original)
    for (let i = 0; i < count; i++) {
      spawnAsteroidSafe(0);
    }
  }

  function startGame() {
    overlay.classList.add("hidden");
    gameState = "playing";

    try {
      Sounds.init();
      Sounds.setMuted(muted);
      Sounds.setThrust(false);
      stopAllUfoSounds();
      score = 0;
      lives = 3;
      wave = 0;
      nextExtraLife = EXTRA_LIFE_SCORE;
      bullets = [];
      particles = [];
      ufos = [];
      resetShip();
      startWave();
    } catch (err) {
      console.error("Failed to start game:", err);
    }
  }

  function addScore(pts) {
    score += pts;
    if (score >= nextExtraLife) {
      lives++;
      nextExtraLife += EXTRA_LIFE_SCORE;
      Sounds.extraLife();
    }
    if (score > highScore) {
      highScore = score;
      localStorage.setItem("asteroids-hi", String(highScore));
    }
  }

  function spawnExplosion(x, y, count, speed, life) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU);
      const s = rand(speed * 0.3, speed);
      particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: randInt(life * 0.5, life),
        maxLife: life,
      });
    }
  }

  function spawnThrustParticle() {
    const back = ship.angle + Math.PI;
    const px = ship.x + Math.cos(back) * 8 + rand(-2, 2);
    const py = ship.y + Math.sin(back) * 8 + rand(-2, 2);
    particles.push({
      x: px,
      y: py,
      vx: Math.cos(back) * rand(1, 3) + ship.vx * 0.3,
      vy: Math.sin(back) * rand(1, 3) + ship.vy * 0.3,
      life: randInt(8, 16),
      maxLife: 16,
    });
  }

  function fireBullet() {
    if (ship.dead || ship.exploding || ship.fireCooldown > 0) return;
    if (bullets.length >= MAX_BULLETS) return;

    ship.fireCooldown = FIRE_COOLDOWN;
    const tip = 12;
    const bx = ship.x + Math.cos(ship.angle) * tip;
    const by = ship.y + Math.sin(ship.angle) * tip;
    bullets.push({
      x: bx,
      y: by,
      vx: ship.vx + Math.cos(ship.angle) * BULLET_SPEED,
      vy: ship.vy + Math.sin(ship.angle) * BULLET_SPEED,
      life: BULLET_LIFE,
    });
    Sounds.fire();
  }

  function hyperspace() {
    if (ship.dead || ship.exploding || ship.hyperCooldown > 0 || ship.invuln > 0) return;
    ship.hyperCooldown = HYPER_COOLDOWN;

    // Original: ~1/256 chance of death on hyperspace
    if (Math.random() < 1 / 256) {
      killShip();
      return;
    }

    let safe = false;
    for (let i = 0; i < 30; i++) {
      const nx = rand(40, W - 40);
      const ny = rand(40, H - 40);
      let ok = true;
      for (const a of asteroids) {
        if (dist(nx, ny, a.x, a.y) < ASTEROID_RADII[a.size] + 20) {
          ok = false;
          break;
        }
      }
      if (ok) {
        ship.x = nx;
        ship.y = ny;
        ship.vx = 0;
        ship.vy = 0;
        ship.invuln = RESPAWN_INVULN;
        safe = true;
        break;
      }
    }
    if (!safe) {
      ship.x = rand(40, W - 40);
      ship.y = rand(40, H - 40);
      ship.vx = 0;
      ship.vy = 0;
      ship.invuln = RESPAWN_INVULN;
    }
    Sounds.hyperspace();
  }

  function killShip() {
    if (ship.invuln > 0 || ship.exploding) return;
    Sounds.setThrust(false);
    stopAllUfoSounds();
    ship.exploding = true;
    ship.explodeTimer = 30;
    ship.dead = true;
    ship.thrusting = false;
    spawnExplosion(ship.x, ship.y, 24, 4, 30);
    Sounds.shipExplode();
    lives--;
    deathTimer = 60;
    gameState = "dead";
  }

  function spawnUfo(large) {
    const fromLeft = Math.random() < 0.5;
    const x = fromLeft ? -30 : W + 30;
    const y = rand(40, H - 40);
    const speed = large ? UFO_LARGE_SPEED : UFO_SMALL_SPEED;
    const vx = fromLeft ? speed : -speed;
    ufos.push({
      x,
      y,
      vx,
      vy: 0,
      large,
      fireTimer: large ? UFO_FIRE_LARGE : UFO_FIRE_SMALL,
      dir: 1,
      wobble: rand(0, TAU),
      sound: Sounds.createUfoSound(large),
    });
  }

  function ufoFire(ufo) {
    let angle;
    if (ufo.large) {
      // Large UFO: random shots
      angle = rand(0, TAU);
    } else {
      // Small UFO: aims at ship with slight inaccuracy
      angle = Math.atan2(ship.y - ufo.y, ship.x - ufo.x) + rand(-0.15, 0.15);
    }
    const speed = 5;
    bullets.push({
      x: ufo.x,
      y: ufo.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: BULLET_LIFE * 2,
      enemy: true,
    });
    Sounds.ufoFire();
  }

  function stopUfoSound(u) {
    if (u.sound) {
      u.sound.stop();
      u.sound = null;
    }
  }

  function stopAllUfoSounds() {
    for (const u of ufos) stopUfoSound(u);
  }

  function resumeUfoSounds() {
    if (gameState !== "playing") return;
    for (const u of ufos) {
      if (!u.sound) u.sound = Sounds.createUfoSound(u.large);
    }
  }

  function splitAsteroid(ast) {
    const { x, y, size, vx, vy } = ast;
    Sounds.asteroidHit(size);
    if (size >= 2) {
      spawnExplosion(x, y, 8, 2, 20);
      return;
    }
    const newSize = size + 1;
    const baseAngle = Math.atan2(vy, vx);
    for (let i = 0; i < 2; i++) {
      const spread = (i === 0 ? 1 : -1) * rand(0.4, 0.9);
      const speed = ASTEROID_SPEED[newSize] * rand(0.8, 1.2);
      const angle = baseAngle + spread;
      spawnAsteroid(x, y, newSize, Math.cos(angle) * speed, Math.sin(angle) * speed);
    }
    spawnExplosion(x, y, 6, 1.5, 16);
  }

  function worldVerts(x, y, angle, verts) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return verts.map(([lx, ly]) => ({
      x: x + lx * cos - ly * sin,
      y: y + lx * sin + ly * cos,
    }));
  }

  function getShipVerts() {
    return worldVerts(ship.x, ship.y, ship.angle, SHIP_VERTS);
  }

  function pointInPoly(px, py, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const { x: xi, y: yi } = poly[i];
      const { x: xj, y: yj } = poly[j];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  }

  function segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
    const denom = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
    if (Math.abs(denom) < 1e-10) return false;
    const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / denom;
    const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / denom;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  }

  function polyPolyCollision(polyA, polyB) {
    for (const p of polyA) {
      if (pointInPoly(p.x, p.y, polyB)) return true;
    }
    for (const p of polyB) {
      if (pointInPoly(p.x, p.y, polyA)) return true;
    }
    for (let i = 0; i < polyA.length; i++) {
      const a1 = polyA[i];
      const a2 = polyA[(i + 1) % polyA.length];
      for (let j = 0; j < polyB.length; j++) {
        const b1 = polyB[j];
        const b2 = polyB[(j + 1) % polyB.length];
        if (segmentsIntersect(a1.x, a1.y, a2.x, a2.y, b1.x, b1.y, b2.x, b2.y)) {
          return true;
        }
      }
    }
    return false;
  }

  function shipHitsAsteroid(a) {
    const reach = ASTEROID_RADII[a.size] + 14 + SHIP_HIT_PAD;
    if (dist(ship.x, ship.y, a.x, a.y) > reach) return false;
    const shipPoly = getShipVerts();
    const asteroidPoly = worldVerts(a.x, a.y, a.angle, a.verts);
    return polyPolyCollision(shipPoly, asteroidPoly);
  }

  function updateShip() {
    // Explosions are driven entirely by updateDead (gameState flips to "dead"
    // the same frame killShip runs), so updateShip only handles a live ship.
    if (ship.dead) return;

    if (ship.invuln > 0) ship.invuln--;
    if (ship.fireCooldown > 0) ship.fireCooldown--;
    if (ship.hyperCooldown > 0) ship.hyperCooldown--;

    if (keys.a) ship.angle -= ROT_SPEED;
    if (keys.d) ship.angle += ROT_SPEED;

    ship.thrusting = keys.w;
    if (ship.thrusting) {
      ship.vx += Math.cos(ship.angle) * THRUST;
      ship.vy += Math.sin(ship.angle) * THRUST;
      if (frame % 2 === 0) spawnThrustParticle();
    }

    const speed = Math.hypot(ship.vx, ship.vy);
    if (speed > MAX_SPEED) {
      ship.vx = (ship.vx / speed) * MAX_SPEED;
      ship.vy = (ship.vy / speed) * MAX_SPEED;
    }

    if (FRICTION > 0) {
      ship.vx *= 1 - FRICTION;
      ship.vy *= 1 - FRICTION;
    }

    ship.x += ship.vx;
    ship.y += ship.vy;
    [ship.x, ship.y] = wrap(ship.x, ship.y);

    Sounds.setThrust(ship.thrusting && !ship.dead && !ship.exploding);

    if (keys[" "]) fireBullet();
  }

  function updateBullets() {
    bullets = bullets.filter((b) => {
      b.x += b.vx;
      b.y += b.vy;
      b.life--;
      [b.x, b.y] = wrap(b.x, b.y);
      return b.life > 0;
    });
  }

  function updateAsteroids() {
    for (const a of asteroids) {
      a.x += a.vx;
      a.y += a.vy;
      a.angle += a.rot;
      [a.x, a.y] = wrap(a.x, a.y);
    }
  }

  function updateUfos() {
    ufos = ufos.filter((u) => {
      u.wobble += 0.04;
      if (!u.large) {
        u.vy = Math.sin(u.wobble) * 2;
      } else {
        u.vy = Math.sin(u.wobble * 0.5) * 0.8;
      }
      u.x += u.vx;
      u.y += u.vy;

      const margin = 24;
      if (u.y < margin) {
        u.y = margin;
      } else if (u.y > H - margin) {
        u.y = H - margin;
      }

      u.fireTimer--;
      if (u.fireTimer <= 0 && !ship.dead && !ship.exploding) {
        ufoFire(u);
        u.fireTimer = u.large ? UFO_FIRE_LARGE : UFO_FIRE_SMALL;
      }

      const exited = u.vx > 0 ? u.x > W + 40 : u.x < -40;
      if (exited) stopUfoSound(u);
      return !exited;
    });
  }

  function updateParticles() {
    particles = particles.filter((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.life--;
      [p.x, p.y] = wrap(p.x, p.y);
      return p.life > 0;
    });
  }

  function checkCollisions() {
    // Player bullets vs asteroids / ufos
    for (let bi = bullets.length - 1; bi >= 0; bi--) {
      const b = bullets[bi];
      if (b.enemy) continue;

      for (let ai = asteroids.length - 1; ai >= 0; ai--) {
        const a = asteroids[ai];
        // Broad phase against the true outer radius, then exact polygon test so
        // spiky points register and concave gaps don't.
        if (dist(b.x, b.y, a.x, a.y) > a.maxR) continue;
        if (pointInPoly(b.x, b.y, worldVerts(a.x, a.y, a.angle, a.verts))) {
          addScore(ASTEROID_SCORE[a.size]);
          splitAsteroid(a);
          asteroids.splice(ai, 1);
          bullets.splice(bi, 1);
          break;
        }
      }
      if (!bullets[bi]) continue;

      for (let ui = ufos.length - 1; ui >= 0; ui--) {
        const u = ufos[ui];
        if (dist(b.x, b.y, u.x, u.y) < 16) {
          addScore(u.large ? 200 : 1000);
          spawnExplosion(u.x, u.y, 16, 3, 24);
          Sounds.ufoExplode();
          stopUfoSound(u);
          ufos.splice(ui, 1);
          bullets.splice(bi, 1);
          break;
        }
      }
    }

    // Enemy bullets vs ship
    if (!ship.dead && !ship.exploding && ship.invuln <= 0) {
      for (const b of bullets) {
        if (b.enemy && dist(b.x, b.y, ship.x, ship.y) < 6) {
          killShip();
          break;
        }
      }
    }

    // Asteroids vs ship
    if (!ship.dead && !ship.exploding && ship.invuln <= 0) {
      for (const a of asteroids) {
        if (shipHitsAsteroid(a)) {
          killShip();
          break;
        }
      }
    }

    // UFO vs ship
    if (!ship.dead && !ship.exploding && ship.invuln <= 0) {
      for (const u of ufos) {
        if (dist(ship.x, ship.y, u.x, u.y) < 18) {
          killShip();
          break;
        }
      }
    }

    // Ship vs asteroid (ship momentum can destroy small ones in some ports — skip for arcade fidelity)

    // Bullet vs bullet (original had none)
  }

  function updatePlaying() {
    frame++;
    updateShip();
    updateBullets();
    updateAsteroids();
    updateUfos();
    updateParticles();
    checkCollisions();

    if (asteroids.length === 0) {
      startWave();
    }

    ufoTimer--;
    if (ufoTimer <= 0 && ufos.length === 0) {
      // Small (aimed) saucers grow more common as the score climbs, like the
      // original. Early game is mostly large saucers.
      const smallChance = Math.min(0.85, 0.2 + score / 40000);
      const large = Math.random() >= smallChance;
      spawnUfo(large);
      ufoTimer = UFO_SPAWN_DELAY + randInt(0, 300);
    }
  }

  function updateDead() {
    updateBullets();
    updateAsteroids();
    updateUfos();
    updateParticles();

    if (ship.exploding) {
      ship.explodeTimer--;
      if (ship.explodeTimer <= 0) ship.exploding = false;
    }

    deathTimer--;
    if (deathTimer <= 0) {
      if (lives <= 0) {
        Sounds.setThrust(false);
        stopAllUfoSounds();
        gameState = "gameover";
      } else {
        resetShip();
        gameState = "playing";
        resumeUfoSounds();
      }
    }
  }

  // --- Drawing ---

  function drawLine(x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function drawShip() {
    if (ship.exploding) return;
    if (ship.dead) return;
    if (ship.invuln > 0 && Math.floor(ship.invuln / 6) % 2 === 0) return;

    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.rotate(ship.angle);

    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(-8, 8);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-8, -8);
    ctx.closePath();
    ctx.stroke();

    ctx.restore();
  }

  function drawAsteroid(a) {
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(a.angle);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const [fx, fy] = a.verts[0];
    ctx.moveTo(fx, fy);
    for (let i = 1; i < a.verts.length; i++) {
      const [vx, vy] = a.verts[i];
      ctx.lineTo(vx, vy);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  function drawUfo(u) {
    ctx.save();
    ctx.translate(u.x, u.y);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;

    const w = u.large ? 24 : 16;
    const h = u.large ? 8 : 5;

    ctx.beginPath();
    ctx.moveTo(-w, 0);
    ctx.quadraticCurveTo(0, -h * 2, w, 0);
    ctx.quadraticCurveTo(0, h, -w, 0);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-w * 0.5, -h * 0.5);
    ctx.lineTo(w * 0.5, -h * 0.5);
    ctx.stroke();

    ctx.restore();
  }

  function drawBullets() {
    ctx.fillStyle = "#fff";
    for (const b of bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.enemy ? 2 : 1.5, 0, TAU);
      ctx.fill();
    }
  }

  function drawParticles() {
    for (const p of particles) {
      const alpha = p.life / p.maxLife;
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fillRect(p.x, p.y, 2, 2);
    }
  }

  function drawScore() {
    ctx.fillStyle = "#fff";
    ctx.font = '16px "Courier New", Courier, monospace';
    ctx.textAlign = "left";
    ctx.fillText(String(score).padStart(6, "0"), 20, 28);
    ctx.textAlign = "right";
    ctx.fillText(`HI ${String(highScore).padStart(6, "0")}`, W - 20, 28);
  }

  function drawLives() {
    ctx.save();
    ctx.translate(60, H - 30);
    for (let i = 0; i < lives; i++) {
      ctx.save();
      ctx.translate(i * 22, 0);
      ctx.scale(0.6, 0.6);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(-8, 8);
      ctx.lineTo(-5, 0);
      ctx.lineTo(-8, -8);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawWave() {
    ctx.fillStyle = "#fff";
    ctx.font = '14px "Courier New", Courier, monospace';
    ctx.textAlign = "center";
    ctx.fillText(`WAVE ${wave}`, W / 2, H - 20);
  }

  function drawGameOver() {
    ctx.fillStyle = "#fff";
    ctx.font = '36px "Courier New", Courier, monospace';
    ctx.textAlign = "center";
    ctx.fillText("GAME OVER", W / 2, H / 2 - 20);
    ctx.font = '16px "Courier New", Courier, monospace';
    ctx.fillText(`SCORE ${String(score).padStart(6, "0")}`, W / 2, H / 2 + 20);
    ctx.font = '14px "Courier New", Courier, monospace';
    ctx.fillText("Press any key to play again", W / 2, H / 2 + 55);
  }

  function drawPaused() {
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.font = '36px "Courier New", Courier, monospace';
    ctx.fillText("PAUSED", W / 2, H / 2 - 10);
    ctx.font = '14px "Courier New", Courier, monospace';
    ctx.fillText("Press P to resume", W / 2, H / 2 + 25);
  }

  function drawMuted() {
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = '12px "Courier New", Courier, monospace';
    ctx.textAlign = "right";
    ctx.fillText("MUTED", W - 20, H - 20);
  }

  function draw() {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    for (const a of asteroids) drawAsteroid(a);
    for (const u of ufos) drawUfo(u);
    drawBullets();
    drawParticles();
    drawShip();
    drawScore();
    drawLives();
    drawWave();

    if (gameState === "gameover") drawGameOver();
    if (muted) drawMuted();
    if (paused) drawPaused();
  }

  // Fixed-timestep loop so the game runs at the same speed regardless of
  // the display's refresh rate (60, 120, 144 Hz, ...).
  const STEP_MS = 1000 / 60;
  const MAX_FRAME_MS = 250; // clamp catch-up after tab switches / stalls
  let lastTime = null;
  let acc = 0;

  function loop(now) {
    if (lastTime === null) lastTime = now;
    let delta = now - lastTime;
    lastTime = now;

    if (paused) {
      draw();
      requestAnimationFrame(loop);
      return;
    }

    if (delta > MAX_FRAME_MS) delta = MAX_FRAME_MS;
    acc += delta;
    while (acc >= STEP_MS) {
      if (gameState === "playing") updatePlaying();
      else if (gameState === "dead") updateDead();
      acc -= STEP_MS;
    }
    draw();
    requestAnimationFrame(loop);
  }

  function normalizeKey(e) {
    const key = e.key ?? "";
    if (key.length === 1) return key.toLowerCase();
    if (key === "Spacebar") return " ";
    return key;
  }

  function beginGame() {
    canvas.focus();
    startGame();
  }

  function setPaused(p) {
    if (p === paused) return;
    if (p && gameState !== "playing" && gameState !== "dead") return;
    paused = p;
    if (paused) {
      Sounds.setThrust(false);
      stopAllUfoSounds();
    } else {
      lastTime = null; // avoid a catch-up burst after the pause
      resumeUfoSounds();
    }
  }

  function toggleMute() {
    muted = !muted;
    Sounds.setMuted(muted);
  }

  // --- Input ---

  function handleKeyDown(e) {
    if (gameState === "title" || gameState === "gameover") {
      e.preventDefault();
      beginGame();
      return;
    }

    const k = normalizeKey(e);
    if (["w", "a", "s", "d", " "].includes(k)) {
      e.preventDefault();
    }

    if (k === "m") {
      toggleMute();
      return;
    }
    if (k === "p") {
      setPaused(!paused);
      return;
    }
    if (paused) return;

    keys[k] = true;
    if (k === " ") fireBullet();
    if (k === "h") hyperspace();
  }

  function handleKeyUp(e) {
    keys[normalizeKey(e)] = false;
  }

  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);

  // Auto-pause when the tab is hidden so looping audio (thrust / saucer) and
  // game state don't carry on in the background.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) setPaused(true);
  });

  document.getElementById("cabinet").addEventListener("pointerdown", () => {
    canvas.focus();
    if (gameState === "title" || gameState === "gameover") {
      beginGame();
    }
  });

  // --- Touch controls ---

  function setupTouchControls() {
    const isTouch =
      window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
    const panel = document.getElementById("touch");
    if (!isTouch || !panel) return;
    panel.classList.add("show");

    for (const btn of panel.querySelectorAll(".tbtn")) {
      const key = btn.dataset.key;

      btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof btn.setPointerCapture === "function") {
          try { btn.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        }
        if (gameState === "title" || gameState === "gameover") {
          beginGame();
          return;
        }
        if (paused) return;
        keys[key] = true;
        if (key === " ") fireBullet();
        if (key === "h") hyperspace();
      });

      const release = (e) => {
        e.preventDefault();
        keys[key] = false;
      };
      btn.addEventListener("pointerup", release);
      btn.addEventListener("pointercancel", release);
      btn.addEventListener("pointerleave", release);
    }
  }

  setupTouchControls();

  requestAnimationFrame(loop);
})();
