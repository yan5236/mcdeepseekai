/**
 * DeepSeek API 服务封装
 * 用于处理与 DeepSeek 大语言模型的通信
 */
const OpenAI = require('openai');
const AVAILABLE_TOOLS = require('../tools');
const MINECRAFT_PLAYER_PROMPT = require('../prompts/minecraft-player');

class DeepSeekService {
  /**
   * 初始化 DeepSeek 服务
   * @param {string} apiKey - DeepSeek API密钥
   */
  constructor(apiKey) {
    this.client = new OpenAI({
      apiKey: apiKey,
      baseURL: 'https://api.deepseek.com',  // 修改为官方文档推荐的 baseURL
      timeout: 30000,  // 30秒超时
      maxRetries: 3    // 最大重试次数
    });

    // 使用外部提示词配置
    this.systemPrompt = MINECRAFT_PLAYER_PROMPT;
  }

  /**
   * 验证工具参数是否符合要求
   * @param {string} toolName - 工具名称
   * @param {Object} params - 工具参数
   * @returns {boolean} - 是否符合要求
   */
  validateToolParams(toolName, params) {
    const tool = AVAILABLE_TOOLS[toolName];
    if (!tool) return false;

    // 检查必需参数
    if (tool.parameters.required) {
      for (const required of tool.parameters.required) {
        if (!(required in params)) return false;
      }
    }

    return true;
  }

  /**
   * 发送消息到 DeepSeek 并获取回复
   * @param {string} message - 用户发送的消息
   * @param {Array} context - 对话上下文历史
   * @returns {Promise<Object>} - AI的回复，包含回复文本和动作
   */
  async chat(message, context = []) {
    try {
      console.log('发送到 DeepSeek 的消息:', message);
      console.log('发送的上下文:', JSON.stringify(context, null, 2));
      
      // 调用 DeepSeek API
      const response = await this.client.chat.completions.create({
        model: 'deepseek-chat',    // 使用 DeepSeek Chat 模型
        messages: [
          this.systemPrompt,       // 添加系统提示
          ...context.map(msg => {
            // 确保 content 是字符串格式
            let content = msg.content;
            if (typeof content === 'object') {
              try {
                content = JSON.stringify(content);
              } catch (e) {
                console.warn('上下文序列化失败:', e);
                content = String(content);
              }
            }
            return {
              role: msg.role,
              content: content
            };
          }),
          { 
            role: 'user', 
            content: `用JSON格式回复以下内容（必须包含reply和action字段）：${message}` // 优化提示词
          }
        ],
        temperature: 0.3,         // 降低随机性，使回复更稳定
        max_tokens: 2000,         // 增加最大长度，防止截断
        response_format: { type: "json_object" },  // 要求返回JSON格式
        stream: false             // 不使用流式响应
      });

      if (!response.choices || !response.choices[0] || !response.choices[0].message) {
        throw new Error('API 返回格式错误');
      }

      const content = response.choices[0].message.content;
      console.log('DeepSeek 原始响应:', content);

      // 处理空响应或 undefined 的情况
      if (!content || content === 'undefined' || content === 'null') {
        console.warn('收到无效响应，使用上下文中的最后一个动作');
        const lastContext = context.length > 0 ? context[context.length - 1] : null;
        const lastAction = lastContext?.content?.action;
        const lastParams = lastAction?.params || { blockType: "stone", amount: 1 };

        return {
          reply: "我明白了，继续执行上一个动作",
          action: {
            tool: lastAction?.tool || "mine",
            params: {
              ...lastParams,
              amount: message.match(/\d+/)?.[0] ? parseInt(message.match(/\d+/)[0]) : lastParams.amount
            }
          }
        };
      }

      // 尝试解析 JSON 响应
      let result;
      try {
        // 如果返回的不是JSON格式，尝试提取JSON部分
        if (typeof content === 'object') {
          result = content;
        } else {
          // 清理可能的非法字符
          let cleanContent = content.trim();
          // 确保以 { 开头，} 结尾
          const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            throw new Error('无法找到有效的 JSON 内容');
          }
          const jsonStr = jsonMatch[0];
          // 移除可能的尾随逗号
          const cleanJsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
          result = JSON.parse(cleanJsonStr);
        }
      } catch (parseError) {
        console.error('JSON 解析错误:', parseError);
        console.debug('尝试解析的内容:', content);
        // 如果无法解析 JSON，构造一个基于上下文的响应
        const lastContext = context.length > 0 ? context[context.length - 1] : null;
        const lastAction = lastContext?.content?.action;
        const lastParams = lastAction?.params || { blockType: "stone", amount: 1 };

        return {
          reply: "好，继续上一个动作",
          action: {
            tool: lastAction?.tool || "mine",
            params: {
              ...lastParams,
              amount: message.match(/\d+/)?.[0] ? parseInt(message.match(/\d+/)[0]) : lastParams.amount
            }
          }
        };
      }

      console.log('解析后的响应:', result);

      // 验证响应格式
      if (!result.reply) {
        throw new Error('响应缺少必要的 reply 字段');
      }

      // 验证工具参数
      if (result.action?.tool) {
        if (!this.validateToolParams(result.action.tool, result.action.params)) {
          console.log('工具参数验证失败:', result.action);
          // 如果参数验证失败，尝试使用上下文中的最后一个动作
          const lastContext = context.length > 0 ? context[context.length - 1] : null;
          const lastAction = lastContext?.content?.action;
          const lastParams = lastAction?.params || { blockType: "stone", amount: 1 };

          return {
            reply: "继续之前的动作",
            action: {
              tool: lastAction?.tool || "mine",
              params: {
                ...lastParams,
                amount: message.match(/\d+/)?.[0] ? parseInt(message.match(/\d+/)[0]) : lastParams.amount
              }
            }
          };
        }
      }

      return result;
    } catch (error) {
      console.error('DeepSeek API 调用错误:', error);
      
      // 尝试从上下文中获取最后一个动作
      const lastContext = context.length > 0 ? context[context.length - 1] : null;
      const lastAction = lastContext?.content?.action;
      const lastParams = lastAction?.params || { blockType: "stone", amount: 1 };

      // 根据错误类型返回不同的用户友好消息
      if (error.status === 429) {
        return {
          reply: "我继续之前的动作",
          action: {
            tool: lastAction?.tool || "mine",
            params: {
              ...lastParams,
              amount: message.match(/\d+/)?.[0] ? parseInt(message.match(/\d+/)[0]) : lastParams.amount
            }
          }
        };
      } else if (error.status >= 500) {
        return {
          reply: "好的，我继续",
          action: {
            tool: lastAction?.tool || "mine",
            params: {
              ...lastParams,
              amount: message.match(/\d+/)?.[0] ? parseInt(message.match(/\d+/)[0]) : lastParams.amount
            }
          }
        };
      }

      return {
        reply: "继续上一个动作",
        action: {
          tool: lastAction?.tool || "mine",
          params: {
            ...lastParams,
            amount: message.match(/\d+/)?.[0] ? parseInt(message.match(/\d+/)[0]) : lastParams.amount
          }
        }
      };
    }
  }
}

module.exports = DeepSeekService; 