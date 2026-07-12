/**
 * 动动菌友荟 v2 - 自动化测试套件
 * node --test test/game.test.js
 */
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const fs = require('node:fs');

// ---- Mock browser APIs ----
const mockDocument = {
  _elements: new Map(),
  _listeners: new Map(),
  getElementById(id) {
    if (!this._elements.has(id)) {
      this._elements.set(id, {
        id,
        textContent: '',
        classList: { _list: [], add(c) { this._list.push(c); }, remove(c) { this._list = this._list.filter(function(x) { return x !== c; }); }, contains(c) { return this._list.includes(c); } },
        style: { display: '' },
        innerHTML: '',
        querySelector() { return { style: { width: '' } }; },
        addEventListener() {},
      });
    }
    return this._elements.get(id);
  },
  addEventListener(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    this._listeners.get(event).push(fn);
  },
};

const mockWindow = {
  AudioContext: class { constructor() {} state = 'running'; sampleRate = 44100; createOscillator() { return { type: '', frequency: { value: 0 }, connect() {}, start() {}, stop() {} }; } createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; } createBuffer() { return { getChannelData() { return new Float32Array(0); } }; } createBufferSource() { return { buffer: null, connect() {}, start() {}, stop() {} }; } createBiquadFilter() { return { type: '', frequency: { value: 0 }, Q: { value: 0 }, connect() {} }; } get destination() { return {}; } },
  webkitAudioContext: class { constructor() {} state = 'running'; sampleRate = 44100; createOscillator() { return { type: '', frequency: { value: 0 }, connect() {}, start() {}, stop() {} }; } createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; } createBuffer() { return { getChannelData() { return new Float32Array(0); } }; } createBufferSource() { return { buffer: null, connect() {}, start() {}, stop() {} }; } createBiquadFilter() { return { type: '', frequency: { value: 0 }, Q: { value: 0 }, connect() {} }; } get destination() { return {}; } },
  innerWidth: 390, innerHeight: 844,
  devicePixelRatio: 3,
  addEventListener() {},
};

const context = vm.createContext({
  document: mockDocument,
  window: mockWindow,
  localStorage: {
    _store: new Map(),
    getItem(key) { return this._store.get(key) ?? null; },
    setItem(key, val) { this._store.set(key, val); },
    removeItem(key) { this._store.delete(key); },
    get length() { return this._store.size; },
    clear() { this._store.clear(); },
  },
  setTimeout: global.setTimeout.bind(global),
  setInterval: global.setInterval.bind(global),
  clearTimeout: global.clearTimeout.bind(global),
  Math,
  JSON,
  console,
  Float32Array,
  requestAnimationFrame(fn) { return setTimeout(fn, 16); }
});

const gameSrc = fs.readFileSync('js/game.js', 'utf8');
vm.runInContext(gameSrc, context, { filename: 'game.js' });

function getVar(name) {
  return vm.runInContext(name, context);
}

