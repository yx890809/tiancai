const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const User = require('./models/User');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static('public'));
app.use(session({
    secret: 'my_kingdom_secret',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

const DATA_PATH = path.join(__dirname, 'data', 'users.json');
const CHAT_PATH = path.join(__dirname, 'data', 'chat.json');

// ============================================================
// ===== ⭐ 多城池系统（10座城池，分布在大地图上） =====
// ============================================================
const CITIES = [
    // 原4座城池（位置调整到20x20地图上）
    { id: 'city_1', name: '洛阳', x: 3, y: 3, owner: null, defense: 1.5 },
    { id: 'city_2', name: '长安', x: 16, y: 3, owner: null, defense: 1.5 },
    { id: 'city_3', name: '建业', x: 3, y: 16, owner: null, defense: 1.5 },
    { id: 'city_4', name: '成都', x: 16, y: 16, owner: null, defense: 1.5 },
    // 新增6座城池
    { id: 'city_5', name: '许昌', x: 7, y: 7, owner: null, defense: 1.3 },
    { id: 'city_6', name: '邺城', x: 12, y: 7, owner: null, defense: 1.3 },
    { id: 'city_7', name: '汉中', x: 7, y: 12, owner: null, defense: 1.3 },
    { id: 'city_8', name: '江陵', x: 12, y: 12, owner: null, defense: 1.3 },
    { id: 'city_9', name: '襄阳', x: 5, y: 10, owner: null, defense: 1.4 },
    { id: 'city_10', name: '合肥', x: 14, y: 10, owner: null, defense: 1.4 }
];

// ============================================================
// ===== ⭐ 大地形生成（20×20，更丰富） =====
// ============================================================
function generateTerrain() {
    const size = 20;
    const terrain = [];
    // 固定种子
    function seededRandom(seed) {
        let s = seed;
        return function() {
            s = (s * 9301 + 49297) % 233280;
            return s / 233280;
        };
    }
    const rng = seededRandom(42);

    // 初始化所有格为草地
    for (let y = 0; y < size; y++) {
        terrain[y] = [];
        for (let x = 0; x < size; x++) {
            terrain[y][x] = 'grass';
        }
    }

    // 生成山脉区域（在边缘和中部随机分布）
    // 边缘山
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (x === 0 || x === size - 1 || y === 0 || y === size - 1) {
                terrain[y][x] = 'mountain';
            }
        }
    }
    // 内部山脉（随机几个山脉群）
    const mountainCenters = [
        [5, 5], [15, 5], [5, 15], [15, 15], [10, 10],
        [2, 10], [18, 10], [10, 2], [10, 18]
    ];
    mountainCenters.forEach(([cx, cy]) => {
        for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
                const nx = cx + dx;
                const ny = cy + dy;
                if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
                    // 山脉概率
                    const prob = 1 - (Math.abs(dx) + Math.abs(dy)) / 4;
                    if (Math.random() < prob * 0.7) {
                        terrain[ny][nx] = 'mountain';
                    }
                }
            }
        }
    });

    // 生成河流（从左下到右上的弯曲河流）
    const riverPath = [
        [1, 18], [2, 16], [4, 14], [6, 13], [9, 12],
        [12, 11], [14, 10], [16, 9], [18, 7], [19, 5]
    ];
    riverPath.forEach(([x, y]) => {
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
                    if (Math.random() > 0.3) terrain[ny][nx] = 'water';
                }
            }
        }
    });

    // 森林区域（在草地随机）
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (terrain[y][x] === 'grass' && Math.random() < 0.15) {
                terrain[y][x] = 'forest';
            }
        }
    }

    // 确保城池位置是草地（可通行）
    CITIES.forEach(c => {
        if (c.x >= 0 && c.x < size && c.y >= 0 && c.y < size) {
            terrain[c.y][c.x] = 'grass';
            // 周围一圈也设为草地（方便建设）
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = c.x + dx;
                    const ny = c.y + dy;
                    if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
                        terrain[ny][nx] = 'grass';
                    }
                }
            }
        }
    });

    return terrain;
}
const TERRAIN = generateTerrain();

function getCitiesWithOwners(users) {
    return CITIES.map(city => {
        const owner = users.find(u => u.username === city.owner);
        return {
            ...city,
            ownerName: owner ? owner.tribeName || owner.username : null,
            ownerUsername: city.owner || null
        };
    });
}

// ===== 初始化数据 =====
if (!fs.existsSync(path.dirname(DATA_PATH))) {
    fs.mkdirSync(path.dirname(DATA_PATH));
}
if (!fs.existsSync(DATA_PATH)) {
    fs.writeFileSync(DATA_PATH, JSON.stringify({ users: [] }, null, 2));
}
if (!fs.existsSync(CHAT_PATH)) {
    fs.writeFileSync(CHAT_PATH, JSON.stringify({ messages: [] }, null, 2));
}

function readUsers() {
    const raw = fs.readFileSync(DATA_PATH);
    return JSON.parse(raw).users;
}

function writeUsers(users) {
    fs.writeFileSync(DATA_PATH, JSON.stringify({ users }, null, 2));
}

function readChat() {
    const raw = fs.readFileSync(CHAT_PATH);
    return JSON.parse(raw).messages;
}

