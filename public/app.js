const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const vnd = v => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(v || 0);
const num = v => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(v || 0);
const dt = v => new Date(v).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const clock = v => new Date(v).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' });
const code = id => 'CG-' + id.slice(0, 8).toUpperCase();
const statusText = { pending: 'Chờ xử lý', preparing: 'Đang chuẩn bị', ready: 'Sẵn sàng giao', completed: 'Hoàn tất', cancelled: 'Đã hủy' };
const roleText = { customer: 'Khách hàng', staff: 'Nhân viên nhà ăn', admin: 'Quản trị viên' };
const moveText = { opening: 'Đầu kỳ', in: 'Nhập kho', out: 'Xuất thủ công', consume: 'Chế biến', restore: 'Hoàn kho' };
const paths = { menu: 'M4 3h16v18H4z M8 7h8 M8 11h8 M8 15h4', bag: 'M5 7h14l2 14H3L5 7z M8 8V6a4 4 0 0 1 8 0v2', orders: 'M5 3h14v18l-3-2-4 2-4-2-3 2V3 M8 7h8 M8 11h8 M8 15h4', wallet: 'M3 6h17v15H3V6z M3 6V4h14v2 M16 12h5v5h-5z', user: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-3a8 8 0 0 1 16 0v3', chef: 'M7 14a5 5 0 0 1-2-9 5 5 0 0 1 9-1 5 5 0 0 1 4 10v6H7z M7 17h11', box: 'm3 7 9-4 9 4v11l-9 4-9-4V7z m0 0 9 4 9-4 M12 11v11 M7 5l10 4', chart: 'M4 3v18h17 M8 16v-5 M13 16V7 M18 16v-9', settings: 'M4 7h16 M4 17h16 M8 4v6 M16 14v6', logout: 'M9 3H4v18h5 M10 12h11 m-4-4 4 4-4 4', search: 'M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0 m-2 4 6 6', plus: 'M12 5v14 M5 12h14', close: 'm6 6 12 12 M6 18 18 6', pin: 'M19 9c0 5-7 12-7 12S5 14 5 9a7 7 0 0 1 14 0 M14 9a2 2 0 1 1-4 0 2 2 0 0 1 4 0', time: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0 M12 6v6l4 2', arrow: 'M4 12h16 m-6-6 6 6-6 6', star: 'm12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z', check: 'm5 12 4 4L19 6', edit: 'm14 4 6 6 M3 21l5-1L21 7l-5-5L3 15z', truck: 'M2 6h12v12H2z M14 10h5l3 4v4h-8 M8 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0 M20 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0', download: 'M12 3v12 m-5-5 5 5 5-5 M4 16v5h16v-5' };
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.menu}"/></svg>`;
const badge = status => `<span class="badge ${esc(status)}">${esc(statusText[status] || status)}</span>`;
const state = { user: null, config: {}, menu: [], slots: [], cart: [], orders: [], inventory: [], suppliers: [], category: 'Tất cả', search: '', price: '', date: '', slotId: '', orderFilter: 'all', report: null, live: false };
let events, renderVersion = 0, toastTimer, refreshTimer, lastFocus;
const modal = $('#modal');

async function api(path, method = 'GET', data) {
  let res;
  try { res = await fetch('/api' + path, { method, headers: data === undefined ? {} : { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) }); }
  catch { throw new Error('Mất kết nối máy chủ. Kiểm tra máy chủ đang chạy rồi thử lại; yêu cầu thanh toán đang chờ sẽ được đối chiếu.'); }
  const body = await res.json();
  if (!res.ok) { const error = new Error(body.error || 'Không thể xử lý yêu cầu.'); error.status = res.status; throw error; }
  return body;
}
function toast(message, error = false) { const el = $('#toast'); el.textContent = message; el.className = 'show' + (error ? ' error' : ''); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.className = '', 5000); }
function route() { return location.hash.slice(1).split('?')[0] || 'menu'; }
function cartKey() { return 'canteengo.cart.' + (state.user?.id || 'guest'); }
function loadCart() { try { const data = JSON.parse(localStorage.getItem(cartKey()) || '{}'); state.cart = Array.isArray(data.items) ? data.items.filter(i => i && typeof i.dish_id === 'string' && Number.isInteger(i.quantity) && i.quantity > 0 && i.quantity <= 99 && Number.isSafeInteger(i.price) && i.price > 0).map(i => ({ ...i, note: String(i.note || '').slice(0, 300) })) : []; state.checkoutRef = data.reference; } catch { state.cart = []; state.checkoutRef = null; } }
function saveCart(changed = true) { if (changed) state.checkoutRef = null; localStorage.setItem(cartKey(), JSON.stringify({ items: state.cart, reference: state.checkoutRef })); }
const pendingKey = () => 'canteengo.pending.' + state.user?.id;
async function settleCheckout(payload) {
  // Persist the exact request before sending. A reload/retry uses the same reference and body.
  const saved = localStorage.getItem(pendingKey());
  if (saved) payload = JSON.parse(saved);
  else localStorage.setItem(pendingKey(), JSON.stringify(payload));
  try {
    const order = await api('/orders', 'POST', payload);
    localStorage.removeItem(pendingKey()); state.cart = []; saveCart(); await refreshMe(); return order;
  } catch (error) {
    if (error.status && error.status >= 400 && error.status < 500) localStorage.removeItem(pendingKey());
    throw error;
  }
}
function empty(title, message, action = '') { return `<div class="empty">${icon('bag')}<h3>${esc(title)}</h3><p>${esc(message)}</p>${action}</div>`; }
function pageHead(title, subtitle, action = '', eyebrow = '') { return `<div class="page-head"><div>${eyebrow ? `<div class="eyebrow">${eyebrow}</div>` : ''}<h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`; }
function table(headers, rows) { return `<div class="table-wrap"><table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.join('') : `<tr><td colspan="${headers.length}">Chưa có dữ liệu.</td></tr>`}</tbody></table></div>`; }
const button = (action, label, extra = '', type = '') => `<button type="button" class="button ${type}" data-action="${action}" ${extra}>${label}</button>`;
const liveBadge = () => `<span class="live ${state.live ? '' : 'offline'}">${state.live ? 'Đang cập nhật trực tiếp' : 'Đang kết nối'}</span>`;

function shell() {
  const role = state.user?.role || 'customer';
  const nav = role === 'customer' ? [['menu', 'menu', 'Thực đơn'], ['orders', 'orders', 'Đơn của tôi'], ['wallet', 'wallet', 'Ví CanteenGo']] : role === 'staff' ? [['kitchen', 'chef', 'Bảng đơn bếp'], ['inventory', 'box', 'Kho nguyên liệu']] : [['reports', 'chart', 'Tổng quan'], ['kitchen', 'chef', 'Bảng đơn bếp'], ['admin-menu', 'menu', 'Quản lý món'], ['inventory', 'box', 'Kho nguyên liệu'], ['suppliers', 'truck', 'Nhà cung cấp'], ['users', 'user', 'Tài khoản']];
  $('#app').innerHTML = `<aside class="sidebar"><a href="#${role === 'customer' ? 'menu' : role === 'admin' ? 'reports' : 'kitchen'}" class="brand"><img src="/assets/favicon.svg" alt=""><span>Canteen<span>Go</span></span></a><div class="eyebrow">${role === 'customer' ? 'BỮA ĂN CỦA BẠN' : 'VẬN HÀNH NHÀ ĂN'}</div><nav class="nav" aria-label="Điều hướng chính">${nav.map(([link, ico, label]) => `<a href="#${link}" title="${label}" class="${route() === link ? 'active' : ''}">${icon(ico)}<span>${label}</span></a>`).join('')}</nav><div class="sidebar-bottom"><div class="sidebar-note"><strong>Đặt trước. Nhận đúng giờ.</strong>Bữa trưa gọn hơn,<br>ngày học thoải mái hơn.</div><nav class="nav">${state.user ? `<a href="#profile" title="Hồ sơ" class="${route() === 'profile' ? 'active' : ''}">${icon('settings')}<span>Hồ sơ của tôi</span></a><a href="#" data-action="logout" title="Đăng xuất">${icon('logout')}<span>Đăng xuất</span></a>` : `<a href="#login" title="Đăng nhập">${icon('user')}<span>Đăng nhập</span></a>`}</nav></div></aside><header class="topbar"><div class="location">${icon('pin')}<div><strong>Nhà ăn CanteenGo</strong><small>Nhận món tại quầy · 10:30 – 14:00</small></div></div><div class="top-actions">${state.user?.role === 'customer' ? `<a class="wallet-chip" href="#wallet">${icon('wallet')}<span id="wallet-balance">${vnd(state.user.balance)}</span></a>` : `<span class="badge demo">${state.config.demoMode ? 'Bản demo' : 'CanteenGo'}</span>`}${state.user ? `<a href="#profile" class="avatar"><div class="avatar-circle">${esc(state.user.name.split(' ').slice(-2).map(w => w[0]).join(''))}</div><span>${esc(state.user.name)}<small class="muted"> · ${roleText[role]}</small></span></a>` : `<a class="button primary" href="#login">Đăng nhập</a>`}</div></header><main id="main" class="workspace" tabindex="-1"><div id="page"></div><p class="footer-note">CanteenGo · Nhóm 69${state.config.demoMode ? ' · Ví và dữ liệu minh họa, không thanh toán tiền thật' : ''}</p></main>`;
}
function modalOpen(title, content) { lastFocus = document.activeElement; modal.innerHTML = `<div class="modal-head"><h2 id="modal-heading">${title}</h2><button class="icon-button" data-action="close" aria-label="Đóng">${icon('close')}</button></div><div class="modal-body">${content}</div>`; if (!modal.open) modal.showModal(); }
function modalClose() { const wasOpen = modal.open; modal.close(); lastFocus?.focus?.(); if (wasOpen && events && state.user) events.dispatchEvent(new Event('refresh')); }
modal.addEventListener('click', e => { if (e.target === modal) modalClose(); });

