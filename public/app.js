// ===== Firebase setup =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, setDoc, onSnapshot,
  query, orderBy, serverTimestamp, writeBatch, increment
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCefvRUU-HqVClFrKp8lDt1KJOj5nCltrc",
  authDomain: "utm-deeptech.firebaseapp.com",
  projectId: "utm-deeptech",
  storageBucket: "utm-deeptech.firebasestorage.app",
  messagingSenderId: "415981426592",
  appId: "1:415981426592:web:41b06389f18dc2ab4776c5"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const DEPARTMENTS = ["programming", "electronics", "mechanism"];
const DEFAULT_MIN_QTY = 2;

// ===== State =====
let currentUser = null;
let currentRole = null;
let currentDepartment = null;
let currentFilter = "all";
let currentLocation = "all";
let currentCategory = "all";
let searchText = "";
let sortKey = "name";
let viewMode = "cards";
let showArchived = false;
let allItems = [];
let editingItemId = null;
let historyItemId = null;
let movingItemId = null;
let editingBaseQty = 0;
let unsubscribeItems = null;
let unsubscribeHistory = null;

try {
  viewMode = localStorage.getItem("inv-view") === "table" ? "table" : "cards";
} catch (e) { /* storage unavailable: keep the default */ }

// ===== DOM elements =====
const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const userInfo = document.getElementById("user-info");
const addItemBtn = document.getElementById("add-item-btn");
const inventoryGrid = document.getElementById("inventory-grid");
const deptTabs = document.getElementById("dept-tabs");
const navInventoryLink = document.getElementById("nav-inventory-link");
const heroInventoryBtn = document.getElementById("hero-inventory-btn");
const inventoryToolbar = document.querySelector(".inventory-toolbar");
const inventoryFilters = document.getElementById("inventory-filters");
const statItemsCell = document.getElementById("stat-items-cell");
const statLowCell = document.getElementById("stat-low-cell");

const searchInput = document.getElementById("inv-search");
const locationFilter = document.getElementById("inv-location");
const categoryFilter = document.getElementById("inv-category");
const sortSelect = document.getElementById("inv-sort");
const viewToggle = document.getElementById("view-toggle");
const archivedLabel = document.getElementById("inv-archived-label");
const archivedToggle = document.getElementById("inv-archived");

const importBtn = document.getElementById("import-inventory-btn");
const importFileInput = document.getElementById("import-file-input");
const importModal = document.getElementById("import-modal");
const importGuideModal = document.getElementById("import-guide-modal");

const itemModal = document.getElementById("item-modal");
const modalTitle = document.getElementById("modal-title");
const itemNameInput = document.getElementById("item-name");
const itemDeptInput = document.getElementById("item-dept");
const itemCategoryInput = document.getElementById("item-category");
const itemQtyInput = document.getElementById("item-qty");
const itemMinQtyInput = document.getElementById("item-minqty");
const itemLocationInput = document.getElementById("item-location");
const locationOptions = document.getElementById("location-options");

const itemNotesInput = document.getElementById("item-notes");
const modalCancel = document.getElementById("modal-cancel");
const modalSave = document.getElementById("modal-save");

const moveModal = document.getElementById("move-modal");
const moveItemName = document.getElementById("move-item-name");
const moveCurrent = document.getElementById("move-current");
const moveAction = document.getElementById("move-action");
const moveQty = document.getElementById("move-qty");
const moveNote = document.getElementById("move-note");
const moveCancel = document.getElementById("move-cancel");
const moveSave = document.getElementById("move-save");

const historyModal = document.getElementById("history-modal");
const historyItemName = document.getElementById("history-item-name");
const logEntrySection = document.getElementById("log-entry-section");
const logReason = document.getElementById("log-reason");
const logQtyChange = document.getElementById("log-qty-change");
const logNote = document.getElementById("log-note");
const logSaveBtn = document.getElementById("log-save");
const historyList = document.getElementById("history-list");
const historyClose = document.getElementById("history-close");

// ===== Auth =====
const ALLOWED_EMAIL_DOMAINS = ["@utm.my", "@graduate.utm.my"];

function isAllowedEmail(email) {
  if (!email) return false;
  return ALLOWED_EMAIL_DOMAINS.some(domain => email.toLowerCase().endsWith(domain));
}

loginBtn.addEventListener("click", async () => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ hd: "utm.my" });
  try {
    const result = await signInWithPopup(auth, provider);
    const email = result.user?.email || "";
    if (!isAllowedEmail(email)) {
      await signOut(auth);
      alert(
        `Only UTM emails are allowed (${ALLOWED_EMAIL_DOMAINS.join(" or ")}).\n\n` +
        `You signed in with: ${email}`
      );
      return;
    }
  } catch (err) {
    alert("Login failed: " + err.message);
  }
});