function writeChat(messages) {
    if (messages.length > 100) {
        messages = messages.slice(-100);
    }
    fs.writeFileSync(CHAT_PATH, JSON.stringify({ messages }, null, 2));
}

// ========== 注册 ==========
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, tribeName } = req.body;
        if (!username || !password) return res.status(400).json({ success: false, msg: '账号和密码不能为空' });
        if (username.length < 3) return res.status(400).json({ success: false, msg: '账号至少3个字符' });
        
        const users = readUsers();
        if (users.find(u => u.username === username)) return res.status(400).json({ success: false, msg: '用户名已被使用' });
        
        const hashedPwd = await bcrypt.hash(password, 10);
        const newUser = new User(username, hashedPwd, tribeName);
        users.push(newUser);
        writeUsers(users);
        res.json({ success: true, msg: '注册成功！' });
    } catch (error) {
        console.error('注册错误:', error);
        res.status(500).json({ success: false, msg: '服务器错误：' + error.message });
    }
});

// ========== 登录 ==========
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const users = readUsers();
        const user = users.find(u => u.username === username);
        if (!user) return res.status(400).json({ success: false, msg: '用户不存在' });
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(400).json({ success: false, msg: '密码错误' });
        
        user.lastLogin = new Date().toISOString();
        writeUsers(users);
        req.session.user = { username: user.username, tribeName: user.tribeName };
        res.json({ success: true, msg: '登录成功' });
    } catch (error) {
        console.error('登录错误:', error);
        res.status(500).json({ success: false, msg: '服务器错误' });
    }
});

// ========== 获取个人信息 ==========
app.get('/api/profile', (req, res) => {
    try {
        if (!req.session.user) return res.status(401).json({ success: false, msg: '未登录' });
        const users = readUsers();
        const user = users.find(u => u.username === req.session.user.username);
        if (!user) return res.status(404).json({ success: false, msg: '用户不存在' });

        if (!user.army) {
            user.army = { infantry: 0, cavalry: 0, archer: 0 };
            writeUsers(users);
        }
        if (!user.items) {
            user.items = { defendScroll: 0, scoutScroll: 0, recruitScroll: 0 };
            writeUsers(users);
        }
        if (user.security === undefined) {
            user.security = 80;
            writeUsers(users);
        }
        if (user.weapon === undefined) {
            user.weapon = 0;
            writeUsers(users);
        }
        if (user.month === undefined) {
            user.month = 1;
            user.actionPoints = 5;
            user.maxActionPoints = 5;
            writeUsers(users);
        }
        if (!user.general) {
            const GENERALS = require('./models/User').GENERALS || [
                { name: '吕布', force: 100, intelligence: 26, leadership: 85 }
            ];
            const randomGeneral = GENERALS[Math.floor(Math.random() * GENERALS.length)];
            user.general = {
                name: randomGeneral.name,
                force: randomGeneral.force,
                intelligence: randomGeneral.intelligence,
                leadership: randomGeneral.leadership,
                level: 1,
                exp: 0
            };
            writeUsers(users);
        }

        const now = new Date();
        const lastTime = user.lastLogin ? new Date(user.lastLogin) : new Date(user.createdAt);
        const diffMs = now - lastTime;
        const diffMinutes = diffMs / (1000 * 60);

        let bonus = { food: 0, wood: 0, iron: 0 };
        let bonusMessage = '';
        if (diffMinutes >= 1) {
            const effectiveMinutes = Math.min(diffMinutes, 1000);
            const gainFood = Math.floor(effectiveMinutes * 2);
            const gainWood = Math.floor(effectiveMinutes * 1);
            const gainIron = Math.floor(effectiveMinutes * 1);
            if (gainFood > 0 || gainWood > 0 || gainIron > 0) {
                user.resources.food += gainFood;
                user.resources.wood += gainWood;
                user.resources.iron += gainIron;
                bonus = { food: gainFood, wood: gainWood, iron: gainIron };
                bonusMessage = `⏰ 离线 ${Math.floor(diffMinutes)} 分钟，收获：粮食+${gainFood}，木材+${gainWood}，铁矿+${gainIron}`;
            }
        } else {
            bonusMessage = '🟢 当前在线，继续经营吧！';
        }

        // 治安自动衰减
        if (diffMinutes >= 5) {
            const decay = Math.floor(diffMinutes / 60);
            if (decay > 0) {
                user.security = Math.max(0, user.security - decay);
                if (decay > 0) {
                    bonusMessage += ` 治安下降 ${decay} 点（当前 ${user.security}）`;
                }
            }
        }

        user.lastLogin = now.toISOString();
        writeUsers(users);

        const allPlayers = users
            .filter(u => u.username !== req.session.user.username)
            .map(u => ({
                username: u.username,
                tribeName: u.tribeName,
                position: u.position || { x: -1, y: -1 }
            }));

        const cities = getCitiesWithOwners(users);

        const { password, ...profile } = user;
        res.json({
            success: true,
            data: profile,
            bonus: bonus,
            bonusMsg: bonusMessage,
            allPlayers: allPlayers,
            cities: cities,
            terrain: TERRAIN
        });
    } catch (error) {
        console.error('获取资料错误:', error);
        res.status(500).json({ success: false, msg: '服务器错误' });
    }
});

