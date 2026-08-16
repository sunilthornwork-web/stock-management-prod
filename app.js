const loginScreen = document.querySelector("#loginScreen");
const appShell = document.querySelector("#appShell");
const loginForm = document.querySelector("#loginForm");
const loginButton = document.querySelector("#loginButton");
const loginStatus = document.querySelector("#loginStatus");
const passwordInput = document.querySelector("#password");
const authLoading = document.querySelector("#authLoading");
const contentArea = document.querySelector("#contentArea");
const viewTitle = document.querySelector("#viewTitle");
const navItems = [...document.querySelectorAll(".nav-item")];
const logoutButton = document.querySelector("#logoutButton");
const userChip = document.querySelector("#userChip");
const environmentStrips = [...document.querySelectorAll(".test-strip")];
const environmentBadge = document.querySelector(".test-badge");
const loginCopy = document.querySelector(".login-copy");
const mockNote = document.querySelector(".mock-note");

const config = typeof STOCK_ADMIN_CONFIG === "undefined"
  ? window.STOCK_ADMIN_CONFIG || {
    ENVIRONMENT: document.documentElement.dataset.stockAdminEnvironment,
    API_BASE_URL: document.documentElement.dataset.stockAdminApiBaseUrl,
  }
  : STOCK_ADMIN_CONFIG;
const SUPPORTED_ENVIRONMENTS = ["TEST", "PRODUCTION"];
const KNOWN_TEST_API_BASE_URLS = [
  "https://script.google.com/macros/s/AKfycbwJYxD1M-U4nWi3-KJxvHNVwuOPP3D8ou_r3jLrMRxfBD0WE45ugbv-GUrN7d0NcYQx_w/exec",
];
const SESSION_TOKEN_KEY = `stock-admin-${runtimeEnvironment().toLowerCase()}-session-token`;
const PRODUCT_PAGE_SIZE = 20;
const STOCK_PAGE_SIZE = 20;
const SHIPMENT_PAGE_SIZE = 20;
const OWNER_ROLE = "OWNER";
const ADMIN_ROLE = "ADMIN";
const ADJUST_STOCK_PERMISSION = "ADJUST_STOCK";
const CONFIRM_SHIPMENT_PERMISSION = "CONFIRM_SHIPMENT";

let currentUser = null;
let activeViewName = "home";
let productSearchTimer = null;
let productDom = null;
let stockSearchTimer = null;
let stockDom = null;
let shipmentDom = null;
let shipmentPickerDom = null;
let shipmentPickerSearchTimer = null;
const productState = {
  initialized: false,
  query: "",
  page: 1,
  hasMore: false,
  loading: false,
  error: "",
  items: [],
  detail: null,
  detailLoading: false,
  detailError: "",
  detailTransition: "",
  listScrollTop: 0,
  requestId: 0,
};
const stockState = {
  initialized: false,
  query: "",
  page: 1,
  pageSize: STOCK_PAGE_SIZE,
  hasMore: false,
  loading: false,
  error: "",
  items: [],
  detail: null,
  history: [],
  historyLoading: false,
  historyError: "",
  detailTransition: "",
  listScrollTop: 0,
  mutation: createEmptyStockMutationState(),
  requestId: 0,
  historyRequestId: 0,
};
const shipmentState = {
  initialized: false,
  page: 1,
  pageSize: SHIPMENT_PAGE_SIZE,
  hasMore: false,
  loading: false,
  error: "",
  items: [],
  detail: null,
  detailLoading: false,
  detailError: "",
  detailTransition: "",
  actionSubmitting: "",
  actionError: "",
  dispatchReview: false,
  dispatchPreview: [],
  returnFlow: createEmptyShipmentReturnState(),
  listScrollTop: 0,
  requestId: 0,
  detailRequestId: 0,
};
const productCreateState = {
  mode: "list",
  form: createEmptyProductForm(),
  errors: [],
  submitting: false,
  message: "",
  messageType: "info",
};
const shipmentCreateState = {
  mode: "list",
  form: createEmptyShipmentForm(),
  picker: createEmptyShipmentPickerState(),
  errors: [],
  submitting: false,
  message: "",
  messageType: "info",
};

const views = {
  home: {
    title: "หน้าแรก",
    render: renderHome,
  },
  orders: {
    title: "ใบสั่งของ",
    render: renderShipmentView,
  },
  products: {
    title: "สินค้า",
    render: renderProductView,
  },
  stock: {
    title: "สต๊อก",
    render: renderStockView,
  },
  more: {
    title: "เพิ่มเติม",
    render: () => renderPlaceholder("เพิ่มเติม", "ยังไม่มีเมนูเพิ่มเติม"),
  },
};

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(loginForm);
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");

  if (!username || !password) {
    showLoginMessage("กรุณากรอกชื่อผู้ใช้และรหัสผ่าน", "error");
    return;
  }

  setLoginLoading(true);
  showLoginMessage("", "info");

  try {
    const response = await callAuthApi("login", { username, password });
    const data = requireSuccess(response);

    if (!data.sessionToken || !data.user) {
      throw new Error("BACKEND_RESPONSE_INVALID");
    }

    sessionStorage.setItem(SESSION_TOKEN_KEY, data.sessionToken);
    enterApp(data.user);
  } catch (error) {
    clearSessionToken();
    showLogin();
    showLoginMessage(toThaiErrorMessage(error), "error");
  } finally {
    setLoginLoading(false);
    passwordInput.value = "";
  }
});

navItems.forEach((item) => {
  item.addEventListener("click", () => setView(item.dataset.view));
});

logoutButton.addEventListener("click", async () => {
  const token = getSessionToken();
  setAppBusy(true);

  try {
    if (token) {
      await callAuthApi("logout", { sessionToken: token });
    }
  } catch (error) {
    // Logout clears the browser session even if the network request fails.
  } finally {
    clearSessionToken();
    currentUser = null;
    setAppBusy(false);
    showLogin();
    showLoginMessage("ออกจากระบบแล้ว", "info");
  }
});

applyEnvironmentUi();
const startupConfigError = validateRuntimeConfig();
if (startupConfigError) {
  showLogin();
  showLoginMessage(toThaiErrorMessage(new Error(startupConfigError)), "error");
  loginButton.disabled = true;
} else {
  restoreSession();
}

async function restoreSession() {
  const token = getSessionToken();

  if (!token) {
    showLogin();
    return;
  }

  showAuthLoading();

  try {
    const response = await callAuthApi("getSession", { sessionToken: token });
    const data = requireSuccess(response);

    if (!data.user) {
      throw new Error("BACKEND_RESPONSE_INVALID");
    }

    enterApp(data.user);
  } catch (error) {
    clearSessionToken();
    showLogin();
    showLoginMessage(toThaiErrorMessage(error), "error");
  }
}

function setView(viewName) {
  if (!currentUser) {
    return;
  }

  const view = views[viewName] || views.home;
  activeViewName = views[viewName] ? viewName : "home";
  viewTitle.textContent = view.title;

  navItems.forEach((item) => {
    item.classList.toggle("is-active", item.dataset.view === activeViewName);
  });

  if (activeViewName !== "products") {
    productDom = null;
  }

  if (activeViewName !== "stock") {
    stockDom = null;
  }

  if (activeViewName !== "orders") {
    shipmentDom = null;
  }

  contentArea.innerHTML = "";
  contentArea.append(view.render());
}

async function callAuthApi(action, payload) {
  const configError = validateRuntimeConfig();
  if (configError) {
    throw new Error(configError);
  }

  const apiBaseUrl = String(config.API_BASE_URL || "").trim();
  const response = await fetch(apiBaseUrl, {
    method: "POST",
    redirect: "follow",
    credentials: "omit",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify({ action, payload }),
  });

  if (!response.ok) {
    throw new Error("NETWORK_RESPONSE_NOT_OK");
  }

  try {
    return await response.json();
  } catch (error) {
    throw new Error("BACKEND_RESPONSE_INVALID");
  }
}

function requireSuccess(response) {
  if (response && response.success) {
    return response.data || {};
  }

  const error = new Error(response && response.error ? response.error.code : "BACKEND_ERROR");
  error.code = response && response.error ? response.error.code : "BACKEND_ERROR";
  error.backendMessage = response && response.error ? response.error.message || "" : "";
  throw error;
}

function enterApp(user) {
  currentUser = user;
  userChip.textContent = user.displayName || user.username || runtimeEnvironment();
  loginScreen.classList.add("is-hidden");
  authLoading.classList.add("is-hidden");
  appShell.classList.remove("is-hidden");
  setView("home");
}

function showLogin() {
  currentUser = null;
  appShell.classList.add("is-hidden");
  authLoading.classList.add("is-hidden");
  loginScreen.classList.remove("is-hidden");
}

function showAuthLoading() {
  loginScreen.classList.add("is-hidden");
  appShell.classList.add("is-hidden");
  authLoading.classList.remove("is-hidden");
}

function setLoginLoading(isLoading) {
  loginButton.disabled = isLoading;
  loginButton.textContent = isLoading ? "กำลังเข้าสู่ระบบ..." : `เข้าสู่ระบบ ${runtimeEnvironmentLabel()}`;
}

function setAppBusy(isBusy) {
  logoutButton.disabled = isBusy;
  navItems.forEach((item) => {
    item.disabled = isBusy;
  });
}

function getSessionToken() {
  return sessionStorage.getItem(SESSION_TOKEN_KEY);
}

function clearSessionToken() {
  sessionStorage.removeItem(SESSION_TOKEN_KEY);
}

function showLoginMessage(message, type) {
  loginStatus.textContent = message;
  loginStatus.dataset.type = type || "info";
}

function toThaiErrorMessage(error) {
  const code = error && (error.code || error.message);

  if (code === "API_URL_MISSING") {
    return "ยังไม่ได้ตั้งค่า Backend URL";
  }

  if (code === "CONFIG_ENVIRONMENT_UNSUPPORTED" ||
    code === "PRODUCTION_URL_BLOCKED" ||
    code === "PRODUCTION_CONFIG_NOT_EXPLICIT" ||
    code === "TEST_URL_BLOCKED" ||
    code === "API_URL_INVALID") {
    return "การตั้งค่า Backend ไม่ถูกต้องจึงหยุดการเชื่อมต่อ";
  }

  if (code === "INVALID_CREDENTIALS" || code === "VALIDATION_ERROR") {
    return "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง";
  }

  if (code === "AUTH_REQUIRED" || code === "SESSION_EXPIRED") {
    return "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่";
  }

  if (code === "NOT_CONFIGURED") {
    return "ระบบ Backend ยังไม่พร้อมใช้งาน";
  }

  if (code === "BACKEND_RESPONSE_INVALID") {
    return "รูปแบบคำตอบจาก Backend ไม่ถูกต้อง";
  }

  if (code === "NETWORK_RESPONSE_NOT_OK" || error instanceof TypeError) {
    return "เชื่อมต่อ Backend ไม่สำเร็จ กรุณาตรวจสอบเครือข่ายหรือ CORS";
  }

  return "ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง";
}

function runtimeEnvironment() {
  return String(config.ENVIRONMENT || "").trim().toUpperCase();
}

function runtimeEnvironmentLabel() {
  const environment = runtimeEnvironment();
  return SUPPORTED_ENVIRONMENTS.includes(environment) ? environment : "UNKNOWN";
}

function isKnownTestApiBaseUrl(apiBaseUrl) {
  return KNOWN_TEST_API_BASE_URLS.includes(String(apiBaseUrl || "").trim());
}

function validateRuntimeConfig() {
  const apiBaseUrl = String(config.API_BASE_URL || "").trim();
  const environment = runtimeEnvironment();

  if (!SUPPORTED_ENVIRONMENTS.includes(environment)) {
    return "CONFIG_ENVIRONMENT_UNSUPPORTED";
  }

  if (!apiBaseUrl) {
    return "API_URL_MISSING";
  }

  if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(apiBaseUrl)) {
    return "API_URL_INVALID";
  }

  if (environment === "TEST" && /production|prod/i.test(apiBaseUrl)) {
    return "PRODUCTION_URL_BLOCKED";
  }

  if (environment === "PRODUCTION" && config.EXPECTED_ENVIRONMENT !== "PRODUCTION") {
    return "PRODUCTION_CONFIG_NOT_EXPLICIT";
  }

  if (environment === "PRODUCTION" && isKnownTestApiBaseUrl(apiBaseUrl)) {
    return "TEST_URL_BLOCKED";
  }

  return "";
}

function applyEnvironmentUi() {
  const label = runtimeEnvironmentLabel();
  const environmentName = runtimeEnvironment() === "PRODUCTION" ? "ระบบใช้งานจริง" : "ระบบทดสอบ";
  document.documentElement.dataset.stockAdminEnvironment = runtimeEnvironment();
  environmentStrips.forEach((strip) => {
    strip.textContent = environmentName;
  });
  if (environmentBadge) {
    environmentBadge.textContent = label;
    environmentBadge.classList.toggle("is-hidden", runtimeEnvironment() === "PRODUCTION");
  }
  if (loginCopy) {
    loginCopy.textContent = "เข้าสู่ระบบด้วยบัญชีที่ได้รับอนุญาต";
  }
  if (mockNote) {
    mockNote.textContent = runtimeEnvironment() === "PRODUCTION"
      ? "กำลังใช้งานระบบจริง ข้อมูลในระบบนี้เป็นข้อมูลจริง"
      : "กำลังใช้งานระบบทดสอบ ข้อมูลนี้ไม่ใช่ข้อมูลจริง";
  }
  loginButton.textContent = "เข้าสู่ระบบ";
  appShell.setAttribute("aria-label", environmentName);
}

function renderHome() {
  const fragment = document.createDocumentFragment();

  const search = document.createElement("div");
  search.className = "search-box";
  search.textContent = "เลือกงานที่ต้องการทำ";
  fragment.append(search);

  const shortcuts = document.createElement("section");
  shortcuts.className = "shortcut-grid";
  shortcuts.append(
    createShortcut("รับเข้า", "ไปที่หน้าสต๊อก", "stock"),
    createShortcut("จ่ายออก", "ไปที่หน้าใบสั่งของ", "orders"),
    createShortcut("ตรวจนับ", "ไปที่หน้าสต๊อก", "stock"),
    createShortcut("รายงาน", "ยังไม่เปิดใช้งาน"),
  );
  fragment.append(shortcuts);

  const pending = document.createElement("section");
  pending.className = "card";
  pending.innerHTML = `
    <h2>งานรอดำเนินการ</h2>
    <p class="placeholder-text">ฟีเจอร์นี้ยังไม่เปิดใช้งาน</p>
  `;
  fragment.append(pending);

  const summary = document.createElement("section");
  summary.className = "card";
  summary.innerHTML = `
    <h2>สรุปภาพรวม</h2>
    <p class="placeholder-text">ยังไม่มีข้อมูลภาพรวม</p>
  `;
  fragment.append(summary);

  return fragment;
}

function renderProductView() {
  const section = document.createElement("section");
  section.className = "product-view";

  const toolbar = document.createElement("section");
  toolbar.className = "product-toolbar";

  const intro = document.createElement("div");
  const title = document.createElement("h2");
  title.textContent = "รายการสินค้า";
  const detail = document.createElement("p");
  detail.className = "placeholder-text";
  detail.textContent = "ดูสินค้าและ SKU จากระบบ Backend แบบอ่านอย่างเดียว";
  intro.append(title, detail);

  const actions = document.createElement("div");
  actions.className = "product-toolbar-actions";
  if (canUseCreateProductUi()) {
    const createButton = document.createElement("button");
    createButton.className = "create-product-entry-button";
    createButton.type = "button";
    createButton.textContent = productCreateState.mode === "list" ? "+ เพิ่มสินค้า" : "กลับรายการ";
    createButton.addEventListener("click", () => {
      if (productCreateState.submitting) {
        return;
      }

      if (productCreateState.mode === "list") {
        productCreateState.message = "";
      }
      productCreateState.mode = productCreateState.mode === "list" ? "form" : "list";
      productCreateState.errors = [];
      rerenderProductView();
    });
    actions.append(createButton);
  }

  const searchLabel = document.createElement("label");
  searchLabel.className = "product-search-label";
  const searchText = document.createElement("span");
  searchText.textContent = "ค้นหาสินค้า";
  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.autocomplete = "off";
  searchInput.placeholder = "ชื่อสินค้า, SKU, รุ่น, สี, ขนาด";
  searchInput.value = productState.query;
  searchInput.addEventListener("input", (event) => {
    productState.query = event.target.value;
    clearTimeout(productSearchTimer);
    productSearchTimer = setTimeout(() => {
      loadProducts({ reset: true });
    }, 350);
  });
  searchLabel.append(searchText, searchInput);

  toolbar.append(intro);
  if (actions.childNodes.length > 0) {
    toolbar.append(actions);
  }

  if (productCreateState.mode !== "list") {
    productDom = null;
    section.append(toolbar, renderCreateProductFlow());
    return section;
  }

  if (productState.detail) {
    productDom = null;
    section.append(renderProductDetailView());
    scheduleProductDetailTopScroll();
    return section;
  }

  toolbar.append(searchLabel);

  const status = document.createElement("div");
  status.className = "product-status";
  status.setAttribute("aria-live", "polite");

  const list = document.createElement("div");
  list.className = "product-list";

  const loadMoreButton = document.createElement("button");
  loadMoreButton.className = "load-more-button";
  loadMoreButton.type = "button";
  loadMoreButton.textContent = "โหลดเพิ่มเติม";
  loadMoreButton.addEventListener("click", () => {
    if (productState.loading || !productState.hasMore) {
      return;
    }
    productState.page += 1;
    loadProducts({ reset: false });
  });

  productDom = {
    status,
    list,
    loadMoreButton,
    searchInput,
  };

  section.append(toolbar, status, list, loadMoreButton);
  updateProductDom();

  if (!productState.initialized) {
    queueMicrotask(() => loadProducts({ reset: true }));
  }

  return section;
}

