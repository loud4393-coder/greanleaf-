// @ts-nocheck
const API_URL = window.location.origin;

function apiFetch(path, options = {}) {
    const headers = new Headers(options.headers || {});
    const initData = tg.initData || "";
    if (initData) headers.set("X-Telegram-Init-Data", initData);
    return fetch(`${API_URL}${path}`, { ...options, headers });
}
let isAdmin = false;

// Безопасная инициализация Telegram WebApp
const tg = window.Telegram?.WebApp || {
    expand: () => {},
    ready: () => {},
    sendData: (data) => console.log("Fallback sendData:", data),
    showAlert: (msg) => alert(msg),
    initDataUnsafe: { user: { id: "123456789" } }
};

tg.expand();
tg.ready();

let currentLang = 'ru';
let currentView = 'catalog';
let activeCategory = 'all';
let searchQuery = '';
let cart = {};

// Избранное с сохранением в память устройства
let favorites = new Set(JSON.parse(localStorage.getItem('app_favorites') || '[]'));
function saveFavorites() {
    localStorage.setItem('app_favorites', JSON.stringify(Array.from(favorites)));
}

let activeShippingType = 'pickup';
let selectedVelayat = 'ahal';
let activeProduct = null;
let selectedVolume = '';

let products = [];
let reviewsData = {};
let ordersData = [];

const i18n = {
    ru: {
        navCatalog: "Каталог",
        navCategories: "Категории",
        navFavorites: "Избранное",
        navCart: "Корзина",
        bannerTitle: "Органика & Эко-Инновации",
        bannerDesc: "Премиальный уход за кожей с доставкой по всему Туркменистану",
        emptyFavorites: "Список избранного пуст",
        emptyCart: "Ваша корзина пуста",
        labelPhone: "Номер телефона (+993...)",
        labelShipping: "Способ доставки",
        optPickup: "Самовывоз (0 TMT)",
        optCity: "Курьером по городу (20 TMT)",
        optIntercity: "Межгород (Welaýatara)",
        pickupInfo: "Пункт выдачи: г. Ашхабад, ТРЦ «Беркарар», 1-й этаж",
        addressLabel: "Адрес доставки",
        velayatLabel: "Выберите велаят",
        etrapLabel: "Этрап / Город",
        velayats: {
            ahal: "Ахалский",
            balkan: "Балканский",
            dashoguz: "Дашогузский",
            lebap: "Лебапский",
            mary: "Марыйский"
        },
        categories: {
            all: "Все товары",
            face: "Уход за лицом",
            makeup: "Декоративная косметика",
            perfume: "Парфюмерия",
            home: "Eco Home",
            health: "Здоровье"
        },
        ingredients: "Состав",
        addReview: "Оставить отзыв",
        reviewsTitle: "Отзывы покупателей",
        inStock: "В наличии",
        outOfStock: "Нет в наличии",
        btnAddCart: "Добавить в корзину",
        btnBack: "Назад",
        btnOrder: "Оформить заказ"
    },
    tk: {
        navCatalog: "Katalog",
        navCategories: "Kategoriýalar",
        navFavorites: "Saýlananlar",
        navCart: "Sebet",
        bannerTitle: "Organika & Eko-Innowasiýalar",
        bannerDesc: "Tutuş Türkmenistan boýunça eltip bermek hyzmaty bilen",
        emptyFavorites: "Saýlanan haryt ýok",
        emptyCart: "Sebediňiz boş",
        labelPhone: "Telefon belgiňiz (+993...)",
        labelShipping: "Eltip bermek görnüşi",
        optPickup: "Özüň alyp gitmek (0 TMT)",
        optCity: "Şäher içi (20 TMT)",
        optIntercity: "Welaýatara eltip bermek",
        pickupInfo: "Mekanymyz: Aşgabat ş., «Berkarar» SOW, 1-nji gat",
        addressLabel: "Eltip bermeli salgy",
        velayatLabel: "Welaýaty saýlaň",
        etrapLabel: "Etrap / Şäher",
        velayats: {
            ahal: "Ahal welaýaty",
            balkan: "Balkan welaýaty",
            dashoguz: "Daşoguz welaýaty",
            lebap: "Lebap welaýaty",
            mary: "Mary welaýaty"
        },
        categories: {
            all: "Ähli harytlar",
            face: "Ýüz üçin ideg",
            makeup: "Dekoratiw kosmetika",
            perfume: "Parfumeriýa",
            home: "Eco Home",
            health: "Saglyk"
        },
        ingredients: "Sostawy",
        addReview: "Syn ýazmak",
        reviewsTitle: "Satyjy synlary",
        inStock: "Ammarda bar",
        outOfStock: "Ammarda ýok",
        btnAddCart: "Sebede goşmak",
        btnBack: "Yza",
        btnOrder: "Sargyt etmek"
    }
};

