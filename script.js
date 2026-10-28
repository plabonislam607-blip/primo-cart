/* ================================================================
   PRIMO CART — User Panel Logic (ES Module + Firebase Modular SDK)
   ================================================================ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, sendPasswordResetEmail, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase, ref, onValue, get, set, update, push, remove, query,
  orderByChild, equalTo, serverTimestamp, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

/* ================================================================
   🔧 FIREBASE CONFIG
   ================================================================ */
const firebaseConfig = {
  apiKey: "AIzaSyAp6PxRCBTksBH3hWL2LoKn1VtCvdft7Ws",
  authDomain: "primo-cart.firebaseapp.com",
  databaseURL: "https://primo-cart-default-rtdb.firebaseio.com",
  projectId: "primo-cart",
  storageBucket: "primo-cart.firebasestorage.app",
  messagingSenderId: "630474740944",
  appId: "1:630474740944:web:e9ec3ff5890b6af4fc3ad5",
  measurementId: "G-4TZVMLMHYV"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getDatabase(app);

/* ================================================================
   GLOBAL STATE
   ================================================================ */
const S = {
  user: null,
  profile: null,
  products: {},
  categories: {},
  banners: {},
  coupons: {},
  settings: { store:{}, payment:{}, delivery:{} },
  cart: [],
  wishlist: {},
  notifications: {},
  userNotifs: {},
  orders: {},
  view: 'home',
  currentCat: null,
  searchQ: '',
  shopFilters: { cat:'', brand:'', sort:'new', min:0, max:999999 },
  returnTo: null,
  unsubs: []
};

/* ================================================================
   HELPERS
   ================================================================ */
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s == null ? '' : s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&#39;');

function num(v){ const n = Number(v); return isNaN(n) ? 0 : n; }
function money(n){
  return '৳' + num(n).toLocaleString('en-BD', {maximumFractionDigits:0});
}
function discountPct(now, old){
  now = num(now); old = num(old);
  if(!old || old <= now) return 0;
  return Math.round(((old-now)/old)*100);
}
function timeAgo(ts){
  if(!ts) return '';
  const d = Date.now() - ts;
  if(d < 60000) return 'এইমাত্র';
  const m = Math.floor(d/60000);
  if(m < 60) return m+' মিনিট আগে';
  const h = Math.floor(d/3600000);
  if(h < 24) return h+' ঘণ্টা আগে';
  const day = Math.floor(d/86400000);
  if(day < 30) return day+' দিন আগে';
  return new Date(ts).toLocaleDateString('bn-BD', {day:'numeric',month:'short',year:'numeric'});
}
function fmtDate(ts){
  if(!ts) return '—';
  return new Date(ts).toLocaleString('bn-BD',
    {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
}
function uid(){ return Math.random().toString(36).slice(2,10); }
function orderId(){
  const d = new Date();
  const s = d.getFullYear().toString().slice(-2) +
    String(d.getMonth()+1).padStart(2,'0') +
    String(d.getDate()).padStart(2,'0');
  return 'PC' + s + Math.floor(Math.random()*9000 + 1000);
}
function toast(msg, type){
  const el = document.createElement('div');
  el.className = 'toast ' + (type || '');
  el.innerHTML = '<span class="ti">' +
    (type === 'ok' ? '✓' : type === 'err' ? '✕' : type === 'warn' ? '⚠' : 'ℹ') +
    '</span><span>' + esc(msg) + '</span>';
  $('#toasts').appendChild(el);
  setTimeout(()=>{
    el.style.transition = 'opacity .25s, transform .25s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(10px)';
    setTimeout(()=>el.remove(), 280);
  }, 3000);
}
function fbErr(e){
  const c = e?.code || '';
  const map = {
    'auth/invalid-email':'ইমেইল সঠিক নয়।',
    'auth/user-not-found':'এই ইমেইলে অ্যাকাউন্ট নেই।',
    'auth/wrong-password':'পাসওয়ার্ড ভুল।',
    'auth/invalid-credential':'ইমেইল বা পাসওয়ার্ড ভুল।',
    'auth/email-already-in-use':'এই ইমেইল ইতিমধ্যেই ব্যবহৃত।',
    'auth/weak-password':'পাসওয়ার্ড কমপক্ষে ৬ অক্ষর হতে হবে।',
    'auth/too-many-requests':'অনেকবার চেষ্টা হয়েছে, কিছুক্ষণ পরে আবার চেষ্টা করুন।',
    'auth/network-request-failed':'নেটওয়ার্ক সমস্যা।',
    'auth/operation-not-allowed':'Firebase-এ Email/Password লগইন চালু করুন।',
    'PERMISSION_DENIED':'অনুমতি নেই। Rules চেক করুন।',
    'permission-denied':'অনুমতি নেই। Rules চেক করুন।'
  };
  return map[c] || e?.message || 'একটি সমস্যা হয়েছে।';
}
function productImage(p){
  const imgs = Array.isArray(p.images) ? p.images : (p.images ? [p.images] : []);
  const first = imgs.find(x => x && /^https?:\/\//i.test(x));
  return first || (p.image && /^https?:\/\//i.test(p.image) ? p.image : '');
}
function productImages(p){
  let imgs = [];
  if(Array.isArray(p.images)) imgs = p.images;
  else if(typeof p.images === 'string') imgs = p.images.split(/[\n,]+/);
  else if(p.image) imgs = [p.image];
  return imgs.map(x=>String(x||'').trim()).filter(x => /^https?:\/\//i.test(x));
}
function imgFallback(name){
  return '<div class="ph">📦</div>';
}

/* ================================================================
   CONFIRM
   ================================================================ */
let _cfResolve = null;
function confirmDlg(title, msg){
  $('#cfTitle').textContent = title || 'নিশ্চিত করুন';
  $('#cfMsg').textContent = msg || '';
  $('#ovConfirm').classList.add('on');
  return new Promise(r => { _cfResolve = r; });
}
window.cfClose = v => {
  $('#ovConfirm').classList.remove('on');
  if(_cfResolve){ _cfResolve(v); _cfResolve = null; }
};
$('#cfOk').addEventListener('click', ()=>window.cfClose(true));

/* ================================================================
   ROUTER
   ================================================================ */
window.go = function(view){
  S.view = view;
  $$('.view').forEach(v => v.classList.add('hide'));
  const el = document.getElementById('v-' + view);
  if(el) el.classList.remove('hide');
  $$('.bnav .ni').forEach(b => b.classList.toggle('on',
    b.dataset.v === view || (view === 'profile' && b.dataset.v === 'profile')
  ));

  if(view === 'home')         renderHome();
  if(view === 'shop')         renderShop();
  if(view === 'search')       { setTimeout(()=>$('#searchMain')?.focus(), 100); renderSearchResults(); }
  if(view === 'categories')   renderCategories();
  if(view === 'wishlist')     renderWishlist();
  if(view === 'notifications')renderNotifications();
  if(view === 'orders')       renderOrders();
  if(view === 'profile')      renderProfile();

  window.scrollTo({ top:0, behavior:'smooth' });
};

/* ================================================================
   SETTINGS / BRANDING
   ================================================================ */
function applyBranding(){
  const s = S.settings.store || {};
  const name = s.name || 'Primo Cart';
  $('#brandName').textContent = name;
  $('#footName').textContent = name;
  $('#copyName').textContent = name;
  document.title = name + ' — প্রিমিয়াম অনলাইন শপ';

  const logo = s.logo;
  if(logo && /^https?:\/\//i.test(logo)){
    $('#brandLogo').innerHTML = `<img src="${esc(logo)}" alt="" onerror="this.parentNode.textContent='P'">`;
    $('#footLogo').innerHTML = `<img src="${esc(logo)}" alt="" onerror="this.parentNode.textContent='P'">`;
  } else {
    $('#brandLogo').textContent = (name[0]||'P').toUpperCase();
    $('#footLogo').textContent = (name[0]||'P').toUpperCase();
  }

  if(s.description) $('#footDesc').textContent = s.description;
  if(s.address) $('#footAddr').textContent = '📍 ' + s.address;
  if(s.phone){
    $('#footPhoneTxt').textContent = '📞 ' + s.phone;
    $('#footPhone').onclick = () => location.href = 'tel:' + s.phone;
    $('#footPhone').textContent = s.phone;
  }
  if(s.email){
    $('#footEmailTxt').textContent = '✉️ ' + s.email;
    $('#footEmail').onclick = () => location.href = 'mailto:' + s.email;
    $('#footEmail').textContent = s.email;
  }
  if(s.facebook) $('#footContact').onclick = () => window.open(s.facebook, '_blank','noopener');
  else $('#footContact').onclick = () => location.href = 'mailto:' + (s.email||'');

  const ab = $('#annBar');
  if(s.announcement && String(s.announcement).trim()){
    ab.classList.add('show');
    $('#annText').textContent = s.announcement;
    $('#annIcon').textContent = s.announcementIcon || '📢';
  } else {
    ab.classList.remove('show');
  }
  $('#copyYear').textContent = new Date().getFullYear();
}

/* ================================================================
   FIREBASE LISTENERS
   ================================================================ */
function listenSettings(){
  const r = ref(db, 'settings/store');
  const cb = onValue(r, s => { S.settings.store = s.val() || {}; applyBranding(); }, e => console.warn(e));
  S.unsubs.push(()=>cb());
  const r2 = ref(db, 'settings/payment');
  const cb2 = onValue(r2, s => { S.settings.payment = s.val() || {}; }, e => {});
  S.unsubs.push(()=>cb2());
  const r3 = ref(db, 'settings/delivery');
  const cb3 = onValue(r3, s => { S.settings.delivery = s.val() || {}; }, e => {});
  S.unsubs.push(()=>cb3());
}

function listenProducts(){
  // ✨ SKELETON LOADER START ✨
  const featGrid = $('#gridFeat');
  const newGrid = $('#gridNew');
  if(featGrid && !featGrid.children.length) {
    featGrid.innerHTML = Array(4).fill('<div class="skel" style="height:260px;"></div>').join('');
  }
  if(newGrid && !newGrid.children.length) {
    newGrid.innerHTML = Array(4).fill('<div class="skel" style="height:260px;"></div>').join('');
  }
  // ✨ SKELETON LOADER END ✨

  const r = ref(db, 'products');
  const cb = onValue(r, snap => {
    S.products = snap.val() || {};
    // Remove skeleton and render real data when loaded
    if(S.view === 'home')        renderHome();
    if(S.view === 'shop')        renderShop();
    if(S.view === 'search')      renderSearchResults();
    if(S.view === 'categories')  renderCategories();
    if(S.view === 'cat')         renderCatProducts();
    if(S.view === 'wishlist')    renderWishlist();
    refreshCartUI();
  }, e => { 
    console.warn('products', e); 
    toast('পণ্য লোড করা যায়নি', 'err'); 
  });
  S.unsubs.push(()=>cb());
}

function listenCategories(){
  const r = ref(db, 'categories');
  const cb = onValue(r, snap => {
    S.categories = snap.val() || {};
    if(S.view === 'home')       renderHome();
    if(S.view === 'categories') renderCategories();
  }, e => {});
  S.unsubs.push(()=>cb());
}

function listenBanners(){
  const r = ref(db, 'banners');
  const cb = onValue(r, snap => {
    S.banners = snap.val() || {};
    if(S.view === 'home') renderHome();
  }, e => {});
  S.unsubs.push(()=>cb());
}

function listenCoupons(){
  const r = ref(db, 'coupons');
  const cb = onValue(r, snap => { S.coupons = snap.val() || {}; }, e => {});
  S.unsubs.push(()=>cb());
}

function listenGlobalNotifications(){
  const r = ref(db, 'notifications');
  const cb = onValue(r, snap => { S.notifications = snap.val() || {}; updateNotifBadge(); }, e => {});
  S.unsubs.push(()=>cb());
}

/* ================================================================
   USER STATE
   ================================================================ */
onAuthStateChanged(auth, async user => {
  S.user = user || null;

  if(S.user){
    listenUserData(user.uid);
  } else {
    S.profile = null;
    S.wishlist = {};
    S.userNotifs = {};
    S.orders = {};
    updateHdrAvatar();
    updateNotifBadge();
    updateWishBadge();
  }
  refreshCartUI();
});

async function listenUserData(uid){
  const rp = ref(db, 'users/' + uid);
  const cp = onValue(rp, s => { S.profile = s.val() || {}; updateHdrAvatar();
    if(S.view === 'profile') renderProfile(); }, e => {});
  S.unsubs.push(()=>cp());

  const rw = ref(db, 'wishlist/' + uid);
  const cw = onValue(rw, s => { S.wishlist = s.val() || {}; updateWishBadge();
    if(S.view === 'wishlist') renderWishlist(); }, e => {});
  S.unsubs.push(()=>cw());

  const rn = ref(db, 'userNotifications/' + uid);
  const cn = onValue(rn, s => { S.userNotifs = s.val() || {}; updateNotifBadge(); }, e => {});
  S.unsubs.push(()=>cn());

  const ro = ref(db, 'orders/' + uid);
  const co = onValue(ro, s => { S.orders = s.val() || {};
    if(S.view === 'orders') renderOrders(); }, e => {});
  S.unsubs.push(()=>co());
}

function updateHdrAvatar(){
  const el = $('#hdrAv');
  if(S.user){
    const name = S.profile?.name || S.user.displayName || S.user.email || 'U';
    const photo = S.profile?.photo;
    if(photo && /^https?:\/\//i.test(photo)){
      el.innerHTML = `<img class="avatar" src="${esc(photo)}" alt="" onerror="this.outerHTML='<span class=\\'avatar\\'>${esc(name[0].toUpperCase())}</span>'">`;
    } else {
      el.innerHTML = `<span class="avatar">${esc(name[0].toUpperCase())}</span>`;
    }
  } else {
    el.innerHTML = '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>';
  }
}

/* ================================================================
   CART
   ================================================================ */
function cartKey(){ return 'pc_cart_' + (S.user ? S.user.uid : 'guest'); }
function loadCart(){
  try {
    const raw = localStorage.getItem(cartKey());
    S.cart = raw ? JSON.parse(raw) : [];
    if(!Array.isArray(S.cart)) S.cart = [];
  } catch(e){ S.cart = []; }
}
function saveCart(){
  try { localStorage.setItem(cartKey(), JSON.stringify(S.cart)); } catch(e){}
}
function mergeGuestCart(){
  try {
    const raw = localStorage.getItem('pc_cart_guest');
    if(!raw) return;
    const guest = JSON.parse(raw) || [];
    if(!Array.isArray(guest) || !guest.length) { localStorage.removeItem('pc_cart_guest'); return; }
    const userRaw = localStorage.getItem('pc_cart_' + S.user.uid);
    const userCart = userRaw ? JSON.parse(userRaw) : [];
    const map = {};
    [...userCart, ...guest].forEach(it => {
      if(!it || !it.productId) return;
      map[it.productId] = (map[it.productId] || 0) + num(it.qty || 1);
    });
    S.cart = Object.entries(map).map(([productId, qty]) => ({productId, qty}));
    localStorage.removeItem('pc_cart_guest');
    saveCart();
  } catch(e){ console.warn(e); }
}
function getProduct(id){ return S.products[id] || null; }
function isActive(p){ return p && p.active !== false; }
function inStock(p){ return p && num(p.stock) > 0; }
function cartItemsDetailed(){
  return S.cart.map(i => {
    const p = getProduct(i.productId);
    if(!p || !isActive(p)) return null;
    return { productId: i.productId, qty: num(i.qty), product: p };
  }).filter(Boolean);
}
function cartSubtotal(){
  return cartItemsDetailed().reduce((s, i) => s + num(i.product.price) * i.qty, 0);
}
function cartCount(){
  return S.cart.reduce((s,i) => s + num(i.qty), 0);
}
function addToCart(pid, qty){
  qty = Math.max(1, Math.floor(num(qty) || 1));
  const p = getProduct(pid);
  if(!p){ toast('পণ্য পাওয়া যায়নি', 'err'); return; }
  if(!isActive(p)){ toast('পণ্যটি এখন উপলব্ধ নেই', 'warn'); return; }
  if(!inStock(p)){ toast('স্টক নেই', 'warn'); return; }
  const existing = S.cart.find(i => i.productId === pid);
  const currentQty = existing ? num(existing.qty) : 0;
  const maxQty = num(p.stock) || 0;
  const newQty = Math.min(currentQty + qty, maxQty);
  if(newQty <= currentQty){ toast(`সর্বোচ্চ ${maxQty} পিস যোগ করা যাবে`, 'warn'); return; }
  if(existing) existing.qty = newQty;
  else S.cart.push({ productId: pid, qty: newQty });
  saveCart();
  refreshCartUI();
  toast('কার্টে যোগ হয়েছে ✓', 'ok');
}
function setCartQty(pid, qty){
  qty = Math.max(0, Math.floor(num(qty)));
  const p = getProduct(pid);
  const maxQty = p ? num(p.stock) : 0;
  const item = S.cart.find(i => i.productId === pid);
  if(!item) return;
  if(qty === 0){ removeFromCart(pid); return; }
  if(qty > maxQty){ qty = maxQty; toast(`সর্বোচ্চ ${maxQty} পিস`, 'warn'); }
  item.qty = qty;
  saveCart();
  refreshCartUI();
}
function removeFromCart(pid){
  S.cart = S.cart.filter(i => i.productId !== pid);
  saveCart();
  refreshCartUI();
  toast('কার্ট থেকে সরানো হয়েছে');
}
function clearCart(){
  S.cart = [];
  saveCart();
  refreshCartUI();
}
function refreshCartUI(){
  const c = cartCount();
  const cb = $('#cartBadge');
  if(cb){
    if(c > 0){ cb.textContent = c > 99 ? '99+' : c; cb.classList.add('show'); }
    else cb.classList.remove('show');
  }
  if($('#ovCart').classList.contains('on')) renderCart();
}

/* ================================================================
   WISHLIST
   ================================================================ */
function isWished(pid){
  if(S.user) return !!S.wishlist[pid];
  try {
    const w = JSON.parse(localStorage.getItem('pc_wish_guest') || '{}');
    return !!w[pid];
  } catch(e){ return false; }
}
async function toggleWish(pid){
  if(!S.user){
    try {
      const w = JSON.parse(localStorage.getItem('pc_wish_guest') || '{}');
      if(w[pid]) delete w[pid]; else w[pid] = true;
      localStorage.setItem('pc_wish_guest', JSON.stringify(w));
      updateWishBadge();
      toast(w[pid] ? 'উইশলিস্টে যোগ ✓' : 'উইশলিস্ট থেকে সরানো', 'ok');
      if(S.view === 'wishlist') renderWishlist();
      document.querySelectorAll('.pcard .heart').forEach(h => {
        const id = h.dataset.pid;
        if(id) h.classList.toggle('on', isWished(id));
      });
    } catch(e){}
    return;
  }
  const r = ref(db, 'wishlist/' + S.user.uid + '/' + pid);
  const cur = !!S.wishlist[pid];
  try {
    if(cur){ await remove(r); toast('উইশলিস্ট থেকে সরানো'); }
    else   { await set(r, true); toast('উইশলিস্টে যোগ ✓', 'ok'); }
  } catch(e){ toast(fbErr(e), 'err'); }
}
function updateWishBadge(){
  let c = 0;
  if(S.user) c = Object.keys(S.wishlist).length;
  else {
    try { c = Object.keys(JSON.parse(localStorage.getItem('pc_wish_guest') || '{}')).length; } catch(e){}
  }
  const el = $('#wishBadge');
  if(el){
    if(c > 0){ el.textContent = c > 99 ? '99+' : c; el.classList.add('show'); }
    else el.classList.remove('show');
  }
}

/* ================================================================
   PRODUCT CARD (with Share Button)
   ================================================================ */
function pcardHTML(p){
  const id = p.id;
  const img = productImage(p);
  const dsc = discountPct(p.price, p.oldPrice);
  const oos = !inStock(p);
  const wished = isWished(id);

  return `
    <div class="pcard" data-pid="${esc(id)}">
      <div class="img" onclick="openPd('${esc(id)}')">
        ${img
          ? `<img src="${esc(img)}" alt="${esc(p.name||'')}" loading="lazy" width="300" height="300" style="aspect-ratio:1;object-fit:cover;" onerror="this.style.display='none';this.parentNode.insertAdjacentHTML('beforeend','<div class=\\'ph\\'>📦</div>')">`
          : `<div class="ph">📦</div>`}
        ${dsc > 0 ? `<span class="disc">-${dsc}%</span>` : ''}
        ${oos ? `<div class="oos">স্টক নেই</div>` : ''}
        <button class="heart ${wished?'on':''}" data-pid="${esc(id)}"
          onclick="event.stopPropagation();toggleWish('${esc(id)}')" title="Wishlist">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="${wished?'currentColor':'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21.2l7.7-7.8 1.1-1a5.5 5.5 0 0 0 0-7.8Z"/></svg>
        </button>
        <button class="share-btn" data-pid="${esc(id)}"
          onclick="event.stopPropagation();openShare('${esc(id)}')" title="Share">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>
        </button>
      </div>
      <div class="body">
        <h3 class="nm" onclick="openPd('${esc(id)}')">${esc(p.name||'')}</h3>
        <div class="pr">
          <span class="now">${money(p.price)}</span>
          ${num(p.oldPrice) > num(p.price) ? `<span class="old">${money(p.oldPrice)}</span>` : ''}
        </div>
        <button class="btn-cart ${oos?'gray':''}" onclick="event.stopPropagation();addToCart('${esc(id)}',1)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M3 3h2l2.7 12.4A2 2 0 0 0 9.7 17h8.6a2 2 0 0 0 2-1.6L22 7H6"/></svg>
          ${oos ? 'স্টক নেই' : 'কার্টে যোগ'}
        </button>
      </div>
    </div>`;
}

function pgridHTML(products, empty){
  if(!products.length){
    return `<div class="empty" style="grid-column:1/-1"><div class="ei">📦</div>
      <h4>কোনো পণ্য নেই</h4><p>${esc(empty||'এই বিভাগে এখনো কোনো পণ্য যোগ করা হয়নি।')}</p></div>`;
  }
  return products.map(pcardHTML).join('');
}

/* ================================================================
   FILTERS
   ================================================================ */
function activeProducts(){
  return Object.entries(S.products)
    .map(([id,p]) => ({id, ...p}))
    .filter(isActive);
}
function applyShopFilters(list){
  let r = list.slice();
  const f = S.shopFilters;
  if(f.cat) r = r.filter(p => p.category === f.cat);
  if(f.brand) r = r.filter(p => p.brand === f.brand);
  if(f.min > 0) r = r.filter(p => num(p.price) >= f.min);
  if(f.max < 999999) r = r.filter(p => num(p.price) <= f.max);
  if(f.sort === 'low') r.sort((a,b) => num(a.price) - num(b.price));
  else if(f.sort === 'high') r.sort((a,b) => num(b.price) - num(a.price));
  else if(f.sort === 'disc') r.sort((a,b) => discountPct(b.price,b.oldPrice) - discountPct(a.price,a.oldPrice));
  else r.sort((a,b) => num(b.createdAt||0) - num(a.createdAt||0));
  return r;
}

/* ================================================================
   HOME RENDER
   ================================================================ */
function renderHome(){
  const all = activeProducts();

  const heroBanners = activeBanners('hero');
  const heroWrap = $('#heroWrap');
  if(heroBanners.length){
    heroWrap.innerHTML = `
      <div class="hero-slider" id="heroSlider">
        ${heroBanners.map(b => `
          <div class="hero-slide" onclick="bannerClick('${esc(b.id)}','${esc(b.url||'')}')">
            <img src="${esc(b.image)}" alt="${esc(b.title||'')}"
              onerror="this.style.display='none';this.parentNode.style.background='linear-gradient(135deg,#5B4BDB,#7C6EE8)'">
            <div class="ov">
              ${b.title ? `<h2>${esc(b.title)}</h2>` : ''}
              ${b.description ? `<p>${esc(b.description)}</p>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
      ${heroBanners.length > 1 ? `<div class="hero-dots" id="heroDots">${
        heroBanners.map((_,i) => `<span class="dot ${i===0?'on':''}"></span>`).join('')
      }</div>` : ''}
    `;
    if(heroBanners.length > 1) setupHeroSlider();
  } else {
    heroWrap.innerHTML = `
      <div class="hero-slide" style="background:linear-gradient(135deg,#5B4BDB,#7C6EE8);box-shadow:0 8px 32px rgba(91,75,219,.3)">
        <div class="ov" style="background:none;padding:24px">
          <h2 style="color:#fff">স্বাগতম ${esc(S.settings.store?.name||'Primo Cart')}-এ</h2>
          <p style="color:rgba(255,255,255,.9)">সেরা পণ্য, সেরা দামে। এখনই কিনুন!</p>
        </div>
      </div>`;
  }

  renderAdSlot('ad-slot-top', 'top');
  renderAdSlot('ad-slot-products-1', 'products-1');
  renderAdSlot('ad-slot-category-banner', 'category');
  renderAdSlot('ad-slot-middle', 'middle');
  renderAdSlot('ad-slot-footer', 'footer');

  const cats = Object.entries(S.categories)
    .map(([id,c]) => ({id,...c}))
    .sort((a,b) => num(a.order) - num(b.order));
  $('#catChips').innerHTML = cats.length
    ? `<button class="cat-chip" onclick="go('shop')">সব পণ্য</button>` +
      cats.map(c => `<button class="cat-chip" onclick="openCat('${esc(c.id)}')">
        <span class="ic">${esc(c.icon||'📦')}</span>${esc(c.name||'')}</button>`).join('')
    : '';

  const featured = all.filter(p => p.featured).slice(0, 8);
  if(featured.length){
    $('#sec-feat').classList.remove('hide');
    $('#gridFeat').innerHTML = pgridHTML(featured);
  } else {
    $('#sec-feat').classList.add('hide');
  }

  const news = all.slice().sort((a,b) => num(b.createdAt||0) - num(a.createdAt||0)).slice(0, 8);
  if(news.length){
    $('#sec-new').classList.remove('hide');
    $('#gridNew').innerHTML = pgridHTML(news);
  } else {
    $('#sec-new').classList.add('hide');
  }

  const disc = all.filter(p => discountPct(p.price, p.oldPrice) > 0)
    .sort((a,b) => discountPct(b.price,b.oldPrice) - discountPct(a.price,a.oldPrice))
    .slice(0, 8);
  if(disc.length){
    $('#sec-disc').classList.remove('hide');
    $('#gridDisc').innerHTML = pgridHTML(disc);
  } else {
    $('#sec-disc').classList.add('hide');
  }

  const best = all.filter(p => num(p.sold) > 0).sort((a,b) => num(b.sold) - num(a.sold)).slice(0, 8);
  if(best.length){
    $('#sec-best').classList.remove('hide');
    $('#gridBest').innerHTML = pgridHTML(best);
  } else {
    $('#sec-best').classList.add('hide');
  }

  if(!all.length){
    $('#heroWrap').innerHTML = '';
    $('#gridFeat').innerHTML = '';
    $('#gridNew').innerHTML = '';
    $('#gridDisc').innerHTML = '';
    $('#gridBest').innerHTML = '';
    if(!$('#noProducts')) {
      const div = document.createElement('div');
      div.id = 'noProducts';
      div.className = 'empty';
      div.innerHTML = `<div class="ei">🛍️</div><h4>এখনো কোনো পণ্য নেই</h4>
        <p>অ্যাডমিন প্যানেল থেকে পণ্য যোগ করা হলে এখানে দেখা যাবে।</p>`;
      document.getElementById('v-home').appendChild(div);
    }
  } else {
    document.getElementById('noProducts')?.remove();
  }
}

function activeBanners(pos){
  const now = Date.now();
  return Object.entries(S.banners)
    .map(([id,b]) => ({id, ...b}))
    .filter(b => b.active !== false
      && (b.position || 'hero') === pos
      && (!b.startDate || b.startDate <= now)
      && (!b.endDate || b.endDate >= now))
    .sort((a,b) => num(a.order) - num(b.order));
}

function renderAdSlot(id, pos){
  const el = document.getElementById(id);
  if(!el) return;
  const list = activeBanners(pos);
  if(!list.length){
    el.classList.remove('show');
    el.innerHTML = '';
    return;
  }
  const b = list[0];
  el.classList.add('show');
  el.innerHTML = `
    <div onclick="bannerClick('${esc(b.id)}','${esc(b.url||'')}')" style="width:100%;height:100%;cursor:${b.url?'pointer':'default'}">
      <img src="${esc(b.image)}" alt="${esc(b.title||'')}"
        onerror="this.parentNode.parentNode.classList.remove('show');this.parentNode.parentNode.innerHTML=''">
    </div>`;
}

window.bannerClick = function(id, url){
  if(url && /^https?:\/\//i.test(url)){
    window.open(url, '_blank', 'noopener,noreferrer');
  }
};

function setupHeroSlider(){
  const slider = $('#heroSlider');
  const dots = $$('#heroDots .dot');
  if(!slider) return;
  let idx = 0;
  let timer = setInterval(next, 4500);
  function next(){
    idx = (idx + 1) % dots.length;
    const w = slider.clientWidth;
    slider.scrollTo({ left: idx * (w + 12), behavior:'smooth' });
    dots.forEach((d,i) => d.classList.toggle('on', i === idx));
  }
  slider.addEventListener('scroll', () => {
    const w = slider.clientWidth + 12;
    const i = Math.round(slider.scrollLeft / w);
    if(i !== idx){
      idx = i;
      dots.forEach((d,j) => d.classList.toggle('on', j === i));
    }
  }, {passive:true});
  slider.addEventListener('touchstart', () => clearInterval(timer), {passive:true});
  slider.addEventListener('touchend', () => { timer = setInterval(next, 4500); }, {passive:true});
}

/* ================================================================
   SHOP / CATEGORY / SEARCH
   ================================================================ */
function renderShop(){
  const cats = Object.entries(S.categories).map(([id,c]) => ({id,...c})).sort((a,b) => num(a.order) - num(b.order));
  $('#shopCats').innerHTML = `<button class="cat-chip ${!S.shopFilters.cat?'on':''}" onclick="setShopCat('')">সব</button>` +
    cats.map(c => `<button class="cat-chip ${S.shopFilters.cat===c.name?'on':''}" onclick="setShopCat('${esc(c.name)}')">
      <span class="ic">${esc(c.icon||'📦')}</span>${esc(c.name||'')}</button>`).join('');
  const filtered = applyShopFilters(activeProducts());
  $('#gridShop').innerHTML = pgridHTML(filtered, 'কোনো পণ্য পাওয়া যায়নি।');
  renderActiveFilters();
}
window.setShopCat = name => { S.shopFilters.cat = name; renderShop(); };

function renderActiveFilters(){
  const f = S.shopFilters;
  const chips = [];
  if(f.cat)   chips.push(`<span class="chip" style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:var(--pri);color:#fff;border-radius:999px;font-size:12px;font-weight:600">ক্যাটাগরি: ${esc(f.cat)} <span style="cursor:pointer" onclick="setShopCat('')">✕</span></span>`);
  if(f.brand) chips.push(`<span class="chip" style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:var(--pri);color:#fff;border-radius:999px;font-size:12px;font-weight:600">ব্র্যান্ড: ${esc(f.brand)} <span style="cursor:pointer" onclick="clearFilter('brand')">✕</span></span>`);
  const sortNames = {new:'নতুন', low:'কম দাম আগে', high:'বেশি দাম আগে', disc:'ডিসকাউন্ট'};
  if(f.sort && f.sort !== 'new') chips.push(`<span class="chip" style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:var(--pri);color:#fff;border-radius:999px;font-size:12px;font-weight:600">সাজান: ${sortNames[f.sort]} <span style="cursor:pointer" onclick="clearFilter('sort')">✕</span></span>`);
  $('#shopActiveFilters').innerHTML = chips.length
    ? `<div style="display:flex;gap:8px;flex-wrap:wrap">${chips.join('')}<button class="btn btn-ghost btn-sm" onclick="clearAllFilters()">সব মুছুন</button></div>`
    : '';
}
window.clearFilter = k => { S.shopFilters[k] = k === 'sort' ? 'new' : ''; renderShop(); };
window.clearAllFilters = () => { S.shopFilters = { cat:'', brand:'', sort:'new', min:0, max:999999 }; renderShop(); closeFilters(); };

function renderCategories(){
  const cats = Object.entries(S.categories).map(([id,c]) => ({id,...c})).sort((a,b) => num(a.order) - num(b.order));
  const all = activeProducts();
  if(!cats.length){
    $('#catGrid').innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="ei">🗂️</div><h4>কোনো ক্যাটাগরি নেই</h4></div>`;
    return;
  }
  $('#catGrid').innerHTML = cats.map(c => {
    const count = all.filter(p => p.category === c.name).length;
    const img = c.image;
    return `
      <div onclick="openCat('${esc(c.id)}')" style="background:#fff;border:1px solid var(--line);border-radius:var(--r);overflow:hidden;cursor:pointer;transition:.18s"
        onmouseover="this.style.transform='translateY(-3px)';this.style.boxShadow='var(--sh-2)'"
        onmouseout="this.style.transform='';this.style.boxShadow=''">
        ${img
          ? `<div style="aspect-ratio:1.6;background:var(--soft);overflow:hidden"><img src="${esc(img)}" style="width:100%;height:100%;object-fit:cover" loading="lazy" onerror="this.style.display='none'"></div>`
          : `<div style="aspect-ratio:1.6;background:linear-gradient(135deg,var(--pri),var(--pri-2));display:grid;place-items:center;color:#fff;font-size:38px">${esc(c.icon||'📦')}</div>`}
        <div style="padding:12px 14px">
          <div style="font-weight:800;font-size:15px;margin-bottom:3px">${esc(c.name||'')}</div>
          <div class="small">${count} টি পণ্য</div>
        </div>
      </div>`;
  }).join('');
}

window.openCat = catId => {
  const c = S.categories[catId];
  if(!c) return;
  S.currentCat = catId;
  go('cat');
};
function renderCatProducts(){
  const c = S.categories[S.currentCat];
  if(!c){ go('categories'); return; }
  $('#catTitle').innerHTML = `<span class="ic">${esc(c.icon||'📦')}</span> ${esc(c.name||'')}`;
  const list = activeProducts().filter(p => p.category === c.name);
  $('#gridCat').innerHTML = pgridHTML(list, 'এই ক্যাটাগরিতে কোনো পণ্য নেই।');
}

function renderSearchResults(){
  const q = (S.searchQ || '').trim().toLowerCase();
  if(!q){
    $('#searchResult').innerHTML = `<div class="empty"><div class="ei">🔍</div><h4>কিছু খুঁজুন</h4>
      <p>পণ্যের নাম, ব্র্যান্ড বা ক্যাটাগরি দিয়ে সার্চ করুন</p></div>`;
    return;
  }
  const list = activeProducts().filter(p => {
    const hay = [p.name, p.brand, p.category, p.description, p.tags].join(' ').toLowerCase();
    return hay.includes(q);
  });
  $('#searchResult').innerHTML = list.length
    ? `<div class="small mb12">${list.length} টি ফলাফল</div>
       <div class="pgrid">${list.map(pcardHTML).join('')}</div>`
    : `<div class="empty"><div class="ei">😕</div><h4>কিছু পাওয়া যায়নি</h4>
       <p>"${esc(q)}" এর সাথে মিলে এমন কোনো পণ্য নেই</p></div>`;
}

/* ================================================================
   PRODUCT DETAILS (with Share Button)
   ================================================================ */
let _pd = { pid:null, imgIdx:0, qty:1 };
window.openPd = function(pid){
  const p = getProduct(pid);
  if(!p) return;
  _pd = { pid, imgIdx:0, qty:1 };
  renderPd();
  $('#ovPd').classList.add('on');
};
window.closePd = () => $('#ovPd').classList.remove('on');

function payLabel(p){
  const t = p.paymentType || 'cod';
  if(t === 'cod') return { text:'ক্যাশ অন ডেলিভারি', cls:'ok' };
  if(t === 'advance_delivery') return { text:'ডেলিভারি চার্জ অগ্রিম', cls:'warn' };
  if(t === 'full_advance') return { text:'সম্পূর্ণ অগ্রিম পেমেন্ট', cls:'warn' };
  return { text:'ক্যাশ অন ডেলিভারি', cls:'ok' };
}

function renderPd(){
  const p = getProduct(_pd.pid);
  if(!p){ closePd(); return; }
  const imgs = productImages(p);
  const img = imgs[_pd.imgIdx] || '';
  const dsc = discountPct(p.price, p.oldPrice);
  const wished = isWished(_pd.pid);
  const stock = num(p.stock);
  const oos = stock <= 0;
  const pl = payLabel(p);

  const payNote = {
    cod: 'পণ্য হাতে পেয়ে টাকা পরিশোধ করবেন।',
    advance_delivery: `ডেলিভারি চার্জ (${money(p.deliveryCharge ?? S.settings.delivery?.insideCity ?? 60)}) অগ্রিম পরিশোধ করতে হবে।`,
    full_advance: `সম্পূর্ণ মূল্য (${money(p.price)}) অগ্রিম পরিশোধ করতে হবে।`
  }[p.paymentType || 'cod'];

  $('#pdBody').innerHTML = `
    <div class="pd-wrap">
      <div class="pd-gallery">
        <div class="pd-main">
          ${img
            ? `<img id="pdMainImg" src="${esc(img)}" alt="${esc(p.name||'')}" width="500" height="500" onerror="this.style.display='none';this.parentNode.insertAdjacentHTML('beforeend','<div class=\\'ph\\'>📦</div>')">`
            : `<div class="ph">📦</div>`}
          ${dsc > 0 ? `<span class="disc" style="position:absolute;top:12px;left:12px;background:var(--err);color:#fff;font-size:12px;font-weight:800;padding:4px 10px;border-radius:8px">-${dsc}% ছাড়</span>` : ''}
        </div>
        ${imgs.length > 1 ? `
          <div class="pd-thumbs">
            ${imgs.map((u,i) => `
              <div class="th ${i===_pd.imgIdx?'on':''}" onclick="setPdImg(${i})">
                <img src="${esc(u)}" alt="" loading="lazy" onerror="this.parentNode.style.display='none'">
              </div>`).join('')}
          </div>` : ''}
      </div>
      <div class="pd-info">
        <h1>${esc(p.name||'')}</h1>
        <div class="pd-meta">
          ${p.brand ? `<span>ব্র্যান্ড: <b>${esc(p.brand)}</b></span>` : ''}
          ${p.category ? `<span>ক্যাটাগরি: <b>${esc(p.category)}</b></span>` : ''}
        </div>
        <div class="pd-price">
          <span class="now">${money(p.price)}</span>
          ${num(p.oldPrice) > num(p.price) ? `<span class="old">${money(p.oldPrice)}</span>` : ''}
          ${dsc > 0 ? `<span class="save">সেভ ${money(num(p.oldPrice) - num(p.price))}</span>` : ''}
        </div>
        <div class="pd-tags">
          <span class="pd-tag pay">💳 ${pl.text}</span>
          ${oos
            ? `<span class="pd-tag" style="background:rgba(239,68,68,.12);color:var(--err)">স্টক নেই</span>`
            : `<span class="pd-tag ok">✓ স্টকে আছে (${stock})</span>`}
          ${p.brand ? `<span class="pd-tag">🏷️ ${esc(p.brand)}</span>` : ''}
        </div>

        <div class="mt16">
          <label style="font-weight:700;font-size:13px;display:block;margin-bottom:8px">পরিমাণ</label>
          <div class="qty-box">
            <button onclick="pdQty(-1)">−</button>
            <input type="number" id="pdQty" value="${_pd.qty}" min="1" max="${stock}" readonly>
            <button onclick="pdQty(1)">+</button>
          </div>
        </div>

        <div class="pd-actions mt16">
          <button class="btn btn-pri btn-block" onclick="pdAddToCart()" ${oos?'disabled':''}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M3 3h2l2.7 12.4A2 2 0 0 0 9.7 17h8.6a2 2 0 0 0 2-1.6L22 7H6"/></svg>
            কার্টে যোগ করুন
          </button>
          <button class="btn btn-outline" onclick="pdBuyNow()" ${oos?'disabled':''}>
            এখনই কিনুন
          </button>
          <button class="btn btn-ghost" onclick="toggleWish('${esc(_pd.pid)}');renderPd()" title="Wishlist">
            ${wished ? '❤️' : '🤍'}
          </button>
          <button class="pd-share" onclick="openShare('${esc(_pd.pid)}')" title="Share">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>
            শেয়ার
          </button>
        </div>

        <div class="pay-note">
          <b>💳 পেমেন্ট:</b> ${esc(pl.text)}<br>
          <span style="font-size:12.5px">${esc(payNote)}</span>
        </div>
      </div>
    </div>

    ${p.shortDesc || p.description ? `
      <div class="pd-section">
        <h3>📝 বিবরণ</h3>
        <p>${esc(p.description || p.shortDesc || '')}</p>
      </div>` : ''}

    <div class="pd-section">
      <h3>ℹ️ স্পেসিফিকেশন</h3>
      <div class="pd-specs">
        ${p.brand ? `<div class="pd-spec"><span class="k">ব্র্যান্ড</span><span class="v">${esc(p.brand)}</span></div>` : ''}
        ${p.category ? `<div class="pd-spec"><span class="k">ক্যাটাগরি</span><span class="v">${esc(p.category)}</span></div>` : ''}
        ${p.sku ? `<div class="pd-spec"><span class="k">SKU</span><span class="v">${esc(p.sku)}</span></div>` : ''}
        <div class="pd-spec"><span class="k">স্টক</span><span class="v">${stock}</span></div>
        <div class="pd-spec"><span class="k">পেমেন্ট পদ্ধতি</span><span class="v">${esc(pl.text)}</span></div>
        ${p.weight ? `<div class="pd-spec"><span class="k">ওজন</span><span class="v">${esc(p.weight)}</span></div>` : ''}
      </div>
    </div>
  `;
}
window.setPdImg = i => { _pd.imgIdx = i; renderPd(); };
window.pdQty = d => {
  const p = getProduct(_pd.pid);
  if(!p) return;
  const max = num(p.stock);
  _pd.qty = Math.max(1, Math.min(max, _pd.qty + d));
  const inp = $('#pdQty');
  if(inp) inp.value = _pd.qty;
};
window.pdAddToCart = () => {
  addToCart(_pd.pid, _pd.qty);
  closePd();
};
window.pdBuyNow = () => {
  addToCart(_pd.pid, _pd.qty);
  closePd();
  openCheckout();
};

/* ================================================================
   CART UI
   ================================================================ */
window.openCart = function(){
  renderCart();
  $('#ovCart').classList.add('on');
};
window.closeCart = () => $('#ovCart').classList.remove('on');

function renderCart(){
  const items = cartItemsDetailed();
  const count = items.reduce((s,i) => s+i.qty, 0);
  $('#cartCountTxt').textContent = count ? `(${count} পণ্য)` : '';

  if(!items.length){
    $('#cartBody').innerHTML = `
      <div class="empty">
        <div class="ei">🛒</div>
        <h4>কার্ট খালি</h4>
        <p>পছন্দের পণ্য কার্টে যোগ করুন</p>
        <button class="btn btn-pri mt16" onclick="closeCart();go('shop')">শপিং শুরু করুন</button>
      </div>`;
    $('#cartFoot').innerHTML = '';
    return;
  }

  $('#cartBody').innerHTML = items.map(it => {
    const p = it.product;
    const img = productImage(p);
    const line = num(p.price) * it.qty;
    return `
      <div class="citem" data-pid="${esc(it.productId)}">
        <div class="img" onclick="closeCart();openPd('${esc(it.productId)}')" style="cursor:pointer">
          ${img
            ? `<img src="${esc(img)}" alt="" onerror="this.parentNode.innerHTML='<div class=ph style=\\'display:grid;place-items:center;height:100%;color:var(--gray-l);font-size:28px\\'>📦</div>'">`
            : `<div style="display:grid;place-items:center;height:100%;color:var(--gray-l);font-size:28px">📦</div>`}
        </div>
        <div class="body">
          <h4 class="nm">${esc(p.name||'')}</h4>
          <div class="meta">${money(p.price)} × ${it.qty} = <b style="color:var(--pri)">${money(line)}</b></div>
          <div class="row">
            <div class="qty">
              <button onclick="setCartQty('${esc(it.productId)}',${it.qty - 1})">−</button>
              <span>${it.qty}</span>
              <button onclick="setCartQty('${esc(it.productId)}',${it.qty + 1})">+</button>
            </div>
            <button class="rm" onclick="removeFromCart('${esc(it.productId)}')">সরান</button>
          </div>
        </div>
      </div>`;
  }).join('');

  const sub = cartSubtotal();
  const del = deliveryChargeFor(sub);
  const total = sub + del;

  $('#cartFoot').innerHTML = `
    <div class="summary">
      <div class="ln"><span>সাবটোটাল</span><span><b>${money(sub)}</b></span></div>
      <div class="ln"><span>ডেলিভারি চার্জ</span><span><b>${del === 0 ? 'ফ্রি' : money(del)}</b></span></div>
      <div class="ln total"><span>সর্বমোট</span><span class="v">${money(total)}</span></div>
    </div>
    <div style="display:flex;gap:10px;margin-top:14px">
      <button class="btn btn-ghost" onclick="clearCartConfirm()" style="flex:0 0 auto">🗑️</button>
      <button class="btn btn-pri btn-block" onclick="checkoutFromCart()">
        চেকআউট করুন →
      </button>
    </div>
  `;
}
window.clearCartConfirm = async () => {
  const ok = await confirmDlg('কার্ট খালি করুন', 'সব পণ্য কার্ট থেকে সরানো হবে?');
  if(ok){ clearCart(); renderCart(); toast('কার্ট খালি হয়েছে'); }
};

/* ================================================================
   DELIVERY + COUPON
   ================================================================ */
function deliveryChargeFor(subtotal){
  const d = S.settings.delivery || {};
  const inside = num(d.insideCity ?? 60);
  const freeAbove = num(d.freeAbove ?? 0);
  if(freeAbove && subtotal >= freeAbove) return 0;
  return inside;
}
function deliveryFor(district){
  const d = S.settings.delivery || {};
  const inside = num(d.insideCity ?? 60);
  const outside = num(d.outsideCity ?? 120);
  const cityList = (d.cityList || '').split(/[\n,]+/).map(x => x.trim()).filter(Boolean);
  if(!cityList.length) return outside;
  return cityList.includes(district) ? inside : outside;
}

let S_coupon = null;
function validateCoupon(code, subtotal){
  code = String(code||'').trim().toUpperCase();
  if(!code) return { ok:false, msg:'কুপন কোড দিন' };
  const now = Date.now();
  const entry = Object.entries(S.coupons).find(([id,c]) => (c.code||'').toUpperCase() === code);
  if(!entry) return { ok:false, msg:'কুপন কোড সঠিক নয়' };
  const [id, c] = entry;
  if(c.active === false) return { ok:false, msg:'এই কুপন এখন সক্রিয় নয়' };
  if(c.startDate && c.startDate > now) return { ok:false, msg:'কুপন এখনো শুরু হয়নি' };
  if(c.endDate && c.endDate < now) return { ok:false, msg:'কুপনের মেয়াদ শেষ' };
  if(num(c.minOrder) && subtotal < num(c.minOrder)) return { ok:false, msg:`সর্বনিম্ন ${money(c.minOrder)} অর্ডারে প্রযোজ্য` };
  if(num(c.usageLimit) && num(c.used) >= num(c.usageLimit)) return { ok:false, msg:'কুপনের ব্যবহার সীমা শেষ' };

  let discount = 0;
  if(c.type === 'fixed') discount = Math.min(num(c.value), subtotal);
  else if(c.type === 'percent'){
    discount = subtotal * num(c.value) / 100;
    if(num(c.maxDiscount)) discount = Math.min(discount, num(c.maxDiscount));
  }
  discount = Math.round(discount);
  return { ok:true, id, code:c.code, type:c.type, value:num(c.value), discount, coupon:c };
}

/* ================================================================
   AUTH
   ================================================================ */
function openAuth(mode){
  mode = mode || 'login';
  $('#authTitle').textContent = mode === 'login' ? 'লগইন করুন'
    : mode === 'register' ? 'নতুন অ্যাকাউন্ট' : 'পাসওয়ার্ড রিসেট';
  renderAuthForm(mode);
  $('#ovAuth').classList.add('on');
}
window.openAuth = openAuth;
window.closeAuth = () => {
  $('#ovAuth').classList.remove('on');
  S.returnTo = null;
};

function renderAuthForm(mode){
  const el = $('#authBody');
  if(mode === 'login'){
    el.innerHTML = `
      <div class="field"><label>ইমেইল</label>
        <input id="aEmail" class="input" type="email" placeholder="you@example.com" autocomplete="email"></div>
      <div class="field"><label>পাসওয়ার্ড</label>
        <input id="aPass" class="input" type="password" placeholder="••••••••" autocomplete="current-password"></div>
      <div id="aErr" class="small" style="color:var(--err);display:none;margin-bottom:12px"></div>
      <button class="btn btn-pri btn-block" id="aBtn" onclick="doLogin()">লগইন</button>
      <div class="tac small mt16">
        অ্যাকাউন্ট নেই? <a class="link" onclick="renderAuthForm('register')">রেজিস্টার করুন</a>
      </div>
      <div class="tac small mt8">
        <a class="muted" onclick="renderAuthForm('reset')">পাসওয়ার্ড ভুলে গেছেন?</a>
      </div>`;
  } else if(mode === 'register'){
    el.innerHTML = `
      <div class="field"><label>পূর্ণ নাম</label>
        <input id="aName" class="input" placeholder="আপনার নাম" autocomplete="name"></div>
      <div class="field"><label>ইমেইল</label>
        <input id="aEmail" class="input" type="email" placeholder="you@example.com" autocomplete="email"></div>
      <div class="field"><label>মোবাইল নম্বর</label>
        <input id="aPhone" class="input" type="tel" placeholder="01XXXXXXXXX" autocomplete="tel"></div>
      <div class="field"><label>পাসওয়ার্ড</label>
        <input id="aPass" class="input" type="password" placeholder="কমপক্ষে ৬ অক্ষর" autocomplete="new-password"></div>
      <div id="aErr" class="small" style="color:var(--err);display:none;margin-bottom:12px"></div>
      <button class="btn btn-pri btn-block" id="aBtn" onclick="doRegister()">রেজিস্টার</button>
      <div class="tac small mt16">
        অ্যাকাউন্ট আছে? <a class="link" onclick="renderAuthForm('login')">লগইন করুন</a>
      </div>`;
  } else {
    el.innerHTML = `
      <div class="field"><label>ইমেইল</label>
        <input id="aEmail" class="input" type="email" placeholder="you@example.com"></div>
      <div id="aErr" class="small" style="color:var(--err);display:none;margin-bottom:12px"></div>
      <button class="btn btn-pri btn-block" id="aBtn" onclick="doReset()">রিসেট লিংক পাঠান</button>
      <div class="tac small mt16">
        <a class="link" onclick="renderAuthForm('login')">← লগইনে ফিরুন</a>
      </div>`;
  }
}
window.renderAuthForm = renderAuthForm;

function showAuthErr(msg){
  const e = $('#aErr');
  if(e){ e.textContent = msg; e.style.display = 'block'; }
}
async function doLogin(){
  const email = ($('#aEmail').value||'').trim();
  const pass  = $('#aPass').value || '';
  if(!email || !pass) return showAuthErr('ইমেইল ও পাসওয়ার্ড দিন');
  const btn = $('#aBtn'); btn.disabled = true; btn.textContent = 'অপেক্ষা করুন...';
  try {
    await signInWithEmailAndPassword(auth, email, pass);
    toast('লগইন সফল ✓', 'ok');
    afterLogin();
  } catch(e){
    showAuthErr(fbErr(e));
  } finally { btn.disabled = false; btn.textContent = 'লগইন'; }
}
window.doLogin = doLogin;

async function doRegister(){
  const name  = ($('#aName').value||'').trim();
  const email = ($('#aEmail').value||'').trim();
  const phone = ($('#aPhone').value||'').trim();
  const pass  = $('#aPass').value || '';
  if(name.length < 2) return showAuthErr('নাম দিন');
  if(!/^\S+@\S+\.\S+$/.test(email)) return showAuthErr('সঠিক ইমেইল দিন');
  if(pass.length < 6) return showAuthErr('পাসওয়ার্ড কমপক্ষে ৬ অক্ষর');
  const btn = $('#aBtn'); btn.disabled = true; btn.textContent = 'অপেক্ষা করুন...';
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, {displayName: name});
    await set(ref(db, 'users/' + cred.user.uid), {
      name, email, phone, createdAt: Date.now(), lastActive: Date.now()
    });
    toast('অ্যাকাউন্ট তৈরি হয়েছে ✓', 'ok');
    afterLogin();
  } catch(e){
    showAuthErr(fbErr(e));
  } finally { btn.disabled = false; btn.textContent = 'রেজিস্টার'; }
}
window.doRegister = doRegister;

async function doReset(){
  const email = ($('#aEmail').value||'').trim();
  if(!email) return showAuthErr('ইমেইল দিন');
  const btn = $('#aBtn'); btn.disabled = true; btn.textContent = 'পাঠানো হচ্ছে...';
  try {
    await sendPasswordResetEmail(auth, email);
    toast('রিসেট লিংক পাঠানো হয়েছে ✓', 'ok');
    renderAuthForm('login');
  } catch(e){
    showAuthErr(fbErr(e));
  } finally { btn.disabled = false; btn.textContent = 'রিসেট লিংক পাঠান'; }
}
window.doReset = doReset;

function afterLogin(){
  mergeGuestCart();
  closeAuth();
  if(S.user){
    update(ref(db, 'users/' + S.user.uid), { lastActive: Date.now() }).catch(()=>{});
  }
  if(S.returnTo === 'checkout'){
    S.returnTo = null;
    setTimeout(() => openCheckout(), 300);
  }
}

async function doLogout(){
  const ok = await confirmDlg('লগআউট', 'আপনি কি লগআউট করতে চান?');
  if(!ok) return;
  try { await signOut(auth); toast('লগআউট হয়েছে'); closeUser(); go('home'); }
  catch(e){ toast(fbErr(e),'err'); }
}
window.doLogout = doLogout;

/* ================================================================
   USER MENU
   ================================================================ */
window.openUser = function(){
  if(S.user){
    renderUserMenu();
  } else {
    openAuth('login');
    return;
  }
  $('#ovUser').classList.add('on');
};
function closeUser(){ $('#ovUser').classList.remove('on'); }
window.closeUser = closeUser;

function renderUserMenu(){
  const name = S.profile?.name || S.user.displayName || S.user.email || '';
  const email = S.user.email || '';
  const notifUnread = unreadNotifCount();
  $('#userBody').innerHTML = `
    <div style="text-align:center;padding:8px 0 20px;border-bottom:1px solid var(--line);margin-bottom:16px">
      <div style="width:70px;height:70px;border-radius:50%;margin:0 auto 10px;background:linear-gradient(135deg,var(--pri),var(--pri-2));display:grid;place-items:center;color:#fff;font-size:28px;font-weight:800">${esc((name[0]||'U').toUpperCase())}</div>
      <div style="font-weight:800;font-size:16px;margin-bottom:3px">${esc(name)}</div>
      <div class="small">${esc(email)}</div>
    </div>
    <div style="display:grid;gap:8px">
      <button class="btn btn-ghost" style="justify-content:flex-start;height:52px" onclick="closeUser();go('profile')">
        👤 প্রোফাইল
      </button>
      <button class="btn btn-ghost" style="justify-content:flex-start;height:52px" onclick="closeUser();go('orders')">
        📦 আমার অর্ডার
      </button>
      <button class="btn btn-ghost" style="justify-content:flex-start;height:52px" onclick="closeUser();go('wishlist')">
        ❤️ উইশলিস্ট
      </button>
      <button class="btn btn-ghost" style="justify-content:flex-start;height:52px" onclick="closeUser();go('notifications')">
        🔔 নোটিফিকেশন ${notifUnread ? `<span style="margin-left:auto;background:var(--err);color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px">${notifUnread}</span>` : ''}
      </button>
      <button class="btn btn-ghost" style="justify-content:flex-start;height:52px;color:var(--err)" onclick="doLogout()">
        🚪 লগআউট
      </button>
    </div>`;
}

/* ================================================================
   CHECKOUT
   ================================================================ */
let _checkout = { coupon:null, district:'', method:'cod', txn:'' };

window.checkoutFromCart = function(){
  closeCart();
  openCheckout();
};

window.openCheckout = function(){
  const items = cartItemsDetailed();
  if(!items.length){ toast('কার্ট খালি', 'warn'); return; }
  if(!S.user){
    S.returnTo = 'checkout';
    openAuth('login');
    return;
  }
  for(const it of items){
    if(it.qty > num(it.product.stock)){
      toast(`"${it.product.name}" এর স্টক কম`, 'warn');
      setCartQty(it.productId, num(it.product.stock));
    }
  }
  _checkout.coupon = S_coupon;
  renderCheckout();
  $('#ovCheckout').classList.add('on');
};
window.closeCheckout = () => $('#ovCheckout').classList.remove('on');

function renderCheckout(){
  const items = cartItemsDetailed();
  const sub = cartSubtotal();
  const d = S.settings.delivery || {};
  const district = _checkout.district || S.profile?.district || '';
  const del = district ? deliveryFor(district) : num(d.insideCity ?? 60);
  const freeAbove = num(d.freeAbove ?? 0);
  const delFinal = (freeAbove && sub >= freeAbove) ? 0 : del;
  const discount = _checkout.coupon ? _checkout.coupon.discount : 0;
  const total = Math.max(0, sub + delFinal - discount);

  const p = S.settings.payment || {};
  const codAllowed = p.cod !== false;

  let payReq = 'cod';
  items.forEach(it => {
    const t = it.product.paymentType || 'cod';
    if(t === 'full_advance') payReq = 'full_advance';
    else if(t === 'advance_delivery' && payReq !== 'full_advance') payReq = 'advance_delivery';
  });

  const bkashNum = p.bkash || '';
  const nagadNum = p.nagad || '';
  const bkashOn = !!bkashNum && p.bkashEnabled !== false;
  const nagadOn = !!nagadNum && p.nagadEnabled !== false;

  $('#checkoutBody').innerHTML = `
    <div class="small mb16">ডেলিভারি তথ্য দিন এবং পেমেন্ট পদ্ধতি নির্বাচন করুন</div>

    <div class="field"><label>নাম *</label>
      <input id="coName" class="input" value="${esc(S.profile?.name||S.user.displayName||'')}" placeholder="আপনার নাম"></div>

    <div class="row2">
      <div class="field"><label>মোবাইল নম্বর *</label>
        <input id="coPhone" class="input" type="tel" value="${esc(S.profile?.phone||'')}" placeholder="01XXXXXXXXX"></div>
      <div class="field"><label>জেলা *</label>
        <input id="coDistrict" class="input" value="${esc(district)}" placeholder="যেমন: ঢাকা" oninput="_checkout.district=this.value"></div>
    </div>

    <div class="field"><label>উপজেলা / থানা</label>
      <input id="coUpazila" class="input" value="${esc(S.profile?.upazila||'')}" placeholder="উপজেলা / থানা"></div>

    <div class="field"><label>সম্পূর্ণ ঠিকানা *</label>
      <textarea id="coAddr" class="input" placeholder="গ্রাম/বাসা, রোড, এলাকা...">${esc(S.profile?.address||'')}</textarea></div>

    <div class="field"><label>কুপন কোড (ঐচ্ছিক)</label>
      <div style="display:flex;gap:8px">
        <input id="coCoupon" class="input" value="${esc(_checkout.coupon?.code||'')}" placeholder="কুপন কোড" style="text-transform:uppercase">
        <button class="btn btn-outline" onclick="applyCoupon()">প্রয়োগ</button>
      </div>
      <div id="cpMsg" class="small mt8" style="display:none"></div>
    </div>

    <div class="field">
      <label>পেমেন্ট পদ্ধতি *</label>

      ${payReq === 'cod' && codAllowed ? `
        <label class="pay-opt ${_checkout.method==='cod'?'on':''}" onclick="setPayMethod('cod')">
          <input type="radio" name="pm" ${_checkout.method==='cod'?'checked':''}>
          <div class="info"><b>💵 ক্যাশ অন ডেলিভারি</b>
            <span>পণ্য হাতে পেয়ে টাকা পরিশোধ করুন</span></div>
        </label>` : ''}

      ${payReq === 'advance_delivery' ? `
        <div class="pay-note" style="background:rgba(91,75,219,.08);border-color:rgba(91,75,219,.25);color:var(--ink-2)">
          <b style="color:var(--pri)">⚠️ এই অর্ডারের জন্য ডেলিভারি চার্জ অগ্রিম দিতে হবে</b><br>
          ডেলিভারি চার্জ: <b>${money(delFinal)}</b> — বিকাশ/নগদে পাঠিয়ে ট্রানজেকশন আইডি দিন।
        </div>` : ''}

      ${payReq === 'full_advance' ? `
        <div class="pay-note" style="background:rgba(239,68,68,.08);border-color:rgba(239,68,68,.25);color:var(--ink-2)">
          <b style="color:var(--err)">⚠️ এই অর্ডারের জন্য সম্পূর্ণ মূল্য অগ্রিম দিতে হবে</b><br>
          মোট: <b>${money(total)}</b> — বিকাশ/নগদে পাঠিয়ে ট্রানজেকশন আইডি দিন।
        </div>` : ''}

      ${bkashOn ? `
        <label class="pay-opt ${_checkout.method==='bkash'?'on':''}" onclick="setPayMethod('bkash')">
          <input type="radio" name="pm" ${_checkout.method==='bkash'?'checked':''}>
          <div class="info"><b>📱 বিকাশ (bKash)</b>
            <span>ম্যানুয়াল পেমেন্ট — নম্বর: <b>${esc(bkashNum)}</b></span></div>
        </label>` : ''}

      ${nagadOn ? `
        <label class="pay-opt ${_checkout.method==='nagad'?'on':''}" onclick="setPayMethod('nagad')">
          <input type="radio" name="pm" ${_checkout.method==='nagad'?'checked':''}>
          <div class="info"><b>📱 নগদ (Nagad)</b>
            <span>ম্যানুয়াল পেমেন্ট — নম্বর: <b>${esc(nagadNum)}</b></span></div>
        </label>` : ''}

      ${(_checkout.method === 'bkash' || _checkout.method === 'nagad') ? `
        <div class="pay-note">
          <b>📌 পেমেন্ট নির্দেশনা:</b><br>
          ১. ${_checkout.method === 'bkash' ? 'বিকাশ' : 'নগদ'} অ্যাপ / *247# / *167# ডায়াল করুন<br>
          ২. <b>Send Money</b> অপশনে যান<br>
          ৩. নম্বর: <span class="num">${esc(_checkout.method === 'bkash' ? bkashNum : nagadNum)}</span><br>
          ৪. পরিমাণ: <span class="num">${money(payReq === 'advance_delivery' ? delFinal : total)}</span><br>
          ৫. Reference-এ আপনার নাম লিখুন<br>
          ৬. নিচে ট্রানজেকশন আইডি (TrxID) দিন
          <div class="mt12">
            <input id="coTxn" class="input" value="${esc(_checkout.txn||'')}" placeholder="যেমন: 8N7A2XZ9KP">
          </div>
        </div>` : ''}
    </div>

    <div class="summary mt16">
      <div class="ln"><span>সাবটোটাল (${items.length} আইটেম)</span><span><b>${money(sub)}</b></span></div>
      <div class="ln"><span>ডেলিভারি চার্জ</span><span><b>${delFinal === 0 ? 'ফ্রি' : money(delFinal)}</b></span></div>
      ${discount > 0 ? `<div class="ln" style="color:var(--ok)"><span>কুপন ছাড় (${esc(_checkout.coupon.code)})</span><span><b>− ${money(discount)}</b></span></div>` : ''}
      <div class="ln total"><span>সর্বমোট</span><span class="v">${money(total)}</span></div>
    </div>

    <div id="coErr" class="small mt12" style="color:var(--err);display:none"></div>

    <button class="btn btn-pri btn-block mt16" id="coBtn" onclick="placeOrder()" style="height:50px;font-size:15px">
      🛒 অর্ডার নিশ্চিত করুন
    </button>
  `;
}
window.setPayMethod = m => {
  _checkout.method = m;
  if(m === 'cod') _checkout.txn = '';
  const txn = $('#coTxn'); if(txn) _checkout.txn = txn.value;
  renderCheckout();
};
window.applyCoupon = () => {
  const code = ($('#coCoupon')?.value || '').trim();
  const sub = cartSubtotal();
  const r = validateCoupon(code, sub);
  const msg = $('#cpMsg');
  if(r.ok){
    _checkout.coupon = r;
    msg.style.color = 'var(--ok)';
    msg.textContent = `✓ কুপন প্রয়োগ হয়েছে — ছাড় ${money(r.discount)}`;
    msg.style.display = 'block';
    toast('কুপন প্রয়োগ ✓', 'ok');
    setTimeout(() => renderCheckout(), 300);
  } else {
    _checkout.coupon = null;
    msg.style.color = 'var(--err)';
    msg.textContent = '✕ ' + r.msg;
    msg.style.display = 'block';
  }
};

async function placeOrder(){
  const name = ($('#coName')?.value || '').trim();
  const phone = ($('#coPhone')?.value || '').trim();
  const district = ($('#coDistrict')?.value || '').trim();
  const upazila = ($('#coUpazila')?.value || '').trim();
  const address = ($('#coAddr')?.value || '').trim();
  const err = $('#coErr');
  const btn = $('#coBtn');

  err.style.display = 'none';
  if(name.length < 2){ err.textContent='নাম দিন'; err.style.display='block'; return; }
  if(!/^01[3-9]\d{8}$/.test(phone)){ err.textContent='সঠিক মোবাইল নম্বর দিন (01XXXXXXXXX)'; err.style.display='block'; return; }
  if(!district){ err.textContent='জেলা দিন'; err.style.display='block'; return; }
  if(address.length < 8){ err.textContent='সম্পূর্ণ ঠিকানা দিন'; err.style.display='block'; return; }
  if(_checkout.method === 'bkash' || _checkout.method === 'nagad'){
    const txn = ($('#coTxn')?.value || '').trim();
    if(txn.length < 4){ err.textContent='ট্রানজেকশন আইডি দিন'; err.style.display='block'; return; }
    _checkout.txn = txn;
  }

  const items = cartItemsDetailed();
  if(!items.length){ err.textContent='কার্ট খালি'; err.style.display='block'; return; }

  for(const it of items){
    const fresh = S.products[it.productId];
    if(!fresh || fresh.active === false){
      err.textContent = `"${it.product.name}" এখন উপলব্ধ নেই`;
      err.style.display='block'; return;
    }
    if(it.qty > num(fresh.stock)){
      err.textContent = `"${it.product.name}" এর স্টক ${fresh.stock} টি — পরিমাণ কমান`;
      err.style.display='block'; return;
    }
  }

  const sub = items.reduce((s,i) => s + num(S.products[i.productId].price) * i.qty, 0);
  const d = S.settings.delivery || {};
  const del = deliveryFor(district);
  const freeAbove = num(d.freeAbove ?? 0);
  const delFinal = (freeAbove && sub >= freeAbove) ? 0 : del;
  let discount = 0;
  if(_checkout.coupon){
    const fresh = validateCoupon(_checkout.coupon.code, sub);
    if(fresh.ok) discount = fresh.discount;
    else { _checkout.coupon = null; }
  }
  const total = Math.max(0, sub + delFinal - discount);

  btn.disabled = true;
  btn.textContent = 'অর্ডার প্রসেস হচ্ছে...';

  try {
    const oid = orderId();
    const order = {
      orderId: oid,
      uid: S.user.uid,
      items: items.map(i => ({
        productId: i.productId,
        name: S.products[i.productId].name || '',
        image: productImage(S.products[i.productId]) || '',
        price: num(S.products[i.productId].price),
        qty: i.qty
      })),
      subtotal: sub,
      deliveryCharge: delFinal,
      discount,
      couponCode: _checkout.coupon?.code || '',
      total,
      customer: { name, phone, district, upazila, address },
      payment: {
        method: _checkout.method,
        txnId: _checkout.method === 'cod' ? '' : (_checkout.txn || ''),
        status: 'pending'
      },
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await set(ref(db, 'orders/' + S.user.uid + '/' + oid), order);

    for(const it of items){
      const pref = ref(db, 'products/' + it.productId + '/stock');
      await runTransaction(pref, cur => {
        const n = num(cur) - it.qty;
        return n < 0 ? num(cur) : n;
      }).catch(()=>{});
      await runTransaction(ref(db, 'products/' + it.productId + '/sold'), cur => num(cur) + it.qty).catch(()=>{});
    }

    if(_checkout.coupon){
      await runTransaction(ref(db, 'coupons/' + _checkout.coupon.id + '/used'), cur => num(cur) + 1).catch(()=>{});
    }

    update(ref(db, 'users/' + S.user.uid), { name, phone, district, upazila, address, lastActive: Date.now() }).catch(()=>{});

    const nid = uid();
    set(ref(db, 'userNotifications/' + S.user.uid + '/' + nid), {
      title: 'অর্ডার সফল হয়েছে',
      message: `আপনার অর্ডার #${oid} গ্রহণ করা হয়েছে। মোট: ${money(total)}`,
      orderId: oid,
      read: false,
      createdAt: Date.now()
    }).catch(()=>{});

    clearCart();
    _checkout.coupon = null;
    S_coupon = null;
    closeCheckout();
    showOrderSuccess(oid, order);
    toast('অর্ডার সফল ✓', 'ok');

  } catch(e){
    console.error(e);
    err.textContent = 'অর্ডার ব্যর্থ: ' + (e.message||e);
    err.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = '🛒 অর্ডার নিশ্চিত করুন';
  }
}
window.placeOrder = placeOrder;

function showOrderSuccess(oid, order){
  $('#successBody').innerHTML = `
    <div style="text-align:center;padding:24px 8px">
      <div style="width:80px;height:80px;border-radius:50%;margin:0 auto 16px;background:rgba(16,185,129,.15);display:grid;place-items:center;font-size:42px">✅</div>
      <h2 style="margin:0 0 8px;font-size:22px;font-weight:800">অর্ডার সফল হয়েছে!</h2>
      <p class="muted" style="margin:0 0 6px;font-size:14px">আপনার অর্ডার আইডি</p>
      <div style="font-family:'Inter',monospace;font-size:18px;font-weight:800;color:var(--pri);letter-spacing:1px;margin-bottom:14px">${esc(oid)}</div>
      <p class="small">মোট: <b style="color:var(--pri);font-size:15px">${money(order.total)}</b></p>
      <p class="small" style="margin-top:6px">${order.payment.method === 'cod' ? '💵 ক্যাশ অন ডেলিভারি' : order.payment.method === 'bkash' ? '📱 বিকাশ' : '📱 নগদ'} — স্ট্যাটাস: Pending</p>
      ${(order.payment.method !== 'cod' && order.payment.txnId) ? `
        <div class="pay-note mt16" style="text-align:left">
          <b>📌 পরবর্তী ধাপ:</b><br>
          অ্যাডমিন আপনার ট্রানজেকশন আইডি যাচাই করবেন। যাচাই সফল হলে অর্ডারটি কনফার্ম হবে।
        </div>` : ''}
    </div>
    <div style="display:grid;gap:10px;padding:0 8px 8px">
      <button class="btn btn-pri btn-block" onclick="closeSuccess();go('orders')">আমার অর্ডার দেখুন</button>
      <button class="btn btn-ghost btn-block" onclick="closeSuccess();go('shop')">আরও কিনুন</button>
    </div>`;
  $('#ovSuccess').classList.add('on');
}
window.closeSuccess = () => $('#ovSuccess').classList.remove('on');

/* ================================================================
   USER ORDERS
   ================================================================ */
function statusText(s){
  return { pending:'অপেক্ষমাণ', confirmed:'কনফার্ম', processing:'প্রসেসিং',
    shipped:'শিপড', delivered:'ডেলিভারড', cancelled:'বাতিল' }[s] || s;
}
function renderOrders(){
  if(!S.user){
    $('#ordersContent').innerHTML = `
      <div class="empty"><div class="ei">🔐</div><h4>লগইন করুন</h4>
        <p>অর্ডার দেখতে লগইন করুন</p>
        <button class="btn btn-pri mt16" onclick="openAuth('login')">লগইন</button></div>`;
    return;
  }
  const list = Object.entries(S.orders).map(([id,o]) => ({id,...o}))
    .sort((a,b) => num(b.createdAt) - num(a.createdAt));
  if(!list.length){
    $('#ordersContent').innerHTML = `<div class="empty"><div class="ei">📦</div>
      <h4>কোনো অর্ডার নেই</h4><p>এখনো কোনো অর্ডার করা হয়নি</p>
      <button class="btn btn-pri mt16" onclick="go('shop')">শপিং শুরু করুন</button></div>`;
    return;
  }
  $('#ordersContent').innerHTML = list.map(o => `
    <div class="oitem">
      <div class="top">
        <div>
          <div class="oid">#${esc(o.orderId||o.id)}</div>
          <div class="small">${fmtDate(o.createdAt)}</div>
        </div>
        <span class="status ${esc(o.status||'pending')}">${statusText(o.status||'pending')}</span>
      </div>
      ${(o.items||[]).map(i => `
        <div class="prd">
          <div class="img">${i.image
            ? `<img src="${esc(i.image)}" onerror="this.parentNode.innerHTML='<div style=display:grid;place-items:center;height:100%;color:#94A3B8>📦</div>'">`
            : `<div style="display:grid;place-items:center;height:100%;color:#94A3B8">📦</div>`}</div>
          <div class="info">
            <b>${esc(i.name)}</b>
            <span>${money(i.price)} × ${i.qty}</span>
          </div>
          <div style="font-weight:700;color:var(--pri)">${money(num(i.price)*i.qty)}</div>
        </div>`).join('')}
      <div class="foot">
        <div>
          <div class="small">পেমেন্ট: ${o.payment?.method === 'cod' ? 'ক্যাশ অন ডেলিভারি' : o.payment?.method === 'bkash' ? 'বিকাশ' : 'নগদ'}
            <span class="status ${esc(o.payment?.status||'pending')}" style="margin-left:6px">${esc(o.payment?.status||'pending')}</span></div>
          ${o.payment?.txnId ? `<div class="small">TrxID: ${esc(o.payment.txnId)}</div>` : ''}
        </div>
        <div style="text-align:right">
          <div class="small">সর্বমোট</div>
          <div class="ttl">${money(o.total)}</div>
        </div>
      </div>
    </div>`).join('');
}

/* ================================================================
   WISHLIST
   ================================================================ */
function renderWishlist(){
  let ids = [];
  if(S.user) ids = Object.keys(S.wishlist);
  else { try { ids = Object.keys(JSON.parse(localStorage.getItem('pc_wish_guest') || '{}')); } catch(e){} }
  const list = ids.map(id => getProduct(id)).filter(p => p && isActive(p));
  if(!list.length){
    $('#wishlistContent').innerHTML = `<div class="empty"><div class="ei">❤️</div>
      <h4>উইশলিস্ট খালি</h4><p>পছন্দের পণ্য ❤️ আইকনে ট্যাপ করে যোগ করুন</p>
      <button class="btn btn-pri mt16" onclick="go('shop')">শপিং শুরু করুন</button></div>`;
    return;
  }
  $('#wishlistContent').innerHTML = `<div class="pgrid">${list.map(pcardHTML).join('')}</div>`;
}

/* ================================================================
   NOTIFICATIONS
   ================================================================ */
function unreadNotifCount(){
  let c = 0;
  if(S.user){
    Object.values(S.userNotifs).forEach(n => { if(!n.read) c++; });
  }
  const readG = JSON.parse(localStorage.getItem('pc_read_g_' + (S.user ? S.user.uid : 'guest')) || '{}');
  Object.entries(S.notifications).forEach(([id,n]) => {
    if(n.active !== false && !readG[id]) c++;
  });
  return c;
}
function updateNotifBadge(){
  // no bell in bottom nav — reserved for future
}
function renderNotifications(){
  if(!S.user){
    $('#notifContent').innerHTML = `<div class="empty"><div class="ei">🔔</div>
      <h4>লগইন করুন</h4><p>নোটিফিকেশন দেখতে লগইন করুন</p>
      <button class="btn btn-pri mt16" onclick="openAuth('login')">লগইন</button></div>`;
    return;
  }
  const readG = JSON.parse(localStorage.getItem('pc_read_g_' + S.user.uid) || '{}');
  const globals = Object.entries(S.notifications)
    .map(([id,n]) => ({id, ...n, _global:true}))
    .filter(n => n.active !== false);
  const personals = Object.entries(S.userNotifs).map(([id,n]) => ({id, ...n}));
  const all = [...globals, ...personals].sort((a,b) => num(b.createdAt) - num(a.createdAt));

  if(!all.length){
    $('#notifContent').innerHTML = `<div class="empty"><div class="ei">🔔</div><h4>কোনো নোটিফিকেশন নেই</h4></div>`;
    return;
  }
  $('#notifContent').innerHTML = all.map(n => {
    const isRead = n._global ? !!readG[n.id] : !!n.read;
    return `
      <div class="notif ${isRead?'':'unread'}" onclick="readNotif('${esc(n.id)}',${n._global?'true':'false'})">
        ${!isRead ? '<span class="dot"></span>' : ''}
        <div class="ic">${n._global ? '📢' : '📦'}</div>
        <div style="flex:1">
          <h4>${esc(n.title||'নোটিফিকেশন')}</h4>
          <p>${esc(n.message||'')}</p>
          <div class="t">${timeAgo(n.createdAt)}</div>
        </div>
      </div>`;
  }).join('');
}
window.readNotif = async (id, isGlobal) => {
  if(!S.user) return;
  if(isGlobal){
    const readG = JSON.parse(localStorage.getItem('pc_read_g_' + S.user.uid) || '{}');
    readG[id] = true;
    localStorage.setItem('pc_read_g_' + S.user.uid, JSON.stringify(readG));
    renderNotifications();
  } else {
    await update(ref(db, 'userNotifications/' + S.user.uid + '/' + id), { read:true }).catch(()=>{});
    renderNotifications();
  }
};
window.markAllNotifRead = async () => {
  if(!S.user) return;
  const readG = {};
  Object.keys(S.notifications).forEach(id => readG[id] = true);
  localStorage.setItem('pc_read_g_' + S.user.uid, JSON.stringify(readG));
  const updates = {};
  Object.keys(S.userNotifs).forEach(id => updates['userNotifications/' + S.user.uid + '/' + id + '/read'] = true);
  if(Object.keys(updates).length) await update(ref(db), updates).catch(()=>{});
  renderNotifications();
  toast('সব পড়া হয়েছে', 'ok');
};

/* ================================================================
   PROFILE
   ================================================================ */
function renderProfile(){
  if(!S.user){
    go('home');
    openAuth('login');
    return;
  }
  const p = S.profile || {};
  const name = p.name || S.user.displayName || '';
  const email = S.user.email || '';
  const phone = p.phone || '';
  const district = p.district || '';
  const upazila = p.upazila || '';
  const address = p.address || '';
  const joined = p.createdAt || S.user.metadata?.creationTime;
  const orderCount = Object.keys(S.orders).length;
  const wishCount = Object.keys(S.wishlist).length;

  $('#profileContent').innerHTML = `
    <div style="text-align:center;padding:24px 16px 20px">
      <div style="width:88px;height:88px;border-radius:50%;margin:0 auto 12px;background:linear-gradient(135deg,var(--pri),var(--pri-2));display:grid;place-items:center;color:#fff;font-size:36px;font-weight:800;box-shadow:0 8px 24px rgba(91,75,219,.3)">${esc((name[0]||'U').toUpperCase())}</div>
      <h2 style="margin:0 0 4px;font-size:20px;font-weight:800">${esc(name)}</h2>
      <p class="muted small" style="margin:0">${esc(email)}</p>
      <div style="display:flex;justify-content:center;gap:24px;margin-top:16px">
        <div><div style="font-size:19px;font-weight:800;color:var(--pri)">${orderCount}</div>
          <div class="small">অর্ডার</div></div>
        <div><div style="font-size:19px;font-weight:800;color:var(--pri)">${wishCount}</div>
          <div class="small">উইশলিস্ট</div></div>
      </div>
    </div>

    <div class="mt16">
      <div class="sec-head">
        <h2 style="font-size:16px"><span class="ic">✏️</span> প্রোফাইল তথ্য</h2>
      </div>
      <div class="field"><label>নাম</label>
        <input id="pfName" class="input" value="${esc(name)}"></div>
      <div class="field"><label>মোবাইল</label>
        <input id="pfPhone" class="input" type="tel" value="${esc(phone)}" placeholder="01XXXXXXXXX"></div>
      <div class="row2">
        <div class="field"><label>জেলা</label>
          <input id="pfDistrict" class="input" value="${esc(district)}"></div>
        <div class="field"><label>উপজেলা / থানা</label>
          <input id="pfUpazila" class="input" value="${esc(upazila)}"></div>
      </div>
      <div class="field"><label>ঠিকানা</label>
        <textarea id="pfAddr" class="input">${esc(address)}</textarea></div>
      <button class="btn btn-pri btn-block" onclick="saveProfile()">💾 সংরক্ষণ করুন</button>
    </div>

    <div class="mt24">
      <div class="sec-head">
        <h2 style="font-size:16px"><span class="ic">📋</span> আরও</h2>
      </div>
      <div style="display:grid;gap:8px">
        <button class="btn btn-ghost" style="justify-content:flex-start;height:52px" onclick="go('orders')">📦 আমার অর্ডার</button>
        <button class="btn btn-ghost" style="justify-content:flex-start;height:52px" onclick="go('wishlist')">❤️ উইশলিস্ট</button>
        <button class="btn btn-ghost" style="justify-content:flex-start;height:52px" onclick="go('notifications')">🔔 নোটিফিকেশন</button>
        <button class="btn btn-ghost" style="justify-content:flex-start;height:52px;color:var(--err)" onclick="doLogout()">🚪 লগআউট</button>
      </div>
      ${joined ? `<div class="small tac mt16">যোগদান: ${fmtDate(typeof joined==='number'?joined:Date.parse(joined))}</div>` : ''}
    </div>`;
}
window.saveProfile = async () => {
  const name = ($('#pfName')?.value || '').trim();
  const phone = ($('#pfPhone')?.value || '').trim();
  const district = ($('#pfDistrict')?.value || '').trim();
  const upazila = ($('#pfUpazila')?.value || '').trim();
  const address = ($('#pfAddr')?.value || '').trim();
  if(name.length < 2){ toast('নাম দিন', 'warn'); return; }
  if(phone && !/^01[3-9]\d{8}$/.test(phone)){ toast('সঠিক মোবাইল নম্বর দিন', 'warn'); return; }
  try {
    await update(ref(db, 'users/' + S.user.uid), { name, phone, district, upazila, address, lastActive: Date.now() });
    await updateProfile(S.user, { displayName: name }).catch(()=>{});
    toast('প্রোফাইল সংরক্ষিত ✓', 'ok');
  } catch(e){ toast(fbErr(e), 'err'); }
};

/* ================================================================
   FILTERS DRAWER
   ================================================================ */
window.openFilters = function(){
  const cats = Object.entries(S.categories).map(([id,c]) => ({id,...c}));
  const brands = [...new Set(activeProducts().map(p => p.brand).filter(Boolean))];
  const f = S.shopFilters;
  $('#filtersBody').innerHTML = `
    <div class="field"><label>ক্যাটাগরি</label>
      <select id="fCat" class="input">
        <option value="">সব</option>
        ${cats.map(c => `<option value="${esc(c.name)}" ${f.cat===c.name?'selected':''}>${esc(c.name)}</option>`).join('')}
      </select></div>
    <div class="field"><label>ব্র্যান্ড</label>
      <select id="fBrand" class="input">
        <option value="">সব</option>
        ${brands.map(b => `<option value="${esc(b)}" ${f.brand===b?'selected':''}>${esc(b)}</option>`).join('')}
      </select></div>
    <div class="row2">
      <div class="field"><label>সর্বনিম্ন দাম</label>
        <input id="fMin" class="input" type="number" value="${f.min || ''}" placeholder="0"></div>
      <div class="field"><label>সর্বোচ্চ দাম</label>
        <input id="fMax" class="input" type="number" value="${f.max === 999999 ? '' : f.max}" placeholder=""></div>
    </div>
    <div class="field"><label>সাজানোর ধরন</label>
      <select id="fSort" class="input">
        <option value="new" ${f.sort==='new'?'selected':''}>নতুন আগে</option>
        <option value="low" ${f.sort==='low'?'selected':''}>দাম কম → বেশি</option>
        <option value="high" ${f.sort==='high'?'selected':''}>দাম বেশি → কম</option>
        <option value="disc" ${f.sort==='disc'?'selected':''}>সর্বোচ্চ ছাড়</option>
      </select></div>
    <div style="display:flex;gap:10px;margin-top:8px">
      <button class="btn btn-ghost btn-block" onclick="clearAllFilters()">রিসেট</button>
      <button class="btn btn-pri btn-block" onclick="applyFilters()">প্রয়োগ</button>
    </div>`;
  $('#ovFilters').classList.add('on');
};
window.closeFilters = () => $('#ovFilters').classList.remove('on');
window.applyFilters = () => {
  S.shopFilters.cat = $('#fCat').value;
  S.shopFilters.brand = $('#fBrand').value;
  S.shopFilters.min = num($('#fMin').value) || 0;
  S.shopFilters.max = num($('#fMax').value) || 999999;
  S.shopFilters.sort = $('#fSort').value;
  closeFilters();
  renderShop();
};

/* ================================================================
   SHARE SYSTEM
   ================================================================ */
let _sharePid = null;

function shareUrlFor(pid){
  const base = location.origin + location.pathname;
  return base + '#p=' + encodeURIComponent(pid);
}

function shareTextFor(p){
  const price = num(p.price);
  const oldPrice = num(p.oldPrice);
  const disc = discountPct(price, oldPrice);
  let text = `🛍️ ${p.name || 'Product'}\n`;
  if(disc > 0) text += `🔥 ${disc}% ছাড়! `;
  text += `দাম: ৳${price.toLocaleString('en-BD')}`;
  if(oldPrice > price) text += ` (আগে ৳${oldPrice.toLocaleString('en-BD')})`;
  text += `\n\n${S.settings.store?.name || 'Primo Cart'} থেকে কিনুন 👇`;
  return text;
}

window.openShare = function(pid){
  const p = getProduct(pid);
  if(!p){ toast('পণ্য পাওয়া যায়নি', 'err'); return; }
  _sharePid = pid;
  renderShareSheet(p);
  $('#ovShare').classList.add('on');
};
window.closeShare = function(){
  $('#ovShare').classList.remove('on');
  _sharePid = null;
};

function renderShareSheet(p){
  const url = shareUrlFor(p.id);
  const text = shareTextFor(p);
  const img = productImage(p);
  const shareData = {
    title: p.name || 'Primo Cart',
    text: text,
    url: url
  };

  const canNativeShare = !!navigator.share;

  const options = [
    {
      key: 'native',
      name: 'আরও',
      icon: '📤',
      cls: 'sic-native',
      show: canNativeShare,
      fn: () => nativeShare(shareData)
    },
    {
      key: 'fb',
      name: 'Facebook',
      icon: 'f',
      cls: 'sic-fb',
      fn: () => openShareWin(
        'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url) +
        '&quote=' + encodeURIComponent(text)
      )
    },
    {
      key: 'wa',
      name: 'WhatsApp',
      icon: '💬',
      cls: 'sic-wa',
      fn: () => openShareWin(
        'https://wa.me/?text=' + encodeURIComponent(text + '\n' + url)
      )
    },
    {
      key: 'msg',
      name: 'Messenger',
      icon: 'm',
      cls: 'sic-msg',
      fn: () => openShareWin(
        'https://www.facebook.com/dialog/send?link=' + encodeURIComponent(url) +
        '&app_id=291494419107518&redirect_uri=' + encodeURIComponent(url)
      )
    },
    {
      key: 'tg',
      name: 'Telegram',
      icon: '✈',
      cls: 'sic-tg',
      fn: () => openShareWin(
        'https://t.me/share/url?url=' + encodeURIComponent(url) +
        '&text=' + encodeURIComponent(text)
      )
    },
    {
      key: 'tw',
      name: 'Twitter / X',
      icon: '𝕏',
      cls: 'sic-tw',
      fn: () => openShareWin(
        'https://twitter.com/intent/tweet?url=' + encodeURIComponent(url) +
        '&text=' + encodeURIComponent(text)
      )
    },
    {
      key: 'sms',
      name: 'SMS',
      icon: '✉',
      cls: 'sic-sms',
      fn: () => {
        const body = encodeURIComponent(text + '\n' + url);
        location.href = 'sms:?body=' + body;
      }
    },
    {
      key: 'copy',
      name: 'লিংক কপি',
      icon: '🔗',
      cls: 'sic-link',
      fn: () => copyShareLink(url)
    }
  ];

  $('#shareBody').innerHTML = `
    <div class="share-preview">
      <div class="img">
        ${img
          ? `<img src="${esc(img)}" alt="" onerror="this.parentNode.innerHTML='<div class=\\'ph\\'>📦</div>'">`
          : `<div class="ph">📦</div>`}
      </div>
      <div class="info">
        <b>${esc(p.name || 'Product')}</b>
        <span>৳${num(p.price).toLocaleString('en-BD')}</span>
      </div>
    </div>

    <div class="share-grid">
      ${options.filter(o => o.show !== false).map(o => `
        <div class="share-opt" data-key="${o.key}">
          <div class="sic ${o.cls}">${esc(o.icon)}</div>
          <div class="snm">${esc(o.name)}</div>
        </div>
      `).join('')}
    </div>

    <div class="pay-note" style="background:rgba(91,75,219,.06);border-color:rgba(91,75,219,.2);color:var(--ink-2);margin-top:6px">
      <b style="color:var(--pri)">💡 টিপস:</b> শেয়ার করা লিংকে কেউ ক্লিক করলে সরাসরি এই পণ্যের পেজ খুলবে।
    </div>

    <button class="btn btn-ghost btn-block mt16" onclick="closeShare()">বন্ধ করুন</button>
  `;

  $$('#shareBody .share-opt').forEach(el => {
    const key = el.dataset.key;
    const opt = options.find(o => o.key === key);
    if(opt && opt.fn) el.addEventListener('click', opt.fn);
  });
}

async function nativeShare(data){
  try {
    await navigator.share(data);
  } catch(e){
    if(e.name !== 'AbortError') console.warn('native share failed', e);
  }
}

function openShareWin(url){
  const w = 600, h = 500;
  const y = (window.innerHeight - h) / 2 + window.screenY;
  const x = (window.innerWidth - w) / 2 + window.screenX;
  window.open(url, 'share', `width=${w},height=${h},left=${x},top=${y},noopener,noreferrer`);
}

async function copyShareLink(url){
  try {
    if(navigator.clipboard && window.isSecureContext){
      await navigator.clipboard.writeText(url);
    } else {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast('লিংক কপি হয়েছে ✓', 'ok');
    const copyBtn = document.querySelector('#shareBody .share-opt[data-key="copy"] .sic');
    if(copyBtn){
      copyBtn.classList.add('copy-ok');
      setTimeout(() => copyBtn.classList.remove('copy-ok'), 900);
    }
  } catch(e){
    console.error(e);
    toast('কপি করা যায়নি — ম্যানুয়ালি কপি করুন', 'warn');
    prompt('লিংক:', url);
  }
}

/* Deep Link Handler */
function handleDeepLink(){
  const hash = location.hash.replace(/^#/, '');
  if(!hash) return;
  const m = hash.match(/^p=(.+)$/);
  if(!m) return;
  const pid = decodeURIComponent(m[1]);
  const tryOpen = (tries) => {
    if(tries < 0) return;
    if(S.products[pid]){ openPd(pid); return; }
    setTimeout(() => tryOpen(tries - 1), 300);
  };
  tryOpen(20);
}

window.addEventListener('hashchange', handleDeepLink);

/* ================================================================
   SEARCH BINDINGS
   ================================================================ */
let _sTimer;
function bindSearch(){
  const inputs = [$('#searchTop'), $('#searchMain')].filter(Boolean);
  inputs.forEach(inp => {
    inp.addEventListener('input', e => {
      const v = e.target.value;
      inputs.forEach(i => { if(i !== e.target) i.value = v; });
      clearTimeout(_sTimer);
      _sTimer = setTimeout(() => {
        S.searchQ = v;
        if(S.view !== 'search') go('search');
        else renderSearchResults();
      }, 220);
    });
  });
}

/* ================================================================
   OVERLAY CLOSE ON BACKGROUND CLICK
   ================================================================ */
['ovCart','ovPd','ovAuth','ovCheckout','ovUser','ovFilters','ovShare'].forEach(id => {
  const el = document.getElementById(id);
  if(!el) return;
  el.addEventListener('click', e => {
    if(e.target.id === id) el.classList.remove('on');
  });
});

/* ================================================================
   BOOT
   ================================================================ */
(function boot(){
  listenSettings();
  listenProducts();
  listenCategories();
  listenBanners();
  listenCoupons();
  listenGlobalNotifications();
  loadCart();
  bindSearch();
  updateHdrAvatar();
  updateWishBadge();
  refreshCartUI();
  renderHome();
  handleDeepLink();
  console.log('[Primo Cart] ready ✓');
})();

/* Expose for inline handlers */
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.setCartQty = setCartQty;
window.toggleWish = toggleWish;