// ============================================================
// CONFIG
// ============================================================
// Firebase Auth config
var FIREBASE_AUTH_CONFIG = {
  apiKey: 'AIzaSyC6YXeW78gqSW3SpCS0G8eXNwmToxVB_WI',
  authDomain: 'container-parking-90ab5.firebaseapp.com',
  databaseURL: 'https://container-parking-90ab5-default-rtdb.firebaseio.com',
  projectId: 'container-parking-90ab5',
  storageBucket: 'container-parking-90ab5.firebasestorage.app',
  messagingSenderId: '376445767246',
  appId: '1:376445767246:web:aef8404177b4608cbd3d1f'
};

const DEFAULT_BAYS = [80, 81, 83, 84, 85];
const DEFAULT_RATE = 230;
const SK = 'cpms_v2';
const STORAGE_KEY = 'cpms_bays';
const LOGIN_KEY = 'cpms_logged_in';
const USERS_KEY = 'cpms_users';
const RATE_KEY = 'cpms_bay_rates';

// Firebase Auth state
var firebaseAuthReady = false;
var auth = null;
var currentUserEmail = '';
var currentUserUid = '';
var currentUserRole = 'admin';

// ============================================================
// HELPERS
// ============================================================
function toggleLoginPwd() {
  var pwd = document.getElementById('loginPwd');
  var btn = document.getElementById('togglePwdBtn');
  if (!pwd || !btn) return;
  if (pwd.type === 'password') {
    pwd.type = 'text';
    btn.textContent = '隐藏';
  } else {
    pwd.type = 'password';
    btn.textContent = '显示';
  }
}

function refreshUsersList() {
  // 强制从 Firebase 刷新用户列表
  if (usersRef) {
    usersRef.once('value').then(function(snap) {
      var fbUsers = snap.val() || {};
      cachedUsers = {};
      Object.keys(fbUsers).forEach(function(uid) {
        var ud = fbUsers[uid];
        cachedUsers[uid] = {
          email: ud.email || '',
          role: ud.role || 'user',
          uid: uid
        };
      });
      localStorage.setItem(USERS_KEY, JSON.stringify(cachedUsers));
      renderAccList();
      toast('用户列表已刷新', 'ok');
    }).catch(function(err) {
      toast('刷新失败: ' + err.message, 'err');
    });
  } else {
    renderAccList();
  }
}

function titleCase(str) {
  if (!str) return '';
  return str.trim().toLowerCase().replace(/\b\w/g, function(c) { return c.toUpperCase(); });
}
function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============================================================
// STATE
// ============================================================
var recs = [];
var suppliers = [];
var products = [];
var selectedProducts = [];
var cTab = 'records';
var sTimer = null;
var dbRef = null;
var db = null;
var settingsRef = null;
var connected = false;
var BAYS = DEFAULT_BAYS.slice();
var acIdx = {};

// ============================================================
// USERS MANAGEMENT (Firebase)
// ============================================================
var cachedUsers = null;
var usersRef = null;

function initUsersRef() {
  if (!usersRef && db) {
    usersRef = db.ref('cpms_users');
    usersRef.on('value', function(snap) {
      var fbUsers = snap.val() || {};
      // 转换 Firebase 数据格式（UID为键）到本地格式
      cachedUsers = {};
      Object.keys(fbUsers).forEach(function(uid) {
        var userData = fbUsers[uid];
        cachedUsers[uid] = {
          email: userData.email || '',
          role: userData.role || 'user',
          uid: uid
        };
      });
      // 同步到本地存储
      localStorage.setItem(USERS_KEY, JSON.stringify(cachedUsers));
      // 更新界面
      if (document.getElementById('accList')) {
        renderAccList();
      }
    });
  }
}

function getUsers() {
  // 优先使用缓存的 Firebase 数据
  if (cachedUsers) return cachedUsers;
  // 回退到本地存储
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function setUsers(users) {
  cachedUsers = users;
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  // 同步到 Firebase
  if (usersRef) {
    usersRef.set(users);
  }
}

// ============================================================
// BAY SETTINGS HELPERS
// ============================================================
function getBayRates() {
  try {
    return JSON.parse(localStorage.getItem(RATE_KEY)) || {};
  } catch (e) {
    return {};
  }
}
function saveBayRates(obj) {
  localStorage.setItem(RATE_KEY, JSON.stringify(obj));
  if (settingsRef) settingsRef.child('bayRates').set(obj);
}
function getRate(bayId) {
  var rates = getBayRates();
  return rates[bayId] !== undefined ? rates[bayId] : DEFAULT_RATE;
}
// ============================================================
// FIREBASE AUTH
// ============================================================
(function() {
  var checkReady = setInterval(function() {
    if (typeof firebase !== 'undefined' && typeof firebase.app === 'function' && typeof firebase.auth === 'function') {
      clearInterval(checkReady);
      try {
        var app = firebase.app();
      } catch(e) {
        app = firebase.initializeApp(FIREBASE_AUTH_CONFIG);
      }
      auth = firebase.auth(app);
      firebaseAuthReady = true;

      auth.onAuthStateChanged(function(fbUser) {
        if (fbUser) {
          currentUserEmail = fbUser.email || '';
          currentUserUid = fbUser.uid;
          try {
            firebase.database(app).ref('cpms_users/' + fbUser.uid).once('value').then(function(snap) {
              var d = snap.val();
              currentUserRole = (d && d.role) ? d.role : 'admin';
              onFirebaseLoginSuccess();
            }).catch(function() {
              currentUserRole = 'admin';
              onFirebaseLoginSuccess();
            });
          } catch(e2) {
            currentUserRole = 'admin';
            onFirebaseLoginSuccess();
          }
        } else {
          currentUserEmail = '';
          currentUserUid = '';
          currentUserRole = 'admin';
          onFirebaseLogout();
        }
      });

      try {
        db = firebase.database(app);
        db.ref('cpms_settings').once('value').then(function(snap) {
          var d = snap.val() || {};
          if (d.bays) { BAYS = d.bays; localStorage.setItem(STORAGE_KEY, JSON.stringify(BAYS)); }
          if (d.bayRates) { localStorage.setItem(RATE_KEY, JSON.stringify(d.bayRates)); }
        }).catch(function() {});
        // 初始化用户引用
        initUsersRef();
      } catch(e) {}
    }
  }, 100);
})();

function onFirebaseLoginSuccess() {
  var ls = document.getElementById('loginScreen');
  var ma = document.querySelector('.main');
  if (ls) ls.classList.add('hidden');
  if (ma) ma.style.display = 'grid';
  sessionStorage.setItem(LOGIN_KEY, '1');
  updateUserDisplay();
  initClearBtn();
  syncAdminUI();
  initSuppliersProducts();
  loadBays();
  initApp();
  // 重置滑动验证，为下次登录做准备
  resetSliderVerify();
}

function onFirebaseLogout() {
  var ls = document.getElementById('loginScreen');
  var ma = document.querySelector('.main');
  if (ls) ls.classList.remove('hidden');
  if (ma) ma.style.display = 'none';
  sessionStorage.removeItem(LOGIN_KEY);
  var ud = document.getElementById('currentUserDisplay');
  var rd = document.getElementById('userRoleDisplay');
  if (ud) ud.textContent = '未登录';
  if (rd) { rd.textContent = '-'; rd.style.background = '#666'; }
}

var sliderVerified = false;

function initSliderVerify() {
  var slider = document.getElementById('sliderVerify');
  var btn = document.getElementById('sliderBtn');
  var track = document.getElementById('sliderTrack');
  var fill = document.getElementById('sliderFill');
  var loginBtn = document.getElementById('loginBtn');
  if (!slider || !btn || !track) return;
  
  // 如果已经初始化过，先移除旧事件
  if (slider.dataset.initialized === 'true') return;
  slider.dataset.initialized = 'true';
  
  var isDragging = false;
  var startX = 0;
  var btnLeft = 0;
  
  // 动态计算 trackWidth，因为初始化时可能元素未显示
  function getTrackWidth() {
    return track.offsetWidth - btn.offsetWidth;
  }
  
  function onStart(e) {
    if (sliderVerified) return;
    isDragging = true;
    startX = (e.touches ? e.touches[0].clientX : e.clientX);
    btnLeft = btn.offsetLeft;
    btn.classList.add('dragging');
    e.preventDefault();
  }
  
  function onMove(e) {
    if (!isDragging || sliderVerified) return;
    var trackWidth = getTrackWidth();
    var x = (e.touches ? e.touches[0].clientX : e.clientX);
    var diff = x - startX;
    var newLeft = Math.max(0, Math.min(trackWidth, btnLeft + diff));
    btn.style.left = newLeft + 'px';
    fill.style.width = newLeft + 'px';
    
    // 检查是否到达终点
    if (newLeft >= trackWidth - 5) {
      sliderVerified = true;
      isDragging = false;
      slider.classList.add('verified');
      btn.innerHTML = '✓';
      btn.classList.remove('dragging');
      if (loginBtn) {
        loginBtn.disabled = false;
        loginBtn.style.opacity = '1';
        loginBtn.style.cursor = 'pointer';
      }
    }
  }
  
  function onEnd() {
    if (!isDragging || sliderVerified) return;
    isDragging = false;
    btn.classList.remove('dragging');
    // 未验证成功，回弹
    if (!sliderVerified) {
      btn.style.left = '0px';
      fill.style.width = '0px';
    }
  }
  
  // 鼠标事件
  btn.addEventListener('mousedown', onStart);
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onEnd);
  
  // 触摸事件
  btn.addEventListener('touchstart', onStart, { passive: false });
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('touchend', onEnd);
}

function resetSliderVerify() {
  sliderVerified = false;
  var slider = document.getElementById('sliderVerify');
  var btn = document.getElementById('sliderBtn');
  var fill = document.getElementById('sliderFill');
  var loginBtn = document.getElementById('loginBtn');
  if (slider) slider.classList.remove('verified');
  if (btn) { btn.style.left = '2px'; btn.innerHTML = '➡️'; }
  if (fill) fill.style.width = '0px';
  if (loginBtn) {
    loginBtn.disabled = true;
    loginBtn.style.opacity = '.5';
    loginBtn.style.cursor = 'not-allowed';
  }
}

function doLogin() {
  if (!firebaseAuthReady) { showLoginError('系统正在初始化，请稍候...'); return; }
  if (!sliderVerified) { showLoginError('请先完成滑动验证'); return; }
  var email = document.getElementById('loginEmail').value.trim();
  var pwd = document.getElementById('loginPwd').value;
  if (!email || !pwd) { showLoginError('请输入邮箱和密码'); return; }
  showLoginError('');
  // 显示加载状态
  var btn = document.querySelector('#loginScreen button[onclick="doLogin()"]');
  if (btn) { btn.disabled = true; btn.textContent = '登录中...'; }
  auth.signInWithEmailAndPassword(email, pwd)
    .then(function(userCredential) {
      // 立即切换界面，不等待 onAuthStateChanged
      currentUserEmail = userCredential.user.email || '';
      currentUserUid = userCredential.user.uid;
      currentUserRole = 'admin';
      onFirebaseLoginSuccess();
      toast('登录成功', 'ok');
    })
    .catch(function(err) {
      if (btn) { btn.disabled = false; btn.textContent = '登录'; }
      resetSliderVerify(); // 登录失败重置滑动验证
      var msg = '登录失败';
      if (err.code === 'auth/user-not-found') msg = '用户不存在';
      else if (err.code === 'auth/wrong-password') msg = '密码错误';
      else if (err.code === 'auth/invalid-email') msg = '邮箱格式错误';
      else if (err.code === 'auth/too-many-requests') msg = '尝试次数过多，请稍后再试';
      else if (err.code === 'auth/invalid-credential') msg = '邮箱或密码错误';
      showLoginError(msg);
    });
}

function doRegister() {
  // 关闭公开注册，仅管理员可添加账号
  showLoginError('注册功能已关闭，请联系管理员添加账号');
  return;
}

function doGoogleLogin() {
  if (!firebaseAuthReady) { showLoginError('系统正在初始化，请稍候...'); return; }
  var provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider)
    .then(function() { toast('Google 登录成功', 'ok'); })
    .catch(function(err) {
      if (err.code !== 'auth/popup-closed-by-user') showLoginError('Google 登录失败');
    });
}

function handleLogout() {
  if (!confirm('确定退出登录?')) return;
  auth.signOut().then(function() { toast('已退出登录', 'ok'); })
    .catch(function() { sessionStorage.removeItem(LOGIN_KEY); onFirebaseLogout(); });
}

function showLoginError(msg) {
  var el = document.getElementById('loginErrorMsg');
  if (!el) return;
  if (msg) { el.textContent = msg; el.style.display = 'block'; }
  else { el.style.display = 'none'; }
}

function updateUserDisplay() {
  var d = document.getElementById('currentUserDisplay');
  var r = document.getElementById('userRoleDisplay');
  if (!d || !r) return;
  if (currentUserEmail) {
    d.textContent = currentUserEmail;
    r.textContent = currentUserRole === 'admin' ? '管理员' : '普通员工';
    r.style.background = currentUserRole === 'admin' ? '#0066cc' : '#666';
    var clearBtn = document.querySelector('.clear-btn');
    if (clearBtn) clearBtn.style.display = currentUserRole === 'admin' ? '' : 'none';
  } else {
    d.textContent = '未登录';
    r.textContent = '-';
    r.style.background = '#666';
  }
}

function isAdmin() { return currentUserRole === 'admin'; }
function isStaff() { return currentUserRole === 'user' || currentUserRole === 'admin'; }
function canManageSupplierProduct() { return currentUserRole === 'user' || currentUserRole === 'admin'; }

// ============================================================
// INIT
// ============================================================
window.addEventListener('load', function() {
  var ls = document.getElementById('loginScreen');
  var ma = document.querySelector('.main');
  if (ls) ls.classList.remove('hidden');
  if (ma) ma.style.display = 'none';
});
// ============================================================
// LOGIN
// ============================================================
// FIREBASE
// ============================================================
function initFirebase() {
  if (!firebaseAuthReady) { setTimeout(initFirebase, 200); return; }
  initApp();
}