async function initApp() {
    await checkAdminAccess();
    renderCategoriesView();
    await fetchProductsFromBackend();
    await fetchReviewsFromBackend();
    renderCatalog();
    applyLanguage();
    updateBadges();
}

async function fetchProductsFromBackend() {
    try {
        const response = await apiFetch("/api/products");
        if (response.ok) {
            products = await response.json();
        }
    } catch (e) {
        console.error("Ошибка загрузки товаров с сервера", e);
    }
}

async function fetchReviewsFromBackend() {
    try {
        const response = await apiFetch("/api/reviews");
        if (response.ok) {
            reviewsData = await response.json();
        }
    } catch (e) {
        console.error("Ошибка загрузки отзывов с сервера", e);
    }
}

async function checkAdminAccess() {
    try {
        const response = await apiFetch("/api/session");
        if (!response.ok) return;
        const session = await response.json();
        isAdmin = Boolean(session.is_admin);
        if (isAdmin) {
            document.getElementById('nav-admin')?.classList.remove('hidden');
            await fetchAdminOrders();
        }
    } catch (e) {
        console.error("Не удалось проверить права администратора", e);
    }
}

function switchView(viewName) {
    currentView = viewName;
    document.querySelectorAll('.view-page').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    const activeNav = document.getElementById(`nav-${viewName}`);
    if (activeNav) activeNav.classList.add('active');

    const viewEl = document.getElementById(`${viewName}-view`);
    if (viewEl) viewEl.classList.add('active');

    if (viewName === 'favorites') renderFavorites();
    if (viewName === 'cart') renderCartView();
    if (viewName === 'admin') {
        if (!ordersData.length) fetchAdminOrders();
        renderAdminOrders();
    }

    window.scrollTo(0, 0);
}

function handleSearch() {
    searchQuery = document.getElementById('search-input').value.toLowerCase().trim();
    if (currentView !== 'catalog') switchView('catalog');
    renderCatalog();
}

function renderCatalog() {
    const grid = document.getElementById('catalog-grid');
    if (!grid) return;
    grid.innerHTML = '';

    let items = products.filter(p => {
        const matchesCategory = activeCategory === 'all' || p.category === activeCategory;
        const name = (currentLang === 'ru' ? p.name_ru : p.name_tk).toLowerCase();
        return matchesCategory && name.includes(searchQuery);
    });

    items.forEach(product => grid.appendChild(createProductCard(product)));
}

function createProductCard(product) {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.onclick = () => openProductDetail(product.id);

    const title = currentLang === 'ru' ? product.name_ru : product.name_tk;
    const isFav = favorites.has(product.id);
    const admin = isAdmin;

    card.innerHTML = `
        <button class="btn-fav-card ${isFav ? 'active' : ''}" onclick="toggleFavorite(${product.id}, event)">
            <svg class="icon-svg" viewBox="0 0 24 24"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
        </button>
        <img src="${product.image}" class="product-image" loading="lazy">
        <div>
            <div class="product-title">${title}</div>
            <div class="product-price">${product.price} TMT</div>
            ${!product.inStock ? `<div class="out-of-stock-badge">${i18n[currentLang].outOfStock}</div>` : ''}
        </div>
        <button class="btn-card-action">${i18n[currentLang].btnAddCart}</button>
        ${admin ? `
            <div class="admin-card-controls" onclick="event.stopPropagation()">
                <button class="btn-admin-action" onclick="openProductModal(${product.id})">✏️</button>
                <button class="btn-admin-action" onclick="deleteProduct(${product.id})">🗑️</button>
                <button class="btn-admin-action" onclick="toggleStock(${product.id})">${product.inStock ? '📦' : '🚫'}</button>
            </div>
        ` : ''}
    `;
    return card;
}