// Extract all needed globals
const TILE = getVar('TILE');
const MAP_W = getVar('MAP_W');
const MAP_H = getVar('MAP_H');
const TILE_GRASS = getVar('TILE_GRASS');
const TILE_PATH = getVar('TILE_PATH');
const TILE_WATER = getVar('TILE_WATER');
const TILE_TREE = getVar('TILE_TREE');
const TILE_MUSHROOM = getVar('TILE_MUSHROOM');
const TILE_ROCK = getVar('TILE_ROCK');
const TILE_SAND = getVar('TILE_SAND');
const TILE_BRIDGE = getVar('TILE_BRIDGE');
const TILE_PLAYER_HOUSE = getVar('TILE_PLAYER_HOUSE');
const TILE_NPC_HOUSE = getVar('TILE_NPC_HOUSE');
const TILE_SHOP = getVar('TILE_SHOP');
const TILE_FAIRY_RING = getVar('TILE_FAIRY_RING');
const TILE_LOG = getVar('TILE_LOG');
const DIR = getVar('DIR');
const MAX_INVENTORY = getVar('MAX_INVENTORY');
const MAX_STACK = getVar('MAX_STACK');
const ITEMS = getVar('ITEMS');
const NPC_DEFS = getVar('NPC_DEFS');
const Game = getVar('Game');
const GameState = getVar('GameState');
const WorldState = getVar('WorldState');
const UIState = getVar('UIState');
const Player = getVar('Player');
const NPC = getVar('NPC');
const GroundItem = getVar('GroundItem');
const Particle = getVar('Particle');
const createMap = getVar('createMap');
const initGame = getVar('initGame');
const genPlayerName = getVar('genPlayerName');
const loadGame = getVar('loadGame');
const saveGame = getVar('saveGame');
const inventoryCount = getVar('inventoryCount');
const inventoryFull = getVar('inventoryFull');
const canAddItem = getVar('canAddItem');
const stackFull = getVar('stackFull');
const applyPoison = getVar('applyPoison');
const isPoisoned = getVar('isPoisoned');
const getShakeOffset = getVar('getShakeOffset');
const getTimeLabel = getVar('getTimeLabel');
const getDarknessAlpha = getVar('getDarknessAlpha');
const getSkyColor = getVar('getSkyColor');
const lighten = getVar('lighten');
const darken = getVar('darken');
const isResourceDepleted = getVar('isResourceDepleted');
const depleteResource = getVar('depleteResource');
const getDepletedTile = getVar('getDepletedTile');
const RESPAWN_HOURS = getVar('RESPAWN_HOURS');

function resetGame() {
  context.localStorage._store.clear();
  initGame();
}

// ============================================================
// 1. 物品系统
// ============================================================
describe('物品系统 (ITEMS)', function() {
  it('所有物品定义完整', function() {
    var required = ['shiitake','enoki','oyster','porcini','termite','matsutake','spore','mycelium','rotwood','moss','dew','firefly','truffle','poison'];
    required.forEach(function(id) {
      assert.ok(ITEMS[id], 'missing ' + id);
      assert.ok(ITEMS[id].name, 'missing name for ' + id);
      assert.ok(ITEMS[id].emoji, 'missing emoji for ' + id);
      assert.strictEqual(typeof ITEMS[id].value, 'number', 'missing value for ' + id);
      assert.ok(ITEMS[id].type, 'missing type for ' + id);
    });
  });

  it('物品价值合理', function() {
    assert.ok(ITEMS.truffle.value > ITEMS.matsutake.value, '松露应比松茸贵');
    assert.ok(ITEMS.matsutake.value > ITEMS.shiitake.value, '松茸应比香菇贵');
    assert.strictEqual(ITEMS.poison.value, 0, '毒蘑菇价值应为 0');
    assert.strictEqual(ITEMS.firefly.value, 150, '萤火虫价值应为 150');
  });

  it('物品类型分类正确', function() {
    assert.strictEqual(ITEMS.shiitake.type, 'mushroom');
    assert.strictEqual(ITEMS.porcini.type, 'rare_mushroom');
    assert.strictEqual(ITEMS.truffle.type, 'legendary');
    assert.strictEqual(ITEMS.poison.type, 'poison');
    assert.strictEqual(ITEMS.spore.type, 'spore');
    assert.strictEqual(ITEMS.mycelium.type, 'material');
    assert.strictEqual(ITEMS.firefly.type, 'bug');
  });
});

