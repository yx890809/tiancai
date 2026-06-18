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
        // ⭐ 新增：军队数据
        this.army = {
            infantry: 0,   // 步兵
            cavalry: 0,    // 骑兵
            archer: 0      // 弓兵
        };
        this.position = {
            x: Math.floor(Math.random() * 10),
            y: Math.floor(Math.random() * 10)
        };
        this.createdAt = new Date().toISOString();
        this.lastLogin = new Date().toISOString();
    }
}

module.exports = User;