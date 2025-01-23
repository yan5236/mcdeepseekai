/**
 * 停止工具定义
 */
module.exports = {
  name: 'stop',
  description: '停止当前正在执行的所有动作',
  parameters: {
    type: 'object',
    properties: {}
  },

  /**
   * 停止所有动作的实现
   * @param {Object} bot - Mineflayer机器人实例
   * @param {Object} botState - 机器人状态对象
   */
  execute(bot, botState) {
    botState.isFollowing = false;
    botState.targetPlayer = null;
    botState.isMining = false;
    bot.pathfinder.stop();
    bot.clearControlStates();
  }
}; 