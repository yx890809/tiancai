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

        user.lastLogin = now.toISOString();
        writeUsers(users);

        const allPlayers = users
            .filter(u => u.username !== req.session.user.username)
            .map(u => ({
                username: u.username,
                tribeName: u.tribeName,
                position: u.position || { x: -1, y: -1 }
            }));

        const { password, ...profile } = user;
        res.json({
            success: true,
            data: profile,
            bonus: bonus,
            bonusMsg: bonusMessage,
            allPlayers: allPlayers
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
        user.resources.food += 10;
        user.lastLogin = new Date().toISOString();
        writeUsers(users);
        res.json({ success: true, msg: '粮食+10', data: { food: user.resources.food } });
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
        user.resources.wood += 10;
        user.lastLogin = new Date().toISOString();
        writeUsers(users);
        res.json({ success: true, msg: '木材+10', data: { wood: user.resources.wood } });
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
        user.resources.iron += 10;
        user.lastLogin = new Date().toISOString();
        writeUsers(users);
        res.json({ success: true, msg: '铁矿+10', data: { iron: user.resources.iron } });
    } catch (error) {
        console.error('生产错误:', error);
        res.status(500).json({ success: false, msg: '服务器错误' });
    }
});

// ========== 移动 ==========
app.post('/api/move', (req, res) => {
    try {
        if (!req.session.user) return res.status(401).json({ success: false, msg: '未登录' });
        const { x, y } = req.body;
        if (x === undefined || y === undefined || x < 0 || x > 9 || y < 0 || y > 9) {
            return res.status(400).json({ success: false, msg: '坐标超出边界（0-9）' });
        }
        const users = readUsers();
        const user = users.find(u => u.username === req.session.user.username);
        if (!user) return res.status(404).json({ success: false, msg: '用户不存在' });
        user.position.x = x;
        user.position.y = y;
        user.lastLogin = new Date().toISOString();
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
        if (!req.session.user) {
            return res.status(401).json({ success: false, msg: '未登录' });
        }

        const { type, count } = req.body;
        const recruitCount = count || 1;
        
        const costMap = {
            infantry: { food: 20, iron: 10 },
            cavalry: { food: 30, iron: 20 },
            archer: { food: 15, iron: 15 }
        };

        if (!costMap[type]) {
            return res.status(400).json({ success: false, msg: '兵种类型错误' });
        }

        const cost = costMap[type];
        const totalCost = {
            food: cost.food * recruitCount,
            iron: cost.iron * recruitCount
        };

        const users = readUsers();
        const user = users.find(u => u.username === req.session.user.username);
        if (!user) {
            return res.status(404).json({ success: false, msg: '用户不存在' });
        }

        if (user.resources.food < totalCost.food || user.resources.iron < totalCost.iron) {
            return res.status(400).json({ 
                success: false, 
                msg: `资源不足！需要 粮食${totalCost.food}，铁矿${totalCost.iron}` 
            });
        }

        user.resources.food -= totalCost.food;
        user.resources.iron -= totalCost.iron;

        if (!user.army) {
            user.army = { infantry: 0, cavalry: 0, archer: 0 };
        }
        user.army[type] = (user.army[type] || 0) + recruitCount;
        user.lastLogin = new Date().toISOString();
        writeUsers(users);

        const typeNames = { infantry: '步兵', cavalry: '骑兵', archer: '弓兵' };

        res.json({ 
            success: true, 
            msg: `✅ 成功招募 ${recruitCount} 名${typeNames[type]}！`,
            data: {
                resources: user.resources,
                army: user.army
            }
        });
    } catch (error) {
        console.error('征兵错误:', error);
        res.status(500).json({ success: false, msg: '服务器错误：' + error.message });
    }
});

