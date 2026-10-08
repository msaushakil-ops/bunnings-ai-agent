const STATIC_KB = [

    {
        id: "STATIC-POL-001",
        type: "policy",
        title: "Returns Policy",
        content:
            "Unused standard items can generally be returned within 30 days with proof of purchase. Custom-cut timber and tinted paint are excluded from change-of-mind returns."
    },

    {
        id: "STATIC-MAN-001",
        type: "manual",
        title: "H2 / H3 / H4 Timber Manual",
        content:
            "H2 is intended for protected interior applications. H3 is for above-ground exterior exposure. H4 is for ground-contact applications."
    },

    {
        id: "STATIC-MAN-002",
        type: "manual",
        title: "Power Tool Service Guide",
        content:
            "Defective power tools within 30 days may qualify for direct exchange or refund. Later cases may require authorised service inspection."
    }

];

function tokens(text) {

    return text
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
}

export function searchStaticKB(
    userQuery,
    limit = 5
) {

    const queryTokens =
        tokens(userQuery);

    const results =
        STATIC_KB.map(doc => {

            const text =
                `${doc.title} ${doc.content}`
                    .toLowerCase();

            let score = 0;

            for (
                const token
                of queryTokens
            ) {

                if (text.includes(token)) {
                    score++;
                }
            }

            return {
                ...doc,
                score
            };
        })

        .filter(
            doc => doc.score > 0
        )

        .sort(
            (a, b) =>
                b.score - a.score
        )

        .slice(0, limit);

    return results;
}