async function loadProducts(options) {
  const reset = !!(options && options.reset);
  const requestId = productState.requestId + 1;
  productState.requestId = requestId;

  if (reset) {
    productState.page = 1;
    productState.items = [];
    productState.hasMore = false;
    productState.detail = null;
    productState.detailError = "";
  }

  productState.loading = true;
  productState.error = "";
  productState.initialized = true;
  updateProductDom();

  try {
    const token = requireSessionToken();
    const action = productState.query.trim() ? "searchProducts" : "listProducts";
    const payload = {
      sessionToken: token,
      page: productState.page,
      pageSize: PRODUCT_PAGE_SIZE,
    };

    if (action === "searchProducts") {
      payload.query = productState.query.trim();
    }

    const response = await callAuthApi(action, payload);
    const data = requireSuccess(response);

    if (requestId !== productState.requestId) {
      return;
    }

    const nextItems = Array.isArray(data.items) ? data.items : [];
    productState.items = reset ? nextItems : appendUniqueProducts(productState.items, nextItems);
    productState.hasMore = !!data.hasMore;
  } catch (error) {
    if (handleProductAuthFailure(error)) {
      return;
    }

    if (!reset && productState.page > 1) {
      productState.page -= 1;
    }
    productState.error = toThaiErrorMessage(error);
  } finally {
    if (requestId === productState.requestId) {
      productState.loading = false;
      updateProductDom();
    }
  }
}

function openProductDetail(product) {
  productState.listScrollTop = getProductScrollTop();
  productState.detail = product;
  productState.detailError = "";
  productState.detailLoading = false;
  productState.detailTransition = "enter";
  rerenderProductView();
}

function renderCreateProductFlow() {
  const wrapper = document.createElement("section");
  wrapper.className = "create-product-flow";

  if (!canUseCreateProductUi()) {
    const denied = document.createElement("section");
    denied.className = "card product-error";
    denied.textContent = "เมนูเพิ่มสินค้าเปิดให้ OWNER ใช้งานใน Phase นี้เท่านั้น";
    wrapper.append(denied);
    return wrapper;
  }

  if (productCreateState.message) {
    const message = document.createElement("p");
    message.className = "product-status create-product-message";
    message.dataset.type = productCreateState.messageType;
    message.textContent = productCreateState.message;
    wrapper.append(message);
  }

  if (productCreateState.errors.length > 0) {
    const errorBox = document.createElement("section");
    errorBox.className = "card create-error-list";
    const title = document.createElement("h2");
    title.textContent = "ตรวจสอบข้อมูล";
    const list = document.createElement("ul");
    productCreateState.errors.forEach((error) => {
      const item = document.createElement("li");
      item.textContent = error;
      list.append(item);
    });
    errorBox.append(title, list);
    wrapper.append(errorBox);
  }

  wrapper.append(productCreateState.mode === "review"
    ? renderCreateProductReview()
    : renderCreateProductForm());
  return wrapper;
}

function renderCreateProductForm() {
  const form = document.createElement("form");
  form.className = "card create-product-form";
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    openCreateProductReview();
  });

  const title = document.createElement("h2");
  title.textContent = "เพิ่มสินค้า";
  const note = document.createElement("p");
  note.className = "placeholder-text";
  note.textContent = "ระบบจะสร้าง Stock เริ่มต้นเป็น 0 อัตโนมัติ และไม่รับ Opening Balance ในขั้นตอนนี้";
  form.append(title, note);

  form.append(
    createTextField("product_name", "ชื่อสินค้า", productCreateState.form.product_name, true, (value) => {
      productCreateState.form.product_name = value;
    }),
    createTextField("category", "หมวดหมู่", productCreateState.form.category, false, (value) => {
      productCreateState.form.category = value;
    }),
    createTextAreaField("description", "รายละเอียด", productCreateState.form.description, (value) => {
      productCreateState.form.description = value;
    }),
  );

  const skuHeader = document.createElement("div");
  skuHeader.className = "create-section-header";
  const skuTitle = document.createElement("h3");
  skuTitle.textContent = "SKU";
  const addSku = document.createElement("button");
  addSku.type = "button";
  addSku.className = "secondary-action-button";
  addSku.textContent = "+ เพิ่ม SKU";
  addSku.addEventListener("click", () => {
    productCreateState.form.skus.push(createEmptySkuForm());
    productCreateState.errors = [];
    rerenderProductView();
  });
  skuHeader.append(skuTitle, addSku);
  form.append(skuHeader);

  productCreateState.form.skus.forEach((sku, index) => {
    form.append(renderSkuFormCard(sku, index));
  });

  const actions = document.createElement("div");
  actions.className = "create-form-actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "secondary-action-button";
  cancel.textContent = "ยกเลิก";
  cancel.addEventListener("click", () => {
    resetCreateProductState();
    rerenderProductView();
  });
  const review = document.createElement("button");
  review.type = "submit";
  review.className = "primary-action-button";
  review.textContent = "ตรวจสอบก่อนบันทึก";
  actions.append(cancel, review);
  form.append(actions);

  return form;
}

function renderSkuFormCard(sku, index) {
  const card = document.createElement("section");
  card.className = "sku-form-card";

  const header = document.createElement("div");
  header.className = "sku-form-header";
  const title = document.createElement("h3");
  title.textContent = `SKU #${index + 1}`;
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "remove-sku-button";
  remove.textContent = "ลบ";
  remove.disabled = productCreateState.form.skus.length <= 1;
  remove.addEventListener("click", () => {
    if (productCreateState.form.skus.length <= 1) {
      return;
    }
    productCreateState.form.skus.splice(index, 1);
    productCreateState.errors = [];
    rerenderProductView();
  });
  header.append(title, remove);
  card.append(header);

  card.append(
    createTextField(`sku_code_${index}`, "รหัส SKU", sku.sku_code, true, (value) => {
      sku.sku_code = value;
    }),
    createTextField(`model_${index}`, "รุ่น", sku.model, false, (value) => {
      sku.model = value;
    }),
    createTextField(`color_${index}`, "สี", sku.color, false, (value) => {
      sku.color = value;
    }),
    createTextField(`size_${index}`, "ขนาด", sku.size, false, (value) => {
      sku.size = value;
    }),
    createNumberField(`cost_price_${index}`, "ต้นทุน", sku.cost_price, true, "0.01", (value) => {
      sku.cost_price = value;
    }),
    createNumberField(`sale_price_${index}`, "ราคาขาย", sku.sale_price, true, "0.01", (value) => {
      sku.sale_price = value;
    }),
    createNumberField(
      `sourceable_qty_estimate_${index}`,
      "หาเพิ่มได้ประมาณ",
      sku.sourceable_qty_estimate,
      false,
      "1",
      (value) => {
        sku.sourceable_qty_estimate = value;
      },
    ),
  );

  const stockNote = document.createElement("p");
  stockNote.className = "placeholder-text";
  stockNote.textContent = "Stock เริ่มต้น = 0";
  card.append(stockNote);
  return card;
}

function renderCreateProductReview() {
  const review = document.createElement("section");
  review.className = "card create-review-card";

  const title = document.createElement("h2");
  title.textContent = "ยืนยันการเพิ่มสินค้า";
  const note = document.createElement("p");
  note.className = "placeholder-text";
  note.textContent = "กรุณาตรวจสอบก่อนบันทึก Stock เริ่มต้นจะเป็น 0 และแก้ไข Stock ไม่ได้ในขั้นตอนนี้";
  review.append(title, note);

  const productSummary = document.createElement("div");
  productSummary.className = "review-summary";
  productSummary.append(
    createReviewLine("ชื่อสินค้า", productCreateState.form.product_name),
    createReviewLine("หมวดหมู่", productCreateState.form.category || "-"),
    createReviewLine("จำนวน SKU", productCreateState.form.skus.length),
  );
  review.append(productSummary);

  const skuList = document.createElement("div");
  skuList.className = "sku-list";
  productCreateState.form.skus.forEach((sku, index) => {
    const card = document.createElement("article");
    card.className = "sku-summary";
    card.append(
      createReviewLine(`SKU #${index + 1}`, normalizeSkuCodeForUi(sku.sku_code)),
      createReviewLine("รุ่น / สี / ขนาด", [sku.model, sku.color, sku.size].filter(Boolean).join(" / ") || "-"),
      createReviewLine("ต้นทุน", formatBaht(sku.cost_price)),
      createReviewLine("ราคาขาย", formatBaht(sku.sale_price)),
      createReviewLine("หาเพิ่มได้ประมาณ", formatNumber(parseSourceableForPayload(sku.sourceable_qty_estimate))),
      createReviewLine("Stock เริ่มต้น", "0"),
    );
    skuList.append(card);
  });
  review.append(skuList);

  const actions = document.createElement("div");
  actions.className = "create-form-actions";
  const back = document.createElement("button");
  back.type = "button";
  back.className = "secondary-action-button";
  back.textContent = "กลับไปแก้ไข";
  back.disabled = productCreateState.submitting;
  back.addEventListener("click", () => {
    productCreateState.mode = "form";
    productCreateState.errors = [];
    rerenderProductView();
  });
  const submit = document.createElement("button");
  submit.type = "button";
  submit.className = "primary-action-button";
  submit.textContent = productCreateState.submitting ? "กำลังบันทึก..." : "บันทึกสินค้า";
  submit.disabled = productCreateState.submitting;
  submit.addEventListener("click", submitCreateProduct);
  actions.append(back, submit);
  review.append(actions);

  return review;
}

function createTextField(name, label, value, required, onInput) {
  const wrapper = document.createElement("label");
  wrapper.className = "create-field";
  const span = document.createElement("span");
  span.textContent = label;
  const input = document.createElement("input");
  input.name = name;
  input.type = "text";
  input.value = value || "";
  input.required = !!required;
  input.addEventListener("input", (event) => onInput(event.target.value));
  wrapper.append(span, input);
  return wrapper;
}

function createTextAreaField(name, label, value, onInput) {
  const wrapper = document.createElement("label");
  wrapper.className = "create-field";
  const span = document.createElement("span");
  span.textContent = label;
  const textarea = document.createElement("textarea");
  textarea.name = name;
  textarea.value = value || "";
  textarea.addEventListener("input", (event) => onInput(event.target.value));
  wrapper.append(span, textarea);
  return wrapper;
}

function createNumberField(name, label, value, required, step, onInput) {
  const wrapper = document.createElement("label");
  wrapper.className = "create-field";
  const span = document.createElement("span");
  span.textContent = label;
  const input = document.createElement("input");
  input.name = name;
  input.type = "number";
  input.min = "0";
  input.step = step;
  input.value = value || "";
  input.required = !!required;
  input.addEventListener("input", (event) => onInput(event.target.value));
  wrapper.append(span, input);
  return wrapper;
}

function openCreateProductReview() {
  productCreateState.errors = validateCreateProductForm();
  productCreateState.message = "";
  if (productCreateState.errors.length > 0) {
    rerenderProductView();
    return;
  }

  productCreateState.mode = "review";
  rerenderProductView();
}

async function submitCreateProduct() {
  if (productCreateState.submitting) {
    return;
  }

  productCreateState.errors = validateCreateProductForm();
  productCreateState.message = "";
  if (productCreateState.errors.length > 0) {
    productCreateState.mode = "form";
    rerenderProductView();
    return;
  }

  productCreateState.submitting = true;
  rerenderProductView();

  try {
    const response = await callAuthApi("createProduct", {
      sessionToken: requireSessionToken(),
      product: createProductPayloadFromForm(),
    });
    requireSuccess(response);
    resetCreateProductState();
    productCreateState.message = "เพิ่มสินค้าสำเร็จ";
    productCreateState.messageType = "info";
    productState.initialized = false;
    await loadProducts({ reset: true });
    productCreateState.message = "เพิ่มสินค้าสำเร็จ";
    rerenderProductView();
  } catch (error) {
    if (handleProductAuthFailure(error)) {
      return;
    }
    productCreateState.submitting = false;
    productCreateState.errors = [toCreateProductErrorMessage(error)];
    productCreateState.mode = "form";
    rerenderProductView();
  }
}

function validateCreateProductForm() {
  const errors = [];
  const form = productCreateState.form;
  if (!String(form.product_name || "").trim()) {
    errors.push("กรุณากรอกชื่อสินค้า");
  }

  if (!Array.isArray(form.skus) || form.skus.length < 1) {
    errors.push("ต้องมี SKU อย่างน้อย 1 รายการ");
  }

  const seenSkuCodes = {};
  form.skus.forEach((sku, index) => {
    const label = `SKU #${index + 1}`;
    const skuCode = normalizeSkuCodeForUi(sku.sku_code);
    if (!skuCode) {
      errors.push(`${label}: กรุณากรอกรหัส SKU`);
    } else if (seenSkuCodes[skuCode]) {
      errors.push(`${label}: รหัส SKU ซ้ำในฟอร์ม`);
    }
    seenSkuCodes[skuCode] = true;

    if (!isNonNegativeNumberInput(sku.cost_price)) {
      errors.push(`${label}: ต้นทุนต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป`);
    }

    if (!isNonNegativeNumberInput(sku.sale_price)) {
      errors.push(`${label}: ราคาขายต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป`);
    }

    if (!isNonNegativeIntegerInput(sku.sourceable_qty_estimate || "0")) {
      errors.push(`${label}: หาเพิ่มได้ประมาณต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป`);
    }
  });

  return errors;
}

function createProductPayloadFromForm() {
  return {
    product_name: String(productCreateState.form.product_name || "").trim(),
    category: String(productCreateState.form.category || "").trim(),
    description: String(productCreateState.form.description || "").trim(),
    skus: productCreateState.form.skus.map((sku) => ({
      sku_code: normalizeSkuCodeForUi(sku.sku_code),
      model: String(sku.model || "").trim(),
      color: String(sku.color || "").trim(),
      size: String(sku.size || "").trim(),
      cost_price: Number(sku.cost_price),
      sale_price: Number(sku.sale_price),
      sourceable_qty_estimate: parseSourceableForPayload(sku.sourceable_qty_estimate),
    })),
  };
}

function createReviewLine(label, value) {
  const row = document.createElement("div");
  row.className = "review-line";
  const key = document.createElement("span");
  key.textContent = label;
  const val = document.createElement("strong");
  val.textContent = String(value || "-");
  row.append(key, val);
  return row;
}

function createEmptyProductForm() {
  return {
    product_name: "",
    category: "",
    description: "",
    skus: [createEmptySkuForm()],
  };
}

function createEmptySkuForm() {
  return {
    sku_code: "",
    model: "",
    color: "",
    size: "",
    cost_price: "",
    sale_price: "",
    sourceable_qty_estimate: "",
  };
}

function resetCreateProductState() {
  productCreateState.mode = "list";
  productCreateState.form = createEmptyProductForm();
  productCreateState.errors = [];
  productCreateState.submitting = false;
  productCreateState.message = "";
  productCreateState.messageType = "info";
}

function rerenderProductView() {
  if (activeViewName === "products" && currentUser) {
    setView("products");
  }
}

function canUseCreateProductUi() {
  return !!currentUser && currentUser.role === OWNER_ROLE;
}

function canUseStockMutationUi() {
  if (!currentUser) {
    return false;
  }

  if (currentUser.role === OWNER_ROLE) {
    return true;
  }

  if (currentUser.role !== ADMIN_ROLE || !Array.isArray(currentUser.permissions)) {
    return false;
  }

  return currentUser.permissions.includes(ADJUST_STOCK_PERMISSION);
}

function normalizeSkuCodeForUi(value) {
  return String(value || "").trim().toUpperCase();
}

