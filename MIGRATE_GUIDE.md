# Container-Parking 数据迁移操作指南

## ✅ 前置条件
- [x] Firebase 用户已创建（admin@container-parking.local）
- [x] 代码已更新（支持 Firebase Auth）

---

## 🚀 操作步骤

### 第一步：设置 Firebase 安全规则（过渡期）

1. 打开 https://console.firebase.google.com/project/container-parking-90ab5/database/rules
2. 替换为以下内容（允许读写，用于数据迁移）：

```json
{
  "rules": {
    "cpms_v2": {
      ".read": true,
      ".write": true
    },
    "cpms_settings": {
      ".read": true,
      ".write": true
    },
    "cpms_admins": {
      ".read": true,
      ".write": true
    }
  }
}
```

3. 点击"**发布**"

---

### 第二步：运行数据迁移脚本

1. 打开网站 https://tian8896.github.io/container-parking/
2. 使用管理员账号登录（admin / admin123）
3. 按 **F12** 打开开发者工具
4. 切换到 **Console** 标签
5. 复制 `migrate.js` 的全部内容
6. 粘贴到控制台，按回车
7. 你会看到：
   ```
   🚀 数据迁移脚本已加载！
   ```

---

### 第三步：执行迁移

在控制台依次运行：

```javascript
// 1. 查看当前用户 UID
showMyUid()
// 输出: 当前用户 UID: xxxxxxx...

// 2. 检查数据状态
checkDataStatus()
// 输出: 
// 📊 数据状态:
// - 总记录数: 50
// - ✅ 有 owner 字段: 0
// - ⚠️ 无 owner 字段: 50

// 3. 开始迁移
migrateData()
// 输出:
// ✅ 迁移完成！已为 50 条记录添加 owner 字段
// ✅ 管理员标记已设置
```

---

### 第四步：切换到安全规则

数据迁移完成后，切换到安全规则：

1. 打开 https://console.firebase.google.com/project/container-parking-90ab5/database/rules
2. 替换为以下内容：

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
        )"
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

3. 点击"**发布**"

---

### 第五步：验证

1. 刷新网页（Ctrl + Shift + R）
2. 重新登录
3. 检查数据是否正常显示
4. 尝试添加新记录，检查是否能保存

---

## 🔧 故障排除

### 问题："请先登录系统"
**解决**：确保在网页上已登录，控制台显示 `Firebase Auth: logged in as`

### 问题："Firebase 未初始化"
**解决**：等待页面完全加载后再运行脚本

### 问题：迁移后数据不显示
**解决**：
1. 检查规则是否正确发布
2. 运行 `checkDataStatus()` 确认 owner 字段已添加
3. 检查 UID 是否匹配

### 问题：无法保存新记录
**解决**：
1. 确认当前用户已登录 Firebase（运行 `showMyUid()`）
2. 检查安全规则是否允许写入

---

## 📞 紧急回滚

如果出现问题，可以：

1. **切换回开放规则**（允许所有人访问）
```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

2. **恢复数据备份**
   - 使用之前导出的 JSON 备份
   - 在 Firebase 控制台导入

---

## ✅ 完成检查清单

- [ ] 过渡期规则已发布
- [ ] 数据迁移脚本已运行
- [ ] 所有记录已添加 owner 字段
- [ ] 管理员标记已设置
- [ ] 安全规则已切换
- [ ] 重新登录后数据正常显示
- [ ] 可以正常添加新记录
