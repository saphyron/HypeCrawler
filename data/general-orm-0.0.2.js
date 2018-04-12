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

    //<editor-fold desc="Table Constructors">

    //<editor-fold desc="Annonce Methods">

    static async CreateAnnonceTable() {
        const query = 'CREATE TABLE IF NOT EXISTS ANNONCE (' +
            'ID INTEGER AUTO_INCREMENT PRIMARY KEY, ' +
            'TITLE TEXT, ' +
            'BODY BLOB, ' +
            'TIMESTAMP DATETIME,' +
            'EXPIRING_DATE DATE, ' +
            'CREATION_DATE DATE, ' +
            'REGION_ID INTEGER, ' +
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

    /**
     * Inserts a new Annonce record into the database
     * @param {Annonce} newRecord - Annonce to add.
     * @returns {Promise<void>}
     * @constructor
     */
    static async InsertAnnonce(newRecord) {
        let query = 'INSERT INTO ANNONCE (TITLE, BODY, TIMESTAMP, EXPIRING_DATE, CREATION_DATE) ' +
            'VALUES (?, ?, ?, ?, ?)';

        await connection.query(query, [newRecord.title, newRecord.body, newRecord.timestamp, newRecord.expiringDate,
        newRecord.creationDate], function (error, result) {
            if(error) throw error;
            //console.log('1 record inserted!');
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

    //</editor-fold>



    // WIP
    static async InsertRecord(tableName, newRecord) {
        let query = 'INSERT INTO ?? (';
        let recordColumnLength = Object.keys(newRecord).length;
        let index = 0;

        while(index < recordColumnLength-1) {
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
            if(newRecord[propName] === undefined) {
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



