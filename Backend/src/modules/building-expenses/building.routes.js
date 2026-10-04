import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../shared/database/client.js";
import { requireAuth } from "../../shared/middleware/auth.middleware.js";
import { productSchema, expenseSchema, requestSchema, validateTransition } from "./building.schema.js";
const router = Router();
router.use(requireAuth);
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const action = fn => async (req, res, next) => { try { res.json(await fn(req)); } catch (error) { next(error); } };
async function department(db, id) { if (!await db.department.findFirst({ where: { id, status: "active" } })) fail("Select an active department."); }
async function requestData(db, body) {
  const data = requestSchema.parse(body);
  await department(db, data.departmentId);
  for (const item of data.items) {
    if (!item.productId) { if (data.kind === "sale") fail("Department sales require a catalog product."); continue; }
    const product = await db.buildingProduct.findFirst({ where: { id: item.productId, active: true } });
    if (!product) fail("A selected product is unavailable.");
    item.name = product.name;
  }
  const total = data.items.reduce((sum, item) => sum + Math.round(item.price * 100) * item.quantity, 0);
  if (Math.round(data.paidAmount * 100) > total) fail("Payment cannot exceed the total.");
  return data;
}
router.get("/", action(async () => {
  const [departments, products, allocations, expenses, requests] = await Promise.all([
    prisma.department.findMany({ where: { status: "active" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.buildingProduct.findMany({ orderBy: { name: "asc" } }),
    prisma.buildingDepartmentProduct.findMany({ include: { product: true, department: true } }),
    prisma.buildingExpense.findMany({ include: { department: true }, orderBy: { date: "desc" } }),
    prisma.buildingRequest.findMany({ include: { department: true }, orderBy: { createdAt: "desc" } }),
  ]);
  return { departments, products, allocations, expenses, requests };
}));
router.post("/products", action(req => prisma.buildingProduct.create({ data: productSchema.parse(req.body) })));
router.put("/products/:id", action(req => prisma.buildingProduct.update({ where: { id: req.params.id }, data: productSchema.parse(req.body) })));
router.put("/allocations/:id", action(async req => {
  const data = z.object({ quantity: z.number().int().min(0).max(1000000), previousQuantity: z.number().int().min(0) }).parse(req.body);
  const result = await prisma.buildingDepartmentProduct.updateMany({ where: { id: req.params.id, quantity: data.previousQuantity }, data: { quantity: data.quantity } });
  if (!result.count) fail("Department quantity changed. Refresh and try again.", 409);
  return { success: true };
}));
router.post("/expenses", action(async req => {
  const data = expenseSchema.parse(req.body); await department(prisma, data.departmentId);
  return prisma.buildingExpense.create({ data: { ...data, date: new Date(data.date), createdBy: req.user.name } });
}));
router.put("/expenses/:id", action(async req => {
  const data = expenseSchema.parse(req.body); await department(prisma, data.departmentId);
  return prisma.buildingExpense.update({ where: { id: req.params.id }, data: { ...data, date: new Date(data.date) } });
}));
router.post("/requests", action(async req => prisma.buildingRequest.create({ data: { ...await requestData(prisma, req.body), createdBy: req.user.name, history: [{ status: "draft", by: req.user.name, at: new Date().toISOString(), reason: "" }] } })));
router.put("/requests/:id/payment", action(req => prisma.$transaction(async db => {
  const input = z.object({ amount: z.number().finite().positive().max(999999999), paymentMethod: z.enum(["cash", "card", "bank"]) }).parse(req.body);
  const request = await db.buildingRequest.findUnique({ where: { id: req.params.id } });
  if (!request) fail("Request not found.", 404);
  if (request.status !== "completed") fail("Record additional payments after completion.", 409);
  const paid = Math.round(Number(request.paidAmount) * 100) + Math.round(input.amount * 100);
  const total = request.items.reduce((sum, item) => sum + Math.round(item.price * 100) * item.quantity, 0);
  if (paid > total) fail("Payment exceeds the outstanding balance.");
  const result = await db.buildingRequest.updateMany({ where: { id: request.id, paidAmount: request.paidAmount, status: "completed" }, data: { paidAmount: paid / 100, paymentMethod: input.paymentMethod, history: [...request.history, { status: "payment", by: req.user.name, at: new Date().toISOString(), reason: `${input.amount} (${input.paymentMethod})` }] } });
  if (!result.count) fail("Payment changed. Refresh and try again.", 409);
  return { success: true };
})));
router.put("/requests/:id", action(req => prisma.$transaction(async db => {
  const data = await requestData(db, req.body);
  const result = await db.buildingRequest.updateMany({ where: { id: req.params.id, status: "draft" }, data });
  if (!result.count) fail("Only a draft request can be edited.", 409);
  return { success: true };
})));
router.put("/requests/:id/submit", action(req => prisma.$transaction(async db => {
  const request = await db.buildingRequest.findUnique({ where: { id: req.params.id } });
  if (!request || request.status !== "draft") fail("Only drafts can be submitted.", 409);
  const result = await db.buildingRequest.updateMany({ where: { id: request.id, status: "draft" }, data: { status: "pending", history: [...request.history, { status: "pending", by: req.user.name, at: new Date().toISOString(), reason: "Submitted for approval" }] } });
  if (!result.count) fail("Request changed. Refresh and try again.", 409);
  return { success: true };
})));
router.patch("/requests/:id/status", action(req => prisma.$transaction(async db => {
  const { status, reason } = z.object({ status: z.string(), reason: z.string().trim().max(5000).default("") }).parse(req.body);
  const request = await db.buildingRequest.findUnique({ where: { id: req.params.id } });
  if (!request) fail("Request not found.", 404);
  validateTransition(request.status, status, request.kind, reason);
  const result = await db.buildingRequest.updateMany({ where: { id: request.id, status: request.status }, data: { status, history: [...request.history, { status, reason, by: req.user.name, at: new Date().toISOString() }] } });
  if (!result.count) fail("This request changed. Refresh and try again.", 409);
  if (status === "completed") {
    for (const item of request.items) {
      if (!item.productId) continue;
      await db.buildingDepartmentProduct.upsert({ where: { departmentId_productId: { departmentId: request.departmentId, productId: item.productId } }, create: { departmentId: request.departmentId, productId: item.productId, quantity: item.quantity }, update: { quantity: { increment: item.quantity } } });
    }
  }
  return { success: true };
})));
export default router;
