/**
 * 动动菌友荟 v2 — 移动端真菌世界生活模拟小游戏
 * Dong Dong Jun You Hui — Mobile Myco-Life Simulation Game
 *
 * Changelog v2:
 *   - 命名规范化（缩写变量全改可读命名）
 *   - 状态分层（GameState / WorldState / UIState）
 *   - 经济系统：资源耗尽与重生机制
 *   - 商店系统：出售物品换取蘑菇币
 *   - 存档版本管理
 */

// ============================================================
// CONSTANTS
// ============================================================
const TILE = 32, MAP_W = 25, MAP_H = 20;
const TILE_GRASS = 0, TILE_PATH = 1, TILE_WATER = 2, TILE_TREE = 3,
      TILE_MUSHROOM = 4, TILE_ROCK = 5, TILE_SAND = 6, TILE_BRIDGE = 7,
      TILE_PLAYER_HOUSE = 8, TILE_NPC_HOUSE = 9, TILE_SHOP = 10,
      TILE_FAIRY_RING = 11, TILE_LOG = 12;
const DIR = { UP: 0, DOWN: 1, LEFT: 2, RIGHT: 3, NONE: -1 };
const MAX_INVENTORY = 16, MAX_STACK = 99;
const SAVE_VERSION = 2;
const SAVE_KEY = 'dongdongjun_save';

/** 资源重生时间（游戏内小时） */
const RESPAWN_HOURS = {
  MUSHROOM: 2,
  TREE: 4,
  ROCK: 12,
  LOG: 6,
  FAIRY_RING: 24,
};

// ============================================================
// AUDIO SYSTEM (Web Audio API, 程序化生成音效)
// ============================================================
const sfx = (() => {
  let audioCtx = null;
  function getCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  function tone(freq, dur, vol = 0.1, type = 'sine') {
    try {
      const ac = getCtx(), o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
      o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + dur);
    } catch (e) { /* noop */ }
  }
  function noise(freq, dur, vol = 0.04) {
    try {
      const ac = getCtx();
      const buf = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.02));
      const src = ac.createBufferSource(), gain = ac.createGain(), flt = ac.createBiquadFilter();
      src.buffer = buf; flt.type = 'bandpass'; flt.frequency.value = freq; flt.Q.value = 0.5;
      gain.gain.setValueAtTime(vol, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
      src.connect(flt); flt.connect(gain); gain.connect(ac.destination); src.start(); src.stop(ac.currentTime + dur);
    } catch (e) { /* noop */ }
  }
  return {
    pop:      () => { tone(1200, 0.06, 0.08); setTimeout(() => tone(1600, 0.06, 0.06), 40); },
    poison:   () => { tone(60, 0.4, 0.15, 'sawtooth'); setTimeout(() => tone(55, 0.35, 0.12, 'sawtooth'), 50); noise(200, 0.3, 0.06); },
    poisonWarn: () => { tone(200, 0.15, 0.08, 'square'); setTimeout(() => tone(150, 0.2, 0.07, 'square'), 80); },
    error:    () => { tone(120, 0.15, 0.08, 'square'); tone(100, 0.15, 0.07, 'square'); },
    chat:     () => { tone(660, 0.08, 0.06); setTimeout(() => tone(880, 0.1, 0.05), 60); },
    hop:      () => { tone(260, 0.05, 0.03); setTimeout(() => tone(350, 0.04, 0.02), 25); },
    magic:    () => { tone(1047, 0.06, 0.06); setTimeout(() => tone(1319, 0.06, 0.05), 50); setTimeout(() => tone(1568, 0.06, 0.04), 100); setTimeout(() => tone(2093, 0.08, 0.03), 150); },
    thud:     () => { tone(80, 0.12, 0.1, 'triangle'); noise(100, 0.1, 0.05); },
    rustle:   () => { noise(800, 0.15, 0.04); setTimeout(() => noise(600, 0.1, 0.03), 50); },
    squish:   () => { tone(300, 0.08, 0.07, 'triangle'); setTimeout(() => tone(200, 0.06, 0.05, 'triangle'), 40); },
    nothing:  () => { noise(3000, 0.2, 0.02); },
    sell:     () => { tone(523, 0.08, 0.07); setTimeout(() => tone(659, 0.08, 0.06), 60); setTimeout(() => tone(784, 0.1, 0.05), 120); },
  };
})();

// ============================================================
// GAME DATA: 物品定义
// ============================================================
const ITEMS = {
  shiitake:  { name: '香菇',   emoji: '🍄',  value: 60,  type: 'mushroom' },
  enoki:     { name: '金针菇', emoji: '🍄',  value: 65,  type: 'mushroom' },
  oyster:    { name: '平菇',   emoji: '🍄',  value: 70,  type: 'mushroom' },
  porcini:   { name: '牛肝菌', emoji: '🍄',  value: 200, type: 'rare_mushroom' },
  termite:   { name: '鸡枞菌', emoji: '🍄',  value: 250, type: 'rare_mushroom' },
  matsutake: { name: '松茸',   emoji: '🍄',  value: 350, type: 'rare_mushroom' },
  truffle:   { name: '松露',   emoji: '🏵️',  value: 500, type: 'legendary' },
  spore:     { name: '孢子',   emoji: '✨',  value: 50,  type: 'spore' },
  mycelium:  { name: '菌丝',   emoji: '🕸️',  value: 35,  type: 'material' },
  rotwood:   { name: '腐木',   emoji: '🪵',  value: 40,  type: 'material' },
  moss:      { name: '苔藓',   emoji: '🌿',  value: 30,  type: 'material' },
  dew:       { name: '露水',   emoji: '💧',  value: 45,  type: 'material' },
  firefly:   { name: '萤火虫', emoji: '🪲',  value: 150, type: 'bug' },
  poison:    { name: '毒蘑菇', emoji: '☠️',  value: 0,   type: 'poison' },
};

// ============================================================
// GAME DATA: NPC 定义
// ============================================================
const NPC_DEFS = [
  { id: 'rongrong', name: '茸茸',   emoji: '🍄', color: '#f5e6c8', homeX: 18, homeY: 5,  likes: ['rotwood', 'dew'],           gift: 'spore',     dialogues: ['你好呀～我是茸茸，金针菇家族的一员！','菌丝网络把我们都联结在一起呢……','夜晚的露水让菌褶特别晶莹～','太感谢了！这是回礼～ ✨'] },
  { id: 'lulu',     name: '露露',   emoji: '🍄', color: '#c8f5c8', homeX: 17, homeY: 4,  likes: ['moss', 'dew'],              gift: 'firefly',   dialogues: ['嘘……到晚上我就能发光啦！','真菌的荧光素酶可是很神奇的～','这片苔藓摸起来好舒服……','哇谢谢！晚上来看我发光吧～ 🪲'] },
  { id: 'pangpang', name: '胖胖',   emoji: '🍄', color: '#d4a574', homeX: 6,  homeY: 16, likes: ['rotwood', 'moss'],           gift: 'porcini',   dialogues: ['我和老橡树的根是好朋友！','菌根共生，树给我糖，我给树矿物～','好吃的腐木让我的菌丝更强壮！','噢！这个礼物太好了，树下挖到的送你～ 🍄'] },
  { id: 'sisi',     name: '丝丝',   emoji: '🕸️', color: '#e8e0d0', homeX: 17, homeY: 16, likes: ['rotwood', 'spore'],          gift: 'matsutake', dialogues: ['我是菌丝网络的一部分……','地下几千公里的菌丝联结整个菌林。','孢子随风飘散，新生命就此开始……','看来你明白网络的珍贵……收下这个 🍄'] },
];