// ============================================================
// 2. 背包系统
// ============================================================
describe('背包系统', function() {
  beforeEach(resetGame);

  it('空背包计数为 0', function() {
    assert.strictEqual(inventoryCount(), 0);
  });

  it('背包未满', function() {
    assert.strictEqual(inventoryFull(), false);
  });

  it('添加物品后计数正确', function() {
    GameState.inventory = { shiitake: 1, enoki: 2 };
    assert.strictEqual(inventoryCount(), 2);
  });

  it('canAddItem 对已有物品返回 true', function() {
    GameState.inventory = { shiitake: 5 };
    assert.strictEqual(canAddItem('shiitake'), true);
  });

  it('堆叠满时 canAddItem 返回 false', function() {
    GameState.inventory = { shiitake: MAX_STACK };
    assert.strictEqual(canAddItem('shiitake'), false);
    assert.strictEqual(stackFull('shiitake'), true);
  });

  it('背包满时不能加新物品', function() {
    for (var i = 0; i < MAX_INVENTORY; i++) {
      GameState.inventory['item_' + i] = 1;
    }
    assert.strictEqual(inventoryFull(), true);
    assert.strictEqual(canAddItem('shiitake'), false);
  });

  it('背包满但已有该物品且未满堆叠时可继续加', function() {
    for (var i = 0; i < MAX_INVENTORY; i++) {
      GameState.inventory['item_' + i] = 1;
    }
    GameState.inventory.shiitake = 3;
    assert.strictEqual(canAddItem('shiitake'), true);
  });

  it('stackFull 堆叠未满', function() {
    GameState.inventory = { shiitake: 50 };
    assert.strictEqual(stackFull('shiitake'), false);
  });
});

// ============================================================
// 3. 玩家系统
// ============================================================
describe('玩家系统 (Player)', function() {
  beforeEach(resetGame);

  it('玩家初始位置', function() {
    var p = WorldState.player;
    assert.ok(p.x > 0);
    assert.ok(p.y > 0);
    assert.strictEqual(p.getTileX(), 5);
    assert.strictEqual(p.getTileY(), 8);
  });

  it('getCenterX/Y 正确', function() {
    var p = WorldState.player;
    assert.strictEqual(p.getCenterX(), p.x);
    assert.strictEqual(p.getCenterY(), p.y - 4);
  });

  it('玩家初始方向', function() {
    assert.strictEqual(WorldState.player.dir, DIR.DOWN);
  });

  it('玩家初始未中毒', function() {
    assert.strictEqual(isPoisoned(), false);
    var s = getShakeOffset();
    assert.strictEqual(s.x, 0);
    assert.strictEqual(s.y, 0);
  });
});

// ============================================================
// 4. NPC 系统
// ============================================================
describe('NPC 系统', function() {
  beforeEach(resetGame);

  it('NPC_DEFS 包含 4 个 NPC', function() {
    assert.strictEqual(NPC_DEFS.length, 4);
  });

  it('每个 NPC 有名称和 emoji', function() {
    NPC_DEFS.forEach(function(def) {
      assert.ok(def.name, 'NPC 应有名称');
      assert.ok(def.emoji, 'NPC 应有 emoji');
      assert.ok(def.color, 'NPC 应有颜色');
    });
  });

  it('每个 NPC 有对话', function() {
    NPC_DEFS.forEach(function(def) {
      assert.ok(Array.isArray(def.dialogues), def.name + ' 应有对话列表');
      assert.ok(def.dialogues.length >= 3, def.name + ' 应有至少 3 条对话');
    });
  });

  it('每个 NPC 有喜好物品和回礼', function() {
    NPC_DEFS.forEach(function(def) {
      assert.ok(Array.isArray(def.likes), def.name + ' 应有喜好列表');
      assert.ok(def.likes.length > 0, def.name + ' 应有至少 1 个喜好');
      assert.ok(def.gift, def.name + ' 应有回礼');
      assert.ok(ITEMS[def.gift], def.name + ' 的回礼应存在于 ITEMS');
    });
  });

  it('NPC 构造初始位置在 home 位置', function() {
    var npc = new NPC(NPC_DEFS[0]);
    var hx = npc.def.homeX * TILE + TILE / 2;
    var hy = npc.def.homeY * TILE + TILE / 2;
    assert.ok(Math.abs(npc.x - hx) < 1, 'x 应在 home 位置');
    assert.ok(Math.abs(npc.y - hy) < 1, 'y 应在 home 位置');
  });

  it('NPC 初始未送过礼物', function() {
    var npc = new NPC(NPC_DEFS[0]);
    assert.strictEqual(npc.gifted, false);
    assert.strictEqual(npc.cooldown, 0);
    assert.strictEqual(npc.giftCooldown, 0);
  });

  it('NPC 名字对应物种', function() {
    var names = NPC_DEFS.map(function(d) { return d.name; });
    assert.ok(names.indexOf('茸茸') >= 0);
    assert.ok(names.indexOf('露露') >= 0);
    assert.ok(names.indexOf('胖胖') >= 0);
    assert.ok(names.indexOf('丝丝') >= 0);
  });
});

