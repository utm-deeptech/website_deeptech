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
const navInventoryLink = document.getElementById("nav-inventory-link");
const heroInventoryBtn = document.getElementById("hero-inventory-btn");
const inventoryToolbar = document.querySelector(".inventory-toolbar");
const statItemsCell = document.getElementById("stat-items-cell");
const statLowCell = document.getElementById("stat-low-cell");

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

function getFirstName(user) {
  const name = user.displayName || user.email?.split("@")[0] || "";
  return name.trim().split(/\s+/)[0];
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    loginBtn.classList.add("hidden");
    logoutBtn.classList.remove("hidden");
    userInfo.textContent = getFirstName(user);
    userInfo.classList.remove("hidden");
    navInventoryLink.classList.remove("hidden");
    heroInventoryBtn.classList.remove("hidden");
    statItemsCell.classList.remove("hidden");
    statLowCell.classList.remove("hidden");
    exportBtn.classList.remove("hidden");

    await loadUserRole(user);

    if (currentRole === "admin" || currentRole === "lead") {
      addItemBtn.classList.remove("hidden");
      importBtn.classList.remove("hidden");
    }
  } else {
    currentUser = null;
    currentRole = null;
    currentDepartment = null;
    loginBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
    userInfo.classList.add("hidden");
    addItemBtn.classList.add("hidden");
    importBtn.classList.add("hidden");
    navInventoryLink.classList.add("hidden");
    heroInventoryBtn.classList.add("hidden");
    statItemsCell.classList.add("hidden");
    statLowCell.classList.add("hidden");
    exportBtn.classList.add("hidden");
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
  if (!currentUser) {
    inventoryToolbar.classList.add("hidden");
    inventoryGrid.innerHTML = `
      <div class="inv-locked">
        <svg class="inv-locked-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
        <h3>Members only</h3>
        <p>Sign in to view the club inventory.</p>
        <button class="btn-primary" onclick="document.getElementById('login-btn').click()">Sign in with Google</button>
      </div>
    `;
    return;
  }
  inventoryToolbar.classList.remove("hidden");

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
    const editorName = getItemEditorName(item);
    const editorDate = formatTimestamp(item.updatedAt || item.createdAt);

    return `
      <div class="inv-card">
        <div class="inv-card-header">
          <div class="inv-name">${escapeHtml(item.name)}</div>
          <span class="inv-status ${statusClass}">${statusText}</span>
        </div>
        <div class="inv-dept">${capitalize(item.department)} · ${escapeHtml(item.category || "—")}</div>
        <div class="inv-qty">Qty: <span>${qty}</span></div>
        <div class="inv-editor">
          Last edited by <span>${escapeHtml(editorName)}</span>${editorDate ? ` · ${escapeHtml(editorDate)}` : ""}
        </div>
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
    const userIdentity = getCurrentUserIdentity();
    if (editingItemId) {
      const oldItem = allItems.find(i => i.id === editingItemId);
      await updateDoc(doc(db, "items", editingItemId), {
        name, department, category, quantity,
        updatedAt: serverTimestamp(),
        updatedBy: userIdentity.email,
        updatedByUid: userIdentity.uid,
        updatedByName: userIdentity.name,
        updatedByEmail: userIdentity.email
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
        createdBy: userIdentity.email,
        createdByUid: userIdentity.uid,
        createdByName: userIdentity.name,
        createdByEmail: userIdentity.email,
        updatedAt: serverTimestamp(),
        updatedBy: userIdentity.email,
        updatedByUid: userIdentity.uid,
        updatedByName: userIdentity.name,
        updatedByEmail: userIdentity.email
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
      const actor = log.userName || log.userEmail || log.user || "unknown";
      return `
        <div class="history-row">
          <div class="history-row-top">
            <span class="history-reason">${escapeHtml(log.reason)}</span>
            <span class="history-qty ${qtyClass}">${qtySign}${qty}</span>
          </div>
          <div class="history-meta">${escapeHtml(actor)} · ${date}</div>
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
    const userIdentity = getCurrentUserIdentity();
    await updateDoc(doc(db, "items", historyItemId), {
      quantity: newQty,
      updatedAt: serverTimestamp(),
      updatedBy: userIdentity.email,
      updatedByUid: userIdentity.uid,
      updatedByName: userIdentity.name,
      updatedByEmail: userIdentity.email
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
  const userIdentity = getCurrentUserIdentity();
  await addDoc(logsRef, {
    reason,
    qtyChange,
    note: note || "",
    user: userIdentity.email,
    userUid: userIdentity.uid,
    userName: userIdentity.name,
    userEmail: userIdentity.email,
    timestamp: serverTimestamp()
  });
}

historyClose.addEventListener("click", () => historyModal.classList.add("hidden"));

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
    const csv = arrayToCSV(allItems);
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

function normalise(row, key) {
  return row[key] || row[key.charAt(0).toUpperCase() + key.slice(1)] || "";
}

function showImportPreview(rows) {
  if (!rows.length) { alert("No data found in the file."); return; }
  const headers = Object.keys(rows[0]);
  const previewRows = rows.slice(0, 50);
  const table = document.getElementById("import-preview-table");
  table.innerHTML =
    `<thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>` +
    `<tbody>${previewRows.map(row =>
      `<tr>${headers.map(h => `<td>${row[h]}</td>`).join("")}</tr>`
    ).join("")}</tbody>`;
  document.getElementById("import-count").textContent =
    `${rows.length} item(s) ready to import${rows.length > 50 ? " (showing first 50 in preview)" : ""}.`;
  document.getElementById("import-confirm-btn")._pendingRows = rows;
  importModal.classList.remove("hidden");
}

document.getElementById("import-cancel-btn").addEventListener("click", () => {
  importModal.classList.add("hidden");
});

document.getElementById("import-confirm-btn").addEventListener("click", async () => {
  const confirmBtn = document.getElementById("import-confirm-btn");
  const rows = confirmBtn._pendingRows;
  if (!rows || !rows.length) return;
  confirmBtn.disabled = true;
  confirmBtn.textContent = "Importing…";
  let imported = 0;
  for (const row of rows) {
    try {
      await addDoc(itemsCollection, {
        name:       String(normalise(row, "name")),
        department: String(normalise(row, "department")),
        category:   String(normalise(row, "category")),
        quantity:   Number(normalise(row, "quantity")) || 0,
        createdAt:  serverTimestamp(),
        updatedAt:  serverTimestamp(),
        createdBy:  currentUser.uid,
        createdByName: currentUser.displayName || currentUser.email
      });
      imported++;
    } catch (err) {
      console.error("Failed to import row:", err);
    }
  }
  importModal.classList.add("hidden");
  confirmBtn.disabled = false;
  confirmBtn.textContent = "Import All";
  alert(`Successfully imported ${imported} item(s).`);
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
  if (!str) return "";
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