async function render() {
  const version = ++renderVersion; const r = route();
  const customerPages = ['orders', 'wallet']; const staffPages = ['kitchen', 'inventory']; const adminPages = ['reports', 'admin-menu', 'suppliers', 'users'];
  if (([...customerPages, ...staffPages, ...adminPages, 'profile'].includes(r)) && !state.user) { location.hash = 'login'; return; }
  if ((customerPages.includes(r) && state.user.role !== 'customer') || (staffPages.includes(r) && state.user.role === 'customer') || (adminPages.includes(r) && state.user.role !== 'admin')) { toast('Tài khoản không có quyền truy cập màn hình này.', true); location.hash = state.user.role === 'customer' ? 'menu' : 'kitchen'; return; }
  shell(); $('#page').innerHTML = '<p class="muted">Đang tải dữ liệu…</p>';
  try {
    let content;
    if (r === 'menu') { state.slots = await api('/slots'); if (!state.slots.some(s => s.starts_at.startsWith(state.date))) state.date = state.slots[0]?.starts_at.slice(0, 10) || state.config.today; state.menu = await api('/menu?date=' + state.date); content = menuPage(); }
    else if (r === 'login' || r === 'register') content = authPage(r);
    else if (r === 'orders' || r === 'kitchen') { state.orders = await api('/orders'); content = r === 'orders' ? ordersPage() : kitchenPage(); }
    else if (r === 'wallet') { state.payments = await api('/wallet/history'); content = walletPage(); }
    else if (r === 'profile') content = profilePage();
    else if (r === 'admin-menu') { [state.menu, state.inventory] = await Promise.all([api('/admin/menu'), api('/inventory')]); content = adminMenuPage(); }
    else if (r === 'inventory') { [state.inventory, state.movements, state.suppliers] = await Promise.all([api('/inventory'), api('/inventory/history'), api('/suppliers')]); content = inventoryPage(); }
    else if (r === 'suppliers') { state.suppliers = await api('/suppliers'); content = suppliersPage(); }
    else if (r === 'users') { [state.users, state.audit] = await Promise.all([api('/admin/users'), api('/admin/audit')]); content = usersPage(); }
    else if (r === 'reports') { state.reportFrom ||= state.config.today.slice(0, 8) + '01'; state.reportTo ||= state.config.today; state.report = await api(`/admin/reports?from=${state.reportFrom}&to=${state.reportTo}`); content = reportsPage(); }
    else content = empty('Trang không tồn tại', 'Quay về thực đơn để tiếp tục.', '<a class="button primary" href="#menu">Mở thực đơn</a>');
    if (version === renderVersion) { $('#page').innerHTML = content; applyBars(); if (r === 'menu') dishCards(); }
  } catch (error) { if (version === renderVersion) $('#page').innerHTML = empty('Không tải được dữ liệu', error.message, button('reload', 'Thử lại')); }
}

function menuPage() {
  const name = state.user?.name.split(' ').slice(-1)[0];
  return pageHead(name ? `Hôm nay ăn gì, ${esc(name)}?` : 'Hôm nay bạn muốn ăn gì?', 'Chọn món bạn thích, hẹn giờ và ghé quầy nhận nhé.', '<a class="button mobile-cart-link" href="#cart-anchor" data-action="scroll-cart">' + icon('bag') + 'Giỏ hàng</a>', 'THỰC ĐƠN NHÀ ĂN') + `<div class="menu-layout"><section><div class="welcome"><div><div class="eyebrow">BỮA TRƯA, THEO LỊCH CỦA BẠN</div><h2>Đặt trước một chút.<br> Thảnh thơi hơn một chút.</h2><p>Chọn khung giờ còn chỗ, theo dõi đơn và nhận món khi bếp báo sẵn sàng.</p></div><div class="welcome-badge">${icon('time')}<span>HẸN GIỜ NHẬN</span></div></div><div class="filters"><div class="search">${icon('search')}<input id="search" type="search" placeholder="Tìm món ăn yêu thích…" aria-label="Tìm món" value="${esc(state.search)}"></div><select id="price-filter" aria-label="Lọc theo giá"><option value="">Mọi mức giá</option value="30000" ${state.price === '30000' ? 'selected' : ''}>Đến 30.000đ</option><option value="50000" ${state.price === '50000' ? 'selected' : ''}>Đến 50.000đ</option></select></div><div class="categories">${['Tất cả', ...new Set(state.menu.map(d => d.category))].map(c => `<button class="category ${state.category === c ? 'active' : ''}" data-action="category" data-value="${esc(c)}">${esc(c)}</button>`).join('')}</div><div class="section-row"><h2>Món ngon mỗi ngày</h2><small id="dish-count"></small></div><div id="dish-grid" class="dish-grid">${dishCards()}</div><p class="form-help">Ảnh minh họa nhóm món · Thành phần thực tế xem trong chi tiết món. <a href="/credits.html" target="_blank" rel="noopener">Nguồn ảnh</a></p></section><aside class="cart" id="cart-anchor">${cartContent()}</aside></div>`;
}
function dishCards() {
  const normalize = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase();
  const dishes = state.menu.filter(d => (state.category === 'Tất cả' || d.category === state.category) && normalize(d.name).includes(normalize(state.search)) && (!state.price || d.price <= +state.price));
  if ($('#dish-count')) $('#dish-count').textContent = `${dishes.length} món trong thực đơn`;
  return dishes.length ? dishes.map(d => `<article class="dish ${d.serving ? '' : 'unavailable'}"><div class="dish-picture">${d.image ? `<img src="${esc(d.image)}" alt="Ảnh minh họa ${esc(d.category)}" loading="lazy">` : icon('menu')}<span class="badge ${d.serving ? 'green' : 'cancelled'}">${d.serving ? 'Đang phục vụ' : 'Tạm hết / nghỉ bán'}</span><button data-action="dish" data-id="${esc(d.id)}" aria-label="Chi tiết ${esc(d.name)}"></button></div><div class="dish-body"><div class="dish-category">${esc(d.category)}${d.rating ? ` · ★ ${d.rating} (${d.review_count})` : ''}</div><button class="dish-title" data-action="dish" data-id="${esc(d.id)}">${esc(d.name)}</button><p class="dish-desc">${esc(d.description)}</p><div class="dish-price"><span>${vnd(d.price)}</span><button class="add-button" data-action="add" data-id="${esc(d.id)}" aria-label="Thêm ${esc(d.name)}" ${!d.serving ? 'disabled' : ''}>${icon('plus')}</button></div></div></article>`).join('') : empty('Không tìm thấy món', 'Thử từ khóa hoặc danh mục khác.');
}
function cartContent() {
  const total = state.cart.reduce((s, i) => s + i.price * i.quantity, 0), count = state.cart.reduce((s, i) => s + i.quantity, 0);
  const dates = [...new Set(state.slots.map(s => s.starts_at.slice(0, 10)))];
  if (!dates.includes(state.date)) state.date = dates[0] || state.config.today;
  const slots = state.slots.filter(s => s.starts_at.startsWith(state.date));
  if (!slots.some(s => s.id === state.slotId && s.remaining > 0)) state.slotId = slots.find(s => s.remaining > 0)?.id || '';
  return `<div class="cart-title"><h2>${icon('bag')}Giỏ hàng của bạn</h2><span class="count">${count}</span></div>${state.cart.length ? state.cart.map((i, index) => `<div class="cart-item"><div class="cart-item-head"><strong>${esc(i.name)}</strong><button class="button tiny ghost" data-action="remove" data-index="${index}" aria-label="Bỏ ${esc(i.name)}">×</button></div><div class="cart-quantity"><span>${vnd(i.price)}</span><div class="quantity-control"><button data-action="quantity" data-index="${index}" data-delta="-1" aria-label="Giảm ${esc(i.name)}">−</button><span>${i.quantity}</span><button data-action="quantity" data-index="${index}" data-delta="1" aria-label="Tăng ${esc(i.name)}" ${i.quantity >= 99 ? 'disabled' : ''}>+</button></div></div><input class="note" data-note="${index}" aria-label="Ghi chú ${esc(i.name)}" placeholder="Ghi chú: ít cay, không hành…" maxlength="300" value="${esc(i.note)}"></div>`).join('') : `<div class="cart-empty">${icon('bag')}<p>Giỏ hàng đang chờ món ngon.<br>Thêm món để đặt bữa ăn nhé.</p></div>`}<label class="cart-label" for="pickup-date">${icon('time')} Ngày nhận món</label><select id="pickup-date">${dates.map(d => `<option value="${d}" ${state.date === d ? 'selected' : ''}>${d === state.config.today ? 'Hôm nay · ' : ''}${d.split('-').reverse().join('/')}</option>`).join('')}</select><label class="cart-label" for="pickup-slot">Khung giờ nhận</label><select id="pickup-slot">${slots.map(s => `<option value="${s.id}" ${state.slotId === s.id ? 'selected' : ''} ${s.remaining <= 0 ? 'disabled' : ''}>${clock(s.starts_at)} – ${clock(s.ends_at)} · ${s.remaining > 0 ? `còn ${s.remaining} chỗ` : 'Đã đầy'}</option>`).join('') || '<option value="">Chưa có khung giờ</option>'}</select><div class="cart-total"><span>Tổng thanh toán</span><span>${vnd(total)}</span></div><button class="button primary block" data-action="checkout" ${!state.cart.length || !state.slotId ? 'disabled' : ''}>${state.user ? 'Đặt món & thanh toán' : 'Đăng nhập để đặt món'}${icon('arrow')}</button><p class="cart-foot">Thanh toán bằng Ví CanteenGo giả lập</p><p class="cart-hint">Bạn có thể hủy khi đơn còn chờ xử lý. Bếp sẽ nhận được ghi chú và thông tin dị ứng của bạn.</p>${state.cart.length ? button('refresh-cart', 'Cập nhật giá và tình trạng món', '', 'tiny block ghost') : ''}`;
}
function refreshCart() { if ($('#cart-anchor')) $('#cart-anchor').innerHTML = cartContent(); }

