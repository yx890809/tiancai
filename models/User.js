// ===== 三国武将列表 =====
const GENERALS = [
    { name: '吕布', force: 100, intelligence: 26, leadership: 85 },
    { name: '关羽', force: 97, intelligence: 75, leadership: 93 },
    { name: '张飞', force: 98, intelligence: 46, leadership: 85 },
    { name: '赵云', force: 96, intelligence: 76, leadership: 88 },
    { name: '马超', force: 97, intelligence: 54, leadership: 86 },
    { name: '黄忠', force: 93, intelligence: 60, leadership: 80 },
    { name: '魏延', force: 92, intelligence: 69, leadership: 82 },
    { name: '姜维', force: 85, intelligence: 90, leadership: 87 },
    { name: '曹操', force: 72, intelligence: 95, leadership: 96 },
    { name: '司马懿', force: 63, intelligence: 98, leadership: 94 },
    { name: '诸葛亮', force: 38, intelligence: 100, leadership: 95 },
    { name: '周瑜', force: 71, intelligence: 96, leadership: 90 },
    { name: '陆逊', force: 65, intelligence: 94, leadership: 86 },
    { name: '孙权', force: 55, intelligence: 80, leadership: 85 },
    { name: '刘备', force: 68, intelligence: 74, leadership: 91 },
    { name: '袁绍', force: 60, intelligence: 70, leadership: 75 },
    { name: '董卓', force: 82, intelligence: 48, leadership: 70 },
    { name: '华雄', force: 90, intelligence: 35, leadership: 65 },
    { name: '颜良', force: 94, intelligence: 38, leadership: 68 },
    { name: '文丑', force: 93, intelligence: 40, leadership: 66 },
    { name: '张辽', force: 90, intelligence: 78, leadership: 88 },
    { name: '徐晃', force: 88, intelligence: 72, leadership: 82 },
    { name: '张郃', force: 86, intelligence: 76, leadership: 84 },
    { name: '甘宁', force: 92, intelligence: 56, leadership: 78 },
    { name: '太史慈', force: 94, intelligence: 62, leadership: 80 }
];

class User {
    constructor(username, password, tribeName = '') {
        this.username = username;
        this.password = password;
        this.tribeName = tribeName || `${username}的部落`;
        this.resources = {
            food: 500,
            wood: 300,
            iron: 100
        };
        this.buildings = {
            mainCastle: 1,
            farm: 1,
            barracks: 0
        };
        this.army = {
            infantry: 0,
            cavalry: 0,
            archer: 0
        };
        this.allies = [];
        
        // 随机武将
        const randomGeneral = GENERALS[Math.floor(Math.random() * GENERALS.length)];
        this.general = {
            name: randomGeneral.name,
            force: randomGeneral.force,
            intelligence: randomGeneral.intelligence,
            leadership: randomGeneral.leadership,
            level: 1,
            exp: 0
        };
        
        // 商店道具
        this.items = {
            defendScroll: 0,
            scoutScroll: 0,
            recruitScroll: 0
        };
        
        // 治安 & 兵器
        this.security = 80;
        this.weapon = 0;
        
        // ⭐ 回合制新增字段
        this.month = 1;              // 当前月份（从1月开始）
        this.actionPoints = 5;       // 当前行动力（每月5点）
        this.maxActionPoints = 5;    // 每月最大行动力
        
        this.position = {
            x: Math.floor(Math.random() * 10),
            y: Math.floor(Math.random() * 10)
        };
        this.createdAt = new Date().toISOString();
        this.lastLogin = new Date().toISOString();
    }
}

module.exports = User;
module.exports.GENERALS = GENERALS;