// ========== 生产 ==========
app.post('/api/produce/food', (req, res) => {
    try {
        if (!req.session.user) return res.status(401).json({ success: false, msg: '未登录' });
        const users = readUsers();
        const user = users.find(u => u.username === req.session.user.username);
        if (!user) return res.status(404).json({ success: false, msg: '用户不存在' });
        if (user.actionPoints <= 0) {
            return res.status(400).json({ success: false, msg: '行动力不足！' });
        }
        user.resources.food += 10;
        user.actionPoints -= 1;
        user.lastLogin = new Date().toISOString();
        writeUsers(users);
        res.json({ success: true, msg: '粮食+10', data: { food: user.resources.food, actionPoints: user.actionPoints } });
    } catch (error) {
        console.error('生产错误:', error);
        res.status(500).json({ success: false, msg: '服务器错误' });
    }
});

app.post('/api/produce/wood', (req, res) => {
    try {
        if (!req.session.user) return res.status(401).json({ success: false, msg: '未登录' });
        const users = readUsers();
        const user = users.find(u => u.username === req.session.user.username);
        if (!user) return res.status(404).json({ success: false, msg: '用户不存在' });
        if (user.actionPoints <= 0) {
            return res.status(400).json({ success: false, msg: '行动力不足！' });
        }
        user.resources.wood += 10;
        user.actionPoints -= 1;
        user.lastLogin = new Date().toISOString();
        writeUsers(users);
        res.json({ success: true, msg: '木材+10', data: { wood: user.resources.wood, actionPoints: user.actionPoints } });
    } catch (error) {
        console.error('生产错误:', error);
        res.status(500).json({ success: false, msg: '服务器错误' });
    }
});

app.post('/api/produce/iron', (req, res) => {
    try {
        if (!req.session.user) return res.status(401).json({ success: false, msg: '未登录' });
        const users = readUsers();
        const user = users.find(u => u.username === req.session.user.username);
        if (!user) return res.status(404).json({ success: false, msg: '用户不存在' });
        if (user.actionPoints <= 0) {
            return res.status(400).json({ success: false, msg: '行动力不足！' });
        }
        user.resources.iron += 10;
        user.actionPoints -= 1;
        user.lastLogin = new Date().toISOString();
        writeUsers(users);
        res.json({ success: true, msg: '铁矿+10', data: { iron: user.resources.iron, actionPoints: user.actionPoints } });
    } catch (error) {
        console.error('生产错误:', error);
        res.status(500).json({ success: false, msg: '服务器错误' });
    }
});

// ========== 移动（适配20x20） ==========
app.post('/api/move', (req, res) => {
    try {
        if (!req.session.user) return res.status(401).json({ success: false, msg: '未登录' });
        const { x, y } = req.body;
        const gridSize = 20;
        if (x === undefined || y === undefined || x < 0 || x >= gridSize || y < 0 || y >= gridSize) {
            return res.status(400).json({ success: false, msg: `坐标超出边界（0-${gridSize-1}）` });
        }

        const users = readUsers();
        const user = users.find(u => u.username === req.session.user.username);
        if (!user) return res.status(404).json({ success: false, msg: '用户不存在' });

        const terrainType = TERRAIN[y]?.[x] || 'grass';
        if (terrainType === 'mountain' || terrainType === 'water') {
            return res.status(400).json({ success: false, msg: '⛰️ 此处地形无法通行！' });
        }

        // 检查城池
        const city = CITIES.find(c => c.x === x && c.y === y && c.owner && c.owner !== user.username);
        if (city) {
            return res.status(400).json({ 
                success: false, 
                msg: `🏰 ${city.name} 已被 ${city.owner} 占领，无法直接进入！请攻打。` 
            });
        }

        user.position.x = x;
        user.position.y = y;
        user.lastLogin = new Date().toISOString();

        // 无主城池
        const emptyCity = CITIES.find(c => c.x === x && c.y === y && !c.owner);
        if (emptyCity) {
            emptyCity.owner = user.username;
            user.resources.food += 30;
            user.resources.iron += 15;
            writeUsers(users);
            return res.json({ 
                success: true, 
                msg: `🏰 占领了 ${emptyCity.name}！获得 粮食+30，铁矿+15`,
                data: { position: user.position },
                cityCaptured: emptyCity.name
            });
        }

        writeUsers(users);
        res.json({ success: true, msg: `📍 移动到 (${x}, ${y})`, data: { position: user.position } });
    } catch (error) {
        console.error('移动错误:', error);
        res.status(500).json({ success: false, msg: '服务器错误' });
    }
});

// ========== 征兵 ==========
app.post('/api/recruit', (req, res) => {
    try {
        if (!req.session.user) return res.status(401).json({ success: false, msg: '未登录' });
        const { type, count } = req.body;
        const recruitCount = count || 1;
        
        const costMap = {
            infantry: { food: 20, iron: 10 },
            cavalry: { food: 30, iron: 20 },
            archer: { food: 15, iron: 15 }
        };

        if (!costMap[type]) return res.status(400).json({ success: false, msg: '兵种类型错误' });

        const cost = costMap[type];
        const totalCost = { food: cost.food * recruitCount, iron: cost.iron * recruitCount };

        const users = readUsers();
        const user = users.find(u => u.username === req.session.user.username);
        if (!user) return res.status(404).json({ success: false, msg: '用户不存在' });

        if (user.resources.food < totalCost.food || user.resources.iron < totalCost.iron) {
            return res.status(400).json({ 
                success: false, 
                msg: `资源不足！需要 粮食${totalCost.food}，铁矿${totalCost.iron}` 
            });
        }

        user.resources.food -= totalCost.food;
        user.resources.iron -= totalCost.iron;

        if (!user.army) user.army = { infantry: 0, cavalry: 0, archer: 0 };
        user.army[type] = (user.army[type] || 0) + recruitCount;
        user.lastLogin = new Date().toISOString();
        writeUsers(users);

        const typeNames = { infantry: '步兵', cavalry: '骑兵', archer: '弓兵' };
        res.json({ 
            success: true, 
            msg: `✅ 成功招募 ${recruitCount} 名${typeNames[type]}！`,
            data: { resources: user.resources, army: user.army }
        });
    } catch (error) {
        console.error('征兵错误:', error);
        res.status(500).json({ success: false, msg: '服务器错误：' + error.message });
    }
});

