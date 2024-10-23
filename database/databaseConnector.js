// Load the MySQL module from npm to interact with MySQL databases.
const MYSQL = require("mysql"); // MySQL module for database operations.
const crypto = require("crypto"); // Crypto module for hashing functions.

// Define the database connection parameters for different configurations.

// Original database configuration (may not be in use currently).
const DB_CONFIG = {
  host: process.env.MYSQL_HOST, // Database host address from environment variables.
  port: process.env.MYSQL_PORT, // Database port from environment variables.
  user: "root", // Default database user.
  password: "4b6YA5Uq2zmB%t5u2*e5jT!u4c$lfw6T", // Secure password for the database user.
  database: "test_database_mariadb", // Name of the database to connect to.
};

// New database configuration.
const DB_CONFIG_NEW = {
  host: "localhost", // Database host address.
  port: process.env.MYSQL_PORT, // Database port from environment variables.
  user: "root", // Database user.
  password: "4b6YA5Uq2zmB%t5u2*e5jT!u4c$lfw6T", // Secure password for the database user.
  database: "Merged_Database_Test", // Name of the new database to connect to.
};

// Function to compute a SHA-1 hash for the body content.
// This is used for data integrity and detecting duplicates.
/**
 * Computes a SHA-1 hash of the provided body content.
 * @param {string} body - The content to hash.
 * @returns {string} - The SHA-1 hash of the content.
 */
function computeBodyHash(body) {
  return crypto.createHash("sha1").update(body).digest("hex");
}

let CONNECTION; // Variable to hold the database connection object.

// Constants for table names in the database.
const ANNONCE_TABLE_NAME = "annonce"; // Table name for announcements.
const REGION_TABLE_NAME = "region"; // Table name for regions.

// Caches to store data and reduce database access.
const CHECKSUM_CACHE = {}; // Cache to store checksums to avoid redundant database queries.
const BODY_CHECKSUM_CACHE = {}; // Cache specifically for body checksums, used for data integrity.

/**
 * Class providing ORM (Object-Relational Mapping) functionalities to map object models to a database schema.
 */
class ORM {
  /**
   * Closes the database connection cleanly.
   * @returns {Promise<void>} - A promise that resolves when the connection is closed.
   */
  static async disconnectDatabase() {
    return new Promise((resolve, reject) => {
      // Clear the interval that keeps the database connection alive, if it exists.
      if (ORM.keepDataConnectionAliveHandle) {
        clearInterval(ORM.keepDataConnectionAliveHandle);
        ORM.keepDataConnectionAliveHandle = undefined;
      }

      // Check if the connection exists and is not already disconnected.
      if (CONNECTION && CONNECTION.state !== "disconnected") {
        // Use 'end' to close the connection gracefully.
        CONNECTION.end((err) => {
          if (err) {
            console.log("Error while ending connection:", err);
            CONNECTION.destroy(); // Force destroy if the 'end' fails.
            return reject(err);
          } else {
            resolve();
          }
        });
      } else {
        resolve(); // Connection already closed.
      }
    });
  }

