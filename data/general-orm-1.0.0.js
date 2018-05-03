//<editor-fold desc="Modules">
// Load npm modules:
const MYSQL = require('mysql');
//</editor-fold>

//<editor-fold desc="MySQL-connection">
const CONNECTION = MYSQL.createConnection({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
});
//</editor-fold>

const ANNONCE_TABLE_NAME = 'annonce';
const REGION_TABLE_NAME = 'region';

//<editor-fold desc="data-implementation">
class ORM {

    //<editor-fold desc="Annonce Methods">

    static CreateAnnonceTable() {
        return new Promise((resolve, reject) => {
            const query = `CREATE TABLE IF NOT EXISTS ${ANNONCE_TABLE_NAME} (` +
                'ID INTEGER AUTO_INCREMENT PRIMARY KEY, ' +
                'TITLE TEXT, ' +
                'BODY MEDIUMBLOB, ' +
                'REGION_ID INTEGER, ' +
                'TIMESTAMP DATETIME,' +
                'CHECKSUM TEXT, ' +
                'URL TEXT, ' +
                'FOREIGN KEY(REGION_ID) REFERENCES REGION(ID))';

            CONNECTION.query(query, function (error, result) {
                if (error) reject("Error at ORM.CreateAnnonceTable() → " + error);
                console.log('SUCCESS!');
                resolve(result);
            });
        })
    }

    static CreateRegionTable() {
        return new Promise((resolve, reject) => {
            const query = `CREATE TABLE IF NOT EXISTS ${REGION_TABLE_NAME} (` +
                'ID INTEGER AUTO_INCREMENT PRIMARY KEY, ' +
                'NAME VARCHAR(255) UNIQUE' +
                ');';

            CONNECTION.query(query, function (error, result) {
                if (error) reject("Error at ORM.CreateRegionTable() → " + error);
                console.log('SUCCESS!');
                resolve(result);
            });
        });
    }

    // SHA-1 selection:
    static FindChecksum(incomingChecksum) {
        return new Promise((resolve, reject)=> {
            const query =
                'SELECT * ' +
                `FROM ${ANNONCE_TABLE_NAME} ` +
                'WHERE checksum = ? ' +
                'LIMIT 1';

            CONNECTION.query(query, [incomingChecksum], function (error, result) {
                if (error) reject("Error at ORM.FindChecksum() → " + error);
                resolve(result);
            });
        })
    }

    static FindRegionID(incomingRegionName) {
        return new Promise((resolve, reject) => {
            const query =
                'SELECT region_id ' +
                `FROM ${REGION_TABLE_NAME} ` +
                'WHERE name = ? ' +
                'LIMIT 1';

            CONNECTION.query(query, [incomingRegionName], function (error, result) {
                if (error) reject("Error at ORM.FindRegionID() → " + error);
                resolve(result);
            });
        })
    }

    /**
     * Inserts a new Annonce record into the database
     * @param {Annonce} newRecord - Annonce to add.
     * @returns {Promise<void>}
     */
    static InsertAnnonce(newRecord) {
        return new Promise((resolve, reject) => {
            let query = `INSERT INTO ${ANNONCE_TABLE_NAME} (TITLE, BODY, REGION_ID, TIMESTAMP, CHECKSUM, URL) ` +
                'VALUES (?, ?, ?, ?, ?, ?)';

            CONNECTION.query(query, [newRecord.titel, newRecord.body, newRecord.regionId, newRecord.timestamp,
                    newRecord.checksum, newRecord.url],
                function (error, result) {
                    if (error) reject("Error at ORM.InsertAnnonce() → " + error);
                    console.log('1 record inserted!');
                    resolve(result);
                })
        });
    }

    static InsertRegion(newRegion) {
        return new Promise((resolve, reject) => {
            let query = `INSERT IGNORE INTO ${REGION_TABLE_NAME} (NAME) ` +
                'VALUES (?)';

            CONNECTION.query(query, [newRegion.name],
                function (error, result) {
                    if (error) reject("Error at ORM.InsertRegion() → " + error);
                    console.log('1 record inserted!');
                    resolve(result);
                })
        });
    }


    //</editor-fold>


    // WIP
    static async InsertRecord(tableName, newRecord) {
        let query = 'INSERT INTO ?? (';
        let recordColumnLength = Object.keys(newRecord).length;
        let index = 0;

        while (index < recordColumnLength - 1) {
            query += newRecord[index] + ', ';
            index++;
        }

        Object.keys(newRecord).forEach(function (key, index) {
            console.log(key, ': ', index);
        });


        for (let propName in newRecord) {
            query += propName + ', ';
        }
        query += ') VALUES(';
        for (let propName in newRecord) {
            if (newRecord[propName] === undefined) {
                query += '\'null\', ';
            }
            else if (isNaN(newRecord[propName])) {
                query += '\'' + newRecord[propName] + '\', ';
            }
            else {
                query += newRecord[propName] + ', ';
            }
        }
        query += ')';


        console.log(query);
        await CONNECTION.query(query, [tableName.toUpperCase()], function (err, result) {
            if (err) throw err;
            console.log('SUCCESS!');
        });
    }

}

module.exports = ORM;


//</editor-fold>



