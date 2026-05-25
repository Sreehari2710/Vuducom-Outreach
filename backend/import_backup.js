const fs = require('fs');
const { Client } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

async function importSql() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    await client.connect();
    console.log("Connected to Neon database.");

    const sqlFile = fs.readFileSync('20260512_170742.sql', 'utf8');
    const lines = sqlFile.split(/\r?\n/);

    let inCopy = false;
    let copyTable = "";
    let copyColumns = "";
    let copyData = [];

    console.log("Processing SQL file...");

    const targetTables = [
        'public."User"',
        'public."Template"',
        'public."Campaign"',
        'public."Contact"',
        'public."Notification"',
        'public."Reply"',
        'public."SentEmail"'
    ];

    let currentStatement = "";

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.startsWith('COPY ')) {
            const match = line.match(/COPY (.*?) \((.*?)\) FROM stdin;/);
            if (match && targetTables.includes(match[1])) {
                inCopy = true;
                copyTable = match[1];
                copyColumns = match[2];
                copyData = [];
                console.log(`Starting data import for ${copyTable}...`);
            } else {
                inCopy = false; 
            }
            continue;
        }

        if (line === '\\.') {
            if (inCopy) {
                inCopy = false;
                if (copyData.length > 0) {
                    console.log(`Inserting ${copyData.length} rows into ${copyTable}...`);
                    const batchSize = 100;
                    for (let j = 0; j < copyData.length; j += batchSize) {
                        const batch = copyData.slice(j, j + batchSize);
                        const valuesList = [];
                        const params = [];
                        let paramIdx = 1;

                        batch.forEach(row => {
                            const rowValues = row.split('\t');
                            const placeholders = rowValues.map(v => {
                                params.push(v === '\\N' ? null : v);
                                return `$${paramIdx++}`;
                            });
                            valuesList.push(`(${placeholders.join(',')})`);
                        });

                        const query = `INSERT INTO ${copyTable} (${copyColumns}) VALUES ${valuesList.join(',')} ON CONFLICT DO NOTHING`;
                        await client.query(query, params);
                    }
                }
            }
            continue;
        }

        if (inCopy) {
            copyData.push(line);
            continue;
        }

        if (line.trim() === "" || line.startsWith('--') || line.startsWith('\\')) {
            continue;
        }

        currentStatement += " " + line;

        if (line.endsWith(';')) {
            const stmt = currentStatement.trim();
            const isRelevant = targetTables.some(t => stmt.includes(t)) || 
                             stmt.includes('public."') ||
                             stmt.includes('ALTER TABLE ONLY public."');
            
            if (isRelevant) {
                try {
                    // Skip schema creation/extensions
                    if (stmt.includes('CREATE SCHEMA') || stmt.includes('EXTENSION')) {
                        currentStatement = "";
                        continue;
                    }
                    await client.query(stmt);
                } catch (err) {
                    if (!err.message.includes("already exists") && !err.message.includes("does not exist")) {
                        // console.warn(`SQL Error: ${err.message}\nStatement: ${stmt.substring(0, 100)}...`);
                    }
                }
            }
            currentStatement = "";
        }
    }

    console.log("Import complete!");
    await client.end();
}

importSql().catch(err => {
    console.error("Critical Import Error:", err);
    process.exit(1);
});
