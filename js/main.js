
/* ============================================================
   Supabase 初始化
   ============================================================ */
const SUPABASE_URL = 'https://lbewnabiomoxzufbncfy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_mKDoj840VIINo5w1moFg0A__JzMQhph';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
// 从本地 session 取当前用户（不发网络请求，断网也能用）
async function getCurrentUser() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  return session ? session.user : null;
}


/* ============================================================
   登录 / 注册逻辑
   ============================================================ */
let isLoginMode = true;

function toggleAuthMode() {
  isLoginMode = !isLoginMode;
  document.getElementById('auth-subtitle').textContent = isLoginMode ? '登录你的备考助手' : '注册一个新账号';
  document.getElementById('auth-btn').textContent = isLoginMode ? '登录' : '注册';
  document.getElementById('auth-toggle-text').textContent = isLoginMode ? '还没有账号？' : '已经有账号了？';
  document.getElementById('auth-toggle-btn').textContent = isLoginMode ? '立即注册' : '去登录';
}

// 把名字（中文/网名/emoji）编码成合法邮箱
// 原理：先转成 UTF-8 字节，再每个字节转成两位十六进制
// 例："小明" → u5c0f660e@lisinoraprep.com
function nameToEmail(name) {
  const utf8 = unescape(encodeURIComponent(name));
  let hex = '';
  for (let i = 0; i < utf8.length; i++) {
    hex += utf8.charCodeAt(i).toString(16).padStart(2, '0');
  }
  return 'u' + hex + '@lisinoraprep.com';
}

async function handleAuth() {
  const account = document.getElementById('auth-account').value.trim();
  const password = document.getElementById('auth-password').value;
  const errorDiv = document.getElementById('auth-error');
  const btn = document.getElementById('auth-btn');
  
  if (!account || !password) {
    errorDiv.textContent = '请填写名字（或邮箱）和密码';
    errorDiv.style.display = 'block';
    return;
  }
  
  // 有 @ 就当邮箱；没有就当名字，编码成邮箱
  const email = account.indexOf('@') >= 0 ? account : nameToEmail(account);
  
  errorDiv.style.display = 'none';
  btn.textContent = '处理中...';
  btn.disabled = true;
  
  try {
    if (isLoginMode) {
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } else {
      const { error } = await supabaseClient.auth.signUp({ email, password, options: { data: { display_name: account } } });
      if (error) throw error;
      alert('注册成功！现在可以登录了。');
      toggleAuthMode();
    }
  } catch (err) {
    let msg = err.message || '操作失败';
    // 把 Supabase 的英文报错换成弟弟妹妹看得懂的话
    if (msg.indexOf('already registered') >= 0 || msg.indexOf('already been registered') >= 0) {
      msg = '这个名字已经被用了，换一个吧（加上小名/昵称试试）';
    } else if (msg.indexOf('Invalid login credentials') >= 0) {
      msg = '名字或密码不对，再试试～';
    }
    errorDiv.textContent = msg;
    errorDiv.style.display = 'block';
  } finally {
    btn.textContent = isLoginMode ? '登录' : '注册';
    btn.disabled = false;
  }
}

// ============ 登录状态检查（修复闪烁） ============
// 页面初始化时，先隐藏登录页（避免闪一下），再用 getSession 判断
document.getElementById('auth-overlay').style.display = 'none';

(async function initAuth() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  const overlay = document.getElementById('auth-overlay');
  if (session) {
    overlay.style.display = 'none';
    console.log('已登录:', session.user.email);
    updateAccountEmail(session.user);
    trySyncOnce();
    loadProfile();
    loadLetter();
  } else {
    overlay.style.display = 'flex';
    updateAccountEmail(null);
  }
})();

// 后续只监听状态"变化"，不处理 INITIAL_SESSION（避免闪烁）
supabaseClient.auth.onAuthStateChange((event, session) => {
  if (event === 'INITIAL_SESSION') return;
  const overlay = document.getElementById('auth-overlay');
  if (session) {
    overlay.style.display = 'none';
    updateAccountEmail(session.user);
  } else {
    overlay.style.display = 'flex';
    updateAccountEmail(null);
  }
});

let hasSyncedThisSession = sessionStorage.getItem('cloud_synced') === '1';

// 清空本地用户数据（保留设备级设置，如 data_version、last_day）
function clearLocalUserData() {
  ['subjects_list', 'exams_list', 'achievements_list'].forEach(k => localStorage.removeItem(k));
  Object.keys(localStorage).forEach(k => {
    if (k.startsWith('study_') || k.startsWith('diary_')) {
      localStorage.removeItem(k);
    }
  });
}

async function trySyncOnce() {
  if (hasSyncedThisSession) return;
  hasSyncedThisSession = true;
  sessionStorage.setItem('cloud_synced', '1');

  const user = await getCurrentUser();
  if (!user) return;

  // ===== 关键：检测是否切换了账号 =====
  const lastUserId = localStorage.getItem('current_user_id');
  if (lastUserId && lastUserId !== user.id) {
    console.log('🔄 检测到切换账号，清空本地数据避免污染');
    clearLocalUserData();
  }
  // 记录当前用户 id（退出登录时不清，用于下次对比）
  localStorage.setItem('current_user_id', user.id);

  // 看云端有没有数据
  const { count } = await supabaseClient
    .from('subjects')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id);
  const cloudHasData = (count && count > 0);

  // 看本地有没有数据
  const localHasData =
    localStorage.getItem('subjects_list') ||
    localStorage.getItem('exams_list') ||
    Object.keys(localStorage).some(k => k.startsWith('study_') || k.startsWith('diary_'));

  if (!cloudHasData && localHasData) {
    console.log('☁️ 云端为空 → 上传本地数据');
    await CloudSync.pushEverything();
    showToast('☁️ 数据已同步到云端');
  } else if (cloudHasData) {
    console.log('☁️ 云端有数据 → 拉取到本地');
    await CloudSync.pullAll();
    showToast('☁️ 已从云端恢复数据');
    setTimeout(() => location.reload(), 800);
  } else {
    console.log('☁️ 云端和本地都是空的，无需同步');
  }
}

/* ============================================================
   账户信息 + 退出登录
   ============================================================ */
// 显示当前登录的账号：优先显示用户输入的名字，没有名字才显示邮箱
function updateAccountEmail(user) {
  const el = document.getElementById('account-email');
  if (!el) return;
  if (!user) {
    el.textContent = '未登录';
    return;
  }
  // 注册时存进 user_metadata 的 display_name
  const meta = user.user_metadata || {};
  const displayName = meta.display_name;
  // 老账号没有 display_name 就用邮箱，并做长度截断
  let text = displayName || user.email || '未登录';
  if (text.length > 20) text = text.slice(0, 18) + '…';
  el.textContent = text;
}

/* ============================================================
   个人资料（头像 + 昵称）
   ============================================================ */
// 头像数据存在内存里，避免频繁读库
let currentProfile = { emoji: '🍀', color: '#52B788', nickname: '', avatarUrl: '' };
// 20 个默认头像组合（emoji + 背景色）
const AVATAR_PRESETS = [
  { emoji: '🍀', color: '#52B788' },
  { emoji: '🌸', color: '#F4A6B8' },
  { emoji: '🌻', color: '#F2C14E' },
  { emoji: '🌙', color: '#7B9FE0' },
  { emoji: '⭐', color: '#9B8EC4' },
  { emoji: '🌈', color: '#E8A87C' },
  { emoji: '🐱', color: '#E8A87C' },
  { emoji: '🐶', color: '#C38D9E' },
  { emoji: '🐰', color: '#F4A6B8' },
  { emoji: '🐼', color: '#B5EAD7' },
  { emoji: '🦊', color: '#E8A87C' },
  { emoji: '🐳', color: '#7B9FE0' },
  { emoji: '🦋', color: '#9B8EC4' },
  { emoji: '🌿', color: '#81B29A' },
  { emoji: '🌊', color: '#6C9BD2' },
  { emoji: '🔥', color: '#E07A5F' },
  { emoji: '💎', color: '#6C9BD2' },
  { emoji: '🎀', color: '#F4A6B8' },
  { emoji: '🥑', color: '#81B29A' },
  { emoji: '🍑', color: '#E8A87C' }
];

// 打开头像选择器
function openAvatarPicker() {
  const grid = $('avatar-grid');
  if (!grid) return;
  grid.innerHTML = AVATAR_PRESETS.map(function(p, i) {
    const selected = (p.emoji === currentProfile.emoji && p.color === currentProfile.color);
    const border = selected ? '3px solid #2D6A4F' : '3px solid transparent';
    return '<div onclick="pickAvatar(' + i + ')" style="width:100%; aspect-ratio:1; border-radius:50%; background:' + p.color + '; display:flex; align-items:center; justify-content:center; font-size:28px; cursor:pointer; border:' + border + '; transition: transform 0.15s; box-sizing:border-box;">' + p.emoji + '</div>';
  }).join('');
  $('avatar-modal').classList.add('show');
}

// 关闭头像选择器
function closeAvatarPicker() {
  $('avatar-modal').classList.remove('show');
}

// 选中一个头像
async function pickAvatar(index) {
  const preset = AVATAR_PRESETS[index];
  if (!preset) return;
  currentProfile.emoji = preset.emoji;
  currentProfile.color = preset.color;
  renderProfileHeader();
  closeAvatarPicker();
  showToast('正在保存…');

  const user = await getCurrentUser();
  if (!user) return;
  currentProfile.avatarUrl = '';
  const { error } = await supabaseClient
    .from('profiles')
    .update({ avatar_emoji: preset.emoji, avatar_color: preset.color, avatar_url: null, updated_at: new Date().toISOString() })
    .eq('id', user.id);
  if (error) {
    showToast('保存失败：' + error.message);
  } else {
    showToast('✅ 头像已更新');
  }
}

// 改昵称
async function changeNickname() {
  const cur = currentProfile.nickname || '';
  const name = prompt('输入新的昵称（最多 12 个字）', cur);
  if (name === null) return;
  const trimmed = name.trim();
  if (!trimmed) { showToast('昵称不能为空'); return; }
  if (trimmed.length > 12) { showToast('昵称最多 12 个字'); return; }

  const user = await getCurrentUser();
  if (!user) return;

  const { error } = await supabaseClient
    .from('profiles')
    .update({ nickname: trimmed, updated_at: new Date().toISOString() })
    .eq('id', user.id);
  if (error) { showToast('保存失败：' + error.message); return; }

  currentProfile.nickname = trimmed;
  renderProfileHeader();
  showToast('✅ 昵称已更新');
}

// 上传自定义头像：压缩到 400x400，上传到 Storage，更新 profiles.avatar_url
async function uploadAvatar(event) {
  const file = event.target.files[0];
  if (!file) return;
  event.target.value = '';

  if (!file.type.startsWith('image/')) {
    showToast('请选择图片文件');
    return;
  }
  showToast('正在处理图片…');

  const user = await getCurrentUser();
  if (!user) { showToast('未登录'); return; }

  // 用 canvas 压缩到 400x400
  let dataUrl;
  try {
    dataUrl = await compressImage(file, 400, 400);
  } catch (e) {
    showToast('图片处理失败：' + e.message);
    return;
  }

  // dataURL → Blob
  const blob = dataUrlToBlob(dataUrl);

  // 上传路径：avatars/{user_id}/{timestamp}.jpg
  const fileName = user.id + '/' + Date.now() + '.jpg';

  // 先记住旧 URL，用于删旧文件
  const oldUrl = currentProfile.avatarUrl;

  const { error: upErr } = await supabaseClient.storage
    .from('avatars')
    .upload(fileName, blob, { contentType: 'image/jpeg', upsert: false });
  if (upErr) { showToast('上传失败：' + upErr.message); return; }

  // 取 public URL
  const { data: urlData } = supabaseClient.storage.from('avatars').getPublicUrl(fileName);
  const publicUrl = urlData.publicUrl;

  // 更新 profiles
  const { error: dbErr } = await supabaseClient
    .from('profiles')
    .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
    .eq('id', user.id);
  if (dbErr) { showToast('保存失败：' + dbErr.message); return; }

  // 删旧文件（如果之前有自定义头像）
  if (oldUrl && oldUrl.indexOf('/avatars/') >= 0) {
    const oldPath = oldUrl.split('/avatars/')[1];
    if (oldPath) {
      await supabaseClient.storage.from('avatars').remove([oldPath]).catch(function(){});
    }
  }

  currentProfile.avatarUrl = publicUrl;
  renderProfileHeader();
  closeAvatarPicker();
  showToast('✅ 头像已更新');
}