function isNonNegativeNumberInput(value) {
  if (value === "" || value === null || typeof value === "undefined") {
    return false;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0;
}

function isNonNegativeIntegerInput(value) {
  if (value === "" || value === null || typeof value === "undefined") {
    return true;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && Math.floor(parsed) === parsed;
}

function parseSourceableForPayload(value) {
  if (value === "" || value === null || typeof value === "undefined") {
    return 0;
  }
  return Number(value);
}

function toCreateProductErrorMessage(error) {
  const code = error && (error.code || error.message);
  if (code === "PERMISSION_DENIED") {
    return "บัญชีนี้ไม่มีสิทธิ์เพิ่มสินค้า";
  }
  if (code === "VALIDATION_ERROR") {
    return "ข้อมูลสินค้าไม่ถูกต้อง กรุณาตรวจสอบรหัส SKU ราคา และข้อมูลที่จำเป็น";
  }
  return toThaiErrorMessage(error);
}

function updateProductDom() {
  if (!productDom || activeViewName !== "products") {
    return;
  }

  productDom.status.textContent = "";
  productDom.status.dataset.type = "info";

  clearElement(productDom.list);
  productState.items.forEach((product) => {
    productDom.list.append(createProductCard(product));
  });

  if (productCreateState.message && !productState.loading && !productState.error) {
    productDom.status.textContent = productCreateState.message;
    productDom.status.dataset.type = productCreateState.messageType;
  } else if (productState.loading && productState.items.length === 0) {
    productDom.status.textContent = "กำลังโหลดรายการสินค้า...";
  } else if (productState.error) {
    productDom.status.textContent = productState.error;
    productDom.status.dataset.type = "error";
  } else if (!productState.loading && productState.items.length === 0) {
    productDom.status.textContent = productState.query.trim()
      ? "ไม่พบสินค้าที่ตรงกับคำค้นหา"
      : "ยังไม่มีข้อมูลสินค้า";
  } else if (productState.loading) {
    productDom.status.textContent = "กำลังโหลดเพิ่มเติม...";
  } else {
    productDom.status.textContent = productState.query.trim()
      ? "ผลการค้นหาแบบอ่านอย่างเดียว"
      : "รายการสินค้า";
  }

  productDom.loadMoreButton.hidden = !productState.hasMore;
  productDom.loadMoreButton.disabled = productState.loading;

}

function createProductCard(product) {
  const article = document.createElement("article");
  article.className = "card product-card";

  const button = document.createElement("button");
  button.className = "product-card-button";
  button.type = "button";
  button.addEventListener("click", () => openProductDetail(product));

  const header = document.createElement("div");
  header.className = "product-card-header";

  const titleWrap = document.createElement("div");
  const title = document.createElement("h2");
  title.textContent = product.productName || "ไม่ระบุชื่อสินค้า";
  const category = document.createElement("p");
  category.className = "placeholder-text";
  category.textContent = product.category || "ไม่ระบุหมวดหมู่";
  titleWrap.append(title, category);

  const status = document.createElement("span");
  status.className = "status-pill";
  status.textContent = product.status || "-";
  header.append(titleWrap, status);

  const summary = document.createElement("div");
  summary.className = "product-meta-grid";
  summary.append(
    createMetric("SKU", product.skuCount || 0),
    createMetric("สถานะ", product.status || "-"),
  );

  const skuList = document.createElement("div");
  skuList.className = "sku-list";
  const skus = Array.isArray(product.skus) ? product.skus : [];
  skus.forEach((sku) => {
    skuList.append(createSkuSummary(sku));
  });

  button.append(header, summary, skuList);
  article.append(button);
  return article;
}

function createMetric(label, value) {
  const item = document.createElement("div");
  item.className = "metric-item";
  const strong = document.createElement("strong");
  strong.textContent = String(value);
  const span = document.createElement("span");
  span.textContent = label;
  item.append(strong, span);
  return item;
}

function createSkuSummary(sku) {
  const item = document.createElement("article");
  item.className = "sku-summary";

  const top = document.createElement("div");
  top.className = "sku-summary-top";
  const code = document.createElement("strong");
  code.className = "sku-code";
  code.textContent = sku.skuCode || "-";
  const price = document.createElement("span");
  price.textContent = formatBaht(sku.salePrice);
  top.append(code, price);

  const variant = document.createElement("p");
  variant.className = "placeholder-text";
  variant.textContent = [sku.model, sku.color, sku.size].filter(Boolean).join(" / ") || "ไม่ระบุรายละเอียด SKU";

  const quantities = document.createElement("div");
  quantities.className = "quantity-row";
  quantities.append(
    createQuantityChip("Stock", sku.onHandQty),
    createQuantityChip("หาเพิ่มได้", sku.sourceableQtyEstimate),
  );

  item.append(top, variant, quantities);
  return item;
}

function createQuantityChip(label, value) {
  const chip = document.createElement("span");
  chip.className = label === "Stock" ? "quantity-chip stock" : "quantity-chip sourceable";
  const name = document.createElement("span");
  name.textContent = label;
  const amount = document.createElement("strong");
  amount.textContent = formatNumber(value);
  chip.append(name, amount);
  return chip;
}

function renderProductDetailView() {
  const view = document.createElement("section");
  view.className = "product-detail-view";
  if (productState.detailTransition === "exit") {
    view.classList.add("is-exiting");
  }

  if (productState.detailLoading) {
    const loading = document.createElement("section");
    loading.className = "card product-detail-card";
    loading.textContent = "กำลังโหลดรายละเอียดสินค้า...";
    view.append(loading);
    return view;
  }

  if (productState.detailError) {
    const error = document.createElement("section");
    error.className = "card product-detail-card product-error";
    error.textContent = productState.detailError;
    view.append(error);
    return view;
  }

  if (!productState.detail) {
    return view;
  }

  const product = productState.detail;
  const card = document.createElement("section");
  card.className = "card product-detail-card";

  const header = document.createElement("div");
  header.className = "product-detail-header";
  const titleWrap = document.createElement("div");
  const title = document.createElement("h2");
  title.textContent = product.productName || "รายละเอียดสินค้า";
  const meta = document.createElement("p");
  meta.className = "placeholder-text";
  meta.textContent = `${product.category || "ไม่ระบุหมวดหมู่"} · ${product.status || "-"}`;
  titleWrap.append(title, meta);

  const close = document.createElement("button");
  close.className = "detail-close-button";
  close.type = "button";
  close.disabled = productState.detailTransition === "exit";
  close.textContent = "กลับ";
  close.addEventListener("click", closeProductDetail);
  header.append(titleWrap, close);

  const skuList = document.createElement("div");
  skuList.className = "sku-list detail-sku-list";
  (Array.isArray(product.skus) ? product.skus : []).forEach((sku) => {
    skuList.append(createSkuSummary(sku));
  });

  card.append(header, skuList);
  view.append(card);
  return view;
}

function closeProductDetail() {
  if (productState.detailTransition === "exit") {
    return;
  }

  const detailView = document.querySelector(".product-detail-view");
  const finish = () => {
    productState.detail = null;
    productState.detailError = "";
    productState.detailLoading = false;
    productState.detailTransition = "";
    rerenderProductView();
    scheduleProductListScrollRestore();
  };

  if (!detailView || shouldReduceMotion()) {
    finish();
    return;
  }

  productState.detailTransition = "exit";
  detailView.classList.add("is-exiting");
  const backButton = detailView.querySelector(".detail-close-button");
  if (backButton) {
    backButton.disabled = true;
  }
  detailView.addEventListener("animationend", finish, { once: true });
}

function scheduleProductDetailTopScroll() {
  requestAnimationFrame(() => {
    setProductScrollTop(getProductContentTopScroll());
  });
}

function scheduleProductListScrollRestore() {
  requestAnimationFrame(() => {
    setProductScrollTop(productState.listScrollTop);
  });
}

function getProductScrollElement() {
  return document.scrollingElement || document.documentElement;
}

function getProductScrollTop() {
  const scroller = getProductScrollElement();
  return scroller ? scroller.scrollTop : 0;
}

function setProductScrollTop(scrollTop) {
  const scroller = getProductScrollElement();
  if (scroller) {
    scroller.scrollTop = Math.max(0, scrollTop || 0);
  }
}

function getProductContentTopScroll() {
  if (!contentArea) {
    return 0;
  }

  const header = document.querySelector(".app-header");
  const headerHeight = header ? header.getBoundingClientRect().height : 0;
  return Math.max(0, contentArea.getBoundingClientRect().top + getProductScrollTop() - headerHeight);
}

function shouldReduceMotion() {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function appendUniqueProducts(existingItems, nextItems) {
  const seen = new Set(existingItems.map((item) => item.productId));
  const merged = [...existingItems];
  nextItems.forEach((item) => {
    if (!seen.has(item.productId)) {
      seen.add(item.productId);
      merged.push(item);
    }
  });
  return merged;
}

function renderShipmentView() {
  const section = document.createElement("section");
  section.className = "product-view shipment-view";

  const toolbar = document.createElement("section");
  toolbar.className = "product-toolbar";

  const intro = document.createElement("div");
  const title = document.createElement("h2");
  title.textContent = "ใบสั่งของ";
  const detail = document.createElement("p");
  detail.className = "placeholder-text";
  detail.textContent = "สร้างและติดตาม Shipment โดยยังไม่ตัด Stock จนกว่าจะ Dispatch";
  intro.append(title, detail);

  const actions = document.createElement("div");
  actions.className = "product-toolbar-actions";
  if (canUseShipmentMutationUi()) {
    const createButton = document.createElement("button");
    createButton.className = "create-product-entry-button";
    createButton.type = "button";
    createButton.textContent = shipmentCreateState.mode === "list" ? "+ สร้าง Shipment" : "กลับรายการ";
    createButton.disabled = shipmentCreateState.submitting || !!shipmentState.actionSubmitting;
    createButton.addEventListener("click", () => {
      if (shipmentCreateState.submitting || shipmentState.actionSubmitting) {
        return;
      }
      shipmentCreateState.mode = shipmentCreateState.mode === "list" ? "form" : "list";
      shipmentPickerDom = null;
      shipmentCreateState.picker = createEmptyShipmentPickerState();
      shipmentCreateState.errors = [];
      shipmentCreateState.message = "";
      rerenderShipmentView();
    });
    actions.append(createButton);
  }

  toolbar.append(intro);
  if (actions.childNodes.length > 0) {
    toolbar.append(actions);
  }

  if (shipmentCreateState.mode !== "list") {
    shipmentDom = null;
    section.append(toolbar, renderCreateShipmentFlow());
    return section;
  }

  if (shipmentState.detail) {
    shipmentDom = null;
    section.append(renderShipmentDetailView());
    scheduleShipmentDetailTopScroll();
    return section;
  }

  const status = document.createElement("div");
  status.className = "product-status";
  status.setAttribute("aria-live", "polite");

  const list = document.createElement("div");
  list.className = "product-list";

  const loadMoreButton = document.createElement("button");
  loadMoreButton.className = "load-more-button";
  loadMoreButton.type = "button";
  loadMoreButton.textContent = "โหลดเพิ่มเติม";
  loadMoreButton.addEventListener("click", () => {
    if (shipmentState.loading || !shipmentState.hasMore) {
      return;
    }
    shipmentState.page += 1;
    loadShipments({ reset: false });
  });

  shipmentDom = {
    status,
    list,
    loadMoreButton,
  };

  section.append(toolbar, status, list, loadMoreButton);
  updateShipmentDom();

  if (!shipmentState.initialized) {
    queueMicrotask(() => loadShipments({ reset: true }));
  }

  return section;
}

async function loadShipments(options) {
  const reset = !!(options && options.reset);
  const requestId = shipmentState.requestId + 1;
  shipmentState.requestId = requestId;

  if (reset) {
    shipmentState.page = 1;
    shipmentState.items = [];
    shipmentState.hasMore = false;
    shipmentState.detail = null;
    shipmentState.detailError = "";
    shipmentState.actionError = "";
    shipmentState.dispatchReview = false;
    shipmentState.dispatchPreview = [];
    shipmentState.returnFlow = createEmptyShipmentReturnState();
  }

  shipmentState.loading = true;
  shipmentState.error = "";
  shipmentState.initialized = true;
  updateShipmentDom();

  try {
    const response = await callAuthApi("listShipments", {
      sessionToken: requireSessionToken(),
      page: shipmentState.page,
      pageSize: shipmentState.pageSize,
    });
    const data = requireSuccess(response);

    if (requestId !== shipmentState.requestId) {
      return;
    }

    const nextItems = Array.isArray(data.items) ? data.items : [];
    shipmentState.items = reset ? nextItems : appendUniqueShipments(shipmentState.items, nextItems);
    shipmentState.hasMore = !!data.hasMore;
  } catch (error) {
    if (handleProductAuthFailure(error)) {
      return;
    }

    if (!reset && shipmentState.page > 1) {
      shipmentState.page -= 1;
    }
    shipmentState.error = toShipmentErrorMessage(error);
  } finally {
    if (requestId === shipmentState.requestId) {
      shipmentState.loading = false;
      updateShipmentDom();
    }
  }
}

function updateShipmentDom() {
  if (!shipmentDom || activeViewName !== "orders") {
    return;
  }

  clearElement(shipmentDom.list);
  shipmentState.items.forEach((shipment) => {
    shipmentDom.list.append(createShipmentCard(shipment));
  });

  if (shipmentCreateState.message && !shipmentState.loading && !shipmentState.error) {
    shipmentDom.status.textContent = shipmentCreateState.message;
    shipmentDom.status.dataset.type = shipmentCreateState.messageType || "info";
  } else if (shipmentState.loading && shipmentState.items.length === 0) {
    shipmentDom.status.textContent = "กำลังโหลด Shipment...";
    shipmentDom.status.dataset.type = "info";
  } else if (shipmentState.error) {
    shipmentDom.status.textContent = shipmentState.error;
    shipmentDom.status.dataset.type = "error";
  } else if (!shipmentState.loading && shipmentState.items.length === 0) {
    shipmentDom.status.textContent = "ยังไม่มี Shipment";
    shipmentDom.status.dataset.type = "info";
  } else if (shipmentState.loading) {
    shipmentDom.status.textContent = "กำลังโหลดเพิ่มเติม...";
    shipmentDom.status.dataset.type = "info";
  } else {
    shipmentDom.status.textContent = "";
    shipmentDom.status.dataset.type = "info";
  }

  shipmentDom.loadMoreButton.hidden = !shipmentState.hasMore;
  shipmentDom.loadMoreButton.disabled = shipmentState.loading;
}

function createShipmentCard(shipment) {
  const article = document.createElement("article");
  article.className = "card product-card shipment-card";

  const button = document.createElement("button");
  button.className = "product-card-button";
  button.type = "button";
  button.addEventListener("click", () => openShipmentDetail(shipment));

  const header = document.createElement("div");
  header.className = "product-card-header";
  const titleWrap = document.createElement("div");
  const title = document.createElement("h2");
  title.textContent = shipment.reference || "Shipment ไม่มีเลขอ้างอิง";
  const meta = document.createElement("p");
  meta.className = "placeholder-text";
  meta.textContent = formatDateTime(shipment.createdAt) || "-";
  titleWrap.append(title, meta);

  const status = document.createElement("span");
  status.className = "status-pill";
  status.textContent = shipmentStatusLabel(shipment.status);
  header.append(titleWrap, status);

  const summary = document.createElement("div");
  summary.className = "product-meta-grid";
  summary.append(
    createMetric("รายการ", shipment.itemCount || 0),
    createMetric("สถานะ", shipmentStatusLabel(shipment.status)),
  );

  const lifecycle = document.createElement("p");
  lifecycle.className = "placeholder-text";
  lifecycle.textContent = [
    shipment.confirmedAt ? `ยืนยัน ${formatDateTime(shipment.confirmedAt)}` : "",
    shipment.cancelledAt ? `ยกเลิก ${formatDateTime(shipment.cancelledAt)}` : "",
  ].filter(Boolean).join(" · ") || "ยังไม่ตัด Stock";

  button.append(header, summary, lifecycle);
  article.append(button);
  return article;
}

async function openShipmentDetail(shipment) {
  shipmentState.listScrollTop = getProductScrollTop();
  shipmentState.detail = {
    shipmentId: shipment.shipmentId,
    reference: shipment.reference,
    status: shipment.status,
    itemCount: shipment.itemCount,
    createdAt: shipment.createdAt,
    confirmedAt: shipment.confirmedAt,
    cancelledAt: shipment.cancelledAt,
    items: [],
  };
  shipmentState.detailLoading = true;
  shipmentState.detailError = "";
  shipmentState.actionError = "";
  shipmentState.dispatchReview = false;
  shipmentState.dispatchPreview = [];
  shipmentState.returnFlow = createEmptyShipmentReturnState();
  shipmentState.detailTransition = "enter";
  const requestId = shipmentState.detailRequestId + 1;
  shipmentState.detailRequestId = requestId;
  rerenderShipmentView();

  try {
    const response = await callAuthApi("getShipmentDetail", {
      sessionToken: requireSessionToken(),
      shipmentId: shipment.shipmentId,
    });
    const data = requireSuccess(response);
    if (requestId !== shipmentState.detailRequestId) {
      return;
    }
    shipmentState.detail = data;
  } catch (error) {
    if (handleProductAuthFailure(error)) {
      return;
    }
    shipmentState.detailError = toShipmentErrorMessage(error);
  } finally {
    if (requestId === shipmentState.detailRequestId) {
      shipmentState.detailLoading = false;
      rerenderShipmentView();
    }
  }
}

function renderShipmentDetailView() {
  const view = document.createElement("section");
  view.className = "product-detail-view shipment-detail-view";
  if (shipmentState.detailTransition === "exit") {
    view.classList.add("is-exiting");
  }

  const shipment = shipmentState.detail;
  const card = document.createElement("section");
  card.className = "card product-detail-card";

  const header = document.createElement("div");
  header.className = "product-detail-header";
  const titleWrap = document.createElement("div");
  const title = document.createElement("h2");
  title.textContent = shipment.reference || "Shipment ไม่มีเลขอ้างอิง";
  const meta = document.createElement("p");
  meta.className = "placeholder-text";
  meta.textContent = shipmentStatusLabel(shipment.status);
  titleWrap.append(title, meta);

  const close = document.createElement("button");
  close.className = "detail-close-button";
  close.type = "button";
  close.textContent = "กลับ";
  close.disabled = shipmentState.detailTransition === "exit" ||
    shipmentState.detailLoading ||
    !!shipmentState.actionSubmitting;
  close.addEventListener("click", closeShipmentDetail);
  header.append(titleWrap, close);
  card.append(header);

  if (shipmentState.detailLoading) {
    const loading = document.createElement("p");
    loading.className = "product-status";
    loading.textContent = "กำลังโหลดรายละเอียด Shipment...";
    card.append(loading);
  }

  if (shipmentState.detailError) {
    const error = document.createElement("p");
    error.className = "product-status product-error";
    error.textContent = shipmentState.detailError;
    card.append(error);
  }

  const summary = document.createElement("div");
  summary.className = "review-summary shipment-summary";
  summary.append(
    createReviewLine("อ้างอิง", shipment.reference || "-"),
    createReviewLine("หมายเหตุ", shipment.note || "-"),
    createReviewLine("สถานะ", shipmentStatusLabel(shipment.status)),
    createReviewLine("สร้างเมื่อ", formatDateTime(shipment.createdAt) || "-"),
    createReviewLine("ยืนยันเมื่อ", formatDateTime(shipment.confirmedAt) || "-"),
    createReviewLine("ยกเลิกเมื่อ", formatDateTime(shipment.cancelledAt) || "-"),
  );
  card.append(summary);

  const itemTitle = document.createElement("h3");
  itemTitle.className = "stock-history-title";
  itemTitle.textContent = "รายการสินค้า";
  card.append(itemTitle, renderShipmentItemList(shipment.items || []));

  if (shipmentState.actionError) {
    const error = document.createElement("p");
    error.className = "product-status product-error";
    error.textContent = shipmentState.actionError;
    card.append(error);
  }

  if (canUseShipmentMutationUi()) {
    card.append(renderShipmentActionPanel(shipment));
  }

  view.append(card);
  return view;
}

function renderShipmentItemList(items) {
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "product-status";
    empty.textContent = "ยังไม่มีรายการสินค้า";
    return empty;
  }

  const list = document.createElement("div");
  list.className = "sku-list detail-sku-list";
  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "sku-summary";
    const top = document.createElement("div");
    top.className = "sku-summary-top";
    const code = document.createElement("strong");
    code.className = "sku-code";
    code.textContent = item.skuCode || "-";
    const qty = document.createElement("span");
    qty.textContent = `ส่งออก ${formatNumber(item.dispatchedQty ?? item.quantity)}`;
    top.append(code, qty);

    const productName = document.createElement("p");
    productName.className = "placeholder-text";
    productName.textContent = item.productName || "-";
    const variant = document.createElement("p");
    variant.className = "placeholder-text";
    variant.textContent = formatVariantText(item) || "-";
    const returnSummary = document.createElement("p");
    returnSummary.className = "placeholder-text";
    returnSummary.textContent = `คืนแล้ว ${formatNumber(item.returnedQty || 0)} · คืนได้ ${formatNumber(item.returnableQty || 0)}`;
    card.append(top, productName, variant, returnSummary);
    list.append(card);
  });
  return list;
}