// ========== 战斗 ==========
app.post('/api/battle', (req, res) => {
    try {
        if (!req.session.user) return res.status(401).json({ success: false, msg: '未登录' });
        const { targetUsername } = req.body;
        if (!targetUsername) return res.status(400).json({ success: false, msg: '请指定攻击目标' });

        const users = readUsers();
        const attacker = users.find(u => u.username === req.session.user.username);
        const defender = users.find(u => u.username === targetUsername);

        if (!attacker || !defender) return res.status(404).json({ success: false, msg: '玩家不存在' });
        if (attacker.username === defender.username) return res.status(400).json({ success: false, msg: '不能攻击自己！' });

        if (!attacker.army) attacker.army = { infantry: 0, cavalry: 0, archer: 0 };
        if (!defender.army) defender.army = { infantry: 0, cavalry: 0, archer: 0 };

        if (attacker.allies && attacker.allies.includes(targetUsername)) {
            return res.status(400).json({ success: false, msg: '不能攻击盟友！' });
        }

        const attackerGeneral = attacker.general || { force: 50, intelligence: 50, leadership: 50 };
        const defenderGeneral = defender.general || { force: 50, intelligence: 50, leadership: 50 };
        
        const attackerBonus = 1 + (attackerGeneral.force - 50) / 200;
        const defenderBonus = 1 + (defenderGeneral.intelligence - 50) / 200;

        const attackerTotal = (attacker.army.infantry + attacker.army.cavalry + attacker.army.archer) * attackerBonus;
        const defenderTotal = (defender.army.infantry + defender.army.cavalry + defender.army.archer) * defenderBonus;

        if (attackerTotal < 1) return res.status(400).json({ success: false, msg: '你没有兵，无法出征！' });
        if (defenderTotal < 1) return res.status(400).json({ success: false, msg: '目标没有兵，不值得攻击！' });

        const initialAttacker = { infantry: attacker.army.infantry, cavalry: attacker.army.cavalry, archer: attacker.army.archer };
        const initialDefender = { infantry: defender.army.infantry, cavalry: defender.army.cavalry, archer: defender.army.archer };

        let aInf = attacker.army.infantry;
        let aCav = attacker.army.cavalry;
        let aArc = attacker.army.archer;
        let dInf = defender.army.infantry;
        let dCav = defender.army.cavalry;
        let dArc = defender.army.archer;

        const defenseBonus = 1 + (defender.buildings?.mainCastle || 1) * 0.05;
        let battleLog = [];
        let roundDetails = [];

        for (let round = 1; round <= 3; round++) {
            const aDamage = {
                infantry: Math.floor(aInf * 0.3 + aCav * 0.4 + aArc * 0.2),
                cavalry: Math.floor(aInf * 0.2 + aCav * 0.5 + aArc * 0.3),
                archer: Math.floor(aInf * 0.3 + aCav * 0.2 + aArc * 0.5)
            };
            const dDamage = {
                infantry: Math.floor((dInf * 0.3 + dCav * 0.4 + dArc * 0.2) * defenseBonus),
                cavalry: Math.floor((dInf * 0.2 + dCav * 0.5 + dArc * 0.3) * defenseBonus),
                archer: Math.floor((dInf * 0.3 + dCav * 0.2 + dArc * 0.5) * defenseBonus)
            };
            const aInfLoss = Math.min(aInf, Math.floor(aDamage.infantry * 0.3));
            const aCavLoss = Math.min(aCav, Math.floor(aDamage.cavalry * 0.3));
            const aArcLoss = Math.min(aArc, Math.floor(aDamage.archer * 0.3));
            const dInfLoss = Math.min(dInf, Math.floor(dDamage.infantry * 0.3));
            const dCavLoss = Math.min(dCav, Math.floor(dDamage.cavalry * 0.3));
            const dArcLoss = Math.min(dArc, Math.floor(dDamage.archer * 0.3));
            const aTotalLoss = aInfLoss + aCavLoss + aArcLoss;
            const dTotalLoss = dInfLoss + dCavLoss + dArcLoss;
            aInf -= aInfLoss; aCav -= aCavLoss; aArc -= aArcLoss;
            dInf -= dInfLoss; dCav -= dCavLoss; dArc -= dArcLoss;
            roundDetails.push({
                round: round,
                attackerLoss: aTotalLoss,
                defenderLoss: dTotalLoss,
                attackerRemain: aInf + aCav + aArc,
                defenderRemain: dInf + dCav + dArc
            });
            battleLog.push(`第${round}回合：攻击方损失 ${aTotalLoss} 人，防守方损失 ${dTotalLoss} 人`);
            if (aInf + aCav + aArc <= 0 || dInf + dCav + dArc <= 0) break;
        }

        const aRemain = aInf + aCav + aArc;
        const dRemain = dInf + dCav + dArc;
        const attackerWin = aRemain > dRemain;

        let loot = { food: 0, iron: 0 };
        if (attackerWin) {
            loot.food = Math.floor(defender.resources.food * 0.2);
            loot.iron = Math.floor(defender.resources.iron * 0.2);
            attacker.resources.food += loot.food;
            attacker.resources.iron += loot.iron;
            defender.resources.food -= loot.food;
            defender.resources.iron -= loot.iron;
        } else {
            loot.food = Math.floor(attacker.resources.food * 0.1);
            loot.iron = Math.floor(attacker.resources.iron * 0.1);
            defender.resources.food += loot.food;
            defender.resources.iron += loot.iron;
            attacker.resources.food -= loot.food;
            attacker.resources.iron -= loot.iron;
        }

        attacker.army = { infantry: aInf, cavalry: aCav, archer: aArc };
        defender.army = { infantry: dInf, cavalry: dCav, archer: dArc };
        attacker.lastLogin = new Date().toISOString();
        defender.lastLogin = new Date().toISOString();
        writeUsers(users);

        res.json({
            success: true,
            attackerWin: attackerWin,
            battleLog: battleLog,
            roundDetails: roundDetails,
            initialAttacker: initialAttacker,
            initialDefender: initialDefender,
            attackerRemain: { infantry: aInf, cavalry: aCav, archer: aArc },
            defenderRemain: { infantry: dInf, cavalry: dCav, archer: dArc },
            loot: loot,
            msg: attackerWin ? `🎉 胜利！掠夺了 ${loot.food} 粮食和 ${loot.iron} 铁矿！` : `💀 战败！被掠夺了 ${loot.food} 粮食和 ${loot.iron} 铁矿！`
        });
    } catch (error) {
        console.error('战斗错误:', error);
        res.status(500).json({ success: false, msg: '服务器错误：' + error.message });
    }
});