// 用 canvas 把图片压缩到 maxW × maxH（保持比例，居中裁剪）
function compressImage(file, maxW, maxH) {
  return new Promise(function(resolve, reject) {
    const reader = new FileReader();
    reader.onload = function(e) {
      const img = new Image();
      img.onload = function() {
        const canvas = document.createElement('canvas');
        canvas.width = maxW;
        canvas.height = maxH;
        const ctx = canvas.getContext('2d');
        // 居中裁剪成正方形
        const size = Math.min(img.width, img.height);
        const sx = (img.width - size) / 2;
        const sy = (img.height - size) / 2;
        ctx.drawImage(img, sx, sy, size, size, 0, 0, maxW, maxH);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = function() { reject(new Error('无法读取图片')); };
      img.src = e.target.result;
    };
    reader.onerror = function() { reject(new Error('文件读取失败')); };
    reader.readAsDataURL(file);
  });
}

// dataURL → Blob
function dataUrlToBlob(dataUrl) {
  const parts = dataUrl.split(',');
  const mime = parts[0].match(/:(.*?);/)[1];
  const bstr = atob(parts[1]);
  const n = bstr.length;
  const u8arr = new Uint8Array(n);
  for (let i = 0; i < n; i++) u8arr[i] = bstr.charCodeAt(i);
  return new Blob([u8arr], { type: mime });
}

// 点空白关闭
document.addEventListener('DOMContentLoaded', function() {
  const mask = $('avatar-modal');
  if (mask) {
    mask.addEventListener('click', function(e) {
      if (e.target === mask) closeAvatarPicker();
    });
  }
});

// 把当前 profile 渲染到"我的"页顶部
function renderProfileHeader() {
  const avatarEl = $('profile-avatar');
  const nameEl = $('profile-nickname');
  if (avatarEl) {
    if (currentProfile.avatarUrl) {
      avatarEl.innerHTML = '<img src="' + currentProfile.avatarUrl + '" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">';
      avatarEl.style.background = 'transparent';
    } else {
      avatarEl.textContent = currentProfile.emoji;
      avatarEl.style.background = currentProfile.color;
    }
  }
  if (nameEl) {
    nameEl.textContent = currentProfile.nickname || '未登录';
  }
}

// 登录后调用：从云端读 profile，没有就用默认值创建一个
async function loadProfile() {
  const user = await getCurrentUser();
  if (!user) return;

  let data = null;
  try {
    const res = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    data = res.data;
  } catch (e) {
    console.log('读取 profile 失败，使用默认值');
  }

  if (data) {
    currentProfile.emoji = data.avatar_emoji || '🍀';
    currentProfile.color = data.avatar_color || '#52B788';
    currentProfile.nickname = data.nickname || (user.user_metadata && user.user_metadata.display_name) || user.email;
    currentProfile.avatarUrl = data.avatar_url || '';
  } else {
    const nickname = (user.user_metadata && user.user_metadata.display_name) || user.email || '';
    currentProfile.nickname = nickname;
    try {
      await supabaseClient.from('profiles').insert({
        id: user.id,
        email: user.email,
        nickname: nickname,
        avatar_emoji: currentProfile.emoji,
        avatar_color: currentProfile.color
      });
    } catch (e) {}
  }
  renderProfileHeader();
    // 顺便读一下排行榜开关状态
  try {
    const { data: pref } = await supabaseClient
      .from('profiles')
      .select('show_in_ranking')
      .eq('id', user.id)
      .maybeSingle();
    const val = (pref && pref.show_in_ranking === false) ? false : true;
    renderRankingToggleBtn(val);
  } catch (e) {}
}

async function handleLogout() {
  if (!confirm('确定要退出登录吗？')) return;
  const { error } = await supabaseClient.auth.signOut();
  if (error) {
    alert('退出失败：' + error.message);
    return;
  }
    sessionStorage.removeItem('cloud_synced');
  location.reload();
}

// 注销账号：删除云端用户 + 所有数据，清空本地
async function deleteAccount() {
  if (!confirm('确定要注销账号吗？\n\n所有学习记录、日记、考试、科目都会被永久删除。')) return;
  const check = prompt('请输入「注销」两个字确认：');
  if (check !== '注销') { showToast('已取消'); return; }

  showToast('正在注销…');
  const { error } = await supabaseClient.rpc('delete_my_account');
  if (error) {
    alert('注销失败：' + error.message);
    return;
  }

  // 清本地数据
  clearLocalUserData();
  localStorage.removeItem('current_user_id');
  sessionStorage.removeItem('cloud_synced');

  await supabaseClient.auth.signOut();
  showToast('✅ 账号已注销');
  setTimeout(() => location.reload(), 800);
}

/* ============================================================
   云端同步 · CloudSync
   ============================================================ */
const CloudSync = {

  // 从云端拉所有数据覆盖到本地
  async pullAll() {
    const user = await getCurrentUser();
    if (!user) return;

    const { data: subjects } = await supabaseClient.from('subjects').select('*').eq('user_id', user.id);
    if (subjects) {
      localStorage.setItem('subjects_list', JSON.stringify(
        subjects.map(s => ({ id: s.id, name: s.name, color: s.color }))
      ));
    }

    const { data: exams } = await supabaseClient.from('exams').select('*').eq('user_id', user.id);
    if (exams) {
      localStorage.setItem('exams_list', JSON.stringify(
        exams.map(e => ({ id: e.id, name: e.name, date: e.date, color: e.color, events: e.events || [] }))
      ));
    }

    const { data: diaries } = await supabaseClient.from('diaries').select('*').eq('user_id', user.id);
    if (diaries) {
      Object.keys(localStorage).filter(k => k.startsWith('diary_')).forEach(k => localStorage.removeItem(k));
      diaries.forEach(d => {
        localStorage.setItem('diary_' + d.date, JSON.stringify({ mood: d.mood, content: d.content }));
      });
    }

    const { data: records } = await supabaseClient.from('study_records').select('*').eq('user_id', user.id);
    if (records) {
      Object.keys(localStorage).filter(k => k.startsWith('study_')).forEach(k => localStorage.removeItem(k));
      const byDate = {};
      records.forEach(r => {
        if (!byDate[r.date]) byDate[r.date] = { unassigned: 0, subjects: {} };
        if (r.subject_name === '__unassigned__') {
          byDate[r.date].unassigned = (byDate[r.date].unassigned || 0) + (r.seconds || 0);
        } else {
          byDate[r.date].subjects[r.subject_name] = {
            seconds: r.seconds || 0,
            logs: Array.isArray(r.logs) ? r.logs : []
          };
        }
      });
      Object.keys(byDate).forEach(d => {
        localStorage.setItem('study_' + d, JSON.stringify(byDate[d]));
      });
    }

    const { data: achs } = await supabaseClient.from('achievements').select('*').eq('user_id', user.id);
    if (achs) {
      localStorage.setItem('achievements_list', JSON.stringify(
        achs.map(a => ({
          id: a.id, type: a.type, periodKey: a.period_key,
          title: a.title, desc: a.description, reward: a.reward,
          earnedDate: a.earned_date,
          earnedAt: a.earned_at ? new Date(a.earned_at).getTime() : Date.now(),
          status: a.status
        }))
      ));
    }
  },

    // 推送科目到云端
  async pushSubjects() {
    const user = await getCurrentUser();
    if (!user) return 'no user';
    const list = JSON.parse(localStorage.getItem('subjects_list') || '[]');
    const del = await supabaseClient.from('subjects').delete().eq('user_id', user.id);
    if (del.error) return 'delete error: ' + del.error.message;
    if (list.length) {
      const ins = await supabaseClient.from('subjects').insert(
        list.map(s => ({ id: s.id, user_id: user.id, name: s.name, color: s.color }))
      );
      if (ins.error) return 'insert error: ' + ins.error.message;
      return 'ok, ' + list.length + ' rows';
    }
    return 'ok, empty';
  },

    // 推送考试到云端
  async pushExams() {
    const user = await getCurrentUser();
    if (!user) return 'no user';
    const list = JSON.parse(localStorage.getItem('exams_list') || '[]');
    const del = await supabaseClient.from('exams').delete().eq('user_id', user.id);
    if (del.error) return 'delete error: ' + del.error.message;
    if (list.length) {
      const ins = await supabaseClient.from('exams').insert(
        list.map(e => ({ id: e.id, user_id: user.id, name: e.name, date: e.date, color: e.color, events: e.events || [] }))
      );
      if (ins.error) return 'insert error: ' + ins.error.message;
      return 'ok, ' + list.length + ' rows';
    }
    return 'ok, empty';
  },

  // 推送某天日记到云端
  async pushDiary(dateStr) {
    const user = await getCurrentUser();
    if (!user) return;
    const raw = localStorage.getItem('diary_' + dateStr);
    if (!raw) {
      await supabaseClient.from('diaries').delete().eq('user_id', user.id).eq('date', dateStr);
      return;
    }
    const d = JSON.parse(raw);
    await supabaseClient.from('diaries').upsert({
      user_id: user.id, date: dateStr,
      mood: d.mood || '', content: d.content || '',
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,date' });
  },

  // 推送某天学习记录到云端
  async pushStudyDay(dateStr) {
    const user = await getCurrentUser();
    if (!user) return;
    const day = JSON.parse(localStorage.getItem('study_' + dateStr) || '{"unassigned":0,"subjects":{}}');
    await supabaseClient.from('study_records').delete().eq('user_id', user.id).eq('date', dateStr);
    const rows = [];
    Object.keys(day.subjects || {}).forEach(name => {
      rows.push({
        user_id: user.id, date: dateStr, subject_name: name,
        seconds: day.subjects[name].seconds || 0,
        logs: day.subjects[name].logs || []
      });
    });
    if (day.unassigned > 0) {
      rows.push({
        user_id: user.id, date: dateStr,
        subject_name: '__unassigned__', seconds: day.unassigned, logs: []
      });
    }
    if (rows.length) {
      await supabaseClient.from('study_records').insert(rows);
    }
  },

  // 推送成就到云端
  async pushAchievements() {
    const user = await getCurrentUser();
    if (!user) return;
    const list = JSON.parse(localStorage.getItem('achievements_list') || '[]');
    if (!list.length) return;
    await supabaseClient.from('achievements').upsert(
      list.map(a => ({
        id: a.id, user_id: user.id, type: a.type, period_key: a.periodKey,
        title: a.title, description: a.desc, reward: a.reward,
        earned_date: a.earnedDate,
        earned_at: a.earnedAt ? new Date(a.earnedAt).toISOString() : new Date().toISOString(),
        status: a.status
      })),
      { onConflict: 'id' }
    );
  },

  // 首次登录：把本地所有数据一次性推到云端
  async pushEverything() {
    console.log('☁️ 开始上传...');

    console.log('→ subjects');
    const r1 = await this.pushSubjects();
    console.log('  subjects 结果:', r1);

    console.log('→ exams');
    const r2 = await this.pushExams();
    console.log('  exams 结果:', r2);

    console.log('→ achievements');
    const r3 = await this.pushAchievements();
    console.log('  achievements 结果:', r3);

    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('study_')) {
        const d = k.slice(6);
        if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
          console.log('→ study', d);
          const r = await this.pushStudyDay(d);
          console.log('  结果:', r);
        }
      }
      if (k.startsWith('diary_')) {
        const d = k.slice(6);
        if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
          console.log('→ diary', d);
          const r = await this.pushDiary(d);
          console.log('  结果:', r);
        }
      }
    }
    console.log('☁️ 上传完成');
  }
};

/* ============================================================
   工具函数
   ============================================================ */
const $ = id => document.getElementById(id);

function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2200);
}

function getTodayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function dateStrFromTs(ts) {
  const d = new Date(ts);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function formatDuration(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function formatDurationHM(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h === 0 && m === 0) return '0m';
  if (h === 0) return m + 'm';
  if (m === 0) return h + 'h';
  return h + 'h ' + m + 'm';
}

function fmtDateLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const wd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
  const today = getTodayStr();
  const yest = (() => { const t = new Date(); t.setDate(t.getDate() - 1); return dateStrFromTs(t.getTime()); })();
  let prefix = '';
  if (dateStr === today) prefix = '今天 · ';
  else if (dateStr === yest) prefix = '昨天 · ';
  return prefix + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + wd;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function escapeAttr(s) {
  return escapeHtml(s);
}


/* ============================================================
   每日学习时长上限（秒）
   ============================================================ */
const DAILY_WARN_HOURS = 12;          // 警告线
const DAILY_MAX_HOURS = 16;           // 硬上限
const MANUAL_SINGLE_MAX_HOURS = 24;   // 单次手动补录的最大小时数
const STORE_KEY_SUBJECTS = 'subjects_list';
const STORE_KEY_VERSION = 'data_version';

const STORE = {
  getSubjects() {
    try {
      const v = JSON.parse(localStorage.getItem(STORE_KEY_SUBJECTS));
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  },
  setSubjects(list) {
    localStorage.setItem(STORE_KEY_SUBJECTS, JSON.stringify(list));
  },
  getDay(dateStr) {
    let d = null;
    try { d = JSON.parse(localStorage.getItem('study_' + dateStr)); } catch (e) { d = null; }
    if (!d || typeof d !== 'object') return { unassigned: 0, subjects: {} };
    return {
      unassigned: typeof d.unassigned === 'number' ? d.unassigned : 0,
      subjects: (d.subjects && typeof d.subjects === 'object') ? d.subjects : {}
    };
  },
  setDay(dateStr, day) {
    localStorage.setItem('study_' + dateStr, JSON.stringify(day));
  },
  ensureSubject(day, name) {
    if (!day.subjects[name]) day.subjects[name] = { seconds: 0, logs: [] };
    if (!Array.isArray(day.subjects[name].logs)) day.subjects[name].logs = [];
    if (typeof day.subjects[name].seconds !== 'number') day.subjects[name].seconds = 0;
    return day.subjects[name];
  },
  addSeconds(dateStr, name, secs) {
    secs = Math.floor(secs);
    if (!secs || secs <= 0) return 0;
    const day = this.getDay(dateStr);
    const currentTotal = dayTotal(day);
    const maxSec = DAILY_MAX_HOURS * 3600;
    const remaining = maxSec - currentTotal;
    if (remaining <= 0) return 0;              // 已封顶
    const toAdd = Math.min(secs, remaining);   // 截断
    if (name) {
      this.ensureSubject(day, name).seconds += toAdd;
    } else {
      day.unassigned += toAdd;
    }
    this.setDay(dateStr, day);
    return toAdd;                              // 返回实际记录量
  },
  addLog(dateStr, name, text) {
    if (!name || !text) return;
    const day = this.getDay(dateStr);
    this.ensureSubject(day, name).logs.push({ t: Date.now(), text: text });
    this.setDay(dateStr, day);
  },
  deleteLog(dateStr, name, index) {
    const day = this.getDay(dateStr);
    if (day.subjects[name] && day.subjects[name].logs) {
      day.subjects[name].logs.splice(index, 1);
      this.setDay(dateStr, day);
    }
  }
};

function dayTotal(day) {
  let t = day.unassigned || 0;
  Object.keys(day.subjects || {}).forEach(k => {
    t += (day.subjects[k].seconds || 0);
  });
  return t;
}

/* ============================================================
   每日上限检查
   ============================================================ */
function checkDailyLimit(dateStr) {
  const day = STORE.getDay(dateStr);
  const total = dayTotal(day);
  const warnSec = DAILY_WARN_HOURS * 3600;
  const maxSec = DAILY_MAX_HOURS * 3600;

  if (total >= maxSec) {
    showToast('🛑 今日已达 ' + DAILY_MAX_HOURS + ' 小时上限，请好好休息，超出部分未记录');
    return 'max';
  }
  if (total >= warnSec) {
    const key = 'warn_shown_' + dateStr;
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, '1');
      showToast('⚠️ 今天已学 ' + Math.floor(total / 3600) + ' 小时，注意身体，适当休息～');
    }
    return 'warn';
  }
  return 'ok';
}

function getAllStudyDates() {
  return Object.keys(localStorage)
    .filter(k => k.indexOf('study_') === 0)
    .map(k => k.slice(6))
    .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
}

/* ============================================================
   数据迁移（保护旧数据）
   ============================================================ */
