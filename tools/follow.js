/**
 * 跟随工具定义
 */
const { goals } = require('mineflayer-pathfinder');
const Movements = require('mineflayer-pathfinder').Movements;

module.exports = {
  name: 'follow',
  description: '跟随指定的玩家',
  parameters: {
    type: 'object',
    properties: {
      playerName: {
        type: 'string',
        description: '要跟随的玩家名称'
      }
    },
    required: ['playerName']
  },

  /**
   * 跟随指定玩家的动作实现
   * @param {Object} bot - Mineflayer机器人实例
   * @param {Object} botState - 机器人状态对象
   * @param {Object} params - 动作参数
   */
  async execute(bot, botState, params) {
    const playerName = params.playerName;
    const player = bot.players[playerName];
    if (!player) {
      bot.chat(`找不到玩家 ${playerName}`);
      return;
    }
    botState.isFollowing = true;
    botState.targetPlayer = playerName;
    
    while (botState.isFollowing) {
      const target = bot.players[playerName].entity;
      if (!target) {
        bot.chat('失去目标玩家');
        botState.isFollowing = false;
        break;
      }
      
      // 配置寻路参数
      const mcData = require('minecraft-data')(bot.version);
      const movements = new Movements(bot, mcData);
      bot.pathfinder.setMovements(movements);
      
      try {
        // 设置跟随目标，保持2格距离
        await bot.pathfinder.goto(new goals.GoalFollow(target, 2));
      } catch (err) {
        console.log('寻路错误:', err);
      }
      
      // 每秒更新一次位置
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}; 