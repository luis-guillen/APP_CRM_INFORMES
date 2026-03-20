const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const defaultDataDir = path.join(__dirname, '../../data');

function resolveDbPath() {
    if (process.env.REKER_DB_PATH) {
        if (process.env.REKER_DB_PATH === ':memory:') {
            return ':memory:';
        }
        return path.resolve(process.env.REKER_DB_PATH);
    }
    return path.join(defaultDataDir, 'reker.db');
}

function ensureDbDir(dbPath) {
    if (dbPath === ':memory:') return;
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }
}

let db = null;

class DatabaseWrapper {
    constructor(database) {
        this._db = database;
    }

    prepare(sql) {
        const self = this;
        return {
            run(...params) {
                return self._db.prepare(sql).run(...params);
            },
            get(...params) {
                return self._db.prepare(sql).get(...params);
            },
            all(...params) {
                return self._db.prepare(sql).all(...params);
            }
        };
    }

    exec(sql) {
        this._db.exec(sql);
    }

    transaction(fn) {
        return (...args) => {
            this._db.exec('BEGIN');
            try {
                const result = fn(...args);
                this._db.exec('COMMIT');
                return result;
            } catch (e) {
                this._db.exec('ROLLBACK');
                throw e;
            }
        };
    }

    pragma(str) {
        this._db.exec(`PRAGMA ${str}`);
    }

    close() {
        this._db.close();
    }

    save() {
        // No-op: SQLite persiste transaccionalmente en disco en cada COMMIT.
    }
}

async function initDatabase() {
    if (db) return db;
    const dbPath = resolveDbPath();
    ensureDbDir(dbPath);
    const database = new DatabaseSync(dbPath);
    db = new DatabaseWrapper(database);
    db.exec('PRAGMA foreign_keys = ON');
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA synchronous = NORMAL');

    return db;
}

let dbPromise = null;

module.exports = {
    getDb: async () => {
        if (!db) {
            if (!dbPromise) {
                dbPromise = initDatabase();
            }
            db = await dbPromise;
        }
        return db;
    },
    // Alias explícito para inicialización en tests
    initDb: initDatabase,
    // Para uso sincrónico después de inicializar
    get db() {
        return db;
    },
    resetDbForTests: () => {
        if (db) {
            db.close();
        }
        db = null;
        dbPromise = null;
    }
};