// ============================================================
// 5. 地图生成
// ============================================================
describe('地图生成 (createMap)', function() {
  it('生成 MAP_H x MAP_W 地图', function() {
    var m = createMap();
    assert.strictEqual(m.length, MAP_H);
    for (var y = 0; y < MAP_H; y++) {
      assert.strictEqual(m[y].length, MAP_W);
    }
  });

  it('地图路径连通性: 主路连贯', function() {
    var m = createMap();
    var pathCount = 0;
    for (var x = 0; x < MAP_W; x++) {
      if (m[10][x] === TILE_PATH) pathCount++;
    }
    assert.ok(pathCount >= 8, '主路至少应有 8 格 path, 实际 ' + pathCount);
  });

  it('地图特定坐标地标正确', function() {
    var m = createMap();
    assert.strictEqual(m[6][5], TILE_PLAYER_HOUSE, '玩家小屋应在 (5,6)');
    assert.strictEqual(m[11][3], TILE_SHOP, '商店应在 (3,11)');
    assert.strictEqual(m[5][18], TILE_NPC_HOUSE);
    assert.strictEqual(m[4][17], TILE_NPC_HOUSE);
    assert.strictEqual(m[16][6], TILE_NPC_HOUSE);
    assert.strictEqual(m[16][17], TILE_NPC_HOUSE);
  });

  it('地图包含关键地标', function() {
    var m = createMap();
    var hasHouse = false, hasShop = false, hasFairy = false, hasWater = false;
    for (var y = 0; y < MAP_H; y++) {
      for (var x = 0; x < MAP_W; x++) {
        var t = m[y][x];
        if (t === TILE_PLAYER_HOUSE) hasHouse = true;
        if (t === TILE_SHOP) hasShop = true;
        if (t === TILE_FAIRY_RING) hasFairy = true;
        if (t === TILE_WATER) hasWater = true;
      }
    }
    assert.ok(hasHouse, '应有玩家小屋');
    assert.ok(hasShop, '应有商店');
    assert.ok(hasFairy, '应有蘑菇圈');
    assert.ok(hasWater, '应有水域');
  });

  it('地图内无非法 tile 值', function() {
    var validTiles = {};
    validTiles[TILE_GRASS] = 1; validTiles[TILE_PATH] = 1;
    validTiles[TILE_WATER] = 1; validTiles[TILE_TREE] = 1;
    validTiles[TILE_MUSHROOM] = 1; validTiles[TILE_ROCK] = 1;
    validTiles[TILE_SAND] = 1; validTiles[TILE_BRIDGE] = 1;
    validTiles[TILE_PLAYER_HOUSE] = 1; validTiles[TILE_NPC_HOUSE] = 1;
    validTiles[TILE_SHOP] = 1; validTiles[TILE_FAIRY_RING] = 1;
    validTiles[TILE_LOG] = 1;
    var m = createMap();
    for (var y = 0; y < MAP_H; y++) {
      for (var x = 0; x < MAP_W; x++) {
        assert.ok(validTiles[m[y][x]] === 1,
          '非法 tile 值 ' + m[y][x] + ' 在 (' + x + ',' + y + ')');
      }
    }
  });
});