function initApp() {
  updateBaySelect();
  var app;
  try { app = firebase.app(); } catch(e) { app = firebase.initializeApp(FIREBASE_AUTH_CONFIG); }
  db = firebase.database(app);
  if (dbRef) dbRef.off();
  dbRef = db.ref(SK);
  dbRef.on('value', function(snap) {
    recs = snap.val() ? Object.values(snap.val()) : [];
    connected = true;

    var newRuleStartDate = new Date('2026-03-31T00:00:00');
    recs.forEach(function(r) {
      if (r.arr && r.dep) {
        var arrDate = new Date(r.arr);
        var newFee;
        if (arrDate >= newRuleStartDate) {
          newFee = calcFee(r.arr, r.dep, r.bay);
        } else {
          var d = calcDur(r.arr, r.dep);
          newFee = Math.ceil(d.dd) <= 0 ? getRate(r.bay) : Math.ceil(d.dd) * getRate(r.bay);
        }
        if (r.fee !== newFee) { r.fee = newFee; saveToFirebase(r.id, r); }
      }
    });
    renderAll();
    updStats();
    initMSel();
    renderMS();
  }, function(err) { toast('Firebase error: ' + err.message, 'err'); });

  if (settingsRef) settingsRef.off();
  settingsRef = db.ref('cpms_settings');
  settingsRef.on('value', function(snap) {
    var data = snap.val() || {};
    if (data.bays) {
      BAYS = data.bays;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(BAYS));
      updateBaySelect();
      renderBays();
      renderMS();
    }
    if (data.bayRates) {
      localStorage.setItem(RATE_KEY, JSON.stringify(data.bayRates));
      renderAllRecs();
      renderActRecs();
      renderMS();
    }
    syncSuppliersProducts(data);
  }, function(err) { console.warn('Settings sync error:', err.message); });

  setDefTimes();
}
// ============================================================
function handleLogout() {
  if (!confirm('确定退出登录?')) return;
  
  if (dbRef) {
    dbRef.off();
    dbRef = null;
  }
  if (settingsRef) {
    settingsRef.off();
    settingsRef = null;
  }
  recs = [];
  
  sessionStorage.removeItem(LOGIN_KEY);
  sessionStorage.removeItem('currentUser');
  currentUser = null;
  
  updateUserDisplay();
  
  var ls = document.querySelector('.login-screen');
  var ma = document.querySelector('.main');
  if (ls) ls.classList.remove('hidden');
  if (ma) ma.style.display = 'none';
  
  var u = document.getElementById('loginUsername');
  var p = document.getElementById('loginPassword');
  if (u) u.value = '';
  if (p) p.value = '';
  
  generateCaptcha();
}

// ============================================================
// BAY SETTINGS
// ============================================================
var tempBays = [];

function loadBays() {
  var s = localStorage.getItem(STORAGE_KEY);
  if (s) {
    try {
      BAYS = JSON.parse(s);
    } catch (e) {
      BAYS = DEFAULT_BAYS.slice();
    }
  } else {
    BAYS = DEFAULT_BAYS.slice();
  }
}

function saveBays() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(BAYS));
  if (settingsRef) settingsRef.child('bays').set(BAYS);
}

function openBaySettings() {
  tempBays = BAYS.slice();
  syncAdminUI();
  renderBaySettingsForm();
  switchSetTab('bay');
  document.getElementById('baySettingsModal').classList.add('show');
}

function switchSetTab(tab) {
  document.querySelectorAll('.set-tab').forEach(function(t) {
    t.classList.remove('active');
  });
  var ta = document.getElementById('stab-' + tab);
  if (ta) ta.classList.add('active');
  
  ['bay', 'sup', 'prod', 'acc', 'fee'].forEach(function(p) {
    var e = document.getElementById('set-panel-' + p);
    if (e) e.style.display = p === tab ? '' : 'none';
  });
  
  if (tab === 'acc') renderAccList();
  if (tab === 'fee') loadFeePanel();
  if (tab === 'sup') renderSupList();
  if (tab === 'prod') renderProdList();
  syncAdminUI();
}

function renderBaySettingsForm() {
  var form = document.getElementById('baySettingsForm');
  var hintEl = document.getElementById('bayAdminHint');
  var isAdm = isAdmin();
  if (!form) return;
  
  if (hintEl) {
    hintEl.innerHTML = isAdm
      ? '<div style="padding:8px 12px;background:#e8f0fe;border:1px solid #c5d8f8;border-radius:5px;color:#0066cc;font-size:12px;margin-bottom:12px">👤 管理员可增删停车位</div>'
      : '<div style="padding:8px 12px;background:#fff3cd;border:1px solid #ffc107;border-radius:5px;color:#856404;font-size:12px;margin-bottom:12px">⚠️ 只有管理员可以修改停车位设置</div>';
  }
  
  var dis = isAdm ? '' : ' disabled';
  
  form.innerHTML = tempBays.map(function(bay, idx) {
    var dBtn = isAdm ? '<button type="button" class="bay-del-btn" onclick="removeBayRow(' + idx + ')">X</button>' : '';
    return '<div class="bay-setting-item"><label>车位 ' + (idx + 1) + '</label><input type="number" id="bay-inp-' + idx + '" value="' + bay + '" min="1" max="9999" placeholder="输入车位号"' + dis + '>' + dBtn + '</div>';
  }).join('');
}

function syncTempFromForm() {
  tempBays = tempBays.map(function(_, idx) {
    var el = document.getElementById('bay-inp-' + idx);
    return el ? (parseInt(el.value) || 0) : 0;
  });
}

function addBayRow() {
  syncTempFromForm();
  tempBays.push(1);
  renderBaySettingsForm();
  var el = document.getElementById('bay-inp-' + (tempBays.length - 1));
  if (el) {
    el.value = '';
    el.focus();
  }
}

function removeBayRow(idx) {
  if (tempBays.length <= 1) {
    alert('至少保留1个停车位 / Must keep at least 1 bay');
    return;
  }
  if (!confirm('确认删除停车位 #' + tempBays[idx] + ' ？\nConfirm delete Bay #' + tempBays[idx] + '?')) return;
  syncTempFromForm();
  tempBays.splice(idx, 1);
  renderBaySettingsForm();
}

function closeBaySettings() {
  document.getElementById('baySettingsModal').classList.remove('show');
  tempBays = [];
}

function saveBaySettings() {
  syncTempFromForm();
  
  for (var i = 0; i < tempBays.length; i++) {
    if (!tempBays[i] || tempBays[i] < 1) {
      var el = document.getElementById('bay-inp-' + i);
      if (el) el.focus();
      alert('车位 ' + (i + 1) + ' 号码无效');
      return;
    }
  }
  
  BAYS = tempBays.slice();
  saveBays();
  closeBaySettings();
  updateBaySelect();
  renderBays();
  renderMS();
  toast('停车位已保存', 'ok');
}

// ============================================================
// ACCOUNT MANAGEMENT
// ============================================================
var accEditTarget = null;

function renderAccList() {
  var u = getUsers();
  var names = Object.keys(u);
  var el = document.getElementById('accList');
  var hintEl = document.getElementById('accAdminHint');
  if (!el) return;
  
  var h = '';
  var isAdm = isAdmin();
  
  // 权限提示
  if (hintEl) {
    hintEl.innerHTML = isAdm
      ? '<div style="padding:8px 12px;background:#e8f0fe;border:1px solid #c5d8f8;border-radius:5px;color:#0066cc;font-size:12px;margin-bottom:12px">👤 管理员可以添加和管理用户账号</div>'
      : '<div style="padding:8px 12px;background:#fff3cd;border:1px solid #ffc107;border-radius:5px;color:#856404;font-size:12px;margin-bottom:12px">⚠️ 只有管理员可以管理账号</div>';
  }
  
  // 统计信息
  var totalUsers = names.length;
  var adminCount = 0;
  var staffCount = 0;
  names.forEach(function(name) {
    var userData = u[name];
    var role = userData && userData.role ? userData.role : 'user';
    if (role === 'admin') adminCount++;
    else staffCount++;
  });
  
  // 头部信息栏 - 与停车位设置一致
  h += '<div class="settings-header">';
  h += '<div class="settings-stats">';
  h += '<div class="stat-item"><span class="stat-value">' + totalUsers + '</span><span class="stat-label">用户总数</span></div>';
  h += '<div class="stat-item"><span class="stat-value">' + adminCount + '</span><span class="stat-label">管理员</span></div>';
  h += '<div class="stat-item"><span class="stat-value">' + staffCount + '</span><span class="stat-label">普通员工</span></div>';
  h += '<div class="stat-item"><span class="stat-value">' + (isAdm ? '管理员' : '普通员工') + '</span><span class="stat-label">当前权限</span></div>';
  h += '</div>';
  
  // 刷新按钮
  h += '<button onclick="refreshUsersList()" style="padding:8px 16px;background:#f5f5f5;border:1px solid #ddd;border-radius:6px;font-size:13px;cursor:pointer;margin-left:auto">刷新列表</button>';
  h += '</div>';
  
  // 只有管理员可以添加账号
  if (isAdm) {
    h += '<button class="settings-add-btn" onclick="showAccForm(null)"><span class="btn-icon">+</span><span class="btn-text">添加新账号</span></button>';
  } else {
    h += '<div class="settings-hint warning"><span class="hint-icon">⚠️</span><span class="hint-text">只有管理员可以管理账号</span></div>';
  }
  h += '</div>';
  
  // 权限说明
  h += '<div class="settings-hint info" style="margin-bottom:16px"><span class="hint-icon">💡</span><span class="hint-text"><b>权限说明：</b>管理员可管理停车位、计费设置和账号；普通员工可管理供应商和品名。</span></div>';
  
  // 账号表单区域（动态显示）
  h += '<div id="acc-form-box" style="display:none;margin-bottom:16px" class="acc-form-box">';
  h += '<div class="acc-form-title" id="acc-form-title">添加账号</div>';
  h += '<div class="fg"><label>邮箱 Email</label><input type="email" id="acc-username" placeholder="输入邮箱..."></div>';
  h += '<div class="fg"><label>密码 Password</label><input type="password" id="acc-password" placeholder="输入密码（至少6位）..."></div>';
  h += '<div class="fg"><label>确认密码 Confirm Password</label><input type="password" id="acc-password2" placeholder="再次输入密码..."></div>';
  h += '<div class="fg"><label>角色 Role</label><select id="acc-role"><option value="user">普通员工 Staff</option><option value="admin">管理员 Admin</option></select></div>';
  h += '<div class="acc-form-err" id="acc-form-err" style="color:#cc0000;font-size:13px;margin:8px 0;display:none"></div>';
  h += '<div style="display:flex;gap:10px;margin-top:12px">';
  h += '<button class="btn btn-s" onclick="saveAccForm()">保存 Save</button>';
  h += '<button class="btn btn-g" onclick="cancelAccForm()">取消 Cancel</button>';
  h += '</div>';
  h += '</div>';
  
  // 账号列表
  if (names.length === 0) {
    h += '<div class="settings-empty"><span class="empty-icon">👤</span><span class="empty-text">暂无账号</span><span class="empty-sub">点击上方"+ 添加新账号"按钮添加</span></div>';
  } else {
    h += '<div class="settings-list">';
    names.forEach(function(name) {
      var userData = u[name];
      var userEmail = userData && userData.email ? userData.email : name;
      var isYou = userEmail === currentUserEmail;
      var userRole = userData && userData.role ? userData.role : 'user';
      var roleBadge = userRole === 'admin' ? '<span class="role-badge admin">管理员</span>' : '<span class="role-badge user">普通员工</span>';
      var youBadge = isYou ? '<span class="you-badge">当前登录</span>' : '';
      
      // 操作按钮
      var actions = '';
      if (isAdm) {
        actions += '<button class="action-btn edit" onclick="showAccForm(\'' + name + '\')" title="编辑"><span>✏️</span></button>';
        if (!isYou) {
          actions += '<button class="action-btn delete" onclick="deleteAcc(\'' + name + '\')" title="删除"><span>🗑️</span></button>';
        }
      }
      
      h += '<div class="settings-item ' + (isYou ? 'current' : '') + '">';
      h += '<div class="item-icon">👤</div>';
      h += '<div class="item-content">';
      h += '<div class="item-title">' + userEmail + youBadge + '</div>';
      h += '<div class="item-meta">' + roleBadge + '</div>';
      h += '</div>';
      h += '<div class="item-actions">' + actions + '</div>';
      h += '</div>';
    });
    h += '</div>';
  }
  
  el.innerHTML = h;
}

function showAccForm(username) {
  // 只有管理员可以操作
  if (!isAdmin()) {
    alert('只有管理员可以管理账号');
    return;
  }
  
  accEditTarget = username;
  
  var formBox = document.getElementById('acc-form-box');
  var titleEl = document.getElementById('acc-form-title');
  var unameEl = document.getElementById('acc-username');
  var pw1 = document.getElementById('acc-password');
  var pw2 = document.getElementById('acc-password2');
  var roleEl = document.getElementById('acc-role');
  var errEl = document.getElementById('acc-form-err');
  
  if (formBox) formBox.style.display = 'block';
  if (errEl) errEl.textContent = '';
  
  if (username === null) {
    // 添加新账号
    if (titleEl) titleEl.textContent = '添加账号';
    if (unameEl) { unameEl.value = ''; unameEl.disabled = false; }
    if (pw1) pw1.value = '';
    if (pw2) pw2.value = '';
    if (roleEl) roleEl.value = 'user';
    if (unameEl) unameEl.focus();
  } else {
    // 编辑账号（仅修改角色，密码通过 Firebase Auth 单独处理）
    var u = getUsers();
    var userData = u[username];
    var userEmail = userData && userData.email ? userData.email : username;
    if (titleEl) titleEl.textContent = '编辑账号 - ' + userEmail;
    if (unameEl) { unameEl.value = userEmail; unameEl.disabled = true; }
    if (pw1) { pw1.value = ''; pw1.placeholder = '留空则不修改密码'; }
    if (pw2) { pw2.value = ''; pw2.placeholder = '留空则不修改密码'; }
    if (roleEl && userData) {
      roleEl.value = userData.role || 'user';
    }
  }
}

function cancelAccForm() {
  var formBox = document.getElementById('acc-form-box');
  if (formBox) formBox.style.display = 'none';
  
  accEditTarget = null;
  
  var unameEl = document.getElementById('acc-username');
  var pw1 = document.getElementById('acc-password');
  var pw2 = document.getElementById('acc-password2');
  var errEl = document.getElementById('acc-form-err');
  if (unameEl) unameEl.value = '';
  if (pw1) pw1.value = '';
  if (pw2) pw2.value = '';
  if (errEl) errEl.textContent = '';
}

// 旧的函数保留兼容
function showAccFormOld(username) {
  // 只有管理员可以操作
  if (!isAdmin()) {
    alert('只有管理员可以管理账号');
    return;
  }
  
  accEditTarget = username;
  
  var formBox = document.getElementById('accFormBox');
  var titleEl = document.getElementById('accFormTitle');
  var unameEl = document.getElementById('acc-username');
  
  if (formBox) formBox.style.display = '';
  
  var errEl = document.getElementById('accFormErr');
  if (errEl) errEl.textContent = '';
  
  var pw1 = document.getElementById('acc-password');
  var pw2 = document.getElementById('acc-password2');
  if (pw1) pw1.value = '';
  if (pw2) pw2.value = '';
  
  if (username === null) {
    if (titleEl) titleEl.textContent = '+ 添加新账号';
    if (unameEl) {
      unameEl.value = '';
      unameEl.disabled = false;
      unameEl.focus();
    }
  } else {
    if (titleEl) titleEl.textContent = 'Change: ' + username;
    if (unameEl) {
      unameEl.value = username;
      unameEl.disabled = true;
    }
    if (pw1) pw1.focus();
  }
}

function cancelAccForm() {
  accEditTarget = null;
  var formBox = document.getElementById('accFormBox');
  if (formBox) formBox.style.display = 'none';
  
  var errEl = document.getElementById('accFormErr');
  if (errEl) errEl.textContent = '';
  
  var unameEl = document.getElementById('acc-username');
  var pw1 = document.getElementById('acc-password');
  var pw2 = document.getElementById('acc-password2');
  if (unameEl) unameEl.value = '';
  if (pw1) pw1.value = '';
  if (pw2) pw2.value = '';
}

