# MySQL MCP Server

MySQL MCP Server 是一个为 Cursor 编辑器设计的 Model Context Protocol (MCP) 服务器，让 AI 助手能够直接查询 MySQL 数据库。

## ✨ 功能特性

- 🔍 执行 SQL 查询
- 📋 列出所有数据表
- 📊 查看表结构
- 🔒 安全的环境变量配置
- ⏱️ 可配置查询超时，防止SQL卡死
- 🚀 开箱即用，通过 npx 快速启动

## 📦 安装

### 方式 1: 使用 npx (推荐)

无需安装，直接在 `mcp.json` 中配置：

```json
{
  "mcpServers": {
    "mysql": {
      "command": "npx",
      "args": ["-y", "@keevor/mysql-mcp-server"],
      "env": {
        "DB_HOST": "localhost",
        "DB_PORT": "3306",
        "DB_USER": "root",
        "DB_PASSWORD": "your_password",
        "DB_DATABASE": "your_database",
        "DB_QUERY_TIMEOUT": "10"
      }
    }
  }
}
```

### 方式 2: 全局安装

```bash
npm install -g @keevor/mysql-mcp-server
```

然后在 `mcp.json` 中配置：

```json
{
  "mcpServers": {
    "mysql": {
      "command": "mysql-mcp-server",
      "env": {
        "DB_HOST": "localhost",
        "DB_PORT": "3306",
        "DB_USER": "root",
        "DB_PASSWORD": "your_password",
        "DB_DATABASE": "your_database",
        "DB_QUERY_TIMEOUT": "10"
      }
    }
  }
}
```

## 🔧 配置说明

通过环境变量配置数据库连接：

| 环境变量 | 必需 | 默认值 | 说明 |
|---------|------|--------|------|
| `DB_HOST` | ✅ 是 | - | 数据库主机地址 |
| `DB_PORT` | ❌ 否 | 3306 | 数据库端口 |
| `DB_USER` | ✅ 是 | - | 数据库用户名 |
| `DB_PASSWORD` | ❌ 否 | "" | 数据库密码 |
| `DB_DATABASE` | ✅ 是 | - | 数据库名称 |
| `DB_CHARSET` | ❌ 否 | utf8mb4 | 字符集 |
| `DB_QUERY_TIMEOUT` | ❌ 否 | 10 | 查询超时时间（秒） |

## 🛠️ 可用工具

在 Cursor 中，AI 可以调用以下工具：

### 1. query - 执行 SQL 查询

```javascript
// 示例
query({ sql: "SELECT * FROM users LIMIT 10" })
```

### 2. list_tables - 列出所有数据表

```javascript
// 示例
list_tables()
```

### 3. describe_table - 查看表结构

```javascript
// 示例
describe_table({ table: "users" })
```

## 📍 配置文件位置

在 Cursor 中，`mcp.json` 配置文件的位置：

- **Windows**: `%APPDATA%\Cursor\User\globalStorage\rooveterinaryinc.roo-cline\settings\mcp.json`
- **macOS**: `~/Library/Application Support/Cursor/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp.json`
- **Linux**: `~/.config/Cursor/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp.json`

## 🚀 使用示例

在 Cursor 中配置好 MCP 服务器后，你可以这样与 AI 对话：

> "查询 users 表中的所有数据"
> 
> "列出数据库中的所有表"
> 
> "查看 orders 表的结构"

## 🔒 安全提示

- ⚠️ 不要在公开的代码仓库中提交包含数据库密码的 `mcp.json` 文件
- ⚠️ 建议使用只读账户或限制权限的数据库账户
- ⚠️ 在生产环境中使用时要特别小心

## 📝 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📧 联系方式

如有问题，请在 GitHub 上提交 Issue。