function authPage(r) {
  const registering = r === 'register';
  return `<section class="auth-page"><div class="card"><div class="eyebrow positive">CANTEENGO</div><h1>${registering ? 'Tạo tài khoản của bạn' : 'Chào mừng bạn trở lại'}</h1><p class="muted">${registering ? 'Một tài khoản cho những bữa ăn thuận tiện hơn.' : 'Đăng nhập để đặt món và theo dõi đơn.'}</p><form id="auth-form" class="form-grid" data-mode="${r}">${registering ? `<label>Họ và tên<input name="name" required minlength="2" maxlength="100" autocomplete="name"></label><label>Loại tài khoản<select name="kind"><option value="school">Sinh viên / giảng viên</option><option value="external">Khách hàng bên ngoài</option></select></label><label>Email<input type="email" name="email" autocomplete="email" placeholder="ban@${esc(state.config.schoolDomain)}"></label><label>Số điện thoại<input name="phone" type="tel" autocomplete="tel" placeholder="0901234567"></label><p class="form-help">Tài khoản trong trường dùng email @${esc(state.config.schoolDomain)}. Khách bên ngoài dùng email hoặc số điện thoại. Bản demo chưa gửi email xác minh.</p>` : '<label>Email hoặc số điện thoại<input name="identity" required autocomplete="username" placeholder="Nhập email hoặc số điện thoại"></label>'}<label>Mật khẩu<input name="password" type="password" required minlength="${registering ? 8 : 1}" maxlength="128" autocomplete="${registering ? 'new-password' : 'current-password'}" placeholder="${registering ? 'Tối thiểu 8 ký tự' : 'Nhập mật khẩu'}"></label><div class="form-error" role="alert"></div><button class="button primary block form-submit">${registering ? 'Tạo tài khoản' : 'Đăng nhập'}${icon('arrow')}</button></form><p class="auth-switch">${registering ? 'Đã có tài khoản? <a href="#login">Đăng nhập</a>' : 'Chưa có tài khoản? <a href="#register">Đăng ký ngay</a>'}</p>${state.config.demoMode && !registering ? `<div class="demo-accounts"><strong class="small">Trải nghiệm với tài khoản demo</strong><div class="actions">${button('demo-login', 'Khách hàng', 'data-role="customer"', 'tiny')}${button('demo-login', 'Nhân viên', 'data-role="staff"', 'tiny')}${button('demo-login', 'Quản trị', 'data-role="admin"', 'tiny')}</div><p class="form-help">Mật khẩu mẫu: Canteen@123 · Dữ liệu được lưu trên máy chủ.</p></div>` : ''}</div></section>`;
}
function orderCard(order, kitchen = false) {
  const total = order.items.reduce((s, i) => s + i.quantity, 0);
  return `<article class="order-card"><div class="order-top"><div><span class="order-code">${code(order.id)}</span><div class="muted small">${kitchen ? esc(order.customer_name) : dt(order.created_at)}</div></div>${badge(order.status)}</div><div class="order-content"><div class="order-meta"><span>${icon('time')}${dt(order.starts_at)} – ${clock(order.ends_at)}</span></div>${order.allergies && kitchen ? `<div class="notice">Dị ứng: ${esc(order.allergies)}</div>` : ''}${order.items.map(i => `<div class="order-item"><div><strong>${i.quantity} ×</strong> ${esc(i.name)}${i.note ? `<small>Ghi chú: ${esc(i.note)}</small>` : ''}</div>${!kitchen ? `<span>${vnd(i.price * i.quantity)}</span>` : ''}</div>`).join('')}${order.status === 'cancelled' ? `<p class="form-help">${esc(order.history.at(-1)?.reason)} · Đã hoàn ${vnd(order.total)}</p>` : ''}</div><div class="order-footer"><strong>${vnd(order.total)} <small class="muted">· ${total} món</small></strong><div class="actions">${button('order-detail', kitchen ? 'Chi tiết' : 'Xem đơn', `data-id="${order.id}"`, 'tiny')}${kitchen ? (order.status === 'pending' ? button('transition', 'Nhận đơn', `data-id="${order.id}" data-status="preparing"`, 'primary tiny') + button('cancel', 'Từ chối', `data-id="${order.id}"`, 'danger tiny') : order.status === 'preparing' ? button('transition', 'Sẵn sàng giao', `data-id="${order.id}" data-status="ready"`, 'success tiny') + button('cancel', 'Hủy đơn', `data-id="${order.id}"`, 'danger tiny') : order.status === 'ready' ? button('complete', 'Giao món', `data-id="${order.id}"`, 'primary tiny') : '') : (order.status === 'pending' ? button('cancel', 'Hủy đơn', `data-id="${order.id}"`, 'danger tiny') : order.status === 'completed' ? button('review', 'Đánh giá', `data-id="${order.id}"`, 'tiny') : '')}</div></div></article>`;
}
function ordersPage() {
  const filtered = state.orders.filter(o => state.orderFilter === 'all' || o.status === state.orderFilter);
  return pageHead('Đơn hàng của tôi', 'Theo dõi bữa ăn từ lúc đặt đến khi nhận tại quầy.', liveBadge()) + `<div class="categories">${[['all', 'Tất cả'], ...Object.entries(statusText)].map(([s, label]) => `<button class="category ${state.orderFilter === s ? 'active' : ''}" data-action="order-filter" data-value="${s}">${label}</button>`).join('')}</div><div class="stack">${filtered.map(o => orderCard(o)).join('') || empty('Chưa có đơn hàng', 'Chọn một món ngon và hẹn giờ nhận đầu tiên.', '<a class="button primary" href="#menu">Khám phá thực đơn</a>')}</div>`;
}
function kitchenPage() {
  return pageHead('Bảng đơn bếp', 'Ưu tiên khung giờ nhận. Kiểm tra ghi chú trước khi chế biến.', liveBadge(), 'TIẾP NHẬN & PHỤC VỤ') + `<div class="kanban">${['pending', 'preparing', 'ready'].map(s => { const group = state.orders.filter(o => o.status === s).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at)); return `<section class="kanban-column"><h2>${statusText[s]} <span class="count">${group.length}</span></h2><div class="stack">${group.map(o => orderCard(o, true)).join('') || empty('Không có đơn', 'Đơn ở trạng thái này sẽ xuất hiện tại đây.')}</div></section>`; }).join('')}</div><div class="section-row section-spaced"><h2>Lịch sử đơn gần đây</h2></div>${table(['Mã đơn', 'Khách hàng', 'Giờ nhận', 'Tổng tiền', 'Trạng thái', ''], state.orders.filter(o => ['completed', 'cancelled'].includes(o.status)).slice(0, 30).map(o => `<tr><td>${code(o.id)}</td><td>${esc(o.customer_name)}</td><td>${dt(o.starts_at)}</td><td>${vnd(o.total)}</td><td>${badge(o.status)}</td><td>${button('order-detail', 'Xem', `data-id="${o.id}"`, 'tiny')}</td></tr>`))}`;
}
function walletPage() {
  return pageHead('Ví CanteenGo', 'Lịch sử thanh toán và hoàn tiền cho từng bữa ăn.') + `<div class="two-columns"><div class="card wallet-card"><div><h2>Số dư khả dụng</h2><strong>${vnd(state.user.balance)}</strong></div><div><small>VÍ GIẢ LẬP · KHÔNG PHẢI TIỀN THẬT</small><p>${esc(state.user.name)}</p></div></div><div class="card"><h2>Nạp ví giả lập</h2>${state.config.demoMode ? `<form id="topup-form" class="form-grid"><label>Số tiền nạp thử<select name="amount"><option value="50000">50.000đ</option><option value="100000" selected>100.000đ</option><option value="200000">200.000đ</option><option value="500000">500.000đ</option></select></label><div class="form-error" role="alert"></div><button class="button primary">${icon('plus')}Nạp thử</button><p class="form-help">Chỉ phục vụ học tập và demo; không kết nối ngân hàng.</p></form>` : '<p>Nạp thử đang tắt. Liên hệ quản trị viên.</p>'}</div></div><div class="section-row section-spaced"><h2>Lịch sử giao dịch</h2><small>Tối đa 300 giao dịch gần nhất</small></div>${table(['Thời gian', 'Giao dịch', 'Mã đơn', 'Số tiền'], (state.payments || []).map(p => `<tr><td>${dt(p.created_at)}</td><td>${({ topup: 'Nạp ví giả lập', payment: 'Thanh toán đơn', refund: 'Hoàn tiền' })[p.type]}</td><td>${p.order_id ? code(p.order_id) : '—'}</td><td class="${p.type === 'payment' ? 'negative' : 'positive'}"><strong>${p.type === 'payment' ? '−' : '+'}${vnd(p.amount)}</strong></td></tr>`))}`;
}
function profilePage() { return pageHead('Hồ sơ của tôi', 'Thông tin liên hệ và dị ứng được hiển thị cho bếp khi xử lý đơn.') + `<div class="two-columns"><div class="card"><form id="profile-form" class="form-grid"><label>Họ và tên<input name="name" required minlength="2" maxlength="100" value="${esc(state.user.name)}"></label><label>Email<input value="${esc(state.user.email || 'Đăng ký bằng SĐT')}" disabled></label><label>Số điện thoại<input name="phone" type="tel" value="${esc(state.user.phone)}"></label><label>Dị ứng / lưu ý thực phẩm<textarea name="allergies" maxlength="500" placeholder="Ví dụ: dị ứng đậu phộng, hải sản…">${esc(state.user.allergies)}</textarea></label><div class="form-error" role="alert"></div><button class="button primary">Lưu thông tin</button></form></div><div class="card"><h2>Thông tin tài khoản</h2><p>${roleText[state.user.role]}</p><p class="muted">${state.user.kind === 'school' ? 'Người dùng trong trường' : 'Tài khoản bên ngoài / vận hành'}</p><p class="form-help">Ghi chú riêng như ít cay, không hành có thể nhập cho từng món trong giỏ hàng.</p></div></div>`; }