function saveAccForm() {
  // 只有管理员可以保存
  if (!isAdmin()) {
    alert('只有管理员可以管理账号');
    return;
  }
  
  var errEl = document.getElementById('acc-form-err');
  var email = (document.getElementById('acc-username') || { value: '' }).value.trim();
  var pw1 = (document.getElementById('acc-password') || { value: '' }).value;
  var pw2 = (document.getElementById('acc-password2') || { value: '' }).value;
  var roleEl = document.getElementById('acc-role');
  var role = roleEl ? roleEl.value : 'user';
  var u = getUsers();
  
  if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
  
  // 验证邮箱格式
  if (!email) {
    if (errEl) { errEl.textContent = '请输入邮箱'; errEl.style.display = 'block'; }
    return;
  }
  if (!email.includes('@')) {
    if (errEl) { errEl.textContent = '请输入有效的邮箱地址'; errEl.style.display = 'block'; }
    return;
  }
  
  // 使用 Firebase Auth
  if (!auth) {
    if (errEl) { errEl.textContent = 'Firebase Auth 未初始化'; errEl.style.display = 'block'; }
    return;
  }
  
  // 判断是创建新用户还是编辑现有用户
  if (accEditTarget === null) {
    // ========== 创建新用户 ==========
    
    // 验证密码（创建时必须提供）
    if (!pw1) {
      if (errEl) { errEl.textContent = '请输入密码'; errEl.style.display = 'block'; }
      return;
    }
    if (pw1.length < 6) {
      if (errEl) { errEl.textContent = '密码至少6位'; errEl.style.display = 'block'; }
      return;
    }
    if (pw1 !== pw2) {
      if (errEl) { errEl.textContent = '两次密码不一致'; errEl.style.display = 'block'; }
      return;
    }
    
    // 保存当前登录用户（管理员）
    var currentAdmin = auth.currentUser;
    
    // 创建新用户
    auth.createUserWithEmailAndPassword(email, pw1)
      .then(function(userCredential) {
        var newUser = userCredential.user;
        var uid = newUser.uid;
        
        // 在数据库中保存用户角色信息
        var userData = {
          email: email,
          role: role,
          createdAt: firebase.database.ServerValue.TIMESTAMP,
          createdBy: currentAdmin ? currentAdmin.uid : null
        };
        
        return db.ref('cpms_users/' + uid).set(userData).then(function() {
          toast('账号 ' + email + ' 已创建', 'ok');
          cancelAccForm();
          
          // 刷新用户列表
          usersRef.once('value').then(function(snap) {
            var fbUsers = snap.val() || {};
            cachedUsers = {};
            Object.keys(fbUsers).forEach(function(uid2) {
              var ud = fbUsers[uid2];
              cachedUsers[uid2] = {
                email: ud.email || '',
                role: ud.role || 'user',
                uid: uid2
              };
            });
            localStorage.setItem(USERS_KEY, JSON.stringify(cachedUsers));
            renderAccList();
          });
          
          // 重新登录为管理员（因为 createUser 会自动登录为新用户）
          if (currentAdmin) {
            alert('账号创建成功！\n\n注意：由于 Firebase Auth 限制，您已被切换到新创建的账号。\n请退出并使用管理员账号重新登录。');
          }
        });
      })
      .catch(function(err) {
        var msg = '创建失败';
        if (err.code === 'auth/email-already-in-use') msg = '邮箱已被注册';
        else if (err.code === 'auth/invalid-email') msg = '邮箱格式错误';
        else if (err.code === 'auth/weak-password') msg = '密码至少6位';
        else if (err.message) msg = err.message;
        if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
      });
      
  } else {
    // ========== 编辑现有用户 ==========
    var uid = accEditTarget;
    var userData = u[uid];
    
    if (!userData) {
      if (errEl) { errEl.textContent = '用户不存在'; errEl.style.display = 'block'; }
      return;
    }
    
    // 更新角色
    var updates = {
      role: role,
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    };
    
    // 如果有输入密码，则更新密码
    if (pw1) {
      if (pw1.length < 6) {
        if (errEl) { errEl.textContent = '密码至少6位'; errEl.style.display = 'block'; }
        return;
      }
      if (pw1 !== pw2) {
        if (errEl) { errEl.textContent = '两次密码不一致'; errEl.style.display = 'block'; }
        return;
      }
      
      // 注意：客户端无法直接修改其他用户的密码
      // 这需要 Admin SDK 或云函数
      // 这里只更新角色信息，密码修改需要单独处理
      alert('密码修改功能需要管理员权限，请联系系统管理员或使用 Firebase Console。');
    }
    
    // 更新数据库中的角色
    db.ref('cpms_users/' + uid).update(updates)
      .then(function() {
        toast('账号 ' + email + ' 已更新', 'ok');
        cancelAccForm();
        renderAccList();
      })
      .catch(function(err) {
        var msg = '更新失败';
        if (err.message) msg = err.message;
        if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
      });
  }
}

function deleteAcc(uid) {
  // 只有管理员可以删除
  if (!isAdmin()) {
    alert('只有管理员可以删除账号');
    return;
  }
  
  if (uid === currentUserUid) {
    alert('不能删除当前登录的账号');
    return;
  }
  var u = getUsers();
  if (Object.keys(u).length <= 1) {
    alert('至少保留1个账号');
    return;
  }
  var userData = u[uid];
  var userEmail = userData && userData.email ? userData.email : uid;
  
  if (!confirm('确定删除账号 ' + userEmail + '?')) return;
  
  delete u[uid];
  setUsers(u);
  
  // 同时从 Firebase 删除
  db.ref('cpms_users/' + uid).remove().catch(function() {});
  
  toast('账号 ' + userEmail + ' 已删除', 'ok');
  renderAccList();
}

// ============================================================
// FEE SETTINGS
// ============================================================
function loadFeePanel() {
  var rates = getBayRates();
  var isAdm = isAdmin();
  var el = document.getElementById('bayRateList');
  var hintEl = document.getElementById('feeAdminHint');
  if (!el) return;
  
  // 权限提示
  if (hintEl) {
    hintEl.innerHTML = isAdm
      ? '<div style="padding:8px 12px;background:#e8f0fe;border:1px solid #c5d8f8;border-radius:5px;color:#0066cc;font-size:12px;margin-bottom:12px">👤 管理员可以修改计费设置</div>'
      : '<div style="padding:8px 12px;background:#fff3cd;border:1px solid #ffc107;border-radius:5px;color:#856404;font-size:12px;margin-bottom:12px">⚠️ 只有管理员可以修改计费设置</div>';
  }
  
  var h = '';
  
  // 头部信息栏
  h += '<div class="settings-header">';
  h += '<div class="settings-stats">';
  h += '<div class="stat-item"><span class="stat-value">' + BAYS.length + '</span><span class="stat-label">停车位总数</span></div>';
  h += '<div class="stat-item"><span class="stat-value">' + DEFAULT_RATE + '</span><span class="stat-label">默认单价 (AED/天)</span></div>';
  h += '</div>';
  h += '</div>';
  
  // 费率列表
  h += '<div class="settings-list">';
  BAYS.forEach(function(bayId, idx) {
    var rate = rates[bayId] !== undefined ? rates[bayId] : DEFAULT_RATE;
    var dis = isAdm ? '' : ' disabled';
    
    h += '<div class="settings-item">';
    h += '<div class="item-icon" style="background:#fff7e6;border-color:#ffd591">🅿️</div>';
    h += '<div class="item-content">';
    h += '<div class="item-title">停车位 #' + bayId + '</div>';
    h += '<div class="item-meta"><span class="usage-badge">当前费率: ' + rate + ' AED/天</span></div>';
    h += '</div>';
    h += '<div class="item-actions" style="display:flex;align-items:center;gap:10px">';
    h += '<input type="number" id="rate-' + bayId + '" value="' + rate + '"' + dis + ' min="1" max="99999" placeholder="' + DEFAULT_RATE + '" style="width:100px;padding:8px 12px;border:2px solid #ffd54f;border-radius:6px;font-size:16px;font-weight:bold;text-align:center;outline:none">';
    h += '<span style="font-size:13px;color:#666;font-weight:bold;white-space:nowrap">AED/天</span>';
    h += '</div>';
    h += '</div>';
  });
  h += '</div>';
  
  // 提示信息
  h += '<div class="settings-hint info" style="margin-top:16px"><span class="hint-icon">💡</span><span class="hint-text">计费规则：23:00前入场算第1天到午夜，23:00后入场从次日开始计算。不足1天按1天收费。</span></div>';
  
  el.innerHTML = h;
}

function saveFeeSettings() {
  if (!isAdmin()) {
    alert('Only admin can modify fee settings');
    return;
  }
  
  var rates = {};
  var err = false;
  
  BAYS.forEach(function(bayId) {
    var el = document.getElementById('rate-' + bayId);
    if (!el) return;
    var v = parseInt(el.value);
    if (!v || v < 1) {
      el.focus();
      alert('Bay ' + bayId + ' rate invalid');
      err = true;
      return;
    }
    rates[bayId] = v;
  });
  
  if (err) return;
  
  saveBayRates(rates);
  renderAllRecs();
  renderActRecs();
  renderMS();
  closeBaySettings();
  toast('Fee settings saved', 'ok');
}

// ============================================================
// AUTOCOMPLETE
// ============================================================
function acSearch(fid, val) {
  var box = document.getElementById(fid === 'f-cn' ? 'ac-cn' : 'ac-cno');
  var q = (val || '').trim().toUpperCase();
  acIdx[fid] = -1;
  
  if (!q) {
    if (box) box.style.display = 'none';
    return;
  }
  
  var matches = recs.filter(function(r) {
    return r.cn.indexOf(q) >= 0;
  }).slice(0, 8);
  
  if (!box || matches.length === 0) {
    if (box) box.style.display = 'none';
    return;
  }
  
  box.innerHTML = matches.map(function(r) {
    var idx = r.cn.indexOf(q);
    var hint = r.dep ? '<span class="hint">Left</span>' : '<span class="hint">Active</span>';
    return '<div class="autocomplete-item" onclick="acPick(\'' + fid + '\',\'' + r.cn + '\')">' + r.cn.substr(0, idx) + '<strong>' + r.cn.substr(idx, q.length) + '</strong>' + r.cn.substr(idx + q.length) + hint + '</div>';
  }).join('');
  
  box.style.display = 'block';
}

function acNav(fid, evt) {
  var box = document.getElementById(fid === 'f-cn' ? 'ac-cn' : 'ac-cno');
  var items = box ? box.querySelectorAll('.autocomplete-item') : [];
  
  if (!items.length) return;
  
  if (evt.key === 'ArrowDown') {
    evt.preventDefault();
    acIdx[fid] = Math.min(acIdx[fid] + 1, items.length - 1);
  } else if (evt.key === 'ArrowUp') {
    evt.preventDefault();
    acIdx[fid] = Math.max(acIdx[fid] - 1, 0);
  } else if (evt.key === 'Enter' && acIdx[fid] >= 0) {
    evt.preventDefault();
    items[acIdx[fid]].click();
    return;
  } else if (evt.key === 'Escape') {
    if (box) box.style.display = 'none';
    return;
  }
  
  items.forEach(function(it, i) {
    it.classList.toggle('hi', i === acIdx[fid]);
  });
}

function acPick(fid, cn) {
  var inp = document.getElementById(fid);
  if (inp) inp.value = cn;
  hideAc(fid === 'f-cn' ? 'ac-cn' : 'ac-cno');
}

function hideAc(id) {
  var el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

// ============================================================
function startApp() {
  if (!firebaseReady) {
    setTimeout(startApp, 200);
    return;
  }
  initApp();
}

function initApp() {
  updateBaySelect();
  
  var config = {
    apiKey: 'AIzaSyC6YXeW78gqSW3SpCS0G8eXNwmToxVB_WI',
    authDomain: 'container-parking-90ab5.firebaseapp.com',
    databaseURL: 'https://container-parking-90ab5-default-rtdb.firebaseio.com',
    projectId: 'container-parking-90ab5',
    storageBucket: 'container-parking-90ab5.firebasestorage.app',
    messagingSenderId: '376445767246',
    appId: '1:376445767246:web:aef8404177b4608cbd3d1f'
  };
  
  var app;
  try {
    app = firebase.app();
  } catch (e) {
    app = firebase.initializeApp(config);
  }
  
  db = firebase.database(app);
  if (dbRef) dbRef.off();
  
  dbRef = db.ref(SK);
  dbRef.on('value', function(snap) {
    recs = snap.val() ? Object.values(snap.val()) : [];
    connected = true;
    
    // 从3月31日起应用新计费规则
    var newRuleStartDate = new Date('2026-03-31T00:00:00');
    
    recs.forEach(function(r) {
      if (r.arr && r.dep) {
        var arrDate = new Date(r.arr);
        var newFee;
        
        if (arrDate >= newRuleStartDate) {
          // 3月31日起用新规则
          newFee = calcFee(r.arr, r.dep, r.bay);
        } else {
          // 3月31日前用旧规则（简单按天数）
          var d = calcDur(r.arr, r.dep);
          newFee = Math.ceil(d.dd) <= 0 ? getRate(r.bay) : Math.ceil(d.dd) * getRate(r.bay);
        }
        
        if (r.fee !== newFee) {
          r.fee = newFee;
          saveToFirebase(r.id, r);
        }
      }
    });
    
    renderAll();
    updStats();
    initMSel();
    renderMS();
  }, function(err) {
    toast('Firebase error: ' + err.message, 'err');
  });

  // Settings sync (bays, users, bayRates) - shared across all devices
  if (settingsRef) settingsRef.off();
  settingsRef = db.ref('cpms_settings');
  settingsRef.on('value', function(snap) {
    var data = snap.val() || {};
    if (data.bays) {
      BAYS = data.bays;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(BAYS));
      updateBaySelect();
      renderBays();
      renderMS();
    }
    if (data.users) {
      // Fix any corrupted hash objects before saving to localStorage
      var u = data.users;
      var fixed = false;
      Object.keys(u).forEach(function(un) {
        if (typeof u[un] === 'object' && u[un] !== null) {
          if (u[un].h && u[un]._plain) {
            u[un] = 'x' + btoa(u[un]._plain);
          } else {
            var knownDefaults = { admin: 'admin123', user: 'user123' };
            u[un] = knownDefaults[un] || 'password';
          }
          fixed = true;
        }
      });
      // Ensure defaults exist
      if (!u.admin) { u.admin = 'admin123'; fixed = true; }
      if (!u.user) { u.user = 'user123'; fixed = true; }
      if (fixed) {
        settingsRef.child('users').set(u);
      }
      localStorage.setItem(USERS_KEY, JSON.stringify(u));
    }
    if (data.bayRates) {
      localStorage.setItem(RATE_KEY, JSON.stringify(data.bayRates));
      renderAllRecs();
      renderActRecs();
      renderMS();
    }
    syncSuppliersProducts(data);
  }, function(err) {
    console.warn('Settings sync error:', err.message);
  });

  setDefTimes();
}

function initSuppliersProducts() {
  suppliers = getSuppliers();
  products = getProducts();
  updateSupplierFilter();
}

function updateBaySelect() {
  var sel = document.getElementById('f-bay');
  if (!sel) return;
  
  var defOpt = sel.querySelector('option[value=""]');
  sel.innerHTML = '';
  if (defOpt) sel.appendChild(defOpt);
  
  BAYS.forEach(function(bay) {
    var opt = document.createElement('option');
    opt.value = bay;
    opt.textContent = 'Bay ' + bay;
    sel.appendChild(opt);
  });
}