// ========== 攻城 ==========
app.post('/api/siege', (req, res) => {
    try {
        if (!req.session.user) return res.status(401).json({ success: false, msg: '未登录' });
        const { cityId } = req.body;
        if (!cityId) return res.status(400).json({ success: false, msg: '请指定要攻打的城池' });

        const users = readUsers();
        const attacker = users.find(u => u.username === req.session.user.username);
        if (!attacker) return res.status(404).json({ success: false, msg: '用户不存在' });

        const city = CITIES.find(c => c.id === cityId);
        if (!city) return res.status(404).json({ success: false, msg: '城池不存在' });
        if (!city.owner) return res.status(400).json({ success: false, msg: '此城无人占领，可直接进入！' });
        if (city.owner === attacker.username) return res.status(400).json({ success: false, msg: '这是你的城池！' });

        const defender = users.find(u => u.username === city.owner);
        if (!defender) {
            city.owner = null;
            writeUsers(users);
            return res.status(400).json({ success: false, msg: '守城者数据异常，城池已重置' });
        }

        const attackerGeneral = attacker.general || { force: 50, intelligence: 50, leadership: 50 };
        const defenderGeneral = defender.general || { force: 50, intelligence: 50, leadership: 50 };
        const attackerBonus = 1 + (attackerGeneral.force - 50) / 200;
        const defenderBonus = 1 + (defenderGeneral.intelligence - 50) / 200;

        const attackerTotal = (attacker.army?.infantry || 0) + (attacker.army?.cavalry || 0) + (attacker.army?.archer || 0);
        const defenderTotal = (defender.army?.infantry || 0) + (defender.army?.cavalry || 0) + (defender.army?.archer || 0);

        if (attackerTotal === 0) return res.status(400).json({ success: false, msg: '你没有兵，无法攻城！' });
        if (defenderTotal === 0) {
            city.owner = attacker.username;
            writeUsers(users);
            return res.json({ success: true, msg: `🏰 不战而胜！占领了 ${city.name}！` });
        }

        const defenseBonus = city.defense || 1.3;
        const attackerPower = attackerTotal * attackerBonus * 1.0;
        const defenderPower = defenderTotal * defenderBonus * defenseBonus;
        const attackerWin = attackerPower > defenderPower;
        let attackerLoss, defenderLoss;

        if (attackerWin) {
            attackerLoss = Math.floor(attackerTotal * 0.3);
            defenderLoss = Math.floor(defenderTotal * 0.7);
        } else {
            attackerLoss = Math.floor(attackerTotal * 0.6);
            defenderLoss = Math.floor(defenderTotal * 0.2);
        }

        const aInf = Math.max(0, (attacker.army?.infantry || 0) - Math.floor(attackerLoss * 0.4));
        const aCav = Math.max(0, (attacker.army?.cavalry || 0) - Math.floor(attackerLoss * 0.3));
        const aArc = Math.max(0, (attacker.army?.archer || 0) - Math.floor(attackerLoss * 0.3));
        attacker.army = { infantry: aInf, cavalry: aCav, archer: aArc };

        const dInf = Math.max(0, (defender.army?.infantry || 0) - Math.floor(defenderLoss * 0.4));
        const dCav = Math.max(0, (defender.army?.cavalry || 0) - Math.floor(defenderLoss * 0.3));
        const dArc = Math.max(0, (defender.army?.archer || 0) - Math.floor(defenderLoss * 0.3));
        defender.army = { infantry: dInf, cavalry: dCav, archer: dArc };

        let loot = { food: 0, iron: 0 };
        if (attackerWin) {
            loot.food = Math.floor(defender.resources.food * 0.2);
            loot.iron = Math.floor(defender.resources.iron * 0.2);
            attacker.resources.food += loot.food;
            attacker.resources.iron += loot.iron;
            defender.resources.food -= loot.food;
            defender.resources.iron -= loot.iron;
            city.owner = attacker.username;
        } else {
            loot.food = Math.floor(attacker.resources.food * 0.1);
            loot.iron = Math.floor(attacker.resources.iron * 0.1);
            defender.resources.food += loot.food;
            defender.resources.iron += loot.iron;
            attacker.resources.food -= loot.food;
            attacker.resources.iron -= loot.iron;
        }

        attacker.lastLogin = new Date().toISOString();
        defender.lastLogin = new Date().toISOString();
        writeUsers(users);

        res.json({
            success: true,
            attackerWin: attackerWin,
            attackerLoss: attackerLoss,
            defenderLoss: defenderLoss,
            loot: loot,
            msg: attackerWin ? `🎉 攻城胜利！占领了 ${city.name}！掠夺 ${loot.food} 粮 ${loot.iron} 铁` : `💀 攻城失败！损失 ${attackerLoss} 兵力，被掠夺 ${loot.food} 粮 ${loot.iron} 铁`
        });
    } catch (error) {
        console.error('攻城错误:', error);
        res.status(500).json({ success: false, msg: '服务器错误：' + error.message });
    }
});