logoutBtn.addEventListener("click", () => signOut(auth));

function getFirstName(user) {
  const name = user.displayName || user.email?.split("@")[0] || "";
  return name.trim().split(/\s+/)[0];
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    if (!isAllowedEmail(user.email || "")) {
      await signOut(auth);
      alert(`Access restricted to UTM emails only. You were signed out.`);
      return;
    }

    currentUser = user;
    document.body.classList.add("signed-in");
    loginBtn.classList.add("hidden");
    logoutBtn.classList.remove("hidden");
    userInfo.textContent = getFirstName(user);
    userInfo.classList.remove("hidden");
    navInventoryLink.classList.remove("hidden");
    heroInventoryBtn.classList.remove("hidden");
    statItemsCell.classList.remove("hidden");
    statLowCell.classList.remove("hidden");
    exportBtn.classList.remove("hidden");

    try {
      await loadUserRole(user);
    } catch (err) {
      console.error("Could not load your role, continuing as a member:", err);
      currentRole = "member";
    }

    addItemBtn.classList.remove("hidden");
    if (isEditorRole()) {
      importBtn.classList.remove("hidden");
      archivedLabel.classList.remove("hidden");
    }
    startItemsListener();
  } else {
    stopItemsListener();
    allItems = [];
    currentUser = null;
    document.body.classList.remove("signed-in");
    currentRole = null;
    currentDepartment = null;
    showArchived = false;
    archivedToggle.checked = false;
    loginBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
    userInfo.classList.add("hidden");
    addItemBtn.classList.add("hidden");
    importBtn.classList.add("hidden");
    archivedLabel.classList.add("hidden");
    navInventoryLink.classList.add("hidden");
    heroInventoryBtn.classList.add("hidden");
    statItemsCell.classList.add("hidden");
    statLowCell.classList.add("hidden");
    exportBtn.classList.add("hidden");
  }
  renderInventory();
});

function isEditorRole() {
  return currentRole === "admin" || currentRole === "lead";
}

async function loadUserRole(user) {
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);

  if (snap.exists()) {
    const data = snap.data();
    currentRole = data.role || "member";
    currentDepartment = data.department || null;
  } else {
    await setDoc(userRef, {
      email: user.email,
      displayName: user.displayName,
      role: "member",
      department: null,
      createdAt: serverTimestamp()
    });
    currentRole = "member";
  }
}

// ===== Department tabs =====
deptTabs.addEventListener("click", (e) => {
  if (!e.target.classList.contains("dept-tab")) return;
  document.querySelectorAll(".dept-tab").forEach(t => t.classList.remove("active"));
  e.target.classList.add("active");
  currentFilter = e.target.dataset.dept;
  renderInventory();
});

// ===== Filters, search, sort, view =====
// Locations are free text. The filter and the suggestions list whatever people have typed so far.
function knownLocations() {
  const seen = new Map();
  for (const i of allItems) {
    const loc = (i.location || "").trim();
    if (loc && !seen.has(loc.toLowerCase())) seen.set(loc.toLowerCase(), loc);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

function renderLocationControls() {
  const locs = knownLocations();
  if (currentLocation !== "all" && currentLocation !== "none"
      && !locs.some(l => l.toLowerCase() === currentLocation.toLowerCase())) {
    currentLocation = "all";
  }
  locationFilter.innerHTML =
    `<option value="all">All locations</option>` +
    locs.map(l => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join("") +
    `<option value="none">No location set</option>`;
  locationFilter.value = currentLocation;
  locationOptions.innerHTML = locs.map(l => `<option value="${escapeHtml(l)}"></option>`).join("");
}
searchInput.addEventListener("input", () => {
  searchText = searchInput.value;
  renderInventory();
});

locationFilter.addEventListener("change", () => {
  currentLocation = locationFilter.value;
  renderInventory();
});

categoryFilter.addEventListener("change", () => {
  currentCategory = categoryFilter.value;
  renderInventory();
});

sortSelect.addEventListener("change", () => {
  sortKey = sortSelect.value;
  renderInventory();
});

archivedToggle.addEventListener("change", () => {
  showArchived = archivedToggle.checked;
  renderInventory();
});

viewToggle.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-view]");
  if (!btn) return;
  viewMode = btn.dataset.view;
  try { localStorage.setItem("inv-view", viewMode); } catch (err) { /* ignore */ }
  renderInventory();
});

