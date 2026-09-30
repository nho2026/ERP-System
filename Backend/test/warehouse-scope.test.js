import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scopeWarehouseQuery } from '../src/shared/security/warehouse-scope.js';
import { inventoryAction } from '../src/modules/inventory/shared/inventory.controller.js';
import { productsService } from '../src/modules/inventory/products/products.service.js';
import { productsModel } from '../src/modules/inventory/products/products.model.js';
import { warehousesService } from '../src/modules/inventory/warehouses/warehouses.service.js';
import { warehousesModel } from '../src/modules/inventory/warehouses/warehouses.model.js';
const user = { isHospitalDepartment: true, warehouseId: 'assigned', roles: [{ role: { code: 'warehouse_staff', name: 'Renamed' } }] };
test('assigned storage is enforced regardless of query or role name', () => {
 assert.equal(scopeWarehouseQuery(user, {}).warehouseId, 'assigned');
 assert.throws(() => scopeWarehouseQuery(user, { warehouseId: 'other' }), { status: 403 });
 assert.throws(() => scopeWarehouseQuery({ ...user, warehouseId: null }, {}), { status: 403 });
 assert.deepEqual(scopeWarehouseQuery({ roles: [] }, {}), {});
});
test('product list and nested stock are restricted through the request handler', async t => {
 let args;
 t.mock.method(productsModel, 'paginate', async (_query, _model, options) => { args = options; return []; });
 await inventoryAction(productsService.list)({ user, query: {}, params: {} }, {status: () => ({json: () => {}})}, error => {throw error;});
 assert.deepEqual(args.where.stocks, {some: {warehouseId: 'assigned'}});
 assert.deepEqual(args.include.stocks.where, {warehouseId: 'assigned'});
});
test('storage selector returns only the assigned active warehouse', async t => {
 let args;
 t.mock.method(warehousesModel, 'paginate', async (_query, _model, options) => {args = options; return [];});
 await warehousesService.list({ query: {}, warehouseScope: 'assigned' });
 assert.deepEqual(args.where, {id:'assigned',status:'active'});
});
test('stock rows and summaries exclude other warehouses', async t => {
 const { stockService } = await import('../src/modules/inventory/stock/stock.service.js');
 const { stockModel } = await import('../src/modules/inventory/stock/stock.model.js');
 let args;
 t.mock.method(stockModel, 'paginate', async (_query, _model, options) => { args = options; return []; });
 await inventoryAction(stockService.list)({user,query:{},params:{}},{status:()=>({json:()=>{}})},error=>{throw error;});
 assert.equal(args.where.warehouseId, 'assigned');
 t.mock.method(stockModel, 'summary', async () => [{warehouseId:'assigned', total:1, units:2, emptyCount:0, low:0},{warehouseId:'other',total:9,units:99,emptyCount:0,low:0}]);
 const summary = await stockService.summary({warehouseScope:'assigned'});
 assert.equal(summary.length,1);
 assert.equal(summary[0].warehouseId,'assigned');
});