// ========== 联盟 ==========
app.post('/api/alliance/request', (req, res) => {
    try {
        if (!req.session.user) return res.status(401).json({ success: false, msg: '未登录' });
        const { targetUsername } = req.body;
        if (!targetUsername) return res.status(400).json({ success: false, msg: '请指定目标玩家' });
        if (targetUsername === req.session.user.username) {
            return res.status(400).json({ success: false, msg: '不能和自己结盟！' });
        }

        const users = readUsers();
        const requester = users.find(u => u.username === req.session.user.username);
        const target = users.find(u => u.username === targetUsername);

        if (!requester || !target) {
            return res.status(404).json({ success: false, msg: '玩家不存在' });
        }

        if (requester.allies && requester.allies.includes(targetUsername)) {
            return res.status(400).json({ success: false, msg: '你们已经是盟友了！' });
        }

        if (!requester.allies) requester.allies = [];
        if (!target.allies) target.allies = [];

        requester.allies.push(targetUsername);
        target.allies.push(req.session.user.username);
        writeUsers(users);

        res.json({ success: true, msg: `🤝 成功与 ${target.tribeName || targetUsername} 结盟！` });
    } catch (error) {
        console.error('结盟错误:', error);
        res.status(500).json({ success: false, msg: '服务器错误' });
    }
});

app.post('/api/alliance/break', (req, res) => {
    try {
        if (!req.session.user) return res.status(401).json({ success: false, msg: '未登录' });
        const { targetUsername } = req.body;
        if (!targetUsername) return res.status(400).json({ success: false, msg: '请指定目标玩家' });

        const users = readUsers();
        const requester = users.find(u => u.username === req.session.user.username);
        const target = users.find(u => u.username === targetUsername);

        if (!requester || !target) {
            return res.status(404).json({ success: false, msg: '玩家不存在' });
        }

        if (requester.allies) {
            requester.allies = requester.allies.filter(u => u !== targetUsername);
        }
        if (target.allies) {
            target.allies = target.allies.filter(u => u !== req.session.user.username);
        }
        writeUsers(users);

        res.json({ success: true, msg: `💔 已与 ${target.tribeName || targetUsername} 解除联盟` });
    } catch (error) {
        console.error('解除联盟错误:', error);
        res.status(500).json({ success: false, msg: '服务器错误' });
    }
});

// ========== 商店 ==========
const SHOP_ITEMS = [
    {
        id: 'recruitScroll',
        name: '增兵令',
        icon: '📜',
        desc: '立即获得 +50 兵力（随机分配）',
        cost: { food: 50, iron: 30 },
        effect: { type: 'addArmy', value: 50 }
    },
    {
        id: 'defendScroll',
        name: '防御符',
        icon: '🛡️',
        desc: '守城时防御 +20%（持续1小时）',
        cost: { food: 30, iron: 15 },
        effect: { type: 'defendBoost', value: 1.2 }
    },
    {
        id: 'scoutScroll',
        name: '侦查令',
        icon: '🔍',
        desc: '查看任意玩家的总兵力',
        cost: { food: 10, iron: 5 },
        effect: { type: 'scout', value: 0 }
    }
];

app.get('/api/shop', (req, res) => {
    try {
        res.json({ success: true, data: SHOP_ITEMS });
    } catch (error) {
        console.error('获取商店错误:', error);
        res.status(500).json({ success: false, msg: '服务器错误' });
    }
});