function adminMenuPage() {
  return pageHead('Quản lý thực đơn', 'Giá bán, lịch phục vụ và định lượng nguyên liệu cho từng món.', button('edit-dish', icon('plus') + 'Thêm món', '', 'primary')) + table(['Món ăn', 'Danh mục', 'Giá bán', 'Phục vụ', 'Định lượng', 'Thao tác'], state.menu.map(d => `<tr><td>${d.image ? `<img class="mini-image" src="${esc(d.image)}" alt="">` : ''}<strong>${esc(d.name)}</strong></td><td>${esc(d.category)}</td><td>${vnd(d.price)}</td><td><span class="badge ${d.available ? 'green' : 'cancelled'}">${d.available ? 'Đang bán' : 'Tạm hết'}</span><span class="sub">${d.weekdays.map(n => n ? 'T' + (n + 1) : 'CN').join(', ')}</span></td><td>${d.recipe.length ? `${d.recipe.length} nguyên liệu` : '<span class="negative">Chưa thiết lập</span>'}</td><td><div class="actions">${button('edit-dish', 'Sửa', `data-id="${d.id}"`, 'tiny')}${button('recipe', 'Recipe', `data-id="${d.id}"`, 'tiny')}${button('delete-dish', 'Xóa', `data-id="${d.id}"`, 'tiny danger')}</div></td></tr>`));
}
function inventoryPage() {
  const low = state.inventory.filter(i => i.low);
  return pageHead('Kho nguyên liệu', 'Theo dõi tồn kho và truy vết từng lần nhập, xuất, chế biến.', state.user.role === 'admin' ? button('edit-ingredient', icon('plus') + 'Thêm nguyên liệu', '', 'primary') : liveBadge()) + (low.length ? `<div class="notice">${low.length} nguyên liệu chạm hoặc dưới ngưỡng: <strong>${low.map(i => esc(i.name)).join(', ')}</strong>. Kiểm tra trước giờ cao điểm.</div>` : '') + table(['Nguyên liệu', 'Tồn hiện tại', 'Ngưỡng tối thiểu', 'Nhà cung cấp', 'Trạng thái', ''], state.inventory.map(i => `<tr><td><strong>${esc(i.name)}</strong></td><td><strong>${num(i.stock)} ${esc(i.unit)}</strong></td><td>${num(i.minimum)} ${esc(i.unit)}</td><td>${esc(i.supplier_name || 'Chưa gắn')}</td><td><span class="badge ${i.low ? 'low' : 'green'}">${i.low ? 'Cần bổ sung' : 'Đủ tồn'}</span></td><td><div class="actions">${button('adjust', 'Nhập / xuất', `data-id="${i.id}"`, 'tiny')}${state.user.role === 'admin' ? button('edit-ingredient', 'Sửa', `data-id="${i.id}"`, 'tiny') : ''}</div></td></tr>`)) + `<div class="section-row section-spaced"><h2>Nhật ký kho</h2><small>300 bút toán gần nhất</small></div>` + table(['Thời gian', 'Nguyên liệu', 'Nghiệp vụ', 'Số lượng', 'Mã đơn', 'Người thao tác', 'Lý do'], state.movements.map(m => `<tr><td>${dt(m.created_at)}</td><td>${esc(m.name)}</td><td>${moveText[m.type]}</td><td class="${m.quantity > 0 ? 'positive' : 'negative'}">${m.quantity > 0 ? '+' : ''}${num(m.quantity)} ${esc(m.unit)}</td><td>${m.order_id ? code(m.order_id) : '—'}</td><td>${esc(m.actor_name)}</td><td class="wrap">${esc(m.reason)}</td></tr>`));
}
function suppliersPage() { return pageHead('Nhà cung cấp', 'Thông tin nguồn cung để truy xuất nguyên liệu.', button('edit-supplier', icon('plus') + 'Thêm nhà cung cấp', '', 'primary')) + table(['Nhà cung cấp', 'Điện thoại', 'Địa chỉ', ''], state.suppliers.map(s => `<tr><td><strong>${esc(s.name)}</strong></td><td>${esc(s.phone || '—')}</td><td class="wrap">${esc(s.address || '—')}</td><td>${button('edit-supplier', 'Chỉnh sửa', `data-id="${s.id}"`, 'tiny')}</td></tr>`)); }
function usersPage() { return pageHead('Quản lý tài khoản', 'Phân quyền khách hàng, nhân viên và quản trị viên.') + table(['Họ tên', 'Liên hệ', 'Vai trò', 'Trạng thái', ''], state.users.map(u => `<tr><td><strong>${esc(u.name)}</strong></td><td>${esc(u.email || u.phone || '')}</td><td>${roleText[u.role]}</td><td><span class="badge ${u.active ? 'green' : 'cancelled'}">${u.active ? 'Hoạt động' : 'Đã khóa'}</span></td><td>${u.id !== state.user.id ? button('edit-user', 'Phân quyền', `data-id="${u.id}"`, 'tiny') : '<span class="muted">Bạn</span>'}</td></tr>`)) + `<div class="section-row section-spaced"><h2>Lịch sử thay đổi vận hành</h2><small>200 thao tác gần nhất</small></div>` + table(['Thời gian', 'Người thao tác', 'Nghiệp vụ', 'Đối tượng'], state.audit.map(a => `<tr><td>${dt(a.created_at)}</td><td>${esc(a.actor_name)}</td><td>${esc(a.action)}</td><td>${esc(a.entity_id)}</td></tr>`)); }
function reportsPage() {
  const r = state.report;
  const metrics = [['Doanh thu hoàn tất', vnd(r.revenue), 'wallet'], ['Đơn đã hoàn tất', num(r.completed), 'orders'], ['Giá trị đơn trung bình', vnd(r.completed ? r.revenue / r.completed : 0), 'chart'], ['Nguyên liệu cần bổ sung', r.inventory.filter(i => i.stock <= i.minimum).length, 'box']];
  const maxRevenue = Math.max(1, ...r.daily.map(d => d.revenue)); const maxSold = Math.max(1, ...r.dishes.map(d => d.quantity));
  return pageHead('Tổng quan nhà ăn', 'Doanh thu từ đơn hoàn tất và tình hình nguyên liệu.', button('export-report', icon('download') + 'Xuất CSV'), 'BÁO CÁO VẬN HÀNH') + `<form id="report-form" class="toolbar"><label>Từ ngày <input type="date" name="from" value="${state.reportFrom}" required></label><label>Đến ngày <input type="date" name="to" value="${state.reportTo}" required></label><button class="button primary">Xem báo cáo</button><div class="form-error" role="alert"></div></form><div class="metrics">${metrics.map(([label, value, ico]) => `<div class="metric">${icon(ico)}<small>${label}</small><strong>${value}</strong></div>`).join('')}</div><div class="two-columns"><section class="card"><h2>Doanh thu theo ngày</h2>${r.daily.length ? `<div class="chart">${r.daily.map(d => `<div class="chart-column"><strong>${num(d.revenue / 1000)}k</strong><div class="bar" data-height="${Math.max(2, d.revenue / maxRevenue * 160)}"></div><small>${d.date.slice(8)}/${d.date.slice(5, 7)}</small></div>`).join('')}</div>` : empty('Chưa có doanh thu', 'Đơn hoàn tất trong khoảng ngày sẽ được thống kê tại đây.')}</section><section class="card"><h2>Món được chọn nhiều nhất</h2>${r.dishes.filter(d => d.quantity > 0).slice(0, 5).map((d, i) => `<div class="rank"><span>${String(i + 1).padStart(2, '0')}</span><div><strong>${esc(d.name)}</strong><div class="progress-track"><div class="progress-fill" data-width="${d.quantity / maxSold * 100}"></div></div><small>${vnd(d.revenue)}</small></div><b>${d.quantity} suất</b></div>`).join('') || '<p class="muted">Chưa có món từ đơn hoàn tất.</p>'}</section></div><div class="section-row section-spaced"><h2>Thống kê tất cả món</h2></div>${table(['Món ăn', 'Số suất hoàn tất', 'Doanh thu'], r.dishes.map(d => `<tr><td>${esc(d.name)}</td><td>${d.quantity}</td><td>${vnd(d.revenue)}</td></tr>`))}<div class="section-row section-spaced"><h2>Đối chiếu kho và tiêu hao</h2></div><p class="form-help">Tiêu hao, hoàn kho và xuất thủ công theo khoảng ngày. Tồn và chênh lệch sổ sách là tại thời điểm hiện tại. Xuất thủ công cần xem lý do trong nhật ký, không tự coi là thất thoát.</p>${table(['Nguyên liệu', 'Tồn hiện tại', 'Đã chế biến', 'Đã hoàn', 'Xuất thủ công', 'Chênh lệch sổ'], r.inventory.map(i => `<tr><td>${esc(i.name)} (${esc(i.unit)})</td><td>${num(i.stock)}</td><td>${num(i.consumed)}</td><td>${num(i.restored)}</td><td>${num(i.manual_out)}</td><td class="${i.discrepancy ? 'negative' : 'positive'}">${num(i.discrepancy)}</td></tr>`))}`;
}
function applyBars() { document.querySelectorAll('[data-height]').forEach(e => e.style.height = e.dataset.height + 'px'); document.querySelectorAll('[data-width]').forEach(e => e.style.width = e.dataset.width + '%'); }

