// ===== Firebase setup =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, setDoc, addDoc, updateDoc,
  deleteDoc, onSnapshot, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB3RSRmI2WpbuaJqnL320WEjOHBb48AP_E",
  authDomain: "utm-deeptech-28760.firebaseapp.com",
  projectId: "utm-deeptech-28760",
  storageBucket: "utm-deeptech-28760.firebasestorage.app",
  messagingSenderId: "440186843716",
  appId: "1:440186843716:web:6710df804ac02fe1bd0211"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ===== State =====
let currentUser = null;
let currentRole = null;
let currentDepartment = null;
let currentFilter = "all";
let allItems = [];
let editingItemId = null;
let historyItemId = null;

// ===== DOM elements =====
const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const userInfo = document.getElementById("user-info");
const addItemBtn = document.getElementById("add-item-btn");
const inventoryGrid = document.getElementById("inventory-grid");
const deptTabs = document.getElementById("dept-tabs");

const itemModal = document.getElementById("item-modal");
const modalTitle = document.getElementById("modal-title");
const itemNameInput = document.getElementById("item-name");
const itemDeptInput = document.getElementById("item-dept");
const itemCategoryInput = document.getElementById("item-category");
const itemQtyInput = document.getElementById("item-qty");
const modalCancel = document.getElementById("modal-cancel");
const modalSave = document.getElementById("modal-save");

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
loginBtn.addEventListener("click", async () => {
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    alert("Login failed: " + err.message);
  }
});

logoutBtn.addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    loginBtn.classList.add("hidden");
    logoutBtn.classList.remove("hidden");
    userInfo.textContent = user.displayName || user.email;
    userInfo.classList.remove("hidden");

    await loadUserRole(user);

    if (currentRole === "admin" || currentRole === "lead") {
      addItemBtn.classList.remove("hidden");
    }
  } else {
    currentUser = null;
    currentRole = null;
    currentDepartment = null;
    loginBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
    userInfo.classList.add("hidden");
    addItemBtn.classList.add("hidden");
  }
  renderInventory();
});

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

// ===== Inventory live listener =====
const itemsCollection = collection(db, "items");
onSnapshot(itemsCollection, (snapshot) => {
  allItems = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  renderInventory();
  updateStats();
});

function updateStats() {
  document.getElementById("stat-items").textContent = allItems.length;
  const lowOrOut = allItems.filter(i => (i.quantity || 0) <= 2).length;
  document.getElementById("stat-low").textContent = lowOrOut;
}

