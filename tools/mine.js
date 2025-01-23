/**
 * 挖掘工具定义
 */
const { goals } = require('mineflayer-pathfinder');

module.exports = {
  name: 'mine',
  description: '挖掘指定类型的方块',
  parameters: {
    type: 'object',
    properties: {
      blockType: {
        type: 'string',
        description: '要挖掘的方块类型（必须使用英文，如：stone, dirt, diamond_ore）'
      },
      amount: {
        type: 'number',
        description: '要挖掘的数量，默认为1'
      }
    },
    required: ['blockType']
  },

  /**
   * 挖掘指定方块的动作实现
   * @param {Object} bot - Mineflayer机器人实例
   * @param {Object} botState - 机器人状态对象
   * @param {Object} params - 动作参数
   */
  async execute(bot, botState, params) {
    if (botState.isMining) {
      bot.chat('我正在挖掘中...');
      return;
    }

    // 获取方块数据
    const mcData = require('minecraft-data')(bot.version);
    const blockToMine = mcData.blocksByName[params.blockType];
    
    if (!blockToMine) {
      bot.chat(`找不到方块类型: ${params.blockType}`);
      return;
    }

    botState.isMining = true;
    const targetAmount = params.amount || 1;
    let collectedAmount = 0;
    
    while (collectedAmount < targetAmount && botState.isMining) {
      // 在32格范围内寻找目标方块
      const blocks = bot.findBlocks({
        matching: blockToMine.id,
        maxDistance: 32,
        count: 1
      });

      if (blocks.length === 0) {
        bot.chat(`附近找不到更多的 ${params.blockType} 了`);
        botState.isMining = false;
        return;
      }

      const target = blocks[0];
      try {
        // 移动到目标方块位置
        await bot.pathfinder.goto(new goals.GoalBlock(target.x, target.y, target.z));
        const block = bot.blockAt(target);
        
        // 自动选择合适的工具
        await bot.tool.equipForBlock(block);
        
        // 开始挖掘
        await bot.dig(block);
        collectedAmount++;
        
        // 报告进度
        if (targetAmount > 1) {
          bot.chat(`已挖掘 ${collectedAmount}/${targetAmount} 个 ${params.blockType}`);
        }
      } catch (err) {
        console.log('挖掘错误:', err);
        bot.chat('挖掘失败: ' + err.message);
        break;
      }
    }

    botState.isMining = false;
    if (targetAmount > 1) {
      bot.chat(`完成挖掘，共获得 ${collectedAmount} 个 ${params.blockType}`);
    }
  }
}; 