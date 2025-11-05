#!/usr/bin/env node

/**
 * 自定义 MySQL MCP 服务器
 * 为 Cursor 提供 MySQL 数据库查询能力
 * 
 * 使用环境变量配置数据库连接：
 *   DB_HOST - 数据库主机地址（必需）
 *   DB_PORT - 数据库端口（可选，默认3306）
 *   DB_USER - 数据库用户名（必需）
 *   DB_PASSWORD - 数据库密码（可选）
 *   DB_DATABASE - 数据库名称（必需）
 *   DB_CHARSET - 字符集（可选，默认utf8mb4）
 * 
 * 在 mcp.json 中配置示例：
 * {
 *   "mcpServers": {
 *     "mysql": {
 *       "command": "node",
 *       "args": ["path/to/mysql-mcp-server.js"],
 *       "env": {
 *         "DB_HOST": "localhost",
 *         "DB_PORT": "3306",
 *         "DB_USER": "root",
 *         "DB_PASSWORD": "root",
 *         "DB_DATABASE": "database_name"
 *       }
 *     }
 *   }
 * }
 */

const mysql = require('mysql2/promise');
const readline = require('readline');

let connection = null;

// 从环境变量读取数据库配置
function loadDbConfig() {
  const config = {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE,
    charset: process.env.DB_CHARSET || 'utf8mb4'
  };
  
  // 验证必需的配置项
  const requiredFields = [
    { key: 'host', env: 'DB_HOST' },
    { key: 'user', env: 'DB_USER' },
    { key: 'database', env: 'DB_DATABASE' }
  ];
  
  for (const field of requiredFields) {
    if (!config[field.key]) {
      console.error(`❌ 错误: 缺少必需的环境变量: ${field.env}`);
      console.error('请在 mcp.json 的 env 配置中设置该变量');
      process.exit(1);
    }
  }
  
  console.error(`🔗 数据库连接信息: ${config.host}:${config.port}/${config.database}`);
  console.error(`👤 用户: ${config.user}`);
  
  return config;
}

// 初始化数据库连接
async function initConnection() {
  try {
    const dbConfig = loadDbConfig();
    connection = await mysql.createConnection(dbConfig);
    console.error('✅ MySQL 连接成功');
  } catch (error) {
    console.error('❌ MySQL 连接失败:', error.message);
    process.exit(1);
  }
}

// 处理 MCP 请求
async function handleRequest(request) {
  let requestData;
  try {
    requestData = JSON.parse(request);
  } catch (error) {
    return {
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32700,
        message: 'Parse error'
      }
    };
  }

  const { id, method, params } = requestData;
  
  // 处理通知消息（没有 id 的请求，不需要响应）
  if (id === undefined || id === null) {
    console.error('[INFO] Received notification:', method);
    // 通知消息的处理
    switch (method) {
      case 'notifications/initialized':
      case 'notifications/cancelled':
      case 'notifications/progress':
        // 这些通知不需要响应
        return null;
      default:
        // 其他通知也不响应
        return null;
    }
  }
  
  try {
    switch (method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id: id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {}
            },
            serverInfo: {
              name: 'mysql-server',
              version: '1.0.0'
            }
          }
        };
      
      case 'tools/list':
        return {
          jsonrpc: '2.0',
          id: id,
          result: {
            tools: [
              {
                name: 'query',
                description: '执行 SQL 查询',
                inputSchema: {
                  type: 'object',
                  properties: {
                    sql: {
                      type: 'string',
                      description: 'SQL 查询语句'
                    }
                  },
                  required: ['sql']
                }
              },
              {
                name: 'list_tables',
                description: '列出所有数据表',
                inputSchema: {
                  type: 'object',
                  properties: {}
                }
              },
              {
                name: 'describe_table',
                description: '查看表结构',
                inputSchema: {
                  type: 'object',
                  properties: {
                    table: {
                      type: 'string',
                      description: '表名'
                    }
                  },
                  required: ['table']
                }
              }
            ]
          }
        };
      
      case 'tools/call':
        const { name, arguments: args } = params;
        
        if (name === 'query') {
          const [rows] = await connection.execute(args.sql);
          return {
            jsonrpc: '2.0',
            id: id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(rows, null, 2)
                }
              ]
            }
          };
        }
        
        if (name === 'list_tables') {
          const [tables] = await connection.execute('SHOW TABLES');
          // 提取表名列表
          const tableNames = tables.map(row => Object.values(row)[0]);
          return {
            jsonrpc: '2.0',
            id: id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(tableNames, null, 2)
                }
              ]
            }
          };
        }
        
        if (name === 'describe_table') {
          const [structure] = await connection.execute(`DESCRIBE ${args.table}`);
          return {
            jsonrpc: '2.0',
            id: id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(structure, null, 2)
                }
              ]
            }
          };
        }
        
        throw new Error(`未知的工具: ${name}`);
      
      default:
        // 未知方法，如果有 id 就返回错误，否则忽略
        if (id !== undefined && id !== null) {
          return {
            jsonrpc: '2.0',
            id: id,
            error: {
              code: -32601,
              message: `未知的方法: ${method}`
            }
          };
        }
        return null;
    }
  } catch (error) {
    // 如果有 id，返回错误响应；否则只记录错误
    if (id !== undefined && id !== null) {
      return {
        jsonrpc: '2.0',
        id: id,
        error: {
          code: -32603,
          message: error.message
        }
      };
    }
    console.error('[ERROR] Error processing notification:', error.message);
    return null;
  }
}

// 主函数
async function main() {
  await initConnection();
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });
  
  rl.on('line', async (line) => {
    // 记录接收到的请求（用于调试）
    console.error('[DEBUG] Received:', line.substring(0, 200));
    
    const response = await handleRequest(line);
    
    // 如果响应为 null（通知消息），不输出响应
    if (response === null) {
      return;
    }
    
    // 记录发送的响应（用于调试）
    console.error('[DEBUG] Sending:', JSON.stringify(response).substring(0, 200));
    
    console.log(JSON.stringify(response));
  });
  
  rl.on('close', async () => {
    if (connection) {
      await connection.end();
    }
    process.exit(0);
  });
}

main().catch(error => {
  console.error('服务器错误:', error);
  process.exit(1);
});