function renderShipmentActionPanel(shipment) {
  const section = document.createElement("section");
  section.className = "stock-mutation-section shipment-action-section";

  if (shipment.status === "CANCELLED") {
    return section;
  }

  const actions = document.createElement("div");
  actions.className = "stock-mutation-actions";

  if (shipment.status === "DRAFT") {
    const note = document.createElement("p");
    note.className = "placeholder-text";
    note.textContent = "ยืนยัน Shipment แล้ว Stock จะยังไม่ถูกตัด";
    section.append(note);
    actions.append(createShipmentActionButton("ยืนยัน Shipment", "confirmShipment", "ยืนยันแล้ว แต่ยังไม่ตัด Stock"));
  }

  if (shipment.status === "CONFIRMED" && canDispatchShipmentUi()) {
    section.append(renderShipmentDispatchBlock(shipment));
  }

  if (shipment.status === "DISPATCHED" && canUseShipmentReturnUi()) {
    section.append(renderShipmentReturnBlock(shipment));
  }

  if (shipment.status === "DRAFT" || shipment.status === "CONFIRMED") {
    actions.append(createShipmentActionButton("ยกเลิก Shipment", "cancelShipment", "ยกเลิก Shipment นี้ โดยไม่มีผลกับ Stock"));
  }

  section.append(actions);
  return section;
}

function renderShipmentDispatchBlock(shipment) {
  if (shipmentState.dispatchReview) {
    return renderShipmentDispatchReview(shipment);
  }

  const block = document.createElement("section");
  block.className = "stock-mutation-form shipment-dispatch-block";

  const title = document.createElement("h3");
  title.textContent = "Dispatch Shipment";

  const warning = document.createElement("p");
  warning.className = "shipment-dispatch-warning";
  warning.textContent = "การ Dispatch จะตัด Stock จริง และไม่สามารถ Dispatch ซ้ำได้";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "danger-action-button";
  button.textContent = shipmentState.actionSubmitting === "dispatchPreview"
    ? "กำลังเตรียมข้อมูล..."
    : "Dispatch Shipment";
  button.disabled = !!shipmentState.actionSubmitting || shipmentState.detailTransition === "exit";
  button.addEventListener("click", () => openShipmentDispatchReview(shipment));

  block.append(title, warning, button);
  return block;
}

function renderShipmentDispatchReview(shipment) {
  const review = document.createElement("section");
  review.className = "stock-mutation-review shipment-dispatch-review";

  const title = document.createElement("h3");
  title.textContent = "ตรวจสอบก่อน Dispatch";

  const warning = document.createElement("p");
  warning.className = "shipment-dispatch-warning";
  warning.textContent = "การ Dispatch จะตัด Stock จริง และไม่สามารถ Dispatch ซ้ำได้";

  const list = document.createElement("div");
  list.className = "sku-list detail-sku-list";
  const previews = shipmentState.dispatchPreview.length
    ? shipmentState.dispatchPreview
    : (shipment.items || []).map((item) => shipmentDispatchPreviewItem(item, null));

  previews.forEach((item) => {
    const card = document.createElement("article");
    card.className = "sku-summary shipment-dispatch-preview-card";
    const top = document.createElement("div");
    top.className = "sku-summary-top";
    const code = document.createElement("strong");
    code.className = "sku-code";
    code.textContent = item.skuCode || "-";
    const quantity = document.createElement("span");
    quantity.textContent = `จำนวน ${formatNumber(item.quantity)}`;
    top.append(code, quantity);

    const stock = document.createElement("p");
    stock.className = "placeholder-text";
    stock.textContent = item.currentOnHand === null
      ? "Stock ปัจจุบัน: ไม่มีข้อมูล"
      : `Stock ปัจจุบัน ${formatNumber(item.currentOnHand)} → หลัง Dispatch ${formatNumber(item.expectedAfter)}`;

    if (item.insufficient) {
      const insufficient = document.createElement("p");
      insufficient.className = "product-status product-error";
      insufficient.textContent = "Stock อาจไม่พอ Backend จะเป็นผู้ตัดสินอีกครั้ง";
      card.append(top, stock, insufficient);
    } else {
      card.append(top, stock);
    }
    list.append(card);
  });

  const actions = document.createElement("div");
  actions.className = "create-form-actions";
  const back = document.createElement("button");
  back.type = "button";
  back.className = "secondary-action-button";
  back.textContent = "กลับ";
  back.disabled = !!shipmentState.actionSubmitting;
  back.addEventListener("click", () => {
    shipmentState.dispatchReview = false;
    shipmentState.dispatchPreview = [];
    shipmentState.actionError = "";
    rerenderShipmentView();
  });

  const submit = document.createElement("button");
  submit.type = "button";
  submit.className = "danger-action-button";
  submit.textContent = shipmentState.actionSubmitting === "dispatchShipment"
    ? "กำลัง Dispatch..."
    : "ยืนยัน Dispatch";
  submit.disabled = !!shipmentState.actionSubmitting || shipmentState.detailTransition === "exit";
  submit.addEventListener("click", () => submitShipmentAction("dispatchShipment"));

  actions.append(back, submit);
  review.append(title, warning, list, actions);
  return review;
}

function createShipmentActionButton(label, action, message) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = action === "confirmShipment" ? "primary-action-button" : "secondary-action-button";
  button.textContent = shipmentState.actionSubmitting === action ? "กำลังบันทึก..." : label;
  button.disabled = !!shipmentState.actionSubmitting || shipmentState.detailTransition === "exit";
  button.addEventListener("click", () => {
    const accepted = window.confirm(message);
    if (!accepted) {
      return;
    }
    submitShipmentAction(action);
  });
  return button;
}

async function submitShipmentAction(action) {
  const shipment = shipmentState.detail;
  if (!shipment || shipmentState.actionSubmitting) {
    return;
  }

  const affectedItems = Array.isArray(shipment.items) ? shipment.items : [];
  shipmentState.actionSubmitting = action;
  shipmentState.actionError = "";
  rerenderShipmentView();

  try {
    const response = await callAuthApi(action, {
      sessionToken: requireSessionToken(),
      shipmentId: shipment.shipmentId,
    });
    requireSuccess(response);
    await refreshShipmentAfterMutation(shipment.shipmentId);
    if (action === "dispatchShipment") {
      await refreshStockAfterShipmentDispatch(affectedItems);
      shipmentState.dispatchReview = false;
      shipmentState.dispatchPreview = [];
    }
    shipmentCreateState.message = shipmentActionSuccessMessage(action);
    shipmentCreateState.messageType = "info";
  } catch (error) {
    if (handleProductAuthFailure(error)) {
      return;
    }
    shipmentState.actionError = toShipmentActionErrorMessage(error, action);
  } finally {
    shipmentState.actionSubmitting = "";
    rerenderShipmentView();
  }
}

async function openShipmentDispatchReview(shipment) {
  if (!shipment || shipment.status !== "CONFIRMED" || shipmentState.actionSubmitting) {
    return;
  }

  shipmentState.actionSubmitting = "dispatchPreview";
  shipmentState.actionError = "";
  rerenderShipmentView();

  try {
    shipmentState.dispatchPreview = await buildShipmentDispatchPreview(shipment.items || []);
    shipmentState.dispatchReview = true;
  } catch (error) {
    if (handleProductAuthFailure(error)) {
      return;
    }
    shipmentState.actionError = toShipmentErrorMessage(error);
  } finally {
    shipmentState.actionSubmitting = "";
    rerenderShipmentView();
  }
}

async function buildShipmentDispatchPreview(items) {
  const snapshot = await fetchStockRefreshSnapshot(
    requireSessionToken(),
    "",
    Math.min(50, Math.max(stockState.pageSize, stockState.items.length || stockState.pageSize)),
  );
  const stockItems = snapshot.items;

  return items.map((item) => shipmentDispatchPreviewItem(
    item,
    findStockItemBySkuCode(stockItems, item.skuCode),
  ));
}

function shipmentDispatchPreviewItem(item, stockItem) {
  const quantity = Number(item.quantity || 0);
  const currentOnHand = stockItem ? Number(stockItem.onHandQty) : null;
  const expectedAfter = currentOnHand === null ? null : currentOnHand - quantity;
  return {
    skuCode: item.skuCode,
    quantity: quantity,
    currentOnHand: currentOnHand,
    expectedAfter: expectedAfter,
    insufficient: expectedAfter !== null && expectedAfter < 0,
  };
}

function renderShipmentReturnBlock(shipment) {
  const flow = shipmentState.returnFlow;
  if (hasShipmentReturnIntegrityIssue(shipment)) {
    const message = document.createElement("p");
    message.className = "product-status product-error";
    message.textContent = "ข้อมูลการคืนสินค้าไม่สอดคล้อง กรุณาตรวจสอบ Backend";
    return message;
  }

  const returnableItems = getShipmentReturnableItems(shipment);
  if (returnableItems.length === 0) {
    const done = document.createElement("p");
    done.className = "stock-mutation-message";
    done.dataset.type = "info";
    done.textContent = "คืนครบแล้ว";
    return done;
  }

  if (flow.active && flow.step === "review") {
    return renderShipmentReturnReview(shipment);
  }

  if (flow.active) {
    return renderShipmentReturnForm(shipment, returnableItems);
  }

  const entry = document.createElement("div");
  entry.className = "stock-mutation-entry shipment-return-entry";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "primary-action-button";
  button.textContent = "คืนสินค้า";
  button.disabled = !!shipmentState.actionSubmitting || shipmentState.detailTransition === "exit";
  button.addEventListener("click", () => openShipmentReturnForm(shipment));
  entry.append(button);

  if (flow.message) {
    const wrapper = document.createElement("section");
    wrapper.className = "stock-mutation-section";
    const message = document.createElement("p");
    message.className = "stock-mutation-message";
    message.dataset.type = flow.messageType || "info";
    message.textContent = flow.message;
    wrapper.append(message, entry);
    return wrapper;
  }

  return entry;
}

function renderShipmentReturnForm(shipment, returnableItems) {
  const flow = shipmentState.returnFlow;
  const form = document.createElement("section");
  form.className = "stock-mutation-form shipment-return-form";

  const title = document.createElement("h3");
  title.textContent = "คืนสินค้า";

  const note = document.createElement("p");
  note.className = "placeholder-text";
  note.textContent = "กรอกจำนวนที่คืนในรายการที่ต้องการ ระบบจะเพิ่ม Stock หลังยืนยัน";

  const errors = renderShipmentReturnErrors(flow.errors);
  const list = document.createElement("div");
  list.className = "sku-list detail-sku-list";
  returnableItems.forEach((item) => {
    list.append(renderShipmentReturnInputItem(item));
  });

  const reason = createTextAreaField("shipment_return_reason", "เหตุผล", flow.reason, (value) => {
    shipmentState.returnFlow.reason = value;
  });

  const actions = document.createElement("div");
  actions.className = "create-form-actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "secondary-action-button";
  cancel.textContent = "ยกเลิก";
  cancel.disabled = !!shipmentState.actionSubmitting;
  cancel.addEventListener("click", () => {
    shipmentState.returnFlow = createEmptyShipmentReturnState();
    rerenderShipmentView();
  });

  const review = document.createElement("button");
  review.type = "button";
  review.className = "primary-action-button";
  review.textContent = shipmentState.actionSubmitting === "returnPreview"
    ? "กำลังเตรียมข้อมูล..."
    : "ตรวจสอบก่อนคืน";
  review.disabled = !!shipmentState.actionSubmitting || shipmentState.detailTransition === "exit";
  review.addEventListener("click", () => openShipmentReturnReview(shipment));

  actions.append(cancel, review);
  form.append(title, note);
  if (errors) {
    form.append(errors);
  }
  form.append(list, reason, actions);
  return form;
}

function renderShipmentReturnInputItem(item) {
  const normalizedSkuCode = normalizeSkuCodeForUi(item.skuCode);
  const card = document.createElement("article");
  card.className = "sku-summary shipment-return-item-card";

  const top = document.createElement("div");
  top.className = "sku-summary-top";
  const code = document.createElement("strong");
  code.className = "sku-code";
  code.textContent = item.skuCode || "-";
  const qty = document.createElement("span");
  qty.textContent = `คืนได้ ${formatNumber(item.returnableQty || 0)}`;
  top.append(code, qty);

  const productName = document.createElement("p");
  productName.className = "placeholder-text";
  productName.textContent = item.productName || "-";
  const variant = document.createElement("p");
  variant.className = "placeholder-text";
  variant.textContent = formatVariantText(item) || "-";
  const summary = document.createElement("p");
  summary.className = "placeholder-text";
  summary.textContent = `ส่งออก ${formatNumber(item.dispatchedQty || 0)} · คืนแล้ว ${formatNumber(item.returnedQty || 0)}`;

  const field = document.createElement("label");
  field.className = "stock-mutation-field";
  const label = document.createElement("span");
  label.textContent = "จำนวนคืน";
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.max = String(item.returnableQty || 0);
  input.step = "1";
  input.value = shipmentState.returnFlow.quantities[normalizedSkuCode] || "";
  input.addEventListener("input", (event) => {
    shipmentState.returnFlow.quantities[normalizedSkuCode] = event.target.value;
  });
  field.append(label, input);

  card.append(top, productName, variant, summary, field);
  return card;
}

