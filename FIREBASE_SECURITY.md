# Container-Parking Firebase 安全加固方案

## 当前问题
- 数据库完全公开，任何人可以读写
- 没有用户认证机制
- 数据没有按用户隔离

## 解决方案

### 第一步：启用 Firebase Authentication

1. 打开 https://console.firebase.google.com/project/container-parking-90ab5/authentication
2. 点击"开始"或"设置登录方法"
3. 启用"电子邮件/密码"登录方式
4. 保存

### 第二步：设置安全规则

打开 https://console.firebase.google.com/project/container-parking-90ab5/database/rules

粘贴以下规则（替换默认规则）：

```json
{
  "rules": {
    // 用户认证信息 - 只有管理员可以管理
    "cpms_users": {
      ".read": "auth != null",
      ".write": "auth != null && root.child('cpms_users/' + auth.uid + '/role').val() === 'admin'",
      "$uid": {
        ".read": "auth != null && (auth.uid === $uid || root.child('cpms_users/' + auth.uid + '/role').val() === 'admin')",
        ".write": "auth != null && (auth.uid === $uid || root.child('cpms_users/' + auth.uid + '/role').val() === 'admin')"
      }
    },
    
    // 用户个人记录 - 只能查看自己的
    "cpms_v2": {
      ".read": "auth != null",
      ".write": "auth != null",
      "$recordId": {
        // 记录必须包含 owner 字段，且 owner 必须是当前用户
        ".read": "auth != null && data.child('owner').val() === auth.uid",
        ".write": "auth != null && (data.child('owner').val() === auth.uid || newData.child('owner').val() === auth.uid)"
      }
    },
    
    // 设置 - 按用户隔离
    "cpms_settings": {
      ".read": "auth != null",
      ".write": "auth != null",
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    }
  }
}
```

### 第三步：迁移现有数据

由于现有数据没有 owner 字段，需要迁移。有两种方案：

**方案 A：管理员统一管理（推荐）**
- 创建一个管理员账号
- 所有现有数据归管理员所有
- 其他用户只能看到自己的新数据

**方案 B：数据按用户复制**
- 每个用户登录后复制一份基础数据

### 第四步：修改代码

需要修改 app.js 添加 Firebase Auth 集成。

## 数据迁移脚本

运行以下脚本将现有数据添加 owner 字段：

```javascript
// 在浏览器控制台运行（先以管理员登录）
const adminUid = 'ADMIN_UID_HERE'; // 替换为实际的管理员 UID

db.ref('cpms_v2').once('value').then(snap => {
  const updates = {};
  snap.forEach(child => {
    const key = child.key;
    const val = child.val();
    if (!val.owner) {
      updates[key + '/owner'] = adminUid;
    }
  });
  return db.ref('cpms_v2').update(updates);
}).then(() => console.log('Migration complete'));
```

## 注意

1. **备份数据**：修改规则前导出 JSON 备份
2. **测试**：先在测试环境验证规则
3. **渐进迁移**：可以先允许公开读取，逐步收紧权限