app.post('/api/shop/buy', (req, res) => {
    try {
        if (!req.session.user) return res.status(401).json({ success: false, msg: '未登录' });
        const { itemId } = req.body;
        if (!itemId) return res.status(400).json({ success: false, msg: '请指定要购买的物品' });

        const users = readUsers();
        const user = users.find(u => u.username === req.session.user.username);
        if (!user) return res.status(404).json({ success: false, msg: '用户不存在' });

        const item = SHOP_ITEMS.find(i => i.id === itemId);
        if (!item) return res.status(400).json({ success: false, msg: '物品不存在' });

        if (user.resources.food < item.cost.food || user.resources.iron < item.cost.iron) {
            return res.status(400).json({ 
                success: false, 
                msg: `资源不足！需要 粮食${item.cost.food}，铁矿${item.cost.iron}` 
            });
        }

        user.resources.food -= item.cost.food;
        user.resources.iron -= item.cost.iron;

        let effectMsg = '';
        if (item.effect.type === 'addArmy') {
            const addInf = Math.floor(item.effect.value * 0.4);
            const addCav = Math.floor(item.effect.value * 0.35);
            const addArc = Math.floor(item.effect.value * 0.25);
            if (!user.army) user.army = { infantry: 0, cavalry: 0, archer: 0 };
            user.army.infantry += addInf;
            user.army.cavalry += addCav;
            user.army.archer += addArc;
            effectMsg = `获得 步兵+${addInf}，骑兵+${addCav}，弓兵+${addArc}`;
        } else if (item.effect.type === 'defendBoost') {
            if (!user.items) user.items = { defendScroll: 0, scoutScroll: 0, recruitScroll: 0 };
            user.items.defendScroll = (user.items.defendScroll || 0) + 1;
            effectMsg = '获得 防御符 ×1（守城+20%）';
        } else if (item.effect.type === 'scout') {
            if (!user.items) user.items = { defendScroll: 0, scoutScroll: 0, recruitScroll: 0 };
            user.items.scoutScroll = (user.items.scoutScroll || 0) + 1;
            effectMsg = '获得 侦查令 ×1（可查看任意玩家兵力）';
        }

        user.lastLogin = new Date().toISOString();
        writeUsers(users);

        res.json({
            success: true,
            msg: `✅ 购买成功！${item.name} ${effectMsg}`,
            data: { resources: user.resources, items: user.items }
        });
    } catch (error) {
        console.error('购买错误:', error);
        res.status(500).json({ success: false, msg: '服务器错误：' + error.message });
    }
});

app.post('/api/shop/scout', (req, res) => {
    try {
        if (!req.session.user) return res.status(401).json({ success: false, msg: '未登录' });
        const { targetUsername } = req.body;
        if (!targetUsername) return res.status(400).json({ success: false, msg: '请指定要侦查的玩家' });

        const users = readUsers();
        const user = users.find(u => u.username === req.session.user.username);
        if (!user) return res.status(404).json({ success: false, msg: '用户不存在' });

        if (!user.items || user.items.scoutScroll < 1) {
            return res.status(400).json({ success: false, msg: '你没有侦查令！' });
        }

        const target = users.find(u => u.username === targetUsername);
        if (!target) return res.status(404).json({ success: false, msg: '目标玩家不存在' });

        user.items.scoutScroll -= 1;

        const targetArmy = target.army || { infantry: 0, cavalry: 0, archer: 0 };
        const total = targetArmy.infantry + targetArmy.cavalry + targetArmy.archer;
        const targetGeneral = target.general || { name: '无名', force: 50, intelligence: 50, leadership: 50 };

        user.lastLogin = new Date().toISOString();
        writeUsers(users);

        res.json({
            success: true,
            msg: `🔍 侦查结果：${target.tribeName || targetUsername} 总兵力 ${total}（步兵${targetArmy.infantry}，骑兵${targetArmy.cavalry}，弓兵${targetArmy.archer}）武将：${targetGeneral.name}（武${targetGeneral.force}，智${targetGeneral.intelligence}，统${targetGeneral.leadership}）`
        });
    } catch (error) {
        console.error('侦查错误:', error);
        res.status(500).json({ success: false, msg: '服务器错误' });
    }
});

// ========== 巡逻 ==========
app.post('/api/patrol', (req, res) => {
    try {
        if (!req.session.user) return res.status(401).json({ success: false, msg: '未登录' });
        const users = readUsers();
        const user = users.find(u => u.username === req.session.user.username);
        if (!user) return res.status(404).json({ success: false, msg: '用户不存在' });
        if (user.actionPoints <= 0) {
            return res.status(400).json({ success: false, msg: '行动力不足！' });
        }
        const cost = 10;
        if (user.resources.food < cost) {
            return res.status(400).json({ success: false, msg: `粮食不足！需要 ${cost} 粮食进行巡逻` });
        }
        if (user.security >= 100) {
            return res.status(400).json({ success: false, msg: '治安已满，无需巡逻' });
        }
        user.resources.food -= cost;
        const increase = 5 + Math.floor(Math.random() * 6);
        user.security = Math.min(100, user.security + increase);
        user.actionPoints -= 1;
        user.lastLogin = new Date().toISOString();
        writeUsers(users);
        res.json({
            success: true,
            msg: `✅ 巡逻成功！消耗 ${cost} 粮食，治安 +${increase}（当前 ${user.security}），行动力 -1`,
            data: { food: user.resources.food, security: user.security, actionPoints: user.actionPoints }
        });
    } catch (error) {
        console.error('巡逻错误:', error);
        res.status(500).json({ success: false, msg: '服务器错误' });
    }
});