function dishForm(id) {
  const d = state.menu.find(d => d.id === id) || { name: '', category: 'Cơm', price: 30000, description: '', components: '', image: '', available: 1, weekdays: [0, 1, 2, 3, 4, 5, 6] };
  modalOpen(id ? 'Chỉnh sửa món ăn' : 'Thêm món ăn', `<form id="dish-form" class="form-grid" data-id="${id || ''}"><label>Tên món<input name="name" required maxlength="100" value="${esc(d.name)}"></label><div class="form-row"><label>Danh mục<input name="category" required maxlength="60" value="${esc(d.category)}" list="categories"><datalist id="categories"><option>Cơm</option><option>Bún & phở</option><option>Ăn nhẹ</option><option>Đồ uống</option></datalist></label><label>Giá bán (VND)<input name="price" type="number" required min="1" max="100000000" step="1" value="${d.price}"></label></div><label>Mô tả<textarea name="description" maxlength="1000">${esc(d.description)}</textarea></label><label>Thành phần / dị ứng<textarea name="components" maxlength="500">${esc(d.components)}</textarea></label><label>Ảnh món (URL HTTPS hoặc /assets/)<input name="image" value="${esc(d.image)}"></label><label>Trạng thái<select name="available"><option value="true" ${d.available ? 'selected' : ''}>Đang bán</option><option value="false" ${!d.available ? 'selected' : ''}>Tạm hết / ngừng bán</option></select></label><label>Ngày phục vụ</label><div class="checkbox-row">${[1, 2, 3, 4, 5, 6, 0].map(n => `<label><input type="checkbox" name="weekday" value="${n}" ${d.weekdays.includes(n) ? 'checked' : ''}>${n ? 'T' + (n + 1) : 'CN'}</label>`).join('')}</div><div class="form-error" role="alert"></div><button class="button primary">Lưu món ăn</button></form>`);
}
function recipeLine(line = {}) {
  const selected = state.inventory.find(i => i.id === line.ingredient_id) || state.inventory[0];
  return `<div class="recipe-row"><select name="ingredient" aria-label="Nguyên liệu">${state.inventory.map(i => `<option value="${i.id}" ${selected?.id === i.id ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}</select><input name="quantity" type="number" required min="0.001" max="100000000" step="0.001" value="${line.quantity || 1}" aria-label="Định lượng một suất"><span class="unit">${esc(selected?.unit || '')}</span><button type="button" class="icon-button" data-action="remove-recipe-line" aria-label="Bỏ dòng">×</button></div>`;
}
function recipeForm(id) {
  const d = state.menu.find(d => d.id === id);
  if (!state.inventory.length) { toast('Thêm nguyên liệu vào kho trước khi thiết lập Recipe.', true); return; }
  modalOpen('Định lượng · ' + esc(d.name), `<p class="muted small">Lượng nguyên liệu cho <strong>1 suất</strong>. Bếp trừ kho khi nhận đơn. Công thức mới không thay đổi bút toán đã ghi.</p><form id="recipe-form" class="form-grid" data-id="${id}"><div id="recipe-lines">${(d.recipe.length ? d.recipe : [{}]).map(recipeLine).join('')}</div>${button('add-recipe-line', icon('plus') + 'Thêm nguyên liệu', '', 'tiny')}<div class="form-error" role="alert"></div><button class="button primary">Lưu định lượng</button></form>`);
}
function ingredientForm(id) {
  const i = state.inventory.find(i => i.id === id) || { name: '', unit: 'g', minimum: 0, supplier_id: '' };
  modalOpen(id ? 'Chỉnh sửa nguyên liệu' : 'Thêm nguyên liệu', `<form id="ingredient-form" class="form-grid" data-id="${id || ''}"><label>Tên nguyên liệu<input name="name" required maxlength="100" value="${esc(i.name)}"></label><div class="form-row"><label>Đơn vị<select name="unit" ${id ? 'disabled' : ''}>${['g', 'ml', 'cái'].map(u => `<option ${u === i.unit ? 'selected' : ''}>${u}</option>`).join('')}</select></label><label>Ngưỡng cảnh báo<input name="minimum" required type="number" min="0" max="100000000" step="0.001" value="${i.minimum}"></label></div><label>Nhà cung cấp<select name="supplier_id"><option value="">Chưa gắn nhà cung cấp</option>${state.suppliers.map(s => `<option value="${s.id}" ${s.id === i.supplier_id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label><p class="form-help">Nguyên liệu mới có tồn 0. Dùng Nhập / xuất để ghi nhận số lượng và lý do. Đơn vị không đổi sau khi tạo.</p><div class="form-error" role="alert"></div><button class="button primary">Lưu nguyên liệu</button></form>`);
}
function adjustmentForm(id) {
  const i = state.inventory.find(i => i.id === id);
  modalOpen('Nhập / xuất · ' + esc(i.name), `<p>Tồn hiện tại: <strong>${num(i.stock)} ${esc(i.unit)}</strong></p><form id="adjust-form" class="form-grid" data-id="${id}" data-reference="${crypto.randomUUID()}"><label>Nghiệp vụ<select name="type"><option value="in">Nhập bổ sung</option><option value="out">Xuất thủ công</option></select></label><label>Số lượng (${esc(i.unit)})<input type="number" name="quantity" min="0.001" max="100000000" step="0.001" required></label><label>Lý do / mã phiếu<textarea name="reason" required maxlength="300" placeholder="Ví dụ: Nhập theo phiếu NK-001 từ nhà cung cấp…"></textarea></label><div class="form-error" role="alert"></div><button class="button primary">Ghi nhận giao dịch kho</button></form>`);
}
function supplierForm(id) { const s = state.suppliers.find(s => s.id === id) || {}; modalOpen(id ? 'Sửa nhà cung cấp' : 'Thêm nhà cung cấp', `<form id="supplier-form" class="form-grid" data-id="${id || ''}"><label>Tên nhà cung cấp<input name="name" required maxlength="100" value="${esc(s.name)}"></label><label>Điện thoại<input name="phone" type="tel" maxlength="30" value="${esc(s.phone)}"></label><label>Địa chỉ<textarea name="address" maxlength="300">${esc(s.address)}</textarea></label><div class="form-error" role="alert"></div><button class="button primary">Lưu nhà cung cấp</button></form>`); }
function userForm(id) { const u = state.users.find(u => u.id === id); modalOpen('Tài khoản · ' + esc(u.name), `<form id="user-form" class="form-grid" data-id="${id}"><label>Vai trò<select name="role">${Object.entries(roleText).map(([r, label]) => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>Trạng thái<select name="active"><option value="true" ${u.active ? 'selected' : ''}>Hoạt động</option><option value="false" ${!u.active ? 'selected' : ''}>Khóa tài khoản</option></select></label><p class="form-help">Thay đổi này kết thúc các phiên đăng nhập hiện có của tài khoản.</p><div class="form-error" role="alert"></div><button class="button primary">Lưu phân quyền</button></form>`); }
async function orderDetail(id) {
  const o = await api('/orders/' + id);
  modalOpen('Chi tiết ' + code(id), `${orderCard(o)}<div class="timeline">${o.history.map(h => `<div class="timeline-entry"><strong>${statusText[h.status]}</strong><small>${dt(h.created_at)} · ${esc(h.actor_name)}</small>${h.reason ? `<p>${esc(h.reason)}</p>` : ''}</div>`).join('')}</div>${state.user.role !== 'customer' ? `<p class="form-help">Liên hệ: ${esc(o.phone || 'Chưa có số điện thoại')}</p>` : ''}`);
}
function cancelForm(id) {
  const o = state.orders.find(o => o.id === id);
  modalOpen('Hủy đơn ' + code(id), `<p>Hoàn lại <strong>${vnd(o.total)}</strong> vào ví và giải phóng chỗ nhận.${o.status === 'preparing' ? ' Nguyên liệu đã trừ sẽ được hoàn lại theo nghiệp vụ giả lập trong đặc tả.' : ''}</p><form id="cancel-form" class="form-grid" data-id="${id}" data-status="${o.status}"><label>Lý do hủy<textarea name="reason" required maxlength="300" placeholder="Nhập lý do hủy đơn…"></textarea></label><div class="form-error" role="alert"></div><button class="button danger">Xác nhận hủy và hoàn tiền</button></form>`);
}
function reviewForm(id) {
  const o = state.orders.find(o => o.id === id); const dishes = [...new Map(o.items.map(i => [i.dish_id, i])).values()].filter(i => !o.reviews.some(r => r.dish_id === i.dish_id));
  if (!dishes.length) { toast('Bạn đã đánh giá tất cả món trong đơn này.'); return; }
  modalOpen('Đánh giá bữa ăn', `<form id="review-form" class="form-grid" data-id="${id}"><label>Món ăn<select name="dish_id">${dishes.map(d => `<option value="${d.dish_id}">${esc(d.name)}</option>`).join('')}</select></label><label>Số sao<select name="rating"><option value="5">★★★★★ · Rất hài lòng</option><option value="4">★★★★☆ · Hài lòng</option><option value="3">★★★☆☆ · Bình thường</option><option value="2">★★☆☆☆ · Chưa hài lòng</option><option value="1">★☆☆☆☆ · Không hài lòng</option></select></label><label>Nhận xét<textarea name="comment" maxlength="1000" placeholder="Chia sẻ trải nghiệm của bạn…"></textarea></label><div class="form-error" role="alert"></div><button class="button primary">Gửi đánh giá</button></form>`);
}
async function loggedIn(user) {
  const guestCart = state.cart; state.user = user; loadCart();
  if (user.role === 'customer' && !state.cart.length && guestCart.length) { state.cart = guestCart; saveCart(); }
  connectEvents(); modalClose(); location.hash = user.role === 'admin' ? 'reports' : user.role === 'staff' ? 'kitchen' : 'menu'; await render();
}
async function refreshMe() { state.user = (await api('/me')).user; if ($('#wallet-balance') && state.user) $('#wallet-balance').textContent = vnd(state.user.balance); }

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-action]'); if (!el || el.disabled) return; e.preventDefault();
  const action = el.dataset.action, id = el.dataset.id; const index = +el.dataset.index;
  try {
    if (state.user && localStorage.getItem(pendingKey()) && ['add','remove','quantity','refresh-cart','checkout'].includes(action)) {
      const order = await settleCheckout(); modalClose(); location.hash = 'orders'; await render(); toast('Đã đối chiếu giao dịch trước đó · ' + code(order.id)); return;
    }
    if (action === 'skip-main') { $('#main')?.focus(); $('#main')?.scrollIntoView(); }
    else if (action === 'close') modalClose();
    else if (action === 'reload') await render();
    else if (action === 'logout') { await api('/auth/logout', 'POST', {}); events?.close(); state.user = null; state.cart = []; state.live = false; loadCart(); location.hash = 'login'; await render(); }
    else if (action === 'demo-login') {
      el.disabled = true; const email = { customer: 'student@school.edu.vn', staff: 'staff@canteengo.vn', admin: 'admin@canteengo.vn' }[el.dataset.role];
      const result = await api('/auth/login', 'POST', { identity: email, password: 'Canteen@123' }); await loggedIn(result.user);
    } else if (action === 'scroll-cart') $('#cart-anchor')?.scrollIntoView({ behavior: 'smooth' });
    else if (action === 'category') { state.category = el.dataset.value; $('.categories').querySelectorAll('button').forEach(b => b.classList.toggle('active', b === el)); $('#dish-grid').innerHTML = dishCards(); }
    else if (action === 'add') {
      if (state.user && state.user.role !== 'customer') { toast('Đăng nhập tài khoản khách hàng để đặt món.', true); return; }
      const d = state.menu.find(d => d.id === id); if (!d?.serving) throw new Error('Món hiện không phục vụ.');
      const item = state.cart.find(i => i.dish_id === id);
      if (item) { if (item.quantity >= 99) throw new Error('Tối đa 99 suất mỗi dòng món.'); item.quantity++; } else state.cart.push({ dish_id: id, name: d.name, price: d.price, quantity: 1, note: '' });
      saveCart(); refreshCart(); toast('Đã thêm ' + d.name); if (modal.open) modalClose();
    } else if (action === 'quantity') { if (state.cart[index].quantity + +el.dataset.delta < 1) state.cart.splice(index, 1); else state.cart[index].quantity += +el.dataset.delta; saveCart(); refreshCart(); }
    else if (action === 'remove') { state.cart.splice(index, 1); saveCart(); refreshCart(); }
    else if (action === 'refresh-cart') {
      state.menu = await api('/menu?date=' + state.date); let removed = 0;
      state.cart = state.cart.filter(i => { const d = state.menu.find(d => d.id === i.dish_id && d.serving); if (!d) { removed++; return false; } i.price = d.price; i.name = d.name; return true; });
      saveCart(); refreshCart(); $('#dish-grid').innerHTML = dishCards(); toast('Đã cập nhật giá.' + (removed ? ` Đã bỏ ${removed} món không còn phục vụ.` : ''));
    } else if (action === 'dish') {
      const d = state.menu.find(d => d.id === id); const reviews = await api('/dishes/' + id + '/reviews');
      modalOpen(esc(d.name), `${d.image ? `<img class="modal-photo" src="${esc(d.image)}" alt="Ảnh minh họa ${esc(d.category)}">` : ''}<div class="price">${vnd(d.price)}</div><p>${esc(d.description)}</p><p class="small"><strong>Thành phần:</strong> ${esc(d.components || 'Chưa cập nhật')}</p><p class="form-help">Ảnh minh họa. Ghi chú dị ứng trong hồ sơ để bếp biết khi xử lý.</p>${button('add', icon('plus') + 'Thêm vào giỏ', `data-id="${id}" ${d.serving ? '' : 'disabled'}`, 'primary block')}<h3 class="section-spaced">Đánh giá (${reviews.length})</h3>${reviews.map(r => `<div class="timeline-entry section-spaced"><strong>${'★'.repeat(r.rating)} · ${esc(r.name)}</strong><p>${esc(r.comment)}</p><small>${dt(r.created_at)}</small></div>`).join('') || '<p class="muted small">Chưa có đánh giá.</p>'}`);
    } else if (action === 'checkout') {
      if (!state.user) { location.hash = 'login'; return; }
      const slot = state.slots.find(s => s.id === state.slotId); const total = state.cart.reduce((s, i) => s + i.price * i.quantity, 0);
      modalOpen('Xác nhận đặt món', `<p>Nhận tại quầy lúc <strong>${dt(slot.starts_at)} – ${clock(slot.ends_at)}</strong>.</p><div class="stack">${state.cart.map(i => `<div class="order-item"><span>${i.quantity} × ${esc(i.name)}${i.note ? `<small>${esc(i.note)}</small>` : ''}</span><strong>${vnd(i.quantity * i.price)}</strong></div>`).join('')}</div><div class="cart-total"><span>Tổng thanh toán</span><span>${vnd(total)}</span></div><p class="small muted">Số dư ví: ${vnd(state.user.balance)}. Bạn chỉ tự hủy được khi bếp chưa nhận đơn.</p><form id="checkout-form" class="form-grid"><div class="form-error" role="alert"></div><button class="button primary">Xác nhận thanh toán ${vnd(total)}</button></form>`);
    } else if (action === 'order-filter') { state.orderFilter = el.dataset.value; $('#page').innerHTML = ordersPage(); }
    else if (action === 'order-detail') await orderDetail(id);
    else if (action === 'cancel') cancelForm(id);
    else if (action === 'review') reviewForm(id);
    else if (action === 'transition') { el.disabled = true; const o = state.orders.find(o => o.id === id); await api('/orders/' + id + '/status', 'POST', { status: el.dataset.status, expected_status: o.status }); toast('Đã cập nhật trạng thái đơn.'); await render(); }
    else if (action === 'complete') { const o = state.orders.find(o => o.id === id); modalOpen('Đối chiếu mã nhận món', `<p>Yêu cầu khách đọc mã đơn đầy đủ. Chỉ xác nhận sau khi đã giao đủ món.</p><p><strong>${code(o.id)}</strong> · ${esc(o.customer_name)}</p><form id="complete-form" class="form-grid" data-id="${id}" data-status="${o.status}"><label>Nhập mã nhận món<input name="code" required autocomplete="off" placeholder="CG-XXXXXXXX"></label><div class="form-error" role="alert"></div><button class="button primary">Đã giao đủ món</button></form>`); }
    else if (action === 'edit-dish') dishForm(id);
    else if (action === 'recipe') recipeForm(id);
    else if (action === 'add-recipe-line') $('#recipe-lines').insertAdjacentHTML('beforeend', recipeLine());
    else if (action === 'remove-recipe-line') el.closest('.recipe-row').remove();
    else if (action === 'delete-dish') { const d = state.menu.find(d => d.id === id); modalOpen('Xóa món khỏi thực đơn', `<p>Xóa <strong>${esc(d.name)}</strong>? Lịch sử đơn hàng và giao dịch vẫn được giữ.</p><form id="delete-dish-form" class="form-grid" data-id="${id}"><div class="form-error" role="alert"></div><button class="button danger">Xác nhận xóa món</button></form>`); }
    else if (action === 'edit-ingredient') ingredientForm(id);
    else if (action === 'adjust') adjustmentForm(id);
    else if (action === 'edit-supplier') supplierForm(id);
    else if (action === 'edit-user') userForm(id);
    else if (action === 'export-report') exportReport();
  } catch (error) { toast(error.message, true); if (error.status === 409 && ['transition', 'complete'].includes(action)) await render(); }
  finally { if (el.isConnected) el.disabled = false; }
});

