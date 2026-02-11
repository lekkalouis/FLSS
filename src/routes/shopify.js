import { Router } from "express";

import customersRouter from "./shopify/customers.js";
import fulfillmentRouter from "./shopify/fulfillment.js";
import inventoryRouter from "./shopify/inventory.js";
import notificationsRouter from "./shopify/notifications.js";
import ordersRouter from "./shopify/orders.js";
import productsRouter from "./shopify/products.js";

const router = Router();

router.use(customersRouter);
router.use(productsRouter);
router.use(ordersRouter);
router.use(fulfillmentRouter);
router.use(inventoryRouter);
router.use(notificationsRouter);

export default router;