  /**
   * Establishes a connection to the database with error handling and reconnection logic.
   * @returns {Promise<MYSQL.Connection>} - A promise that resolves with the database connection object.
   */
  static connectDatabase() {
    return new Promise((resolve, reject) => {
      // Create a new connection using the new configuration settings.
      CONNECTION = MYSQL.createConnection(DB_CONFIG_NEW);

      // Attempt to connect to the database.
      CONNECTION.connect(function (err) {
        if (err) {
          console.log("error when connecting to db:", err);
          setTimeout(() => {
            // Retry connection after a delay if there's an error.
            ORM.connectDatabase().then(resolve).catch(reject);
          }, 2000); // Retry after 2 seconds.
        } else {
          // Keep the database connection alive by executing periodic queries.
          ORM.keepDataConnectionAliveHandle = setInterval(() => {
            if (CONNECTION && CONNECTION.state === "authenticated") {
              let query = `SELECT 1`; // Simple keep-alive query.
              CONNECTION.query(query, (error) => {
                if (error) {
                  console.log("Error at ORM.KeepConnectionAlive() → " + error);
                }
              });
            }
          }, 60000); // Keep-alive query runs every 60 seconds.
          resolve(CONNECTION); // Resolve the promise when connection is established.
        }
      });

      // Handle connection errors (e.g., connection loss).
      CONNECTION.on("error", function (err) {
        console.log("db error", err);
        if (err.code === "PROTOCOL_CONNECTION_LOST") {
          // Ensure the previous connection is fully ended.
          if (CONNECTION) {
            CONNECTION.end(); // Or use destroy() if necessary.
          }
          ORM.connectDatabase().then(resolve).catch(reject); // Automatically reconnect.
        } else {
          reject(err); // Reject for other errors.
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
      // SQL query to create the 'annonce' table if it doesn't exist.
      const query =
        `CREATE TABLE IF NOT EXISTS ${ANNONCE_TABLE_NAME} (` +
        "ID INTEGER AUTO_INCREMENT PRIMARY KEY, " +
        "TITLE TEXT, " +
        "BODY MEDIUMBLOB, " +
        "region_id INTEGER, " +
        "TIMESTAMP DATETIME, " +
        "CHECKSUM varchar(40), " +
        "URL TEXT, " +
        "CVR BIGINT(20), " +
        "Homepage TEXT, " +
        "Possible_Duplicate bit, " +
        "body_hash varchar(64), " +
        "companyUrlFromAnnonce varchar(255), " +
        "FOREIGN KEY(region_id) REFERENCES region(region_id))";

      // Execute the query to create the table.
      CONNECTION.query(query, function (error, result) {
        if (error) {
          reject("Error at ORM.CreateAnnonceTable() → " + error); // Reject if there's an error creating the table.
        }
        resolve(result); // Resolve the promise with the result.
      });
    });
  }

  /**
   * Creates the 'region' table if it does not exist in the database.
   * @returns {Promise<void>} - A promise that resolves when the table is created or confirmed to exist.
   */
  static async CreateRegionTable() {
    return new Promise((resolve, reject) => {
      // SQL query to create the 'region' table if it doesn't exist.
      const query =
        `CREATE TABLE IF NOT EXISTS ${REGION_TABLE_NAME} (` +
        "region_id INTEGER AUTO_INCREMENT PRIMARY KEY, " +
        "NAME VARCHAR(255) UNIQUE" +
        ");";

      // Execute the query to create the table.
      CONNECTION.query(query, function (error, result) {
        if (error) {
          reject("Error at ORM.CreateRegionTable() → " + error); // Reject if there's an error creating the table.
        }
        resolve(result); // Resolve the promise with the result.
      });
    });
  }

  /**
   * Checks if a checksum is already present in the local cache or the database.
   * Caches both found and not-found checksums to reduce redundant database queries.
   *
   * @param {String} incomingChecksum - The checksum to check for.
   * @returns {Promise<boolean>} - A promise that resolves to 'true' if the checksum exists, otherwise 'false'.
   */
  static async FindChecksum(incomingChecksum) {
    // Check if the checksum is in the cache, including negative results.
    if (incomingChecksum in CHECKSUM_CACHE) {
      return CHECKSUM_CACHE[incomingChecksum]; // Resolve from cache (true or false).
    }

    // Query the database if not in the cache.
    const query = `SELECT 1 FROM ${ANNONCE_TABLE_NAME} WHERE checksum = ? LIMIT 1`;

    return new Promise((resolve, reject) => {
      // Execute the query with the incoming checksum.
      CONNECTION.query(query, [incomingChecksum], (error, results) => {
        if (error) {
          return reject("Error at ORM.FindChecksum() → " + error); // Reject on query error.
        }

        const checksumExists = results.length > 0;

        // Cache both the presence and absence of the checksum.
        CHECKSUM_CACHE[incomingChecksum] = checksumExists;

        resolve(checksumExists); // Resolve with the result (true/false).
      });
    });
  }

  /**
   * Retrieves a region's ID from the database based on its name.
   * @param {String} incomingRegionName - The name of the region to find.
   * @returns {Promise<number|null>} - A promise that resolves to the region ID, or null if not found.
   */
  static FindRegionID(incomingRegionName) {
    return new Promise((resolve, reject) => {
      // SQL query to select the region ID based on the region name.
      const query =
        "SELECT region_id " +
        `FROM ${REGION_TABLE_NAME} ` +
        "WHERE name = ? " +
        "LIMIT 1";

      // Execute the query with the provided region name.
      CONNECTION.query(query, [incomingRegionName], function (error, result) {
        if (error) reject("Error at ORM.FindRegionID() → " + error); // Reject on query error
        resolve(result); // Resolve the promise with the result of the query
      });
    });
  }

  /**
   * Inserts a new announcement record into the 'annonce' table.
   * If the body is empty (e.g., due to an SSL error), it will insert the record with an empty body and set the body_hash to NULL.
   * @param {Object} newRecord - The announcement record to insert.
   * @param {string} newRecord.titel - The title of the announcement.
   * @param {string} [newRecord.body] - The body content of the announcement.
   * @param {number} newRecord.regionId - The ID of the region.
   * @param {string} newRecord.timestamp - The timestamp of the announcement.
   * @param {string} newRecord.checksum - The checksum of the announcement URL.
   * @param {string} newRecord.url - The URL of the announcement.
   * @param {string} [newRecord.cvr] - The CVR number (optional).
   * @param {string} newRecord.homepage - The source homepage of the announcement.
   * @returns {Promise<void>} - A promise that resolves when the insertion is complete.
   */
  static async InsertAnnonce(newRecord) {
    return new Promise((resolve, reject) => {
      // Initialize bodyHash as null.
      let bodyHash = null;

      if (!newRecord.body || newRecord.body.trim() === "") {
        // If the body is empty (like in cases of SSL issues), log a warning.
        console.warn(
          "Inserting record with an empty body for URL:",
          newRecord.url
        );
      } else {
        bodyHash = computeBodyHash(newRecord.body); // Only compute the hash if body is not empty.
      }
      //console.log(newRecord);
      // Prepare the SQL query.
      let query =
        `INSERT IGNORE INTO ${ANNONCE_TABLE_NAME} (TITLE, BODY, REGION_ID, TIMESTAMP, CHECKSUM, URL, CVR, Homepage, body_hash, companyUrlFromAnnonce) ` +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

      // Execute the query with values from the newRecord object.
      CONNECTION.query(
        query,
        [
          newRecord.titel, // Job title.
          newRecord.body || "", // Use empty string if body is null or undefined.
          newRecord.regionId, // Region ID.
          newRecord.timestamp, // Timestamp.
          newRecord.checksum, // SHA1 checksum of the URL.
          newRecord.url, // Job listing URL.
          newRecord.cvr, // CVR number (optional, could be null).
          newRecord.homepage, // Homepage (source of the ad).
          bodyHash, // Computed hash of the body, or null if body is empty.
          newRecord.companyUrlFromAnnonce, // CompanyURL
        ],
        function (error, result) {
          if (error) {
            console.error("Error inserting annonce:", error);
            return reject("Error at ORM.InsertAnnonce() → " + error);
          }

          // Update the checksum cache to reflect that this checksum now exists.
          CHECKSUM_CACHE[newRecord.checksum] = true;
          resolve(result); // Resolve the promise with the result.
        }
      );
    });
  }

  /**
   * Inserts a new region into the 'region' table with a unique name.
   * First, checks if the region already exists, and logs the result if it does.
   *
   * @param {Object} newRegion - The region object to add.
   * @param {string} newRegion.name - The name of the region.
   * @returns {Promise<void>} - A promise that resolves when the insertion is complete.
   */
  static InsertRegion(newRegion) {
    return new Promise((resolve, reject) => {
      // First, check if the region already exists.
      let checkQuery = `SELECT region_id, NAME FROM ${REGION_TABLE_NAME} WHERE NAME = ? LIMIT 1`;

      CONNECTION.query(
        checkQuery,
        [newRegion.name],
        function (checkError, checkResult) {
          if (checkError) {
            return reject(
              "Error checking region existence at ORM.InsertRegion() → " +
                checkError
            );
          }

          // If region exists, log the existing region and its ID.
          if (checkResult.length > 0) {
            resolve(checkResult[0]); // Resolve with the existing region info.
          } else {
            // If region doesn't exist, insert it.
            let insertQuery = `INSERT INTO ${REGION_TABLE_NAME} (NAME) VALUES (?)`;
            CONNECTION.query(
              insertQuery,
              [newRegion.name],
              function (insertError, insertResult) {
                if (insertError) {
                  return reject("Error at ORM.InsertRegion() → " + insertError);
                }

                console.log(
                  `Inserted new region '${newRegion.name}' with ID: ${insertResult.insertId}`
                );
                resolve(insertResult); // Resolve with the insertion result.
              }
            );
          }
        }
      );
    });
  }

  /**
   * Retrieves all regions from the 'region' table.
   * @returns {Promise<Array>} - A promise that resolves with an array of region objects.
   */
  static getAllRegions() {
    return new Promise((resolve, reject) => {
      const query = `SELECT * FROM ${REGION_TABLE_NAME}`; // SQL query to select all regions.

      // Execute the query to get all regions.
      CONNECTION.query(query, (error, results) => {
        if (error) {
          return reject("Error at ORM.getAllRegions() → " + error); // Reject if there's an error with the query.
        }

        resolve(results); // Resolve with the results from the query.
      });
    });
  }
}

// Export the ORM class for use in other modules.
module.exports = ORM;