//<editor-fold desc="Modules">
// Load npm modules:
const MYSQL = require('mysql');
const DBCREDS = require('../credentials/database-credentials').dbcreds;
//</editor-fold>

//<editor-fold desc="MySQL-connection">
const CONNECTION = MYSQL.createConnection({
    host: DBCREDS.host,
    user: DBCREDS.user,
    password: DBCREDS.password,
    database: DBCREDS.database
});
//</editor-fold>

const ANNONCE_TABLE_NAME = 'annonce';
//<editor-fold desc="data-implementation">
class ORM {


    //<editor-fold desc="Annonce Methods">

    static CreateAnnonceTable() {
        return new Promise(resolve => {
            const query = 'CREATE TABLE IF NOT EXISTS ANNONCE (' +
                'ID INTEGER AUTO_INCREMENT PRIMARY KEY, ' +
                'TITLE TEXT, ' +
                'BODY MEDIUMBLOB, ' +
                'REGION_ID INTEGER, ' +
                'TIMESTAMP DATETIME,' +
                'CHECKSUM TEXT, ' +
                'FOREIGN KEY(REGION_ID) REFERENCES REGION(ID))';

            CONNECTION.on('error', function(err) {
                console.log(err);
                return;
            });

            CONNECTION.query(query, function (error, result) {
                if (error) throw error;

                console.log('SUCCESS!');
                //  console.log(result.serverStatus);
                for (let propName in result.OkPacket) {
                    let propValue = result.OkPacket[propName];
                    console.log(propName, ': ', propValue);
                }
                resolve(result);
            });
        })
    }

    // SHA-1 selection:
    static FindChecksum(incomingChecksum) {
        return new Promise(resolve => {
            const query =
                'SELECT * ' +
                `FROM ${ANNONCE_TABLE_NAME} ` +
                'WHERE checksum = ? ' +
                'LIMIT 1';

            CONNECTION.query(query, [incomingChecksum], function (error, result) {
                if (error) throw error;
                resolve(result);
            });
        })
    }

    /**
     * Inserts a new Annonce record into the database
     * @param {Annonce} newRecord - Annonce to add.
     * @returns {Promise<void>}
     * @constructor
     */
    static InsertAnnonce(newRecord) {
        return new Promise(resolve => {
            let query = `INSERT INTO ${ANNONCE_TABLE_NAME} (TITLE, BODY, TIMESTAMP, CHECKSUM) ` +
                'VALUES (?, ?, ?, ?)';

            CONNECTION.query(query, [newRecord.titel, newRecord.body, newRecord.timestamp, newRecord.checksum],
                function (error, result) {
                    if (error) throw error;
                    console.log('1 record inserted!');
                    resolve(result);
                })
        });
    }

    //</editor-fold>


    static async CreateRegionTable() {
        const query = 'CREATE TABLE IF NOT EXISTS REGION (' +
            'ID INTEGER AUTO_INCREMENT PRIMARY KEY, ' +
            'NAME TEXT)';

        await CONNECTION.query(query, function (err, result) {
            if (err) throw err;
            console.log('SUCCESS!');
        });
    }


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