// ============================================================
// MAP GENERATION
// ============================================================
function createMap() {
  const m = [];
  for (let y = 0; y < MAP_H; y++) { m[y] = []; for (let x = 0; x < MAP_W; x++) m[y][x] = TILE_GRASS; }
  for (let x = 0; x < MAP_W; x++) m[10][x] = TILE_PATH;
  for (let y = 7; y <= 14; y++) m[y][12] = TILE_PATH;
  for (let x = 0; x <= 6; x++) { m[6][x] = TILE_PATH; m[11][x] = TILE_PATH; }
  for (let x = 19; x < MAP_W; x++) { m[4][x] = TILE_PATH; m[16][x] = TILE_PATH; }
  for (let x = 7; x <= 19; x++) { m[14][x] = TILE_PATH; }
  m[6][5] = TILE_PLAYER_HOUSE;
  m[5][18] = TILE_NPC_HOUSE; m[4][17] = TILE_NPC_HOUSE; m[16][6] = TILE_NPC_HOUSE; m[16][17] = TILE_NPC_HOUSE;
  m[11][3] = TILE_SHOP;
  const water = [[3,0],[3,1],[4,1],[3,2],[22,4],[23,4],[22,5],[23,5],[24,5],[19,17],[20,17],[19,18],[20,18],[21,18],[0,8],[0,9],[0,10],[1,10],[2,19],[3,19],[4,19]];
  for (const [x, y] of water) if (m[y][x] === TILE_GRASS) m[y][x] = TILE_WATER;
  const sand = [[2,0],[5,1],[21,3],[24,3],[18,16],[18,17],[18,18],[22,18],[5,19]];
  for (const [x, y] of sand) if (m[y][x] === TILE_GRASS) m[y][x] = TILE_SAND;
  const bridges = [[0,8],[1,9],[22,6],[23,19],[20,19]];
  for (const [x, y] of bridges) if (m[y][x] === TILE_SAND) m[y][x] = TILE_BRIDGE;
  const trees = [[2,2],[5,2],[8,2],[11,2],[13,2],[16,2],[19,2],[23,2],[2,5],[6,6],[9,6],[15,6],[19,6],[22,6],[2,8],[5,8],[10,8],[16,8],[20,8],[2,11],[5,11],[9,11],[14,11],[18,11],[22,11],[2,13],[5,13],[12,13],[16,13],[20,13],[23,13],[2,15],[6,15],[10,15],[15,15],[19,15],[23,15],[3,18],[7,18],[11,18],[15,18],[23,18]];
  for (const [x, y] of trees) if (m[y][x] === TILE_GRASS) m[y][x] = TILE_TREE;
  const shrooms = [[1,3],[3,3],[6,3],[12,3],[18,3],[21,3],[1,7],[4,7],[14,7],[18,7],[21,7],[1,9],[4,9],[14,9],[18,9],[21,9],[1,13],[12,14],[18,14],[21,13],[8,17],[10,17],[22,17]];
  for (const [x, y] of shrooms) if (m[y][x] === TILE_GRASS) m[y][x] = TILE_MUSHROOM;
  for (const [x, y] of [[3,4],[15,12],[21,8],[8,15]]) if (m[y][x] === TILE_GRASS) m[y][x] = TILE_LOG;
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) {
    const rx = Math.round(12 + Math.cos(a) * 2), ry = Math.round(5 + Math.sin(a) * 2);
    if (rx >= 0 && rx < MAP_W && ry >= 0 && ry < MAP_H && m[ry][rx] === TILE_GRASS) m[ry][rx] = TILE_FAIRY_RING;
  }
  for (const [x, y] of [[3,11],[14,11],[20,8],[8,14],[14,3]]) if (m[y][x] === TILE_GRASS) m[y][x] = TILE_ROCK;
  return m;
}

let baseMapData = null;  // 不可变模板（用于重生时知道原始 tile 类型）
let mapData = createMap();

// ============================================================
// GAME STATE (分层)
// ============================================================

/** 持久化游戏状态 */
const GameState = {
  bells: 0,
  inventory: {},
  playerName: '',
  gameTime: 8,
  totalGameTime: 8,
  timeSpeed: 0.003,
  poisonTimer: 0,
  shakeTimer: 0,
  shakeIntensity: 0,
  tileTimers: {},
};

/** 世界实体状态 */
const WorldState = {
  player: null,
  npcs: [],
  groundItems: [],
  particles: [],
};

/** UI 状态 */
const UIState = {
  dialog: null,
  isDialogOpen: false,
  isInventoryOpen: false,
  isShopOpen: false,
  notice: null,
  noticeTimer: 0,
  lastInteraction: 0,
};

/** 运行时引用 */
const Game = {
  canvas: null, ctx: null, width: 0, height: 0,
  camera: { x: 0, y: 0 },
  joystickDir: DIR.NONE,
  tick: 0,
  _paused: false,
};

// ============================================================
// MOBILE OPTIMIZATIONS
// ============================================================
(function initMobile() {
  document.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  document.addEventListener('gesturechange', function (e) { e.preventDefault(); });
  document.addEventListener('gestureend', function (e) { e.preventDefault(); });

  Game._paused = false;
  document.addEventListener('visibilitychange', function () { Game._paused = document.hidden; });

  function checkOrientation() {
    const hint = document.getElementById('orientation-hint');
    hint.style.display = (window.innerWidth > window.innerHeight) ? 'flex' : 'none';
  }
  checkOrientation();
  window.addEventListener('resize', checkOrientation);
  window.addEventListener('orientationchange', checkOrientation);
})();

// ============================================================
// CLASS: Player
// ============================================================
class Player {
  constructor() {
    this.x = 5 * TILE + TILE / 2;
    this.y = 8 * TILE + TILE / 2;
    this.w = 20; this.h = 24;
    this.speed = 2;
    this.dir = DIR.DOWN;
    this.walkFrame = 0;
    this.prevWalk = 0;
    this.isWalking = false;
  }
  getTileX() { return Math.floor(this.x / TILE); }
  getTileY() { return Math.floor(this.y / TILE); }
  getCenterX() { return this.x; }
  getCenterY() { return this.y - 4; }

  update() {
    if (UIState.isDialogOpen || UIState.isInventoryOpen || UIState.isShopOpen) return;
    const dir = Game.joystickDir;
    if (dir === DIR.NONE) { this.isWalking = false; return; }
    this.isWalking = true; this.dir = dir;
    this.prevWalk = this.walkFrame;
    this.walkFrame = (this.walkFrame + 0.15) % 1;
    if (this.walkFrame < this.prevWalk) sfx.hop();

    let nx = this.x, ny = this.y;
    switch (dir) {
      case DIR.UP: ny -= this.speed; break;
      case DIR.DOWN: ny += this.speed; break;
      case DIR.LEFT: nx -= this.speed; break;
      case DIR.RIGHT: nx += this.speed; break;
    }
    const hw = this.w / 2, hh = this.h / 2;
    const blockers = [TILE_WATER, TILE_ROCK, TILE_TREE, TILE_PLAYER_HOUSE, TILE_NPC_HOUSE, TILE_SHOP];

    const corners = [[nx - hw, ny - hh + 4], [nx + hw - 1, ny - hh + 4], [nx - hw, ny + hh - 4], [nx + hw - 1, ny + hh - 4]];
    let blocked = false;
    for (const [cx, cy] of corners) {
      const ctx = Math.floor(cx / TILE), cty = Math.floor(cy / TILE);
      if (ctx < 0 || ctx >= MAP_W || cty < 0 || cty >= MAP_H) { blocked = true; break; }
      if (blockers.includes(mapData[cty][ctx])) { blocked = true; break; }
    }
    if (!blocked) { this.x = nx; this.y = ny; return; }

    let slideY = false;
    for (const [cx, cy] of [[this.x - hw, ny - hh + 4], [this.x + hw - 1, ny - hh + 4], [this.x - hw, ny + hh - 4], [this.x + hw - 1, ny + hh - 4]]) {
      const ctx = Math.floor(cx / TILE), cty = Math.floor(cy / TILE);
      if (ctx < 0 || ctx >= MAP_W || cty < 0 || cty >= MAP_H) { slideY = true; break; }
      if (blockers.includes(mapData[cty][ctx])) { slideY = true; break; }
    }
    if (!slideY) this.y = ny;

    let slideX = false;
    for (const [cx, cy] of [[nx - hw, this.y - hh + 4], [nx + hw - 1, this.y - hh + 4], [nx - hw, this.y + hh - 4], [nx + hw - 1, this.y + hh - 4]]) {
      const ctx = Math.floor(cx / TILE), cty = Math.floor(cy / TILE);
      if (ctx < 0 || ctx >= MAP_W || cty < 0 || cty >= MAP_H) { slideX = true; break; }
      if (blockers.includes(mapData[cty][ctx])) { slideX = true; break; }
    }
    if (!slideX) this.x = nx;
  }
}