// ============================================================
// 6. 存档系统
// ============================================================
describe('存档系统', function() {
  beforeEach(function() {
    context.localStorage._store.clear();
    initGame();
  });

  it('saveGame 保存后 localStorage 有数据', function() {
    WorldState.player.x = 200;
    WorldState.player.y = 300;
    GameState.bells = 500;
    GameState.inventory = { shiitake: 3 };
    GameState.playerName = '测试玩家';
    saveGame();
    var raw = context.localStorage.getItem('dongdongjun_save');
    assert.ok(raw, '应有存档数据');
    var data = JSON.parse(raw);
    assert.strictEqual(data.px, 200);
    assert.strictEqual(data.py, 300);
    assert.strictEqual(data.bells, 500);
    assert.strictEqual(data.playerName, '测试玩家');
    assert.strictEqual(data.inventory.shiitake, 3);
    assert.strictEqual(data.version, 2, '存档应有版本号');
  });

  it('loadGame 恢复存档数据', function() {
    context.localStorage.setItem('dongdongjun_save', JSON.stringify({
      version: 2, px: 400, py: 200, bells: 999, inventory: { enoki: 5 },
      totalGameTime: 10, tileTimers: {},
      playerName: '持久化玩家', npcGifted: [false, true, false, false]
    }));
    loadGame();
    assert.strictEqual(WorldState.player.x, 400);
    assert.strictEqual(WorldState.player.y, 200);
    assert.strictEqual(GameState.bells, 999);
    assert.strictEqual(GameState.inventory.enoki, 5);
    assert.strictEqual(GameState.playerName, '持久化玩家');
    assert.strictEqual(WorldState.npcs[1].gifted, true);
  });

  it('loadGame 兼容 V1 存档（无版本号）', function() {
    context.localStorage.setItem('dongdongjun_save', JSON.stringify({
      px: 400, py: 200, bells: 888, inventory: { matsutake: 1 },
      playerName: 'V1玩家', npcGifted: [false, false, false, false]
    }));
    loadGame();
    assert.strictEqual(WorldState.player.x, 400);
    assert.strictEqual(GameState.bells, 888);
    assert.strictEqual(GameState.totalGameTime, 8, 'V1 存档迁移后 totalGameTime 应为 8');
  });

  it('loadGame 不覆盖已有名称(当存档无名称)', function() {
    GameState.playerName = '原名称';
    context.localStorage.setItem('dongdongjun_save', JSON.stringify({ version: 2, px: 100, py: 100, bells: 0, inventory: {}, totalGameTime: 8, tileTimers: {} }));
    loadGame();
    assert.strictEqual(GameState.playerName, '原名称');
  });

  it('存档往返: save -> init -> load', function() {
    WorldState.player.x = 350; WorldState.player.y = 420; GameState.bells = 777;
    GameState.inventory = { matsutake: 2 }; GameState.playerName = '往返测试';
    saveGame();
    initGame();
    assert.strictEqual(GameState.bells, 0);
    var keys = Object.keys(GameState.inventory);
    assert.strictEqual(keys.length, 0, 'init 后 inventory 应为空');
    loadGame();
    assert.strictEqual(WorldState.player.x, 350);
    assert.strictEqual(WorldState.player.y, 420);
    assert.strictEqual(GameState.bells, 777);
    assert.strictEqual(GameState.inventory.matsutake, 2);
  });
});

// ============================================================
// 7. 姓名生成
// ============================================================
describe('姓名生成 (genPlayerName)', function() {
  it('生成非空姓名', function() {
    var name = genPlayerName();
    assert.ok(name.length > 0);
  });

  it('随机性: 100 次生成不全相同', function() {
    var names = {};
    for (var i = 0; i < 100; i++) names[genPlayerName()] = 1;
    var count = Object.keys(names).length;
    assert.ok(count > 1, '应有至少 2 种不同姓名, 实际 ' + count);
  });

  it('姓名格式: 全中文', function() {
    var name = genPlayerName();
    assert.ok(/^[\u4e00-\u9fff]+$/.test(name), '姓名应全中文, 实际: ' + name);
    assert.ok(name.length >= 4, '姓名应至少 4 个字符, 实际: ' + name.length);
  });
});

