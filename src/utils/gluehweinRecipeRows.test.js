// Run: node --test src/utils/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planRecipeRows } from './gluehweinRecipeRows.js';

const ingredients = [
  { id: 'gin', name: 'Gin', unit: 'ml', active: 1 },
  { id: 'saft', name: 'Orangensaft', unit: 'ml', active: 0 },
];
let n = 0;
const newId = () => `new-${++n}`;

test('known names (any case) reuse the existing ingredient, no create', () => {
  const plan = planRecipeRows([{ name: ' gin ', unit: 'l', qty_per_unit: 146 }], ingredients, newId);
  assert.deepEqual(plan, { recipe: [{ ingredient_id: 'gin', qty_per_unit: 146 }], create: [], reactivate: [] });
});

test('unknown name becomes a new ingredient with the typed unit (default Stk)', () => {
  const plan = planRecipeRows([
    { name: 'Ingwer', unit: 'Scheiben', qty_per_unit: 2.4 },
    { name: 'Sternanis', unit: '', qty_per_unit: 1.2 },
  ], ingredients, newId);
  assert.deepEqual(plan.create, [
    { id: 'new-1', name: 'Ingwer', unit: 'Scheiben' },
    { id: 'new-2', name: 'Sternanis', unit: 'Stk' },
  ]);
  assert.deepEqual(plan.recipe, [
    { ingredient_id: 'new-1', qty_per_unit: 2.4 },
    { ingredient_id: 'new-2', qty_per_unit: 1.2 },
  ]);
});

test('inactive match is reactivated, not created', () => {
  const plan = planRecipeRows([{ name: 'orangensaft', unit: 'ml', qty_per_unit: 427 }], ingredients, newId);
  assert.deepEqual(plan.reactivate, ['saft']);
  assert.deepEqual(plan.create, []);
});

test('blank name, qty <= 0 and duplicates are rejected', () => {
  assert.throws(() => planRecipeRows([{ name: '  ', qty_per_unit: 1 }], ingredients), /RECIPE_ROW_INVALID/);
  assert.throws(() => planRecipeRows([{ name: 'x', qty_per_unit: 0 }], ingredients), /RECIPE_ROW_INVALID/);
  assert.throws(() => planRecipeRows([
    { name: 'Gin', qty_per_unit: 1 },
    { name: 'gin ', qty_per_unit: 2 },
  ], ingredients), /RECIPE_DUPLICATE/);
});

test('same unknown name twice is a duplicate, not two new ingredients', () => {
  assert.throws(() => planRecipeRows([
    { name: 'Zimt', qty_per_unit: 1 },
    { name: 'zimt', qty_per_unit: 1 },
  ], ingredients, newId), /RECIPE_DUPLICATE/);
});
