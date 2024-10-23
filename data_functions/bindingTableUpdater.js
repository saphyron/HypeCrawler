/**
 * @file updateBindingTable.js
 * @description Updates the binding table 'company_annonce_binding' by inserting new associations
 * between 'annonce' and 'companydata' based on CVR numbers. Logs any errors encountered during the process.
 */

const orm = require("../database/databaseConnector"); // ORM for database connections
const fs = require("fs"); // File system module
const util = require("util"); // Utility module for promisify
const appendFileAsync = util.promisify(fs.appendFile); // Promisify fs.appendFile for async/await usage

/**
 * Updates the binding table 'company_annonce_binding' with new entries where 'annonce' and 'companydata' share the same CVR number.
 * Ensures that duplicate entries are not inserted by checking existing records.
 * Establishes a database connection, executes the update query, and handles any errors.
 *
 * @async
 * @function updateBindingTable
 * @returns {Promise<void>} - Resolves when the update is complete or throws an error if the operation fails.
 */
async function updateBindingTable() {
  let connection;
  try {
    // Establish a database connection
    connection = await orm.connectDatabase();
    console.log("Database connection established for binding table update.");

    // Define the SQL query to update the 'company_annonce_binding' table
    const updateQuery = `
            INSERT INTO company_annonce_binding (annonce_id, cvrNummer)
            SELECT a.ID, a.CVR
            FROM annonce a
            INNER JOIN companydata c ON a.CVR = c.cvrNummer
            WHERE a.CVR IS NOT NULL
            AND NOT EXISTS (
                SELECT 1 
                FROM company_annonce_binding cab
                WHERE cab.annonce_id = a.ID
            );

        `;

    // Execute the update query
    const results = await connection.query(updateQuery);
    console.log("Binding table updated successfully.");

  } catch (error) {
    // Log the error asynchronously and continue with execution
    console.error("Error updating the binding table:", error);
    await logFailure("bindingTableUpdater", error);
  } finally {
    if (connection) {
      // Close the database connection
      await orm.disconnectDatabase(connection);
      console.log("Database connection closed after binding table update.");
    }
  }
}

/**
 * Logs failure messages to an 'error.log' file with a timestamp.
 *
 * @async
 * @function logFailure
 * @param {string} source - The source or module where the error occurred.
 * @param {Error} error - The error object containing the error details.
 * @returns {Promise<void>} - Resolves when the log is written or logs an error if logging fails.
 */
async function logFailure(source, error) {
  const logMessage = `[${new Date().toISOString()}] Error in ${source}: ${error.message}\n`;

  try {
    // Append the error message to a log file asynchronously
    await appendFileAsync("error.log", logMessage);
  } catch (err) {
    console.error("Failed to write to log file:", err);
  }
}

// Export the updateBindingTable function for use in other modules
module.exports = { updateBindingTable };
