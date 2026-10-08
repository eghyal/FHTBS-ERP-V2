import { useState, useEffect, useCallback } from "react";
import { ShopProduct, CartItem } from "@/types/shop";

export function useShopCart(customerId?: string) {
  const getCartKey = (id?: string) => {
    return id ? `pavingjoss_shop_cart_customer_${id}` : "pavingjoss_shop_cart_guest";
  };

  // Helper to load cart items from localStorage based on key
  const loadCartItems = useCallback((id?: string) => {
    try {
      const key = getCartKey(id);
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }, []);

  const [items, setItems] = useState<CartItem[]>(() => loadCartItems(customerId));

  // Sync cart when customerId changes
  useEffect(() => {
    setItems(loadCartItems(customerId));
  }, [customerId, loadCartItems]);

  const saveCart = useCallback((newItems: CartItem[]) => {
    setItems(newItems);
    try {
      const key = getCartKey(customerId);
      localStorage.setItem(key, JSON.stringify(newItems));
      // Notify other tabs/windows or listeners
      window.dispatchEvent(new Event("shop_cart_updated"));
    } catch (e) {
      console.warn("Failed to persist cart to localStorage", e);
    }
  }, [customerId]);

  // Sync cart state across browser tabs, windows, or storage events
  useEffect(() => {
    const handleStorageChange = () => {
      setItems(loadCartItems(customerId));
    };

    window.addEventListener("shop_cart_updated", handleStorageChange);
    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener("shop_cart_updated", handleStorageChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [customerId, loadCartItems]);

  const addToCart = useCallback((product: ShopProduct, quantity: number = 1) => {
    // Guard: Made to order items do not enter retail shopping cart
    const isMto =
      product.availability_type === "MAKE_TO_ORDER" ||
      (product.availability_type === "AUTO" && (product.promo_price > 0 ? product.promo_price : product.unit_price) <= 0);
    if (isMto) {
      return;
    }

    const existingIndex = items.findIndex((i) => i.product.id === product.id);
    let updated: CartItem[];
    if (existingIndex > -1) {
      updated = [...items];
      updated[existingIndex].qty += quantity;
    } else {
      updated = [...items, { product, qty: quantity }];
    }
    saveCart(updated);
  }, [items, saveCart]);

  const updateQty = useCallback((productId: string, quantity: number) => {
    if (quantity <= 0) {
      const filtered = items.filter((i) => i.product.id !== productId);
      saveCart(filtered);
    } else {
      const updated = items.map((i) =>
        i.product.id === productId ? { ...i, qty: quantity } : i
      );
      saveCart(updated);
    }
  }, [items, saveCart]);

  const removeFromCart = useCallback((productId: string) => {
    const filtered = items.filter((i) => i.product.id !== productId);
    saveCart(filtered);
  }, [items, saveCart]);

  const clearCart = useCallback(() => {
    saveCart([]);
  }, [saveCart]);

  const totalItems = items.reduce((sum, item) => sum + item.qty, 0);

  const subtotal = items.reduce((sum, item) => {
    const price = item.product.promo_price > 0 ? item.product.promo_price : item.product.unit_price;
    return sum + price * item.qty;
  }, 0);

  const totalWeightKg = items.reduce((sum, item) => {
    const weight = item.product.weight_kg || 2.5;
    return sum + weight * item.qty;
  }, 0);

  return {
    items,
    totalItems,
    subtotal,
    totalWeightKg,
    addToCart,
    updateQty,
    removeFromCart,
    clearCart,
  };
}