function migrateData() {
  const version = localStorage.getItem(STORE_KEY_VERSION);
  const studyKeys = Object.keys(localStorage).filter(k => k.indexOf('study_') === 0);

  if (version === '2') {
    // 已迁移：仅确保科目列表存在
    if (!localStorage.getItem(STORE_KEY_SUBJECTS)) {
      const names = new Set();
      studyKeys.forEach(k => {
        try {
          const d = JSON.parse(localStorage.getItem(k));
          if (d && d.subjects) Object.keys(d.subjects).forEach(n => names.add(n));
        } catch (e) {}
      });
      if (names.size === 0) ['程序设计', '数据结构', '政治', '英语', '高等数学'].forEach(n => names.add(n));
      const list = [...names].map((n, i) => ({ id: 'sub_' + i + '_' + Date.now(), name: n, color: COLORS[i % COLORS.length] }));
      STORE.setSubjects(list);
    }
    return;
  }

  const names = new Set();

  studyKeys.forEach(k => {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(k)); } catch (e) { return; }
    if (!d || typeof d !== 'object') return;

    // 已是新格式
    if (d.__v === 2) {
      Object.keys(d.subjects || {}).forEach(n => names.add(n));
      return;
    }

    // 旧格式：{ duration, subjects: { name: { score, note } } }
    const dateStr = k.slice(6);
    const newDay = { __v: 2, unassigned: typeof d.duration === 'number' ? d.duration : 0, subjects: {} };

    if (d.subjects && typeof d.subjects === 'object') {
      Object.keys(d.subjects).forEach(name => {
        names.add(name);
        const v = d.subjects[name] || {};
        const logs = [];
        if (typeof v.note === 'string' && v.note.trim()) {
          const ts = new Date(dateStr + 'T12:00:00').getTime() || Date.now();
          logs.push({ t: ts, text: v.note.trim() });
        }
        if (logs.length) {
          newDay.subjects[name] = { seconds: 0, logs: logs };
        }
      });
    }
    localStorage.setItem(k, JSON.stringify(newDay));
  });

  if (names.size === 0) {
    ['程序设计', '数据结构', '政治', '英语', '高等数学'].forEach(n => names.add(n));
  }

  let list = null;
  try { list = JSON.parse(localStorage.getItem(STORE_KEY_SUBJECTS)); } catch (e) { list = null; }

  if (!Array.isArray(list)) {
    list = [...names].map((n, i) => ({ id: 'sub_' + i + '_' + Date.now(), name: n, color: COLORS[i % COLORS.length] }));
  } else {
    list.forEach((s, i) => {
      if (!s.id) s.id = 'sub_' + i + '_' + Date.now();
      if (!s.color) s.color = COLORS[i % COLORS.length];
    });
    names.forEach(n => {
      if (!list.some(s => s.name === n)) {
        list.push({ id: 'sub_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), name: n, color: COLORS[list.length % COLORS.length] });
      }
    });
  }

  STORE.setSubjects(list);
  localStorage.setItem(STORE_KEY_VERSION, '2');

  // 保存旧日记日期，日历需要
  if (!localStorage.getItem('last_day')) localStorage.setItem('last_day', getTodayStr());
}

/* ============================================================
   Tab 切换
   ============================================================ */
function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-' + tabName));
  if (tabName === 'study') {
    renderTodaySubjects();
    updateStats();
    drawLineChart();
    updateTimerUI();
  }
  if (tabName === 'growth') {
    renderCalendar();
    refreshAchievementsFromCloud();
  }
  if (tabName === 'home') {
    updateHomeOverview();
    renderExamCards();
    renderTimeline();
    renderHomeAlerts();
        loadLetter();
  }
  if (tabName === 'profile') renderSubjectList();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});


const ExamStore = {
  getAll() {
    try {
      const v = JSON.parse(localStorage.getItem(STORE_KEY_EXAMS));
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  },
  saveAll(list) { localStorage.setItem(STORE_KEY_EXAMS, JSON.stringify(list)); },
  get(id) { return this.getAll().find(e => e.id === id); },
  add(exam) { const l = this.getAll(); l.push(exam); this.saveAll(l); },
  update(id, patch) {
    const l = this.getAll();
    const i = l.findIndex(e => e.id === id);
    if (i >= 0) { l[i] = Object.assign({}, l[i], patch); this.saveAll(l); }
  },
  remove(id) { this.saveAll(this.getAll().filter(e => e.id !== id)); }
};

function generateEvents(tplKey, examDate) {
  const tpl = EXAM_TEMPLATES[tplKey];
  if (!tpl) return [];
  const base = new Date(examDate + 'T00:00:00').getTime();
  return tpl.events.map((e, i) => ({
    id: 'ev_' + Date.now() + '_' + i,
    title: e.title,
    date: dateStrFromTs(base + e.offset * 86400000),
    isCustom: false
  }));
}

function daysBetween(dateStr) {
  const today = new Date(getTodayStr() + 'T00:00:00');
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target - today) / 86400000);
}

/* ============================================================
   首页考试卡片渲染
   ============================================================ */
function renderExamCards() {
  const box = $('exam-cards');
  const exams = ExamStore.getAll();

  // 顶部 badge
  const badge = $('header-badge');
  if (exams.length === 0) {
    badge.textContent = '还没有考试，点下方添加';
  } else if (exams.length === 1) {
    const d = daysBetween(exams[0].date);
    badge.textContent = exams[0].name + ' · ' + (d >= 0 ? '还有 ' + d + ' 天' : '已结束');
  } else {
    badge.textContent = exams.length + ' 场考试进行中';
  }

  if (!exams.length) {
    box.innerHTML = '<div class="card"><div class="empty-tip">还没有考试<br>点下方按钮添加第一场吧 ☝️</div></div>';
    return;
  }

  const todayStr = getTodayStr();
  box.innerHTML = exams.map(ex => {
    const d = daysBetween(ex.date);
    const color = ex.color || EXAM_COLORS[0];
    const dateLabel = new Date(ex.date + 'T00:00:00');
    const dateStr = dateLabel.getFullYear() + '年' + (dateLabel.getMonth() + 1) + '月' + dateLabel.getDate() + '日';

    let countdownHtml = '';
    if (d > 0) {
      countdownHtml = '<div class="countdown-grid">' +
        '<div class="countdown-item"><div class="countdown-num" data-exam-id="' + ex.id + '" data-unit="d">--</div><div class="countdown-label">天</div></div>' +
        '<div class="countdown-item"><div class="countdown-num" data-exam-id="' + ex.id + '" data-unit="h">--</div><div class="countdown-label">时</div></div>' +
        '<div class="countdown-item"><div class="countdown-num" data-exam-id="' + ex.id + '" data-unit="m">--</div><div class="countdown-label">分</div></div>' +
        '<div class="countdown-item"><div class="countdown-num" data-exam-id="' + ex.id + '" data-unit="s">--</div><div class="countdown-label">秒</div></div>' +
        '</div>';
    } else if (d === 0) {
      countdownHtml = '<div style="text-align:center; padding:16px 0; font-size:18px; font-weight:700; color:' + color + ';">🎯 就是今天！</div>';
    } else {
      countdownHtml = '<div style="text-align:center; padding:16px 0; font-size:14px; color:var(--text-light);">已结束 ' + Math.abs(d) + ' 天</div>';
    }

    // 找最近的一个节点（未来 30 天内）
    let alertHtml = '';
    if (Array.isArray(ex.events) && ex.events.length) {
      const upcoming = ex.events
        .map(ev => ({ ev: ev, d: daysBetween(ev.date) }))
        .filter(x => x.d >= 0 && x.d <= 30)
        .sort((a, b) => a.d - b.d);
      if (upcoming.length) {
        const u = upcoming[0];
        const cls = u.d === 0 ? '' : ' month';
        const prefix = u.d === 0 ? '📌 今天：' : '📌 本月：';
        const suffix = u.d === 0 ? '' : '（' + u.d + '天后）';
        alertHtml = '<div class="exam-card-alert' + cls + '">' + prefix + escapeHtml(u.ev.title) + suffix + '</div>';
      }
    }

    const nodeCount = Array.isArray(ex.events) ? ex.events.length : 0;
    const nodeHtml = nodeCount
      ? '<div class="exam-card-node-count">📅 共 ' + nodeCount + ' 个关键节点</div>'
      : '';

    return '<div class="exam-card">' +
      '<div class="exam-card-head">' +
        '<span class="exam-card-dot" style="background:' + color + '"></span>' +
        '<span class="exam-card-name">' + escapeHtml(ex.name) + '</span>' +
        '<div class="exam-card-actions">' +
          '<button class="exam-card-iconbtn" onclick="openExamModal(\'' + ex.id + '\')" title="编辑">✎</button>' +
        '</div>' +
      '</div>' +
      '<div class="exam-card-date">' + dateStr + (d >= 0 ? ' · 还有 ' + d + ' 天' : '') + '</div>' +
      countdownHtml +
      alertHtml +
      nodeHtml +
      '</div>';
  }).join('');
}

/* 每秒刷新所有考试卡片的倒计时 */
function tickAllCountdowns() {
  const exams = ExamStore.getAll();
  exams.forEach(ex => {
    const target = new Date(ex.date + 'T00:00:00').getTime();
    let diff = target - Date.now();
    if (diff < 0) return;
    const days = Math.floor(diff / 86400000); diff -= days * 86400000;
    const hours = Math.floor(diff / 3600000); diff -= hours * 3600000;
    const mins = Math.floor(diff / 60000); diff -= mins * 60000;
    const secs = Math.floor(diff / 1000);
    const set = (unit, val) => {
      const el = document.querySelector('[data-exam-id="' + ex.id + '"][data-unit="' + unit + '"]');
      if (el) el.textContent = val;
    };
    set('d', days);
    set('h', String(hours).padStart(2, '0'));
    set('m', String(mins).padStart(2, '0'));
    set('s', String(secs).padStart(2, '0'));
  });
}
setInterval(tickAllCountdowns, 1000);

/* ============================================================
   考试模态框
   ============================================================ */
let editingExamId = null;
let pickingTpl = 'custom';

function openExamModal(id) {
  editingExamId = id;
  const modal = $('exam-modal');
    if (id) {
    const ex = ExamStore.get(id);
    if (!ex) return;
    $('exam-modal-title').textContent = '编辑考试';
    $('exam-name').value = ex.name;
    $('exam-date').value = ex.date;
    $('exam-tpl-field').style.display = 'none';
    $('exam-delete-btn').style.display = '';       // ← 新增
  } else {
    $('exam-modal-title').textContent = '添加考试';
    $('exam-name').value = '';
    $('exam-date').value = getTodayStr();
    $('exam-tpl-field').style.display = '';
    $('exam-delete-btn').style.display = 'none';   // ← 新增
    pickingTpl = 'custom';
  }
  renderTplChips();
  modal.classList.add('show');
  setTimeout(() => $('exam-name').focus(), 100);
}

function renderTplChips() {
  document.querySelectorAll('#tpl-grid .tpl-chip').forEach(chip => {
    chip.classList.toggle('selected', chip.dataset.tpl === pickingTpl);
  });
  const tpl = EXAM_TEMPLATES[pickingTpl];
  const hint = $('tpl-hint');
  if (tpl && tpl.events.length) {
    hint.textContent = '将自动生成 ' + tpl.events.length + ' 个节点，保存后可逐条编辑。';
  } else {
    hint.textContent = '不生成节点，保存后可手动添加。';
  }
}

document.querySelectorAll('#tpl-grid .tpl-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    pickingTpl = chip.dataset.tpl;
    renderTplChips();
  });
});

function closeExamModal() {
  $('exam-modal').classList.remove('show');
  editingExamId = null;
}

function saveExamModal() {
  const name = $('exam-name').value.trim();
  const date = $('exam-date').value;
  if (!name) { showToast('请输入考试名称'); return; }
  if (!date) { showToast('请选择考试日期'); return; }

  if (editingExamId) {
    const old = ExamStore.get(editingExamId);
    const patch = { name: name, date: date };
    // 日期变了，按比例平移所有节点
    if (old.date !== date && Array.isArray(old.events)) {
      const oldBase = new Date(old.date + 'T00:00:00').getTime();
      const newBase = new Date(date + 'T00:00:00').getTime();
      const deltaDays = Math.round((newBase - oldBase) / 86400000);
      patch.events = old.events.map(ev => {
        const evTime = new Date(ev.date + 'T00:00:00').getTime() + deltaDays * 86400000;
        return Object.assign({}, ev, { date: dateStrFromTs(evTime) });
      });
    }
    ExamStore.update(editingExamId, patch);
    showToast('✅ 已更新「' + name + '」');
  } else {
    const list = ExamStore.getAll();
    const color = EXAM_COLORS[list.length % EXAM_COLORS.length];
    const events = generateEvents(pickingTpl, date);
    ExamStore.add({
      id: 'exam_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      name: name,
      date: date,
      color: color,
      events: events
    });
    const tplName = EXAM_TEMPLATES[pickingTpl] ? EXAM_TEMPLATES[pickingTpl].name : '自定义';
    showToast('➕ 已添加「' + name + '」' + (events.length ? ' · 生成 ' + events.length + ' 个节点' : ''));
  }

  closeExamModal();
  renderExamCards();
  renderTimeline();
  renderHomeAlerts();
  updateHomeOverview();
  CloudSync.pushExams()
}

function deleteExam() {
  if (!editingExamId) return;
  const ex = ExamStore.get(editingExamId);
  if (!ex) return;
  if (!confirm('确定要删除「' + ex.name + '」吗？\n该考试的所有节点也会一起删除。学习记录不受影响。')) return;
  ExamStore.remove(editingExamId);
  closeExamModal();
  renderExamCards();
  renderTimeline();
  renderHomeAlerts();
  updateHomeOverview();
  showToast('🗑️ 已删除「' + ex.name + '」');
  CloudSync.pushExams()
}

$('exam-modal').addEventListener('click', e => {
  if (e.target === $('exam-modal')) closeExamModal();
});


/* 渲染一条语录 */
let currentQuoteIndex = -1;

function pickQuoteIndex() {
  const total = QUOTE_LIBRARY.length;
  if (total === 1) return 0;
  let idx;
  do { idx = Math.floor(Math.random() * total); }
  while (idx === currentQuoteIndex);
  return idx;
}

function renderQuote(q, animate) {
  const textEl = $('quote-text');
  const tagEl = $('quote-tag');
  const srcEl = $('quote-source');

  const apply = () => {
    tagEl.textContent = QUOTE_TYPE_LABEL[q.type] || '';
    let html = escapeHtml(q.text);
    if (q.trans) html += '<span class="q-trans">' + escapeHtml(q.trans) + '</span>';
    textEl.innerHTML = html;
    srcEl.textContent = q.source ? '— ' + q.source : '';
    if (animate) {
      textEl.style.transition = 'opacity 0.3s';
      textEl.style.opacity = 1;
    }
  };

  if (animate) {
    textEl.style.opacity = 0;
    setTimeout(apply, 200);
  } else {
    apply();
  }
}

function nextQuote() {
  currentQuoteIndex = pickQuoteIndex();
  renderQuote(QUOTE_LIBRARY[currentQuoteIndex], true);
}

(function initQuote() {
  currentQuoteIndex = pickQuoteIndex();
  renderQuote(QUOTE_LIBRARY[currentQuoteIndex], false);
})();

/* ============================================================
   日记
   ============================================================ */
let currentDiaryDate = getTodayStr();
let selectedMood = '';
$('diary-date').value = currentDiaryDate;

document.querySelectorAll('.mood-emoji').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mood-emoji').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedMood = btn.dataset.mood;
  });
});

function getDiaryKey(date) { return 'diary_' + date; }