function renderCategoriesView() {
    const grid = document.getElementById('categories-grid');
    if (!grid) return;
    grid.innerHTML = '';

    Object.keys(i18n[currentLang].categories).forEach(key => {
        if (key === 'all') return;
        const card = document.createElement('div');
        card.className = 'category-card';
        card.onclick = () => {
            activeCategory = key;
            switchView('catalog');
            renderCatalog();
        };
        card.innerHTML = `
            <span>${i18n[currentLang].categories[key]}</span>
            <svg class="icon-svg" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>
        `;
        grid.appendChild(card);
    });
}

function openProductDetail(productId) {
    activeProduct = products.find(p => p.id === productId);
    if (!activeProduct) return;

    selectedVolume = activeProduct.volumes?.[0] || '';
    renderProductDetail();
    switchView('product');
}

function renderProductDetail() {
    const container = document.getElementById('detail-card-content');
    if (!container) return;
    const title = currentLang === 'ru' ? activeProduct.name_ru : activeProduct.name_tk;
    const desc = currentLang === 'ru' ? activeProduct.desc_ru : activeProduct.desc_tk;
    const isFav = favorites.has(activeProduct.id);

    const volumesHTML = activeProduct.volumes ? `
        <div class="volume-chips">
            ${activeProduct.volumes.map(v => `
                <div class="chip ${v === selectedVolume ? 'selected' : ''}" onclick="selectedVolume='${v}'; renderProductDetail();">${v}</div>
            `).join('')}
        </div>
    ` : '';

    const productReviews = reviewsData[activeProduct.id] || [];
    const avgRating = productReviews.length 
        ? (productReviews.reduce((sum, r) => sum + r.rating, 0) / productReviews.length).toFixed(1) 
        : "5.0";

    container.innerHTML = `
        <div style="position:relative;">
            <button class="btn-fav-card ${isFav ? 'active' : ''}" style="top:10px; right:10px;" onclick="toggleFavorite(${activeProduct.id}, event)">
                <svg class="icon-svg" viewBox="0 0 24 24"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
            </button>
            <img src="${activeProduct.image}" class="main-gallery-img">
        </div>
        <h2>${title}</h2>
        <div class="product-price" style="font-size: 20px; margin: 8px 0;">${activeProduct.price} TMT</div>
        
        ${volumesHTML}

        <p style="font-size: 13px; line-height: 1.5; color: var(--text-muted); margin-bottom: 12px;">${desc}</p>
        
        ${activeProduct.ingredients_ru ? `
            <div style="font-size: 12px; margin-bottom: 16px;">
                <strong>${i18n[currentLang].ingredients}:</strong>${activeProduct.ingredients_ru}
            </div>
        ` : ''}

        <button class="btn-add-detail" onclick="addToCartFromDetail()">
            ${i18n[currentLang].btnAddCart} • ${activeProduct.price} TMT
        </button>

        <div class="reviews-section">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px;">
                <h3>${i18n[currentLang].reviewsTitle} (${avgRating} ★)</h3>
            </div>
            
            <div id="reviews-list">
                ${productReviews.map(r => `
                    <div class="review-item">
                        <div class="review-header">
                            <strong>${r.user}</strong>
                            <span class="rating-stars">${'★'.repeat(r.rating)}</span>
                        </div>
                        <p style="font-size: 12px;">${r.text}</p>
                    </div>
                `).join('')}
            </div>

            <form onsubmit="submitReview(event)" style="margin-top: 16px;">
                <div class="form-group">
                    <label class="form-label">${i18n[currentLang].addReview}</label>
                    <select id="review-rating" class="form-select" style="margin-bottom: 8px;">
                        <option value="5">5 ★★★★★</option>
                        <option value="4">4 ★★★★☆</option>
                        <option value="3">3 ★★★☆☆</option>
                    </select>
                    <textarea id="review-text" class="form-textarea" placeholder="Ваш отзыв..." required></textarea>
                </div>
                <button type="submit" class="btn-card-action" style="background: var(--primary-emerald); color:#FFF;">Отправить</button>
            </form>
        </div>
    `;
}

