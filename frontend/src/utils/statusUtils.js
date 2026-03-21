
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
        'received'
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

/**
 * Maps raw database status values to human-readable labels.
 */
export const formatStatusLabel = (value) => {
    if (!value) return '-';

    const labelMap = {
        // Common
        'na': 'N/A',
        'pending': 'Pending',
        'completed': 'Completed',
        'cancelled': 'Cancelled',

        // Order
        'draft': 'Draft',
        'confirmed': 'Confirmed',

        // Payment
        'partial': 'Partial',
        'paid': 'Paid',
        'overpaid': 'Overpaid',
        'refunded': 'Refunded',

        // Delivery
        'processing': 'Processing',
        'ready': 'Ready',
        'delivered': 'Delivered',

        // Return
        'received': 'Item Received',

        // Refund
        // (Shared with above)
    };

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
    delivery_status: [
        { value: 'pending', label: 'Pending' },
        { value: 'processing', label: 'Processing' },
        { value: 'ready', label: 'Ready' },
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