// ============================================================
// CLASS: NPC
// ============================================================
class NPC {
  constructor(def) {
    this.def = def;
    this.x = def.homeX * TILE + TILE / 2;
    this.y = def.homeY * TILE + TILE / 2;
    this.w = 20; this.h = 24;
    this.dir = DIR.DOWN;
    this.walkFrame = 0;
    this.isWalking = false;
    this.wanderTimer = Math.random() * 120;
    this.wanderDir = DIR.NONE;
    this.speed = 0.6;
    this.gifted = false;
    this.cooldown = 0;
    this.giftCooldown = 0;
  }

  update() {
    if (UIState.isDialogOpen || UIState.isInventoryOpen || UIState.isShopOpen) return;
    if (this.cooldown > 0) this.cooldown--;
    if (this.giftCooldown > 0) { this.giftCooldown--; if (this.giftCooldown === 0) this.gifted = false; }
    this.wanderTimer--;
    if (this.wanderTimer <= 0) { this.wanderTimer = 60 + Math.random() * 180; this.wanderDir = Math.floor(Math.random() * 4); }
    if (this.wanderDir === DIR.NONE) { this.isWalking = false; return; }
    this.isWalking = true; this.dir = this.wanderDir;
    this.walkFrame = (this.walkFrame + 0.08) % 1;
    let nx = this.x, ny = this.y;
    switch (this.wanderDir) {
      case DIR.UP: ny -= this.speed; break;
      case DIR.DOWN: ny += this.speed; break;
      case DIR.LEFT: nx -= this.speed; break;
      case DIR.RIGHT: nx += this.speed; break;
    }
    const tx = Math.floor(nx / TILE), ty = Math.floor(ny / TILE);
    if (tx >= 0 && tx < MAP_W && ty >= 0 && ty < MAP_H) {
      const t = mapData[ty][tx];
      if (t !== TILE_WATER && t !== TILE_ROCK && t !== TILE_TREE && t !== TILE_PLAYER_HOUSE && t !== TILE_NPC_HOUSE) {
        this.x = nx; this.y = ny;
      }
    }
    const dx = this.x - this.def.homeX * TILE, dy = this.y - this.def.homeY * TILE;
    if (Math.abs(dx) > 3 * TILE || Math.abs(dy) > 3 * TILE) this.wanderTimer = 5;
  }

  interact() {
    if (this.cooldown > 0) return;
    this.cooldown = 30;
    const def = this.def;
    const rd = def.dialogues[Math.floor(Math.random() * (def.dialogues.length - 1))];
    let likedItem = null;
    for (const itemId of def.likes) {
      if (GameState.inventory[itemId] && GameState.inventory[itemId] > 0) { likedItem = itemId; break; }
    }
    if (likedItem && !this.gifted) {
      GameState.inventory[likedItem]--;
      if (GameState.inventory[likedItem] <= 0) delete GameState.inventory[likedItem];
      if (!GameState.inventory[def.gift]) GameState.inventory[def.gift] = 0;
      GameState.inventory[def.gift]++;
      this.gifted = true;
      this.giftCooldown = 1200;
      showDialog(def.name, `哇！是${ITEMS[likedItem].name}${ITEMS[likedItem].emoji}！正好是我需要的！\n${def.dialogues[3]}`);
    } else if (this.gifted) {
      showDialog(def.name, '礼物冷却中，过会儿再来找我吧～');
    } else {
      showDialog(def.name, rd);
    }
  }
}

// ============================================================
// CLASS: GroundItem & Particle
// ============================================================
class GroundItem {
  constructor(x, y, itemId) {
    this.x = x; this.y = y; this.itemId = itemId;
    this.bobOffset = Math.random() * Math.PI * 2;
    this.life = 600;
  }
  update() { this.life--; return this.life > 0; }
}

class Particle {
  constructor(x, y, emoji) {
    this.x = x; this.y = y; this.emoji = emoji;
    this.vy = -2 - Math.random() * 2;
    this.vx = (Math.random() - 0.5) * 2;
    this.life = 30; this.alpha = 1;
  }
  update() { this.x += this.vx; this.y += this.vy; this.vy += 0.1; this.life--; this.alpha = this.life / 30; return this.life > 0; }
}

// ============================================================
// ECONOMY: 资源耗尽与重生
// ============================================================

function getDepletedTile(originalTile) {
  if (originalTile === TILE_MUSHROOM) return TILE_GRASS;
  if (originalTile === TILE_LOG) return TILE_GRASS;
  return originalTile;
}

function isResourceDepleted(tx, ty) {
  return (`${tx},${ty}`) in GameState.tileTimers;
}

function depleteResource(tx, ty, respawnHours) {
  const key = `${tx},${ty}`;
  const originalTile = baseMapData[ty][tx];
  GameState.tileTimers[key] = {
    originalTile: originalTile,
    respawnAt: GameState.totalGameTime + respawnHours,
  };
  const depletedTile = getDepletedTile(originalTile);
  if (depletedTile !== originalTile) {
    mapData[ty][tx] = depletedTile;
  }
}

function checkRespawns() {
  const now = GameState.totalGameTime;
  const keys = Object.keys(GameState.tileTimers);
  for (const key of keys) {
    const timer = GameState.tileTimers[key];
    if (now >= timer.respawnAt) {
      const [tx, ty] = key.split(',').map(Number);
      mapData[ty][tx] = timer.originalTile;
      delete GameState.tileTimers[key];
    }
  }
}

function applyTileTimers() {
  for (const [key, timer] of Object.entries(GameState.tileTimers)) {
    const [tx, ty] = key.split(',').map(Number);
    if (GameState.totalGameTime >= timer.respawnAt) {
      mapData[ty][tx] = timer.originalTile;
      delete GameState.tileTimers[key];
    } else {
      const depletedTile = getDepletedTile(timer.originalTile);
      if (depletedTile !== timer.originalTile) {
        mapData[ty][tx] = depletedTile;
      }
    }
  }
}

// ============================================================
// INTERACTION: 物品生成 / 采集 / 商店
// ============================================================

function spawnItem(x, y, itemId) {
  WorldState.groundItems.push(new GroundItem(x, y, itemId));
}

function collectNearbyItems() {
  const player = WorldState.player;
  const px = player.getCenterX(), py = player.getCenterY();
  const range = 40;
  let collected = false;
  for (const item of [...WorldState.groundItems]) {
    const dx = item.x - px, dy = item.y - py;
    if (Math.sqrt(dx * dx + dy * dy) < range) {
      const def = ITEMS[item.itemId];
      if (def.type === 'poison') {
        WorldState.groundItems = WorldState.groundItems.filter(i => i !== item);
        applyPoison();
        return;
      }
      if (!canAddItem(item.itemId)) { showNotice('🎒 背包已满！'); return; }
      if (!GameState.inventory[item.itemId]) GameState.inventory[item.itemId] = 0;
      GameState.inventory[item.itemId]++;
      GameState.bells += def.value;
      WorldState.groundItems = WorldState.groundItems.filter(i => i !== item);
      sfx.pop();
      showNotice(`${def.emoji} ${def.name}  +${def.value}🍄`);
      collected = true;
    }
  }
  if (!collected) { sfx.nothing(); showNotice('🤔 周围没有可拾取的物品……'); }
}

