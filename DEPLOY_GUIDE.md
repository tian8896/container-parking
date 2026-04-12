# Container-Parking Firebase 安全加固部署指南

## 📋 概述

本指南将帮助你将 container-parking 项目从公开访问改为**安全的用户认证访问**，确保：
- 只有登录用户可以查看数据
- 用户只能看到自己的数据
- 现有数据不会丢失

---

## 🚀 部署步骤

### 第一步：备份现有数据

1. 打开 https://console.firebase.google.com/project/container-parking-90ab5/database/data
2. 点击右上角 ⚙️ 设置图标
3. 选择 "导出 JSON"
4. 保存备份文件到安全位置

---

### 第二步：启用 Firebase Authentication

1. 打开 https://console.firebase.google.com/project/container-parking-90ab5/authentication
2. 点击"开始使用"或"设置登录方法"
3. 启用"电子邮件/密码"
4. 保存

#### 创建用户账号

在 Firebase 控制台中创建与现有系统对应的用户：

| 本地用户名 | Firebase 邮箱 | 密码 |
|-----------|--------------|------|
| admin | admin@container-parking.local | admin123 |
| user | user@container-parking.local | user123 |

**操作步骤：**
1. 在 Authentication 页面点击"添加用户"
2. 输入邮箱和密码
3. 记录生成的 **UID**（后面会用到）

---

### 第三步：设置过渡期的安全规则

**⚠️ 重要：先使用过渡期规则，确保数据不丢失**

1. 打开 https://console.firebase.google.com/project/container-parking-90ab5/database/rules
2. 替换为以下内容：

```json
{
  "rules": {
    "cpms_v2": {
      ".read": true,
      ".write": true,
      "$recordId": {
        ".validate": "newData.hasChildren(['owner']) || data.exists()"
      }
    },
    "cpms_settings": {
      ".read": true,
      ".write": true
    }
  }
}
```

3. 点击"发布"

---

### 第四步：部署更新后的代码

将修改后的 `app.js` 上传到 GitHub Pages：

```bash
# 或者使用 Python 脚本
python upload_container_parking.py
```

---

### 第五步：数据迁移

**目标：为现有记录添加 owner 字段**

#### 方法 A：通过浏览器控制台（推荐）

1. 打开 https://tian8896.github.io/container-parking/
2. 使用管理员账号登录
3. 按 F12 打开开发者工具
4. 在 Console 中粘贴并运行 `migrate_data.js` 中的代码
5. 运行 `checkDataStatus()` 查看数据状态
6. 运行 `migrateData()` 开始迁移

#### 方法 B：使用 Firebase Admin SDK

如果需要更复杂的迁移，可以使用 Node.js 脚本。

---

### 第六步：切换到完全安全规则

数据迁移完成后，切换到完全安全规则：

```json
{
  "rules": {
    "cpms_v2": {
      ".read": "auth != null",
      ".write": "auth != null",
      "$recordId": {
        ".read": "auth != null && data.child('owner').val() === auth.uid",
        ".write": "auth != null && (
          (!data.exists() && newData.child('owner').val() === auth.uid) ||
          (data.exists() && data.child('owner').val() === auth.uid)
        )",
        ".validate": "newData.hasChild('owner')"
      }
    },
    "cpms_settings": {
      ".read": "auth != null",
      ".write": "auth != null",
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    },
    "cpms_admins": {
      ".read": "auth != null",
      ".write": "auth != null && root.child('cpms_admins/' + auth.uid).val() === true"
    }
  }
}
```

---

## 📁 文件说明

| 文件 | 说明 |
|-----|------|
| `app.js` | 主程序，已添加 Firebase Auth 支持 |
| `firebase_rules_stage1.json` | 过渡期规则（数据迁移用） |
| `firebase_rules_stage2.json` | 完全安全规则 |
| `migrate_data.js` | 数据迁移脚本 |
| `FIREBASE_SECURITY.md` | 安全方案文档 |

---

## ⚠️ 注意事项

1. **不要跳过备份步骤** - 数据无价
2. **过渡期规则只用于迁移** - 迁移完成后立即切换到安全规则
3. **测试后再切换规则** - 确保所有功能正常
4. **管理员账号** - 确保至少有一个管理员账号可以登录

---

## 🔧 故障排除

### 问题：无法登录 Firebase
**解决：** 检查邮箱格式是否为 `用户名@container-parking.local`

### 问题：数据不显示
**解决：** 
1. 检查规则是否允许读取
2. 检查记录是否有 owner 字段
3. 检查 owner 字段是否与当前用户 UID 匹配

### 问题：无法保存记录
**解决：**
1. 检查用户是否已登录 Firebase
2. 检查规则是否允许写入
3. 检查记录是否包含 owner 字段

---

## 📞 需要帮助？

如果遇到问题，可以：
1. 暂时切换回过渡期规则
2. 检查浏览器控制台的错误信息
3. 查看 Firebase 控制台的安全规则模拟器
