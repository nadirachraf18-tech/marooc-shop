import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient(window.MAROOOC_SUPABASE_URL, window.MAROOOC_SUPABASE_KEY);
const $ = (selector) => document.querySelector(selector);
const money = (value) => Number(value || 0).toLocaleString("fr-FR") + " DH";
const unitPriceFor = (product, quantity = 1) => product.offer_min_qty && product.offer_unit_price !== null && quantity >= Number(product.offer_min_qty) ? Number(product.offer_unit_price) : Number(product.price);
const state = {
  products: [],
  cart: new Map(),
  settings: { whatsapp_number: "212656219486", delivery_fee: 0 },
  shippingRates: []
};

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));


function formatDescription(value, compact = false) {
  const source = String(value || "Découvrez ce produit.").replace(/\r/g, "").trim();
  if (compact) {
    let plain = source.replace(/^#{1,6}\s*/gm, "").replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1").replace(/\p{Extended_Pictographic}/gu, "").replace(/\s+/g, " ").trim();
    if (plain.length > 155) plain = plain.slice(0, 152).trimEnd() + "…";
    return "<p>" + escapeHtml(plain) + "</p>";
  }
  return source.split(/\n+/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return "";
    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    const isList = /^[-•]\s/.test(trimmed);
    const safe = escapeHtml(heading ? heading[2] : isList ? trimmed.replace(/^[-•]\s*/, "") : trimmed)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>");
    if (heading) return (heading[1].length === 3 ? "<h3>" : "<h2>") + safe + (heading[1].length === 3 ? "</h3>" : "</h2>");
    if (isList) return "<li>" + safe + "</li>";
    return "<p>" + safe + "</p>";
  }).join("").replace(/(?:<li>.*?<\/li>)+/g, (list) => "<ul>" + list + "</ul>");
}

function whatsappNumber() {
  const number = String(state.settings.whatsapp_number || "212656219486").replace(/\D/g, "");
  return number.startsWith("0") ? "212" + number.slice(1) : number;
}

async function init() {
  const [{ data: products, error }, { data: settings }, { data: shippingRates }] = await Promise.all([
    db.from("products")
      .select("id,name,slug,description,price,compare_at_price,offer_min_qty,offer_unit_price,stock,image_url,gallery_images,video_url,video_source_url,active,created_at")
      .eq("active", true).order("created_at", { ascending: false }),
    db.from("store_settings").select("whatsapp_number,delivery_fee").eq("id", 1).maybeSingle(),
    db.from("shipping_rates").select("city,fee,min_delivery_days,max_delivery_days").eq("active", true).order("city")
  ]);

  if (error) {
    $("#productGrid").textContent = "Erreur de chargement des produits.";
    return;
  }

  state.products = products || [];
  if (settings) state.settings = { ...state.settings, ...settings };
  state.shippingRates = shippingRates || [];
  const cityInput = document.querySelector("#checkoutForm [name=city]");
  if (cityInput && state.shippingRates.length) {
    cityInput.setAttribute("list", "shippingCities");
    const dl = document.createElement("datalist"); dl.id = "shippingCities";
    dl.innerHTML = state.shippingRates.map(r => '<option value="' + escapeHtml(r.city) + '"></option>').join("");
    cityInput.after(dl);
    cityInput.addEventListener("input", () => {
      renderCart();
      const city = cityInput.value.trim().toLowerCase();
      const rate = state.shippingRates.find(r => r.city.trim().toLowerCase() === city);
      const note = document.querySelector("#deliveryEstimate");
      if (note) note.textContent = rate ? "Livraison : " + money(rate.fee) + " · Délai estimé : " + rate.min_delivery_days + " à " + rate.max_delivery_days + " jours." : "Tarif standard : " + money(state.settings.delivery_fee) + ". Délai à confirmer.";
    });
  }
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
        ? '<img loading="lazy" src="' + escapeHtml(product.image_url) + '" alt="' + escapeHtml(product.name) + '">'
        : '<div class="image-placeholder">MAROOC<br><b>SHOP</b></div>') +
      (product.compare_at_price > product.price ? '<span class="product-discount">-' + Math.round((1 - product.price / product.compare_at_price) * 100) + '%</span>' : '') +
      (product.video_url ? '<span class="product-media-badge">▶ Vidéo</span>' : '') +
    '</div><div class="product-info"><h3>' + escapeHtml(product.name) + '</h3>' +
    '<div class="product-description">' + formatDescription(product.description, true) + '</div>' +
    '<div class="product-order-row"><div class="product-price"><strong>' + money(product.price) + '</strong>' +
    (product.compare_at_price > product.price ? '<del>' + money(product.compare_at_price) + '</del>' : '') +
    '</div><button class="quick-order" type="button" data-add="' + product.id + '" aria-label="Commander ' + escapeHtml(product.name) + '" title="Commander"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h2l2.2 11.2a2 2 0 0 0 2 1.6h8.9a2 2 0 0 0 1.9-1.4L22 8H6"/><circle cx="10" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/></svg></button></div>' +
    (product.offer_min_qty && product.offer_unit_price !== null ? '<div class="quantity-offer">Offre : '+Number(product.offer_min_qty)+' pièces à '+money(product.offer_unit_price)+' / pièce</div>' : '') +
    '<small>' + (product.stock > 0 ? "En stock" : "Disponible sur commande") + '</small>' +
    '<button class="btn btn-primary add-cart" data-add="' + product.id + '">Ajouter au panier +</button>' +
    '<button class="details-button" data-details="' + product.id + '">Voir les détails →</button>' +
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

  document.querySelectorAll("[data-details]").forEach((button) => {
    button.onclick = () => {
      const product = state.products.find((item) => item.id === button.dataset.details);
      openProductDetails(product);
    };
  });
}