// ============================================================
// 8. 时间系统
// ============================================================
describe('时间系统', function() {
  it('getTimeLabel 不同时段图标正确', function() {
    GameState.gameTime = 10;
    assert.ok(getTimeLabel().indexOf('☀️') >= 0, '白天应有太阳');
    GameState.gameTime = 22;
    assert.ok(getTimeLabel().indexOf('🌙') >= 0, '深夜应有月亮');
    GameState.gameTime = 18;
    assert.ok(getTimeLabel().indexOf('🌅') >= 0, '黄昏应有日落');
  });

  it('getDarknessAlpha 白天为 0', function() {
    GameState.gameTime = 10;
    assert.strictEqual(getDarknessAlpha(), 0);
    GameState.gameTime = 14;
    assert.strictEqual(getDarknessAlpha(), 0);
  });

  it('getDarknessAlpha 夜晚 > 0', function() {
    GameState.gameTime = 22;
    assert.ok(getDarknessAlpha() > 0, '22 点应暗');
    GameState.gameTime = 2;
    assert.ok(getDarknessAlpha() > 0, '凌晨 2 点应暗');
  });

  it('getDarknessAlpha 黄昏渐变递增', function() {
    GameState.gameTime = 17;
    var d17 = getDarknessAlpha();
    GameState.gameTime = 18;
    var d18 = getDarknessAlpha();
    assert.ok(d18 > d17, '18 点应比 17 点暗');
  });

  it('getSkyColor 不同时段不同颜色', function() {
    GameState.gameTime = 10;
    assert.strictEqual(getSkyColor(), '#5c94fc');
    GameState.gameTime = 22;
    assert.strictEqual(getSkyColor(), '#1a1a3a');
    GameState.gameTime = 18;
    var dusk = getSkyColor();
    GameState.gameTime = 10;
    assert.ok(dusk !== getSkyColor(), '黄昏 ≠ 白天');
  });
});

// ============================================================
// 9. 中毒系统
// ============================================================
describe('中毒系统', function() {
  beforeEach(resetGame);

  it('初始未中毒', function() {
    assert.strictEqual(isPoisoned(), false);
    assert.strictEqual(GameState.poisonTimer, 0);
  });

  it('applyPoison 设置中毒状态并扣钱', function() {
    GameState.bells = 500;
    WorldState.player = { getCenterX: function() { return 200; }, getCenterY: function() { return 160; } };
    applyPoison();
    assert.strictEqual(isPoisoned(), true);
    assert.ok(GameState.poisonTimer > 0);
    assert.ok(GameState.shakeTimer > 0);
    assert.ok(GameState.bells <= 300, '应扣减蘑菇币, 当前: ' + GameState.bells);
  });

  it('中毒时 getShakeOffset 有非零偏移', function() {
    GameState.shakeTimer = 40;
    GameState.shakeIntensity = 12;
    var s = getShakeOffset();
    assert.ok(s.x !== 0 || s.y !== 0, '中毒时应有抖动偏移');
  });

  it('中毒结束后 shake offset 为 0', function() {
    GameState.shakeTimer = 0;
    GameState.poisonTimer = 0;
    var s = getShakeOffset();
    assert.strictEqual(s.x, 0);
    assert.strictEqual(s.y, 0);
  });
});