function saveToFirebase(id, data) {
  if (dbRef) dbRef.child(id).set(data);
}

function removeFromFirebase(id) {
  if (dbRef) dbRef.child(id).remove();
}

function gid(id) {
  return document.getElementById(id);
}

// ============================================================
// TIME & FEE
// ============================================================
function pad2(n) {
  return String(n).padStart(2, '0');
}

function nowFmt() {
  var d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + 'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

function setDefTimes() {
  setTimeout(function() {
    var a = gid('f-at');
    var t = gid('f-dt');
    var v = nowFmt();
    if (a) a.value = v;
    if (t) t.value = v;
  }, 500);
}

function fdt(iso) {
  if (!iso) return '-';
  var d = new Date(iso);
  return '<span style="font-family:Arial,sans-serif;font-weight:bold">' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ' ' + pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear() + '</span>';
}

function calcDur(a, b) {
  if (!a || !b) return { h: 0, dd: 0, t: '-' };
  var ms = Math.max(0, new Date(b) - new Date(a));
  var h = ms / 3600000;
  var dd = ms / 86400000;
  var d = Math.floor(dd);
  var hh = Math.floor(h % 24);
  var mm = Math.floor((ms % 3600000) / 60000);
  
  return { h: h, dd: dd, t: '<span style="font-family:Arial,sans-serif;font-weight:bold">' + d + 'D ' + hh + 'H ' + mm + 'M</span>' };
}

function calcFee(a, b, bayId) {
  // a: check-in time, b: check-out time
  var arr = new Date(a);
  var dep = new Date(b);
  
  var arrHour = arr.getHours();
  var arrDate = new Date(arr.getFullYear(), arr.getMonth(), arr.getDate());
  var depDate = new Date(dep.getFullYear(), dep.getMonth(), dep.getDate());
  
  var days = 0;
  var currentDate = new Date(arrDate);
  
  if (arrHour < 23) {
    // Before 23:00 - first day counts to midnight
    days = 1;
    currentDate.setDate(currentDate.getDate() + 1);
    while (currentDate <= depDate) {
      days++;
      currentDate.setDate(currentDate.getDate() + 1);
    }
  } else {
    // After 23:00 - starts from next day 00:00
    currentDate.setDate(currentDate.getDate() + 1);
    while (currentDate <= depDate) {
      days++;
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }
  
  if (days < 1) days = 1;
  return days * getRate(bayId);
}

// 重新计算所有历史记录的費用
function recalculateAllFees() {
  recs.forEach(function(r) {
    if (r.arr && r.dep && !r.fee) {
      var oldFee = r.fee || 0;
      var newFee = calcFee(r.arr, r.dep, r.bay);
      if (oldFee !== newFee) {
        r.fee = newFee;
        saveToFirebase(r.id, r);
      }
    }
  });
}

function nowFee(a, bayId) {
  return calcFee(a, new Date().toISOString(), bayId);
}

function nowDur(a) {
  return calcDur(a, new Date().toISOString());
}

// ============================================================
// CHECK IN / OUT
// ============================================================
// ============================================================
// SUPPLIER & PRODUCT
// ============================================================
var supplierAcIdx = -1;
var productAcIdx = -1;

function getSuppliers() {
  try { return JSON.parse(localStorage.getItem('cpms_suppliers')) || []; } catch(e) { return []; }
}

function setSuppliers(arr) {
  suppliers = arr;
  updateSupplierFilter();
}
function saveSuppliers(arr) {
  localStorage.setItem('cpms_suppliers', JSON.stringify(arr));
  console.log('[DEBUG] Saving suppliers:', arr);
  console.log('[DEBUG] db:', db);
  console.log('[DEBUG] settingsRef:', settingsRef);
  console.log('[DEBUG] currentUserUid:', currentUserUid);
  
  // 确保 settingsRef 已初始化
  if (!settingsRef) {
    if (db) {
      settingsRef = db.ref('cpms_settings');
      console.log('[DEBUG] Created new settingsRef');
    } else {
      console.error('[DEBUG] db is null, cannot save to Firebase');
      toast('Firebase 未连接', 'err');
      return;
    }
  }
  
  if (settingsRef) {
    settingsRef.child('suppliers').set(arr).then(function() {
      console.log('[DEBUG] Suppliers saved to Firebase');
      toast('供应商已保存', 'ok');
    }).catch(function(err) {
      console.error('[DEBUG] Firebase error:', err.code, err.message);
      toast('保存失败: ' + err.code, 'err');
    });
  } else {
    toast('已保存到本地', 'ok');
  }
}
function getProducts() {
  try { return JSON.parse(localStorage.getItem('cpms_products')) || []; } catch(e) { return []; }
}
function saveProducts(arr) {
  localStorage.setItem('cpms_products', JSON.stringify(arr));
  console.log('[DEBUG] Saving products:', arr);
  
  if (!settingsRef && db) {
    settingsRef = db.ref('cpms_settings');
  }
  
  if (settingsRef) {
    settingsRef.child('products').set(arr).then(function() {
      toast('品名已保存', 'ok');
    }).catch(function(err) {
      console.error('[DEBUG] Products save error:', err.code, err.message);
      toast('保存失败: ' + err.code, 'err');
    });
  } else {
    toast('已保存到本地', 'ok');
  }
}

function acSupplierSearch(val) {
  var box = document.getElementById('ac-supplier');
  var q = (val || '').trim().toUpperCase();
  supplierAcIdx = -1;
  if (!q) { if (box) box.style.display = 'none'; return; }
  var matches = suppliers.filter(function(s) { return s.toUpperCase().indexOf(q) >= 0; }).slice(0, 8);
  if (!box || matches.length === 0) {
    if (box) box.innerHTML = '<div class="autocomplete-item" style="color:var(--ac)" onclick="addSupplier(\'' + val.trim().replace(/'/g, "\\'") + '\')">+ 添加 "' + val.trim() + '"</div>';
    if (box) box.style.display = 'block';
    return;
  }
  box.innerHTML = matches.map(function(s) {
    return '<div class="autocomplete-item" onclick="pickSupplier(\'' + s.replace(/'/g, "\\'") + '\')">' + s + '</div>';
  }).join('');
  box.style.display = 'block';
}

function acSupplierNav(evt) {
  var box = document.getElementById('ac-supplier');
  var items = box ? box.querySelectorAll('.autocomplete-item') : [];
  if (!items.length) return;
  if (evt.key === 'ArrowDown') { evt.preventDefault(); supplierAcIdx = Math.min(supplierAcIdx + 1, items.length - 1); }
  else if (evt.key === 'ArrowUp') { evt.preventDefault(); supplierAcIdx = Math.max(supplierAcIdx - 1, 0); }
  else if (evt.key === 'Enter' && supplierAcIdx >= 0) { evt.preventDefault(); items[supplierAcIdx].click(); return; }
  else if (evt.key === 'Escape') { if (box) box.style.display = 'none'; return; }
  items.forEach(function(it, i) { it.classList.toggle('hi', i === supplierAcIdx); });
}

function pickSupplier(name) {
  gid('f-supplier').value = titleCase(name);
  hideAc('ac-supplier');
}

function addSupplier(name) {
  name = titleCase(name);
  if (!name) return;
  if (suppliers.indexOf(name) === -1) {
    suppliers.push(name);
    saveSuppliers(suppliers);
  }
  gid('f-supplier').value = name;
  hideAc('ac-supplier');
  toast('供应商 "' + name + '" 已添加', 'ok');
}

function acProductSearch(val) {
  var box = document.getElementById('ac-product');
  var q = (val || '').trim().toUpperCase();
  productAcIdx = -1;
  if (!q) { if (box) box.style.display = 'none'; return; }
  var filtered = products.filter(function(p) { return p.toUpperCase().indexOf(q) >= 0 && selectedProducts.indexOf(p) === -1; }).slice(0, 8);
  if (box) {
    var h = '';
    if (filtered.length > 0) {
      h = filtered.map(function(p) {
        return '<div class="autocomplete-item" onclick="addProductTag(\'' + p.replace(/'/g, "\\'") + '\')">+ ' + p + '</div>';
      }).join('');
    }
    h += '<div class="autocomplete-item" style="color:var(--ac);border-top:1px solid var(--bd)" onclick="addProductTag(\'' + val.trim().replace(/'/g, "\\'") + '\')">+ 添加 "' + val.trim() + '"</div>';
    box.innerHTML = h;
    box.style.display = 'block';
  }
}

function acProductNav(evt) {
  var box = document.getElementById('ac-product');
  var items = box ? box.querySelectorAll('.autocomplete-item') : [];
  if (!items.length) return;
  if (evt.key === 'ArrowDown') { evt.preventDefault(); productAcIdx = Math.min(productAcIdx + 1, items.length - 1); }
  else if (evt.key === 'ArrowUp') { evt.preventDefault(); productAcIdx = Math.max(productAcIdx - 1, 0); }
  else if (evt.key === 'Enter' && productAcIdx >= 0) { evt.preventDefault(); items[productAcIdx].click(); return; }
  else if (evt.key === 'Escape') { if (box) box.style.display = 'none'; return; }
  items.forEach(function(it, i) { it.classList.toggle('hi', i === productAcIdx); });
}

function addProductTag(name) {
  name = titleCase(name);
  if (!name) return;
  if (selectedProducts.indexOf(name) === -1) {
    selectedProducts.push(name);
    if (products.indexOf(name) === -1) {
      products.push(name);
      saveProducts(products);
      toast('品名 "' + name + '" 已添加', 'ok');
    }
  }
  gid('f-product').value = '';
  renderProductTags();
  hideAc('ac-product');
}

function removeProductTag(name) {
  selectedProducts = selectedProducts.filter(function(p) { return p !== name; });
  renderProductTags();
}

function renderProductTags() {
  var box = document.getElementById('product-tags');
  if (!box) return;
  box.innerHTML = selectedProducts.map(function(p) {
    return '<span class="ptag">' + p + '<span class="ptag-x" onclick="removeProductTag(\'' + p.replace(/'/g, "\\'") + '\')">&times;</span></span>';
  }).join('');
}

function clearCheckInForm() {
  gid('f-cn').value = '';
  gid('f-supplier').value = '';
  gid('f-product').value = '';
  selectedProducts = [];
  renderProductTags();
}

// ============================================================
// SUPPLIER & PRODUCT MANAGEMENT (Settings)
// ============================================================
function renderSupList() {
  var el = document.getElementById('supList');
  var hintEl = document.getElementById('supAdminHint');
  if (!el) return;
  var isAdm = isAdmin();
  var canManage = canManageSupplierProduct();
  
  var h = '';
  
  // 头部信息栏 - 与停车位设置一致
  h += '<div class="settings-header">';
  h += '<div class="settings-stats">';
  h += '<div class="stat-item"><span class="stat-value">' + suppliers.length + '</span><span class="stat-label">供应商总数</span></div>';
  h += '</div>';
  
  // 添加按钮（管理员和普通员工都可以）
  if (canManage) {
    h += '<button class="settings-add-btn" onclick="showAddSupplierForm()"><span class="btn-icon">+</span><span class="btn-text">添加供应商</span></button>';
  } else {
    h += '<div class="settings-hint warning"><span class="hint-icon">⚠️</span><span class="hint-text">无权限管理供应商</span></div>';
  }
  h += '</div>';
  
  // 添加表单区域（动态显示）
  h += '<div id="sup-add-form" style="display:none;margin-bottom:16px" class="acc-form-box">';
  h += '<div class="acc-form-title">添加供应商</div>';
  h += '<div style="display:flex;gap:10px;align-items:center">';
  h += '<input type="text" id="sup-new-input" placeholder="输入供应商名称..." style="flex:1;padding:10px 12px;border:1px solid #ddd;border-radius:6px;font-size:14px" onkeypress="if(event.key===\'Enter\')addSupplierFromSettings()">';
  h += '<button class="btn btn-s" style="padding:10px 16px" onclick="addSupplierFromSettings()">保存</button>';
  h += '<button class="btn btn-g" style="padding:10px 16px" onclick="hideAddSupplierForm()">取消</button>';
  h += '</div>';
  h += '</div>';
  
  // 提示信息
  if (hintEl) {
    hintEl.innerHTML = '';
  }
  
  // 供应商列表
  if (suppliers.length === 0) {
    h += '<div class="settings-empty"><span class="empty-icon">🏢</span><span class="empty-text">暂无供应商</span><span class="empty-sub">点击上方"+ 添加供应商"按钮添加</span></div>';
  } else {
    h += '<div class="settings-list">';
    suppliers.forEach(function(name, idx) {
      // 计算该供应商的使用次数
      var usageCount = recs.filter(function(r) { return r.supplier === name; }).length;
      
      var actions = '';
      if (canManage) {
        actions += '<button class="action-btn edit" onclick="editSupplier(' + idx + ')" title="编辑"><span>✏️</span></button>';
        actions += '<button class="action-btn delete" onclick="deleteSupplier(' + idx + ')" title="删除"><span>🗑️</span></button>';
      }
      
      h += '<div class="settings-item">';
      h += '<div class="item-icon supplier">🏢</div>';
      h += '<div class="item-content">';
      h += '<div class="item-title">' + name + '</div>';
      h += '<div class="item-meta"><span class="usage-badge">使用 ' + usageCount + ' 次</span></div>';
      h += '</div>';
      h += '<div class="item-actions">' + actions + '</div>';
      h += '</div>';
    });
    h += '</div>';
  }
  
  el.innerHTML = h;
}

function showAddSupplierForm() {
  var form = document.getElementById('sup-add-form');
  if (form) {
    form.style.display = 'block';
    var input = document.getElementById('sup-new-input');
    if (input) input.focus();
  }
}

function hideAddSupplierForm() {
  var form = document.getElementById('sup-add-form');
  if (form) form.style.display = 'none';
  var input = document.getElementById('sup-new-input');
  if (input) input.value = '';
}

function addSupplierFromSettings() {
  var inp = document.getElementById('sup-new-input');
  var name = titleCase((inp ? inp.value : '').trim());
  if (!name) { toast('请输入供应商名称', 'err'); return; }
  if (suppliers.indexOf(name) !== -1) { toast('供应商 "' + name + '" 已存在', 'err'); return; }
  suppliers.push(name);
  saveSuppliers(suppliers);
  if (inp) inp.value = '';
  renderSupList();
  toast('供应商 "' + name + '" 已添加', 'ok');
}

function editSupplier(idx) {
  var oldName = suppliers[idx];
  var newName = prompt('修改供应商名称：', oldName);
  if (newName === null) return;
  newName = titleCase(newName.trim());
  if (!newName) { toast('名称无效', 'err'); return; }
  if (newName !== oldName && suppliers.indexOf(newName) !== -1) { toast('名称 "' + newName + '" 已存在', 'err'); return; }
  // Update in all records
  recs.forEach(function(r) {
    if (r.supplier === oldName) { r.supplier = newName; saveToFirebase(r.id, r); }
  });
  suppliers[idx] = newName;
  saveSuppliers(suppliers);
  renderSupList();
  toast('供应商已修改为 "' + newName + '"', 'ok');
}

function deleteSupplier(idx) {
  if (!canManageSupplierProduct()) { toast('无权限删除供应商', 'err'); return; }
  var name = suppliers[idx];
  if (!confirm('确定删除供应商 "' + name + '"？')) return;
  suppliers.splice(idx, 1);
  saveSuppliers(suppliers);
  renderSupList();
  toast('供应商 "' + name + '" 已删除', 'ok');
}

function renderProdList() {
  var el = document.getElementById('prodList');
  var hintEl = document.getElementById('prodAdminHint');
  if (!el) return;
  var isAdm = isAdmin();
  var canManage = canManageSupplierProduct();
  
  var h = '';
  
  // 头部信息栏 - 与停车位设置一致
  h += '<div class="settings-header">';
  h += '<div class="settings-stats">';
  h += '<div class="stat-item"><span class="stat-value">' + products.length + '</span><span class="stat-label">品名总数</span></div>';
  h += '</div>';
  
  // 添加按钮（管理员和普通员工都可以）
  if (canManage) {
    h += '<button class="settings-add-btn" onclick="showAddProductForm()"><span class="btn-icon">+</span><span class="btn-text">添加品名</span></button>';
  } else {
    h += '<div class="settings-hint warning"><span class="hint-icon">⚠️</span><span class="hint-text">无权限管理品名</span></div>';
  }
  h += '</div>';
  
  // 添加表单区域（动态显示）
  h += '<div id="prod-add-form" style="display:none;margin-bottom:16px" class="acc-form-box">';
  h += '<div class="acc-form-title">添加品名</div>';
  h += '<div style="display:flex;gap:10px;align-items:center">';
  h += '<input type="text" id="prod-new-input" placeholder="输入品名..." style="flex:1;padding:10px 12px;border:1px solid #ddd;border-radius:6px;font-size:14px" onkeypress="if(event.key===\'Enter\')addProductFromSettings()">';
  h += '<button class="btn btn-s" style="padding:10px 16px" onclick="addProductFromSettings()">保存</button>';
  h += '<button class="btn btn-g" style="padding:10px 16px" onclick="hideAddProductForm()">取消</button>';
  h += '</div>';
  h += '</div>';
  
  // 提示信息
  if (hintEl) {
    hintEl.innerHTML = '';
  }
  
  // 品名列表
  if (products.length === 0) {
    h += '<div class="settings-empty"><span class="empty-icon">📦</span><span class="empty-text">暂无品名</span><span class="empty-sub">点击上方"+ 添加品名"按钮添加</span></div>';
  } else {
    h += '<div class="settings-list">';
    products.forEach(function(name, idx) {
      // 计算该品名的使用次数
      var usageCount = recs.filter(function(r) { 
        return r.products && r.products.indexOf(name) !== -1; 
      }).length;
      
      var actions = '';
      if (canManage) {
        actions += '<button class="action-btn edit" onclick="editProduct(' + idx + ')" title="编辑"><span>✏️</span></button>';
        actions += '<button class="action-btn delete" onclick="deleteProduct(' + idx + ')" title="删除"><span>🗑️</span></button>';
      }
      
      h += '<div class="settings-item">';
      h += '<div class="item-icon product">📦</div>';
      h += '<div class="item-content">';
      h += '<div class="item-title">' + name + '</div>';
      h += '<div class="item-meta"><span class="usage-badge">使用 ' + usageCount + ' 次</span></div>';
      h += '</div>';
      h += '<div class="item-actions">' + actions + '</div>';
      h += '</div>';
    });
    h += '</div>';
  }
  
  el.innerHTML = h;
}

function showAddProductForm() {
  var form = document.getElementById('prod-add-form');
  if (form) {
    form.style.display = 'block';
    var input = document.getElementById('prod-new-input');
    if (input) input.focus();
  }
}

function hideAddProductForm() {
  var form = document.getElementById('prod-add-form');
  if (form) form.style.display = 'none';
  var input = document.getElementById('prod-new-input');
  if (input) input.value = '';
}

function addProductFromSettings() {
  var inp = document.getElementById('prod-new-input');
  var name = titleCase((inp ? inp.value : '').trim());
  if (!name) { toast('请输入品名', 'err'); return; }
  if (products.indexOf(name) !== -1) { toast('品名 "' + name + '" 已存在', 'err'); return; }
  products.push(name);
  saveProducts(products);
  if (inp) inp.value = '';
  renderProdList();
  toast('品名 "' + name + '" 已添加', 'ok');
}

function editProduct(idx) {
  var oldName = products[idx];
  var newName = prompt('修改品名：', oldName);
  if (newName === null) return;
  newName = titleCase(newName.trim());
  if (!newName) { toast('名称无效', 'err'); return; }
  if (newName !== oldName && products.indexOf(newName) !== -1) { toast('名称 "' + newName + '" 已存在', 'err'); return; }
  // Update in all records
  recs.forEach(function(r) {
    if (r.products) {
      var pi = r.products.indexOf(oldName);
      if (pi !== -1) { r.products[pi] = newName; saveToFirebase(r.id, r); }
    }
  });
  products[idx] = newName;
  saveProducts(products);
  renderProdList();
  toast('品名已修改为 "' + newName + '"', 'ok');
}

function deleteProduct(idx) {
  if (!canManageSupplierProduct()) { toast('无权限删除品名', 'err'); return; }
  var name = products[idx];
  if (!confirm('确定删除品名 "' + name + '"？')) return;
  products.splice(idx, 1);
  saveProducts(products);
  renderProdList();
  toast('品名 "' + name + '" 已删除', 'ok');
}

function syncSuppliersProducts(data) {
  if (data.suppliers) {
    suppliers = data.suppliers;
    localStorage.setItem('cpms_suppliers', JSON.stringify(suppliers));
  }
  if (data.products) {
    products = data.products;
    localStorage.setItem('cpms_products', JSON.stringify(products));
  }
  updateSupplierFilter();
}

// ============================================================
// CHECK IN / OUT
// ============================================================
function checkIn() {
  var cn = ((gid('f-cn') || { value: '' }).value || '').trim().toUpperCase();
  var bay = parseInt((gid('f-bay') || { value: '' }).value);
  var at = (gid('f-at') || { value: '' }).value;
  
  if (!cn || cn.length < 4) {
    toast('请输入有效的集装箱号码', 'err');
    return;
  }
  if (!bay) {
    toast('请选择停车位', 'err');
    return;
  }
  if (!at) {
    toast('请输入入场时间', 'err');
    return;
  }
  if (recs.some(function(r) { return r.bay === bay && !r.dep; })) {
    toast('停车位 ' + bay + ' 已被占用', 'err');
    return;
  }
  if (recs.some(function(r) { return r.cn === cn && !r.dep; })) {
    toast('集装箱 ' + cn + ' 已在场', 'err');
    return;
  }
  if (selectedProducts.length === 0) {
    toast('请至少选择一个品名', 'err');
    return;
  }
  
  var supplier = titleCase(((gid('f-supplier') || { value: '' }).value || '').trim());
  var id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  var rec = { id: id, cn: cn, bay: bay, supplier: supplier, products: selectedProducts.slice(), arr: new Date(at).toISOString(), dep: null, fee: 0 };
  saveToFirebase(id, rec);
  toast('集装箱 ' + cn + ' 入场成功 Bay ' + bay, 'ok');
  clearCheckInForm();
}

function qCheckIn() {
  var cn = ((gid('f-cn') || { value: '' }).value || '').trim().toUpperCase();
  if (!cn || cn.length < 4) {
    toast('请先输入集装箱号码', 'err');
    return;
  }
  
  var occ = recs.filter(function(r) { return !r.dep; }).map(function(r) { return r.bay; });
  var empty = BAYS.find(function(b) { return occ.indexOf(b) === -1; });
  
  if (!empty) {
    toast('所有停车位已满', 'err');
    return;
  }
  
  gid('f-bay').value = empty;
  gid('f-at').value = nowFmt();
  checkIn();
}

function checkOut() {
  var cn = ((gid('f-cno') || { value: '' }).value || '').trim().toUpperCase();
  var dt = (gid('f-dt') || { value: '' }).value;
  
  if (!cn || cn.length < 4) {
    toast('请输入集装箱号码', 'err');
    return;
  }
  if (!dt) {
    toast('请输入出场时间', 'err');
    return;
  }
  
  var idx = recs.findIndex(function(r) { return r.cn === cn && !r.dep; });
  if (idx === -1) {
    toast('未找到在场记录: ' + cn, 'err');
    return;
  }
  
  var r = recs[idx];
  var dep = new Date(dt).toISOString();
  
  if (new Date(dep) < new Date(r.arr)) {
    toast('出场时间不能早于入场时间', 'err');
    return;
  }
  
  r.dep = dep;
  r.fee = calcFee(r.arr, dep, r.bay);
  saveToFirebase(r.id, r);
  toast('集装箱 ' + cn + ' 出场成功 费用: ' + r.fee + ' AED', 'ok');
  gid('f-cno').value = '';
}

function delRec(id) {
  if (!confirm('确定删除此记录?')) return;
  removeFromFirebase(id);
  toast('记录已删除', 'ok');
}

// ============================================================
// TABS
// ============================================================
function swTab(tab) {
  cTab = tab;
  document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('ac'); });
  document.querySelectorAll('.tc').forEach(function(c) { c.classList.remove('ac'); });
  var at = document.querySelector('.tab[onclick="swTab(\'' + tab + '\')"]');
  if (at) at.classList.add('ac');
  var tc = gid('tc-' + tab);
  if (tc) tc.classList.add('ac');
  if (tab === 'sres') renderSRes();
}

// ============================================================
// RENDER
// ============================================================
function renderAll() {
  renderBays();
  renderAllRecs();
  renderActRecs();
  renderMS();
}

function renderBays() {
  var occ = {};
  recs.filter(function(r) { return !r.dep; }).forEach(function(r) { occ[r.bay] = r.cn; });
  
  var grid = gid('bgrid');
  if (!grid) return;
  
  grid.innerHTML = BAYS.map(function(b) {
    var on = !!occ[b];
    return '<div class="bcard ' + (on ? 'on' : 'of') + '" onclick="var s=gid(\'f-bay\');if(s)s.value=' + b + '"><div class="bnum">' + b + '</div><div class="bst">' + (on ? '占用' : '空闲') + '</div>' + (on ? '<div class="bct">' + occ[b] + '</div>' : '') + '</div>';
  }).join('');
}

function mkRow(r, showDel, forceDel) {
  var dur = r.dep ? calcDur(r.arr, r.dep) : nowDur(r.arr);
  var fee = r.dep ? r.fee : nowFee(r.arr, r.bay);
  var bad = r.dep ? '<span class="bdg bdg-d">Completed</span>' : '<span class="bdg bdg-a">Active</span>';
  var del = showDel ? '<button class="abtn x" onclick="delRec(\'' + r.id + '\')">Delete</button>' : '';
  var canDel = forceDel || r.dep || isAdmin();
  if (showDel && !canDel) del = '';
  
  var supCell = r.supplier ? '<strong style="font-family:Arial,sans-serif">' + r.supplier + '</strong>' : '<span style="color:#ccc">-</span>';
  var prodCell = (r.products && r.products.length > 0) ? '<strong style="font-family:Arial,sans-serif">' + r.products.join(', ') + '</strong>' : '<span style="color:#ccc">-</span>';
  
  var editBtn = !r.dep ? '<button class="abtn" onclick="editRec(\'' + r.id + '\')">Edit</button>' : '';
  return '<tr><td><strong style="font-size:16px">' + r.cn + '</strong></td><td>' + supCell + '</td><td style="font-size:12px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + (r.products || []).join(', ') + '">' + prodCell + '</td><td><span style="color:var(--am);font-size:21px;font-weight:bold;font-family:Arial,sans-serif">#' + r.bay + '</span></td><td>' + fdt(r.arr) + '</td><td>' + fdt(r.dep) + '</td><td>' + dur.t + '</td><td><span class="ftag">' + fee + ' AED</span></td><td>' + bad + '</td><td><button class="abtn" onclick="showDet(\'' + r.id + '\')">Details</button>' + (!r.dep ? '<button class="abtn" onclick="qoOut(\'' + r.cn + '\')">Out</button>' + editBtn : '') + del + '</td></tr>';
}

function renderAllRecs() {
  var sorted = recs.slice().sort(function(a, b) { return new Date(b.arr) - new Date(a.arr); });
  var tb = gid('tb-all');
  var es = gid('es-all');
  if (!tb || !es) return;
  
  if (sorted.length === 0) {
    tb.innerHTML = '';
    es.style.display = 'block';
    return;
  }
  
  es.style.display = 'none';
  tb.innerHTML = sorted.map(function(r) { return mkRow(r, true); }).join('');
}

function renderActRecs() {
  var act = recs.filter(function(r) { return !r.dep; }).sort(function(a, b) { return new Date(b.arr) - new Date(a.arr); });
  var tb = gid('tb-act');
  var es = gid('es-act');
  if (!tb || !es) return;
  
  if (act.length === 0) {
    tb.innerHTML = '';
    es.style.display = 'block';
    return;
  }
  
  es.style.display = 'none';
  tb.innerHTML = act.map(function(r) {
    var dur = nowDur(r.arr);
    var fee = nowFee(r.arr, r.bay);
    var editBtn = '<button class="abtn" onclick="editRec(\'' + r.id + '\')">Edit</button>';
    var delBtn = isAdmin() ? '<button class="abtn x" onclick="delRec(\'' + r.id + '\')">Delete</button>' : '';
    var supCell = r.supplier ? '<strong style="font-family:Arial,sans-serif">' + r.supplier + '</strong>' : '<span style="color:#ccc">-</span>';
    var prodCell = (r.products && r.products.length > 0) ? '<strong style="font-family:Arial,sans-serif">' + r.products.join(', ') + '</strong>' : '<span style="color:#ccc">-</span>';
    return '<tr><td><strong style="font-size:16px">' + r.cn + '</strong></td><td>' + supCell + '</td><td style="font-size:12px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + (r.products || []).join(', ') + '">' + prodCell + '</td><td><span style="color:var(--am);font-size:21px;font-weight:bold;font-family:Arial,sans-serif">#' + r.bay + '</span></td><td>' + fdt(r.arr) + '</td><td>' + dur.t + '</td><td><span class="ftag">' + fee + ' AED</span></td><td><button class="abtn" onclick="showDet(\'' + r.id + '\')">Details</button><button class="abtn" onclick="qoOut(\'' + r.cn + '\')">Out</button>' + editBtn + delBtn + '</td></tr>';
  }).join('');
}

function doSearch() {
  clearTimeout(sTimer);
  sTimer = setTimeout(function() {
    if (cTab !== 'sres') swTab('sres');
    renderSRes();
  }, 300);
}

function clearSearchFilters() {
  if (gid('f-sch')) gid('f-sch').value = '';
  if (gid('f-sup-filter')) gid('f-sup-filter').value = '';
  if (gid('f-date-start')) gid('f-date-start').value = '';
  if (gid('f-date-end')) gid('f-date-end').value = '';
  renderSRes();
}

function updateSupplierFilter() {
  var sel = gid('f-sup-filter');
  if (!sel) return;
  var currentVal = sel.value;
  var html = '<option value="">全部供应商</option>';
  suppliers.forEach(function(s) {
    html += '<option value="' + s + '">' + s + '</option>';
  });
  sel.innerHTML = html;
  sel.value = currentVal;
}

function renderSRes() {
  var q = ((gid('f-sch') || { value: '' }).value || '').trim().toUpperCase();
  var supplierFilter = (gid('f-sup-filter') || { value: '' }).value || '';
  var dateStart = (gid('f-date-start') || { value: '' }).value || '';
  var dateEnd = (gid('f-date-end') || { value: '' }).value || '';
  
  var es = gid('es-sch');
  var tb = gid('tb-sch');
  var tf = gid('tf-sch');
  var tfTotal = gid('tf-sch-total');
  if (!tb || !es) return;
  
  if (tf) tf.style.display = 'none';
  
  // Check if any filter is active
  var hasFilter = q || supplierFilter || dateStart || dateEnd;
  
  if (!hasFilter) {
    tb.innerHTML = '';
    es.style.display = 'block';
    es.querySelector('.em').textContent = '?';
    es.querySelector('.em+div').textContent = '输入搜索条件';
    return;
  }
  
  // Filter records
  var res = recs.filter(function(r) {
    // Container number filter
    var matchCn = !q || r.cn.indexOf(q) >= 0;
    
    // Supplier filter
    var matchSup = !supplierFilter || (r.supplier && r.supplier.toUpperCase().indexOf(supplierFilter.toUpperCase()) >= 0);
    
    // Date range filter
    var matchDate = true;
    if (dateStart || dateEnd) {
      var arrDate = r.arr ? r.arr.split('T')[0] : '';
      if (dateStart && arrDate < dateStart) matchDate = false;
      if (dateEnd && arrDate > dateEnd) matchDate = false;
    }
    
    return matchCn && matchSup && matchDate;
  }).sort(function(a, b) { return new Date(b.arr) - new Date(a.arr); });
  
  if (res.length === 0) {
    tb.innerHTML = '';
    es.style.display = 'block';
    es.querySelector('.em').textContent = 'X';
    es.querySelector('.em+div').textContent = '未找到: ' + q;
    return;
  }
  
  es.style.display = 'none';
  
  // Build rows with sequence number
  var rows = '';
  var totalFee = 0;
  var seq = res.length;
  
  res.forEach(function(r) {
    var dur = r.dep ? calcDur(r.arr, r.dep) : nowDur(r.arr);
    var fee = r.dep ? r.fee : nowFee(r.arr, r.bay);
    totalFee += fee;
    var bad = r.dep ? '<span class="bdg bdg-d">Completed</span>' : '<span class="bdg bdg-a">Active</span>';
    var supCell = r.supplier ? '<strong style="font-family:Arial,sans-serif">' + r.supplier + '</strong>' : '<span style="color:#ccc">-</span>';
    var prodCell = (r.products && r.products.length > 0) ? '<strong style="font-family:Arial,sans-serif">' + r.products.join(', ') + '</strong>' : '<span style="color:#ccc">-</span>';
    rows += '<tr><td style="color:var(--tx2);font-size:12px">' + seq + '</td><td><strong style="font-size:16px">' + r.cn + '</strong></td><td>' + supCell + '</td><td style="font-size:12px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + (r.products || []).join(', ') + '">' + prodCell + '</td><td><span style="color:var(--am);font-size:21px;font-weight:bold;font-family:Arial,sans-serif">#' + r.bay + '</span></td><td>' + fdt(r.arr) + '</td><td>' + fdt(r.dep) + '</td><td>' + dur.t + '</td><td><span class="ftag">' + fee + ' AED</span></td><td>' + bad + '</td></tr>';
    seq--;
  });
  
  tb.innerHTML = rows;
  
  // Show total footer
  if (tf) tf.style.display = '';
  if (tfTotal) tfTotal.textContent = totalFee + ' AED';
}

function showDet(id) {
  var r = recs.find(function(x) { return x.id === id; });
  if (!r) return;
  
  var dur = r.dep ? calcDur(r.arr, r.dep) : nowDur(r.arr);
  var fee = r.dep ? r.fee : nowFee(r.arr, r.bay);
  var sta = r.dep ? 'Completed' : 'Active';
  var stc = r.dep ? 'var(--gr)' : 'var(--am)';
  
  var m = gid('mcon');
  var supHtml = r.supplier ? '<div class="mr"><span class="ml">供应商</span><span class="mv">' + r.supplier + '</span></div>' : '';
  var prodHtml = (r.products && r.products.length > 0) ? '<div class="mr"><span class="ml">品名</span><span class="mv">' + r.products.join('、') + '</span></div>' : '';
  m.innerHTML = '<div class="mr"><span class="ml">集装箱</span><span class="mv">' + r.cn + '</span></div>' + supHtml + prodHtml + '<div class="mr"><span class="ml">停车位</span><span class="mv">#' + r.bay + '</span></div><div class="mr"><span class="ml">入场时间</span><span class="mv">' + fdt(r.arr) + '</span></div><div class="mr"><span class="ml">停留时长</span><span class="mv">' + dur.t + '</span></div><div class="mr"><span class="ml">状态</span><span class="mv" style="color:' + stc + '">' + sta + '</span></div><div class="mr"><span class="ml">费用</span><span class="mv" style="color:var(--ac)">' + fee + ' AED</span></div>';
  
  var modal = gid('modal');
  if (modal) modal.classList.add('sh');
}

function clModal() {
  var m = gid('modal');
  if (m) m.classList.remove('sh');
}

// ============================================================
// EDIT RECORD MODAL
// ============================================================
var editRecId = null;
var editRecProducts = [];

function editRec(id) {
  var r = recs.find(function(x) { return x.id === id; });
  if (!r) return;
  if (r.dep) {
    toast('已离场记录无法修改', 'err');
    return;
  }
  editRecId = id;
  editRecProducts = (r.products || []).slice();
  // Reset field selection
  var radios = document.querySelectorAll('input[name="editField"]');
  radios.forEach(function(rad) { rad.checked = false; });
  document.getElementById('editInputBox').style.display = 'none';
  var msg = document.getElementById('editMsg');
  if (msg) { msg.style.display = 'none'; msg.textContent = ''; }
  document.getElementById('editModal').classList.add('sh');
}

// Show/hide edit input when radio changes
document.addEventListener('change', function(e) {
  if (e.target && e.target.name === 'editField') {
    showEditInput(e.target.value);
  }
});

function showEditInput(field) {
  var box = document.getElementById('editInputBox');
  var content = document.getElementById('editInputContent');
  var hint = document.getElementById('editInputHint');
  var tagsBox = document.getElementById('editProductTags');
  var r = recs.find(function(x) { return x.id === editRecId; });
  if (!r) return;

  box.style.display = 'block';
  tagsBox.innerHTML = '';

  if (field === 'cn') {
    content.innerHTML = '<label style="display:block;font-size:11px;color:var(--tx2);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px">集装箱号码 Container No.</label><input type="text" id="edit-cn" value="' + r.cn + '" maxlength="11" style="width:100%;background:var(--bg4);border:1px solid var(--bd);border-radius:5px;padding:10px 12px;color:var(--tx);font-family:Courier New,monospace;font-size:15px;outline:none;text-transform:uppercase">';
    hint.textContent = '当前值: ' + r.cn;
  } else if (field === 'supplier') {
    content.innerHTML = '<label style="display:block;font-size:11px;color:var(--tx2);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px">供应商 Supplier</label><input type="text" id="edit-supplier" value="' + (r.supplier || '') + '" style="width:100%;background:var(--bg4);border:1px solid var(--bd);border-radius:5px;padding:10px 12px;color:var(--tx);font-family:Courier New,monospace;font-size:15px;outline:none">';
    hint.textContent = '当前值: ' + (r.supplier || '(空)');
  } else if (field === 'products') {
    content.innerHTML = '<label style="display:block;font-size:11px;color:var(--tx2);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px">品名 Product Name</label><input type="text" id="edit-product-input" placeholder="输入搜索或添加新品名..." style="width:100%;background:var(--bg4);border:1px solid var(--bd);border-radius:5px;padding:10px 12px;color:var(--tx);font-family:Courier New,monospace;font-size:15px;outline:none" oninput="editProductAcSearch(this.value)" onblur="setTimeout(function(){hideAc(\'edit-product-ac\')},200)"><div class="autocomplete-list" id="edit-product-ac" style="position:absolute;z-index:500;background:var(--bg4);border:1px solid var(--ac);border-radius:0 0 4px 4px;max-height:180px;overflow-y:auto;box-shadow:0 4px 16px rgba(0,0,0,.5);display:none"></div>';
    hint.textContent = '当前值: ' + (r.products || []).join(', ') || '(空)';
    renderEditProductTags();
  } else if (field === 'bay') {
    var bayOptions = BAYS.map(function(b) {
      return '<option value="' + b + '"' + (b == r.bay ? ' selected' : '') + '>Bay ' + b + '</option>';
    }).join('');
    content.innerHTML = '<label style="display:block;font-size:11px;color:var(--tx2);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px">停车位 Bay</label><select id="edit-bay" style="width:100%;background:var(--bg4);border:1px solid var(--bd);border-radius:5px;padding:10px 12px;color:var(--tx);font-family:Courier New,monospace;font-size:15px;outline:none">' + bayOptions + '</select>';
    hint.textContent = '当前值: Bay ' + r.bay + ' (费率: ' + getRate(r.bay) + ' AED/天)';
  }
}

function editProductAcSearch(val) {
  var box = document.getElementById('edit-product-ac');
  var q = (val || '').trim().toUpperCase();
  if (!q) { if (box) box.style.display = 'none'; return; }
  var filtered = products.filter(function(p) { return p.toUpperCase().indexOf(q) >= 0 && editRecProducts.indexOf(p) === -1; }).slice(0, 8);
  if (!box) return;
  var h = '';
  if (filtered.length > 0) {
    h = filtered.map(function(p) { return '<div class="autocomplete-item" onclick="editAddProductTag(\'' + p.replace(/'/g, "\\'") + '\')">+ ' + p + '</div>'; }).join('');
  }
  h += '<div class="autocomplete-item" style="color:var(--ac);border-top:1px solid var(--bd)" onclick="editAddProductTag(\'' + val.trim().replace(/'/g, "\\'") + '\')">+ 添加 "' + val.trim() + '"</div>';
  box.innerHTML = h;
  box.style.display = 'block';
}

function editAddProductTag(name) {
  name = titleCase(name);
  if (!name) return;
  if (editRecProducts.indexOf(name) === -1) {
    editRecProducts.push(name);
    if (products.indexOf(name) === -1) {
      products.push(name);
      saveProducts(products);
    }
  }
  var inp = document.getElementById('edit-product-input');
  if (inp) inp.value = '';
  renderEditProductTags();
  hideAc('edit-product-ac');
}

function editRemoveProductTag(name) {
  editRecProducts = editRecProducts.filter(function(p) { return p !== name; });
  renderEditProductTags();
}

function renderEditProductTags() {
  var box = document.getElementById('editProductTags');
  if (!box) return;
  box.innerHTML = editRecProducts.map(function(p) {
    return '<span class="ptag">' + p + '<span class="ptag-x" onclick="editRemoveProductTag(\'' + p.replace(/'/g, "\\'") + '\')">&times;</span></span>';
  }).join('');
}

function execEditRec() {
  var r = recs.find(function(x) { return x.id === editRecId; });
  if (!r) { closeEditModal(); return; }

  var fieldRadio = document.querySelector('input[name="editField"]:checked');
  var msg = document.getElementById('editMsg');
  if (!fieldRadio) {
    msg.textContent = '请先选择要修改的项目 / Please select a field';
    msg.style.display = 'block';
    return;
  }
  msg.style.display = 'none';

  var field = fieldRadio.value;
  var changed = false;

  if (field === 'cn') {
    var newCn = (document.getElementById('edit-cn') || { value: '' }).value.trim().toUpperCase();
    if (!newCn || newCn.length < 4) {
      msg.textContent = '集装箱号码无效（至少4位）';
      msg.style.display = 'block';
      return;
    }
    if (newCn !== r.cn && recs.some(function(x) { return x.cn === newCn && !x.dep; })) {
      msg.textContent = '集装箱 ' + newCn + ' 已在场';
      msg.style.display = 'block';
      return;
    }
    r.cn = newCn;
    changed = true;
  } else if (field === 'supplier') {
    var newSup = titleCase((document.getElementById('edit-supplier') || { value: '' }).value.trim());
    r.supplier = newSup;
    changed = true;
  } else if (field === 'products') {
    if (editRecProducts.length === 0) {
      msg.textContent = '请至少保留一个品名';
      msg.style.display = 'block';
      return;
    }
    r.products = editRecProducts.slice();
    changed = true;
  } else if (field === 'bay') {
    var newBay = parseInt((document.getElementById('edit-bay') || { value: '' }).value);
    if (!newBay || BAYS.indexOf(newBay) === -1) {
      msg.textContent = '请选择有效的停车位';
      msg.style.display = 'block';
      return;
    }
    if (newBay !== r.bay) {
      r.bay = newBay;
      changed = true;
    }
  }

  if (changed) {
    saveToFirebase(r.id, r);
    var fieldLabel = { cn: '集装箱号码', supplier: '供应商', products: '品名', bay: '停车位' };
    toast((fieldLabel[field] || field) + ' 已修改', 'ok');
  }
  closeEditModal();
}

function closeEditModal() {
  document.getElementById('editModal').classList.remove('sh');
  editRecId = null;
  editRecProducts = [];
  var radios = document.querySelectorAll('input[name="editField"]');
  radios.forEach(function(rad) { rad.checked = false; });
}

function qoOut(cn) {
  gid('f-cno').value = cn;
  gid('f-dt').value = nowFmt();
  swTab('records');
}

// ============================================================
// STATS
// ============================================================
function updStats() {
  var tot = recs.length;
  var act = recs.filter(function(r) { return !r.dep; }).length;
  var rev = recs.reduce(function(s, r) { return s + (r.fee || 0); }, 0);
  var now = new Date();
  var mrev = recs.filter(function(r) {
    if (!r.dep) return false;
    var d = new Date(r.dep);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).reduce(function(s, r) { return s + (r.fee || 0); }, 0);
  
  gid('s-total').textContent = tot;
  gid('s-active').textContent = act;
  gid('s-rev').textContent = rev.toLocaleString();
  gid('s-mrev').textContent = mrev.toLocaleString();
}

function initMSel() {
  var m = {};
  recs.forEach(function(r) {
    var d = new Date(r.arr);
    var key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    m[key] = true;
  });
  
  var now = new Date();
  var cur = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  m[cur] = true;
  
  var keys = Object.keys(m).sort().reverse();
  var sel = gid('msel');
  if (!sel) return;
  
  sel.innerHTML = keys.map(function(k) {
    var y = k.split('-')[0];
    var mo = k.split('-')[1];
    return '<option value="' + k + '">' + y + '年' + parseInt(mo) + '月</option>';
  }).join('');
  sel.onchange = function() { renderMS(); };
}

function renderMS() {
  var sel = gid('msel');
  if (!sel) return;
  
  var month = sel.value;
  var parts = month.split('-').map(Number);
  var year = parts[0];
  var mon = parts[1];
  
  var done = recs.filter(function(r) {
    if (!r.dep) return false;
    var d = new Date(r.dep);
    return d.getFullYear() === year && d.getMonth() + 1 === mon;
  });
  
  var totalCount = done.length;
  var totalRev = done.reduce(function(s, r) { return s + (r.fee || 0); }, 0);
  var totalDays = done.reduce(function(s, r) { return s + calcDur(r.arr, r.dep).dd; }, 0);
  var selectedLabel = gid('monthly-selected-label');
  
  var mc = gid('mc-c');
  var mr = gid('mc-r');
  var md = gid('mc-d');
  var grid = gid('sgrid');
  
  if (!mc || !mr || !md || !grid) return;
  
  mc.textContent = totalCount;
  mr.textContent = totalRev.toLocaleString();
  md.textContent = Math.round(totalDays);
  if (selectedLabel) selectedLabel.textContent = year + '.' + String(mon).padStart(2, '0');

  var monthUsedBaysMap = {};
  done.forEach(function(r) { monthUsedBaysMap[r.bay] = true; });
  var monthUsedBays = BAYS.filter(function(b) { return !!monthUsedBaysMap[b]; });
  var monthIdleBays = BAYS.filter(function(b) { return !monthUsedBaysMap[b]; });
  var currentActiveRecs = recs.filter(function(r) { return !r.dep; });
  var occupiedNowMap = {};
  currentActiveRecs.forEach(function(r) { occupiedNowMap[r.bay] = r; });
  var occupiedNowBays = BAYS.filter(function(b) { return !!occupiedNowMap[b]; });
  var availableNowBays = BAYS.filter(function(b) { return !occupiedNowMap[b]; });

  var usedEl = gid('mc-used-bays');
  var occNowEl = gid('mc-occ-now');
  var freeNowEl = gid('mc-free-now');
  if (usedEl) usedEl.textContent = monthUsedBays.length;
  if (occNowEl) occNowEl.textContent = occupiedNowBays.length;
  if (freeNowEl) freeNowEl.textContent = availableNowBays.length;

  var monthlyActiveBays = gid('monthly-active-bays');
  var monthlyIdleBays = gid('monthly-idle-bays');
  var monthlyOccupiedBays = gid('monthly-occupied-bays');
  var monthlyAvailableBays = gid('monthly-available-bays');
  if (monthlyActiveBays) monthlyActiveBays.textContent = monthUsedBays.length;
  if (monthlyIdleBays) monthlyIdleBays.textContent = monthIdleBays.length;
  if (monthlyOccupiedBays) monthlyOccupiedBays.textContent = occupiedNowBays.length;
  if (monthlyAvailableBays) monthlyAvailableBays.textContent = availableNowBays.length;

  function renderBayTags(targetId, bays, cls) {
    var el = gid(targetId);
    if (!el) return;
    if (!bays.length) {
      el.innerHTML = '<span class="bay-mini-tag">None</span>';
      return;
    }
    el.innerHTML = bays.map(function(bay) {
      return '<span class="bay-mini-tag' + (cls ? ' ' + cls : '') + '">Bay ' + bay + '</span>';
    }).join('');
  }

  renderBayTags('monthly-active-tags', monthUsedBays, '');
  renderBayTags('monthly-idle-tags', monthIdleBays, '');
  renderBayTags('monthly-occupied-tags', occupiedNowBays, 'occupied');
  renderBayTags('monthly-available-tags', availableNowBays, 'available');

  var bayStats = BAYS.map(function(bayId) {
    var bayDone = done.filter(function(r) { return r.bay === bayId; });
    var bayRevenue = bayDone.reduce(function(s, r) { return s + (r.fee || 0); }, 0);
    var bayDays = bayDone.reduce(function(s, r) { return s + calcDur(r.arr, r.dep).dd; }, 0);
    return {
      bay: bayId,
      count: bayDone.length,
      revenue: bayRevenue,
      days: bayDays
    };
  });
  var topRevenueBay = bayStats.slice().sort(function(a, b) { return b.revenue - a.revenue; })[0] || { bay: '--', revenue: 0, count: 0 };
  var longStayBay = bayStats.slice().sort(function(a, b) { return b.days - a.days; })[0] || { bay: '--', days: 0, count: 0 };
  var occRate = BAYS.length ? Math.round((occupiedNowBays.length / BAYS.length) * 100) : 0;
  var signalTop = gid('monthly-signal-top-bay');
  var signalTopSub = gid('monthly-signal-top-bay-sub');
  var signalLong = gid('monthly-signal-long-bay');
  var signalLongSub = gid('monthly-signal-long-bay-sub');
  var signalOcc = gid('monthly-signal-occ-rate');
  var signalOccSub = gid('monthly-signal-occ-rate-sub');
  if (signalTop) signalTop.textContent = topRevenueBay.bay === '--' ? '--' : ('Bay ' + topRevenueBay.bay);
  if (signalTopSub) signalTopSub.textContent = topRevenueBay.revenue > 0 ? (topRevenueBay.revenue.toLocaleString() + ' AED · ' + topRevenueBay.count + ' stays') : '本月暂无收入记录';
  if (signalLong) signalLong.textContent = longStayBay.bay === '--' ? '--' : ('Bay ' + longStayBay.bay);
  if (signalLongSub) signalLongSub.textContent = longStayBay.days > 0 ? (Math.round(longStayBay.days) + ' days accumulated') : '本月暂无停靠时长数据';
  if (signalOcc) signalOcc.textContent = occRate + '%';
  if (signalOccSub) signalOccSub.textContent = occupiedNowBays.length + ' / ' + BAYS.length + ' bays occupied now';

  var leaderEl = gid('monthly-revenue-leaders');
  if (leaderEl) {
    var leaders = bayStats.slice().sort(function(a, b) { return b.revenue - a.revenue; }).filter(function(x) { return x.revenue > 0; }).slice(0, 5);
    if (!leaders.length) {
      leaderEl.innerHTML = '<div class="leader-row"><div class="left"><div class="name">No Revenue Yet</div><div class="meta">本月暂无完成出场记录</div></div><div class="amt">0</div></div>';
    } else {
      leaderEl.innerHTML = leaders.map(function(item, idx) {
        return '<div class="leader-row"><div class="left"><div class="name">#' + (idx + 1) + ' Bay ' + item.bay + '</div><div class="meta">' + item.count + ' stays · ' + Math.round(item.days) + ' days</div></div><div class="amt">' + item.revenue.toLocaleString() + '</div></div>';
      }).join('');
    }
  }

  var liveBoard = gid('monthly-bay-live');
  if (liveBoard) {
    liveBoard.innerHTML = BAYS.map(function(bayId) {
      var activeRec = occupiedNowMap[bayId];
      var bayDone = done.filter(function(r) { return r.bay === bayId; });
      var bayMonthRev = bayDone.reduce(function(s, r) { return s + (r.fee || 0); }, 0);
      var bayMonthCnt = bayDone.length;
      var isOccupied = !!activeRec;
      var dur = activeRec ? calcDur(activeRec.arr, null) : null;
      return '<div class="bay-neon-card ' + (isOccupied ? 'occupied' : 'available') + '">' +
        '<div class="bay-id">Bay ' + bayId + '</div>' +
        '<div class="bay-status">' + (isOccupied ? '● Occupied' : '○ Available') + '</div>' +
        '<div class="bay-meta">' +
          (isOccupied
            ? '<div><strong>' + esc(activeRec.cn || '-') + '</strong></div><div>' + esc(activeRec.supplier || '-') + '</div><div>In Yard ' + esc(dur.t) + '</div>'
            : '<div><strong>No container</strong></div><div>Ready for next arrival</div><div>Idle now</div>') +
          '<div style="margin-top:8px">Month stays <strong>' + bayMonthCnt + '</strong></div>' +
          '<div>Month revenue <strong>' + bayMonthRev.toLocaleString() + ' AED</strong></div>' +
        '</div></div>';
    }).join('');
  }
  
  grid.innerHTML = BAYS.map(function(bayId) {
    var br = done.filter(function(r) { return r.bay === bayId; });
    var bc = br.length;
    var brv = br.reduce(function(s, r) { return s + (r.fee || 0); }, 0);
    var bd = br.reduce(function(s, r) { return s + calcDur(r.arr, r.dep).dd; }, 0);
    var occu = totalCount > 0 ? Math.round(bc / totalCount * 100) : 0;
    
    return '<div class="scard"><div class="sch"><div class="scbay">Bay #' + bayId + '</div><div class="scocc">' + occu + '%</div></div><div class="sr"><span class="sl">停放次数</span><span class="sv">' + bc + '</span></div><div class="sr"><span class="sl">总天数</span><span class="sv">' + Math.round(bd) + '天</span></div><div class="sr"><span class="sl">收入</span><span class="sv">' + brv.toLocaleString() + ' AED</span></div></div>';
  }).join('');
  
  // Render monthly charts
  renderMonthlyCharts(done, BAYS);
}

// ============================================================
// MONTHLY CHARTS
// ============================================================
var chartBar = null, chartLine = null, chartPieDaily = null, chartPieMonthly = null, chartMixed = null;

var CHART_COLORS = ['#2dd4ff','#7c4dff','#00e5a8','#ffb020','#ff5c93','#00c2ff','#8cff66','#ff7b72','#40c4ff','#9b7dff'];
var CHART_FILL_COLORS = ['rgba(45,212,255,.35)','rgba(124,77,255,.28)','rgba(0,229,168,.28)','rgba(255,176,32,.28)','rgba(255,92,147,.28)','rgba(0,194,255,.28)','rgba(140,255,102,.22)','rgba(255,123,114,.24)','rgba(64,196,255,.24)','rgba(155,125,255,.24)'];

var STANDARD_BAYS = [80, 81, 83, 84, 85];

function getChartCanvas(id) {
  return document.getElementById(id);
}
function makeLinearGradient(canvas, c1, c2) {
  if (!canvas || !canvas.getContext) return c1;
  var ctx = canvas.getContext('2d');
  var g = ctx.createLinearGradient(0, 0, 0, canvas.height || 260);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  return g;
}
function makeRadialGradient(canvas, c1, c2) {
  if (!canvas || !canvas.getContext) return c1;
  var ctx = canvas.getContext('2d');
  var g = ctx.createRadialGradient((canvas.width || 320) / 2, (canvas.height || 320) / 2, 20, (canvas.width || 320) / 2, (canvas.height || 320) / 2, (canvas.width || 320) / 2);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  return g;
}
function chartCommonOptions(extra) {
  var base = {
    responsive: true,
    maintainAspectRatio: true,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: '#163c5e',
          usePointStyle: true,
          pointStyle: 'circle',
          padding: 16,
          font: { size: 12, weight: 'bold' }
        }
      },
      tooltip: {
        backgroundColor: 'rgba(9,23,43,.92)',
        borderColor: 'rgba(45,212,255,.45)',
        borderWidth: 1,
        titleColor: '#dff7ff',
        bodyColor: '#f3fbff',
        padding: 12,
        displayColors: true
      }
    },
    scales: {
      x: {
        ticks: { color: '#5d7690', maxRotation: 0, autoSkip: true },
        grid: { color: 'rgba(23,60,94,.08)', drawBorder: false }
      },
      y: {
        beginAtZero: true,
        ticks: { color: '#5d7690' },
        grid: { color: 'rgba(23,60,94,.1)', drawBorder: false }
      }
    }
  };
  if (!extra) return base;
  function merge(target, source) {
    Object.keys(source).forEach(function(k) {
      if (source[k] && typeof source[k] === 'object' && !Array.isArray(source[k])) {
        if (!target[k] || typeof target[k] !== 'object') target[k] = {};
        merge(target[k], source[k]);
      } else {
        target[k] = source[k];
      }
    });
    return target;
  }
  return merge(base, extra);
}
var chartGlowPlugin = {
  id: 'chartGlowPlugin',
  beforeDatasetsDraw: function(chart) {
    var ctx = chart.ctx;
    ctx.save();
    ctx.shadowColor = 'rgba(45,212,255,.18)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  },
  afterDatasetsDraw: function(chart) {
    chart.ctx.restore();
  }
};

function isStandardBay(bayId) {
  return STANDARD_BAYS.indexOf(bayId) !== -1;
}

function renderMonthlyCharts(doneRecs, allBays) {
  if (typeof Chart === 'undefined') return;
  if (Chart && Chart.register) {
    try { Chart.register(chartGlowPlugin); } catch (eReg) {}
  }
  
  // Collect all month keys from completed records
  var allMonths = {};
  doneRecs.forEach(function(r) {
    if (!r.dep) return;
    var d = new Date(r.dep);
    var key = d.getFullYear() + '/' + String(d.getMonth() + 1).padStart(2, '0');
    if (!allMonths[key]) allMonths[key] = {};
    var bayKey = String(r.bay);
    if (!allMonths[key][bayKey]) allMonths[key][bayKey] = 0;
    allMonths[key][bayKey] += (r.fee || 0);
  });
  
  var monthKeys = Object.keys(allMonths).sort();
  
  // === Bar Chart: Standard bays 80/81/83/84/85 daily revenue ===
  var standardBays = allBays.filter(function(b) { return isStandardBay(b); });

  if (chartBar) chartBar.destroy();

  // Collect daily revenue per standard bay
  var allDays = {};
  doneRecs.forEach(function(r) {
    if (!r.dep) return;
    if (!isStandardBay(r.bay)) return;
    var d = new Date(r.dep);
    var key = d.getFullYear() + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0');
    if (!allDays[key]) allDays[key] = {};
    var bayKey = String(r.bay);
    if (!allDays[key][bayKey]) allDays[key][bayKey] = 0;
    allDays[key][bayKey] += (r.fee || 0);
  });

  var dayKeys = Object.keys(allDays).sort();

  if (dayKeys.length > 0 && standardBays.length > 0) {
    var barCanvas = getChartCanvas('barChart');
    var datasets = standardBays.map(function(bayId, i) {
      return {
        label: 'Bay ' + bayId,
        data: dayKeys.map(function(dk) {
          return (allDays[dk] && allDays[dk][String(bayId)]) ? allDays[dk][String(bayId)] : 0;
        }),
        backgroundColor: makeLinearGradient(barCanvas, CHART_FILL_COLORS[i % CHART_FILL_COLORS.length], 'rgba(255,255,255,.04)'),
        borderColor: CHART_COLORS[i % CHART_COLORS.length],
        borderWidth: 1,
        borderRadius: 8,
        borderSkipped: false,
        maxBarThickness: 28
      };
    });

    chartBar = new Chart(barCanvas, {
      type: 'bar',
      data: { labels: dayKeys, datasets: datasets },
      options: chartCommonOptions({
        plugins: {
          tooltip: {
            callbacks: {
              label: function(ctx) {
                return ctx.dataset.label + ': ' + ctx.parsed.y.toLocaleString() + ' AED';
              }
            }
          }
        },
        scales: {
          x: { stacked: true, title: { display: true, text: 'Date', color: '#4f6f8d' } },
          y: { stacked: true, beginAtZero: true, title: { display: true, text: 'AED', color: '#4f6f8d' } }
        }
      })
    });
  }
  
  // === Line Chart: Other bays (not 80/81/83/84/85) ===
  var otherBays = allBays.filter(function(b) { return !isStandardBay(b); });
  
  if (chartLine) chartLine.destroy();
  
  if (monthKeys.length > 0 && otherBays.length > 0) {
    var lineCanvas = getChartCanvas('lineChart');
    var lineDatasets = otherBays.map(function(bayId, i) {
      return {
        label: 'Bay ' + bayId,
        data: monthKeys.map(function(mk) {
          return (allMonths[mk] && allMonths[mk][String(bayId)]) ? allMonths[mk][String(bayId)] : 0;
        }),
        borderColor: CHART_COLORS[(i + 5) % CHART_COLORS.length],
        backgroundColor: makeLinearGradient(lineCanvas, CHART_FILL_COLORS[(i + 5) % CHART_FILL_COLORS.length], 'rgba(255,255,255,.02)'),
        fill: true,
        tension: 0.42,
        pointBackgroundColor: CHART_COLORS[(i + 5) % CHART_COLORS.length],
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 7
      };
    });
    
    chartLine = new Chart(lineCanvas, {
      type: 'line',
      data: { labels: monthKeys, datasets: lineDatasets },
      options: chartCommonOptions({
        plugins: {
          tooltip: {
            callbacks: {
              label: function(ctx) {
                return ctx.dataset.label + ': ' + ctx.parsed.y.toLocaleString() + ' AED';
              }
            }
          }
        },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: 'AED', color: '#4f6f8d' } },
          x: { title: { display: true, text: 'Month', color: '#4f6f8d' } }
        }
      })
    });
  }
  
  // === Pie Chart: Daily revenue share (all bays) ===
  // Collect daily revenue per ALL bays
  var allDaysAllBays = {};
  doneRecs.forEach(function(r) {
    if (!r.dep) return;
    var d = new Date(r.dep);
    var key = d.getFullYear() + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0');
    if (!allDaysAllBays[key]) allDaysAllBays[key] = {};
    var bayKey = String(r.bay);
    if (!allDaysAllBays[key][bayKey]) allDaysAllBays[key][bayKey] = 0;
    allDaysAllBays[key][bayKey] += (r.fee || 0);
  });

  var dayKeysAll = Object.keys(allDaysAllBays).sort();

  if (chartPieDaily) chartPieDaily.destroy();

  if (dayKeysAll.length > 0) {
    // Calculate total revenue per bay across all days
    var bayTotalsDaily = {};
    allBays.forEach(function(bayId) { bayTotalsDaily[bayId] = 0; });
    dayKeysAll.forEach(function(dk) {
      allBays.forEach(function(bayId) {
        if (allDaysAllBays[dk][String(bayId)]) {
          bayTotalsDaily[bayId] += allDaysAllBays[dk][String(bayId)];
        }
      });
    });

    // Filter out bays with 0 revenue
    var pieDailyLabels = [];
    var pieDailyData = [];
    allBays.forEach(function(bayId, i) {
      if (bayTotalsDaily[bayId] > 0) {
        pieDailyLabels.push('Bay ' + bayId);
        pieDailyData.push(bayTotalsDaily[bayId]);
      }
    });

    if (pieDailyData.length > 0) {
      var pieDailyCanvas = getChartCanvas('pieDaily');
      chartPieDaily = new Chart(pieDailyCanvas, {
        type: 'doughnut',
        data: {
          labels: pieDailyLabels,
          datasets: [{
            data: pieDailyData,
            backgroundColor: pieDailyLabels.map(function(_, i) {
              return makeRadialGradient(pieDailyCanvas, CHART_FILL_COLORS[i % CHART_FILL_COLORS.length], CHART_COLORS[i % CHART_COLORS.length]);
            }),
            borderWidth: 2,
            borderColor: '#fff',
            hoverOffset: 10
          }]
        },
        options: chartCommonOptions({
          plugins: {
            legend: { position: 'right' },
            tooltip: {
              callbacks: {
                label: function(ctx) {
                  var total = ctx.dataset.data.reduce(function(a, b) { return a + b; }, 0);
                  var pct = ((ctx.parsed / total) * 100).toFixed(1);
                  return ctx.label + ': ' + ctx.parsed.toLocaleString() + ' AED (' + pct + '%)';
                }
              }
            }
          }
        })
      });
    }
  }

  // === Pie Chart: Monthly revenue share (all bays) ===
  if (chartPieMonthly) chartPieMonthly.destroy();

  if (monthKeys.length > 0) {
    // Calculate total revenue per bay across all months
    var bayTotalsMonthly = {};
    allBays.forEach(function(bayId) { bayTotalsMonthly[bayId] = 0; });
    monthKeys.forEach(function(mk) {
      allBays.forEach(function(bayId) {
        if (allMonths[mk][String(bayId)]) {
          bayTotalsMonthly[bayId] += allMonths[mk][String(bayId)];
        }
      });
    });

    // Filter out bays with 0 revenue
    var pieMonthlyLabels = [];
    var pieMonthlyData = [];
    allBays.forEach(function(bayId, i) {
      if (bayTotalsMonthly[bayId] > 0) {
        pieMonthlyLabels.push('Bay ' + bayId);
        pieMonthlyData.push(bayTotalsMonthly[bayId]);
      }
    });

    if (pieMonthlyData.length > 0) {
      var pieMonthlyCanvas = getChartCanvas('pieMonthly');
      chartPieMonthly = new Chart(pieMonthlyCanvas, {
        type: 'doughnut',
        data: {
          labels: pieMonthlyLabels,
          datasets: [{
            data: pieMonthlyData,
            backgroundColor: pieMonthlyLabels.map(function(_, i) {
              return makeRadialGradient(pieMonthlyCanvas, CHART_FILL_COLORS[(i + 2) % CHART_FILL_COLORS.length], CHART_COLORS[(i + 2) % CHART_COLORS.length]);
            }),
            borderWidth: 2,
            borderColor: '#fff',
            hoverOffset: 10
          }]
        },
        options: chartCommonOptions({
          plugins: {
            legend: { position: 'right' },
            tooltip: {
              callbacks: {
                label: function(ctx) {
                  var total = ctx.dataset.data.reduce(function(a, b) { return a + b; }, 0);
                  var pct = ((ctx.parsed / total) * 100).toFixed(1);
                  return ctx.label + ': ' + ctx.parsed.toLocaleString() + ' AED (' + pct + '%)';
                }
              }
            }
          }
        })
      });
    }
  }
  
  // === Mixed Chart: 80/81/83/84/85 daily revenue line + monthly revenue bar per bay ===
  if (chartMixed) chartMixed.destroy();

  // Collect daily revenue for standard bays (for line)
  var mixedDays = {};
  doneRecs.forEach(function(r) {
    if (!r.dep) return;
    if (!isStandardBay(r.bay)) return;
    var d = new Date(r.dep);
    var key = d.getFullYear() + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0');
    if (!mixedDays[key]) mixedDays[key] = {};
    var bayKey = String(r.bay);
    if (!mixedDays[key][bayKey]) mixedDays[key][bayKey] = 0;
    mixedDays[key][bayKey] += (r.fee || 0);
  });

  var mixedDayKeys = Object.keys(mixedDays).sort();

  // Collect monthly revenue per bay (for bar)
  var mixedMonths = {};
  doneRecs.forEach(function(r) {
    if (!r.dep) return;
    var d = new Date(r.dep);
    var key = d.getFullYear() + '/' + String(d.getMonth() + 1).padStart(2, '0');
    if (!mixedMonths[key]) mixedMonths[key] = {};
    var bayKey = String(r.bay);
    if (!mixedMonths[key][bayKey]) mixedMonths[key][bayKey] = 0;
    mixedMonths[key][bayKey] += (r.fee || 0);
  });

  var mixedMonthKeys = Object.keys(mixedMonths).sort();

  // Combine all x-axis labels: first all days, then all months
  var allLabels = mixedDayKeys.concat(mixedMonthKeys);

  if (allLabels.length > 0 && standardBays.length > 0) {
    // Line datasets: daily revenue for 80/81/83/84/85 (only for daily labels)
    var lineDatasets = standardBays.map(function(bayId, i) {
      return {
        type: 'line',
        label: 'Bay ' + bayId + ' (Daily)',
        data: allLabels.map(function(label) {
          // Only show data for daily labels
          if (mixedDayKeys.indexOf(label) !== -1) {
            return (mixedDays[label] && mixedDays[label][String(bayId)]) ? mixedDays[label][String(bayId)] : 0;
          }
          return null;
        }),
        borderColor: CHART_COLORS[i % CHART_COLORS.length],
        backgroundColor: 'transparent',
        tension: 0.42,
        pointBackgroundColor: CHART_COLORS[i % CHART_COLORS.length],
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        spanGaps: true,
        yAxisID: 'y'
      };
    });

    // Bar datasets: monthly revenue per bay (only for monthly labels)
    var barDatasets = allBays.map(function(bayId, i) {
      return {
        type: 'bar',
        label: 'Bay ' + bayId + ' (Monthly)',
        data: allLabels.map(function(label) {
          // Only show data for monthly labels
          if (mixedMonthKeys.indexOf(label) !== -1) {
            return (mixedMonths[label] && mixedMonths[label][String(bayId)]) ? mixedMonths[label][String(bayId)] : 0;
          }
          return 0;
        }),
        backgroundColor: CHART_FILL_COLORS[(i + 5) % CHART_FILL_COLORS.length],
        borderColor: CHART_COLORS[(i + 5) % CHART_COLORS.length],
        borderWidth: 1,
        borderRadius: 6,
        yAxisID: 'y'
      };
    });

    chartMixed = new Chart(getChartCanvas('mixedChart'), {
      type: 'bar',
      data: { labels: allLabels, datasets: lineDatasets.concat(barDatasets) },
      options: chartCommonOptions({
        plugins: {
          legend: { 
            position: 'top', 
            labels: { 
              color: '#163c5e',
              usePointStyle: true,
              font: { size: 11, weight: 'bold' },
              filter: function(legendItem, chartData) {
                return true;
              }
            } 
          },
          tooltip: {
            callbacks: {
              label: function(ctx) {
                var val = ctx.parsed.y;
                if (val === null || val === 0) return null;
                return ctx.dataset.label + ': ' + val.toLocaleString() + ' AED';
              }
            }
          }
        },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: 'AED', color: '#4f6f8d' } },
          x: { title: { display: true, text: 'Date (Line: Daily) / Month (Bar: Monthly)', color: '#4f6f8d' } }
        }
      })
    });
  }
}

// ============================================================
// EXPORT / CLEAR
// ============================================================
function exportCSV() {
  if (recs.length === 0) {
    toast('没有数据可导出', 'err');
    return;
  }
  
  var rows = recs.map(function(r) {
    var dur = r.dep ? calcDur(r.arr, r.dep).dd.toFixed(2) : 'Active';
    return [r.cn, 'Bay ' + r.bay, fdt(r.arr), fdt(r.dep), dur, r.fee || 0, r.dep ? 'Checked Out' : 'Active'];
  });
  
  var csv = ['Container No.,Bay,Arrival,Departure,Duration,Fee,Status'].concat(rows.map(function(r) { return r.join(','); })).join('\n');
  var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ContainerParking_' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
  toast('数据已导出 CSV', 'ok');
}

function initClearBtn() {
  var clearBtn = document.querySelector('.clear-btn');
  if (clearBtn) clearBtn.style.display = isAdmin() ? '' : 'none';
}

// Sync all admin-only elements visibility
function syncAdminUI() {
  var isAdm = isAdmin();
  document.querySelectorAll('.admin-only').forEach(function(el) {
    el.style.display = isAdm ? '' : 'none';
  });
}

function openClearModal() {
  if (!isAdmin()) {
    toast('只有管理员可以清空数据', 'err');
    return;
  }
  // Reset form
  document.querySelectorAll('input[name=clearType]')[0].checked = true;
  toggleClearRange();
  var msg = document.getElementById('clearMsg');
  if (msg) { msg.style.display = 'none'; msg.textContent = ''; }
  document.getElementById('clearModal').classList.add('sh');
}

function closeClearModal() {
  document.getElementById('clearModal').classList.remove('sh');
}

function toggleClearRange() {
  var type = document.querySelector('input[name=clearType]:checked');
  var box = document.getElementById('clearRangeBox');
  if (box) box.style.display = (type && type.value === 'range') ? 'flex' : 'none';
}

// Attach listener for radio change
document.addEventListener('change', function(e) {
  if (e.target.name === 'clearType') toggleClearRange();
});

function getClearType() {
  var el = document.querySelector('input[name=clearType]:checked');
  return el ? el.value : 'today';
}

function getClearLabel() {
  var type = getClearType();
  switch(type) {
    case 'today': return '今天的数据';
    case 'range': {
      var from = document.getElementById('clearFrom').value;
      var to = document.getElementById('clearTo').value;
      return from && to ? (from + ' 至 ' + to + ' 的数据') : '指定时间范围的数据';
    }
    case 'month': {
      var now = new Date();
      return now.getFullYear() + '年' + (now.getMonth() + 1) + '月的数据';
    }
    case 'all': return '全部数据';
    default: return '数据';
  }
}

function filterRecordsToClear() {
  var type = getClearType();
  var now = new Date();
  var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  var monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  return recs.filter(function(r) {
    var t = new Date(r.arr).getTime();
    switch(type) {
      case 'today':
        return t >= todayStart;
      case 'range': {
        var from = document.getElementById('clearFrom').value;
        var to = document.getElementById('clearTo').value;
        if (!from || !to) return false;
        return t >= new Date(from).getTime() && t <= new Date(new Date(to).getTime() + 86400000);
      }
      case 'month':
        return t >= monthStart;
      case 'all':
        return true;
      default:
        return false;
    }
  });
}

function execClearData() {
  var type = getClearType();
  var msg = document.getElementById('clearMsg');

  if (type === 'range') {
    var from = document.getElementById('clearFrom').value;
    var to = document.getElementById('clearTo').value;
    if (!from || !to) {
      if (msg) { msg.style.display = 'block'; msg.textContent = '⚠️ 请选择起止时间'; }
      return;
    }
    if (new Date(from) > new Date(to)) {
      if (msg) { msg.style.display = 'block'; msg.textContent = '⚠️ 开始时间不能晚于结束时间'; }
      return;
    }
  }

  var toClear = filterRecordsToClear();
  if (toClear.length === 0) {
    toast('没有符合条件的数据', 'err');
    return;
  }

  var label = getClearLabel();
  var count = toClear.length;

  // First confirmation
  if (!confirm('即将清空 ' + count + ' 条记录：' + label + '\n\n确定要继续吗？（1/2）')) return;

  // Second confirmation
  if (!confirm('⚠️ 最终确认 ⚠️\n\n将永久删除 ' + count + ' 条记录：' + label + '\n\n此操作不可恢复！确定执行吗？（2/2）')) return;

  // Execute delete
  var deleted = 0;
  var errors = 0;
  var total = toClear.length;

  toClear.forEach(function(r) {
    if (dbRef) {
      dbRef.child(r.id).remove(function(err) {
        if (err) { errors++; } else { deleted++; }
        if (deleted + errors === total) {
          if (errors === 0) {
            toast(count + ' 条记录已清空（' + label + '）', 'ok');
          } else {
            toast('清空完成：' + deleted + ' 成功，' + errors + ' 失败', 'err');
          }
          closeClearModal();
        }
      });
    }
  });
}

// ============================================================
// TOAST
// ============================================================
function toast(msg, type) {
  var old = document.querySelector('.tst');
  if (old) old.remove();
  
  var div = document.createElement('div');
  div.className = 'tst tst-' + (type === 'err' ? 'err' : 'ok');
  div.textContent = msg;
  document.body.appendChild(div);
  
  setTimeout(function() { div.remove(); }, 3000);
}

// ============================================================
// LIVE UPDATE
// ============================================================
setInterval(function() {
  if (cTab === 'active') renderActRecs();
  renderBays();
  renderMS();
}, 30000);