function openProductDetails(product) {
  if (!product) return;
  const images = Array.isArray(product.gallery_images) && product.gallery_images.length
    ? product.gallery_images
    : [product.image_url].filter(Boolean);
  $("#detailTitle").textContent = product.name;
  $("#detailDescription").innerHTML = formatDescription(product.description, false);
  $("#detailPrice").textContent = money(product.price) + (product.offer_min_qty && product.offer_unit_price !== null ? " · Offre dès " + product.offer_min_qty + " pièces : " + money(product.offer_unit_price) + "/pièce" : "");
  $("#detailImage").src = images[0] || "";
  $("#detailImage").classList.remove("zoomed");
  $("#detailImage").onclick = () => $("#detailImage").classList.toggle("zoomed");
  $("#detailThumbs").innerHTML = images.map((src, index) =>
    '<button class="detail-thumb ' + (index === 0 ? "active" : "") + '" data-detail-image="' + index + '" type="button"><img src="' + escapeHtml(src) + '" alt="' + escapeHtml(product.name) + '"></button>'
  ).join("");
  document.querySelectorAll("[data-detail-image]").forEach((button) => {
    button.onclick = () => {
      $("#detailImage").src = images[Number(button.dataset.detailImage)];
      document.querySelectorAll("[data-detail-image]").forEach((thumb) => thumb.classList.remove("active"));
      button.classList.add("active");
    };
  });

  const videoWrap = $("#detailVideoWrap");
  const video = $("#detailVideo");
  if (product.video_url) {
    video.src = product.video_url;
    $("#detailVideoSource").href = product.video_source_url || product.video_url;
    videoWrap.classList.remove("hidden");
  } else {
    video.removeAttribute("src");
    videoWrap.classList.add("hidden");
  }

  $("#detailAddCart").onclick = () => {
    const existing = state.cart.get(product.id);
    const quantity = Math.min(20, (existing?.quantity || 0) + 1);
    state.cart.set(product.id, { product, quantity });
    renderCart();
    $("#productModal").classList.add("hidden");
    $("#cartDrawer").classList.remove("hidden");
  };
  $("#productModal").classList.remove("hidden");
}

$("#detailClose").onclick = () => {
  $("#detailVideo").pause();
  $("#productModal").classList.add("hidden");
};
$("#productModal").addEventListener("click", (event) => {
  if (event.target.id === "productModal") {
    $("#detailVideo").pause();
    $("#productModal").classList.add("hidden");
  }
});