function renderShipmentReturnReview(shipment) {
  const flow = shipmentState.returnFlow;
  const review = document.createElement("section");
  review.className = "stock-mutation-review shipment-return-review";

  const title = document.createElement("h3");
  title.textContent = "ตรวจสอบก่อนคืนสินค้า";

  const warning = document.createElement("p");
  warning.className = "shipment-dispatch-warning shipment-return-warning";
  warning.textContent = "การคืนสินค้าจะเพิ่ม Stock จริง";

  const list = document.createElement("div");
  list.className = "sku-list detail-sku-list";
  flow.preview.forEach((item) => {
    const card = document.createElement("article");
    card.className = "sku-summary shipment-return-preview-card";
    const top = document.createElement("div");
    top.className = "sku-summary-top";
    const code = document.createElement("strong");
    code.className = "sku-code";
    code.textContent = item.skuCode || "-";
    const quantity = document.createElement("span");
    quantity.textContent = `คืน ${formatNumber(item.quantity)}`;
    top.append(code, quantity);

    const summary = document.createElement("div");
    summary.className = "review-summary stock-mutation-summary";
    summary.append(
      createReviewLine("คืนแล้ว", formatNumber(item.returnedQty)),
      createReviewLine("เหลือหลังคืน", formatNumber(item.remainingAfter)),
    );
    if (item.currentOnHand !== null) {
      summary.append(
        createReviewLine("Stock ปัจจุบัน", formatNumber(item.currentOnHand)),
        createReviewLine("Stock หลังคืน", formatNumber(item.expectedAfter)),
      );
    }
    card.append(top, summary);
    list.append(card);
  });

  const reason = document.createElement("div");
  reason.className = "review-summary stock-mutation-summary";
  reason.append(createReviewLine("เหตุผล", flow.reason));

  const actions = document.createElement("div");
  actions.className = "create-form-actions";
  const back = document.createElement("button");
  back.type = "button";
  back.className = "secondary-action-button";
  back.textContent = "กลับ";
  back.disabled = !!shipmentState.actionSubmitting;
  back.addEventListener("click", () => {
    shipmentState.returnFlow.step = "form";
    shipmentState.returnFlow.errors = [];
    rerenderShipmentView();
  });

  const submit = document.createElement("button");
  submit.type = "button";
  submit.className = "primary-action-button";
  submit.textContent = shipmentState.actionSubmitting === "createShipmentReturn"
    ? "กำลังบันทึก..."
    : "ยืนยันคืนสินค้า";
  submit.disabled = !!shipmentState.actionSubmitting || shipmentState.detailTransition === "exit";
  submit.addEventListener("click", submitShipmentReturn);

  actions.append(back, submit);
  review.append(title, warning, list, reason, actions);
  return review;
}

function renderShipmentReturnErrors(errors) {
  if (!errors || errors.length === 0) {
    return null;
  }

  const list = document.createElement("ul");
  list.className = "stock-mutation-errors";
  errors.forEach((error) => {
    const item = document.createElement("li");
    item.textContent = error;
    list.append(item);
  });
  return list;
}

function openShipmentReturnForm(shipment) {
  if (!shipment || shipment.status !== "DISPATCHED" || shipmentState.actionSubmitting) {
    return;
  }

  shipmentState.dispatchReview = false;
  shipmentState.dispatchPreview = [];
  shipmentState.returnFlow = createEmptyShipmentReturnState();
  shipmentState.returnFlow.active = true;
  getShipmentReturnableItems(shipment).forEach((item) => {
    shipmentState.returnFlow.quantities[normalizeSkuCodeForUi(item.skuCode)] = "";
  });
  rerenderShipmentView();
}

async function openShipmentReturnReview(shipment) {
  if (!shipment || shipmentState.actionSubmitting) {
    return;
  }

  shipmentState.returnFlow.errors = validateShipmentReturnForm(shipment);
  if (shipmentState.returnFlow.errors.length > 0) {
    rerenderShipmentView();
    return;
  }

  shipmentState.actionSubmitting = "returnPreview";
  rerenderShipmentView();

  try {
    shipmentState.returnFlow.preview = await buildShipmentReturnPreview(
      selectedShipmentReturnItems(shipment),
    );
    shipmentState.returnFlow.step = "review";
  } catch (error) {
    if (handleProductAuthFailure(error)) {
      return;
    }
    shipmentState.returnFlow.errors = ["โหลดข้อมูล Stock สำหรับตรวจสอบไม่สำเร็จ"];
  } finally {
    shipmentState.actionSubmitting = "";
    rerenderShipmentView();
  }
}

async function buildShipmentReturnPreview(items) {
  const snapshot = await fetchStockRefreshSnapshot(
    requireSessionToken(),
    "",
    Math.min(50, Math.max(stockState.pageSize, stockState.items.length || stockState.pageSize)),
  );
  const stockItems = snapshot.items;

  return items.map((item) => shipmentReturnPreviewItem(
    item,
    findStockItemBySkuCode(stockItems, item.skuCode),
  ));
}

function shipmentReturnPreviewItem(item, stockItem) {
  const quantity = Number(item.returnQuantity || 0);
  const currentOnHand = stockItem ? Number(stockItem.onHandQty) : null;
  return {
    skuCode: item.skuCode,
    quantity: quantity,
    returnedQty: Number(item.returnedQty || 0),
    remainingAfter: Math.max(Number(item.returnableQty || 0) - quantity, 0),
    currentOnHand: currentOnHand,
    expectedAfter: currentOnHand === null ? null : currentOnHand + quantity,
  };
}

async function submitShipmentReturn() {
  const shipment = shipmentState.detail;
  if (!shipment || shipmentState.actionSubmitting) {
    return;
  }

  shipmentState.returnFlow.errors = validateShipmentReturnForm(shipment);
  if (shipmentState.returnFlow.errors.length > 0) {
    shipmentState.returnFlow.step = "form";
    rerenderShipmentView();
    return;
  }

  const selectedItems = selectedShipmentReturnItems(shipment);
  shipmentState.actionSubmitting = "createShipmentReturn";
  shipmentState.actionError = "";
  rerenderShipmentView();

  try {
    const response = await callAuthApi("createShipmentReturn", {
      sessionToken: requireSessionToken(),
      shipmentId: shipment.shipmentId,
      reason: String(shipmentState.returnFlow.reason || "").trim(),
      items: selectedItems.map((item) => ({
        skuCode: normalizeSkuCodeForUi(item.skuCode),
        quantity: Number(item.returnQuantity),
      })),
    });
    requireSuccess(response);
    await refreshShipmentAfterMutation(shipment.shipmentId);
    await refreshStockAfterShipmentDispatch(selectedItems);
    shipmentState.returnFlow = createEmptyShipmentReturnState();
    shipmentState.returnFlow.message = "บันทึกการคืนสินค้าสำเร็จ";
    shipmentState.returnFlow.messageType = "info";
  } catch (error) {
    if (handleProductAuthFailure(error)) {
      return;
    }
    shipmentState.returnFlow.errors = [toShipmentReturnErrorMessage(error)];
    shipmentState.returnFlow.step = "form";
    shipmentState.returnFlow.active = true;
  } finally {
    shipmentState.actionSubmitting = "";
    rerenderShipmentView();
  }
}

function validateShipmentReturnForm(shipment) {
  const errors = [];
  if (!shipment || shipment.status !== "DISPATCHED") {
    errors.push("Shipment นี้ยังไม่พร้อมสำหรับการคืนสินค้า");
    return errors;
  }

  const returnableItems = getShipmentReturnableItems(shipment);
  if (returnableItems.length === 0) {
    errors.push("คืนครบแล้ว");
    return errors;
  }

  if (!String(shipmentState.returnFlow.reason || "").trim()) {
    errors.push("กรุณากรอกเหตุผล");
  }

  const selectedItems = selectedShipmentReturnItems(shipment);
  if (selectedItems.length === 0) {
    errors.push("กรุณากรอกจำนวนคืนอย่างน้อย 1 รายการ");
  }

  returnableItems.forEach((item) => {
    const value = shipmentState.returnFlow.quantities[normalizeSkuCodeForUi(item.skuCode)];
    if (value === "" || value === null || typeof value === "undefined") {
      return;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed) || Math.floor(parsed) !== parsed || parsed < 0) {
      errors.push(`${item.skuCode}: จำนวนคืนไม่ถูกต้อง`);
      return;
    }

    if (parsed > Number(item.returnableQty || 0)) {
      errors.push(`${item.skuCode}: จำนวนคืนเกินจำนวนที่ส่งออก`);
    }
  });

  return errors;
}

function selectedShipmentReturnItems(shipment) {
  return getShipmentReturnableItems(shipment).map((item) => {
    const returnQuantity = Number(
      shipmentState.returnFlow.quantities[normalizeSkuCodeForUi(item.skuCode)] || 0,
    );
    return {
      skuCode: item.skuCode,
      productName: item.productName,
      model: item.model,
      color: item.color,
      size: item.size,
      dispatchedQty: Number(item.dispatchedQty || item.quantity || 0),
      returnedQty: Number(item.returnedQty || 0),
      returnableQty: Number(item.returnableQty || 0),
      returnQuantity: returnQuantity,
    };
  }).filter((item) => item.returnQuantity > 0);
}

function getShipmentReturnableItems(shipment) {
  return (shipment && Array.isArray(shipment.items) ? shipment.items : [])
    .filter((item) => Number(item.returnableQty || 0) > 0);
}

function hasShipmentReturnIntegrityIssue(shipment) {
  return (shipment && Array.isArray(shipment.items) ? shipment.items : [])
    .some((item) => Number(item.returnedQty || 0) > Number((item.dispatchedQty ?? item.quantity) || 0));
}

function renderCreateShipmentFlow() {
  const wrapper = document.createElement("section");
  wrapper.className = "create-product-flow shipment-create-flow";

  if (!canUseShipmentMutationUi()) {
    const denied = document.createElement("section");
    denied.className = "card product-error";
    denied.textContent = "บัญชีนี้ไม่มีสิทธิ์จัดการ Shipment";
    wrapper.append(denied);
    return wrapper;
  }

  if (shipmentCreateState.errors.length > 0) {
    const errorBox = document.createElement("section");
    errorBox.className = "card create-error-list";
    const title = document.createElement("h2");
    title.textContent = "ตรวจสอบข้อมูล Shipment";
    const list = document.createElement("ul");
    shipmentCreateState.errors.forEach((error) => {
      const item = document.createElement("li");
      item.textContent = error;
      list.append(item);
    });
    errorBox.append(title, list);
    wrapper.append(errorBox);
  }

  wrapper.append(shipmentCreateState.mode === "review"
    ? renderCreateShipmentReview()
    : renderCreateShipmentForm());
  return wrapper;
}

function renderCreateShipmentForm() {
  const form = document.createElement("form");
  form.className = "card create-product-form shipment-create-form";
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    openCreateShipmentReview();
  });

  const title = document.createElement("h2");
  title.textContent = "สร้าง Shipment";
  const note = document.createElement("p");
  note.className = "placeholder-text";
  note.textContent = "เลือกสินค้าและกรอกจำนวน การสร้าง Shipment ยังไม่ตัด Stock";
  form.append(title, note);

  form.append(
    createTextField("shipment_reference", "อ้างอิง", shipmentCreateState.form.reference, false, (value) => {
      shipmentCreateState.form.reference = value;
    }),
    createTextAreaField("shipment_note", "หมายเหตุ", shipmentCreateState.form.note, (value) => {
      shipmentCreateState.form.note = value;
    }),
  );

  const itemHeader = document.createElement("div");
  itemHeader.className = "create-section-header";
  const itemTitle = document.createElement("h3");
  itemTitle.textContent = "รายการสินค้า";
  const addItem = document.createElement("button");
  addItem.type = "button";
  addItem.className = "secondary-action-button";
  addItem.textContent = "+ เลือกสินค้า";
  addItem.addEventListener("click", () => {
    openShipmentSkuPicker();
  });
  itemHeader.append(itemTitle, addItem);
  form.append(itemHeader);

  if (shipmentCreateState.picker.open) {
    form.append(renderShipmentSkuPicker());
  }

  if (shipmentCreateState.form.items.length) {
    shipmentCreateState.form.items.forEach((item, index) => {
      form.append(renderShipmentItemForm(item, index));
    });
  } else {
    const empty = document.createElement("p");
    empty.className = "placeholder-text shipment-empty-items";
    empty.textContent = "ยังไม่มีรายการสินค้า";
    form.append(empty);
  }

  const actions = document.createElement("div");
  actions.className = "create-form-actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "secondary-action-button";
  cancel.textContent = "ยกเลิก";
  cancel.addEventListener("click", resetShipmentCreateFlow);
  const review = document.createElement("button");
  review.type = "submit";
  review.className = "primary-action-button";
  review.textContent = "ตรวจสอบก่อนสร้าง";
  actions.append(cancel, review);
  form.append(actions);

  return form;
}

function renderShipmentItemForm(item, index) {
  const card = document.createElement("section");
  card.className = "sku-form-card shipment-item-form-card";

  const header = document.createElement("div");
  header.className = "sku-form-header";
  const title = document.createElement("h3");
  title.textContent = `รายการ #${index + 1}`;
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "remove-sku-button";
  remove.textContent = "ลบ";
  remove.addEventListener("click", () => {
    shipmentCreateState.form.items.splice(index, 1);
    rerenderShipmentView();
  });
  header.append(title, remove);
  card.append(header);

  const summary = document.createElement("div");
  summary.className = "shipment-item-summary";
  const sku = document.createElement("strong");
  sku.textContent = normalizeSkuCodeForUi(item.skuCode) || "-";
  const name = document.createElement("p");
  name.textContent = item.productName || "ไม่ระบุชื่อสินค้า";
  const meta = document.createElement("p");
  meta.className = "placeholder-text shipment-item-meta";
  meta.textContent = formatVariantText(item) || "ไม่ระบุรายละเอียด SKU";
  const stock = document.createElement("p");
  stock.className = "placeholder-text shipment-item-stock";
  stock.textContent = `Stock ปัจจุบัน: ${formatOptionalNumber(item.onHandQty)}`;
  summary.append(sku, name, meta, stock);
  card.append(summary);

  card.append(
    createNumberField(`shipment_quantity_${index}`, "จำนวน", item.quantity, true, "1", (value) => {
      shipmentCreateState.form.items[index].quantity = value;
    }),
  );

  return card;
}

function renderShipmentSkuPicker() {
  const picker = shipmentCreateState.picker;
  const selectedCount = Object.keys(picker.selectedItems).length;
  const card = document.createElement("section");
  card.className = "shipment-picker-card";

  const header = document.createElement("div");
  header.className = "create-section-header";
  const title = document.createElement("h3");
  title.textContent = "เลือกสินค้า";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "secondary-action-button";
  close.textContent = "ยกเลิก";
  close.addEventListener("click", closeShipmentSkuPicker);
  header.append(title, close);

  const searchLabel = document.createElement("label");
  searchLabel.className = "shipment-picker-search";
  const searchText = document.createElement("span");
  searchText.textContent = "ค้นหาสินค้า / SKU";
  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.value = picker.query;
  searchInput.placeholder = "ค้นหาชื่อสินค้า SKU รุ่น สี หรือไซซ์";
  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
    }
  });
  searchInput.addEventListener("input", (event) => {
    picker.query = event.target.value;
    scheduleShipmentSkuPickerSearch();
  });
  searchLabel.append(searchText, searchInput);

  const status = document.createElement("p");

  const list = document.createElement("div");
  list.className = "shipment-picker-list";

  const footer = document.createElement("div");
  footer.className = "shipment-picker-footer";
  const count = document.createElement("p");
  count.className = "shipment-selected-count";
  count.textContent = `เลือกแล้ว ${selectedCount} รายการ`;
  const actions = document.createElement("div");
  actions.className = "create-form-actions";
  const loadMore = document.createElement("button");
  loadMore.type = "button";
  loadMore.className = "secondary-action-button";
  loadMore.addEventListener("click", loadMoreShipmentSkuPickerItems);
  const addSelected = document.createElement("button");
  addSelected.type = "button";
  addSelected.className = "primary-action-button";
  addSelected.textContent = "เพิ่มรายการที่เลือก";
  addSelected.addEventListener("click", addSelectedShipmentSkuPickerItems);
  actions.append(loadMore, addSelected);
  footer.append(count, actions);

  card.append(header, searchLabel, status, list, footer);
  shipmentPickerDom = {
    status,
    list,
    count,
    loadMore,
    addSelected,
  };
  updateShipmentSkuPickerDom();
  return card;
}