function loadDiary() {
  currentDiaryDate = $('diary-date').value || getTodayStr();
  let data = null;
  try { data = JSON.parse(localStorage.getItem(getDiaryKey(currentDiaryDate)) || 'null'); } catch (e) { data = null; }
  document.querySelectorAll('.mood-emoji').forEach(b => b.classList.remove('selected'));
  if (data && data.mood) {
    selectedMood = data.mood;
    const btn = document.querySelector('.mood-emoji[data-mood="' + data.mood + '"]');
    if (btn) btn.classList.add('selected');
  } else {
    selectedMood = '';
  }
  $('diary-content').value = data ? (data.content || '') : '';
  renderCalendar();
}

function saveDiary() {
  const content = $('diary-content').value.trim();
  if (!content && !selectedMood) { showToast('写点什么再保存吧～'); return; }
  localStorage.setItem(getDiaryKey(currentDiaryDate), JSON.stringify({ mood: selectedMood, content: content }));
  showToast('💚 日记已保存');
  renderCalendar();
  updateHomeOverview();
  CloudSync.pushDiary(currentDiaryDate)
}

function navigateDate(delta) {
  const d = new Date(currentDiaryDate + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  currentDiaryDate = dateStrFromTs(d.getTime());
  $('diary-date').value = currentDiaryDate;
  loadDiary();
}

/* ============================================================
   日历
   ============================================================ */
let calYear, calMonth;
(function initCalendar() {
  const now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth();
})();

function renderCalendar() {
  const grid = $('calendar-grid');
  const todayStr = getTodayStr();
  $('cal-title').textContent = calYear + '年' + (calMonth + 1) + '月';
  let html = '';
  ['日', '一', '二', '三', '四', '五', '六'].forEach(w => {
    html += '<div class="calendar-weekday">' + w + '</div>';
  });
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(calYear, calMonth, 0).getDate();
  for (let i = firstDay - 1; i >= 0; i--) {
    html += '<div class="calendar-day other-month">' + (daysInPrevMonth - i) + '</div>';
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = calYear + '-' + String(calMonth + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    let classes = 'calendar-day';
    if (dateStr === todayStr) classes += ' today';
    if (localStorage.getItem(getDiaryKey(dateStr))) classes += ' has-diary';
    html += '<div class="' + classes + '" onclick="jumpToDiary(\'' + dateStr + '\')">' + d + '</div>';
  }
  const total = firstDay + daysInMonth;
  const remain = (7 - total % 7) % 7;
  for (let d = 1; d <= remain; d++) {
    html += '<div class="calendar-day other-month">' + d + '</div>';
  }
  grid.innerHTML = html;
}

function changeMonth(delta) {
  calMonth += delta;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  if (calMonth > 11) { calMonth = 0; calYear++; }
  renderCalendar();
}

function jumpToDiary(dateStr) {
  currentDiaryDate = dateStr;
  $('diary-date').value = dateStr;
  loadDiary();
  const card = document.querySelector('#tab-diary .card');
  if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ============================================================
   计时器
   ============================================================ */
const DEFAULT_TIMER = { startTime: null, running: false, subject: null, elapsed: 0 };

function getTimerState() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem('timer_state')); } catch (e) { s = null; }
  if (!s || typeof s !== 'object') s = {};
  return {
    startTime: s.startTime || null,
    running: !!s.running,
    subject: s.subject || null,
    elapsed: typeof s.elapsed === 'number' ? s.elapsed : 0
  };
}
function setTimerState(s) { localStorage.setItem('timer_state', JSON.stringify(s)); }

function getSessionElapsed() {
  const s = getTimerState();
  let t = s.elapsed || 0;
  if (s.running && s.startTime) t += Math.floor((Date.now() - s.startTime) / 1000);
  return t;
}

function updateTimerUI() {
  const s = getTimerState();
  const elapsed = getSessionElapsed();
  $('timer-display').textContent = formatDuration(elapsed);
  const startBtn = $('timer-btn-start');
  const pauseBtn = $('timer-btn-pause');
  const stopBtn = $('timer-btn-stop');
  const subjSel = $('timer-subject');

  if (s.running) {
    startBtn.style.display = 'none';
    pauseBtn.style.display = '';
    pauseBtn.classList.add('running');
    stopBtn.style.display = '';
    $('timer-label').textContent = (s.subject || '未选科目') + ' · 计时中';
    subjSel.disabled = true;
    if (s.subject) subjSel.value = s.subject;
  } else if (elapsed > 0) {
    startBtn.style.display = '';
    startBtn.textContent = '继续计时';
    pauseBtn.style.display = 'none';
    pauseBtn.classList.remove('running');
    stopBtn.style.display = '';
    $('timer-label').textContent = (s.subject || '未选科目') + ' · 已暂停';
    subjSel.disabled = false;
    if (s.subject) subjSel.value = s.subject;
  } else {
    startBtn.style.display = '';
    startBtn.textContent = '开始计时';
    pauseBtn.style.display = 'none';
    pauseBtn.classList.remove('running');
    stopBtn.style.display = 'none';
    $('timer-label').textContent = '未开始';
    subjSel.disabled = false;
  }
}

function startTimer() {
  let s = getTimerState();
  if (s.running) return;
  const today = getTodayStr();
  if (dayTotal(STORE.getDay(today)) >= DAILY_MAX_HOURS * 3600) {
    showToast('🛑 今日已达 ' + DAILY_MAX_HOURS + ' 小时上限，请好好休息');
    return;
  }
  const subj = $('timer-subject').value;
  if (!subj) { showToast('请先在「科目」中添加科目'); return; }
  if (s.elapsed > 0 && s.subject && s.subject !== subj) {
    s.elapsed = 0; // 换了科目，会话重新开始计数
  }
  s.subject = subj;
  s.startTime = Date.now();
  s.running = true;
  setTimerState(s);
  localStorage.setItem('timer_hb', String(Date.now()));
  updateTimerUI();
  showToast('⏱️ 开始学习「' + subj + '」！');
}

function pauseTimer() {
  const s = getTimerState();
  if (!s.running || !s.startTime) return;
  const delta = Math.floor((Date.now() - s.startTime) / 1000);
  let added = 0;
  if (delta > 0) {
    added = STORE.addSeconds(getTodayStr(), s.subject, delta);
    s.elapsed = (s.elapsed || 0) + added;
  }
  s.startTime = null;
  s.running = false;
  setTimerState(s);
  updateTimerUI();
  renderTodaySubjects();
  updateStats();
  if (added < delta) {
    showToast('🛑 今日已达上限，超出部分未记录');
  } else {
    showToast('⏸️ 已暂停，时长已记录');
  }
  checkDailyLimit(getTodayStr());
}

function stopTimer() {
  const s = getTimerState();
  let added = 0;
  let attempted = 0;
  if (s.running && s.startTime) {
    attempted = Math.floor((Date.now() - s.startTime) / 1000);
    if (attempted > 0) added = STORE.addSeconds(getTodayStr(), s.subject, attempted);
  }
  const subj = s.subject;
  setTimerState({ startTime: null, running: false, subject: null, elapsed: 0 });
  updateTimerUI();
  renderTodaySubjects();
  updateStats();
  drawLineChart();
  updateHomeOverview();
  if (subj) {
    if (added < attempted && attempted > 0) {
      showToast('🛑 今日已达上限，超出部分未记录');
    } else {
      showToast('✅ 已记录到「' + subj + '」');
    }
  }
  checkDailyLimit(getTodayStr());
  checkRecord();
  const newAch = checkAchievements();
  renderAchievements();
  if (newAch.length) {
    setTimeout(() => {
      showToast('🏅 解锁成就：' + newAch[0].title);
    }, 1200);
  }
  CloudSync.pushStudyDay(getTodayStr())
}

// 每秒刷新显示
setInterval(() => {
  const s = getTimerState();
  if (s.running) {
    $('timer-display').textContent = formatDuration(getSessionElapsed());
  }
}, 1000);

// 心跳同步（每 10 秒）
function timerSync() {
  const s = getTimerState();
  if (!s.running || !s.startTime) return;

  const now = Date.now();
  const lastHb = parseInt(localStorage.getItem('timer_hb') || '0', 10);
  let endTime = now;
  let shouldStop = false;

  // 页面长时间未活动（>90s），认为计时已中断
  if (lastHb && (now - lastHb) > 90000) {
    endTime = lastHb;
    shouldStop = true;
  }

  if (endTime < s.startTime) { endTime = s.startTime; }

  const today = getTodayStr();
  const startOfToday = new Date(today + 'T00:00:00').getTime();

  // 跨天处理
  if (s.startTime < startOfToday) {
    const boundary = Math.min(endTime, startOfToday);
    const secYesterday = Math.floor((boundary - s.startTime) / 1000);
    if (secYesterday > 0) {
      STORE.addSeconds(dateStrFromTs(s.startTime), s.subject, secYesterday);
    }
    s.startTime = startOfToday;
    if (endTime <= startOfToday) {
      // 全部时段都在昨天
      s.running = false;
      s.startTime = null;
      s.elapsed = 0;
      s.subject = null;
      setTimerState(s);
      updateTimerUI();
      renderTodaySubjects();
      updateStats();
      drawLineChart();
      showToast('📅 已跨天，昨天的时长已自动记录');
      return;
    }
  }

  const delta = Math.floor((endTime - s.startTime) / 1000);
  if (delta > 0) {
    const added = STORE.addSeconds(today, s.subject, delta);
    s.elapsed = (s.elapsed || 0) + added;
    s.startTime = endTime;
    // 达到上限：自动停止计时
    if (added < delta) {
      s.running = false;
      s.startTime = null;
      s.elapsed = 0;
      s.subject = null;
      setTimerState(s);
      updateTimerUI();
      renderTodaySubjects();
      updateStats();
      drawLineChart();
      showToast('🛑 今日已达上限，计时已自动停止，请好好休息');
      return;
    }
  }

  if (shouldStop) {
    s.running = false;
    s.startTime = null;
    s.elapsed = 0;
    s.subject = null;
    setTimerState(s);
    updateTimerUI();
    renderTodaySubjects();
    updateStats();
    drawLineChart();
    showToast('⏸️ 检测到页面关闭，计时已自动结束');
    return;
  }

  setTimerState(s);
  localStorage.setItem('timer_hb', String(Date.now()));
}
setInterval(timerSync, 10000);

// 页面隐藏时立即同步
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') timerSync();
});

/* ============================================================
   手动补录
   ============================================================ */
function manualAddDuration() {
  const subj = $('manual-subject').value;
  const dateStr = $('manual-date').value || getTodayStr();
  const h = parseInt($('manual-hours').value, 10) || 0;
  const m = parseInt($('manual-mins').value, 10) || 0;
  const total = h * 3600 + m * 60;
  if (total <= 0) { showToast('请输入大于 0 的时长'); return; }
  if (!subj) { showToast('请先添加科目'); return; }
  if (total > MANUAL_SINGLE_MAX_HOURS * 3600) {
    showToast('⚠️ 单次补录不能超过 ' + MANUAL_SINGLE_MAX_HOURS + ' 小时，请检查输入');
    return;
  }
  const added = STORE.addSeconds(dateStr, subj, total);
  $('manual-hours').value = '';
  $('manual-mins').value = '';
  if (added < total) {
    showToast('⚠️ 已记录 ' + formatDurationHM(added) + '，当日剩余额度不足，超出部分未记录');
  } else {
    showToast('✏️ 已为「' + subj + '」补录 ' + formatDurationHM(total));
  }
  renderTodaySubjects();
  updateStats();
  drawLineChart();
  updateHomeOverview();
  if (currentSubjectName === subj) renderSubjectDetail();
  checkDailyLimit(dateStr);
  const newAch = checkAchievements();
  renderAchievements();
  if (newAch.length) {
    setTimeout(() => {
      showToast('🏅 解锁成就：' + newAch[0].title);
    }, 1200);
  }
  CloudSync.pushStudyDay(dateStr)
}

/* ============================================================
   科目管理 CRUD
   ============================================================ */
let editingSubjectId = null;
let pickingColor = COLORS[0];

function fillSubjectSelects() {
  const subs = STORE.getSubjects();
  const opts = subs.map(s => '<option value="' + escapeAttr(s.name) + '">' + escapeHtml(s.name) + '</option>').join('');

  const ts = $('timer-subject');
  const curT = ts.value;
  ts.innerHTML = opts || '<option value="">（暂无科目）</option>';
  if (subs.some(s => s.name === curT)) ts.value = curT;

  const ms = $('manual-subject');
  const curM = ms.value;
  ms.innerHTML = opts || '<option value="">（暂无科目）</option>';
  if (subs.some(s => s.name === curM)) ms.value = curM;
}

function subjectTotalSeconds(name) {
  let total = 0;
  getAllStudyDates().forEach(d => {
    const day = STORE.getDay(d);
    const s = day.subjects[name];
    if (s && s.seconds) total += s.seconds;
  });
  return total;
}

function renderSubjectList() {
  const subs = STORE.getSubjects();
  const box = $('subject-list');
  if (!subs.length) {
    box.innerHTML = '<div class="empty-tip">还没有科目，点下方按钮添加吧～</div>';
    return;
  }
  box.innerHTML = subs.map(s => {
    const t = subjectTotalSeconds(s.name);
    return '<div class="subject-item" onclick="openSubjectDetail(\'' + escapeAttr(s.name) + '\')">' +
      '<span class="subject-dot" style="background:' + s.color + '"></span>' +
      '<span class="subject-item-name">' + escapeHtml(s.name) + '</span>' +
      '<span class="subject-item-time">' + formatDurationHM(t) + '</span>' +
      '<button class="subject-item-edit" onclick="event.stopPropagation();openSubjectModal(\'' + s.id + '\')" title="编辑">✎</button>' +
      '</div>';
  }).join('');
}

function openSubjectModal(id) {
  editingSubjectId = id;
  const subs = STORE.getSubjects();
  if (id) {
    const s = subs.find(x => x.id === id);
    if (!s) return;
    $('modal-title').textContent = '编辑科目';
    $('modal-name').value = s.name;
    pickingColor = s.color;
  } else {
    $('modal-title').textContent = '添加科目';
    $('modal-name').value = '';
    pickingColor = COLORS[subs.length % COLORS.length];
  }
  renderColorPicker();
  $('subject-modal').classList.add('show');
  setTimeout(() => $('modal-name').focus(), 100);
}

function renderColorPicker() {
  $('color-picker').innerHTML = COLORS.map(c =>
    '<div class="color-chip' + (c === pickingColor ? ' selected' : '') + '" style="background:' + c + '" onclick="pickColor(\'' + c + '\')"></div>'
  ).join('');
}

function pickColor(c) {
  pickingColor = c;
  renderColorPicker();
}

function closeSubjectModal() {
  $('subject-modal').classList.remove('show');
  editingSubjectId = null;
}

