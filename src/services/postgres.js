import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
    host: process.env.PG_HOST,
    port: Number(process.env.PG_PORT || 5432),
    database: process.env.PG_DATABASE,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,

    max: 10,

    idleTimeoutMillis: 30000,

    connectionTimeoutMillis: 5000
});

export async function query(
    text,
    params = []
) {
    return pool.query(
        text,
        params
    );
}

export async function checkPostgresHealth() {
    try {
        const result = await pool.query("SELECT NOW() AS now");
        return {
            healthy: true,
            databaseTime: result.rows[0].now
        };
    } catch (error) {
        return {
            healthy: false,
            error: error.message
        };
    }
}

export async function closePostgres() {
    await pool.end();
}

export default pool;