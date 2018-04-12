//<editor-fold desc="Modules">
// Load npm modules:
const mysql = require('mysql');
const DBCREDS = require('../credentials/database-credentials').testdbcreds;
//</editor-fold>

//<editor-fold desc="MySQL-connection">

// Create connection
// REQUIRES: credential file for database.
const connection = mysql.createConnection({
    host: DBCREDS.host,
    user: DBCREDS.user,
    password: DBCREDS.password,
    database: DBCREDS.database
});


// Create connection to DB
connection.connect(function (err) {
    if (err) throw err;
    console.log('Connected!');
});

//</editor-fold>

//<editor-fold desc="ORM-implementation">
class ORM {

    static async CreateAnnonceTable() {
        const query = `CREATE TABLE IF NOT EXISTS ANNONCE (` +
            `ID INTEGER AUTO_INCREMENT PRIMARY KEY, ` +
            `TITLE TEXT, ` +
            `BODY BLOB, ` +
            `FOREIGN KEY(`
    }

    static async CreateRegionTable() {
        const query = 'CREATE TABLE IF NOT EXISTS REGION (' +
            'ID INTEGER AUTO_INCREMENT PRIMARY KEY, ' +
            'NAME TEXT)';

        await connection.query(query, function (err, result) {
            if (err) throw err;
            console.log('SUCCESS!');
        });
    }

}
//</editor-fold>