function renderShipmentSkuPickerItem(item, existingSkuCodes) {
  const normalizedSkuCode = normalizeSkuCodeForUi(item.skuCode);
  const alreadyAdded = existingSkuCodes.has(normalizedSkuCode);
  const selected = !!shipmentCreateState.picker.selectedItems[normalizedSkuCode];
  const row = document.createElement("label");
  row.className = alreadyAdded ? "shipment-picker-row is-disabled" : "shipment-picker-row";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = selected || alreadyAdded;
  checkbox.disabled = alreadyAdded;
  checkbox.addEventListener("change", (event) => {
    toggleShipmentSkuPickerSelection(item, event.target.checked);
  });

  const body = document.createElement("div");
  body.className = "shipment-picker-row-body";
  const codeLine = document.createElement("div");
  codeLine.className = "shipment-picker-code-line";
  const code = document.createElement("strong");
  code.textContent = normalizedSkuCode || "-";
  const flag = document.createElement("span");
  flag.className = "status-pill";
  flag.textContent = alreadyAdded ? "เพิ่มแล้ว" : item.status || "เลือกได้";
  codeLine.append(code, flag);

  const name = document.createElement("p");
  name.className = "shipment-picker-name";
  name.textContent = item.productName || "ไม่ระบุชื่อสินค้า";
  const meta = document.createElement("p");
  meta.className = "placeholder-text shipment-picker-meta";
  meta.textContent = formatVariantText(item) || "ไม่ระบุรายละเอียด SKU";
  const stock = document.createElement("p");
  stock.className = "placeholder-text shipment-picker-stock";
  stock.textContent = `Stock ปัจจุบัน: ${formatOptionalNumber(item.onHandQty)}`;
  body.append(codeLine, name, meta, stock);

  row.append(checkbox, body);
  return row;
}

function updateShipmentSkuPickerDom() {
  const picker = shipmentCreateState.picker;
  if (!shipmentPickerDom || activeViewName !== "orders" || !picker.open) {
    return;
  }

  const selectedCount = Object.keys(picker.selectedItems).length;
  shipmentPickerDom.status.className = picker.error ? "product-status product-error" : "product-status";
  if (picker.error) {
    shipmentPickerDom.status.textContent = picker.error;
  } else if (picker.loading && picker.items.length === 0) {
    shipmentPickerDom.status.textContent = "กำลังโหลดสินค้า...";
  } else if (!picker.loading && picker.items.length === 0) {
    shipmentPickerDom.status.textContent = picker.query.trim() ? "ไม่พบสินค้าที่ค้นหา" : "ยังไม่มีสินค้าให้เลือก";
  } else {
    shipmentPickerDom.status.textContent = picker.query.trim() ? "ผลการค้นหา" : "รายการสินค้า";
  }

  const existingSkuCodes = getShipmentCreateSkuCodeSet();
  clearElement(shipmentPickerDom.list);
  picker.items.forEach((item) => {
    shipmentPickerDom.list.append(renderShipmentSkuPickerItem(item, existingSkuCodes));
  });

  shipmentPickerDom.count.textContent = `เลือกแล้ว ${selectedCount} รายการ`;
  shipmentPickerDom.loadMore.textContent = picker.loading ? "กำลังโหลด..." : "โหลดเพิ่มเติม";
  shipmentPickerDom.loadMore.hidden = !picker.hasMore;
  shipmentPickerDom.loadMore.disabled = picker.loading;
  shipmentPickerDom.addSelected.disabled = selectedCount === 0;
}

function openShipmentSkuPicker() {
  shipmentCreateState.picker = createEmptyShipmentPickerState();
  shipmentCreateState.picker.open = true;
  rerenderShipmentView();
  loadShipmentSkuPickerItems({ reset: true });
}

function closeShipmentSkuPicker() {
  if (shipmentPickerSearchTimer) {
    window.clearTimeout(shipmentPickerSearchTimer);
    shipmentPickerSearchTimer = null;
  }
  shipmentPickerDom = null;
  shipmentCreateState.picker = createEmptyShipmentPickerState();
  rerenderShipmentView();
}

function scheduleShipmentSkuPickerSearch() {
  if (shipmentPickerSearchTimer) {
    window.clearTimeout(shipmentPickerSearchTimer);
  }
  shipmentPickerSearchTimer = window.setTimeout(() => {
    shipmentPickerSearchTimer = null;
    shipmentCreateState.picker.page = 1;
    loadShipmentSkuPickerItems({ reset: true });
  }, 250);
}

async function loadShipmentSkuPickerItems({ reset }) {
  const picker = shipmentCreateState.picker;
  if (!picker.open) {
    return;
  }

  const requestId = picker.requestId + 1;
  picker.requestId = requestId;
  if (reset) {
    picker.page = 1;
    picker.hasMore = false;
    picker.items = [];
  }
  picker.loading = true;
  picker.error = "";
  updateShipmentSkuPickerDom();

  try {
    const action = picker.query.trim() ? "searchStock" : "listStock";
    const payload = {
      sessionToken: requireSessionToken(),
      page: picker.page,
      pageSize: picker.pageSize,
    };

    if (action === "searchStock") {
      payload.query = picker.query.trim();
    }

    const response = await callAuthApi(action, payload);
    const data = requireSuccess(response);

    if (requestId !== shipmentCreateState.picker.requestId || !shipmentCreateState.picker.open) {
      return;
    }

    const nextItems = Array.isArray(data.items) ? data.items : [];
    shipmentCreateState.picker.items = reset
      ? nextItems
      : appendUniqueStockItems(shipmentCreateState.picker.items, nextItems);
    shipmentCreateState.picker.hasMore = !!data.hasMore;
  } catch (error) {
    if (handleProductAuthFailure(error)) {
      return;
    }

    if (!reset && shipmentCreateState.picker.page > 1) {
      shipmentCreateState.picker.page -= 1;
    }
    shipmentCreateState.picker.error = toThaiErrorMessage(error);
  } finally {
    if (requestId === shipmentCreateState.picker.requestId && shipmentCreateState.picker.open) {
      shipmentCreateState.picker.loading = false;
      updateShipmentSkuPickerDom();
    }
  }
}

function loadMoreShipmentSkuPickerItems() {
  const picker = shipmentCreateState.picker;
  if (picker.loading || !picker.hasMore) {
    return;
  }
  picker.page += 1;
  loadShipmentSkuPickerItems({ reset: false });
}

function toggleShipmentSkuPickerSelection(item, shouldSelect) {
  const normalizedSkuCode = normalizeSkuCodeForUi(item.skuCode);
  if (!normalizedSkuCode || getShipmentCreateSkuCodeSet().has(normalizedSkuCode)) {
    return;
  }

  if (shouldSelect) {
    shipmentCreateState.picker.selectedItems[normalizedSkuCode] = createShipmentItemFormFromStockItem(item);
  } else {
    delete shipmentCreateState.picker.selectedItems[normalizedSkuCode];
  }
  updateShipmentSkuPickerDom();
}

function addSelectedShipmentSkuPickerItems() {
  const existingSkuCodes = getShipmentCreateSkuCodeSet();
  Object.keys(shipmentCreateState.picker.selectedItems).forEach((skuCode) => {
    if (existingSkuCodes.has(skuCode)) {
      return;
    }
    existingSkuCodes.add(skuCode);
    shipmentCreateState.form.items.push(shipmentCreateState.picker.selectedItems[skuCode]);
  });
  closeShipmentSkuPicker();
}

function renderCreateShipmentReview() {
  const review = document.createElement("section");
  review.className = "card create-review-card shipment-review-card";

  const title = document.createElement("h2");
  title.textContent = "ตรวจสอบ Shipment";
  const note = document.createElement("p");
  note.className = "placeholder-text";
  note.textContent = "การสร้าง Shipment ยังไม่ตัด Stock";
  review.append(title, note);

  const summary = document.createElement("div");
  summary.className = "review-summary";
  summary.append(
    createReviewLine("อ้างอิง", shipmentCreateState.form.reference || "-"),
    createReviewLine("หมายเหตุ", shipmentCreateState.form.note || "-"),
    createReviewLine("จำนวนรายการ", shipmentCreateState.form.items.length),
  );
  review.append(summary);

  const itemList = document.createElement("div");
  itemList.className = "sku-list";
  shipmentCreateState.form.items.forEach((item, index) => {
    const card = document.createElement("article");
    card.className = "sku-summary";
    card.append(
      createReviewLine(`รายการ #${index + 1}`, normalizeSkuCodeForUi(item.skuCode)),
      createReviewLine("จำนวน", formatNumber(Number(item.quantity))),
    );
    itemList.append(card);
  });
  review.append(itemList);

  const actions = document.createElement("div");
  actions.className = "create-form-actions";
  const back = document.createElement("button");
  back.type = "button";
  back.className = "secondary-action-button";
  back.textContent = "กลับไปแก้ไข";
  back.disabled = shipmentCreateState.submitting;
  back.addEventListener("click", () => {
    shipmentCreateState.mode = "form";
    shipmentCreateState.errors = [];
    rerenderShipmentView();
  });
  const submit = document.createElement("button");
  submit.type = "button";
  submit.className = "primary-action-button";
  submit.textContent = shipmentCreateState.submitting ? "กำลังสร้าง..." : "สร้าง Shipment";
  submit.disabled = shipmentCreateState.submitting;
  submit.addEventListener("click", submitCreateShipment);
  actions.append(back, submit);
  review.append(actions);

  return review;
}

function openCreateShipmentReview() {
  shipmentCreateState.errors = validateCreateShipmentForm();
  shipmentCreateState.message = "";
  if (shipmentCreateState.errors.length > 0) {
    rerenderShipmentView();
    return;
  }

  shipmentCreateState.form.reference = shipmentCreateState.form.reference.trim();
  shipmentCreateState.form.note = shipmentCreateState.form.note.trim();
  shipmentCreateState.mode = "review";
  rerenderShipmentView();
}

async function submitCreateShipment() {
  if (shipmentCreateState.submitting) {
    return;
  }

  shipmentCreateState.errors = validateCreateShipmentForm();
  if (shipmentCreateState.errors.length > 0) {
    shipmentCreateState.mode = "form";
    rerenderShipmentView();
    return;
  }

  shipmentCreateState.submitting = true;
  rerenderShipmentView();

  try {
    const response = await callAuthApi("createShipment", {
      sessionToken: requireSessionToken(),
      shipment: createShipmentPayloadFromForm(),
    });
    const data = requireSuccess(response);
    resetShipmentCreateState();
    shipmentCreateState.message = "สร้าง Shipment สำเร็จ";
    shipmentCreateState.messageType = "info";
    await refreshShipmentsAfterCreate(data.shipmentId || "");
  } catch (error) {
    if (handleProductAuthFailure(error)) {
      return;
    }
    shipmentCreateState.submitting = false;
    shipmentCreateState.errors = [toShipmentCreateErrorMessage(error)];
    shipmentCreateState.mode = "form";
    rerenderShipmentView();
  }
}

function validateCreateShipmentForm() {
  const errors = [];
  const items = shipmentCreateState.form.items;
  const seen = new Set();

  if (!items.length) {
    errors.push("ต้องมีรายการสินค้าอย่างน้อย 1 รายการ");
  }

  items.forEach((item, index) => {
    const skuCode = normalizeSkuCodeForUi(item.skuCode);
    if (!skuCode) {
      errors.push(`รายการ #${index + 1}: กรุณากรอก SKU code`);
      return;
    }

    if (seen.has(skuCode)) {
      errors.push(`รายการ #${index + 1}: SKU ซ้ำใน Shipment เดียวกัน`);
    }
    seen.add(skuCode);

    if (!isPositiveIntegerInput(item.quantity)) {
      errors.push(`รายการ #${index + 1}: จำนวนต้องเป็นจำนวนเต็มมากกว่า 0`);
    }
  });

  return errors;
}

function createShipmentPayloadFromForm() {
  return {
    reference: String(shipmentCreateState.form.reference || "").trim(),
    note: String(shipmentCreateState.form.note || "").trim(),
    items: shipmentCreateState.form.items.map((item) => ({
      skuCode: normalizeSkuCodeForUi(item.skuCode),
      quantity: Number(item.quantity),
    })),
  };
}

async function refreshShipmentsAfterCreate(shipmentId) {
  await refreshShipmentListSnapshot();
  shipmentCreateState.mode = "list";
  if (shipmentId) {
    const created = findShipmentById(shipmentState.items, shipmentId) || { shipmentId };
    await openShipmentDetail(created);
    return;
  }
  rerenderShipmentView();
}

async function refreshShipmentAfterMutation(shipmentId) {
  await refreshShipmentListSnapshot();
  const response = await callAuthApi("getShipmentDetail", {
    sessionToken: requireSessionToken(),
    shipmentId,
  });
  shipmentState.detail = requireSuccess(response);
  const listItem = findShipmentById(shipmentState.items, shipmentId);
  if (listItem && shipmentState.detail) {
    shipmentState.detail.confirmedAt = shipmentState.detail.confirmedAt || listItem.confirmedAt || "";
    shipmentState.detail.cancelledAt = shipmentState.detail.cancelledAt || listItem.cancelledAt || "";
  }
}

async function refreshShipmentListSnapshot() {
  const requestedPageSize = Math.min(
    50,
    Math.max(shipmentState.pageSize, shipmentState.items.length || shipmentState.pageSize),
  );
  const response = await callAuthApi("listShipments", {
    sessionToken: requireSessionToken(),
    page: 1,
    pageSize: requestedPageSize,
  });
  const data = requireSuccess(response);
  shipmentState.items = Array.isArray(data.items) ? data.items : [];
  shipmentState.page = Math.max(1, Math.ceil(shipmentState.items.length / shipmentState.pageSize));
  shipmentState.hasMore = !!data.hasMore;
  shipmentState.initialized = true;
  shipmentState.error = "";
}

async function refreshStockAfterShipmentDispatch(items) {
  const affectedSkuCodes = (Array.isArray(items) ? items : [])
    .map((item) => normalizeSkuCodeForUi(item.skuCode))
    .filter(Boolean);

  if (affectedSkuCodes.length === 0 || (!stockState.initialized && !stockState.detail)) {
    return;
  }

  const currentStockDetailSku = stockState.detail
    ? normalizeSkuCodeForUi(stockState.detail.skuCode)
    : "";
  if (currentStockDetailSku && affectedSkuCodes.includes(currentStockDetailSku)) {
    await refreshStockAfterMutation(currentStockDetailSku);
    return;
  }

  if (!stockState.initialized) {
    return;
  }

  const token = requireSessionToken();
  const requestedPageSize = Math.min(
    50,
    Math.max(stockState.pageSize, stockState.items.length || stockState.pageSize),
  );
  const snapshot = await fetchStockRefreshSnapshot(token, stockState.query.trim(), requestedPageSize);
  stockState.items = snapshot.items;
  stockState.page = Math.max(1, Math.ceil(stockState.items.length / stockState.pageSize));
  stockState.hasMore = !!snapshot.hasMore;
  stockState.error = "";
}

function closeShipmentDetail() {
  if (shipmentState.detailTransition === "exit" ||
    shipmentState.detailLoading ||
    shipmentState.actionSubmitting) {
    return;
  }

  const detailView = document.querySelector(".shipment-detail-view");
  const finish = () => {
    shipmentState.detail = null;
    shipmentState.detailError = "";
    shipmentState.detailLoading = false;
    shipmentState.detailTransition = "";
    shipmentState.actionError = "";
    shipmentState.dispatchReview = false;
    shipmentState.dispatchPreview = [];
    shipmentState.returnFlow = createEmptyShipmentReturnState();
    rerenderShipmentView();
    scheduleShipmentListScrollRestore();
  };

  if (!detailView || shouldReduceMotion()) {
    finish();
    return;
  }

  shipmentState.detailTransition = "exit";
  detailView.classList.add("is-exiting");
  const backButton = detailView.querySelector(".detail-close-button");
  if (backButton) {
    backButton.disabled = true;
  }
  detailView.addEventListener("animationend", finish, { once: true });
}

function resetShipmentCreateFlow() {
  resetShipmentCreateState();
  rerenderShipmentView();
}

function resetShipmentCreateState() {
  if (shipmentPickerSearchTimer) {
    window.clearTimeout(shipmentPickerSearchTimer);
    shipmentPickerSearchTimer = null;
  }
  shipmentPickerDom = null;
  shipmentCreateState.mode = "list";
  shipmentCreateState.form = createEmptyShipmentForm();
  shipmentCreateState.picker = createEmptyShipmentPickerState();
  shipmentCreateState.errors = [];
  shipmentCreateState.submitting = false;
  shipmentCreateState.message = "";
  shipmentCreateState.messageType = "info";
}

function createEmptyShipmentForm() {
  return {
    reference: "",
    note: "",
    items: [],
  };
}

function createEmptyShipmentItemForm() {
  return {
    skuCode: "",
    quantity: "",
    productName: "",
    model: "",
    color: "",
    size: "",
    onHandQty: "",
  };
}

function createEmptyShipmentPickerState() {
  return {
    open: false,
    query: "",
    page: 1,
    pageSize: STOCK_PAGE_SIZE,
    hasMore: false,
    loading: false,
    error: "",
    items: [],
    selectedItems: {},
    requestId: 0,
  };
}

function createShipmentItemFormFromStockItem(item) {
  return {
    skuCode: normalizeSkuCodeForUi(item.skuCode),
    quantity: "",
    productName: item.productName || "",
    model: item.model || "",
    color: item.color || "",
    size: item.size || "",
    onHandQty: item.onHandQty,
  };
}

