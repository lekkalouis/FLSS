const CATALOG_GROUPS = [
  {
    title: "Containers, Lids and Bags",
    items: [
      { sku: "FLB100", title: "100ml PET Bottle", uom: "box", category: "Containers, Lids and Bags", flavour: "", icon: "🧴" },
      { sku: "FLB200", title: "200ml PET Bottle", uom: "box", category: "Containers, Lids and Bags", flavour: "", icon: "🧴" },
      { sku: "FL-CAP-O", title: "Flip Lid Cap / Orange", uom: "box", category: "Containers, Lids and Bags", flavour: "Orange", icon: "🟠" },
      { sku: "FL-CAP-R", title: "Flip Lid Cap / Red", uom: "box", category: "Containers, Lids and Bags", flavour: "Red", icon: "🔴" },
      { sku: "FL-CAP-P", title: "Flip Lid Cap / Purple", uom: "box", category: "Containers, Lids and Bags", flavour: "Purple", icon: "🟣" },
      { sku: "FL-CAP-LB", title: "Flip Lid Cap / Light Blue", uom: "box", category: "Containers, Lids and Bags", flavour: "Light Blue", icon: "🔵" },
      { sku: "FL-CAP-BRN", title: "Flip Lid Cap / Brown", uom: "box", category: "Containers, Lids and Bags", flavour: "Brown", icon: "🟤" }
    ]
  },
  {
    title: "Raw herbs, spices and blends",
    items: [
      { sku: "FL-MP-PINTO", title: "Pinto Spice", uom: "kg", category: "Raw materials", flavour: "Original", icon: "🌿" },
      { sku: "MX-HERBS", title: "Herbs / Mixed Herbs", uom: "kg", category: "Raw materials", flavour: "", icon: "🌿" },
      { sku: "LEAVES-BAY", title: "Herbs / Bay Leaves", uom: "kg", category: "Raw materials", flavour: "", icon: "🌿" },
      { sku: "STICK-CINNA", title: "Herbs / Cinnamon Sticks", uom: "kg", category: "Raw materials", flavour: "", icon: "🌿" },
      { sku: "MAIZE", title: "Maize", uom: "kg", category: "Raw materials", flavour: "", icon: "🌽" },
      { sku: "BLEND-MP", title: "Flippen Lekka Spice Blend / Original Multi Purpose", uom: "kg", category: "Raw materials", flavour: "Original", icon: "🌿" },
      { sku: "BLEND-HS", title: "Flippen Lekka Spice Blend / Hot & Spicy", uom: "kg", category: "Raw materials", flavour: "Hot & Spicy", icon: "🔥" },
      { sku: "BLEND-CM", title: "Flippen Lekka Spice Blend / Curry Mix", uom: "kg", category: "Raw materials", flavour: "Curry", icon: "🍛" },
      { sku: "HEN-BB-BLEND", title: "Hennies Bietjie Blaf Spice Blend", uom: "kg", category: "Raw materials", flavour: "", icon: "🌿" },
      { sku: "PS-CHO", title: "Popcorn Sprinkle / Cheese & Onion", uom: "kg", category: "Raw materials", flavour: "Cheese & Onion", icon: "🧀" },
      { sku: "PS-BUT", title: "Popcorn Sprinkle / Butter", uom: "kg", category: "Raw materials", flavour: "Butter", icon: "🧈" },
      { sku: "PS-PAR", title: "Popcorn Sprinkle / Parmesan", uom: "kg", category: "Raw materials", flavour: "Parmesan", icon: "🧀" },
      { sku: "FL-CM-GR", title: "FL Spice / Curry", uom: "kg", category: "Raw materials", flavour: "Curry", icon: "🍛" },
      { sku: "PS-SCC", title: "Popcorn Sprinkle / Sour Cream and Chives", uom: "kg", category: "Raw materials", flavour: "Sour Cream & Chives", icon: "🌿" },
      { sku: "PS-CHUT", title: "Popcorn Sprinkle / Chutney", uom: "kg", category: "Raw materials", flavour: "Chutney", icon: "🟣" },
      { sku: "FL-MP-GR", title: "FL Spice / Original", uom: "kg", category: "Raw materials", flavour: "Original", icon: "🌿" },
      { sku: "FL-WS-GR", title: "FL Spice / Worcester Sauce", uom: "kg", category: "Raw materials", flavour: "Worcester Sauce", icon: "🟣" },
      { sku: "PS-CHE", title: "Popcorn Sprinkle / Cheese", uom: "kg", category: "Raw materials", flavour: "Cheese", icon: "🧀" },
      { sku: "PS-SV", title: "Popcorn Sprinkle / Salt & Vinegar", uom: "kg", category: "Raw materials", flavour: "Salt & Vinegar", icon: "🧂" },
      { sku: "FL-CS-GR", title: "FL Spice / Chutney", uom: "kg", category: "Raw materials", flavour: "Chutney", icon: "🟣" },
      { sku: "FL-RG-GR", title: "FL Spice / Red Wine & Garlic", uom: "kg", category: "Raw materials", flavour: "Red Wine & Garlic", icon: "🧄" },
      { sku: "BLEND-SH", title: "Flippen Lekka Spice Blend / Savoury Herb Mix", uom: "kg", category: "Raw materials", flavour: "Savoury Herb", icon: "🌿" }
    ]
  }
];

const PO_CATALOG = Object.freeze(CATALOG_GROUPS.map((group) => ({
  ...group,
  items: Object.freeze(group.items.map((item) => Object.freeze({ ...item })))
})));

const PO_CATALOG_ITEMS = Object.freeze(PO_CATALOG.flatMap((group) => group.items));

export { PO_CATALOG, PO_CATALOG_ITEMS };
