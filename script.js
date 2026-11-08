import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient(window.MAROOOC_SUPABASE_URL, window.MAROOOC_SUPABASE_KEY);
const $ = (selector) => document.querySelector(selector);
const money = (value) => Number(value || 0).toLocaleString("fr-FR") + " DH";
const state = {
  products: [],
  cart: new Map(),
  settings: { whatsapp_number: "212656219486", delivery_fee: 0 }
};

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));

function whatsappNumber() {
  const number = String(state.settings.whatsapp_number || "212656219486").replace(/\D/g, "");
  return number.startsWith("0") ? "212" + number.slice(1) : number;
}

async function init() {
  const [{ data: products, error }, { data: settings }] = await Promise.all([
    db.from("products")
      .select("id,name,slug,description,price,compare_at_price,stock,image_url,active,created_at")
      .eq("active", true).order("created_at", { ascending: false }),
    db.from("store_settings").select("whatsapp_number,delivery_fee").eq("id", 1).maybeSingle()
  ]);

  if (error) {
    $("#productGrid").textContent = "Erreur de chargement des produits.";
    return;
  }

  state.products = products || [];
  if (settings) state.settings = { ...state.settings, ...settings };
  $("#contactWhatsApp").href = "https://wa.me/" + whatsappNumber();
  renderProducts();
}

function renderProducts() {
  const query = $("#productSearch").value.toLowerCase();
  const products = state.products.filter((product) =>
    (product.name + " " + (product.description || "")).toLowerCase().includes(query)
  );

  if ($("#sortProducts").value === "price-asc") products.sort((a, b) => a.price - b.price);
  if ($("#sortProducts").value === "price-desc") products.sort((a, b) => b.price - a.price);

  $("#productGrid").innerHTML = products.length ? products.map((product) =>
    '<article class="product-card"><div class="product-image">' +
      (product.image_url
        ? '<img src="' + escapeHtml(product.image_url) + '" alt="' + escapeHtml(product.name) + '">'
        : '<div class="image-placeholder">MAROOC<br><b>SHOP</b></div>') +
    '</div><div class="product-info"><h3>' + escapeHtml(product.name) + '</h3>' +
    '<p>' + escapeHtml(product.description || "Découvrez ce produit.") + '</p>' +
    '<div class="product-price"><strong>' + money(product.price) + '</strong>' +
    (product.compare_at_price > product.price ? '<del>' + money(product.compare_at_price) + '</del>' : '') +
    '</div><small>' + (product.stock > 0 ? "En stock" : "Disponible sur commande") + '</small>' +
    '<button class="btn btn-primary add-cart" data-add="' + product.id + '">Ajouter au panier +</button>' +
    '</div></article>'
  ).join("") : '<p class="empty-products">Aucun produit disponible.</p>';

  document.querySelectorAll("[data-add]").forEach((button) => {
    button.onclick = () => {
      const product = state.products.find((item) => item.id === button.dataset.add);
      const existing = state.cart.get(product.id);
      const quantity = Math.min(20, (existing?.quantity || 0) + 1);
      state.cart.set(product.id, { product, quantity });
      renderCart();
      $("#cartDrawer").classList.remove("hidden");
    };
  });
}

function renderCart() {
  const items = [...state.cart.values()];
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const delivery = Number(state.settings.delivery_fee || 0);

  $("#cartCount").textContent = count;
  $("#cartSubtotal").textContent = money(subtotal);
  $("#cartDelivery").textContent = delivery ? money(delivery) : "GRATUITE";
  $("#cartTotal").textContent = money(subtotal + delivery);
  $("#cartItems").innerHTML = items.map((item) =>
    '<div class="cart-item"><b>' + escapeHtml(item.product.name) + '</b> · ' +
    item.quantity + ' × ' + money(item.product.price) +
    ' <button data-minus="' + item.product.id + '">−</button>' +
    ' <button data-plus="' + item.product.id + '">+</button></div>'
  ).join("") || "Votre panier est vide.";

  document.querySelectorAll("[data-minus],[data-plus]").forEach((button) => {
    button.onclick = () => {
      const id = button.dataset.minus || button.dataset.plus;
      const item = state.cart.get(id);
      if (button.dataset.plus) item.quantity = Math.min(20, item.quantity + 1);
      else item.quantity -= 1;
      if (item.quantity < 1) state.cart.delete(id);
      renderCart();
    };
  });

  $("#checkoutStart").disabled = !count;
}

$("#productSearch").oninput = renderProducts;
$("#sortProducts").onchange = renderProducts;
$("#year").textContent = new Date().getFullYear();
$("#cartOpen").onclick = () => $("#cartDrawer").classList.remove("hidden");
$("#cartClose").onclick = () => $("#cartDrawer").classList.add("hidden");
$("#checkoutStart").onclick = () => {
  $("#cartDrawer").classList.add("hidden");
  $("#checkoutModal").classList.remove("hidden");
};
$("#checkoutClose").onclick = () => $("#checkoutModal").classList.add("hidden");

$("#checkoutForm").onsubmit = async (event) => {
  event.preventDefault();
  $("#checkoutError").textContent = "";

  const form = new FormData(event.currentTarget);
  const phone = String(form.get("phone")).trim();
  const digits = phone.replace(/[\s().+-]/g, "");
  if (!/^(0[5-7]\d{8}|212[5-7]\d{8})$/.test(digits)) {
    $("#checkoutError").textContent = "Numéro marocain invalide.";
    return;
  }

  const items = [...state.cart.values()];
  if (!items.length) return;

  const delivery = Number(state.settings.delivery_fee || 0);
  const subtotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const total = subtotal + delivery;
  const orderGroupId = crypto.randomUUID();
  const submitButton = $("#submitOrder");
  submitButton.disabled = true;

  try {
    const rows = items.map((item, index) => ({
      order_group_id: orderGroupId,
      customer_name: form.get("name"),
      phone,
      city: form.get("city"),
      address: form.get("address"),
      product_id: item.product.id,
      product_name: item.product.name,
      quantity: item.quantity,
      unit_price: item.product.price,
      delivery_fee: index === 0 ? delivery : 0,
      total: item.product.price * item.quantity + (index === 0 ? delivery : 0),
      status: "pending",
      whatsapp_sent: false
    }));

    const { error } = await db.from("orders").insert(rows);
    if (error) throw error;

    const message = [
      "Bonjour MAROOC.SHOP, voici ma commande :",
      ...items.map((item) => item.product.name + " × " + item.quantity + " — " + money(item.product.price * item.quantity)),
      "Sous-total : " + money(subtotal),
      "Livraison : " + (delivery ? money(delivery) : "Gratuite"),
      "Total : " + money(total),
      "Nom : " + form.get("name"),
      "Téléphone : " + phone,
      "Ville : " + form.get("city"),
      "Adresse : " + form.get("address"),
      "Référence commande : " + orderGroupId.slice(0, 8).toUpperCase()
    ].join("\n");

    state.cart.clear();
    renderCart();
    $("#checkoutModal").classList.add("hidden");
    window.location.href = "https://wa.me/" + whatsappNumber() + "?text=" + encodeURIComponent(message);
  } catch (error) {
    console.error(error);
    $("#checkoutError").textContent = "Erreur d'enregistrement. Réessayez ou contactez-nous.";
  } finally {
    submitButton.disabled = false;
  }
};

renderCart();
init();