document.addEventListener('input', e => {
  if (e.target.id === 'search') { state.search = e.target.value; $('#dish-grid').innerHTML = dishCards(); }
  if (e.target.dataset.note !== undefined) { state.cart[+e.target.dataset.note].note = e.target.value; saveCart(); }
});
document.addEventListener('change', async e => {
  try {
    if (e.target.id === 'price-filter') { state.price = e.target.value; $('#dish-grid').innerHTML = dishCards(); }
    if (e.target.id === 'pickup-date') { state.date = e.target.value; saveCart(); state.menu = await api('/menu?date=' + state.date); refreshCart(); $('#dish-grid').innerHTML = dishCards(); }
    if (e.target.id === 'pickup-slot') { state.slotId = e.target.value; saveCart(); }
    if (e.target.name === 'ingredient') { const ingredient = state.inventory.find(i => i.id === e.target.value); e.target.closest('.recipe-row').querySelector('.unit').textContent = ingredient.unit; }
  } catch (error) { toast(error.message, true); }
});

document.addEventListener('submit', async e => {
  const form = e.target; if (!form.id) return; e.preventDefault(); if (form.dataset.busy) return;
  form.dataset.busy = '1'; const submit = form.querySelector('button:not([type="button"])'); if (submit) submit.disabled = true;
  const err = form.querySelector('.form-error'); if (err) err.textContent = '';
  const fd = new FormData(form), data = Object.fromEntries(fd.entries()), id = form.dataset.id;
  try {
    if (form.id === 'auth-form') { const result = await api('/auth/' + (form.dataset.mode === 'register' ? 'register' : 'login'), 'POST', data); await loggedIn(result.user); return; }
    if (form.id === 'checkout-form') {
      state.checkoutRef ||= crypto.randomUUID(); saveCart(false);
      const order = await settleCheckout({ items: state.cart.map(({ dish_id, quantity, price, note }) => ({ dish_id, quantity, price, note })), slot_id: state.slotId, reference: state.checkoutRef });
      state.cart = []; saveCart(); modalClose(); await refreshMe(); location.hash = 'orders'; toast(`Đặt món thành công · ${code(order.id)}`); await render(); return;
    }
    if (form.id === 'topup-form') { form.dataset.reference ||= crypto.randomUUID(); await api('/wallet/topup', 'POST', { amount: +data.amount, reference: form.dataset.reference }); await refreshMe(); }
    else if (form.id === 'profile-form') state.user = await api('/profile', 'PUT', data);
    else if (form.id === 'cancel-form') { await api('/orders/' + id + '/status', 'POST', { status: 'cancelled', expected_status: form.dataset.status, reason: data.reason }); await refreshMe(); }
    else if (form.id === 'complete-form') { if (data.code.trim().toUpperCase() !== code(id)) throw new Error('Mã nhận món không khớp.'); await api('/orders/' + id + '/status', 'POST', { status: 'completed', expected_status: form.dataset.status }); }
    else if (form.id === 'review-form') await api('/orders/' + id + '/reviews', 'POST', { ...data, rating: +data.rating });
    else if (form.id === 'dish-form') await api('/admin/menu' + (id ? '/' + id : ''), id ? 'PUT' : 'POST', { ...data, price: +data.price, available: data.available === 'true', weekdays: fd.getAll('weekday').map(Number) });
    else if (form.id === 'recipe-form') {
      const lines = [...form.querySelectorAll('.recipe-row')].map(row => ({ ingredient_id: row.querySelector('select').value, quantity: +row.querySelector('input').value, unit: row.querySelector('.unit').textContent }));
      await api('/admin/recipes/' + id, 'PUT', { lines });
    } else if (form.id === 'delete-dish-form') await api('/admin/menu/' + id, 'DELETE', {});
    else if (form.id === 'ingredient-form') await api('/admin/ingredients' + (id ? '/' + id : ''), id ? 'PUT' : 'POST', { ...data, minimum: +data.minimum, unit: form.querySelector('[name="unit"]').value });
    else if (form.id === 'adjust-form') await api('/inventory/adjust', 'POST', { ...data, quantity: +data.quantity, ingredient_id: id, reference: form.dataset.reference });
    else if (form.id === 'supplier-form') await api('/admin/suppliers' + (id ? '/' + id : ''), id ? 'PUT' : 'POST', data);
    else if (form.id === 'user-form') await api('/admin/users/' + id, 'PUT', { role: data.role, active: data.active === 'true' });
    else if (form.id === 'report-form') { if (data.from > data.to) throw new Error('Ngày bắt đầu không được sau ngày kết thúc.'); state.reportFrom = data.from; state.reportTo = data.to; await render(); return; }
    else return;
    modalClose(); toast('Đã lưu thành công.'); await render();
  } catch (error) { if (err) err.textContent = error.message; else toast(error.message, true); if (form.id === 'checkout-form' && error.status && error.status !== 500) { state.checkoutRef = null; saveCart(false); } }
  finally { delete form.dataset.busy; if (submit) submit.disabled = false; }
});