function renderCart() {
  const items = [...state.cart.values()];
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce((sum, item) => sum + unitPriceFor(item.product, item.quantity) * item.quantity, 0);
  const city = document.querySelector("#checkoutForm [name=city]")?.value?.trim().toLowerCase() || "";
  const matchedRate = state.shippingRates.find(r => r.city.trim().toLowerCase() === city);
  const delivery = matchedRate ? Number(matchedRate.fee) : Number(state.settings.delivery_fee || 0);

  $("#cartCount").textContent = count;
  $("#cartSubtotal").textContent = money(subtotal);
  $("#cartDelivery").textContent = delivery ? money(delivery) : "GRATUITE";
  $("#cartTotal").textContent = money(subtotal + delivery);
  $("#cartItems").innerHTML = items.map((item) =>
    '<div class="cart-item"><img class="cart-item-image" src="' + escapeHtml(item.product.image_url || '') + '" alt="' + escapeHtml(item.product.name) + '" loading="lazy"><div class="cart-item-info"><b>' + escapeHtml(item.product.name) + '</b><small>' + money(item.product.price) + ' / unité</small><div class="cart-item-controls"><button type="button" data-minus="' + item.product.id + '" aria-label="Diminuer">−</button><span>' + item.quantity + '</span><button type="button" data-plus="' + item.product.id + '" aria-label="Augmenter">+</button><button type="button" class="cart-remove" data-remove="' + item.product.id + '">Supprimer</button></div></div><strong>' + money(unitPriceFor(item.product, item.quantity) * item.quantity) + '</strong></div>'
  ).join("") || "Votre panier est vide.";

  document.querySelectorAll("[data-minus],[data-plus],[data-remove]").forEach((button) => {
    button.onclick = () => {
      const id = button.dataset.minus || button.dataset.plus || button.dataset.remove;
      const item = state.cart.get(id);
      if (!item) return;
      if (button.dataset.remove) state.cart.delete(id);
      else if (button.dataset.plus) item.quantity = Math.min(20, item.quantity + 1);
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

  const cityValue = String(form.get("city") || "").trim();
  const matchedRate = state.shippingRates.find(r => r.city.trim().toLowerCase() === cityValue.toLowerCase());
  const delivery = matchedRate ? Number(matchedRate.fee) : Number(state.settings.delivery_fee || 0);
  let subtotal = items.reduce((sum, item) => sum + unitPriceFor(item.product, item.quantity) * item.quantity, 0);
  let total = subtotal + delivery;

  const orderGroupId = crypto.randomUUID();
  const submitButton = $("#submitOrder");
  submitButton.disabled = true;

  try {
    const ids = items.map(item => item.product.id);
    const { data: latestProducts, error: stockError } = await db.from("products").select("id,name,price,stock,active,offer_min_qty,offer_unit_price").in("id", ids);
    if (stockError) throw stockError;
    for (const item of items) {
      const latest = latestProducts.find(p => p.id === item.product.id);
      if (!latest || !latest.active) throw new Error("Le produit " + item.product.name + " n’est plus disponible.");
      if (Number(latest.stock) > 0 && item.quantity > Number(latest.stock)) throw new Error("Stock insuffisant pour " + latest.name + ". Quantité disponible : " + latest.stock);
      item.product.price = Number(latest.price);
      item.product.offer_min_qty = latest.offer_min_qty;
      item.product.offer_unit_price = latest.offer_unit_price;
    }
    subtotal = items.reduce((sum, item) => sum + unitPriceFor(item.product, item.quantity) * item.quantity, 0);
    total = subtotal + delivery;
    const rows = items.map((item, index) => ({
      order_group_id: orderGroupId,
      customer_name: form.get("name"),
      phone,
      city: form.get("city"),
      address: form.get("address"),
      product_id: item.product.id,
      product_name: item.product.name,
      quantity: item.quantity,
      unit_price: unitPriceFor(item.product, item.quantity),
      delivery_fee: index === 0 ? delivery : 0,
      total: item.product.price * item.quantity + (index === 0 ? delivery : 0),
      status: "pending",
      whatsapp_sent: false
    }));

    const { error } = await db.from("orders").insert(rows);
    if (error) throw error;

    const message = [
      "Bonjour MAROOC.SHOP, voici ma commande :",
      ...items.map((item) => item.product.name + " × " + item.quantity + " — " + money(unitPriceFor(item.product, item.quantity) * item.quantity)),
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
