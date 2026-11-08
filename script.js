import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const supabase = createClient(window.MAROOOC_SUPABASE_URL, window.MAROOOC_SUPABASE_KEY);
const PRICE = 249;
const WHATSAPP_NUMBER = "212656219486";
let quantity = 1;
const quantityOutput = document.getElementById("quantity");
const subtotalOutput = document.getElementById("subtotal");
const totalOutput = document.getElementById("total");
const errorOutput = document.getElementById("formError");
function updateTotal() {
  quantityOutput.textContent = quantity;
  const total = PRICE * quantity;
  subtotalOutput.textContent = total + " DH";
  totalOutput.textContent = total + " DH";
}
document.getElementById("minus").addEventListener("click", () => { quantity = Math.max(1, quantity - 1); updateTotal(); });
document.getElementById("plus").addEventListener("click", () => { quantity = Math.min(20, quantity + 1); updateTotal(); });
document.getElementById("year").textContent = new Date().getFullYear();

document.getElementById("orderForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  errorOutput.textContent = "";
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  const name = String(data.get("name") || "").trim();
  const phone = String(data.get("phone") || "").trim();
  const city = String(data.get("city") || "").trim();
  const address = String(data.get("address") || "").trim();
  const phoneDigits = phone.replace(/[\\s().+-]/g, "");
  if (!/^(0[5-7]\\d{8}|212[5-7]\\d{8})$/.test(phoneDigits)) {
    errorOutput.textContent = "Veuillez saisir un numéro marocain valide (06XXXXXXXX).";
    return;
  }
  const total = PRICE * quantity;
  const message = [
    "Bonjour MAROOC.SHOP, je souhaite confirmer cette commande :",
    "",
    "Produit : Smart Laundry Cup (violet)",
    "Quantité : " + quantity,
    "Prix unitaire : " + PRICE + " DH",
    "Livraison : GRATUITE",
    "Total à payer : " + total + " DH",
    "",
    "Nom complet : " + name,
    "Téléphone : " + phone,
    "Ville : " + city,
    "Adresse : " + address
  ].join("\\n");
  const whatsappUrl = "https://wa.me/" + WHATSAPP_NUMBER + "?text=" + encodeURIComponent(message);

  try {
    const { data: product } = await supabase.from("products").select("id").eq("slug", "smart-laundry-cup").maybeSingle();
    const { error } = await supabase.from("orders").insert({
      customer_name: name,
      phone,
      city,
      address,
      product_id: product?.id ?? null,
      product_name: "Smart Laundry Cup",
      quantity,
      unit_price: PRICE,
      delivery_fee: 0,
      total,
      status: "pending",
      whatsapp_sent: false
    });
    if (error) throw error;
  } catch (err) {
    console.error("Order storage failed:", err);
    errorOutput.textContent = "La sauvegarde automatique a échoué. WhatsApp va quand même s'ouvrir pour ne pas perdre votre commande.";
  }
  const opened = window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  if (!opened) window.location.href = whatsappUrl;
});
updateTotal();