// ============================================================
// 10. 游戏初始化
// ============================================================
describe('游戏初始化 (initGame)', function() {
  it('initGame 重置所有状态', function() {
    GameState.bells = 9999;
    GameState.inventory = { shiitake: 99 };
    GameState.poisonTimer = 100;
    GameState.gameTime = 20;
    initGame();
    assert.strictEqual(GameState.bells, 0);
    var keys = Object.keys(GameState.inventory);
    assert.strictEqual(keys.length, 0, 'inventory 应为空');
    assert.strictEqual(GameState.poisonTimer, 0);
    assert.strictEqual(GameState.shakeTimer, 0);
    assert.strictEqual(GameState.gameTime, 8);
    assert.strictEqual(GameState.totalGameTime, 8);
  });

  it('initGame 保留已有 playerName', function() {
    GameState.playerName = '保留我';
    initGame();
    assert.strictEqual(GameState.playerName, '保留我');
  });

  it('initGame 创建 4 个 NPC', function() {
    initGame();
    assert.strictEqual(WorldState.npcs.length, 4);
  });

  it('initGame 清空 tileTimers', function() {
    GameState.tileTimers = { '3,4': { originalTile: TILE_LOG, respawnAt: 100 } };
    initGame();
    var keys = Object.keys(GameState.tileTimers);
    assert.strictEqual(keys.length, 0, 'tileTimers 应为空');
  });
});

// ============================================================
// 11. 粒子与物品
// ============================================================
describe('粒子与地面物品', function() {
  it('Particle 初始状态', function() {
    var p = new Particle(100, 100, '✨');
    assert.strictEqual(p.life, 30);
    assert.strictEqual(p.alpha, 1);
  });

  it('Particle update 递减 life 和 alpha', function() {
    var p = new Particle(100, 100, '✨');
    var alive = p.update();
    assert.ok(alive, '粒子应存活');
    assert.ok(p.life < 30);
    assert.ok(p.alpha < 1);
  });

  it('Particle 生命耗尽返回 false', function() {
    var p = new Particle(100, 100, '✨');
    p.life = 1;
    var alive = p.update();
    assert.strictEqual(alive, false);
  });

  it('GroundItem 初始生命 600', function() {
    var item = new GroundItem(100, 100, 'shiitake');
    assert.strictEqual(item.life, 600);
  });

  it('GroundItem 耗尽时返回 false', function() {
    var item = new GroundItem(100, 100, 'shiitake');
    item.life = 1;
    assert.strictEqual(item.update(), false);
  });
});

// ============================================================
// 12. 颜色工具
// ============================================================
describe('颜色工具 (lighten/darken)', function() {
  it('lighten 加亮颜色', function() {
    var result = lighten('#447744', 30);
    assert.ok(result.indexOf('rgb(') === 0);
    var vals = result.match(/\d+/g).map(Number);
    assert.ok(vals[0] > 68, '红色分量应增加');
    assert.ok(vals[1] > 119, '绿色分量应增加');
  });

  it('darken 加深颜色', function() {
    var result = darken('#447744', 30);
    var vals = result.match(/\d+/g).map(Number);
    assert.ok(vals[0] < 68, '红色分量应减少');
    assert.ok(vals[1] < 119, '绿色分量应减少');
  });

  it('lighten 不超过 255', function() {
    var result = lighten('#f0f0f0', 100);
    var vals = result.match(/\d+/g).map(Number);
    vals.forEach(function(v) { assert.ok(v <= 255, '不应超过 255'); });
  });

  it('darken 不低于 0', function() {
    var result = darken('#0a0a0a', 100);
    var vals = result.match(/\d+/g).map(Number);
    vals.forEach(function(v) { assert.ok(v >= 0, '不应低于 0'); });
  });
});

