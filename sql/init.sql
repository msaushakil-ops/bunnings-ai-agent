CREATE EXTENSION IF NOT EXISTS pgcrypto;

DROP TABLE IF EXISTS tickets CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS manuals CASCADE;
DROP TABLE IF EXISTS policies CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS customers CASCADE;

CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_code VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(200) NOT NULL,
    email VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_code VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    brand VARCHAR(100),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_code VARCHAR(50) UNIQUE NOT NULL,
    customer_id UUID NOT NULL REFERENCES customers(id),
    product_id UUID NOT NULL REFERENCES products(id),
    purchase_date DATE NOT NULL,
    price_aud NUMERIC(12,2) NOT NULL,
    receipt_number VARCHAR(100),
    custom_cut BOOLEAN DEFAULT FALSE,
    tinted BOOLEAN DEFAULT FALSE,
    opened BOOLEAN DEFAULT FALSE,
    seedling BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_code VARCHAR(100) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    category VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE manuals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    manual_code VARCHAR(100) UNIQUE NOT NULL,
    product_code VARCHAR(100),
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    category VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_code VARCHAR(100) UNIQUE NOT NULL,
    customer_id UUID REFERENCES customers(id),
    subject VARCHAR(255),
    description TEXT,
    status VARCHAR(50) DEFAULT 'OPEN',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- CUSTOMERS
-- ============================================================================

INSERT INTO customers
(customer_code, full_name, email)
VALUES
('CUST-001', 'Alex Chen', 'alex@example.com'),
('CUST-002', 'Priya Nair', 'priya@example.com'),
('CUST-003', 'Sam Wilson', 'sam@example.com'),
('CUST-004', 'Jordan Lee', 'jordan@example.com'),
('CUST-005', 'Morgan Taylor', 'morgan@example.com');

-- ============================================================================
-- PRODUCTS
-- ============================================================================

INSERT INTO products
(product_code, name, category, brand, description)
VALUES
(
    'MAK-DRILL-18V',
    'Makita 18V Brushless Cordless Drill Driver Kit',
    'tools',
    'Makita',
    '18V brushless cordless drill kit.'
),
(
    'DEW-IMPACT-20V',
    'DeWalt 20V Impact Driver',
    'tools',
    'DeWalt',
    '20V cordless impact driver.'
),
(
    'PINE-H3-90X22',
    'H3 Treated Pine Decking Board 90x22mm 5.4m',
    'timber',
    'Generic',
    'H3 above-ground treated pine.'
),
(
    'PINE-H2-90X45',
    'H2 Blue Structural Pine 90x45mm 6m',
    'timber',
    'Generic',
    'H2 protected structural framing timber.'
),
(
    'RYO-SAW-18V',
    'Ryobi 18V One+ Cordless Circular Saw',
    'tools',
    'Ryobi',
    '18V cordless circular saw.'
);

-- ============================================================================
-- ORDERS
-- ============================================================================

INSERT INTO orders
(
    order_code,
    customer_id,
    product_id,
    purchase_date,
    price_aud,
    receipt_number,
    custom_cut,
    tinted,
    opened
)
SELECT
    'ORD-1001',
    c.id,
    p.id,
    CURRENT_DATE - INTERVAL '45 days',
    249.00,
    'REC-51001',
    FALSE,
    FALSE,
    FALSE
FROM customers c
JOIN products p
    ON c.customer_code = 'CUST-001'
   AND p.product_code = 'MAK-DRILL-18V';

INSERT INTO orders
(
    order_code,
    customer_id,
    product_id,
    purchase_date,
    price_aud,
    receipt_number,
    custom_cut,
    tinted,
    opened
)
SELECT
    'ORD-1002',
    c.id,
    p.id,
    CURRENT_DATE - INTERVAL '10 days',
    199.00,
    'REC-51002',
    FALSE,
    FALSE,
    FALSE
FROM customers c
JOIN products p
    ON c.customer_code = 'CUST-002'
   AND p.product_code = 'DEW-IMPACT-20V';

INSERT INTO orders
(
    order_code,
    customer_id,
    product_id,
    purchase_date,
    price_aud,
    receipt_number,
    custom_cut,
    tinted,
    opened
)
SELECT
    'ORD-1003',
    c.id,
    p.id,
    CURRENT_DATE - INTERVAL '5 days',
    34.50,
    'REC-51003',
    TRUE,
    FALSE,
    FALSE
FROM customers c
JOIN products p
    ON c.customer_code = 'CUST-003'
   AND p.product_code = 'PINE-H3-90X22';

INSERT INTO orders
(
    order_code,
    customer_id,
    product_id,
    purchase_date,
    price_aud,
    receipt_number
)
SELECT
    'ORD-1004',
    c.id,
    p.id,
    CURRENT_DATE - INTERVAL '60 days',
    28.90,
    'REC-51004'
FROM customers c
JOIN products p
    ON c.customer_code = 'CUST-004'
   AND p.product_code = 'PINE-H2-90X45';

INSERT INTO orders
(
    order_code,
    customer_id,
    product_id,
    purchase_date,
    price_aud,
    receipt_number
)
SELECT
    'ORD-1006',
    c.id,
    p.id,
    CURRENT_DATE - INTERVAL '35 days',
    159.00,
    'REC-51006'
FROM customers c
JOIN products p
    ON c.customer_code = 'CUST-005'
   AND p.product_code = 'RYO-SAW-18V';

-- ============================================================================
-- POLICIES
-- ============================================================================

INSERT INTO policies
(policy_code, title, content, category)
VALUES
(
    'POL-RET-001',
    'Returns & Refunds',
    'Unused standard products in original packaging may be returned within 30 days with proof of purchase. Custom-cut timber and tinted paint are excluded from change-of-mind returns. Faulty products may be covered by applicable consumer law.',
    'returns'
),
(
    'POL-TOOL-001',
    'Tool Warranty',
    'Defective power tools within 30 days may qualify for exchange or refund. Beyond that period the product may require authorised service inspection.',
    'tools'
),
(
    'POL-TIMBER-001',
    'Timber Application',
    'H2 is intended for protected interior applications. H3 is suitable for above-ground exterior exposure. H4 is suitable for ground contact.',
    'timber'
);

-- ============================================================================
-- MANUALS
-- ============================================================================

INSERT INTO manuals
(manual_code, product_code, title, content, category)
VALUES
(
    'MAN-MAK-001',
    'MAK-DRILL-18V',
    'Makita Drill Usage Guide',
    'The Makita 18V brushless cordless drill is intended for drilling and screwdriving applications. Use compatible 18V batteries and follow manufacturer safety and operating instructions.',
    'tools'
),
(
    'MAN-TIM-001',
    'PINE-H2-90X45',
    'H2 Structural Pine Application',
    'H2 treated structural pine should be used in protected internal applications and is not intended for exposed outdoor conditions.',
    'timber'
);

-- ============================================================================
-- TICKETS
-- ============================================================================

INSERT INTO tickets
(ticket_code, customer_id, subject, description, status)
SELECT
    'TICK-001',
    c.id,
    'Makita drill issue',
    'Customer reports intermittent power issue during use.',
    'OPEN'
FROM customers c
WHERE c.customer_code = 'CUST-001';

INSERT INTO tickets
(ticket_code, customer_id, subject, description, status)
SELECT
    'TICK-002',
    c.id,
    'Timber application question',
    'Customer asks whether H2 pine can be used outdoors.',
    'OPEN'
FROM customers c
WHERE c.customer_code = 'CUST-004';