
/**
 * Maps status values to CSS classes for styling status pills.
 * Centralizes logic used in OrderList and OrderDetails.
 */
export const getStatusClass = (status) => {
    if (!status) return 'status-pending';
    const lowerStatus = status.toLowerCase();

    // Success: Final positive states
    if ([
        'paid',
        'completed',
        'delivered',
        'confirmed',
        'order complete'
    ].includes(lowerStatus)) {
        return 'status-success';
    }

    // Warning: Transitory states requiring attention or waiting
    if ([
        'partial',
        'processing',
        'ready',
        'pending',
        'cancellation pending',
        'delivered - awaiting payment',
        'refund in progress',
        'return in progress',
        'ready for pickup',
        'received',
        'partially delivered'
    ].includes(lowerStatus)) {
        return 'status-warning';
    }

    // Danger: Negative terminal states
    if ([
        'cancelled',
        'refunded',
        'order cancelled'
    ].includes(lowerStatus)) {
        return 'status-danger';
    }

    // Action Critical: Specific urgent action labels (split from generic 'Action Needed')
    if ([
        'cancelled \u2014 refund pending',
        'return received \u2014 process refund',
        'overpaid \u2014 refund due',
        'action needed'
    ].includes(lowerStatus)) {
        return 'status-action-needed';
    }

    return 'status-pending';
};

export const formatStatusLabel = (...args) => {
    let field, value;
    
    // Backwards compatibility: if exactly 1 argument is passed, it's the value
    if (args.length === 1) {
        field = null;
        value = args[0];
    } else {
        field = args[0];
        value = args[1];
    }

    if (!value) return '-';

    // Lookup strictly from STATUS_OPTIONS if field is provided
    if (field && STATUS_OPTIONS[field]) {
        const option = STATUS_OPTIONS[field].find(opt => opt.value === value);
        if (option) return option.label;
    }

    // Flat fallback map for legacy calls without field context
    const labelMap = {
        'na': 'N/A',
        'pending': 'Pending',
        'completed': 'Completed',
        'cancelled': 'Cancelled',
        'draft': 'Draft',
        'confirmed': 'Confirmed',
        'paid': 'Paid',
        'overpaid': 'Overpaid',
        'refunded': 'Refunded',
        'processing': 'Processing',
        'ready': 'Ready',
        'delivered': 'Delivered',
        'received': 'Item Received',
    };

    // 'partial' has multiple meanings. Default to 'Partial' if no field is given.
    if (value === 'partial') return 'Partial';

    return labelMap[value] || value;
};

/**
 * Status options for dropdowns/modals
 */
export const STATUS_OPTIONS = {
    order_status: [
        { value: 'draft', label: 'Draft' },
        { value: 'confirmed', label: 'Confirmed' },
        { value: 'completed', label: 'Completed' },
        { value: 'cancelled', label: 'Cancelled' }
    ],
    payment_status: [
        { value: 'pending', label: 'Pending' },
        { value: 'partial', label: 'Partially Paid' },
        { value: 'paid', label: 'Paid' },
        { value: 'overpaid', label: 'Overpaid' },
        { value: 'refunded', label: 'Refunded' }
    ],
    // NOTE: payment_status is auto-computed — dropdown is read-only in the UI
    // NOTE: delivery_status is auto-computed — dropdown is read-only in the UI
    delivery_status: [
        { value: 'pending', label: 'Pending' },
        { value: 'partial', label: 'Partially Delivered' },
        { value: 'delivered', label: 'Delivered' }
    ],
    return_status: [
        { value: 'na', label: 'N/A' },
        { value: 'pending', label: 'Pending' },
        { value: 'received', label: 'Item Received' },
        { value: 'completed', label: 'Completed' },
        { value: 'cancelled', label: 'Cancelled' }
    ],
    refund_status: [
        { value: 'na', label: 'N/A' },
        { value: 'pending', label: 'Pending' },
        { value: 'partial', label: 'Partial' },
        { value: 'completed', label: 'Completed' },
        { value: 'cancelled', label: 'Cancelled' }
    ],
    cancellation_status: [
        { value: 'na', label: 'N/A' },
        { value: 'pending', label: 'Pending' },
        { value: 'completed', label: 'Completed' },
        { value: 'cancelled', label: 'Cancelled' }
    ]
};
