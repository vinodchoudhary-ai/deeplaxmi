/* Deeplaxmi shared data layer, used by the customer website and the Order Desk.
   With FIREBASE_CONFIG set it uses Firebase (Firestore + Auth).
   Without it, it falls back to the built-in item list and this-phone-only storage. */
(function () {
  const V = "10.12.2";
  const SDK = n => `https://www.gstatic.com/firebasejs/${V}/firebase-${n}.js`;

  /* Starting item list. Once Firebase is connected, rates are edited in the Order Desk → Rates. */
  const DEFAULT_ITEMS = [
    ["tomato","Sabzi","Tomato","Tamatar","kg",40,"🍅","#ff5a5f",10112127],
    ["onion","Sabzi","Onion","Kanda / Pyaz","kg",35,"🧅","#c77dff",7890176],
    ["potato","Sabzi","Potato","Batata / Aloo","kg",30,"🥔","#d4a373",144248],
    ["green-chilli","Sabzi","Green chilli","Hari mirch","kg",80,"🌶️","#a6f04a",12955689],
    ["ginger","Sabzi","Ginger","Adrak","kg",120,"🫚","#e9c46a",10112136],
    ["garlic","Sabzi","Garlic","Lehsun","kg",200,"🧄","#f1f1e6",2764164],
    ["cauliflower","Sabzi","Cauliflower","Phool gobi","pc",40,"🥦","#a6f04a",7572005],
    ["cabbage","Sabzi","Cabbage","Patta gobi","pc",30,"🥬","#7bd389",3283450],
    ["brinjal","Sabzi","Brinjal","Vangi / Baingan","kg",50,"🍆","#9d4edd",3948546],
    ["lady-finger","Sabzi","Lady finger","Bhindi","kg",60,"🫛","#6fcf5b",34168070],
    ["capsicum","Sabzi","Capsicum","Shimla mirch","kg",70,"🫑","#52b788",2893635],
    ["carrot","Sabzi","Carrot","Gajar","kg",50,"🥕","#ff8c42",20371247],
    ["cucumber","Sabzi","Cucumber","Kakdi","kg",40,"🥒","#74c69d",2775838],
    ["bottle-gourd","Sabzi","Bottle gourd","Dudhi / Lauki","pc",30,"🥒","#95d5b2",39130946],
    ["lemon","Sabzi","Lemon","Limbu","pc",5,"🍋","#ffd60a",4089122],
    ["coriander","Leafy","Coriander","Kothimbir","bunch",15,"🌿","#3ee6d0",606540],
    ["methi","Leafy","Methi","Methi","bunch",20,"🌱","#a6f04a",8290265],
    ["spinach","Leafy","Spinach","Palak","bunch",20,"🥬","#2dc653",38571502],
    ["mint","Leafy","Mint","Pudina","bunch",10,"🌿","#5ef2b5",13632808],
    ["spring-onion","Leafy","Spring onion","Kanda paat","bunch",20,"🌱","#b5e48c",7456538],
    ["curry-leaves","Leafy","Curry leaves","Kadipatta","bunch",10,"🍃","#40c057",37215213],
    ["banana","Fruits","Banana","Keli / Kela","dozen",60,"🍌","#ffd60a",4399936],
    ["apple","Fruits","Apple (Shimla)","Safarchand","kg",160,"🍎","#ff4d6d",3903599],
    ["pomegranate","Fruits","Pomegranate","Dalimb / Anar","kg",180,"🔴","#e63946",18523341],
    ["papaya","Fruits","Papaya","Papai","pc",60,"🥭","#ff9f1c",28613331],
    ["guava","Fruits","Guava","Peru","kg",80,"🍐","#99d98c",14617820],
    ["sweet-lime","Fruits","Sweet lime","Mosambi","kg",80,"🍈","#d9ed92",39189959],
    ["orange","Fruits","Orange","Santra","kg",100,"🍊","#ffb23e",8639570],
    ["custard-apple","Fruits","Custard apple","Sitaphal","kg",120,"🍏","#80ed99",34169446],
    ["grapes","Fruits","Grapes","Draksh","kg",120,"🍇","#9d4edd",3987387]
  ].map(([key,cat,name,local,unit,price,pic,hue,photo]) => ({key,cat,name,local,unit,price,pic,hue,photo,stock:true}));

  const photoUrl = id => id ? `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=480&h=360&fit=crop` : "";
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error("timeout")), ms))]);

  /* ---------- Firebase ---------- */
  let fb = null;
  async function firebase() {
    if (fb) return fb;
    const [app, store, auth] = await Promise.all([import(SDK("app")), import(SDK("firestore")), import(SDK("auth"))]);
    const a = app.initializeApp(window.FIREBASE_CONFIG);
    fb = { s: store, au: auth, db: store.getFirestore(a), auth: auth.getAuth(a) };
    return fb;
  }
  const FirebaseDB = {
    online: true,
    async getCatalog() {
      const f = await withTimeout(firebase(), 8000);
      const snap = await withTimeout(f.s.getDoc(f.s.doc(f.db, "shop", "catalog")), 8000);
      return snap.exists() ? snap.data().items : null;
    },
    async saveCatalog(items) {
      const f = await firebase();
      await f.s.setDoc(f.s.doc(f.db, "shop", "catalog"), { items, updatedMs: Date.now() });
    },
    async addOrder(order) {
      const f = await withTimeout(firebase(), 8000);
      const ref = await withTimeout(f.s.addDoc(f.s.collection(f.db, "orders"), { ...order, createdAt: f.s.serverTimestamp() }), 10000);
      return ref.id;
    },
    watchOrders(cb, onErr) {
      let unsub = () => {};
      firebase().then(f => {
        const q = f.s.query(f.s.collection(f.db, "orders"), f.s.orderBy("createdMs", "desc"), f.s.limit(150));
        unsub = f.s.onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))), e => onErr && onErr(e));
      }).catch(e => onErr && onErr(e));
      return () => unsub();
    },
    async updateOrder(id, patch) { const f = await firebase(); await f.s.updateDoc(f.s.doc(f.db, "orders", id), patch); },
    async deleteOrder(id) { const f = await firebase(); await f.s.deleteDoc(f.s.doc(f.db, "orders", id)); },
    async signIn(email, pass) { const f = await firebase(); await f.au.signInWithEmailAndPassword(f.auth, email, pass); },
    async signOut() { const f = await firebase(); await f.au.signOut(f.auth); },
    onAuth(cb) { firebase().then(f => f.au.onAuthStateChanged(f.auth, u => cb(u ? { email: u.email } : null))).catch(() => cb(null)); }
  };

  /* ---------- This-phone-only fallback (before Firebase is set up) ---------- */
  const listeners = new Set();
  const emit = () => { const o = ls.get("dl-local-orders", []); listeners.forEach(cb => cb(o)); };
  window.addEventListener("storage", e => { if (e.key === "dl-local-orders") emit(); });
  const LocalDB = {
    online: false,
    async getCatalog() { return ls.get("dl-local-catalog", null); },
    async saveCatalog(items) { ls.set("dl-local-catalog", items); },
    async addOrder(order) {
      const o = ls.get("dl-local-orders", []); const id = "L" + Date.now();
      o.unshift({ id, ...order }); ls.set("dl-local-orders", o); emit(); return id;
    },
    watchOrders(cb) { listeners.add(cb); cb(ls.get("dl-local-orders", [])); return () => listeners.delete(cb); },
    async updateOrder(id, patch) { const o = ls.get("dl-local-orders", []); const x = o.find(v => v.id === id); if (x) Object.assign(x, patch); ls.set("dl-local-orders", o); emit(); },
    async deleteOrder(id) { ls.set("dl-local-orders", ls.get("dl-local-orders", []).filter(v => v.id !== id)); emit(); },
    async signIn() {}, async signOut() {},
    onAuth(cb) { cb({ email: "this phone" }); }
  };

  const impl = window.__TEST_DB || (window.FIREBASE_CONFIG ? FirebaseDB : LocalDB);
  window.ShopDB = Object.assign({ DEFAULT_ITEMS, photoUrl }, impl);
})();
