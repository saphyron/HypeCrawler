//<editor-fold desc="Modules">
// Load npm modules:
const mysql = require('mysql');
const DBCREDS = require('../credentials/database-credentials').testdbcreds;
//</editor-fold>

//<editor-fold desc="MySQL-connection">
const connection = mysql.createConnection({
    host: DBCREDS.host,
    user: DBCREDS.user,
    password: DBCREDS.password,
    database: DBCREDS.database
});
//</editor-fold>

//<editor-fold desc="data-implementation">
class ORM {



    //<editor-fold desc="Annonce Methods">

    static async CreateAnnonceTable() {
        const query = 'CREATE TABLE IF NOT EXISTS ANNONCE (' +
            'ID INTEGER AUTO_INCREMENT PRIMARY KEY, ' +
            'TITLE TEXT, ' +
            'BODY MEDIUMBLOB, ' +
            'REGION_ID INTEGER, ' +
            'TIMESTAMP DATETIME,' +
            'CHECKSUM TEXT, ' +
            'FOREIGN KEY(REGION_ID) REFERENCES REGION(ID))';

        await connection.query(query, function (err, result) {
            if (err) throw err;
            console.log('SUCCESS!');
            //  console.log(result.serverStatus);
            for (let propName in result.OkPacket) {
                let propValue = result.OkPacket[propName];
                console.log(propName, ': ', propValue);
            }
        });
    }

    // SHA-1 selection:
    static async FindChecksum(incomingChecksum) {
        const query =
            'SELECT * ' +
            'FROM ANNONCE ' +
            'WHERE CHECKSUM = ? ' +
            'LIMIT 1';

        await connection.query(query, [incomingChecksum] , function (error, result, fields) {
            if(error) throw error;
            else if(result) {
                console.log(result);
                return result;
            }
        })
    }

    /**
     * Inserts a new Annonce record into the database
     * @param {Annonce} newRecord - Annonce to add.
     * @returns {Promise<void>}
     * @constructor
     */
    static async InsertAnnonce(newRecord) {
        let query = 'INSERT INTO ANNONCE (TITLE, BODY, TIMESTAMP, CHECKSUM) ' +
            'VALUES (?, ?, ?, ?)';

        await connection.query(query, [newRecord.titel, newRecord.body, newRecord.timestamp, newRecord.checksum],
            function (error, result) {
                if (error) throw error;
                console.log('1 record inserted!');
            })
    }

    //</editor-fold>


    static async CreateRegionTable() {
        const query = 'CREATE TABLE IF NOT EXISTS REGION (' +
            'ID INTEGER AUTO_INCREMENT PRIMARY KEY, ' +
            'NAME TEXT)';

        await connection.query(query, function (err, result) {
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
        await connection.query(query, [tableName.toUpperCase()], function (err, result) {
            if (err) throw err;
            console.log('SUCCESS!');
        });
    }

}

module.exports = ORM;


//</editor-fold>