async function submitReview(event) {
    event.preventDefault();
    const rating = parseInt(document.getElementById('review-rating').value);
    const text = document.getElementById('review-text').value.trim();
    const user = tg.initDataUnsafe?.user?.first_name || "Покупатель";

    const newReview = { id: Date.now(), user, rating, text };

    try {
        const response = await apiFetch("/api/reviews", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ product_id: activeProduct.id, review: newReview })
        });
        if (response.ok) {
            await fetchReviewsFromBackend();
            renderProductDetail();
        }
    } catch (e) {
        tg.showAlert("Не удалось сохранить отзыв.");
    }
}

function toggleFavorite(id, event) {
    if (event) event.stopPropagation();
    favorites.has(id) ? favorites.delete(id) : favorites.add(id);
    saveFavorites();
    
    updateBadges();
    if (currentView === 'catalog') renderCatalog();
    if (currentView === 'favorites') renderFavorites();
    if (currentView === 'product') renderProductDetail();
}

function renderFavorites() {
    const grid = document.getElementById('favorites-grid');
    if (!grid) return;
    grid.innerHTML = '';
    
    let favProducts = products.filter(p => favorites.has(p.id));
    if (!favProducts.length) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 40px;">${i18n[currentLang].emptyFavorites}</div>`;
        return;
    }
    favProducts.forEach(p => grid.appendChild(createProductCard(p)));
}

function addToCartFromDetail() {
    const key = `${activeProduct.id}_${selectedVolume}`;
    if (cart[key]) {
        cart[key].qty++;
    } else {
        cart[key] = { product: activeProduct, volume: selectedVolume, qty: 1 };
    }
    updateBadges();
    switchView('cart');
}

function updateBadges() {
    const favBadge = document.getElementById('fav-badge');
    const cartBadge = document.getElementById('cart-badge');
    
    if (favBadge) {
        favBadge.innerText = favorites.size;
        favBadge.classList.toggle('hidden', favorites.size === 0);
    }

    if (cartBadge) {
        const cartCount = Object.values(cart).reduce((sum, item) => sum + item.qty, 0);
        cartBadge.innerText = cartCount;
        cartBadge.classList.toggle('hidden', cartCount === 0);
    }
}

function renderCartView() {
    const container = document.getElementById('cart-content');
    if (!container) return;
    const t = i18n[currentLang];
    const items = Object.values(cart);

    if (!items.length) {
        container.innerHTML = `<div style="text-align:center; padding: 20px;">${t.emptyCart}</div>`;
        return;
    }

    const subtotal = items.reduce((sum, i) => sum + (i.product.price * i.qty), 0);
    const shippingCost = activeShippingType === 'city' ? 20 : 0;

    container.innerHTML = `
        <div style="margin-bottom: 16px;">
            ${items.map(i => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding: 8px 0; border-bottom:1px solid var(--border-color);">
                    <div>
                        <div><strong>${currentLang === 'ru' ? i.product.name_ru : i.product.name_tk}</strong></div>
                        <div style="font-size:12px; color:var(--text-muted);">${i.volume || ''}</div>
                    </div>
                    <div>${i.qty} x${i.product.price} TMT</div>
                </div>
            `).join('')}
        </div>

        <div class="form-group">
            <label class="form-label">${t.labelPhone}</label>
            <input type="tel" id="checkout-phone" class="form-input" value="+993">
        </div>

        <div class="form-group">
            <label class="form-label">${t.labelShipping}</label>
            <select class="form-select" onchange="activeShippingType=this.value; renderCartView();">
                <option value="pickup" ${activeShippingType==='pickup'?'selected':''}>${t.optPickup}</option>
                <option value="city" ${activeShippingType==='city'?'selected':''}>${t.optCity}</option>
                <option value="intercity" ${activeShippingType==='intercity'?'selected':''}>${t.optIntercity}</option>
            </select>
        </div>

        ${renderShippingSubfields()}

        <div style="margin-top:16px; font-weight:bold; font-size:16px;">
            Итого: ${subtotal + shippingCost} TMT
        </div>

        <button class="btn-add-detail" onclick="processOrder()">${t.btnOrder}</button>
    `;
}

function renderShippingSubfields() {
    const t = i18n[currentLang];
    if (activeShippingType === 'pickup') {
        return `<div style="font-size:12px; color:var(--primary-emerald);">${t.pickupInfo}</div>`;
    }
    if (activeShippingType === 'city') {
        return `
            <div class="form-group">
                <label class="form-label">${t.addressLabel}</label>
                <input type="text" id="checkout-address" class="form-input">
            </div>
        `;
    }
    if (activeShippingType === 'intercity') {
        return `
            <div class="form-group">
                <label class="form-label">${t.velayatLabel}</label>
                <select id="checkout-velayat" class="form-select">
                    ${Object.keys(t.velayats).map(k => `<option value="${k}">${t.velayats[k]}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">${t.etrapLabel}</label>
                <input type="text" id="checkout-etrap" class="form-input">
            </div>
        `;
    }
}

