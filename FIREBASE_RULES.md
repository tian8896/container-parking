# Container-Parking Firebase 安全规则

## 当前需要的规则

请在 Firebase 控制台设置以下规则：

https://console.firebase.google.com/project/container-parking-90ab5/database/rules

```json
{
  "rules": {
    "cpms_v2": {
      ".read": "auth != null",
      ".write": "auth != null"
    },
    "cpms_settings": {
      ".read": "auth != null",
      ".write": "auth != null"
    },
    "cpms_users": {
      ".read": "auth != null",
      ".write": "auth != null",
      "$uid": {
        ".read": "auth != null",
        ".write": "auth != null && auth.uid === $uid"
      }
    }
  }
}
```

## 说明

- `auth != null` 表示只有登录用户才能读写
- 使用 Firebase Auth 登录后，数据会自动获得权限

## 临时开放规则（调试用）

如果想暂时开放所有权限（不推荐），使用：

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```