function saveSubjectModal() {
  const name = $('modal-name').value.trim();
  if (!name) { showToast('请输入科目名称'); return; }
  if (name.length > 20) { showToast('科目名称太长啦'); return; }

  const subs = STORE.getSubjects();

  if (editingSubjectId) {
    const s = subs.find(x => x.id === editingSubjectId);
    if (!s) return;
    const oldName = s.name;
    if (oldName !== name && subs.some(x => x.name === name && x.id !== editingSubjectId)) {
      showToast('已存在同名科目'); return;
    }
    if (oldName !== name) renameSubjectData(oldName, name);
    s.name = name;
    s.color = pickingColor;
    STORE.setSubjects(subs);
    showToast('✅ 已更新「' + name + '」');
  } else {
    if (subs.some(x => x.name === name)) { showToast('已存在同名科目'); return; }
    subs.push({ id: 'sub_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), name: name, color: pickingColor });
    STORE.setSubjects(subs);
    showToast('➕ 已添加「' + name + '」');
  }

  closeSubjectModal();
  fillSubjectSelects();
  renderSubjectList();
  renderTodaySubjects();
  updateHomeOverview();
  if (currentSubjectName) renderSubjectDetail();
  CloudSync.pushSubjects()
}

function renameSubjectData(oldName, newName) {
  getAllStudyDates().forEach(d => {
    const day = STORE.getDay(d);
    const old = day.subjects[oldName];
    if (!old) return;
    if (day.subjects[newName]) {
      day.subjects[newName].seconds = (day.subjects[newName].seconds || 0) + (old.seconds || 0);
      day.subjects[newName].logs = (day.subjects[newName].logs || []).concat(old.logs || []);
    } else {
      day.subjects[newName] = old;
    }
    delete day.subjects[oldName];
    STORE.setDay(d, day);
  });
}

// 模态框关闭交互
$('subject-modal').addEventListener('click', e => {
  if (e.target === $('subject-modal')) closeSubjectModal();
});
$('modal-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') saveSubjectModal();
});

/* ============================================================
   科目详情页
   ============================================================ */
let currentSubjectName = null;

function openSubjectDetail(name) {
  currentSubjectName = name;
  renderSubjectDetail();
  $('subject-page').classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeSubjectPage() {
  $('subject-page').classList.remove('show');
  document.body.style.overflow = '';
  currentSubjectName = null;
  renderSubjectList();
  renderTodaySubjects();
  updateStats();
  drawLineChart();
  updateHomeOverview();
}

/* ============================================================
   设置页
   ============================================================ */
async function openSettings() {
  $('settings-page').classList.add('show');
  document.body.style.overflow = 'hidden';
  const user = await getCurrentUser();
  if (user) {
    const { data } = await supabaseClient.from('profiles').select('show_in_ranking').eq('id', user.id).maybeSingle();
    const val = (data && data.show_in_ranking === false) ? false : true;
    renderRankingToggleBtn(val);
  }
}

function closeSettings() {
  $('settings-page').classList.remove('show');
  document.body.style.overflow = '';
}

async function toggleShowInRanking() {
  const user = await getCurrentUser();
  if (!user) return;
  const { data } = await supabaseClient
    .from('profiles')
    .select('show_in_ranking')
    .eq('id', user.id)
    .maybeSingle();

  const currentVal = (data && data.show_in_ranking === false) ? false : true;
  const targetVal = !currentVal;

  const { error } = await supabaseClient
    .from('profiles')
    .update({ show_in_ranking: targetVal })
    .eq('id', user.id);
  if (error) { showToast('保存失败：' + error.message); return; }

  renderRankingToggleBtn(targetVal);
  showToast(targetVal ? '✅ 已开启排行榜展示' : '✅ 已关闭，只出现在"也在努力的"');
}

function renderRankingToggleBtn(val) {
  const btn = document.getElementById('ranking-toggle-btn');
  if (!btn) return;
  if (val === false) {
    btn.textContent = '当前：不上榜（点我开启）';
    btn.style.background = '#FBE9E9';
    btn.style.color = '#E88A8A';
  } else {
    btn.textContent = '当前：上榜（点我关闭）';
    btn.style.background = '';
    btn.style.color = '';
  }
}

function closeSettings() {
  $('settings-page').classList.remove('show');
  document.body.style.overflow = '';
}

/* ============================================================
   排行榜
   ============================================================ */

function closeLeaderboard() {
  $('leaderboard-page').classList.remove('show');
  document.body.style.overflow = '';
}

// 从云端拉数据，聚合成榜单
async function loadAndRenderLeaderboard() {
  // 一次拉所有学习记录（只拿需要的字段）
  const { data: records, error } = await supabaseClient
    .from('study_records')
    .select('user_id, seconds');

  if (error) {
    $('leaderboard-body').innerHTML = '<div class="empty-tip">加载失败：' + escapeHtml(error.message) + '</div>';
    return;
  }

  // 按 user_id 累加总秒数
  const totals = {};
  (records || []).forEach(function(r) {
    if (!totals[r.user_id]) totals[r.user_id] = 0;
    totals[r.user_id] += (r.seconds || 0);
  });

  // 拉所有相关用户的资料
  const ids = Object.keys(totals);
  let profileMap = {};
  if (ids.length > 0) {
    const { data: profiles } = await supabaseClient
      .from('profiles')
      .select('id, nickname, avatar_emoji, avatar_color')
      .in('id', ids);
    (profiles || []).forEach(function(p) { profileMap[p.id] = p; });
  }

  // 合成榜单（低于 30 分钟不进榜）
  const MIN_SECONDS = 30 * 60;
  const list = ids.map(function(id) {
    const p = profileMap[id] || {};
    return {
      userId: id,
      total: totals[id],
      nickname: p.nickname || '神秘同学',
      emoji: p.avatar_emoji || '🍀',
      color: p.avatar_color || '#52B788'
    };
  }).filter(function(x) { return x.total >= MIN_SECONDS; });

  list.sort(function(a, b) { return b.total - a.total; });

  renderLeaderboardList(list);
}

// 渲染榜单列表
function renderLeaderboardList(list) {
  const box = $('leaderboard-body');
  if (!list.length) {
    box.innerHTML = '<div class="empty-tip">还没有人上榜<br>学习满 30 分钟就能上榜啦 ☝️</div>';
    return;
  }

  let html = '';
  list.forEach(function(item, i) {
    const rank = i + 1;
    let rankHtml;
    if (rank === 1) rankHtml = '<span style="font-size:24px;">🥇</span>';
    else if (rank === 2) rankHtml = '<span style="font-size:24px;">🥈</span>';
    else if (rank === 3) rankHtml = '<span style="font-size:24px;">🥉</span>';
    else rankHtml = '<span style="font-size:14px; color:var(--text-light); font-weight:700;">' + rank + '</span>';

    html += '<div class="card" style="display:flex; align-items:center; gap:12px; padding:14px 16px; margin-bottom:10px;">';
    html += '<div style="width:36px; text-align:center; flex-shrink:0;">' + rankHtml + '</div>';
    html += '<div style="width:44px; height:44px; border-radius:50%; background:' + item.color + '; display:flex; align-items:center; justify-content:center; font-size:22px; flex-shrink:0;">' + item.emoji + '</div>';
    html += '<div style="flex:1; min-width:0;">';
    html += '<div style="font-size:14px; font-weight:700; color:var(--text-deep); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + escapeHtml(item.nickname) + '</div>';
    html += '<div style="font-size:12px; color:var(--accent); font-weight:600; margin-top:2px;">' + formatDurationHM(item.total) + '</div>';
    html += '</div>';
    html += '</div>';
  });
  box.innerHTML = html;
}

/* ============================================================
   排行榜
   ============================================================ */
let lbCurrentPeriod = 'total';

function openLeaderboard() {
  $('leaderboard-page').classList.add('show');
  document.body.style.overflow = 'hidden';
  // 每次打开重置到总榜
  lbCurrentPeriod = 'total';
  document.querySelectorAll('#lb-range-tabs .range-tab').forEach(function(b) {
    b.classList.toggle('active', b.dataset.lb === 'total');
  });
  $('leaderboard-body').innerHTML = '<div class="empty-tip">加载中…</div>';
  loadAndRenderLeaderboard();
}

function closeLeaderboard() {
  $('leaderboard-page').classList.remove('show');
  document.body.style.overflow = '';
}

// 切换 日/周/月/总 时触发
document.querySelectorAll('#lb-range-tabs .range-tab').forEach(function(btn) {
  btn.addEventListener('click', function() {
    lbCurrentPeriod = btn.dataset.lb;
    document.querySelectorAll('#lb-range-tabs .range-tab').forEach(function(b) {
      b.classList.toggle('active', b === btn);
    });
    $('leaderboard-body').innerHTML = '<div class="empty-tip">加载中…</div>';
    loadAndRenderLeaderboard();
  });
});

async function loadAndRenderLeaderboard() {
  try {
  let query = supabaseClient.from('study_records').select('user_id, seconds, date');
  if (lbCurrentPeriod !== 'total') {
    const range = periodRange(lbCurrentPeriod, getTodayStr());
    query = query.gte('date', range.start).lte('date', range.end);
  }

  const { data: records, error } = await query;
  if (error) {
    $('leaderboard-body').innerHTML = '<div class="empty-tip">加载失败：' + escapeHtml(error.message) + '</div>';
    return;
  }

  const totals = {};
  (records || []).forEach(function(r) {
    if (!totals[r.user_id]) totals[r.user_id] = 0;
    totals[r.user_id] += (r.seconds || 0);
  });

  const ids = Object.keys(totals);
  const MIN_SECONDS = 30 * 60;
  const rankingList = [];
  const hiddenList = [];

  if (ids.length > 0) {
    const { data: profiles } = await supabaseClient
      .from('profiles')
      .select('id, nickname, avatar_emoji, avatar_color, avatar_url, role, show_in_ranking')
      .in('id', ids);

    (profiles || []).forEach(function(p) {
      const total = totals[p.id] || 0;
      if (total < MIN_SECONDS) return;

      const item = {
        userId: p.id,
        total: total,
        nickname: p.nickname || '神秘同学',
        emoji: p.avatar_emoji || '🍀',
        color: p.avatar_color || '#52B788',
        avatarUrl: p.avatar_url || ''
      };

      if (p.show_in_ranking === false) {
        hiddenList.push(item);
      } else {
        rankingList.push(item);
      }
    });
  }

  rankingList.sort(function(a, b) { return b.total - a.total; });
  hiddenList.sort(function(a, b) { return b.total - a.total; });
  renderLeaderboardList(rankingList, hiddenList);
  } catch (e) {
    $('leaderboard-body').innerHTML = '<div class="empty-tip">网络不好，稍后再试 ☹️</div>';
  }
}

function renderLeaderboardList(list, hiddenList) {
  const box = $('leaderboard-body');
  const emptyText = {
    total: '还没有人上榜',
    daily: '今天还没人上榜',
    weekly: '本周还没人上榜',
    monthly: '本月还没人上榜'
  };

  if (!list.length && !hiddenList.length) {
    box.innerHTML = '<div class="empty-tip">' + (emptyText[lbCurrentPeriod] || '还没有人上榜') + '<br>学习满 30 分钟就能上榜啦 ☝️</div>';
    return;
  }

  let html = '';
  const top3 = list.slice(0, 3);
  const rest = list.slice(3);
  const podiumOrder = [];
  if (top3[1]) podiumOrder.push({ item: top3[1], rank: 2, height: 70 });
  if (top3[0]) podiumOrder.push({ item: top3[0], rank: 1, height: 95 });
  if (top3[2]) podiumOrder.push({ item: top3[2], rank: 3, height: 60 });

  if (podiumOrder.length) {
    html += '<div style="display:flex; align-items:flex-end; justify-content:center; gap:10px; margin-bottom:20px;">';
    podiumOrder.forEach(function(p) {
      const it = p.item;
      html += '<div style="flex:1; max-width:110px; display:flex; flex-direction:column; align-items:center;">';
      html += renderAvatar(it, 48, 24);
      html += '<div style="font-size:12px; font-weight:700; color:var(--text-deep); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-bottom:2px; text-align:center; width:100%;">' + escapeHtml(it.nickname) + '</div>';
      html += '<div style="font-size:11px; color:var(--accent); font-weight:600; margin-bottom:6px; text-align:center; width:100%;">' + formatDurationHM(it.total) + '</div>';
      html += '<div style="height:' + p.height + 'px; width:100%; background:linear-gradient(135deg, var(--mint-light), var(--mint-very-light)); border-radius:10px 10px 0 0; display:flex; align-items:center; justify-content:center; font-size:22px;">';
      if (p.rank === 1) html += '🥇';
      else if (p.rank === 2) html += '🥈';
      else html += '🥉';
      html += '</div></div>';
    });
    html += '</div>';
  }

  rest.forEach(function(item, i) {
    const rank = i + 4;
    html += '<div class="card" style="display:flex; align-items:center; gap:12px; padding:12px 16px; margin-bottom:8px;">';
    html += '<div style="width:28px; text-align:center; font-size:13px; color:var(--text-light); font-weight:700;">' + rank + '</div>';
    html += renderAvatar(item, 36, 18);
    html += '<div style="flex:1; min-width:0;">';
    html += '<div style="font-size:13px; font-weight:600; color:var(--text-deep); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + escapeHtml(item.nickname) + '</div>';
    html += '<div style="font-size:11px; color:var(--accent); font-weight:600; margin-top:2px;">' + formatDurationHM(item.total) + '</div>';
    html += '</div></div>';
  });

  if (hiddenList.length) {
    html += '<div style="margin-top:22px; padding-top:16px; border-top:1px dashed rgba(82,183,136,0.35); text-align:center;">';
    html += '<div style="font-size:11px; color:var(--text-light); margin-bottom:10px;">—— 也在努力的 ——</div>';
    hiddenList.forEach(function(it) {
      html += '<div style="display:inline-flex; align-items:center; gap:10px; padding:10px 16px; background:rgba(255,255,255,0.5); border-radius:999px; margin:4px;">';
      html += renderAvatar(it, 34, 17);
      html += '<div style="text-align:left;">';
      html += '<div style="font-size:13px; font-weight:700; color:var(--text-deep);">' + escapeHtml(it.nickname) + '</div>';
      html += '<div style="font-size:11px; color:var(--accent); font-weight:600;">' + formatDurationHM(it.total) + '</div>';
      html += '</div></div>';
    });
    html += '</div>';
  }

  box.innerHTML = html;
}

// 头像渲染小助手（图片优先，没图片用 emoji）
function renderAvatar(item, size, fontSize) {
  if (item.avatarUrl) {
    return '<div style="width:' + size + 'px; height:' + size + 'px; border-radius:50%; overflow:hidden; flex-shrink:0;"><img src="' + item.avatarUrl + '" style="width:100%; height:100%; object-fit:cover;"></div>';
  }
  return '<div style="width:' + size + 'px; height:' + size + 'px; border-radius:50%; background:' + (item.color || '#52B788') + '; display:flex; align-items:center; justify-content:center; font-size:' + fontSize + 'px; flex-shrink:0;">' + (item.emoji || '🍀') + '</div>';
}

function getSubjectHistory(name) {
  const result = [];
  getAllStudyDates().forEach(d => {
    const day = STORE.getDay(d);
    const sub = day.subjects[name];
    if (!sub) return;
    const secs = sub.seconds || 0;
    const logs = Array.isArray(sub.logs) ? sub.logs : [];
    if (secs > 0 || logs.length > 0) {
      result.push({ date: d, seconds: secs, logs: logs });
    }
  });
  result.sort((a, b) => b.date.localeCompare(a.date));
  return result;
}

function renderSubjectDetail() {
  const name = currentSubjectName;
  if (!name) return;
  const subs = STORE.getSubjects();
  const sub = subs.find(s => s.name === name);
  const color = sub ? sub.color : '#52B788';

  $('sp-title').textContent = name;
  $('sp-title').style.color = color;

  const history = getSubjectHistory(name);
  const totalSec = history.reduce((a, h) => a + h.seconds, 0);

  let html = '';
  html += '<div class="sp-summary">';
  html += '<div class="sp-total">' + formatDurationHM(totalSec) + '</div>';
  html += '<div class="sp-sub">累计学习时长 · 共 ' + history.length + ' 天有记录</div>';
  html += '</div>';

  // 今天快速记录
  html += '<div class="log-day">';
  html += '<div class="log-day-head"><span class="log-day-date">📝 记录今天做了什么</span></div>';
  html += '<div class="log-add-row">';
  html += '<input type="text" id="sp-quick-input" placeholder="例如：背了 50 个单词..." maxlength="200">';
  html += '<button onclick="quickAddLog()">添加</button>';
  html += '</div></div>';

  if (!history.length) {
    html += '<div class="card"><div class="empty-tip">这个科目还没有任何记录～<br>用计时器开始学习，或手动补录时长吧</div></div>';
  } else {
    history.forEach(h => {
      html += '<div class="log-day">';
      html += '<div class="log-day-head">';
      html += '<span class="log-day-date">' + fmtDateLabel(h.date) + '</span>';
      html += '<span class="log-day-dur">' + formatDurationHM(h.seconds) + '</span>';
      html += '</div>';

      if (h.logs.length) {
        html += '<ul class="log-list">';
        h.logs.forEach((log, i) => {
          html += '<li class="log-item">';
          html += '<span class="log-dot" style="background:' + color + '"></span>';
          html += '<span class="log-text">' + escapeHtml(log.text) + '</span>';
          html += '<button class="log-del" onclick="deleteLogItem(\'' + h.date + '\',' + i + ')">×</button>';
          html += '</li>';
        });
        html += '</ul>';
      }

      html += '<div class="log-add-row">';
      html += '<input type="text" id="log-input-' + h.date + '" placeholder="补充记录..." maxlength="200">';
      html += '<button onclick="addLogToDate(\'' + h.date + '\')">添加</button>';
      html += '</div>';

      html += '</div>';
    });
  }

  $('sp-body').innerHTML = html;
}

function quickAddLog() {
  const inp = $('sp-quick-input');
  const text = inp.value.trim();
  if (!text) { showToast('写点什么吧～'); return; }
  STORE.addLog(getTodayStr(), currentSubjectName, text);
  inp.value = '';
  showToast('📝 已记录');
  renderSubjectDetail();
  CloudSync.pushStudyDay(getTodayStr());
}

function addLogToDate(dateStr) {
  const inp = $('log-input-' + dateStr);
  if (!inp) return;
  const text = inp.value.trim();
  if (!text) { showToast('写点什么吧～'); return; }
  STORE.addLog(dateStr, currentSubjectName, text);
  inp.value = '';
  showToast('📝 已记录');
  renderSubjectDetail();
  CloudSync.pushStudyDay(dateStr);
}

function deleteLogItem(dateStr, index) {
  STORE.deleteLog(dateStr, currentSubjectName, index);
  showToast('已删除该条记录');
  renderSubjectDetail();
  CloudSync.pushStudyDay(dateStr);
}

/* ============================================================
   今日科目明细
   ============================================================ */
function renderTodaySubjects() {
  const today = getTodayStr();
  const day = STORE.getDay(today);
  const subs = STORE.getSubjects();
  const box = $('today-subject-list');

  const items = [];
  subs.forEach(s => {
    const sd = day.subjects[s.name];
    if (sd && sd.seconds > 0) items.push({ name: s.name, color: s.color, secs: sd.seconds });
  });
  items.sort((a, b) => b.secs - a.secs);

  if (day.unassigned > 0) {
    items.push({ name: '未分类时长', color: '#C7D4CE', secs: day.unassigned, unassigned: true });
  }

  const total = dayTotal(day);
  $('today-total-label').textContent = '合计 ' + formatDurationHM(total);

  if (!items.length) {
    box.innerHTML = '<div class="empty-tip">今天还没有学习记录<br>点上方计时器开始吧 ☝️</div>';
    return;
  }

  box.innerHTML = items.map(it => {
    const click = it.unassigned ? '' : ' onclick="openSubjectDetail(\'' + escapeAttr(it.name) + '\')"';
    return '<div class="tsl-item"' + click + '>' +
      '<span class="tsl-dot" style="background:' + it.color + '"></span>' +
      '<span class="tsl-name">' + escapeHtml(it.name) + '</span>' +
      '<span class="tsl-time">' + formatDurationHM(it.secs) + '</span>' +
      (it.unassigned ? '' : '<span class="tsl-arrow">›</span>') +
      '</div>';
  }).join('');

    // 更新计时器卡片的今日进度
  const prog = $('today-progress');
  if (prog) {
    const day = STORE.getDay(getTodayStr());
    prog.textContent = formatDurationHM(dayTotal(day));
  }
}

/* ============================================================
   统计
   ============================================================ */
function updateStats() {
  const dates = getAllStudyDates();
  let totalSec = 0, maxRecord = 0, daysWithData = 0;
  dates.forEach(d => {
    const day = STORE.getDay(d);
    const dur = dayTotal(day);
    if (dur > 0) {
      totalSec += dur;
      daysWithData++;
      if (dur > maxRecord) maxRecord = dur;
    }
  });

  // 连续天数
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 400; i++) {
    const dd = new Date(today);
    dd.setDate(today.getDate() - i);
    const key = dateStrFromTs(dd.getTime());
    const day = STORE.getDay(key);
    if (dayTotal(day) > 0) { streak++; continue; }
    if (i === 0) continue;
    break;
  }

  $('stat-streak').textContent = streak;
  $('stat-total').textContent = Math.floor(totalSec / 3600) + 'h';
  $('stat-avg').textContent = daysWithData > 0 ? formatDurationHM(Math.floor(totalSec / daysWithData)) : '0h';
  $('stat-record').textContent = formatDurationHM(maxRecord);

  const todayTotal = dayTotal(STORE.getDay(getTodayStr()));
  const recordCard = $('stat-record-card');
  const existingBadge = recordCard.querySelector('.stat-badge');
  if (todayTotal > 0 && todayTotal >= maxRecord && maxRecord > 0 && daysWithData > 1) {
    if (!existingBadge) {
      const b = document.createElement('div');
      b.className = 'stat-badge';
      b.textContent = '🔥';
      recordCard.appendChild(b);
    }
  } else if (existingBadge) {
    existingBadge.remove();
  }
}

