import { useCallback } from 'react';
import { useGluehweinCatalog } from './useGluehweinCatalog';
import { useGluehweinIngredients } from './useGluehweinIngredients';
import { shoppingExpenseLines } from '../utils/gluehweinShoppingList';

/** The Glühwein Einkaufsliste of a scout year as live Ausgaben lines (see shoppingExpenseLines). */
export const useGluehweinPurchases = () => {
  const { fetchItems } = useGluehweinCatalog();
  const { fetchIngredients } = useGluehweinIngredients();
  const fetchShoppingExpenses = useCallback(async (year) => {
    const [products, ingredients] = await Promise.all([fetchItems(year), fetchIngredients(year)]);
    return shoppingExpenseLines(products || [], ingredients || []);
  }, [fetchItems, fetchIngredients]);
  return { fetchShoppingExpenses };
};
