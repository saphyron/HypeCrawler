const MYSQL = require('mysql2');

// Create a connection pool
const pool = MYSQL.createPool({
    host: process.env.MYSQL_HOST,
    port: process.env.MYSQL_PORT,
    user: 'root',
    password: '4b6YA5Uq2zmB%t5u2*e5jT!',
    database: 'test_database_mariadb',
    connectionLimit: 20,  // Increase the connection limit
    acquireTimeout: 60000, // 60 seconds to acquire a connection
    waitForConnections: true,  // Queue incoming requests if all connections are in use
    queueLimit: 0  // No limit on the queue size
});

let CONNECTION = pool; // Use this pool connection throughout your application

// Caches to store data and reduce database access.
const CHECKSUM_CACHE = {};            // Cache to store checksums to avoid redundant database queries.

const ANNONCE_TABLE_NAME = 'annonce'; // Table name for announcements.
const REGION_TABLE_NAME = 'region';   // Table name for regions.

class ORM {

    static disconnectDatabase() {
        return new Promise((resolve, reject) => {
            clearInterval(ORM.keepDataConnectionAliveHandle); // Stop the interval that keeps the connection alive.
            ORM.keepDataConnectionAliveHandle = undefined;    // Clear the handle after stopping the interval.

            CONNECTION.end(function (err) {                   // Attempt to close the database connection.
                if (err) reject(`Disconnect database error: ${err}`);
                else resolve();
            });
        });
    }

    static connectDatabase() {
        return new Promise((resolve, reject) => {
            CONNECTION.getConnection((err, connection) => {
                if (err) {
                    console.log('Error when connecting to db:', err);
                    setTimeout(() => {
                        ORM.connectDatabase().then(resolve).catch(reject);
                    }, 2000); // Retry connection after 2 seconds
                } else {
                    ORM.keepDataConnectionAliveHandle = setInterval(() => {
                        connection.query('SELECT 1', (error) => {
                            if (error) console.log("Error at ORM.KeepConnectionAlive() → " + error);
                            else console.log("Ok at ORM.KeepConnectionAlive()");
                        });
                    }, 60000);
                    resolve(connection);
                }
            });
        });
    }

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
        });
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

    static FindChecksum(incomingChecksum) {
        function isObjectEmpty(object) {
            for (let key in object) {
                if (object.hasOwnProperty(key))
                    return false;
            }
            return true;
        }

        return new Promise((resolve, reject) => {
            function settlePromise(checksum) {
                if (CHECKSUM_CACHE[incomingChecksum])
                    resolve(true);
                else
                    resolve(false);
            }

            if (isObjectEmpty(CHECKSUM_CACHE)) {
                const query = `SELECT checksum FROM ${ANNONCE_TABLE_NAME}`;

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
        });
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
        });
    }

    static InsertAnnonce(newRecord) {
        return new Promise((resolve, reject) => {
            let query = `INSERT IGNORE INTO ${ANNONCE_TABLE_NAME} (TITLE, BODY, REGION_ID, TIMESTAMP, CHECKSUM, URL, CVR, Homepage) ` +
                'VALUES (?, ?, ?, ?, ?, ?, ?, ?)';

            CONNECTION.query(query, [newRecord.titel, newRecord.body, newRecord.regionId, newRecord.timestamp,
                newRecord.checksum, newRecord.url, newRecord.cvr, newRecord.homepage], 
                function (error, result) {
                    if (error) reject("Error at ORM.InsertAnnonce() → " + error);
                    CHECKSUM_CACHE[newRecord.checksum] = newRecord.checksum;
                    console.log('1 record inserted!');
                    resolve(result);
                }
            );
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
                }
            );
        });
    }
}

module.exports = ORM;