/* ============================================================
   首页概览
   ============================================================ */
function updateHomeOverview() {
  const today = getTodayStr();
  let diary = null;
  try { diary = JSON.parse(localStorage.getItem(getDiaryKey(today)) || 'null'); } catch (e) { diary = null; }
  $('home-diary').textContent = (diary && diary.content) ? '已写 ✓' : '未写';

  const day = STORE.getDay(today);
  $('home-duration').textContent = formatDurationHM(dayTotal(day));

  let cnt = 0;
  Object.keys(day.subjects).forEach(k => {
    if (day.subjects[k].seconds > 0) cnt++;
  });
  $('home-subject-count').textContent = cnt + ' 个';
}

/* ============================================================
   折线图
   ============================================================ */
let chartRange = 14;
let chartPoints = [];

document.querySelectorAll('#range-tabs .range-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#range-tabs .range-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    chartRange = btn.dataset.range === 'all' ? 'all' : parseInt(btn.dataset.range, 10);
    drawLineChart();
  });
});

function getChartData() {
  const result = [];
  const today = new Date();
  if (chartRange === 'all') {
    const dates = getAllStudyDates();
    let startStr;
    if (dates.length) {
      startStr = dates[0];
    } else {
      startStr = getTodayStr();
    }
    const start = new Date(startStr + 'T00:00:00');
    const diffDays = Math.floor((new Date(today.getFullYear(), today.getMonth(), today.getDate()) - start) / 86400000);
    const n = Math.max(1, diffDays + 1);
    // 点数太多时按周采样
    const step = n > 180 ? Math.ceil(n / 120) : 1;
    for (let i = n - 1; i >= 0; i -= step) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = dateStrFromTs(d.getTime());
      const day = STORE.getDay(dateStr);
      result.push({
        date: dateStr,
        label: (d.getMonth() + 1) + '/' + d.getDate(),
        hours: dayTotal(day) / 3600,
        seconds: dayTotal(day)
      });
    }
  } else {
    for (let i = chartRange - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = dateStrFromTs(d.getTime());
      const day = STORE.getDay(dateStr);
      result.push({
        date: dateStr,
        label: (d.getMonth() + 1) + '/' + d.getDate(),
        hours: dayTotal(day) / 3600,
        seconds: dayTotal(day)
      });
    }
  }
  return result;
}

function drawLineChart() {
  const canvas = $('chart-line');
  if (!canvas || canvas.offsetParent === null) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const W = rect.width || 300;
  const H = 200;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const padL = 36, padR = 12, padT = 22, padB = 30;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const data = getChartData();
  if (!data.length) return;

  const maxVal = Math.max(...data.map(d => d.hours), 1);
  const yMax = Math.max(1, Math.ceil(maxVal));

  // 网格
  ctx.strokeStyle = '#E8F8F5';
  ctx.lineWidth = 1;
  ctx.font = '10px -apple-system, sans-serif';
  ctx.fillStyle = '#7A9A8C';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const ySteps = 4;
  for (let i = 0; i <= ySteps; i++) {
    const y = padT + (chartH / ySteps) * i;
    const val = yMax - (yMax / ySteps) * i;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.stroke();
    ctx.fillText(val.toFixed(val < 10 ? 1 : 0) + 'h', padL - 4, y);
  }

  // 计算点
  const n = data.length;
  const points = data.map((d, i) => {
    const x = n === 1 ? padL + chartW / 2 : padL + (chartW / (n - 1)) * i;
    const y = padT + chartH - (Math.min(d.hours, yMax) / yMax) * chartH;
    return { x, y, hours: d.hours, seconds: d.seconds, date: d.date, label: d.label };
  });

  // 渐变填充
  const gradient = ctx.createLinearGradient(0, padT, 0, padT + chartH);
  gradient.addColorStop(0, 'rgba(152, 216, 200, 0.45)');
  gradient.addColorStop(1, 'rgba(152, 216, 200, 0.04)');
  ctx.beginPath();
  ctx.moveTo(points[0].x, padT + chartH);
  points.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(points[points.length - 1].x, padT + chartH);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // 折线
  ctx.beginPath();
  ctx.strokeStyle = '#52B788';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  points.forEach((p, i) => { i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); });
  ctx.stroke();

  // 找最高点
  let maxIdx = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].hours > points[maxIdx].hours) maxIdx = i;
  }

  // 数据点
  points.forEach((p, i) => {
    ctx.beginPath();
    if (i === maxIdx && p.hours > 0) {
      ctx.fillStyle = '#FFD93D';
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    } else {
      ctx.fillStyle = '#FFFFFF';
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.strokeStyle = (i === maxIdx && p.hours > 0) ? '#FFD93D' : '#52B788';
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  if (points[maxIdx].hours > 0) {
    const p = points[maxIdx];
    ctx.fillStyle = '#E0A800';
    ctx.font = 'bold 10px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('纪录', p.x, p.y - 12);
  }

  // X 轴标签
  ctx.fillStyle = '#7A9A8C';
  ctx.font = '9px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const maxLabels = 8;
  const skip = Math.max(1, Math.ceil(n / maxLabels));
  data.forEach((d, i) => {
    if (i % skip === 0 || i === n - 1) {
      const x = n === 1 ? padL + chartW / 2 : padL + (chartW / (n - 1)) * i;
      ctx.fillText(d.label, x, H - padB + 8);
    }
  });

  chartPoints = points;
}

// 悬停提示
(function setupChartHover() {
  const canvas = $('chart-line');
  const tooltip = $('tooltip-line');
  if (!canvas) return;
  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let nearest = null, minDist = 24;
    chartPoints.forEach(p => {
      const dist = Math.abs(p.x - x);
      if (dist < minDist) { minDist = dist; nearest = p; }
    });
    if (nearest) {
      tooltip.style.display = 'block';
      tooltip.style.left = nearest.x + 'px';
      tooltip.style.top = nearest.y + 'px';
      tooltip.textContent = nearest.label + ' · ' + formatDurationHM(nearest.seconds);
    } else {
      tooltip.style.display = 'none';
    }
  });
  canvas.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
})();

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(drawLineChart, 200);
});

/* ============================================================
   破纪录庆祝
   ============================================================ */
function checkRecord() {
  const todayTotal = dayTotal(STORE.getDay(getTodayStr()));
  let maxRecord = 0;
  getAllStudyDates().forEach(d => {
    if (d === getTodayStr()) return;
    const t = dayTotal(STORE.getDay(d));
    if (t > maxRecord) maxRecord = t;
  });
  if (todayTotal > maxRecord && todayTotal > 0 && maxRecord > 0) {
    showCelebration();
  }
}

function showCelebration() {
  const overlay = $('celebration');
  overlay.innerHTML = '<div class="celebration-text">🎉 新纪录！你比昨天更努力了！</div>';
  const colors = ['#98D8C8', '#7EC8A8', '#B5EAD7', '#52B788', '#FFD93D', '#E8F8F5'];
  for (let i = 0; i < 50; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = Math.random() * 100 + '%';
    c.style.background = colors[Math.floor(Math.random() * colors.length)];
    c.style.animationDelay = Math.random() * 0.5 + 's';
    c.style.animationDuration = (2 + Math.random() * 2) + 's';
    c.style.transform = 'rotate(' + Math.random() * 360 + 'deg)';
    overlay.appendChild(c);
  }
  overlay.classList.add('show');
  setTimeout(() => overlay.classList.remove('show'), 3500);
}

