(function () {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreLeftEl = document.getElementById('score-left');
  const scoreRightEl = document.getElementById('score-right');
  const menuEl = document.getElementById('menu');
  const gameoverEl = document.getElementById('gameover');
  const startBtn = document.getElementById('start');
  const restartBtn = document.getElementById('restart');
  const backToMenuBtn = document.getElementById('back-to-menu');
  const modeSel = document.getElementById('mode');
  const difficultySel = document.getElementById('difficulty');
  const targetInput = document.getElementById('target');
  const durationInput = document.getElementById('duration');
  const mapObstacleInput = document.getElementById('map-obstacle');
  const powerupsSel = document.getElementById('powerups');

  const FIELD = { width: canvas.width, height: canvas.height, centerX: canvas.width / 2, centerY: canvas.height / 2 };
  const COLORS = { bg: '#000', mid: '#2e2e2e', paddle: '#eaeaea', ball: '#eaeaea' };

  const PADDLE = { width: 12, height: 80, speed: 340 };
  const BALL = { radius: 7, speed: 320, speedMax: 520, accelOnHit: 1.05 };
  const map = { obstacle: false, rect: { x: 0, y: 0, w: 18, h: 120 } };

  let left = { x: 24, y: FIELD.centerY - PADDLE.height / 2, vy: 0, score: 0 };
  let right = { x: FIELD.width - 24 - PADDLE.width, y: FIELD.centerY - PADDLE.height / 2, vy: 0, score: 0 };
  let ball = resetBall(+1);

  let keyState = { up: false, down: false, w: false, s: false };
  let paused = false;
  let gameState = 'menu'; // 'menu' | 'playing' | 'paused' | 'gameover'
  let gameMode = { type: 'classic', target: 7, duration: 120, timeLeft: 120 };
  let difficulty = 'normal';
  let lastTs = undefined;
  const powerups = { enabled: true, active: [], spawnTimer: 0, list: [] };

  function resetBall(direction) {
    const angle = (Math.random() * 0.6 - 0.3) * Math.PI; // leve inclinación
    const speed = BALL.speed;
    let x = FIELD.centerX;
    let y = FIELD.centerY;
    // Si hay obstáculo central, reubicar fuera del bloque (protegido si map aún no existe)
    const hasObstacle = (typeof map !== 'undefined') && map.obstacle;
    if (hasObstacle) {
      const rx = FIELD.centerX - map.rect.w / 2;
      const ry = FIELD.centerY - map.rect.h / 2;
      const rw = map.rect.w;
      const rh = map.rect.h;
      const offsetX = rw / 2 + BALL.radius + 8;
      x = FIELD.centerX + (direction >= 0 ? +offsetX : -offsetX);
      // Evitar reaparecer dentro del rango vertical del obstáculo
      const safeTop = ry - BALL.radius - 8;
      const safeBottom = ry + rh + BALL.radius + 8;
      // 50% arriba o abajo si el centro cae dentro del obstáculo
      if (y > ry && y < ry + rh) {
        if (Math.random() < 0.5) y = Math.max(BALL.radius + 8, safeTop);
        else y = Math.min(FIELD.height - BALL.radius - 8, safeBottom);
      }
    }
    return {
      x,
      y,
      vx: Math.cos(angle) * speed * direction,
      vy: Math.sin(angle) * speed,
    };
  }

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

  function drawNet() {
    ctx.strokeStyle = COLORS.mid;
    ctx.lineWidth = 4;
    ctx.setLineDash([10, 14]);
    ctx.beginPath();
    ctx.moveTo(FIELD.centerX, 0);
    ctx.lineTo(FIELD.centerX, FIELD.height);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawObstacle() {
    if (!map.obstacle) return;
    const r = map.rect;
    const x = FIELD.centerX - r.w / 2;
    const y = FIELD.centerY - r.h / 2;
    ctx.fillStyle = '#444';
    ctx.fillRect(x, y, r.w, r.h);
  }

  function drawRect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }

  function drawCircle(x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function render() {
    ctx.clearRect(0, 0, FIELD.width, FIELD.height);
    if (!map.obstacle) drawNet();
    drawObstacle();
    drawRect(left.x, left.y, PADDLE.width, PADDLE.height, COLORS.paddle);
    drawRect(right.x, right.y, PADDLE.width, PADDLE.height, COLORS.paddle);
    drawCircle(ball.x, ball.y, BALL.radius, COLORS.ball);
    // draw powerups
    for (const p of powerups.list) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = p.type === 'xl' ? '#03a9f4' : '#ffca28';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.type === 'xl' ? 'XL' : 'S', p.x, p.y + 1);
      ctx.restore();
    }
    if (gameMode.type === 'time') {
      // dibujar barra de tiempo
      const margin = 14; const barW = FIELD.width - margin * 2; const barH = 6;
      const p = Math.max(0, gameMode.timeLeft / gameMode.duration);
      ctx.fillStyle = '#222';
      ctx.fillRect(margin, margin, barW, barH);
      ctx.fillStyle = '#4caf50';
      ctx.fillRect(margin, margin, barW * p, barH);
    }
  }

  function update(dt) {
    // player input
    const upPressed = keyState.up || keyState.w;
    const downPressed = keyState.down || keyState.s;
    left.vy = 0;
    if (upPressed) left.vy -= PADDLE.speed;
    if (downPressed) left.vy += PADDLE.speed;
    left.y = clamp(left.y + left.vy * dt, 0, FIELD.height - PADDLE.height);

    // simple AI for right paddle con dificultad
    const targetY = ball.y - PADDLE.height / 2;
    const speedFactor = difficulty === 'easy' ? 0.75 : difficulty === 'hard' ? 1.1 : 0.92;
    const aiSpeed = PADDLE.speed * speedFactor;
    if (right.y + 4 < targetY) right.y += aiSpeed * dt;
    else if (right.y - 4 > targetY) right.y -= aiSpeed * dt;
    right.y = clamp(right.y, 0, FIELD.height - PADDLE.height);

    // move ball
    let slowFactor = getSlowFactor();
    ball.x += ball.vx * dt * slowFactor;
    ball.y += ball.vy * dt * slowFactor;

    // wall collisions
    if (ball.y - BALL.radius <= 0 && ball.vy < 0) {
      ball.y = BALL.radius;
      ball.vy *= -1;
    }
    if (ball.y + BALL.radius >= FIELD.height && ball.vy > 0) {
      ball.y = FIELD.height - BALL.radius;
      ball.vy *= -1;
    }

    // paddle collisions
    // left
    if (ball.x - BALL.radius <= left.x + PADDLE.width &&
        ball.y >= left.y && ball.y <= left.y + PADDLE.height &&
        ball.vx < 0) {
      ball.x = left.x + PADDLE.width + BALL.radius;
      ball.vx = Math.abs(ball.vx) * BALL.accelOnHit;
      ball.vx = clamp(ball.vx, 0, BALL.speedMax);
      const padCenter = left.y + PADDLE.height / 2;
      const offset = (ball.y - padCenter) / (PADDLE.height / 2);
      ball.vy += offset * 180; // add some angle based on hit position
    }
    // right
    if (ball.x + BALL.radius >= right.x &&
        ball.y >= right.y && ball.y <= right.y + PADDLE.height &&
        ball.vx > 0) {
      ball.x = right.x - BALL.radius;
      ball.vx = -Math.abs(ball.vx) * BALL.accelOnHit;
      ball.vx = clamp(ball.vx, -BALL.speedMax, 0);
      const padCenter = right.y + PADDLE.height / 2;
      const offset = (ball.y - padCenter) / (PADDLE.height / 2);
      ball.vy += offset * 180;
    }

    // obstacle collision (AABB vs circle) con separación mínima
    if (map.obstacle) {
      const rx = FIELD.centerX - map.rect.w / 2;
      const ry = FIELD.centerY - map.rect.h / 2;
      const rw = map.rect.w;
      const rh = map.rect.h;
      const closestX = clamp(ball.x, rx, rx + rw);
      const closestY = clamp(ball.y, ry, ry + rh);
      const dx = ball.x - closestX;
      const dy = ball.y - closestY;
      const r2 = dx * dx + dy * dy;
      const rr = BALL.radius;
      if (r2 <= rr * rr) {
        // Determinar el lado de impacto comparando penetraciones
        const fromLeft = ball.x < rx;
        const fromRight = ball.x > rx + rw;
        const fromTop = ball.y < ry;
        const fromBottom = ball.y > ry + rh;

        const penLeft = (rx - (ball.x - rr));      // cuanto entra por la izquierda (positivo si hay penetración)
        const penRight = ((ball.x + rr) - (rx + rw));
        const penTop = (ry - (ball.y - rr));
        const penBottom = ((ball.y + rr) - (ry + rh));

        // Tomar la menor corrección absoluta
        const corrX = Math.abs(penLeft) < Math.abs(penRight) ? -penLeft : penRight;
        const corrY = Math.abs(penTop) < Math.abs(penBottom) ? -penTop : penBottom;

        if (Math.abs(corrX) < Math.abs(corrY)) {
          // Resolver en X
          ball.x += (fromLeft || (!fromRight && Math.abs(penLeft) > Math.abs(penRight))) ? -Math.abs(corrX) : Math.abs(corrX);
          ball.vx *= -1;
        } else {
          // Resolver en Y
          ball.y += (fromTop || (!fromBottom && Math.abs(penTop) > Math.abs(penBottom))) ? -Math.abs(corrY) : Math.abs(corrY);
          ball.vy *= -1;
        }
      }
    }

    // powerups update
    if (powerups.enabled) {
      // spawn timer
      powerups.spawnTimer -= dt;
      if (powerups.spawnTimer <= 0 && powerups.list.length < 2) {
        spawnPowerup();
        powerups.spawnTimer = 8 + Math.random() * 6; // every ~8-14s
      }
      // pickup check (circle-circle)
      for (let i = powerups.list.length - 1; i >= 0; i--) {
        const p = powerups.list[i];
        const dx = ball.x - p.x; const dy = ball.y - p.y;
        if (dx * dx + dy * dy <= (BALL.radius + 9) * (BALL.radius + 9)) {
          applyPowerup(p);
          powerups.list.splice(i, 1);
        }
      }
      // tick actives
      for (let i = powerups.active.length - 1; i >= 0; i--) {
        const a = powerups.active[i];
        a.time -= dt;
        if (a.time <= 0) {
          removePowerup(a);
          powerups.active.splice(i, 1);
        }
      }
    }

    // scoring
    if (ball.x < -BALL.radius) {
      right.score += 1;
      updateScore();
      ball = resetBall(+1);
    } else if (ball.x > FIELD.width + BALL.radius) {
      left.score += 1;
      updateScore();
      ball = resetBall(-1);
    }

    // win conditions
    if (gameMode.type === 'classic') {
      if (left.score >= gameMode.target || right.score >= gameMode.target) {
        endGame(left.score > right.score ? 'Izquierda gana' : 'Derecha gana');
      }
    } else if (gameMode.type === 'time') {
      gameMode.timeLeft -= dt;
      if (gameMode.timeLeft <= 0) {
        endGame(left.score === right.score ? 'Empate' : (left.score > right.score ? 'Izquierda gana' : 'Derecha gana'));
      }
    }
  }

  function updateScore() {
    scoreLeftEl.textContent = String(left.score);
    scoreRightEl.textContent = String(right.score);
  }

  function spawnPowerup() {
    const margin = 40;
    const x = margin + Math.random() * (FIELD.width - margin * 2);
    const y = margin + Math.random() * (FIELD.height - margin * 2);
    const type = Math.random() < 0.5 ? 'xl' : 'slow';
    // avoid obstacle area
    if (map.obstacle) {
      const rx = FIELD.centerX - map.rect.w / 2;
      const ry = FIELD.centerY - map.rect.h / 2;
      if (x > rx - 24 && x < rx + map.rect.w + 24 && y > ry - 24 && y < ry + map.rect.h + 24) {
        return; // skip spawn; next tick will try again
      }
    }
    powerups.list.push({ x, y, type });
  }

  function applyPowerup(p) {
    if (p.type === 'xl') {
      const before = PADDLE.height;
      PADDLE.height = Math.min(140, PADDLE.height + 36);
      // adjust positions to keep inside bounds
      left.y = clamp(left.y, 0, FIELD.height - PADDLE.height);
      right.y = clamp(right.y, 0, FIELD.height - PADDLE.height);
      powerups.active.push({ type: 'xl', time: 10, data: { before } });
    } else if (p.type === 'slow') {
      powerups.active.push({ type: 'slow', time: 6 });
    }
  }

  function removePowerup(a) {
    if (a.type === 'xl') {
      PADDLE.height = a.data.before;
      left.y = clamp(left.y, 0, FIELD.height - PADDLE.height);
      right.y = clamp(right.y, 0, FIELD.height - PADDLE.height);
    }
  }

  function getSlowFactor() {
    const hasSlow = powerups.active.some(a => a.type === 'slow');
    return hasSlow ? 0.6 : 1;
  }

  function loop(ts) {
    if (lastTs === undefined) lastTs = ts;
    const dt = Math.min(0.033, (ts - lastTs) / 1000);
    lastTs = ts;
    if (!paused && gameState === 'playing') {
      update(dt);
      render();
    }
    requestAnimationFrame(loop);
  }

  // input
  window.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowUp') keyState.up = true;
    if (e.code === 'ArrowDown') keyState.down = true;
    if (e.code === 'KeyW') keyState.w = true;
    if (e.code === 'KeyS') keyState.s = true;
    if (e.code === 'Space' && gameState === 'playing') paused = !paused;
    if (e.code === 'KeyR' && gameState === 'playing') {
      left.score = 0; right.score = 0; updateScore();
      left.y = FIELD.centerY - PADDLE.height / 2;
      right.y = FIELD.centerY - PADDLE.height / 2;
      ball = resetBall(Math.random() < 0.5 ? -1 : +1);
      paused = false;
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowUp') keyState.up = false;
    if (e.code === 'ArrowDown') keyState.down = false;
    if (e.code === 'KeyW') keyState.w = false;
    if (e.code === 'KeyS') keyState.s = false;
  });

  // start
  render();
  requestAnimationFrame(loop);

  // menu interactions
  function syncModeRows() {
    const classicRows = document.querySelectorAll('[data-mode="classic"]');
    const timeRows = document.querySelectorAll('[data-mode="time"]');
    if (modeSel.value === 'classic') {
      classicRows.forEach(r => r.style.display = 'grid');
      timeRows.forEach(r => r.style.display = 'none');
    } else {
      classicRows.forEach(r => r.style.display = 'none');
      timeRows.forEach(r => r.style.display = 'grid');
    }
  }
  modeSel && modeSel.addEventListener('change', syncModeRows);
  syncModeRows();

  function startGame() {
    gameMode.type = modeSel.value;
    difficulty = difficultySel.value;
    map.obstacle = !!(mapObstacleInput && mapObstacleInput.checked);
    powerups.enabled = powerupsSel ? (powerupsSel.value !== 'off') : false;
    powerups.list = []; powerups.active = []; powerups.spawnTimer = 2.5;
    if (gameMode.type === 'classic') {
      gameMode.target = Math.max(1, Math.min(50, Number(targetInput.value || 7)));
    } else {
      gameMode.duration = Math.max(15, Math.min(600, Number(durationInput.value || 120)));
      gameMode.timeLeft = gameMode.duration;
    }

    left.score = 0; right.score = 0; updateScore();
    left.y = FIELD.centerY - PADDLE.height / 2;
    right.y = FIELD.centerY - PADDLE.height / 2;
    ball = resetBall(Math.random() < 0.5 ? -1 : +1);

    menuEl.style.display = 'none';
    gameoverEl.style.display = 'none';
    gameState = 'playing';
    paused = false;
  }

  startBtn && startBtn.addEventListener('click', startGame);
  // Tecla Enter para iniciar desde el menú
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Enter' && gameState === 'menu') {
      startGame();
    }
  });

  function endGame(title) {
    const titleEl = document.getElementById('result-title');
    const subEl = document.getElementById('result-sub');
    titleEl.textContent = title;
    subEl.textContent = gameMode.type === 'classic' ? `Marcador ${left.score} - ${right.score}` :
      `Tiempo agotado · ${left.score} - ${right.score}`;
    gameState = 'gameover';
    gameoverEl.style.display = 'flex';
  }

  restartBtn && restartBtn.addEventListener('click', () => {
    gameoverEl.style.display = 'none';
    left.score = 0; right.score = 0; updateScore();
    left.y = FIELD.centerY - PADDLE.height / 2;
    right.y = FIELD.centerY - PADDLE.height / 2;
    ball = resetBall(Math.random() < 0.5 ? -1 : +1);
    if (gameMode.type === 'time') gameMode.timeLeft = gameMode.duration;
    gameState = 'playing';
    paused = false;
  });

  backToMenuBtn && backToMenuBtn.addEventListener('click', () => {
    gameoverEl.style.display = 'none';
    menuEl.style.display = 'flex';
    gameState = 'menu';
  });
})();