// ========== 铸兵 ==========
app.post('/api/forge', (req, res) => {
    try {
        if (!req.session.user) return res.status(401).json({ success: false, msg: '未登录' });
        const users = readUsers();
        const user = users.find(u => u.username === req.session.user.username);
        if (!user) return res.status(404).json({ success: false, msg: '用户不存在' });
        if (user.actionPoints <= 0) {
            return res.status(400).json({ success: false, msg: '行动力不足！' });
        }
        const costIron = 20;
        const costWood = 10;
        if (user.resources.iron < costIron || user.resources.wood < costWood) {
            return res.status(400).json({ success: false, msg: `资源不足！需要 铁矿${costIron}，木材${costWood}` });
        }
        user.resources.iron -= costIron;
        user.resources.wood -= costWood;
        const gain = 10 + Math.floor(Math.random() * 11);
        user.weapon = (user.weapon || 0) + gain;
        user.actionPoints -= 1;
        user.lastLogin = new Date().toISOString();
        writeUsers(users);
        res.json({
            success: true,
            msg: `✅ 打造成功！消耗 铁矿${costIron}，木材${costWood}，兵器 +${gain}（当前 ${user.weapon}），行动力 -1`,
            data: { iron: user.resources.iron, wood: user.resources.wood, weapon: user.weapon, actionPoints: user.actionPoints }
        });
    } catch (error) {
        console.error('打造错误:', error);
        res.status(500).json({ success: false, msg: '服务器错误' });
    }
});

// ========== 结束回合 ==========
app.post('/api/endturn', (req, res) => {
    try {
        if (!req.session.user) return res.status(401).json({ success: false, msg: '未登录' });
        const users = readUsers();
        const user = users.find(u => u.username === req.session.user.username);
        if (!user) return res.status(404).json({ success: false, msg: '用户不存在' });

        user.month = (user.month || 1) + 1;
        user.actionPoints = user.maxActionPoints || 5;
        const securityBonus = 0.5 + (user.security / 100) * 0.5;
        const foodGain = Math.floor(5 * securityBonus);
        const woodGain = Math.floor(3 * securityBonus);
        const ironGain = Math.floor(2 * securityBonus);
        user.resources.food += foodGain;
        user.resources.wood += woodGain;
        user.resources.iron += ironGain;
        user.security = Math.max(0, user.security - 1);
        user.lastLogin = new Date().toISOString();
        writeUsers(users);

        res.json({
            success: true,
            msg: `📅 进入第 ${user.month} 月！资源产出：粮食+${foodGain}，木材+${woodGain}，铁矿+${ironGain}，行动力已恢复`,
            data: {
                month: user.month,
                actionPoints: user.actionPoints,
                resources: user.resources,
                security: user.security
            }
        });
    } catch (error) {
        console.error('结束回合错误:', error);
        res.status(500).json({ success: false, msg: '服务器错误' });
    }
});

// ========== 排行榜 ==========
app.get('/api/ranking', (req, res) => {
    try {
        const users = readUsers();
        const ranking = users.map(u => {
            const army = u.army || { infantry: 0, cavalry: 0, archer: 0 };
            return {
                username: u.username,
                tribeName: u.tribeName,
                totalArmy: army.infantry + army.cavalry + army.archer,
                infantry: army.infantry,
                cavalry: army.cavalry,
                archer: army.archer,
                resources: u.resources || { food: 0, wood: 0, iron: 0 }
            };
        });
        ranking.sort((a, b) => b.totalArmy - a.totalArmy);
        res.json({ success: true, data: ranking });
    } catch (error) {
        console.error('排行榜错误:', error);
        res.status(500).json({ success: false, msg: '服务器错误' });
    }
});

// ========== 聊天 ==========
app.get('/api/chat', (req, res) => {
    try {
        const messages = readChat();
        res.json({ success: true, data: messages.slice(-50) });
    } catch (error) {
        console.error('获取聊天错误:', error);
        res.status(500).json({ success: false, msg: '服务器错误' });
    }
});

app.post('/api/chat', (req, res) => {
    try {
        if (!req.session.user) return res.status(401).json({ success: false, msg: '未登录' });
        const { content } = req.body;
        if (!content || content.trim() === '') return res.status(400).json({ success: false, msg: '消息不能为空' });
        if (content.length > 200) return res.status(400).json({ success: false, msg: '消息太长（最多200字符）' });

        const messages = readChat();
        const newMsg = {
            username: req.session.user.username,
            tribeName: req.session.user.tribeName || req.session.user.username,
            content: content.trim(),
            time: new Date().toISOString()
        };
        messages.push(newMsg);
        writeChat(messages);
        res.json({ success: true, msg: '发送成功', data: newMsg });
    } catch (error) {
        console.error('发送聊天错误:', error);
        res.status(500).json({ success: false, msg: '服务器错误' });
    }
});

// ========== 登出 ==========
app.get('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true, msg: '已登出' });
});

app.listen(PORT, () => {
    console.log(`✅ 服务器启动成功！访问 http://localhost:${PORT}`);
    console.log(`🏰 共有 ${CITIES.length} 座城池等待征服！`);
});