function renderInventory() {
  const filtered = currentFilter === "all"
    ? allItems
    : allItems.filter(i => i.department === currentFilter);

  if (filtered.length === 0) {
    inventoryGrid.innerHTML = `<div class="loading">No items yet${currentFilter !== "all" ? ` in ${currentFilter}` : ""}.</div>`;
    return;
  }

  inventoryGrid.innerHTML = filtered.map(item => {
    const qty = item.quantity || 0;
    let statusClass = "status-ok", statusText = "In stock";
    if (qty === 0) { statusClass = "status-out"; statusText = "Out"; }
    else if (qty <= 2) { statusClass = "status-low"; statusText = "Low"; }

    const canEdit = userCanEditItem(item);

    return `
      <div class="inv-card">
        <div class="inv-card-header">
          <div class="inv-name">${escapeHtml(item.name)}</div>
          <span class="inv-status ${statusClass}">${statusText}</span>
        </div>
        <div class="inv-dept">${capitalize(item.department)} · ${escapeHtml(item.category || "—")}</div>
        <div class="inv-qty">Qty: <span>${qty}</span></div>
        <div class="inv-actions">
          <button onclick="window.openHistory('${item.id}')">History</button>
          ${canEdit ? `<button onclick="window.openEdit('${item.id}')">Edit</button>` : ""}
          ${canEdit ? `<button onclick="window.deleteItem('${item.id}')" class="btn-danger">Delete</button>` : ""}
        </div>
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
  } else {
    modalTitle.textContent = "Add item";
    itemNameInput.value = "";
    itemDeptInput.value = currentRole === "lead" ? currentDepartment : "programming";
    itemCategoryInput.value = "";
    itemQtyInput.value = 0;
  }
  itemDeptInput.disabled = currentRole === "lead";
  itemModal.classList.remove("hidden");
}

modalCancel.addEventListener("click", () => itemModal.classList.add("hidden"));

modalSave.addEventListener("click", async () => {
  const name = itemNameInput.value.trim();
  const department = itemDeptInput.value;
  const category = itemCategoryInput.value.trim();
  const quantity = parseInt(itemQtyInput.value) || 0;

  if (!name) { alert("Item name is required"); return; }

  try {
    if (editingItemId) {
      const oldItem = allItems.find(i => i.id === editingItemId);
      await updateDoc(doc(db, "items", editingItemId), {
        name, department, category, quantity,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.email
      });
      if (oldItem && oldItem.quantity !== quantity) {
        await addLog(editingItemId, {
          reason: "edit",
          qtyChange: quantity - (oldItem.quantity || 0),
          note: "Quantity updated via edit"
        });
      }
    } else {
      const newDoc = await addDoc(itemsCollection, {
        name, department, category, quantity,
        createdAt: serverTimestamp(),
        createdBy: currentUser.email
      });
      await addLog(newDoc.id, {
        reason: "purchased",
        qtyChange: quantity,
        note: "Item added to inventory"
      });
    }
    itemModal.classList.add("hidden");
  } catch (err) {
    alert("Save failed: " + err.message);
  }
});

window.openEdit = (id) => openItemModal(id);

window.deleteItem = async (id) => {
  if (!confirm("Delete this item? This cannot be undone.")) return;
  try {
    await deleteDoc(doc(db, "items", id));
  } catch (err) {
    alert("Delete failed: " + err.message);
  }
};

// ===== History / change log =====
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
  historyList.innerHTML = `<div class="history-empty">Loading...</div>`;
  const logsRef = collection(db, "items", itemId, "logs");
  const q = query(logsRef, orderBy("timestamp", "desc"));
  onSnapshot(q, (snap) => {
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
      return `
        <div class="history-row">
          <div class="history-row-top">
            <span class="history-reason">${escapeHtml(log.reason)}</span>
            <span class="history-qty ${qtyClass}">${qtySign}${qty}</span>
          </div>
          <div class="history-meta">${escapeHtml(log.user || "unknown")} · ${date}</div>
          ${log.note ? `<div class="history-note">"${escapeHtml(log.note)}"</div>` : ""}
        </div>
      `;
    }).join("");
  });
}

logSaveBtn.addEventListener("click", async () => {
  const reason = logReason.value;
  const qtyChange = parseInt(logQtyChange.value) || 0;
  const note = logNote.value.trim();

  try {
    const item = allItems.find(i => i.id === historyItemId);
    const newQty = Math.max(0, (item.quantity || 0) + qtyChange);
    await updateDoc(doc(db, "items", historyItemId), {
      quantity: newQty,
      updatedAt: serverTimestamp(),
      updatedBy: currentUser.email
    });

    await addLog(historyItemId, { reason, qtyChange, note });

    logQtyChange.value = -1;
    logNote.value = "";
  } catch (err) {
    alert("Failed to log change: " + err.message);
  }
});

async function addLog(itemId, { reason, qtyChange, note }) {
  const logsRef = collection(db, "items", itemId, "logs");
  await addDoc(logsRef, {
    reason,
    qtyChange,
    note: note || "",
    user: currentUser.email,
    timestamp: serverTimestamp()
  });
}

historyClose.addEventListener("click", () => historyModal.classList.add("hidden"));

// ===== Helpers =====
function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}

function capitalize(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}