// ========== ⚔️ 战斗系统（含详细战报用于动画） ==========
app.post('/api/battle', (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ success: false, msg: '未登录' });
        }

        const { targetUsername } = req.body;
        if (!targetUsername) {
            return res.status(400).json({ success: false, msg: '请指定攻击目标' });
        }

        const users = readUsers();
        const attacker = users.find(u => u.username === req.session.user.username);
        const defender = users.find(u => u.username === targetUsername);

        if (!attacker || !defender) {
            return res.status(404).json({ success: false, msg: '玩家不存在' });
        }

        if (attacker.username === defender.username) {
            return res.status(400).json({ success: false, msg: '不能攻击自己！' });
        }

        if (!attacker.army) {
            attacker.army = { infantry: 0, cavalry: 0, archer: 0 };
        }
        if (!defender.army) {
            defender.army = { infantry: 0, cavalry: 0, archer: 0 };
        }

        const attackerTotal = attacker.army.infantry + attacker.army.cavalry + attacker.army.archer;
        const defenderTotal = defender.army.infantry + defender.army.cavalry + defender.army.archer;

        if (attackerTotal === 0) {
            return res.status(400).json({ success: false, msg: '你没有兵，无法出征！' });
        }
        if (defenderTotal === 0) {
            return res.status(400).json({ success: false, msg: '目标没有兵，不值得攻击！' });
        }

        // 保存初始兵力（用于显示）
        const initialAttacker = {
            infantry: attacker.army.infantry,
            cavalry: attacker.army.cavalry,
            archer: attacker.army.archer
        };
        const initialDefender = {
            infantry: defender.army.infantry,
            cavalry: defender.army.cavalry,
            archer: defender.army.archer
        };

        let aInf = attacker.army.infantry;
        let aCav = attacker.army.cavalry;
        let aArc = attacker.army.archer;

        let dInf = defender.army.infantry;
        let dCav = defender.army.cavalry;
        let dArc = defender.army.archer;

        const defenseBonus = 1 + (defender.buildings?.mainCastle || 1) * 0.05;

        // 详细战报（每回合一条）
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

            aInf -= aInfLoss;
            aCav -= aCavLoss;
            aArc -= aArcLoss;
            dInf -= dInfLoss;
            dCav -= dCavLoss;
            dArc -= dArcLoss;

            // 记录每回合详情
            roundDetails.push({
                round: round,
                attackerLoss: aTotalLoss,
                defenderLoss: dTotalLoss,
                attackerRemain: aInf + aCav + aArc,
                defenderRemain: dInf + dCav + dArc
            });

            battleLog.push(`第${round}回合：攻击方损失 ${aTotalLoss} 人，防守方损失 ${dTotalLoss} 人`);

            if (aInf + aCav + aArc <= 0 || dInf + dCav + dArc <= 0) {
                break;
            }
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

        attacker.army.infantry = aInf;
        attacker.army.cavalry = aCav;
        attacker.army.archer = aArc;
        defender.army.infantry = dInf;
        defender.army.cavalry = dCav;
        defender.army.archer = dArc;

        attacker.lastLogin = new Date().toISOString();
        defender.lastLogin = new Date().toISOString();

        writeUsers(users);

        const result = {
            success: true,
            attackerWin: attackerWin,
            battleLog: battleLog,
            roundDetails: roundDetails,
            initialAttacker: initialAttacker,
            initialDefender: initialDefender,
            attackerRemain: { infantry: aInf, cavalry: aCav, archer: aArc },
            defenderRemain: { infantry: dInf, cavalry: dCav, archer: dArc },
            loot: loot,
            msg: attackerWin 
                ? `🎉 胜利！掠夺了 ${loot.food} 粮食和 ${loot.iron} 铁矿！` 
                : `💀 战败！被掠夺了 ${loot.food} 粮食和 ${loot.iron} 铁矿！`
        };

        res.json(result);

    } catch (error) {
        console.error('战斗错误:', error);
        res.status(500).json({ success: false, msg: '服务器错误：' + error.message });
    }
});

// ========== 排行榜 ==========
app.get('/api/ranking', (req, res) => {
    try {
        const users = readUsers();
        
        const ranking = users.map(u => {
            const army = u.army || { infantry: 0, cavalry: 0, archer: 0 };
            const totalArmy = army.infantry + army.cavalry + army.archer;
            return {
                username: u.username,
                tribeName: u.tribeName,
                totalArmy: totalArmy,
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

// ========== 💬 聊天 ==========
app.get('/api/chat', (req, res) => {
    try {
        const messages = readChat();
        const recent = messages.slice(-50);
        res.json({ success: true, data: recent });
    } catch (error) {
        console.error('获取聊天错误:', error);
        res.status(500).json({ success: false, msg: '服务器错误' });
    }
});

app.post('/api/chat', (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ success: false, msg: '未登录' });
        }

        const { content } = req.body;
        if (!content || content.trim() === '') {
            return res.status(400).json({ success: false, msg: '消息不能为空' });
        }

        if (content.length > 200) {
            return res.status(400).json({ success: false, msg: '消息太长（最多200字符）' });
        }

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
    console.log('按 Ctrl+C 停止服务器');
});