import { z } from "zod";

const uuidSchema = z.string().uuid();
// WHY: PostgreSQL permits any canonical UUID bit pattern, including IDs derived directly from MD5 demo seeds.
const databaseUuidSchema = z.string().regex(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);

export const saleTokenSchema = z.string().regex(/^[0-9a-f]{32}$/);

export const southAfricanPhoneSchema = z
  .string()
  .trim()
  .regex(
    /^(?:0\d{2}[ -]?\d{3}[ -]?\d{4}|\+27[ -]?\d{2}[ -]?\d{3}[ -]?\d{4})$/,
    "Enter a South African number such as 082 555 0199 or +27 82 555 0199",
  )
  .transform((phone) => {
    const compact = phone.replace(/[ -]/g, "");
    // WHY: E.164 gives every locally-entered or international number the same stored form.
    return compact.startsWith("+27")
      ? compact
      : `+27${compact.slice(1)}`;
  });

export const createSaleSchema = z.object({
  items: z.array(z.object({
    productId: z.string().trim().min(1).max(120),
    qty: z.number().int().min(1).max(99),
  }).strict()).min(1).max(100),
}).strict();

export const approveTabSchema = z.object({
  saleId: uuidSchema,
  shopCustomerId: uuidSchema,
  pin: z.string().regex(/^\d{4}$/).optional(),
}).strict();

export const payCashSchema = z.object({
  saleId: uuidSchema,
  shopCustomerId: uuidSchema.optional(),
}).strict();

export const demoPaySchema = z.object({
  saleId: uuidSchema,
}).strict();

export const addCustomerSchema = z.object({
  name: z.string().trim().min(2).max(60),
  phone: southAfricanPhoneSchema,
  consent: z.literal(true),
}).strict();

export const setPinSchema = z.object({
  shopCustomerId: uuidSchema,
  pin: z.string().regex(/^\d{4}$/),
}).strict();

export const repayTabSchema = z.object({
  saleId: databaseUuidSchema,
  amountCents: z.number().int().positive().safe(),
}).strict();

export const lenderQuerySchema = z.object({
  shop: uuidSchema,
  customer: uuidSchema,
}).strict();

// WHY: The client must send catalogue identifiers and quantities only; the server looks up
// trusted prices and recomputes every total so altered browser amounts cannot change a sale.
