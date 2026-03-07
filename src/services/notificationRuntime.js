import { getSystemSettings } from "./systemSettings.js";
import {
  NOTIFICATION_EVENT_KEYS,
  renderNotificationContent,
  resolveNotificationTemplate
} from "./notificationTemplateRegistry.js";

const EVENT_SETTINGS_KEYS = Object.freeze({
  [NOTIFICATION_EVENT_KEYS.PICKUP_READY]: "pickupReady",
  [NOTIFICATION_EVENT_KEYS.TRUCK_COLLECTION]: "truckCollection"
});

function normalizeEmail(value) {
  const email = String(value || "").trim();
  if (!email || !email.includes("@")) return null;
  return email;
}

export function normalizeRecipientList(value) {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((item) => normalizeEmail(item))
          .filter(Boolean)
          .map((item) => item.toLowerCase())
      )
    );
  }

  if (typeof value === "string") {
    return normalizeRecipientList(
      value
        .split(/[,\n;]/)
        .map((item) => item.trim())
        .filter(Boolean)
    );
  }

  return [];
}

function notificationRoot(settings) {
  return settings?.notifications && typeof settings.notifications === "object"
    ? settings.notifications
    : {};
}

export function getNotificationEventSettings(settings, eventKey) {
  const key = EVENT_SETTINGS_KEYS[String(eventKey || "").trim()] || null;
  if (!key) return {};
  const notifications = notificationRoot(settings);
  const events = notifications.events && typeof notifications.events === "object"
    ? notifications.events
    : {};
  return events[key] && typeof events[key] === "object" ? events[key] : {};
}

export function resolveNotificationSender(settings, fallbackFrom) {
  const notifications = notificationRoot(settings);
  return normalizeEmail(notifications.senderOverride) || normalizeEmail(fallbackFrom);
}

export function resolveNotificationRecipients({
  eventKey,
  settings,
  context = {},
  overrideRecipients = null
} = {}) {
  if (overrideRecipients !== null) {
    return normalizeRecipientList(overrideRecipients);
  }

  const notifications = notificationRoot(settings);
  const eventSettings = getNotificationEventSettings(settings, eventKey);
  const recipients = [];
  const shouldUseCustomerEmail = eventSettings.useCustomerEmail !== false;

  if (shouldUseCustomerEmail) {
    const customerEmail =
      normalizeEmail(context?.customer?.email) ||
      normalizeEmail(context?.order?.email) ||
      normalizeEmail(context?.order?.customer?.email);
    if (customerEmail) recipients.push(customerEmail);
  }

  recipients.push(...normalizeRecipientList(eventSettings.recipients));

  if (!recipients.length) {
    recipients.push(
      ...normalizeRecipientList(eventSettings.fallbackRecipient),
      ...normalizeRecipientList(notifications.fallbackRecipient)
    );
  }

  return normalizeRecipientList(recipients);
}

export function buildNotificationTestContext(eventKey) {
  const timestamp = new Date().toISOString();
  if (eventKey === NOTIFICATION_EVENT_KEYS.TRUCK_COLLECTION) {
    return {
      shop: { name: "Flippen Lekka Scan Station" },
      logistics: {
        provider_name: "SWE Couriers",
        collection_date: new Date().toLocaleDateString("en-ZA", {
          year: "numeric",
          month: "short",
          day: "numeric"
        }),
        reason: "test"
      },
      metrics: {
        parcel_count: 48,
        booked_parcel_count: 12
      },
      meta: {
        generated_at: timestamp
      }
    };
  }

  return {
    shop: { name: "Flippen Lekka Spices" },
    customer: {
      name: "Test Customer",
      email: "customer@example.com"
    },
    order: {
      id: "test-order-1001",
      name: "#1001",
      email: "customer@example.com"
    },
    pickup: {
      barcode_value: "FLSS-PICKUP-1001-123",
      barcode_image_url: "https://barcode.tec-it.com/barcode.ashx?data=FLSS-PICKUP-1001-123&code=Code128&dpi=120",
      pin: "123"
    },
    metrics: {
      parcel_count: 4,
      weight_kg: "12.50"
    },
    meta: {
      generated_at: timestamp
    }
  };
}

export async function buildNotificationEmail({
  eventKey,
  context = {},
  settings = getSystemSettings(),
  fallbackFrom,
  overrideRecipients = null,
  ignoreEventEnabled = false
} = {}) {
  const cleanEventKey = String(eventKey || "").trim();
  if (!cleanEventKey) {
    const err = new Error("eventKey is required");
    err.code = "INVALID_NOTIFICATION_EVENT";
    throw err;
  }

  const eventSettings = getNotificationEventSettings(settings, cleanEventKey);
  if (!ignoreEventEnabled && eventSettings.enabled === false) {
    return {
      skipped: true,
      reason: "event-disabled",
      eventKey: cleanEventKey
    };
  }

  const from = resolveNotificationSender(settings, fallbackFrom);
  if (!from) {
    const err = new Error("Sender address is not configured");
    err.code = "EMAIL_NOT_CONFIGURED";
    throw err;
  }

  const to = resolveNotificationRecipients({
    eventKey: cleanEventKey,
    settings,
    context,
    overrideRecipients
  });
  if (!to.length) {
    const err = new Error("No recipient configured for notification");
    err.code = "NO_NOTIFICATION_RECIPIENTS";
    throw err;
  }

  const template = await resolveNotificationTemplate({
    templateId: eventSettings.templateId,
    eventKey: cleanEventKey,
    channel: "email"
  });
  if (!template) {
    const err = new Error("No email template resolved for notification");
    err.code = "TEMPLATE_NOT_FOUND";
    throw err;
  }

  const content = renderNotificationContent(template, context);
  return {
    skipped: false,
    eventKey: cleanEventKey,
    template,
    from,
    to,
    subject: content.subject || template.name,
    text: content.text || "",
    html: content.html || "<p></p>"
  };
}

export async function sendNotificationEmail({
  transport,
  eventKey,
  context = {},
  settings = getSystemSettings(),
  fallbackFrom,
  overrideRecipients = null,
  ignoreEventEnabled = false
} = {}) {
  const email = await buildNotificationEmail({
    eventKey,
    context,
    settings,
    fallbackFrom,
    overrideRecipients,
    ignoreEventEnabled
  });

  if (email.skipped) return email;

  const info = await transport.sendMail({
    from: email.from,
    to: email.to.join(", "),
    subject: email.subject,
    text: email.text,
    html: email.html
  });

  return {
    ...email,
    info
  };
}
