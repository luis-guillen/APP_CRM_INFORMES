const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

// Directorio de datos
const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'reker.db');

let db = null;

// Wrapper para simular API síncrona de better-sqlite3
class DatabaseWrapper {
    constructor(database) {
        this._db = database;
    }

    prepare(sql) {
        const self = this;
        return {
            run(...params) {
                self._db.run(sql, params);
                return { lastInsertRowid: self._db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0] || 0 };
            },
            get(...params) {
                const stmt = self._db.prepare(sql);
                stmt.bind(params);
                if (stmt.step()) {
                    const columns = stmt.getColumnNames();
                    const values = stmt.get();
                    stmt.free();
                    const row = {};
                    columns.forEach((col, i) => row[col] = values[i]);
                    return row;
                }
                stmt.free();
                return undefined;
            },
            all(...params) {
                const stmt = self._db.prepare(sql);
                stmt.bind(params);
                const results = [];
                const columns = stmt.getColumnNames();
                while (stmt.step()) {
                    const values = stmt.get();
                    const row = {};
                    columns.forEach((col, i) => row[col] = values[i]);
                    results.push(row);
                }
                stmt.free();
                return results;
            }
        };
    }

    exec(sql) {
        this._db.run(sql);
    }

    transaction(fn) {
        return () => {
            this._db.run("BEGIN TRANSACTION");
            try {
                const result = fn();
                this._db.run("COMMIT");
                return result;
            } catch (e) {
                this._db.run("ROLLBACK");
                throw e;
            }
        };
    }

    pragma(str) {
        this._db.run(`PRAGMA ${str}`);
    }

    close() {
        // Guardar a disco
        const data = this._db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(dbPath, buffer);
    }

    save() {
        const data = this._db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(dbPath, buffer);
    }
}

async function initDatabase() {
    if (db) return db;

    const SQL = await initSqlJs();

    let database;
    if (fs.existsSync(dbPath)) {
        const buffer = fs.readFileSync(dbPath);
        database = new SQL.Database(buffer);
    } else {
        database = new SQL.Database();
    }

    db = new DatabaseWrapper(database);

    // Guardar periódicamente
    setInterval(() => {
        if (db) db.save();
    }, 30000);

    return db;
}

// Para compatibilidad, exportamos una promesa que resuelve el db
let dbPromise = initDatabase();

module.exports = {
    getDb: async () => {
        if (!db) {
            db = await dbPromise;
        }
        return db;
    },
    // Para uso sincrónico después de inicializar
    get db() {
        return db;
    }
};
