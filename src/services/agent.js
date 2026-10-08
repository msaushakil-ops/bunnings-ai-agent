import { query } from "./postgres.js";
import { searchStaticKB } from "./knowledgeBase.js";
import { callRag } from "./colabPool.js";

/*
 * ============================================================
 * SYNCLINE AI AGENT
 * Authoritative Evidence Retrieval Layer
 * ============================================================
 *
 * RULES:
 *
 * PostgreSQL transactional records are authoritative.
 * Customer -> Order -> Product relationships are resolved
 * before transactions are retrieved.
 *
 * The Colab worker receives the evidence selected here.
 *
 * We intentionally DO NOT perform a broad OR search against
 * orders after entity resolution.
 * ============================================================
 */

function normalize(text) {
    return String(text || "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function tokens(text) {
    const stopWords = new Set([
        "can", "the", "a", "an",
        "his", "her", "their",
        "this", "that", "these", "those",
        "for", "from", "with", "without",
        "what", "when", "where", "why", "how",
        "does", "do", "did",
        "is", "are", "was", "were",
        "should", "could", "would",
        "please", "tell", "me",
        "check", "find", "give",
        "about", "today",
        "have", "has", "had",
        "may", "might",
        "using", "only",
        "according"
    ]);

    return [
        ...new Set(
            normalize(text)
                .split(" ")
                .filter(
                    token =>
                        token.length >= 3 &&
                        !stopWords.has(token)
                )
        )
    ];
}

function extractCodes(text) {
    const value = String(text || "").toUpperCase();

    return {
        orderCodes: [
            ...new Set(
                value.match(/\bORD-\d+\b/g) || []
            )
        ],

        customerCodes: [
            ...new Set(
                value.match(/\bCUST-\d+\b/g) || []
            )
        ],

        ticketCodes: [
            ...new Set(
                value.match(/\bTICK-\d+\b/g) || []
            )
        ],

        policyCodes: [
            ...new Set(
                value.match(/\bPOL-[A-Z0-9-]+\b/g) || []
            )
        ],

        manualCodes: [
            ...new Set(
                value.match(/\bMAN-[A-Z0-9-]+\b/g) || []
            )
        ]
    };
}

/*
 * ------------------------------------------------------------
 * CUSTOMER
 * ------------------------------------------------------------
 */

async function resolveCustomers(userQuery, codes) {

    if (codes.customerCodes.length > 0) {

        const result = await query(
            `
            SELECT
                id,
                customer_code,
                full_name,
                email
            FROM customers
            WHERE customer_code = ANY($1::varchar[])
            ORDER BY full_name
            `,
            [codes.customerCodes]
        );

        if (result.rows.length > 0) {
            return result.rows;
        }
    }

    /*
     * Compare the known customer name against the query.
     * This avoids requiring the whole question to exist in
     * one database field.
     */

    const result = await query(
        `
        SELECT
            id,
            customer_code,
            full_name,
            email
        FROM customers
        ORDER BY full_name
        `
    );

    const queryText = normalize(userQuery);

    const ranked = result.rows
        .map(customer => {

            const name = normalize(customer.full_name);
            const nameParts = name.split(" ");

            let score = 0;

            if (queryText.includes(name)) {
                score += 100;
            }

            for (const part of nameParts) {

                if (
                    part.length >= 3 &&
                    queryText.includes(part)
                ) {
                    score += 20;
                }
            }

            if (
                customer.customer_code &&
                queryText.includes(
                    normalize(customer.customer_code)
                )
            ) {
                score += 100;
            }

            if (
                customer.email &&
                queryText.includes(
                    normalize(customer.email)
                )
            ) {
                score += 100;
            }

            return {
                ...customer,
                retrieval_score: score
            };
        })
        .filter(row => row.retrieval_score > 0)
        .sort(
            (a, b) =>
                b.retrieval_score -
                a.retrieval_score
        );

    if (ranked.length === 0) {
        return [];
    }

    /*
     * Do not return weak matches.
     */
    const best =
        ranked[0].retrieval_score;

    return ranked.filter(
        row =>
            row.retrieval_score >=
            Math.max(20, best)
    );
}

/*
 * ------------------------------------------------------------
 * PRODUCT
 * ------------------------------------------------------------
 */

async function resolveProducts(userQuery) {

    const result = await query(
        `
        SELECT
            id,
            product_code,
            name,
            category,
            brand,
            description
        FROM products
        ORDER BY name
        `
    );

    const queryText = normalize(userQuery);

    const ranked = result.rows
        .map(product => {

            let score = 0;

            const code =
                normalize(product.product_code);

            const name =
                normalize(product.name);

            const brand =
                normalize(product.brand || "");

            const category =
                normalize(product.category || "");

            if (
                code &&
                queryText.includes(code)
            ) {
                score += 100;
            }

            if (
                name &&
                queryText.includes(name)
            ) {
                score += 100;
            }

            if (
                brand &&
                queryText.includes(brand)
            ) {
                score += 15;
            }

            for (const token of tokens(queryText)) {

                if (
                    name.includes(token)
                ) {
                    score += 8;
                }

                if (
                    brand.includes(token)
                ) {
                    score += 5;
                }

                if (
                    category.includes(token)
                ) {
                    score += 2;
                }
            }

            return {
                ...product,
                retrieval_score: score
            };
        })
        .filter(
            row =>
                row.retrieval_score > 0
        )
        .sort(
            (a, b) =>
                b.retrieval_score -
                a.retrieval_score
        );

    if (ranked.length === 0) {
        return [];
    }

    const best =
        ranked[0].retrieval_score;

    return ranked.filter(
        row =>
            row.retrieval_score >=
            Math.max(8, best)
    );
}

/*
 * ------------------------------------------------------------
 * ORDERS
 * ------------------------------------------------------------
 *
 * IMPORTANT:
 *
 * Orders are retrieved through resolved relational IDs.
 * There is NO generic keyword search here.
 * ------------------------------------------------------------
 */

async function resolveOrders(
    customers,
    products,
    codes
) {

    if (codes.orderCodes.length > 0) {

        const result = await query(
            `
            SELECT
                o.id,
                o.order_code,
                c.customer_code,
                c.full_name,
                p.product_code,
                p.name AS product_name,
                p.category,
                p.brand,
                o.purchase_date,
                CURRENT_DATE - o.purchase_date
                    AS days_since_purchase,
                o.price_aud,
                o.receipt_number,
                o.custom_cut,
                o.tinted,
                o.opened,
                o.seedling
            FROM orders o
            JOIN customers c
                ON c.id = o.customer_id
            JOIN products p
                ON p.id = o.product_id
            WHERE o.order_code = ANY($1::varchar[])
            ORDER BY o.purchase_date DESC
            `,
            [codes.orderCodes]
        );

        /*
         * If customer resolved, enforce ownership.
         */

        if (customers.length > 0) {

            const allowed =
                new Set(
                    customers.map(
                        customer =>
                            customer.customer_code
                    )
                );

            return result.rows.filter(
                order =>
                    allowed.has(
                        order.customer_code
                    )
            );
        }

        return result.rows;
    }

    /*
     * Customer + product is the strongest relational lookup.
     */

    if (
        customers.length > 0 &&
        products.length > 0
    ) {

        const customerIds =
            customers.map(
                customer =>
                    customer.id
            );

        const productIds =
            products.map(
                product =>
                    product.id
            );

        const result = await query(
            `
            SELECT
                o.id,
                o.order_code,
                c.customer_code,
                c.full_name,
                p.product_code,
                p.name AS product_name,
                p.category,
                p.brand,
                o.purchase_date,
                CURRENT_DATE - o.purchase_date
                    AS days_since_purchase,
                o.price_aud,
                o.receipt_number,
                o.custom_cut,
                o.tinted,
                o.opened,
                o.seedling
            FROM orders o
            JOIN customers c
                ON c.id = o.customer_id
            JOIN products p
                ON p.id = o.product_id
            WHERE
                o.customer_id = ANY($1::uuid[])
                AND
                o.product_id = ANY($2::uuid[])
            ORDER BY
                o.purchase_date DESC
            LIMIT 20
            `,
            [
                customerIds,
                productIds
            ]
        );

        return result.rows;
    }

    /*
     * Customer-only lookup.
     */

    if (customers.length > 0) {

        const result = await query(
            `
            SELECT
                o.id,
                o.order_code,
                c.customer_code,
                c.full_name,
                p.product_code,
                p.name AS product_name,
                p.category,
                p.brand,
                o.purchase_date,
                CURRENT_DATE - o.purchase_date
                    AS days_since_purchase,
                o.price_aud,
                o.receipt_number,
                o.custom_cut,
                o.tinted,
                o.opened,
                o.seedling
            FROM orders o
            JOIN customers c
                ON c.id = o.customer_id
            JOIN products p
                ON p.id = o.product_id
            WHERE
                o.customer_id = ANY($1::uuid[])
            ORDER BY
                o.purchase_date DESC
            LIMIT 20
            `,
            [
                customers.map(
                    customer =>
                        customer.id
                )
            ]
        );

        return result.rows;
    }

    /*
     * Product-only lookup.
     */

    if (products.length > 0) {

        const result = await query(
            `
            SELECT
                o.id,
                o.order_code,
                c.customer_code,
                c.full_name,
                p.product_code,
                p.name AS product_name,
                p.category,
                p.brand,
                o.purchase_date,
                CURRENT_DATE - o.purchase_date
                    AS days_since_purchase,
                o.price_aud,
                o.receipt_number,
                o.custom_cut,
                o.tinted,
                o.opened,
                o.seedling
            FROM orders o
            JOIN customers c
                ON c.id = o.customer_id
            JOIN products p
                ON p.id = o.product_id
            WHERE
                o.product_id = ANY($1::uuid[])
            ORDER BY
                o.purchase_date DESC
            LIMIT 20
            `,
            [
                products.map(
                    product =>
                        product.id
                )
            ]
        );

        return result.rows;
    }

    /*
     * No resolved entity => no order evidence.
     */

    return [];
}

/*
 * ------------------------------------------------------------
 * POLICIES
 * ------------------------------------------------------------
 */

async function resolvePolicies(userQuery, codes = { policyCodes: [] }) {

    // Fast path: exact policy_code match
    if (codes.policyCodes?.length) {
        const exact = await query(
            `
            SELECT policy_code, title, content, category
            FROM policies
            WHERE policy_code = ANY($1::varchar[])
            `,
            [codes.policyCodes]
        );
        if (exact.rows.length > 0) {
            return exact.rows.map(r => ({ ...r, retrieval_score: 1000 }));
        }
    }

    const result = await query(
        `
        SELECT
            policy_code,
            title,
            content,
            category
        FROM policies
        ORDER BY title
        `
    );

    const queryText =
        normalize(userQuery);

    const queryTokens =
        tokens(queryText);

    const ranked =
        result.rows
            .map(policy => {

                const text =
                    normalize(
                        `${policy.title}
                         ${policy.content}
                         ${policy.category || ""}`
                    );

                let score = 0;

                for (
                    const token
                    of queryTokens
                ) {

                    if (text.includes(token)) {
                        score += 1;
                    }
                }

                if (
                    queryText.includes("return") ||
                    queryText.includes("refund") ||
                    queryText.includes("change of mind")
                ) {

                    if (
                        normalize(policy.title)
                            .includes("return")
                    ) {
                        score += 20;
                    }
                }

                if (
                    queryText.includes("warranty") ||
                    queryText.includes("defective") ||
                    queryText.includes("fault") ||
                    queryText.includes("service")
                ) {

                    if (
                        normalize(policy.title)
                            .includes("warranty")
                    ) {
                        score += 20;
                    }
                }

                return {
                    ...policy,
                    retrieval_score: score
                };
            })
            .filter(
                policy =>
                    policy.retrieval_score > 0
            )
            .sort(
                (a, b) =>
                    b.retrieval_score -
                    a.retrieval_score
            )
            .slice(0, 10);

    return ranked;
}

/*
 * ------------------------------------------------------------
 * MANUALS
 * ------------------------------------------------------------
 */

async function resolveManuals(
    userQuery,
    products,
    codes = { manualCodes: [] }
) {

    // Fast path: exact manual_code match
    if (codes.manualCodes?.length) {
        const exact = await query(
            `
            SELECT manual_code, product_code, title, content, category
            FROM manuals
            WHERE manual_code = ANY($1::varchar[])
            `,
            [codes.manualCodes]
        );
        if (exact.rows.length > 0) {
            return exact.rows.map(r => ({ ...r, retrieval_score: 1000 }));
        }
    }

    const result = await query(
        `
        SELECT
            manual_code,
            product_code,
            title,
            content,
            category
        FROM manuals
        ORDER BY title
        `
    );

    const queryText =
        normalize(userQuery);

    const productCodes =
        new Set(
            products.map(
                product =>
                    normalize(
                        product.product_code
                    )
            )
        );

    const ranked =
        result.rows
            .map(manual => {

                const text =
                    normalize(
                        `${manual.title}
                         ${manual.content}
                         ${manual.category || ""}
                         ${manual.product_code || ""}`
                    );

                let score = 0;

                for (
                    const token
                    of tokens(queryText)
                ) {

                    if (text.includes(token)) {
                        score++;
                    }
                }

                if (
                    manual.product_code &&
                    productCodes.has(
                        normalize(
                            manual.product_code
                        )
                    )
                ) {
                    score += 50;
                }

                return {
                    ...manual,
                    retrieval_score: score
                };
            })
            .filter(
                manual =>
                    manual.retrieval_score > 0
            )
            .sort(
                (a, b) =>
                    b.retrieval_score -
                    a.retrieval_score
            )
            .slice(0, 10);

    return ranked;
}

/*
 * ------------------------------------------------------------
 * TICKETS
 * ------------------------------------------------------------
 */

async function resolveTickets(
    customers,
    products,
    codes = { ticketCodes: [] }
) {

    // Fast path: exact ticket_code match (works with no customer resolved)
    if (codes.ticketCodes?.length) {
        const exact = await query(
            `
            SELECT
                t.ticket_code,
                c.customer_code,
                c.full_name,
                t.subject,
                t.description,
                t.status,
                t.created_at
            FROM tickets t
            LEFT JOIN customers c ON c.id = t.customer_id
            WHERE t.ticket_code = ANY($1::varchar[])
            `,
            [codes.ticketCodes]
        );
        if (exact.rows.length > 0) {
            return exact.rows.map(r => ({ ...r, retrieval_score: 1000 }));
        }
    }

    if (customers.length === 0) {
        return [];
    }

    const customerIds =
        customers.map(
            customer =>
                customer.id
        );

    const result = await query(
        `
        SELECT
            t.id,
            t.ticket_code,
            c.customer_code,
            c.full_name,
            t.subject,
            t.description,
            t.status,
            t.created_at
        FROM tickets t
        LEFT JOIN customers c
            ON c.id = t.customer_id
        WHERE
            t.customer_id = ANY($1::uuid[])
        ORDER BY
            t.created_at DESC
        LIMIT 20
        `,
        [customerIds]
    );

    /*
     * If a product is resolved, prefer tickets containing product
     * identifiers/terms. Otherwise retain all tickets for that
     * customer because they are still authoritative customer
     * service records.
     */

    if (products.length === 0) {
        return result.rows;
    }

    const productTerms =
        products.flatMap(product => [
            product.product_code,
            product.name,
            product.brand
        ])
        .filter(Boolean)
        .map(normalize);

    const ranked =
        result.rows
            .map(ticket => {

                const text =
                    normalize(
                        `${ticket.subject}
                         ${ticket.description}`
                    );

                let score = 0;

                for (
                    const term
                    of productTerms
                ) {

                    if (
                        term.length >= 3 &&
                        text.includes(term)
                    ) {
                        score += 20;
                    }

                    for (
                        const token
                        of tokens(term)
                    ) {

                        if (
                            text.includes(token)
                        ) {
                            score += 2;
                        }
                    }
                }

                return {
                    ...ticket,
                    retrieval_score: score
                };
            })
            .filter(
                ticket =>
                    ticket.retrieval_score > 0
            )
            .sort(
                (a, b) =>
                    b.retrieval_score -
                    a.retrieval_score
            );

    return ranked.length > 0
        ? ranked
        : result.rows;
}

/*
 * ------------------------------------------------------------
 * EVIDENCE CONTRACT
 * ------------------------------------------------------------
 */

function buildEvidenceContract({
    customers,
    products,
    orders,
    policies,
    manuals,
    tickets,
    staticKB
}) {

    return {
        evidence_policy: {

            authoritative_sources: [
                "postgresql.customers",
                "postgresql.products",
                "postgresql.orders",
                "postgresql.policies",
                "postgresql.manuals",
                "postgresql.tickets"
            ],

            supporting_sources: [
                "staticKB"
            ],

            rules: [
                "Use supplied PostgreSQL records as authoritative factual evidence.",
                "Do not invent customer, product, order, ticket or policy records.",
                "Do not combine unrelated customers.",
                "Do not combine unrelated orders.",
                "Do not introduce records not present in this evidence packet.",
                "Static KB is supporting evidence only.",
                "When evidence is insufficient, say INFORMATION_NOT_FOUND or INSUFFICIENT_EVIDENCE.",
                "When policy and transaction facts do not determine a definitive outcome, state the limitation.",
                "Do not provide an absolute legal conclusion from a store policy alone."
            ]
        },

        customers,
        products,
        orders,
        policies,
        manuals,
        tickets,
        staticKB
    };
}

/*
 * ------------------------------------------------------------
 * GATHER SOURCES
 * ------------------------------------------------------------
 */

export async function gatherSources(userQuery) {

    const codes =
        extractCodes(userQuery);

    const customers =
        await resolveCustomers(
            userQuery,
            codes
        );

    const products =
        await resolveProducts(
            userQuery
        );

    const orders =
        await resolveOrders(
            customers,
            products,
            codes
        );

    const policies =
        await resolvePolicies(
            userQuery,
            codes
        );

    const manuals =
        await resolveManuals(
            userQuery,
            products,
            codes
        );

    const tickets =
        await resolveTickets(
            customers,
            products,
            codes
        );

    const staticKB =
        searchStaticKB(
            userQuery,
            3
        );

    return {

        staticKB,

        customers,

        products,

        orders,

        policies,

        manuals,

        tickets,

        evidence_contract:
            buildEvidenceContract({
                customers,
                products,
                orders,
                policies,
                manuals,
                tickets,
                staticKB
            })
    };
}

/*
 * ------------------------------------------------------------
 * RUN AGENT
 * ------------------------------------------------------------
 */

export async function runAgent(userQuery) {

    const sources =
        await gatherSources(
            userQuery
        );

    const rag =
        await callRag({
            query: userQuery,
            evidence: sources
        });

    return {

        success: true,

        query: userQuery,

        source_summary: {

            static_kb:
                sources.staticKB.length,

            postgres_customers:
                sources.customers.length,

            postgres_products:
                sources.products.length,

            postgres_orders:
                sources.orders.length,

            postgres_policies:
                sources.policies.length,

            postgres_manuals:
                sources.manuals.length,

            postgres_tickets:
                sources.tickets.length
        },

        entity_resolution: {

            customer_codes:
                sources.customers.map(
                    row =>
                        row.customer_code
                ),

            product_codes:
                sources.products.map(
                    row =>
                        row.product_code
                ),

            order_codes:
                sources.orders.map(
                    row =>
                        row.order_code
                ),

            ticket_codes:
                sources.tickets.map(
                    row =>
                        row.ticket_code
                ),

            policy_codes:
                sources.policies.map(
                    row =>
                        row.policy_code
                ),

            manual_codes:
                sources.manuals.map(
                    row =>
                        row.manual_code
                )
        },

        sources,

        ai_backend: {

            id:
                rag.backendId,

            name:
                rag.backendName
        },

        rag:
            rag.response
    };
}