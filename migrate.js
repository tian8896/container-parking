// ============================================================
// Container-Parking 数据迁移脚本
// 在浏览器控制台运行（需要先登录）
// ============================================================

// 配置：设置为管理员的用户 UID（从 Firebase 控制台获取）
const CONFIG = {
  // 从 Firebase 控制台 > Authentication > Users 复制管理员的 UID
  // 例如: 'AbC123XyZ456'
  adminUid: null,  // ← 在这里填写管理员的 UID
  
  // 或者设置为 true 自动使用当前登录用户的 UID
  useCurrentUser: true
};

// 检查数据状态
async function checkDataStatus() {
  if (!firebase || !firebase.database) {
    console.error('❌ Firebase 未初始化');
    return;
  }
  
  const user = firebase.auth().currentUser;
  if (!user) {
    console.error('❌ 请先登录系统');
    return;
  }
  
  console.log('当前用户:', user.email, 'UID:', user.uid);
  
  const db = firebase.database();
  const snap = await db.ref('cpms_v2').once('value');
  const data = snap.val() || {};
  
  let withOwner = 0;
  let withoutOwner = 0;
  const noOwnerIds = [];
  
  Object.keys(data).forEach(key => {
    if (data[key].owner) {
      withOwner++;
    } else {
      withoutOwner++;
      noOwnerIds.push(key);
    }
  });
  
  console.log('\n📊 数据状态:');
  console.log('- 总记录数:', Object.keys(data).length);
  console.log('- ✅ 有 owner 字段:', withOwner);
  console.log('- ⚠️ 无 owner 字段:', withoutOwner);
  
  if (noOwnerIds.length > 0) {
    console.log('\n需要迁移的记录 ID:', noOwnerIds.slice(0, 10).join(', ') + (noOwnerIds.length > 10 ? '...' : ''));
  }
  
  return { total: Object.keys(data).length, withOwner, withoutOwner, noOwnerIds };
}

// 迁移数据
async function migrateData() {
  if (!firebase || !firebase.database) {
    console.error('❌ Firebase 未初始化');
    return;
  }
  
  const user = firebase.auth().currentUser;
  if (!user) {
    console.error('❌ 请先登录系统');
    return;
  }
  
  const db = firebase.database();
  const ownerUid = CONFIG.useCurrentUser ? user.uid : CONFIG.adminUid;
  
  if (!ownerUid) {
    console.error('❌ 请设置 CONFIG.adminUid 或将 CONFIG.useCurrentUser 设为 true');
    return;
  }
  
  console.log('使用 UID:', ownerUid);
  
  // 获取所有记录
  console.log('\n正在获取数据...');
  const snap = await db.ref('cpms_v2').once('value');
  const data = snap.val() || {};
  
  // 准备更新
  const updates = {};
  let count = 0;
  
  Object.keys(data).forEach(key => {
    const record = data[key];
    if (!record.owner) {
      updates[`cpms_v2/${key}/owner`] = ownerUid;
      count++;
    }
  });
  
  if (count === 0) {
    console.log('✅ 所有记录已有 owner 字段，无需迁移');
    return;
  }
  
  console.log(`\n准备迁移 ${count} 条记录`);
  
  // 执行更新
  try {
    await db.ref().update(updates);
    console.log(`✅ 迁移完成！已为 ${count} 条记录添加 owner 字段`);
    
    // 设置管理员标记
    await db.ref(`cpms_admins/${ownerUid}`).set(true);
    console.log('✅ 管理员标记已设置');
    
  } catch (error) {
    console.error('❌ 迁移失败:', error);
  }
}

// 设置管理员
async function setAdmin(uid) {
  if (!uid) {
    const user = firebase.auth().currentUser;
    if (!user) {
      console.error('❌ 请先登录或提供 UID');
      return;
    }
    uid = user.uid;
  }
  
  const db = firebase.database();
  await db.ref(`cpms_admins/${uid}`).set(true);
  console.log(`✅ 已设置 ${uid} 为管理员`);
}

// 查看当前用户 UID
function showMyUid() {
  const user = firebase.auth().currentUser;
  if (user) {
    console.log('当前用户 UID:', user.uid);
    console.log('邮箱:', user.email);
    return user.uid;
  } else {
    console.log('未登录');
    return null;
  }
}

// 导出函数到全局
window.checkDataStatus = checkDataStatus;
window.migrateData = migrateData;
window.setAdmin = setAdmin;
window.showMyUid = showMyUid;

console.log('🚀 数据迁移脚本已加载！');
console.log('');
console.log('可用命令：');
console.log('  showMyUid()        - 查看当前用户 UID');
console.log('  checkDataStatus()  - 检查数据状态');
console.log('  migrateData()      - 开始数据迁移');
console.log('  setAdmin(uid)      - 设置管理员（uid 可选，默认当前用户）');
console.log('');
console.log('迁移步骤：');
console.log('1. 运行 showMyUid() 确认 UID');
console.log('2. 运行 checkDataStatus() 查看需要迁移的数据');
console.log('3. 运行 migrateData() 开始迁移');