async function processOrder() {
    const phone = document.getElementById('checkout-phone')?.value?.trim();
    if (!phone || phone.length < 8) {
        tg.showAlert("Введите корректный номер!");
        return;
    }

    const cartItems = Object.values(cart);
    const cartArray = cartItems.map(i => {
        const name = currentLang === 'ru' ? i.product.name_ru : i.product.name_tk;
        return {
            title: `${name}${i.volume ? ' (' + i.volume + ')' : ''}`,
            price: i.product.price,
            quantity: i.qty
        };
    });

    const shippingType = activeShippingType;
    const address = document.getElementById('checkout-address')?.value?.trim() || '';
    const velayat = document.getElementById('checkout-velayat')?.value || '';
    const etrap = document.getElementById('checkout-etrap')?.value?.trim() || '';
    if (shippingType === 'city' && !address) {
        tg.showAlert("Укажите адрес доставки.");
        return;
    }
    if (shippingType === 'intercity' && (!velayat || !etrap)) {
        tg.showAlert("Укажите велаят и город/этрап.");
        return;
    }

    const payload = {
        cart: cartArray,
        user: {
            phone,
            shipping_type: shippingType,
            city: shippingType === 'city' ? 'Ашхабад' : '',
            address,
            velayat,
            etrap
        }
    };

    try {
        const response = await apiFetch("/api/order", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const result = await response.json();
            tg.showAlert(`🌱 Заказ #${result.order_id} принят! Информация отправлена владельцу.`);
            cart = {};
            updateBadges();
            switchView('catalog');
            if (isAdmin) await fetchAdminOrders();
        } else {
            const data = await response.json().catch(() => ({}));
            tg.showAlert(data.error || "Не удалось отправить заказ. Попробуйте еще раз.");
        }
    } catch (e) {
        console.error("Ошибка при заказе:", e);
        tg.showAlert("Ошибка соединения с сервером.");
    }
}

async function fetchAdminOrders() {
    if (!isAdmin) return;
    try {
        const response = await apiFetch("/api/orders");
        if (!response.ok) return;
        ordersData = await response.json();
        renderAdminOrders();
    } catch (e) {
        console.error("Не удалось загрузить заказы", e);
    }
}

const ORDER_STATUSES = {
    new: { label: 'Новый', next: 'processing' },
    processing: { label: 'В работе', next: 'delivery' },
    delivery: { label: 'Доставка', next: 'completed' },
    completed: { label: 'Выполнен', next: null },
    cancelled: { label: 'Отменён', next: null }
};

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}

function formatOrderDate(value) {
    try { return new Date(value).toLocaleString('ru-RU'); } catch { return value; }
}

