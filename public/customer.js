const loginCard = document.querySelector("#login-card");
const orderCard = document.querySelector("#order-card");
const loginBtn = document.querySelector("#login-btn");
const loginStatus = document.querySelector("#login-status");
const logoutBtn = document.querySelector("#logout-btn");
const customerLabel = document.querySelector("#customer-label");

const orderStatus = document.querySelector("#order-status");
const addItemBtn = document.querySelector("#add-item-btn");
const lineItemsEl = document.querySelector("#line-items");
const submitOrderBtn = document.querySelector("#submit-order-btn");

const state = {
  token: sessionStorage.getItem("customerPortalToken"),
  customer: null,
  items: []
};

function setStatus(el, message, type) {
  el.textContent = message;
  el.classList.remove("hidden", "success", "error");
  if (type) el.classList.add(type);
}

function clearStatus(el) {
  el.textContent = "";
  el.classList.add("hidden");
  el.classList.remove("success", "error");
}

function renderItems() {
  lineItemsEl.innerHTML = "";
  if (!state.items.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "No items added yet.";
    lineItemsEl.appendChild(empty);
    return;
  }
  state.items.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "line-item";

    const label = document.createElement("span");
    label.textContent = `${item.title} (x${item.quantity})`;

    const price = document.createElement("span");
    price.textContent = item.price != null ? `R${Number(item.price).toFixed(2)}` : "Custom price";
    price.className = "muted";

    const remove = document.createElement("button");
    remove.className = "danger";
    remove.type = "button";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      state.items.splice(index, 1);
      renderItems();
    });

    row.append(label, price, remove);
    lineItemsEl.appendChild(row);
  });
}

function toggleView(isLoggedIn) {
  if (isLoggedIn) {
    loginCard.classList.add("hidden");
    orderCard.classList.remove("hidden");
  } else {
    loginCard.classList.remove("hidden");
    orderCard.classList.add("hidden");
  }
}

async function login() {
  clearStatus(loginStatus);
  const email = document.querySelector("#login-email").value.trim();
  const passcode = document.querySelector("#login-passcode").value.trim();

  if (!email || !passcode) {
    setStatus(loginStatus, "Please provide both email and access code.", "error");
    return;
  }

  loginBtn.disabled = true;
  try {
    const resp = await fetch("/customer/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, passcode })
    });

    const data = await resp.json();
    if (!resp.ok) {
      setStatus(loginStatus, data?.message || "Login failed.", "error");
      return;
    }

    state.token = data.token;
    state.customer = data.customer;
    sessionStorage.setItem("customerPortalToken", data.token);
    customerLabel.textContent = `${data.customer.name || data.customer.email} · ${data.customer.email}`;
    toggleView(true);
    setStatus(orderStatus, "You're signed in. Add items below to place an order.", "success");
  } catch (err) {
    setStatus(loginStatus, err?.message || "Login failed.", "error");
  } finally {
    loginBtn.disabled = false;
  }
}

function logout() {
  sessionStorage.removeItem("customerPortalToken");
  state.token = null;
  state.customer = null;
  state.items = [];
  renderItems();
  toggleView(false);
  clearStatus(orderStatus);
}

function addItem() {
  const title = document.querySelector("#item-title").value.trim();
  const quantity = Number(document.querySelector("#item-qty").value || 1);
  const priceValue = document.querySelector("#item-price").value;
  const notes = document.querySelector("#item-notes").value.trim();

  if (!title) {
    setStatus(orderStatus, "Add a SKU or title before adding an item.", "error");
    return;
  }

  state.items.push({
    title,
    quantity: Math.max(1, quantity || 1),
    price: priceValue ? Number(priceValue) : null,
    notes
  });

  document.querySelector("#item-title").value = "";
  document.querySelector("#item-qty").value = 1;
  document.querySelector("#item-price").value = "";
  document.querySelector("#item-notes").value = "";
  clearStatus(orderStatus);
  renderItems();
}

function buildAddress(prefix) {
  const address1 = document.querySelector(`#${prefix}-address1`).value.trim();
  const address2 = document.querySelector(`#${prefix}-address2`).value.trim();
  const city = document.querySelector(`#${prefix}-city`).value.trim();
  const province = document.querySelector(`#${prefix}-province`).value.trim();
  const zip = document.querySelector(`#${prefix}-zip`).value.trim();
  const country = document.querySelector(`#${prefix}-country`).value.trim();
  const phone = document.querySelector(`#${prefix}-phone`).value.trim();
  const company = document.querySelector(`#${prefix}-company`).value.trim();

  if (!address1 && !city && !zip) return null;
  return {
    address1,
    address2,
    city,
    province,
    zip,
    country,
    phone,
    company
  };
}

async function submitOrder() {
  clearStatus(orderStatus);
  if (!state.items.length) {
    setStatus(orderStatus, "Add at least one line item before placing the order.", "error");
    return;
  }

  const shippingMethod = document.querySelector("#shipping-method").value;
  const shippingService = document.querySelector("#shipping-service").value.trim();
  const shippingPrice = document.querySelector("#shipping-price").value;
  const poNumber = document.querySelector("#po-number").value.trim();

  const payload = {
    poNumber,
    shippingMethod,
    shippingService,
    shippingPrice: shippingPrice ? Number(shippingPrice) : null,
    shippingAddress: buildAddress("ship"),
    lineItems: state.items.map((item) => ({
      title: item.title,
      quantity: item.quantity,
      price: item.price
    }))
  };

  submitOrderBtn.disabled = true;
  try {
    const resp = await fetch("/customer/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.token}`
      },
      body: JSON.stringify(payload)
    });

    const data = await resp.json();
    if (!resp.ok) {
      setStatus(orderStatus, data?.message || "Order failed.", "error");
      return;
    }

    state.items = [];
    renderItems();
    setStatus(
      orderStatus,
      `Order placed! Reference: ${data.order?.name || data.order?.orderNumber || "created"}.`,
      "success"
    );
  } catch (err) {
    setStatus(orderStatus, err?.message || "Order failed.", "error");
  } finally {
    submitOrderBtn.disabled = false;
  }
}

loginBtn.addEventListener("click", login);
logoutBtn.addEventListener("click", logout);
addItemBtn.addEventListener("click", addItem);
submitOrderBtn.addEventListener("click", submitOrder);

renderItems();

if (state.token) {
  toggleView(true);
  customerLabel.textContent = "Signed in (session restored)";
}
