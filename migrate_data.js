// ============================================================
// Firebase 数据迁移脚本 - 为现有记录添加 owner 字段
// 在浏览器控制台运行（需要先登录 Firebase）
// ============================================================

// 配置
const CONFIG = {
  // 设置为管理员的用户邮箱（将拥有所有现有数据）
  adminEmail: 'admin@example.com',
  // 或者设置为特定 UID
  adminUid: null // 如果知道 UID，可以直接填写
};

// 迁移函数
async function migrateData() {
  if (!firebase || !firebase.auth) {
    console.error('Firebase 未初始化');
    return;
  }
  
  const user = firebase.auth().currentUser;
  if (!user) {
    console.error('请先登录 Firebase');
    return;
  }
  
  console.log('当前用户:', user.email, 'UID:', user.uid);
  
  const db = firebase.database();
  const ownerUid = CONFIG.adminUid || user.uid;
  
  try {
    // 1. 获取所有 cpms_v2 记录
    console.log('正在获取 cpms_v2 记录...');
    const snap = await db.ref('cpms_v2').once('value');
    const data = snap.val() || {};
    
    console.log('找到', Object.keys(data).length, '条记录');
    
    // 2. 准备更新
    const updates = {};
    let count = 0;
    
    Object.keys(data).forEach(key => {
      const record = data[key];
      // 只更新没有 owner 字段的记录
      if (!record.owner) {
        updates[`cpms_v2/${key}/owner`] = ownerUid;
        count++;
      }
    });
    
    console.log('需要更新', count, '条记录');
    
    if (count === 0) {
      console.log('所有记录已有 owner 字段，无需更新');
      return;
    }
    
    // 3. 执行更新
    if (confirm(`确认更新 ${count} 条记录，owner 设置为 ${ownerUid}？`)) {
      await db.ref().update(updates);
      console.log('✅ 迁移完成！');
      
      // 4. 设置管理员标记
      await db.ref(`cpms_admins/${ownerUid}`).set(true);
      console.log('✅ 管理员标记已设置');
    } else {
      console.log('已取消');
    }
    
  } catch (error) {
    console.error('迁移失败:', error);
  }
}

// 检查数据状态
async function checkDataStatus() {
  const db = firebase.database();
  const snap = await db.ref('cpms_v2').once('value');
  const data = snap.val() || {};
  
  let withOwner = 0;
  let withoutOwner = 0;
  
  Object.keys(data).forEach(key => {
    if (data[key].owner) {
      withOwner++;
    } else {
      withoutOwner++;
    }
  });
  
  console.log('数据状态:');
  console.log('- 总记录数:', Object.keys(data).length);
  console.log('- 有 owner 字段:', withOwner);
  console.log('- 无 owner 字段:', withoutOwner);
}

// 导出函数到全局
window.migrateData = migrateData;
window.checkDataStatus = checkDataStatus;

console.log('迁移脚本已加载！');
console.log('运行 checkDataStatus() 查看数据状态');
console.log('运行 migrateData() 开始迁移');
