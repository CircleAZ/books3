import { createContext, useContext, useState, useCallback } from 'react';

const CartContext = createContext({
    itemCount: 0,
    total: 0,
    isDrawerOpen: false,
    toggleDrawer: () => { },
    setCartData: () => { },
});

export function CartProvider({ children }) {
    const [itemCount, setItemCount] = useState(0);
    const [total, setTotal] = useState(0);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    const toggleDrawer = useCallback(() => {
        setIsDrawerOpen(prev => !prev);
    }, []);

    const setCartData = useCallback((count, cartTotal) => {
        setItemCount(count);
        setTotal(cartTotal);
    }, []);

    return (
        <CartContext.Provider value={{
            itemCount,
            total,
            isDrawerOpen,
            setIsDrawerOpen,
            toggleDrawer,
            setCartData,
        }}>
            {children}
        </CartContext.Provider>
    );
}

export function useCart() {
    return useContext(CartContext);
}
