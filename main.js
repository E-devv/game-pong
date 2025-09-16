(function () {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreLeftEl = document.getElementById('score-left');
  const scoreRightEl = document.getElementById('score-right');

  const FIELD = { width: canvas.width, height: canvas.height, centerX: canvas.width / 2, centerY: canvas.height / 2 };
  const COLORS = { bg: '#000', mid: '#2e2e2e', paddle: '#eaeaea', ball: '#eaeaea' };

  const PADDLE = { width: 12, height: 80, speed: 340 };
  const BALL = { radius: 7, speed: 320, speedMax: 520, accelOnHit: 1.05 };

  let left = { x: 24, y: FIELD.centerY - PADDLE.height / 2, vy: 0, score: 0 };
  let right = { x: FIELD.width - 24 - PADDLE.width, y: FIELD.centerY - PADDLE.height / 2, vy: 0, score: 0 };
  let ball = resetBall(+1);

  let keyState = { up: false, down: false, w: false, s: false };
  let paused = false;
  let lastTs = undefined;

  function resetBall(direction) {
    const angle = (Math.random() * 0.6 - 0.3) * Math.PI; // tilt small
    const speed = BALL.speed;
    return {
      x: FIELD.centerX,
      y: FIELD.centerY,
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
    drawNet();
    drawRect(left.x, left.y, PADDLE.width, PADDLE.height, COLORS.paddle);
    drawRect(right.x, right.y, PADDLE.width, PADDLE.height, COLORS.paddle);
    drawCircle(ball.x, ball.y, BALL.radius, COLORS.ball);
  }

  function update(dt) {
    // player input
    const upPressed = keyState.up || keyState.w;
    const downPressed = keyState.down || keyState.s;
    left.vy = 0;
    if (upPressed) left.vy -= PADDLE.speed;
    if (downPressed) left.vy += PADDLE.speed;
    left.y = clamp(left.y + left.vy * dt, 0, FIELD.height - PADDLE.height);

    // simple AI for right paddle
    const targetY = ball.y - PADDLE.height / 2;
    const aiSpeed = PADDLE.speed * 0.92;
    if (right.y + 4 < targetY) right.y += aiSpeed * dt;
    else if (right.y - 4 > targetY) right.y -= aiSpeed * dt;
    right.y = clamp(right.y, 0, FIELD.height - PADDLE.height);

    // move ball
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

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
  }

  function updateScore() {
    scoreLeftEl.textContent = String(left.score);
    scoreRightEl.textContent = String(right.score);
  }

  function loop(ts) {
    if (lastTs === undefined) lastTs = ts;
    const dt = Math.min(0.033, (ts - lastTs) / 1000);
    lastTs = ts;
    if (!paused) {
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
    if (e.code === 'Space') paused = !paused;
    if (e.code === 'KeyR') {
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
})();