/* ============================================================
   成就系统（本地版）
   ============================================================ */
const ACH_STORE_KEY = 'achievements_list';
const ACH_TYPE_CODE = { daily: 'D', weekly: 'W', monthly: 'M', total: 'T', exam: 'E' };
const ACH_MEDAL = { daily: '☀️', weekly: '📅', monthly: '🌙', total: '🏆', exam: '🎓' };

const ACH_CONFIG = {
  daily:   { threshold: 4 * 3600,  reward: 1,  title: '单日专注',  desc: '单日学习满 4 小时' },
  weekly:  { threshold: 20 * 3600, reward: 5,  title: '一周坚持',  desc: '单周学习满 20 小时' },
  monthly: { threshold: 80 * 3600, reward: 10, title: '月度突破',  desc: '单月学习满 80 小时' },
  total:   { title: '累计里程碑', desc: '累计学习满若干小时' },
  exam:    { reward: 20, title: '考试结束', desc: '完成一场考试，辛苦了' }
};

/* ============================================================
   累计时长里程碑 · 配置区
   以后想改金额或加里程碑，只改下面这几行
   ============================================================ */
const TOTAL_MILESTONE_STEP = 100;        // 每多少小时算一个里程碑
const TOTAL_MILESTONE_BASE_REWARD = 10;  // 常规里程碑的金额
const TOTAL_MILESTONE_MAX_HOURS = 5000;  // 生成到多少小时（超过也会按 STEP 继续算）

// 特殊里程碑：写在这里的按这里的金额发，不写就按基准 10 元
const TOTAL_MILESTONE_OVERRIDES = {
  500:  20,
  1000: 50,
  1500: 20,
  2500: 50
};

function getMilestoneReward(hours) {
  return TOTAL_MILESTONE_OVERRIDES[hours] || TOTAL_MILESTONE_BASE_REWARD;
}

function getAllMilestones() {
  const list = [];
  for (let h = TOTAL_MILESTONE_STEP; h <= TOTAL_MILESTONE_MAX_HOURS; h += TOTAL_MILESTONE_STEP) {
    list.push({ hours: h, reward: getMilestoneReward(h) });
  }
  return list;
}

function getAchievements() {
  try {
    const v = JSON.parse(localStorage.getItem(ACH_STORE_KEY));
    return Array.isArray(v) ? v : [];
  } catch (e) { return []; }
}
function setAchievements(list) {
  localStorage.setItem(ACH_STORE_KEY, JSON.stringify(list));
}

/* 生成唯一成就 ID：ACH-{类型码}-{日期}-{序号} */
function makeAchId(type, dateStr) {
  const code = ACH_TYPE_CODE[type] || 'X';
  const day = (dateStr || getTodayStr()).replace(/-/g, '');
  const prefix = 'ACH-' + code + '-' + day + '-';
  const existing = getAchievements().filter(a => a.id && a.id.indexOf(prefix) === 0);
  const seq = String(existing.length + 1).padStart(3, '0');
  return prefix + seq;
}

/* 用于去重：一个周期内同类型只发一次 */
function achPeriodKey(type, dateStr) {
  const d = new Date((dateStr || getTodayStr()) + 'T00:00:00');
  if (type === 'daily') return 'daily:' + dateStrFromTs(d.getTime());
  if (type === 'weekly') {
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1 - day);
    d.setDate(d.getDate() + diff);
    return 'weekly:' + dateStrFromTs(d.getTime());
  }
  if (type === 'monthly') {
    return 'monthly:' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  if (type === 'total') return 'total';
  if (type === 'exam') return 'exam:' + dateStr;
  return type + ':' + dateStr;
}

/* 日期区间内学习总秒数 */
function totalSecondsInRange(startStr, endStr) {
  let total = 0;
  getAllStudyDates().forEach(d => {
    if (d >= startStr && d <= endStr) {
      total += dayTotal(STORE.getDay(d));
    }
  });
  return total;
}

/* 计算某个周期的起止日期 */
function periodRange(type, anchorDate) {
  const d = new Date((anchorDate || getTodayStr()) + 'T00:00:00');
  if (type === 'daily') {
    const s = dateStrFromTs(d.getTime());
    return { start: s, end: s };
  }
  if (type === 'weekly') {
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1 - day);
    const mon = new Date(d); mon.setDate(d.getDate() + diff);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return { start: dateStrFromTs(mon.getTime()), end: dateStrFromTs(sun.getTime()) };
  }
  if (type === 'monthly') {
    const y = d.getFullYear();
    const m = d.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    return { start: dateStrFromTs(first.getTime()), end: dateStrFromTs(last.getTime()) };
  }
  return { start: '1970-01-01', end: '2099-12-31' };
}

/* 添加一条成就（自动跳过重复周期） */
function pushAchievement(type, dateStr, extraDesc, customReward, customPeriodKey) {
  const cfg = ACH_CONFIG[type];
  if (!cfg) return false;
  const periodKey = customPeriodKey || achPeriodKey(type, dateStr);
  const all = getAchievements();
  if (all.some(a => a.periodKey === periodKey)) return false;

  const reward = (typeof customReward === 'number') ? customReward : cfg.reward;
  const rec = {
    id: makeAchId(type, dateStr),
    type: type,
    periodKey: periodKey,
    title: cfg.title,
    desc: extraDesc || cfg.desc,
    reward: reward,
    earnedDate: dateStr || getTodayStr(),
    earnedAt: Date.now(),
    status: 'pending'
  };
  all.push(rec);
  setAchievements(all);
  return true;
}

/* 检查所有成就条件，返回新达成的成就列表 */
function checkAchievements() {
  const newOnes = [];
  const today = getTodayStr();

  // 单日
  const daySec = dayTotal(STORE.getDay(today));
  if (daySec >= ACH_CONFIG.daily.threshold) {
    if (pushAchievement('daily', today)) {
      newOnes.push(getAchievements().slice(-1)[0]);
    }
  }

  // 单周
  const wk = periodRange('weekly', today);
  const wkSec = totalSecondsInRange(wk.start, wk.end);
  if (wkSec >= ACH_CONFIG.weekly.threshold) {
    if (pushAchievement('weekly', today)) {
      newOnes.push(getAchievements().slice(-1)[0]);
    }
  }

  // 单月
  const mo = periodRange('monthly', today);
  const moSec = totalSecondsInRange(mo.start, mo.end);
  if (moSec >= ACH_CONFIG.monthly.threshold) {
    if (pushAchievement('monthly', today)) {
      newOnes.push(getAchievements().slice(-1)[0]);
    }
  }

    // 累计时长里程碑
  let allSec = 0;
  getAllStudyDates().forEach(d => { allSec += dayTotal(STORE.getDay(d)); });
  const allHours = Math.floor(allSec / 3600);
  getAllMilestones().forEach(m => {
    if (allHours >= m.hours) {
      const desc = '累计学习满 ' + m.hours + ' 小时';
      const periodKey = 'total_' + m.hours;
      if (pushAchievement('total', today, desc, m.reward, periodKey)) {
        newOnes.push(getAchievements().slice(-1)[0]);
      }
    }
  });

  // 考试结束
  ExamStore.getAll().forEach(ex => {
    const days = daysBetween(ex.date);
    if (days < 0) {
      const desc = '「' + ex.name + '」已于 ' + ex.date + ' 结束，辛苦了';
      if (pushAchievement('exam', ex.date, desc)) {
        newOnes.push(getAchievements().slice(-1)[0]);
      }
    }
  });

  // 有新成就就推到云端
  if (newOnes.length > 0) {
    CloudSync.pushAchievements();
  }

  return newOnes;
}

let achCurrentFilter = 'all';

function toggleAchWall() {
  const body = document.getElementById('ach-wall-body');
  if (!body) return;
  const open = body.style.display === 'none';
  body.style.display = open ? 'block' : 'none';
  localStorage.setItem('ach_wall_open', open ? '1' : '0');
}

function setAchFilter(f) {
  achCurrentFilter = f;
  document.querySelectorAll('.ach-filter').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === f);
  });
  renderAchievements();
}

document.querySelectorAll('.ach-filter').forEach(b => {
  b.addEventListener('click', () => setAchFilter(b.dataset.filter));
});

(function initAchWall() {
  const body = document.getElementById('ach-wall-body');
  if (!body) return;
  const isOpen = localStorage.getItem('ach_wall_open') === '1';
  body.style.display = isOpen ? 'block' : 'none';
})();

// 从云端拉自己的成就，覆盖本地（姐姐审核后能看到新状态）
async function refreshAchievementsFromCloud() {
  try {
    const user = await getCurrentUser();
    if (!user) return;
    const { data: achs, error } = await supabaseClient
      .from('achievements')
      .select('*')
      .eq('user_id', user.id);
    if (error || !achs) return;
    localStorage.setItem('achievements_list', JSON.stringify(
      achs.map(function(a) {
        return {
          id: a.id, type: a.type, periodKey: a.period_key,
          title: a.title, desc: a.description, reward: a.reward,
          earnedDate: a.earned_date,
          earnedAt: a.earned_at ? new Date(a.earned_at).getTime() : Date.now(),
          status: a.status
        };
      })
    ));
    renderAchievements();
  } catch (e) {
    console.log('成就刷新失败，保留本地数据');
  }
}

function renderAchievements() {
  const box = $('achievement-list');
  if (!box) return;
  const all = getAchievements().slice().sort((a, b) => b.earnedAt - a.earnedAt);

  const countEl = $('ach-count');
  if (countEl) countEl.textContent = all.length ? all.length + ' 个' : '';

  // 更新分类按钮上的数字
  document.querySelectorAll('.ach-filter').forEach(b => {
    const f = b.dataset.filter;
    const countSpan = b.querySelector('.ach-filter-count');
    if (!countSpan) return;
    let count = 0;
    if (f === 'all') count = all.length;
    else count = all.filter(a => a.type === f).length;
    countSpan.textContent = count > 0 ? count : '';
  });

  // 过滤
  const filtered = achCurrentFilter === 'all'
    ? all
    : all.filter(a => a.type === achCurrentFilter);

  if (!filtered.length) {
    box.innerHTML = '<div class="ach-empty">' +
      (all.length ? '这个分类还没有成就' : '还没有成就<br>学习时长达标后会自动出现在这里 ☝️') +
      '</div>';
    return;
  }

  box.innerHTML = filtered.map(a => {
    const cls = a.status === 'redeemed' ? ' redeemed' : '';
    const statusText = a.status === 'redeemed' ? '已兑换' : '待审核';
    const medal = ACH_MEDAL[a.type] || '🏅';
    return '<div class="ach-item' + cls + '">' +
      '<div class="ach-head">' +
        '<span class="ach-medal">' + medal + '</span>' +
        '<span class="ach-title">' + escapeHtml(a.title) + '</span>' +
        '<span class="ach-reward">¥' + ((ACH_CONFIG[a.type] && ACH_CONFIG[a.type].reward) || a.reward) + '</span>' +
      '</div>' +
      '<div class="ach-desc">' + escapeHtml(a.desc) + '</div>' +
      '<div class="ach-meta">' +
        '<span class="ach-id">' + escapeHtml(a.id) + '</span>' +
        '<span class="ach-status ' + a.status + '">' + statusText + '</span>' +
      '</div>' +
      '</div>';
  }).join('');
}

/* 由姐姐在后台调用（本地版先保留 API） */
function markAchievementRedeemed(id) {
  const all = getAchievements();
  const target = all.find(a => a.id === id);
  if (!target) return false;
  target.status = 'redeemed';
  target.redeemedAt = Date.now();
  setAchievements(all);
  renderAchievements();
  CloudSync.pushAchievements();
  return true;
}

/* ============================================================
   关键日期（多考试版）
   ============================================================ */
function getAllUpcomingEvents(daysAhead) {
  const result = [];
  const exams = ExamStore.getAll();
  exams.forEach(ex => {
    if (!Array.isArray(ex.events)) return;
    ex.events.forEach(ev => {
      const d = daysBetween(ev.date);
      if (d >= 0 && d <= daysAhead) {
        result.push({ exam: ex, ev: ev, days: d });
      }
    });
  });
  result.sort((a, b) => a.days - b.days);
  return result;
}

function getEventAlerts() {
  const alerts = [];
  const todayStr = getTodayStr();
  const today = new Date(todayStr + 'T00:00:00');
  getAllUpcomingEvents(60).forEach(x => {
    if (x.days === 0) {
      alerts.push({ type: 'today', exam: x.exam, ev: x.ev, days: 0 });
    } else {
      const d = new Date(x.ev.date + 'T00:00:00');
      if (d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth()) {
        alerts.push({ type: 'month', exam: x.exam, ev: x.ev, days: x.days });
      }
    }
  });
  return alerts;
}

function renderTimeline() {
  const container = $('timeline');
  const nameLabel = $('timeline-exam-name');
  const exams = ExamStore.getAll();

  if (!exams.length) {
    if (nameLabel) nameLabel.textContent = '';
    container.innerHTML = '<div class="empty-tip">还没有考试<br>去首页添加一场考试，节点会自动生成</div>';
    return;
  }

  let html = '';
  exams.forEach(ex => {
    const events = Array.isArray(ex.events) ? ex.events.slice().sort((a, b) => a.date.localeCompare(b.date)) : [];
    const color = ex.color || '#52B788';

    html += '<div class="exam-timeline-group">';
    html += '<div class="exam-timeline-header">';
    html += '<span class="dot" style="background:' + color + '"></span>';
    html += '<span class="name">' + escapeHtml(ex.name) + ' · ' + ex.date + '</span>';
    html += '<button class="add-node-btn" onclick="openNodeModal(\'' + ex.id + '\', null)">＋ 添加节点</button>';
    html += '</div>';

    if (!events.length) {
      html += '<div style="font-size:12px; color:var(--text-light); padding:8px 12px;">还没有节点，点上方按钮添加</div>';
    } else {
      events.forEach(ev => {
        const daysUntil = daysBetween(ev.date);
        let cls = '';
        let check = '';
        if (daysUntil < 0) { cls = 'past'; check = '<span class="timeline-check">✓</span>'; }
        else if (daysUntil === 0) { cls = 'is-today'; check = '<span class="timeline-check">🔔</span>'; }
        else if (daysUntil <= 30) { cls = 'upcoming'; }

        const d = new Date(ev.date + 'T00:00:00');
        const dateStr = d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
        let cd = '';
        if (daysUntil > 0) cd = '还有 ' + daysUntil + ' 天';
        else if (daysUntil === 0) cd = '就是今天！';
        else cd = '已过去 ' + Math.abs(daysUntil) + ' 天';

        html += '<div class="timeline-item ' + cls + '">';
        html += '<div class="timeline-date">' + dateStr + '</div>';
        html += '<div class="timeline-title">' + escapeHtml(ev.title) + '</div>';
        html += '<div class="timeline-countdown">' + cd + '</div>';
        html += '<div class="timeline-actions">';
        html += '<button class="timeline-icon-btn" onclick="openNodeModal(\'' + ex.id + '\', \'' + ev.id + '\')" title="编辑">✎</button>';
        html += '</div>';
        html += check;
        html += '</div>';
      });
    }
    html += '</div>';
  });
  container.innerHTML = html;
  if (nameLabel) nameLabel.textContent = '';
}

