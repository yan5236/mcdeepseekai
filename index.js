/**
 * Minecraft AI助手主程序
 * 基于 Mineflayer 和 DeepSeek 实现的智能机器人
 */

// 导入必要的依赖
require('dotenv').config();
const mineflayer = require('mineflayer');
const { pathfinder } = require('mineflayer-pathfinder');
const toolPlugin = require('mineflayer-tool').plugin;
const DeepSeekService = require('./services/deepseek');
const tools = require('./tools');

// 创建DeepSeek服务实例
const deepseek = new DeepSeekService(process.env.OPENAI_API_KEY);

// 存储对话历史的上下文
let conversationContext = [];

/**
 * 创建Minecraft机器人实例
 * 配置从环境变量中读取
 */
const bot = mineflayer.createBot({
  host: process.env.MC_HOST,
  port: process.env.MC_PORT,
  username: process.env.MC_USERNAME,
  version: process.env.MC_VERSION
});

// 加载必要的插件
bot.loadPlugin(pathfinder);  // 用于寻路
bot.loadPlugin(toolPlugin);  // 用于工具操作

/**
 * 机器人状态管理
 * 用于追踪当前任务和目标
 */
let botState = {
  isFollowing: false,      // 是否正在跟随玩家
  targetPlayer: null,      // 目标玩家名称
  tasks: [],              // 待执行的任务队列
  isMining: false         // 是否正在挖掘
};

/**
 * 处理AI响应的动作
 * @param {Object} action - AI返回的动作对象
 * @param {string} username - 发送消息的玩家名称
 */
async function handleAction(action, username) {
  if (!action?.tool) return;

  const tool = tools[action.tool];
  if (!tool) {
    console.error(`未知的工具: ${action.tool}`);
    return;
  }

  try {
    // 如果是follow动作，总是使用发送消息的玩家名称
    if (action.tool === 'follow') {
      action.params = { playerName: username };
    }

    await tool.execute(bot, botState, action.params);
  } catch (error) {
    console.error(`执行动作 ${action.tool} 时出错:`, error);
    bot.chat('执行动作时出错了');
  }
}

// 聊天消息处理
bot.on('chat', async (username, message) => {
  // 忽略自己发送的消息
  if (username === bot.username) return;

  // 检查消息是否为空或只包含空白字符
  if (!message || message.trim() === '') {
    console.log(`[警告] 收到来自 ${username} 的空消息`);
    return;
  }

  // 在控制台显示玩家消息
  console.log(`\n[玩家 ${username}]: ${message}`);

  // 使用DeepSeek处理对话
  try {
    // 构建上下文消息，确保每条消息都包含角色和内容
    const contextMessages = conversationContext.map(msg => ({
      role: msg.role,
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
    }));

    const result = await deepseek.chat(message, contextMessages);
    
    // 在控制台显示AI回复
    console.log(`[AI 回复]: ${result.reply}`);
    if (result.action) {
      console.log(`[AI 动作]: ${result.action.tool}`, result.action.params);
    }
    
    // 发送AI的回复
    if (result.reply) {
      bot.chat(result.reply);
    }

    // 执行AI返回的动作
    if (result.action) {
      await handleAction(result.action, username);
    }
    
    // 更新对话上下文，只保存最近的对话
    try {
      // 确保 result 是可序列化的
      const safeResult = {
        reply: result.reply,
        action: result.action ? {
          tool: result.action.tool,
          params: { ...result.action.params }
        } : null
      };

      conversationContext.push(
        { role: 'user', content: message },
        { role: 'assistant', content: safeResult }
      );
      
      // 保持上下文在最近6条消息以内（3轮对话）
      if (conversationContext.length > 6) {
        conversationContext = conversationContext.slice(-6);
      }

      // 验证上下文是否可以序列化
      try {
        JSON.stringify(conversationContext);
      } catch (e) {
        console.error('上下文序列化验证失败，重置上下文:', e);
        conversationContext = [
          { role: 'user', content: message },
          { role: 'assistant', content: safeResult }
        ];
      }

      // 记录当前上下文
      console.log('\n当前对话上下文:', JSON.stringify(conversationContext, null, 2));
    } catch (error) {
      console.error('更新上下文时出错:', error);
      // 保持最后一轮对话
      conversationContext = conversationContext.slice(-2);
    }

  } catch (error) {
    console.error('处理消息时出错:', error);
    bot.chat('抱歉，我现在有点迷糊，能重新说一遍吗？');
  }
});

// 事件处理
bot.on('spawn', () => {
  console.log('机器人已连接到服务器');
  bot.chat('AI助手已上线，输入命令与我互动！');
});

bot.on('error', (err) => {
  console.error('连接错误:', err);
});

bot.on('kicked', (reason) => {
  console.log('被踢出服务器:', reason);
});

bot.on('end', () => {
  console.log('连接已断开');
}); 