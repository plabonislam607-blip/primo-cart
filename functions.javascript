const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.database();

exports.placeOrder = functions.region('asia-southeast1').https.onCall(async (data, ctx) => {
  if(!ctx.auth) throw new functions.https.HttpsError('unauthenticated', 'Login required');
  const { items, customer, payment } = data;
  if(!Array.isArray(items) || !items.length) throw new functions.https.HttpsError('invalid-argument', 'No items');

  let subtotal = 0;
  const verified = [];
  for(const it of items){
    const snap = await db.ref('products/' + it.productId).get();
    const p = snap.val();
    if(!p || p.active === false) throw new functions.https.HttpsError('failed-precondition', 'Product unavailable');
    if(Number(p.stock) < Number(it.qty)) throw new functions.https.HttpsError('failed-precondition', 'Insufficient stock');
    subtotal += Number(p.price) * Number(it.qty);
    verified.push({ productId: it.productId, name: p.name, price: p.price, qty: it.qty, image: p.image || '' });
  }

  const settings = (await db.ref('settings/delivery').get()).val() || {};
  const delivery = Number(settings.insideCity) || 60;
  const total = subtotal + delivery;

  const oid = 'PC' + Date.now().toString().slice(-8);
  const order = {
    orderId: oid, uid: ctx.auth.uid, items: verified,
    subtotal, deliveryCharge: delivery, discount: 0, total,
    customer, payment: { ...payment, status: 'pending' },
    status: 'pending', createdAt: Date.now(), updatedAt: Date.now()
  };

  // Atomic write + stock decrement
  await db.ref('orders/' + ctx.auth.uid + '/' + oid).set(order);
  for(const it of verified){
    await db.ref('products/' + it.productId + '/stock').transaction(c => Number(c) - it.qty);
  }
  return { ok: true, orderId: oid, total };
});