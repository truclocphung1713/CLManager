# manifest.json 使用说明

## ⚠️ 重要规则

### 版本管理
**只使用全局 `version` 字段，不要给单个模块添加 `version` 字段！**

```json
{
  "version": "1.9.2",  // ✅ 正确：只使用这个全局版本号
  "modules": {
    "core": {
      "version": "2.1.0",  // ❌ 错误：不要添加单独的模块版本
      "url": "..."
    }
  }
}
```

### 为什么？
1. **简化管理**：只需要维护一个版本号
2. **一致性**：所有模块使用同一个版本号，避免混乱
3. **缓存逻辑**：主脚本只检查全局版本号来判断是否需要更新

### 如何更新版本？
只需修改全局 `version` 字段：
```json
{
  "version": "1.9.3",  // 更新这里就够了
  "modules": {
    ...
  }
}
```

## 文件结构

```json
{
  "version": "全局版本号",
  "modules": {
    "模块名": {
      "url": "模块的 GitHub 原始链接",
      "targets": ["适用的页面类型列表"]
    }
  }
}
```

## 页面类型
- `desktop-thread` - 桌面端帖子详情页
- `desktop-search` - 桌面端搜索页
- `desktop-forum` - 桌面端论坛板块页
- `mobile-thread` - 手机端帖子详情页
- `mobile-search` - 手机端搜索页
- `mobile-forum` - 手机端论坛板块页