function harvestTree(tx, ty) {
  if (isResourceDepleted(tx, ty)) { showNotice('🌳 这棵树的菌根还在恢复中……'); sfx.nothing(); return; }
  const cx = tx * TILE + TILE / 2, cy = ty * TILE + TILE / 2;
  const r = Math.random();
  let itemId;
  if (r < 0.45) itemId = ['shiitake', 'enoki', 'oyster', 'spore'][Math.floor(Math.random() * 4)];
  else if (r < 0.75) itemId = ['mycelium', 'rotwood', 'moss', 'dew'][Math.floor(Math.random() * 4)];
  else if (r < 0.95) itemId = ['porcini', 'termite'][Math.floor(Math.random() * 2)];
  else if (r < 0.99) itemId = 'matsutake';
  else itemId = 'truffle';
  spawnItem(cx, cy - 6, itemId);
  WorldState.particles.push(new Particle(cx, cy, '🌿'));
  WorldState.particles.push(new Particle(cx + 6, cy - 4, '🍂'));
  sfx.rustle(); sfx.pop();
  depleteResource(tx, ty, RESPAWN_HOURS.TREE);
  showNotice(`🌳 树根下发现 ${ITEMS[itemId].emoji}${ITEMS[itemId].name}  +${ITEMS[itemId].value}🍄`);
}

function digRock(tx, ty) {
  if (isResourceDepleted(tx, ty)) { showNotice('🪨 这块石头已经翻过了，等明天吧～'); sfx.nothing(); return; }
  const cx = tx * TILE + TILE / 2, cy = ty * TILE + TILE / 2;
  const drops = ['spore', 'spore', 'mycelium', 'mycelium', 'rotwood', 'moss', 'dew'];
  const itemId = drops[Math.floor(Math.random() * drops.length)];
  spawnItem(cx + (Math.random() - 0.5) * 20, cy + (Math.random() - 0.5) * 10, itemId);
  WorldState.particles.push(new Particle(cx, cy, '💥'));
  sfx.thud(); sfx.pop();
  depleteResource(tx, ty, RESPAWN_HOURS.ROCK);
  showNotice(`翻出了 ${ITEMS[itemId].emoji}${ITEMS[itemId].name}  +${ITEMS[itemId].value}🍄`);
}

function harvestMushroom(tx, ty) {
  const cx = tx * TILE + TILE / 2, cy = ty * TILE + TILE / 2;
  const r = Math.random();
  if (r < 0.12) {
    sfx.nothing(); showNotice('🍄 这朵蘑菇已经枯萎了……');
    WorldState.particles.push(new Particle(cx, cy, '🥀'));
  } else if (r < 0.22) {
    spawnItem(cx, cy - 6, 'poison');
    WorldState.particles.push(new Particle(cx, cy, '☠️'));
    sfx.poisonWarn();
    showNotice('⚠️ 等等……这朵蘑菇颜色不对劲！');
  } else {
    const itemId = ['shiitake', 'enoki', 'oyster', 'spore', 'mycelium', 'dew'][Math.floor(Math.random() * 6)];
    spawnItem(cx, cy - 6, itemId);
    WorldState.particles.push(new Particle(cx, cy, '🍄'));
    sfx.squish(); sfx.pop();
    showNotice(`采到了 ${ITEMS[itemId].emoji}${ITEMS[itemId].name}  +${ITEMS[itemId].value}🍄`);
  }
  depleteResource(tx, ty, RESPAWN_HOURS.MUSHROOM);
}

function harvestLog(tx, ty) {
  const cx = tx * TILE + TILE / 2, cy = ty * TILE + TILE / 2;
  const r = Math.random();
  let itemId;
  if (r < 0.35) itemId = ['shiitake', 'oyster'][Math.floor(Math.random() * 2)];
  else if (r < 0.65) itemId = ['mycelium', 'rotwood'][Math.floor(Math.random() * 2)];
  else if (r < 0.85) itemId = 'porcini';
  else if (r < 0.96) itemId = 'matsutake';
  else itemId = 'truffle';
  spawnItem(cx, cy - 6, itemId);
  WorldState.particles.push(new Particle(cx, cy, '🍄'));
  WorldState.particles.push(new Particle(cx + 8, cy - 4, '🕸️'));
  sfx.rustle(); sfx.pop();
  depleteResource(tx, ty, RESPAWN_HOURS.LOG);
  showNotice(`腐木上长出了 ${ITEMS[itemId].emoji}${ITEMS[itemId].name}  +${ITEMS[itemId].value}🍄`);
}

function harvestFairyRing(tx, ty) {
  if (isResourceDepleted(tx, ty)) { showNotice('✨ 蘑菇圈的魔力尚未恢复……'); sfx.nothing(); return; }
  const cx = tx * TILE + TILE / 2, cy = ty * TILE + TILE / 2;
  const r = Math.random();
  if (r < 0.06) {
    sfx.poison();
    spawnItem(cx, cy - 6, 'poison');
    WorldState.particles.push(new Particle(cx - 5, cy, '💀'));
    WorldState.particles.push(new Particle(cx + 5, cy, '💀'));
    WorldState.particles.push(new Particle(cx, cy - 8, '🌀'));
    showNotice('💀 蘑菇圈被诅咒了！踩到了毒蘑菇！');
  } else if (r < 0.16) {
    WorldState.particles.push(new Particle(cx - 5, cy, '✨'));
    WorldState.particles.push(new Particle(cx + 5, cy, '✨'));
    sfx.nothing();
    showNotice('✨ 蘑菇圈什么也没给……也许下次？');
  } else {
    const itemId = ['porcini', 'termite', 'matsutake', 'truffle', 'spore', 'spore'][Math.floor(Math.random() * 6)];
    spawnItem(cx, cy - 6, itemId);
    WorldState.particles.push(new Particle(cx - 5, cy, '✨'));
    WorldState.particles.push(new Particle(cx + 5, cy, '✨'));
    WorldState.particles.push(new Particle(cx, cy - 8, '🌟'));
    sfx.magic(); sfx.pop();
    showNotice(`蘑菇圈的魔法！获得了 ${ITEMS[itemId].emoji}${ITEMS[itemId].name}  +${ITEMS[itemId].value}🍄`);
  }
  depleteResource(tx, ty, RESPAWN_HOURS.FAIRY_RING);
}

function interact() {
  if (UIState.isDialogOpen || UIState.isInventoryOpen || UIState.isShopOpen) return;
  if (Game.tick - UIState.lastInteraction < 30) return;
  UIState.lastInteraction = Game.tick;

  const player = WorldState.player;
  const px = player.getTileX(), py = player.getTileY();

  for (const npc of WorldState.npcs) {
    const nx = Math.floor(npc.x / TILE), ny = Math.floor(npc.y / TILE);
    if (Math.abs(nx - px) <= 1 && Math.abs(ny - py) <= 1) { npc.interact(); return; }
  }

  const neighbors = [[px, py - 1], [px, py + 1], [px - 1, py], [px + 1, py], [px, py]];
  for (const [tx, ty] of neighbors) {
    if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) continue;
    const tile = mapData[ty][tx];
    switch (tile) {
      case TILE_TREE:       harvestTree(tx, ty);      return;
      case TILE_ROCK:       digRock(tx, ty);          return;
      case TILE_MUSHROOM:   harvestMushroom(tx, ty);  return;
      case TILE_LOG:        harvestLog(tx, ty);       return;
      case TILE_FAIRY_RING: harvestFairyRing(tx, ty); return;
      case TILE_SHOP:       openShop();               return;
    }
  }
  collectNearbyItems();
}

function openShop() {
  UIState.isShopOpen = true;
  showDialog('🍄 蘑菇商店', '欢迎光临！打开背包，点击物品即可出售换取蘑菇币～\n再次点击商店或关闭背包即可离开。');
  if (!UIState.isInventoryOpen) toggleInventory();
}

function closeShop() {
  UIState.isShopOpen = false;
  closeDialog();
  if (UIState.isInventoryOpen) toggleInventory();
}

function sellItem(itemId) {
  if (!UIState.isShopOpen) return;
  const def = ITEMS[itemId];
  const count = GameState.inventory[itemId] || 0;
  if (count <= 0) return;
  GameState.inventory[itemId]--;
  if (GameState.inventory[itemId] <= 0) delete GameState.inventory[itemId];
  GameState.bells += def.value;
  sfx.sell();
  showNotice(`出售 ${def.emoji}${def.name}  +${def.value}🍄`);
  updateInventoryDOM();
}

