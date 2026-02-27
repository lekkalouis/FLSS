(() => {
  const side = document.getElementById('flssSidenav');
  if (!side) return;

  const links = [
    ['Dashboard', '/'],
    ['Stock Take', '/stock.html'],
    ['POS Walk-In', '/pos.html'],
    ['Price Manager', '/price-manager.html'],
    ['Purchase Orders', '/purchase-orders.html'],
    ['Traceability', '/traceability.html'],
    ['Shipping Matrix', '/shipping-matrix.html'],
    ['Order Capture', '/order-capture-custom.html'],
    ['Customer Accounts', '/customer-accounts.html'],
    ['Liquid Templates', '/liquid-templates.html'],
    ['Notification Templates', '/notification-templates.html']
  ];

  const current = window.location.pathname;
  side.innerHTML = `
    <div class="flss-brand">FLSS OneUI</div>
    <nav class="flss-nav">
      ${links.map(([label, href]) => {
        const active = current === href || (href === '/' && current === '/index.html');
        return `<a href="${href}" class="${active ? 'is-active' : ''}">${label}</a>`;
      }).join('')}
    </nav>
  `;
})();