function exportReport() {
  const r = state.report; const rows = [['Báo cáo CanteenGo', r.from, r.to], ['Doanh thu hoàn tất', r.revenue], ['Số đơn hoàn tất', r.completed], [], ['Món', 'Số suất', 'Doanh thu'], ...r.dishes.map(d => [d.name, d.quantity, d.revenue]), [], ['Nguyên liệu', 'Đơn vị', 'Tồn hiện tại', 'Chế biến', 'Hoàn kho', 'Xuất thủ công', 'Chênh lệch sổ'], ...r.inventory.map(i => [i.name, i.unit, i.stock, i.consumed, i.restored, i.manual_out, i.discrepancy])];
  const csv = '\ufeff' + rows.map(row => row.map(v => { let cell = String(v ?? ''); if (/^[=+@-]/.test(cell)) cell = "'" + cell; return '"' + cell.replace(/"/g, '""') + '"'; }).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = `CanteenGo-${r.from}-${r.to}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function connectEvents() {
  events?.close(); if (!state.user) return;
  let refreshing = false;
  if (state.config.realtimeMode === 'poll') {
    events = new EventTarget();
    const currentEvents = events;
    const timer = setInterval(() => {
      if (!document.hidden) currentEvents.dispatchEvent(new Event('refresh'));
    }, 5000);
    events.close = () => clearInterval(timer);
    queueMicrotask(() => currentEvents.dispatchEvent(new Event('connected')));
  } else events = new EventSource('/api/events');
  const updateLive = () => document.querySelectorAll('.live').forEach(el => { el.classList.toggle('offline', !state.live); el.textContent = state.live ? 'Đang cập nhật trực tiếp' : 'Mất kết nối · sẽ thử lại'; });
  events.addEventListener('connected', () => { state.live = true; updateLive(); events.dispatchEvent(new Event('refresh')); });
  events.onerror = () => { state.live = false; updateLive(); };
  events.addEventListener('refresh', () => {
    clearTimeout(refreshTimer); refreshTimer = setTimeout(async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        await refreshMe(); if (!state.user) { events.close(); if (!['login', 'register', 'menu'].includes(route())) location.hash = 'login'; return; }
        if (modal.open || document.activeElement?.matches('input,select,textarea')) return;
        if (['orders', 'kitchen'].includes(route())) {
          const old = new Map(state.orders.map(o => [o.id, o.status])); state.orders = await api('/orders');
          if (state.user.role === 'customer' && state.orders.some(o => o.status === 'ready' && old.get(o.id) && old.get(o.id) !== 'ready')) toast('Món của bạn đã sẵn sàng. Ghé quầy nhận món nhé!');
          $('#page').innerHTML = route() === 'orders' ? ordersPage() : kitchenPage();
        } else if (route() === 'menu') { [state.menu, state.slots] = await Promise.all([api('/menu?date=' + state.date), api('/slots')]); $('#dish-grid').innerHTML = dishCards(); refreshCart(); }
        else if (['inventory', 'wallet', 'reports'].includes(route())) await render();
        state.live = true; updateLive();
      } catch { state.live = false; updateLive(); }
      finally { refreshing = false; }
    }, 300);
  });
}
window.addEventListener('hashchange', () => { modalClose(); render(); window.scrollTo(0, 0); });
document.addEventListener('error', e => { if (e.target.tagName === 'IMG' && !e.target.dataset.failed) { e.target.dataset.failed = '1'; e.target.src = '/assets/fallback.svg'; } }, true);
async function init() {
  try { [state.config, { user: state.user }] = await Promise.all([api('/config'), api('/me')]); state.date = state.config.today; loadCart(); connectEvents(); await render();
    if (state.user?.role === 'customer' && localStorage.getItem(pendingKey())) {
      try { const order = await settleCheckout(); location.hash = 'orders'; toast('Đã khôi phục kết quả thanh toán · ' + code(order.id)); }
      catch (error) { toast('Đối chiếu giao dịch: ' + error.message, true); }
    }
  }
  catch (error) { $('#app').innerHTML = `<main class="workspace">${empty('Chưa kết nối được CanteenGo', error.message, '<a class="button primary" href="/">Thử lại</a>')}</main>`; }
}
init();