/* ============================================================
   节点编辑模态框
   ============================================================ */
let editingNodeExamId = null;
let editingNodeId = null;

function openNodeModal(examId, nodeId) {
  editingNodeExamId = examId;
  editingNodeId = nodeId;
  const ex = ExamStore.get(examId);
  if (!ex) return;

  if (nodeId) {
    const ev = (ex.events || []).find(e => e.id === nodeId);
    if (!ev) return;
    $('node-modal-title').textContent = '编辑节点';
    $('node-title').value = ev.title;
    $('node-date').value = ev.date;
    $('node-delete-btn').style.display = '';
  } else {
    $('node-modal-title').textContent = '添加节点';
    $('node-title').value = '';
    $('node-date').value = ex.date;
    $('node-delete-btn').style.display = 'none';
  }
  $('node-modal').classList.add('show');
  setTimeout(() => $('node-title').focus(), 100);
}

function closeNodeModal() {
  $('node-modal').classList.remove('show');
  editingNodeExamId = null;
  editingNodeId = null;
}

function saveNodeModal() {
  const title = $('node-title').value.trim();
  const date = $('node-date').value;
  if (!title) { showToast('请输入节点名称'); return; }
  if (!date) { showToast('请选择节点日期'); return; }

  const ex = ExamStore.get(editingNodeExamId);
  if (!ex) return;
  const events = Array.isArray(ex.events) ? ex.events.slice() : [];

  if (editingNodeId) {
    const idx = events.findIndex(e => e.id === editingNodeId);
    if (idx >= 0) {
      events[idx] = Object.assign({}, events[idx], { title: title, date: date });
    }
    showToast('✅ 已更新节点');
  } else {
    events.push({
      id: 'ev_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      title: title,
      date: date,
      isCustom: true
    });
    showToast('➕ 已添加节点');
  }

  ExamStore.update(editingNodeExamId, { events: events });
  closeNodeModal();
  renderTimeline();
  renderExamCards();
  renderHomeAlerts();
}

function deleteNodeFromModal() {
  if (!editingNodeExamId || !editingNodeId) return;
  const ex = ExamStore.get(editingNodeExamId);
  if (!ex) return;
  const ev = (ex.events || []).find(e => e.id === editingNodeId);
  if (!ev) return;
  if (!confirm('确定要删除节点「' + ev.title + '」吗？')) return;

  const events = ex.events.filter(e => e.id !== editingNodeId);
  ExamStore.update(editingNodeExamId, { events: events });
  closeNodeModal();
  renderTimeline();
  renderExamCards();
  renderHomeAlerts();
  showToast('🗑️ 已删除节点');
}

$('node-modal').addEventListener('click', e => {
  if (e.target === $('node-modal')) closeNodeModal();
});
$('node-title').addEventListener('keydown', e => {
  if (e.key === 'Enter') saveNodeModal();
});

function renderHomeAlerts() {
  const box = $('home-alerts');
  const alerts = getEventAlerts();
  if (!alerts.length) { box.innerHTML = ''; return; }
  box.innerHTML = alerts.map(a => {
    const examTag = a.exam ? '「' + escapeHtml(a.exam.name) + '」' : '';
    if (a.type === 'today') {
      return '<div class="alert-banner today">' +
        '<div class="alert-icon">🔔</div>' +
        '<div class="alert-body">' +
        '<div class="alert-title">就是今天！' + examTag + escapeHtml(a.ev.title) + '</div>' +
        '<div class="alert-desc">别忘了关注相关通知哦～</div>' +
        '</div></div>';
    }
    return '<div class="alert-banner month">' +
      '<div class="alert-icon">📅</div>' +
      '<div class="alert-body">' +
      '<div class="alert-title">本月提醒：' + examTag + escapeHtml(a.ev.title) + '</div>' +
      '<div class="alert-desc">' + a.ev.date + ' · 还有 ' + a.days + ' 天</div>' +
      '</div></div>';
  }).join('');
}

/* ============================================================
   姐姐的信
   ============================================================ */
async function loadLetter() {
  const box = $('home-letter');
  if (!box) return;
  try {

  const user = await getCurrentUser();
  if (!user) { box.innerHTML = ''; return; }

  const { data, error } = await supabaseClient
    .from('announcements')
    .select('*')
    .order('publish_at', { ascending: false })
    .limit(5);
  if (error || !data || !data.length) { box.innerHTML = ''; return; }

  // 已读列表存在 localStorage
  let readIds = [];
  try { readIds = JSON.parse(localStorage.getItem('read_letters') || '[]'); } catch (e) {}

  // 找第一封未读的
  const unread = data.filter(function(a) { return readIds.indexOf(a.id) < 0; });
  if (!unread.length) { box.innerHTML = ''; return; }

  const letter = unread[0];

  box.innerHTML =
    '<div class="card" style="background:linear-gradient(135deg, rgba(181,234,215,0.75), rgba(232,248,245,0.75)); border:1.5px solid var(--mint); cursor:pointer;" onclick="openLetter(\'' + letter.id + '\')">' +
    '<div style="display:flex; align-items:center; gap:10px;">' +
    '<span style="font-size:26px;">📬</span>' +
    '<div style="flex:1; min-width:0;">' +
    '<div style="font-size:14px; font-weight:700; color:var(--text-deep);">姐姐有一封信</div>' +
    '<div style="font-size:12px; color:var(--text); margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + escapeHtml(letter.title) + '</div>' +
    '</div>' +
    '<span style="font-size:18px; color:var(--accent);">›</span>' +
    '</div>' +
    '</div>';
  } catch (e) {
    box.innerHTML = '';
  }
}

async function openLetter(id) {
  const { data, error } = await supabaseClient
    .from('announcements')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) { showToast('打开失败'); return; }

  // 弹窗显示
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed; inset:0; background:rgba(45,106,79,0.35); backdrop-filter:blur(6px); z-index:3000; display:flex; align-items:center; justify-content:center; padding:20px;';
  overlay.innerHTML =
    '<div style="background:linear-gradient(135deg, rgba(255,255,255,0.95), rgba(232,248,245,0.95)); border-radius:24px; padding:26px; width:100%; max-width:400px; max-height:80vh; overflow-y:auto; box-shadow:0 12px 48px rgba(45,106,79,0.25);">' +
    '<div style="font-size:18px; font-weight:700; color:var(--text-deep); margin-bottom:6px;">' + escapeHtml(data.title) + '</div>' +
    '<div style="font-size:11px; color:var(--text-light); margin-bottom:16px;">' + (data.publish_at ? new Date(data.publish_at).toLocaleString('zh-CN') : '') + '</div>' +
    '<div style="font-size:14px; color:var(--text); line-height:1.8; white-space:pre-wrap;">' + escapeHtml(data.content) + '</div>' +
    '<button id="letter-close-btn" style="width:100%; margin-top:22px; padding:12px; background:var(--accent); color:#fff; border:none; border-radius:12px; font-size:14px; font-weight:700; cursor:pointer; font-family:inherit;">我知道啦 💚</button>' +
    '</div>';
  document.body.appendChild(overlay);

  overlay.querySelector('#letter-close-btn').onclick = function() {
    // 标记已读
    let readIds = [];
    try { readIds = JSON.parse(localStorage.getItem('read_letters') || '[]'); } catch (e) {}
    if (readIds.indexOf(id) < 0) {
      readIds.push(id);
      localStorage.setItem('read_letters', JSON.stringify(readIds));
    }
    document.body.removeChild(overlay);
    loadLetter();
  };
}

/* ============================================================
   跨天检测（页面级）
   ============================================================ */
function checkDayChange() {
  const lastDay = localStorage.getItem('last_day');
  const today = getTodayStr();
  if (lastDay && lastDay !== today) {
    // 计时器跨天由 timerSync 处理；此处只更新日期标记
    localStorage.setItem('last_day', today);
  } else if (!lastDay) {
    localStorage.setItem('last_day', today);
  }
}

/* ============================================================
   刷新总入口
   ============================================================ */
function refreshAll() {
  fillSubjectSelects();
  renderTodaySubjects();
  updateStats();
  drawLineChart();
  updateHomeOverview();
  renderHomeAlerts();
  renderTimeline();
  renderSubjectList();
    loadLetter();
  if (currentSubjectName) renderSubjectDetail();
}

/* ============================================================
   初始化
   ============================================================ */

   /* ============================================================
   数据导出 / 导入 / 清除
   ============================================================ */
const BACKUP_KEYS_PREFIX = ['study_', 'diary_', 'warn_shown_'];
const BACKUP_KEYS_EXACT = [
  'subjects_list', 'exams_list', 'achievements_list',
  'timer_state', 'timer_hb',
  'data_version', 'last_day'
];

function collectAllData() {
  const data = {};
  Object.keys(localStorage).forEach(k => {
    if (BACKUP_KEYS_PREFIX.some(p => k.startsWith(p)) || BACKUP_KEYS_EXACT.indexOf(k) >= 0) {
      data[k] = localStorage.getItem(k);
    }
  });
  return data;
}

function clearAppData() {
  Object.keys(localStorage).forEach(k => {
    if (BACKUP_KEYS_PREFIX.some(p => k.startsWith(p)) || BACKUP_KEYS_EXACT.indexOf(k) >= 0) {
      localStorage.removeItem(k);
    }
  });
}

function exportData() {
  const data = collectAllData();
  const count = Object.keys(data).length;
  if (count === 0) {
    showToast('还没有可导出的数据');
    return;
  }
  const exportObj = {
    app: 'LisinoraPrep',
    version: 1,
    exportedAt: new Date().toISOString(),
    data: data
  };
  const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'LisinoraPrep-backup-' + getTodayStr() + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('📦 已导出 ' + count + ' 项数据');
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    let obj = null;
    try { obj = JSON.parse(e.target.result); }
    catch (err) { showToast('❌ 文件无法解析'); return; }

    if (!obj || obj.app !== 'LisinoraPrep' || !obj.data || typeof obj.data !== 'object') {
      showToast('❌ 不是 LisinoraPrep 的备份文件');
      return;
    }

    const count = Object.keys(obj.data).length;
    if (!confirm('即将导入 ' + count + ' 项数据。\n\n当前设备上所有学习记录、日记、考试、科目将被覆盖。\n\n确定继续吗？')) {
      event.target.value = '';
      return;
    }

    clearAppData();
    Object.keys(obj.data).forEach(k => {
      const v = obj.data[k];
      if (typeof v === 'string') localStorage.setItem(k, v);
    });

    showToast('✅ 已恢复，正在刷新…');
    setTimeout(() => location.reload(), 900);
    event.target.value = '';
  };
  reader.onerror = function() {
    showToast('❌ 文件读取失败');
    event.target.value = '';
  };
  reader.readAsText(file);
}

async function clearAllData() {
  if (!confirm('确定要清除所有数据吗？\n\n所有学习记录、日记、考试、科目都会被删除，云端和本机同时清除。')) return;
  if (!confirm('再次确认：真的要清除吗？\n\n建议先导出备份再清除。')) return;

  showToast('正在清除云端数据…');

  // 1. 先清云端
  const user = await getCurrentUser();
  if (user) {
    try {
      await supabaseClient.from('subjects').delete().eq('user_id', user.id);
      await supabaseClient.from('exams').delete().eq('user_id', user.id);
      await supabaseClient.from('diaries').delete().eq('user_id', user.id);
      await supabaseClient.from('study_records').delete().eq('user_id', user.id);
      await supabaseClient.from('achievements').delete().eq('user_id', user.id);
    } catch (e) {
      console.log('清云端失败:', e);
      alert('云端清除失败，请检查网络后重试');
      return;
    }
  }

  // 2. 清本地
  clearAppData();

  // 3. 标记本次会话已同步（防止刷新后重新拉云端）
  sessionStorage.setItem('cloud_synced', '1');

  showToast('✅ 云端和本机都已清除');
  setTimeout(() => location.reload(), 1000);
}

   (function init() {
  migrateData();

  // 手动补录日期默认今天
  $('manual-date').value = getTodayStr();

  // 初始化计时器状态（兼容旧格式）
  const s = getTimerState();
  if (!s.subject && !s.running) {
    // 如果之前有 accumuleted 旧字段，忽略
  }

  // 处理跨天
  checkDayChange();
  timerSync();

  fillSubjectSelects();
  $('diary-date').value = currentDiaryDate;
  loadDiary();
  updateTimerUI();
  renderTodaySubjects();
  updateStats();
  updateHomeOverview();
  renderCalendar();
  renderSubjectList();
  renderTimeline();
  renderHomeAlerts();
    renderExamCards();
  checkAchievements();
  renderAchievements();
  setTimeout(drawLineChart, 150);

  // 每分钟检查跨天 + 刷新关键日期提醒
  setInterval(() => {
    checkDayChange();
    renderHomeAlerts();
    renderTimeline();
  }, 60000);
})();


/* ============================================================
   PWA 安装按钮
   ============================================================ */
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  // 阻止浏览器默认的迷你信息栏
  e.preventDefault();
  // 保存事件，稍后按钮点击时使用
  deferredInstallPrompt = e;
  // 显示我们的自定义安装按钮
  const banner = document.getElementById('install-banner');
  if (banner) banner.style.display = 'block';
});

// 点击按钮时触发安装
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('install-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    // 调用浏览器原生安装提示
    deferredInstallPrompt.prompt();
    // 等待用户选择
    const { outcome } = await deferredInstallPrompt.userChoice;
    console.log('用户选择:', outcome);
    // 安装提示只能用一次，用完清空
    deferredInstallPrompt = null;
    const banner = document.getElementById('install-banner');
    if (banner) banner.style.display = 'none';
  });
});

// 安装完成后隐藏按钮
window.addEventListener('appinstalled', () => {
  const banner = document.getElementById('install-banner');
  if (banner) banner.style.display = 'none';
  deferredInstallPrompt = null;
});



if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').then(reg => {
      // 每小时检查一次更新（App 打开着的时候）
      setInterval(() => reg.update(), 60 * 60 * 1000);

      // 检测到新 SW 时，自动重新加载
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
            console.log('🔄 检测到新版本，正在刷新...');
            window.location.reload();
          }
        });
      });
    }).catch(() => {});

    // 页面每次获得焦点时，也检查一次更新（切回 App 时触发）
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        navigator.serviceWorker.getRegistration().then(reg => {
          if (reg) reg.update();
        });
      }
    });
  });
}