// ============================================================
// PSEUDO-3D RENDERING HELPERS
// ============================================================
function lighten(hex, p) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, (n >> 16) + p), g = Math.min(255, ((n >> 8) & 0xFF) + p), b = Math.min(255, (n & 0xFF) + p);
  return `rgb(${r},${g},${b})`;
}
function darken(hex, p) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, (n >> 16) - p), g = Math.max(0, ((n >> 8) & 0xFF) - p), b = Math.max(0, (n & 0xFF) - p);
  return `rgb(${r},${g},${b})`;
}
function drawCap3D(ctx, cx, cy, rw, rh, color) {
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.beginPath(); ctx.ellipse(cx + 2, cy + 2, rw, rh, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#c8b898'; ctx.beginPath(); ctx.ellipse(cx, cy + rh * 0.3, rw * 0.95, rh * 0.35, 0, 0, Math.PI * 2); ctx.fill();
  const g = ctx.createRadialGradient(cx - rw * 0.3, cy - rh * 0.3, rw * 0.1, cx, cy, rw);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.15, lighten(color, 40)); g.addColorStop(0.5, color); g.addColorStop(1, darken(color, 30));
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, cy, rw, rh, 0, Math.PI, 0); ctx.fill();
}

// ============================================================
// TILE RENDERING
// ============================================================
function drawTile(ctx, tx, ty, x, y) {
  const t = mapData[ty][tx];
  const depleted = isResourceDepleted(tx, ty);

  switch (t) {
    case TILE_GRASS:
      ctx.fillStyle = '#7ec850'; ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = '#6ab040'; if ((tx + ty) % 4 === 0) { ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4); }
      ctx.fillStyle = '#8ed860'; ctx.fillRect(x + 4, y + 6, 3, 5); ctx.fillRect(x + 18, y + 14, 2, 4);
      break;
    case TILE_PATH:
      ctx.fillStyle = '#7ec850'; ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = '#c8b078'; ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
      ctx.fillStyle = '#b8a068'; ctx.fillRect(x + 2, y + 2, TILE - 4, 2);
      ctx.fillStyle = '#d8c088'; ctx.fillRect(x + 4, y + 10, 3, 3);
      break;
    case TILE_WATER:
      ctx.fillStyle = 'rgba(0,0,0,0.05)'; ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = '#4a80b8'; ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x, y, TILE, 2);
      ctx.fillStyle = '#5a90c8'; if (tx % 3 === 0 && ty % 2 === 0) ctx.fillRect(x + 8, y + 8, 4, 2);
      break;
    case TILE_TREE:
      ctx.fillStyle = '#7ec850'; ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.beginPath(); ctx.ellipse(x + 18, y + 30, 14, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5a3a1a'; ctx.fillRect(x + 12, y + 10, 8, 20);
      if (depleted) {
        ctx.fillStyle = '#5a7a3a'; ctx.beginPath(); ctx.arc(x + 16, y + 4, 14, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#4a6a2a'; ctx.beginPath(); ctx.arc(x + 12, y + 6, 8, Math.PI, 0); ctx.fill();
      } else {
        ctx.fillStyle = '#4a8a2a'; ctx.beginPath(); ctx.arc(x + 16, y + 4, 14, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#3a7a1a'; ctx.beginPath(); ctx.arc(x + 12, y + 6, 8, Math.PI, 0); ctx.fill();
      }
      ctx.fillStyle = '#ffffcc'; ctx.fillRect(x + 7, y + 6, 5, 5);
      break;
    case TILE_MUSHROOM:
      ctx.fillStyle = '#7ec850'; ctx.fillRect(x, y, TILE, TILE);
      const mC = ['#e8c8a0', '#d4a574', '#f0d8b8', '#c4956a', '#e0b888'];
      const ps = [[10, 16, 5, 7], [20, 14, 4, 6], [16, 20, 5, 7], [8, 22, 3, 5], [22, 20, 4, 5], [14, 14, 6, 8]];
      for (let i = 0; i < ps.length; i++) {
        const [mx, my, cw, ch] = ps[i], col = mC[(tx * 3 + ty * 7 + i) % mC.length];
        ctx.fillStyle = '#e8dcc8'; ctx.fillRect(x + mx - 1, y + my + ch / 2, 2, ch);
        drawCap3D(ctx, x + mx, y + my, cw, ch, col);
      }
      break;
    case TILE_ROCK:
      ctx.fillStyle = '#7ec850'; ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.beginPath(); ctx.ellipse(x + 17, y + 16, 15, 11, 0, 0, Math.PI * 2); ctx.fill();
      const rG = ctx.createLinearGradient(x + 10, y, x + 22, y + 20);
      rG.addColorStop(0, '#9a9a8a'); rG.addColorStop(0.4, '#8a8a7a'); rG.addColorStop(1, '#6a6a5a');
      ctx.fillStyle = rG; ctx.beginPath(); ctx.ellipse(x + 16, y + 14, 14, 10, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#aaaa9a'; ctx.beginPath(); ctx.ellipse(x + 12, y + 10, 8, 6, -0.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#bbbbaa'; ctx.beginPath(); ctx.ellipse(x + 10, y + 8, 4, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5a8a4a'; ctx.beginPath(); ctx.ellipse(x + 6, y + 8, 4, 2.5, 0, 0, Math.PI * 2); ctx.fill();
      if (depleted) { ctx.strokeStyle = '#444'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + 6, y + 6); ctx.lineTo(x + 22, y + 26); ctx.stroke(); }
      break;
    case TILE_SAND:
      ctx.fillStyle = '#e8d8a0'; ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = '#f0e0b0'; ctx.fillRect(x, y, 6, TILE);
      ctx.fillStyle = '#d8c890'; if ((tx * 3 + ty * 7) % 4 === 0) ctx.fillRect(x + 10, y + 10, 3, 3);
      break;
    case TILE_BRIDGE:
      ctx.fillStyle = '#4a6080'; ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = '#6b4a2a'; ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = '#8a6a3a';
      for (let i = 0; i < TILE; i += 6) { ctx.fillRect(x + i, y, 3, TILE); ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(x + i + 1, y, 2, TILE); ctx.fillStyle = '#8a6a3a'; }
      ctx.fillStyle = '#5a3a1a'; ctx.fillRect(x, y + 4, TILE, 2); ctx.fillRect(x, y + TILE - 6, TILE, 2);
      break;
    case TILE_PLAYER_HOUSE:
      ctx.fillStyle = '#7ec850'; ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = 'rgba(0,0,0,0.14)'; ctx.beginPath(); ctx.ellipse(x + 18, y + 30, 14, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e8c8a0'; ctx.fillRect(x + 4, y + 10, 20, 18);
      ctx.fillStyle = '#d8b890'; ctx.fillRect(x + 4, y + 10, 20, 3);
      ctx.fillStyle = '#c4a070'; ctx.fillRect(x + 24, y + 10, 6, 18);
      const hG = ctx.createRadialGradient(x + 12, y + 3, 2, x + 16, y + 10, 14);
      hG.addColorStop(0, '#f8e0c0'); hG.addColorStop(0.3, '#e8c8a0'); hG.addColorStop(1, '#b08050');
      ctx.fillStyle = hG; ctx.beginPath(); ctx.arc(x + 16, y + 10, 14, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#f0d8b8'; ctx.beginPath(); ctx.arc(x + 10, y - 2, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 22, y + 2, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5a3a1a'; ctx.fillRect(x + 11, y + 16, 8, 12);
      ctx.fillStyle = '#a8c8e0'; ctx.fillRect(x + 6, y + 14, 5, 5);
      break;
    case TILE_NPC_HOUSE:
      ctx.fillStyle = '#7ec850'; ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = 'rgba(0,0,0,0.14)'; ctx.beginPath(); ctx.ellipse(x + 18, y + 30, 14, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e8c8a0'; ctx.fillRect(x + 4, y + 10, 20, 18);
      ctx.fillStyle = '#c4a070'; ctx.fillRect(x + 24, y + 10, 6, 18);
      const nG = ctx.createRadialGradient(x + 12, y + 3, 2, x + 16, y + 10, 14);
      nG.addColorStop(0, '#f0d8b8'); nG.addColorStop(0.3, '#d4a574'); nG.addColorStop(1, '#a07040');
      ctx.fillStyle = nG; ctx.beginPath(); ctx.arc(x + 16, y + 10, 14, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#5a3a1a'; ctx.fillRect(x + 11, y + 16, 8, 12);
      ctx.fillStyle = '#ffff88'; ctx.fillRect(x + 6, y + 14, 5, 5);
      break;
    case TILE_SHOP:
      ctx.fillStyle = '#7ec850'; ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = 'rgba(0,0,0,0.14)'; ctx.beginPath(); ctx.ellipse(x + 18, y + 30, 14, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c8a060'; ctx.fillRect(x + 2, y + 8, 26, 20);
      ctx.fillStyle = '#a08040'; ctx.fillRect(x + 26, y + 8, 4, 20);
      const sG = ctx.createRadialGradient(x + 12, y + 3, 2, x + 16, y + 8, 14);
      sG.addColorStop(0, '#e8c080'); sG.addColorStop(0.5, '#b08040'); sG.addColorStop(1, '#805020');
      ctx.fillStyle = sG; ctx.beginPath(); ctx.arc(x + 16, y + 8, 14, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#ffffcc'; ctx.fillRect(x + 8, y + 14, 16, 10);
      ctx.font = 'bold 8px sans-serif'; ctx.fillStyle = '#5a3a1a'; ctx.fillText('🍄', x + 10, y + 22);
      break;
    case TILE_LOG:
      ctx.fillStyle = '#7ec850'; ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.beginPath(); ctx.ellipse(x + 16, y + 28, 14, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#6b4a2a'; ctx.fillRect(x + 4, y + 16, 22, 10);
      ctx.fillStyle = '#8a6040'; ctx.fillRect(x + 4, y + 16, 22, 3);
      ctx.fillStyle = '#5a3a1a'; ctx.fillRect(x + 4, y + 18, 3, 8); ctx.fillRect(x + 23, y + 18, 3, 8);
      ctx.fillStyle = '#4a2a0a'; ctx.beginPath(); ctx.ellipse(x + 6, y + 22, 3, 1.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + 20, y + 22, 3, 1.5, 0, 0, Math.PI * 2); ctx.fill();
      break;
    case TILE_FAIRY_RING:
      ctx.fillStyle = '#7ec850'; ctx.fillRect(x, y, TILE, TILE);
      if (depleted) {
        ctx.fillStyle = '#8a8a7a'; ctx.beginPath(); ctx.arc(x + 16, y + 14, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#7a7a6a'; ctx.beginPath(); ctx.arc(x + 16, y + 14, 5, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(255,255,200,0.5)'; ctx.beginPath(); ctx.arc(x + 16, y + 14, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,150,0.3)'; ctx.beginPath(); ctx.arc(x + 16, y + 14, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(x + 13, y + 10, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 19, y + 11, 1.5, 0, Math.PI * 2); ctx.fill();
      }
      break;
  }
}

// ============================================================
// ENTITY RENDERING
// ============================================================
function drawPlayer(ctx) {
  const p = WorldState.player;
  if (!p) return;
  const sx = p.x - Game.camera.x, sy = p.y - Game.camera.y;
  ctx.save(); ctx.translate(sx, sy);
  let frameOffset = 0;
  if (p.isWalking) frameOffset = Math.sin(p.walkFrame * Math.PI * 2) * 2;
  ctx.fillStyle = '#f0d8b0'; ctx.fillRect(-8, -10 + frameOffset, 16, 18);
  const capColors = ['#e8c8a0', '#f8d8b0', '#d8b890'];
  const capGrad = ctx.createRadialGradient(-2, -16, 2, 2, -10, 12);
  capGrad.addColorStop(0, '#ffffff'); capGrad.addColorStop(0.2, lighten(capColors[0], 30)); capGrad.addColorStop(0.7, capColors[0]); capGrad.addColorStop(1, darken(capColors[0], 20));
  ctx.fillStyle = capGrad;
  ctx.beginPath(); ctx.ellipse(0, -10, 12, 8, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#3a2a1a';
  ctx.beginPath(); ctx.arc(-3 + (p.dir === DIR.RIGHT ? 2 : p.dir === DIR.LEFT ? -3 : 0), -14, 1.8, 0, Math.PI * 2); ctx.fill();
  if (p.dir === DIR.LEFT) { ctx.beginPath(); ctx.arc(-6, -14, 1.5, 0, Math.PI * 2); ctx.fill(); }
  if (p.dir === DIR.RIGHT) { ctx.beginPath(); ctx.arc(2, -14, 1.5, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = 'rgba(255,150,150,0.4)'; ctx.beginPath(); ctx.arc(-6, -11, 2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(6, -11, 2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawNPC(ctx, npc) {
  const sx = npc.x - Game.camera.x, sy = npc.y - Game.camera.y;
  ctx.save(); ctx.translate(sx, sy);
  let frameOffset = 0;
  if (npc.isWalking) frameOffset = Math.sin(npc.walkFrame * Math.PI * 2) * 1.5;
  ctx.fillStyle = npc.def.color; ctx.fillRect(-8, -10 + frameOffset, 16, 18);
  const nCap = ctx.createRadialGradient(-1, -14, 1, 1, -8, 10);
  nCap.addColorStop(0, '#ffffff'); nCap.addColorStop(0.3, lighten(npc.def.color, 20)); nCap.addColorStop(0.8, npc.def.color); nCap.addColorStop(1, darken(npc.def.color, 25));
  ctx.fillStyle = nCap; ctx.beginPath(); ctx.ellipse(0, -10, 10, 7, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#3a2a1a';
  ctx.beginPath(); ctx.arc(-2 - frameOffset * 0.5, -12, 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(4 - frameOffset * 0.3, -12, 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,150,150,0.3)'; ctx.beginPath(); ctx.arc(-5, -9, 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(5, -9, 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawGroundItem(ctx, item) {
  const sx = item.x - Game.camera.x, sy = item.y - Game.camera.y + Math.sin(item.bobOffset + Game.tick * 0.05) * 3;
  const def = ITEMS[item.itemId];
  ctx.font = '18px sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
  ctx.fillText(def.emoji, sx, sy);
  ctx.font = '9px sans-serif'; ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillText(def.name, sx, sy + 14);
}

// ============================================================
// MAIN RENDER
// ============================================================
function getSkyColor() {
  const t = GameState.gameTime;
  if (t >= 6 && t < 17) return '#5c94fc';
  if (t >= 17 && t < 19) return '#fc9c5c';
  if (t >= 19 || t < 5) return '#1a1a3a';
  if (t >= 5 && t < 6) return '#4a6ab8';
  return '#5c94fc';
}
function getTimeLabel() {
  const t = GameState.gameTime, h = Math.floor(t), m = Math.floor((t - h) * 60);
  const hh = h.toString().padStart(2, '0'), mm = m.toString().padStart(2, '0');
  let icon = '☀️'; if (h >= 18 || h < 6) icon = '🌙'; if (h >= 6 && h < 18) icon = '☀️'; if (h >= 17 && h < 19) icon = '🌅';
  return `${icon} ${hh}:${mm}`;
}
function getDarknessAlpha() {
  const t = GameState.gameTime;
  if (t >= 8 && t < 17) return 0;
  if (t >= 17 && t < 19) return (t - 17) / 2 * 0.35;
  if (t >= 19 || t < 4) return 0.35;
  if (t >= 4 && t < 8) return (8 - t) / 4 * 0.35;
  return 0;
}
function isPoisoned() { return GameState.poisonTimer > 0; }
function applyPoison() {
  GameState.poisonTimer = 300;
  GameState.shakeTimer = 40;
  GameState.shakeIntensity = 12;
  const penalty = Math.min(GameState.bells, Math.floor(GameState.bells * 0.3 + 50));
  GameState.bells -= penalty;
  sfx.poison();
  showNotice(`☠️ 中毒了！损失 ${penalty}🍄！`);
  WorldState.particles.push(new Particle(WorldState.player.getCenterX(), WorldState.player.getCenterY(), '☠️'));
}
function getShakeOffset() {
  if (GameState.shakeTimer <= 0) return { x: 0, y: 0 };
  const intensity = GameState.shakeIntensity * (GameState.shakeTimer / 40);
  return { x: (Math.random() - 0.5) * intensity * 2, y: (Math.random() - 0.5) * intensity * 2 };
}

function render(ctx) {
  const cw = Game.width, ch = Game.height;
  const player = WorldState.player;
  Game.camera.x = player.x - cw / 2;
  Game.camera.y = player.y - ch / 2;

  const shake = getShakeOffset();
  ctx.save(); ctx.translate(shake.x, shake.y);

  ctx.fillStyle = getSkyColor(); ctx.fillRect(0, 0, cw, ch);

  const startTX = Math.max(0, Math.floor(Game.camera.x / TILE) - 1);
  const startTY = Math.max(0, Math.floor(Game.camera.y / TILE) - 1);
  const endTX = Math.min(MAP_W, Math.ceil((Game.camera.x + cw) / TILE) + 1);
  const endTY = Math.min(MAP_H, Math.ceil((Game.camera.y + ch) / TILE) + 1);

  for (let ty = startTY; ty < endTY; ty++)
    for (let tx = startTX; tx < endTX; tx++)
      drawTile(ctx, tx, ty, tx * TILE - Game.camera.x, ty * TILE - Game.camera.y);

  for (const item of WorldState.groundItems) drawGroundItem(ctx, item);

  const entities = [...WorldState.npcs, player];
  entities.sort((a, b) => a.y - b.y);
  for (const e of entities) {
    if (e === player) drawPlayer(ctx);
    else drawNPC(ctx, e);
  }

  for (const p of WorldState.particles) {
    const sx = p.x - Game.camera.x, sy = p.y - Game.camera.y;
    ctx.globalAlpha = p.alpha; ctx.font = '16px sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.fillText(p.emoji, sx, sy);
  }
  ctx.globalAlpha = 1;

  const darkness = getDarknessAlpha();
  if (darkness > 0) { ctx.fillStyle = `rgba(10,10,40,${darkness})`; ctx.fillRect(0, 0, cw, ch); }

  if (darkness > 0.15) {
    for (let i = 0; i < 8; i++) {
      const lx = ((Math.sin(Game.tick * 0.02 + i * 2.5) * 0.5 + 0.5) * cw);
      const ly = ((Math.cos(Game.tick * 0.015 + i * 1.7) * 0.5 + 0.5) * ch);
      ctx.fillStyle = 'rgba(180,255,180,0.4)'; ctx.beginPath(); ctx.arc(lx, ly, 1.5, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();

  document.getElementById('bells-display').textContent = `🍄 ${GameState.bells}`;
  document.getElementById('name-display').textContent = `🧑 ${GameState.playerName}`;
  document.getElementById('time-display').textContent = getTimeLabel();
}

// ============================================================
// UI: DIALOG / INVENTORY / TOAST / LOADING
// ============================================================
function showDialog(name, text) { UIState.isDialogOpen = true; UIState.dialog = { name, text }; updateDialogDOM(); }
function closeDialog() { UIState.isDialogOpen = false; UIState.dialog = null; updateDialogDOM(); }
function updateDialogDOM() {
  const box = document.getElementById('dialog-box');
  if (UIState.isDialogOpen && UIState.dialog) {
    document.getElementById('dialog-name').textContent = UIState.dialog.name;
    document.getElementById('dialog-text').textContent = UIState.dialog.text;
    box.classList.add('show');
  } else box.classList.remove('show');
}
function showNotice(msg) {
  UIState.notice = msg; UIState.noticeTimer = 100;
  document.getElementById('toast').textContent = msg;
  document.getElementById('toast').classList.add('show');
  setTimeout(() => document.getElementById('toast').classList.remove('show'), 2000);
}

function inventoryCount() { return Object.keys(GameState.inventory).length; }
function inventoryFull() { return inventoryCount() >= MAX_INVENTORY; }
function canAddItem(itemId) {
  if (GameState.inventory[itemId]) return (GameState.inventory[itemId] < MAX_STACK);
  return !inventoryFull();
}
function stackFull(itemId) { return (GameState.inventory[itemId] || 0) >= MAX_STACK; }

function updateInventoryDOM() {
  const grid = document.getElementById('inventory-grid');
  grid.innerHTML = '';
  const entries = Object.entries(GameState.inventory);
  for (let i = 0; i < MAX_INVENTORY; i++) {
    const slot = document.createElement('div');
    slot.className = 'inventory-slot';
    if (i < entries.length) {
      const [itemId, count] = entries[i];
      const def = ITEMS[itemId];
      if (UIState.isShopOpen) {
        slot.innerHTML = `${def.emoji}<span class="count">x${count}</span><span class="sell-price">+${def.value}🍄</span>`;
        slot.style.cursor = 'pointer';
        slot.addEventListener('click', (e) => { e.stopPropagation(); sellItem(itemId); });
        slot.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); sellItem(itemId); });
      } else {
        slot.innerHTML = `${def.emoji}<span class="count">${count}</span>`;
      }
    }
    grid.appendChild(slot);
  }
}

function toggleInventory() {
  if (UIState.isDialogOpen && !UIState.isShopOpen) return;
  UIState.isInventoryOpen = !UIState.isInventoryOpen;
  const modal = document.getElementById('inventory-modal');
  const title = modal.querySelector('h3');
  const closeBtn = document.getElementById('btn-close-inventory');
  if (UIState.isInventoryOpen) {
    title.textContent = UIState.isShopOpen ? '🍄 菌菇商店 — 点击出售' : '🎒 菌菇背包';
    closeBtn.textContent = UIState.isShopOpen ? '离开商店' : '关闭';
    modal.classList.add('show');
    updateInventoryDOM();
  } else {
    modal.classList.remove('show');
    if (UIState.isShopOpen) closeShop();
  }
}

function toggleMap() { showNotice('🍄 探索菌林吧！菌丝网络连接着整个世界～'); }

// ============================================================
// INPUT SYSTEM
// ============================================================
function setupInput() {
  const joystickZone = document.getElementById('joystick-zone');
  const joystickThumb = document.getElementById('joystick-thumb');
  let isJoystickActive = false, activeTouchId = null;

  function getJoystickCenter() {
    const zoneRect = joystickZone.getBoundingClientRect();
    return { x: zoneRect.left + zoneRect.width / 2, y: zoneRect.top + zoneRect.height / 2 };
  }
  function updateJoystick(clientX, clientY) {
    const center = getJoystickCenter();
    let dx = clientX - center.x, dy = clientY - center.y;
    const dist = Math.sqrt(dx * dx + dy * dy), maxDist = 45;
    if (dist > maxDist) { dx = dx / dist * maxDist; dy = dy / dist * maxDist; }
    joystickThumb.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    if (dist < 10) Game.joystickDir = DIR.NONE;
    else {
      const angle = Math.atan2(dy, dx);
      if (angle > -Math.PI / 4 && angle <= Math.PI / 4) Game.joystickDir = DIR.RIGHT;
      else if (angle > Math.PI / 4 && angle <= 3 * Math.PI / 4) Game.joystickDir = DIR.DOWN;
      else if (angle > -3 * Math.PI / 4 && angle <= -Math.PI / 4) Game.joystickDir = DIR.UP;
      else Game.joystickDir = DIR.LEFT;
    }
  }
  function resetJoystick() { joystickThumb.style.transform = 'translate(-50%,-50%)'; Game.joystickDir = DIR.NONE; }

  joystickZone.addEventListener('touchstart', e => {
    e.preventDefault(); const t = e.changedTouches[0]; isJoystickActive = true; activeTouchId = t.identifier;
    updateJoystick(t.clientX, t.clientY);
  });
  joystickZone.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === activeTouchId) { updateJoystick(t.clientX, t.clientY); break; }
  });
  joystickZone.addEventListener('touchend', e => {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === activeTouchId) { isJoystickActive = false; activeTouchId = null; resetJoystick(); break; }
  });
  joystickZone.addEventListener('touchcancel', () => { isJoystickActive = false; activeTouchId = null; resetJoystick(); });
  joystickZone.addEventListener('mousedown', e => { isJoystickActive = true; updateJoystick(e.clientX, e.clientY); });
  window.addEventListener('mousemove', e => { if (isJoystickActive) updateJoystick(e.clientX, e.clientY); });
  window.addEventListener('mouseup', () => { isJoystickActive = false; resetJoystick(); });

  const keys = {};
  window.addEventListener('keydown', e => {
    if (e.key === ' ' || e.key === 'e' || e.key === 'E') { e.preventDefault(); interact(); return; }
    keys[e.key] = true; updateKeyboardDir(keys);
  });
  window.addEventListener('keyup', e => { keys[e.key] = false; updateKeyboardDir(keys); });
  function updateKeyboardDir(k) {
    if (k['ArrowUp'] || k['w']) Game.joystickDir = DIR.UP;
    else if (k['ArrowDown'] || k['s']) Game.joystickDir = DIR.DOWN;
    else if (k['ArrowLeft'] || k['a']) Game.joystickDir = DIR.LEFT;
    else if (k['ArrowRight'] || k['d']) Game.joystickDir = DIR.RIGHT;
    else Game.joystickDir = DIR.NONE;
  }

  document.getElementById('btn-interact').addEventListener('click', interact);
  document.getElementById('btn-interact').addEventListener('touchend', e => { e.preventDefault(); interact(); });
  document.getElementById('btn-bag').addEventListener('click', toggleInventory);
  document.getElementById('btn-bag').addEventListener('touchend', e => { e.preventDefault(); toggleInventory(); });
  document.getElementById('dialog-box').addEventListener('click', () => { if (UIState.isDialogOpen) closeDialog(); });
  document.getElementById('btn-map').addEventListener('click', toggleMap);
  document.getElementById('btn-close-inventory').addEventListener('click', () => {
    if (UIState.isShopOpen) { closeShop(); return; }
    toggleInventory();
  });
}

// ============================================================
// PERSISTENCE: SAVE / LOAD
// ============================================================
function saveGame() {
  try {
    const data = {
      version: SAVE_VERSION,
      px: WorldState.player.x, py: WorldState.player.y,
      bells: GameState.bells, inventory: GameState.inventory,
      playerName: GameState.playerName,
      totalGameTime: GameState.totalGameTime,
      tileTimers: GameState.tileTimers,
      npcGifted: WorldState.npcs.map(n => n.gifted),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) { console.warn('存档失败:', e); }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);

    if (!data.version || data.version < 2) { migrateSaveV1(data); }

    WorldState.player.x = data.px || 5 * TILE + TILE / 2;
    WorldState.player.y = data.py || 8 * TILE + TILE / 2;
    GameState.bells = data.bells || 0;
    GameState.inventory = data.inventory || {};
    GameState.totalGameTime = data.totalGameTime || 8;
    GameState.gameTime = GameState.totalGameTime % 24;
    GameState.tileTimers = data.tileTimers || {};
    if (data.playerName) GameState.playerName = data.playerName;

    applyTileTimers();

    if (data.npcGifted) {
      for (let i = 0; i < Math.min(data.npcGifted.length, WorldState.npcs.length); i++) {
        if (data.npcGifted[i]) WorldState.npcs[i].gifted = true;
      }
    }
  } catch (e) { console.warn('读档失败:', e); showNotice('⚠️ 存档损坏，开始新的冒险'); }
}

function migrateSaveV1(data) {
  data.version = SAVE_VERSION;
  data.totalGameTime = 8;
  data.tileTimers = {};
}

// ============================================================
// INIT & GAME LOOP
// ============================================================
function genPlayerName() {
  const a = ['暗影', '究极', '传说', '超级', '狂暴', '深渊', '星辰', '幻影', '烈焰', '冰霜', '钢铁', '疾风'];
  const b = ['蘑菇王', '孢子侠', '菌丝帝', '采菇人', '毒菇仙', '马勃君', '菌林者', '摸菇怪', '躺板板', '菌子控'];
  return a[Math.floor(Math.random() * a.length)] + b[Math.floor(Math.random() * b.length)];
}

function initGame() {
  WorldState.player = new Player();
  WorldState.npcs = NPC_DEFS.map(d => new NPC(d));
  WorldState.groundItems = [];
  WorldState.particles = [];

  GameState.bells = 0;
  GameState.inventory = {};
  GameState.gameTime = 8;
  GameState.totalGameTime = 8;
  GameState.poisonTimer = 0;
  GameState.shakeTimer = 0;
  GameState.shakeIntensity = 0;
  GameState.tileTimers = {};

  UIState.dialog = null;
  UIState.isDialogOpen = false;
  UIState.isInventoryOpen = false;
  UIState.isShopOpen = false;
  UIState.notice = null;
  UIState.noticeTimer = 0;
  UIState.lastInteraction = 0;

  Game.joystickDir = DIR.NONE;

  baseMapData = createMap();
  mapData = baseMapData.map(row => [...row]);

  if (!GameState.playerName) GameState.playerName = genPlayerName();
}

function setupCanvas() {
  Game.canvas = document.getElementById('game-canvas');
  Game.ctx = Game.canvas.getContext('2d');

  function resizeCanvas() {
    const container = document.getElementById('game-container');
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    Game.canvas.width = rect.width * dpr;
    Game.canvas.height = rect.height * dpr;
    Game.canvas.style.width = rect.width + 'px';
    Game.canvas.style.height = rect.height + 'px';
    Game.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    Game.width = rect.width;
    Game.height = rect.height;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
}

function showLoading() {
  const loadingEl = document.getElementById('loading');
  const progressFill = loadingEl.querySelector('.progress-fill');
  let progress = 0;
  const loadingInterval = setInterval(() => {
    progress += Math.random() * 20;
    if (progress >= 100) { progress = 100; clearInterval(loadingInterval); progressFill.style.width = '100%'; finishLoading(); }
    else progressFill.style.width = progress + '%';
  }, 200);
  setTimeout(() => { clearInterval(loadingInterval); progressFill.style.width = '100%'; finishLoading(); }, 1500);

  function finishLoading() {
    const startMenu = document.getElementById('start-menu');
    if (hasSave()) {
      startMenu.style.display = 'block';
      document.getElementById('btn-continue').onclick = () => {
        loadGame(); loadingEl.style.opacity = '0'; loadingEl.style.transition = 'opacity 0.5s';
        setTimeout(() => loadingEl.remove(), 500);
      };
      document.getElementById('btn-newgame').onclick = () => {
        localStorage.removeItem(SAVE_KEY);
        GameState.playerName = genPlayerName();
        loadingEl.style.opacity = '0'; loadingEl.style.transition = 'opacity 0.5s';
        setTimeout(() => { loadingEl.remove(); showNotice(`欢迎，${GameState.playerName}！`); }, 500);
      };
    } else {
      setTimeout(() => {
        loadingEl.style.opacity = '0'; loadingEl.style.transition = 'opacity 0.5s';
        setTimeout(() => { loadingEl.remove(); showNotice(`欢迎，${GameState.playerName}！`); }, 500);
      }, 400);
    }
  }
}

function hasSave() { return !!localStorage.getItem(SAVE_KEY); }

function gameLoop() {
  if (Game._paused) { requestAnimationFrame(gameLoop); return; }

  Game.tick++;
  GameState.gameTime += GameState.timeSpeed;
  GameState.totalGameTime += GameState.timeSpeed;
  if (GameState.gameTime >= 24) GameState.gameTime -= 24;

  if (GameState.poisonTimer > 0) GameState.poisonTimer--;
  if (GameState.shakeTimer > 0) { GameState.shakeTimer--; if (GameState.shakeTimer === 0) GameState.shakeIntensity = 0; }

  checkRespawns();
  WorldState.player.update();
  for (const npc of WorldState.npcs) npc.update();
  WorldState.groundItems = WorldState.groundItems.filter(i => i.update());
  WorldState.particles = WorldState.particles.filter(p => p.update());

  if (Game.tick % 300 === 0) saveGame();

  render(Game.ctx);

  if (UIState.noticeTimer > 0) { UIState.noticeTimer--; if (UIState.noticeTimer === 0) UIState.notice = null; }

  requestAnimationFrame(gameLoop);
}

function startGame() { setupCanvas(); initGame(); setupInput(); showLoading(); gameLoop(); }
document.addEventListener('DOMContentLoaded', startGame);
