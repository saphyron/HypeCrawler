// Load the MySQL module from npm to interact with MySQL databases.
const MYSQL = require('mysql');

// Define the database connection parameters.
const DB_CONFIG = {
    host: process.env.MYSQL_HOST,      // Database host address from environment variables.
    port: process.env.MYSQL_PORT,      // Database port from environment variables.
    user: 'root',                      // Default database user.
    password: '4b6YA5Uq2zmB%t5u2*e5jT!u4c$lfw6T', // Secure password for the database user.
    database: 'test_database_mariadb'  // Name of the database to connect to.
};
//console.log('DB_CONFIG:', DB_CONFIG); // Log the database configuration for debugging.
let CONNECTION;                       // Variable to hold the database connection object.

// Constants for table names in the database.
const ANNONCE_TABLE_NAME = 'annonce'; // Table name for announcements.
const REGION_TABLE_NAME = 'region';   // Table name for regions.

// Caches to store data and reduce database access.
const CHECKSUM_CACHE = {};            // Cache to store checksums to avoid redundant database queries.
const BODY_CHECKSUM_CACHE = {};       // Cache specifically for body checksums, used for data integrity.

/**
 * Class providing ORM functionalities to map object models to a database schema.
 */
class ORM {
    /**
     * Closes the database connection cleanly.
     * @returns {Promise<void>} Promise that resolves when the connection is closed.
     */
    static disconnectDatabase() {
        return new Promise((resolve, reject) => {
            clearInterval(ORM.keepDataConnectionAliveHandle); // Stop the interval that keeps the connection alive.
            ORM.keepDataConnectionAliveHandle = undefined;    // Clear the handle after stopping the interval.

            CONNECTION.end(function (err) {                   // Attempt to close the database connection.
                if (err)
                    reject(`Disconnect database error: ${err}`); // Reject the promise if an error occurs.
                else
                    resolve();                                 // Resolve the promise on successful disconnection.
            });
        });
    }
    /**
    * Establishes a connection to the database with error handling and reconnection logic.
    * @returns {Promise<MYSQL.Connection>} Promise that resolves with the database connection.
    */
    static connectDatabase() {
        return new Promise((resolve, reject) => {

            CONNECTION = MYSQL.createConnection(DB_CONFIG); // Create a new connection using the config settings.
            CONNECTION.connect(function (err) {             // Attempt to connect to the database.
                if (err) {                                  // Handle errors during the connection attempt.
                    console.log('error when connecting to db:', err);
                    setTimeout(() => {                      // Set a timeout to retry connection after a delay.
                        ORM.connectDatabase().then(resolve).catch(reject);
                    }, 2000); // Retry connection after 2 seconds
                }
                else {
                    //Keep database connection alive by repetitive database calls
                    ORM.keepDataConnectionAliveHandle = setInterval(() => {
                        let query = `SELECT 1`;             // Query to keep the database connection alive.

                        CONNECTION.query(query,
                            function (error) {
                                if (error)
                                    console.log("Error at ORM.KeepConnectionAlive() → " + error);
                                else
                                    console.log("Ok at ORM.KeepConnectionAlive()");
                            })
                    }, 60000); // Run the keep-alive query every minute.
                    resolve(CONNECTION);                   // Resolve the promise with the connection object.
                }
            });
            // If you're also serving http, display a 503 error.
            CONNECTION.on('error', function (err) {        // Listen for errors on the connection.
                console.log('db error', err);
                if (err.code === 'PROTOCOL_CONNECTION_LOST') { // Automatically reconnect if the connection is lost.
                    ORM.connectDatabase().then(resolve).catch(reject);
                } else {
                    reject(err);                          // Reject the promise on any other database error.
                }
            });
        });
    }
    // TODO: tilføj possible_duplicate column
    /**
     * Creates the 'annonce' table if it does not exist in the database.
     * @returns {Promise<void>} Promise that resolves when the table is created or confirmed to exist.
     */
    static CreateAnnonceTable() {
        return new Promise((resolve, reject) => {
            const query = `CREATE TABLE IF NOT EXISTS ${ANNONCE_TABLE_NAME} (` +
                'ID INTEGER AUTO_INCREMENT PRIMARY KEY, ' +
                'TITLE TEXT, ' +
                'BODY MEDIUMBLOB, ' +
                'region_id INTEGER, ' +
                'TIMESTAMP DATETIME,' +
                'CHECKSUM varchar(40), ' +
                'URL TEXT, ' +
                'CVR TEXT, ' +
                'Homepage TEXT, ' +
                'FOREIGN KEY(region_id) REFERENCES region(region_id))';

            CONNECTION.query(query, function (error, result) {
                if (error) reject("Error at ORM.CreateAnnonceTable() → " + error);
                console.log('SUCCESS!');
                resolve(result);
            });
        })
    }

    /**
     * Creates the 'region' table if it does not exist in the database.
     * @returns {Promise<void>} Promise that resolves when the table is created or confirmed to exist.
     */
    static CreateRegionTable() {
        return new Promise((resolve, reject) => {
            const query = `CREATE TABLE IF NOT EXISTS ${REGION_TABLE_NAME} (` +
                'region_id INTEGER AUTO_INCREMENT PRIMARY KEY, ' +
                'NAME VARCHAR(255) UNIQUE' +
                ');';

            CONNECTION.query(query, function (error, result) {
                if (error) reject("Error at ORM.CreateRegionTable() → " + error); // Reject on query error.
                console.log('SUCCESS!');           // Log success message.
                resolve(result);                   // Resolve the promise with the query result.
            });
        });
    }

