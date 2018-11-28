//<editor-fold desc="Modules">
// Load npm modules:
const MYSQL = require('mysql');
//</editor-fold>

//<editor-fold desc="MySQL-connection">
const DB_CONFIG = {
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
};
let CONNECTION;
//</editor-fold>

const ANNONCE_TABLE_NAME = 'annonce';
const REGION_TABLE_NAME = 'region';
const CHECKSUM_CACHE = {};
const BODY_CHECKSUM_CACHE = {};

/**
 * @class
 * Class implementing ORM-techniques to paradigm match OO-models and database schema.
 *
 * @since       1.0.0
 * @access      public
 */
class ORM {
    static disconnectDatabase() {
        return new Promise((resolve, reject) => {
            clearInterval(ORM.keepDataConnectionAliveHandle);
            ORM.keepDataConnectionAliveHandle = undefined;

            CONNECTION.end(function(err) {
                if (err)
                    reject(`Disconnect database error: ${err}`);
                else
                    resolve();
            });
        });
    }

    static connectDatabase() {

        CONNECTION = MYSQL.createConnection(DB_CONFIG); // Recreate the connection, since
        // the old one cannot be reused.

        CONNECTION.connect(function(err) {              // The server is either down
            if(err) {                                     // or restarting (takes a while sometimes).
                console.log('error when connecting to db:', err);
                setTimeout(this.connectDatabase, 2000); // We introduce a delay before attempting to reconnect,
            }                                     // to avoid a hot loop, and to allow our node script to
            else
            {
                //Keep database connection alive by repetitive database calls
                ORM.keepDataConnectionAliveHandle = setInterval(() => {
                    let query = `SELECT 1`;

                    CONNECTION.query(query,
                        function (error) {
                            if (error)
                                console.log("Error at ORM.KeepConnectionAlive() → " + error);
                            else
                                console.log("Ok at ORM.KeepConnectionAlive()");
                        })
                }, 60000); //run each minute
            }
        });                                     // process asynchronous requests in the meantime.
        // If you're also serving http, display a 503 error.
        CONNECTION.on('error', function(err) {
            console.log('db error', err);
            if(err.code === 'PROTOCOL_CONNECTION_LOST') { // Connection to the MySQL server is usually
                this.connectDatabase();                         // lost due to either server restart, or a
            } else {                                      // connnection idle timeout (the wait_timeout
                throw err;                                  // server variable configures this)
            }
        });
    }

    /**
     * Creates the annonce database table if none exists
     *
     * @since       1.0.0
     * @access      public
     *
     * @returns {Promise<any>}
     */
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

    /**
     * Creates the regions database table if none exists
     *
     * @since       1.0.0
     * @access      public
     *
     * @returns {Promise<any>}
     */
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
     * Searches for the body checksum in local cache.
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
            for (let key in object) {
                if (object.hasOwnProperty(key))
                    return false;
            }
            return true;
        }

        return new Promise((resolve, reject) => {

            // Resolve or reject based on cache
            // Checks local cache for checksum
            function settlePromise(checksum) {
                if (CHECKSUM_CACHE[incomingChecksum])
                    resolve(true);
                else
                    resolve(false);
            }

            // Checks if local cache is empty
            if (isObjectEmpty(CHECKSUM_CACHE)) {
                const query =
                    'SELECT checksum ' +
                    `FROM ${ANNONCE_TABLE_NAME} `;

                CONNECTION.query(query, function (error, cursor) {
                    if (error) {
                        reject("Error at ORM.FindChecksum() → " + error);
                    } else {
                        for (let record of cursor)
                            CHECKSUM_CACHE[record.checksum] = record.checksum;
                        settlePromise(incomingChecksum);
                    }
                });
            } else {
                settlePromise(incomingChecksum);
            }
        })
    }

    /**
     * Searches the database for specified region.
     *
     * @since       1.0.0
     * @access      public
     *
     * @param {String}              incomingRegionName      Checksum to be searched for.
     *
     * @returns {Promise<String>}                           Returns the id of the specified region.
     */
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
     *
     * @since       1.0.0
     * @access      public
     *
     * @param {Annonce}             newRecord               Annonce model to add to database.
     *
     * @returns {Promise<void>}
     */
    static async InsertAnnonce(newRecord) {
        return new Promise((resolve, reject) => {
            let query = `INSERT IGNORE INTO ${ANNONCE_TABLE_NAME} (TITLE, BODY, REGION_ID, TIMESTAMP, CHECKSUM, URL) ` +
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

    /**
     * Inserts a new region with specified unique name into database
     *
     * @since       1.0.0
     * @access      public
     *
     * @param {String}              newRegion               Region to add to database
     *
     * @returns {Promise<void>}
     */
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

}

module.exports = ORM;
