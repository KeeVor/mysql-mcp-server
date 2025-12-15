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
 *   DB_QUERY_TIMEOUT - 查询超时时间（可选，单位：秒，默认10秒）
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
 *         "DB_DATABASE": "database_name",
 *         "DB_QUERY_TIMEOUT": "30"
 *       }
 *     }
 *   }
 * }
 */

const mysql = require('mysql2/promise');
const readline = require('readline');

let pool = null; // 连接池
let queryTimeout = 10000; // 默认10秒超时（毫秒）

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

  // 读取查询超时配置（秒转换为毫秒）
  const timeoutSeconds = parseInt(process.env.DB_QUERY_TIMEOUT) || 10;
  queryTimeout = timeoutSeconds * 1000;

  // 验证必需的配置项
  const requiredFields = [
    { key: 'host', env: 'DB_HOST' },
    { key: 'user', env: 'DB_USER' },
    { key: 'database', env: 'DB_DATABASE' }
  ];

  for (const field of requiredFields) {
    if (!config[field.key]) {
      // 配置错误时退出进程
      process.exit(1);
    }
  }

  return config;
}

// 带超时的查询执行函数
async function executeWithTimeout(sql) {
  const timeoutSeconds = Math.floor(queryTimeout / 1000);
  let timeoutHandle = null;
  let conn = null;
  let connId = null;

  try {
    // 从连接池获取连接
    conn = await pool.getConnection();

    // 获取当前连接ID
    const [idResult] = await conn.query('SELECT CONNECTION_ID() as id');
    connId = idResult[0].id;

    // 超时处理
    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(async () => {
        // 使用新连接来 KILL 当前查询
        try {
          const killConn = await pool.getConnection();
          await killConn.query(`KILL QUERY ${connId}`);
          killConn.release();
        } catch (killError) {
          // 忽略 KILL 错误
        }

        reject(new Error(`查询超时：查询执行超过 ${timeoutSeconds} 秒未响应，已自动终止。请重新尝试执行！`));
      }, queryTimeout);
    });

    // 对于 SELECT 查询，添加 MAX_EXECUTION_TIME hint
    let executeSql = sql.trim();
    if (executeSql.toUpperCase().startsWith('SELECT')) {
      // 在 SELECT 后添加超时提示（毫秒）
      executeSql = executeSql.replace(/^SELECT/i, `SELECT /*+ MAX_EXECUTION_TIME(${queryTimeout}) */`);
    }

    const queryPromise = conn.execute(executeSql);
    const result = await Promise.race([queryPromise, timeoutPromise]);

    // 清除超时定时器
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }

    return result;
  } catch (error) {
    // 清除超时定时器
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    throw error;
  } finally {
    // 释放连接回池
    if (conn) {
      conn.release();
    }
  }
}

// 初始化数据库连接池
async function initConnection() {
  try {
    const dbConfig = loadDbConfig();

    // 创建连接池
    pool = mysql.createPool({
      ...dbConfig,
      waitForConnections: true,
      connectionLimit: 5,  // 最大连接数
      queueLimit: 0,       // 不限制队列
      enableKeepAlive: true,
      keepAliveInitialDelay: 0
    });

    // 测试连接
    const testConn = await pool.getConnection();
    await testConn.query('SELECT CONNECTION_ID() as id, VERSION() as version');
    testConn.release();
  } catch (error) {
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
          const [rows] = await executeWithTimeout(args.sql);
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
          // 使用 SHOW TABLE STATUS 获取表名和表备注
          const [tables] = await executeWithTimeout('SHOW TABLE STATUS');
          // 提取表名和备注
          const tableInfo = tables.map(row => ({ name: row.Name, comment: row.Comment || '' }));
          return {
            jsonrpc: '2.0',
            id: id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(tableInfo, null, 2)
                }
              ]
            }
          };
        }

        if (name === 'describe_table') {
          // 使用 SHOW FULL COLUMNS 获取完整的列信息，包含 Comment 字段
          const [structure] = await executeWithTimeout(`SHOW FULL COLUMNS FROM ${args.table}`);
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
    // 如果有 id，返回错误响应；否则忽略
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
    const response = await handleRequest(line);

    // 如果响应为 null（通知消息），不输出响应
    if (response === null) {
      return;
    }

    // 只输出 JSON-RPC 响应，不输出任何其他内容
    console.log(JSON.stringify(response));
  });

  rl.on('close', async () => {
    if (pool) {
      await pool.end();
    }
    process.exit(0);
  });
}

main().catch(error => {
  process.exit(1);
});

