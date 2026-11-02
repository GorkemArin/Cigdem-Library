const Database = require('better-sqlite3');
const db = new Database(':memory:');
console.log(db.prepare('select sqlite_version() v').get());
db.exec("create virtual table t using fts5(x, tokenize='unicode61 remove_diacritics 2')");
db.prepare('insert into t values (?)').run('Çiğdem Mahallesi');
console.log(db.prepare('select * from t where t match ?').all('cigdem*'));
console.log(db.prepare('select * from t where t match ?').all('"cigdem"*'));
