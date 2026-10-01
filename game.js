(() => {
  const TILE = 48;
  const PLAYER_SIZE = 30;
  const COLLECT_TYPES = {
    '📜': { score: 10, heal: 0 },
    '🍑': { score: 15, heal: 15 },
  };

  const levels = [
    {
      name: '花果山',
      story: '第一关·花果山：猴群送来经文，注意石阵与巡山小妖。',
      map: [
        '###############',
        '#S....📜....T..#',
        '#.###.####.###.#',
        '#...#......#...#',
        '#.T.#.🍑.E.#.📜.#',
        '#...#.####.#...#',
        '#...#......#..G#',
        '###############',
      ],
    },
    {
      name: '白骨岭',
      story: '第二关·白骨岭：白骨精设伏，陷阱与敌人更密集。',
      map: [
        '###############',
        '#S..T..📜...E..#',
        '#.#####.#####..#',
        '#.....#...T.#..#',
        '#.📜.#.#.###.#🍑#',
        '#..E.#.#.....#.#',
        '#....#...T...#G#',
        '###############',
      ],
    },
    {
      name: '火焰山',
      story: '第三关·火焰山：烈焰灼路，速取经文后冲刺终点。',
      map: [
        '###############',
        '#S.T.E...📜.T..#',
        '#.#####.#####..#',
        '#..🍑..#...E#..#',
        '#.###.#.###.#..#',
        '#.📜..#..T..#..#',
        '#....E....📜..G#',
        '###############',
      ],
    },
  ];

  class Game {
    constructor() {
      this.canvas = document.getElementById('gameCanvas');
      this.ctx = this.canvas.getContext('2d');
      this.levelLabel = document.getElementById('levelLabel');
      this.hpLabel = document.getElementById('hpLabel');
      this.scoreLabel = document.getElementById('scoreLabel');
      this.stateLabel = document.getElementById('stateLabel');
      this.storyText = document.getElementById('storyText');

      this.keys = { up: false, down: false, left: false, right: false };
      this.state = 'idle';
      this.levelIndex = 0;
      this.score = 0;
      this.hp = 100;
      this.damageCooldown = 0;
      this.lastTime = 0;

      this.bindControls();
      this.resetLevel();
      this.resizeCanvas();
      window.addEventListener('resize', () => this.resizeCanvas());
      window.addEventListener('blur', () => {
        if (this.state === 'running') {
          this.state = 'paused';
          this.render();
          this.updateHud('已暂停');
        }
      });
      requestAnimationFrame((time) => this.loop(time));
    }

    bindControls() {
      const onKey = (pressed) => (event) => {
        const k = event.key.toLowerCase();
        if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(k)) {
          event.preventDefault();
        }
        if (k === 'arrowup' || k === 'w') this.keys.up = pressed;
        if (k === 'arrowdown' || k === 's') this.keys.down = pressed;
        if (k === 'arrowleft' || k === 'a') this.keys.left = pressed;
        if (k === 'arrowright' || k === 'd') this.keys.right = pressed;
      };

      window.addEventListener('keydown', onKey(true), { passive: false });
      window.addEventListener('keyup', onKey(false), { passive: false });

      const touchBtns = document.querySelectorAll('.mobile-controls [data-dir]');
      touchBtns.forEach((btn) => {
        const dir = btn.dataset.dir;
        const setKey = (val) => {
          this.keys[dir] = val;
        };
        ['pointerdown', 'pointerenter'].forEach((evt) => {
          btn.addEventListener(evt, (e) => {
            e.preventDefault();
            setKey(true);
          });
        });
        ['pointerup', 'pointercancel', 'pointerleave'].forEach((evt) => {
          btn.addEventListener(evt, (e) => {
            e.preventDefault();
            setKey(false);
          });
        });
      });

      document.body.addEventListener(
        'touchmove',
        (e) => {
          if (e.target.closest('.game-page')) e.preventDefault();
        },
        { passive: false },
      );

      document.getElementById('startBtn').addEventListener('click', () => {
        if (this.state === 'idle') {
          this.state = 'running';
          this.updateHud('闯关中');
          return;
        }
        if (this.state === 'gameOver' || this.state === 'victory') {
          this.restartAll();
          this.state = 'running';
          this.updateHud('闯关中');
        }
      });

      document.getElementById('pauseBtn').addEventListener('click', () => {
        if (this.state === 'running') {
          this.state = 'paused';
          this.updateHud('已暂停');
        } else if (this.state === 'paused') {
          this.state = 'running';
          this.updateHud('闯关中');
        }
      });

      document.getElementById('restartBtn').addEventListener('click', () => {
        this.restartAll();
        this.updateHud('待命');
      });
    }

    restartAll() {
      this.levelIndex = 0;
      this.hp = 100;
      this.score = 0;
      this.state = 'idle';
      this.resetLevel();
      this.render();
    }

    resetLevel() {
      const level = levels[this.levelIndex];
      this.storyText.textContent = `${level.story}（${level.name}）`;
      this.rows = level.map.length;
      this.cols = level.map[0].length;
      this.worldW = this.cols * TILE;
      this.worldH = this.rows * TILE;
      this.canvas.width = this.worldW;
      this.canvas.height = this.worldH;

      this.walls = [];
      this.traps = [];
      this.collects = [];
      this.enemies = [];
      this.goal = null;
      this.player = { x: 0, y: 0, w: PLAYER_SIZE, h: PLAYER_SIZE, speed: 170 };

      level.map.forEach((line, y) => {
        [...line].forEach((cell, x) => {
          const px = x * TILE;
          const py = y * TILE;
          const rect = { x: px, y: py, w: TILE, h: TILE };

          if (cell === '#') this.walls.push(rect);
          if (cell === 'S') {
            this.player.x = px + (TILE - PLAYER_SIZE) / 2;
            this.player.y = py + (TILE - PLAYER_SIZE) / 2;
          }
          if (cell === 'T') this.traps.push(rect);
          if (cell === 'E') {
            this.enemies.push({
              x: px + 8,
              y: py + 8,
              w: TILE - 16,
              h: TILE - 16,
              baseX: px + 8,
              dir: Math.random() > 0.5 ? 1 : -1,
              range: 40 + this.levelIndex * 20,
              speed: 70 + this.levelIndex * 25,
            });
          }
          if (cell === 'G') this.goal = rect;
          if (COLLECT_TYPES[cell]) {
            this.collects.push({
              x: px + 10,
              y: py + 8,
              w: TILE - 20,
              h: TILE - 16,
              icon: cell,
              active: true,
            });
          }
        });
      });

      this.levelLabel.textContent = `${this.levelIndex + 1}/${levels.length}`;
      this.updateHud(this.stateLabel.textContent || '待命');
    }

    resizeCanvas() {
      const wrap = document.querySelector('.board-wrap');
      const maxWidth = Math.min(wrap.clientWidth - 20, this.worldW || 720);
      const ratio = (this.worldH || 432) / (this.worldW || 720);
      this.canvas.style.width = `${Math.max(280, maxWidth)}px`;
      this.canvas.style.height = `${Math.max(180, maxWidth * ratio)}px`;
    }

    updateHud(status) {
      this.hpLabel.textContent = String(this.hp);
      this.scoreLabel.textContent = String(this.score);
      this.stateLabel.textContent = status;
    }

    loop(time) {
      const dt = Math.min((time - this.lastTime) / 1000, 0.04);
      this.lastTime = time;

      if (this.state === 'running') {
        this.update(dt);
      }
      this.render();
      requestAnimationFrame((t) => this.loop(t));
    }

    rectHit(a, b) {
      return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }

    canMove(rect) {
      return !this.walls.some((wall) => this.rectHit(rect, wall));
    }

    update(dt) {
      const dirX = Number(this.keys.right) - Number(this.keys.left);
      const dirY = Number(this.keys.down) - Number(this.keys.up);

      if (dirX || dirY) {
        const len = Math.hypot(dirX, dirY) || 1;
        const stepX = (dirX / len) * this.player.speed * dt;
        const stepY = (dirY / len) * this.player.speed * dt;

        const tryX = { ...this.player, x: this.player.x + stepX };
        if (this.canMove(tryX)) this.player.x = tryX.x;

        const tryY = { ...this.player, y: this.player.y + stepY };
        if (this.canMove(tryY)) this.player.y = tryY.y;
      }

      this.enemies.forEach((enemy) => {
        enemy.x += enemy.dir * enemy.speed * dt;
        if (enemy.x > enemy.baseX + enemy.range || enemy.x < enemy.baseX - enemy.range) enemy.dir *= -1;
      });

      this.damageCooldown = Math.max(0, this.damageCooldown - dt);
      const hurtByTrap = this.traps.some((t) => this.rectHit(this.player, { ...t, x: t.x + 6, y: t.y + 6, w: t.w - 12, h: t.h - 12 }));
      const hurtByEnemy = this.enemies.some((e) => this.rectHit(this.player, e));
      if ((hurtByTrap || hurtByEnemy) && this.damageCooldown === 0) {
        this.hp = Math.max(0, this.hp - 12);
        this.damageCooldown = 0.8;
        this.updateHud('受伤中');
      }

      this.collects.forEach((item) => {
        if (item.active && this.rectHit(this.player, item)) {
          item.active = false;
          const effect = COLLECT_TYPES[item.icon];
          this.score += effect.score;
          this.hp = Math.min(100, this.hp + effect.heal);
          this.updateHud('拾取成功');
        }
      });

      if (this.hp <= 0) {
        this.state = 'gameOver';
        this.updateHud('闯关失败');
        return;
      }

      if (this.goal && this.rectHit(this.player, this.goal)) {
        this.score += 20 + this.levelIndex * 10;
        if (this.levelIndex < levels.length - 1) {
          this.levelIndex += 1;
          this.resetLevel();
          this.state = 'running';
          this.updateHud('进入下一关');
        } else {
          this.state = 'victory';
          this.updateHud('通关成功');
        }
      } else if (this.state === 'running') {
        this.updateHud('闯关中');
      }
    }

    render() {
      const { ctx } = this;
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      this.walls.forEach((r) => {
        ctx.fillStyle = '#334155';
        ctx.fillRect(r.x, r.y, r.w, r.h);
      });

      this.traps.forEach((r) => {
        ctx.fillStyle = '#b91c1c';
        ctx.fillRect(r.x + 12, r.y + 12, r.w - 24, r.h - 24);
      });

      this.collects.forEach((c) => {
        if (!c.active) return;
        ctx.font = '28px sans-serif';
        ctx.fillText(c.icon, c.x + 2, c.y + c.h);
      });

      this.enemies.forEach((e) => {
        ctx.fillStyle = '#9333ea';
        ctx.fillRect(e.x, e.y, e.w, e.h);
        ctx.font = '22px sans-serif';
        ctx.fillText('👹', e.x + 6, e.y + e.h - 4);
      });

      if (this.goal) {
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(this.goal.x + 10, this.goal.y + 10, this.goal.w - 20, this.goal.h - 20);
        ctx.font = '24px sans-serif';
        ctx.fillText('🚩', this.goal.x + 10, this.goal.y + this.goal.h - 10);
      }

      ctx.fillStyle = '#f97316';
      ctx.fillRect(this.player.x, this.player.y, this.player.w, this.player.h);
      ctx.font = '24px sans-serif';
      ctx.fillText('🐵', this.player.x + 2, this.player.y + this.player.h - 4);

      if (this.state === 'idle' || this.state === 'paused' || this.state === 'gameOver' || this.state === 'victory') {
        const labelMap = {
          idle: '点击“开始”踏上西行路',
          paused: '已暂停，点击“暂停”继续',
          gameOver: '血量耗尽，点击“开始”再战',
          victory: `功德圆满！总分 ${this.score}`,
        };
        ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
        ctx.fillRect(0, this.canvas.height / 2 - 30, this.canvas.width, 60);
        ctx.fillStyle = '#f8fafc';
        ctx.font = '24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(labelMap[this.state], this.canvas.width / 2, this.canvas.height / 2 + 8);
        ctx.textAlign = 'start';
      }
    }
  }

  new Game();
})();