    /**
 * Checks if a checksum is already present in the local cache or the database.
 * @param {String} incomingChecksum Checksum to be checked.
 * @returns {Promise<boolean>} Promise that resolves to 'true' if checksum exists, otherwise 'false'.
 */
    static FindChecksum(incomingChecksum) {
        return new Promise((resolve, reject) => {
            // First, check if the checksum is in the cache
            if (CHECKSUM_CACHE[incomingChecksum]) {
                return resolve(true);  // Resolve with 'true' if the checksum is found in the cache
            }

            // If not in the cache, query the database using the index
            const query = `SELECT 1 FROM ${ANNONCE_TABLE_NAME} WHERE checksum = ? LIMIT 1`;

            CONNECTION.query(query, [incomingChecksum], function (error, results) {
                if (error) {
                    return reject("Error at ORM.FindChecksum() → " + error); // Reject on query error
                }

                if (results.length > 0) {
                    CHECKSUM_CACHE[incomingChecksum] = incomingChecksum;  // Cache the result
                    return resolve(true);  // Resolve with 'true' if the checksum is found in the database
                } else {
                    return resolve(false);  // Resolve with 'false' if the checksum is not found
                }
            });
        });
    }

    /**
     * Checks if a checksum is already present in the local cache or the database.
     * @param {String} incomingChecksum Checksum to be checked.
     * @returns {Promise<boolean>} Promise that resolves to 'true' if checksum exists, otherwise 'false'.
     */
    /*static FindChecksum(incomingChecksum) {
        // Helper function to determine if an object is empty.
        function isObjectEmpty(object) {
            for (let key in object) {
                if (object.hasOwnProperty(key))
                    return false;
            }
            return true;
        }

        return new Promise((resolve, reject) => {
            // Resolve or reject the promise based on whether the checksum is in the cache.
            function settlePromise(checksum) {
                if (CHECKSUM_CACHE[incomingChecksum])
                    resolve(true);  // Resolve with 'true' if the checksum is found.
                else
                    resolve(false); // Resolve with 'false' if the checksum is not found.
            }

            // If the cache is empty, query the database for checksums.
            if (isObjectEmpty(CHECKSUM_CACHE)) {
                const query =
                    'SELECT checksum ' +
                    `FROM ${ANNONCE_TABLE_NAME} `;

                CONNECTION.query(query, function (error, cursor) {
                    if (error) {
                        reject("Error at ORM.FindChecksum() → " + error); // Reject on query error.
                    } else {
                        // Populate the cache with checksums from the database.
                        for (let record of cursor)
                            CHECKSUM_CACHE[record.checksum] = record.checksum;
                        settlePromise(incomingChecksum);
                    }
                });
            } else {
                settlePromise(incomingChecksum);
            }
        })
    }*/

    /**
     * Retrieves a region's ID from the database based on its name.
     * @param {String} incomingRegionName Name of the region to find.
     * @returns {Promise<number>} Promise that resolves to the region ID or null if not found.
     */
    static FindRegionID(incomingRegionName) {
        return new Promise((resolve, reject) => {
            const query =
                'SELECT region_id ' +
                `FROM ${REGION_TABLE_NAME} ` +
                'WHERE name = ? ' +
                'LIMIT 1';

            CONNECTION.query(query, [incomingRegionName], function (error, result) {
                if (error) reject("Error at ORM.FindRegionID() → " + error); // Reject on query error.
                resolve(result); // Resolve the promise with the result of the query.
            });
        })
    }

    /**
     * Inserts a new announcement record into the 'annonce' table.
     * @param {Annonce} newRecord Announcement record to insert.
     * @returns {Promise<void>} Promise that resolves when the insertion is complete.
     */
    static async InsertAnnonce(newRecord) {
        return new Promise((resolve, reject) => {
            let query = `INSERT IGNORE INTO ${ANNONCE_TABLE_NAME} (TITLE, BODY, REGION_ID, TIMESTAMP, CHECKSUM, URL, CVR, Homepage) ` +
                'VALUES (?, ?, ?, ?, ?, ?, ?, ?)';

            // Execute the query with values from the newRecord object.
            CONNECTION.query(query, [newRecord.titel, newRecord.body, newRecord.regionId, newRecord.timestamp,
            newRecord.checksum, newRecord.url, newRecord.cvr, newRecord.homepage],
                function (error, result) {
                    if (error) reject("Error at ORM.InsertAnnonce() → " + error); // Reject on query error.
                    // Update local cache with new checksum entry:
                    CHECKSUM_CACHE[newRecord.checksum] = newRecord.checksum;
                    console.log('1 record inserted!'); // Log the success of the insertion.
                    resolve(result); // Resolve the promise with the query result.
                })
        });
    }

    /**
     * Inserts a new region into the 'region' table with a unique name.
     * @param {String} newRegion Name of the region to add.
     * @returns {Promise<void>} Promise that resolves when the insertion is complete.
     */
    static InsertRegion(newRegion) {
        return new Promise((resolve, reject) => {
            let query = `INSERT IGNORE INTO ${REGION_TABLE_NAME} (NAME) ` +
                'VALUES (?)';
            // Execute the query with the name of the new region.
            CONNECTION.query(query, [newRegion.name],
                function (error, result) {
                    if (error) reject("Error at ORM.InsertRegion() → " + error); // Reject on query error.
                    console.log('1 record inserted!'); // Log the success of the insertion.
                    resolve(result); // Resolve the promise with the query result.
                })
        });
    }

}
// Make the ORM class available for import in other modules.
module.exports = ORM;