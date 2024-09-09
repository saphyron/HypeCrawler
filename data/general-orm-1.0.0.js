// Load the MySQL module from npm to interact with MySQL databases.
const MYSQL = require("mysql");

// Define the database connection parameters.
const DB_CONFIG = {
  host: process.env.MYSQL_HOST, // Database host address from environment variables.
  port: process.env.MYSQL_PORT, // Database port from environment variables.
  user: "root", // Default database user.
  password: "4b6YA5Uq2zmB%t5u2*e5jT!u4c$lfw6T", // Secure password for the database user.
  database: "test_database_mariadb", // Name of the database to connect to.
};

let CONNECTION; // Variable to hold the database connection object.

// Constants for table names in the database.
const ANNONCE_TABLE_NAME = "annonce"; // Table name for announcements.
const REGION_TABLE_NAME = "region"; // Table name for regions.

// Caches to store data and reduce database access.
const CHECKSUM_CACHE = {}; // Cache to store checksums to avoid redundant database queries.
const BODY_CHECKSUM_CACHE = {}; // Cache specifically for body checksums, used for data integrity.

/**
 * Class providing ORM (Object Relational Mapping) functionalities to map object models to a database schema.
 */
class ORM {
  /**
   * Closes the database connection cleanly.
   * @returns {Promise<void>} - A promise that resolves when the connection is closed.
   */
  static disconnectDatabase() {
    return new Promise((resolve, reject) => {
      // Stop the keep-alive process if it's running
      if (ORM.keepDataConnectionAliveHandle) {
        clearInterval(ORM.keepDataConnectionAliveHandle);
        ORM.keepDataConnectionAliveHandle = undefined;
      }

      // Check if the connection is still open
      if (CONNECTION && CONNECTION.state !== "disconnected") {
        CONNECTION.end((err) => {
          if (err) {
            reject(`Disconnect database error: ${err}`); // Reject the promise if there's an error closing the connection
          } else {
            resolve(); // Resolve the promise if the connection is closed successfully
          }
        });
      } else {
        resolve(); // Resolve immediately if the connection is already closed or wasn't established
      }
    });
  }

  /**
   * Establishes a connection to the database with error handling and reconnection logic.
   * @returns {Promise<MYSQL.Connection>} - A promise that resolves with the database connection object.
   */
  static connectDatabase() {
    return new Promise((resolve, reject) => {
      CONNECTION = MYSQL.createConnection(DB_CONFIG); // Create a new connection using the config settings
      CONNECTION.connect(function (err) {
        if (err) {
          console.log("error when connecting to db:", err);
          setTimeout(() => {
            ORM.connectDatabase().then(resolve).catch(reject); // Retry connection after delay on failure
          }, 2000);
        } else {
          // Keep the database connection alive by executing periodic queries
          ORM.keepDataConnectionAliveHandle = setInterval(() => {
            if (CONNECTION && CONNECTION.state === "authenticated") {
              let query = `SELECT 1`; // Simple keep-alive query
              CONNECTION.query(query, (error) => {
                if (error) {
                  console.log("Error at ORM.KeepConnectionAlive() → " + error);
                }
              });
            }
          }, 60000); // Keep-alive query runs every 60 seconds
          resolve(CONNECTION); // Resolve the promise when connection is established
        }
      });

      // Handle connection errors (e.g., connection loss)
      CONNECTION.on("error", function (err) {
        console.log("db error", err);
        if (err.code === "PROTOCOL_CONNECTION_LOST") {
          ORM.connectDatabase().then(resolve).catch(reject); // Automatically reconnect on connection loss
        } else {
          reject(err); // Reject the promise for other errors
        }
      });
    });
  }

  /**
   * Creates the 'annonce' table if it does not exist in the database.
   * @returns {Promise<void>} - A promise that resolves when the table is created or confirmed to exist.
   */
  static CreateAnnonceTable() {
    return new Promise((resolve, reject) => {
      const query =
        `CREATE TABLE IF NOT EXISTS ${ANNONCE_TABLE_NAME} (` +
        "ID INTEGER AUTO_INCREMENT PRIMARY KEY, " +
        "TITLE TEXT, " +
        "BODY MEDIUMBLOB, " +
        "region_id INTEGER, " +
        "TIMESTAMP DATETIME, " +
        "CHECKSUM varchar(40), " +
        "URL TEXT, " +
        "CVR TEXT, " +
        "Homepage TEXT, " +
        "Possible_Duplicate bit, " +
        "FOREIGN KEY(region_id) REFERENCES region(region_id))";

      CONNECTION.query(query, function (error, result) {
        if (error) reject("Error at ORM.CreateAnnonceTable() → " + error); // Reject if there's an error creating the table
        console.log("SUCCESS!"); // Log success message
        resolve(result); // Resolve the promise with the result
      });
    });
  }