function getShipmentCreateSkuCodeSet() {
  return new Set(shipmentCreateState.form.items
    .map((item) => normalizeSkuCodeForUi(item.skuCode))
    .filter(Boolean));
}

function createEmptyShipmentReturnState() {
  return {
    active: false,
    step: "form",
    quantities: {},
    reason: "",
    errors: [],
    message: "",
    messageType: "info",
    preview: [],
  };
}

function appendUniqueShipments(existingItems, nextItems) {
  const seen = new Set(existingItems.map((item) => item.shipmentId));
  const merged = [...existingItems];
  nextItems.forEach((item) => {
    if (!item.shipmentId || seen.has(item.shipmentId)) {
      return;
    }
    seen.add(item.shipmentId);
    merged.push(item);
  });
  return merged;
}

function findShipmentById(items, shipmentId) {
  return (Array.isArray(items) ? items : []).find((item) => item.shipmentId === shipmentId) || null;
}

function canUseShipmentMutationUi() {
  if (!currentUser) {
    return false;
  }

  if (currentUser.role === OWNER_ROLE) {
    return true;
  }

  if (currentUser.role !== ADMIN_ROLE || !Array.isArray(currentUser.permissions)) {
    return false;
  }

  return currentUser.permissions.includes(CONFIRM_SHIPMENT_PERMISSION);
}

function canDispatchShipmentUi() {
  if (!currentUser) {
    return false;
  }

  if (currentUser.role === OWNER_ROLE) {
    return true;
  }

  if (currentUser.role !== ADMIN_ROLE || !Array.isArray(currentUser.permissions)) {
    return false;
  }

  return currentUser.permissions.includes(CONFIRM_SHIPMENT_PERMISSION) &&
    currentUser.permissions.includes(ADJUST_STOCK_PERMISSION);
}

function canUseShipmentReturnUi() {
  return canDispatchShipmentUi();
}

function shipmentActionSuccessMessage(action) {
  if (action === "confirmShipment") {
    return "ยืนยัน Shipment สำเร็จ";
  }
  if (action === "dispatchShipment") {
    return "Dispatch Shipment สำเร็จ";
  }
  return "ยกเลิก Shipment สำเร็จ";
}

function shipmentStatusLabel(status) {
  if (status === "DRAFT") {
    return "แบบร่าง";
  }
  if (status === "CONFIRMED") {
    return "ยืนยันแล้ว";
  }
  if (status === "CANCELLED") {
    return "ยกเลิกแล้ว";
  }
  if (status === "DISPATCHED") {
    return "ส่งออกแล้ว";
  }
  return status || "-";
}

function toShipmentCreateErrorMessage(error) {
  const code = error && (error.code || error.message);
  if (code === "VALIDATION_ERROR") {
    return "ข้อมูล Shipment ไม่ถูกต้อง กรุณาตรวจสอบรายการ";
  }
  return toShipmentErrorMessage(error);
}

function toShipmentActionErrorMessage(error, action) {
  const code = error && (error.code || error.message);
  if (code === "VALIDATION_ERROR") {
    if (action === "confirmShipment") {
      return "สถานะ Shipment ปัจจุบันไม่อนุญาตให้ยืนยัน";
    }
    if (action === "dispatchShipment") {
      return "ไม่สามารถ Dispatch Shipment นี้ได้ กรุณาตรวจสอบสถานะและ Stock";
    }
    return "สถานะ Shipment ปัจจุบันไม่อนุญาตให้ยกเลิก";
  }
  if (code === "PERMISSION_DENIED" && action === "dispatchShipment") {
    return "บัญชีนี้ไม่มีสิทธิ์ Dispatch Shipment";
  }
  return toShipmentErrorMessage(error);
}

function toShipmentReturnErrorMessage(error) {
  const code = error && (error.code || error.message);
  const backendMessage = error && error.backendMessage ? error.backendMessage : "";

  if (code === "PERMISSION_DENIED") {
    return "บัญชีนี้ไม่มีสิทธิ์คืนสินค้า";
  }

  if (code === "NOT_FOUND") {
    return backendMessage === "skuCode was not found." ? "ไม่พบ SKU นี้" : "ไม่พบ Shipment นี้";
  }

  if (code === "VALIDATION_ERROR") {
    if (backendMessage === "Shipment must be DISPATCHED.") {
      return "Shipment นี้ยังไม่พร้อมสำหรับการคืนสินค้า";
    }

    if (backendMessage === "Return quantity exceeds dispatched quantity.") {
      return "จำนวนคืนเกินจำนวนที่ส่งออก";
    }

    if (backendMessage === "SKU is not part of Shipment.") {
      return "SKU นี้ไม่ได้อยู่ใน Shipment";
    }

    if (backendMessage === "quantity must be a positive integer." ||
      backendMessage === "quantity is required.") {
      return "จำนวนคืนไม่ถูกต้อง";
    }

    return "ข้อมูลการคืนสินค้าเปลี่ยนไป กรุณาโหลดใหม่";
  }

  return toShipmentErrorMessage(error);
}

function toShipmentErrorMessage(error) {
  const code = error && (error.code || error.message);
  if (code === "VALIDATION_ERROR") {
    return "ข้อมูล Shipment ไม่ถูกต้อง กรุณาตรวจสอบรายการ";
  }
  if (code === "PERMISSION_DENIED") {
    return "บัญชีนี้ไม่มีสิทธิ์จัดการ Shipment";
  }
  if (code === "NOT_FOUND") {
    return "ไม่พบ Shipment นี้";
  }
  if (code === "NETWORK_RESPONSE_NOT_OK" || error instanceof TypeError) {
    return "เชื่อมต่อ Backend ไม่สำเร็จ";
  }
  return toThaiErrorMessage(error);
}

function isPositiveIntegerInput(value) {
  if (value === "" || value === null || typeof value === "undefined") {
    return false;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && Math.floor(parsed) === parsed && parsed > 0;
}

function scheduleShipmentDetailTopScroll() {
  requestAnimationFrame(() => {
    setProductScrollTop(getProductContentTopScroll());
  });
}

function scheduleShipmentListScrollRestore() {
  requestAnimationFrame(() => {
    setProductScrollTop(shipmentState.listScrollTop);
  });
}

function rerenderShipmentView() {
  if (activeViewName === "orders" && currentUser) {
    setView("orders");
  }
}

function renderStockView() {
  const section = document.createElement("section");
  section.className = "product-view stock-view";

  const toolbar = document.createElement("section");
  toolbar.className = "product-toolbar stock-toolbar";

  const intro = document.createElement("div");
  const title = document.createElement("h2");
  title.textContent = "สต๊อก";
  const detail = document.createElement("p");
  detail.className = "placeholder-text";
  detail.textContent = "ดู Stock จริงและประวัติการเคลื่อนไหวจากระบบ Backend แบบอ่านอย่างเดียว";
  intro.append(title, detail);

  const searchLabel = document.createElement("label");
  searchLabel.className = "product-search-label stock-search-label";
  const searchText = document.createElement("span");
  searchText.textContent = "ค้นหา Stock";
  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.autocomplete = "off";
  searchInput.placeholder = "ชื่อสินค้า, SKU, รุ่น, สี, ขนาด";
  searchInput.value = stockState.query;
  searchInput.addEventListener("input", (event) => {
    stockState.query = event.target.value;
    clearTimeout(stockSearchTimer);
    stockSearchTimer = setTimeout(() => {
      loadStock({ reset: true });
    }, 350);
  });
  searchLabel.append(searchText, searchInput);

  toolbar.append(intro);

  if (stockState.detail) {
    stockDom = null;
    section.append(renderStockDetailView());
    scheduleStockDetailTopScroll();
    return section;
  }

  toolbar.append(searchLabel);

  const status = document.createElement("div");
  status.className = "product-status stock-status";
  status.setAttribute("aria-live", "polite");

  const list = document.createElement("div");
  list.className = "product-list stock-list";

  const loadMoreButton = document.createElement("button");
  loadMoreButton.className = "load-more-button";
  loadMoreButton.type = "button";
  loadMoreButton.textContent = "โหลดเพิ่มเติม";
  loadMoreButton.addEventListener("click", () => {
    if (stockState.loading || !stockState.hasMore) {
      return;
    }
    stockState.page += 1;
    loadStock({ reset: false });
  });

  stockDom = {
    status,
    list,
    loadMoreButton,
    searchInput,
  };

  section.append(toolbar, status, list, loadMoreButton);
  updateStockDom();

  if (!stockState.initialized) {
    queueMicrotask(() => loadStock({ reset: true }));
  }

  return section;
}

async function loadStock(options) {
  const reset = !!(options && options.reset);
  const requestId = stockState.requestId + 1;
  stockState.requestId = requestId;

  if (reset) {
    stockState.page = 1;
    stockState.items = [];
    stockState.hasMore = false;
    stockState.detail = null;
    stockState.history = [];
    stockState.historyError = "";
    stockState.mutation = createEmptyStockMutationState();
  }

  stockState.loading = true;
  stockState.error = "";
  stockState.initialized = true;
  updateStockDom();

  try {
    const token = requireSessionToken();
    const action = stockState.query.trim() ? "searchStock" : "listStock";
    const payload = {
      sessionToken: token,
      page: stockState.page,
      pageSize: stockState.pageSize,
    };

    if (action === "searchStock") {
      payload.query = stockState.query.trim();
    }

    const response = await callAuthApi(action, payload);
    const data = requireSuccess(response);

    if (requestId !== stockState.requestId) {
      return;
    }

    const nextItems = Array.isArray(data.items) ? data.items : [];
    stockState.items = reset ? nextItems : appendUniqueStockItems(stockState.items, nextItems);
    stockState.hasMore = !!data.hasMore;
  } catch (error) {
    if (handleProductAuthFailure(error)) {
      return;
    }

    if (!reset && stockState.page > 1) {
      stockState.page -= 1;
    }
    stockState.error = toThaiErrorMessage(error);
  } finally {
    if (requestId === stockState.requestId) {
      stockState.loading = false;
      updateStockDom();
    }
  }
}

function updateStockDom() {
  if (!stockDom || activeViewName !== "stock") {
    return;
  }

  stockDom.status.textContent = "";
  stockDom.status.dataset.type = "info";

  clearElement(stockDom.list);
  stockState.items.forEach((item) => {
    stockDom.list.append(createStockCard(item));
  });

  if (stockState.loading && stockState.items.length === 0) {
    stockDom.status.textContent = stockState.query.trim()
      ? "กำลังค้นหา Stock..."
      : "กำลังโหลด Stock...";
  } else if (stockState.error) {
    stockDom.status.textContent = stockState.error;
    stockDom.status.dataset.type = "error";
  } else if (!stockState.loading && stockState.items.length === 0) {
    stockDom.status.textContent = stockState.query.trim()
      ? "ไม่พบสินค้าที่ตรงกับคำค้นหา"
      : "ยังไม่มีข้อมูล Stock";
  } else if (stockState.loading) {
    stockDom.status.textContent = "กำลังโหลดเพิ่มเติม...";
  } else {
    stockDom.status.textContent = stockState.query.trim()
      ? "ผลการค้นหา Stock แบบอ่านอย่างเดียว"
      : "รายการ Stock";
  }

  stockDom.loadMoreButton.hidden = !stockState.hasMore;
  stockDom.loadMoreButton.disabled = stockState.loading;
}

function createStockCard(item) {
  const article = document.createElement("article");
  article.className = "card product-card stock-card";

  const button = document.createElement("button");
  button.className = "product-card-button stock-card-button";
  button.type = "button";
  button.addEventListener("click", () => openStockDetail(item));

  const header = document.createElement("div");
  header.className = "product-card-header";

  const titleWrap = document.createElement("div");
  const title = document.createElement("h2");
  title.textContent = item.skuCode || "-";
  const productName = document.createElement("p");
  productName.className = "placeholder-text";
  productName.textContent = item.productName || "ไม่ระบุชื่อสินค้า";
  titleWrap.append(title, productName);

  const status = document.createElement("span");
  status.className = "status-pill";
  status.textContent = item.status || "-";
  header.append(titleWrap, status);

  const variant = document.createElement("p");
  variant.className = "placeholder-text";
  variant.textContent = formatVariantText(item) || "ไม่ระบุรายละเอียด SKU";

  const quantities = document.createElement("div");
  quantities.className = "quantity-row";
  quantities.append(
    createQuantityChip("Stock", item.onHandQty),
    createQuantityChip("หาเพิ่มได้", item.sourceableQtyEstimate),
  );

  button.append(header, variant, quantities);
  article.append(button);
  return article;
}

function openStockDetail(item) {
  stockState.listScrollTop = getProductScrollTop();
  stockState.detail = item;
  stockState.history = [];
  stockState.historyError = "";
  stockState.historyLoading = true;
  stockState.mutation = createEmptyStockMutationState();
  stockState.detailTransition = "enter";
  const requestId = stockState.historyRequestId + 1;
  stockState.historyRequestId = requestId;
  rerenderStockView();
  loadStockHistory(item.skuCode, requestId);
}

async function loadStockHistory(skuCode, requestId) {
  try {
    const response = await callAuthApi("getStockHistory", {
      sessionToken: requireSessionToken(),
      skuCode,
      page: 1,
      pageSize: stockState.pageSize,
    });
    const data = requireSuccess(response);

    if (requestId !== stockState.historyRequestId) {
      return;
    }

    stockState.history = Array.isArray(data.items) ? data.items : [];
  } catch (error) {
    if (handleProductAuthFailure(error)) {
      return;
    }

    stockState.historyError = toThaiErrorMessage(error);
  } finally {
    if (requestId === stockState.historyRequestId) {
      stockState.historyLoading = false;
      rerenderStockView();
    }
  }
}

function renderStockDetailView() {
  const view = document.createElement("section");
  view.className = "product-detail-view stock-detail-view";
  if (stockState.detailTransition === "exit") {
    view.classList.add("is-exiting");
  }

  const item = stockState.detail;
  if (!item) {
    return view;
  }

  const card = document.createElement("section");
  card.className = "card product-detail-card stock-detail-card";

  const header = document.createElement("div");
  header.className = "product-detail-header";
  const titleWrap = document.createElement("div");
  const title = document.createElement("h2");
  title.textContent = item.skuCode || "รายละเอียด Stock";
  const meta = document.createElement("p");
  meta.className = "placeholder-text";
  meta.textContent = `${item.productName || "ไม่ระบุชื่อสินค้า"} · ${item.status || "-"}`;
  titleWrap.append(title, meta);

  const close = document.createElement("button");
  close.className = "detail-close-button";
  close.type = "button";
  close.disabled = stockState.detailTransition === "exit" || stockState.mutation.submitting;
  close.textContent = "กลับ";
  close.addEventListener("click", closeStockDetail);
  header.append(titleWrap, close);

  const variant = document.createElement("p");
  variant.className = "placeholder-text";
  variant.textContent = formatVariantText(item) || "ไม่ระบุรายละเอียด SKU";

  const quantities = document.createElement("div");
  quantities.className = "quantity-row stock-detail-quantities";
  quantities.append(
    createQuantityChip("Stock", item.onHandQty),
    createQuantityChip("หาเพิ่มได้", item.sourceableQtyEstimate),
  );

  const mutationSection = renderStockMutationSection(item);

  const historyTitle = document.createElement("h3");
  historyTitle.className = "stock-history-title";
  historyTitle.textContent = "ประวัติ Stock";

  const historyBody = renderStockHistoryBody();

  card.append(header, variant, quantities, mutationSection, historyTitle, historyBody);
  view.append(card);
  return view;
}

function renderStockMutationSection(item) {
  const section = document.createElement("section");
  section.className = "stock-mutation-section";

  if (!canUseStockMutationUi()) {
    return section;
  }

  const mutation = stockState.mutation;
  if (mutation.message) {
    const message = document.createElement("p");
    message.className = "product-status stock-mutation-message";
    message.dataset.type = mutation.messageType;
    message.textContent = mutation.message;
    section.append(message);
  }

  if (mutation.errors.length > 0) {
    const errorList = document.createElement("ul");
    errorList.className = "stock-mutation-errors";
    mutation.errors.forEach((error) => {
      const entry = document.createElement("li");
      entry.textContent = error;
      errorList.append(entry);
    });
    section.append(errorList);
  }

  if (!mutation.mode) {
    const actions = document.createElement("div");
    actions.className = "stock-mutation-entry";
    actions.append(
      createStockMutationEntryButton("รับเข้า", "stock_in"),
      createStockMutationEntryButton("ปรับยอด", "adjustment"),
    );
    section.append(actions);
    return section;
  }

  section.append(mutation.step === "review"
    ? renderStockMutationReview(item)
    : renderStockMutationForm());
  return section;
}

function createStockMutationEntryButton(label, mode) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "secondary-action-button stock-mutation-entry-button";
  button.textContent = label;
  button.disabled = stockState.detailTransition === "exit";
  button.addEventListener("click", () => {
    stockState.mutation = createEmptyStockMutationState();
    stockState.mutation.mode = mode;
    rerenderStockView();
  });
  return button;
}

