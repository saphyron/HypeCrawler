//<editor-fold desc="Modules">
// Load npm modules:
const MYSQL = require('mysql');
//</editor-fold>

//<editor-fold desc="MySQL-connection">
const CONNECTION = MYSQL.createConnection({
    host: process.env.MYSQL_HOST_TEST,
    user: process.env.MYSQL_USER_TEST,
    password: process.env.MYSQL_PASSWORD_TEST,
    database: process.env.MYSQL_DATABASE_TEST
});
//</editor-fold>

const ANNONCE_TABLE_NAME = 'annonce';
const REGION_TABLE_NAME = 'region';
const CHECKSUM_CACHE = {};

//<editor-fold desc="data-implementation">
class ORM {

    //<editor-fold desc="Annonce Methods">

    static CreateAnnonceTable() {
        return new Promise((resolve, reject) => {
            const query = `CREATE TABLE IF NOT EXISTS ${ANNONCE_TABLE_NAME} (` +
                'ID INTEGER AUTO_INCREMENT PRIMARY KEY, ' +
                'TITLE TEXT, ' +
                'BODY MEDIUMBLOB, ' +
                'region_id INTEGER, ' +
                'TIMESTAMP DATETIME,' +
                'CHECKSUM TEXT, ' +
                'URL TEXT, ' +
                'FOREIGN KEY(region_id) REFERENCES region(region_id))';

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
                'region_id INTEGER AUTO_INCREMENT PRIMARY KEY, ' +
                'NAME VARCHAR(255) UNIQUE' +
                ');';

            CONNECTION.query(query, function (error, result) {
                if (error) reject("Error at ORM.CreateRegionTable() → " + error);
                console.log('SUCCESS!');
                resolve(result);
            });
        });
    }

    /**
     * Searches for the checksum in local cache.
     *
     * @since       1.0.0
     * @access      public
     *
     * @param   {String}              incomingChecksum              Checksum to be searched for.
     *
     * @returns {Promise<String>}                                   Returns a checksum or empty string.
     */
    static FindChecksum(incomingChecksum) {
        // Utility function to check if cache exists.
        function isObjectEmpty(object) {
            for(let key in object) {
                if(object.hasOwnProperty(key))
                    return false;
            }
            return true;
        }

        // Utility function to fill local cache with all current checksums from database.
        function fillCache(cursor) {
            for(let record of cursor) {
                CHECKSUM_CACHE[record.checksum] = record.checksum;
            }
        }

        return new Promise((resolve, reject) => {
            // Checks if local cache is empty
            if(isObjectEmpty(CHECKSUM_CACHE)) {
                const query =
                    'SELECT checksum ' +
                    `FROM ${ANNONCE_TABLE_NAME} `;

                CONNECTION.query(query, [incomingChecksum], function (error, result) {
                    if (error) reject("Error at ORM.FindChecksum() → " + error);
                    fillCache(result);
                });
            }

            // Checks local cache for checksum
            if (CHECKSUM_CACHE[incomingChecksum]) {
                resolve(true);
            } else {
                resolve(false);
            }
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

                    // Update local cache with new entry:
                    CHECKSUM_CACHE[newRecord.checksum] = newRecord.checksum;
                    console.log('1 record inserted!');
                    resolve(result);
                })
        });
    }

    static InsertRegion(newRegion) {
        return new Promise((resolve, reject) => {
            let query = `INSERT IGNORE INTO ${REGION_TABLE_NAME} (name) ` +
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