  /**
   * Creates the 'region' table if it does not exist in the database.
   * @returns {Promise<void>} - A promise that resolves when the table is created or confirmed to exist.
   */
  static CreateRegionTable() {
    return new Promise((resolve, reject) => {
      const query =
        `CREATE TABLE IF NOT EXISTS ${REGION_TABLE_NAME} (` +
        "region_id INTEGER AUTO_INCREMENT PRIMARY KEY, " +
        "NAME VARCHAR(255) UNIQUE" +
        ");";

      CONNECTION.query(query, function (error, result) {
        if (error) reject("Error at ORM.CreateRegionTable() → " + error); // Reject if there's an error creating the table
        console.log("SUCCESS!"); // Log success message
        resolve(result); // Resolve the promise with the result
      });
    });
  }

  /**
   * Checks if a checksum is already present in the local cache or the database.
   * @param {String} incomingChecksum - The checksum to check for.
   * @returns {Promise<boolean>} - A promise that resolves to 'true' if the checksum exists, otherwise 'false'.
   */
  static FindChecksum(incomingChecksum) {
    return new Promise((resolve, reject) => {
      // First, check the checksum cache
      if (CHECKSUM_CACHE[incomingChecksum]) {
        return resolve(true); // Resolve as 'true' if the checksum is found in the cache
      }

      // If not in the cache, query the database
      const query = `SELECT 1 FROM ${ANNONCE_TABLE_NAME} WHERE checksum = ? LIMIT 1`;

      CONNECTION.query(query, [incomingChecksum], function (error, results) {
        if (error) {
          return reject("Error at ORM.FindChecksum() → " + error); // Reject on query error
        }

        if (results.length > 0) {
          CHECKSUM_CACHE[incomingChecksum] = incomingChecksum; // Cache the checksum
          return resolve(true); // Resolve as 'true' if the checksum exists in the database
        } else {
          return resolve(false); // Resolve as 'false' if the checksum doesn't exist
        }
      });
    });
  }

  /**
   * Retrieves a region's ID from the database based on its name.
   * @param {String} incomingRegionName - The name of the region to find.
   * @returns {Promise<number>} - A promise that resolves to the region ID, or null if not found.
   */
  static FindRegionID(incomingRegionName) {
    return new Promise((resolve, reject) => {
      const query =
        "SELECT region_id " +
        `FROM ${REGION_TABLE_NAME} ` +
        "WHERE name = ? " +
        "LIMIT 1";

      CONNECTION.query(query, [incomingRegionName], function (error, result) {
        if (error) reject("Error at ORM.FindRegionID() → " + error); // Reject on query error
        resolve(result); // Resolve the promise with the result of the query
      });
    });
  }

  /**
   * Inserts a new announcement record into the 'annonce' table.
   * @param {Annonce} newRecord - The announcement record to insert.
   * @returns {Promise<void>} - A promise that resolves when the insertion is complete.
   */
  static async InsertAnnonce(newRecord) {
    return new Promise((resolve, reject) => {
      let query =
        `INSERT IGNORE INTO ${ANNONCE_TABLE_NAME} (TITLE, BODY, REGION_ID, TIMESTAMP, CHECKSUM, URL, CVR, Homepage) ` +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)";

      // Execute the query with values from the newRecord object
      CONNECTION.query(
        query,
        [
          newRecord.titel,
          newRecord.body,
          newRecord.regionId,
          newRecord.timestamp,
          newRecord.checksum,
          newRecord.url,
          newRecord.cvr,
          newRecord.homepage,
        ],
        function (error, result) {
          if (error) reject("Error at ORM.InsertAnnonce() → " + error); // Reject on query error
          // Update cache with the new checksum
          CHECKSUM_CACHE[newRecord.checksum] = newRecord.checksum;
          console.log("1 record inserted!"); // Log success message
          resolve(result); // Resolve the promise with the result
        }
      );
    });
  }

  /**
   * Inserts a new region into the 'region' table with a unique name.
   * @param {String} newRegion - The name of the region to add.
   * @returns {Promise<void>} - A promise that resolves when the insertion is complete.
   */
  static InsertRegion(newRegion) {
    return new Promise((resolve, reject) => {
      let query = `INSERT IGNORE INTO ${REGION_TABLE_NAME} (NAME) VALUES (?)`;
      // Execute the query with the name of the new region
      CONNECTION.query(query, [newRegion.name], function (error, result) {
        if (error) reject("Error at ORM.InsertRegion() → " + error); // Reject on query error
        console.log("1 record inserted!"); // Log success message
        resolve(result); // Resolve the promise with the result
      });
    });
  }
}

// Export the ORM class for use in other modules.
module.exports = ORM;
