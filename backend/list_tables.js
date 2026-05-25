const { Client } = require('pg');
const dotenv = require('dotenv');
dotenv.config();

async function listTables() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    await client.connect();
    const res = await client.query(`SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema NOT IN ('information_schema', 'pg_catalog')`);
    console.log("All tables:", res.rows);
    await client.end();
}

listTables();