// ============================================================
// 13. 常量
// ============================================================
describe('常量定义', function() {
  it('TILE = 32', function() { assert.strictEqual(TILE, 32); });
  it('MAP_W = 25', function() { assert.strictEqual(MAP_W, 25); });
  it('MAP_H = 20', function() { assert.strictEqual(MAP_H, 20); });
  it('MAX_INVENTORY = 16', function() { assert.strictEqual(MAX_INVENTORY, 16); });
  it('MAX_STACK = 99', function() { assert.strictEqual(MAX_STACK, 99); });
  it('DIR 枚举正确', function() {
    assert.strictEqual(DIR.UP, 0);
    assert.strictEqual(DIR.DOWN, 1);
    assert.strictEqual(DIR.LEFT, 2);
    assert.strictEqual(DIR.RIGHT, 3);
    assert.strictEqual(DIR.NONE, -1);
  });
  it('13 种 TILE 常量互不相同', function() {
    var tiles = [TILE_GRASS,TILE_PATH,TILE_WATER,TILE_TREE,TILE_MUSHROOM,TILE_ROCK,TILE_SAND,TILE_BRIDGE,TILE_PLAYER_HOUSE,TILE_NPC_HOUSE,TILE_SHOP,TILE_FAIRY_RING,TILE_LOG];
    var seen = {};
    tiles.forEach(function(t) { seen[t] = 1; });
    assert.strictEqual(Object.keys(seen).length, 13);
  });
});

// ============================================================
// 14. 经济系统（新增）
// ============================================================
describe('经济系统 (资源耗尽/重生)', function() {
  beforeEach(resetGame);

  it('isResourceDepleted 初始未枯竭', function() {
    // 蘑菇群坐标 (1,3) 在 createMap 中设置
    assert.strictEqual(isResourceDepleted(1, 3), false);
    assert.strictEqual(isResourceDepleted(14, 3), false); // 石头 (唯一未被覆盖的石头坐标)
    assert.strictEqual(isResourceDepleted(2, 2), false);   // 树
  });

  it('depleteResource 后 isResourceDepleted 返回 true', function() {
    depleteResource(1, 3, RESPAWN_HOURS.MUSHROOM);
    assert.strictEqual(isResourceDepleted(1, 3), true);
  });

  it('depleteResource 蘑菇群后瓦片变草地', function() {
    var mapData = getVar('mapData');
    depleteResource(1, 3, RESPAWN_HOURS.MUSHROOM);
    // 蘑菇群 (1,3) 原始是 TILE_MUSHROOM，枯竭后应为 TILE_GRASS
    assert.strictEqual(mapData[3][1], TILE_GRASS);
  });

  it('depleteResource 树林后瓦片类型不变', function() {
    var mapData = getVar('mapData');
    depleteResource(2, 2, RESPAWN_HOURS.TREE);
    // 树枯竭后 tile 类型不变（视觉上变暗），但标记为 depleted
    assert.strictEqual(mapData[2][2], TILE_TREE);
    assert.strictEqual(isResourceDepleted(2, 2), true);
  });

  it('depleteResource 石头后瓦片类型不变', function() {
    var mapData = getVar('mapData');
    depleteResource(14, 3, RESPAWN_HOURS.ROCK);
    assert.strictEqual(mapData[3][14], TILE_ROCK);
    assert.strictEqual(isResourceDepleted(14, 3), true);
  });

  it('getDepletedTile 蘑菇群返回草地', function() {
    assert.strictEqual(getDepletedTile(TILE_MUSHROOM), TILE_GRASS);
    assert.strictEqual(getDepletedTile(TILE_LOG), TILE_GRASS);
    assert.strictEqual(getDepletedTile(TILE_TREE), TILE_TREE);
    assert.strictEqual(getDepletedTile(TILE_ROCK), TILE_ROCK);
  });

  it('checkRespawns 过期后恢复 tile', function() {
    var mapData = getVar('mapData');
    depleteResource(1, 3, RESPAWN_HOURS.MUSHROOM);
    assert.strictEqual(mapData[3][1], TILE_GRASS);
    assert.strictEqual(isResourceDepleted(1, 3), true);

    // 快进时间到重生
    GameState.totalGameTime += RESPAWN_HOURS.MUSHROOM + 0.1;
    var checkRespawns = getVar('checkRespawns');
    checkRespawns();

    assert.strictEqual(isResourceDepleted(1, 3), false);
    assert.strictEqual(mapData[3][1], TILE_MUSHROOM);
  });
});