async function setOrderStatus(orderId, status) {
    try {
        const response = await apiFetch(`/api/orders/${orderId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            tg.showAlert(data.error || 'Не удалось изменить статус');
            return;
        }
        const order = ordersData.find(o => o.id === orderId);
        if (order) order.status = status;
        renderAdminOrders();
    } catch (e) {
        tg.showAlert('Ошибка соединения с сервером.');
    }
}

function renderAdminOrders() {
    const container = document.getElementById('admin-orders-list');
    const stats = document.getElementById('admin-stats');
    if (!container) return;

    const counts = { new:0, processing:0, delivery:0, completed:0, cancelled:0 };
    ordersData.forEach(o => counts[o.status] = (counts[o.status] || 0) + 1);
    if (stats) {
        stats.innerHTML = `
            <div class="admin-stat"><strong>${counts.new}</strong><span>Новые</span></div>
            <div class="admin-stat"><strong>${counts.processing}</strong><span>В работе</span></div>
            <div class="admin-stat"><strong>${counts.delivery}</strong><span>Доставка</span></div>
            <div class="admin-stat"><strong>${counts.completed}</strong><span>Готово</span></div>
        `;
    }

    const query = (document.getElementById('admin-order-search')?.value || '').trim().toLowerCase();
    const filter = document.getElementById('admin-order-filter')?.value || 'all';
    const filtered = ordersData.filter(o => {
        const haystack = [o.id, o.user, o.username, o.phone, o.city, o.address, o.velayat, o.etrap].join(' ').toLowerCase();
        return (filter === 'all' || o.status === filter) && (!query || haystack.includes(query));
    });

    if (!filtered.length) {
        container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted);">Заказов по этому фильтру нет.</div>';
        return;
    }

    container.innerHTML = filtered.map(o => {
        const status = ORDER_STATUSES[o.status] || { label: o.status, next: null };
        const items = (o.items || []).map(i => `<li>${escapeHtml(i.title)} × ${i.quantity} — ${Number(i.cost || i.price * i.quantity).toFixed(2)} TMT</li>`).join('');
        const delivery = o.shipping_type === 'pickup'
            ? 'Самовывоз'
            : `${escapeHtml(o.city || '')}${o.address ? `, ${escapeHtml(o.address)}` : ''}${o.velayat ? `, ${escapeHtml(o.velayat)}` : ''}${o.etrap ? `, ${escapeHtml(o.etrap)}` : ''}`;
        const nextButton = status.next ? `<button onclick="setOrderStatus(${o.id}, '${status.next}')">${ORDER_STATUSES[status.next].label}</button>` : '';
        const cancelButton = !['completed','cancelled'].includes(o.status) ? `<button onclick="setOrderStatus(${o.id}, 'cancelled')">Отменить</button>` : '';
        return `
            <div class="order-card">
                <div class="order-head">
                    <div><strong>#${o.id} · ${escapeHtml(o.user)}</strong><div class="order-meta">${formatOrderDate(o.created_at)} · @${escapeHtml(o.username || 'нет')}</div></div>
                    <span class="status-pill">${status.label}</span>
                </div>
                <div class="order-total">${Number(o.total).toFixed(2)} TMT</div>
                <ul class="order-items">${items}</ul>
                <div class="order-address"><strong>📍 Доставка:</strong><br>${delivery || 'Не указана'}<br>📞 ${escapeHtml(o.phone)}</div>
                <div class="order-actions">${nextButton}${cancelButton}</div>
            </div>`;
    }).join('');
}
 {
    const container = document.getElementById('admin-orders-list');
    if (!container) return;
    container.innerHTML = `
        <h3>Список Заказов</h3>
        ${ordersData.map(o => `
            <div style="background:var(--bg-main); padding:12px; border-radius:8px; border:1px solid var(--border-color); margin-top:8px;">
                <div><strong>Заказ #${o.id}</strong> —${o.user}</div>
                <div>Сумма: ${o.total} \vert{} Статус: <strong>${o.status}</strong></div>
            </div>
        `).join('')}
    `;
}

function openProductModal(id = null) {
    document.getElementById('product-modal')?.classList.add('active');
    const fileInput = document.getElementById('prod-file');
    if (fileInput) fileInput.value = '';

    if (id) {
        const p = products.find(prod => prod.id === id);
        if (!p) return;
        document.getElementById('prod-id').value = p.id;
        document.getElementById('prod-name-ru').value = p.name_ru;
        document.getElementById('prod-name-tk').value = p.name_tk;
        document.getElementById('prod-price').value = p.price;
        document.getElementById('prod-category').value = p.category;
        document.getElementById('prod-image').value = p.image || '';
        document.getElementById('prod-volumes').value = p.volumes ? p.volumes.join(', ') : '';
        document.getElementById('prod-desc-ru').value = p.desc_ru || '';
        document.getElementById('prod-ingredients-ru').value = p.ingredients_ru || '';
    } else {
        document.getElementById('product-form')?.reset();
        document.getElementById('prod-id').value = '';
        document.getElementById('prod-image').value = '';
    }
}

function closeProductModal() {
    document.getElementById('product-modal')?.classList.remove('active');
}

async function saveProduct(event) {
    event.preventDefault();

    let imageUrl = document.getElementById('prod-image')?.value || '';
    const fileInput = document.getElementById('prod-file');

    // Если фото выбрали из галереи - отправляем на бэкенд
    if (fileInput && fileInput.files && fileInput.files[0]) {
        const formData = new FormData();
        formData.append('image', fileInput.files[0]);

        try {
            const uploadRes = await apiFetch("/api/upload", {
                method: 'POST',
                body: formData
            });

            if (uploadRes.ok) {
                const uploadData = await uploadRes.json();
                imageUrl = uploadData.url;
            } else {
                tg.showAlert("Ошибка при загрузке фото из галереи");
                return;
            }
        } catch (e) {
            tg.showAlert("Не удалось загрузить фото на сервер.");
            return;
        }
    }

    if (!imageUrl) {
        imageUrl = "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600";
    }

    const id = document.getElementById('prod-id').value;
    const productData = {
        id: id ? parseInt(id) : Date.now(),
        name_ru: document.getElementById('prod-name-ru').value,
        name_tk: document.getElementById('prod-name-tk').value,
        price: parseFloat(document.getElementById('prod-price').value),
        category: document.getElementById('prod-category').value,
        image: imageUrl,
        inStock: true,
        volumes: document.getElementById('prod-volumes').value ? document.getElementById('prod-volumes').value.split(',').map(v => v.trim()) : ["30 мл"],
        desc_ru: document.getElementById('prod-desc-ru').value,
        ingredients_ru: document.getElementById('prod-ingredients-ru').value
    };

    try {
        const res = await apiFetch("/api/products", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(productData)
        });
        if (res.ok) {
            await fetchProductsFromBackend();
            closeProductModal();
            renderCatalog();
        } else {
            tg.showAlert("Ошибка сохранения товара на сервере.");
        }
    } catch (e) {
        tg.showAlert("Ошибка соединения с сервером.");
    }
}

async function deleteProduct(id) {
    try {
        const res = await apiFetch(`/api/products/${id}`, { method: 'DELETE' });
        if (res.ok) {
            await fetchProductsFromBackend();
            renderCatalog();
        }
    } catch (e) {
        tg.showAlert("Ошибка удаления товара.");
    }
}

async function toggleStock(id) {
    const p = products.find(prod => prod.id === id);
    if (!p) return;
    p.inStock = !p.inStock;
    
    try {
        await apiFetch("/api/products", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(p)
        });
        await fetchProductsFromBackend();
        renderCatalog();
    } catch (e) {
        console.error(e);
    }
}

function switchLanguage(lang) {
    currentLang = lang;
    document.getElementById('btn-ru')?.classList.toggle('active', lang === 'ru');
    document.getElementById('btn-tk')?.classList.toggle('active', lang === 'tk');
    applyLanguage();
}

function applyLanguage() {
    const t = i18n[currentLang];
    if (document.getElementById('banner-title')) document.getElementById('banner-title').innerText = t.bannerTitle;
    if (document.getElementById('banner-desc')) document.getElementById('banner-desc').innerText = t.bannerDesc;
    if (document.getElementById('nav-label-catalog')) document.getElementById('nav-label-catalog').innerText = t.navCatalog;
    if (document.getElementById('nav-label-categories')) document.getElementById('nav-label-categories').innerText = t.navCategories;
    if (document.getElementById('nav-label-fav')) document.getElementById('nav-label-fav').innerText = t.navFavorites;
    if (document.getElementById('nav-label-cart')) document.getElementById('nav-label-cart').innerText = t.navCart;
    if (document.getElementById('btn-back-text')) document.getElementById('btn-back-text').innerText = t.btnBack;
    
    renderCategoriesView();
    renderCatalog();
    if (currentView === 'product') renderProductDetail();
}

document.addEventListener('DOMContentLoaded', initApp);