function renderStockMutationForm() {
  const mutation = stockState.mutation;
  const form = document.createElement("form");
  form.className = "stock-mutation-form";
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    openStockMutationReview();
  });

  const title = document.createElement("h3");
  title.textContent = mutation.mode === "stock_in" ? "รับเข้า Stock" : "ปรับยอด Stock";
  form.append(title);

  if (mutation.mode === "stock_in") {
    form.append(createStockMutationNumberField("stock_quantity", "จำนวนรับเข้า", mutation.quantity, "1", (value) => {
      stockState.mutation.quantity = value;
    }));
  } else {
    form.append(createStockMutationNumberField("stock_counted", "จำนวนที่นับจริง", mutation.countedQty, "1", (value) => {
      stockState.mutation.countedQty = value;
    }));
  }

  form.append(createStockMutationTextAreaField("stock_reason", "เหตุผล", mutation.reason, (value) => {
    stockState.mutation.reason = value;
  }));

  const actions = document.createElement("div");
  actions.className = "stock-mutation-actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "secondary-action-button";
  cancel.textContent = "ยกเลิก";
  cancel.addEventListener("click", cancelStockMutation);
  const review = document.createElement("button");
  review.type = "submit";
  review.className = "primary-action-button";
  review.textContent = "ตรวจสอบ";
  actions.append(cancel, review);
  form.append(actions);

  return form;
}

function renderStockMutationReview(item) {
  const mutation = stockState.mutation;
  const review = document.createElement("section");
  review.className = "stock-mutation-review";

  const title = document.createElement("h3");
  title.textContent = mutation.mode === "stock_in" ? "ยืนยันรับเข้า Stock" : "ยืนยันปรับยอด Stock";
  const currentQty = Number(item.onHandQty || 0);
  const inputQty = mutation.mode === "stock_in" ? Number(mutation.quantity) : Number(mutation.countedQty);
  const expectedAfter = mutation.mode === "stock_in" ? currentQty + inputQty : inputQty;
  const previewDelta = expectedAfter - currentQty;

  const summary = document.createElement("div");
  summary.className = "review-summary stock-mutation-summary";
  summary.append(
    createReviewLine("SKU", item.skuCode || "-"),
    createReviewLine("Stock ปัจจุบัน", formatNumber(currentQty)),
  );

  if (mutation.mode === "stock_in") {
    summary.append(
      createReviewLine("จำนวนรับเข้า", `+${formatNumber(inputQty)}`),
      createReviewLine("Stock หลังรับเข้า", formatNumber(expectedAfter)),
    );
  } else {
    summary.append(
      createReviewLine("จำนวนที่นับจริง", formatNumber(inputQty)),
      createReviewLine("ระบบจะปรับโดยประมาณ", formatSignedNumber(previewDelta)),
      createReviewLine("Stock หลังปรับยอด", formatNumber(expectedAfter)),
    );
  }

  summary.append(createReviewLine("เหตุผล", mutation.reason));
  review.append(title, summary);

  const actions = document.createElement("div");
  actions.className = "stock-mutation-actions";
  const back = document.createElement("button");
  back.type = "button";
  back.className = "secondary-action-button";
  back.textContent = "กลับไปแก้ไข";
  back.disabled = mutation.submitting;
  back.addEventListener("click", () => {
    stockState.mutation.step = "form";
    stockState.mutation.errors = [];
    rerenderStockView();
  });
  const submit = document.createElement("button");
  submit.type = "button";
  submit.className = "primary-action-button";
  submit.textContent = mutation.submitting ? "กำลังบันทึก..." : "ยืนยัน";
  submit.disabled = mutation.submitting;
  submit.addEventListener("click", submitStockMutation);
  actions.append(back, submit);
  review.append(actions);

  return review;
}

function createStockMutationNumberField(name, label, value, step, onInput) {
  const wrapper = document.createElement("label");
  wrapper.className = "stock-mutation-field";
  const span = document.createElement("span");
  span.textContent = label;
  const input = document.createElement("input");
  input.name = name;
  input.type = "number";
  input.min = "0";
  input.step = step;
  input.value = value || "";
  input.required = true;
  input.addEventListener("input", (event) => onInput(event.target.value));
  wrapper.append(span, input);
  return wrapper;
}

function createStockMutationTextAreaField(name, label, value, onInput) {
  const wrapper = document.createElement("label");
  wrapper.className = "stock-mutation-field";
  const span = document.createElement("span");
  span.textContent = label;
  const textarea = document.createElement("textarea");
  textarea.name = name;
  textarea.value = value || "";
  textarea.required = true;
  textarea.addEventListener("input", (event) => onInput(event.target.value));
  wrapper.append(span, textarea);
  return wrapper;
}

function openStockMutationReview() {
  stockState.mutation.errors = validateStockMutationForm();
  stockState.mutation.message = "";
  if (stockState.mutation.errors.length > 0) {
    rerenderStockView();
    return;
  }

  stockState.mutation.step = "review";
  rerenderStockView();
}

function cancelStockMutation() {
  stockState.mutation = createEmptyStockMutationState();
  rerenderStockView();
}

async function submitStockMutation() {
  const item = stockState.detail;
  const mutation = stockState.mutation;
  if (!item || mutation.submitting) {
    return;
  }

  mutation.errors = validateStockMutationForm();
  mutation.message = "";
  if (mutation.errors.length > 0) {
    mutation.step = "form";
    rerenderStockView();
    return;
  }

  mutation.submitting = true;
  rerenderStockView();

  let mutationCommitted = false;
  try {
    const response = await callAuthApi("postInventoryTransaction", {
      sessionToken: requireSessionToken(),
      transaction: createStockMutationPayload(item, mutation),
    });
    requireSuccess(response);
    mutationCommitted = true;
    await refreshStockAfterMutation(item.skuCode);
    stockState.mutation = createEmptyStockMutationState();
    stockState.mutation.message = "อัปเดต Stock สำเร็จ";
    stockState.mutation.messageType = "info";
    rerenderStockView();
  } catch (error) {
    if (handleProductAuthFailure(error)) {
      return;
    }

    if (mutationCommitted) {
      stockState.mutation = createEmptyStockMutationState();
      stockState.mutation.errors = ["บันทึก Stock สำเร็จแล้ว แต่โหลดข้อมูลล่าสุดไม่สำเร็จ กรุณาโหลด Stock ใหม่"];
      rerenderStockView();
      return;
    }

    stockState.mutation.submitting = false;
    stockState.mutation.errors = [toStockMutationErrorMessage(error)];
    stockState.mutation.step = "form";
    rerenderStockView();
  }
}

function createStockMutationPayload(item, mutation) {
  const payload = {
    skuCode: normalizeSkuCodeForUi(item.skuCode),
    transaction_type: mutation.mode === "stock_in" ? "STOCK_IN" : "ADJUSTMENT",
    reason: String(mutation.reason || "").trim(),
  };

  if (mutation.mode === "stock_in") {
    payload.quantity = Number(mutation.quantity);
  } else {
    payload.counted_qty = Number(mutation.countedQty);
  }

  return payload;
}

async function refreshStockAfterMutation(skuCode) {
  const token = requireSessionToken();
  const normalizedSkuCode = normalizeSkuCodeForUi(skuCode);
  const requestedPageSize = Math.min(50, Math.max(stockState.pageSize, stockState.items.length || stockState.pageSize));
  const snapshot = await fetchStockRefreshSnapshot(token, stockState.query.trim(), requestedPageSize);
  let refreshedItem = findStockItemBySkuCode(snapshot.items, normalizedSkuCode);

  if (!refreshedItem) {
    const fallback = await fetchStockRefreshSnapshot(token, normalizedSkuCode, stockState.pageSize);
    refreshedItem = findStockItemBySkuCode(fallback.items, normalizedSkuCode);
  }

  stockState.items = snapshot.items;
  stockState.page = Math.max(1, Math.ceil(stockState.items.length / stockState.pageSize));
  stockState.hasMore = !!snapshot.hasMore;
  stockState.error = "";

  if (refreshedItem) {
    stockState.detail = refreshedItem;
  }

  const historyResponse = await callAuthApi("getStockHistory", {
    sessionToken: token,
    skuCode: normalizedSkuCode,
    page: 1,
    pageSize: stockState.pageSize,
  });
  const historyData = requireSuccess(historyResponse);
  stockState.history = Array.isArray(historyData.items) ? historyData.items : [];
  stockState.historyError = "";
  stockState.historyLoading = false;
}

async function fetchStockRefreshSnapshot(token, query, pageSize) {
  const action = query ? "searchStock" : "listStock";
  const payload = {
    sessionToken: token,
    page: 1,
    pageSize,
  };

  if (query) {
    payload.query = query;
  }

  const response = await callAuthApi(action, payload);
  const data = requireSuccess(response);
  return {
    items: Array.isArray(data.items) ? data.items : [],
    hasMore: !!data.hasMore,
  };
}

function findStockItemBySkuCode(items, skuCode) {
  const normalizedSkuCode = normalizeSkuCodeForUi(skuCode);
  return (Array.isArray(items) ? items : []).find((item) => normalizeSkuCodeForUi(item.skuCode) === normalizedSkuCode) || null;
}

function validateStockMutationForm() {
  const mutation = stockState.mutation;
  const errors = [];

  if (mutation.mode === "stock_in" && !isPositiveNumberInput(mutation.quantity)) {
    errors.push("กรุณากรอกจำนวนรับเข้ามากกว่า 0");
  }

  if (mutation.mode === "adjustment" && !isNonNegativeNumberInput(mutation.countedQty)) {
    errors.push("กรุณากรอกจำนวนที่นับจริงตั้งแต่ 0 ขึ้นไป");
  }

  if (!String(mutation.reason || "").trim()) {
    errors.push("กรุณากรอกเหตุผล");
  }

  return errors;
}

function isPositiveNumberInput(value) {
  if (value === "" || value === null || typeof value === "undefined") {
    return false;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

function toStockMutationErrorMessage(error) {
  const code = error && (error.code || error.message);
  if (code === "VALIDATION_ERROR") {
    return "ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบจำนวนและเหตุผล";
  }
  if (code === "PERMISSION_DENIED") {
    return "บัญชีนี้ไม่มีสิทธิ์ปรับสต๊อก";
  }
  if (code === "NOT_FOUND") {
    return "ไม่พบ SKU นี้";
  }
  if (code === "NETWORK_RESPONSE_NOT_OK" || error instanceof TypeError) {
    return "เชื่อมต่อ Backend ไม่สำเร็จ";
  }
  return toThaiErrorMessage(error);
}

function createEmptyStockMutationState() {
  return {
    mode: "",
    step: "form",
    quantity: "",
    countedQty: "",
    reason: "",
    errors: [],
    submitting: false,
    message: "",
    messageType: "info",
  };
}

function renderStockHistoryBody() {
  if (stockState.historyLoading) {
    const loading = document.createElement("p");
    loading.className = "product-status";
    loading.textContent = "กำลังโหลดประวัติ...";
    return loading;
  }

  if (stockState.historyError) {
    const error = document.createElement("p");
    error.className = "product-status product-error";
    error.textContent = stockState.historyError;
    return error;
  }

  if (!stockState.history.length) {
    const empty = document.createElement("p");
    empty.className = "product-status";
    empty.textContent = "ไม่มีประวัติ";
    return empty;
  }

  const list = document.createElement("div");
  list.className = "stock-history-list";
  stockState.history.forEach((transaction) => {
    list.append(createStockHistoryItem(transaction));
  });
  return list;
}

function createStockHistoryItem(transaction) {
  const item = document.createElement("article");
  item.className = "stock-history-item";

  const top = document.createElement("div");
  top.className = "stock-history-top";
  const type = document.createElement("strong");
  type.textContent = stockTransactionLabel(transaction.transactionType);
  const delta = document.createElement("span");
  delta.className = Number(transaction.quantityChange) < 0 ? "stock-delta negative" : "stock-delta";
  delta.textContent = formatSignedNumber(transaction.quantityChange);
  top.append(type, delta);

  const quantity = document.createElement("p");
  quantity.className = "stock-history-quantity";
  quantity.textContent = `${formatNumber(transaction.quantityBefore)} → ${formatNumber(transaction.quantityAfter)}`;

  const reason = document.createElement("p");
  reason.className = "placeholder-text";
  reason.textContent = transaction.reason || "ไม่ระบุเหตุผล";

  const metaParts = [
    formatDateTime(transaction.createdAt),
    stockCreatedByLabel(transaction.createdBy),
    formatReferenceText(transaction),
  ].filter(Boolean);
  const meta = document.createElement("p");
  meta.className = "placeholder-text";
  meta.textContent = metaParts.join(" · ");

  item.append(top, quantity, reason, meta);
  return item;
}

function closeStockDetail() {
  if (stockState.detailTransition === "exit" || stockState.mutation.submitting) {
    return;
  }

  const detailView = document.querySelector(".stock-detail-view");
  const finish = () => {
    stockState.detail = null;
    stockState.history = [];
    stockState.historyError = "";
    stockState.historyLoading = false;
    stockState.mutation = createEmptyStockMutationState();
    stockState.detailTransition = "";
    rerenderStockView();
    scheduleStockListScrollRestore();
  };

  if (!detailView || shouldReduceMotion()) {
    finish();
    return;
  }

  stockState.detailTransition = "exit";
  detailView.classList.add("is-exiting");
  const backButton = detailView.querySelector(".detail-close-button");
  if (backButton) {
    backButton.disabled = true;
  }
  detailView.addEventListener("animationend", finish, { once: true });
}

function scheduleStockDetailTopScroll() {
  requestAnimationFrame(() => {
    setProductScrollTop(getProductContentTopScroll());
  });
}

function scheduleStockListScrollRestore() {
  requestAnimationFrame(() => {
    setProductScrollTop(stockState.listScrollTop);
  });
}

function rerenderStockView() {
  if (activeViewName === "stock" && currentUser) {
    setView("stock");
  }
}

function appendUniqueStockItems(existingItems, nextItems) {
  const seen = new Set(existingItems.map((item) => normalizeSkuCodeForUi(item.skuCode)));
  const merged = [...existingItems];
  nextItems.forEach((item) => {
    const skuCode = normalizeSkuCodeForUi(item.skuCode);
    if (!seen.has(skuCode)) {
      seen.add(skuCode);
      merged.push(item);
    }
  });
  return merged;
}

function formatVariantText(item) {
  return [item.model, item.color, item.size].filter(Boolean).join(" / ");
}

function stockTransactionLabel(type) {
  if (type === "OPENING_BALANCE") {
    return "ยอดเริ่มต้น";
  }
  if (type === "STOCK_IN") {
    return "รับเข้า";
  }
  if (type === "ADJUSTMENT") {
    return "ปรับยอด";
  }
  return type || "-";
}

function formatSignedNumber(value) {
  const number = Number(value || 0);
  if (number > 0) {
    return `+${formatNumber(number)}`;
  }
  return formatNumber(number);
}

function formatDateTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function stockCreatedByLabel(value) {
  return value === "AUTHENTICATED_USER" ? "ผู้ใช้ที่ยืนยันตัวตนแล้ว" : "";
}

function formatReferenceText(transaction) {
  const type = String(transaction.referenceType || "").trim();
  const id = String(transaction.referenceId || "").trim();
  const display = String(transaction.referenceDisplay || "").trim();
  if (type === "SHIPMENT") {
    return display ? `Shipment · ${display}` : "Shipment";
  }
  if (type === "SHIPMENT_RETURN") {
    return display ? `คืนสินค้า · ${display}` : "คืนสินค้า";
  }
  if (!type && !id) {
    return "";
  }
  return [type, id].filter(Boolean).join(" ");
}

function requireSessionToken() {
  const token = getSessionToken();
  if (token) {
    return token;
  }

  const error = new Error("AUTH_REQUIRED");
  error.code = "AUTH_REQUIRED";
  throw error;
}

function handleProductAuthFailure(error) {
  const code = error && (error.code || error.message);
  if (code !== "AUTH_REQUIRED" && code !== "SESSION_EXPIRED") {
    return false;
  }

  clearSessionToken();
  currentUser = null;
  showLogin();
  showLoginMessage(toThaiErrorMessage(error), "error");
  return true;
}

function formatBaht(value) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatNumber(value) {
  return new Intl.NumberFormat("th-TH").format(Number(value || 0));
}

function formatOptionalNumber(value) {
  if (value === "" || value === null || typeof value === "undefined") {
    return "-";
  }

  const number = Number(value);
  return Number.isFinite(number) ? formatNumber(number) : "-";
}

function clearElement(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

function createShortcut(title, detail, viewName) {
  const item = document.createElement("article");
  item.className = "card shortcut";
  item.innerHTML = `<strong>${title}</strong><span class="placeholder-text">${detail}</span>`;
  if (viewName) {
    item.setAttribute("role", "button");
    item.tabIndex = 0;
    item.addEventListener("click", () => setView(viewName));
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setView(viewName);
      }
    });
  }
  return item;
}

function renderPlaceholder(title, detail) {
  const section = document.createElement("section");
  section.className = "card";
  section.innerHTML = `
    <h2>${title}</h2>
    <p class="placeholder-text">${detail}</p>
  `;
  return section;
}