// ===== Inventory live listener =====
const itemsCollection = collection(db, "items");

function startItemsListener() {
  stopItemsListener();
  unsubscribeItems = onSnapshot(itemsCollection, (snapshot) => {
    allItems = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderInventory();
    updateStats();
  }, (err) => {
    console.error("Inventory listener failed:", err);
    inventoryGrid.innerHTML = `<div class="loading">Could not load the inventory: ${escapeHtml(err.message)}</div>`;
  });
}

function stopItemsListener() {
  if (unsubscribeItems) unsubscribeItems();
  unsubscribeItems = null;
}

function minQtyOf(item) {
  return Number.isFinite(item.minQty) ? item.minQty : DEFAULT_MIN_QTY;
}

function stockStatus(item) {
  const qty = item.quantity || 0;
  if (qty === 0) return { cls: "status-out", text: "Out" };
  if (qty <= minQtyOf(item)) return { cls: "status-low", text: "Low" };
  return { cls: "status-ok", text: "In stock" };
}

function updateStats() {
  const active = allItems.filter(i => !i.archived);
  document.getElementById("stat-items").textContent = active.length;
  document.getElementById("stat-low").textContent =
    active.filter(i => (i.quantity || 0) <= minQtyOf(i)).length;
}

// Wherever the person who added the item said it is
function locationLabel(item) {
  return (item.location || "").trim();
}
function getVisibleItems() {
  const q = searchText.trim().toLowerCase();

  const items = allItems.filter(i => {
    if (showArchived ? !i.archived : i.archived) return false;
    if (currentFilter !== "all" && i.department !== currentFilter) return false;
    const where = locationLabel(i).toLowerCase();
    if (currentLocation === "none") {
      if (where) return false;
    } else if (currentLocation !== "all" && where !== currentLocation.toLowerCase()) {
      return false;
    }
    if (currentCategory !== "all" && (i.category || "") !== currentCategory) return false;
    if (q) {
      const haystack = [i.name, i.category, i.department, i.notes, locationLabel(i)]
        .join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const byName = (a, b) => (a.name || "").localeCompare(b.name || "");
  const stamp = (i) => (i.updatedAt?.toMillis ? i.updatedAt.toMillis() : 0);
  const sorters = {
    name: byName,
    "qty-asc": (a, b) => (a.quantity || 0) - (b.quantity || 0) || byName(a, b),
    "qty-desc": (a, b) => (b.quantity || 0) - (a.quantity || 0) || byName(a, b),
    recent: (a, b) => stamp(b) - stamp(a),
    location: (a, b) => locationLabel(a).localeCompare(locationLabel(b)) || byName(a, b)
  };
  return items.sort(sorters[sortKey] || byName);
}

function renderCategoryOptions() {
  const categories = [...new Set(allItems.map(i => (i.category || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  if (currentCategory !== "all" && !categories.includes(currentCategory)) currentCategory = "all";
  categoryFilter.innerHTML =
    `<option value="all">All categories</option>` +
    categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  categoryFilter.value = currentCategory;
}

const PIN_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`;

function actionButtons(item) {
  if (item.archived) {
    return userCanEditItem(item)
      ? `<button onclick="window.restoreItem('${item.id}')">Restore</button>`
      : "";
  }
  const canEdit = userCanEditItem(item);
  return `
    <button onclick="window.openMove('${item.id}')" class="btn-take">Take / Return</button>
    <button onclick="window.openHistory('${item.id}')">History</button>
    ${canEdit ? `<button onclick="window.openEdit('${item.id}')">Edit</button>` : ""}
    ${canEdit ? `<button onclick="window.archiveItem('${item.id}')" class="btn-danger">Archive</button>` : ""}
  `;
}

function renderInventory() {
  if (!currentUser) {
    inventoryToolbar.classList.add("hidden");
    inventoryFilters.classList.add("hidden");
    inventoryGrid.className = "inventory-grid";
    inventoryGrid.innerHTML = `
      <div class="inv-locked">
        <svg class="inv-locked-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
        <h3>Members only</h3>
        <p>Sign in to view the club inventory.</p>
        <button class="btn-primary" onclick="document.getElementById('login-btn').click()">Sign in with Google</button>
        <p class="inv-locked-hint">UTM emails only (@utm.my or @graduate.utm.my)</p>
      </div>
    `;
    return;
  }
  inventoryToolbar.classList.remove("hidden");
  inventoryFilters.classList.remove("hidden");

  renderLocationControls();
  renderCategoryOptions();
  viewToggle.querySelectorAll("button").forEach(b =>
    b.classList.toggle("active", b.dataset.view === viewMode));

  const items = getVisibleItems();

  if (items.length === 0) {
    inventoryGrid.className = "inventory-grid";
    const filtered = searchText || currentFilter !== "all" || currentLocation !== "all" || currentCategory !== "all";
    inventoryGrid.innerHTML = `<div class="loading">${
      showArchived ? "No archived items." : filtered ? "No items match your filters." : "No items yet."
    }</div>`;
    return;
  }

  if (viewMode === "table") {
    inventoryGrid.className = "inventory-table-wrap";
    inventoryGrid.innerHTML = `
      <table class="inv-table">
        <thead>
          <tr><th>Item</th><th>Department</th><th>Location</th><th>Qty</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          ${items.map(item => {
            const st = stockStatus(item);
            const loc = locationLabel(item);
            return `
              <tr>
                <td><div class="inv-name">${escapeHtml(item.name)}</div>
                    <div class="inv-sub">${escapeHtml(item.category || "—")} · added by ${escapeHtml(getItemCreatorName(item))}</div></td>
                <td>${capitalize(item.department)}</td>
                <td>${loc ? escapeHtml(loc) : `<span class="inv-muted">Not set</span>`}</td>
                <td class="inv-num">${item.quantity || 0}</td>
                <td><span class="inv-status ${st.cls}">${st.text}</span></td>
                <td><div class="inv-row-actions">${actionButtons(item)}</div></td>
              </tr>`;
          }).join("")}
        </tbody>
      </table>`;
    return;
  }

  inventoryGrid.className = "inventory-grid";
  inventoryGrid.innerHTML = items.map(item => {
    const qty = item.quantity || 0;
    const st = stockStatus(item);
    const editorName = getItemEditorName(item);
    const editorDate = formatTimestamp(item.updatedAt || item.createdAt);
    const createdDate = formatTimestamp(item.createdAt);
    const loc = locationLabel(item);

    return `
      <div class="inv-card${item.archived ? " inv-card--archived" : ""}">
        <div class="inv-card-header">
          <div class="inv-name">${escapeHtml(item.name)}</div>
          <span class="inv-status ${st.cls}">${st.text}</span>
        </div>
        <div class="inv-dept">${capitalize(item.department)} · ${escapeHtml(item.category || "—")}</div>
        <div class="inv-loc${loc ? "" : " inv-loc--unset"}">${PIN_ICON} ${loc ? escapeHtml(loc) : "Location not set"}</div>
        ${item.notes ? `<div class="inv-notes">${escapeHtml(item.notes)}</div>` : ""}
        <div class="inv-qty">Qty: <span>${qty}</span></div>
        <div class="inv-editor">
          Added by <span>${escapeHtml(getItemCreatorName(item))}</span>${createdDate ? ` · ${escapeHtml(createdDate)}` : ""}<br>
          Last edited by <span>${escapeHtml(editorName)}</span>${editorDate ? ` · ${escapeHtml(editorDate)}` : ""}
        </div>
        <div class="inv-actions">${actionButtons(item)}</div>
      </div>
    `;
  }).join("");
}

function userCanEditItem(item) {
  if (!currentUser) return false;
  if (currentRole === "admin") return true;
  if (currentRole === "lead" && currentDepartment === item.department) return true;
  return false;
}

// ===== Add / Edit item =====
addItemBtn.addEventListener("click", () => openItemModal(null));

function openItemModal(itemId) {
  editingItemId = itemId;
  if (itemId) {
    const item = allItems.find(i => i.id === itemId);
    modalTitle.textContent = "Edit item";
    itemNameInput.value = item.name;
    itemDeptInput.value = item.department;
    itemCategoryInput.value = item.category || "";
    itemQtyInput.value = item.quantity || 0;
    editingBaseQty = item.quantity || 0;
    itemMinQtyInput.value = minQtyOf(item);
    itemLocationInput.value = locationLabel(item);
    itemNotesInput.value = item.notes || "";
  } else {
    modalTitle.textContent = "Add item";
    itemNameInput.value = "";
    itemDeptInput.value = currentRole === "lead" ? currentDepartment : "programming";
    itemCategoryInput.value = "";
    itemQtyInput.value = 0;
    itemMinQtyInput.value = DEFAULT_MIN_QTY;
    itemLocationInput.value = "";
    itemNotesInput.value = "";
  }
  // a lead can't move an existing item to another department; adding a new one is open to everyone
  itemDeptInput.disabled = Boolean(itemId) && currentRole === "lead";
  itemModal.classList.remove("hidden");
}

modalCancel.addEventListener("click", () => itemModal.classList.add("hidden"));

modalSave.addEventListener("click", async () => {
  const name = itemNameInput.value.trim();
  const department = itemDeptInput.value;
  const category = itemCategoryInput.value.trim();
  const quantity = parseInt(itemQtyInput.value) || 0;
  const minQty = Math.max(0, parseInt(itemMinQtyInput.value) || 0);
  const location = itemLocationInput.value.trim();
  const notes = itemNotesInput.value.trim();

  if (!name) { alert("Item name is required"); return; }
  if (quantity < 0) { alert("Quantity cannot be negative"); return; }

  const fields = { name, department, category, quantity, minQty, location, notes };

  try {
    const userIdentity = getCurrentUserIdentity();
    if (editingItemId) {
      // The quantity is saved as a change from what the form opened with, in one batch with
      // its history entry, so stock someone took while the form was open is not overwritten.
      const { quantity: _ignored, ...rest } = fields;
      const delta = quantity - editingBaseQty;
      const batch = writeBatch(db);
      batch.update(doc(db, "items", editingItemId), {
        ...rest,
        ...(delta !== 0 ? { quantity: increment(delta) } : {}),
        ...editorStamp(userIdentity)
      });
      if (delta !== 0) {
        batch.set(newLogRef(editingItemId), logData(userIdentity, {
          reason: "edit",
          qtyChange: delta,
          note: "Quantity updated via edit"
        }));
      }
      await batch.commit();
    } else {
      const itemRef = doc(itemsCollection);
      const batch = writeBatch(db);
      batch.set(itemRef, newItemData(fields, userIdentity));
      batch.set(newLogRef(itemRef.id), logData(userIdentity, {
        reason: "purchased",
        qtyChange: quantity,
        note: "Item added to inventory"
      }));
      await batch.commit();
    }
    itemModal.classList.add("hidden");
  } catch (err) {
    alert("Save failed: " + err.message);
  }
});

function newItemData(fields, userIdentity) {
  return {
    ...fields,
    archived: false,
    createdAt: serverTimestamp(),
    createdBy: userIdentity.email,
    createdByUid: userIdentity.uid,
    createdByName: userIdentity.name,
    createdByEmail: userIdentity.email,
    updatedAt: serverTimestamp(),
    updatedBy: userIdentity.email,
    updatedByUid: userIdentity.uid,
    updatedByName: userIdentity.name,
    updatedByEmail: userIdentity.email
  };
}

function editorStamp(userIdentity) {
  return {
    updatedAt: serverTimestamp(),
    updatedBy: userIdentity.email,
    updatedByUid: userIdentity.uid,
    updatedByName: userIdentity.name,
    updatedByEmail: userIdentity.email
  };
}

window.openEdit = (id) => openItemModal(id);

// Items are archived instead of deleted, so their history is never orphaned
async function setArchived(id, archived) {
  const item = allItems.find(i => i.id === id);
  if (!item) return;
  const userIdentity = getCurrentUserIdentity();
  const batch = writeBatch(db);
  batch.update(doc(db, "items", id), { archived, ...editorStamp(userIdentity) });
  batch.set(newLogRef(id), logData(userIdentity, {
    reason: archived ? "archived" : "restored",
    qtyChange: 0,
    note: ""
  }));
  await batch.commit();
}

window.archiveItem = async (id) => {
  if (!confirm("Archive this item? It will be hidden from the inventory, and can be restored later.")) return;
  try {
    await setArchived(id, true);
  } catch (err) {
    alert("Archive failed: " + err.message);
  }
};

window.restoreItem = async (id) => {
  try {
    await setArchived(id, false);
  } catch (err) {
    alert("Restore failed: " + err.message);
  }
};

// ===== Take / return stock (any signed-in member) =====
window.openMove = (id) => {
  const item = allItems.find(i => i.id === id);
  if (!item) return;
  movingItemId = id;
  moveItemName.textContent = item.name;
  const loc = locationLabel(item);
  moveCurrent.textContent = `In stock: ${item.quantity || 0}${loc ? ` · ${loc}` : ""}`;
  moveAction.value = "take";
  moveQty.value = 1;
  moveNote.value = "";
  moveModal.classList.remove("hidden");
};

moveCancel.addEventListener("click", () => moveModal.classList.add("hidden"));

moveSave.addEventListener("click", async () => {
  const item = allItems.find(i => i.id === movingItemId);
  if (!item) return;
  const qty = parseInt(moveQty.value);
  if (!Number.isInteger(qty) || qty < 1) { alert("Enter a quantity of 1 or more."); return; }
  const taking = moveAction.value === "take";
  if (taking && qty > (item.quantity || 0)) {
    alert(`Only ${item.quantity || 0} in stock.`);
    return;
  }
  if (taking && !moveNote.value.trim()) {
    alert("Add a short note on what it is for, so others know where it went.");
    return;
  }

  const change = taking ? -qty : qty;
  moveSave.disabled = true;
  try {
    await applyStockChange(movingItemId, change, taking ? "checkout" : "return", moveNote.value.trim());
    moveModal.classList.add("hidden");
  } catch (err) {
    alert(err.code === "permission-denied"
      ? "Could not save. Someone may have just taken the same stock. Close this, check the quantity, and try again."
      : "Could not save: " + err.message);
  } finally {
    moveSave.disabled = false;
  }
});

// Quantity change + its history entry in one atomic batch (increment avoids lost updates)
async function applyStockChange(itemId, qtyChange, reason, note) {
  const userIdentity = getCurrentUserIdentity();
  const batch = writeBatch(db);
  batch.update(doc(db, "items", itemId), {
    quantity: increment(qtyChange),
    ...editorStamp(userIdentity)
  });
  batch.set(newLogRef(itemId), logData(userIdentity, { reason, qtyChange, note }));
  await batch.commit();
}

// ===== History / change log =====
const REASON_LABELS = { checkout: "taken", return: "returned", edit: "edited", purchased: "added / purchased" };

window.openHistory = async (itemId) => {
  historyItemId = itemId;
  const item = allItems.find(i => i.id === itemId);
  historyItemName.textContent = item.name;

  if (userCanEditItem(item)) {
    logEntrySection.classList.remove("hidden");
  } else {
    logEntrySection.classList.add("hidden");
  }

  loadHistory(itemId);
  historyModal.classList.remove("hidden");
};

function loadHistory(itemId) {
  if (unsubscribeHistory) unsubscribeHistory();
  historyList.innerHTML = `<div class="history-empty">Loading...</div>`;
  const logsRef = collection(db, "items", itemId, "logs");
  const q = query(logsRef, orderBy("timestamp", "desc"));
  unsubscribeHistory = onSnapshot(q, (snap) => {
    if (snap.empty) {
      historyList.innerHTML = `<div class="history-empty">No history yet.</div>`;
      return;
    }
    historyList.innerHTML = snap.docs.map(d => {
      const log = d.data();
      const date = log.timestamp?.toDate
        ? log.timestamp.toDate().toLocaleString()
        : "Just now";
      const qty = log.qtyChange || 0;
      const qtyClass = qty > 0 ? "up" : "down";
      const qtySign = qty > 0 ? "+" : "";
      const actor = log.userName || log.userEmail || log.user || "unknown";
      return `
        <div class="history-row">
          <div class="history-row-top">
            <span class="history-reason">${escapeHtml(REASON_LABELS[log.reason] || log.reason)}</span>
            <span class="history-qty ${qty === 0 ? "" : qtyClass}">${qty === 0 ? "" : qtySign + qty}</span>
          </div>
          <div class="history-meta">${escapeHtml(actor)} · ${date}</div>
          ${log.note ? `<div class="history-note">"${escapeHtml(log.note)}"</div>` : ""}
        </div>
      `;
    }).join("");
  }, (err) => {
    historyList.innerHTML = `<div class="history-empty">Could not load history: ${escapeHtml(err.message)}</div>`;
  });
}

logSaveBtn.addEventListener("click", async () => {
  const reason = logReason.value;
  const qtyChange = parseInt(logQtyChange.value) || 0;
  const note = logNote.value.trim();

  if (qtyChange === 0) { alert("Enter a quantity change other than 0."); return; }

  try {
    const item = allItems.find(i => i.id === historyItemId);
    if ((item.quantity || 0) + qtyChange < 0) {
      alert(`Only ${item.quantity || 0} in stock; that would go below zero.`);
      return;
    }
    await applyStockChange(historyItemId, qtyChange, reason, note);

    logQtyChange.value = -1;
    logNote.value = "";
  } catch (err) {
    alert("Failed to log change: " + err.message);
  }
});

function newLogRef(itemId) {
  return doc(collection(db, "items", itemId, "logs"));
}

function logData(userIdentity, { reason, qtyChange, note }) {
  return {
    reason,
    qtyChange,
    note: note || "",
    user: userIdentity.email,
    userUid: userIdentity.uid,
    userName: userIdentity.name,
    userEmail: userIdentity.email,
    timestamp: serverTimestamp()
  };
}


historyClose.addEventListener("click", () => {
  if (unsubscribeHistory) unsubscribeHistory();
  unsubscribeHistory = null;
  historyModal.classList.add("hidden");
});

// ===== Export inventory =====
const exportBtn = document.getElementById("export-inventory-btn");
exportBtn.addEventListener("click", exportInventory);

function arrayToCSV(items) {
  if (!items || items.length === 0) return '';
  const headers = [...new Set(items.flatMap(item => Object.keys(item)))];
  const escape = (val) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    return str.includes(',') || str.includes('"') || str.includes('\n')
      ? `"${str.replace(/"/g, '""')}"` : str;
  };
  return [headers.join(','), ...items.map(item => headers.map(h => escape(item[h])).join(','))].join('\n');
}

function downloadCSV(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function exportInventory() {
  if (!currentUser) return;
  exportBtn.disabled = true;
  exportBtn.textContent = '⏳ Exporting...';
  try {
    if (allItems.length === 0) {
      alert('No inventory items to export.');
      return;
    }
    // Same columns the importer reads, so an export can be edited and re-imported
    const rows = allItems.filter(i => !i.archived).map(i => ({
      name: i.name,
      department: i.department,
      category: i.category || "",
      quantity: i.quantity || 0,
      minQty: minQtyOf(i),
      location: locationLabel(i),
      notes: i.notes || ""
    }));
    const csv = arrayToCSV(rows);
    const date = new Date().toISOString().split('T')[0];
    downloadCSV(csv, `deeptech-inventory-${date}.csv`);
  } catch (err) {
    alert('Export failed: ' + err.message);
  } finally {
    exportBtn.disabled = false;
    exportBtn.textContent = '⬇ Export as CSV';
  }
}

// ===== Import inventory from Excel =====
importBtn.addEventListener("click", () => importGuideModal.classList.remove("hidden"));

document.getElementById("import-guide-cancel").addEventListener("click", () => {
  importGuideModal.classList.add("hidden");
});

document.getElementById("import-guide-choose").addEventListener("click", () => {
  importGuideModal.classList.add("hidden");
  importFileInput.click();
});

importFileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    const workbook = window.XLSX.read(new Uint8Array(evt.target.result), { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = window.XLSX.utils.sheet_to_json(sheet, { defval: "" });
    importFileInput.value = "";
    showImportPreview(rows);
  };
  reader.readAsArrayBuffer(file);
});

// Lower-case, trimmed column names so "Name", "NAME" and " name " all work
function normaliseRow(row) {
  const out = {};
  for (const key of Object.keys(row)) out[key.trim().toLowerCase()] = row[key];
  return out;
}

// Parses every row, marking any that already exist (same name + department) or repeat in the file
function parseImportRows(rows) {
  const seen = new Set(allItems.filter(i => !i.archived)
    .map(i => `${i.department}|${(i.name || "").trim().toLowerCase()}`));
  return rows.map(raw => {
    const parsed = parseImportRow(raw);
    if (!parsed.fields) return parsed;
    const key = `${parsed.fields.department}|${parsed.fields.name.toLowerCase()}`;
    if (seen.has(key)) return { error: `"${parsed.fields.name}": already in the inventory` };
    seen.add(key);
    return parsed;
  });
}

// Turns a spreadsheet row into an item, or explains why it can't be imported
function parseImportRow(rawRow) {
  const row = normaliseRow(rawRow);
  const name = String(row.name || "").trim();
  const department = String(row.department || "").trim().toLowerCase();
  const quantity = Number(row.quantity);
  const minQtyRaw = row.minqty === "" || row.minqty === undefined ? DEFAULT_MIN_QTY : Number(row.minqty);

  if (!name) return { error: "missing name" };
  if (!DEPARTMENTS.includes(department)) return { error: `"${name}": unknown department "${row.department}"` };
  if (currentRole === "lead" && department !== currentDepartment) {
    return { error: `"${name}": you can only import into ${currentDepartment}` };
  }
  if (!Number.isInteger(quantity) || quantity < 0) return { error: `"${name}": quantity must be a whole number` };
  if (!Number.isInteger(minQtyRaw) || minQtyRaw < 0) return { error: `"${name}": minQty must be a whole number` };

  return {
    fields: {
      name,
      department,
      category: String(row.category || "").trim(),
      quantity,
      minQty: minQtyRaw,
      location: String(row.location || "").trim(),
      notes: String(row.notes || "").trim()
    }
  };
}

function showImportPreview(rows) {
  if (!rows.length) { alert("No data found in the file."); return; }
  const headers = Object.keys(rows[0]);
  const previewRows = rows.slice(0, 50);
  const table = document.getElementById("import-preview-table");
  table.innerHTML =
    `<thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>` +
    `<tbody>${previewRows.map(row =>
      `<tr>${headers.map(h => `<td>${escapeHtml(row[h])}</td>`).join("")}</tr>`
    ).join("")}</tbody>`;

  const parsed = parseImportRows(rows);
  const problems = parsed.filter(p => p.error).map(p => p.error);
  const valid = parsed.length - problems.length;
  document.getElementById("import-count").innerHTML =
    `${valid} of ${rows.length} item(s) ready to import${rows.length > 50 ? " (preview shows the first 50)" : ""}.` +
    (problems.length
      ? `<br><span class="import-problems">${problems.length} row(s) will be skipped:<br>${
          problems.slice(0, 8).map(escapeHtml).join("<br>")}${problems.length > 8 ? "<br>…" : ""}</span>`
      : "");
  document.getElementById("import-confirm-btn")._pendingRows = rows;
  importModal.classList.remove("hidden");
}

document.getElementById("import-cancel-btn").addEventListener("click", () => {
  importModal.classList.add("hidden");
});

// Firestore rules allow ~20 document lookups per batch, and each imported item costs
// one for its history entry, so rows are committed in small chunks.
const IMPORT_CHUNK = 8;

document.getElementById("import-confirm-btn").addEventListener("click", async () => {
  const confirmBtn = document.getElementById("import-confirm-btn");
  const rows = confirmBtn._pendingRows;
  if (!rows || !rows.length) return;
  confirmBtn.disabled = true;
  confirmBtn.textContent = "Importing…";

  const parsed = parseImportRows(rows);
  const valid = parsed.filter(p => p.fields).map(p => p.fields);
  const skipped = parsed.length - valid.length;
  const userIdentity = getCurrentUserIdentity();
  let imported = 0;
  let failed = 0;

  for (let i = 0; i < valid.length; i += IMPORT_CHUNK) {
    const chunk = valid.slice(i, i + IMPORT_CHUNK);
    const batch = writeBatch(db);
    for (const fields of chunk) {
      const itemRef = doc(itemsCollection);
      batch.set(itemRef, newItemData(fields, userIdentity));
      batch.set(newLogRef(itemRef.id), logData(userIdentity, {
        reason: "purchased",
        qtyChange: fields.quantity,
        note: "Imported from spreadsheet"
      }));
    }
    try {
      await batch.commit();
      imported += chunk.length;
    } catch (err) {
      console.error("Import chunk failed:", err);
      failed += chunk.length;
    }
  }

  importModal.classList.add("hidden");
  confirmBtn.disabled = false;
  confirmBtn.textContent = "Import All";
  alert(
    `Imported ${imported} item(s).` +
    (skipped ? `\nSkipped ${skipped} invalid row(s).` : "") +
    (failed ? `\n${failed} item(s) failed to save (see the browser console).` : "")
  );
});

// ===== Active nav link on scroll =====
const allSections = document.querySelectorAll('section[id]');
const allNavLinks = document.querySelectorAll('.nav-links a');
const sectionObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      allNavLinks.forEach(link => {
        link.classList.toggle('active', link.getAttribute('href') === '#' + entry.target.id);
      });
    }
  });
}, { rootMargin: '-30% 0px -60% 0px' });
allSections.forEach(s => sectionObserver.observe(s));

// ===== Helpers =====
function escapeHtml(str) {
  if (str === null || str === undefined || str === "") return "";
  return String(str).replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}

function capitalize(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function getCurrentUserIdentity() {
  if (!currentUser) {
    return { uid: "", name: "Unknown user", email: "" };
  }

  const email = currentUser.email || "";
  return {
    uid: currentUser.uid,
    name: currentUser.displayName || email || "Unknown user",
    email
  };
}

function getItemCreatorName(item) {
  return item.createdByName
    || item.createdByEmail
    || item.createdBy
    || "unknown";
}

function getItemEditorName(item) {
  return item.updatedByName
    || item.updatedByEmail
    || item.updatedBy
    || item.createdByName
    || item.createdByEmail
    || item.createdBy
    || "unknown";
}

function formatTimestamp(timestamp) {
  if (!timestamp?.toDate) return "";
  return timestamp.toDate().toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}
